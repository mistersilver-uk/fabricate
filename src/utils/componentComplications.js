/**
 * A component's PROGRESSIVE COMPLICATIONS (issue 1286) — the GM-authored consequences that
 * fire when that component takes part in a progressive resolution (progressive crafting,
 * progressive salvage or progressive gathering).
 *
 * ## Why the record is top-level on the component, not under `salvage`
 *
 * A complication is scoped to a component's participation in ANY progressive activity — as
 * a recipe result, a salvage yield, or a gathering drop. `component.salvage` is the
 * salvage-ACTIVITY sub-record, so a cross-activity concern parked inside it is an aggregate
 * boundary violation. The sibling that already spans all three activities is `difficulty`,
 * the progressive DC a complication keys on, and it is correctly top-level; this record
 * spreads directly after it.
 *
 * The second reason is spec validity rather than data loss: `salvage` is only valid when
 * `CraftingSystem.features.salvage` is true, and a complication on a crafting OUTPUT
 * component has to fire on a system with salvage switched off — exactly where a
 * `salvage`-nested record would be spec-invalid.
 *
 * ## Absence-preserving, with NO authored-empty state
 *
 * `_normalizeComponent` is an allowlist rebuild, so a component's persisted bytes after a
 * save are exactly what its return literal emits. `authoredComplications` therefore emits
 * the key ONLY for a non-empty normalized list: a component that authored none keeps no
 * key, and no migration is needed for the millions of components that predate this
 * feature. This is the omitted-when-default doctrine, whose in-file precedent is
 * `authoredCheckModifierIds`.
 *
 * It differs from that precedent in one deliberate way. `checkModifierIds` has a real
 * authored-empty state — a pick of ZERO modifiers, distinct from inheriting the default
 * set — so its attach keys on `Array.isArray` at entry. An empty complication list carries
 * no meaning distinct from absence, so an authored `[]` normalizes to ABSENT here, and no
 * reader may distinguish an absent `complications` from an empty one.
 *
 * ## What is repaired and what is preserved
 *
 * The three CLOSED vocabularies — `severity`, `visibility` and `match` — clamp to their
 * declared token sets. Each drives a rendering treatment (a severity chip tone, a
 * segmented tile, an audience gate) rather than a validated operand, and no complication
 * validator exists to report an unknown one, so an unclamped token would render as garbage
 * forever. `visibility` clamps to `gmOnly`, which is the only default here chosen for
 * SAFETY rather than to preserve pre-existing behaviour: there is no pre-existing
 * behaviour, and an audience Fabricate cannot read must never resolve to "show the player".
 *
 * OPERANDS are the other half of the rule and are PRESERVED, never repaired or dropped: the
 * dice expressions, the comparand, the effect label, the macro uuid and the trigger id.
 * This is the treatment `gatheringFailureOutcome` states for the same reason — a normalizer
 * that quietly deleted a malformed operand would make the validator unreachable and turn an
 * authoring mistake into silent data loss. The single exception is the prototype's `ne`
 * comparator, which normalizes to the operator table's `neq`; that is an alias, not a
 * repair, and every other comparator (including the three valueless prerequisite operators
 * a complication may not use) survives verbatim for the gate to reject.
 *
 * ## Deliberately import-free
 *
 * This module is a leaf, so `complicationPlan.js` can import its frozen vocabularies
 * without restating them and without dragging a runtime module into every mounted Svelte
 * suite's module closure. In particular it does NOT import the prerequisite operator
 * table: the six numeric comparators live there, the gate reads them from there, and a
 * copy here would be the drift this split exists to prevent.
 */

/** Narrative gravity. Deliberately NOT the `critical|warning|info` authoring-diagnostic
 * axis, nor the `warn|info` notice channel — a complication's severity is a story fact and
 * must never be projected through a helper shared with either. */
export const COMPLICATION_SEVERITIES = Object.freeze(['minor', 'major', 'severe']);

/** @type {'minor'} */
export const DEFAULT_COMPLICATION_SEVERITY = 'minor';

/** Audience. An enum rather than a boolean, matching Fabricate's established audience
 * vocabulary (`gatheringRealms`' visibilities, `summaryProjection`'s shared/gmOnly/playerOnly). */
export const COMPLICATION_VISIBILITIES = Object.freeze(['gmOnly', 'visible']);

/** @type {'gmOnly'} */
export const DEFAULT_COMPLICATION_VISIBILITY = 'gmOnly';

/** How the enabled `when` clauses combine. */
export const COMPLICATION_MATCH_MODES = Object.freeze(['any', 'all']);

/** @type {'any'} */
export const DEFAULT_COMPLICATION_MATCH_MODE = 'any';

/** The activities a complication may be enabled for. "Activity" is the established
 * cross-cutting word; "mode" means a mutually-exclusive strategy token throughout Fabricate
 * and would have read as one here. */
export const COMPLICATION_ACTIVITIES = Object.freeze(['crafting', 'salvage', 'gathering']);

/** The stage-outcome clauses of `when`. They are STAGE language, not check-disposition
 * language: `failed`/`success` are bound to a check's disposition across this domain, and a
 * progressive failure award produces no stages at all. */
export const COMPLICATION_STAGE_CONDITIONS = Object.freeze([
  'stageAwarded',
  'stagePartial',
  'stageMissed',
]);

/** The one comparator alias: the prototype spelled not-equals `ne`, the operator table
 * spells it `neq`, and the table is the authority. */
const COMPARATOR_ALIASES = Object.freeze({ ne: 'neq' });

/**
 * Fallback id mint for a caller that passed none and is running outside Foundry (every
 * `node --test` suite). Draws from the platform CSPRNG rather than a pseudorandom
 * generator, so it stays pure, unit-testable, and free of insecure-randomness findings.
 * @returns {string}
 */
function localComplicationId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The default `mintId`. `foundry.utils.randomID()` is the right mint in the running world
 * and is unavailable in a unit test, which is why the mint is an injectable parameter at
 * all rather than a hard-coded call.
 * @returns {string}
 */
function defaultMintId() {
  return globalThis.foundry?.utils?.randomID?.() || localComplicationId();
}

/**
 * @param {unknown} value
 * @returns {string} the authored text, coerced but not otherwise touched.
 */
function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * @param {unknown} value
 * @param {readonly string[]} vocabulary
 * @param {string} fallback
 * @returns {string} the authored token when the closed vocabulary declares it, else the default.
 */
function token(value, vocabulary, fallback) {
  return typeof value === 'string' && vocabulary.includes(value) ? value : fallback;
}

/**
 * Coerce a flag bag to strict booleans over a fixed key set, so a truthy junk value is
 * never read as an opt-in and an unknown key is never persisted.
 * @param {unknown} value
 * @param {readonly string[]} keys
 * @returns {Record<string, boolean>}
 */
function flags(value, keys) {
  const source = value && typeof value === 'object' ? value : {};
  const bag = {};
  for (const key of keys) bag[key] = source[key] === true;
  return bag;
}

/**
 * @param {unknown} value
 * @returns {string|null} a trimmed id, or `null` for anything that names nothing. An id
 *   that resolves to no trigger leaves the clause inert (fail-open), which is what `null`
 *   already means, so a non-string id needs no separate spelling.
 */
function id(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * @param {unknown} value
 * @returns {string} the comparator id, with the prototype's `ne` aliased to `neq`.
 */
function comparator(value) {
  const authored = text(value);
  return COMPARATOR_ALIASES[authored] ?? authored;
}

/**
 * Coerce one authored complication to its persisted shape.
 * @param {object} value a plain object the caller has already type-checked
 * @param {() => string} mintId
 * @returns {object}
 */
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
      // A TRIGGER ID, never a boolean: an "any trigger fires any complication" flag would
      // silently give every already-authored breakage trigger a fourth effect.
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
    // A flat `macroUuid` string, matching every other macro reference in the codebase; the
    // name resolves at render time through `resolveMacroName` precisely so no snapshot of
    // it can drift. Absent when unauthored, so the key never appears on a component that
    // named no macro.
    ...(macroUuid && { macroUuid }),
  };
}

/**
 * The absence-preserving `complications` attach, spread into `_normalizeComponent`'s return
 * literal directly after `difficulty`.
 *
 * @param {unknown} value the raw authored value read off the persisted component
 * @param {() => string} [mintId] mints an id for a complication that authored none;
 *   injectable because `foundry.utils.randomID()` is unavailable under `node --test`.
 * @returns {{complications?: object[]}} `{}` — no key at all — for an absent, non-array,
 *   empty or all-junk authored value.
 */
export function authoredComplications(value, mintId = defaultMintId) {
  if (!Array.isArray(value)) return {};
  const complications = value
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => shape(entry, mintId));
  return complications.length > 0 ? { complications } : {};
}
