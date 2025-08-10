import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { soundManager } from '../sound/soundManager';

export interface ErrorContext {
  source: 'barcode' | 'magtek' | 'keypad' | 'network' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  userActionable: boolean;
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCounts: Map<string, number> = new Map();
  private maxErrorsBeforeSilent = 3;
  private errorCooldownMs = 30000; // 30 seconds
  private lastErrorTime: Map<string, number> = new Map();

  private constructor() {
    this.initializeErrorListeners();
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  private initializeErrorListeners() {
    // Listen for HID errors from the backend
    listen('hid-error', (event) => {
      this.handleHIDError(event.payload as string);
    });

    // Listen for general HID data that might indicate errors
    listen('hid-data', (event) => {
      this.handleHIDData(event.payload as string);
    });
  }

  private handleHIDError(errorMessage: string) {
    const context: ErrorContext = {
      source: this.determineErrorSource(errorMessage),
      severity: this.determineErrorSeverity(errorMessage),
      message: errorMessage,
      timestamp: new Date(),
      userActionable: false
    };

    this.logError(context);
    this.handleError(context);
  }

  private handleHIDData(data: string) {
    // Check if the data looks like an error or invalid input
    if (data.includes('ERROR') || data.includes('FAIL') || data.length < 3) {
      const context: ErrorContext = {
        source: 'barcode', // Assume barcode for now
        severity: 'low',
        message: `Invalid HID data received: ${data}`,
        timestamp: new Date(),
        userActionable: false
      };

      this.logError(context);
      // Don't play sounds for low-severity data errors
    }
  }

  private determineErrorSource(errorMessage: string): 'barcode' | 'magtek' | 'keypad' | 'network' | 'system' {
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('barcode') || lowerMessage.includes('scanner')) {
      return 'barcode';
    } else if (lowerMessage.includes('magtek') || lowerMessage.includes('swipe')) {
      return 'magtek';
    } else if (lowerMessage.includes('keypad') || lowerMessage.includes('button')) {
      return 'keypad';
    } else if (lowerMessage.includes('network') || lowerMessage.includes('http')) {
      return 'network';
    } else {
      return 'system';
    }
  }

  private determineErrorSeverity(errorMessage: string): 'low' | 'medium' | 'high' | 'critical' {
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('timeout') || lowerMessage.includes('retry')) {
      return 'low';
    } else if (lowerMessage.includes('not found') || lowerMessage.includes('disconnected')) {
      return 'medium';
    } else if (lowerMessage.includes('failed') || lowerMessage.includes('error')) {
      return 'high';
    } else if (lowerMessage.includes('critical') || lowerMessage.includes('fatal')) {
      return 'critical';
    } else {
      return 'medium';
    }
  }

  private logError(context: ErrorContext) {
    const logEntry = `[${context.timestamp.toISOString()}] [${context.severity.toUpperCase()}] [${context.source}] ${context.message}`;
    console.error(logEntry);

    // Send to backend for file logging
    invoke('log_error', {
      level: context.severity,
      source: context.source,
      message: context.message,
      timestamp: context.timestamp.toISOString()
    }).catch(e => console.warn('Failed to log error to backend:', e));
  }

  private handleError(context: ErrorContext) {
    const errorKey = `${context.source}-${context.severity}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;

    // Check if we should be silent due to too many errors
    if (currentCount >= this.maxErrorsBeforeSilent) {
      console.warn(`Suppressing ${context.source} error sounds due to high error count`);
      return;
    }

    // Check cooldown period
    if (now - lastTime < this.errorCooldownMs) {
      console.debug(`Suppressing ${context.source} error due to cooldown`);
      return;
    }

    // Update error tracking
    this.errorCounts.set(errorKey, currentCount + 1);
    this.lastErrorTime.set(errorKey, now);

    // Handle based on severity and source
    switch (context.severity) {
      case 'low':
        // No sound for low severity errors
        break;
      case 'medium':
        if (context.source === 'barcode' || context.source === 'magtek') {
          // Play a quiet error sound for device issues
          soundManager.playBeep(400, 100);
        }
        break;
      case 'high':
        // Play error sound for high severity
        soundManager.playError();
        break;
      case 'critical':
        // Play multiple error sounds for critical issues
        soundManager.playError();
        setTimeout(() => soundManager.playError(), 500);
        break;
    }

    // Update UI to show error
    this.updateErrorDisplay(context);
  }

  private updateErrorDisplay(context: ErrorContext) {
    const entryData = document.getElementById('entry-data');
    if (entryData) {
      const errorColor = this.getErrorColor(context.severity);
      entryData.innerHTML = `<p style="color: ${errorColor};">Device Error: ${context.message}</p>`;
      document.body.style.backgroundColor = errorColor;

      // Reset after 5 seconds
      setTimeout(() => {
        if (entryData.innerHTML.includes('Device Error:')) {
          entryData.innerHTML = '<p>Swipe your card or scan your barcode to record an entry...</p>';
          document.body.style.backgroundColor = '#00447C';
        }
      }, 5000);
    }
  }

  private getErrorColor(severity: string): string {
    switch (severity) {
      case 'low': return '#FFA500'; // Orange
      case 'medium': return '#FF8C00'; // Dark Orange
      case 'high': return '#FF4500'; // Orange Red
      case 'critical': return '#DC143C'; // Crimson
      default: return '#FF8C00';
    }
  }

  // Public method to handle errors from other parts of the application
  public handleApplicationError(source: string, message: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') {
    const context: ErrorContext = {
      source: source as any,
      severity,
      message,
      timestamp: new Date(),
      userActionable: true
    };

    this.logError(context);
    this.handleError(context);
  }

  // Method to reset error counts (useful for recovery)
  public resetErrorCounts() {
    this.errorCounts.clear();
    this.lastErrorTime.clear();
    console.log('Error counts reset');
  }

  // Method to check if errors are being suppressed
  public isErrorSuppressed(source: string, severity: string): boolean {
    const errorKey = `${source}-${severity}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    return currentCount >= this.maxErrorsBeforeSilent;
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();
