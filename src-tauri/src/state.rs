use std::sync::Arc;

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
    pub sessions: RwLock<std::collections::HashMap<SessionId, ActiveConnection>>,
}

impl AppState {
    pub fn init(config_dir: &std::path::Path) -> Result<Self, String> {
        let connection_store = ConnectionStore::load(config_dir).map_err(|e| e.to_string())?;
        let known_hosts = Arc::new(KnownHosts::load(config_dir).map_err(|e| e.to_string())?);

        let (secret_store, secret_backend): (Box<dyn SecretStore>, SecretBackendKind) =
            match KeyringStore::probe() {
                Ok(store) => (Box::new(store), SecretBackendKind::Keyring),
                Err(_) => {
                    let store = EncryptedFileStore::new(config_dir)?;
                    (Box::new(store), SecretBackendKind::EncryptedFile)
                }
            };

        Ok(Self {
            connection_store,
            secret_store,
            secret_backend,
            known_hosts,
            sessions: RwLock::new(std::collections::HashMap::new()),
        })
    }
}
