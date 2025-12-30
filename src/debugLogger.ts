/**
 * Debug Logger - Intercepts console logs and sends them to backend
 * Only active in debug builds (when Tauri is in debug mode)
 */

let debugLoggingEnabled = false;

/**
 * Initialize debug logging by intercepting console methods
 * This should only be called in debug builds
 */
export function initDebugLogger(): void {
  // Always try to enable - will fail gracefully in production builds
  debugLoggingEnabled = true;
  interceptConsole();
}

function interceptConsole(): void {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalDebug = console.debug;
  const originalInfo = console.info;

  // Helper to send log to backend
  const sendToBackend = async (level: string, ...args: unknown[]) => {
    if (!debugLoggingEnabled) return;

    try {
      const message = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      // Extract target from stack trace if available
      let target = 'frontend';
      try {
        const stack = new Error().stack;
        if (stack) {
          const lines = stack.split('\n');
          // Skip first two lines (Error and sendToBackend)
          if (lines.length > 2) {
            const callerLine = lines[2];
            // Try to extract filename/function name
            const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
            if (match) {
              target = match[2]?.split('/').pop() || 'frontend';
            }
          }
        }
      } catch {
        // Ignore stack trace errors
      }

      // Use dynamic import to avoid errors in production builds
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('log_frontend_message', {
        level,
        message,
        target,
      });
    } catch (error) {
      // Silently fail if command doesn't exist (production build)
      // or if there's a network error
      if (error instanceof Error && error.message.includes('log_frontend_message')) {
        debugLoggingEnabled = false;
      }
    }
  };

  // Override console methods
  console.log = (...args: unknown[]) => {
    originalLog.apply(console, args);
    void sendToBackend('INFO', ...args);
  };

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    void sendToBackend('ERROR', ...args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    void sendToBackend('WARN', ...args);
  };

  console.debug = (...args: unknown[]) => {
    originalDebug.apply(console, args);
    void sendToBackend('DEBUG', ...args);
  };

  console.info = (...args: unknown[]) => {
    originalInfo.apply(console, args);
    void sendToBackend('INFO', ...args);
  };
}

