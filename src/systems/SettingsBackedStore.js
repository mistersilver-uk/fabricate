/**
 * The persistence shell behind the six one-key world-setting stores (issue 1689). It imports
 * nothing and reads no global, so a subclass taking its seams by injection stays out of
 * `src/config/settings.js`'s import closure. `load()` and `_setCache(value)` throw rather than
 * default, so a subclass supplying neither fails at first use instead of silently doing nothing.
 */
export class SettingsBackedStore {
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
    throw new TypeError(`SettingsBackedStore subclass must implement load()`);
  }

  /** Abstract: assign the subclass's own cache field, named per store. */
  _setCache(_value) {
    throw new TypeError(`SettingsBackedStore subclass must implement _setCache(value)`);
  }

  /** Replace the cache wholesale: its identity is the signal readers key off, so never merge. */
  _publish(value) {
    this._setCache(value);
    this.loaded = true;
  }

  /** Not optional-chained: `await undefined?.()` would report a missing seam's write as landed. */
  async _writeSetting(payload) {
    await this.setSetting(this.settingKey, payload);
  }

  /**
   * Publish, then await the write: four of the six stores, and `data-models/spec.md` pins it for
   * CharacterLibraries and TravelConfig. A GM writes per keystroke, so publishing after the await
   * lets the next edit read a stale value and lose typing; a rejected write leaves the cache ahead
   * until `load()`. Other published state is assigned before this call, never after the await.
   */
  async _publishThenWrite(value, payload) {
    this._publish(value);
    await this._writeSetting(payload);
  }

  /** Write, then publish: the two validation-gated stores, whose refused write changes no cache. */
  async _writeThenPublish(value, payload) {
    await this._writeSetting(payload);
    this._publish(value);
  }
}
