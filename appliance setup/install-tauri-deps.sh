#!/bin/bash

# Tauri Dependencies Installation Script for Linux
# This script installs the required dependencies for building Tauri applications on Linux

set -e  # Exit on any error

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
else
    echo "✅ Rust is already installed"
fi

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js is already installed"
fi

# Install additional development tools
echo "🛠️ Installing additional development tools..."
sudo apt install -y \
  pkg-config \
  libgtk-3-dev \
  libappindicator3-dev \
  libwebkit2gtk-4.0-dev

echo "✅ Tauri dependencies installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Restart your terminal or run: source ~/.cargo/env"
echo "2. Navigate to your project directory"
echo "3. Run: npm install"
echo "4. Run: npm run tauri dev"
echo ""
echo "🔗 For more information, visit: https://tauri.app/v1/guides/getting-started/setup/linux"
