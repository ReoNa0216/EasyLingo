use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::HashSet;

pub const LIST_URL: &str = "https://j.people.com.cn/94765/index.html";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub title: String,
    pub link: String,
    pub pub_date: String,
}

pub fn article_url(link: &str) -> Option<reqwest::Url> {
    let mut url = reqwest::Url::parse(LIST_URL).ok()?.join(link).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str() != Some("j.people.com.cn")
        || !url.username().is_empty()
        || url.password().is_some()
        || !url.path().starts_with("/n3/")
        || !url.path().ends_with(".html")
    {
        return None;
    }
    url.set_scheme("https").ok()?;
    url.set_fragment(None);
    Some(url)
}

pub fn parse_list(html: &str) -> Result<Vec<Article>, String> {
    let document = Html::parse_document(html);
    let row = Selector::parse(".list").unwrap();
    let link = Selector::parse("h3.tit a[href]").unwrap();
    let time = Selector::parse(".time").unwrap();
    let mut seen = HashSet::new();
    let mut articles = Vec::new();
    for item in document.select(&row) {
        let Some(anchor) = item.select(&link).next() else {
            continue;
        };
        let Some(url) = anchor.value().attr("href").and_then(article_url) else {
            continue;
        };
        let title = anchor.text().collect::<String>().trim().to_owned();
        if title.is_empty() || !seen.insert(url.to_string()) {
            continue;
        }
        let pub_date = item
            .select(&time)
            .next()
            .map(|el| el.text().collect::<String>().trim().replace(' ', "T"))
            .unwrap_or_default();
        articles.push(Article {
            title,
            link: url.to_string(),
            pub_date,
        });
    }
    if articles.is_empty() {
        return Err("未找到人民网日语文章，来源页面结构可能已变化".into());
    }
    Ok(articles)
}

pub fn article_text(document: &Html) -> Result<String, String> {
    let paragraphs = Selector::parse(".j-d2txt > p").unwrap();
    let caption = Selector::parse("[desc]").unwrap();
    let text = document
        .select(&paragraphs)
        .filter(|el| el.select(&caption).next().is_none())
        .map(|el| el.text().collect::<String>().trim().to_owned())
        .filter(|text| !text.is_empty() && !text.starts_with("「人民網日本語版」"))
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        return Err("未找到人民网文章正文，来源页面结构可能已变化".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_keeps_news_links_and_dates_without_navigation_duplicates_or_foreign_hosts() {
        let html = r#"<a href="/n3/2026/1116/nav.html">Navigation</a>
          <div class="list"><h3 class="tit"><a href="http://j.people.com.cn/n3/2026/1116/c1-1.html">日本語 &amp; 科学</a></h3><span class="time">2026-11-16 09:30</span></div>
          <div class="list"><h3 class="tit"><a href="/n3/2026/1116/c1-1.html">Duplicate</a></h3></div>
          <div class="list"><h3 class="tit"><a href="https://example.com/n3/2026/x.html">External</a></h3></div>"#;
        let articles = parse_list(html).unwrap();
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "日本語 & 科学");
        assert_eq!(
            articles[0].link,
            "https://j.people.com.cn/n3/2026/1116/c1-1.html"
        );
        assert_eq!(articles[0].pub_date, "2026-11-16T09:30");
        assert!(article_url("https://user@j.people.com.cn/n3/x.html").is_none());
        assert!(article_url("javascript:alert(1)").is_none());
        assert!(parse_list("<p>Access denied</p>").is_err());
    }

    #[test]
    fn body_excludes_captions_related_links_and_footer_and_preserves_short_articles() {
        let html = r#"<p>Navigation</p><div class="j-d2txt">
          <p><span desc="desc">Image caption</span></p>
          <p>短い日本語の記事です。</p><p>本文の続きです。</p>
          <div class="related"><p>Related article</p></div>
          <p>「人民網日本語版」2026年11月16日</p></div><p>Footer</p>"#;
        assert_eq!(
            article_text(&Html::parse_document(html)).unwrap(),
            "短い日本語の記事です。\n\n本文の続きです。"
        );
        assert!(article_text(&Html::parse_document("<p>Access denied</p>")).is_err());
    }
}
