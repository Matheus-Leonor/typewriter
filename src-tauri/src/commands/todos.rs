use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Debug)]
pub struct Todo {
    pub id: String,
    pub list_id: Option<String>,
    pub session_id: Option<String>,
    pub title: String,
    pub done: bool,
    pub priority: i64,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TodoList {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub todos: Vec<Todo>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn row_to_todo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
    Ok(Todo {
        id: row.get(0)?,
        list_id: row.get(1)?,
        session_id: row.get(2)?,
        title: row.get(3)?,
        done: row.get::<_, i64>(4)? != 0,
        priority: row.get(5)?,
        created_at: row.get(6)?,
        completed_at: row.get(7)?,
    })
}

fn select_todos_for_list(conn: &Connection, list_id: &str) -> Result<Vec<Todo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, list_id, session_id, title, done, priority, created_at, completed_at \
             FROM todos WHERE list_id = ?1 ORDER BY priority DESC, created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([list_id], row_to_todo)
        .map_err(|e| e.to_string())?;
    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()
}

fn select_todo_list(conn: &Connection, id: &str) -> Result<TodoList, String> {
    let (id, title, created_at, updated_at, completed_at): (String, String, i64, i64, Option<i64>) =
        conn.query_row(
            "SELECT id, title, created_at, updated_at, completed_at FROM todo_lists WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    let todos = select_todos_for_list(conn, &id)?;
    Ok(TodoList {
        id,
        title,
        created_at,
        updated_at,
        completed_at,
        todos,
    })
}

fn sync_list_completion(conn: &Connection, list_id: &str) -> Result<(), String> {
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM todos WHERE list_id = ?1",
            [list_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let done: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM todos WHERE list_id = ?1 AND done = 1",
            [list_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let completed_at = if total > 0 && total == done {
        Some(now_ms())
    } else {
        None
    };
    conn.execute(
        "UPDATE todo_lists SET updated_at = ?2, completed_at = ?3 WHERE id = ?1",
        params![list_id, now_ms(), completed_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_todo_list(
    state: State<'_, DbState>,
    id: String,
    title: String,
) -> Result<TodoList, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    conn.execute(
        "INSERT INTO todo_lists (id, title, created_at, updated_at, completed_at) \
         VALUES (?1, ?2, ?3, ?3, NULL)",
        params![id, title, ts],
    )
    .map_err(|e| e.to_string())?;
    select_todo_list(&conn, &id)
}

#[tauri::command]
pub fn update_todo_list_title(
    state: State<'_, DbState>,
    id: String,
    title: String,
) -> Result<TodoList, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE todo_lists SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, title, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    select_todo_list(&conn, &id)
}

#[tauri::command]
pub fn list_todo_lists(state: State<'_, DbState>) -> Result<Vec<TodoList>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at, completed_at \
             FROM todo_lists ORDER BY completed_at IS NOT NULL ASC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut lists = Vec::new();
    for row in rows {
        let (id, title, created_at, updated_at, completed_at) = row.map_err(|e| e.to_string())?;
        let todos = select_todos_for_list(&conn, &id)?;
        lists.push(TodoList {
            id,
            title,
            created_at,
            updated_at,
            completed_at,
            todos,
        });
    }
    Ok(lists)
}

#[tauri::command]
pub fn create_todo(
    state: State<'_, DbState>,
    id: String,
    title: String,
    session_id: Option<String>,
    priority: Option<i64>,
    list_id: Option<String>,
) -> Result<Todo, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let ts = now_ms();
    let prio = priority.unwrap_or(0);
    conn.execute(
        "INSERT INTO todos (id, list_id, session_id, title, done, priority, created_at, completed_at) \
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, NULL)",
        params![id, list_id, session_id, title, prio, ts],
    )
    .map_err(|e| e.to_string())?;
    if let Some(ref list_id) = list_id {
        sync_list_completion(&conn, list_id)?;
    }
    conn.query_row(
        "SELECT id, list_id, session_id, title, done, priority, created_at, completed_at \
         FROM todos WHERE id = ?1",
        [&id],
        row_to_todo,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_todo_title(
    state: State<'_, DbState>,
    id: String,
    title: String,
) -> Result<Todo, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE todos SET title = ?2 WHERE id = ?1",
        params![id, title],
    )
    .map_err(|e| e.to_string())?;
    let todo = conn
        .query_row(
            "SELECT id, list_id, session_id, title, done, priority, created_at, completed_at \
             FROM todos WHERE id = ?1",
            [&id],
            row_to_todo,
        )
        .map_err(|e| e.to_string())?;
    if let Some(ref list_id) = todo.list_id {
        sync_list_completion(&conn, list_id)?;
    }
    Ok(todo)
}

#[tauri::command]
pub fn toggle_todo(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = now_ms();
    conn.execute(
        "UPDATE todos SET \
            done = CASE WHEN done = 0 THEN 1 ELSE 0 END, \
            completed_at = CASE WHEN done = 0 THEN ?2 ELSE NULL END \
         WHERE id = ?1",
        params![id, now],
    )
    .map_err(|e| e.to_string())?;
    let list_id = conn
        .query_row("SELECT list_id FROM todos WHERE id = ?1", [&id], |row| {
            row.get::<_, Option<String>>(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if let Some(list_id) = list_id {
        sync_list_completion(&conn, &list_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_todo_list(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM todos WHERE list_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM todo_lists WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_todos(
    state: State<'_, DbState>,
    session_id: Option<String>,
) -> Result<Vec<Todo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = if session_id.is_some() {
        conn.prepare(
            "SELECT id, list_id, session_id, title, done, priority, created_at, completed_at \
             FROM todos WHERE session_id = ?1 ORDER BY priority DESC, created_at ASC",
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.prepare(
            "SELECT id, list_id, session_id, title, done, priority, created_at, completed_at \
             FROM todos ORDER BY priority DESC, created_at ASC",
        )
        .map_err(|e| e.to_string())?
    };

    let rows = if let Some(sid) = session_id {
        stmt.query_map([sid], row_to_todo)
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map([], row_to_todo).map_err(|e| e.to_string())?
    };

    rows.map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()
}
