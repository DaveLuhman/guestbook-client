use crate::config::config_manager::ConfigManager;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json; // Add this import for the `json!` macro
use tauri_plugin_http::reqwest;

#[derive(Serialize, Deserialize, Clone)]
pub struct CardData {
    pub onecard: String,
    pub name: String,
}
pub async fn submit_entry(
    config_manager: tauri::State<'_, ConfigManager>,
    card_data: CardData,
) -> Result<(), String> {
    // #region agent log
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
        use std::io::Write;
        let log_entry = serde_json::json!({
            "location": "entries.rs:12",
            "message": "submit_entry entry",
            "data": {"onecard": card_data.onecard},
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "M"
        });
        let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
    }
    // #endregion
    let config = config_manager.get_config()?;

    // Validate required configuration fields
    let server_url = config.server_url.clone()
        .ok_or_else(|| "Server URL not configured. Please configure the server URL in settings.".to_string())?;
    let server_token = config.server_token.clone()
        .ok_or_else(|| "Server token not configured. Please configure the server token in settings.".to_string())?;

    let submit_url = format!("{}/entries/submit", server_url);

    // #region agent log
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
        use std::io::Write;
        let log_entry = serde_json::json!({
            "location": "entries.rs:24",
            "message": "About to create HTTP client and send request",
            "data": {"onecard": card_data.onecard, "submit_url": submit_url},
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "N"
        });
        let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
    }
    // #endregion

    // Create client with timeout configuration (10 seconds)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    log::info!("Submitting entry for onecard: {}", card_data.onecard);

    // #region agent log
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
        use std::io::Write;
        let log_entry = serde_json::json!({
            "location": "entries.rs:49",
            "message": "About to await HTTP send",
            "data": {"onecard": card_data.onecard},
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "O"
        });
        let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
    }
    // #endregion
    let response = client
        .post(&submit_url)
        .header("Content-Type", "application/json")
        .header(
            "Authorization",
            format!("Bearer {}", server_token),
        )
        .body(
            serde_json::to_string(&json!({
                "device_id": config.device_id,
                "guest": card_data.clone(),
                "timestamp": Utc::now().to_rfc3339(),
            }))
            .map_err(|e| format!("Failed to serialize request body: {}", e))?,
        )
        .send()
        .await;

    // Handle network errors (connection failures, timeouts, etc.)
    let response = match response {
        Ok(r) => {
            // #region agent log
            if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
                use std::io::Write;
                let log_entry = serde_json::json!({
                    "location": "entries.rs:53",
                    "message": "HTTP response received",
                    "data": {"onecard": card_data.onecard, "status": r.status().as_u16()},
                    "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "P"
                });
                let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
            }
            // #endregion
            r
        },
        Err(e) => {
            // #region agent log
            if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
                use std::io::Write;
                let log_entry = serde_json::json!({
                    "location": "entries.rs:55",
                    "message": "HTTP request failed",
                    "data": {"onecard": card_data.onecard, "error": format!("{}", e)},
                    "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "Q"
                });
                let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
            }
            // #endregion
            let error_msg = if e.is_timeout() {
                "Request Timeout - Please check network connection".to_string()
            } else if e.is_connect() {
                "Network Unreachable - Please check internet connection".to_string()
            } else {
                format!("Network Error - {}", e)
            };
            log::error!("Network error submitting entry: {}", error_msg);
            return Err(error_msg);
        }
    };

    // Check HTTP status code
    let status = response.status();
    // #region agent log
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
        use std::io::Write;
        let log_entry = serde_json::json!({
            "location": "entries.rs:69",
            "message": "Checking HTTP status",
            "data": {"onecard": card_data.onecard, "status": status.as_u16(), "is_success": status.is_success()},
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "R"
        });
        let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
    }
    // #endregion
    if !status.is_success() {
        // Try to extract error details from response body
        let error_body = response.text().await.unwrap_or_default();
        let error_msg = match status.as_u16() {
            401 | 403 => {
                log::error!("Authentication failed ({}): {}", status, error_body);
                "Authentication Failed - Please check device configuration".to_string()
            }
            404 => {
                log::error!("Server not found ({}): {}", status, error_body);
                "Server Not Found - Please verify server URL".to_string()
            }
            500 | 502 | 503 => {
                log::error!("Server error ({}): {}", status, error_body);
                "Server Error - Please try again or contact support".to_string()
            }
            400 => {
                log::error!("Bad request ({}): {}", status, error_body);
                format!("Invalid Request - {}", error_body)
            }
            _ => {
                log::error!("HTTP error ({}): {}", status, error_body);
                format!("Server returned error {} - Please try again", status)
            }
        };
        return Err(error_msg);
    }

    // Success - read response body (optional, but good for logging)
    let _body = response.text().await.unwrap_or_default();
    // #region agent log
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(".cursor/debug.log") {
        use std::io::Write;
        let log_entry = serde_json::json!({
            "location": "entries.rs:100",
            "message": "Entry submitted successfully",
            "data": {"onecard": card_data.onecard},
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "S"
        });
        let _ = writeln!(file, "{}", serde_json::to_string(&log_entry).unwrap_or_default());
    }
    // #endregion
    log::info!("Entry submitted successfully for onecard: {}", card_data.onecard);
    println!("{}{}", card_data.onecard, Utc::now().to_rfc3339());
    Ok(())
}
