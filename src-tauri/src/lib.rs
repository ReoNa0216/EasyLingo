use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn fetch_news_rss(_source: String) -> Result<String, String> {
    // TODO: Implement news fetching
    Ok("News fetching will be implemented soon".to_string())
}

#[tauri::command]
async fn fetch_article_content(_url: String) -> Result<String, String> {
    // TODO: Implement article fetching
    Ok("Article fetching will be implemented soon".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            fetch_news_rss,
            fetch_article_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
