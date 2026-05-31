use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Debug)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub content: String,
    pub content_type: String,
    pub tags: String,
    pub word_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Deserialize, Debug)]
pub struct SessionPatch {
    pub title: Option<String>,
    pub content: Option<String>,
    pub content_type: Option<String>,
    pub tags: Option<String>,
    pub word_count: Option<i64>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        content_type: row.get(3)?,
        tags: row.get(4)?,
        word_count: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

#[tauri::command]
pub fn create_session(
    state: State<'_, DbState>,
    id: String,
    title: String,
    content_type: String,
) -> Result<Session, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "INSERT INTO sessions (id, title, content, content_type, tags, word_count, created_at, updated_at) \
         VALUES (?1, ?2, '', ?3, '[]', 0, ?4, ?4)",
        params![id, title, content_type, ts],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, title, content, content_type, tags, word_count, created_at, updated_at \
         FROM sessions WHERE id = ?1",
        [&id],
        row_to_session,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_session(state: State<'_, DbState>, id: String) -> Result<Option<Session>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    match conn.query_row(
        "SELECT id, title, content, content_type, tags, word_count, created_at, updated_at \
         FROM sessions WHERE id = ?1",
        [&id],
        row_to_session,
    ) {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn update_session(
    state: State<'_, DbState>,
    id: String,
    patch: SessionPatch,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "UPDATE sessions SET \
            title = COALESCE(?2, title), \
            content = COALESCE(?3, content), \
            content_type = COALESCE(?4, content_type), \
            tags = COALESCE(?5, tags), \
            word_count = COALESCE(?6, word_count), \
            updated_at = ?7 \
         WHERE id = ?1",
        params![
            id,
            patch.title,
            patch.content,
            patch.content_type,
            patch.tags,
            patch.word_count,
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_sessions(state: State<'_, DbState>) -> Result<Vec<Session>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, content_type, tags, word_count, created_at, updated_at \
             FROM sessions ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_session)
        .map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()
}

#[tauri::command]
pub fn search_sessions(state: State<'_, DbState>, query: String) -> Result<Vec<Session>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, content_type, tags, word_count, created_at, updated_at \
             FROM sessions WHERE title LIKE ?1 OR content LIKE ?1 ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&pattern], row_to_session)
        .map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()
}

#[tauri::command]
pub fn delete_session(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
