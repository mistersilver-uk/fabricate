/**
 * The persistence seam for crafting definitions — recipes and crafting systems.
 *
 * Issue 1089. Before this existed, `RecipeManager` and `CraftingSystemManager` each
 * called `setSetting` directly and every mutation went through one method meaning
 * "replace the whole world-setting array". That coupling is what makes the
 * persistence architecture decision (#1079/#1080) expensive: whichever backend is
 * selected, ~31 call sites across two 3,000–6,000 line managers would have to change.
 *
 * This interface exists so exactly one adapter changes instead. It is deliberately
 * introduced BEFORE the ADR, and it is deliberately shaped so that it does not
 * anticipate the answer.
 *
 * ## Two rules keep it backend-neutral
 *
 * 1. **{@link CraftingDefinitionRepository#listSummaries} must not assume the corpus
 *    is resident.** It is asynchronous and it takes a query, because under a
 *    document-backed store the summaries come from a compendium index that the
 *    caller does not hold. An interface returning summaries synchronously, or
 *    derived from a caller-supplied array, would already have chosen settings.
 * 2. **{@link CraftingDefinitionRepository#get} must not assume it is free.** It is
 *    asynchronous for the same reason: under settings the record is in memory, under
 *    documents it may be an unhydrated index entry that costs a fetch.
 *
 * Both are true today and false tomorrow, which is exactly why they are stated as
 * contract rather than left to the first implementation to imply.
 *
 * ## The bulk boundary is part of the interface, not a manager flag
 *
 * `RecipeManager` already carried a `persist: false` option (issue 776) that batch
 * callers used to mutate the in-memory map per record and then issue one `save()`.
 * That is a persistence concept living in a domain manager. {@link
 * CraftingDefinitionRepository#runBatch} names it once, here, because **both**
 * candidate backends have a native bulk concept — one whole-array `setSetting` for
 * settings, `Document.updateDocuments` for a compendium — and both need the boundary
 * expressed in the same place.
 *
 * `persist: false` itself is unchanged and still supported: it is a manager-level
 * option about whether a mutation announces itself at all, and the compendium
 * importer and the essence-deletion cascade both depend on its current semantics.
 *
 * ## What a document-backed adapter has to do, and what it does not
 *
 * Nothing in this interface requires the corpus to be addressable as one value. A
 * document-backed adapter (#1080) implements {@link CraftingDefinitionRepository#put}
 * as a single-document update, {@link CraftingDefinitionRepository#delete} as a
 * single-document delete, {@link CraftingDefinitionRepository#listSummaries} from the
 * pack index, and {@link CraftingDefinitionRepository#runBatch} over
 * `Document.updateDocuments`. No caller changes, because every caller already speaks
 * in single records.
 *
 * Two members are honest about being settings-shaped, and are marked as such:
 *
 * - {@link CraftingDefinitionRepository#putAll} is a whole-corpus replace. It is what
 *   the managers' surviving `save()` methods call, and it is the shape this issue had
 *   to preserve byte for byte. A document adapter can implement it (diff the index,
 *   write the changed documents, delete the absent ones) but should never be the
 *   common path — narrowing its remaining callers is #1080's work, not this issue's.
 * - {@link CraftingDefinitionRepository#readReplicatedSnapshot} is an OPTIONAL
 *   capability and defaults to `null`. It backs the managers' `reload()`, which only
 *   exists because Foundry replicates a changed world setting to every client
 *   synchronously and fires `updateSetting`. A pack-backed store has no such signal —
 *   #1088 confirmed that a V14 client holding only the connect-time index is never
 *   notified at all — so a document adapter returns `null` and `reload()` becomes
 *   inert, which is correct. #1092 owns the replacement transport.
 *
 * ## Authority is unchanged
 *
 * This seam does not gate anything. Every `_assertGM` in both managers stays exactly
 * where it was, and the settings adapter's writes still go through `game.settings.set`,
 * which the server refuses for a non-GM on a `world`-scoped key. No write moved to a
 * different authority, and no write became reachable by a client that could not
 * already make it.
 *
 * The per-record adapter (#1080 -b) writes `Setting` DOCUMENTS instead of calling
 * `game.settings.set`, and the authority is the same gate one layer down:
 * `BaseSetting.#canModify` -> `user.hasPermission('SETTINGS_MODIFY')` is what refuses a
 * non-GM, and it refuses `Setting.implementation.createDocuments` exactly as it refuses
 * `ClientSettings#set`. Moving off `ClientSettings` changed which API is called, not who
 * may call it.
 */

/**
 * A minimal, backend-independent description of one stored definition.
 *
 * Deliberately thin. #1091 defines the canonical recipe and component summary
 * projection; until it lands, this carries only fields every candidate backend can
 * answer cheaply, because #1088 (Q5) established that the connect-time compendium
 * index **cannot be extended by a module** — the server builds it from the document
 * class's `metadata.compendiumIndexFields`, and `CONFIG[type].compendiumIndexFields`
 * is client-side only. A summary field that is not one of the four default index
 * fields costs an O(N) `getIndex` round trip or a full hydration, so promoting more
 * fields into this shape now would be designing against a constraint already
 * measured and closed.
 *
 * @typedef {object} DefinitionSummary
 * @property {string} id Stable record id.
 * @property {string} name Display name.
 * @property {string|null} systemId Owning crafting system id, or `null` when the
 *   record IS a crafting system.
 */

/**
 * A summary query. Every field is optional; an empty query lists everything.
 *
 * @typedef {object} DefinitionQuery
 * @property {string} [systemId] Restrict to records owned by this crafting system.
 * @property {string[]} [ids] Restrict to these record ids.
 */

/**
 * The abstract contract. Extend it; do not instantiate it.
 *
 * Every method throws by default rather than returning an empty result, because a
 * silently-empty read from a persistence layer is the failure mode that no test
 * catches — a migration that reads nothing and writes nothing back looks like a
 * migration with nothing to do.
 *
 * @abstract
 */
export class CraftingDefinitionRepository {
  /**
   * Read and hydrate the full corpus. Used at manager start-up.
   *
   * This is the one operation that is legitimately whole-corpus under every backend,
   * because the managers hydrate their in-memory domain maps from it. Making
   * start-up incremental is #1075/#1076/#1091's problem, not this seam's.
   *
   * @abstract
   * @returns {Promise<object[]>} Hydrated records in persisted order.
   */
  async loadAll() {
    throw new Error(`${this.constructor.name} must implement loadAll()`);
  }

  /**
   * Fetch one record by id.
   *
   * **Not assumed to be free.** Asynchronous by contract so a lazily-hydrating
   * backend can satisfy it.
   *
   * @abstract
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async get(id) {
    throw new Error(`${this.constructor.name} must implement get(${id})`);
  }

  /**
   * List summaries, optionally scoped.
   *
   * **Not assumed to read from a resident corpus.** The caller passes a query rather
   * than filtering a returned array, so an index-backed backend can push the scope
   * down instead of materialising everything first.
   *
   * @abstract
   * @param {DefinitionQuery} [_query]
   * @returns {Promise<DefinitionSummary[]>}
   */
  async listSummaries(_query) {
    throw new Error(`${this.constructor.name} must implement listSummaries()`);
  }

  /**
   * Insert or replace one record, and make storage current.
   *
   * @abstract
   * @param {object} _record
   * @returns {Promise<void>}
   */
  async put(_record) {
    throw new Error(`${this.constructor.name} must implement put()`);
  }

  /**
   * Remove one record by id, and make storage current. Removing an absent id is not
   * an error.
   *
   * @abstract
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error(`${this.constructor.name} must implement delete(${id})`);
  }

  /**
   * Replace the whole corpus with exactly these records.
   *
   * **Settings-shaped, and named as such.** This is what the managers' `save()`
   * methods call and it is the operation this programme exists to stop needing. It
   * stays on the interface because removing its callers is a behaviour change, and
   * this issue is defined by not making one.
   *
   * @abstract
   * @param {Iterable<object>} _records
   * @returns {Promise<void>}
   */
  async putAll(_records) {
    throw new Error(`${this.constructor.name} must implement putAll()`);
  }

  /**
   * The bulk write boundary. Every `put`/`delete` issued inside `work` is coalesced
   * into a single flush when the outermost batch completes.
   *
   * Nested batches join the outer one. A throw inside `work` propagates and the
   * pending flush is still issued, because the in-memory maps have already been
   * mutated by the calls that succeeded — dropping the write would leave storage
   * behind memory, which is the worse of the two failures.
   *
   * @abstract
   * @template T
   * @param {() => Promise<T>|T} _work
   * @returns {Promise<T>}
   */
  async runBatch(_work) {
    throw new Error(`${this.constructor.name} must implement runBatch()`);
  }

  /**
   * Synchronously re-read the corpus a replication event has already delivered.
   *
   * **Optional capability.** Returns `null` when the backend has no synchronous
   * replicated snapshot, which is the honest answer for anything document-backed:
   * #1088 (Q3) found that on Foundry 14.365 a pack write reaches only clients that
   * have already loaded the document, so a client holding just the connect-time
   * index is never told and its index silently goes stale. #1092 owns that transport.
   *
   * The managers' `reload()` is synchronous — it is called from the `updateSetting`
   * hook and its boolean return decides whether a change hook is re-emitted — so this
   * cannot be a promise.
   *
   * @returns {object[]|null} Hydrated records, or `null` when unsupported.
   */
  readReplicatedSnapshot() {
    return null;
  }

  /**
   * Whether this backend can answer a replication event for ONE record.
   *
   * **Optional capability, `false` by default — which IS today's behaviour.** A backend
   * that stores the whole corpus in a single setting has nothing per-record to report: a
   * replication event names the one key holding everything, and the only correct response
   * is the whole-corpus {@link CraftingDefinitionRepository#readReplicatedSnapshot} the
   * managers' `reload()` already performs. So the settings adapter inherits `false` and is
   * completely unaffected by this member existing.
   *
   * A per-record backend (#1080) returns `true`, and its caller then routes each
   * `createSetting`/`updateSetting`/`deleteSetting` event through
   * {@link CraftingDefinitionRepository#readReplicatedRecord} instead of re-reading the
   * corpus. That distinction cannot be inferred from `readReplicatedRecord` alone:
   * `null` there means "not a key of mine", which a whole-corpus backend would also
   * answer for its own key, and the two demand opposite fallbacks.
   *
   * @returns {boolean}
   */
  supportsPerRecordReplication() {
    return false;
  }

  /**
   * Synchronously read the ONE record a replication event has already delivered.
   *
   * **Optional capability, `null` by default.** Synchronous for the same reason
   * `readReplicatedSnapshot` is: it is called from a settings hook whose result decides
   * whether a change hook is re-emitted.
   *
   * @param {ReplicatedDefinitionChange} _change The replicated change, as the
   *   `createSetting` / `updateSetting` / `deleteSetting` hooks describe it.
   * @returns {{ id: string, record: object|null }|null} `null` when the changed key is not
   *   one this repository stores. Otherwise the record id, with `record: null` meaning the
   *   record was removed and must leave the caller's map.
   */
  readReplicatedRecord(_change) {
    return null;
  }
}

/**
 * One replicated change to a single stored record.
 *
 * `document` is the `Setting` document the hook delivered. Passing it matters on a delete,
 * where the document is already gone from the collection by the time a listener could look
 * it up, and it avoids a linear lookup on a create the local index has not seen yet.
 *
 * @typedef {object} ReplicatedDefinitionChange
 * @property {string} key The fully-qualified setting key that changed.
 * @property {'create'|'update'|'delete'} operation Which hook fired.
 * @property {object|null} [document] The `Setting` document the hook delivered.
 */

/**
 * One mutation's effect on storage, as the managers describe it.
 *
 * @typedef {object} DefinitionChange
 * @property {object} [put] A single record that was created or modified.
 * @property {string} [delete] The id of a single record that was removed.
 * @property {Iterable<object>} [batch] Several records modified as one unit.
 */

/**
 * Dispatch one {@link DefinitionChange} onto a repository, falling back to a
 * whole-corpus write when the caller did not say what changed.
 *
 * This is where `RecipeManager.save()` and `CraftingSystemManager.save()` meet the
 * seam, and it is shared rather than written twice because the two managers would
 * otherwise carry byte-identical dispatch blocks — which the SonarCloud duplication
 * gate counts against new code.
 *
 * **Why `save()` survived at all.** The obvious shape was to delete `save()` and have
 * each of the ~31 mutation sites call `repository.put()` directly. That is wrong here
 * for a reason the code makes plain: 30 test files already replace `manager.save`
 * with a counter or a rejecting stub, so `save()` is this codebase's established
 * persistence seam and bypassing it would silently stop those suites from observing —
 * or refusing — a write. Keeping `save()` as a thin dispatcher preserves every one of
 * them while still carrying the changed record all the way down, which is the part
 * #1080 actually needs. Tests written from now on should inject a repository instead;
 * both mechanisms observe the same operations.
 *
 * @param {CraftingDefinitionRepository} repository
 * @param {DefinitionChange|null|undefined} change
 * @param {Iterable<object>} corpus Every record the manager currently holds, used
 *   only for the whole-corpus fallback.
 * @returns {Promise<void>}
 */
export async function applyDefinitionChange(repository, change, corpus) {
  if (change?.put) {
    await repository.put(change.put);
    return;
  }
  if (change?.delete) {
    await repository.delete(change.delete);
    return;
  }
  if (change?.batch) {
    await repository.runBatch(async () => {
      for (const record of change.batch) {
        await repository.put(record);
      }
    });
    return;
  }
  await repository.putAll(corpus);
}
