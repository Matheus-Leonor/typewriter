mod commands;
mod db;

use std::sync::Mutex;
use tauri::Manager;

pub struct WatcherState(pub Mutex<Option<notify::RecommendedWatcher>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_state = db::init(app).expect("failed to initialize database");
            app.manage(db_state);
            app.manage(WatcherState(Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::create_session,
            commands::sessions::get_session,
            commands::sessions::update_session,
            commands::sessions::list_sessions,
            commands::sessions::search_sessions,
            commands::sessions::delete_session,
            commands::todos::create_todo_list,
            commands::todos::update_todo_list_title,
            commands::todos::list_todo_lists,
            commands::todos::create_todo,
            commands::todos::update_todo_title,
            commands::todos::toggle_todo,
            commands::todos::list_todos,
            commands::todos::delete_todo_list,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::vault::pick_folder,
            commands::vault::pick_file,
            commands::fs::list_dir,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_note,
            commands::fs::create_folder,
            commands::fs::rename_entry,
            commands::fs::delete_entry,
            commands::fs::duplicate_note,
            commands::fs::watch_vault,
            commands::fs::ensure_agent_workspace,
            commands::fs::list_vault_directory,
            commands::fs::read_vault_file,
            commands::injection::inject_agent_file,
            commands::injection::save_injection_history,
            commands::injection::get_recent_inject_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
