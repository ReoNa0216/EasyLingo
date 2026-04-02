use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

/// 读取文件内容为字节数组
#[tauri::command]
async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// 读取文件内容为文本
#[tauri::command]
async fn read_file_text(path: String) -> Result<String, String> {
    use std::fs;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// 获取文件信息
#[tauri::command]
async fn get_file_info(path: String) -> Result<serde_json::Value, String> {
    use std::fs;
    use std::path::Path;
    
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let path_obj = Path::new(&path);
    
    let file_name = path_obj.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    let extension = path_obj.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    Ok(serde_json::json!({
        "name": file_name,
        "extension": extension,
        "size": metadata.len(),
        "path": path
    }))
}

/// 获取新闻 RSS
#[tauri::command]
async fn fetch_news_rss(source: String) -> Result<String, String> {
    let url = match source.as_str() {
        "bbc" => "https://feeds.bbci.co.uk/news/rss.xml",
        "guardian" => "https://www.theguardian.com/uk/rss",
        "npr" => "https://feeds.npr.org/1001/rss.xml",
        "zdf" => "https://www.zdf.de/rss/zdf/nachrichten",
        "asahi" => "https://www.asahi.com/rss/asahi/newsheadlines.rdf",
        _ => return Err(format!("Unknown news source: {}", source)),
    };
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("EasyLingo/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

/// 获取文章内容
#[tauri::command]
async fn fetch_article_content(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_file_bytes,
            read_file_text,
            get_file_info,
            fetch_news_rss,
            fetch_article_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
