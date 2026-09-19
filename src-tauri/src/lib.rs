mod commands;
mod connection;
mod driver;
mod error;
mod models;
mod secrets;
mod ssh_tunnel;
mod state;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
