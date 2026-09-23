// Helpers for a recipe requirement's currency alternative (`match: { type:'currency', unit,
// amount }`), kept out of the Svelte layer's import graph so it need not pull in the heavier
// `currencyProfile` system module. A unit's reading falls back label -> abbreviation -> raw id;
// `formatCurrencyRequirement` prefers the abbreviation, and a unit with no icon gets the coins glyph.

export function findCurrencyUnit(units = [], unitId = '') {
  const id = String(unitId || '').trim();
  if (!id) return null;
  return (Array.isArray(units) ? units : []).find((unit) => unit?.id === id) || null;
}

export function currencyUnitLabel(units = [], unitId = '') {
  const unit = findCurrencyUnit(units, unitId);
  return unit?.label || unit?.abbreviation || String(unitId || '');
}

export function currencyUnitIcon(units = [], unitId = '') {
  return findCurrencyUnit(units, unitId)?.icon || 'fa-solid fa-coins';
}

export function formatCurrencyRequirement(requirement, units = []) {
  const unit = findCurrencyUnit(units, requirement?.unit);
  const label = unit?.abbreviation || unit?.label || requirement?.unit || '';
  return `${requirement?.amount ?? 0} ${label}`.trim();
}
