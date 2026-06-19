/**
 * Per-Foundry-system currency unit preset bundles.
 *
 * Presets are opt-in and idempotent, matching the character modifier preset
 * workflow: GMs seed them as a starting point, then edit the units to fit their
 * actor data shape.
 */

function freezePresetUnits(units) {
  return Object.freeze(
    units.map((unit) =>
      Object.freeze({
        ...unit,
        contains: Object.freeze(
          (unit.contains || []).map((entry) =>
            Object.freeze({ unitId: entry.unitId, amount: entry.amount })
          )
        ),
      })
    )
  );
}

export const DND5E_CURRENCY_PRESETS = freezePresetUnits([
  {
    id: 'cp',
    label: 'Copper',
    abbreviation: 'cp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.cp',
    contains: [],
  },
  {
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.sp',
    contains: [{ unitId: 'cp', amount: 10 }],
  },
  {
    id: 'ep',
    label: 'Electrum',
    abbreviation: 'ep',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.ep',
    contains: [{ unitId: 'cp', amount: 50 }],
  },
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'cp', amount: 100 }],
  },
  {
    id: 'pp',
    label: 'Platinum',
    abbreviation: 'pp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.pp',
    contains: [{ unitId: 'cp', amount: 1000 }],
  },
]);

export const PF2E_CURRENCY_PRESETS = freezePresetUnits([
  {
    id: 'cp',
    label: 'Copper',
    abbreviation: 'cp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.cp.value',
    contains: [],
  },
  {
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.sp.value',
    contains: [{ unitId: 'cp', amount: 10 }],
  },
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.gp.value',
    contains: [{ unitId: 'cp', amount: 100 }],
  },
  {
    id: 'pp',
    label: 'Platinum',
    abbreviation: 'pp',
    icon: 'fa-solid fa-coins',
    actorPath: 'system.currency.pp.value',
    contains: [{ unitId: 'cp', amount: 1000 }],
  },
]);

export function getCurrencyPresetsForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (id === 'dnd5e') return DND5E_CURRENCY_PRESETS;
  if (id === 'pf2e') return PF2E_CURRENCY_PRESETS;
  return Object.freeze([]);
}

export function getCurrencyPresetsForAdapter(adapterId) {
  return getCurrencyPresetsForFoundrySystem(adapterId);
}

export function seedCurrencyPresets({ presets = [], currentUnits = [] } = {}) {
  const safePresets = Array.isArray(presets) ? presets : [];
  const safeCurrent = Array.isArray(currentUnits) ? currentUnits : [];
  const seen = new Map();
  for (const entry of safeCurrent) {
    if (entry && typeof entry === 'object' && entry.id) seen.set(String(entry.id), entry);
  }
  const added = [];
  const skipped = [];
  for (const preset of safePresets) {
    if (!preset || typeof preset !== 'object' || !preset.id) continue;
    const id = String(preset.id);
    if (seen.has(id)) {
      skipped.push(preset);
      continue;
    }
    const cloned = {
      id,
      label: String(preset.label || id),
      abbreviation: String(preset.abbreviation || id),
      icon: String(preset.icon || 'fa-solid fa-coins'),
      actorPath: String(preset.actorPath || ''),
      contains: Array.isArray(preset.contains)
        ? preset.contains.map((entry) => ({
            unitId: String(entry.unitId || ''),
            amount: Math.max(1, Math.trunc(Number(entry.amount) || 1)),
          }))
        : [],
    };
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: [...seen.values()] };
}
