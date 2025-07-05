use tauri_plugin_http::reqwest;
use crate::config::config_manager::{ConfigManager, get_full_config};
use serde_json::json; // Add this import for the `json!` macro

pub async fn register_device(config_manager: tauri::State<'_, ConfigManager>) -> Result<(), String> {
    let config = get_full_config(config_manager.clone());
    let register_url = format!("{}/devices/register", config.server_url.clone().unwrap());
    let client = reqwest::Client::new();
    let response = client.post(register_url)
        .header("Content-Type", "application/json")
        .body(
            serde_json::to_string(&json!({
                "name": config.device_friendly_name,
                "location": config.device_location,
                "id": config.device_id,
            })).unwrap()
        )
        .send()
        .await;
    if response.is_err() {
        return Err(response.err().unwrap().to_string());
    }
    let body = response.unwrap().text().await.unwrap();
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;
    let token = json.get("token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Token not found in response".to_string())?
        .to_owned();
    config_manager.set_server_token(token.clone());
    Ok(())
}

pub async fn send_heartbeat(config_manager: tauri::State<'_, ConfigManager>) -> Result<(), String> {
    let config = get_full_config(config_manager.clone());
    let device_id = config.device_id.clone().unwrap();
    let heartbeat_url = format!(
        "{}/devices/heartbeat/{}",
        config.server_url.clone().unwrap(),
        device_id
    );
    let client = reqwest::Client::new();
    let response = client.get(heartbeat_url)
        .header("Content-Type", "application/json")
        .send()
        .await;
    if response.is_err() {
        return Err(response.err().unwrap().to_string());
    }
    let resp = response.unwrap();
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_else(|_| "<no body>".to_string());
        return Err(format!("Heartbeat failed: status {}: {}", status, body));
    }
    Ok(())
}

