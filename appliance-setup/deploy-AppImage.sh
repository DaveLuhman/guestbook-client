#!/usr/bin/env bash
set -euo pipefail

# Deploy AppImage Script
# Copies the built AppImage to the deployment location and restarts the service

SERVICE_NAME="guestbook-client"
APP_DIR="${APP_DIR:-/opt/guestbook}"
APP_PATH="${APP_PATH:-${APP_DIR}/Guestbook.AppImage}"
BUILD_DIR="${BUILD_DIR:-./src-tauri/target/release/bundle/appimage}"

# Colors for output (if terminal supports it)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

error() {
    echo -e "${RED}❌ Error:${NC} $1" >&2
    exit 1
}

info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

# Check if running as root
if [[ "${EUID}" -ne 0 ]]; then
    error "This script must be run as root (for systemctl and /opt/guestbook access)"
fi

# Check if build directory exists
if [[ ! -d "${BUILD_DIR}" ]]; then
    error "Build directory not found: ${BUILD_DIR}\n   Run 'npm run tauri build' first to build the AppImage"
fi

# Find AppImage file (handle different naming patterns)
info "Searching for AppImage in ${BUILD_DIR}..."
APPIMAGE_SOURCE=$(find "${BUILD_DIR}" -maxdepth 1 -name "*.AppImage" -type f | head -n 1)

if [[ -z "${APPIMAGE_SOURCE}" ]]; then
    error "No AppImage found in ${BUILD_DIR}\n   Expected pattern: *.AppImage\n   Run 'npm run tauri build' first"
fi

APPIMAGE_FILENAME=$(basename "${APPIMAGE_SOURCE}")
info "Found AppImage: ${APPIMAGE_FILENAME}"
info "Source: ${APPIMAGE_SOURCE}"
info "Destination: ${APP_PATH}"

# Verify source file is readable
if [[ ! -r "${APPIMAGE_SOURCE}" ]]; then
    error "Cannot read source AppImage: ${APPIMAGE_SOURCE}"
fi

# Check file size (basic sanity check - AppImages should be reasonably large)
FILE_SIZE=$(stat -f%z "${APPIMAGE_SOURCE}" 2>/dev/null || stat -c%s "${APPIMAGE_SOURCE}" 2>/dev/null)
if [[ "${FILE_SIZE}" -lt 1000000 ]]; then
    warning "AppImage file seems unusually small (${FILE_SIZE} bytes). This might indicate a build issue."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        error "Deployment cancelled by user"
    fi
fi

# Create destination directory if it doesn't exist
if [[ ! -d "${APP_DIR}" ]]; then
    info "Creating destination directory: ${APP_DIR}"
    mkdir -p "${APP_DIR}" || error "Failed to create directory: ${APP_DIR}"
fi

# Backup existing AppImage if it exists
if [[ -f "${APP_PATH}" ]]; then
    BACKUP_PATH="${APP_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    info "Backing up existing AppImage to: ${BACKUP_PATH}"
    cp "${APP_PATH}" "${BACKUP_PATH}" || error "Failed to backup existing AppImage"
    success "Backup created: ${BACKUP_PATH}"
fi

# Stop service if it exists and is running
# Use --no-legend to remove header, escape dot in service name for exact match
if systemctl list-unit-files --type=service --no-legend 2>/dev/null | grep -E "^${SERVICE_NAME}\.service" > /dev/null 2>&1; then
    if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
        info "Stopping ${SERVICE_NAME}.service..."
        systemctl stop "${SERVICE_NAME}.service" || error "Failed to stop ${SERVICE_NAME}.service"
        success "Service stopped"
    else
        info "Service ${SERVICE_NAME}.service is not running"
    fi
else
    warning "Service ${SERVICE_NAME}.service not found. Skipping service management."
fi

# Copy AppImage
info "Copying AppImage..."
cp "${APPIMAGE_SOURCE}" "${APP_PATH}" || error "Failed to copy AppImage"

# Verify copy succeeded
if [[ ! -f "${APP_PATH}" ]]; then
    error "Copy failed - destination file does not exist: ${APP_PATH}"
fi

# Set permissions
info "Setting permissions..."
chmod +x "${APP_PATH}" || error "Failed to set executable permission"
chown root:root "${APP_PATH}" || error "Failed to set ownership"

# Verify permissions
if [[ ! -x "${APP_PATH}" ]]; then
    error "AppImage is not executable after chmod"
fi

# Get file info for confirmation
NEW_SIZE=$(stat -f%z "${APP_PATH}" 2>/dev/null || stat -c%s "${APP_PATH}" 2>/dev/null)
success "AppImage deployed successfully"
info "File size: $(numfmt --to=iec-i --suffix=B "${NEW_SIZE}" 2>/dev/null || echo "${NEW_SIZE} bytes")"

# Start service if it exists
# Use --no-legend to remove header, escape dot in service name for exact match
if systemctl list-unit-files --type=service --no-legend 2>/dev/null | grep -E "^${SERVICE_NAME}\.service" > /dev/null 2>&1; then
    info "Starting ${SERVICE_NAME}.service..."
    if systemctl start "${SERVICE_NAME}.service"; then
        success "Service started successfully"

        # Wait a moment and check if service is running
        sleep 2
        if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
            success "Service is running"
        else
            warning "Service started but may not be running properly. Check status with: systemctl status ${SERVICE_NAME}.service"
        fi
    else
        error "Failed to start ${SERVICE_NAME}.service"
    fi
fi

echo ""
success "Deployment complete!"
info "AppImage location: ${APP_PATH}"
if [[ -n "${BACKUP_PATH:-}" ]]; then
    info "Backup location: ${BACKUP_PATH}"
fi
echo ""
info "To verify the deployment:"
echo "  systemctl status ${SERVICE_NAME}.service"
echo "  ls -lh ${APP_PATH}"