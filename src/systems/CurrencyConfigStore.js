import {
  getSetting as defaultGetSetting,
  setSetting as defaultSetSetting,
  SETTING_KEYS,
} from '../config/settings.js';
import {
  CURRENCY_MACRO_KEYS,
  SPEND_STRATEGIES,
  canAddCurrencySubUnit,
  normalizeCurrencyUnit,
  normalizeWorldCurrencyConfig,
  validateCurrencyProfile,
} from './currencyProfile.js';

export class CurrencyConfigValidationError extends Error {
  constructor(errors = []) {
    super(`Currency configuration validation failed: ${errors.join('; ')}`);
    this.name = 'CurrencyConfigValidationError';
    this.errors = errors;
  }
}

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
 * `resolveCurrencyContext`, which surfaces a clear error and refuses to spend. `validate()` is
 * offered for surfaces that want to SHOW the GM what is still wrong, never to block them.
 *
 * The one thing the store does refuse is a structurally impossible sub-unit edit (a self-reference
 * or a cycle), because that corrupts the graph every reader walks rather than merely leaving it
 * incomplete.
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

  /** The configured unit ladder. */
  listUnits() {
    return this.get().units;
  }

  /**
   * Validate the current profile without persisting or throwing. Callers use this to render
   * guidance; it never gates a write.
   */
  validate() {
    const config = this.get();
    return validateCurrencyProfile(config.units, {
      spendStrategy: config.spendStrategy,
      macros: config.macros,
    });
  }

  _normalize(raw) {
    return normalizeWorldCurrencyConfig(raw && typeof raw === 'object' ? raw : {}, {
      randomID: this.randomID,
    });
  }

  async _persist(next) {
    const normalized = this._normalize(next);
    const payload = cloneJson(normalized);
    await this.setSetting(SETTING_KEYS.CURRENCY_CONFIG, payload);
    this.config = normalized;
    this.loaded = true;
    return cloneJson(payload);
  }

  /** Replace the whole config. */
  async save(config) {
    return this._persist(config);
  }

  async _mutate(transform) {
    this._ensureLoaded();
    const draft = cloneJson(this.config);
    const next = transform(draft);
    if (next === false) return false;
    return this._persist(next ?? draft);
  }

  async setSpendStrategy(spendStrategy) {
    if (!SPEND_STRATEGIES.has(spendStrategy)) return false;
    return this._mutate((config) => ({ ...config, spendStrategy }));
  }

  async setProvider(providerId) {
    return this._mutate((config) => ({ ...config, providerId: String(providerId || '').trim() }));
  }

  async setMacro(key, uuid) {
    if (!CURRENCY_MACRO_KEYS.includes(key)) return false;
    return this._mutate((config) => ({
      ...config,
      macros: { ...config.macros, [key]: String(uuid || '').trim() },
    }));
  }

  async clearMacro(key) {
    return this.setMacro(key, '');
  }

  async addUnit(partial = {}) {
    let created = null;
    const result = await this._mutate((config) => {
      const id = String(partial?.id || this.randomID()).trim();
      if (!id || config.units.some((unit) => unit.id === id)) return false;
      created = normalizeCurrencyUnit({ ...partial, id }, this.randomID);
      return { ...config, units: [...config.units, created] };
    });
    return result === false ? null : created;
  }

  async updateUnit(unitId, updates = {}) {
    return this._mutate((config) => {
      const index = config.units.findIndex((unit) => unit.id === unitId);
      if (index === -1) return false;
      const next = normalizeCurrencyUnit(
        { ...config.units[index], ...updates, id: unitId },
        this.randomID
      );
      return { ...config, units: replaceAt(config.units, index, next) };
    });
  }

  /**
   * Remove a unit AND every sub-unit reference pointing at it, so deleting a denomination never
   * leaves a dangling edge in the ladder other readers must defend against.
   */
  async deleteUnit(unitId) {
    return this._mutate((config) => {
      if (!config.units.some((unit) => unit.id === unitId)) return false;
      const units = config.units
        .filter((unit) => unit.id !== unitId)
        .map((unit) => ({
          ...unit,
          contains: (unit.contains || []).filter((entry) => entry.unitId !== unitId),
        }));
      return { ...config, units };
    });
  }

  async reorderUnit(fromIndex, toIndex) {
    return this._mutate((config) => {
      const units = [...config.units];
      if (
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(toIndex) ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= units.length ||
        toIndex >= units.length ||
        fromIndex === toIndex
      ) {
        return false;
      }
      const [moved] = units.splice(fromIndex, 1);
      units.splice(toIndex, 0, moved);
      return { ...config, units };
    });
  }

  async addSubUnit(parentUnitId, subUnitId, amount = 1) {
    return this._mutate((config) => {
      // The only structural refusal this store makes: a self-reference or a cycle corrupts the
      // graph every reader walks, unlike an incomplete ladder which merely fails validation.
      if (!canAddCurrencySubUnit(config.units, parentUnitId, subUnitId)) return false;
      const index = config.units.findIndex((unit) => unit.id === parentUnitId);
      if (index === -1) return false;
      const parent = config.units[index];
      if ((parent.contains || []).some((entry) => entry.unitId === subUnitId)) return false;
      const next = {
        ...parent,
        contains: [...(parent.contains || []), { unitId: subUnitId, amount: Number(amount) || 1 }],
      };
      return { ...config, units: replaceAt(config.units, index, next) };
    });
  }

  async updateSubUnit(parentUnitId, subUnitId, amount) {
    return this._mutate((config) => {
      const index = config.units.findIndex((unit) => unit.id === parentUnitId);
      if (index === -1) return false;
      const parent = config.units[index];
      const contains = (parent.contains || []).map((entry) =>
        entry.unitId === subUnitId ? { ...entry, amount: Number(amount) || 1 } : entry
      );
      return { ...config, units: replaceAt(config.units, index, { ...parent, contains }) };
    });
  }

  async deleteSubUnit(parentUnitId, subUnitId) {
    return this._mutate((config) => {
      const index = config.units.findIndex((unit) => unit.id === parentUnitId);
      if (index === -1) return false;
      const parent = config.units[index];
      const contains = (parent.contains || []).filter((entry) => entry.unitId !== subUnitId);
      return { ...config, units: replaceAt(config.units, index, { ...parent, contains }) };
    });
  }

  /** Replace the unit ladder wholesale — used by preset seeding and provider adoption. */
  async replaceUnits(units = []) {
    return this._mutate((config) => ({ ...config, units: Array.isArray(units) ? units : [] }));
  }
}

function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function replaceAt(list, index, value) {
  const next = [...list];
  next[index] = value;
  return next;
}
