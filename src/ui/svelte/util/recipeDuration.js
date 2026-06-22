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

// English fallbacks used when no i18n is available. Singular reuses the shared
// `Economy.Unit.*` labels; plural has its own `Recipe.DurationUnitPlural.*` keys.
const SINGULAR_FALLBACK = {
  years: 'year',
  months: 'month',
  days: 'day',
  hours: 'hour',
  minutes: 'minute'
};
const PLURAL_FALLBACK = {
  years: 'years',
  months: 'months',
  days: 'days',
  hours: 'hours',
  minutes: 'minutes'
};

function text(key, fallback) {
  const translated = localize(key);
  return translated && translated !== key ? translated : fallback;
}

/**
 * The singular unit label (e.g. "Minute"), shared with the editor's per-input
 * unit suffix so the popover and the formatted string draw from one source.
 * @param {string} unit - One of `TIME_UNITS`.
 * @returns {string}
 */
export function durationUnitLabelSingular(unit) {
  return text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, SINGULAR_FALLBACK[unit] || unit);
}

/**
 * The unit label for a given quantity, respecting plurals: exactly 1 uses the
 * singular `Economy.Unit.*` label, any other count uses the plural
 * `Recipe.DurationUnitPlural.*` label (e.g. "1 Minute" vs "2 Minutes").
 * @param {string} unit - One of `TIME_UNITS`.
 * @param {number} value - The quantity for that unit.
 * @returns {string}
 */
export function durationUnitLabel(unit, value) {
  if (Number(value) === 1) return durationUnitLabelSingular(unit);
  return text(
    `FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.${unit}`,
    PLURAL_FALLBACK[unit] || unit
  );
}

/**
 * Build a compact "2 Hours, 30 Minutes" string from the non-zero fields of a time
 * requirement, pluralizing each unit by its count and separating units with ", ".
 * @param {object|null} time - `{ minutes, hours, days, months, years }` or null.
 * @returns {string} Empty string when there is no duration.
 */
export function formatTimeRequirement(time) {
  if (!time || typeof time !== 'object') return '';
  const parts = [];
  for (const unit of TIME_UNITS) {
    const value = Number(time[unit] || 0);
    if (value > 0) {
      parts.push(`${value} ${durationUnitLabel(unit, value)}`);
    }
  }
  return parts.join(', ');
}
