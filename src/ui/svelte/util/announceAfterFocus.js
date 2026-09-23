// One ordering rule for "move the keyboard and say what happened" (issues 1157, 1517): move focus
// FIRST and queue the announcement BEHIND it, because a `polite` announcement is QUEUED speech and
// NVDA and JAWS both cancel pending speech on a focus change. This is inferred at behaviour, not
// measured — nothing here runs a screen reader, so the tests observe the ORDER only.

// Exported because the mounted suites wait on it; a test with its own number would go blind.
export const ANNOUNCE_AFTER_FOCUS_MS = 150;

// A mover answers `true`/`false` or a promise of the element it landed on; both are read as the one
// question "did focus move". A decline must NOT buy the delay: there is no utterance to queue behind.
export function announceAfterFocusMove(moveFocus, announce, delayMs = ANNOUNCE_AFTER_FOCUS_MS) {
  // Not part of the ordering rule: the microtask is what makes the focus target resolvable at all.
  queueMicrotask(() => {
    const outcome = moveFocus?.();
    if (typeof outcome?.then === 'function') {
      outcome.then((resolved) => queueAnnouncement(resolved, announce, delayMs));
      return;
    }
    queueAnnouncement(outcome, announce, delayMs);
  });
}

function queueAnnouncement(outcome, announce, delayMs) {
  const focused = outcome !== null && typeof outcome === 'object' ? outcome : null;
  if (outcome !== true && !focused) {
    announce?.(null);
    return;
  }
  setTimeout(() => announce?.(focused), delayMs);
}
