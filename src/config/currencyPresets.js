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

// dnd5e reads/spends coins from a flat `system.currency.<denom>` actor property; pf2e maps the
// same denomination ladder onto inventory treasure read via `actor.inventory`. The two presets
// therefore share the same labels/abbreviations/ladder and differ only by how a coin is located,
// so a single builder fills in either an `actorPath` (dnd5e) or a `denomination` (pf2e).
function buildCoinLadderPreset(strategy) {
  // Each coin breaks down into its PARENT denomination by the ratio to that parent, forming the
  // natural denomination DAG rather than flattening every coin to copper. The recursive resolver
  // multiplies these ratios back to the same base values (cp=1, sp=10, ep=50, gp=100, pp=1000),
  // so affordability and change-making are unaffected while the tree stays meaningful. Electrum is
  // dnd5e-only and is a leaf branch off silver; pf2e has no electrum at all.
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
      .map((coin) => {
        const unit = {
          id: coin.id,
          label: coin.label,
          abbreviation: coin.id,
          icon: 'fa-solid fa-coins',
          contains: coin.contains.map((entry) => ({ unitId: entry.unitId, amount: entry.amount })),
        };
        if (strategy === 'actorPath') unit.actorPath = `system.currency.${coin.id}`;
        else unit.denomination = coin.id;
        return unit;
      })
  );
}

/**
 * dnd5e and pf2e share the same denomination ladder, so the only difference between
 * the two presets is how a coin balance is read and spent. dnd5e coins live at a flat
 * `system.currency.<denom>` numeric actor property and are spent via `actor.update` (the
 * `actorProperty` strategy). Modern pf2e stores coins as inventory treasure Items read via
 * `actor.inventory.coins` and mutated through `actor.inventory.removeCoins(...)`, so its
 * preset units carry a `denomination` instead of an `actorPath` and the system config
 * uses the `actorInventory` spend strategy.
 */

export const DND5E_CURRENCY_PRESETS = buildCoinLadderPreset('actorPath');

export const PF2E_CURRENCY_PRESETS = buildCoinLadderPreset('denomination');

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
    const denomination = String(preset.denomination || '').trim();
    if (denomination) cloned.denomination = denomination;
    seen.set(id, cloned);
    added.push(cloned);
  }
  return { added, skipped, next: [...seen.values()] };
}
