/**
 * Camera Sidecar Client
 *
 * This module provides a client interface for communicating with the camera sidecar service.
 * The sidecar is a Python HTTP service that handles direct camera access on the Raspberry Pi.
 */

export type SidecarScanResult = {
  success: boolean;
  code: string | null;
  error?: string;
};

const SIDECAR_BASE_URL = 'http://127.0.0.1:7313';

/**
 * Check if the camera sidecar service is running and healthy
 * @returns true if the sidecar is reachable and healthy, false otherwise
 */
export async function checkSidecarHealth(): Promise<boolean> {
  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SIDECAR_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return false;
    }

    const json = await res.json();
    return json?.status === 'ok';
  } catch (e) {
    console.error('Failed to reach camera sidecar:', e);
    return false;
  }
}

/**
 * Scan for a barcode using the camera sidecar service
 * @param timeoutMs Maximum time to spend scanning in milliseconds (default: 5000)
 * @returns Promise resolving to a SidecarScanResult
 */
export async function scanBarcodeViaSidecar(
  timeoutMs: number = 5000
): Promise<SidecarScanResult> {
  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs + 1000);

    const res = await fetch(`${SIDECAR_BASE_URL}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeoutMs }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        code: null,
        error: `HTTP ${res.status} from sidecar`,
      };
    }

    const json = await res.json();
    return {
      success: !!json.success,
      code: json.code ?? null,
      error: json.error,
    };
  } catch (error) {
    console.error('Error calling camera sidecar:', error);

    // Handle abort/timeout specifically
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return {
        success: false,
        code: null,
        error: 'Scan timeout - camera sidecar did not respond in time',
      };
    }

    return {
      success: false,
      code: null,
      error: 'Failed to reach camera sidecar. Is the service running?',
    };
  }
}
