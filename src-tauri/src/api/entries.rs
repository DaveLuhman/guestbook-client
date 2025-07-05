use tauri_plugin_http::reqwest;
use crate::config::config_manager::{ConfigManager, get_full_config};
use serde_json::json; // Add this import for the `json!` macro
use chrono::Utc;

pub async fn submit_entry(config_manager: tauri::State<'_, ConfigManager>, card_data: String) -> Result<(), String> {
    let config = get_full_config(config_manager.clone());
    let submit_url = format!("{}/entries", config.server_url.clone().unwrap());
    let client = reqwest::Client::new();
    let response = client.post(submit_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.server_token.clone().unwrap()))
        .body(
            serde_json::to_string(&json!({
                "device_id": config.device_id,
                "entry": card_data,
                "timestamp": Utc::now().to_rfc3339(),
            })).unwrap()
        )
        .send()
        .await;
    if response.is_err() {
        return Err(response.err().unwrap().to_string());
    }
    let body = response.unwrap().text().await.unwrap();
    Ok(())
}