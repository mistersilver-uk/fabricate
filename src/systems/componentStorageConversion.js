/**
 * **Storage Layout Conversion** for component definitions — both directions, the reclaimer,
 * the nested-residual detector, the extraction-eligibility gate, and the reconciler binding
 * that is the only thing allowed to start one (issue 1212).
 *
 * This is not the recipe conversion with a different noun, and the difference is structural.
 * The recipe forward conversion's step 4 DELETES `fabricate.recipes`, a document that must
 * go. This one's step 4 REWRITES `fabricate.craftingSystems` without its `components` keys —
 * a document that must SURVIVE, because it still carries essences, tools, item tags,
 * categories, checks, realms and prerequisites. Four consequences follow, and each is a
 * section below.
 *
 * ## 1. Step 4 is a write, not envelope reclamation
 *
 * It frees no envelope; the container document is unchanged in count and merely smaller.
 * Calling it reclamation would license the reclaimer's "debris by definition" reasoning,
 * which is exactly the assumption section 3 shows is destructive here.
 *
 * It is still OUTSIDE the transaction and still COMPLETES FORWARD. The invariant step 3
 * establishes — "the layout says where the components are" — is already true by then; the
 * residual nested arrays are stale duplicates, not the corpus.
 *
 * Compensation is unchanged and still binds the conversion itself: it records whether the
 * LAYOUT document existed before step 1, deletes it when it did not, restores its value when
 * it did, and signals that it already compensated. The container record is NEVER compensated,
 * because compensation is only reachable from a step-1..3 failure and step 4 has not run.
 *
 * ## 2. The eligibility gate, which runs before the first write
 *
 * `data-models/spec.md` § Granular Definition Storage blocks component extraction CORPUS-WIDE
 * on any crafting system whose id cannot serve as a key segment, and refuses the per-system
 * carve-out explicitly. The gate is evaluated over the STORED container corpus BEFORE step 1
 * — the conversion runs before any manager is constructed, so the manager's map does not
 * exist yet — and a refusal has written nothing, left both keys as found, and named the
 * offending system IDS rather than a count, because the repair is per system.
 *
 * It is scoped to component extraction: a world carrying one ineligible system still receives
 * the RECIPE conversion, because that conversion's key scheme does not embed a system id.
 *
 * ## 3. The residual nested key has THREE dispositions, and the third is the corpus-loss path
 *
 * `detectSurvivingLegacyRecipeDocument` gates on document PRESENCE, precisely because a
 * deleted registered setting reads back as its `[]` default and is otherwise
 * indistinguishable from a surviving empty document. Here the container document ALWAYS
 * exists, so presence carries no information and EMPTINESS takes its place as the "absent"
 * signal:
 *
 * | stored `components` on a settled `perRecord` world | disposition |
 * |---|---|
 * | key ABSENT | nothing to do. The normal state this build writes |
 * | present and EMPTY | retry step 4 for that system silently, with NO GM report |
 * | present and NON-EMPTY | compare as a set of stored values against that system's granular corpus: byte-equal means step 4 simply did not complete, so retry it; ANY difference is reported with both counts, the key is LEFT ALONE, and it never reaches a removal derivation |
 *
 * **The empty arm's justification is NOT "nothing was lost", because that is false on a
 * reachable path.** If step 3 completed and step 4 did not, the container still carries the
 * records, a downgraded build SHOWS them, a GM may delete them all, the old build writes an
 * empty array, and the upgrade silently reverts a deliberate deletion. That state is
 * BYTE-IDENTICAL to the ordinary post-conversion downgrade-and-restore, so no detector can
 * separate them. The silent arm is therefore a deliberate choice favouring the common case,
 * and it is safe because the container-is-not-the-source-of-truth rule keeps the granular
 * corpus authoritative either way — the residual harm is a re-doable deletion, never data
 * loss. Inheriting the recipe half's two-arm rule would instead emit a permanent alarming
 * report on every downgraded-and-restored world.
 *
 * ## 4. Downgrade-lossiness is QUIETER here, not louder
 *
 * A build older than this one reads `craftingSystems`, finds no `components` key, and shows
 * an empty component library for every system — no error, no warning, indistinguishable from
 * a world whose GM has authored no components. Recipes, tools, essences and everything else
 * still work, which makes the loss LESS obvious than the recipe one. The supported mitigation
 * is the same and is named in the consent prompt: set Component Storage Arrangement back to
 * the nested option, reload, let the reverse conversion complete, THEN downgrade.
 */

import { isSafeFlagKeySegment } from '../config/flags.js';
import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
} from '../config/settings.js';

import {
  componentEnvelope,
  componentRecordKey,
  componentRecordScope,
  componentsOf,
  createComponentRecordStore,
} from './componentRecords.js';
import { worldSettingDocumentAccess } from './definitionStorageConversion.js';
import {
  readSettingDefensively,
  reconcileDefinitionStorageLayout,
} from './definitionStorageReconciler.js';

/**
 * Which way a completed conversion moved the corpus.
 *
 * Reported by the conversion rather than derived by the caller from the target, because the
 * two directions must say OPPOSITE things to the GM: the reverse restores the ability to
 * downgrade and the forward removes it.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const COMPONENT_STORAGE_CONVERSION_DIRECTIONS = Object.freeze({
  FORWARD: 'forward',
  REVERSE: 'reverse',
});

const { FORWARD, REVERSE } = COMPONENT_STORAGE_CONVERSION_DIRECTIONS;

/** The fully-qualified key of the component Definition Storage LAYOUT document. */
const QUALIFIED_LAYOUT_KEY = `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.COMPONENT_STORAGE_LAYOUT}`;

/**
 * A conversion that refused BEFORE its first write.
 *
 * Typed rather than a bare `Error` because the disposition is the opposite of a failure's: a
 * refusal wrote nothing, so there is nothing to compensate, and compensating anyway is what
 * arms envelope reclamation against a corpus the container does not describe.
 */
export class ComponentStorageConversionRefusedError extends Error {
  /** @param {string} message @param {object} [details] extra report fields for the GM notice. */
  constructor(message, details = {}) {
    super(message);
    this.name = 'ComponentStorageConversionRefusedError';
    this.details = details;
  }
}

/**
 * A conversion that failed AFTER writing, and has already compensated its own writes.
 *
 * The reconciler recognises it and does not compensate a second time — which on the forward
 * direction would fabricate a layout document the conversion had just deleted, and would
 * revert the target onto the one value that arms the reclaimer.
 */
export class ComponentStorageConversionCompensatedError extends Error {
  /** @param {string} message @param {{cause?: unknown}} [options] */
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ComponentStorageConversionCompensatedError';
  }
}

/**
 * The stored crafting-system corpus, RAW.
 *
 * Raw and never hydrated: a conversion moves bytes between two arrangements of the same
 * records, and this is also the array step 4 rewrites, so routing it through `_normalizeSystem`
 * would make the operation drop every key that whitelist does not emit.
 *
 * @param {(key: string) => *} getSetting
 * @returns {object[]}
 */
function readStoredSystems(getSetting) {
  const stored = readSettingDefensively(getSetting, SETTING_KEYS.CRAFTING_SYSTEMS);
  return Array.isArray(stored) ? stored : [];
}

/**
 * Every component of the stored corpus, as per-record envelopes.
 *
 * @param {object[]} systems
 * @returns {import('./componentRecords.js').ComponentRecordEnvelope[]}
 */
function envelopesOf(systems) {
  const records = [];
  for (const system of systems) {
    if (system?.id == null) continue;
    for (const component of componentsOf(system)) {
      if (component?.id == null) continue;
      records.push(componentEnvelope(String(system.id), component));
    }
  }
  return records;
}

/**
 * The crafting-system ids this build cannot use as a storage key segment.
 *
 * `isSafeFlagKeySegment` is already the predicate, and it is already the one
 * `CraftingSystemManager._assertValidSystemId` refuses new ids with — so the only worlds this
 * can name are ones carrying an id authored before that assertion existed.
 *
 * @param {object[]} systems the STORED corpus.
 * @returns {string[]} the offending ids, in corpus order.
 */
export function unsafeExtractionSystemIds(systems) {
  return systems
    .map((system) => String(system?.id ?? ''))
    .filter((id) => !isSafeFlagKeySegment(id));
}

/**
 * Gate E — refuse the whole extraction when any crafting system's id cannot key a record.
 *
 * CORPUS-WIDE, with the per-system carve-out already refused by canonical spec: extracting
 * the eligible systems and leaving the ineligible one nested would put a single world on two
 * arrangements at once, with no layout value able to describe it.
 *
 * It is a REFUSAL rather than a failure, so it is not compensated and the target is NOT
 * reverted — reverting would assert a layout the build has just established it cannot reach,
 * and on this direction that value is `singleArray`, which is the one value the reclaimer is
 * armed by.
 *
 * @param {object[]} systems the STORED corpus.
 * @returns {void}
 * @throws {ComponentStorageConversionRefusedError}
 */
export function refuseComponentExtractionForUnsafeSystemIds(systems) {
  const offenders = unsafeExtractionSystemIds(systems);
  if (offenders.length === 0) return;
  throw new ComponentStorageConversionRefusedError(
    `Fabricate | refusing to extract component storage: ${offenders.length} crafting system id(s) cannot be used as a storage key segment (${offenders.join(', ')}). Recreate or re-import those crafting systems with a valid id.`,
    { unsafeSystemIds: offenders }
  );
}

/**
 * Move a component corpus out of `system.components` and into per-record documents.
 *
 * | | operation | note |
 * |---|---|---|
 * | E | evaluate extraction eligibility over the WHOLE corpus | runs first; a refusal has written nothing |
 * | G | read the source and refresh the destination index; refuse if the source is empty while the index is not | |
 * | 1 | layout := `unsettled` | on a never-converted world this CREATES the layout document |
 * | 2 | `createOrUpdateAll(records)` | at most two document calls; **never a delete** |
 * | V | refresh the index and confirm a document for every source key, by id containment | gates step 3 |
 * | 3 | layout := `perRecord` | the LAYOUT, set to the target VALUE |
 * | 4 | **rewrite `craftingSystems` with every `components` key OMITTED** | outside the transaction; its failure completes forward |
 *
 * **Step 2 is create/update-only, and `putAll` is not step 2.** `putAll` walks the index and
 * derives a removal for every key absent from the supplied corpus, which is catastrophic on a
 * resume whose source has already been rewritten.
 *
 * **Verification gates step 3, not step 4.** Step 3 is the write that ASSERTS the layout
 * describes where the records are, so a corpus that failed verification must never reach it.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @param {{exists: Function, delete: Function}} [options.settingDocuments] Injected for tests.
 * @returns {Promise<{records: number, reclaimed: number, reclaimFailure: Error|null,
 *   direction: string}>}
 */
export async function runForwardComponentStorageConversion({
  getSetting,
  setSetting,
  documentClass,
  collection,
  settingDocuments = worldSettingDocumentAccess({ collection }),
}) {
  const store = createComponentRecordStore({ documentClass, collection });
  const systems = readStoredSystems(getSetting);
  // Gate E, FIRST and before any write.
  refuseComponentExtractionForUnsafeSystemIds(systems);

  // Guard G. The source is READ ONCE, before any write: a client past this point holds its
  // records and never re-reads, which bounds the interleaving window with a concurrent
  // conversion to the two harmless sides of this boundary.
  const records = envelopesOf(systems);
  const index = store.refreshIndex();
  // An empty source over a non-empty destination is the one shape where converting is
  // indistinguishable from erasing: either this client cannot read the container, or the
  // recorded layout is a lie. Inferring the layout from a data key's emptiness is forbidden,
  // so refusing is the only answer that cannot lose the corpus.
  if (records.length === 0 && index.size > 0) {
    throw new ComponentStorageConversionRefusedError(
      `Fabricate | refusing to convert component storage: this world's crafting systems hold no components, but ${index.size} per-component document(s) already exist. The recorded layout does not describe this world's storage.`,
      { records: 0, kept: index.size }
    );
  }

  // Captured BEFORE step 1, because step 1 is what creates it on a never-converted world.
  const layoutDocumentExisted = settingDocuments.exists(QUALIFIED_LAYOUT_KEY);
  const layoutBefore = readSettingDefensively(getSetting, SETTING_KEYS.COMPONENT_STORAGE_LAYOUT);

  try {
    await setSetting(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);
    await store.createOrUpdateAll(records);
    _verifyEveryRecordLanded(store, records);
    await setSetting(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.PER_RECORD);
  } catch (error) {
    await _compensateForwardLayout({
      settingDocuments,
      setSetting,
      layoutDocumentExisted,
      layoutBefore,
    });
    throw new ComponentStorageConversionCompensatedError(
      `Fabricate | the component storage conversion failed and was rolled back: ${error?.message ?? error}`,
      { cause: error }
    );
  }

  // Step 4 — the CONTAINER REWRITE, outside the transaction and past the point where there is
  // anything to compensate TO. Its failure completes forward and MUST NOT reach a caller that
  // compensates: the layout already says the components are granular, and they are. What it
  // leaves behind is the residual-nested-key state {@link detectSurvivingNestedComponents}
  // finds on a later settled boot and resolves by its byte-equal arm.
  let reclaimFailure = null;
  try {
    await setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, systems.map(withoutComponentsKey));
  } catch (error) {
    reclaimFailure = error instanceof Error ? error : new Error(String(error));
    console.error(
      'Fabricate | failed to rewrite the crafting systems without their nested components',
      error
    );
  }
  return {
    records: records.length,
    reclaimed: reclaimFailure ? 0 : systems.length,
    reclaimFailure,
    direction: FORWARD,
  };
}

/**
 * One stored container record with its `components` key OMITTED.
 *
 * Omitted, never emptied. An absent key and an empty array are the two facts
 * {@link detectSurvivingNestedComponents} discriminates on, so writing `components: []` here
 * would permanently disarm it — and would make a downgraded build's ordinary save
 * indistinguishable from this build's own output.
 *
 * @param {object} system
 * @returns {object}
 */
function withoutComponentsKey(system) {
  const { components: _extracted, ...rest } = system ?? {};
  return rest;
}

/**
 * Move a component corpus from per-record documents back under `system.components`.
 *
 * The forward conversion mirrored, with the one clause that INVERTS: compensation restores
 * the layout VALUE and MUST NOT delete the layout document, because the reverse runs only on
 * a world whose layout already reads `perRecord` or `unsettled` and neither is the registered
 * default, so that document provably exists.
 *
 * Its step 4 IS envelope reclamation and inherits that clause unchanged.
 *
 * @param {object} options See {@link runForwardComponentStorageConversion}.
 * @returns {Promise<{records: number, reclaimed: number, reclaimFailure: Error|null,
 *   direction: string}>}
 */
export async function runReverseComponentStorageConversion({
  getSetting,
  setSetting,
  documentClass,
  collection,
}) {
  const store = createComponentRecordStore({ documentClass, collection });
  // Read BEFORE step 1, so a failure to read the corpus never leaves the layout unsettled.
  const index = store.refreshIndex();
  const bySystem = new Map();
  for (const recordKey of store.recordIds()) {
    const boundary = recordKey.indexOf('.');
    if (boundary <= 0) continue;
    const systemId = recordKey.slice(0, boundary);
    if (!bySystem.has(systemId)) bySystem.set(systemId, []);
    bySystem.get(systemId).push(store.storedValueFor(recordKey));
  }
  const systems = readStoredSystems(getSetting);
  const nested = envelopesOf(systems);
  // The mirror of the forward guard. An empty document read over a container that still names
  // components is the one shape that would make step 2 destructive.
  if (index.size === 0 && nested.length > 0) {
    throw new ComponentStorageConversionRefusedError(
      `Fabricate | refusing to reverse component storage: no per-component documents are readable, but this world's crafting systems still nest ${nested.length} component(s). The recorded layout does not describe this world's storage.`,
      { records: nested.length, kept: 0 }
    );
  }

  await setSetting(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);
  await setSetting(
    SETTING_KEYS.CRAFTING_SYSTEMS,
    systems.map((system) => ({ ...system, components: bySystem.get(String(system?.id)) ?? [] }))
  );
  await setSetting(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY);

  // Step 4 — envelope reclamation, OUTSIDE the transaction. `putAll([])` is the adapter's own
  // differential with an empty desired set, so it deletes exactly the indexed documents and
  // verifies what came back. Its failure completes forward.
  let reclaimFailure = null;
  const reclaimed = index.size;
  try {
    await store.putAll([]);
  } catch (error) {
    reclaimFailure = error instanceof Error ? error : new Error(String(error));
  }
  return {
    records: index.size,
    reclaimed: reclaimFailure ? 0 : reclaimed,
    reclaimFailure,
    direction: REVERSE,
  };
}

/**
 * Confirm the destination index holds a document for every record the source supplied.
 *
 * By ID CONTAINMENT over a freshly refreshed index, never by count: a count is blind to a
 * remove-plus-add, and the short-return check inside the repository only sees what one leg
 * was asked for. This is the clause that gates step 3.
 *
 * @param {import('./PerRecordCraftingDefinitionRepository.js').PerRecordCraftingDefinitionRepository} store
 * @param {import('./componentRecords.js').ComponentRecordEnvelope[]} records
 */
function _verifyEveryRecordLanded(store, records) {
  const index = store.refreshIndex();
  const missing = records
    .map((record) => componentRecordKey(record.systemId, record.component?.id))
    .filter((recordKey) => !index.has(store.keyFor(recordKey)));
  if (missing.length === 0) return;
  throw new Error(
    `Fabricate | the component storage conversion wrote ${records.length - missing.length} of ${records.length} records; ${missing.length} did not land (${missing.slice(0, 5).join(', ')}). The layout was not advanced and the nested components are untouched.`
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
  try {
    await setSetting(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, layoutBefore);
  } catch (error) {
    console.error('Fabricate | failed to compensate the component storage layout', error);
  }
}

/**
 * The transitions this build can perform, as a table.
 *
 * A DECLARED TABLE and never a formula. A formula ("anything to `perRecord`") would silently
 * start claiming to run a conversion the moment a value was added to the target enumeration,
 * which is exactly the failure the recipe half's own table exists to prevent. That the two
 * tables have the same four rows is a coincidence of today's enumeration, not a shared fact.
 *
 * @type {readonly Readonly<{from: string, to: string, run: Function}>[]}
 */
export const COMPONENT_STORAGE_CONVERSIONS = Object.freeze([
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    to: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
    run: runReverseComponentStorageConversion,
  }),
  // The resume. `unsettled` is the sole discriminator a crashed conversion resumes from, and
  // step 2 is convergent, so a resume is the same operation replayed from step 1.
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
    to: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
    run: runReverseComponentStorageConversion,
  }),
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
    to: DEFINITION_STORAGE_TARGETS.PER_RECORD,
    run: runForwardComponentStorageConversion,
  }),
  Object.freeze({
    from: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
    to: DEFINITION_STORAGE_TARGETS.PER_RECORD,
    run: runForwardComponentStorageConversion,
  }),
]);

/**
 * The conversion that moves a component corpus from `from` to `to`, or `null` when this build
 * cannot perform it.
 *
 * @param {string} from A Definition Storage LAYOUT.
 * @param {string} to A Definition Storage TARGET.
 * @returns {Function|null}
 */
export function componentStorageConversionFor(from, to) {
  const entry = COMPONENT_STORAGE_CONVERSIONS.find(
    (candidate) => candidate.from === from && candidate.to === to
  );
  return entry?.run ?? null;
}

/**
 * Reclaim per-component documents left behind by a conversion whose step 4 did not complete —
 * and refuse any document the settled nested corpus does not describe.
 *
 * Guarded on BOTH keys reading `singleArray`, never on the documents' presence: "there are
 * per-component documents" is not evidence about the layout, and treating it as evidence is
 * the inference the spec forbids.
 *
 * The id-containment rule is the defence at the point of destruction, and it is applied PER
 * DOCUMENT and SCOPED BY SYSTEM: an undescribed document does not make its described
 * neighbours un-reclaimable, and a system whose components are all nested does not make
 * another system's undescribed document reclaimable.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {() => any} [options.documentClass]
 * @param {() => Iterable<any>|null} [options.collection]
 * @returns {Promise<{reclaimed: number, kept: number, records: number}>}
 */
export async function reclaimOrphanedComponentRecords({ getSetting, documentClass, collection }) {
  try {
    const store = createComponentRecordStore({ documentClass, collection });
    const index = store.refreshIndex();
    if (index.size === 0) return { reclaimed: 0, kept: 0, records: 0 };
    const settled = envelopesOf(readStoredSystems(getSetting));
    const described = new Set(
      settled.map((record) => componentRecordKey(record.systemId, record.component?.id))
    );
    const indexed = store.recordIds();
    const reclaimable = indexed.filter((recordKey) => described.has(recordKey));
    const kept = indexed.length - reclaimable.length;
    if (reclaimable.length > 0) {
      // One batch, so the reclaim is still exactly one delete leg however many documents it
      // names. `putAll([])` would have been one call too, but it derives its removals from
      // the supplied corpus and therefore cannot express "these and not those".
      await store.runBatch(async () => {
        for (const recordKey of reclaimable) await store.delete(recordKey);
      });
    }
    return { reclaimed: reclaimable.length, kept, records: settled.length };
  } catch (error) {
    // Reclamation is outside the transaction by construction, so a failure completes forward
    // and the next boot retries it. Reported rather than swallowed, because a reclaim that
    // never succeeds is a permanent envelope leak.
    console.error('Fabricate | failed to reclaim orphaned per-component documents', error);
    return { reclaimed: 0, kept: 0, records: 0 };
  }
}

/**
 * Find `components` keys that survived inside the container on a settled `perRecord` world,
 * and decide, per system, whether each is debris or data.
 *
 * **NOT a reclaimer, and "orphan" is deliberately not reused for it.** That word asserts
 * debris-ness, which is the assumption that makes this case destructive. See section 3 of this
 * module's header for the three-arm table and for why the empty arm is a stated CHOICE rather
 * than a claim that nothing was lost.
 *
 * The container is read RAW, beside the hydrate rather than inside it: the hydrated view
 * deliberately overwrites this key from the index, so a detector sharing that path could never
 * see the evidence it exists to read.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass]
 * @param {() => Iterable<any>|null} [options.collection]
 * @returns {Promise<{retried: string[], diverged: string[], nestedRecords: number,
 *   granularRecords: number}>}
 */
export async function detectSurvivingNestedComponents({
  getSetting,
  setSetting,
  documentClass,
  collection,
}) {
  const absent = { retried: [], diverged: [], nestedRecords: 0, granularRecords: 0 };
  try {
    const systems = readStoredSystems(getSetting);
    const store = createComponentRecordStore({ documentClass, collection });
    store.refreshIndex();
    const retried = [];
    const diverged = [];
    let nestedRecords = 0;
    let granularRecords = 0;
    for (const system of systems) {
      // ABSENT is the normal state this build writes, and it is asked as key OWNERSHIP rather
      // than as emptiness, because those are the two arms the table separates.
      if (!Object.hasOwn(system ?? {}, 'components')) continue;
      const nested = componentsOf(system);
      const granular = _granularComponentsFor(store, String(system?.id ?? ''));
      if (nested.length === 0) {
        // Silent: retry step 4 for this system, no GM report. See section 3.
        retried.push(String(system?.id ?? ''));
        continue;
      }
      if (_sameStoredValueSet(nested, granular)) {
        retried.push(String(system?.id ?? ''));
        continue;
      }
      diverged.push(String(system?.id ?? ''));
      nestedRecords += nested.length;
      granularRecords += granular.length;
    }

    if (retried.length > 0) {
      const retriedIds = new Set(retried);
      // One container write, however many systems it repairs. A DIVERGENT system's key is left
      // exactly as found and never reaches this rewrite.
      await setSetting(
        SETTING_KEYS.CRAFTING_SYSTEMS,
        systems.map((system) =>
          retriedIds.has(String(system?.id ?? '')) ? withoutComponentsKey(system) : system
        )
      );
    }
    return { retried, diverged, nestedRecords, granularRecords };
  } catch (error) {
    console.error('Fabricate | failed to inspect the surviving nested component keys', error);
    return absent;
  }
}

/**
 * The stored values of one system's granular component documents.
 *
 * @param {import('./PerRecordCraftingDefinitionRepository.js').PerRecordCraftingDefinitionRepository} store
 * @param {string} systemId
 * @returns {object[]}
 */
function _granularComponentsFor(store, systemId) {
  const scope = componentRecordScope(systemId);
  return store
    .recordIds()
    .filter((recordKey) => recordKey.startsWith(scope))
    .map((recordKey) => store.storedValueFor(recordKey));
}

/**
 * Whether two record collections are the same SET of stored values, byte for byte.
 *
 * Sorted stringifications rather than a per-id comparison, because the question is whether
 * the nested key is debris — an exact copy of what the granular corpus already holds — and an
 * id-keyed comparison would call two records with the same id and different bodies a match.
 *
 * @param {object[]} left
 * @param {object[]} right
 * @returns {boolean}
 */
function _sameStoredValueSet(left, right) {
  if (left.length !== right.length) return false;
  const serialize = (records) =>
    records.map((record) => JSON.stringify(record)).sort((a, b) => (a < b ? -1 : 1));
  const a = serialize(left);
  const b = serialize(right);
  return a.every((value, position) => value === b[position]);
}

/**
 * The component class's three non-neutral reconciler facts.
 *
 * @type {import('./definitionStorageReconciler.js').DefinitionStorageReconcilerDescriptor}
 */
const COMPONENT_STORAGE_RECONCILER = Object.freeze({
  layoutKey: SETTING_KEYS.COMPONENT_STORAGE_LAYOUT,
  targetKey: SETTING_KEYS.COMPONENT_STORAGE_TARGET,
  conversionFor: componentStorageConversionFor,
  isRefusal: (error) => error instanceof ComponentStorageConversionRefusedError,
  isSelfCompensated: (error) => error instanceof ComponentStorageConversionCompensatedError,
  async onSettledLegacy({ getSetting, documentClass, collection }) {
    const reclaim = await reclaimOrphanedComponentRecords({
      getSetting,
      documentClass,
      collection,
    });
    if (reclaim.kept > 0) return { action: 'reclaim-refused', ...reclaim };
    return { reclaimed: reclaim.reclaimed };
  },
  async onSettledGranular({ getSetting, setSetting, documentClass, collection }) {
    const residual = await detectSurvivingNestedComponents({
      getSetting,
      setSetting,
      documentClass,
      collection,
    });
    if (residual.diverged.length > 0) {
      return { action: 'residual-diverged', ...residual, systems: residual.diverged.length };
    }
    return { reclaimed: residual.retried.length };
  },
});

/**
 * Bring the component Definition Storage LAYOUT into agreement with its TARGET.
 *
 * The single entry point for every component layout transition: the boot pass, the reaction to
 * a GM changing the target, and the resume of a crashed conversion are the same call.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @param {{exists: Function, delete: Function}} [options.settingDocuments] Injected for tests.
 * @param {boolean} [options.migrationPassPersistedCorpusKey=false] Whether THIS boot's
 *   migration pass issued a write to any corpus key. SHARED with the recipe reconcile
 *   deliberately: one boolean over all five write-on-change legs is conservative in the safe
 *   direction, costs at most one extra boot, and adds no second fact for a wiring regression
 *   to fail open on.
 * @returns {Promise<object>}
 */
export async function reconcileComponentStorageLayout({
  getSetting,
  setSetting,
  documentClass,
  collection,
  settingDocuments = worldSettingDocumentAccess({ collection }),
  migrationPassPersistedCorpusKey = false,
}) {
  return reconcileDefinitionStorageLayout(COMPONENT_STORAGE_RECONCILER, {
    getSetting,
    setSetting,
    documentClass,
    collection,
    settingDocuments,
    migrationPassPersistedCorpusKey,
  });
}
