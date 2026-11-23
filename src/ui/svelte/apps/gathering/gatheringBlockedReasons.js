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
  NODE_EXHAUSTED: 'FABRICATE.App.Gathering.Detail.Callout.NodeExhausted',
  STAMINA_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.StaminaBlocked',
  LOCATION_BLOCKED: 'FABRICATE.App.Gathering.Detail.Callout.Location',
  NO_CURRENT_REALM: 'FABRICATE.App.Gathering.Detail.Callout.NoRealm'
});

const GENERIC_BLOCKED_KEY = 'FABRICATE.App.Gathering.Detail.Blocked';
const CANNOT_ATTEMPT_KEY = 'FABRICATE.App.Gathering.Detail.CannotAttempt';
const CANNOT_ATTEMPT_DETAIL_KEY = 'FABRICATE.App.Gathering.Detail.CannotAttemptDetail';
const CANNOT_ATTEMPT_MORE_KEY = 'FABRICATE.App.Gathering.Detail.CannotAttemptMore';
const MISCONFIGURED_CODE = 'TASK_MISCONFIGURED';
const DETAIL_SHOWN = 2;
const DETAIL_MAX_LENGTH = 90;

/**
 * Icon/tone presentation for the blocked-reason codes that surface as per-task
 * header callout chips in GatheringTaskRow. The label vocabulary lives in
 * BLOCK_LABEL_KEYS; this map co-locates the chip's icon and tone so the row
 * stays a pure consumer. Codes absent here fall back to a generic warning chip.
 *
 * @type {Readonly<Record<string, {icon: string, tone: string}>>}
 */
const CALLOUT_PRESENTATION = Object.freeze({
  TOOL_BLOCKED: { icon: 'fa-screwdriver-wrench', tone: 'warning' },
  CONDITIONS_BLOCKED: { icon: 'fa-cloud-sun', tone: 'warning' },
  GAME_PAUSED: { icon: 'fa-pause', tone: 'neutral' },
  DUPLICATE_ACTIVE_RUN: { icon: 'fa-hourglass-half', tone: 'neutral' },
  NODE_DEPLETED: { icon: 'fa-mountain', tone: 'warning' },
  NODE_EXHAUSTED: { icon: 'fa-mountain', tone: 'warning' },
  STAMINA_BLOCKED: { icon: 'fa-bolt', tone: 'warning' }
});

/**
 * Build the icon/tone/label descriptor for a single blocked-reason callout chip.
 * Known codes (present in CALLOUT_PRESENTATION) pair their icon/tone with the
 * label key from BLOCK_LABEL_KEYS; unknown codes fall back to a generic warning
 * chip using the reason's own `message`, then the generic blocked label.
 *
 * @param {string} code The blocked-reason code.
 * @param {{message?: string}} [reason] The originating reason (for the fallback message).
 * @param {(key: string, data?: object) => string} localize
 * @returns {{code: string, icon: string, tone: string, label: string}}
 */
export function calloutFor(code, reason, localize) {
  const presentation = CALLOUT_PRESENTATION[code];
  if (presentation) {
    return {
      code,
      icon: presentation.icon,
      tone: presentation.tone,
      label: localize(BLOCK_LABEL_KEYS[code])
    };
  }
  return {
    code,
    icon: 'fa-triangle-exclamation',
    tone: 'warning',
    label: reason?.message || localize(GENERIC_BLOCKED_KEY)
  };
}

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

const nonEmptyStrings = (list) => list.filter((entry) => typeof entry === 'string' && entry !== '');
const unlessGeneric = (code) =>
  typeof code === 'string' && code !== '' && code !== MISCONFIGURED_CODE ? [code] : [];

// The misconfiguration entries one reason carries: the start-path `errors` strings, else the
// resolution-path `diagnostics` (localized message key, else code); a lone `data.code` backs both.
function entriesOf(data, localize) {
  if (!data || typeof data !== 'object') return [];
  const fromDiagnostics = () =>
    (Array.isArray(data.diagnostics) ? data.diagnostics : []).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      if (typeof entry.messageKey === 'string' && entry.messageKey !== '')
        return [localize(entry.messageKey)];
      return unlessGeneric(entry.code);
    });
  const entries = nonEmptyStrings(Array.isArray(data.errors) ? data.errors : fromDiagnostics());
  return entries.length > 0 ? entries : unlessGeneric(data.code);
}

const misconfiguredReasons = (reasons) =>
  (Array.isArray(reasons) ? reasons : []).filter((reason) => reason?.code === MISCONFIGURED_CODE);

// A group name inside a rule string is GM-authored, so angle brackets never reach a notification.
function toastSafe(text) {
  const plain = text.replaceAll(/[<>]/g, '');
  return plain.length > DETAIL_MAX_LENGTH ? `${plain.slice(0, DETAIL_MAX_LENGTH - 1)}…` : plain;
}

/**
 * The misconfiguration details of the `TASK_MISCONFIGURED` reasons: distinct, angle-bracket
 * free, each capped at 90 characters. Other reason codes never contribute.
 *
 * @param {Array<{code?: string, data?: object|null}>} reasons
 * @param {(key: string, data?: object) => string} localize
 * @returns {string[]}
 */
export function misconfigurationDetail(reasons, localize) {
  const entries = misconfiguredReasons(reasons).flatMap((reason) =>
    entriesOf(reason.data, localize)
  );
  return [...new Set(entries.map(toastSafe).filter((entry) => entry !== ''))];
}

/**
 * Write each `TASK_MISCONFIGURED` reason's full, uncapped entry list to the console, so a
 * GM can read every failing rule that the notification truncates.
 *
 * @param {Array<{code?: string, data?: object|null}>} reasons
 */
export function logMisconfiguration(reasons) {
  for (const reason of misconfiguredReasons(reasons)) {
    const errors = [...new Set(entriesOf(reason.data, (key) => key))];
    console.warn('Fabricate | Gathering task needs configuration:', {
      taskId: reason.data?.taskId,
      errors,
    });
  }
}

/**
 * Build a single ready-to-show "Can't attempt — …" sentence for a set of blocked
 * reasons, or the generic "currently unavailable" label when none resolve. Used
 * by the task inspector callout and the blocked-attempt notification alike.
 * With `includeDetail`, a `TASK_MISCONFIGURED` reason's first two details follow
 * the label, with a count of the rest.
 *
 * @param {Array<{code?: string, message?: string, data?: object|null}>} reasons
 * @param {(key: string, data?: object) => string} localize
 * @param {{includeDetail?: boolean}} [options]
 * @returns {string} Localized blocked-reason sentence.
 */
export function describeBlockedReasons(reasons, localize, { includeDetail = false } = {}) {
  const labels = localizeBlockedReasons(reasons, localize);
  if (labels.length === 0) return localize(GENERIC_BLOCKED_KEY);
  const reason = labels.join(', ');
  const items = includeDetail ? misconfigurationDetail(reasons, localize) : [];
  if (items.length === 0) return localize(CANNOT_ATTEMPT_KEY, { reason });
  let details = items.slice(0, DETAIL_SHOWN).join('; ');
  if (items.length > DETAIL_SHOWN) {
    details = localize(CANNOT_ATTEMPT_MORE_KEY, { details, count: items.length - DETAIL_SHOWN });
  }
  return localize(CANNOT_ATTEMPT_DETAIL_KEY, { reason, details });
}
