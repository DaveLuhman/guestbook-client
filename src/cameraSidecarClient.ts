/**
 * Camera Sidecar Client
 *
 * This module provides a client interface for communicating with the camera sidecar service.
 * The sidecar is a Python HTTP service that handles direct camera access on the Raspberry Pi.
 * It continuously captures frames and streams barcode scans via long-polling.
 */

export type ScanEvent = {
  id: number;
  code: string;
  timestamp: string;
};

export type SidecarHealth = {
  ok: boolean;
  error?: string;
};

const SIDECAR_BASE_URL = 'http://127.0.0.1:7313';

/**
 * Check if the camera sidecar service is running and healthy
 * @returns SidecarHealth object indicating if the sidecar is reachable and healthy
 */
export async function checkSidecarHealth(): Promise<SidecarHealth> {
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
      const json = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: json.error || `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    return { ok: json?.status === 'ok' };
  } catch (e) {
    console.error('Failed to reach camera sidecar:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Starts a continuous long-polling loop to receive barcode scans from the sidecar.
 *
 * This function continuously polls the `/next_scan` endpoint, which uses long-polling
 * to efficiently wait for new barcodes. When a new scan is received, the `onScan`
 * callback is invoked with the scan data.
 *
 * The loop runs indefinitely until the returned stop function is called.
 *
 * @param onScan Callback function invoked whenever a new barcode scan is received
 * @returns A function that stops the scanning loop when called
 */
export function startScanStream(onScan: (scan: ScanEvent) => void): () => void {
  let stopped = false;
  let lastId = 0;

  async function loop() {
    while (!stopped) {
      try {
        // Long-poll for next scan
        const url = `${SIDECAR_BASE_URL}/next_scan?since_id=${lastId}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.error('Sidecar /next_scan HTTP error:', res.status);
          // Short delay before retry
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        const json = await res.json();

        if (json.success && json.code) {
          // New scan received
          const scan: ScanEvent = {
            id: json.id ?? lastId + 1,
            code: json.code,
            timestamp: json.timestamp ?? new Date().toISOString(),
          };
          lastId = scan.id;
          onScan(scan);
          // Immediately continue loop to catch another scan
          continue;
        }

        // If we timed out or got no new scan, wait briefly then poll again
        // This handles the case where the long-poll timed out
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error('Error in scan stream loop:', err);
        // Back off a bit on failures
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Start the loop asynchronously
  void loop();

  // Return stop function
  return () => {
    stopped = true;
  };
}
