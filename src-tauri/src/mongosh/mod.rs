//! The mongosh script engine: finds the MongoDB Shell on this machine (or
//! downloads MongoDB's official build into the app's data folder when the
//! user asks), and runs console scripts through it as a child process
//! instead of the built-in engine in `scripting`.

// Scaffold: removed once the module is implemented.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::ScriptResult;
use crate::state::{AppState, CancelToken};

/// Payload of the `mongosh-download` event.
pub const DOWNLOAD_EVENT: &str = "mongosh-download";

/// Where the mongosh in use was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MongoshSource {
    /// The executable picked in settings.
    Custom,
    /// The copy Mongo Studio downloaded into its data folder.
    Downloaded,
    /// Found on the PATH (the login shell's, for a GUI launch).
    Path,
}

/// What `mongosh_detect` and `mongosh_download` report.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoshInfo {
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<MongoshSource>,
    /// Found but didn't run, or the download failed.
    pub error: Option<String>,
    /// Size in bytes of the archive a download would fetch, when known.
    pub download_size: Option<u64>,
}

/// How a script runs under mongosh, from the console settings.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoshRunOptions {
    /// The executable to run; `None` uses what `detect` finds.
    pub path: Option<String>,
    /// Extra command-line arguments, split like a shell would.
    #[serde(default)]
    pub extra_args: String,
    /// Load ~/.mongoshrc.js (off passes --norc).
    #[serde(default)]
    pub load_rc: bool,
}

/// The URI mongosh connects with for a live session: the session's saved
/// connection with its credentials, through the app's SSH tunnel when it
/// uses one, with its TLS files. Also returns the connection's name for log
/// lines.
pub async fn session_uri(state: &AppState, session_id: &str) -> AppResult<(String, String)> {
    let _ = (state, session_id);
    Err(AppError::InvalidInput(
        "the mongosh engine is not implemented yet".to_string(),
    ))
}

#[derive(Clone)]
pub struct Mongosh {
    /// Where downloaded builds are unpacked.
    data_dir: std::path::PathBuf,
}

impl Mongosh {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        Self { data_dir }
    }

    /// Looks for mongosh: the custom path first, then a downloaded copy,
    /// then the PATH.
    pub async fn detect(&self, custom_path: Option<String>) -> MongoshInfo {
        let _ = (&self.data_dir, custom_path);
        MongoshInfo {
            error: Some("Not implemented yet".to_string()),
            ..MongoshInfo::default()
        }
    }

    /// Downloads MongoDB's build for this platform, checks its SHA-256,
    /// unpacks it into the data folder and reports it like `detect`.
    /// Progress goes out as `DOWNLOAD_EVENT` through `on_progress`.
    pub async fn download(
        &self,
        on_progress: impl Fn(serde_json::Value) + Send + Sync + 'static,
    ) -> AppResult<MongoshInfo> {
        let _ = on_progress;
        Err(AppError::InvalidInput(
            "mongosh download is not implemented yet".to_string(),
        ))
    }

    /// Runs `script` against `database` through mongosh. `uri` connects
    /// with credentials and is handed over in the environment, never on the
    /// command line.
    #[allow(clippy::too_many_arguments)]
    pub async fn run_script(
        &self,
        uri: String,
        database: String,
        script: String,
        options: MongoshRunOptions,
        timeout_ms: Option<u64>,
        cancel: CancelToken,
        on_log: impl Fn(String) + Send + Sync + 'static,
    ) -> AppResult<ScriptResult> {
        let _ = (uri, database, script, options, timeout_ms, cancel, on_log);
        Err(AppError::InvalidInput(
            "the mongosh engine is not implemented yet".to_string(),
        ))
    }
}
