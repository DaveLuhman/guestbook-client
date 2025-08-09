#!/bin/bash

# Guestbook Kiosk Service Management Script
# This script provides easy commands to manage the guestbook-kiosk systemd service

SERVICE_NAME="guestbook-kiosk"

# Function to check if service exists
check_service() {
    if ! systemctl list-unit-files | grep -q "$SERVICE_NAME.service"; then
        echo "❌ Service $SERVICE_NAME.service not found."
        echo "💡 Run the first-run setup script to install the service: npm run first-run"
        echo "💡 Or install manually: sudo ./appliance-setup/manage-service.sh install"
        exit 1
    fi
}

# Function to show usage
show_usage() {
    echo "🔧 Guestbook Kiosk Service Management"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start     - Start the guestbook kiosk service"
    echo "  stop      - Stop the guestbook kiosk service"
    echo "  restart   - Restart the guestbook kiosk service"
    echo "  status    - Show service status"
    echo "  logs      - Show service logs (follow mode)"
    echo "  enable    - Enable service to start on boot"
    echo "  disable   - Disable service from starting on boot"
    echo "  install   - Install the service (requires sudo)"
    echo "  uninstall - Remove the service (requires sudo)"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 status"
    echo "  $0 logs"
}

# Check if running as root for certain commands
check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo "❌ This script requires root privileges. Use 'sudo $0 $1'"
        echo "💡 All commands in this script require root access for system service management."
        exit 1
    fi
}

# Main script logic
case "$1" in
    start)
        check_service
        echo "🚀 Starting $SERVICE_NAME service..."
        systemctl start $SERVICE_NAME
        echo "✅ Service started"
        ;;
    stop)
        check_service
        echo "🛑 Stopping $SERVICE_NAME service..."
        systemctl stop $SERVICE_NAME
        echo "✅ Service stopped"
        ;;
    restart)
        check_service
        echo "🔄 Restarting $SERVICE_NAME service..."
        systemctl restart $SERVICE_NAME
        echo "✅ Service restarted"
        ;;
    status)
        check_service
        echo "📊 Service status:"
        systemctl status $SERVICE_NAME --no-pager
        ;;
    logs)
        check_service
        echo "📋 Service logs (press Ctrl+C to exit):"
        journalctl -u $SERVICE_NAME -f
        ;;
    enable)
        check_root
        echo "✅ Enabling $SERVICE_NAME service to start on boot..."
        systemctl enable $SERVICE_NAME
        echo "✅ Service enabled"
        ;;
    disable)
        check_root
        echo "❌ Disabling $SERVICE_NAME service from starting on boot..."
        systemctl disable $SERVICE_NAME
        echo "✅ Service disabled"
        ;;
    install)
        check_root
        echo "📦 Installing $SERVICE_NAME service..."

        # Check if we're in the project directory
        if [ ! -f "package.json" ]; then
            echo "❌ Error: package.json not found. Please run this script from the project root directory."
            exit 1
        fi

        # Determine the correct user for ownership
        TARGET_USER=${SUDO_USER:-$(logname 2>/dev/null || echo $USER)}
        if [ "$TARGET_USER" = "root" ] || [ -z "$TARGET_USER" ]; then
            echo "❌ Error: Cannot determine target user. Please run this script as a regular user with sudo."
            exit 1
        fi

        # Clear existing installation to ensure clean state
        echo "🧹 Clearing existing installation..."
        rm -rf /opt/guestbook-kiosk

        # Create the application directory
        mkdir -p /opt/guestbook-kiosk

        # Copy only the built application and necessary assets
        cp -r src-tauri/target/release/guestbook-tauri-ts /opt/guestbook-kiosk/
        cp -r dist /opt/guestbook-kiosk/
        cp -r public /opt/guestbook-kiosk/
        cp -r appliance-setup /opt/guestbook-kiosk/
        cp README.md /opt/guestbook-kiosk/
        chown -R $TARGET_USER:$TARGET_USER /opt/guestbook-kiosk/

        # Create systemd service file
        tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Guestbook Kiosk Client
After=network.target graphical-session.target
Wants=network.target

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=/opt/guestbook-kiosk
ExecStart=/opt/guestbook-kiosk/src-tauri/target/release/guestbook-tauri-ts
Restart=always
RestartSec=10
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

        # Reload systemd and enable service
        systemctl daemon-reload
        systemctl enable $SERVICE_NAME

        echo "✅ Service installed and enabled"
        ;;
    uninstall)
        check_root
        echo "🗑️ Uninstalling $SERVICE_NAME service..."

        # Stop and disable service
        systemctl stop $SERVICE_NAME 2>/dev/null || true
        systemctl disable $SERVICE_NAME 2>/dev/null || true

        # Remove service file
        rm -f /etc/systemd/system/$SERVICE_NAME.service

        # Remove application files
        rm -rf /opt/guestbook-kiosk

        # Reload systemd
        systemctl daemon-reload

        echo "✅ Service uninstalled"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
