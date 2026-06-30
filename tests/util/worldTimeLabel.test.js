/**
 * Coverage for the pure world-time label builder
 * (`src/ui/svelte/util/worldTimeLabel.js`). The day + clock come from injected
 * calendar `components` (NOT a worldTime/secondsPerDay division). The raw
 * `components.day` is 0-based and resets each year, so the label renders a
 * monotonic, 1-based campaign day: `day + 1` within a year, or
 * `year * daysPerYear + day + 1` across years. The current instant renders with a
 * time-of-day phrase, a future instant with HH:MM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { worldTimeLabel } from '../../src/ui/svelte/util/worldTimeLabel.js';

const localize = (key, data) => (data ? `${key}|${JSON.stringify(data)}` : key);

test('renders "Day N, <phase>" for the current time when a time-of-day label is given', () => {
  // Raw within-year day 7 (0-based) → displayed 1-based as day 8.
  const label = worldTimeLabel(
    { day: 7, hour: 14, minute: 5 },
    { timeOfDayLabel: 'Dusk', localize }
  );
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithPhase|{"day":8,"phase":"Dusk"}');
});

test('renders "Day N HH:MM" for a future time (no current global phase)', () => {
  const label = worldTimeLabel({ day: 9, hour: 6, minute: 30 }, { localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":10,"time":"06:30"}');
});

test('renders the first day of the year as Day 1 (1-based)', () => {
  const label = worldTimeLabel({ day: 0, hour: 8, minute: 0 }, { localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":1,"time":"08:00"}');
});

test('composes a monotonic absolute day across a year rollover', () => {
  // Year 2, first day of the year, 30 days/year → 2*30 + 0 + 1 = 61.
  const label = worldTimeLabel(
    { year: 2, day: 0, daysPerYear: 30, hour: 0, minute: 0 },
    { localize }
  );
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":61,"time":"00:00"}');
});

test('falls back to the within-year 1-based day when daysPerYear is absent', () => {
  // year present but no daysPerYear → cannot compose absolute; use day + 1.
  const label = worldTimeLabel({ year: 5, day: 4, hour: 12, minute: 0 }, { localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":5,"time":"12:00"}');
});

test('pads single-digit clock components', () => {
  const label = worldTimeLabel({ day: 0, hour: 0, minute: 9 }, { localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":1,"time":"00:09"}');
});

test('falls back to the clock form when the phase is blank', () => {
  const label = worldTimeLabel({ day: 1, hour: 23, minute: 59 }, { timeOfDayLabel: '   ', localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":2,"time":"23:59"}');
});

test('returns empty string when no day is resolvable', () => {
  assert.equal(worldTimeLabel(null, { localize }), '');
  assert.equal(worldTimeLabel({ hour: 1 }, { localize }), '');
});
