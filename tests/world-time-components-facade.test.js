/**
 * `game.fabricate.getWorldTimeComponents` carries the calendar's day shape (issue 2431), so the
 * manager's time-of-day bar reads its hours per day from the same call as the clock.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { journalFacade } from '../src/bootstrap/journalFacade.js';

const previousGame = globalThis.game;

/** The real facade method over a fake V13 calendar and a world clock at `worldTime`. */
function componentsWith(calendar, worldTime = 52_440) {
  Object.assign(globalThis, { game: { time: { calendar } } });
  const facade = Object.assign(Object.create(journalFacade), { getWorldTime: () => worldTime });
  return facade.getWorldTimeComponents();
}

const earthClock = (time) => ({
  hour: Math.floor(time / 3600) % 24,
  minute: Math.floor(time / 60) % 60,
});

describe('getWorldTimeComponents', () => {
  afterEach(() => {
    Object.assign(globalThis, { game: previousGame });
  });

  it('carries the calendar hours per day and minutes per hour', () => {
    const components = componentsWith({
      days: { hoursPerDay: 10, minutesPerHour: 100, secondsPerMinute: 100 },
      timeToComponents: () => ({ hour: 5, minute: 24 }),
    });
    assert.deepStrictEqual(
      { ...components },
      { hour: 5, minute: 24, hoursPerDay: 10, minutesPerHour: 100 }
    );
  });

  it('reads 24 hours of 60 minutes from a calendar with no days config', () => {
    const components = componentsWith({ timeToComponents: earthClock });
    assert.equal(components.hour, 14);
    assert.equal(components.minute, 34);
    assert.equal(components.hoursPerDay, 24);
    assert.equal(components.minutesPerHour, 60);
  });

  it('answers null with no calendar to read', () => {
    assert.equal(componentsWith(null), null);
    assert.equal(componentsWith({ days: { hoursPerDay: 10 } }), null);
  });
});
