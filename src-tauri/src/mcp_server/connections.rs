//! The server's own Mongo clients, one per saved connection, opened when a
//! tool first needs one. The UI's sessions aren't used: the app may not be
//! connected at all while a client works. A client is closed (and its SSH
//! tunnel shut down) after sitting idle, when its connection's level drops
//! to None, when the profile changes or is deleted, and when the server
//! stops.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use mongodb::Client;

use super::Host;
use crate::driver::{self, ActiveConnection};
use crate::error::AppResult;
use crate::logging;
use crate::models::ConnectionProfile;

/// A client unused this long is closed.
pub(crate) const IDLE_CLOSE: Duration = Duration::from_secs(10 * 60);

struct Entry {
    active: ActiveConnection,
    /// The profile's `updated_at` when it was opened: an edited profile
    /// gets a new client.
    updated_at: String,
    last_used: Instant,
}

#[derive(Default)]
pub(crate) struct Pool {
    entries: tokio::sync::Mutex<HashMap<String, Entry>>,
}

impl Pool {
    /// The client for `profile`, connecting first if needed.
    pub async fn client(&self, host: &dyn Host, profile: &ConnectionProfile) -> AppResult<Client> {
        let stale = {
            let mut entries = self.entries.lock().await;
            match entries.get_mut(&profile.id) {
                Some(entry) if entry.updated_at == profile.updated_at => {
                    entry.last_used = Instant::now();
                    return Ok(entry.active.client.clone());
                }
                Some(_) => entries.remove(&profile.id),
                None => None,
            }
        };
        if let Some(stale) = stale {
            close(stale.active, "the connection was edited").await;
        }

        let target = format!(
            "\"{}\" ({}) at {}",
            profile.name,
            profile.id,
            logging::route(profile)
        );
        log::info!("MCP server: connecting to {target}");
        let started = Instant::now();
        let state = host.app_state();
        let active =
            driver::connect(profile, state.secret_store.as_ref(), &state.known_hosts).await;
        let active = logging::logged(
            &format!(
                "MCP server: connecting to {target} ({} ms)",
                started.elapsed().as_millis()
            ),
            active,
        )?;
        let client = active.client.clone();
        let replaced = self.entries.lock().await.insert(
            profile.id.clone(),
            Entry {
                active,
                updated_at: profile.updated_at.clone(),
                last_used: Instant::now(),
            },
        );
        // Another call connected at the same time; one client is enough.
        if let Some(replaced) = replaced {
            close(replaced.active, "a newer client replaced it").await;
        }
        Ok(client)
    }

    pub async fn close(&self, connection_id: &str, why: &str) {
        let entry = self.entries.lock().await.remove(connection_id);
        if let Some(entry) = entry {
            close(entry.active, why).await;
        }
    }

    /// Closes the clients `keep` says no to.
    pub async fn retain(&self, keep: impl Fn(&str) -> bool, why: &str) {
        let closed: Vec<Entry> = {
            let mut entries = self.entries.lock().await;
            let ids: Vec<String> = entries.keys().filter(|id| !keep(id)).cloned().collect();
            ids.iter().filter_map(|id| entries.remove(id)).collect()
        };
        for entry in closed {
            close(entry.active, why).await;
        }
    }

    pub async fn close_idle(&self, max_idle: Duration) {
        let closed: Vec<Entry> = {
            let mut entries = self.entries.lock().await;
            let ids: Vec<String> = entries
                .iter()
                .filter(|(_, e)| e.last_used.elapsed() >= max_idle)
                .map(|(id, _)| id.clone())
                .collect();
            ids.iter().filter_map(|id| entries.remove(id)).collect()
        };
        for entry in closed {
            close(entry.active, "it was idle").await;
        }
    }

    pub async fn close_all(&self, why: &str) {
        self.retain(|_| false, why).await;
    }

    #[cfg(test)]
    pub async fn len(&self) -> usize {
        self.entries.lock().await.len()
    }
}

async fn close(active: ActiveConnection, why: &str) {
    if let Some(tunnel) = active.tunnel {
        tunnel.shutdown().await;
    }
    log::info!(
        "MCP server: closed its connection to \"{}\": {why}",
        active.name
    );
}
