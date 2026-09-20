/**
 * The WORLD currency ladder (issue 1278), a section of `createAdminStore` (issue 1708). It owns no
 * writable: every read and write goes through the injected `CurrencyConfigStore`, which is why the
 * publish projection re-reads the config each time rather than caching it per system.
 */
import {
  getCurrencyPresetsForFoundrySystem,
  seedCurrencyPresets,
} from '../../../config/currencyPresets.js';
import {
  getDefaultProviderId,
  getProviderCanonicalUnits,
} from '../../../config/currencyProviders.js';
import {
  canAddCurrencySubUnit,
  CURRENCY_MACRO_KEYS,
  normalizeCurrencyUnit,
  normalizeWorldCurrencyConfig,
  validateCurrencyProfile,
} from '../../../systems/currencyProfile.js';

import { reorderListByIndex } from './adminStoreInternals.js';

// --- Currency unit mutation helpers, module-level and shallow so the mutate callbacks stay flat ---

function stripSubUnit(unit, subUnitId) {
  return {
    ...unit,
    contains: (unit.contains || []).filter((entry) => entry.unitId !== subUnitId),
  };
}

function deleteCurrencyUnitFromList(units, unitId) {
  if (!unitId) return null;
  const nextUnits = units
    .filter((unit) => unit.id !== unitId)
    .map((unit) => stripSubUnit(unit, unitId));
  return nextUnits.length === units.length ? null : nextUnits;
}

function setSubUnitAmount(entry, subUnitId, numericAmount) {
  if (entry.unitId !== subUnitId) return entry;
  return { ...entry, amount: numericAmount };
}

function updateSubUnitAmountInList(units, parentUnitId, subUnitId, numericAmount) {
  let changed = false;
  const nextUnits = units.map((unit) => {
    if (unit.id !== parentUnitId) return unit;
    const contains = (unit.contains || []).map((entry) => {
      const updated = setSubUnitAmount(entry, subUnitId, numericAmount);
      if (updated !== entry) changed = true;
      return updated;
    });
    return { ...unit, contains };
  });
  return { nextUnits, changed };
}

function deleteSubUnitFromList(units, parentUnitId, subUnitId) {
  let changed = false;
  const nextUnits = units.map((unit) => {
    if (unit.id !== parentUnitId) return unit;
    const contains = (unit.contains || []).filter((entry) => entry.unitId !== subUnitId);
    if (contains.length !== (unit.contains || []).length) changed = true;
    return { ...unit, contains };
  });
  return { nextUnits, changed };
}

// The WORLD currency projection (issue 1278). A top-level sibling, never hung off
// `selectedSystem`: the config is world scope, and hanging it there would make the same ladder
// appear to change when the GM merely clicks a different crafting system.
export function emptyWorldCurrencyState() {
  return {
    worldCurrency: {
      spendStrategy: 'actorProperty',
      providerId: '',
      macros: { canAfford: '', increment: '', decrement: '', balance: '' },
      units: [],
    },
    worldCurrencyValidation: emptyWorldCurrencyValidation(),
  };
}

// The derived `validateCurrencyProfile` report for the world ladder (issue 1493), a top-level
// sibling of `worldCurrency` rather than a fifth key inside it, since `CurrencyConfig` is exactly
// those four keys. Only `valid` and `errors` are published; no surface reads the rest.
function emptyWorldCurrencyValidation() {
  return { valid: true, errors: [] };
}

function buildWorldCurrencyValidation(config) {
  const report = validateCurrencyProfile(config?.units, {
    spendStrategy: config?.spendStrategy,
    macros: config?.macros,
  });
  return {
    valid: report?.valid === true,
    errors: Array.isArray(report?.errors) ? [...report.errors] : [],
  };
}

export function createCurrencySection({ services, randomID, refresh }) {
  // Read the world currency config straight from its store on every publish: cheap (one setting
  // read plus a normalize), and honest when another client's GM edits the ladder — there is no
  // per-system cache to invalidate because there is no per-system copy any more.
  function buildState() {
    const store = services.getCurrencyConfigStore?.();
    if (!store) return emptyWorldCurrencyState();
    const worldCurrency = normalizeWorldCurrencyConfig(store.get(), { randomID });
    // Validated on every publish, off the SAME normalized config the editor renders, so the
    // report can never describe a ladder the GM is not looking at. Pure in-memory work.
    return { worldCurrency, worldCurrencyValidation: buildWorldCurrencyValidation(worldCurrency) };
  }

  async function updateCurrencyConfig(mutate) {
    const store = services.getCurrencyConfigStore?.();
    if (!store) return false;

    const currency = normalizeWorldCurrencyConfig(store.get(), { randomID });
    const result = await mutate(currency);
    if (result === false) return false;

    await store.save(currency);
    await refresh();
    return result ?? true;
  }

  async function addCurrencyUnit(partial = {}) {
    return await updateCurrencyConfig((currency) => {
      const id = String(partial?.id || randomID()).trim();
      if (!id || currency.units.some((unit) => unit.id === id)) return null;
      const unit = normalizeCurrencyUnit(
        {
          id,
          label:
            partial?.label ||
            services.localize?.('FABRICATE.Admin.Manager.CurrencyUnits.NewLabel') ||
            'Currency unit',
          abbreviation: partial?.abbreviation || '',
          icon: partial?.icon || 'fa-solid fa-coins',
          actorPath: partial?.actorPath || '',
          contains: partial?.contains || [],
        },
        randomID
      );
      if (!unit) return null;
      currency.units = [...currency.units, unit];
      return unit;
    });
  }

  async function updateCurrencyUnit(unitId, updates = {}) {
    return await updateCurrencyConfig((currency) => {
      if (!unitId) return false;
      let changed = false;
      currency.units = currency.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        changed = true;
        return normalizeCurrencyUnit({ ...unit, ...updates, id: unit.id }, randomID) || unit;
      });
      return changed;
    });
  }

  async function deleteCurrencyUnit(unitId) {
    return await updateCurrencyConfig((currency) => {
      const nextUnits = deleteCurrencyUnitFromList(currency.units, unitId);
      if (!nextUnits) return false;
      currency.units = nextUnits;
      return true;
    });
  }

  /**
   * Move one currency unit from `fromIndex` to `toIndex` (issue 768); array order is the persisted
   * order. Takes no system id, because the ladder is world scope.
   */
  async function reorderCurrencyUnit(fromIndex, toIndex) {
    return await updateCurrencyConfig((currency) => {
      const next = reorderListByIndex(currency.units, fromIndex, toIndex);
      if (!next) return false;
      currency.units = next;
      return true;
    });
  }

  async function addCurrencySubUnit(parentUnitId, subUnitId, amount = 1) {
    return await updateCurrencyConfig((currency) => {
      if (!canAddCurrencySubUnit(currency.units, parentUnitId, subUnitId)) return false;
      const numericAmount = Math.max(1, Math.trunc(Number(amount) || 1));
      currency.units = currency.units.map((unit) =>
        unit.id === parentUnitId
          ? {
              ...unit,
              contains: [...(unit.contains || []), { unitId: subUnitId, amount: numericAmount }],
            }
          : unit
      );
      return true;
    });
  }

  async function updateCurrencySubUnit(parentUnitId, subUnitId, amount) {
    return await updateCurrencyConfig((currency) => {
      const numericAmount = Math.max(1, Math.trunc(Number(amount) || 1));
      const { nextUnits, changed } = updateSubUnitAmountInList(
        currency.units,
        parentUnitId,
        subUnitId,
        numericAmount
      );
      currency.units = nextUnits;
      return changed;
    });
  }

  async function deleteCurrencySubUnit(parentUnitId, subUnitId) {
    return await updateCurrencyConfig((currency) => {
      const { nextUnits, changed } = deleteSubUnitFromList(currency.units, parentUnitId, subUnitId);
      currency.units = nextUnits;
      return changed;
    });
  }

  function currentFoundrySystemId() {
    return typeof services.getFoundrySystemId === 'function'
      ? String(services.getFoundrySystemId() || '')
      : '';
  }

  // Provider inventory mode means "use the system's coins": the provider owns the denomination
  // ladder, so `config.units` is overwritten with its canonical units and re-normalized, keeping
  // the engine's affordability math aligned.
  function applyProviderCanonicalUnits(currency) {
    const normalizedCanonical = getProviderCanonicalUnits(currency.providerId)
      .map((unit) => normalizeCurrencyUnit(unit, randomID))
      .filter(Boolean);
    if (normalizedCanonical.length === 0) return;
    currency.units = normalizedCanonical;
  }

  async function setCurrencySpendStrategy(spendStrategy) {
    const nextStrategy = ['actorInventory', 'macro'].includes(spendStrategy)
      ? spendStrategy
      : 'actorProperty';
    return await updateCurrencyConfig((currency) => {
      currency.spendStrategy = nextStrategy;
      // Switching to actorInventory seeds a default providerId and syncs the provider's canonical units,
      // guarded so a no-provider system never wipes the GM's. Switching to macro leaves them in place,
      // because macros own conversion by abbreviation.
      if (nextStrategy === 'actorInventory') {
        if (!currency.providerId) {
          currency.providerId = getDefaultProviderId(currentFoundrySystemId());
        }
        applyProviderCanonicalUnits(currency);
      }
      return true;
    });
  }

  async function setCurrencyProvider(providerId) {
    return await updateCurrencyConfig((currency) => {
      currency.providerId = String(providerId || '').trim();
      // Selecting a provider adopts its canonical units under the actorInventory strategy; under
      // other strategies the providerId is inert and user-managed units stay untouched.
      if (currency.spendStrategy === 'actorInventory') {
        applyProviderCanonicalUnits(currency);
      }
      return true;
    });
  }

  async function setCurrencyMacro(key, uuid) {
    if (!CURRENCY_MACRO_KEYS.includes(key)) return false;
    return await updateCurrencyConfig((currency) => {
      currency.macros = { ...currency.macros, [key]: String(uuid || '').trim() };
      return true;
    });
  }

  async function clearCurrencyMacro(key) {
    return await setCurrencyMacro(key, '');
  }

  async function seedCurrencyUnitPresets() {
    const foundrySystemId = currentFoundrySystemId();
    const presets = getCurrencyPresetsForFoundrySystem(foundrySystemId);
    if (!presets || presets.length === 0) {
      return { added: [], skipped: [], unsupported: true, foundrySystemId };
    }
    return await updateCurrencyConfig((currency) => {
      const result = seedCurrencyPresets({
        presets,
        currentUnits: currency.units || [],
      });
      currency.units = result.next
        .map((unit) => normalizeCurrencyUnit(unit, randomID))
        .filter(Boolean);
      // pf2e coins live in the actor inventory (read/spent via actor.inventory.removeCoins),
      // not at a flat actor property, so the pf2e preset selects the actorInventory spend
      // strategy. dnd5e (and every other system) stays on the default actorProperty strategy.
      currency.spendStrategy = foundrySystemId === 'pf2e' ? 'actorInventory' : 'actorProperty';
      // pf2e seeds the system's default provider; dnd5e stays on actorProperty where providerId is
      // inert (but still normalized/persisted).
      if (foundrySystemId === 'pf2e') {
        currency.providerId = getDefaultProviderId(foundrySystemId);
        // The actorInventory strategy is provider-owned, so overwrite the seeded units with the
        // provider's canonical ladder (a clean overwrite of the same pf2e preset list) rather than
        // the merge above, keeping the engine on canonical denominations.
        applyProviderCanonicalUnits(currency);
      }
      return { added: result.added, skipped: result.skipped, unsupported: false, foundrySystemId };
    });
  }

  return {
    buildState,
    addCurrencyUnit,
    updateCurrencyUnit,
    deleteCurrencyUnit,
    reorderCurrencyUnit,
    addCurrencySubUnit,
    updateCurrencySubUnit,
    deleteCurrencySubUnit,
    setCurrencySpendStrategy,
    setCurrencyProvider,
    setCurrencyMacro,
    clearCurrencyMacro,
    seedCurrencyUnitPresets,
  };
}
