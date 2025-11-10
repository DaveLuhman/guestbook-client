use crate::config::config_manager::{get_full_config, ConfigManager};
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
    let config = get_full_config(config_manager.clone());
    let submit_url = format!("{}/entries/submit", config.server_url.clone().unwrap());

    // Create client with timeout configuration (10 seconds)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    log::info!("Submitting entry for onecard: {}", card_data.onecard);

    let response = client
        .post(&submit_url)
        .header("Content-Type", "application/json")
        .header(
            "Authorization",
            format!("Bearer {}", config.server_token.clone().unwrap()),
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
        Ok(r) => r,
        Err(e) => {
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
    log::info!("Entry submitted successfully for onecard: {}", card_data.onecard);
    println!("{}{}", card_data.onecard, Utc::now().to_rfc3339());
    Ok(())
}
