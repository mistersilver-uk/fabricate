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

// Single constructor for a currency-unit object so the preset-ladder builder and the seed-cloner
// emit the same shape (id/label/abbreviation/icon/contains, plus an optional actorPath and an
// optional denomination) instead of repeating the literal at both call sites.
function makeCurrencyUnit({ id, label, abbreviation, icon, contains, actorPath, denomination }) {
  const unit = {
    id,
    label,
    abbreviation,
    icon: icon || 'fa-solid fa-coins',
    contains: (contains || []).map((entry) => ({ unitId: entry.unitId, amount: entry.amount })),
  };
  if (actorPath !== undefined) unit.actorPath = actorPath;
  if (denomination) unit.denomination = denomination;
  return unit;
}

// dnd5e reads/spends coins from a flat `system.currency.<denom>` actor property; pf2e maps the same
// denomination ladder onto inventory treasure read via `actor.inventory`.
function buildCoinLadderPreset(strategy) {
  // Each coin breaks down into its PARENT denomination by the ratio to that parent, forming the
  // natural denomination DAG rather than flattening every coin to copper.
  const coins = [
    { id: 'cp', label: 'Copper', contains: [] },
    { id: 'sp', label: 'Silver', contains: [{ unitId: 'cp', amount: 10 }] },
    { id: 'ep', label: 'Electrum', contains: [{ unitId: 'sp', amount: 5 }], dnd5eOnly: true },
    { id: 'gp', label: 'Gold', contains: [{ unitId: 'sp', amount: 10 }] },
    { id: 'pp', label: 'Platinum', contains: [{ unitId: 'gp', amount: 10 }] },
  ];
  return freezePresetUnits(
    coins
      .filter((coin) => strategy === 'actorPath' || !coin.dnd5eOnly)
      .map((coin) =>
        makeCurrencyUnit({
          id: coin.id,
          label: coin.label,
          abbreviation: coin.id,
          contains: coin.contains,
          actorPath: strategy === 'actorPath' ? `system.currency.${coin.id}` : undefined,
          denomination: strategy === 'actorPath' ? undefined : coin.id,
        })
      )
  );
}

/**
 * dnd5e and pf2e share the same denomination ladder, so the only difference between the two presets
 * is how a coin balance is read and spent. dnd5e coins live at a flat `system.currency.<denom>`
 * numeric actor property and are spent via `actor.update` (the `actorProperty` strategy).
 */

export const DND5E_CURRENCY_PRESETS = buildCoinLadderPreset('actorPath');

export const PF2E_CURRENCY_PRESETS = buildCoinLadderPreset('denomination');

/**
 * The frozen currency unit preset bundle for a Foundry system, or an empty frozen array for a
 * system with no bundle. dnd5e units carry `actorPath`; pf2e units carry `denomination`.
 */
export function getCurrencyPresetsForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (id === 'dnd5e') return DND5E_CURRENCY_PRESETS;
  if (id === 'pf2e') return PF2E_CURRENCY_PRESETS;
  return Object.freeze([]);
}

/** Preset bundle keyed by adapter id. */
export function getCurrencyPresetsForAdapter(adapterId) {
  return getCurrencyPresetsForFoundrySystem(adapterId);
}

/** Idempotently merge preset units into a system's current unit list. */
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
    const cloned = makeCurrencyUnit({
      id,
      label: String(preset.label || id),
      abbreviation: String(preset.abbreviation || id),
      icon: String(preset.icon || 'fa-solid fa-coins'),
      actorPath: String(preset.actorPath || ''),
      denomination: String(preset.denomination || '').trim(),
      contains: Array.isArray(preset.contains)
        ? preset.contains.map((entry) => ({
            unitId: String(entry.unitId || ''),
            amount: Math.max(1, Math.trunc(Number(entry.amount) || 1)),
          }))
        : [],
    });
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: [...seen.values()] };
}
