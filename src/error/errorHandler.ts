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
  }

  private handleHIDError(errorMessage: string) {
    const context: ErrorContext = {
      source: this.determineErrorSource(errorMessage),
      severity: this.determineErrorSeverity(errorMessage),
      message: errorMessage,
      timestamp: new Date(),
      userActionable: false,
    };

    this.logError(context);
    this.handleError(context);
  }

  private determineErrorSource(
    errorMessage: string
  ): 'barcode' | 'magtek' | 'keypad' | 'network' | 'system' {
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('barcode') || lowerMessage.includes('scanner')) {
      return 'barcode';
    } else if (
      lowerMessage.includes('magtek') ||
      lowerMessage.includes('swipe')
    ) {
      return 'magtek';
    } else if (
      lowerMessage.includes('keypad') ||
      lowerMessage.includes('button')
    ) {
      return 'keypad';
    } else if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('http')
    ) {
      return 'network';
    } else {
      return 'system';
    }
  }

  private determineErrorSeverity(
    errorMessage: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('timeout') || lowerMessage.includes('retry')) {
      return 'low';
    } else if (
      lowerMessage.includes('not found') ||
      lowerMessage.includes('disconnected')
    ) {
      return 'medium';
    } else if (
      lowerMessage.includes('failed') ||
      lowerMessage.includes('error')
    ) {
      return 'high';
    } else if (
      lowerMessage.includes('critical') ||
      lowerMessage.includes('fatal')
    ) {
      return 'critical';
    } else {
      return 'medium';
    }
  }

  private logError(context: ErrorContext) {
    const logEntry = `[${context.timestamp.toISOString()}] [${context.severity.toUpperCase()}] [${
      context.source
    }] ${context.message}`;
    console.error(logEntry);

    // Send to backend for file logging
    invoke('log_error', {
      level: context.severity,
      source: context.source,
      message: context.message,
      timestamp: context.timestamp.toISOString(),
    }).catch((e) => console.warn('Failed to log error to backend:', e));
  }

  private handleError(context: ErrorContext) {
    const errorKey = `${context.source}-${context.severity}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;

    // Check if we should be silent due to too many errors
    if (currentCount >= this.maxErrorsBeforeSilent) {
      console.warn(
        `Suppressing ${context.source} error sounds due to high error count`
      );
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
      // Create user-friendly error message based on source and message
      const errorTemplate = this.getErrorTemplate(context);

      // Add CSS styling for device error messages
      this.addDeviceErrorStyles();

      // Use CSS classes instead of inline styles
      const errorElement = document.createElement('div');
      errorElement.className = `error-message ${context.severity}`;

      // Build error message safely using DOM methods
      const container = document.createElement('div');
      container.className = 'device-error-message';

      const title = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = errorTemplate.title;
      title.appendChild(strong);
      container.appendChild(title);

      const body = document.createElement('p');
      body.textContent = errorTemplate.body;
      container.appendChild(body);

      const hint = document.createElement('p');
      hint.className = 'error-hint';
      hint.textContent = errorTemplate.hint;
      container.appendChild(hint);

      errorElement.appendChild(container);

      // Clear and append the new element
      entryData.textContent = '';
      entryData.appendChild(errorElement);

      // Don't change body background color - it makes text unreadable

      // Reset after 8 seconds for device errors (longer for user to read)
      const resetTime = context.source === 'barcode' || context.source === 'magtek' ? 8000 : 5000;
      setTimeout(() => {
        if (entryData.querySelector('.error-message')) {
          const resetText = document.createElement('p');
          resetText.textContent = 'Swipe your card or scan your barcode to record an entry...';
          entryData.textContent = '';
          entryData.appendChild(resetText);
        }
      }, resetTime);
    }
  }

  private getErrorTemplate(context: ErrorContext): { title: string; body: string; hint: string } {
    const { source, message } = context;
    const lowerMessage = message.toLowerCase();

    // Network error templates
    if (source === 'network' || lowerMessage.includes('network') ||
        lowerMessage.includes('http') || lowerMessage.includes('timeout') ||
        lowerMessage.includes('authentication failed') ||
        lowerMessage.includes('server error') ||
        lowerMessage.includes('server not found')) {

      if (lowerMessage.includes('network unreachable') || lowerMessage.includes('cannot connect')) {
        return {
          title: 'Network Unreachable',
          body: 'Cannot connect to server. Check internet connection and try again.',
          hint: 'Please verify your network connection and ensure the server is accessible.'
        };
      }

      if (lowerMessage.includes('request timeout') || lowerMessage.includes('timeout')) {
        return {
          title: 'Connection Timeout',
          body: 'Connection timed out. Check network connection and try again.',
          hint: 'The server may be slow or unreachable. Please check your network connection.'
        };
      }

      if (lowerMessage.includes('authentication failed') || lowerMessage.includes('check device configuration')) {
        return {
          title: 'Authentication Failed',
          body: 'Device authentication failed. Please check device configuration in settings.',
          hint: 'Verify your device token and server URL in the configuration menu.'
        };
      }

      if (lowerMessage.includes('server not found') || lowerMessage.includes('verify server url')) {
        return {
          title: 'Server Not Found',
          body: 'Cannot reach the server. Please verify server URL in settings.',
          hint: 'Check your server URL configuration and ensure the server is running.'
        };
      }

      if (lowerMessage.includes('server error') || lowerMessage.includes('contact support')) {
        return {
          title: 'Server Error',
          body: 'Server is experiencing issues. Please try again in a moment.',
          hint: 'If the problem persists, contact support for assistance.'
        };
      }

      // Generic network error
      return {
        title: 'Network Error',
        body: message,
        hint: 'Please check your network connection and try again.'
      };
    }

    // Device-specific error templates
    if (source === 'magtek') {
      if (message.includes('No compatible MSR reader found') || message.includes('not found')) {
        return {
          title: 'Card Reader Not Found',
          body: 'Please check that the card reader is properly connected via USB.',
          hint: 'Make sure the USB cable is securely plugged in and try again.'
        };
      }
      if (message.includes('disconnected')) {
        return {
          title: 'Card Reader Disconnected',
          body: 'Please check the USB connection and try again.',
          hint: 'The device will reconnect automatically when plugged back in.'
        };
      }
    }

    if (source === 'barcode') {
      if (message.includes('No compatible') || message.includes('not found')) {
        return {
          title: 'Barcode Scanner Not Found',
          body: 'Please check that the barcode scanner is properly connected via USB.',
          hint: 'Make sure the USB cable is securely plugged in and try again.'
        };
      }
      if (message.includes('disconnected')) {
        return {
          title: 'Barcode Scanner Disconnected',
          body: 'Please check the USB connection and try again.',
          hint: 'The device will reconnect automatically when plugged back in.'
        };
      }
    }

    // Fallback for other errors
    return {
      title: 'Device Error',
      body: message,
      hint: 'Please check the device connection and try again.'
    };
  }

  private addDeviceErrorStyles() {
    // Only add styles once
    if (document.querySelector('style[data-device-error]')) return;

    const style = document.createElement('style');
    style.setAttribute('data-device-error', 'true');
    style.textContent = `
      .device-error-message {
        text-align: center;
        padding: 20px;
        background-color: #ffe6e6;
        border: 2px solid #ff6666;
        border-radius: 8px;
        margin: 20px;
      }
      .device-error-message p {
        margin: 10px 0;
      }
      .device-error-message strong {
        color: #cc0000;
        font-size: 1.1em;
      }
      .error-hint {
        font-style: italic;
        color: #666;
        font-size: 0.9em;
      }
    `;
    document.head.appendChild(style);
  }

  // Public method to handle errors from other parts of the application
  public handleApplicationError(
    source: string,
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    const context: ErrorContext = {
      source: source as ErrorContext['source'],
      severity,
      message,
      timestamp: new Date(),
      userActionable: true,
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
