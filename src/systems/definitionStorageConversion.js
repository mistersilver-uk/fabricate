/**
 * **Storage Layout Conversion** for recipe definitions — both directions, and the reconciler
 * that is the only thing allowed to start one (issues 1232 and 1211).
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
 *   lists the transitions this build can perform. Issue 1211 added the two forward rows.
 *   A formula ("anything to `perRecord`") would silently start claiming to run a conversion
 *   the moment a value was added to the target enumeration.
 *
 * ## The forward direction, and the three things that stop it destroying a corpus
 *
 * Issue 1211. {@link runForwardRecipeStorageConversion} is the mirror of the reverse, with a
 * guard, a verification and its OWN compensation. Adding it also created a total-loss path
 * that no shipped line defends, because it is the forward direction alone that reaches it:
 * the shared catch below compensates BOTH keys, so a refused forward conversion leaves
 * `layout === target === singleArray`, which takes the `settled` branch and hands the whole
 * per-record corpus to {@link reclaimOrphanedRecipeRecords}. `action: 'settled'`, no error,
 * no notice, and the corpus is gone on the boot AFTER the one that refused. On the reverse
 * direction the same refusal compensates to `perRecord`, which the reclaim gate refuses, so
 * nothing happens — the asymmetry is created by these rows.
 *
 * Three independent changes close it, each defending a different entrance:
 *
 * 1. **The forward conversion compensates itself, by restoring key PRESENCE.**
 *    `data-models/spec.md` § Storage Conversion Crash Recovery requires it, and the shared
 *    {@link compensateSetting} cannot: it writes a VALUE, and on a never-converted world the
 *    layout key has no document at all, so step 1 creates one and a value-restoring
 *    compensation leaves a document that was not there before — on a world the GM is being
 *    told is untouched.
 * 2. **A refusal that wrote nothing is not compensated at all**, in either direction. There
 *    is no prior state to restore, and writing one asserts a layout the conversion has just
 *    established it cannot describe. The resulting `layout !== target` world is refused by
 *    Valid Id Basis clause 2 and reported permanently, exactly as `unsettled-unresolvable`
 *    already is.
 * 3. **Envelope reclamation refuses any document the legacy array does not describe.** This
 *    is the defence at the point of destruction, and it covers entrances 1 and 2 do not.
 *    Every legitimate reclaim target is described by construction: debris from a crashed
 *    forward step 2 was created FROM the legacy array, and debris from a crashed reverse
 *    step 4 was written INTO it by the reverse's step 2. A document the legacy array does
 *    not name is the only shape that can hold a record the settled corpus lacks.
 *
 * ## Why the forward direction defers to the next boot after a migration pass wrote
 *
 * Repository selection is elected by a designation rather than a lock, so two clients can
 * each believe they are the primary GM for one unresolved activity round trip. Two migration
 * passes over the same legacy bytes are NOT byte-reproducible — 1.17.0 and 1.4.0 mint per
 * run — so a conversion whose source read interleaves with the other client's migration
 * write converts a state no single pass produced, and the converted corpus stops being a
 * function of any settled pre-conversion state. Deferring by one boot removes the divergence
 * at its source. The requirement is REPRODUCIBILITY, not referential integrity: every
 * cross-key reference the current registry writes is derived deterministically.
 */

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
} from '../config/settings.js';

import {
  compensateSetting,
  readSettingDefensively,
  reconcileDefinitionStorageLayout,
} from './definitionStorageReconciler.js';
import {
  defaultWorldSettingCollection,
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
} from './PerRecordCraftingDefinitionRepository.js';

/**
 * Which way a completed conversion moved the corpus.
 *
 * Reported by the conversion rather than derived by the caller from the target, because the
 * two directions must say OPPOSITE things to the GM: the reverse restores the ability to
 * downgrade and the forward removes it, so a caller that guessed would eventually tell a GM
 * it is safe to downgrade at the exact moment it stopped being.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const RECIPE_STORAGE_CONVERSION_DIRECTIONS = Object.freeze({
  FORWARD: 'forward',
  REVERSE: 'reverse',
});

const { FORWARD, REVERSE } = RECIPE_STORAGE_CONVERSION_DIRECTIONS;

/** The fully-qualified key of the recipe Definition Storage LAYOUT document. */
const QUALIFIED_LAYOUT_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPE_STORAGE_LAYOUT}`;

/** The fully-qualified key of the legacy whole-array recipe document. */
const QUALIFIED_RECIPES_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.RECIPES}`;

/**
 * A conversion that refused BEFORE its first write.
 *
 * Typed rather than a bare `Error` because the disposition is the opposite of a failure's:
 * a refusal wrote nothing, so there is nothing to compensate, and compensating anyway is
 * what arms envelope reclamation against a corpus the legacy key does not describe. See the
 * module header, change 2.
 */
export class RecipeStorageConversionRefusedError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RecipeStorageConversionRefusedError';
  }
}

/**
 * A conversion that failed AFTER writing, and has already compensated its own writes.
 *
 * The reconciler recognises it and does not compensate a second time — which on the forward
 * direction would fabricate a layout document the conversion had just deleted, and would
 * revert the target onto the one value that arms the reclaimer.
 */
export class RecipeStorageConversionCompensatedError extends Error {
  /** @param {string} message @param {{cause?: unknown}} [options] */
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'RecipeStorageConversionCompensatedError';
  }
}

/**
 * Read and DELETE whole `Setting` documents by fully-qualified key.
 *
 * Its own seam, and not part of `perRecordRecipeStore`, for a mechanical reason: that store
 * is built with `keyPrefix: RECIPE_RECORD_KEY_PREFIX`, so its index covers `fabricate.recipe.`
 * and reaches neither `fabricate.recipeStorageLayout` nor `fabricate.recipes`. Nor is a
 * delete a `setSetting` operation — `ClientSettings` has no delete at all, so the route is
 * the world collection's own `getSetting` followed by `Document#delete()`, which exists on
 * 13.351 and 14.365 alike.
 *
 * Presence and deletion live together because the forward conversion needs both about the
 * SAME key, and a caller that could observe presence but not act on it would have to
 * reach for a second seam to compensate.
 *
 * @param {object} [options]
 * @param {() => Iterable<any>|null} [options.collection] The world `Setting` collection.
 * @returns {{exists: (key: string) => boolean, delete: (key: string) => Promise<boolean>}}
 */
export function worldSettingDocumentAccess({ collection = defaultWorldSettingCollection } = {}) {
  const resolve = (qualifiedKey) => {
    try {
      return collection()?.getSetting?.(qualifiedKey) ?? null;
    } catch {
      return null;
    }
  };
  return {
    exists: (qualifiedKey) => resolve(qualifiedKey) != null,
    delete: async (qualifiedKey) => {
      const document = resolve(qualifiedKey);
      if (!document?.delete) return false;
      await document.delete();
      return true;
    },
  };
}

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
 * Exported for the startup migration seam (issue 1242), which needs exactly this store and
 * would otherwise re-implement it — and two raw recipe stores drift. The two optional
 * passthroughs below both default to what the conversion already relies on, so the
 * conversion's own store is byte-identical to the one this factory produced before it was
 * shared.
 *
 * @param {object} options
 * @param {(() => any)} [options.documentClass]
 * @param {(() => Iterable<any>|null)} [options.collection]
 * @param {((raw: object) => object)} [options.hydrate] Defaults to identity — the
 *   conversion's semantics. The migration seam overrides it with a DETACHING clone, because
 *   identity hydration returns the stored document's own initialized value: an in-place
 *   transformation then mutates the very object the differential later compares against, so
 *   every record compares equal to itself and a create/update-only writeback issues nothing
 *   while the version records success. Identity is necessary for rawness and is NOT
 *   sufficient for safety. The clone is not moved into the repository because the manager's
 *   hot path already detaches through `Recipe.fromJSON`, where a second copy is pure cost.
 * @param {(() => void)} [options.assertWritable] Defaults to the no-op. The conversion MUST
 *   stay unguarded: it runs while the layout reads `unsettled`, which is precisely the state
 *   the stale-arrangement guard exists to refuse.
 * @returns {PerRecordCraftingDefinitionRepository}
 */
export function perRecordRecipeStore({
  documentClass,
  collection,
  hydrate = (raw) => raw,
  assertWritable = () => {},
}) {
  return new PerRecordCraftingDefinitionRepository({
    keyPrefix: RECIPE_RECORD_KEY_PREFIX,
    // `undefined` selects the adapter's own production accessors; a caller that injects
    // neither gets exactly the repository a live world would build.
    documentClass,
    collection,
    hydrate,
    assertWritable,
  });
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
    throw new RecipeStorageConversionRefusedError(
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
  return {
    records: records.length,
    reclaimed: reclaimFailure ? 0 : reclaimed,
    reclaimFailure,
    direction: REVERSE,
  };
}

/**
 * Move a recipe corpus from the legacy whole-array key into per-record documents.
 *
 * The four steps of `data-models/spec.md` § Storage Conversion Crash Recovery, plus the
 * guard and the verification that make them safe, each awaited:
 *
 * | | operation | note |
 * |---|---|---|
 * | G | read the source and refresh the destination index; refuse if the source is empty while the index is not | runs BEFORE step 1, so a refusal has written nothing |
 * | 1 | layout := `unsettled` | on a never-converted world this CREATES the layout document |
 * | 2 | `createOrUpdateAll(records)` | at most two document calls; **never a delete** |
 * | V | refresh the index and confirm a document for every source key | gates step 3 |
 * | 3 | layout := `perRecord` | the LAYOUT, set to the target VALUE — not the target key |
 * | 4 | delete the legacy whole-array document | outside the transaction; its failure completes forward |
 *
 * **Step 2 is create/update-only, and `putAll` is not step 2.** `putAll` walks the index and
 * derives a removal for every key absent from the supplied corpus, which is exactly right
 * for the reverse's whole-corpus step 4 and catastrophic here: a resume whose source has
 * already been reclaimed supplies an empty set, and the reconciler deletes the entire
 * converted corpus while every return-count check reports success.
 *
 * **Verification gates step 3, not step 4.** Step 3 is the write that ASSERTS the layout
 * describes where the records are, so a corpus that failed verification must never reach it.
 * With verification before step 3 a shortfall leaves the layout `unsettled` and the legacy
 * document intact — the recoverable state. With verification after it, the world claims
 * `perRecord` over a corpus missing records and step 4 is all that stands between it and
 * total loss.
 *
 * **Compensation restores key PRESENCE.** See change 1 in the module header.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @param {{exists: (key: string) => boolean, delete: (key: string) => Promise<boolean>}}
 *   [options.settingDocuments] Injected for tests; whole-document presence and deletion.
 * @returns {Promise<{records: number, reclaimed: number, reclaimFailure: Error|null,
 *   direction: string}>}
 */
export async function runForwardRecipeStorageConversion({
  getSetting,
  setSetting,
  documentClass,
  collection,
  settingDocuments = worldSettingDocumentAccess({ collection }),
}) {
  const store = perRecordRecipeStore({ documentClass, collection });
  // Guard G. The source is READ ONCE, here, before any write: a client that has passed this
  // point holds its records and never re-reads, which is what bounds the interleaving window
  // with a concurrent conversion to the two harmless sides of this boundary.
  const legacy = readSettingDefensively(getSetting, SETTING_KEYS.RECIPES);
  const records = Array.isArray(legacy) ? legacy : [];
  const index = store.refreshIndex();
  // The mirror of the reverse guard. An empty source over a non-empty destination is the one
  // shape where converting is indistinguishable from erasing: either this client cannot read
  // the legacy key, or the recorded layout is a lie. Inferring the layout from a data key's
  // emptiness is forbidden, so refusing is the only answer that cannot lose the corpus.
  if (records.length === 0 && index.size > 0) {
    throw new RecipeStorageConversionRefusedError(
      `Fabricate | refusing to convert recipe storage: the legacy recipe key holds no recipes, but ${index.size} per-record recipe document(s) already exist. The recorded layout does not describe this world's storage.`
    );
  }

  // Captured BEFORE step 1, because step 1 is what creates it on a never-converted world.
  const layoutDocumentExisted = settingDocuments.exists(QUALIFIED_LAYOUT_KEY);
  const layoutBefore = readSettingDefensively(getSetting, SETTING_KEYS.RECIPE_STORAGE_LAYOUT);

  try {
    await setSetting(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);
    await store.createOrUpdateAll(records);
    _verifyEveryRecordLanded(store, records);
    await setSetting(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.PER_RECORD);
  } catch (error) {
    await _compensateForwardLayout({
      settingDocuments,
      setSetting,
      layoutDocumentExisted,
      layoutBefore,
    });
    throw new RecipeStorageConversionCompensatedError(
      `Fabricate | the recipe storage conversion failed and was rolled back: ${error?.message ?? error}`,
      { cause: error }
    );
  }

  // Step 4 — envelope reclamation, OUTSIDE the transaction and past the point where there is
  // anything to compensate TO: restoring the layout over a reclaimed source is itself the
  // loss. Its failure therefore completes forward, and MUST NOT reach a caller that
  // compensates. The state it leaves is the quiet downgrade-lossy one, which
  // `detectSurvivingLegacyRecipeDocument` finds on a later settled boot.
  let reclaimFailure = null;
  try {
    await settingDocuments.delete(QUALIFIED_RECIPES_KEY);
  } catch (error) {
    reclaimFailure = error instanceof Error ? error : new Error(String(error));
    console.error('Fabricate | failed to reclaim the legacy whole-array recipe document', error);
  }
  return {
    records: records.length,
    reclaimed: reclaimFailure ? 0 : 1,
    reclaimFailure,
    direction: FORWARD,
  };
}

/**
 * Confirm the destination index holds a document for every record the source supplied.
 *
 * By ID CONTAINMENT over a freshly refreshed index, never by count: a count is blind to a
 * remove-plus-add, and the short-return check inside the repository only sees what one leg
 * was asked for. This is the clause that gates step 3.
 *
 * @param {PerRecordCraftingDefinitionRepository} store
 * @param {object[]} records
 */
function _verifyEveryRecordLanded(store, records) {
  const index = store.refreshIndex();
  const missing = records
    .map((record) => String(record?.id))
    .filter((id) => !index.has(store.keyFor(id)));
  if (missing.length === 0) return;
  throw new Error(
    `Fabricate | the recipe storage conversion wrote ${records.length - missing.length} of ${records.length} records; ${missing.length} did not land (${missing.slice(0, 5).join(', ')}). The layout was not advanced and the legacy recipes are untouched.`
  );
}

/**
 * Restore the layout key's PRESENCE, which is not the same operation as restoring its value.
 *
 * On a never-converted world the layout key has NO document — the registered `singleArray`
 * default is served without one — so step 1 created it and compensation must DELETE it.
 * Writing `singleArray` back instead would leave a document that was not there before, and
 * spend a `Setting` envelope, on a world the GM is being told is untouched.
 *
 * Every failure here is swallowed and logged, exactly as {@link compensateSetting} does and
 * for the same reason: the operation's own error is the one the caller must see.
 *
 * @param {object} options
 * @param {{delete: (key: string) => Promise<boolean>}} options.settingDocuments
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {boolean} options.layoutDocumentExisted
 * @param {*} options.layoutBefore
 * @returns {Promise<void>}
 */
async function _compensateForwardLayout({
  settingDocuments,
  setSetting,
  layoutDocumentExisted,
  layoutBefore,
}) {
  if (!layoutDocumentExisted) {
    try {
      await settingDocuments.delete(QUALIFIED_LAYOUT_KEY);
    } catch (error) {
      console.error('Fabricate | failed to delete the layout document it had created', error);
    }
    return;
  }
  await compensateSetting(setSetting, SETTING_KEYS.RECIPE_STORAGE_LAYOUT, layoutBefore);
}

/**
 * The transitions this build can perform, as a table.
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
  // Issue 1211's forward rows, and its resume. Step 2 is idempotent by construction —
  // `deriveSettingDocumentId` derives `_id` from the record key and `createDocuments` with
  // `keepId` is an unconditional put — so a resume is the same operation replayed from
  // step 1, exactly as it is on the reverse.
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
    to: DEFINITION_STORAGE_TARGETS.PER_RECORD,
    run: runForwardRecipeStorageConversion,
  }),
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
    to: DEFINITION_STORAGE_TARGETS.PER_RECORD,
    run: runForwardRecipeStorageConversion,
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
 * Reclaim per-record recipe documents left behind by a conversion whose step 4 did not
 * complete — and refuse any document the settled legacy corpus does not describe.
 *
 * Guarded on BOTH keys reading `singleArray`, never on the documents' presence: "there are
 * per-record documents" is not evidence about the layout, and treating it as evidence is the
 * inference the spec forbids.
 *
 * **The id-containment rule is the defence at the point of destruction** (issue 1211,
 * module header change 3). Every legitimate reclaim target is described by the legacy array
 * BY CONSTRUCTION, so the rule is exact rather than conservative, and the one shape it
 * excludes — a document holding a record the settled corpus lacks — is precisely the
 * corpus-loss case. It is applied PER DOCUMENT: an undescribed document does not make its
 * described neighbours un-reclaimable, and both rules keep the document that matters.
 *
 * Value divergence is deliberately NOT consulted. Reaching a settled `singleArray` world
 * with a per-record document holding a NEWER value requires a write through a repository the
 * arrangement guard refuses, so there is no reachable state where a described document is
 * worth keeping for its contents.
 *
 * @param {object} options See {@link runReverseRecipeStorageConversion}.
 * @returns {Promise<{reclaimed: number, kept: number, records: number}>} how many documents
 *   were reclaimed, how many were refused, and how many recipes the legacy array holds.
 */
async function reclaimOrphanedRecipeRecords({ getSetting, documentClass, collection }) {
  try {
    const store = perRecordRecipeStore({ documentClass, collection });
    const index = store.refreshIndex();
    if (index.size === 0) return { reclaimed: 0, kept: 0, records: 0 };
    const legacy = readSettingDefensively(getSetting, SETTING_KEYS.RECIPES);
    const settled = Array.isArray(legacy) ? legacy : [];
    const described = new Set(settled.map((record) => String(record?.id)));
    const indexed = [...index.keys()].map((key) => store.idFromKey(key));
    const reclaimable = indexed.filter((id) => described.has(id));
    const kept = indexed.length - reclaimable.length;
    if (reclaimable.length > 0) {
      // One batch, so the reclaim is still exactly one delete leg however many documents it
      // names. `putAll([])` would have been one call too, but it derives its removals from
      // the supplied corpus and therefore cannot express "these and not those".
      await store.runBatch(async () => {
        for (const id of reclaimable) await store.delete(id);
      });
    }
    return { reclaimed: reclaimable.length, kept, records: settled.length };
  } catch (error) {
    // Reclamation is outside the transaction by construction, so a failure completes forward
    // and the next boot retries it. Reported rather than swallowed, because a reclaim that
    // never succeeds is a permanent envelope leak.
    console.error('Fabricate | failed to reclaim orphaned per-record recipe documents', error);
    return { reclaimed: 0, kept: 0, records: 0 };
  }
}

/**
 * Find a legacy whole-array recipe document that survived on a settled GRANULAR world, and
 * decide whether it is debris or data.
 *
 * The mirror of {@link reclaimOrphanedRecipeRecords}, and **the asymmetry is the point.** A
 * conversion that ended between step 3 and step 4 leaves `layout = perRecord` and an intact
 * legacy document. An older build has no layout awareness at all: it reads that document,
 * the GM edits normally, and the next upgrade reads the per-record corpus and discards every
 * one of those edits — no error, no notice. So a surviving legacy document MAY carry newer
 * authored data, where an orphaned per-record document on a settled legacy world is debris
 * BY DEFINITION. That is why this is not called a reclaimer and why "orphan" is not reused
 * for it: the word asserts debris-ness, which is the assumption that makes this case
 * destructive.
 *
 * Byte-equal means the conversion's step 4 simply did not complete, so it is retried. Any
 * difference is a downgrade round trip and the document is LEFT ALONE and reported.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {() => any} [options.documentClass]
 * @param {() => Iterable<any>|null} [options.collection]
 * @param {{exists: Function, delete: Function}} [options.settingDocuments]
 * @returns {Promise<{survived: boolean, reclaimed: boolean, diverged: boolean,
 *   legacyRecords: number, granularRecords: number}>}
 */
async function detectSurvivingLegacyRecipeDocument({
  getSetting,
  documentClass,
  collection,
  settingDocuments = worldSettingDocumentAccess({ collection }),
}) {
  const absent = {
    survived: false,
    reclaimed: false,
    diverged: false,
    legacyRecords: 0,
    granularRecords: 0,
  };
  try {
    // Document PRESENCE, never the value: a deleted registered setting reads back as its
    // registered `[]` default, which is indistinguishable from a surviving empty document.
    if (!settingDocuments.exists(QUALIFIED_RECIPES_KEY)) return absent;
    const legacy = readSettingDefensively(getSetting, SETTING_KEYS.RECIPES);
    const survivors = Array.isArray(legacy) ? legacy : [];
    const store = perRecordRecipeStore({ documentClass, collection });
    const granular = await store.loadAll();
    const counts = { legacyRecords: survivors.length, granularRecords: granular.length };
    if (!_sameStoredValueSet(survivors, granular)) {
      return { survived: true, reclaimed: false, diverged: true, ...counts };
    }
    await settingDocuments.delete(QUALIFIED_RECIPES_KEY);
    return { survived: true, reclaimed: true, diverged: false, ...counts };
  } catch (error) {
    console.error('Fabricate | failed to inspect the surviving legacy recipe document', error);
    return absent;
  }
}

/**
 * Whether two record collections are the same SET of stored values, byte for byte.
 *
 * Sorted stringifications rather than a per-id comparison, because the question is whether
 * the legacy document is debris — an exact copy of what the granular corpus already holds —
 * and an id-keyed comparison would call two records with the same id and different bodies a
 * match.
 *
 * @param {object[]} left
 * @param {object[]} right
 * @returns {boolean}
 */
function _sameStoredValueSet(left, right) {
  if (left.length !== right.length) return false;
  const serialize = (records) =>
    records.map((record) => JSON.stringify(record)).sort((left, right) => (left < right ? -1 : 1));
  const a = serialize(left);
  const b = serialize(right);
  return a.every((value, position) => value === b[position]);
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
 * @param {{exists: Function, delete: Function}} [options.settingDocuments] Injected for
 *   tests; whole-`Setting`-document presence and deletion.
 * @param {boolean} [options.migrationPassPersistedCorpusKey=false] Whether THIS boot's
 *   migration pass issued a write to any corpus key (issue 1211). Defaults to "it did not",
 *   so every existing caller is unaffected and a wiring regression fails OPEN — which is why
 *   the wiring is pinned by a source scan rather than left to a behavioural test.
 * @returns {Promise<{action: string, layout: string|null, target: string|null,
 *   records?: number, reclaimed?: number, error?: Error}>}
 */
export async function reconcileRecipeStorageLayout({
  getSetting,
  setSetting,
  documentClass,
  collection,
  settingDocuments = worldSettingDocumentAccess({ collection }),
  migrationPassPersistedCorpusKey = false,
}) {
  return reconcileDefinitionStorageLayout(RECIPE_STORAGE_RECONCILER, {
    getSetting,
    setSetting,
    documentClass,
    collection,
    settingDocuments,
    migrationPassPersistedCorpusKey,
  });
}

/**
 * The recipe class's three non-neutral reconciler facts (issue 1212).
 *
 * @type {import('./definitionStorageReconciler.js').DefinitionStorageReconcilerDescriptor}
 */
const RECIPE_STORAGE_RECONCILER = Object.freeze({
  layoutKey: SETTING_KEYS.RECIPE_STORAGE_LAYOUT,
  targetKey: SETTING_KEYS.RECIPE_STORAGE_TARGET,
  conversionFor: recipeStorageConversionFor,
  isRefusal: (error) => error instanceof RecipeStorageConversionRefusedError,
  isSelfCompensated: (error) => error instanceof RecipeStorageConversionCompensatedError,
  async onSettledLegacy({ getSetting, documentClass, collection }) {
    const reclaim = await reclaimOrphanedRecipeRecords({ getSetting, documentClass, collection });
    if (reclaim.kept > 0) return { action: 'reclaim-refused', ...reclaim };
    return { reclaimed: reclaim.reclaimed };
  },
  async onSettledGranular({ getSetting, documentClass, collection, settingDocuments }) {
    const survivor = await detectSurvivingLegacyRecipeDocument({
      getSetting,
      documentClass,
      collection,
      settingDocuments,
    });
    if (survivor.diverged) return { action: 'legacy-survivor-diverged', ...survivor };
    return { reclaimed: survivor.reclaimed ? 1 : 0 };
  },
});
