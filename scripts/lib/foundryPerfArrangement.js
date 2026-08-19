/**
 * The Foundry perf profile's STORAGE-ARRANGEMENT axis (issue 1255).
 *
 * ## What this axis is for
 *
 * Issues 1211 and 1212 moved recipes and components out of one whole-array world setting into
 * one `Setting` document per record, and issue 1247 built the headless instrument for the
 * claim that follows: a single-record mutation stops re-serializing and re-replicating the
 * whole corpus. That instrument runs under plain Node against test doubles. Nothing measured
 * the same claim inside a real Foundry, on a real world, against real replication — the perf
 * profile (issue 1073) contained no reference to a storage arrangement at all, so every run it
 * had ever taken was on the default combined-record layout.
 *
 * This module is the pure half of closing that. It owns the arm vocabulary, the mode the
 * runner is asked for, the writes the harness is ALLOWED to make, and the shaping of the
 * conversion's own numbers. Everything here is a plain derivation over plain data: no
 * Playwright, no Foundry, no `page`. The impure half — writing a setting, answering the
 * shipped consent prompt, waiting for a layout to settle — lives in
 * `scripts/lib/foundryPerfScenarios.js` beside the rest of the walk.
 *
 * ## The four rules the axis is worthless without
 *
 * 1. **ONE world, converted in place.** Both arms are the same seeded world: the runner walks
 *    the scenarios on the legacy arrangement, converts, reloads, and walks them again.
 *    `openspec/specs/data-models/spec.md` condemns the alternative by name -- "a ratio inferred
 *    across two differently-built worlds is not a measurement of either" -- and that is a
 *    requirement issue 1247 landed, which this must not violate one release later.
 * 2. **The converted arm is reached THROUGH the shipped conversion.** The harness writes a
 *    storage TARGET, which is the setting a GM changes; the shipped reconciler writes the
 *    LAYOUT. {@link HARNESS_FORBIDDEN_SETTING_KEYS} names the two keys the harness must never
 *    write and {@link assertHarnessWritableSettingKey} is the choke point that refuses them.
 *    A fixture that hand-sets the layout measures the fixture.
 * 3. **Every arm records the layout it OBSERVED.** {@link describeObservedArrangement} compares
 *    what an arm claims against what the world actually reports, so a conversion that silently
 *    did not happen surfaces as a named drift rather than as a suspiciously flat ratio.
 * 4. **Class discipline is absolute.** Counts, byte sizes and document-call counts are class 1
 *    and may be asserted. Every millisecond is class 2, goes to the gitignored run record, is
 *    never asserted, and is only ever compared as a ratio between two runs on one machine.
 *    `scripts/lib/foundryPerfMeasurements.js` declares the class of every number this produces.
 */

import {
  COMPONENT_RECORD_SETTING_KEY_PREFIX,
  RECIPE_RECORD_SETTING_KEY_PREFIX,
} from '../../src/config/settingChangeBridge.js';
import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
} from '../../src/config/settings.js';

/** The two arms, named by the LAYOUT each one is walked on. */
export const ARRANGEMENT_ARM_IDS = Object.freeze({
  /** The combined record: one whole-array world setting per class. The shipped default. */
  LEGACY: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  /** One `Setting` document per record, reached through the shipped forward conversion. */
  GRANULAR: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
});

/**
 * The two arms in WALK ORDER, which is also conversion order: a world can only be walked on
 * the legacy arrangement before it is converted, and the conversion is one-way for any build
 * older than this one.
 *
 * @type {readonly Readonly<{id: string, label: string, expectedLayout: string,
 *   reachedBy: string, description: string}>[]}
 */
export const ARRANGEMENT_ARMS = Object.freeze([
  Object.freeze({
    id: ARRANGEMENT_ARM_IDS.LEGACY,
    label: 'combined record (legacy)',
    expectedLayout: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
    reachedBy: 'the seeded world as it boots; no conversion has run',
    description:
      'One `fabricate.recipes` array and one `fabricate.craftingSystems` array. This is the ' +
      'control, and it is the arm that carries the witness of what a single-record mutation ' +
      'used to cost -- after conversion the legacy key is reclaimed and serves its registered ' +
      'default, so the converted arm alone proves nothing.',
  }),
  Object.freeze({
    id: ARRANGEMENT_ARM_IDS.GRANULAR,
    label: 'one document per record (granular)',
    expectedLayout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    reachedBy:
      'the SHIPPED forward conversion, driven by writing the storage TARGET setting a GM ' +
      'changes and answering the shipped consent prompt',
    description:
      'One `Setting` document per recipe and per component. Reached by converting the SAME ' +
      'world the legacy arm was walked on, in place, and then RELOADING. The reload is not ' +
      'what makes the read correct -- the shipped setting-change bridge rebuilds each ' +
      "manager's storage adapter when its own layout/target pair moves (issues 1212, 1232) -- " +
      'it is what makes the arm a BOOT. `startup-phases` and `first-page-ready` have no ' +
      'meaning taken from a session that was rebuilt in place, and the granular boot is the ' +
      'most interesting number the axis produces, because it is where 20,000 `Setting` ' +
      "documents arrive in the connect payload. It is also the state a GM's next session is " +
      'actually in.',
  }),
]);

/** How many arms a run walks. */
export const ARRANGEMENT_MODES = Object.freeze({
  /** Today's behaviour: one walk, on the arrangement the world already has. */
  LEGACY_ONLY: 'singleArray',
  /** Walk, convert in place, reload, walk again. */
  BOTH: 'both',
});

/** The environment variable the mode is read from. */
export const ARRANGEMENT_MODE_ENV_VAR = 'FOUNDRY_PERF_ARRANGEMENT';

/**
 * Resolve the requested arrangement mode.
 *
 * Defaults to ONE arm, which is what the profile has always done. The second walk doubles a
 * run that already costs a licensed container and tens of minutes, and it converts the world's
 * storage arrangement -- a one-way door for any build older than this one -- so it is opt-in
 * and never a default. An unrecognised value is REFUSED by name rather than quietly treated as
 * the default: a typo that silently produced a single-arm run would report a complete-looking
 * record with the entire point of the run missing from it.
 *
 * @param {string|undefined|null} raw
 * @returns {string} one of {@link ARRANGEMENT_MODES}
 */
export function resolveArrangementMode(raw) {
  if ([undefined, null, ''].includes(raw)) return ARRANGEMENT_MODES.LEGACY_ONLY;
  const normalized = String(raw).trim();
  const known = Object.values(ARRANGEMENT_MODES);
  if (known.includes(normalized)) return normalized;
  throw new Error(
    `Unknown ${ARRANGEMENT_MODE_ENV_VAR}="${raw}". Expected one of: ${known.join(', ')}. ` +
      `"${ARRANGEMENT_MODES.BOTH}" walks the scenarios, converts the world in place through ` +
      `the shipped conversion, reloads, and walks them again.`
  );
}

/**
 * The arms a mode walks, in order.
 *
 * @param {string} mode one of {@link ARRANGEMENT_MODES}
 * @returns {readonly object[]}
 */
export function armsForMode(mode) {
  return mode === ARRANGEMENT_MODES.BOTH ? ARRANGEMENT_ARMS : ARRANGEMENT_ARMS.slice(0, 1);
}

/**
 * The one class of setting key the harness is allowed to write to reach the converted arm: a
 * storage TARGET, which is the setting the GM-facing dropdown writes.
 */
export const HARNESS_WRITABLE_SETTING_KEYS = Object.freeze([
  SETTING_KEYS.RECIPE_STORAGE_TARGET,
  SETTING_KEYS.COMPONENT_STORAGE_TARGET,
]);

/**
 * The keys the harness must NEVER write.
 *
 * A layout is what the shipped conversion ASSERTS once it has moved the records; writing one
 * from a harness produces a world claiming an arrangement its records are not in, and measures
 * the harness rather than the product. This constant exists so the prohibition is a value a
 * test can assert against rather than a sentence in a comment.
 */
export const HARNESS_FORBIDDEN_SETTING_KEYS = Object.freeze([
  SETTING_KEYS.RECIPE_STORAGE_LAYOUT,
  SETTING_KEYS.COMPONENT_STORAGE_LAYOUT,
]);

/**
 * The choke point every arrangement-axis setting write passes through.
 *
 * @param {string} key an unqualified Fabricate setting key.
 * @returns {string} `key`, so it can be used inline.
 */
export function assertHarnessWritableSettingKey(key) {
  if (HARNESS_FORBIDDEN_SETTING_KEYS.includes(key)) {
    throw new Error(
      `The perf harness must never write "${key}". A storage LAYOUT is what the shipped ` +
        `conversion asserts once it has moved the records; writing one here would produce a ` +
        `world claiming an arrangement its records are not in, and would measure the fixture ` +
        `instead of the product. Write a TARGET (${HARNESS_WRITABLE_SETTING_KEYS.join(', ')}) ` +
        `and let the shipped reconciler write the layout.`
    );
  }
  if (!HARNESS_WRITABLE_SETTING_KEYS.includes(key)) {
    throw new Error(
      `"${key}" is not an arrangement-axis setting. Writable: ` +
        HARNESS_WRITABLE_SETTING_KEYS.join(', ')
    );
  }
  return key;
}

/**
 * The two record classes the axis converts, each with the keys its leg reads and writes.
 *
 * A table rather than two near-identical code paths: the recipe and component conversions are
 * the same operation over different keys, and a copy is how the two drift.
 *
 * @type {readonly Readonly<{id: string, label: string, targetKey: string, layoutKey: string,
 *   recordKeyPrefix: string, legacyKey: string}>[]}
 */
export const ARRANGEMENT_RECORD_CLASSES = Object.freeze([
  Object.freeze({
    id: 'recipes',
    label: 'recipes',
    targetKey: SETTING_KEYS.RECIPE_STORAGE_TARGET,
    layoutKey: SETTING_KEYS.RECIPE_STORAGE_LAYOUT,
    recordKeyPrefix: RECIPE_RECORD_SETTING_KEY_PREFIX,
    legacyKey: SETTING_KEYS.RECIPES,
  }),
  Object.freeze({
    id: 'components',
    label: 'components',
    targetKey: SETTING_KEYS.COMPONENT_STORAGE_TARGET,
    layoutKey: SETTING_KEYS.COMPONENT_STORAGE_LAYOUT,
    recordKeyPrefix: COMPONENT_RECORD_SETTING_KEY_PREFIX,
    legacyKey: SETTING_KEYS.CRAFTING_SYSTEMS,
  }),
]);

/**
 * Look one record class up by id.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function findRecordClass(id) {
  return ARRANGEMENT_RECORD_CLASSES.find((entry) => entry.id === id) ?? null;
}

/**
 * The setting writes that ask the world to move one record class to the granular arrangement.
 *
 * Every key is run through {@link assertHarnessWritableSettingKey}, so this function cannot
 * return a layout write even if someone edits the table above.
 *
 * @param {string} recordClassId one of {@link ARRANGEMENT_RECORD_CLASSES}' ids.
 * @returns {Array<{namespace: string, key: string, value: string}>}
 */
export function arrangementConversionWrites(recordClassId) {
  const recordClass = findRecordClass(recordClassId);
  if (!recordClass) {
    throw new Error(
      `Unknown record class "${recordClassId}". Known: ` +
        ARRANGEMENT_RECORD_CLASSES.map((entry) => entry.id).join(', ')
    );
  }
  return [
    {
      namespace: FABRICATE_SETTINGS_NAMESPACE,
      key: assertHarnessWritableSettingKey(recordClass.targetKey),
      value: DEFINITION_STORAGE_TARGETS.PER_RECORD,
    },
  ];
}

/**
 * Compare the arrangement an arm CLAIMS against the one the world reports.
 *
 * The acceptance criterion "the converted arm is reached through the shipped conversion" turned
 * into an observation. It is the check that reddens when a conversion silently did not happen:
 * without it, a converted-arm walk of an unconverted world produces a full set of plausible
 * numbers and a ratio of almost exactly 1, which reads as "the arrangement makes no
 * difference" rather than as "the arrangement never changed".
 *
 * @param {object} options
 * @param {object} options.arm one of {@link ARRANGEMENT_ARMS}.
 * @param {Record<string, string|null>} options.observed layout by record-class id, as read
 *   from the world.
 * @returns {{arm: string, expectedLayout: string, observed: Record<string, string|null>,
 *   matches: boolean, drift: string[]}}
 */
export function describeObservedArrangement({ arm, observed }) {
  const drift = [];
  for (const recordClass of ARRANGEMENT_RECORD_CLASSES) {
    const seen = observed?.[recordClass.id] ?? null;
    if (seen !== arm.expectedLayout) {
      drift.push(
        `${recordClass.label}: this arm claims "${arm.expectedLayout}" and the world reports ` +
          `"${seen ?? 'nothing'}"`
      );
    }
  }
  return {
    arm: arm.id,
    expectedLayout: arm.expectedLayout,
    observed: observed ? { ...observed } : {},
    matches: drift.length === 0,
    drift,
  };
}

/**
 * Shape one record class's conversion into the `{invariant, timing}` pair every scenario
 * returns.
 *
 * The class split is the whole point of this function, so it is worth being explicit about
 * which side each number lands on.
 *
 * CLASS 1 -- assertable. How many records the conversion moved, how many `Setting` documents
 * exist afterwards, how many document calls it took to write them, and the serialized size of
 * the legacy key before and after. `recordsMoved` and `documentsAfter` are the pair that makes
 * the conversion legible: they must agree, and a shortfall is reported as drift rather than
 * averaged away.
 *
 * CLASS 2 -- recorded only. The elapsed milliseconds. This is the number nobody has: the
 * conversion is mandatory-by-default work in issue 1252's direction, it is what a GM
 * experiences exactly once, and until this ran on a 20,000-record world there was no data
 * behind it at all. It is still class 2, it is still never asserted, and it is still only ever
 * compared as a ratio between two runs on one machine.
 *
 * @param {object} options
 * @param {object} options.recordClass one of {@link ARRANGEMENT_RECORD_CLASSES}.
 * @param {object} options.before the world census taken before the target was written.
 * @param {object} options.after the world census taken once the layout settled.
 * @param {number|null} options.elapsedMs wall clock across the shipped conversion.
 * @param {{create: number, update: number, delete: number}|null} [options.documentCalls]
 *   `Setting` document static calls counted during the conversion, or `null` when the counter
 *   could not be installed.
 * @param {string|null} [options.consent] what happened at the shipped consent prompt.
 * @returns {{invariant: object, timing?: object, unavailable?: string}}
 */
export function summarizeStorageConversion({
  recordClass,
  before,
  after,
  elapsedMs,
  documentCalls = null,
  consent = null,
}) {
  const recordsMoved = numberOrNull(before?.records);
  const documentsAfter = numberOrNull(after?.recordDocuments);
  const settled = after?.layout === DEFINITION_STORAGE_LAYOUTS.PER_RECORD;

  const drift = [];
  if (!settled) {
    drift.push(
      `the ${recordClass.label} layout reads "${after?.layout ?? 'nothing'}" after the ` +
        `conversion, not "${DEFINITION_STORAGE_LAYOUTS.PER_RECORD}"`
    );
  }
  if (
    settled &&
    recordsMoved !== null &&
    documentsAfter !== null &&
    recordsMoved !== documentsAfter
  ) {
    drift.push(
      `${recordsMoved} ${recordClass.label} went in and ${documentsAfter} per-record ` +
        `document(s) came out`
    );
  }

  const invariant = {
    recordClass: recordClass.id,
    recordsMoved,
    documentsBefore: numberOrNull(before?.recordDocuments),
    documentsAfter,
    // The conversion's four steps are declared to cost at most two document calls for the
    // write plus one for the legacy reclamation, INDEPENDENT of the record count. That is the
    // claim this counter exists to check on a real world, and it is the half that distinguishes
    // "wrote the corpus" from "wrote the corpus one record at a time".
    documentCalls: documentCalls ? { ...documentCalls } : null,
    documentCallsInstrumented: documentCalls !== null,
    layoutBefore: before?.layout ?? null,
    layoutAfter: after?.layout ?? null,
    // What the legacy whole-array key costs a connecting client, before and after. On a settled
    // granular world the shipped conversion reclaims that document and the key serves its
    // registered default, so this is expected to collapse -- and it collapsing is the headline.
    legacyKeyBytesBefore: numberOrNull(before?.legacyKeyBytes),
    legacyKeyBytesAfter: numberOrNull(after?.legacyKeyBytes),
    legacyDocumentPresentBefore: booleanOrNull(before?.legacyDocumentPresent),
    legacyDocumentPresentAfter: booleanOrNull(after?.legacyDocumentPresent),
    reachedShippedLayout: settled,
    consent,
    drift,
  };

  if (!settled) {
    // Recorded as unavailable rather than as a duration. A conversion that did not settle has
    // no duration to report: whatever the clock says, it is the time something else took.
    return { invariant, unavailable: drift[0] };
  }

  return {
    invariant,
    timing: {
      samplesMs: Number.isFinite(elapsedMs) ? [elapsedMs] : [],
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
      // Stated so a reader never has to guess what is inside the number. The shipped consent
      // prompt is answered BEFORE the clock starts, so no dialog round trip is in here.
      // Stated so a reader never has to guess what is inside the number. The clock starts
      // where the shipped conversion is UNBLOCKED -- immediately after the consent prompt is
      // answered, since `_reconcileDefinitionStorage` awaits consent before it converts -- so
      // the harness's own dialog round trip is outside the measured region rather than
      // silently inflating a duration nobody has a second reading of.
      clockBasis:
        'one host, one browser process; measured from the moment the shipped conversion was ' +
        'unblocked (consent answered, or the TARGET write when no consent was required) to ' +
        'the shipped LAYOUT settling',
    },
  };
}

/**
 * Compare one measurement across the two arms of a SINGLE run record.
 *
 * The one ratio this whole axis exists to produce, and the only one it may honestly produce:
 * both arms are the same world, on the same machine, in the same browser process, minutes
 * apart. Absolute milliseconds are deliberately not the subject -- `ratio` is what survives
 * being pasted into an issue by someone who did not run it.
 *
 * Returns `null` for a ratio wherever either side is missing, so a one-sided measurement stays
 * visibly one-sided instead of becoming a number-shaped hole.
 *
 * @param {object} record a run record carrying `arrangements`.
 * @param {(samples: number[]) => number|null} median the median function to use.
 * @returns {Array<{measurement: string, legacyMs: number|null, granularMs: number|null,
 *   ratio: number|null}>}
 */
export function compareArrangementArms(record, median) {
  const arms = record?.arrangements ?? [];
  const legacy = arms.find((entry) => entry.arm === ARRANGEMENT_ARM_IDS.LEGACY) ?? null;
  const granular = arms.find((entry) => entry.arm === ARRANGEMENT_ARM_IDS.GRANULAR) ?? null;
  const ids = new Set([
    ...Object.keys(legacy?.timing ?? {}),
    ...Object.keys(granular?.timing ?? {}),
  ]);
  const rows = [];
  for (const id of [...ids].sort((left, right) => left.localeCompare(right))) {
    const legacyMs = median(legacy?.timing?.[id]?.samplesMs);
    const granularMs = median(granular?.timing?.[id]?.samplesMs);
    const ratio =
      legacyMs !== null && granularMs !== null && legacyMs > 0 ? granularMs / legacyMs : null;
    rows.push({ measurement: id, legacyMs, granularMs, ratio });
  }
  return rows;
}

/**
 * A finite number, or `null`. Never `NaN` and never `undefined`, so an absent census field
 * stays absent instead of becoming a zero somebody quotes.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function numberOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

/**
 * A boolean, or `null` when nothing was observed.
 *
 * @param {unknown} value
 * @returns {boolean|null}
 */
function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}
