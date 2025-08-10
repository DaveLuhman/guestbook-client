# Guestbook Logging and Error Handling System

## Overview

This document describes the comprehensive logging and error handling system implemented to address the unexpected beeping sounds issue that occurred after 1-2 hours of appliance uptime.

## Problem Analysis

The original issue was caused by:
1. **HID Device Connection Failures**: After extended operation, HID devices (barcode scanner, MagTek reader) experienced connection issues
2. **Silent Error Propagation**: HID errors were emitted but never handled by the frontend
3. **Resource Leaks**: Continuous error conditions led to system instability
4. **Uncontrolled Sound Triggers**: Error conditions eventually triggered beeping sounds through other system paths

## Solution Components

### 1. File-Based Logging System

**Location**: `src-tauri/src/logging.rs`

**Features**:
- **Daily Log Rotation**: Logs are stored in `logs/guestbook-YYYY-MM-DD.log` format
- **Config Directory Integration**: Logs are stored next to `wg_config.json` in a `logs/` subdirectory
- **Structured Logging**: Each log entry includes timestamp, log level, source, and message
- **Automatic File Management**: Old log files are automatically closed and new ones created daily

**Log Levels**:
- `DEBUG`: Detailed debugging information
- `INFO`: General information messages
- `WARN`: Warning messages
- `ERROR`: Error messages

**Example Log Entry**:
```
[2024-01-15 14:30:25.123] [INFO] [barcode] Barcode scanned: 1234567
[2024-01-15 14:30:26.456] [WARN] [magtek] MagTek reader read error (attempt 1/5): timeout
```

### 2. Enhanced HID Device Error Handling

**Location**: `src-tauri/src/devices/barcode.rs` and `src-tauri/src/devices/magtek.rs`

**Features**:
- **Consecutive Error Tracking**: Devices attempt recovery before giving up
- **Graceful Degradation**: Temporary failures don't immediately stop device listeners
- **Error Logging**: All device errors are logged with context
- **Automatic Recovery**: Devices wait between retry attempts

**Error Handling Flow**:
1. Device read fails → Log warning with attempt count
2. Wait 100ms before retry
3. After 5 consecutive failures → Log error and stop listener
4. Emit `hid-error` event to frontend

### 3. Centralized Error Handler

**Location**: `src/error/errorHandler.ts`

**Features**:
- **Error Classification**: Automatically categorizes errors by source and severity
- **Sound Management**: Controls when and how error sounds are played
- **Error Suppression**: Prevents sound spam by implementing cooldowns and error limits
- **UI Integration**: Updates display to show error states with color coding

**Error Sources**:
- `barcode`: Barcode scanner issues
- `magtek`: MagTek reader issues
- `keypad`: Manual entry keypad issues
- `network`: Network/API issues
- `system`: General system issues

**Error Severities**:
- `low`: Timeouts, retries (no sound)
- `medium`: Device not found, disconnections (quiet beep)
- `high`: Failures, errors (error sound)
- `critical`: Fatal issues (multiple error sounds)

**Error Suppression Logic**:
- **Cooldown Period**: 30 seconds between similar errors
- **Error Limits**: After 3 errors of same type/severity, sounds are suppressed
- **Automatic Reset**: Error counts reset after successful operations

### 4. Frontend Integration

**Location**: `src/hid/HIDManager.ts` and `src/main.ts`

**Features**:
- **Unified Error Handling**: All errors go through the centralized error handler
- **User Feedback**: Visual error indicators with color-coded severity
- **Silent Recovery**: Non-critical errors don't interrupt user experience
- **Error Logging**: All frontend errors are sent to backend for file logging

## Usage

### Testing the Logging System

1. **Access Menu**: Long-press (3 seconds) on the logo area
2. **Test Logging**: Click "Test Logging" button
3. **Check Logs**: Look for log files in the `logs/` directory

### Monitoring Device Health

The system automatically logs:
- Device connection attempts
- Successful device operations
- Device errors and recovery attempts
- System heartbeat status

### Error Recovery

**Automatic Recovery**:
- HID devices automatically retry failed operations
- Error sounds are suppressed after repeated failures
- System continues operating with degraded functionality

**Manual Recovery**:
- Restart the appliance to reset all error counts
- Check log files for detailed error information
- Verify device connections and USB power

## Configuration

### Log File Location

Logs are stored in the same directory as the configuration file:
- **Windows**: `%APPDATA%\wolfpack\guestbook\logs\`
- **macOS**: `~/Library/Application Support/wolfpack/guestbook/logs/`
- **Linux**: `~/.config/wolfpack/guestbook/logs/`

### Log Retention

- **Daily Rotation**: New log file created each day
- **No Automatic Cleanup**: Old log files are preserved
- **Manual Cleanup**: Remove old log files as needed

### Error Handling Parameters

**Error Suppression**:
- `maxErrorsBeforeSilent`: 3 errors before sound suppression
- `errorCooldownMs`: 30 seconds between similar errors

**Device Recovery**:
- `maxConsecutiveErrors`: 5 failures before stopping device listener
- `retryDelayMs`: 100ms between retry attempts

## Troubleshooting

### Common Issues

1. **No Log Files Created**:
   - Check application permissions
   - Verify config directory is writable
   - Check console for logging initialization errors

2. **Excessive Error Logging**:
   - Check device connections
   - Verify USB power management
   - Review device driver status

3. **Error Sounds Still Playing**:
   - Check error suppression settings
   - Verify error handler initialization
   - Review console for error handler errors

### Debug Mode

Enable debug logging by setting log level to DEBUG in the logging module:
```rust
log::set_max_level(LevelFilter::Debug);
```

## Benefits

1. **Problem Resolution**: Eliminates unexpected beeping sounds
2. **Operational Visibility**: Complete logging of all system activities
3. **Proactive Monitoring**: Early detection of device issues
4. **User Experience**: Graceful degradation instead of system failure
5. **Maintenance**: Detailed logs for troubleshooting and support

## Future Enhancements

1. **Log Compression**: Automatic compression of old log files
2. **Remote Logging**: Send logs to remote monitoring systems
3. **Alert System**: Notify administrators of critical errors
4. **Performance Metrics**: Track device response times and success rates
5. **Predictive Maintenance**: Identify devices likely to fail based on error patterns
