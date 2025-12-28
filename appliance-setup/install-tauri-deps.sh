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

# Prepare sidecar binary for AppImage bundling
echo "📦 Preparing camera sidecar binary for bundling..."
SIDECAR_BINARY_URL="${SIDECAR_BINARY_URL:-https://github.com/DaveLuhman/guestbook-sidecar/releases/download/v1.0.0/camera_sidecar}"
SIDECAR_SOURCE_DIR="${SIDECAR_SOURCE_DIR:-sidecar}"
SIDECAR_BINARY_PATH="${SIDECAR_SOURCE_DIR}/camera_sidecar"

# Check if sidecar binary already exists
if [[ -f "${SIDECAR_BINARY_PATH}" && -x "${SIDECAR_BINARY_PATH}" ]]; then
    echo "✅ Sidecar binary already exists at ${SIDECAR_BINARY_PATH}"
else
    echo " + Sidecar binary not found, attempting to download..."

    # Try to download pre-built binary
    if [[ -n "${SIDECAR_BINARY_URL}" ]]; then
        echo " + Downloading sidecar binary from ${SIDECAR_BINARY_URL}..."
        mkdir -p "${SIDECAR_SOURCE_DIR}"
        if curl -fsSL "${SIDECAR_BINARY_URL}" -o "${SIDECAR_BINARY_PATH}"; then
            chmod +x "${SIDECAR_BINARY_PATH}"
            echo "✅ Downloaded sidecar binary successfully"
        else
            echo ""
            echo "❌ ERROR: Failed to download sidecar binary from ${SIDECAR_BINARY_URL}"
            echo ""
            echo "The sidecar binary is required for bundling into the AppImage."
            echo "You need to build it manually before running 'npm run tauri build'."
            echo ""
            echo "To build the sidecar binary:"
            echo "1. Ensure the sidecar submodule is initialized: git submodule update --init --recursive sidecar"
            echo "2. Follow the build instructions in the sidecar repository"
            echo "3. Place the built binary at: ${SIDECAR_BINARY_PATH}"
            echo ""
            echo "Alternatively, you can set SIDECAR_BINARY_URL to a different URL if the binary"
            echo "is hosted elsewhere."
            echo ""
            exit 1
        fi
    else
        echo ""
        echo "❌ ERROR: SIDECAR_BINARY_URL is not set"
        echo ""
        echo "The sidecar binary is required for bundling into the AppImage."
        echo "You need to build it manually before running 'npm run tauri build'."
        echo ""
        echo "To build the sidecar binary:"
        echo "1. Ensure the sidecar submodule is initialized: git submodule update --init --recursive sidecar"
        echo "2. Follow the build instructions in the sidecar repository"
        echo "3. Place the built binary at: ${SIDECAR_BINARY_PATH}"
        echo ""
        exit 1
    fi
fi

echo ""
echo "✅ Tauri dependencies installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm install"
echo "2. Run: npm run tauri build"
echo ""
echo "✅ Sidecar binary ready for bundling: ${SIDECAR_BINARY_PATH}"
echo ""
echo "🔗 For more information, visit: https://tauri.app/v1/guides/getting-started/setup/linux"
