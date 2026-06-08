import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  secondsPerDayFromCalendar,
  secondsPerWeekFromCalendar,
  secondsPerUnitFromCalendar
} from '../src/systems/foundryCalendar.js';

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
});
