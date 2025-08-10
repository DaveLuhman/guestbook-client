use chrono::{DateTime, Local};
use log::{LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub struct FileLogger {
    log_dir: PathBuf,
    current_file: Arc<Mutex<Option<File>>>,
    current_date: Arc<Mutex<String>>,
}

impl FileLogger {
    pub fn new(config_dir: &Path) -> io::Result<Self> {
        let log_dir = config_dir.parent().unwrap().join("logs");
        fs::create_dir_all(&log_dir)?;

        let current_date = Local::now().format("%Y-%m-%d").to_string();
        let current_file = Self::open_log_file(&log_dir, &current_date)?;

        Ok(Self {
            log_dir,
            current_file: Arc::new(Mutex::new(current_file)),
            current_date: Arc::new(Mutex::new(current_date)),
        })
    }

    fn open_log_file(log_dir: &Path, date: &str) -> io::Result<Option<File>> {
        let log_file = log_dir.join(format!("guestbook-{}.log", date));
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)?;
        Ok(Some(file))
    }

    fn ensure_current_file(&self) -> io::Result<()> {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let mut current_date = self.current_date.lock().unwrap();

        if *current_date != today {
            // Date changed, rotate to new log file
            let mut current_file = self.current_file.lock().unwrap();
            if let Some(file) = current_file.take() {
                drop(file); // Close the old file
            }
            *current_file = Self::open_log_file(&self.log_dir, &today)?;
            *current_date = today;
        }
        Ok(())
    }

    pub fn log_message(&self, level: log::Level, target: &str, message: &str) -> io::Result<()> {
        self.ensure_current_file()?;

        let now: DateTime<Local> = Local::now();
        let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f");
        let log_entry = format!("[{}] [{}] [{}] {}\n", timestamp, level, target, message);

        if let Some(file) = &mut *self.current_file.lock().unwrap() {
            file.write_all(log_entry.as_bytes())?;
            file.flush()?;
        }

        Ok(())
    }
}

impl Log for FileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= LevelFilter::Debug
    }

    fn log(&self, record: &Record) {
        if self.enabled(record.metadata()) {
            let target = record.target();
            let level = record.level();
            let message = record.args().to_string();

            if let Err(e) = self.log_message(level, target, &message) {
                eprintln!("Failed to write to log file: {}", e);
            }
        }
    }

    fn flush(&self) {
        if let Some(file) = &mut *self.current_file.lock().unwrap() {
            let _ = file.flush();
        }
    }
}

pub fn init_logging(config_dir: &Path) -> io::Result<()> {
    let file_logger = FileLogger::new(config_dir)?;
    log::set_boxed_logger(Box::new(file_logger))
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    log::set_max_level(LevelFilter::Debug);
    Ok(())
}

