fn main() {
    // Note: The camera sidecar is NOT bundled in the AppImage.
    // It must be installed separately to /opt/guestbook/sidecar/ (preferred) or
    // /usr/share/guestbook-kiosk/sidecar/ via the setup script.
    // This allows the sidecar to be updated independently of the main app.

    tauri_build::build()
}
