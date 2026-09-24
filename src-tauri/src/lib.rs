mod commands;
mod connection;
mod connections_io;
mod driver;
mod ejson;
mod error;
mod export;
mod models;
mod saved_scripts;
mod scripting;
mod secrets;
mod ssh_tunnel;
mod state;

use tauri::Manager;

use saved_scripts::SavedScriptsStore;
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
            let scripts = SavedScriptsStore::load(&config_dir, &app.path().home_dir()?)
                .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            app.manage(scripts);
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
            commands::update_field,
            commands::count_documents,
            commands::run_script,
            commands::cancel_script,
            commands::export_to_csv,
            commands::cancel_export,
            commands::list_index_stats,
            commands::explain_query,
            commands::export_connections,
            commands::import_connections,
            commands::suggest_script_path,
            commands::save_script,
            commands::list_saved_scripts,
            commands::read_saved_script,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
