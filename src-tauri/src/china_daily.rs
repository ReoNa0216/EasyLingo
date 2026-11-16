use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::HashSet;

pub const LIST_URL: &str = "https://www.chinadaily.com.cn/china/59b8d010a3108c54ed7dfc23";

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
        || url.host_str() != Some("www.chinadaily.com.cn")
        || !url.username().is_empty()
        || url.password().is_some()
        || !url.path().starts_with("/a/")
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
    let row = Selector::parse(".Buss_List_Txt").unwrap();
    let link = Selector::parse("h4 a[href]").unwrap();
    let time = Selector::parse("h5").unwrap();
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
        return Err("未找到 China Daily 英语文章，来源页面结构可能已变化".into());
    }
    Ok(articles)
}

pub fn article_text(document: &Html) -> Result<String, String> {
    let paragraphs = Selector::parse("#Content > p").unwrap();
    let text = document
        .select(&paragraphs)
        .map(|el| el.text().collect::<String>().trim().to_owned())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        return Err("未找到 China Daily 文章正文，来源页面结构可能已变化".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_keeps_dated_news_and_rejects_navigation_duplicates_and_external_links() {
        let html = r#"<h4><a href="/a/202611/16/nav.html">Navigation</a></h4>
          <div class="Buss_List_Txt"><h4><a href="//www.chinadaily.com.cn/a/202611/16/WS1.html">Science &amp; culture</a></h4><h5>2026-11-16 10:22</h5></div>
          <div class="Buss_List_Txt"><h4><a href="http://www.chinadaily.com.cn/a/202611/16/WS1.html">Duplicate</a></h4></div>
          <div class="Buss_List_Txt"><h4><a href="https://example.com/a/x.html">External</a></h4></div>"#;
        let articles = parse_list(html).unwrap();
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Science & culture");
        assert_eq!(
            articles[0].link,
            "https://www.chinadaily.com.cn/a/202611/16/WS1.html"
        );
        assert_eq!(articles[0].pub_date, "2026-11-16T10:22");
        assert!(article_url("https://user@www.chinadaily.com.cn/a/x.html").is_none());
        assert!(article_url("javascript:alert(1)").is_none());
        assert!(parse_list("<p>Access denied</p>").is_err());
    }

    #[test]
    fn body_preserves_short_text_without_captions_related_links_or_meta_summary() {
        let html = r#"<meta name="description" content="Summary"><p>Navigation</p><div id="Content">
          <figure><img src="x"><figcaption>Image caption</figcaption></figure>
          <p>A short English article.</p><p>Second <strong>paragraph</strong>.</p>
          <div class="related"><p>Related article</p></div></div><p>Footer</p>"#;
        assert_eq!(
            article_text(&Html::parse_document(html)).unwrap(),
            "A short English article.\n\nSecond paragraph."
        );
        assert!(article_text(&Html::parse_document("<p>Access denied</p>")).is_err());
    }
}
