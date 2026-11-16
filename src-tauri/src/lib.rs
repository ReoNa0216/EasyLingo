mod ai;
mod database;
mod people_news;
use serde_json::json;

fn news_request_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "连接新闻网站超时，请检查网络或系统代理设置".into()
    } else if error.is_connect() {
        "无法连接新闻网站，请检查网络或系统代理设置".into()
    } else {
        format!("新闻请求失败：{}", error)
    }
}

fn news_status_error(status: reqwest::StatusCode) -> String {
    if status == reqwest::StatusCode::FORBIDDEN {
        "来源网站拒绝当前请求（HTTP 403），请检查该网站在当前网络下是否可访问".into()
    } else {
        format!("新闻网站返回 HTTP {}", status)
    }
}

/// 获取新闻 RSS Feed
#[tauri::command]
async fn fetch_news_rss(source: String, category: String) -> Result<String, String> {
    let url = match source.as_str() {
        "bbc" => {
            let cat = if category.is_empty() { "world" } else { &category };
            format!("https://feeds.bbci.co.uk/news/{}/rss.xml", cat)
        }
        "guardian" => {
            let cat = if category.is_empty() { "world" } else { &category };
            format!("https://www.theguardian.com/{}/rss", cat)
        }
        "npr" => {
            let map = match category.as_str() {
                "world" => "1004",
                "usa" => "1003",
                "business" => "1006",
                "science" => "1007",
                "health" => "1128",
                "tech" => "1019",
                _ => "1001",
            };
            format!("https://feeds.npr.org/{}/rss.xml", map)
        }
        "zdf" => "https://www.zdfheute.de/rss/zdf/nachrichten".to_string(),
        _ => return Err(format!("Unknown news source: {}", source)),
    };

    fetch_news_text(&url).await
}

#[tauri::command]
async fn fetch_people_news() -> Result<Vec<people_news::Article>, String> {
    people_news::parse_list(&fetch_news_text(people_news::LIST_URL).await?)
}

async fn fetch_news_text(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(url).send().await.map_err(news_request_error)?;
    if !response.status().is_success() {
        return Err(news_status_error(response.status()));
    }
    response.text().await.map_err(|e| e.to_string())
}

/// 获取新闻文章正文（解析 HTML）
#[tauri::command]
async fn fetch_news_article(source: String, url: String, category: String) -> Result<serde_json::Value, String> {
    let _ = category;
    let url = if source == "people" {
        people_news::article_url(&url).ok_or("人民网文章地址无效")?.to_string()
    } else { url };
    let html = fetch_news_text(&url).await?;
    let document = scraper::Html::parse_document(&html);

    // 提取标题
    let title = {
        let mut t = String::new();
        let selectors = [
            "h1",
            "meta[property='og:title']",
            "meta[name='twitter:title']",
        ];
        for s in selectors {
            if let Ok(sel) = scraper::Selector::parse(s) {
                if let Some(el) = document.select(&sel).next() {
                    if s.starts_with("meta") {
                        if let Some(v) = el.value().attr("content") {
                            t = v.to_string();
                            break;
                        }
                    } else {
                        t = el.text().collect::<Vec<_>>().join("").trim().to_string();
                        if !t.is_empty() {
                            break;
                        }
                    }
                }
            }
        }
        t
    };

    // 按 source 选择内容提取器
    let content = match source.as_str() {
        "bbc" => {
            // BBC 使用多个可能的选择器，尝试获取最完整的内容
            let content = extract_content(&document, &[
                "article[data-component='text-block'] p",
                "[data-testid='card-text'] p",
                ".ssrcss-1q0x1qg-Paragraph p",
                ".ssrcss-1q0x1qg-Paragraph",
                ".ssrcss-18snukc-Paragraph",
                "article p",
                "[data-component='text-block']",
                ".lx-stream-post-body p",
                "main[role='main'] p",
                "#main-content p",
                ".article-body p",
            ]);
            // 如果内容太短，尝试获取页面主要文本内容
            if content.len() < 500 {
                let fallback = extract_content(&document, &[
                    "main p",
                    "article p",
                    ".content p",
                    "body p",
                ]);
                if fallback.len() > content.len() {
                    fallback
                } else {
                    content
                }
            } else {
                content
            }
        }
        "guardian" => extract_content(&document, &[
            ".article-body p",
            "#maincontent p",
            "article p",
            ".content__article-body p",
        ]),
        "npr" => extract_content(&document, &[
            "#storytext p",
            ".storytext p",
            "article p",
            ".transcript p",
            "[data-testid='paragraph']",
        ]),
        "zdf" => extract_content(&document, &[
            ".zdfplayer-teaser-title",
            ".zdfplayer-teaser-text",
            "article p",
            ".article-content p",
            ".content p",
            "main p",
            ".body-text p",
        ]),
        "people" => people_news::article_text(&document)?,
        _ => extract_content(&document, &["article p", ".content p", "main p", ".body-text p"]),
    };

    let mut content = content;
    if source != "people" && content.len() < 100 {
        // 尝试从 meta 取摘要
        let selectors = [
            "meta[name='description']",
            "meta[property='og:description']",
        ];
        for s in selectors {
            if let Ok(sel) = scraper::Selector::parse(s) {
                if let Some(el) = document.select(&sel).next() {
                    if let Some(v) = el.value().attr("content") {
                        content = v.to_string();
                        break;
                    }
                }
            }
        }
    }

    Ok(json!({
        "title": title,
        "content": content.chars().take(5000).collect::<String>(),
        "source": if source == "people" { "人民网日语版" } else { &source },
    }))
}

fn extract_content(document: &scraper::Html, selectors: &[&str]) -> String {
    for s in selectors {
        if let Ok(sel) = scraper::Selector::parse(s) {
            let texts: Vec<String> = document
                .select(&sel)
                .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
                .filter(|t| !t.is_empty())
                .collect();
            let joined = texts.join("\n\n");
            if joined.len() > 200 {
                return joined;
            }
        }
    }
    String::new()
}

/// 确保目录存在，不存在则创建
#[tauri::command]
async fn ensure_dir(path: String) -> Result<(), String> {
    use std::fs;
    if !std::path::Path::new(&path).exists() {
        fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(())
}

/// 检查路径是否存在
#[tauri::command]
async fn path_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            database::database_batch,
            ai::request_ai,
            fetch_news_rss,
            fetch_people_news,
            fetch_news_article,
            ensure_dir,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
