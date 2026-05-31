use crate::db::DbState;
use rusqlite::params;
use serde::Deserialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
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
    mode: String,
) -> Result<(), String> {
    let trimmed_name = filename.trim();
    if trimmed_name.is_empty()
        || trimmed_name == "."
        || trimmed_name == ".."
        || trimmed_name.contains('/')
        || trimmed_name.contains('\\')
        || trimmed_name
            .chars()
            .any(|c| c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
    {
        return Err("nome de arquivo inválido".into());
    }

    let trimmed_target = target_path.trim();
    if trimmed_target.is_empty() || trimmed_target.chars().any(|c| c.is_control()) {
        return Err("diretório destino inválido".into());
    }

    let target = Path::new(trimmed_target);
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    let dest = target.join(trimmed_name);

    match mode.as_str() {
        "create" => {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&dest)
                .map_err(|e| e.to_string())?;
            file.write_all(content.as_bytes()).map_err(|e| e.to_string())
        }
        "overwrite" => fs::write(&dest, content).map_err(|e| e.to_string()),
        "append" => {
            let needs_separator = dest.metadata().map(|m| m.len() > 0).unwrap_or(false);
            let mut file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&dest)
                .map_err(|e| e.to_string())?;
            if needs_separator {
                file.write_all(b"\n").map_err(|e| e.to_string())?;
            }
            file.write_all(content.as_bytes()).map_err(|e| e.to_string())
        }
        _ => Err("modo de injeção inválido".into()),
    }
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
