#!/bin/bash

# First Run Setup Script for Guestbook Kiosk Client
# This script performs the initial setup steps for the project

set -e  # Exit on any error

echo "🚀 Starting first-run setup for Guestbook Kiosk Client..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js first."
    echo "💡 You can run the install-tauri-deps.sh script to install Node.js and other dependencies."
    exit 1
fi

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust is not installed. Please install Rust first."
    echo "💡 You can run the install-tauri-deps.sh script to install Rust and other dependencies."
    exit 1
fi

echo "📦 Installing Node.js dependencies..."
npm install

echo "🔧 Building Rust dependencies..."
cd src-tauri
cargo build --release
cd ..

echo "🚀 Configuring auto-start on boot..."
# Create the application directory if it doesn't exist
sudo mkdir -p /opt/guestbook-kiosk

# Copy the built application to /opt/guestbook-kiosk/
echo "📦 Installing application to /opt/guestbook-kiosk/..."
sudo cp -r . /opt/guestbook-kiosk/
sudo chown -R $USER:$USER /opt/guestbook-kiosk/

# Create systemd service file
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/guestbook-kiosk.service > /dev/null <<EOF
[Unit]
Description=Guestbook Kiosk Client
After=network.target graphical-session.target
Wants=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/guestbook-kiosk
ExecStart=/opt/guestbook-kiosk/src-tauri/target/release/guestbook-tauri-ts
Restart=always
RestartSec=10
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

# Enable the service to start on boot
echo "🔧 Enabling auto-start service..."
sudo systemctl daemon-reload
sudo systemctl enable guestbook-kiosk.service

echo "✅ First-run setup complete!"
echo ""
echo "🎉 Your Guestbook Kiosk Client is ready for development!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm run dev (to start the development server)"
echo "2. Run: npm run tauri dev (to start the Tauri development environment)"
echo "3. The application will now start automatically on system boot"
echo ""
echo "🔧 Service management:"
echo "- Start service: sudo systemctl start guestbook-kiosk"
echo "- Stop service: sudo systemctl stop guestbook-kiosk"
echo "- Check status: sudo systemctl status guestbook-kiosk"
echo "- View logs: sudo journalctl -u guestbook-kiosk -f"
echo ""
echo "🔗 For more information, see the README.md file"
