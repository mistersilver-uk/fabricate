import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
} from '../config/settings.js';

import { CraftingDefinitionRepository } from './CraftingDefinitionRepository.js';

/**
 * The {@link CraftingDefinitionRepository} adapter over today's storage: one
 * `world`-scoped `game.settings` key holding the entire corpus as a single array.
 *
 * Issue 1089. This adapter exists to change nothing. It is the "before" leg of the
 * persistence decision, and its whole job is to make the managers speak in single
 * records while the bytes that reach `game.settings` stay exactly as they were.
 *
 * ## Why a single-record `put` still writes the whole array
 *
 * `game.settings.set` REPLACES a value; it has no merge and no addressable element.
 * (This is the opposite of `setFlag`, which merges and never deletes a removed key —
 * do not carry an assumption from one to the other.) So there is no such thing as
 * writing one recipe here, and {@link SettingsCraftingDefinitionRepository#put}
 * necessarily serializes and replicates the full corpus. That is not a shortcoming of
 * this adapter; it is precisely the cost #1079 is deciding how to remove, and the
 * value of naming it in one place is that #1080 replaces one method rather than 31
 * call sites.
 *
 * ## Why the corpus is supplied rather than mirrored
 *
 * The adapter is constructed with a `corpus` thunk returning the owning manager's own
 * `Map`, and it does not keep a copy.
 *
 * A mirrored copy was the obvious alternative and it is a trap. The persisted array is
 * `[...map.values()]`, so its ORDER is the manager map's insertion order — and a
 * second map that took its own `set`/`delete` calls could diverge in ordering from the
 * manager's while every record remained individually correct. That would rewrite the
 * whole persisted array on the next save with no test noticing, because the corpus
 * would still contain exactly the right records. Sharing the one map makes that class
 * of bug unrepresentable.
 *
 * It also preserves a property the pre-seam code had by accident and this code has on
 * purpose: `save()` flushed **every** in-memory mutation, including ones made in
 * place by code paths that never called `save()` themselves. Because `put` writes
 * `[...corpus().values()]` rather than one record, those mutations still land. When a
 * document-backed adapter arrives that stops being true — and that is a real
 * behaviour change, correctly owned by #1080, which will need to audit the in-place
 * mutation sites rather than inherit them silently.
 *
 * A document-backed adapter takes no `corpus` thunk at all: it addresses one record
 * and needs nothing else. The parameter's presence here IS the statement of what the
 * settings backend cannot do.
 */
export class SettingsCraftingDefinitionRepository extends CraftingDefinitionRepository {
  /**
   * @param {object} options
   * @param {string} options.settingKey The `fabricate` setting key holding the corpus.
   * @param {() => Map<string, object>} options.corpus The owning manager's in-memory
   *   map of hydrated records, in persisted order.
   * @param {(record: object) => string} [options.identify] Read a record's id.
   * @param {(raw: object) => object} [options.hydrate] Turn one persisted record into
   *   its in-memory form. For recipes this is `Recipe.fromJSON`; for crafting systems
   *   it is the manager's `_normalizeSystem`, which is a WHITELIST REBUILD — a key it
   *   does not emit is dropped from storage on the next save, so this must remain the
   *   manager's own normalizer and never a local approximation of it.
   * @param {(record: object) => object} [options.serialize] Turn one in-memory record
   *   into its persisted form.
   * @param {(record: object) => string|null} [options.scopeOf] Read the owning
   *   crafting system id of a record.
   * @param {(record: object) => import('./CraftingDefinitionRepository.js').DefinitionSummary}
   *   [options.summarize] Project one record to its summary.
   * @param {(key: string) => any} [options.getSetting] Injected for tests.
   * @param {(key: string, value: any) => Promise<any>} [options.setSetting] Injected
   *   for tests. Left as the real accessor in production so a non-GM write is still
   *   refused by the server exactly as before.
   */
  constructor({
    settingKey,
    corpus,
    identify = (record) => record?.id,
    hydrate = (raw) => raw,
    serialize = (record) => record,
    scopeOf = () => null,
    summarize = null,
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
  }) {
    super();
    if (!settingKey) throw new Error('SettingsCraftingDefinitionRepository needs a settingKey');
    if (typeof corpus !== 'function') {
      throw new TypeError('SettingsCraftingDefinitionRepository needs a corpus() accessor');
    }
    this.settingKey = settingKey;
    this._corpus = corpus;
    this._identify = identify;
    this._hydrate = hydrate;
    this._serialize = serialize;
    this._scopeOf = scopeOf;
    this._summarize =
      summarize ??
      ((record) => ({
        id: String(this._identify(record) ?? ''),
        name: String(record?.name ?? ''),
        systemId: this._scopeOf(record) ?? null,
      }));
    this._getSetting = getSetting;
    this._setSetting = setSetting;
    this._batchDepth = 0;
    this._flushPending = false;
  }

  /** @inheritdoc */
  async loadAll() {
    return this.readReplicatedSnapshot();
  }

  /**
   * @inheritdoc
   *
   * Supported here, because a `world`-scoped setting IS replicated in full to every
   * client and `updateSetting` fires synchronously with the new value already in
   * `game.settings`. #1088 (Q4) confirmed the full-replication half on both 13.351
   * and 14.365 — which is also why sharding cannot improve cold-load time.
   */
  readReplicatedSnapshot() {
    const stored = this._getSetting(this.settingKey);
    return (Array.isArray(stored) ? stored : []).map((raw) => this._hydrate(raw));
  }

  /** @inheritdoc */
  async get(id) {
    return this._corpus().get(String(id)) ?? null;
  }

  /** @inheritdoc */
  async listSummaries(query = {}) {
    const wantedIds = Array.isArray(query?.ids) ? new Set(query.ids.map(String)) : null;
    const wantedSystem = query?.systemId == null ? null : String(query.systemId);
    const summaries = [];
    for (const record of this._corpus().values()) {
      if (wantedIds && !wantedIds.has(String(this._identify(record)))) continue;
      if (wantedSystem !== null && String(this._scopeOf(record) ?? '') !== wantedSystem) continue;
      summaries.push(this._summarize(record));
    }
    return summaries;
  }

  /** @inheritdoc */
  async put(record) {
    const id = this._identify(record);
    if (id == null) throw new Error(`Cannot persist a crafting definition with no id`);
    this._corpus().set(String(id), record);
    await this._flush();
  }

  /** @inheritdoc */
  async delete(id) {
    this._corpus().delete(String(id));
    await this._flush();
  }

  /**
   * @inheritdoc
   *
   * Always immediate, and deliberately not deferred by an enclosing batch: it carries
   * its own explicit record list, which a later corpus flush would silently replace
   * with something else. It does not clear a pending flush for the same reason.
   */
  async putAll(records) {
    await this._write([...records]);
  }

  /** @inheritdoc */
  async runBatch(work) {
    this._batchDepth += 1;
    try {
      return await work();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth === 0 && this._flushPending) {
        this._flushPending = false;
        await this._write([...this._corpus().values()]);
      }
    }
  }

  /**
   * Make storage current with the in-memory corpus, unless a batch is open — in which
   * case one flush is issued when the outermost batch closes.
   *
   * @private
   */
  async _flush() {
    if (this._batchDepth > 0) {
      this._flushPending = true;
      return;
    }
    await this._write([...this._corpus().values()]);
  }

  /**
   * The single point at which this module touches `game.settings`.
   *
   * ONE point rather than one per mutation method, so a later mutation method added here
   * inherits whatever this method does — and so a fixture that observes writes observes all
   * of them.
   *
   * @param {object[]} records
   * @private
   */
  async _write(records) {
    await this._setSetting(
      this.settingKey,
      records.map((record) => this._serialize(record))
    );
  }
}
