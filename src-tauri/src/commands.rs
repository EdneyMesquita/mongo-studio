use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use mongodb::Client;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::assistant::{
    ApprovalChoice, Assistant, AssistantPolicy, AssistantStartInput, AssistantStarted,
    DetectedAgent,
};
use crate::connection::extract_uri_credentials;
use crate::connections_io;
use crate::driver;
use crate::error::{AppError, AppResult};
use crate::export;
use crate::logging::{self, logged, Op};
use crate::models::{
    validate_color, CollectionInfo, CollectionStats, ConnectionAdvancedOptions, ConnectionHandle,
    ConnectionImportPreview, ConnectionProfile, ConnectionProfileInput, ConnectionProfileMeta,
    ConnectionSource, ConnectionTestResult, ConnectionsExportSummary, ConnectionsImportSummary,
    DatabaseInfo, ExplainQueryInput, ExplainVerbosity, ExportOptions, ExportQueryInput,
    ExportSummary, FindQueryInput, QueryResultPage, ScriptResult, SecretBackendInfo,
    SecretBackendKind, TlsOptions,
};
use crate::saved_scripts::{SavedScript, SavedScriptsStore};
use crate::scripting;
use crate::secrets::SecretKind;
use crate::sidebar_layout::SidebarLayoutStore;
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
    // Before any secret is written, so a bad color leaves nothing behind.
    validate_color(input.color.as_deref())?;
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
        // Editing a saved connection with the password left blank keeps the
        // one already stored, rather than silently dropping it.
        state
            .connection_store
            .get(&id)
            .is_ok_and(|saved| saved.has_password)
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
        color: input.color,
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
    logged("get_connection_profile", state.connection_store.get(&id))
}

/// `"prod" (3f2a...)`: how log lines name a saved connection.
fn connection_label(profile: &ConnectionProfile) -> String {
    format!("\"{}\" ({})", profile.name, profile.id)
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

#[tauri::command]
pub async fn save_connection_profile(
    state: State<'_, AppState>,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionProfileMeta> {
    let saved = async {
        let profile = materialize_profile(&state, input).await?;
        state.connection_store.upsert(profile)
    }
    .await;
    let saved = logged("save_connection_profile", saved)?;
    log::info!(
        "saved connection {} at {}; password saved: {}",
        connection_label(&saved),
        logging::route(&saved),
        yes_no(saved.has_password)
    );
    Ok(ConnectionProfileMeta::from(&saved))
}

#[tauri::command]
pub async fn delete_connection_profile(state: State<'_, AppState>, id: String) -> AppResult<()> {
    logged(
        "delete_connection_profile",
        state.connection_store.delete(&id),
    )?;
    let _ = state.secret_store.delete_all(&id);
    log::info!("deleted connection {id}");
    Ok(())
}

#[tauri::command]
pub async fn export_connections(
    state: State<'_, AppState>,
    dest_path: String,
    include_secrets: bool,
) -> AppResult<ConnectionsExportSummary> {
    let profiles = state.connection_store.list();
    let exported = logged(
        "export_connections",
        connections_io::export_connections(
            &profiles,
            include_secrets,
            state.secret_store.as_ref(),
            std::path::Path::new(&dest_path),
        ),
    )?;
    log::info!(
        "exported {exported} connections; secrets included: {}",
        yes_no(include_secrets)
    );
    Ok(ConnectionsExportSummary { exported })
}

/// Lists what an import file holds, without saving anything, so the user
/// can pick which connections to import.
#[tauri::command]
pub async fn preview_connections_import(
    state: State<'_, AppState>,
    src_path: String,
) -> AppResult<Vec<ConnectionImportPreview>> {
    logged(
        "preview_connections_import",
        std::fs::read_to_string(&src_path)
            .map_err(AppError::from)
            .and_then(|raw| preview_import(&state, &raw)),
    )
}

fn preview_import(state: &AppState, raw: &str) -> AppResult<Vec<ConnectionImportPreview>> {
    let existing: std::collections::HashSet<String> = state
        .connection_store
        .list()
        .into_iter()
        .map(|p| p.name)
        .collect();
    Ok(connections_io::parse_connections_file(raw)?
        .into_iter()
        .enumerate()
        .map(|(index, entry)| match entry {
            Ok(entry) => ConnectionImportPreview {
                index,
                exists: existing.contains(&entry.name),
                address: crate::models::redact_uri_summary(&entry.uri),
                name: entry.name,
                warning: entry.warning,
                error: None,
            },
            Err(message) => ConnectionImportPreview {
                index,
                name: String::new(),
                address: String::new(),
                warning: None,
                error: Some(message),
                exists: false,
            },
        })
        .collect())
}

/// Imports the connections at `selected` positions of the file (see
/// `preview_connections_import`), or all of them when it's absent.
#[tauri::command]
pub async fn import_connections(
    state: State<'_, AppState>,
    src_path: String,
    selected: Option<Vec<usize>>,
) -> AppResult<ConnectionsImportSummary> {
    let summary = async {
        import_file(
            &state,
            &std::fs::read_to_string(&src_path)?,
            selected.as_deref(),
        )
        .await
    }
    .await;
    let summary = logged("import_connections", summary)?;
    log::info!(
        "imported {} connections, {} skipped with errors, {} with warnings",
        summary.imported,
        summary.errors.len(),
        summary.warnings.len()
    );
    // Names and what went wrong, never a connection string or password.
    for error in &summary.errors {
        log::warn!("import error: {error}");
    }
    for warning in &summary.warnings {
        log::warn!("import warning: {warning}");
    }
    Ok(summary)
}

async fn import_file(
    state: &AppState,
    raw: &str,
    selected: Option<&[usize]>,
) -> AppResult<ConnectionsImportSummary> {
    let parsed = connections_io::parse_connections_file(raw)?;

    let mut imported = 0;
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for (index, entry) in parsed.into_iter().enumerate() {
        if selected.is_some_and(|picked| !picked.contains(&index)) {
            continue;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(message) => {
                errors.push(message);
                continue;
            }
        };
        if let Some(warning) = entry.warning {
            warnings.push(warning);
        }
        let input = ConnectionProfileInput {
            id: None,
            name: entry.name,
            color: None,
            source: ConnectionSource::Uri { uri: entry.uri },
            database: None,
            username: entry.username,
            password: None,
            tls: TlsOptions::default(),
            tls_cert_key_passphrase: None,
            ssh_tunnel: entry.ssh_tunnel,
            ssh_password: entry.ssh_password,
            ssh_key_passphrase: entry.ssh_key_passphrase,
            advanced: ConnectionAdvancedOptions::default(),
        };
        let profile = materialize_profile(state, input).await?;
        let saved = state.connection_store.upsert(profile)?;
        // Whether a password came along is what "imported connections
        // can't log in" comes down to.
        log::info!(
            "imported connection {} at {}; user set: {}, password saved: {}",
            connection_label(&saved),
            logging::route(&saved),
            yes_no(saved.username.is_some()),
            yes_no(saved.has_password)
        );
        imported += 1;
    }

    Ok(ConnectionsImportSummary {
        imported,
        errors,
        warnings,
    })
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    input: ConnectionProfileInput,
) -> AppResult<ConnectionTestResult> {
    test_profile(&state, input).await
}

/// Tests the connection a form describes without touching saved secrets.
///
/// Materializing a profile writes its secrets to the store, so doing that
/// under the profile's own id would overwrite a saved password with
/// whatever was typed into an edit form that is then cancelled - and a
/// never-saved connection would leave its secrets behind. Instead the test
/// runs under a throwaway id, borrowing the saved secrets the form left
/// blank, and everything stored under that id is removed afterwards.
async fn test_profile(
    state: &AppState,
    mut input: ConnectionProfileInput,
) -> AppResult<ConnectionTestResult> {
    let saved = input
        .id
        .as_deref()
        .filter(|id| !id.is_empty())
        .and_then(|id| state.connection_store.get(id).ok());
    let temp_id = format!("connection-test-{}", Uuid::new_v4());
    let label = format!(
        "\"{}\" ({})",
        input.name,
        saved.as_ref().map_or("unsaved", |s| s.id.as_str())
    );
    let started = Instant::now();

    let result = async {
        if let Some(saved) = &saved {
            for kind in SecretKind::ALL {
                if let Some(value) = state
                    .secret_store
                    .get(&saved.id, kind)
                    .map_err(AppError::Secret)?
                {
                    state
                        .secret_store
                        .set(&temp_id, kind, &value)
                        .map_err(AppError::Secret)?;
                }
            }
        }
        input.id = Some(temp_id.clone());
        let mut profile = materialize_profile(state, input).await?;
        // A blank password field means the saved one, copied over above.
        profile.has_password |= saved.as_ref().is_some_and(|s| s.has_password);
        let tested =
            driver::test_connection(&profile, state.secret_store.as_ref(), &state.known_hosts)
                .await;
        Ok((tested, logging::route(&profile)))
    }
    .await;

    let _ = state.secret_store.delete_all(&temp_id);
    let ms = started.elapsed().as_millis();
    let (tested, route) = logged(&format!("testing connection {label}"), result)?;
    if tested.success {
        log::info!(
            "connection test of {label} at {route} succeeded in {ms} ms; server {}",
            tested
                .server_version
                .as_deref()
                .unwrap_or("version unknown")
        );
    } else {
        log::warn!(
            "connection test of {label} at {route} failed after {ms} ms: {}",
            logging::scrub_credentials(&tested.message)
        );
    }
    Ok(tested)
}

#[tauri::command]
pub async fn connect(state: State<'_, AppState>, id: String) -> AppResult<ConnectionHandle> {
    let profile = logged("connect", state.connection_store.get(&id))?;
    let target = format!(
        "{} at {}",
        connection_label(&profile),
        logging::route(&profile)
    );
    log::info!("connecting to {target}");
    let started = Instant::now();
    let active = driver::connect(&profile, state.secret_store.as_ref(), &state.known_hosts).await;
    let ms = started.elapsed().as_millis();
    let active = logged(&format!("connecting to {target} ({ms} ms)"), active)?;

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
    log::info!(
        "connected to {target} in {} ms; server {}; session {session_id}",
        started.elapsed().as_millis(),
        server_version.as_deref().unwrap_or("version unknown")
    );
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
            log::info!("disconnected \"{}\"; session {session_id}", active.name);
            Ok(())
        }
        None => logged("disconnect", Err(AppError::SessionNotFound(session_id))),
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

/// Runs a database operation on a connected session's client, logging it
/// if it fails or is slow (see `logging::timed`). The sessions lock is held
/// throughout, as before, so a disconnect waits for the operation.
async fn on_session<T>(
    state: &AppState,
    session_id: &str,
    op: Op<'_>,
    run: impl AsyncFnOnce(&Client) -> AppResult<T>,
) -> AppResult<T> {
    let sessions = state.sessions.read().await;
    let active = sessions.get(session_id);
    let connection = active.map_or("not connected", |a| a.name.as_str());
    logging::timed(&op, connection, async {
        let active = active.ok_or_else(|| AppError::SessionNotFound(session_id.to_string()))?;
        run(&active.client).await
    })
    .await
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<Vec<DatabaseInfo>> {
    let op = Op::new("listDatabases", "", None);
    on_session(&state, &session_id, op, async |client| {
        driver::list_databases(client).await
    })
    .await
}

#[tauri::command]
pub async fn list_collections(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
) -> AppResult<Vec<CollectionInfo>> {
    let op = Op::new("listCollections", &database, None);
    on_session(&state, &session_id, op, async |client| {
        driver::list_collections(client, &database).await
    })
    .await
}

#[tauri::command]
pub async fn get_collection_stats(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
) -> AppResult<CollectionStats> {
    let op = Op::new("collStats", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::get_collection_stats(client, &database, &collection).await
    })
    .await
}

#[tauri::command]
pub async fn list_index_stats(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
) -> AppResult<Vec<serde_json::Value>> {
    let op = Op::new("indexStats", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::list_index_stats(client, &database, &collection).await
    })
    .await
}

#[tauri::command]
pub async fn explain_query(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    query: ExplainQueryInput,
    verbosity: ExplainVerbosity,
) -> AppResult<serde_json::Value> {
    let op = Op::new("explain", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::explain_query(client, &database, &collection, &query, verbosity).await
    })
    .await
}

#[tauri::command]
pub async fn run_find(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    query: FindQueryInput,
) -> AppResult<QueryResultPage> {
    let op = Op::new("find", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::run_find(client, &database, &collection, &query).await
    })
    .await
}

/// Sets one field of one document, found by `_id`. Returns the document as
/// stored afterwards.
#[tauri::command]
pub async fn update_field(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    id: serde_json::Value,
    path: Vec<String>,
    value: serde_json::Value,
) -> AppResult<serde_json::Value> {
    let op = Op::new("updateField", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::update_field(client, &database, &collection, id, &path, value).await
    })
    .await
}

#[tauri::command]
pub async fn run_aggregate(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    pipeline: serde_json::Value,
) -> AppResult<QueryResultPage> {
    let op = Op::new("aggregate", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::run_aggregate(client, &database, &collection, pipeline).await
    })
    .await
}

#[tauri::command]
pub async fn count_documents(
    state: State<'_, AppState>,
    session_id: String,
    database: String,
    collection: String,
    filter: serde_json::Value,
) -> AppResult<u64> {
    let op = Op::new("count", &database, Some(&collection));
    on_session(&state, &session_id, op, async |client| {
        driver::count_documents(client, &database, &collection, filter).await
    })
    .await
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
    let (client, connection) = logged("run_script", session_client(&state, &session_id).await)?;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .running_tasks
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

    // The script's text, output and errors are the user's: only where it
    // ran, how long it took and whether it failed are logged.
    let op = Op::new("script", &database, None);
    let result = logging::timed(
        &op,
        &connection,
        scripting::run_script(
            client,
            database.clone(),
            script,
            timeout_ms,
            cancel_flag,
            on_log,
        ),
    )
    .await;

    state.running_tasks.lock().unwrap().remove(&execution_id);

    let result = result?;
    Ok(ScriptResult {
        value: result.value,
        logs: result.logs,
    })
}

#[tauri::command]
pub fn cancel_script(state: State<AppState>, execution_id: String) {
    if let Some(flag) = state.running_tasks.lock().unwrap().get(&execution_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn export_query(
    state: State<'_, AppState>,
    app: AppHandle,
    session_id: String,
    database: String,
    collection: String,
    query: ExportQueryInput,
    options: ExportOptions,
    dest_path: String,
    execution_id: String,
) -> AppResult<ExportSummary> {
    let (client, connection) = logged("export_query", session_client(&state, &session_id).await)?;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .running_tasks
        .lock()
        .unwrap()
        .insert(execution_id.clone(), cancel_flag.clone());

    let progress_execution_id = execution_id.clone();
    let on_progress = move |rows_written: u64| {
        let _ = app.emit(
            "export-progress",
            serde_json::json!({ "executionId": progress_execution_id, "rowsWritten": rows_written }),
        );
    };

    let started = Instant::now();
    let result = export::export_query(
        &client,
        &database,
        &collection,
        query,
        options,
        std::path::Path::new(&dest_path),
        cancel_flag,
        on_progress,
    )
    .await;

    state.running_tasks.lock().unwrap().remove(&execution_id);
    // Exports are slow by nature, so a finished one is logged as such
    // rather than through `logging::timed`'s slow-operation warning.
    let op = Op::new("export", &database, Some(&collection));
    match &result {
        Ok(summary) => log::info!(
            "{op} [{connection}] wrote {} rows in {} ms",
            summary.rows_written,
            started.elapsed().as_millis()
        ),
        Err(e) => logging::op_failed(&op, &connection, started.elapsed(), e),
    }
    result
}

/// A session's client and connection name, for work that runs without
/// holding the sessions lock (scripts and exports, which can be cancelled).
async fn session_client(state: &AppState, session_id: &str) -> AppResult<(Client, String)> {
    state
        .sessions
        .read()
        .await
        .get(session_id)
        .map(|active| (active.client.clone(), active.name.clone()))
        .ok_or_else(|| AppError::SessionNotFound(session_id.to_string()))
}

/// Writes a value the frontend already holds, such as a console result.
#[tauri::command]
pub async fn export_value(
    value: serde_json::Value,
    options: ExportOptions,
    dest_path: String,
) -> AppResult<ExportSummary> {
    let result = tokio::task::spawn_blocking(move || {
        export::export_value(&value, &options, std::path::Path::new(&dest_path))
    })
    .await
    .map_err(|e| AppError::InvalidInput(format!("export failed: {e}")))
    .flatten();
    logged("export_value", result)
}

#[tauri::command]
pub fn cancel_export(state: State<AppState>, execution_id: String) {
    if let Some(flag) = state.running_tasks.lock().unwrap().get(&execution_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// The sidebar's folder tree, or null before one was saved.
#[tauri::command]
pub async fn get_sidebar_layout(
    store: State<'_, SidebarLayoutStore>,
) -> AppResult<serde_json::Value> {
    logged("get_sidebar_layout", store.get())
}

#[tauri::command]
pub async fn save_sidebar_layout(
    store: State<'_, SidebarLayoutStore>,
    layout: serde_json::Value,
) -> AppResult<()> {
    logged("save_sidebar_layout", store.save(&layout))
}

#[tauri::command]
pub async fn suggest_script_path(store: State<'_, SavedScriptsStore>) -> AppResult<String> {
    logged(
        "suggest_script_path",
        store
            .suggest_path()
            .map(|path| path.to_string_lossy().into_owned()),
    )
}

/// Saves a console script. With no `path` it lands in the default folder
/// under a random name - what happens when the save dialog is dismissed.
#[tauri::command]
pub async fn save_script(
    store: State<'_, SavedScriptsStore>,
    path: Option<String>,
    content: String,
) -> AppResult<SavedScript> {
    logged("save_script", store.save(path.as_deref(), &content))
}

#[tauri::command]
pub async fn list_saved_scripts(
    store: State<'_, SavedScriptsStore>,
) -> AppResult<Vec<SavedScript>> {
    logged("list_saved_scripts", store.list())
}

#[tauri::command]
pub async fn read_saved_script(
    store: State<'_, SavedScriptsStore>,
    path: String,
) -> AppResult<String> {
    logged("read_saved_script", store.read(&path))
}

/// Finds the agent CLIs (Claude Code, Codex) and their versions.
#[tauri::command]
pub async fn assistant_detect(assistant: State<'_, Assistant>) -> AppResult<Vec<DetectedAgent>> {
    Ok(assistant.detect().await)
}

/// What the Assistant's tools may read; set at startup and whenever the
/// settings change.
#[tauri::command]
pub fn assistant_set_policy(assistant: State<Assistant>, policy: AssistantPolicy) -> AppResult<()> {
    assistant.set_policy(policy);
    Ok(())
}

/// Registers a conversation bound to one connection and database. Spawns
/// nothing until the first `assistant_send`.
#[tauri::command]
pub async fn assistant_start(
    assistant: State<'_, Assistant>,
    input: AssistantStartInput,
) -> AppResult<AssistantStarted> {
    logged("assistant_start", assistant.start(input).await)
}

/// Starts a turn; returns once the prompt is handed to the CLI. The answer
/// arrives as `assistant-event`s.
#[tauri::command]
pub async fn assistant_send(
    assistant: State<'_, Assistant>,
    agent_session_id: String,
    text: String,
) -> AppResult<()> {
    logged(
        "assistant_send",
        assistant.send(&agent_session_id, text).await,
    )
}

#[tauri::command]
pub async fn assistant_stop(
    assistant: State<'_, Assistant>,
    agent_session_id: String,
) -> AppResult<()> {
    logged("assistant_stop", assistant.stop(&agent_session_id).await)
}

#[tauri::command]
pub async fn assistant_close(
    assistant: State<'_, Assistant>,
    agent_session_id: String,
) -> AppResult<()> {
    logged("assistant_close", assistant.close(&agent_session_id).await)
}

#[tauri::command]
pub fn assistant_answer(
    assistant: State<Assistant>,
    request_id: String,
    choice: ApprovalChoice,
) -> AppResult<()> {
    logged("assistant_answer", assistant.answer(&request_id, choice))
}

/// The folder the agents run in, for the "Copy resume command" action.
#[tauri::command]
pub fn assistant_workdir(assistant: State<Assistant>) -> AppResult<String> {
    logged("assistant_workdir", assistant.workdir())
}

/// Opens the folder holding the app's log files in the OS file manager, and
/// returns its path. The error names the path too, so the user can still
/// find the folder when no file manager opens.
#[tauri::command]
pub async fn open_log_dir(app: AppHandle) -> AppResult<String> {
    let opened = (|| {
        let dir = crate::logging::log_dir(&app).map_err(std::io::Error::other)?;
        std::fs::create_dir_all(&dir)?;
        let dir = dir.to_string_lossy().into_owned();
        app.opener().open_path(&dir, None::<&str>).map_err(|e| {
            std::io::Error::other(format!("couldn't open the logs folder ({dir}): {e}"))
        })?;
        Ok(dir)
    })();
    logged("open_log_dir", opened)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;

    use tokio::sync::RwLock;

    use super::*;
    use crate::connection::ConnectionStore;
    use crate::secrets::{InMemoryStore, SecretStore};
    use crate::ssh_tunnel::KnownHosts;

    /// Lets a test keep a handle on the store AppState owns.
    struct Shared(Arc<InMemoryStore>);

    impl SecretStore for Shared {
        fn set(&self, id: &str, kind: SecretKind, value: &str) -> Result<(), String> {
            self.0.set(id, kind, value)
        }
        fn get(&self, id: &str, kind: SecretKind) -> Result<Option<String>, String> {
            self.0.get(id, kind)
        }
        fn delete(&self, id: &str, kind: SecretKind) -> Result<(), String> {
            self.0.delete(id, kind)
        }
    }

    fn state() -> (AppState, Arc<InMemoryStore>, PathBuf) {
        let dir = std::env::temp_dir().join(format!("mongo-studio-commands-{}", Uuid::new_v4()));
        let secrets = Arc::new(InMemoryStore::new());
        let state = AppState {
            connection_store: ConnectionStore::load(&dir).unwrap(),
            secret_store: Box::new(Shared(secrets.clone())),
            secret_backend: SecretBackendKind::Keyring,
            known_hosts: Arc::new(KnownHosts::load(&dir).unwrap()),
            sessions: RwLock::new(HashMap::new()),
            running_tasks: Mutex::new(HashMap::new()),
        };
        (state, secrets, dir)
    }

    /// A server that refuses at once, so tests that try to connect fail fast.
    fn input(id: Option<String>, name: &str, password: Option<&str>) -> ConnectionProfileInput {
        ConnectionProfileInput {
            id,
            name: name.to_string(),
            color: None,
            source: ConnectionSource::Uri {
                uri: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200"
                    .to_string(),
            },
            database: None,
            username: Some("alice".to_string()),
            password: password.map(str::to_string),
            tls: TlsOptions::default(),
            tls_cert_key_passphrase: None,
            ssh_tunnel: None,
            ssh_password: None,
            ssh_key_passphrase: None,
            advanced: ConnectionAdvancedOptions::default(),
        }
    }

    async fn save(state: &AppState, input: ConnectionProfileInput) -> ConnectionProfile {
        let profile = materialize_profile(state, input).await.unwrap();
        state.connection_store.upsert(profile).unwrap()
    }

    const THREE_CONNECTIONS: &str = r#"{
        "type": "Compass Connections",
        "version": 1,
        "connections": [
            { "id": "a", "connectionOptions": { "connectionString": "mongodb://bob:pw@one.example.net/" }, "favorite": { "name": "One" } },
            { "id": "b", "connectionOptions": { "connectionString": "mongodb://two.example.net/" }, "favorite": { "name": "prod" } },
            { "id": "c", "connectionOptions": { "connectionString": "mongodb://three.example.net/" }, "favorite": { "name": "Three" } }
        ]
    }"#;

    #[tokio::test]
    async fn preview_lists_the_file_without_saving_and_flags_existing_names() {
        let (state, _, dir) = state();
        save(&state, input(None, "prod", None)).await;

        let preview = preview_import(&state, THREE_CONNECTIONS).unwrap();

        let names: Vec<_> = preview.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["One", "prod", "Three"]);
        assert_eq!(
            preview.iter().map(|p| p.exists).collect::<Vec<_>>(),
            [false, true, false]
        );
        assert!(!preview[0].address.contains("pw"), "credentials are masked");
        assert_eq!(state.connection_store.list().len(), 1, "nothing saved");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn import_takes_only_the_selected_connections() {
        let (state, _, dir) = state();

        let summary = import_file(&state, THREE_CONNECTIONS, Some(&[0, 2]))
            .await
            .unwrap();

        assert_eq!(summary.imported, 2);
        let mut names: Vec<_> = state
            .connection_store
            .list()
            .into_iter()
            .map(|p| p.name)
            .collect();
        names.sort();
        assert_eq!(names, ["One", "Three"]);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn a_saved_color_round_trips_through_get_and_list() {
        let (state, _, dir) = state();
        let mut with_color = input(None, "prod", None);
        with_color.color = Some("#E5484D".to_string());

        let saved = save(&state, with_color).await;

        let fetched = state.connection_store.get(&saved.id).unwrap();
        assert_eq!(fetched.color.as_deref(), Some("#E5484D"));
        let meta: Vec<_> = state
            .connection_store
            .list()
            .iter()
            .map(ConnectionProfileMeta::from)
            .collect();
        assert_eq!(meta[0].color.as_deref(), Some("#E5484D"));
        let json = serde_json::to_value(&meta[0]).unwrap();
        assert_eq!(json["color"], "#E5484D");

        // back to automatic
        let mut cleared = input(Some(saved.id.clone()), "prod", None);
        cleared.color = None;
        assert_eq!(save(&state, cleared).await.color, None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn saving_rejects_a_color_that_is_not_hex() {
        let (state, secrets, dir) = state();
        for bad in ["red", "#E5484", "#E5484DFF", "E5484D1", "#GGGGGG", ""] {
            let mut bad_input = input(None, "prod", Some("pw"));
            bad_input.color = Some(bad.to_string());
            let err = materialize_profile(&state, bad_input).await.unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{bad}: {err}");
        }
        assert_eq!(secrets.len(), 0, "no secrets written for a rejected save");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn editing_with_the_password_left_blank_keeps_the_saved_one() {
        let (state, _, dir) = state();
        let saved = save(&state, input(None, "prod", Some("s3cret"))).await;

        let edited = save(
            &state,
            input(Some(saved.id.clone()), "prod (renamed)", None),
        )
        .await;

        assert_eq!(edited.name, "prod (renamed)");
        assert!(edited.has_password);
        assert_eq!(
            state
                .secret_store
                .get(&saved.id, SecretKind::Password)
                .unwrap()
                .as_deref(),
            Some("s3cret")
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn testing_an_edit_leaves_saved_secrets_alone() {
        let (state, secrets, dir) = state();
        let saved = save(&state, input(None, "prod", Some("s3cret"))).await;
        let before = secrets.len();

        // a wrong password typed into the edit form, then tested
        test_profile(&state, input(Some(saved.id.clone()), "prod", Some("wrong")))
            .await
            .unwrap();

        assert_eq!(
            state
                .secret_store
                .get(&saved.id, SecretKind::Password)
                .unwrap()
                .as_deref(),
            Some("s3cret")
        );
        assert_eq!(secrets.len(), before, "nothing left under the throwaway id");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn testing_a_new_connection_leaves_no_secrets_behind() {
        let (state, secrets, dir) = state();

        test_profile(&state, input(None, "draft", Some("pw")))
            .await
            .unwrap();

        assert_eq!(secrets.len(), 0);
        assert!(state.connection_store.list().is_empty());
        std::fs::remove_dir_all(dir).ok();
    }
}
