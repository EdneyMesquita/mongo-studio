use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::connection::extract_uri_credentials;
use crate::driver;
use crate::error::{AppError, AppResult};
use crate::models::{
    CollectionInfo, CollectionStats, ConnectionHandle, ConnectionProfile, ConnectionProfileInput,
    ConnectionProfileMeta, ConnectionSource, ConnectionTestResult, DatabaseInfo, FindQueryInput,
    QueryResultPage, ScriptResult, SecretBackendInfo, SecretBackendKind,
};
use crate::scripting;
use crate::secrets::SecretKind;
use crate::state::AppState;

fn now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // A plain Unix-epoch-seconds timestamp; good enough for created/updated
    // bookkeeping without pulling in a datetime-formatting crate.
    format!("{}", now.as_secs())
}

/// Turns a submitted profile form into persisted metadata, writing any
/// secret fields (password, TLS/SSH passphrases) to the secret store and
/// stripping them from what gets written to `connections.json`.
async fn materialize_profile(
    state: &AppState,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionProfile> {
    let id = input.id.clone().unwrap_or_default();
    let id = if id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        id
    };

    let (source, mut username, extracted_password) = match input.source {
        ConnectionSource::Uri { uri } => {
            let (stripped, user, pass) = extract_uri_credentials(&uri);
            (ConnectionSource::Uri { uri: stripped }, user, pass)
        }
        manual @ ConnectionSource::Manual { .. } => (manual, None, None),
    };
    if input.username.is_some() {
        username = input.username;
    }
    let password = input.password.or(extracted_password);

    let has_password = if let Some(password) = &password {
        state
            .secret_store
            .set(&id, SecretKind::Password, password)
            .map_err(AppError::Secret)?;
        true
    } else {
        false
    };

    let mut tls = input.tls;
    if let Some(passphrase) = &input.tls_cert_key_passphrase {
        state
            .secret_store
            .set(&id, SecretKind::TlsCertKeyPassphrase, passphrase)
            .map_err(AppError::Secret)?;
        tls.cert_key_has_passphrase = true;
    }

    let mut ssh_tunnel = input.ssh_tunnel;
    if let Some(ssh) = &mut ssh_tunnel {
        if let Some(password) = &input.ssh_password {
            state
                .secret_store
                .set(&id, SecretKind::SshPassword, password)
                .map_err(AppError::Secret)?;
        }
        if let Some(passphrase) = &input.ssh_key_passphrase {
            state
                .secret_store
                .set(&id, SecretKind::SshKeyPassphrase, passphrase)
                .map_err(AppError::Secret)?;
            ssh.private_key_has_passphrase = true;
        }
    }

    let created_at = state
        .connection_store
        .get(&id)
        .map(|p| p.created_at)
        .unwrap_or_else(|_| now_iso());

    Ok(ConnectionProfile {
        id,
        name: input.name,
        source,
        database: input.database,
        username,
        has_password,
        tls,
        ssh_tunnel,
        advanced: input.advanced,
        created_at,
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub fn list_connection_profiles(state: State<AppState>) -> Vec<ConnectionProfileMeta> {
    state
        .connection_store
        .list()
        .iter()
        .map(ConnectionProfileMeta::from)
        .collect()
}

#[tauri::command]
pub fn get_connection_profile(state: State<AppState>, id: String) -> AppResult<ConnectionProfile> {
    state.connection_store.get(&id)
}

#[tauri::command]
pub async fn save_connection_profile(
    state: State<'_, AppState>,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionProfileMeta> {
    let profile = materialize_profile(&state, input).await?;
    let saved = state.connection_store.upsert(profile)?;
    Ok(ConnectionProfileMeta::from(&saved))
}

#[tauri::command]
pub async fn delete_connection_profile(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.connection_store.delete(&id)?;
    let _ = state.secret_store.delete_all(&id);
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionTestResult> {
    // Test against an ephemeral profile derived from the form so users can
    // verify a connection before saving it.
    let profile = materialize_profile(&state, input).await?;
    Ok(driver::test_connection(&profile, state.secret_store.as_ref(), &state.known_hosts).await)
}

#[tauri::command]
pub async fn connect(state: State<'_, AppState>, id: String) -> AppResult<ConnectionHandle> {
    let profile = state.connection_store.get(&id)?;
    let active = driver::connect(&profile, state.secret_store.as_ref(), &state.known_hosts).await?;

    let build_info = active
        .client
        .database("admin")
        .run_command(mongodb::bson::doc! { "buildInfo": 1 })
        .await
        .ok();
    let server_version = build_info
        .as_ref()
        .and_then(|d| d.get_str("version").ok())
        .map(str::to_string);

    let session_id = Uuid::new_v4().to_string();
    state
        .sessions
        .write()
        .await
        .insert(session_id.clone(), active);

    Ok(ConnectionHandle {
        session_id,
        server_version,
    })
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    let active = state.sessions.write().await.remove(&session_id);
    match active {
        Some(active) => {
            if let Some(tunnel) = active.tunnel {
                tunnel.shutdown().await;
            }
            Ok(())
        }
        None => Err(AppError::SessionNotFound(session_id)),
    }
}

#[tauri::command]
pub fn secret_backend_info(state: State<AppState>) -> SecretBackendInfo {
    let warning = match state.secret_backend {
        SecretBackendKind::Keyring => None,
        SecretBackendKind::EncryptedFile => Some(
            "No OS keychain was found (common on headless Linux). Secrets are encrypted at \
             rest on disk instead, which is less secure than a real system keychain."
                .to_string(),
        ),
    };
    SecretBackendInfo {
        backend: state.secret_backend,
        warning,
    }
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<Vec<DatabaseInfo>> {
    let sessions = state.sessions.read().await;
    let active = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    driver::list_databases(&active.client).await
}

#[tauri::command]
pub async fn list_collections(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
) -> AppResult<Vec<CollectionInfo>> {
    let sessions = state.sessions.read().await;
    let active = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    driver::list_collections(&active.client, &database).await
}

#[tauri::command]
pub async fn get_collection_stats(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
) -> AppResult<CollectionStats> {
    let sessions = state.sessions.read().await;
    let active = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    driver::get_collection_stats(&active.client, &database, &collection).await
}

#[tauri::command]
pub async fn run_find(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    query: FindQueryInput,
) -> AppResult<QueryResultPage> {
    let sessions = state.sessions.read().await;
    let active = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    driver::run_find(&active.client, &database, &collection, &query).await
}

#[tauri::command]
pub async fn run_aggregate(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    pipeline: serde_json::Value,
) -> AppResult<QueryResultPage> {
    let sessions = state.sessions.read().await;
    let active = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    driver::run_aggregate(&active.client, &database, &collection, pipeline).await
}

#[tauri::command]
pub async fn count_documents(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    filter: serde_json::Value,
) -> AppResult<u64> {
    let sessions = state.sessions.read().await;
    let active = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
    driver::count_documents(&active.client, &database, &collection, filter).await
}

#[tauri::command]
pub async fn run_script(
    state: State<'_, AppState>,
    app: AppHandle,
    session_id: String,
    database: String,
    script: String,
    execution_id: String,
    timeout_ms: Option<u64>,
) -> AppResult<ScriptResult> {
    let client = {
        let sessions = state.sessions.read().await;
        let active = sessions
            .get(&session_id)
            .ok_or_else(|| AppError::SessionNotFound(session_id.clone()))?;
        active.client.clone()
    };

    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .running_scripts
        .lock()
        .unwrap()
        .insert(execution_id.clone(), cancel_flag.clone());

    let log_execution_id = execution_id.clone();
    let on_log = move |message: String| {
        let _ = app.emit(
            "script-log",
            serde_json::json!({ "executionId": log_execution_id, "message": message }),
        );
    };

    let result =
        scripting::run_script(client, database, script, timeout_ms, cancel_flag, on_log).await;

    state.running_scripts.lock().unwrap().remove(&execution_id);

    let result = result?;
    Ok(ScriptResult {
        value: result.value,
        logs: result.logs,
    })
}

#[tauri::command]
pub fn cancel_script(state: State<AppState>, execution_id: String) {
    if let Some(flag) = state.running_scripts.lock().unwrap().get(&execution_id) {
        flag.store(true, Ordering::Relaxed);
    }
}
