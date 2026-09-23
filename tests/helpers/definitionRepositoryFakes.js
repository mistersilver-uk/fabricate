/** Test doubles for the crafting-definition persistence seam (issue 1089). */

import { CraftingDefinitionRepository } from '../../src/systems/CraftingDefinitionRepository.js';

/** Wraps a real repository and tallies the operations that reach it. */
export class CountingDefinitionRepository extends CraftingDefinitionRepository {
  /**
   * @param {CraftingDefinitionRepository} delegate
   */
  constructor(delegate) {
    super();
    this.delegate = delegate;
    this.counts = {
      loadAll: 0,
      get: 0,
      listSummaries: 0,
      put: 0,
      delete: 0,
      putAll: 0,
      runBatch: 0,
      readReplicatedSnapshot: 0,
    };
    /** Every write operation in order, as `'put:<id>'` / `'delete:<id>'` / `'putAll:<n>'`. */
    this.writeLog = [];
  }

  /** Total write operations issued at the seam. */
  get writeCount() {
    return this.writeLog.length;
  }

  /** @inheritdoc */
  async loadAll() {
    this.counts.loadAll += 1;
    return this.delegate.loadAll();
  }

  /** @inheritdoc */
  async get(id) {
    this.counts.get += 1;
    return this.delegate.get(id);
  }

  /** @inheritdoc */
  async listSummaries(query) {
    this.counts.listSummaries += 1;
    return this.delegate.listSummaries(query);
  }

  /** @inheritdoc */
  async put(record) {
    this.counts.put += 1;
    this.writeLog.push(`put:${record?.id}`);
    return this.delegate.put(record);
  }

  /** @inheritdoc */
  async delete(id) {
    this.counts.delete += 1;
    this.writeLog.push(`delete:${id}`);
    return this.delegate.delete(id);
  }

  /** @inheritdoc */
  async putAll(records) {
    const materialized = [...records];
    this.counts.putAll += 1;
    this.writeLog.push(`putAll:${materialized.length}`);
    return this.delegate.putAll(materialized);
  }

  /** @inheritdoc */
  async runBatch(work) {
    this.counts.runBatch += 1;
    return this.delegate.runBatch(work);
  }

  /** @inheritdoc */
  readReplicatedSnapshot() {
    this.counts.readReplicatedSnapshot += 1;
    return this.delegate.readReplicatedSnapshot();
  }
}

/**
 * A repository shaped like the document-backed candidate in #1079: one stored record per document,
 * addressed by id, with no whole-corpus value anywhere.
 */
export class DocumentShapedDefinitionRepository extends CraftingDefinitionRepository {
  /**
   * @param {object} [options]
   * @param {(record: object) => object} [options.serialize]
   * @param {(raw: object) => object} [options.hydrate]
   * @param {(record: object) => string|null} [options.scopeOf]
   */
  constructor({ serialize = (record) => record, hydrate = (raw) => raw, scopeOf = () => null } = {}) {
    super();
    /** One serialized "document" per record, keyed by id. */
    this.documents = new Map();
    this._serialize = serialize;
    this._hydrate = hydrate;
    this._scopeOf = scopeOf;
    /** Documents touched per write operation, so per-record cost is observable. */
    this.documentWrites = [];
    this._batch = null;
  }

  /** @inheritdoc */
  async loadAll() {
    return [...this.documents.values()].map((raw) => this._hydrate(structuredClone(raw)));
  }

  /** @inheritdoc */
  async get(id) {
    const raw = this.documents.get(String(id));
    return raw ? this._hydrate(structuredClone(raw)) : null;
  }

  /** @inheritdoc */
  async listSummaries(query = {}) {
    const wantedSystem = query?.systemId == null ? null : String(query.systemId);
    const summaries = [];
    for (const [id, raw] of this.documents) {
      const systemId = this._scopeOf(raw) ?? null;
      if (wantedSystem !== null && String(systemId ?? '') !== wantedSystem) continue;
      summaries.push({ id, name: String(raw?.name ?? ''), systemId });
    }
    return summaries;
  }

  /** @inheritdoc */
  async put(record) {
    this.documents.set(String(record.id), structuredClone(this._serialize(record)));
    this._record(1);
  }

  /** @inheritdoc */
  async delete(id) {
    this.documents.delete(String(id));
    this._record(1);
  }

  /** @inheritdoc */
  async putAll(records) {
    const next = new Map(
      [...records].map((record) => [String(record.id), structuredClone(this._serialize(record))])
    );
    this.documents = next;
    this._record(next.size);
  }

  /** @inheritdoc */
  async runBatch(work) {
    const outermost = this._batch === null;
    if (outermost) this._batch = 0;
    try {
      return await work();
    } finally {
      if (outermost) {
        const touched = this._batch;
        this._batch = null;
        if (touched > 0) this.documentWrites.push(touched);
      }
    }
  }

  /**
   * No synchronous replicated snapshot exists for a pack-backed store, so `reload()`
   * must go inert rather than answer wrongly. See `CraftingDefinitionRepository`.
   *
   * @inheritdoc
   */
  readReplicatedSnapshot() {
    return null;
  }

  /**
   * @param {number} touched
   * @private
   */
  _record(touched) {
    if (this._batch === null) this.documentWrites.push(touched);
    else this._batch += touched;
  }
}
