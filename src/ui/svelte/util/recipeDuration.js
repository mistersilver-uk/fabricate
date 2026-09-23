// A recipe step's duration (`timeRequirement`). The formatter and the unit ordering live together
// so the step accordion and the duration editor cannot render a duration differently.
import { localize } from './foundryBridge.js';

// Descending magnitude: the formatter walks them in this order and the editor renders in it too.
export const TIME_UNITS = ['years', 'months', 'days', 'hours', 'minutes'];

// English fallbacks for no i18n. Singular reuses `Economy.Unit.*`; plural has its own keys.
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

// Deliberately terse and count-agnostic (no plural) so the Overview tab's stepper pill stays narrow.
const ABBREV_FALLBACK = {
  years: 'yr',
  months: 'mo',
  days: 'day',
  hours: 'hr',
  minutes: 'min'
};

function text(key, fallback) {
  const translated = localize(key);
  return translated && translated !== key ? translated : fallback;
}

// Shared with the editor's per-input suffix, so the popover and the formatted string are one source.
export function durationUnitLabelSingular(unit) {
  return text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, SINGULAR_FALLBACK[unit] || unit);
}

// Exactly 1 takes the singular key; every other count takes the plural one.
export function durationUnitLabel(unit, value) {
  if (Number(value) === 1) return durationUnitLabelSingular(unit);
  return text(
    `FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.${unit}`,
    PLURAL_FALLBACK[unit] || unit
  );
}

// "2 Hours, 30 Minutes" over the non-zero fields; `''` when there is no duration.
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

export function durationUnitAbbrev(unit) {
  return text(
    `FABRICATE.Admin.Manager.Recipe.DurationUnitAbbrev.${unit}`,
    ABBREV_FALLBACK[unit] || unit
  );
}

// "2 hr 30 min" for the inline steppers; the localized "Instant" label when there is no duration.
export function formatTimeRequirementCompact(time) {
  if (!time || typeof time !== 'object') {
    return text('FABRICATE.Admin.Manager.Recipe.DurationInstant', 'Instant');
  }
  const parts = [];
  for (const unit of TIME_UNITS) {
    const value = Number(time[unit] || 0);
    if (value > 0) parts.push(`${value} ${durationUnitAbbrev(unit)}`);
  }
  return parts.length > 0
    ? parts.join(' ')
    : text('FABRICATE.Admin.Manager.Recipe.DurationInstant', 'Instant');
}
