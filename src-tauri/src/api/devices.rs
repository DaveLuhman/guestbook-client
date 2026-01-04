use crate::config::config_manager::ConfigManager;
use chrono::Utc;
use serde_json::json;
use std::time::Duration;
use tauri_plugin_http::reqwest; // Add this import for the `json!` macro
use tokio::time;

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
    if status.as_u16() == 403 {
        // Device is already deleted/orphaned on server - this is expected
        // We'll still clear local config to allow re-registration
        log::info!("Device appears to be orphaned (403) - skipping server deletion, clearing local config");
    } else if !status.is_success() {
        let error_msg = format!("Server returned error status: {}", status);
        log::error!("{}", error_msg);
        return Err(error_msg);
    } else {
        log::info!("Device successfully retired from server");
    }

    // Clear local config regardless of server response (handles orphaned devices)
    config_manager.set_first_run(true);
    // Clear server token to force re-registration
    config_manager.set_server_token("".to_string());
    log::info!("Device reset: first_run set to true, server token cleared");

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

    let status = response.status();
    if status.as_u16() == 403 {
        // Device is orphaned - deleted from server but still has local config
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<no body>".to_string());
        log::warn!("Heartbeat failed - device appears to be orphaned (403): {}", body);
        return Err("Device Orphaned - This device has been removed from the server".to_string());
    } else if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<no body>".to_string());
        return Err(format!("Heartbeat failed: status {}: {}", status, body));
    }
    Ok(())
}

/// Clear orphaned device state by resetting config to allow re-registration.
/// This clears the server token and sets first_run to true.
pub fn clear_orphaned_state(config_manager: tauri::State<'_, ConfigManager>) -> Result<(), String> {
    log::info!("Clearing orphaned device state - resetting config for re-registration");
    config_manager.set_first_run(true);
    config_manager.set_server_token("".to_string());
    log::info!("Orphaned state cleared: first_run set to true, server token cleared");
    Ok(())
}

/// Lightweight network availability check using the heartbeat endpoint with retry logic.
/// Implements exponential backoff retry (3 attempts: immediate, 1s, 2s delays).
/// Returns:
/// - Ok(true) - Network available, device valid
/// - Ok(false) - Network unavailable after all retries or other non-403 errors
/// - Err("ORPHANED") - Device is orphaned (403 response indicates device not found on server)
pub async fn check_network_availability(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<bool, String> {
    let config = config_manager.get_config()?;

    let server_url = config.server_url.clone().ok_or_else(|| {
        "Server URL not configured. Please configure the server URL in settings.".to_string()
    })?;

    let device_id = config.device_id.clone().ok_or_else(|| {
        "Device ID not configured. Please re-enroll this device.".to_string()
    })?;

    let server_token = config.server_token.clone().ok_or_else(|| {
        "Server token not configured. Please configure the server token in settings.".to_string()
    })?;

    let heartbeat_url = format!("{}/devices/heartbeat/{}", server_url, device_id);

    // Create client with longer timeouts: 10s connection, 20s read
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create HTTP client for network check: {}", e))?;

    log::debug!("Performing network availability check to {} (with retries)", heartbeat_url);

    // Retry logic: 3 attempts with exponential backoff (0s, 1s, 2s)
    let retry_delays = vec![Duration::from_secs(0), Duration::from_secs(1), Duration::from_secs(2)];
    let mut last_error: Option<reqwest::Error> = None;
    let mut last_status: Option<u16> = None;

    for (attempt, delay) in retry_delays.iter().enumerate() {
        // Wait before retry (skip delay on first attempt)
        if attempt > 0 {
            log::debug!("Network check retry attempt {} after {}ms delay", attempt + 1, delay.as_millis());
            time::sleep(*delay).await;
        }

        let response = client
            .get(&heartbeat_url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", server_token))
            .send()
            .await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                last_status = Some(status.as_u16());

                if status.is_success() {
                    if attempt > 0 {
                        log::info!("Network check succeeded on retry attempt {}", attempt + 1);
                    } else {
                        log::debug!("Network check succeeded on first attempt");
                    }
                    return Ok(true);
                } else if status.as_u16() == 403 {
                    // Device is orphaned - don't retry, return immediately
                    let body = resp
                        .text()
                        .await
                        .unwrap_or_else(|_| "<no body>".to_string());
                    log::warn!(
                        "Device appears to be orphaned (403): {}",
                        body
                    );
                    return Err("ORPHANED".to_string());
                } else {
                    // Non-success, non-403 status - log but continue to retry
                    let body = resp
                        .text()
                        .await
                        .unwrap_or_else(|_| "<no body>".to_string());
                    log::warn!(
                        "Network availability check returned status {} on attempt {}: {}",
                        status,
                        attempt + 1,
                        body
                    );
                    // Continue to next retry
                }
            }
            Err(e) => {
                last_error = Some(e);
                let error_type = if last_error.as_ref().unwrap().is_timeout() {
                    "timeout"
                } else if last_error.as_ref().unwrap().is_connect() {
                    "connection"
                } else {
                    "other"
                };
                log::warn!(
                    "Network availability check {} error on attempt {}: {}",
                    error_type,
                    attempt + 1,
                    last_error.as_ref().unwrap()
                );
                // Continue to next retry
            }
        }
    }

    // All retries exhausted - determine final result
    if let Some(status) = last_status {
        // We got a response but it wasn't successful
        log::warn!(
            "Network availability check failed after all retries: final status {}",
            status
        );
        Ok(false)
    } else if let Some(ref err) = last_error {
        // All attempts failed with network errors
        let error_type = if err.is_timeout() {
            "timeout"
        } else if err.is_connect() {
            "connection"
        } else {
            "network"
        };
        log::warn!(
            "Network availability check failed after all retries: {} error: {}",
            error_type,
            err
        );
        Ok(false)
    } else {
        // Should not happen, but handle gracefully
        log::error!("Network availability check failed with unknown error");
        Ok(false)
    }
}
