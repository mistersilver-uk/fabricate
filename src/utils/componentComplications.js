/**
 * A component's progressive complications (issue 1286), top-level beside `difficulty` since any
 * progressive activity fires them. Absence-preserving: an authored `[]` normalizes to absent.
 * `severity`, `visibility` (to `gmOnly`) and `match` clamp; operands stay verbatim for the
 * validator. Import-free, for `complicationPlan.js`.
 */

/** Narrative gravity — never projected through a check-severity or notice-channel helper. */
export const COMPLICATION_SEVERITIES = Object.freeze(['minor', 'major', 'severe']);

export const DEFAULT_COMPLICATION_SEVERITY = 'minor';

export const COMPLICATION_VISIBILITIES = Object.freeze(['gmOnly', 'visible']);

export const DEFAULT_COMPLICATION_VISIBILITY = 'gmOnly';

/** How the enabled `when` clauses combine. */
export const COMPLICATION_MATCH_MODES = Object.freeze(['any', 'all']);

export const DEFAULT_COMPLICATION_MATCH_MODE = 'any';

export const COMPLICATION_ACTIVITIES = Object.freeze(['crafting', 'salvage', 'gathering']);

export const COMPLICATION_STAGE_CONDITIONS = Object.freeze([
  'stageAwarded',
  'stagePartial',
  'stageMissed',
]);

/** `ne` reads as the operator table's `neq`. */
const COMPARATOR_ALIASES = Object.freeze({ ne: 'neq' });

/** For a caller outside Foundry that passed none. */
function localComplicationId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function defaultMintId() {
  return globalThis.foundry?.utils?.randomID?.() || localComplicationId();
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function token(value, vocabulary, fallback) {
  return typeof value === 'string' && vocabulary.includes(value) ? value : fallback;
}

/** Strict booleans over a fixed key set: junk is no opt-in, and unknown keys never persist. */
function flags(value, keys) {
  const source = value && typeof value === 'object' ? value : {};
  const bag = {};
  for (const key of keys) bag[key] = source[key] === true;
  return bag;
}

function id(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function comparator(value) {
  const authored = text(value);
  return COMPARATOR_ALIASES[authored] ?? authored;
}

function shape(value, mintId) {
  const macroUuid = text(value.macroUuid).trim();
  return {
    id: text(value.id).trim() || mintId(),
    name: text(value.name),
    description: text(value.description),
    severity: token(value.severity, COMPLICATION_SEVERITIES, DEFAULT_COMPLICATION_SEVERITY),
    visibility: token(value.visibility, COMPLICATION_VISIBILITIES, DEFAULT_COMPLICATION_VISIBILITY),
    activities: flags(value.activities, COMPLICATION_ACTIVITIES),
    match: token(value.match, COMPLICATION_MATCH_MODES, DEFAULT_COMPLICATION_MATCH_MODE),
    when: {
      ...flags(value.when, COMPLICATION_STAGE_CONDITIONS),
      // A TRIGGER ID, never a boolean: an "any trigger fires any complication" flag would silently
      // give every already-authored breakage trigger a fourth effect.
      checkTrigger: id(value.when?.checkTrigger),
    },
    // The comparand stays a STRING — it may itself carry roll data.
    rollCondition: {
      enabled: value.rollCondition?.enabled === true,
      expr: text(value.rollCondition?.expr),
      cmp: comparator(value.rollCondition?.cmp),
      value: text(value.rollCondition?.value),
    },
    effectRoll: {
      enabled: value.effectRoll?.enabled === true,
      expr: text(value.effectRoll?.expr),
      label: text(value.effectRoll?.label),
    },
    // A flat uuid; `resolveMacroName` resolves the name at render time, so none can drift.
    ...(macroUuid && { macroUuid }),
  };
}

/** Spread into `_normalizeComponent`'s return literal after `difficulty`. */
export function authoredComplications(value, mintId = defaultMintId) {
  if (!Array.isArray(value)) return {};
  const complications = value
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => shape(entry, mintId));
  return complications.length > 0 ? { complications } : {};
}
