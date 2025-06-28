use rusqlite::{params, Connection, Result};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GuestEntry {
    pub id: i32,
    pub onecard: i32,
    pub entry_time: String,
    pub name: Option<String>,

}

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS guest_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                onecard INTEGER,
                name TEXT,
                entry_time TEXT
            )",
        )?;
        Ok(Self { conn })
    }

    pub fn insert_guest_entry(&self, entry: &GuestEntry) -> Result<()> {
        self.conn.execute(
            "INSERT INTO guest_entries (name, entry_time, onecard) VALUES (?, ?, ?)",
            params![entry.onecard, entry.name, entry.entry_time],
        )?;
        Ok(())
    }
}