/**
 * Shared helpers for a recipe step's duration (`timeRequirement`). The display
 * formatter and unit ordering live here so the step accordion and the duration
 * editor render durations identically (no duplicated inline formatter).
 */
import { localize } from './foundryBridge.js';

/**
 * Duration units in descending magnitude. The display formatter walks them in
 * this order; the editor renders an input per unit in the same order.
 * @type {readonly string[]}
 */
export const TIME_UNITS = ['years', 'months', 'days', 'hours', 'minutes'];

function text(key, fallback) {
  const translated = localize(key);
  return translated && translated !== key ? translated : fallback;
}

/**
 * Build a compact "2 hours 30 minutes" string from the non-zero fields of a
 * time requirement, using the `FABRICATE.Admin.Manager.Economy.Unit.*` labels.
 * @param {object|null} time - `{ minutes, hours, days, months, years }` or null.
 * @returns {string} Empty string when there is no duration.
 */
export function formatTimeRequirement(time) {
  if (!time || typeof time !== 'object') return '';
  const parts = [];
  for (const unit of TIME_UNITS) {
    const value = Number(time[unit] || 0);
    if (value > 0) {
      const unitKey = `FABRICATE.Admin.Manager.Economy.Unit.${unit}`;
      parts.push(`${value} ${text(unitKey, unit)}`);
    }
  }
  return parts.join(' ');
}
