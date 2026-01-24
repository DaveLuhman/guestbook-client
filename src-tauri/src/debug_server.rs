// Debug-only HTTP server for remote log viewing
// This module is only compiled in debug builds

#[cfg(debug_assertions)]
use axum::{
    extract::Query,
    response::{Html, Json},
    routing::get,
    Router,
};
#[cfg(debug_assertions)]
use crate::debug_logging::{get_debug_logger, LogEntry};
#[cfg(debug_assertions)]
use serde::{Deserialize, Serialize};
#[cfg(debug_assertions)]
use std::collections::HashMap;
#[cfg(debug_assertions)]
use std::net::SocketAddr;

#[cfg(debug_assertions)]
#[derive(Deserialize)]
struct LogQuery {
    limit: Option<usize>,
    since_id: Option<usize>,
}

#[cfg(debug_assertions)]
#[derive(Serialize)]
struct LogResponse {
    logs: Vec<LogEntry>,
    total: usize,
    next_id: usize,
}

#[cfg(debug_assertions)]
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

#[cfg(debug_assertions)]
async fn clear_logs_handler() -> Json<HashMap<&'static str, &'static str>> {
    let logger = get_debug_logger();
    logger.clear_logs();
    let mut response = HashMap::new();
    response.insert("status", "cleared");
    Json(response)
}

#[cfg(debug_assertions)]
async fn logs_page_handler() -> Html<String> {
    Html(include_str!("debug_logs.html").to_string())
}

#[cfg(debug_assertions)]
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
#[cfg(not(debug_assertions))]
pub async fn start_debug_server(_port: u16) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

