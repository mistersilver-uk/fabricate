/**
 * The **arrangement-aware crafting-system corpus accessor** for the startup migration pass
 * (issue 1212).
 *
 * `MigrationRunner` reads `craftingSystems` raw and writes it raw. On a world whose components
 * have been extracted into per-record documents that payload carries no `components` key at
 * all, and SIX registry migrations consume `system.components` from it:
 *
 * - `migrateComponentId.js` — reads AND rebuilds `system.components`
 * - `migrateRenameSourceUuidFields.js` — `ENTRY_ARRAY_KEYS` includes `components`
 * - `migrateToolsToFirstClass.js`
 * - `migrateBreakToolsOnFail.js`
 * - `migrateCatalystsToTools.js` — reads components AND mutates each `salvage`, deleting
 *   `catalysts` and adding `toolIds`, while writing tool bodies onto the system
 * - `migrateEssencesToIngredientGroups.js`, via `_reconcileAlchemyCollisions` — which would
 *   otherwise compute alchemy signatures against ZERO components and disable recipes on the
 *   strength of it
 *
 * The failure is not "the migration did nothing"; it is "the migration ran, decided from no
 * evidence, and wrote the decision".
 *
 * ## `extract` RESTORES the raw key; it does NOT omit it
 *
 * The repository's `serialize` OMITS `components` under `perRecord`. This module's `extract`
 * is a DIFFERENT operation and conflating the two is a corpus-loss path: it must put back
 * precisely what the raw read carried, per system — **absent stays absent, `[]` stays `[]`,
 * and a residual non-empty array stays intact.**
 *
 * An `extract` that omitted unconditionally would fail its own identity requirement on the
 * empty-array shape and — worse — would DESTROY a residual non-empty key. That key is the
 * downgrade-era authoring the residual detector is required to leave alone, and the migration
 * pass runs BEFORE the reconcile that would detect it, so the writeback would erase it on the
 * same boot, before the detector ever saw it. Reachable on any boot with a pending migration.
 *
 * ## The round trip MUST be a byte identity, and KEY ORDER counts
 *
 * `MigrationRunner` decides whether to write by comparing `JSON.stringify(data.systems)`
 * against the stringification of what it read. So `extract(inflate(x))` must be byte-identical
 * to `x` for a system with no `components` key, with a `managedItems` alias, with an `items`
 * alias, with an EMPTY array, and with a RESIDUAL NON-EMPTY array — and a restore that DELETED
 * the key and re-appended it would pass every shape whose `components` sits last and fail
 * whenever it does not. Real records come from `_normalizeSystem`'s literal, where
 * `components:` is followed by `tools:`, so the ordinary case is the failing one.
 *
 * The restore therefore uses `{...payload, components: original}`, which overwrites in place
 * and keeps the key at the position `inflate` left it — which is the position the stored
 * record had it at, because `inflate` overwrote in place too. When the key was absent it is
 * REMOVED by rest-destructuring, which preserves the order of every remaining key.
 *
 * If it were not an identity, `systemsChanged` would fire on every boot of a converted world
 * and the pass would write forever.
 *
 * ## Records are raw AND detached
 *
 * `Setting#value` is initialized once and answered from the memo, so an identity `hydrate`
 * hands a migration the stored document's own object; the migration transforms it in place;
 * the differential serializes it back to that same object; the comparison compares the object
 * against itself; every record is skipped under `skipUnchanged`; and the writeback issues
 * NOTHING while the pass bumps the version. The granular arm therefore hydrates through
 * `structuredClone`.
 *
 * ## The guard is installed on BOTH arms
 *
 * Replacing an unguarded write with a new unguarded write would leave the stale-arrangement
 * hole open, so both arms carry the guard keyed on the arm this accessor selected.
 * `readLayout` is deliberately the LIVE reader and never the memo: the guard's whole purpose
 * is detecting a mid-pass flip and it re-reads per write, so wiring it to the memo would make
 * it unable to fire.
 */

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../config/settings.js';

import {
  componentEnvelope,
  componentRecordKey,
  componentRecordScope,
  componentsOf,
  createComponentRecordStore,
} from './componentRecords.js';
import { memoizeLayout, selectDefinitionCorpusArm } from './definitionCorpusArms.js';
import { createArrangementWriteGuard } from './definitionStorageArrangement.js';
import { readDefinitionStorageLayout } from './definitionStorageLayout.js';
import { defaultWorldSettingCollection } from './PerRecordCraftingDefinitionRepository.js';

/**
 * Thrown when the crafting-system corpus cannot be READ, as opposed to being empty.
 *
 * The distinction is the entire point of this module, so it carries a type rather than relying
 * on a message: an empty corpus is a fact a migration may reduce over, and an unreadable one
 * is a fact that must stop the pass.
 */
export class CraftingSystemCorpusUnreadableError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(`Fabricate | the crafting system corpus could not be read: ${reason}`);
    this.name = 'CraftingSystemCorpusUnreadableError';
  }
}

/**
 * Thrown when a writeback would drop component records the read observed.
 *
 * The component writeback is create/update-only, so a record removed by a transformation would
 * keep its document, be read back on the next pass, and have its removal silently undone while
 * the version says migrated.
 */
export class CraftingSystemCorpusShrinkError extends Error {
  /** @param {string[]} missingKeys */
  constructor(missingKeys) {
    super(
      `Fabricate | refusing a crafting system corpus writeback that drops ${missingKeys.length} component record(s) the read observed (${missingKeys.slice(0, 5).join(', ')}). This writer issues no delete leg, so the removal would be silently undone on the next pass.`
    );
    this.name = 'CraftingSystemCorpusShrinkError';
    this.missingKeys = missingKeys;
  }
}

/**
 * Build the arrangement-aware crafting-system corpus accessor.
 *
 * Deliberately TOTAL: nothing below can throw at construction. `main.js` builds this inside
 * `_runMigrations`, outside every error containment the runner installs, and a rejection
 * escaping the module's `ready` callback is invisible — the hook dispatcher's try/catch is
 * synchronous, so it surfaces only as an unhandled console rejection, the readiness promise
 * never settles, and the module is left with no managers.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {() => any} [options.documentClass] Injected for tests.
 * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
 * @returns {{layout: () => string|null, loadAll: () => Promise<object[]>,
 *   createOrUpdateAll: (systems: object[]) => Promise<void>}}
 */
export function createCraftingSystemCorpus({ getSetting, setSetting, documentClass, collection }) {
  const readLayout = () =>
    readDefinitionStorageLayout(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, getSetting);
  const layout = memoizeLayout(readLayout);

  /**
   * What the raw read carried under `components`, per system id. Captured at READ time so the
   * restore puts back exactly what was stored rather than whatever storage holds by the time
   * the writeback runs.
   *
   * @type {Map<string, {present: boolean, value: *}>|null}
   */
  let originalComponentKeys = null;
  /** The component record keys the read observed, for the shrink refusal. */
  let observedRecordKeys = null;

  const resolveCollection = () => {
    const resolved = collection ? collection() : defaultWorldSettingCollection();
    // NOT `?? []`. `defaultWorldSettingCollection` answers `null` when there is no settings
    // storage at all, and the repository's index build treats that as an empty corpus — which
    // reinstates the exact silent-empty-corpus failure this module exists to remove.
    if (resolved == null) {
      throw new CraftingSystemCorpusUnreadableError('the world setting collection is unavailable');
    }
    return resolved;
  };

  const assertGranularWritable = createArrangementWriteGuard({
    arrangement: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    readLayout,
  });

  const granularStore = () =>
    createComponentRecordStore({
      documentClass,
      collection: resolveCollection,
      // Detached, per the module documentation above.
      hydrate: (raw) => structuredClone(raw),
      assertWritable: assertGranularWritable,
    });

  const assertLegacyWritable = createArrangementWriteGuard({
    arrangement: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
    readLayout,
  });

  const legacyArm = {
    // `?? []` is KEPT here, verbatim from the accessor this replaces, and is forbidden on the
    // granular arm. On the legacy arm an unreadable answer and an empty array are the same
    // corpus; on the granular arm distinguishing them is the point.
    loadAll: async () => getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) ?? [],
    async createOrUpdateAll(systems) {
      assertLegacyWritable();
      await setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, systems);
    },
  };

  const granularArm = {
    async loadAll() {
      const stored = getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) ?? [];
      const store = granularStore();
      store.refreshIndex();
      originalComponentKeys = new Map();
      observedRecordKeys = new Set(store.recordIds());
      return stored.map((system) => {
        const id = String(system?.id ?? '');
        originalComponentKeys.set(id, {
          present: Object.hasOwn(system ?? {}, 'components'),
          value: system?.components,
        });
        // Overwrites IN PLACE when the key already exists, which is what keeps the round trip
        // a byte identity for a record whose `components` is not the last key.
        return { ...system, components: componentsForSystem(store, id) };
      });
    },
    async createOrUpdateAll(systems) {
      const list = Array.isArray(systems) ? systems : [];
      const records = [];
      for (const system of list) {
        if (system?.id == null) continue;
        for (const component of componentsOf(system)) {
          if (component?.id == null) continue;
          records.push(componentEnvelope(String(system.id), component));
        }
      }
      if (observedRecordKeys) {
        const writing = new Set(
          records.map((record) => componentRecordKey(record.systemId, record.component?.id))
        );
        // Id-set containment, never a length comparison: a length is blind to a
        // remove-plus-add, which is the shape a future migration is most likely to produce.
        const missing = [...observedRecordKeys].filter((key) => !writing.has(key));
        if (missing.length > 0) throw new CraftingSystemCorpusShrinkError(missing);
      }
      // The component leg FIRST, then the single container write — the same declared
      // cross-class order the runtime repository issues, for the same two reasons.
      await granularStore().createOrUpdateAll(records);
      // The container leg carries the guard keyed on the arm THIS accessor selected, so a
      // layout that flipped mid-pass refuses here as well as on the component leg.
      assertGranularWritable();
      await setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, list.map(restoreOriginalComponentKey));
    },
  };

  /**
   * Put back exactly what the raw read carried under `components` for one system.
   *
   * @param {object} system
   * @returns {object}
   */
  function restoreOriginalComponentKey(system) {
    const original = originalComponentKeys?.get(String(system?.id ?? ''));
    // An unobserved system — one a migration ADDED — keeps whatever the pass produced, because
    // there is no prior raw key to restore and dropping it would lose the addition.
    if (!original) return system;
    if (!original.present) {
      const { components: _extracted, ...rest } = system ?? {};
      return rest;
    }
    return { ...system, components: original.value };
  }

  const unsettledRefusal = () => {
    throw new CraftingSystemCorpusUnreadableError(
      'this world is part-way through a component storage conversion, so neither arrangement holds the whole component corpus'
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

  const selectArm = () =>
    selectDefinitionCorpusArm(layout(), { legacyArm, granularArm, unsettledArm });

  return {
    layout,
    loadAll: () => selectArm().loadAll(),
    createOrUpdateAll: (systems) => selectArm().createOrUpdateAll(systems),
  };
}

/**
 * One system's component documents, as stored values in index order.
 *
 * @param {import('./PerRecordCraftingDefinitionRepository.js').PerRecordCraftingDefinitionRepository} store
 * @param {string} systemId
 * @returns {object[]}
 */
function componentsForSystem(store, systemId) {
  const scope = componentRecordScope(systemId);
  return store
    .recordIds()
    .filter((recordKey) => recordKey.startsWith(scope))
    .map((recordKey) => store.storedValueFor(recordKey));
}

/**
 * Adopt any per-component document that replicated into this client BEFORE Fabricate's setting
 * hooks were registered (issue 1212, mirroring #1211's recipe half).
 *
 * Core replays its socket buffer in `Game.#applyBufferedSocketEvents()`, inside
 * `activateSocketListeners()` and therefore BEFORE `Hooks.callAll("ready")`. Fabricate
 * registers its `createSetting` / `updateSetting` / `deleteSetting` listeners inside the
 * `ready` callback, after `await fabricate.initialize()`. A record document that arrives in
 * that window is correct in `game.settings.storage` and MISSING from the manager's systems for
 * the whole session.
 *
 * **Unconditional, on every client.** The writer is the primary GM, who never misses its own
 * writes; the client at risk is any OTHER booting client, and a non-GM client never reaches
 * the storage reconcile at all. So this must sit outside every GM gate — and AFTER the hook
 * registrations, because a read placed before them reopens the window it closes.
 *
 * A no-op unless the manager's repository reports its COMPONENT class granular, which is the
 * honest condition.
 *
 * @param {{describeDefinitionStorage?: Function, reload?: Function}} craftingSystemManager
 * @returns {boolean} whether the manager's corpus actually moved.
 */
export function resyncGranularComponentRecords(craftingSystemManager) {
  try {
    const storage = craftingSystemManager?.describeDefinitionStorage?.();
    if (storage?.components?.granular !== true) return false;
    return craftingSystemManager.reload?.() === true;
  } catch (error) {
    // Defensive for the same reason every other `ready`-callback edge is: this runs inside the
    // hook registration block, and a throw there takes down every listener below it.
    console.error('Fabricate | failed to resync replicated per-component documents', error);
    return false;
  }
}
