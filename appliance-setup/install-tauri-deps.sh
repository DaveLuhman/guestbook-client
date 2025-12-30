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

# Install Rust if not already installed
if ! command -v rustc &> /dev/null; then
    echo "🦀 Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source ~/.cargo/env
    echo "ℹ️ Rust installed successfully."
else
    echo "✅ Rust is already installed"
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

# Install linuxdeploy and plugins for AppImage bundling
echo "📦 Installing linuxdeploy for AppImage bundling..."
ARCH=$(uname -m)
LINUXDEPLOY_VERSION="continuous"

# Detect architecture
case "$ARCH" in
  x86_64)
    LINUXDEPLOY_ARCH="x86_64"
    ;;
  aarch64|arm64)
    LINUXDEPLOY_ARCH="aarch64"
    ;;
  *)
    echo "⚠️  Warning: Unsupported architecture $ARCH for linuxdeploy. AppImage bundling may fail."
    LINUXDEPLOY_ARCH=""
    ;;
esac

if [ -n "$LINUXDEPLOY_ARCH" ]; then
  # Create directory for linuxdeploy
  LINUXDEPLOY_DIR="$HOME/.local/bin"
  mkdir -p "$LINUXDEPLOY_DIR"

  # Download linuxdeploy
  LINUXDEPLOY_URL="https://github.com/linuxdeploy/linuxdeploy/releases/download/${LINUXDEPLOY_VERSION}/linuxdeploy-${LINUXDEPLOY_ARCH}.AppImage"
  echo "📥 Downloading linuxdeploy from $LINUXDEPLOY_URL..."
  wget -q "$LINUXDEPLOY_URL" -O "$LINUXDEPLOY_DIR/linuxdeploy-${LINUXDEPLOY_ARCH}.AppImage" || {
    echo "❌ Failed to download linuxdeploy. AppImage bundling may not work."
    LINUXDEPLOY_ARCH=""
  }

  if [ -n "$LINUXDEPLOY_ARCH" ]; then
    chmod +x "$LINUXDEPLOY_DIR/linuxdeploy-${LINUXDEPLOY_ARCH}.AppImage"

    # Create symlink if it doesn't exist
    if [ ! -f "$LINUXDEPLOY_DIR/linuxdeploy.AppImage" ]; then
      ln -s "linuxdeploy-${LINUXDEPLOY_ARCH}.AppImage" "$LINUXDEPLOY_DIR/linuxdeploy.AppImage"
    fi

    # Download linuxdeploy plugins
    echo "📥 Downloading linuxdeploy plugins..."

    # GTK plugin
    GTK_PLUGIN_URL="https://github.com/linuxdeploy/linuxdeploy-plugin-gtk/releases/download/${LINUXDEPLOY_VERSION}/linuxdeploy-plugin-gtk-${LINUXDEPLOY_ARCH}.AppImage"
    wget -q "$GTK_PLUGIN_URL" -O "$LINUXDEPLOY_DIR/linuxdeploy-plugin-gtk.AppImage" || echo "⚠️  Warning: Failed to download GTK plugin"
    if [ -f "$LINUXDEPLOY_DIR/linuxdeploy-plugin-gtk.AppImage" ]; then
      chmod +x "$LINUXDEPLOY_DIR/linuxdeploy-plugin-gtk.AppImage"
    fi

    # AppStream plugin (optional but recommended)
    APPSTREAM_PLUGIN_URL="https://github.com/linuxdeploy/linuxdeploy-plugin-appstream/releases/download/${LINUXDEPLOY_VERSION}/linuxdeploy-plugin-appstream-${LINUXDEPLOY_ARCH}.AppImage"
    wget -q "$APPSTREAM_PLUGIN_URL" -O "$LINUXDEPLOY_DIR/linuxdeploy-plugin-appstream.AppImage" || echo "⚠️  Warning: Failed to download AppStream plugin"
    if [ -f "$LINUXDEPLOY_DIR/linuxdeploy-plugin-appstream.AppImage" ]; then
      chmod +x "$LINUXDEPLOY_DIR/linuxdeploy-plugin-appstream.AppImage"
    fi

    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$LINUXDEPLOY_DIR:"* ]]; then
      echo "" >> ~/.bashrc
      echo "# Add linuxdeploy to PATH" >> ~/.bashrc
      echo "export PATH=\"\$PATH:$LINUXDEPLOY_DIR\"" >> ~/.bashrc
      export PATH="$PATH:$LINUXDEPLOY_DIR"
      echo "✅ Added linuxdeploy to PATH (also added to ~/.bashrc for future sessions)"
    fi

    echo "✅ linuxdeploy installed successfully"
  fi
else
  echo "⚠️  Skipping linuxdeploy installation due to unsupported architecture"
fi

echo "✅ Tauri dependencies installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm install"
echo "2. Run: npm run tauri build"
echo ""
echo "🔗 For more information, visit: https://tauri.app/v1/guides/getting-started/setup/linux"
