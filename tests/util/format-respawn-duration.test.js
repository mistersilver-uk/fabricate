/**
 * Coverage for the calendar-aware respawn-ETA duration formatter
 * (`src/ui/svelte/util/formatDuration.js`). Day/week thresholds come from the
 * injected calendar (via `secondsPerUnitFromCalendar`), not a hard-coded Earth
 * table, so a custom calendar's day length drives the rendered unit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatAuthoredDuration,
  formatRespawnDuration,
  formatDurationHMS,
  formatRelativeWorldTime
} from '../../src/ui/svelte/util/formatDuration.js';

const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;

test('formats minutes / hours / days / weeks against the default (Earth) calendar', () => {
  assert.equal(formatRespawnDuration(90, null), '2 minutes', 'rounds to the nearest minute');
  assert.equal(formatRespawnDuration(60, null), '1 minute', 'singular');
  assert.equal(formatRespawnDuration(2 * HOUR, null), '2 hours');
  assert.equal(formatRespawnDuration(HOUR, null), '1 hour');
  assert.equal(formatRespawnDuration(3 * DAY, null), '3 days');
  assert.equal(formatRespawnDuration(DAY, null), '1 day');
  assert.equal(formatRespawnDuration(2 * WEEK, null), '2 weeks');
});

test('returns empty string for non-positive / non-finite input (caller hides the line)', () => {
  assert.equal(formatRespawnDuration(0, null), '');
  assert.equal(formatRespawnDuration(-5, null), '');
  assert.equal(formatRespawnDuration(NaN, null), '');
  assert.equal(formatRespawnDuration(null, null), '');
});

test('sub-minute durations floor to seconds (at least 1)', () => {
  assert.equal(formatRespawnDuration(30, null), '30 seconds');
  assert.equal(formatRespawnDuration(1, null), '1 second');
});

test('day/week thresholds follow a CUSTOM calendar (10-hour days)', () => {
  // A calendar with 10h days, 60m/h, 60s/m → one day = 36000s; week = 5 days.
  const calendar = {
    days: {
      hoursPerDay: 10,
      minutesPerHour: 60,
      secondsPerMinute: 60,
      values: [{}, {}, {}, {}, {}] // 5-day week
    }
  };
  const customDay = 10 * 60 * 60; // 36000
  assert.equal(formatRespawnDuration(2 * customDay, calendar), '2 days');
  // 36000s is one custom day, not "10 hours".
  assert.equal(formatRespawnDuration(customDay, calendar), '1 day');
  // 5 custom days == one custom week.
  assert.equal(formatRespawnDuration(5 * customDay, calendar), '1 week');
});

test('formatDurationHMS renders a compact countdown, dropping leading zero units', () => {
  assert.equal(formatDurationHMS(HOUR + 27 * 60 + 42), '1h 27m 42s');
  assert.equal(formatDurationHMS(27 * 60 + 42), '27m 42s');
  assert.equal(formatDurationHMS(42), '42s');
  assert.equal(formatDurationHMS(2 * HOUR), '2h 0m 0s');
});

test('formatDurationHMS floors non-positive / non-finite input to 0s', () => {
  assert.equal(formatDurationHMS(0), '0s');
  assert.equal(formatDurationHMS(-5), '0s');
  assert.equal(formatDurationHMS(NaN), '0s');
});

// D-025: a TIME card's AUTHORED requirement follows the prototype, whose own helper
// renders `2 hours` — never the `2h 0m 0s` countdown form the live "Left" row keeps.
test('formatAuthoredDuration words an authored requirement, pluralizing correctly', () => {
  assert.equal(formatAuthoredDuration(2 * HOUR), '2 hours');
  assert.equal(formatAuthoredDuration(HOUR), '1 hour');
  assert.equal(formatAuthoredDuration(60), '1 minute');
  assert.equal(formatAuthoredDuration(45), '45 seconds');
  assert.equal(formatAuthoredDuration(1), '1 second');
  assert.notEqual(formatAuthoredDuration(2 * HOUR), formatDurationHMS(2 * HOUR));
});

test('formatAuthoredDuration states every non-zero unit rather than rounding a requirement away', () => {
  assert.equal(formatAuthoredDuration(HOUR + 27 * 60 + 42), '1 hour 27 minutes 42 seconds');
  assert.equal(formatAuthoredDuration(3 * HOUR + 30 * 60), '3 hours 30 minutes');
  assert.equal(formatAuthoredDuration(90), '1 minute 30 seconds');
  assert.equal(formatAuthoredDuration(2 * HOUR + 1), '2 hours 1 second');
  assert.equal(formatAuthoredDuration(DAY), '24 hours', 'no day unit: the prototype helper has none');
});

test('formatAuthoredDuration localizes the unit words through the injected localize', () => {
  const localize = (key, data) => `${key.split('.').at(-1)}${data ? JSON.stringify(data) : ''}`;
  assert.equal(formatAuthoredDuration(2 * HOUR, { localize }), 'HourMany{"count":2}');
  assert.equal(formatAuthoredDuration(HOUR, { localize }), 'HourOne{"count":1}');
  assert.equal(
    formatAuthoredDuration(HOUR + 90, { localize }),
    'HourOne{"count":1} MinuteOne{"count":1} SecondMany{"count":30}'
  );
});

test('formatAuthoredDuration renders nothing for a non-requirement so callers own the empty copy', () => {
  assert.equal(formatAuthoredDuration(0), '');
  assert.equal(formatAuthoredDuration(-5), '');
  assert.equal(formatAuthoredDuration(NaN), '');
  assert.equal(formatAuthoredDuration(null), '');
});

test('formatRelativeWorldTime labels today / yesterday / N days ago', () => {
  const now = 10 * DAY;
  assert.equal(formatRelativeWorldTime(now, now), 'Today');
  assert.equal(formatRelativeWorldTime(now - 3600, now), 'Today', 'same day');
  assert.equal(formatRelativeWorldTime(now - DAY, now), 'Yesterday');
  assert.equal(formatRelativeWorldTime(now - 4 * DAY, now), '4 days ago');
});

test('formatRelativeWorldTime honors injected labels + calendar day length', () => {
  const labels = { today: 'Hoy', yesterday: 'Ayer', daysAgo: (n) => `hace ${n} dias` };
  const customDay = 36000;
  assert.equal(
    formatRelativeWorldTime(0, 3 * customDay, { secondsPerDay: customDay, labels }),
    'hace 3 dias'
  );
  assert.equal(formatRelativeWorldTime(5, 5, { labels }), 'Hoy');
  assert.equal(formatRelativeWorldTime(NaN, 5), '', 'non-finite input → empty');
});
