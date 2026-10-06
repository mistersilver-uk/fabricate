/** Names a specimen whose module graph never ran (so never posted READY) instead of hanging. */

/** Grace after the `<iframe>` load event (so a cold dev server is not counted) before it is silent. */
export const READY_GRACE_MS = 15_000;

/**
 * Arm the watchdog on a specimen `<iframe>`.
 *
 * @param {EventTarget} frame The `<iframe>`; its `load` event starts the clock.
 * @param {() => void} onSilent Called once when the grace period passes without {@link cancel}.
 * @param {{setTimeout: Function, clearTimeout: Function}} [timers] Injectable for tests.
 * @param {number} [graceMs] The grace period.
 * @returns {() => void} Cancels the watchdog; call it when READY arrives.
 */
export function armReadyWatchdog(frame, onSilent, timers = globalThis, graceMs = READY_GRACE_MS) {
  let handle = null;
  let cancelled = false;
  frame.addEventListener(
    'load',
    () => {
      if (cancelled) return;
      handle = timers.setTimeout(onSilent, graceMs);
    },
    { once: true }
  );
  return () => {
    cancelled = true;
    if (handle !== null) timers.clearTimeout(handle);
  };
}
