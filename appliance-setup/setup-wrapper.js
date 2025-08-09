#!/usr/bin/env node

/**
 * Cross-platform setup wrapper for Guestbook Kiosk Client
 * Consolidates setup logic and provides better platform compatibility
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const CONFIG = {
    appName: 'guestbook-kiosk',
    installPath: '/opt/guestbook-kiosk',
    serviceName: 'guestbook-kiosk',
    requiredFiles: [
        'src-tauri/target/release/guestbook-tauri-ts',
        'dist',
        'public',
        'appliance-setup',
        'README.md'
    ]
};

// Utility functions
function isWindows() {
    return os.platform() === 'win32';
}

function isLinux() {
    return os.platform() === 'linux';
}

function isMac() {
    return os.platform() === 'darwin';
}

function runCommand(command, options = {}) {
    console.log(`🔄 Running: ${command}`);
    try {
        execSync(command, {
            stdio: 'inherit',
            ...options
        });
        return true;
    } catch (error) {
        console.error(`❌ Command failed: ${command}`);
        return false;
    }
}

function checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check Node.js
    if (!runCommand('node --version', { stdio: 'pipe' })) {
        console.error('❌ Node.js is not installed');
        return false;
    }

    // Check npm
    if (!runCommand('npm --version', { stdio: 'pipe' })) {
        console.error('❌ npm is not installed');
        return false;
    }

    // Check Rust (only on Linux/Mac)
    if ((isLinux() || isMac()) && !runCommand('cargo --version', { stdio: 'pipe' })) {
          console.error('❌ Rust is not installed');
          console.log('💡 Run: ./appliance-setup/install-tauri-deps.sh');
          return false;
    }


    console.log('✅ Prerequisites check passed');
    return true;
}

function installDependencies() {
    console.log('📦 Installing Node.js dependencies...');
    if (!runCommand('npm install')) {
        return false;
    }
    return true;
}

function buildApplication() {
    console.log('🔨 Building application...');

    // Build frontend
    if (!runCommand('npm run build')) {
        return false;
    }

    // Build Rust backend
    if (isLinux() || isMac()) {
        if (!runCommand('cd src-tauri && cargo build --release && cd ..')) {
            return false;
        }
    } else if (isWindows()) {
        if (!runCommand('cd src-tauri && cargo build --release && cd ..')) {
            return false;
        }
    }

    return true;
}

function setupLinuxService() {
    if (!isLinux()) {
        console.log('ℹ️ Linux service setup skipped (not on Linux)');
        return true;
    }

    console.log('🚀 Setting up Linux service...');

    // Check if running as root
    if (process.getuid && process.getuid() !== 0) {
        console.error('❌ This script requires root privileges on Linux');
        console.log('💡 Run: sudo node appliance-setup/setup-wrapper.js');
        return false;
    }

    // Get target user
    const targetUser = process.env.SUDO_USER || process.env.USER;
    if (!targetUser || targetUser === 'root') {
        console.error('❌ Cannot determine target user');
        return false;
    }

    // Clear existing installation
    console.log('🧹 Clearing existing installation...');
    runCommand(`rm -rf ${CONFIG.installPath}`);

    // Create directory
    runCommand(`mkdir -p ${CONFIG.installPath}`);

    // Copy files
    CONFIG.requiredFiles.forEach(file => {
        if (fs.existsSync(file)) {
            runCommand(`cp -r ${file} ${CONFIG.installPath}/`);
        } else {
            console.warn(`⚠️ Warning: ${file} not found`);
        }
    });

    // Set ownership
    runCommand(`chown -R ${targetUser}:${targetUser} ${CONFIG.installPath}`);

    // Create systemd service
    const serviceContent = `[Unit]
Description=Guestbook Kiosk Client
After=network.target graphical-session.target
Wants=network.target

[Service]
Type=simple
User=${targetUser}
WorkingDirectory=${CONFIG.installPath}
ExecStart=${CONFIG.installPath}/src-tauri/target/release/guestbook-tauri-ts
Restart=always
RestartSec=10
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target`;

    fs.writeFileSync(`/etc/systemd/system/${CONFIG.serviceName}.service`, serviceContent);

    // Enable service
    runCommand('systemctl daemon-reload');
    runCommand(`systemctl enable ${CONFIG.serviceName}`);

    console.log('✅ Linux service setup complete');
    return true;
}

function showNextSteps() {
    console.log('\n🎉 Setup complete!');
    console.log('\n📋 Next steps:');

    if (isLinux()) {
        console.log('1. Restart your shell or run: source ~/.cargo/env');
        console.log('2. Start the service: sudo ./appliance-setup/manage-service.sh start');
        console.log('3. Check status: sudo ./appliance-setup/manage-service.sh status');
    } else {
        console.log('1. Run: npm run dev (to start development server)');
        console.log('2. Run: npm run tauri dev (to start Tauri development)');
    }

    console.log('\n🔗 For more information, see the README.md file');
}

// Main execution
function main() {
    const command = process.argv[2];

    console.log('🚀 Guestbook Kiosk Client Setup');
    console.log(`📱 Platform: ${os.platform()}`);
    console.log('');

    switch (command) {
        case 'first-run':
            console.log('🎯 Running first-run setup...');
            if (!checkPrerequisites()) process.exit(1);
            if (!installDependencies()) process.exit(1);
            if (!buildApplication()) process.exit(1);
            if (!setupLinuxService()) process.exit(1);
            showNextSteps();
            break;

        case 'build-arm64':
            if (!isLinux()) {
                console.error('❌ ARM64 build is only supported on Linux');
                process.exit(1);
            }
            console.log('🎯 Building ARM64 Debian package...');
            if (!checkPrerequisites()) process.exit(1);
            if (!installDependencies()) process.exit(1);
            if (!buildApplication()) process.exit(1);
            console.log('✅ ARM64 build complete');
            break;

        default:
            console.log('Usage: node setup-wrapper.js <command>');
            console.log('');
            console.log('Commands:');
            console.log('  first-run    Complete first-time setup');
            console.log('  build-arm64  Build ARM64 Debian package (Linux only)');
            process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    checkPrerequisites,
    installDependencies,
    buildApplication,
    setupLinuxService
};
