use crate::config::config_manager::ConfigManager;
use chrono::Utc;
use serde_json::json;
use tauri_plugin_http::reqwest; // Add this import for the `json!` macro

pub async fn register_device(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<(), String> {
    let config = config_manager.get_config()?;
    let register_url = format!("{}/devices/register", config.server_url.clone().unwrap());
    let request_body = json!({
        "name": config.device_friendly_name,
        "location": config.device_location,
        "id": config.device_id,
    });
    log::info!("Registering device with URL: {}", register_url);
    log::info!(
        "Request body: {}",
        serde_json::to_string_pretty(&request_body)
            .map_err(|e| format!("Failed to serialize request body: {}", e))?
    );
    let client = reqwest::Client::new();
    let response = client
        .post(register_url)
        .header("Content-Type", "application/json")
        .body(
            serde_json::to_string(&request_body)
                .map_err(|e| format!("Failed to serialize request body: {}", e))?
        )
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    log::info!("Server response body: {}", body);
    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response JSON: {}", e))?;
    log::info!("Parsed JSON response: {}", json);
    let token = json
        .get("data")
        .and_then(|data| data.get("token"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            log::error!("Token not found in response. Available keys: {:?}", json.as_object().map(|obj| obj.keys().collect::<Vec<_>>()));
            "Token not found in response".to_string()
        })?
        .to_owned();
    config_manager.set_server_token(token.clone());
    Ok(())
}

pub async fn reset_device(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<(), String> {
    let config = config_manager.get_config()?;
    let device_id = config.device_id.clone().unwrap();
    let server_url = config.server_url.clone().unwrap();
    let server_token = config.server_token.clone().unwrap();

    // First, call the DELETE /devices/{device_id} endpoint to retire the device
    let delete_url = format!("{}/devices/{}", server_url, device_id);
    let client = reqwest::Client::new();

    log::info!("Retiring device with URL: {}", delete_url);

    let response = client
        .delete(delete_url)
        .header("Authorization", format!("Bearer {}", server_token))
        .send()
        .await
        .map_err(|e| {
            log::error!("Failed to retire device: {}", e);
            format!("Failed to retire device: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let error_msg = format!("Server returned error status: {}", status);
        log::error!("{}", error_msg);
        return Err(error_msg);
    }

    log::info!("Device successfully retired from server");

    // Then, reset the first_run flag to true
    config_manager.set_first_run(true);
    log::info!("Device reset: first_run set to true");

    Ok(())
}

pub async fn send_heartbeat(config_manager: tauri::State<'_, ConfigManager>) -> Result<(), String> {
    let config = config_manager.get_config()?;
    let device_id = config.device_id.clone().unwrap();
    let heartbeat_url = format!(
        "{}/devices/heartbeat/{}",
        config.server_url.clone().unwrap(),
        device_id
    );
    let current_time = Utc::now().timestamp_millis();
    println!("Heartbeat Sending at {}", current_time);
    let client = reqwest::Client::new();
    let response = client
        .get(heartbeat_url)
        .header("Content-Type", "application/json")
        .header(
            "Authorization",
            format!("Bearer {}", config.server_token.clone().unwrap()),
        )
        .send()
        .await
        .map_err(|e| format!("Failed to send heartbeat request: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<no body>".to_string());
        return Err(format!("Heartbeat failed: status {}: {}", status, body));
    }
    Ok(())
}
