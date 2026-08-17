/**
 * **Storage Layout Conversion** for recipe definitions — the reverse direction, and the
 * reconciler that is the only thing allowed to start one (issue 1232).
 *
 * `data-models/spec.md` § Storage Conversion Crash Recovery names the reverse conversion as
 * *the* supported mitigation for the forward conversion's downgrade-lossiness: step 4 of a
 * forward conversion deletes the legacy whole-array document, and an older build then reads
 * the registered default `[]` **silently** — no throw, no warning, indistinguishable from a
 * genuinely empty world (verified on 13.351 and 14.365: `ClientSettings#get` falls back to
 * `new Setting({value: setting.default})`). Shipping the GM-facing target control without
 * this module would be a one-way door with that cliff behind it.
 *
 * ## The reverse conversion is the forward one, mirrored
 *
 * 1. set the layout to `unsettled`;
 * 2. write every per-record document's stored value into the legacy whole-array key;
 * 3. set the layout to `singleArray`;
 * 4. delete the per-record documents.
 *
 * The spec's clauses about the forward direction transfer, with ONE that inverts and must
 * not be carried across blind:
 *
 * - **The transaction extent still ends at step 3.** Step 4 is envelope reclamation, outside
 *   the transaction and independently retryable, so a step-4 failure completes forward.
 *   {@link reconcileRecipeStorageLayout} retries it on any later boot of a settled
 *   single-array world, because otherwise a failed reclaim leaks every envelope forever
 *   with no detector.
 * - **Step 2 is convergent from a partial state**, so a resume replays it as a no-op: it
 *   reads the per-record documents, which step 4 has not touched yet, and rewrites the same
 *   array.
 * - **Compensation restores the layout VALUE, and MUST NOT delete the layout document.**
 *   This is the clause that inverts. The forward conversion compensates by deleting, because
 *   on a never-converted world the layout key has no document and its registered
 *   `singleArray` default is served without one — so a reset-to-value would leave a document
 *   that was not there before. The reverse runs only on a world whose layout already reads
 *   `perRecord` or `unsettled`, and neither is the registered default, so that document
 *   provably exists and restoring its value IS restoring prior key presence. Deleting it
 *   here would fabricate a `singleArray` layout over a corpus that is still per-record —
 *   precisely the silent-empty-world state this module exists to prevent.
 *
 * ## Why a reconciler rather than an `onChange`
 *
 * The target is the GM's control and the conversion is what makes flipping it mean anything,
 * so the two are one operation. Three constraints decide the shape:
 *
 * - **Ordering.** `buildDefaultRecipeRepository` selects the adapter from the TARGET, once,
 *   in the manager's constructor. So the target write must already have landed before a
 *   conversion begins, or the converting GM's own manager stays on the adapter for the
 *   arrangement the conversion is about to dismantle and their world appears empty on the
 *   boot that converted it. Driving the conversion FROM the already-written target makes
 *   that ordering structural rather than remembered, and running the boot reconcile BEFORE
 *   the managers are constructed makes the converting GM's own selection correct by
 *   construction.
 * - **No stuck-forever state.** Valid Id Basis clause 2 refuses whenever `layout !== target`,
 *   so a target set to an arrangement this build cannot reach would omit every destructive
 *   startup pass on that world permanently — the shape `data-models/spec.md` forbids by name
 *   for the primacy input. Every outcome here therefore ends with `layout === target`
 *   whenever the layout is settled: an unreachable target is REVERTED to the layout, and a
 *   conversion that throws compensates both keys. The one state that survives is a genuinely
 *   `unsettled` layout this build has no resume for, which is a real half-converted corpus
 *   rather than an artefact of a settings write, and it is reported rather than papered over.
 * - **Availability is a declared table, not a formula.** {@link RECIPE_STORAGE_CONVERSIONS}
 *   lists the transitions this build can perform. The forward direction is deliberately
 *   ABSENT: it belongs to issue 1211, which adds two rows here and changes nothing else.
 *   A formula ("anything to `singleArray`") would silently start claiming to run a forward
 *   conversion the moment a value was added to the target enumeration.
 */

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  SETTING_KEYS,
} from '../config/settings.js';

import { isRecognisedArrangement } from './definitionStorageArrangement.js';
import {
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
} from './PerRecordCraftingDefinitionRepository.js';

/** Every value a Definition Storage TARGET may legitimately hold. */
const RECOGNISED_TARGETS = Object.freeze(Object.values(DEFINITION_STORAGE_TARGETS));

/**
 * A per-record recipe adapter over RAW stored values.
 *
 * `hydrate` and `serialize` are left at their identity defaults on purpose. A conversion
 * moves bytes between two arrangements of the SAME records; routing them through
 * `Recipe.fromJSON` and back would make the conversion's output depend on the current
 * model's normalizer, so a field the model has not learned to emit yet would be dropped by
 * the operation whose entire promise is that it loses nothing.
 *
 * The adapter is reused rather than re-implemented so the conversion and the runtime backend
 * cannot disagree about which keys are records, how a duplicate key is resolved, or how a
 * short bulk return is treated.
 *
 * @param {object} options
 * @param {(() => any)} [options.documentClass]
 * @param {(() => Iterable<any>|null)} [options.collection]
 * @returns {PerRecordCraftingDefinitionRepository}
 */
function perRecordRecipeStore({ documentClass, collection }) {
  return new PerRecordCraftingDefinitionRepository({
    keyPrefix: RECIPE_RECORD_KEY_PREFIX,
    // `undefined` selects the adapter's own production accessors; a caller that injects
    // neither gets exactly the repository a live world would build.
    documentClass,
    collection,
  });
}

/**
 * Read a setting through the injected accessor without letting an unregistered key or an
 * absent `game` throw.
 *
 * @param {(key: string) => *} getSetting
 * @param {string} key
 * @returns {*} `null` when the value could not be read at all.
 */
function readSettingDefensively(getSetting, key) {
  try {
    const value = getSetting(key);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

/**
 * Move a recipe corpus from per-record documents back into the legacy whole-array key.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass] Injected for tests; the `Setting` document
 *   class carrying the bulk operations.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests; the world
 *   `Setting` collection the per-record documents live in.
 * @returns {Promise<{records: number, reclaimed: number, reclaimFailure: Error|null}>}
 */
export async function runReverseRecipeStorageConversion({
  getSetting,
  setSetting,
  documentClass,
  collection,
}) {
  const store = perRecordRecipeStore({ documentClass, collection });
  // Read BEFORE step 1, so a failure to read the corpus never leaves the layout unsettled.
  const records = await store.loadAll();
  const legacy = readSettingDefensively(getSetting, SETTING_KEYS.RECIPES);
  const legacyCount = Array.isArray(legacy) ? legacy.length : 0;
  // An empty per-record read over a non-empty legacy array is the one shape that would make
  // step 2 destructive: it would replace a real corpus with `[]`. The layout said this world
  // is per-record, so either the collection is unreadable on this client or the layout is a
  // lie — and the spec forbids resolving that by INFERRING the layout from a data key's
  // emptiness. Refusing is the only answer that cannot lose the corpus.
  if (records.length === 0 && legacyCount > 0) {
    throw new Error(
      `Fabricate | refusing to reverse recipe storage: no per-record recipe documents are readable, but the legacy key still holds ${legacyCount} recipes. The recorded layout does not describe this world's storage.`
    );
  }

  await setSetting(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);
  await setSetting(SETTING_KEYS.RECIPES, records);
  await setSetting(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY);

  // Step 4 — envelope reclamation, OUTSIDE the transaction. `putAll([])` is the adapter's own
  // differential with an empty desired set, so it deletes exactly the indexed record
  // documents and verifies what came back. Its failure completes forward: the layout is
  // already correct and the documents are debris a later reconcile retries.
  let reclaimFailure = null;
  const reclaimed = records.length;
  try {
    await store.putAll([]);
  } catch (error) {
    reclaimFailure = error instanceof Error ? error : new Error(String(error));
  }
  return { records: records.length, reclaimed: reclaimFailure ? 0 : reclaimed, reclaimFailure };
}

/**
 * The transitions this build can perform, as a table.
 *
 * Issue 1211 adds the forward rows (`singleArray -> perRecord` and its `unsettled` resume)
 * and needs to change nothing else here or in `settings.js`.
 *
 * @type {readonly Readonly<{from: string, to: string, run: Function}>[]}
 */
export const RECIPE_STORAGE_CONVERSIONS = Object.freeze([
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    to: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
    run: runReverseRecipeStorageConversion,
  }),
  // The resume. `unsettled` is the sole discriminator a crashed conversion resumes from, and
  // step 2 is convergent, so a resume is the same operation replayed from step 1.
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
    to: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
    run: runReverseRecipeStorageConversion,
  }),
]);

/**
 * The conversion that moves a recipe corpus from `from` to `to`, or `null` when this build
 * cannot perform it.
 *
 * @param {string} from A Definition Storage LAYOUT.
 * @param {string} to A Definition Storage TARGET.
 * @returns {Function|null}
 */
export function recipeStorageConversionFor(from, to) {
  const entry = RECIPE_STORAGE_CONVERSIONS.find(
    (candidate) => candidate.from === from && candidate.to === to
  );
  return entry?.run ?? null;
}

/**
 * Write a setting, swallowing a failure.
 *
 * Only ever used on a COMPENSATION leg, where the operation's own error is the one the
 * caller must see: a compensation failure that replaced it would report the wrong reason for
 * the wrong thing. It is not silent — the caller reports the state it could not leave.
 *
 * @param {(key: string, value: *) => Promise<*>} setSetting
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
async function compensateSetting(setSetting, key, value) {
  try {
    await setSetting(key, value);
  } catch (error) {
    console.error(`Fabricate | failed to compensate the setting "${key}"`, error);
  }
}

/**
 * Reclaim per-record recipe documents left behind by a reverse conversion whose step 4 did
 * not complete.
 *
 * Guarded on BOTH keys reading `singleArray`, never on the documents' presence: "there are
 * per-record documents" is not evidence about the layout, and treating it as evidence is the
 * inference the spec forbids. With both keys settled at `singleArray` the corpus provably
 * lives in the legacy array, so any surviving record document is debris.
 *
 * @param {object} options See {@link runReverseRecipeStorageConversion}.
 * @returns {Promise<number>} how many documents were reclaimed.
 */
async function reclaimOrphanedRecipeRecords({ documentClass, collection }) {
  try {
    const store = perRecordRecipeStore({ documentClass, collection });
    const index = store.refreshIndex();
    if (index.size === 0) return 0;
    const orphans = index.size;
    await store.putAll([]);
    return orphans;
  } catch (error) {
    // Reclamation is outside the transaction by construction, so a failure completes forward
    // and the next boot retries it. Reported rather than swallowed, because a reclaim that
    // never succeeds is a permanent envelope leak.
    console.error('Fabricate | failed to reclaim orphaned per-record recipe documents', error);
    return 0;
  }
}

/**
 * Bring the recipe Definition Storage LAYOUT into agreement with its TARGET.
 *
 * The single entry point for every layout transition: the boot pass, the reaction to a GM
 * changing the target, and the resume of a crashed conversion are the same call. See this
 * module's header for why the target write DRIVES the conversion rather than accompanying
 * it, and why every non-converting outcome still ends with `layout === target`.
 *
 * Never throws. A conversion failure is compensated and reported in the return value,
 * because this runs during startup and a rejected promise there would take the module down
 * for a world whose only fault is a half-finished storage change.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting Setting reader. A PARAMETER rather than an
 *   import so the whole reconciler is drivable from a fixture.
 * @param {(key: string, value: *) => Promise<*>} options.setSetting Setting writer, a
 *   parameter for the same reason.
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @returns {Promise<{action: string, layout: string|null, target: string|null,
 *   records?: number, reclaimed?: number, error?: Error}>}
 */
export async function reconcileRecipeStorageLayout({
  getSetting,
  setSetting,
  documentClass,
  collection,
}) {
  const layout = readSettingDefensively(getSetting, SETTING_KEYS.RECIPE_STORAGE_LAYOUT);
  const target = readSettingDefensively(getSetting, SETTING_KEYS.RECIPE_STORAGE_TARGET);
  // Positively established or nothing. An unrecognised value is not something to convert
  // toward, and writing one back would launder it into the world as though it were.
  if (!isRecognisedArrangement(layout) || !RECOGNISED_TARGETS.includes(target)) {
    return { action: 'unreadable', layout, target };
  }

  if (layout === target) {
    const reclaimed =
      layout === DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY
        ? await reclaimOrphanedRecipeRecords({ documentClass, collection })
        : 0;
    return { action: 'settled', layout, target, reclaimed };
  }

  const run = recipeStorageConversionFor(layout, target);
  if (!run) {
    // No conversion exists for this transition in this build. A SETTLED layout is restored to
    // by reverting the target, which returns the world to `layout === target` and keeps the
    // Valid Id Basis gate satisfied — the whole point of routing the flip through here.
    if (layout !== DEFINITION_STORAGE_LAYOUTS.UNSETTLED) {
      await setSetting(SETTING_KEYS.RECIPE_STORAGE_TARGET, layout);
      return { action: 'target-reverted', layout, target };
    }
    // An `unsettled` layout cannot be repaired by a settings write: `unsettled` is not a legal
    // target, and the corpus really is spread across both arrangements. This build has no
    // resume toward the requested target — it can only arrive by downgrading from a build that
    // ran a forward conversion — so it is reported, and the gate correctly keeps refusing.
    return { action: 'unsettled-unresolvable', layout, target };
  }

  try {
    const result = await run({ getSetting, setSetting, documentClass, collection });
    return { action: 'converted', layout: target, target, ...result };
  } catch (error) {
    // Compensate BOTH keys. Restoring the layout alone would leave exactly the permanently
    // gate-refused world this reconciler exists to make unreachable, and the layout value is
    // restorable rather than deletable here — see the header.
    await compensateSetting(setSetting, SETTING_KEYS.RECIPE_STORAGE_LAYOUT, layout);
    if (layout !== DEFINITION_STORAGE_LAYOUTS.UNSETTLED) {
      await compensateSetting(setSetting, SETTING_KEYS.RECIPE_STORAGE_TARGET, layout);
    }
    return {
      action: 'failed',
      layout,
      target,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
