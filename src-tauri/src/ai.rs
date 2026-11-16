use serde_json::{json, Value};

pub fn validate_api_url(url: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(url).map_err(|_| "API 地址无效")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || (url.scheme() == "http" && local))
        || !url.username().is_empty() || url.password().is_some()
    {
        return Err("API 必须使用 HTTPS；本机服务可使用 HTTP".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn request_ai(url: String, api_key: String, body: Value) -> Result<Value, String> {
    let url = validate_api_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "无法创建网络连接")?;
    let response = client.post(url).bearer_auth(api_key).json(&body).send().await
        .map_err(|e| if e.is_timeout() { "AI 请求超时，请重试" } else { "无法连接 AI 服务，请检查 API 地址与网络" })?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|_| "无法读取 AI 响应")?;
    Ok(json!({ "status": status, "body": text }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn api_transport_requires_tls_except_localhost() {
        assert!(validate_api_url("https://example.com/v1/chat/completions").is_ok());
        assert!(validate_api_url("http://127.0.0.1:9999/v1/chat/completions").is_ok());
        assert!(validate_api_url("http://example.com/v1").is_err());
        assert!(validate_api_url("file:///etc/passwd").is_err());
        assert!(validate_api_url("https://user:password@example.com").is_err());
    }
}
