# Guestbook Kiosk Client

A modern, cross-platform kiosk application built with Tauri (Rust + TypeScript) for capturing guest entries from HID devices and submitting them to a central API.

## 🎯 Overview

The Guestbook Kiosk Client is designed to run on kiosk devices (like Raspberry Pi) and provides a seamless interface for guests to check in using their OneCard via barcode scanning or magnetic stripe reading. The application handles device management, offline scenarios, and secure communication with the central Guestbook API.

## ✨ Features

- **HID Device Support**: Automatic detection and management of barcode scanners and magnetic stripe readers
- **Offline Resilience**: Local queue system with automatic retry logic for failed submissions
- **Secure Authentication**: Per-device token-based authentication with the central API
- **Heartbeat Monitoring**: Regular health checks to ensure device connectivity
- **Audio Feedback**: Success/error sound notifications for user feedback
- **Cross-Platform**: Built with Tauri for Windows, macOS, and Linux support
- **Kiosk Mode**: Fullscreen interface optimized for touch and card interactions
- **Configuration Management**: Easy device setup and configuration through a dedicated interface

## 🏗️ Architecture

### Backend (Rust)
- **Device Management**: HID device detection and data processing
- **Database**: SQLite for local entry storage and queue management
- **Network Layer**: HTTP client for API communication with retry logic
- **Configuration**: Secure storage of device tokens and settings

### Frontend (TypeScript + Vite)
- **UI Components**: Modern, accessible interface components
- **Device Integration**: Real-time HID device event handling
- **Audio Management**: Sound feedback for user interactions
- **State Management**: Application state and error handling

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Rust** toolchain (rustc, cargo)
- **Platform-specific dependencies**:
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: Run `./appliance-setup/install-tauri-deps.sh` to install all required dependencies

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd guestbook-client
```

### 2. Quick Setup (Recommended)
```bash
# Run the automated first-run setup
npm run first-run
```

This command will:
- Install all Node.js dependencies
- Build Rust dependencies
- Configure auto-start on boot (Linux only)
- Set up the application as a system service

### 3. Manual Setup (Alternative)
```bash
# Install Node.js dependencies
npm install

# Install Rust dependencies (automatic with first build)
```

### 4. Development Setup
```bash
# Start development server
npm run dev

# In another terminal, start Tauri development
npm run tauri dev
```

## 🔧 Configuration

### First Run Setup
On first launch, the application will open a configuration window where you can set:

- **Server URL**: The central Guestbook API endpoint
- **Device Token**: Authentication token for this specific device
- **Device Location**: Physical location identifier
- **Device Name**: Friendly name for this kiosk

### Configuration File
The application stores configuration in a secure location:
- **Windows**: `%APPDATA%/guestbook-kiosk/`
- **macOS**: `~/Library/Application Support/guestbook-kiosk/`
- **Linux**: `~/.config/guestbook-kiosk/`

## 🎮 Usage

### Normal Operation
1. **Start the Application**: Launch the kiosk client
2. **Device Detection**: The app automatically detects connected HID devices
3. **Guest Check-in**: Guests can swipe their OneCard or scan a barcode
4. **Feedback**: Audio confirmation plays on successful submission
5. **Offline Handling**: Failed submissions are queued for retry when connectivity is restored

### Kiosk Mode
The application runs in fullscreen kiosk mode by default, providing a clean interface for guest interactions.

### Auto-Start (Linux Appliances)
When installed using `npm run first-run`, the application automatically starts on system boot and runs as a system service.

**Service Management:**
> **Note:** For cross-platform compatibility, use forward slashes (`/`) in script paths. If your folder names contain spaces, wrap the path in quotes (e.g., `"appliance setup/manage-service.sh"`). On Windows, use Git Bash or WSL for best results.

```bash
# Check service status
./appliance-setup/manage-service.sh status

# Start/stop the service
./appliance-setup/manage-service.sh start
./appliance-setup/manage-service.sh stop

# View live logs
./appliance-setup/manage-service.sh logs

# Restart the service
./appliance-setup/manage-service.sh restart
```

### Configuration Access
To access the configuration interface:
- Use the keyboard shortcut `Ctrl+Shift+C` (Windows/Linux) or `Cmd+Shift+C` (macOS)
- Or restart the application with the `--config` flag

## 🛠️ Development

### Project Structure
```
guestbook-client/
├── src/                    # TypeScript frontend
│   ├── hid/               # HID device management
│   ├── network/           # API communication
│   ├── sound/             # Audio feedback
│   └── main.ts            # Application entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── api/           # API handlers
│   │   ├── config/        # Configuration management
│   │   ├── db/            # Database operations
│   │   └── devices/       # Device integration
│   └── Cargo.toml         # Rust dependencies
├── appliance-setup/        # Setup and deployment scripts
│   ├── install-tauri-deps.sh    # Linux dependency installer
│   ├── first-run-setup.sh       # First-time setup script
│   ├── first-run-setup.bat      # Windows setup script
│   ├── manage-service.sh        # Service management script
│   └── build-arm64-debian.sh    # ARM64 Debian package builder
├── public/                # Static assets
└── package.json           # Node.js dependencies
```

### Available Scripts
```bash
# Setup and Installation
npm run first-run       # Complete first-time setup (dependencies + auto-start)

# Development
npm run dev              # Start Vite dev server
npm run tauri dev        # Start Tauri development

# Building
npm run build           # Build frontend
npm run tauri build     # Build complete application
npm run build:arm64     # Build ARM64 Debian package for kiosk deployment

# Testing
npm run test            # Run frontend tests
cargo test              # Run Rust tests
```

### Code Quality
```bash
# Format code
cargo fmt               # Format Rust code
npm run format          # Format TypeScript code

# Lint code
cargo clippy            # Rust linting
npm run lint            # TypeScript linting
```

## 🔌 HID Device Support

### Supported Devices
- **Barcode Scanners**: USB HID barcode scanners
- **Magnetic Stripe Readers**: USB HID MSR devices (e.g., MagTek)

### Device Detection
The application automatically:
- Detects new HID devices on connection
- Attempts to reconnect to previously used devices
- Handles device disconnection gracefully
- Provides device status feedback

## 🌐 API Integration

### Endpoints
- `POST /api/v1/entries/submit` - Submit guest entries
- `GET /api/v1/devices/heartbeat/{token}` - Device health check

### Authentication
- Per-device token authentication
- Automatic token validation
- Secure token storage

### Offline Handling
- Local SQLite database for entry storage
- Automatic retry with exponential backoff
- Queue management for failed submissions

## 🧪 Testing

### Running Tests
```bash
# Frontend tests
npm run test

# Backend tests
cargo test

# Integration tests
cargo test --test integration
```

### Test Coverage
- Unit tests for Rust modules
- Integration tests for API endpoints
- Frontend component tests
- End-to-end device interaction tests

## 📦 Building for Production

### Create Distribution
```bash
# Build for current platform
npm run tauri build

# Build for specific platform
npm run tauri build -- --target x86_64-unknown-linux-gnu
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-apple-darwin
```

### ARM64 Debian Package (Kiosk Deployment)
For deploying to ARM64 kiosk devices (like Raspberry Pi):

```bash
# Build ARM64 Debian package
npm run build:arm64
```

This creates a `.deb` package optimized for ARM64 Debian-based systems with:
- Cross-compiled ARM64 binary
- Desktop integration (menu entry, icons)
- System dependencies (webkitgtk, gtk, appindicator)
- Setup scripts included in `/usr/share/guestbook-kiosk/`

**Installation:**
```bash
sudo dpkg -i src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/*.deb
```

### Distribution Files
Built applications are available in `src-tauri/target/release/`:
- **Windows**: `.exe` installer
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` or `.deb` package
- **ARM64 Linux**: `.deb` package in `src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/`

## 🐛 Troubleshooting

### Common Issues

**Device Not Detected**
- Ensure device is USB HID compliant
- Check device permissions on Linux
- Verify device drivers are installed

**Network Connectivity**
- Check server URL configuration
- Verify device token is valid
- Check firewall settings

**Audio Not Working**
- Ensure system audio is enabled
- Check application audio permissions
- Verify sound files are present

**Service Not Starting (Linux)**
- Check service status: `sudo ./appliance-setup/manage-service.sh status`
- View service logs: `sudo ./appliance-setup/manage-service.sh logs`
- Ensure auto-start is enabled: `sudo ./appliance-setup/manage-service.sh enable`

### Logs
Application logs are available in:
- **Windows**: `%APPDATA%/guestbook-kiosk/logs/`
- **macOS**: `~/Library/Logs/guestbook-kiosk/`
- **Linux**: `~/.local/share/guestbook-kiosk/logs/` or via `journalctl -u guestbook-kiosk`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow Rust and TypeScript best practices
- Write tests for new functionality
- Update documentation for API changes
- Ensure code passes all linting checks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review the project documentation

## 🔄 Version History

- **v0.1.0** - Initial release with basic HID support and API integration
- **v0.1.1** - Added automated setup scripts and Linux auto-start functionality
- Future versions will include enhanced device management and UI improvements

---

Built with ❤️ using [Tauri](https://tauri.app/) and [Rust](https://rust-lang.org/)
