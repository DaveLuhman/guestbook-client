#!/bin/bash

# First Run Setup Script for Guestbook client Client
# This script performs the initial setup steps for the project

set -e  # Exit on any error

echo "🚀 Starting first-run setup for Guestbook client Client..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js first."
    echo "💡 You can run the appliance-setup/install-tauri-deps.sh script to install Node.js and other dependencies."
    exit 1
fi

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust is not installed. Please install Rust first."
    echo "💡 You can run the appliance-setup/install-tauri-deps.sh script to install Rust and other dependencies."
    exit 1
fi

echo "📦 Installing Node.js dependencies..."
npm install

echo "🔧 Building Rust dependencies..."
cd src-tauri
cargo build --release
cd ..

echo "🚀 Configuring auto-start on boot..."

# Determine the correct user for ownership
TARGET_USER=${SUDO_USER:-$USER}
if [ "$TARGET_USER" = "root" ]; then
    echo "❌ Error: Cannot determine target user. Please run this script as a regular user with sudo."
    exit 1
fi

# Clear existing installation to ensure clean state
echo "🧹 Clearing existing installation..."
sudo rm -rf /opt/guestbook-client

# Create the application directory
sudo mkdir -p /opt/guestbook-client

# Copy only the built application and necessary assets to /opt/guestbook-client/
echo "📦 Installing application to /opt/guestbook-client/..."
sudo cp -r src-tauri/target/release/guestbook-tauri-ts /opt/guestbook-client/
sudo cp -r dist /opt/guestbook-client/
sudo cp -r public /opt/guestbook-client/
sudo cp -r appliance-setup /opt/guestbook-client/
sudo cp README.md /opt/guestbook-client/
sudo chown -R $TARGET_USER:$TARGET_USER /opt/guestbook-client/

# Create systemd service file
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/guestbook-client.service > /dev/null <<EOF
[Unit]
Description=Guestbook client Client
After=network.target graphical-session.target
Wants=network.target

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=/opt/guestbook-client
ExecStart=/opt/guestbook-client/src-tauri/target/release/guestbook-tauri-ts
Restart=always
RestartSec=10
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

# Enable the service to start on boot
echo "🔧 Enabling auto-start service..."
sudo systemctl daemon-reload
sudo systemctl enable guestbook-client.service

echo "✅ First-run setup complete!"
echo ""
echo "🎉 Your Guestbook client Client is ready for development!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm run dev (to start the development server)"
echo "2. Run: npm run tauri dev (to start the Tauri development environment)"
echo "3. The application will now start automatically on system boot"
echo ""
echo "🔧 Service management:"
echo "- Start service: sudo systemctl start guestbook-client"
echo "- Stop service: sudo systemctl stop guestbook-client"
echo "- Check status: sudo systemctl status guestbook-client"
echo "- View logs: sudo journalctl -u guestbook-client -f"
echo ""
echo "🔗 For more information, see the README.md file"
