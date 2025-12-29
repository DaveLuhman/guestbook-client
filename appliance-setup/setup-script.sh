#!/usr/bin/env bash
set -euo pipefail

# Guestbook Client Bootstrap Installer
# - Installs dependencies (including Python3 and camera libraries)
# - Configures env vars
# - Adds udev rules
# - Downloads AppImage (does NOT include camera sidecar binary)
# - Installs camera sidecar to /opt/guestbook/sidecar/ (required)
# - Creates/Enables guestbook-client.service
# - Installs helper CLI (/usr/local/bin/guestbook-cli) for service management
#
# Camera Sidecar:
# The AppImage does NOT include the camera sidecar binary. The sidecar MUST be installed
# separately to /opt/guestbook/sidecar/ (preferred) or /usr/share/guestbook-kiosk/sidecar/.
# The sidecar can be provided via:
#   1. SIDECAR_BINARY_URL (download pre-built binary from URL)
#   2. SIDECAR_SCRIPT_URL (download Python script from URL)
#   3. SRC_SIDECAR_DIR (copy from local directory, e.g., ./sidecar/)
#   4. Manual placement at /opt/guestbook/sidecar/camera_sidecar or camera_sidecar.py
#
# Python dependencies (if using Python script) are managed via apt-get:
#   - python3-opencv (opencv-python)
#   - python3-flask (flask)
#   - python3-picamera2 (picamera2)
#   - python3-psutil (psutil)
#   - python3-pyzbar (pyzbar)
#
# Note: The sidecar binary is preferred over the Python script (no Python dependencies needed).
#       The app will search for the sidecar in /opt/guestbook/sidecar/ first, then fallback paths.

SERVICE_NAME="guestbook-client"

# Feature flags (can be overridden via env)
ADD_UDEV_RULE="${ADD_UDEV_RULE:-1}"
ENABLE_AUTOSTART="${ENABLE_AUTOSTART:-1}"
SETUP_WIFI="${SETUP_WIFI:-1}"

# Core paths (can be overridden via env if needed)
RUSER="${RUSER:-serveradmin}"
RHOME="${RHOME:-/home/${RUSER}}"
DESKTOP_DIR="${DESKTOP_DIR:-${RHOME}/Desktop}"
APP_URL="${APP_URL:-https://github.com/DaveLuhman/guestbook-client/releases/download/0.1.0/Guestbook.AppImage}"
APP_DIR="${APP_DIR:-/opt/guestbook}"
APP_PATH="${APP_PATH:-${APP_DIR}/Guestbook.AppImage}"
UDEV_RULE_PATH="${UDEV_RULE_PATH:-/etc/udev/rules.d/99-hid.rules}"

# Sidecar paths (required - AppImage does NOT include bundled binary)
# Primary location: /opt/guestbook/sidecar/ (preferred)
# Fallback location: /usr/share/guestbook-kiosk/sidecar/
# Note: Rust code checks /opt/guestbook/sidecar/ first, then /usr/share/guestbook-kiosk/sidecar/
SIDECAR_DIR="${SIDECAR_DIR:-/opt/guestbook/sidecar}"
SIDECAR_SCRIPT="${SIDECAR_SCRIPT:-${SIDECAR_DIR}/camera_sidecar.py}"
SIDECAR_BINARY="${SIDECAR_BINARY:-${SIDECAR_DIR}/camera_sidecar}"

# Sidecar download URLs (optional - for fallback Python script or binary)
SIDECAR_SCRIPT_URL="${SIDECAR_SCRIPT_URL:-https://github.com/DaveLuhman/guestbook-sidecar/archive/refs/tags/v1.0.0.zip}"
SIDECAR_BINARY_URL="${SIDECAR_BINARY_URL:-https://github.com/DaveLuhman/guestbook-sidecar/releases/download/v1.0.0/camera_sidecar}"

# Where to install the management helper
MANAGER_URL="${MANAGER_URL:-https://staging.wolfpackguestbook.com/api/guestbook-cli}"
MANAGER_PATH="${MANAGER_PATH:-/usr/local/bin/guestbook-cli}"

# WiFi (optional; override or SETUP_WIFI=0 to skip)
WIFI_SSID="${WIFI_SSID:-MC-iot}"
WIFI_PSK="${WIFI_PSK:-1701Wright}"

# Device IDs
ZEBRA_VID="05e0"
ZEBRA_PID="0600"

# Require root
if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must be run as root."
    exit 1
fi

ensure_env() {
    local key="${1}"
    local value="${2}"

    if ! grep -q "^${key}=" /etc/environment 2>/dev/null; then
        echo "${key}=${value}" >> /etc/environment
        echo " + Added ${key} to /etc/environment"
    else
        echo " = ${key} already present in /etc/environment"
    fi
}

configure_apt_sources() {
    echo "==> Configuring APT sources for bookworm and bookworm-backports..."

    # Check if sources.list.d directory exists
    mkdir -p /etc/apt/sources.list.d

    # Add bookworm main sources if not present
    if ! grep -q "deb.*bookworm.*main" /etc/apt/sources.list 2>/dev/null && \
    ! grep -q "deb.*bookworm.*main" /etc/apt/sources.list.d/*.list 2>/dev/null; then
        echo "deb http://deb.debian.org/debian bookworm main" >> /etc/apt/sources.list
        echo " + Added bookworm main to sources.list"
    else
        echo " = bookworm main already present in sources"
    fi

    # Add bookworm-updates if not present
    if ! grep -q "deb.*bookworm-updates.*main" /etc/apt/sources.list 2>/dev/null && \
    ! grep -q "deb.*bookworm-updates.*main" /etc/apt/sources.list.d/*.list 2>/dev/null; then
        echo "deb http://deb.debian.org/debian bookworm-updates main" >> /etc/apt/sources.list
        echo " + Added bookworm-updates to sources.list"
    else
        echo " = bookworm-updates already present in sources"
    fi

    # Add bookworm-security if not present
    if ! grep -q "deb.*bookworm-security.*main" /etc/apt/sources.list 2>/dev/null && \
    ! grep -q "deb.*bookworm-security.*main" /etc/apt/sources.list.d/*.list 2>/dev/null; then
        echo "deb http://deb.debian.org/debian-security bookworm-security main" >> /etc/apt/sources.list
        echo " + Added bookworm-security to sources.list"
    else
        echo " = bookworm-security already present in sources"
    fi

    # Add bookworm-backports if not present
    if ! grep -q "deb.*bookworm-backports.*main" /etc/apt/sources.list 2>/dev/null && \
    ! grep -q "deb.*bookworm-backports.*main" /etc/apt/sources.list.d/*.list 2>/dev/null; then
        echo "deb http://deb.debian.org/debian bookworm-backports main" >> /etc/apt/sources.list
        echo " + Added bookworm-backports to sources.list"
    else
        echo " = bookworm-backports already present in sources"
    fi
}

install_dependencies() {
    echo "==> Installing runtime dependencies..."
    apt-get update

    # Install base packages first (without zbar and atlas to avoid conflicts)
    echo "==> Installing base runtime dependencies..."
    apt-get install -y \
    curl libfuse2 \
    libwebkit2gtk-4.1-0 \
    libstdc++6 libgcc-s1 libatomic1 ca-certificates xdg-utils dbus \
    xdg-desktop-portal xdg-desktop-portal-gtk \
    gstreamer1.0-tools gstreamer1.0-alsa \
    gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    fonts-dejavu fonts-liberation usbutils \
    network-manager wpasupplicant \
    python3 python3-pip python3-dev\
    libcamera-dev libcamera-tools \
    python3-opencv \
    python3-flask \
    python3-picamera2 \
    python3-psutil \
    libgfortran5

    # Install zbar packages - handle Trixie compatibility
    # In Trixie, zbar-tools depends on libzbar0t64, not libzbar0
    echo "==> Installing zbar packages..."
    if apt-cache show libzbar0t64 &>/dev/null; then
        # Trixie or newer - install zbar-tools first (pulls in libzbar0t64)
        echo " + Detected Trixie/newer Debian, installing zbar-tools (will pull libzbar0t64)..."
        apt-get install -y zbar-tools || echo " ! Warning: zbar-tools installation failed"
    else
        # Older Debian - use libzbar0
        echo " + Using libzbar0 for older Debian versions"
        apt-get install -y libzbar0 zbar-tools || {
            echo " ! Failed to install libzbar0, trying zbar-tools alone..."
            apt-get install -y zbar-tools || echo " ! Warning: zbar-tools installation failed"
        }
    fi

    # Install python3-pyzbar
    # Note: In Trixie, python3-pyzbar may still depend on libzbar0, causing conflicts
    # pyzbar works with libzbar0t64 at runtime, so we can install via pip if apt fails
    echo "==> Installing python3-pyzbar..."
    set +e  # Temporarily disable exit on error for this check
    INSTALL_OUTPUT=$(apt-get install -y python3-pyzbar 2>&1)
    INSTALL_STATUS=$?
    set -e  # Re-enable exit on error

    if [[ "${INSTALL_STATUS}" -eq 0 ]]; then
        echo " + Installed python3-pyzbar via apt"
    elif echo "${INSTALL_OUTPUT}" | grep -qE "(Unable to correct|held broken)"; then
        echo " ! python3-pyzbar has dependency conflicts via apt, installing via pip..."
        echo "   (pyzbar works with libzbar0t64 at runtime)"
        pip3 install pyzbar || echo " ! Warning: Failed to install pyzbar via pip"
    else
        echo " ! Failed to install python3-pyzbar: ${INSTALL_OUTPUT}"
        echo "   Attempting pip install as fallback..."
        pip3 install pyzbar || echo " ! Warning: Failed to install pyzbar via pip"
    fi

    # Install BLAS/LAPACK libraries for OpenCV (handle version conflicts)
    # libatlas-base-dev may have conflicts in Trixie, so try alternatives
    echo "==> Installing BLAS/LAPACK libraries for OpenCV..."
    set +e  # Temporarily disable exit on error for this check
    ATLAS_OUTPUT=$(apt-get install -y libatlas-base-dev 2>&1)
    ATLAS_STATUS=$?
    set -e  # Re-enable exit on error

    if [[ "${ATLAS_STATUS}" -eq 0 ]]; then
        echo " + Installed libatlas-base-dev"
    elif echo "${ATLAS_OUTPUT}" | grep -qE "(Unable to correct|held broken)"; then
        echo " ! libatlas-base-dev has dependency conflicts, trying OpenBLAS alternative..."
        # OpenBLAS is often a better choice on ARM systems anyway
        set +e
        OPENBLAS_OUTPUT=$(apt-get install -y libopenblas-dev libopenblas-base 2>&1)
        OPENBLAS_STATUS=$?
        set -e

        if [[ "${OPENBLAS_STATUS}" -eq 0 ]]; then
            echo " + Installed OpenBLAS as BLAS provider"
        else
            echo " ! OpenBLAS also has conflicts, skipping BLAS library"
            echo "   OpenCV will use its default BLAS implementation"
        fi
    else
        echo " ! Failed to install libatlas-base-dev: ${ATLAS_OUTPUT}"
        echo "   OpenCV will use its default BLAS implementation"
    fi
}

configure_env_vars() {
    echo "==> Ensuring environment variables..."
    ensure_env "WEBKIT_DISABLE_COMPOSITING_MODE" "1"
    ensure_env "GST_AUDIO_SINK" "autoaudiosink"
}

configure_wifi() {
    if [[ "${SETUP_WIFI}" -ne 1 ]]; then
        echo "==> Skipping WiFi configuration (SETUP_WIFI=0)"
        return
    fi

    echo "==> Configuring WiFi for SSID '${WIFI_SSID}'..."
    systemctl enable NetworkManager || true
    systemctl start NetworkManager || true
    sleep 3

    if nmcli -t -f NAME connection show | grep -Fxq "${WIFI_SSID}"; then
        echo " + Updating existing connection"
        nmcli connection modify "${WIFI_SSID}" \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "${WIFI_PSK}" \
        connection.autoconnect yes
    else
        echo " + Creating new connection"
        nmcli connection add \
        type wifi \
        con-name "${WIFI_SSID}" \
        ifname wlan0 \
        ssid "${WIFI_SSID}" \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "${WIFI_PSK}" \
        connection.autoconnect yes
    fi
}

configure_user_groups() {
    echo "==> Adding ${RUSER} to plugdev,input,dialout..."
    usermod -aG plugdev,input,dialout "${RUSER}" || true
}

configure_udev() {
    if [[ "${ADD_UDEV_RULE}" -ne 1 ]]; then
        echo "==> Skipping udev rule creation (ADD_UDEV_RULE=0)"
        return
    fi

    echo "==> Writing udev rules to ${UDEV_RULE_PATH}..."
    cat > "${UDEV_RULE_PATH}" <<RULE
# Zebra / Symbol scanner
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="${ZEBRA_VID}", ATTRS{idProduct}=="${ZEBRA_PID}", MODE="0666", GROUP="plugdev", SYMLINK+="zebra_scanner_%k"
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{idVendor}=="${ZEBRA_VID}", ATTRS{idProduct}=="${ZEBRA_PID}", MODE="0666", GROUP="input", SYMLINK+="input/zebra_scanner"

# MagTek swiper
SUBSYSTEM=="usb", ATTR{idVendor}=="0801", ATTR{idProduct}=="0002", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0801", ATTRS{idProduct}=="0002", MODE="0666", GROUP="plugdev", SYMLINK+="magtek_swiper_%k"
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{idVendor}=="0801", ATTRS{idProduct}=="0002", MODE="0666", GROUP="input", SYMLINK+="input/magtek_swiper"
RULE

    echo "==> Reloading udev rules..."
    udevadm control --reload-rules || true
    udevadm trigger || true
}

download_appimage() {
    echo "==> Downloading Guestbook AppImage..."
    mkdir -p "${APP_DIR}"
    curl -fsSL "${APP_URL}" -o "${APP_PATH}"
    chmod +x "${APP_PATH}"
    chown "${RUSER}:${RUSER}" "${APP_PATH}" || true
}

install_sidecar() {
    echo "==> Installing camera sidecar (required)..."
    echo "   Note: AppImage does NOT include bundled binary - sidecar must be installed separately."
    echo "   Installing to: ${SIDECAR_DIR}"

    # Create sidecar directory
    mkdir -p "${SIDECAR_DIR}"

    local INSTALLED_SOMETHING=0

    # Download sidecar binary if URL is provided
    if [[ -n "${SIDECAR_BINARY_URL}" ]]; then
        echo " + Downloading sidecar binary from ${SIDECAR_BINARY_URL}..."
        if curl -fsSL "${SIDECAR_BINARY_URL}" -o "${SIDECAR_BINARY}"; then
            chmod 755 "${SIDECAR_BINARY}"
            chown root:root "${SIDECAR_BINARY}" || true
            echo " + Sidecar binary installed: ${SIDECAR_BINARY}"
            INSTALLED_SOMETHING=1
        else
            echo " ! Failed to download sidecar binary"
        fi
    fi

    # Download sidecar script if URL is provided
    if [[ -n "${SIDECAR_SCRIPT_URL}" ]]; then
        echo " + Downloading sidecar script from ${SIDECAR_SCRIPT_URL}..."
        local TEMP_FILE=$(mktemp)
        if curl -fsSL "${SIDECAR_SCRIPT_URL}" -o "${TEMP_FILE}"; then
            # Check if downloaded file is a zip archive
            if file "${TEMP_FILE}" | grep -q "Zip archive"; then
                echo " + Extracting zip archive..."
                local TEMP_DIR=$(mktemp -d)
                if unzip -q "${TEMP_FILE}" -d "${TEMP_DIR}"; then
                    # Find camera_sidecar.py in extracted directory
                    local EXTRACTED_SCRIPT=$(find "${TEMP_DIR}" -name "camera_sidecar.py" -type f | head -n 1)
                    if [[ -n "${EXTRACTED_SCRIPT}" && -f "${EXTRACTED_SCRIPT}" ]]; then
                        cp -f "${EXTRACTED_SCRIPT}" "${SIDECAR_SCRIPT}"
                        chmod 755 "${SIDECAR_SCRIPT}"
                        chown root:root "${SIDECAR_SCRIPT}" || true
                        echo " + Sidecar script extracted and installed: ${SIDECAR_SCRIPT}"
                        INSTALLED_SOMETHING=1
                    else
                        echo " ! camera_sidecar.py not found in zip archive"
                    fi
                else
                    echo " ! Failed to extract zip archive"
                fi
                rm -rf "${TEMP_DIR}"
            else
                # Not a zip, treat as direct script download
                cp -f "${TEMP_FILE}" "${SIDECAR_SCRIPT}"
                chmod 755 "${SIDECAR_SCRIPT}"
                chown root:root "${SIDECAR_SCRIPT}" || true
                echo " + Sidecar script installed: ${SIDECAR_SCRIPT}"
                INSTALLED_SOMETHING=1
            fi
            rm -f "${TEMP_FILE}"
        else
            echo " ! Failed to download sidecar script"
            rm -f "${TEMP_FILE}"
        fi
    fi

    # Check if sidecar files exist in a local source directory (for development/testing)
    local SRC_SIDECAR_DIR="${SRC_SIDECAR_DIR:-}"
    if [[ -n "${SRC_SIDECAR_DIR}" && -d "${SRC_SIDECAR_DIR}" ]]; then
        if [[ -f "${SRC_SIDECAR_DIR}/camera_sidecar" ]]; then
            echo " + Copying sidecar binary from ${SRC_SIDECAR_DIR}..."
            cp -f "${SRC_SIDECAR_DIR}/camera_sidecar" "${SIDECAR_BINARY}"
            chmod 755 "${SIDECAR_BINARY}"
            chown root:root "${SIDECAR_BINARY}" || true
            INSTALLED_SOMETHING=1
        fi
        if [[ -f "${SRC_SIDECAR_DIR}/camera_sidecar.py" ]]; then
            echo " + Copying sidecar script from ${SRC_SIDECAR_DIR}..."
            cp -f "${SRC_SIDECAR_DIR}/camera_sidecar.py" "${SIDECAR_SCRIPT}"
            chmod 755 "${SIDECAR_SCRIPT}"
            chown root:root "${SIDECAR_SCRIPT}" || true
            INSTALLED_SOMETHING=1
        fi
    fi

    # If nothing was installed, this is an error since sidecar is required
    if [[ "${INSTALLED_SOMETHING}" -eq 0 ]]; then
        echo ""
        echo "❌ ERROR: Camera sidecar installation failed!"
        echo ""
        echo "The camera sidecar is REQUIRED and must be installed to ${SIDECAR_DIR}/"
        echo "The AppImage does NOT include a bundled sidecar binary."
        echo ""
        echo "To install the sidecar, provide one of:"
        echo "  1. SIDECAR_BINARY_URL - URL to download pre-built binary"
        echo "  2. SIDECAR_SCRIPT_URL - URL to download Python script"
        echo "  3. SRC_SIDECAR_DIR - Local directory containing sidecar files"
        echo ""
        echo "Example:"
        echo "  SIDECAR_BINARY_URL=https://github.com/DaveLuhman/guestbook-sidecar/releases/download/v1.0.0/camera_sidecar"
        echo ""
        exit 1
    fi

    # Verify Python dependencies if script was installed
    if [[ -f "${SIDECAR_SCRIPT}" ]]; then
        # Verify shebang is present
        if ! head -n 1 "${SIDECAR_SCRIPT}" | grep -q "^#!/usr/bin/env python3"; then
            echo " ! Warning: Sidecar script may be missing correct shebang (#!/usr/bin/env python3)"
        fi

        # Verify python3 is available
        if ! command -v python3 &> /dev/null; then
            echo " ! Warning: python3 not found in PATH (sidecar script may not work)"
        else
            echo " + Python3 found: $(python3 --version)"
        fi

        # Verify critical Python packages are importable
        echo " + Verifying Python dependencies..."
        local DEPS_OK=1
        if python3 -c "import flask" 2>/dev/null; then
            echo "   ✓ flask installed (via python3-flask)"
        else
            echo "   ✗ flask not found"
            DEPS_OK=0
        fi

        if python3 -c "import picamera2" 2>/dev/null; then
            echo "   ✓ picamera2 installed (via python3-picamera2)"
        else
            echo "   ✗ picamera2 not found"
            DEPS_OK=0
        fi

        if python3 -c "import cv2" 2>/dev/null; then
            echo "   ✓ opencv-python installed (via python3-opencv)"
        else
            echo "   ✗ opencv-python not found"
            DEPS_OK=0
        fi

        if python3 -c "from pyzbar import pyzbar" 2>/dev/null; then
            echo "   ✓ pyzbar installed (via python3-pyzbar)"
        else
            echo "   ✗ pyzbar not found"
            DEPS_OK=0
        fi

        if python3 -c "import psutil" 2>/dev/null; then
            echo "   ✓ psutil installed (via python3-psutil)"
        else
            echo "   ✗ psutil not found"
            DEPS_OK=0
        fi

        if [[ "${DEPS_OK}" -eq 0 ]]; then
            echo " ! Warning: Some Python dependencies are missing - sidecar script may not work"
        fi
    fi

    echo " + Sidecar fallback installation complete"
    if [[ -f "${SIDECAR_BINARY}" ]]; then
        echo "   Binary: ${SIDECAR_BINARY}"
    fi
    if [[ -f "${SIDECAR_SCRIPT}" ]]; then
        echo "   Script: ${SIDECAR_SCRIPT}"
    fi
}

install_manager_helper() {
    echo "==> Installing guestbook-cli helper to ${MANAGER_PATH}..."
    mkdir -p "$(dirname "${MANAGER_PATH}")"
    if [[ -n "${MANAGER_URL}" ]]; then
        curl -fsSL "${MANAGER_URL}" -o "${MANAGER_PATH}"
        chmod +x "${MANAGER_PATH}"
    else
        echo " ! MANAGER_URL not set; skipping helper download."
    fi
}

create_desktop_symlink() {
    echo "==> Creating Desktop symlink..."
    mkdir -p "${DESKTOP_DIR}"
    ln -sf "${APP_PATH}" "${DESKTOP_DIR}/Guestbook.AppImage"
    chown -R "${RUSER}:${RUSER}" "${DESKTOP_DIR}" || true
}

create_systemd_service() {
    echo "==> Creating /etc/systemd/system/${SERVICE_NAME}.service..."

    # Determine XAUTHORITY path for the user
    XAUTH_PATH="${RHOME}/.Xauthority"

    cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Guestbook Client
After=network-online.target graphical.target
Wants=network-online.target

[Service]
Type=simple
User=${RUSER}
WorkingDirectory=${APP_DIR}
ExecStart=${APP_PATH}
Restart=always
RestartSec=10
Environment=DISPLAY=:0
Environment=XAUTHORITY=${XAUTH_PATH}
Environment=WEBKIT_DISABLE_COMPOSITING_MODE=1
Environment=GST_AUDIO_SINK=autoaudiosink
# Suppress GTK debug messages (harmless WebKitGTK internal warnings)
Environment=G_MESSAGES_DEBUG=

[Install]
WantedBy=graphical.target
EOF

    systemctl daemon-reload

    # Setup X11 authentication - allow local connections
    echo "==> Setting up X11 authentication..."
    if command -v xhost &>/dev/null; then
        # Allow local connections to X server (for systemd service)
        # This needs to run as the user who owns the display
        su - "${RUSER}" -c "DISPLAY=:0 xhost +local:" 2>/dev/null || \
        echo " ! Note: xhost setup skipped (may need manual 'xhost +local:' if issues persist)"
    fi
}

enable_autostart() {
    if [[ "${ENABLE_AUTOSTART}" -ne 1 ]]; then
        echo "==> Skipping autostart (ENABLE_AUTOSTART=0)"
        return
    fi

    echo "==> Enabling and starting ${SERVICE_NAME}.service..."
    if systemctl enable "${SERVICE_NAME}.service" && systemctl start "${SERVICE_NAME}.service"; then
        echo " + Service enabled and started"
    else
        echo " ! Service file created, but enabling/starting failed. Check systemd logs."
    fi
}

uninstall_service() {
    echo "==> Stopping and disabling ${SERVICE_NAME}.service (if present)..."
    systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
    systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true

    echo "==> Removing service file..."
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload || true

    echo "==> Leaving ${APP_PATH} in place (remove manually if desired)."
}

CMD="${1:-install}"

case "${CMD}" in
    install)
        configure_apt_sources
        install_dependencies
        configure_env_vars
        configure_wifi
        configure_user_groups
        configure_udev
        download_appimage
        install_sidecar
        install_manager_helper
        create_desktop_symlink
        create_systemd_service
        enable_autostart

        echo
        echo "✓ Installation complete!"
        echo ""
        echo "Service: ${SERVICE_NAME}.service"
        echo "Helper:  ${MANAGER_PATH} (e.g. 'guestbook-cli status')"
        echo "AppImage: ${APP_PATH}"
        echo ""
        echo "Camera Sidecar:"
        if [[ -f "${SIDECAR_BINARY}" ]]; then
            echo "  - Binary installed: ${SIDECAR_BINARY} (preferred, no Python required)"
        fi
        if [[ -f "${SIDECAR_SCRIPT}" ]]; then
            echo "  - Python script installed: ${SIDECAR_SCRIPT}"
        fi
        echo "  - Location: ${SIDECAR_DIR}/"
        echo "  - Note: AppImage does NOT include bundled sidecar - sidecar is installed separately"
        echo ""
    ;;
    uninstall)
        uninstall_service
        echo "Uninstall complete."
    ;;
    *)
        echo "Usage: ${0} [install|uninstall]"
        exit 1
    ;;
esac
