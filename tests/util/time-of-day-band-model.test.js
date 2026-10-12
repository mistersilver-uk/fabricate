/**
 * The time-of-day bar's pure model, `environment/timeOfDayBandModel.js` (issue 2431): the rotated
 * day, the tiling verdict, the clock and current markers, the rail seeds and the add default.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeConditionOptions,
  resolveTimeOfDayStartHour,
} from '../../src/systems/normalize/gatheringConditionOptions.js';
import {
  TIME_OF_DAY_TAGS,
  addStartDefault,
  dayLengthOf,
  hourText,
  parseHourText,
  timeOfDayBar,
  timeOfDayTint,
  unrotateHour,
} from '../../src/ui/svelte/apps/manager/environment/timeOfDayBandModel.js';
import { normalizeGatheringConditionOptions } from '../../src/ui/svelte/stores/adminGatheringConditionOptions.js';

const DEFAULTS = [
  { id: 'dawn', label: 'Dawn' },
  { id: 'day', label: 'Day' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'night', label: 'Night' },
];

const at = (hour, minute = 0, extra = {}) => ({ hour, minute, ...extra });
const bandRows = (bar) => bar.bands.map((band) => [band.id, band.from, band.start, band.end]);

describe('the time-of-day bar model (issue 2431)', () => {
  it('rotates the day to start at the first-listed period and tiles it in day order', () => {
    const bar = timeOfDayBar({ values: DEFAULTS, current: 'day', components: at(14, 34) });
    assert.equal(bar.status, 'bar');
    assert.deepEqual([bar.min, bar.max, bar.hoursPerDay], [4, 28, 24]);
    assert.deepEqual(bandRows(bar), [
      ['dawn', 4, 4, 8],
      ['day', 8, 8, 17],
      ['dusk', 17, 17, 21],
      ['night', 21, 21, 4],
    ]);
    assert.deepEqual(
      bar.bands.map((band) => band.index),
      [0, 1, 2, 3]
    );
  });

  it('draws the clock at hour plus minute over the calendar hour, and the current at its centre', () => {
    const bar = timeOfDayBar({ values: DEFAULTS, current: 'day', components: at(14, 34) });
    assert.ok(Math.abs(bar.clock - (14 + 34 / 60)) < 1e-9);
    assert.equal(bar.clockText, '14:34');
    assert.equal(bar.current, 12.5);
    const longHour = timeOfDayBar({
      values: DEFAULTS,
      current: 'day',
      components: at(14, 50, { minutesPerHour: 100 }),
    });
    assert.equal(longHour.clock, 14.5);
  });

  it('shifts a clock below the first start by a day (d)', () => {
    const bar = timeOfDayBar({ values: DEFAULTS, current: 'day', components: at(2, 30) });
    assert.equal(bar.clock, 26.5);
  });

  it('places the authored-first period at the axis start, wherever it falls in the day', () => {
    const values = [DEFAULTS[2], DEFAULTS[0], DEFAULTS[3], DEFAULTS[1]];
    const bar = timeOfDayBar({ values, current: 'night', components: null });
    assert.deepEqual([bar.min, bar.max], [17, 41]);
    assert.deepEqual(bandRows(bar), [
      ['dusk', 17, 17, 21],
      ['night', 21, 21, 4],
      ['dawn', 28, 4, 8],
      ['day', 32, 8, 17],
    ]);
    assert.deepEqual(
      bar.bands.map((band) => band.index),
      [0, 2, 1, 3]
    );
    assert.equal(bar.current, 24.5);
  });

  it('falls back on duplicate start hours, naming each period that shares one (a)', () => {
    const values = [...DEFAULTS.slice(0, 3), { id: 'night', label: 'Night', startHour: 8 }];
    const bar = timeOfDayBar({ values, current: 'day', components: null });
    assert.equal(bar.status, 'fallback');
    assert.deepEqual(bar.unplaced, ['Day', 'Night']);
    assert.deepEqual(bar.bands, []);
  });

  it('takes defaults for known ids, bare strings included, and falls back on a custom id with no hour (b)', () => {
    const bare = timeOfDayBar({
      values: ['dawn', 'day', 'night'],
      current: 'day',
      components: null,
    });
    assert.equal(bare.status, 'bar');
    assert.deepEqual(
      bare.bands.map((band) => [band.id, band.start]),
      [
        ['dawn', 4],
        ['day', 8],
        ['night', 21],
      ]
    );
    const custom = timeOfDayBar({
      values: [...DEFAULTS, { id: 'witching-hour', label: 'Witching Hour' }],
      current: 'day',
      components: null,
    });
    assert.equal(custom.status, 'fallback');
    assert.deepEqual(custom.unplaced, ['Witching Hour']);
  });

  it('falls back on a short day, tiles a long one, and refuses a day that is not a whole count (c)', () => {
    const short = timeOfDayBar({
      values: DEFAULTS,
      current: 'day',
      components: at(3, 0, { hoursPerDay: 10 }),
    });
    assert.equal(short.status, 'fallback');
    assert.deepEqual(short.unplaced, ['Dusk', 'Night']);
    assert.equal(short.hoursPerDay, 10);

    const long = timeOfDayBar({
      values: DEFAULTS,
      current: 'day',
      components: at(3, 0, { hoursPerDay: 30 }),
    });
    assert.equal(long.status, 'bar');
    assert.deepEqual([long.min, long.max], [4, 34]);
    assert.deepEqual(long.bands.at(-1).end, 4);

    for (const hoursPerDay of [0, -24, 23.5, NaN]) {
      const odd = timeOfDayBar({
        values: DEFAULTS,
        current: 'day',
        components: at(3, 0, { hoursPerDay }),
      });
      assert.equal(odd.status, 'fallback', `hoursPerDay ${hoursPerDay}`);
      assert.deepEqual(odd.unplaced, ['Dawn', 'Day', 'Dusk', 'Night']);
    }
    assert.equal(dayLengthOf(null), 24, 'no components means a 24-hour day');
    assert.equal(dayLengthOf({ hour: 1 }), 24, 'and so does components with no day shape');
  });

  it('un-rotates a value to its clock hour modulo the day (e)', () => {
    assert.equal(unrotateHour(27, 24), 3);
    assert.equal(unrotateHour(24, 24), 0);
    assert.equal(unrotateHour(8, 24), 8);
  });

  it('seeds each rail at the band midpoint rounded down, wrapping, and only two steps wide (f)', () => {
    const bar = timeOfDayBar({ values: DEFAULTS, current: 'day', components: null });
    assert.deepEqual(
      bar.bands.map((band) => [band.id, band.seed]),
      [
        ['dawn', 6],
        ['day', 12],
        ['dusk', 19],
        ['night', 0],
      ]
    );
    const narrow = timeOfDayBar({
      values: [
        { id: 'a', label: 'A', startHour: 4 },
        { id: 'b', label: 'B', startHour: 6 },
        { id: 'c', label: 'C', startHour: 7 },
      ],
      current: 'a',
      components: null,
    });
    assert.deepEqual(
      narrow.bands.map((band) => [band.id, band.seed]),
      [
        ['a', 5],
        ['b', null],
        ['c', 15],
      ]
    );
  });

  it('reorders bands by start hour while each keeps its authored index (g)', () => {
    const values = [
      { id: 'dawn', label: 'Dawn' },
      { id: 'day', label: 'Day', startHour: 22 },
      { id: 'dusk', label: 'Dusk' },
      { id: 'night', label: 'Night' },
    ];
    const bar = timeOfDayBar({ values, current: 'day', components: null });
    assert.deepEqual(
      bar.bands.map((band) => [band.id, band.index]),
      [
        ['dawn', 0],
        ['dusk', 2],
        ['night', 3],
        ['day', 1],
      ]
    );
  });

  it('re-anchors on the new first period when the first is deleted, the previous taking its hours (h)', () => {
    const bar = timeOfDayBar({ values: DEFAULTS.slice(1), current: 'day', components: null });
    assert.deepEqual([bar.min, bar.max], [8, 32]);
    assert.deepEqual(bar.bands.at(-1).end, 8, 'night runs on through the deleted dawn');
  });

  it('draws no current marker for a current id that is not a value (i), and no clock without a reading (j)', () => {
    const bar = timeOfDayBar({ values: DEFAULTS, current: 'noon', components: null });
    assert.equal(bar.current, null);
    assert.equal(bar.clock, null);
    assert.equal(timeOfDayBar({ values: DEFAULTS, current: 'day', components: {} }).clock, null);
  });

  it('draws nothing for no periods, and one band with a centred seed for one (o)', () => {
    assert.equal(timeOfDayBar({ values: [], current: '', components: null }).status, 'empty');
    const one = timeOfDayBar({ values: [DEFAULTS[1]], current: 'day', components: null });
    assert.equal(one.status, 'bar');
    assert.deepEqual(bandRows(one), [['day', 8, 8, 8]]);
    assert.equal(one.bands[0].seed, 20);
    assert.equal(one.current, 20);
  });

  it('seeds a plain add at the longest period`s midpoint, the first in day order on a tie', () => {
    assert.equal(addStartDefault({ values: DEFAULTS, components: null }), 12);
    const tie = [
      { id: 'a', label: 'A', startHour: 0 },
      { id: 'b', label: 'B', startHour: 12 },
    ];
    assert.equal(addStartDefault({ values: tie, components: null }), 6);
    assert.equal(addStartDefault({ values: [...DEFAULTS, 'witching'], components: null }), null);
    assert.equal(addStartDefault({ values: [], components: null }), null);
  });

  it('formats and parses whole clock hours', () => {
    assert.equal(hourText(4), '04:00');
    assert.equal(hourText(0), '00:00');
    assert.equal(parseHourText('07:00'), 7);
    assert.equal(parseHourText('7'), 7);
    assert.equal(parseHourText('13:30'), 13);
    assert.ok(Number.isNaN(parseHourText('dusk')));
  });

  it('tints by authored index over the tag palette in the drawing`s order, inked in --fab-text', () => {
    assert.deepEqual(TIME_OF_DAY_TAGS, [
      'mist',
      'butter',
      'peach',
      'lavender',
      'sage',
      'rose',
      'aqua',
      'mauve',
    ]);
    assert.deepEqual(timeOfDayTint(9), {
      color: 'color-mix(in oklab, var(--fab-tag-butter) 24%, var(--fab-bg-0))',
      ink: 'var(--fab-text)',
    });
    const bar = timeOfDayBar({ values: DEFAULTS, current: 'day', components: null });
    assert.deepEqual(
      bar.bands.map((band) => band.color),
      [0, 1, 2, 3].map((index) => timeOfDayTint(index).color)
    );
  });

  it('agrees with the service and store normalizers on every start hour it reads', () => {
    const raw = [
      { id: 'dawn', label: 'Dawn', startHour: '5' },
      { id: 'day', label: 'Day', startHour: null },
      { id: 'dusk', label: 'Dusk', startHour: '' },
      { id: 'night', label: 'Night', startHour: 0 },
      { id: 'vigil', label: 'Vigil', startHour: true },
    ];
    const service = normalizeConditionOptions('timeOfDay', raw);
    const store = normalizeGatheringConditionOptions('timeOfDay', raw);
    const resolved = (options) => options.map((option) => resolveTimeOfDayStartHour(option));
    assert.deepEqual(resolved(service), [5, 8, 17, 0, null]);
    assert.deepEqual(resolved(store), resolved(service));
    assert.deepEqual(
      service.map((option) => option.startHour),
      [5, undefined, undefined, 0, undefined],
      'defaults are resolved on read, never stored'
    );
    const bar = timeOfDayBar({ values: store.slice(0, 4), current: 'day', components: null });
    assert.deepEqual(
      bar.bands.map((band) => [band.id, band.start]),
      [
        ['dawn', 5],
        ['day', 8],
        ['dusk', 17],
        ['night', 0],
      ]
    );
  });
});
