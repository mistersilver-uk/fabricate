import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  secondsPerDayFromCalendar,
  secondsPerWeekFromCalendar,
  secondsPerUnitFromCalendar,
  daysPerYearFromCalendar
} from '../src/systems/foundryCalendar.js';
import * as foundryCalendar from '../src/systems/foundryCalendar.js';

describe('foundryCalendar — deriving interval lengths from a world calendar', () => {
  it('reads seconds-per-day from explicit calendar config', () => {
    // 20-hour day → 20 * 60 * 60 = 72000s.
    const cal = { days: { hoursPerDay: 20, minutesPerHour: 60, secondsPerMinute: 60 } };
    assert.equal(secondsPerDayFromCalendar(cal), 72000);
  });

  it('measures seconds-per-day via componentsToTime when config is absent', () => {
    const cal = { componentsToTime: ({ day = 0 }) => day * 50000 };
    assert.equal(secondsPerDayFromCalendar(cal), 50000);
  });

  it('falls back to the Earth day with no calendar or no usable data', () => {
    assert.equal(secondsPerDayFromCalendar(null), 86400);
    assert.equal(secondsPerDayFromCalendar({}), 86400);
    // A throwing componentsToTime is swallowed → Earth day.
    assert.equal(secondsPerDayFromCalendar({ componentsToTime: () => { throw new Error('nope'); } }), 86400);
  });

  it('computes seconds-per-week as weekday-count × day length', () => {
    const cal = { days: { hoursPerDay: 20, minutesPerHour: 60, secondsPerMinute: 60, values: [0, 1, 2, 3, 4] } };
    // 5-day week × 72000s = 360000s.
    assert.equal(secondsPerWeekFromCalendar(cal), 360000);
  });

  it('falls back to a 7-day week when the calendar has no week concept', () => {
    const cal = { days: { hoursPerDay: 20, minutesPerHour: 60, secondsPerMinute: 60 } };
    assert.equal(secondsPerWeekFromCalendar(cal), 7 * 72000);
    assert.equal(secondsPerWeekFromCalendar(null), 604800);
  });

  it('secondsPerUnitFromCalendar fixes minutes/hours and varies days/weeks', () => {
    const cal = { days: { hoursPerDay: 20, minutesPerHour: 60, secondsPerMinute: 60, values: [0, 1, 2, 3, 4] } };
    // Minutes/hours are universal regardless of the calendar.
    assert.equal(secondsPerUnitFromCalendar('minutes', cal), 60);
    assert.equal(secondsPerUnitFromCalendar('hours', cal), 3600);
    assert.equal(secondsPerUnitFromCalendar('days', cal), 72000);
    assert.equal(secondsPerUnitFromCalendar('weeks', cal), 360000);
  });

  it('secondsPerUnitFromCalendar reproduces the Earth table with no calendar', () => {
    assert.equal(secondsPerUnitFromCalendar('minutes', null), 60);
    assert.equal(secondsPerUnitFromCalendar('hours', null), 3600);
    assert.equal(secondsPerUnitFromCalendar('days', null), 86400);
    assert.equal(secondsPerUnitFromCalendar('weeks', null), 604800);
  });

  it('daysPerYearFromCalendar prefers explicit days.daysPerYear config', () => {
    assert.equal(daysPerYearFromCalendar({ days: { daysPerYear: 360 } }), 360);
  });

  it('daysPerYearFromCalendar sums month day counts when no explicit config', () => {
    const cal = { months: { values: [{ days: 30 }, { days: 31 }, { days: 28 }] } };
    assert.equal(daysPerYearFromCalendar(cal), 89);
  });

  it('daysPerYearFromCalendar returns null when neither source is resolvable', () => {
    assert.equal(daysPerYearFromCalendar(null), null);
    assert.equal(daysPerYearFromCalendar({}), null);
    assert.equal(daysPerYearFromCalendar({ days: { daysPerYear: 0 } }), null);
    assert.equal(daysPerYearFromCalendar({ months: { values: [] } }), null);
  });
});

// The time-of-day bar's calendar hour (issue 2431), unlike the fixed 3,600-second regen hour.
describe('foundryCalendar — the hours of a calendar day', () => {
  const hoursPerDay = (calendar) => foundryCalendar.hoursPerDayFromCalendar?.(calendar);
  const minutesPerHour = (calendar) => foundryCalendar.minutesPerHourFromCalendar?.(calendar);

  it('reads hoursPerDay and minutesPerHour from explicit calendar config', () => {
    const cal = { days: { hoursPerDay: 10, minutesPerHour: 100, secondsPerMinute: 100 } };
    assert.equal(hoursPerDay(cal), 10);
    assert.equal(minutesPerHour(cal), 100);
  });

  it('derives hoursPerDay from a measured day when it divides into whole hours', () => {
    const measuredDay = (seconds, days) => ({
      days,
      componentsToTime: ({ day = 0 }) => day * seconds,
    });
    assert.equal(hoursPerDay(measuredDay(72_000, {})), 20);
    const shortHours = { minutesPerHour: 50, secondsPerMinute: 60 };
    assert.equal(hoursPerDay(measuredDay(90_000, shortHours)), 30);
    assert.equal(hoursPerDay(measuredDay(5000, {})), 24, 'a day of no whole hours falls back');
  });

  it('keeps an authored non-whole or falls back on a non-positive hoursPerDay', () => {
    assert.equal(hoursPerDay({ days: { hoursPerDay: 10.5 } }), 10.5);
    assert.equal(hoursPerDay({ days: { hoursPerDay: 0 } }), 24);
    assert.equal(hoursPerDay({ days: { hoursPerDay: -4 } }), 24);
  });

  it('falls back to 24 hours of 60 minutes with no usable calendar', () => {
    for (const cal of [null, undefined, {}, { days: {} }]) {
      assert.equal(hoursPerDay(cal), 24);
      assert.equal(minutesPerHour(cal), 60);
    }
    assert.equal(minutesPerHour({ days: { minutesPerHour: 0 } }), 60);
  });
});
