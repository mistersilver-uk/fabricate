/**
 * Coverage for the pure world-time label builder
 * (`src/ui/svelte/util/worldTimeLabel.js`). The absolute day + clock come from
 * injected calendar `components` (NOT a worldTime/secondsPerDay division); the
 * current instant renders with a time-of-day phrase, a future instant with HH:MM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { worldTimeLabel } from '../../src/ui/svelte/util/worldTimeLabel.js';

const localize = (key, data) => (data ? `${key}|${JSON.stringify(data)}` : key);

test('renders "Day N, <phase>" for the current time when a time-of-day label is given', () => {
  const label = worldTimeLabel(
    { day: 7, hour: 14, minute: 5 },
    { timeOfDayLabel: 'Dusk', localize }
  );
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithPhase|{"day":7,"phase":"Dusk"}');
});

test('renders "Day N HH:MM" for a future time (no current global phase)', () => {
  const label = worldTimeLabel({ day: 9, hour: 6, minute: 30 }, { localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":9,"time":"06:30"}');
});

test('pads single-digit clock components', () => {
  const label = worldTimeLabel({ day: 1, hour: 0, minute: 9 }, { localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":1,"time":"00:09"}');
});

test('falls back to the clock form when the phase is blank', () => {
  const label = worldTimeLabel({ day: 2, hour: 23, minute: 59 }, { timeOfDayLabel: '   ', localize });
  assert.equal(label, 'FABRICATE.App.Journal.Time.DayWithClock|{"day":2,"time":"23:59"}');
});

test('returns empty string when no day is resolvable', () => {
  assert.equal(worldTimeLabel(null, { localize }), '');
  assert.equal(worldTimeLabel({ hour: 1 }, { localize }), '');
});
