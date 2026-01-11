// Debug-only HTTP server for remote log viewing
// This module is only compiled when debug-server feature is enabled

#[cfg(feature = "debug-server")]
use axum::{
    extract::Query,
    response::{Html, Json},
    routing::get,
    Router,
};
#[cfg(feature = "debug-server")]
use crate::debug_logging::{get_debug_logger, LogEntry};
#[cfg(feature = "debug-server")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "debug-server")]
use std::collections::HashMap;
#[cfg(feature = "debug-server")]
use std::net::SocketAddr;

#[cfg(feature = "debug-server")]
#[derive(Deserialize)]
struct LogQuery {
    limit: Option<usize>,
    since_id: Option<usize>,
}

#[cfg(feature = "debug-server")]
#[derive(Serialize)]
struct LogResponse {
    logs: Vec<LogEntry>,
    total: usize,
    next_id: usize,
}

#[cfg(feature = "debug-server")]
async fn get_logs_handler(Query(params): Query<LogQuery>) -> Json<LogResponse> {
    let logger = get_debug_logger();
    let total = logger.count();

    let logs = if let Some(since_id) = params.since_id {
        logger.get_logs_since(since_id)
    } else {
        logger.get_logs(params.limit)
    };

    let next_id = total;

    Json(LogResponse {
        logs,
        total,
        next_id,
    })
}

#[cfg(feature = "debug-server")]
async fn clear_logs_handler() -> Json<HashMap<&'static str, &'static str>> {
    let logger = get_debug_logger();
    logger.clear_logs();
    let mut response = HashMap::new();
    response.insert("status", "cleared");
    Json(response)
}

#[cfg(feature = "debug-server")]
async fn logs_page_handler() -> Html<String> {
    Html(include_str!("debug_logs.html").to_string())
}

#[cfg(feature = "debug-server")]
pub async fn start_debug_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new()
        .route("/", get(logs_page_handler))
        .route("/api/logs", get(get_logs_handler))
        .route("/api/clear", get(clear_logs_handler))
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    log::info!("Debug log server started on http://0.0.0.0:{}", port);
    log::info!("Access logs at http://<appliance-ip>:{}", port);

    // Run the server - this will block until the server stops
    axum::serve(listener, app).await?;

    Ok(())
}

// Stub for release builds
#[cfg(not(feature = "debug-server"))]
pub async fn start_debug_server(_port: u16) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

