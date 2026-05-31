use crate::db::DbState;
use rusqlite::params;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Deserialize, Debug)]
pub struct InjectionHistory {
    pub id: String,
    pub template_name: String,
    pub skills: String,
    pub docs: String,
    pub target_path: String,
    pub filename: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub fn inject_agent_file(
    target_path: String,
    content: String,
    filename: String,
) -> Result<(), String> {
    let safe_name = Path::new(&filename)
        .file_name()
        .ok_or("nome de arquivo inválido")?
        .to_os_string();
    let dest = Path::new(&target_path).join(safe_name);
    fs::write(&dest, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_injection_history(
    state: State<'_, DbState>,
    entry: InjectionHistory,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "INSERT INTO agent_injections \
         (id, template_name, skills, docs, target_path, filename, injected_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entry.id,
            entry.template_name,
            entry.skills,
            entry.docs,
            entry.target_path,
            entry.filename,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO recent_inject_paths (path, used_at) VALUES (?1, ?2) \
         ON CONFLICT(path) DO UPDATE SET used_at = ?2",
        params![entry.target_path, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_recent_inject_paths(
    state: State<'_, DbState>,
    limit: i32,
) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path FROM recent_inject_paths ORDER BY used_at DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()
}
