/**
 * The shared persistence shell behind the six one-key world-setting stores (issue 1689): the
 * injected seams, the `loaded` bookkeeping, the raw read in its guarded and unguarded forms, the
 * write, and the two publish orderings.
 *
 * It imports nothing and reads no global, so a subclass taking its seams by injection stays out
 * of `src/config/settings.js`'s import closure. `_setCache(value)` and `load()` are abstract and
 * throw rather than defaulting, so a subclass supplying neither fails at first use instead of
 * silently doing nothing.
 */
export class SettingsBackedStore {
  /**
   * @param {object} seams
   * @param {(key: string) => unknown} seams.getSetting
   * @param {(key: string, value: unknown) => Promise<unknown>} seams.setSetting
   * @param {string} seams.settingKey The one key this store reads and writes.
   */
  constructor({ getSetting, setSetting, settingKey }) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.settingKey = settingKey;
    this.loaded = false;
  }

  /** The setting's live parsed value, never a copy — a subclass normalizes rather than mutates it. */
  _readSetting() {
    return this.getSetting(this.settingKey);
  }

  /** The same read degraded to `null`, for a store whose `load()` must never take the module down. */
  _readSettingGuarded() {
    try {
      return this._readSetting();
    } catch {
      return null;
    }
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  /** Abstract: read the setting, publish it, and answer whatever this store's `load()` returns. */
  load() {
    throw new TypeError(`${this.constructor.name} must implement load()`);
  }

  /** Abstract: assign the subclass's own cache field, named per store. */
  _setCache(_value) {
    throw new TypeError(`${this.constructor.name} must implement _setCache(value)`);
  }

  /**
   * Replace the published cache wholesale. Its IDENTITY is the invalidation signal readers key
   * off, so `_setCache` assigns its subclass's field and never merges into the object it replaces.
   */
  _publish(value) {
    this._setCache(value);
    this.loaded = true;
  }

  /**
   * Not optional-chained. `await undefined?.()` is `undefined`, so a store built without a write
   * seam would report every write as a success and hand its caller a landed-write answer for a
   * write that never happened.
   */
  async _writeSetting(payload) {
    await this.setSetting(this.settingKey, payload);
  }

  /**
   * Publish the cache, then await the write — the ordering four of the six use, pinned by
   * `data-models/spec.md` for CharacterLibraries and TravelConfig.
   *
   * Callers read-modify-write and a GM authoring incrementally fires one write per keystroke, so
   * a second edit routinely starts while the first is still in flight. Publish after the await
   * and that second edit reads the pre-first-edit value and clobbers it, losing the GM's typing —
   * and where one key carries two libraries, losing it from a list they were not even editing.
   * The accepted cost is a cache briefly ahead of the setting when the write rejects, recoverable
   * on the next `load()`; a lost update is not recoverable at all.
   *
   * A store with a SECOND piece of published state assigns it before calling this and never after
   * the await, so a reader on the replication path sees it in step with the payload being written.
   */
  async _publishThenWrite(value, payload) {
    this._publish(value);
    await this._writeSetting(payload);
  }

  /**
   * Await the write, then publish — the ordering the two validation-gated stores use, so a
   * refused write leaves their caches in step with the setting that did not change.
   */
  async _writeThenPublish(value, payload) {
    await this._writeSetting(payload);
    this._publish(value);
  }
}
