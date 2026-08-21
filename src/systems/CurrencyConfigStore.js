import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';

import { normalizeWorldCurrencyConfig } from './currencyProfile.js';

/**
 * Persists the world currency configuration to the `currencyConfig` world setting.
 *
 * Currency is world scope because a world runs exactly ONE Foundry game system, so there is
 * exactly one way actors store coins. The coin ladder, the spend strategy, the selected provider
 * and the GM macro set therefore describe the WORLD. What stays per crafting system is only
 * `requirements.currency.enabled` — whether that system participates — which this store knows
 * nothing about.
 *
 * **Persistence is not gated on profile validity, and that is deliberate.** A GM authors a ladder
 * incrementally: the moment they add the first of two units, or clear an actor path to retype it,
 * the profile is transiently invalid. Rejecting those writes would make the editor unusable. So
 * this store normalizes on write and always saves, exactly as the per-system editor did before the
 * move, and validity is resolved where it actually matters — at craft time, in
 * `resolveCurrencyContext`, which surfaces a clear error and refuses to spend.
 *
 * It is a persistence shell and nothing more: read, normalize, write. The ladder EDITS — adding a
 * unit, refusing a cyclic sub-unit, reordering, seeding presets, adopting a provider's canonical
 * denominations — live in `adminStore`, composed from the same shared helpers
 * (`canAddCurrencySubUnit`, `_reorderListByIndex`) that the modifier and prerequisite lists use.
 * Mirroring them here as store methods would be a second implementation of one set of rules.
 */
export class CurrencyConfigStore {
  constructor({
    getSetting = defaultGetSetting,
    setSetting = defaultSetSetting,
    randomID = null,
  } = {}) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.randomID = randomID || (() => globalThis.foundry?.utils?.randomID?.());
    this.config = null;
    this.loaded = false;
  }

  load() {
    const saved = this.getSetting(SETTING_KEYS.CURRENCY_CONFIG);
    this.config = this._normalize(saved);
    this.loaded = true;
    return cloneJson(this.config);
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
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

  /**
   * PUBLISH THE CACHE BEFORE AWAITING THE WRITE, not after.
   *
   * Callers read-modify-write: `adminStore._updateCurrencyConfig` reads `get()`, mutates, and
   * saves. The editor fires one of those per keystroke on a label field, so a second edit
   * routinely starts while the first `setSetting` is still in flight. Publish after the await and
   * that second edit reads the pre-first-edit config and clobbers it — the GM's typing silently
   * disappears when they click a chevron before the round trip settles.
   *
   * The per-system path this replaced was safe by construction for exactly this reason:
   * `CraftingSystemManager.updateSystem` writes `this.systems.set(...)` before its own `await`.
   * The cost is a cache that is briefly ahead of the setting if the write rejects — recoverable
   * on the next `load()`, and the replication bridge calls that whenever the setting changes.
   * A lost update is not recoverable at all.
   */
  async _persist(next) {
    const normalized = this._normalize(next);
    const payload = cloneJson(normalized);
    this.config = normalized;
    this.loaded = true;
    await this.setSetting(SETTING_KEYS.CURRENCY_CONFIG, payload);
    return cloneJson(payload);
  }

  /** Replace the whole config. */
  async save(config) {
    return this._persist(config);
  }
}

function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
