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

# Install Python dependencies for sidecar binary building (if needed)
echo "🐍 Installing Python dependencies for sidecar binary building..."
sudo apt install -y \
  python3 \
  python3-pip \
  python3-dev \
  python3-pyinstaller \
  libcamera-dev \
  libavcodec-dev \
  libavformat-dev \
  libavutil-dev \
  libswscale-dev \
  libzbar0 \
  zbar-tools \
  python3-opencv \
  python3-flask \
  python3-picamera2 \
  python3-pyzbar \
  python3-psutil \
  libatlas-base-dev \
  libgfortran5 || {
  echo "⚠️  Warning: Some Python dependencies failed to install. Sidecar binary building may fail."
}

# Prepare sidecar binary for AppImage bundling
echo "📦 Preparing camera sidecar binary for bundling..."
SIDECAR_BINARY_URL="${SIDECAR_BINARY_URL:-https://github.com/DaveLuhman/guestbook-sidecar/releases/download/v1.0.0/camera_sidecar}"
SIDECAR_SOURCE_DIR="${SIDECAR_SOURCE_DIR:-sidecar}"
SIDECAR_BINARY_PATH="${SIDECAR_SOURCE_DIR}/camera_sidecar"

# Ensure sidecar submodule is initialized (if using git)
if command -v git &> /dev/null && [[ -d ".git" ]]; then
    if [[ -f ".gitmodules" ]] && grep -q "sidecar" ".gitmodules" 2>/dev/null; then
        echo " + Checking sidecar submodule..."
        if [[ ! -f "${SIDECAR_SOURCE_DIR}/camera_sidecar.py" ]]; then
            echo " + Initializing sidecar submodule..."
            git submodule update --init --recursive sidecar || {
                echo "⚠️  Warning: Failed to initialize sidecar submodule"
            }
        fi
    fi
fi

# Check if sidecar binary already exists
if [[ -f "${SIDECAR_BINARY_PATH}" && -x "${SIDECAR_BINARY_PATH}" ]]; then
    echo "✅ Sidecar binary already exists at ${SIDECAR_BINARY_PATH}"
else
    echo " + Sidecar binary not found, attempting to download or build..."

    # Try to download pre-built binary first
    if [[ -n "${SIDECAR_BINARY_URL}" ]]; then
        echo " + Attempting to download sidecar binary from ${SIDECAR_BINARY_URL}..."
        mkdir -p "${SIDECAR_SOURCE_DIR}"
        if curl -fsSL "${SIDECAR_BINARY_URL}" -o "${SIDECAR_BINARY_PATH}"; then
            chmod +x "${SIDECAR_BINARY_PATH}"
            echo "✅ Downloaded sidecar binary successfully"
        else
            echo " ! Download failed, will attempt to build from source"
            rm -f "${SIDECAR_BINARY_PATH}"
        fi
    fi

    # If download failed or URL not provided, try to build from source
    if [[ ! -f "${SIDECAR_BINARY_PATH}" ]]; then
        if [[ -d "${SIDECAR_SOURCE_DIR}" && -f "${SIDECAR_SOURCE_DIR}/camera_sidecar.py" ]]; then
            echo " + Building sidecar binary from source using PyInstaller..."
            cd "${SIDECAR_SOURCE_DIR}"
            if python3 -m PyInstaller --version &> /dev/null; then
                # Helper function to run PyInstaller with fallback logic
                run_pyinstaller_build() {
                    if [[ -f "camera_sidecar.spec" ]]; then
                        python3 -m PyInstaller camera_sidecar.spec || {
                            echo "⚠️  PyInstaller spec build failed, trying direct command..."
                            python3 -m PyInstaller \
                                --onefile \
                                --name camera_sidecar \
                                --hidden-import av.bytesource \
                                --hidden-import av.buffer \
                                --hidden-import av.frame \
                                --hidden-import av.audio.frame \
                                --hidden-import av.video.frame \
                                --hidden-import picamera2.encoders \
                                --hidden-import picamera2.encoders.encoder \
                                --collect-all av \
                                --collect-all picamera2 \
                                --collect-all cv2 \
                                camera_sidecar.py || {
                            echo "❌ Failed to build sidecar binary"
                            return 1
                        }
                    }
                    else
                        python3 -m PyInstaller \
                            --onefile \
                            --name camera_sidecar \
                            --hidden-import av.bytesource \
                            --hidden-import av.buffer \
                            --hidden-import av.frame \
                            --hidden-import av.audio.frame \
                            --hidden-import av.video.frame \
                            --hidden-import picamera2.encoders \
                            --hidden-import picamera2.encoders.encoder \
                            --collect-all av \
                            --collect-all picamera2 \
                            --collect-all cv2 \
                            camera_sidecar.py || {
                        echo "❌ Failed to build sidecar binary"
                        return 1
                    }
                    fi
                }

                # Try build-binary.sh first if it exists (optional convenience wrapper)
                if [[ -f "build-binary.sh" ]]; then
                    bash build-binary.sh || {
                        echo "⚠️  build-binary.sh failed, trying PyInstaller directly..."
                        run_pyinstaller_build || {
                            cd ..
                            exit 1
                        }
                    }
                else
                    # build-binary.sh doesn't exist, use PyInstaller directly
                    echo " + build-binary.sh not found, using PyInstaller directly..."
                    run_pyinstaller_build || {
                        cd ..
                        exit 1
                    }
                fi

                # Copy built binary to expected location
                if [[ -f "dist/camera_sidecar" ]]; then
                    cp -f "dist/camera_sidecar" "camera_sidecar"
                    chmod +x "camera_sidecar"
                    echo "✅ Built sidecar binary successfully"
                else
                    echo "❌ Built binary not found in dist/ directory"
                    cd ..
                    exit 1
                fi
            else
                echo "❌ PyInstaller not available. Install with: apt-get install python3-pyinstaller"
                cd ..
                exit 1
            fi
            cd ..
        else
            echo "⚠️  Sidecar source directory or camera_sidecar.py not found"
            echo "   The AppImage build will continue, but the sidecar binary won't be bundled."
            echo "   You can manually place a binary at ${SIDECAR_BINARY_PATH} before building."
            echo "   Or download it from: ${SIDECAR_BINARY_URL}"
        fi
    fi
fi

echo ""
echo "✅ Tauri dependencies installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npm install"
echo "2. Run: npm run tauri build"
echo ""
if [[ -f "${SIDECAR_BINARY_PATH}" ]]; then
    echo "✅ Sidecar binary ready for bundling: ${SIDECAR_BINARY_PATH}"
else
    echo "⚠️  Warning: Sidecar binary not found. AppImage will be built without it."
    echo "   The sidecar can be installed separately via the setup script."
fi
echo ""
echo "🔗 For more information, visit: https://tauri.app/v1/guides/getting-started/setup/linux"
