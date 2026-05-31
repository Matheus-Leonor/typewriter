#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Selecionar pasta do vault")
        .pick_folder()
        .await;
    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn pick_file(vault_path: String) -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Selecionar nota destino")
        .set_directory(&vault_path)
        .add_filter("Markdown", &["md"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}
