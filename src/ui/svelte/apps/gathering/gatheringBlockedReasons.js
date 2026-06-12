// Shared player-facing localization for gathering blocked-reason codes.
//
// Extracted (with no behavior change) from the inline map + loop in
// GatheringTaskDetail so the same vocabulary drives BOTH the task inspector's
// "Can't attempt — …" callout AND the warning notification surfaced when a
// player's gathering attempt is rejected (so a blocked attempt is never a silent
// no-op). `localize` is injected so this module stays pure and unit-testable
// without the Foundry bridge.

/**
 * Map a gathering blocked-reason `code` to its short player-facing label key.
 * Codes absent from this map fall back to the reason's own `message`, then to a
 * generic "currently unavailable" label.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BLOCK_LABEL_KEYS = Object.freeze({
  TOOL_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.MissingTools',
  CONDITIONS_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.Conditions',
  GAME_PAUSED: 'FABRICATE.App.Gathering.Detail.Callout.Paused',
  DUPLICATE_ACTIVE_RUN: 'FABRICATE.App.Gathering.Detail.Callout.DuplicateRun',
  SCENE_TOKEN_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.VisitScene',
  NODE_DEPLETED: 'FABRICATE.App.Gathering.Detail.Callout.NodeDepleted',
  STAMINA_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.StaminaBlocked',
  LOCATION_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.Location',
  NO_CURRENT_REALM: 'FABRICATE.App.Gathering.Detail.Callout.NoRealm'
});

const GENERIC_BLOCKED_KEY = 'FABRICATE.App.Gathering.Detail.Blocked';
const CANNOT_ATTEMPT_KEY = 'FABRICATE.App.Gathering.Detail.CannotAttempt';

/**
 * Resolve the deduplicated, localized label list for a set of blocked reasons.
 * Each distinct `code` contributes one label; unknown codes fall back to the
 * reason's `message`, then the generic blocked label.
 *
 * @param {Array<{code?: string, message?: string}>} reasons
 * @param {(key: string, data?: object) => string} localize
 * @returns {string[]} Deduplicated localized labels (possibly empty).
 */
export function localizeBlockedReasons(reasons, localize) {
  const list = Array.isArray(reasons) ? reasons : [];
  const seen = new Set();
  const labels = [];
  for (const reason of list) {
    const code = reason?.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const key = BLOCK_LABEL_KEYS[code];
    labels.push(key ? localize(key) : (reason?.message || localize(GENERIC_BLOCKED_KEY)));
  }
  return labels;
}

/**
 * Build a single ready-to-show "Can't attempt — …" sentence for a set of blocked
 * reasons, or the generic "currently unavailable" label when none resolve. Used
 * by the task inspector callout and the blocked-attempt notification alike.
 *
 * @param {Array<{code?: string, message?: string}>} reasons
 * @param {(key: string, data?: object) => string} localize
 * @returns {string} Localized blocked-reason sentence.
 */
export function describeBlockedReasons(reasons, localize) {
  const labels = localizeBlockedReasons(reasons, localize);
  if (labels.length === 0) return localize(GENERIC_BLOCKED_KEY);
  return localize(CANNOT_ATTEMPT_KEY, { reason: labels.join(', ') });
}
