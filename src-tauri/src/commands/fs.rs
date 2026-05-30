use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified: u64,
    pub created: u64,
}

fn to_millis(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let mut result = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = meta.is_dir();
        if !is_dir && !name.ends_with(".md") {
            continue;
        }
        result.push(FsEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            modified: meta.modified().map(to_millis).unwrap_or(0),
            created: meta.created().map(to_millis).unwrap_or(0),
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_note(dir_path: String, name: String) -> Result<String, String> {
    let name = if name.ends_with(".md") {
        name
    } else {
        format!("{}.md", name)
    };
    let path = Path::new(&dir_path).join(&name);
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_folder(dir_path: String, name: String) -> Result<String, String> {
    let path = Path::new(&dir_path).join(&name);
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn duplicate_note(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let parent = p.parent().ok_or("sem diretório pai")?;
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("nome inválido")?;
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("md");

    let mut new_path = parent.join(format!("{} copy.{}", stem, ext));
    let mut counter = 2;
    while new_path.exists() {
        new_path = parent.join(format!("{} copy {}.{}", stem, counter, ext));
        counter += 1;
    }
    fs::copy(&path, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn watch_vault(
    path: String,
    app_handle: AppHandle,
    state: State<'_, crate::WatcherState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None; // drop previous watcher

    let app = app_handle.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<notify::Event>| {
            if res.is_ok() {
                app.emit("vault-changed", ()).ok();
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(path.as_ref(), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(watcher);
    Ok(())
}
