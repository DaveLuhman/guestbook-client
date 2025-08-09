#!/bin/bash

# ARM64 Debian Package Build Script for Guestbook Kiosk Client
# This script builds the application for ARM64 architecture and creates a Debian package

set -e  # Exit on any error

echo "🚀 Building ARM64 Debian package for Guestbook Kiosk Client..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Check if Rust ARM64 target is installed
if ! rustup target list | grep -q "aarch64-unknown-linux-gnu (installed)"; then
    echo "📦 Installing ARM64 Rust target..."
    rustup target add aarch64-unknown-linux-gnu
fi

# Check if ARM64 cross-compilation tools are installed
if ! command -v aarch64-linux-gnu-gcc &> /dev/null; then
    echo "📦 Installing ARM64 cross-compilation tools..."
    sudo apt update
    sudo apt install -y gcc-aarch64-linux-gnu
fi

# Check if ARM64 webkitgtk is available
if ! dpkg -l | grep -q "libwebkit2gtk-4.1-dev:arm64"; then
    echo "📦 Installing ARM64 webkitgtk development libraries..."
    sudo dpkg --add-architecture arm64
    sudo apt update
    sudo apt install -y libwebkit2gtk-4.1-dev:arm64 libssl-dev:arm64
fi

# Set up cross-compilation environment
echo "🔧 Setting up cross-compilation environment..."
if [ -d "/usr/aarch64-linux-gnu/" ]; then
    export PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu/
else
    echo "⚠️  /usr/aarch64-linux-gnu/ does not exist. PKG_CONFIG_SYSROOT_DIR will not be set."
    echo "   Please install the necessary cross-compilation toolchain and libraries for aarch64."
    # Uncomment the next line to create the directory automatically (if desired):
    # sudo mkdir -p /usr/aarch64-linux-gnu/
fi
export CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc
export CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++

# Create .cargo/config.toml if it doesn't exist
mkdir -p .cargo
if [ ! -f ".cargo/config.toml" ]; then
    echo "📝 Creating .cargo/config.toml for ARM64 cross-compilation..."
    cat > .cargo/config.toml << EOF
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"
EOF
fi

# Build the frontend
echo "🔨 Building frontend..."
npm run build

# Build the ARM64 application
echo "🔨 Building ARM64 application..."
cd src-tauri
cargo tauri build --target aarch64-unknown-linux-gnu --release
cd ..

echo "✅ ARM64 Debian package build complete!"
echo ""
echo "📦 Package location: src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/"
echo ""
echo "📋 Package contents:"
echo "- ARM64 binary optimized for Debian-based systems"
echo "- Desktop integration (menu entry, icons)"
echo "- System dependencies (webkitgtk, gtk, appindicator)"
echo "- Setup scripts included in /usr/share/guestbook-kiosk/"
echo ""
echo "🚀 Installation:"
echo "sudo dpkg -i src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/*.deb"
echo ""
echo "🔗 For more information, see: https://tauri.app/distribute/debian/"
echo ""
echo "📝 Note: The appliance-setup scripts are included in the package for easy deployment."
