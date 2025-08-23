#!/usr/bin/env node

/**
 * Cross-platform setup wrapper for Guestbook Client
 * Consolidates setup logic and provides better platform compatibility
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';

// Configuration
const CONFIG = {
    appName: 'guestbook',
    installPath: '/opt/guestbook',
    serviceName: 'guestbook',
    requiredFiles: [
        'src-tauri/target/release/bundle/appimage/Guestbook.AppImage',
        'appliance-setup',
        'README.md'
    ]
};

// Platform detection
const PLATFORM = platform();
const IS = {
    windows: PLATFORM === 'win32',
    linux: PLATFORM === 'linux',
    mac: PLATFORM === 'darwin',
};

// Utility functions
function runCommand(command, options = {}) {
    console.log(`🔄 Running: ${command}`);
    try {
        execSync(command, {
            stdio: 'inherit',
            ...options
        });
        return true;
    } catch {
        console.error(`❌ Command failed: ${command}`);
        return false;
    }
}

function checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check Node.js
    if (!runCommand('node --version', { stdio: 'pipe' })) {
        console.log('💡 Run: ./appliance-setup/install-tauri-deps.sh to install dependencies before installing the service.');
        return false;
    }

    // Check npm
    if (!runCommand('npm --version', { stdio: 'pipe' })) {
        console.log('💡 Run: ./appliance-setup/install-tauri-deps.sh to install dependencies before installing the service.');
        return false;
    }

    // Check Rust (only on Linux/Mac)
    if ((IS.linux || IS.mac) && !runCommand('cargo --version', { stdio: 'pipe' })) {
        console.error('❌ Rust is not installed');
        console.log('💡 Run: ./appliance-setup/install-tauri-deps.sh to install dependencies before installing the service.');
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
    if (!runCommand('npm run build')) return false;

    // Unified Rust build for all platforms
    if (!runCommand('cd src-tauri && cargo build --release && cd ..')) {
        return false;
    }
    return true;
}

function setupLinuxService() {
    if (!IS.linux) {
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
        if (existsSync(file)) {
            runCommand(`cp -r ${file} ${CONFIG.installPath}/`);
        } else {
            console.warn(`⚠️ Warning: ${file} not found`);
        }
    });

    // Set ownership
    runCommand(`chown -R ${targetUser}:${targetUser} ${CONFIG.installPath}`);

    // Create systemd service
    const serviceContent = `[Unit]
Description=Guestbook Client
After=network.target graphical-session.target
Wants=network.target

[Service]
Type=simple
User=${targetUser}
WorkingDirectory=${CONFIG.installPath}
ExecStart=${CONFIG.installPath}/Guestbook.AppImage
Restart=always
RestartSec=10
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target`;

    try {
        writeFileSync(`/etc/systemd/system/${CONFIG.serviceName}.service`, serviceContent);
    } catch (err) {
        console.error(`❌ Failed to write systemd service file: ${err.message}`);
        return false;
    }

    // Enable service
    runCommand('systemctl daemon-reload');
    runCommand(`systemctl enable ${CONFIG.serviceName}`);

    console.log('✅ Linux service setup complete');
    return true;
}

function showNextSteps() {
    console.log('\n🎉 Setup complete!');
    console.log('\n📋 Next steps:');

    if (IS.linux) {
        console.log('1. Restart your shell or run: source ~/.cargo/env');
        console.log('2. Start the service: sudo ./appliance-setup/manage-service.sh start');
        console.log('3. Check status: sudo ./appliance-setup/manage-service.sh status');
    } else {
        console.log('1. Run: npm run dev (to start development server)');
        console.log('2. Run: npm run tauri dev (to start Tauri development)');
    }

    console.log('\n🔗 For more information, see the README.md file');
}

// Command handlers
const COMMANDS = {
    'first-run': () => {
        [checkPrerequisites, installDependencies, buildApplication, setupLinuxService]
            .every(fn => fn()) || process.exit(1);
        showNextSteps();
    },
    'build-arm64': () => {
        if (!IS.linux) {
            console.error('❌ ARM64 build is only supported on Linux');
            process.exit(1);
        }
        [checkPrerequisites, installDependencies, buildApplication]
            .every(fn => fn()) || process.exit(1);
        console.log('✅ ARM64 build complete');
    }
};

// Main execution
function main() {
    const command = process.argv[2];

    console.log('🚀 Guestbook Client Setup');
    console.log(`📱 Platform: ${PLATFORM}`);
    console.log('');

    const handler = COMMANDS[command];
    if (!handler) {
        console.log('Usage: node setup-wrapper.js <command>');
        console.log('');
        console.log('Commands:');
        console.log('  first-run    Complete first-time setup');
        console.log('  build-arm64  Build ARM64 Debian package (Linux only)');
        process.exit(1);
    }

    handler();
}

// Run if called directly
if (require.main === module) {
    main();
}

export default {
    checkPrerequisites,
    installDependencies,
    buildApplication,
    setupLinuxService
};
