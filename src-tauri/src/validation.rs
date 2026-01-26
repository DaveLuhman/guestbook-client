//! URL validation and sanitization for server configuration.

use once_cell::sync::Lazy;
use regex::Regex;
use url::Url;

static EVENT_HANDLER_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"on\w+\s*=").expect("valid regex"));

/// Validates and sanitizes a server URL to prevent code injection and ensure it's a valid URL.
/// Returns the sanitized URL or an error message.
pub fn validate_and_sanitize_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("Server URL is required".to_string());
    }

    let dangerous_patterns = [
        "javascript:",
        "data:",
        "vbscript:",
        "<script",
        "</script>",
        "<iframe",
        "<object",
        "<embed",
        "eval(",
        "expression(",
    ];

    let url_lower = trimmed.to_lowercase();
    if dangerous_patterns.iter().any(|p| url_lower.contains(p)) {
        return Err("Invalid URL: contains potentially dangerous content".to_string());
    }

    if EVENT_HANDLER_RE.is_match(trimmed) {
        return Err("Invalid URL: contains event handler patterns".to_string());
    }

    // If the input parses as a URL with a non-http(s) scheme, reject before prepending http://
    if let Ok(trial) = Url::parse(trimmed) {
        match trial.scheme() {
            "http" | "https" => {}
            _ => return Err("Only http:// and https:// URLs are allowed".to_string()),
        }
    }

    let url_to_parse = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        format!("http://{}", trimmed)
    } else {
        trimmed.to_string()
    };

    let parsed = Url::parse(&url_to_parse)
        .map_err(|e| format!("Invalid URL format: {}", e))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http:// and https:// URLs are allowed".to_string()),
    }

    if parsed.host().is_none() {
        return Err("URL must include a valid hostname".to_string());
    }

    let port = parsed.port();
    let scheme = parsed.scheme();
    let host = parsed.host_str().ok_or_else(|| "Invalid host".to_string())?;
    let mut path = parsed.path().to_string();
    let query = parsed.query();
    let fragment = parsed.fragment();

    if path != "/" {
        path = path.trim_end_matches('/').to_string();
    }

    let mut result = format!("{}://{}", scheme, host);
    if let Some(port_num) = port {
        result.push_str(&format!(":{}", port_num));
    }
    // For path "/": only append "/" if the original input had a trailing slash (root path preserved)
    if path == "/" && !trimmed.ends_with('/') {
        path = String::new();
    }
    result.push_str(&path);
    if let Some(q) = query {
        result.push('?');
        result.push_str(q);
    }
    if let Some(f) = fragment {
        result.push('#');
        result.push_str(f);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_and_sanitize_url_unit_empty_err() {
        assert!(validate_and_sanitize_url("").is_err());
        assert!(validate_and_sanitize_url("   ").is_err());
    }

    #[test]
    fn validate_and_sanitize_url_unit_dangerous_err() {
        assert!(validate_and_sanitize_url("javascript:alert(1)").is_err());
        assert!(validate_and_sanitize_url("data:text/html,<script>").is_err());
        assert!(validate_and_sanitize_url("https://evil.com/<script>x</script>").is_err());
    }

    #[test]
    fn validate_and_sanitize_url_unit_http_ok() {
        let r = validate_and_sanitize_url("http://host").unwrap();
        assert_eq!(r, "http://host");
    }

    #[test]
    fn validate_and_sanitize_url_unit_https_path_ok_trailing_slash_trimmed() {
        let r = validate_and_sanitize_url("https://host/path/").unwrap();
        assert_eq!(r, "https://host/path");
    }

    #[test]
    fn validate_and_sanitize_url_unit_missing_scheme_gets_http() {
        let r = validate_and_sanitize_url("example.com").unwrap();
        assert_eq!(r, "http://example.com");
    }

    #[test]
    fn validate_and_sanitize_url_unit_root_path_preserved() {
        let r = validate_and_sanitize_url("http://host/").unwrap();
        assert_eq!(r, "http://host/");
    }

    #[test]
    fn validate_and_sanitize_url_unit_invalid_host_err() {
        assert!(validate_and_sanitize_url("http://").is_err());
    }

    #[test]
    fn validate_and_sanitize_url_unit_wrong_scheme_err() {
        assert!(validate_and_sanitize_url("ftp://host").is_err());
    }
}
