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
    let client = reqwest::Client::new();
    let response = client
        .post(submit_url)
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
            .unwrap(),
        )
        .send()
        .await;
    if response.is_err() {
        return Err(response.err().unwrap().to_string());
    }
    let body = response.unwrap().text().await.unwrap();
    println!("{}{}", card_data.onecard, Utc::now().to_rfc3339());
    Ok(())
}
