/**
 * The **arrangement-aware recipe corpus accessor** for the startup migration pass
 * (issue 1242).
 *
 * `MigrationRunner` used to read and write the recipe corpus through the raw whole-array
 * setting accessors. On a world whose recipes have been converted to per-record documents
 * that read returns the registered `[]` default — no throw, no warning, indistinguishable
 * from an empty world — and the corpus-global migrations do not skip an empty corpus. They
 * reduce over it and persist a confidently wrong answer: `migrateAlchemyCheckMode` seeds
 * every alchemy system `'none'`, which its own docstring describes as stopping that check
 * from running, and `migrateSplitRoutedResolutionModes` tie-breaks a zero-voter count to
 * `routedByIngredients`. The failure is not "the migration did nothing"; it is "the
 * migration ran, decided from no evidence, and wrote the decision".
 *
 * So the read is the more damaging half, and this module exists to make the read select on
 * the layout the same way a write must.
 *
 * ## The mapping is a positive switch, never a truthiness test
 *
 * A "not `singleArray`, therefore granular" formulation is wrong in a way that is easy to
 * miss: unit fixtures answer the unregistered layout key with `null` in one suite and `[]`
 * in another, and `[]` is TRUTHY. Only the three recognised values select a data arm; every
 * other answer — absent, unrecognised, or thrown — takes the legacy arrangement.
 *
 * | layout | behaviour |
 * |---|---|
 * | `singleArray` | the legacy whole-array accessor, byte-for-byte today's path |
 * | `perRecord` | the raw per-record store |
 * | `unsettled` | REFUSE: neither arrangement can be read alone |
 * | anything else | the legacy accessor |
 *
 * ## Why `unsettled` refuses, and why an unreadable layout does not
 *
 * The two directions are opposite on purpose, and this repository already holds both
 * conventions: `readRecipeStorageTarget` fails to `singleArray`, `readRecipeStorageLayout`
 * fails to `null` so the Valid Id Basis refuses.
 *
 * `unsettled` follows the second. It is a positively-established statement that the corpus
 * is spread across BOTH arrangements, so either arm would reduce over a PARTIAL corpus —
 * and a partial corpus is the worst possible input to a corpus-global reduction, not a
 * skipped one. It is also live on the ordinary path: the migration pass runs BEFORE the
 * storage reconcile, so the boot after a torn conversion runs the whole pass while the
 * layout says `unsettled`. Refusing costs exactly one boot, because the reconcile settles
 * the layout on that same boot and the next boot re-runs the whole pass from an un-advanced
 * version.
 *
 * An unreadable layout follows the first, for its stated reason: it is the ambient condition
 * of every world that has never converted (and of several hundred unit fixtures with no
 * `game` at all), so refusing there would withhold migrations from those worlds forever, on
 * every boot, with no path out.
 *
 * ## Records are raw AND detached
 *
 * `Recipe#toJSON` is a fixed key literal that emits neither `catalysts` nor `systemItemId`,
 * and `catalysts` is the entire input to the 0.6.0 migration — so routing migration records
 * through the domain model's deserializer and serializer would destroy the fields the
 * migrations came to read and then bump the migration version. Migration payload records are
 * plain objects with no `toJSON` besides, so the manager's serializer would simply throw.
 *
 * Identity hydration alone is NOT enough, and this is the subtler half. `Setting#value` is
 * initialized once by `DataModel#_initialize` and assigned as a plain own data property, so
 * repeated reads return the SAME object wherever the document exists. An identity `hydrate`
 * therefore hands a migration the stored document's own array; the migration transforms it
 * in place; the differential serializes it back to that same object; the stored-value
 * comparison compares the object against itself; every record is skipped under
 * `skipUnchanged`; and the writeback issues NOTHING while the pass bumps the version. The
 * store below therefore hydrates through `structuredClone`.
 *
 * ## The guard is installed on BOTH arms
 *
 * The premise of this change is that the runner's write bypassed the stale-arrangement write
 * guard. Replacing an unguarded write with a new unguarded write would leave the hole open,
 * so both arms carry the guard keyed on the arm this accessor selected. `readLayout` is
 * deliberately the LIVE reader and never the memo below: the guard's whole purpose is
 * detecting a mid-pass flip and it re-reads per write, so wiring it to the memo would make it
 * unable to fire.
 */

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../config/settings.js';

import { memoizeLayout, selectDefinitionCorpusArm } from './definitionCorpusArms.js';
import { createArrangementWriteGuard } from './definitionStorageArrangement.js';
import { perRecordRecipeStore } from './definitionStorageConversion.js';
import { defaultWorldSettingCollection } from './PerRecordCraftingDefinitionRepository.js';
import { readRecipeStorageLayout } from './recipeStorageLayout.js';

/**
 * Thrown when the recipe corpus cannot be READ, as opposed to being empty.
 *
 * The distinction is the entire point of this module, so it carries a type rather than
 * relying on a message: an empty corpus is a fact a migration may reduce over, and an
 * unreadable one is a fact that must stop the pass.
 */
export class RecipeCorpusUnreadableError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(`Fabricate | the recipe corpus could not be read: ${reason}`);
    this.name = 'RecipeCorpusUnreadableError';
  }
}

/**
 * Thrown when a writeback would drop records the read observed.
 *
 * A create/update-only writer issues no delete leg, so a record removed by a transformation
 * would keep its document, be read back on the next pass, and have its removal silently
 * undone while the version says migrated.
 */
export class RecipeCorpusShrinkError extends Error {
  /** @param {string[]} missingIds */
  constructor(missingIds) {
    super(
      `Fabricate | refusing a recipe corpus writeback that drops ${missingIds.length} record(s) the read observed (${missingIds.slice(0, 5).join(', ')}). This writer issues no delete leg, so the removal would be silently undone on the next pass.`
    );
    this.name = 'RecipeCorpusShrinkError';
    this.missingIds = missingIds;
  }
}

/**
 * The id a corpus record is keyed by.
 *
 * @param {object} record
 * @returns {string}
 */
function recordId(record) {
  return String(record?.id ?? '');
}

/**
 * Build the arrangement-aware recipe corpus accessor.
 *
 * Deliberately TOTAL: nothing below can throw at construction. That is load-bearing rather
 * than tidy. `main.js` builds this inside `_runMigrations`, outside every error containment
 * the runner installs, and a rejection escaping the module's `ready` callback is invisible —
 * the hook dispatcher's try/catch is synchronous, so it surfaces only as an unhandled
 * console rejection, the readiness promise never settles, and the module is left with no
 * managers. A throwing precondition added here reopens exactly that escape.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass] Injected for tests; the `Setting` document
 *   class.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests; the world
 *   `Setting` collection the per-record documents live in.
 * @returns {{layout: () => string|null, loadAll: () => Promise<object[]>,
 *   createOrUpdateAll: (records: object[]) => Promise<void>}}
 */
export function createRecipeCorpus({ getSetting, setSetting, documentClass, collection }) {
  const readLayout = () => readRecipeStorageLayout(getSetting);
  // The memo is what the ARM selection reads; `readLayout` stays LIVE for the write guard.
  const layout = memoizeLayout(readLayout);

  // Captured at read time so the shrink refusal compares against what THIS pass observed
  // rather than against whatever storage holds by the time the writeback runs.
  let observedIds = null;

  const resolveCollection = () => {
    const resolved = collection ? collection() : defaultWorldSettingCollection();
    // NOT `?? []`. `defaultWorldSettingCollection` answers `null` when there is no settings
    // storage at all, and the repository's index build treats that as an empty corpus —
    // which reinstates the exact silent-empty-corpus failure this module exists to remove.
    if (resolved == null) {
      throw new RecipeCorpusUnreadableError('the world setting collection is unavailable');
    }
    return resolved;
  };

  const granularStore = () =>
    perRecordRecipeStore({
      documentClass,
      collection: resolveCollection,
      // Detached, per the module documentation above.
      hydrate: (raw) => structuredClone(raw),
      assertWritable: createArrangementWriteGuard({
        arrangement: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
        readLayout,
      }),
    });

  const assertLegacyWritable = createArrangementWriteGuard({
    arrangement: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
    readLayout,
  });

  const legacyArm = {
    // `?? []` is KEPT here, verbatim from the accessor this replaces, and is forbidden on
    // the granular arm. On the legacy arm an unreadable answer and an empty array are the
    // same corpus; on the granular arm distinguishing them is the point.
    loadAll: async () => getSetting(SETTING_KEYS.RECIPES) ?? [],
    async createOrUpdateAll(records) {
      assertLegacyWritable();
      await setSetting(SETTING_KEYS.RECIPES, records);
    },
  };

  const granularArm = {
    async loadAll() {
      const records = await granularStore().loadAll();
      observedIds = new Set(records.map(recordId));
      return records;
    },
    async createOrUpdateAll(records) {
      const list = Array.isArray(records) ? records : [];
      if (observedIds) {
        const writing = new Set(list.map(recordId));
        // Id-set containment, never a length comparison: a length is blind to a
        // remove-plus-add, which is the shape a future migration is most likely to produce.
        const missing = [...observedIds].filter((id) => !writing.has(id));
        if (missing.length > 0) throw new RecipeCorpusShrinkError(missing);
      }
      await granularStore().createOrUpdateAll(list);
    },
  };

  const unsettledRefusal = () => {
    throw new RecipeCorpusUnreadableError(
      'this world is part-way through a recipe storage conversion, so neither arrangement holds the whole corpus'
    );
  };

  const unsettledArm = {
    async loadAll() {
      unsettledRefusal();
    },
    async createOrUpdateAll() {
      unsettledRefusal();
    },
  };

  // Shared with the crafting-system corpus accessor (issue 1212): the ARMS differ per entity
  // class and the SELECTION does not, and the selection is the half a copy gets subtly wrong.
  const selectArm = () =>
    selectDefinitionCorpusArm(layout(), { legacyArm, granularArm, unsettledArm });

  return {
    layout,
    loadAll: () => selectArm().loadAll(),
    createOrUpdateAll: (records) => selectArm().createOrUpdateAll(records),
  };
}

/**
 * Adopt any per-record recipe document that replicated into this client BEFORE Fabricate's
 * setting hooks were registered (issue 1211).
 *
 * Core replays its socket buffer in `Game.#applyBufferedSocketEvents()`, inside
 * `activateSocketListeners()` and therefore BEFORE `Hooks.callAll("ready")`. Fabricate
 * registers its `createSetting` / `updateSetting` / `deleteSetting` listeners inside the
 * `ready` callback, after `await fabricate.initialize()`. A record document that arrives in
 * that window is correct in `game.settings.storage` and MISSING from `RecipeManager.recipes`
 * for the whole session. The gap is pre-existing; a Storage Layout Conversion is the first
 * thing that emits a burst into it.
 *
 * **Unconditional, on every client.** The writer is the primary GM, who never misses its own
 * writes; the client at risk is any OTHER booting client, and a non-GM client never reaches
 * the storage reconcile at all. So this must sit outside every GM gate — and AFTER the hook
 * registrations, because a read placed before them reopens the window it closes.
 *
 * **It MUST NOT re-sample `_layoutAtCorpusRead`.** `RecipeManager#rebuildDefinitionStorage`
 * does re-sample it and is right to, because it re-reads the whole corpus. This does not: it
 * adopts records after the fact, which does not make the ORIGINAL read whole. Re-sampling
 * would let a client claim a known-complete Valid Id Basis over a partial read plus a patch.
 * `reload()` is used precisely because it leaves that sample alone.
 *
 * A no-op unless the manager's repository reports itself granular, which is the honest
 * condition: the settings adapter has no per-record index to refresh and its whole corpus is
 * one replicated document the shared listener already covers.
 *
 * @param {{describeDefinitionStorage?: Function, reload?: Function}} recipeManager
 * @returns {boolean} whether the manager's corpus actually moved.
 */
export function resyncGranularRecipeRecords(recipeManager) {
  try {
    if (recipeManager?.describeDefinitionStorage?.()?.granular !== true) return false;
    return recipeManager.reload?.() === true;
  } catch (error) {
    // Defensive for the same reason every other `ready`-callback edge is: this runs inside
    // the hook registration block, and a throw there takes down every listener below it.
    console.error('Fabricate | failed to resync replicated per-record recipe documents', error);
    return false;
  }
}
