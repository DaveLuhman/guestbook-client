#!/bin/bash

# Tauri Dependencies Installation Script for Linux
# This script installs the required dependencies for building Tauri applications on Linux

set -e  # Exit on any error

# Check OS type
if [ "$(uname -s)" != "Linux" ]; then
    echo "❌ Unsupported OS: This script only supports Linux systems."
    exit 1
fi

# Check for apt availability
if ! command -v apt &> /dev/null; then
    echo "❌ 'apt' package manager not found. This script only supports Debian/Ubuntu-based systems with 'apt'."
    exit 1
fi

echo "🚀 Installing Tauri dependencies for Linux..."

# Determine which user should own the Rust toolchain
TARGET_USER="${SUDO_USER}"
if [ -z "$TARGET_USER" ]; then
    if id -u serveradmin >/dev/null 2>&1; then
        TARGET_USER="serveradmin"
    else
        TARGET_USER="root"
    fi
fi
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [ -z "$TARGET_HOME" ]; then
    echo "❌ Could not determine home directory for user: $TARGET_USER"
    exit 1
fi

# Update package list
echo "📦 Updating package list..."
sudo apt update

# Install required dependencies
echo "🔧 Installing Tauri build dependencies..."
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Install Rust if not already installed for target user
if ! sudo -u "$TARGET_USER" -H bash -lc "command -v rustc >/dev/null 2>&1"; then
    echo "🦀 Installing Rust for user: $TARGET_USER"
    sudo -u "$TARGET_USER" -H bash -lc \
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
    echo "ℹ️ Rust installed successfully for $TARGET_USER."
else
    echo "✅ Rust is already installed for $TARGET_USER"
fi

# Ensure target user's shell loads Rust environment
if ! sudo -u "$TARGET_USER" -H bash -lc "grep -q 'source \$HOME/.cargo/env' \"$TARGET_HOME/.bashrc\" 2>/dev/null"; then
    echo "" | sudo -u "$TARGET_USER" -H tee -a "$TARGET_HOME/.bashrc" >/dev/null
    echo "# Load Rust environment (installed by rustup)" | sudo -u "$TARGET_USER" -H tee -a "$TARGET_HOME/.bashrc" >/dev/null
    echo "source \$HOME/.cargo/env" | sudo -u "$TARGET_USER" -H tee -a "$TARGET_HOME/.bashrc" >/dev/null
fi

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    sudo apt-get install -y nodejs npm
else
    echo "✅ Node.js is already installed"
fi

# Install additional development tools
echo "🛠️ Installing additional development tools..."
sudo apt install -y \
  pkg-config \
  libgtk-3-dev \
  libappindicator3-dev \
  libwebkit2gtk-4.0-dev \
  libudev-dev

# Install GStreamer and media codec libraries for AppImage compatibility
echo "🎵 Installing GStreamer and media codec libraries..."
sudo apt install -y \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav \
  gstreamer1.0-tools \
  gstreamer1.0-x \
  gstreamer1.0-alsa \
  gstreamer1.0-pulseaudio \
  libgstreamer1.0-dev \
  libgstreamer-plugins-base1.0-dev \
  libgstreamer-plugins-bad1.0-dev \
  libfdk-aac-dev \
  libavcodec-dev \
  libavformat-dev \
  libavutil-dev \
  libswresample-dev

# Note: The camera sidecar is NOT bundled in the AppImage.
# It must be installed separately to /opt/guestbook/sidecar/ during deployment.
# The setup-script.sh handles sidecar installation.

echo ""
echo "✅ Tauri dependencies installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm install"
echo "2. Run: npm run tauri build"
echo ""
echo "ℹ️  Note: The camera sidecar is NOT bundled in the AppImage."
echo "   It will be installed separately to /opt/guestbook/sidecar/ during deployment."
echo ""
echo "🔗 For more information, visit: https://tauri.app/v2/guides/getting-started/setup/linux"
