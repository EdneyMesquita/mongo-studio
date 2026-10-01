use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tokio::sync::RwLock;

use crate::connection::ConnectionStore;
use crate::driver::ActiveConnection;
use crate::models::{SecretBackendKind, SessionId};
use crate::secrets::{EncryptedFileStore, KeyringStore, SecretStore};
use crate::ssh_tunnel::KnownHosts;

pub struct AppState {
    pub connection_store: ConnectionStore,
    pub secret_store: Box<dyn SecretStore>,
    pub secret_backend: SecretBackendKind,
    pub known_hosts: Arc<KnownHosts>,
    pub sessions: RwLock<HashMap<SessionId, ActiveConnection>>,
    /// Cancel flags for in-flight scripts and exports, keyed by the
    /// frontend-generated execution id, so `cancel_script`/`cancel_export`
    /// can flip the same flag the running task is polling.
    pub running_tasks: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn init(config_dir: &std::path::Path) -> Result<Self, String> {
        let connection_store = ConnectionStore::load(config_dir).map_err(|e| e.to_string())?;
        log::info!(
            "{} saved connections in {}",
            connection_store.list().len(),
            config_dir.display()
        );
        let known_hosts = Arc::new(KnownHosts::load(config_dir).map_err(|e| e.to_string())?);

        let (secret_store, secret_backend): (Box<dyn SecretStore>, SecretBackendKind) =
            match KeyringStore::probe() {
                Ok(store) => {
                    log::info!("secrets are kept in the OS keychain");
                    (Box::new(store), SecretBackendKind::Keyring)
                }
                Err(e) => {
                    log::warn!(
                        "no usable OS keychain ({e}); secrets are kept in an encrypted file instead"
                    );
                    let store = EncryptedFileStore::new(config_dir).inspect_err(|e| {
                        log::error!("can't open the encrypted secret file: {e}")
                    })?;
                    (Box::new(store), SecretBackendKind::EncryptedFile)
                }
            };

        Ok(Self {
            connection_store,
            secret_store,
            secret_backend,
            known_hosts,
            sessions: RwLock::new(HashMap::new()),
            running_tasks: Mutex::new(HashMap::new()),
        })
    }
}
