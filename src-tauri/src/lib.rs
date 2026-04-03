use serde_json::json;

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
        "zdf" => "https://www.zdf.de/rss/zdf/nachrichten".to_string(),
        "asahi" => "https://rss.asahi.com/rss/asahi/newsheadlines.rdf".to_string(),
        _ => return Err(format!("Unknown news source: {}", source)),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    response.text().await.map_err(|e| e.to_string())
}

/// 获取新闻文章正文（解析 HTML）
#[tauri::command]
async fn fetch_news_article(source: String, url: String, _category: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
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
        "bbc" => extract_content(&document, &[
            "article[data-component='text-block'] p",
            "[data-testid='card-text'] p",
            ".ssrcss-1q0x1qg-Paragraph p",
            ".ssrcss-1q0x1qg-Paragraph",
            "article p",
            "[data-component='text-block'] p",
            ".lx-stream-post-body p",
        ]),
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
        "asahi" => extract_asahi(&document),
        _ => extract_content(&document, &["article p", ".content p", "main p", ".body-text p"]),
    };

    let mut content = content;
    if content.len() < 100 {
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
        "source": source,
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

fn extract_asahi(document: &scraper::Html) -> String {
    let selectors = [
        ".article__content p",
        ".ArticleBody p",
        "[data-uuid] p",
        ".article_body p",
        ".article p",
        "article p",
        ".main p",
        ".content p",
        ".main-content p",
        ".article-text p",
        "#article-body p",
        ".story p",
        ".news p",
    ];
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
    // fallback: find div with most paragraphs
    if let Ok(div_sel) = scraper::Selector::parse("div") {
        let mut best = String::new();
        let mut max_p = 0usize;
        for div in document.select(&div_sel) {
            if let Ok(p_sel) = scraper::Selector::parse("p") {
                let p_count = div.select(&p_sel).count();
                if p_count > max_p {
                    max_p = p_count;
                    best = div
                        .select(&p_sel)
                        .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
                        .filter(|t| !t.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n\n");
                }
            }
        }
        if !best.is_empty() {
            return best;
        }
    }
    String::new()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            fetch_news_rss,
            fetch_news_article
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
