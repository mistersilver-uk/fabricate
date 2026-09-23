/**
 * A component's PROGRESSIVE COMPLICATIONS (issue 1286): the GM-authored consequences that fire when
 * it takes part in any progressive activity, so the record is top-level beside `difficulty` rather
 * than under the salvage-activity sub-record. Absence-preserving with no authored-empty state — an
 * authored `[]` normalizes to ABSENT. The closed vocabularies `severity`, `visibility` and `match`
 * clamp, `visibility` to `gmOnly`; OPERANDS are preserved verbatim so the validator stays
 * reachable. Import-free, so `complicationPlan.js` can read these vocabularies without a runtime.
 */

/** Narrative gravity — never projected through a check-severity or notice-channel helper. */
export const COMPLICATION_SEVERITIES = Object.freeze(['minor', 'major', 'severe']);

export const DEFAULT_COMPLICATION_SEVERITY = 'minor';

/** Audience. */
export const COMPLICATION_VISIBILITIES = Object.freeze(['gmOnly', 'visible']);

export const DEFAULT_COMPLICATION_VISIBILITY = 'gmOnly';

/** How the enabled `when` clauses combine. */
export const COMPLICATION_MATCH_MODES = Object.freeze(['any', 'all']);

export const DEFAULT_COMPLICATION_MATCH_MODE = 'any';

/** The activities a complication may be enabled for. */
export const COMPLICATION_ACTIVITIES = Object.freeze(['crafting', 'salvage', 'gathering']);

/** The stage-outcome clauses of `when`. */
export const COMPLICATION_STAGE_CONDITIONS = Object.freeze([
  'stageAwarded',
  'stagePartial',
  'stageMissed',
]);

/**
 * The one comparator alias: the prototype spelled not-equals `ne`, the operator table spells it
 * `neq`, and the table is the authority.
 */
const COMPARATOR_ALIASES = Object.freeze({ ne: 'neq' });

/**
 * Fallback id mint for a caller that passed none and is running outside Foundry (every `node
 * --test` suite).
 */
function localComplicationId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The default `mintId`. */
function defaultMintId() {
  return globalThis.foundry?.utils?.randomID?.() || localComplicationId();
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function token(value, vocabulary, fallback) {
  return typeof value === 'string' && vocabulary.includes(value) ? value : fallback;
}

/**
 * Coerce a flag bag to strict booleans over a fixed key set, so a truthy junk value is never read
 * as an opt-in and an unknown key is never persisted.
 */
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

/** Coerce one authored complication to its persisted shape. */
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
    // A flat `macroUuid` string, matching every other macro reference in the codebase; the name
    // resolves at render time through `resolveMacroName` precisely so no snapshot of it can drift.
    ...(macroUuid && { macroUuid }),
  };
}

/**
 * The absence-preserving `complications` attach, spread into `_normalizeComponent`'s return literal
 * directly after `difficulty`.
 */
export function authoredComplications(value, mintId = defaultMintId) {
  if (!Array.isArray(value)) return {};
  const complications = value
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => shape(entry, mintId));
  return complications.length > 0 ? { complications } : {};
}
