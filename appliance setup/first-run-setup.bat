@echo off
REM First Run Setup Script for Guestbook Kiosk Client (Windows)
REM This script performs the initial setup steps for the project

echo 🚀 Starting first-run setup for Guestbook Kiosk Client...

REM Check if we're in the correct directory
if not exist "package.json" (
    echo ❌ Error: package.json not found. Please run this script from the project root directory.
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Node.js is not installed. Please install Node.js first.
    echo 💡 You can download Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Rust is installed
cargo --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Rust is not installed. Please install Rust first.
    echo 💡 You can install Rust from https://rustup.rs/
    pause
    exit /b 1
)

echo 📦 Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo ❌ Error: npm install failed.
    pause
    exit /b 1
)

echo 🔧 Building Rust dependencies...
cd src-tauri
call cargo build
if errorlevel 1 (
    echo ❌ Error: cargo build failed.
    cd ..
    pause
    exit /b 1
)
cd ..

echo ✅ First-run setup complete!
echo.
echo 🎉 Your Guestbook Kiosk Client is ready for development!
echo.
echo 📋 Next steps:
echo 1. Run: npm run dev (to start the development server)
echo 2. Run: npm run tauri dev (to start the Tauri development environment)
echo.
echo 🔗 For more information, see the README.md file
pause
