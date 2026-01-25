import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from '../error/errorHandler';
import type { Config } from '../types/config';
import { getIsEntryFeedbackShowing } from '../ui/entryFeedback';

/**
 * Background network monitoring to detect API availability issues.
 * When the network is unavailable, the background turns yellow and
 * a warning message is displayed to the user.
 */
export async function startNetworkMonitoring(): Promise<void> {
  let lastKnownAvailable: boolean | null = null;
  let isOrphaned = false;
  let lastKnownOrphaned = false;
  let isChecking = false;
  let monitoringActive = true;
  let monitorTimer: number | undefined;
  let recoveryInFlight = false;
  let lastRecoveryAttempt: number | null = null;
  let consecutiveFailures = 0;
  const FAILURE_THRESHOLD = 2;
  const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

  const updateNetworkUI = (isAvailable: boolean, orphaned = false): void => {
    const entryData = document.getElementById('entry-data');
    const isEntryFeedbackShowing = getIsEntryFeedbackShowing();

    if (orphaned) {
      document.body.classList.add('network-unavailable-state');
      if (entryData && !isEntryFeedbackShowing) {
        entryData.innerHTML =
          '<p>This device has been removed from the server. Please reset and re-register.</p>';
      }
    } else if (isAvailable) {
      document.body.classList.remove('network-unavailable-state');

      if (
        lastKnownAvailable === false &&
        entryData &&
        !isEntryFeedbackShowing
      ) {
        entryData.innerHTML =
          '<p>Swipe your card or scan your barcode to record an entry...</p>';
      }
    } else {
      document.body.classList.add('network-unavailable-state');

      if (entryData && !isEntryFeedbackShowing) {
        entryData.innerHTML =
          '<p>The network is unavailable and entries cannot be recorded at this time.</p>';
      }
    }
  };

  const scheduleNextCheck = (): void => {
    if (!monitoringActive) return;

    if (monitorTimer !== undefined) {
      window.clearTimeout(monitorTimer);
    }

    monitorTimer = window.setTimeout(() => {
      void performCheck();
    }, 30 * 1000);
  };

  const attemptNetworkRecovery = async (reason: string): Promise<void> => {
    if (recoveryInFlight) return;

    const now = Date.now();
    if (
      lastRecoveryAttempt !== null &&
      now - lastRecoveryAttempt < RECOVERY_COOLDOWN_MS
    ) {
      return;
    }

    recoveryInFlight = true;
    lastRecoveryAttempt = now;

    try {
      const details = await invoke<string>('attempt_network_recovery_command');
      console.warn('Network recovery attempt completed:', reason, details);
    } catch (error) {
      console.warn('Network recovery attempt failed:', reason, error);
    } finally {
      recoveryInFlight = false;
    }
  };

  const performCheck = async (): Promise<void> => {
    if (isChecking) {
      console.warn('Network check already in flight; skipping scheduled run');
      scheduleNextCheck();
      return;
    }

    isChecking = true;
    try {
      const isAvailable = await invoke<boolean>(
        'check_network_availability_command'
      );

      if (isAvailable) {
        const hadFailures = consecutiveFailures > 0;
        consecutiveFailures = 0;

        if (isOrphaned) {
          console.log('Device status changed from orphaned to valid');
          isOrphaned = false;
          lastKnownOrphaned = true;
          lastKnownAvailable = null;
        }

        if (
          isAvailable !== lastKnownAvailable ||
          isOrphaned !== lastKnownOrphaned ||
          hadFailures
        ) {
          updateNetworkUI(isAvailable, false);
          lastKnownAvailable = isAvailable;
          lastKnownOrphaned = false;
          if (hadFailures) {
            console.log(
              'Network recovered - clearing warning after successful check'
            );
          }
        }
      } else {
        consecutiveFailures++;
        console.warn(
          `Network check failed (${consecutiveFailures}/${FAILURE_THRESHOLD} consecutive failures)`
        );

        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          if (
            lastKnownAvailable !== false ||
            isOrphaned !== lastKnownOrphaned
          ) {
            updateNetworkUI(false, false);
            lastKnownAvailable = false;
            lastKnownOrphaned = false;
          }
          await attemptNetworkRecovery(
            'availability check returned false'
          );
        } else {
          console.log(
            `Network check failed but below threshold (${consecutiveFailures}/${FAILURE_THRESHOLD}) - not showing warning`
          );
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);

      if (errorMsg === 'ORPHANED') {
        console.warn('Device detected as orphaned during network check');
        consecutiveFailures = 0;
        const wasOrphaned = isOrphaned;
        isOrphaned = true;

        if (!wasOrphaned || lastKnownOrphaned !== isOrphaned) {
          updateNetworkUI(false, true);
          lastKnownOrphaned = true;
          lastKnownAvailable = null;
        }

        try {
          const config: Config = await invoke('get_full_config');
          if (!config.first_run) {
            console.log(
              'Clearing orphaned state and triggering re-registration'
            );
            await invoke('clear_orphaned_state_command');
            await invoke('first_run_trigger');
            monitoringActive = false;
            if (monitorTimer !== undefined) {
              window.clearTimeout(monitorTimer);
              monitorTimer = undefined;
            }
            return;
          }
        } catch (configError) {
          console.error(
            'Failed to check config for orphaned recovery:',
            configError
          );
        }

        errorHandler.handleApplicationError(
          'network',
          'Device Orphaned - This device has been removed from the server',
          'high'
        );
      } else {
        consecutiveFailures++;
        console.warn(
          `Network availability check error (${consecutiveFailures}/${FAILURE_THRESHOLD} consecutive failures):`,
          errorMsg
        );

        if (isOrphaned) {
          isOrphaned = false;
          lastKnownOrphaned = true;
          lastKnownAvailable = null;
        }

        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          errorHandler.handleApplicationError('network', errorMsg, 'medium');

          if (lastKnownAvailable !== false || lastKnownOrphaned) {
            updateNetworkUI(false, false);
            lastKnownAvailable = false;
            lastKnownOrphaned = false;
          }
          await attemptNetworkRecovery('availability check errored');
        } else {
          console.log(
            `Network check error below threshold (${consecutiveFailures}/${FAILURE_THRESHOLD}) - not showing warning`
          );
        }
      }
    } finally {
      isChecking = false;
      scheduleNextCheck();
    }
  };

  await performCheck();
}
