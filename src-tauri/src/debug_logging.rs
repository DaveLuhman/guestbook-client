// Debug-only logging system for remote log viewing
// This module is only compiled in debug builds

#[cfg(debug_assertions)]
use chrono::{DateTime, Local};
#[cfg(debug_assertions)]
use log::{LevelFilter, Log, Metadata, Record};
#[cfg(debug_assertions)]
use std::collections::VecDeque;
#[cfg(debug_assertions)]
use std::sync::{Arc, Mutex};

#[cfg(debug_assertions)]
const MAX_LOG_ENTRIES: usize = 10000; // Keep last 10k log entries

#[cfg(debug_assertions)]
#[derive(Clone, Debug, serde::Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub source: String, // "backend" or "frontend"
}

#[cfg(debug_assertions)]
#[derive(Clone)]
pub struct DebugLogger {
    logs: Arc<Mutex<VecDeque<LogEntry>>>,
}

#[cfg(debug_assertions)]
impl DebugLogger {
    pub fn new() -> Self {
        Self {
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_ENTRIES))),
        }
    }

    pub fn add_log(&self, entry: LogEntry) {
        let mut logs = self.logs.lock().unwrap();
        if logs.len() >= MAX_LOG_ENTRIES {
            logs.pop_front(); // Remove oldest entry
        }
        logs.push_back(entry);
    }

    pub fn get_logs(&self, limit: Option<usize>) -> Vec<LogEntry> {
        let logs = self.logs.lock().unwrap();
        let limit = limit.unwrap_or(MAX_LOG_ENTRIES);
        logs.iter()
            .rev()
            .take(limit)
            .rev()
            .cloned()
            .collect()
    }

    pub fn get_logs_since(&self, since_id: usize) -> Vec<LogEntry> {
        let logs = self.logs.lock().unwrap();
        logs.iter()
            .skip(since_id)
            .cloned()
            .collect()
    }

    pub fn clear_logs(&self) {
        let mut logs = self.logs.lock().unwrap();
        logs.clear();
    }

    pub fn count(&self) -> usize {
        let logs = self.logs.lock().unwrap();
        logs.len()
    }
}

// Log trait implementation moved to init_debug_logging to avoid Clone issues

#[cfg(debug_assertions)]
use once_cell::sync::Lazy;

#[cfg(debug_assertions)]
static DEBUG_LOGGER: Lazy<DebugLogger> = Lazy::new(|| {
    DebugLogger::new()
});

#[cfg(debug_assertions)]
pub fn init_debug_logging() {
    log::set_max_level(LevelFilter::Debug);
    // We need to create a wrapper that implements Log but forwards to the static logger
    struct LoggerWrapper;
    impl Log for LoggerWrapper {
        fn enabled(&self, _metadata: &Metadata) -> bool {
            true
        }
        fn log(&self, record: &Record) {
            let now: DateTime<Local> = Local::now();
            let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f").to_string();

            let entry = LogEntry {
                timestamp,
                level: format!("{}", record.level()),
                target: record.target().to_string(),
                message: record.args().to_string(),
                source: "backend".to_string(),
            };

            DEBUG_LOGGER.add_log(entry);
        }
        fn flush(&self) {}
    }
    log::set_boxed_logger(Box::new(LoggerWrapper))
        .expect("Failed to set debug logger");
}

#[cfg(debug_assertions)]
pub fn get_debug_logger() -> &'static DebugLogger {
    &DEBUG_LOGGER
}

#[cfg(debug_assertions)]
pub fn add_frontend_log(level: String, message: String, target: Option<String>) {
    let now: DateTime<Local> = Local::now();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f").to_string();

    let entry = LogEntry {
        timestamp,
        level,
        target: target.unwrap_or_else(|| "frontend".to_string()),
        message,
        source: "frontend".to_string(),
    };

    DEBUG_LOGGER.add_log(entry);
}

// Stub implementations for release builds
#[cfg(not(debug_assertions))]
pub fn init_debug_logging() {}
#[cfg(not(debug_assertions))]
pub fn add_frontend_log(_level: String, _message: String, _target: Option<String>) {}

