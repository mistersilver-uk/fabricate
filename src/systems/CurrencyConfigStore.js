import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';
import { cloneJson } from '../utils/scalars.js';

import { normalizeWorldCurrencyConfig } from './currencyProfile.js';
import { SettingsBackedStore } from './SettingsBackedStore.js';

/**
 * Persists the world currency configuration to the `currencyConfig` world setting; a world runs
 * one game system, so the ladder, strategy, provider and macros are world scope, and only
 * `requirements.currency.enabled` stays per crafting system.
 * Persistence is not gated on profile validity: a ladder is transiently invalid mid-edit, so it
 * normalizes and always saves, and `resolveCurrencyContext` refuses to spend at craft time.
 * A persistence shell only; ladder edits live in `adminStore` on the shared helpers.
 */
export class CurrencyConfigStore extends SettingsBackedStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    randomID = null,
  } = {}) {
    super({ getSetting, setSetting, settingKey: SETTING_KEYS.CURRENCY_CONFIG });
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
    this.config = null;
  }

  _setCache(value) {
    this.config = value;
  }

  load() {
    this._publish(this._normalize(this._readSetting()));
    return cloneJson(this.config);
  }

  /** @returns {{ spendStrategy: string, providerId: string, macros: object, units: object[] }} */
  get() {
    this._ensureLoaded();
    return cloneJson(this.config);
  }

  _normalize(raw) {
    return normalizeWorldCurrencyConfig(raw && typeof raw === 'object' ? raw : {}, {
      randomID: this.randomID,
    });
  }

  async _persist(next) {
    const normalized = this._normalize(next);
    const payload = cloneJson(normalized);
    await this._publishThenWrite(normalized, payload);
    return cloneJson(payload);
  }

  /** Replace the whole config. */
  async save(config) {
    return this._persist(config);
  }
}
