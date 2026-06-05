use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Serialize, Deserialize, Debug)]
pub struct ComposeDefault {
    pub id: String,
    pub titulo: String,
    pub content: String,
    pub category: String,
    pub tipo: String,
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug)]
pub struct ComposeDefaultInput {
    pub id: String,
    pub titulo: String,
    pub content: String,
    pub category: String,
    pub tipo: String,
    pub metadata: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub fn save_compose_default(
    state: State<'_, DbState>,
    entry: ComposeDefaultInput,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "INSERT INTO compose_defaults \
         (id, titulo, content, category, tipo, metadata, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) \
         ON CONFLICT(id) DO UPDATE SET \
         titulo = ?2, content = ?3, category = ?4, tipo = ?5, metadata = ?6, updated_at = ?7",
        params![
            entry.id,
            entry.titulo,
            entry.content,
            entry.category,
            entry.tipo,
            entry.metadata,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_compose_defaults(state: State<'_, DbState>) -> Result<Vec<ComposeDefault>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, titulo, content, category, tipo, metadata, created_at, updated_at \
             FROM compose_defaults ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ComposeDefault {
                id: row.get(0)?,
                titulo: row.get(1)?,
                content: row.get(2)?,
                category: row.get(3)?,
                tipo: row.get(4)?,
                metadata: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()
}

#[tauri::command]
pub fn delete_compose_default(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM compose_defaults WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
