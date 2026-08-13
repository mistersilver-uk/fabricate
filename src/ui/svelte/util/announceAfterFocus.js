/**
 * ONE ORDERING RULE FOR "MOVE THE KEYBOARD AND SAY WHAT HAPPENED" (issue 1157).
 *
 * Two surfaces do this pair — `CraftingSystemManagerRoot`, when an action empties a bulk
 * selection and unmounts the panel it was performed from, and `BulkDeleteCard`, when an
 * awaited write comes back refused and leaves the card mounted. They did it in the opposite
 * order and a microtask apart, which is the same order and close enough together that the
 * two reach the screen reader in a single task:
 *
 *   1. write the sentence into a `polite` live region;
 *   2. move focus.
 *
 * A `polite` announcement is QUEUED speech, and NVDA and JAWS both CANCEL pending speech on a
 * focus change. So the plausible outcome of that order is that the GM hears the focus target
 * and never hears the sentence — the exact silence the fix was for, now hidden behind a
 * working focus hop. The risk scales with the length of the sentence, so the composite Recipe
 * apply report ("Applied bulk changes to 4 recipes. 2 additions…") is the most exposed.
 *
 * The safe order is the other one: move focus FIRST, let its utterance start, and queue the
 * announcement BEHIND it. That is what this module owns, so the two call sites cannot drift
 * into two different orders — which is exactly how they came to hold two different ones.
 *
 * THIS IS INFERRED AT BEHAVIOUR, NOT MEASURED. Nothing in this repo — happy-dom, Chromium
 * under Playwright, the View Lab — runs a screen reader, so no gate here can observe an
 * utterance. What the tests can and do observe is the ORDER: the focus target holds the
 * keyboard before the region has any text, and the text arrives afterwards. Read the delay
 * below as the cheap, reversible side of an untestable question, not as a measurement.
 */

/**
 * How long the announcement waits behind the focus utterance.
 *
 * Long enough that the focus event has been delivered to the AT and its utterance has begun —
 * the accessibility tree is updated out of process, so same-task and next-task insertions can
 * still be coalesced into the focus change. Short enough that a GM waiting to be told what
 * their own keypress did is not left in silence; at this length the sentence follows the
 * target's name as the next thing spoken.
 *
 * Exported because the mounted suites wait on it. A test that hardcoded its own number would
 * silently start asserting the un-delayed state the moment this changed.
 */
export const ANNOUNCE_AFTER_FOCUS_MS = 150;

/**
 * Move the keyboard, then announce.
 *
 * @param {() => boolean} moveFocus  Attempts the focus move; returns `true` only if it
 *   actually moved focus. Every caller here declines the move in some state — the GM is
 *   somewhere they chose to be, or the target is gone — and a decline must NOT buy the delay:
 *   with no focus utterance to queue behind there is nothing to wait for, and waiting would
 *   only delay the one thing the GM is owed.
 * @param {() => void} announce  Writes the sentence into the live region.
 * @param {number} [delayMs]  Overridable for tests; callers use the exported default.
 */
export function announceAfterFocusMove(moveFocus, announce, delayMs = ANNOUNCE_AFTER_FOCUS_MS) {
  // The microtask is not part of the ordering rule — it is what makes the focus target
  // resolvable at all. Both callers act from a state write that has already scheduled
  // Svelte's flush, so the node to focus is only re-rendered (and, for the card, only
  // re-enabled) after this callback's turn comes round.
  queueMicrotask(() => {
    if (moveFocus?.() !== true) {
      announce?.();
      return;
    }
    setTimeout(() => announce?.(), delayMs);
  });
}
