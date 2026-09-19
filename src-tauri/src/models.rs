use serde::{Deserialize, Serialize};

pub type ConnectionId = String;
pub type SessionId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConnectionSource {
    /// A full connection string, e.g. pasted from Atlas (mongodb+srv://...).
    /// Any username/password embedded in it is extracted into the secret
    /// store before this variant is persisted, so `uri` never carries a
    /// plaintext password to disk.
    Uri { uri: String },
    /// A structured host/port form for simple standalone/replica-set setups.
    Manual { host: String, port: u16, srv: bool },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuthMechanism {
    ScramSha1,
    ScramSha256,
    MongodbX509,
    MongodbAws,
    Gssapi,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsOptions {
    pub enabled: bool,
    pub ca_file: Option<String>,
    pub cert_key_file: Option<String>,
    /// Whether a passphrase for `cert_key_file` is held in the secret store.
    pub cert_key_has_passphrase: bool,
    pub allow_invalid_certificates: bool,
    pub allow_invalid_hostnames: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshAuthMethod {
    Password,
    PrivateKey,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelOptions {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub private_key_path: Option<String>,
    /// Whether a passphrase for `private_key_path` is held in the secret store.
    pub private_key_has_passphrase: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionAdvancedOptions {
    pub app_name: Option<String>,
    pub connect_timeout_ms: Option<u64>,
    pub server_selection_timeout_ms: Option<u64>,
    pub max_pool_size: Option<u32>,
    pub min_pool_size: Option<u32>,
    pub replica_set: Option<String>,
    pub read_preference: Option<String>,
    pub retry_writes: Option<bool>,
    pub direct_connection: Option<bool>,
    pub auth_mechanism: Option<AuthMechanism>,
    pub auth_source: Option<String>,
}

/// Persisted, non-secret connection metadata. Lives in `connections.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: ConnectionId,
    pub name: String,
    pub source: ConnectionSource,
    pub database: Option<String>,
    pub username: Option<String>,
    /// Whether a password for `username` is held in the secret store.
    pub has_password: bool,
    pub tls: TlsOptions,
    pub ssh_tunnel: Option<SshTunnelOptions>,
    pub advanced: ConnectionAdvancedOptions,
    pub created_at: String,
    pub updated_at: String,
}

/// What the frontend submits when creating/editing a profile. Secret fields
/// here are written to the secret store and never appear in `ConnectionProfile`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfileInput {
    pub id: Option<ConnectionId>,
    pub name: String,
    pub source: ConnectionSource,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub tls: TlsOptions,
    pub tls_cert_key_passphrase: Option<String>,
    pub ssh_tunnel: Option<SshTunnelOptions>,
    pub ssh_password: Option<String>,
    pub ssh_key_passphrase: Option<String>,
    pub advanced: ConnectionAdvancedOptions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfileMeta {
    pub id: ConnectionId,
    pub name: String,
    pub summary: String,
    pub database: Option<String>,
}

impl From<&ConnectionProfile> for ConnectionProfileMeta {
    fn from(profile: &ConnectionProfile) -> Self {
        let summary = match &profile.source {
            ConnectionSource::Uri { uri } => redact_uri_summary(uri),
            ConnectionSource::Manual { host, port, srv } => {
                if *srv {
                    format!("mongodb+srv://{host}")
                } else {
                    format!("mongodb://{host}:{port}")
                }
            }
        };
        Self {
            id: profile.id.clone(),
            name: profile.name.clone(),
            summary,
            database: profile.database.clone(),
        }
    }
}

fn redact_uri_summary(uri: &str) -> String {
    match uri.find('@') {
        Some(at_idx) => match uri.find("://") {
            Some(scheme_idx) => format!("{}://***@{}", &uri[..scheme_idx], &uri[at_idx + 1..]),
            None => uri.to_string(),
        },
        None => uri.to_string(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub server_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionHandle {
    pub session_id: SessionId,
    pub server_version: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretBackendKind {
    Keyring,
    EncryptedFile,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretBackendInfo {
    pub backend: SecretBackendKind,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub size_on_disk: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInfo {
    pub name: String,
    pub collection_type: String,
}
