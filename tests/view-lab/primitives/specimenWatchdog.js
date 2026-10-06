/**
 * The page's check that a specimen's document ran at all. A specimen whose module graph fails to
 * compile or import (a syntax error in a file it imports) never posts READY, and the page would
 * otherwise wait for `npm run lab:check`'s whole timeout without naming the row.
 */

/**
 * How long after an `<iframe>` finishes loading its document may take to announce READY. A healthy
 * specimen announces it as the first thing its module body does, so this is generous; it starts at
 * the `load` event, so a cold dev server still fetching the module graph is not counted.
 */
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
