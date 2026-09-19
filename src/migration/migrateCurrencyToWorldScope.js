/**
 * `1.26.0` — lift the currency configuration to world scope, leaving a system only whether it
 * PARTICIPATES (issue 1278). Pure, idempotent, version-gated; spec § Currency World-Scope Migration
 * owns the id-keyed union and the scalar adoption. A world runs exactly ONE game system, so two
 * crafting systems cannot meaningfully disagree about how actors store coins. THE IDEMPOTENCE GUARD
 * IS LOAD-BEARING: a second run must never re-merge stale system blocks over a GM-edited ladder.
 */

import { isPlainObject, clone, forEachSystem, mapSystems } from './migrationHelpers.js';

const SCALAR_KEYS = ['spendStrategy', 'providerId', 'macros'];

/** Read one system's legacy currency block, if it has one. */
function legacyCurrencyBlock(system) {
  if (!isPlainObject(system)) return null;
  const requirements = system.requirements;
  if (!isPlainObject(requirements)) return null;
  const currency = requirements.currency;
  return isPlainObject(currency) ? currency : null;
}

/** Build the world currency config by unioning every system's units by id. */
export function buildWorldCurrencyConfig(systems) {
  const list = Array.isArray(systems) ? systems : [];
  const units = [];
  const seen = new Set();
  let scalars = null;
  let scalarsFromEnabled = false;

  forEachSystem(list, (system) => {
    const currency = legacyCurrencyBlock(system);
    if (!currency) return;

    const enabled = currency.enabled === true;
    // Scalars: prefer the first ENABLED system, falling back to the first carrying a currency block
    // at all, so a world where every system is switched off keeps the strategy its GM configured.
    if (!scalarsFromEnabled && (enabled || scalars === null)) {
      const picked = {};
      for (const key of SCALAR_KEYS) {
        if (currency[key] !== undefined) picked[key] = clone(currency[key]);
      }
      // Legacy provider fields are read-compatible inputs the shared normalizer maps forward.
      if (currency.provider !== undefined) picked.provider = clone(currency.provider);
      if (currency.systemAdapter !== undefined)
        picked.systemAdapter = clone(currency.systemAdapter);
      if (currency.inventoryMode !== undefined)
        picked.inventoryMode = clone(currency.inventoryMode);
      scalars = picked;
      scalarsFromEnabled = enabled;
    }

    const systemUnits = Array.isArray(currency.units) ? currency.units : [];
    for (const unit of systemUnits) {
      if (!isPlainObject(unit)) continue;
      const id = String(unit.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      units.push(clone(unit));
    }
  });

  return { ...scalars, units };
}

/**
 * Reduce every system's `requirements.currency` to the participation flag alone. Unchanged systems
 * are returned by reference.
 */
export function stripSystemCurrencyConfig(systems) {
  const list = Array.isArray(systems) ? systems : [];
  return mapSystems(list, (system) => {
    const currency = legacyCurrencyBlock(system);
    if (!currency) return system;
    const keys = Object.keys(currency);
    // Already shrunk — leave the reference alone so the runner's change detection stays honest.
    if (keys.length === 0 || (keys.length === 1 && keys[0] === 'enabled')) return system;
    return {
      ...system,
      requirements: {
        ...system.requirements,
        currency: { enabled: currency.enabled === true },
      },
    };
  });
}

export function migrateCurrencyToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const existing = isPlainObject(data.currencyConfig) ? data.currencyConfig : {};

  // The idempotence guard: a populated world ladder is authoritative and is never re-merged.
  const alreadyMigrated = Array.isArray(existing.units) && existing.units.length > 0;
  let currencyConfig = existing;
  if (!alreadyMigrated) {
    const built = buildWorldCurrencyConfig(systems);
    // Return the ORIGINAL object when there was nothing to lift: the runner detects change by JSON
    // comparison, so emitting `{ units: [] }` over a stored `{}` would write the setting in every
    // world that has never used currency.
    const liftedAnything = built.units.length > 0 || Object.keys(built).length > 1;
    currencyConfig = liftedAnything ? built : existing;
  }

  return {
    systems: stripSystemCurrencyConfig(systems),
    currencyConfig,
  };
}
