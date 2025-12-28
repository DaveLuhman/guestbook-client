fn main() {
    // Verify that the camera sidecar binary exists before building
    // This ensures it gets bundled into the AppImage
    let sidecar_path = std::path::Path::new("../sidecar/camera_sidecar");
    if !sidecar_path.exists() {
        eprintln!("⚠️  WARNING: Camera sidecar binary not found at: {:?}", sidecar_path);
        eprintln!("   The AppImage will be built without the sidecar binary.");
        eprintln!("   To fix this:");
        eprintln!("   1. Run: bash appliance-setup/install-tauri-deps.sh");
        eprintln!("   2. Or manually place the binary at: {:?}", sidecar_path);
        eprintln!("   3. Or download it from the release URL");
        eprintln!("");
        eprintln!("   The app will still work, but will need the sidecar installed separately.");
    } else {
        println!("✅ Camera sidecar binary found at: {:?}", sidecar_path);
    }

    tauri_build::build()
}
