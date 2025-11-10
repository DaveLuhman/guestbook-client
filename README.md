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

### 1. Run the setup-script from the API
```bash
sudo curl https://wolfpackguestbook.com/api/setup-script | bash
```

### 2. Enable the service and reboot
```bash
# Enable the systemd service
sudo systemctl enable guestbook-client.service
```

This command will:
- Set up the application to auto-start as a system service


### 3. Reboot
```bash
sudo reboot now

# Install Rust dependencies (automatic with first build)
```

## Development Setup (Optional)
### 1. Clone the source code
```bash
git clone https://github.com/daveluhman/guestbook-client
```
### 2. Run the Tauri Dependancy Install Script
```bash
chmod +x ./appliance-setup/install-tauri-deps.sh
./appliance-setup/install-tauri-deps.sh
```

### 3. Run the npm install script
```bash
npm install
```
### 4. Build the application
```bash
npm run tauri build
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
- **Windows**: `%APPDATA%/adosoftware/guestbook/`
- **macOS**: `~/Library/Application Support/adosoftware/guestbook/`
- **Linux**: `~/.config/guestbook/`

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
When installed using the setup-script from the API, the application automatically starts on system boot and runs as a system service.

**Service Management:**
### Configuration Access
To access the configuration interface:
- modify the above mentioned configuration file in a text editor
This application is not intended to be manually configurable, but as a data collection device. If you need to change the configuration, please contact the administrator or submit a ticket to your support team.
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
```

### Available Scripts
```bash
# Setup and Installation
npm run first-run       # Complete first-time setup (dependencies)

# Development
npm run dev              # Start Vite dev server (doesn't work in browser without Tauri )
npm run tauri dev        # Start Tauri development

# Building
npm run build           # Build frontend (only for building static assets, not for development)
npm run tauri build     # Build complete application as appImage

## 🔌 HID Device Support

### Supported Devices
- **Barcode Scanners**: USB HID barcode scanners
- **Magnetic Stripe Readers**: USB HID MSR devices (e.g., MagTek)

### Device Detection
The application automatically:
- Detects new HID devices on connection
- Attempts to reconnect to previously used devices
- Handles device disconnection gracefully
- Provides device status feedback via pips in the top right corner of the screen

## 🌐 API Integration

### Endpoints
- `POST /api/v1/entries/submit` - Submit guest entries
- `GET /api/v1/devices/heartbeat/{token}` - Device health check

### Authentication
- Per-device token authentication
- Automatic token validation

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
- Re-run setup if needed: `sudo npm run first-run`

**Setup Issues**
- Ensure you're running as a regular user (not root) when using `npm run first-run`
- On Linux, the script will prompt for sudo when needed
- If Rust is not found, run: `./appliance-setup/install-tauri-deps.sh`

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
