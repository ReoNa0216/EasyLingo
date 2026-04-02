#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get(url)
        .header("User-Agent", "EasyLingo/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

#[tauri::command]
async fn fetch_article_content(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            fetch_news_rss,
            fetch_article_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
