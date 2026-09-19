mod commands;
mod connection;
mod driver;
mod ejson;
mod error;
mod export;
mod models;
mod scripting;
mod secrets;
mod ssh_tunnel;
mod state;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let state = AppState::init(&config_dir)
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_connection_profiles,
            commands::get_connection_profile,
            commands::save_connection_profile,
            commands::delete_connection_profile,
            commands::test_connection,
            commands::connect,
            commands::disconnect,
            commands::secret_backend_info,
            commands::list_databases,
            commands::list_collections,
            commands::get_collection_stats,
            commands::run_find,
            commands::run_aggregate,
            commands::count_documents,
            commands::run_script,
            commands::cancel_script,
            commands::export_to_csv,
            commands::cancel_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
