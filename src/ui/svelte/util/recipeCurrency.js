/**
 * Shared helpers for a recipe requirement's currency alternative
 * (`match: { type:'currency', unit, amount }`). Resolving a unit id to its
 * configured label/icon and formatting a "100 gp" requirement live here so the
 * ingredient option editor renders currency consistently without re-importing
 * the heavier `currencyProfile` system module into the Svelte layer.
 */

/**
 * Resolve a currency unit id to its configured unit entry.
 * @param {Array<{id:string}>} units - The system's currency units.
 * @param {string} unitId
 * @returns {object|null}
 */
export function findCurrencyUnit(units = [], unitId = '') {
  const id = String(unitId || '').trim();
  if (!id) return null;
  return (Array.isArray(units) ? units : []).find((unit) => unit?.id === id) || null;
}

/**
 * Human-readable label for a currency unit id (label, then abbreviation, then
 * the raw id as a last resort).
 * @param {Array<object>} units
 * @param {string} unitId
 * @returns {string}
 */
export function currencyUnitLabel(units = [], unitId = '') {
  const unit = findCurrencyUnit(units, unitId);
  return unit?.label || unit?.abbreviation || String(unitId || '');
}

/**
 * Font Awesome icon class for a currency unit id, defaulting to the generic
 * coins icon when the unit defines none.
 * @param {Array<object>} units
 * @param {string} unitId
 * @returns {string}
 */
export function currencyUnitIcon(units = [], unitId = '') {
  return findCurrencyUnit(units, unitId)?.icon || 'fa-solid fa-coins';
}

/**
 * Format a currency requirement as "100 gp", preferring the unit's abbreviation.
 * @param {{unit:string, amount:number}} requirement
 * @param {Array<object>} units
 * @returns {string}
 */
export function formatCurrencyRequirement(requirement, units = []) {
  const unit = findCurrencyUnit(units, requirement?.unit);
  const label = unit?.abbreviation || unit?.label || requirement?.unit || '';
  return `${requirement?.amount ?? 0} ${label}`.trim();
}
