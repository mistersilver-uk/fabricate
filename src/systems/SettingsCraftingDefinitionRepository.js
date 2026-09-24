import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';

import { CraftingDefinitionRepository } from './CraftingDefinitionRepository.js';

/**
 * The repository adapter over one `world` setting holding the whole corpus as an array (issue
 * 1089), changing no persisted byte. `game.settings.set` replaces rather than merges, so even a
 * single-record `put` writes and replicates the whole corpus. The corpus is the owning manager's
 * own `Map`, supplied by a thunk and never mirrored: the persisted order is that map's insertion
 * order, which a second map could silently diverge from, and writing `[...corpus().values()]`
 * still flushes every in-place mutation as the pre-seam `save()` did. A document-backed adapter
 * loses that property and must audit the in-place mutation sites (issue 1080).
 */
export class SettingsCraftingDefinitionRepository extends CraftingDefinitionRepository {
  /**
   * `hydrate` is `Recipe.fromJSON` for recipes and the manager's own `_normalizeSystem` for
   * crafting systems, a WHITELIST REBUILD that drops any key it does not emit on the next save, so
   * it must never be a local approximation. `setSetting` stays the real accessor in production, so
   * the server still refuses a non-GM write.
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

  async loadAll() {
    return this.readReplicatedSnapshot();
  }

  /**
   * Supported: a `world` setting replicates in full to every client (confirmed on 13.351 and
   * 14.365, issue 1088), and `updateSetting` fires with the new value already in `game.settings`.
   */
  readReplicatedSnapshot() {
    const stored = this._getSetting(this.settingKey);
    return (Array.isArray(stored) ? stored : []).map((raw) => this._hydrate(raw));
  }

  async get(id) {
    return this._corpus().get(String(id)) ?? null;
  }

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

  async put(record) {
    const id = this._identify(record);
    if (id == null) throw new Error(`Cannot persist a crafting definition with no id`);
    this._corpus().set(String(id), record);
    await this._flush();
  }

  async delete(id) {
    this._corpus().delete(String(id));
    await this._flush();
  }

  /**
   * Immediate even inside a batch, since a deferred write would become a corpus flush and lose its
   * explicit record list; a pending flush stays pending.
   */
  async putAll(records) {
    await this._write([...records]);
  }

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

  /** Write the corpus now, or once when the outermost open batch closes. */
  async _flush() {
    if (this._batchDepth > 0) {
      this._flushPending = true;
      return;
    }
    await this._write([...this._corpus().values()]);
  }

  /** The one point this module writes `game.settings`, shared by every write path and fixture. */
  async _write(records) {
    await this._setSetting(
      this.settingKey,
      records.map((record) => this._serialize(record))
    );
  }
}

/**
 * The persisted crafting-system array, read RAW (issue 1370), or `[]`. It lives here because this
 * module is the one production path to the key (`tests/crafting-definition-repository.test.js`
 * enforces it), and the world identity drift audit reads it before either manager exists. Read
 * only: `put` is the single write path.
 */
export function readPersistedCraftingSystems(getSetting = defaultGetSetting) {
  try {
    const raw = getSetting(SETTING_KEYS.CRAFTING_SYSTEMS);
    return Array.isArray(raw) ? raw : [];
  } catch {
    // Guarded: `initialize()` is awaited inside an async `ready` hook, whose dispatch catches only
    // synchronous throws, so a rejection here would silently skip the world-time pass, the flag
    // auto-stamps and the identity remap.
    return [];
  }
}
