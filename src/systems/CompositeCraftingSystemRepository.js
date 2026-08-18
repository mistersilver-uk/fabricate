/**
 * The **composite crafting-system repository** — the container record and the extracted
 * component documents, written as ONE declared-order multi-write (issue 1212).
 *
 * ## Why the component leg is a consequence of `put(system)` and not a second seam
 *
 * `CraftingSystemManager.save(change)` is the manager's single persistence chokepoint, and
 * twenty-four sites name what they touched. A second `saveComponents(change)` seam alongside
 * `save()` would require every one of those sites to remember a second call, and a missed one
 * drops a component write SILENTLY — the in-memory map is already correct and the container
 * write still succeeds, so nothing raises and nothing looks wrong until a reload. An explicit
 * `components:` leg on `DefinitionChange` has the same problem one layer down.
 *
 * So the component leg is a CONSEQUENCE: this repository diffs the described systems'
 * `components` arrays against its own index and issues the resulting legs. No call site
 * changes, no site can forget, and the cross-class write order is declared in exactly one
 * place instead of at every cascade.
 *
 * ## The three-phase cross-class order, and the three arguments that agree on it
 *
 * **(1) component creates and updates; (2) the single `craftingSystems` write; (3) component
 * deletes.** It is stated rather than chosen because three independent arguments require it:
 *
 * - **Partial-commit minimisation.** The component leg is up to three document calls and the
 *   container is one atomic setting write, so the leg that can partially commit goes first
 *   and the set of cross-class states a tear can produce is smallest.
 * - **Referents versus referrers.** `system.essenceDefinitions[].sourceComponentId` POINTS AT
 *   components, and `_deleteComponentSet` clears those pointers. Deleting the documents
 *   before the container write would leave dangling `sourceComponentId` on a tear; deleting
 *   after it cannot.
 * - **Compensability.** Reverse-compensating a delete cannot restore document identity —
 *   `_id` and `_stats` are unrestorable. Under this order phase 1 is DELETE-FREE by
 *   construction, so the only compensable phase is exactly the one that is compensable
 *   WITHOUT identity loss. That argument survives even if either of the two above is later
 *   questioned.
 *
 * The intra-class rule ("creates, updates, deletes last") is therefore GENERALISED across the
 * class boundary rather than contradicted: the destructive leg is last GLOBALLY, not merely
 * last within its own class.
 *
 * Compensation follows the extent: phase 2's failure compensates phase 1 in reverse; phase
 * 3's failure completes forward, because by then the container already describes the world
 * correctly and the surviving documents are debris a later boot reclaims.
 *
 * ## The scoping rule, which is what keeps it bounded
 *
 * The component differential is scoped to the systems the `DefinitionChange` NAMES. Only the
 * whole-corpus fallback (`change === null`, reaching `putAll`) diffs every system.
 *
 * That preserves a property the settings adapter had by accident and flags as this
 * programme's obligation: `save()` flushed EVERY in-memory mutation, including ones made in
 * place by paths that never called `save()`. Under scoping that is no longer free — it stays
 * true for the bare callers that take the whole-corpus fallback, and it stops being true for
 * any in-place component mutation whose site then names a DIFFERENT system.
 *
 * ## The container record is the source of truth for the container, NEVER for components
 *
 * This is the rule that stops the corpus-loss path this change creates, and it is worth
 * stating at length because the destructive implementation passes every test written against
 * a world this build wrote.
 *
 * After a clean forward conversion the stored `craftingSystems` records carry no `components`
 * key. A GM downgrades. The older build has no layout awareness: `_normalizeSystem`'s alias
 * chain finds no `components`, no `managedItems`, no `items`, and emits `components: []`. The
 * GM edits anything at all, `save()` fires, every system is serialized, and `craftingSystems`
 * now carries `components: []` on every system. They upgrade.
 *
 * If the hydrate path or the removal derivation trusted that key, the manager would hold zero
 * components, the whole-corpus write would derive every indexed document as a removal, and
 * the entire component corpus would be deleted with no error and no notice.
 *
 * Two rules close it, and they are separate because they defend different entrances:
 *
 * 1. **Hydrate OVERWRITES the stored `components` key from the index.** The spread wins the
 *    alias chain, so an array — even an empty one — beats `managedItems`/`items` and the
 *    legacy aliases cannot leak back in either.
 * 2. **The removal set derives from the records the write DESCRIBES**, which were hydrated
 *    from the index, and never from the stored container record.
 *
 * The residual key is nonetheless EVIDENCE, and it is read RAW by a detector that runs beside
 * the hydrate rather than inside it (`componentStorageConversion.js`). Two readers of the
 * same bytes, one hydrated and one raw, and saying so here is what stops a later reader
 * "simplifying" one into the other.
 *
 * ## `serialize` OMITS the key; it never writes `components: []`
 *
 * An absent key and an empty array are the two facts the residual detector discriminates on,
 * so writing `components: []` would permanently disarm it. And `_normalizeSystem` is NOT
 * edited by any of this: it is a whitelist rebuild, so a key it stopped emitting would be
 * dropped from storage on the next save of an UN-converted world. The layout selection lives
 * here, one level out, which makes that trap unreachable rather than merely avoided.
 */

import { DEFINITION_STORAGE_TARGETS, SETTING_KEYS } from '../config/settings.js';

import {
  componentEnvelope,
  componentRecordKey,
  componentRecordScope,
  componentsOf,
  createComponentRecordStore,
  parseComponentRecordKey,
} from './componentRecords.js';
import { CraftingDefinitionRepository } from './CraftingDefinitionRepository.js';
import { SettingsCraftingDefinitionRepository } from './SettingsCraftingDefinitionRepository.js';

/**
 * The document-operation option key carrying the batch-close marker (issue 1212).
 *
 * **The name matters and the trap is specific.** Document operation options propagate
 * verbatim to every receiver's hook after a fixed list is stripped, and the effective
 * reserved set is TEN keys, not the nine the server deletes: the server strips `data`,
 * `updates`, `ids`, `parent`, `parentUuid`, `pack`, `restoreDelta`, `deleteAll` and
 * `_result`, and all three client receivers additionally destructure `pack`, `parentUuid`
 * and `syntheticActorUpdate` before spreading the remainder into the hook. Only
 * `syntheticActorUpdate` is absent from the server's nine, which is what makes it the trap:
 * a marker with that name would clear the server and vanish at the receiver.
 */
export const DEFINITION_BATCH_MARKER_KEY = 'fabricateDefinitionBatch';

/**
 * Rebuild the envelope a compensation restores, from the record key and the stored value.
 *
 * @param {string} recordKey
 * @param {object} value
 * @returns {ComponentRecordEnvelope}
 */
function rebuildEnvelope(recordKey, value) {
  const parsed = parseComponentRecordKey(recordKey);
  return { systemId: parsed?.systemId ?? '', component: value };
}

/**
 * @typedef {import('./componentRecords.js').ComponentRecordEnvelope} ComponentRecordEnvelope
 */

/**
 * @see the module documentation above.
 */
export class CompositeCraftingSystemRepository extends CraftingDefinitionRepository {
  /**
   * @param {object} options
   * @param {() => Map<string, object>} options.corpus The manager's own systems map.
   * @param {(raw: object) => object} options.hydrate The manager's `_normalizeSystem`. A
   *   WHITELIST REBUILD, so it must remain the manager's own and never an approximation.
   * @param {(system: object) => object} [options.serialize] Container serializer, before the
   *   component key is omitted.
   * @param {string} [options.arrangement] The COMPONENT arrangement this repository was built
   *   FOR, read once by the caller so the value the manager records is byte-identical to the
   *   one the repository was selected by.
   * @param {(key: string) => *} [options.getSetting]
   * @param {(key: string, value: *) => Promise<*>} [options.setSetting]
   * @param {() => any} [options.documentClass] Injected for tests.
   * @param {() => Iterable<any>|null} [options.collection] Injected for tests.
   * @param {() => void} [options.assertWritable] The stale-arrangement write guard, keyed on
   *   the COMPONENT layout. Installed on BOTH arms, because the hazard is symmetric: a stale
   *   container adapter re-creates nested components a forward conversion extracted, and a
   *   stale per-record adapter re-creates the documents a reverse conversion reclaimed.
   */
  constructor({
    corpus,
    hydrate,
    serialize = (system) => system,
    arrangement = DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
    getSetting,
    setSetting,
    documentClass,
    collection,
    assertWritable = () => {},
  }) {
    super();
    if (typeof corpus !== 'function') {
      throw new TypeError('CompositeCraftingSystemRepository needs a corpus() accessor');
    }
    if (typeof hydrate !== 'function') {
      throw new TypeError('CompositeCraftingSystemRepository needs the manager own normalizer');
    }
    this.arrangement = arrangement;
    this._granular = arrangement === DEFINITION_STORAGE_TARGETS.PER_RECORD;
    this._hydrateSystem = hydrate;
    this._serializeSystem = serialize;
    /** The marker the next component leg carries, or `null` outside a marked operation. */
    this._marker = null;
    /** Whether the CALL now being issued is the one that closes the operation. */
    this._markerCloses = false;
    /** Distinguishes one client's batch ids from another's within one world. */
    this._markerPrefix = `fab-${Date.now().toString(36)}`;
    this._markerSequence = 0;
    // The SAME factory the Storage Layout Conversion builds its store from, so the runtime
    // backend and the conversion cannot disagree about which keys are records, how a record is
    // identified, or what its persisted form is.
    this._components = createComponentRecordStore({
      documentClass,
      collection,
      assertWritable,
      operationOptions: ({ final }) => this._legMarker(final),
    });
    this._container = new SettingsCraftingDefinitionRepository({
      settingKey: SETTING_KEYS.CRAFTING_SYSTEMS,
      corpus,
      hydrate: (raw) => this._hydrateContainerRecord(raw),
      serialize: (system) => this._serializeContainerRecord(system),
      scopeOf: (system) => system?.id ?? null,
      getSetting,
      setSetting,
      assertWritable,
    });
    this._batchDepth = 0;
    /** @type {Map<string, object>} */
    this._pendingPuts = new Map();
    /** @type {Set<string>} */
    this._pendingDeletes = new Set();
  }

  // -------------------------------------------------------------------------
  // Storage description
  // -------------------------------------------------------------------------

  /**
   * @returns {boolean} whether the CONTAINER's records arrive one document at a time.
   *
   * Always `false`: the container is one whole-array setting read whichever arrangement the
   * component class is on. The component class reports itself separately — see
   * {@link CompositeCraftingSystemRepository#componentsStoreRecordsGranularly} — because the
   * two now DIVERGE, and answering the component basis from this one is what would make a
   * half-written component corpus known-complete by construction.
   */
  storesRecordsGranularly() {
    return false;
  }

  /** @returns {boolean} whether the extracted COMPONENT class is stored granularly. */
  componentsStoreRecordsGranularly() {
    return this._granular;
  }

  /** @inheritdoc */
  supportsPerRecordReplication() {
    return this._granular;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * One stored container record, hydrated with its components taken from the INDEX.
   *
   * @param {object} raw
   * @returns {object}
   * @private
   */
  _hydrateContainerRecord(raw) {
    if (!this._granular) return this._hydrateSystem(raw);
    // The spread OVERWRITES whatever `components` the stored record carries — including the
    // `components: []` a downgraded build writes back — and an array, even an empty one, wins
    // the normalizer's `components ?? managedItems ?? items` alias chain. Both halves are
    // load-bearing; see the module header.
    return this._hydrateSystem({ ...raw, components: this._indexedComponentsFor(raw?.id) });
  }

  /**
   * One container record's persisted form, with the extracted key OMITTED.
   *
   * Omitted, never emptied. An absent key and an empty array are the two facts the residual
   * detector discriminates on, so `components: []` would permanently disarm it.
   *
   * @param {object} system
   * @returns {object}
   * @private
   */
  _serializeContainerRecord(system) {
    const serialized = this._serializeSystem(system);
    if (!this._granular) return serialized;
    const { components: _extracted, ...rest } = serialized ?? {};
    return rest;
  }

  /**
   * Every component document scoped to one system, in stored order.
   *
   * @param {string} systemId
   * @returns {object[]}
   * @private
   */
  _indexedComponentsFor(systemId) {
    const scope = componentRecordScope(String(systemId ?? ''));
    const components = [];
    for (const recordKey of this._components.recordIds()) {
      if (!recordKey.startsWith(scope)) continue;
      components.push(this._components.storedValueFor(recordKey));
    }
    return components;
  }

  /** @inheritdoc */
  async loadAll() {
    if (this._granular) this._components.refreshIndex();
    return this._container.loadAll();
  }

  /** @inheritdoc */
  readReplicatedSnapshot() {
    if (this._granular) this._components.refreshIndex();
    return this._container.readReplicatedSnapshot();
  }

  /** @inheritdoc */
  async get(id) {
    return this._container.get(id);
  }

  /** @inheritdoc */
  async listSummaries(query) {
    return this._container.listSummaries(query);
  }

  /**
   * Read the ONE component record a replication event delivered.
   *
   * @param {import('./CraftingDefinitionRepository.js').ReplicatedDefinitionChange} change
   * @returns {{id: string, record: object|null}|null} `null` when the changed key is not a
   *   component record of this world's current arrangement.
   */
  readReplicatedRecord(change) {
    if (!this._granular) return null;
    return this._components.readReplicatedRecord(change);
  }

  // -------------------------------------------------------------------------
  // The batch-close marker
  // -------------------------------------------------------------------------

  /**
   * The marker one component leg carries, or `null` outside a marked operation.
   *
   * `final` is TRUE only on the last leg of the CLOSING call, which is why the repository is
   * told which call closes the operation: a cross-class write issues its creates/updates and
   * its deletes in two separate calls with a container write in between, so no leg can decide
   * on its own whether it ends the operation.
   *
   * @param {boolean} lastLegOfCall
   * @returns {object|null}
   * @private
   */
  _legMarker(lastLegOfCall) {
    if (!this._marker) return null;
    return {
      [DEFINITION_BATCH_MARKER_KEY]: {
        ...this._marker,
        final: lastLegOfCall && this._markerCloses,
      },
    };
  }

  /**
   * Open a marked operation. Every leg it issues carries the same batch id, so a receiver can
   * tell one operation's legs from a concurrent one's.
   *
   * @returns {void}
   * @private
   */
  _beginMarkedOperation() {
    this._markerSequence += 1;
    this._marker = { id: `${this._markerPrefix}-${this._markerSequence}` };
    this._markerCloses = false;
  }

  /** @private */
  _endMarkedOperation() {
    this._marker = null;
    this._markerCloses = false;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * @inheritdoc
   *
   * The desired component set comes from the RECORD this call was handed, never from a
   * corpus lookup. `applyDefinitionChange` does not promise the manager's map already holds
   * it, and a lookup that missed would derive every one of that system's documents as a
   * removal — the corpus-loss shape this class exists to make unreachable, arrived at from a
   * second direction.
   */
  async put(record) {
    const id = record?.id;
    if (id == null) throw new Error('Cannot persist a crafting definition with no id');
    if (this._batchDepth > 0) {
      this._pendingDeletes.delete(String(id));
      this._pendingPuts.set(String(id), record);
      return;
    }
    await this._multiWrite({
      described: [record],
      scopedSystemIds: [String(id)],
      writeContainer: () => this._container.put(record),
    });
  }

  /**
   * @inheritdoc
   *
   * The deleted system describes NO components, so its whole scope becomes the removal set —
   * one scoped delete leg however many components it held, which the key scheme makes
   * expressible because an extracted record is scoped by its owning system.
   */
  async delete(id) {
    if (this._batchDepth > 0) {
      this._pendingPuts.delete(String(id));
      this._pendingDeletes.add(String(id));
      return;
    }
    await this._multiWrite({
      described: [],
      scopedSystemIds: [String(id)],
      writeContainer: () => this._container.delete(id),
    });
  }

  /**
   * @inheritdoc
   *
   * The WHOLE-CORPUS fallback, and the only path that diffs every system's components. It is
   * what a bare `save()` and a `persist: false` batch flush with, and its breadth is the
   * flush-everything property those callers rely on rather than an oversight.
   */
  async putAll(records) {
    const corpus = [...records];
    await this._multiWrite({
      described: corpus,
      scopedSystemIds: null,
      writeContainer: () => this._container.putAll(corpus),
    });
  }

  /** @inheritdoc */
  async runBatch(work) {
    this._batchDepth += 1;
    let workError = null;
    let workThrew = false;
    let result;
    // The flush deliberately sits AFTER this block rather than inside a `finally`: a `throw`
    // there is `no-unsafe-finally` and abandons any in-flight completion, which is the
    // original-error-replacement this shape exists to prevent.
    try {
      result = await work();
    } catch (error) {
      workError = error;
      workThrew = true;
    } finally {
      this._batchDepth -= 1;
    }

    let flushError = null;
    let flushThrew = false;
    if (this._batchDepth === 0) {
      const puts = this._pendingPuts;
      const deletes = this._pendingDeletes;
      this._pendingPuts = new Map();
      this._pendingDeletes = new Set();
      if (puts.size > 0 || deletes.size > 0) {
        try {
          await this._flushBatch(puts, deletes);
        } catch (error) {
          flushError = error;
          flushThrew = true;
        }
      }
    }

    if (workThrew) {
      // The body's error wins, and the flush failure is reported on its own channel rather
      // than replacing the reason the caller's work aborted.
      if (flushThrew) {
        console.error(
          'Fabricate | composite crafting-system batch flush failed after the batch body threw',
          flushError
        );
      }
      throw workError;
    }
    if (flushThrew) throw flushError;
    return result;
  }

  /**
   * One batch's accumulated puts and deletes, as ONE three-phase multi-write.
   *
   * @param {Map<string, object>} puts
   * @param {Set<string>} deletes
   * @returns {Promise<void>}
   * @private
   */
  async _flushBatch(puts, deletes) {
    await this._multiWrite({
      described: [...puts.values()],
      scopedSystemIds: [...new Set([...puts.keys(), ...deletes])],
      // The container adapter's OWN batch, so the whole flush is exactly one
      // `craftingSystems` write however many systems it names.
      writeContainer: () =>
        this._container.runBatch(async () => {
          for (const record of puts.values()) await this._container.put(record);
          for (const id of deletes) await this._container.delete(id);
        }),
    });
  }

  /**
   * Issue one logical write as the three declared phases.
   *
   * @param {object} plan
   * @param {object[]} plan.described The system records whose components this write DESCRIBES.
   * @param {string[]|null} plan.scopedSystemIds The systems the change NAMED, or `null` for
   *   the whole-corpus fallback.
   * @param {() => Promise<void>} plan.writeContainer Phase 2.
   * @returns {Promise<void>}
   * @private
   */
  async _multiWrite({ described, scopedSystemIds, writeContainer }) {
    if (!this._granular) {
      await writeContainer();
      return;
    }
    const { desired, removals } = this._componentDifferential(described, scopedSystemIds);
    const restore = this._snapshotFor(desired);
    this._beginMarkedOperation();
    try {
      // Phase 1 — creates and updates, NEVER a delete. `createOrUpdateAll` issues
      // `deletes: []` by construction, which is what makes this phase compensable without
      // the identity loss a delete compensation cannot avoid.
      this._markerCloses = removals.length === 0;
      await this._components.createOrUpdateAll(desired);

      // Phase 2 — the single container write.
      try {
        await writeContainer();
      } catch (error) {
        await this._compensateComponentWrite(restore);
        throw error;
      }

      // Phase 3 — the destructive leg, LAST globally and not merely last within its own
      // class. Its failure COMPLETES FORWARD: the container already describes the world
      // correctly and the surviving documents are debris a later boot reclaims, so
      // compensating here would undo a correct container write to match stale debris.
      if (removals.length > 0) {
        this._markerCloses = true;
        try {
          await this._components.runBatch(async () => {
            for (const recordKey of removals) await this._components.delete(recordKey);
          });
        } catch (error) {
          console.error(
            'Fabricate | failed to remove extracted component records; the crafting systems are correct and a later boot retries',
            error
          );
        }
      }
    } finally {
      this._endMarkedOperation();
    }
  }

  /**
   * The desired component envelopes and the removal keys for one write.
   *
   * **The removal set is derived from the records this write DESCRIBES, never from the stored
   * container record.** See the module header for why that distinction is the difference
   * between a working world and a destroyed one.
   *
   * @param {object[]} described
   * @param {string[]|null} scopedSystemIds
   * @returns {{desired: ComponentRecordEnvelope[], removals: string[]}}
   * @private
   */
  _componentDifferential(described, scopedSystemIds) {
    const desired = [];
    const describedKeys = new Set();
    for (const system of described) {
      if (system?.id == null) continue;
      for (const component of componentsOf(system)) {
        if (component?.id == null) continue;
        desired.push(componentEnvelope(String(system.id), component));
        describedKeys.add(componentRecordKey(String(system.id), String(component.id)));
      }
    }
    // Only the named systems' scopes are inspected, so a run that names one system never
    // compares another's records. The whole-corpus fallback passes `null` and inspects every
    // scope, which is the flush-everything property its two remaining callers rely on.
    const scopes =
      scopedSystemIds === null
        ? null
        : scopedSystemIds.map((id) => componentRecordScope(String(id)));
    const removals = [];
    for (const recordKey of this._components.recordIds()) {
      if (scopes !== null && scopes.every((scope) => !recordKey.startsWith(scope))) continue;
      if (!describedKeys.has(recordKey)) removals.push(recordKey);
    }
    return { desired, removals };
  }

  /**
   * The pre-state of every record phase 1 is about to write, for phase 2's compensation.
   *
   * @param {ComponentRecordEnvelope[]} desired
   * @returns {{creates: string[], updates: Array<{recordKey: string, value: object}>}}
   * @private
   */
  _snapshotFor(desired) {
    const creates = [];
    const updates = [];
    for (const record of desired) {
      const recordKey = componentRecordKey(record.systemId, record.component?.id);
      const stored = this._components.storedValueFor(recordKey);
      if (stored === null) creates.push(recordKey);
      else updates.push({ recordKey, value: stored });
    }
    return { creates, updates };
  }

  /**
   * Undo phase 1 in reverse after phase 2 failed.
   *
   * Every failure here is swallowed and logged, exactly as every other compensation leg in
   * this programme is and for the same reason: the operation own error is the one the caller
   * must see, and a compensation failure that replaced it would report the wrong reason for
   * the wrong thing.
   *
   * @param {{creates: string[], updates: Array<{recordKey: string, value: object}>}} restore
   * @returns {Promise<void>}
   * @private
   */
  async _compensateComponentWrite(restore) {
    try {
      await this._components.runBatch(async () => {
        for (const { recordKey, value } of restore.updates) {
          await this._components.put(rebuildEnvelope(recordKey, value));
        }
        for (const recordKey of restore.creates) await this._components.delete(recordKey);
      });
    } catch (error) {
      console.error('Fabricate | failed to compensate an extracted component write', error);
    }
  }
}
