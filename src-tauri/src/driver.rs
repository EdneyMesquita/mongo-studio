use std::sync::Arc;

use futures_util::TryStreamExt;
use mongodb::bson::doc;
use mongodb::options::{
    ClientOptions, Credential, ServerAddress, Tls, TlsOptions as DriverTlsOptions,
};
use mongodb::Client;

use crate::connection::reinsert_uri_credentials;
use crate::error::{AppError, AppResult};
use crate::models::{
    self, CollectionInfo, ConnectionAdvancedOptions, ConnectionProfile, ConnectionSource,
    ConnectionTestResult, DatabaseInfo,
};
use crate::secrets::{SecretKind, SecretStore};
use crate::ssh_tunnel::{self, KnownHosts, SshTunnel, SshTunnelAuth, SshTunnelConfig};

pub struct ActiveConnection {
    pub client: Client,
    pub tunnel: Option<SshTunnel>,
}

/// Builds a plain connection URI (no advanced overrides applied yet) from a
/// profile, reinserting credentials pulled from the secret store.
fn build_uri(
    profile: &ConnectionProfile,
    username: Option<&str>,
    password: Option<&str>,
) -> String {
    let base = match &profile.source {
        ConnectionSource::Uri { uri } => uri.clone(),
        ConnectionSource::Manual { host, port, srv } => {
            if *srv {
                format!("mongodb+srv://{host}/")
            } else {
                format!("mongodb://{host}:{port}/")
            }
        }
    };
    match (username, password) {
        (Some(user), Some(pass)) => reinsert_uri_credentials(&base, user, pass),
        _ => base,
    }
}

fn apply_tls_overrides(
    options: &mut ClientOptions,
    profile: &ConnectionProfile,
    secrets: &dyn SecretStore,
) -> AppResult<()> {
    if !profile.tls.enabled {
        return Ok(());
    }
    let passphrase = if profile.tls.cert_key_has_passphrase {
        secrets
            .get(&profile.id, SecretKind::TlsCertKeyPassphrase)
            .map_err(AppError::Secret)?
    } else {
        None
    };
    options.tls = Some(Tls::Enabled(
        DriverTlsOptions::builder()
            .allow_invalid_certificates(Some(profile.tls.allow_invalid_certificates))
            .ca_file_path(profile.tls.ca_file.clone().map(std::path::PathBuf::from))
            .cert_key_file_path(
                profile
                    .tls
                    .cert_key_file
                    .clone()
                    .map(std::path::PathBuf::from),
            )
            .tls_certificate_key_file_password(passphrase.map(|p| p.into_bytes()))
            .build(),
    ));
    Ok(())
}

fn apply_advanced_overrides(
    options: &mut ClientOptions,
    advanced: &ConnectionAdvancedOptions,
) -> AppResult<()> {
    if let Some(app_name) = &advanced.app_name {
        options.app_name = Some(app_name.clone());
    } else {
        options.app_name = Some("mongo-studio".to_string());
    }
    if let Some(ms) = advanced.connect_timeout_ms {
        options.connect_timeout = Some(std::time::Duration::from_millis(ms));
    }
    if let Some(ms) = advanced.server_selection_timeout_ms {
        options.server_selection_timeout = Some(std::time::Duration::from_millis(ms));
    }
    if let Some(n) = advanced.max_pool_size {
        options.max_pool_size = Some(n);
    }
    if let Some(n) = advanced.min_pool_size {
        options.min_pool_size = Some(n);
    }
    if let Some(rs) = &advanced.replica_set {
        options.repl_set_name = Some(rs.clone());
    }
    if let Some(retry) = advanced.retry_writes {
        options.retry_writes = Some(retry);
    }
    if let Some(direct) = advanced.direct_connection {
        options.direct_connection = Some(direct);
    }
    if let Some(mechanism) = advanced.auth_mechanism {
        let driver_mechanism = map_auth_mechanism(mechanism)?;
        let credential = options.credential.get_or_insert_with(Credential::default);
        credential.mechanism = Some(driver_mechanism);
        if let Some(source) = &advanced.auth_source {
            credential.source = Some(source.clone());
        }
    } else if let Some(source) = &advanced.auth_source {
        let credential = options.credential.get_or_insert_with(Credential::default);
        credential.source = Some(source.clone());
    }
    Ok(())
}

fn map_auth_mechanism(
    mechanism: models::AuthMechanism,
) -> AppResult<mongodb::options::AuthMechanism> {
    use models::AuthMechanism as Ours;
    use mongodb::options::AuthMechanism as Driver;
    match mechanism {
        Ours::ScramSha1 => Ok(Driver::ScramSha1),
        Ours::ScramSha256 => Ok(Driver::ScramSha256),
        Ours::MongodbX509 => Ok(Driver::MongoDbX509),
        Ours::MongodbAws => Ok(Driver::MongoDbAws),
        Ours::Gssapi => Err(AppError::InvalidInput(
            "Kerberos (GSSAPI) authentication requires a build with the gssapi-auth feature, \
             which mongo-studio does not enable by default because it pulls in a system \
             Kerberos/SASL dependency. See README for details."
                .to_string(),
        )),
    }
}

/// Resolves credentials/secrets for a profile and builds a ready-to-use
/// `ClientOptions`, starting an SSH tunnel first if one is configured.
pub async fn build_client_options(
    profile: &ConnectionProfile,
    secrets: &dyn SecretStore,
    known_hosts: &Arc<KnownHosts>,
) -> AppResult<(ClientOptions, Option<SshTunnel>)> {
    let password = if profile.has_password {
        secrets
            .get(&profile.id, SecretKind::Password)
            .map_err(AppError::Secret)?
    } else {
        None
    };
    let uri = build_uri(profile, profile.username.as_deref(), password.as_deref());

    let mut options = ClientOptions::parse(&uri)
        .await
        .map_err(|e| AppError::InvalidInput(format!("invalid connection string: {e}")))?;

    apply_tls_overrides(&mut options, profile, secrets)?;
    apply_advanced_overrides(&mut options, &profile.advanced)?;

    let tunnel = if let Some(ssh) = &profile.ssh_tunnel {
        if !ssh.enabled {
            None
        } else {
            let ServerAddress::Tcp { host, port } =
                options.hosts.first().cloned().ok_or_else(|| {
                    AppError::InvalidInput("connection has no hosts to tunnel to".to_string())
                })?
            else {
                return Err(AppError::InvalidInput(
                    "SSH tunneling to a Unix socket target is not supported".to_string(),
                ));
            };
            let remote_port = port.unwrap_or(27017);

            let auth = match ssh.auth_method {
                models::SshAuthMethod::Password => {
                    let pw = secrets
                        .get(&profile.id, SecretKind::SshPassword)
                        .map_err(AppError::Secret)?
                        .ok_or_else(|| {
                            AppError::InvalidInput("SSH password not set".to_string())
                        })?;
                    SshTunnelAuth::Password(pw)
                }
                models::SshAuthMethod::PrivateKey => {
                    let path = ssh.private_key_path.clone().ok_or_else(|| {
                        AppError::InvalidInput("SSH private key path not set".to_string())
                    })?;
                    let passphrase = if ssh.private_key_has_passphrase {
                        secrets
                            .get(&profile.id, SecretKind::SshKeyPassphrase)
                            .map_err(AppError::Secret)?
                    } else {
                        None
                    };
                    SshTunnelAuth::PrivateKey { path, passphrase }
                }
                models::SshAuthMethod::Agent => SshTunnelAuth::Agent,
            };

            let tunnel = ssh_tunnel::start_tunnel(
                SshTunnelConfig {
                    ssh_host: ssh.host.clone(),
                    ssh_port: ssh.port,
                    ssh_username: ssh.username.clone(),
                    auth,
                    remote_host: host,
                    remote_port,
                },
                known_hosts.clone(),
            )
            .await?;

            options.hosts = vec![ServerAddress::Tcp {
                host: "127.0.0.1".to_string(),
                port: Some(tunnel.local_addr.port()),
            }];
            options.direct_connection = Some(true);
            Some(tunnel)
        }
    } else {
        None
    };

    Ok((options, tunnel))
}

pub async fn connect(
    profile: &ConnectionProfile,
    secrets: &dyn SecretStore,
    known_hosts: &Arc<KnownHosts>,
) -> AppResult<ActiveConnection> {
    let (options, tunnel) = build_client_options(profile, secrets, known_hosts).await?;
    let client = Client::with_options(options)?;
    // `with_options` doesn't itself perform I/O; force a round trip now so
    // connect failures surface immediately instead of on the first query.
    client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await?;
    Ok(ActiveConnection { client, tunnel })
}

pub async fn test_connection(
    profile: &ConnectionProfile,
    secrets: &dyn SecretStore,
    known_hosts: &Arc<KnownHosts>,
) -> ConnectionTestResult {
    let (options, tunnel) = match build_client_options(profile, secrets, known_hosts).await {
        Ok(v) => v,
        Err(e) => {
            return ConnectionTestResult {
                success: false,
                message: e.to_string(),
                server_version: None,
            }
        }
    };
    let result = async {
        let client = Client::with_options(options)?;
        let build_info = client
            .database("admin")
            .run_command(doc! { "buildInfo": 1 })
            .await?;
        let version = build_info.get_str("version").ok().map(str::to_string);
        Ok::<_, mongodb::error::Error>(version)
    }
    .await;

    if let Some(tunnel) = tunnel {
        tunnel.shutdown().await;
    }

    match result {
        Ok(version) => ConnectionTestResult {
            success: true,
            message: "Connected successfully".to_string(),
            server_version: version,
        },
        Err(e) => ConnectionTestResult {
            success: false,
            message: e.to_string(),
            server_version: None,
        },
    }
}

pub async fn list_databases(client: &Client) -> AppResult<Vec<DatabaseInfo>> {
    let dbs = client.list_databases().await?;
    Ok(dbs
        .into_iter()
        .map(|d| DatabaseInfo {
            name: d.name,
            size_on_disk: d.size_on_disk as i64,
        })
        .collect())
}

pub async fn list_collections(client: &Client, db: &str) -> AppResult<Vec<CollectionInfo>> {
    let collections: Vec<_> = client
        .database(db)
        .list_collections()
        .await?
        .try_collect()
        .await?;
    Ok(collections
        .into_iter()
        .map(|c| CollectionInfo {
            name: c.name,
            collection_type: match c.collection_type {
                mongodb::results::CollectionType::View => "view",
                mongodb::results::CollectionType::Collection => "collection",
                mongodb::results::CollectionType::Timeseries => "timeseries",
                _ => "collection",
            }
            .to_string(),
        })
        .collect())
}

#[cfg(test)]
mod live_tests {
    use super::*;
    use crate::connection::extract_uri_credentials;
    use crate::models::{ConnectionAdvancedOptions, TlsOptions};
    use crate::secrets::{InMemoryStore, SecretKind, SecretStore};

    /// Exercises the real Phase 2 connect path against a live MongoDB
    /// instance. Skipped by default; run explicitly with:
    ///   set -a; source ../.env.local; set +a
    ///   cargo test --lib -- --ignored live_connect_lists_databases
    #[tokio::test]
    #[ignore]
    async fn live_connect_lists_databases() {
        let uri = std::env::var("MONGO_STUDIO_TEST_URI")
            .expect("set MONGO_STUDIO_TEST_URI to run this test");
        let (stripped_uri, username, password) = extract_uri_credentials(&uri);

        let secrets = InMemoryStore::new();
        let profile_id = "live-test".to_string();
        if let Some(password) = &password {
            secrets
                .set(&profile_id, SecretKind::Password, password)
                .unwrap();
        }

        let profile = ConnectionProfile {
            id: profile_id,
            name: "live test".to_string(),
            source: ConnectionSource::Uri { uri: stripped_uri },
            database: None,
            username,
            has_password: password.is_some(),
            tls: TlsOptions::default(),
            ssh_tunnel: None,
            advanced: ConnectionAdvancedOptions::default(),
            created_at: String::new(),
            updated_at: String::new(),
        };

        let known_hosts = Arc::new(
            KnownHosts::load(&std::env::temp_dir().join("mongo-studio-live-test")).unwrap(),
        );
        let active = connect(&profile, &secrets, &known_hosts)
            .await
            .expect("connect should succeed");
        let dbs = list_databases(&active.client)
            .await
            .expect("list_databases should succeed");
        assert!(
            !dbs.is_empty(),
            "expected at least one database visible to this user"
        );
        println!(
            "databases: {:?}",
            dbs.iter().map(|d| &d.name).collect::<Vec<_>>()
        );
    }
}
