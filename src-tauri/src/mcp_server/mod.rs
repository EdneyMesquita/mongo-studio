//! The MCP server for AI clients on this machine (Claude Code, Cursor,
//! Codex, VS Code...): streamable HTTP on 127.0.0.1 at a fixed port, one
//! bearer token kept in the secret store, and tools that browse and change
//! the user's saved connections within the grants set in Settings. Off until
//! the user turns it on. Separate from the Assistant's own read-only server
//! in `assistant::mcp`, which serves only the app's Assistant sessions.

// Scaffold: removed once the module is implemented.
#![allow(dead_code)]

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const REQUEST_EVENT: &str = "mcp-request";
pub const REQUEST_CLOSED_EVENT: &str = "mcp-request-closed";
pub const ACTIVITY_EVENT: &str = "mcp-activity";
pub const STATUS_EVENT: &str = "mcp-status";

/// Off, ask the user each time, or allow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Policy {
    #[default]
    Off,
    Ask,
    Allow,
}

/// What a client may do on one saved connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    #[default]
    None,
    Read,
    Write,
}

/// The settings the frontend pushes: whether the server runs, where, and
/// what clients may do. Capability ids: browse, read, write, ddl, script,
/// connList, connEdit, connDelete, saveScript.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    pub enabled: bool,
    pub port: u16,
    #[serde(default)]
    pub caps: HashMap<String, Policy>,
    /// Per saved connection id; a connection missing here is `None`.
    #[serde(default)]
    pub connections: HashMap<String, Level>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpClient {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    /// Milliseconds since the Unix epoch.
    pub connected_at: u64,
    pub last_seen: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
    /// Why it isn't running when it should (e.g. the port is taken).
    pub error: Option<String>,
    pub clients: Vec<McpClient>,
}

/// An AI client the server can be added to with one click.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientTarget {
    /// claude | cursor | codex | vscode | windsurf
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub registered: bool,
    /// The file the entry lives in, shown to the user.
    pub config_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RequestChoice {
    Once,
    Always,
    Deny,
}

#[derive(Clone)]
pub struct McpServer {
    app: tauri::AppHandle,
}

impl McpServer {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    /// Applies new settings: starts, stops or restarts the listener.
    pub async fn set_config(&self, config: McpConfig) -> AppResult<McpStatus> {
        let _ = config;
        Ok(self.status())
    }

    pub fn status(&self) -> McpStatus {
        let _ = &self.app;
        McpStatus::default()
    }

    pub fn token(&self) -> AppResult<String> {
        Err(AppError::InvalidInput("not implemented yet".to_string()))
    }

    pub fn regenerate_token(&self) -> AppResult<String> {
        Err(AppError::InvalidInput("not implemented yet".to_string()))
    }

    pub fn answer(&self, request_id: &str, choice: RequestChoice) -> AppResult<()> {
        let _ = (request_id, choice);
        Err(AppError::InvalidInput("not implemented yet".to_string()))
    }

    pub fn disconnect_client(&self, client_id: &str) -> AppResult<()> {
        let _ = client_id;
        Ok(())
    }

    pub async fn client_targets(&self) -> Vec<ClientTarget> {
        Vec::new()
    }

    pub async fn register_client(&self, id: &str) -> AppResult<ClientTarget> {
        let _ = id;
        Err(AppError::InvalidInput("not implemented yet".to_string()))
    }

    pub async fn unregister_client(&self, id: &str) -> AppResult<ClientTarget> {
        let _ = id;
        Err(AppError::InvalidInput("not implemented yet".to_string()))
    }
}
