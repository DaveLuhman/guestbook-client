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
 * This function performs true long-polling against the `/next_scan` endpoint,
 * maintaining exactly one request in flight at a time. When a new scan is received,
 * the `onScan` callback is invoked with the scan data.
 *
 * The loop runs indefinitely until the returned stop function is called.
 *
 * @param onScan Callback function invoked whenever a new barcode scan is received
 * @returns A function that stops the scanning loop when called
 */
export function startScanStream(onScan: (scan: ScanEvent) => void): () => void {
  let stopped = false;
  let sinceSeq = 0;
  let backoffMs = 250; // Start with 250ms backoff
  const maxBackoffMs = 2000;
  let abortController: AbortController | null = null;

  async function loop() {
    console.log('[CameraSidecar] Starting scan stream loop...');
    while (!stopped) {
      try {
        // Create new AbortController for this request
        abortController = new AbortController();

        // Long-poll for next scan using since/seq and timeout parameters
        const url = `${SIDECAR_BASE_URL}/next_scan?since=${sinceSeq}&timeout=15`;
        console.log(`[CameraSidecar] Long-polling ${url}`);

        const res = await fetch(url, {
          signal: abortController.signal,
        });

        // Reset backoff on any successful response (including timeouts)
        backoffMs = 250;

        if (!res.ok) {
          console.error(`[CameraSidecar] /next_scan HTTP error: ${res.status}`);
          // Use exponential backoff for errors
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
          continue;
        }

        let json: unknown;
        try {
          json = await res.json();
        } catch (parseError) {
          console.error(`[CameraSidecar] Failed to parse JSON response:`, parseError);
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
          continue;
        }

        console.log(`[CameraSidecar] Received response from /next_scan:`, json);

        // Validate response format
        if (json === null || typeof json !== 'object') {
          console.error(`[CameraSidecar] Invalid response format (not an object):`, json);
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
          continue;
        }

        // Type guard for response
        const response = json as Record<string, unknown>;

        if (response.ok !== true) {
          console.error(`[CameraSidecar] Response indicates error:`, response);
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
          continue;
        }

        // Update sequence number if provided (always update to latest known seq)
        if (typeof response.seq === 'number') {
          const oldSeq = sinceSeq;
          sinceSeq = response.seq;
          if (oldSeq !== sinceSeq) {
            console.log(`[CameraSidecar] Updated sequence: ${oldSeq} -> ${sinceSeq}`);
          }
        }

        // Handle scan data
        const scanData = response.scan;
        if (scanData !== null && scanData !== undefined && typeof scanData === 'object') {
          const scanObj = scanData as Record<string, unknown>;
          // Validate scan object has required fields
          const code = scanObj.code;
          if (!code || typeof code !== 'string') {
            console.warn(`[CameraSidecar] Invalid scan object (missing or invalid code):`, scanObj);
            // Still update seq and continue
            continue;
          }

          // New scan received - map to ScanEvent format
          const scan: ScanEvent = {
            id: typeof scanObj.id === 'number' ? scanObj.id : sinceSeq,
            code: code,
            timestamp: typeof scanObj.timestamp === 'string' ? scanObj.timestamp : new Date().toISOString(),
          };
          console.log(`[CameraSidecar] New scan received: ${scan.code} (id: ${scan.id}, seq: ${sinceSeq})`);
          onScan(scan);
          // Immediately continue loop to catch another scan (no delay)
          continue;
        }

        // Timeout or null scan - immediately loop again without delay
        if (scanData === null || scanData === undefined) {
          console.log(`[CameraSidecar] Long-poll timeout (seq: ${sinceSeq}), continuing immediately...`);
          // No delay - immediately continue
          continue;
        }

        // Unexpected response format
        console.warn(`[CameraSidecar] Unexpected response format:`, json);
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      } catch (err) {
        // Check if this was an abort (expected when stopping)
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('[CameraSidecar] Request aborted (stream stopping)');
          break;
        }

        console.error('[CameraSidecar] Error in scan stream loop:', err);
        // Use exponential backoff on errors
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      } finally {
        abortController = null;
      }
    }
    console.log('[CameraSidecar] Scan stream loop stopped');
  }

  // Start the loop asynchronously
  void loop();

  // Return stop function
  return () => {
    stopped = true;
    if (abortController) {
      abortController.abort();
    }
  };
}
