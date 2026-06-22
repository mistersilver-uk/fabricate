/**
 * Unit coverage for the shared recipe-duration formatter extracted from the
 * step accordion (so the accordion and the duration editor format identically).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const UNIT_LABELS = {
  'FABRICATE.Admin.Manager.Economy.Unit.minutes': 'Minute',
  'FABRICATE.Admin.Manager.Economy.Unit.hours': 'Hour',
  'FABRICATE.Admin.Manager.Economy.Unit.days': 'Day',
  'FABRICATE.Admin.Manager.Economy.Unit.months': 'Month',
  'FABRICATE.Admin.Manager.Economy.Unit.years': 'Year',
  'FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.minutes': 'Minutes',
  'FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.hours': 'Hours',
  'FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.days': 'Days',
  'FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.months': 'Months',
  'FABRICATE.Admin.Manager.Recipe.DurationUnitPlural.years': 'Years',
};

globalThis.game = {
  i18n: {
    localize: (key) => UNIT_LABELS[key] ?? key,
    format: (key) => key,
  },
};

const { formatTimeRequirement, TIME_UNITS } =
  await import('../src/ui/svelte/util/recipeDuration.js');

test('TIME_UNITS are ordered descending by magnitude', () => {
  assert.deepEqual(TIME_UNITS, ['years', 'months', 'days', 'hours', 'minutes']);
});

test('formatTimeRequirement joins non-zero units in descending order', () => {
  const label = formatTimeRequirement({ minutes: 30, hours: 2, days: 0, months: 0, years: 0 });
  assert.equal(label, '2 Hours, 30 Minutes');
});

test('formatTimeRequirement omits zero units', () => {
  assert.equal(formatTimeRequirement({ days: 3, minutes: 0 }), '3 Days');
});

test('formatTimeRequirement uses singular labels for a value of exactly 1', () => {
  assert.equal(formatTimeRequirement({ hours: 1, minutes: 1 }), '1 Hour, 1 Minute');
});

test('formatTimeRequirement mixes singular and plural by per-unit count', () => {
  assert.equal(formatTimeRequirement({ hours: 1, minutes: 2 }), '1 Hour, 2 Minutes');
});

test('formatTimeRequirement returns an empty string for null / all-zero', () => {
  assert.equal(formatTimeRequirement(null), '');
  assert.equal(formatTimeRequirement({ minutes: 0, hours: 0 }), '');
});

test('formatTimeRequirement falls back to the raw unit name without i18n', async () => {
  const previous = globalThis.game;
  globalThis.game = {};
  try {
    // Re-import with a cache-busting query so the stub-less branch is exercised.
    const mod = await import('../src/ui/svelte/util/recipeDuration.js?nogame');
    assert.equal(mod.formatTimeRequirement({ hours: 1 }), '1 hour');
    assert.equal(mod.formatTimeRequirement({ hours: 2 }), '2 hours');
  } finally {
    globalThis.game = previous;
  }
});
