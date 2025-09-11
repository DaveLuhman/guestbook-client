## Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

### [Unreleased]

- Added: Improved device registration logging (request URL/body, server response parsing)
- Changed: Device reset now calls `DELETE /devices/{device_id}` and uses the configured device ID
- Fixed: Unused variable warning in `reset_device` by using `device_id` in the DELETE URL
- Fixed: More robust heartbeat error handling with status/body in errors
- Changed: Minor updates to frontend `index.html`, `src/main.ts`, and `src/styles.css`
- Build: General build process improvements for the Tauri app

### [0.1.0] - Initial release

- Added: Tauri-based desktop client scaffold (Rust backend + TypeScript/Vite frontend)
- Added: Rust backend modules
  - Configuration management with persisted settings
  - SQLite database access with schema and migrations
  - Device APIs and IPC commands for barcode scanner and MagTek swiper
  - HID manager with event streaming to the frontend
  - HTTP client integration for server communication
- Added: Frontend
  - Vite app with blue-and-white theme
  - IPC via `invoke`/`listen` for backend commands and event streams
  - First-run flow and setup pages
  - Error handling and accessible modal dialogs
  - Success/error sounds via audio assets
- Added: Packaging assets and scripts (icons, installers, setup scripts)


