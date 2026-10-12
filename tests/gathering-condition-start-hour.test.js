/**
 * A time-of-day option's optional `startHour` (issue 2431; gathering-and-harvesting requirements
 * 25 to 27): one shared normalizer, defaults resolved on read and never stored, and the service
 * and manager-store normalizers in parity.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspect } from 'node:util';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import * as serviceOptions from '../src/systems/normalize/gatheringConditionOptions.js';
import * as storeOptions from '../src/ui/svelte/stores/adminGatheringConditionOptions.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';

import { createServices, makeSystem } from './helpers/adminStoreServices.js';

const startHourOf = (option) => (Object.hasOwn(option, 'startHour') ? option.startHour : 'absent');

describe('normalizeTimeOfDayStartHour', () => {
  const cases = [
    [0, 0],
    [8, 8],
    [23, 23],
    [30, 30],
    ['8', 8],
    ['08', 8],
    ['0', 0],
    [null, null],
    [undefined, null],
    ['', null],
    [' ', null],
    [' 8', null],
    ['8.0', null],
    ['1e1', null],
    [true, null],
    [false, null],
    [-1, null],
    [1.5, null],
    [NaN, null],
    [Infinity, null],
    [{}, null],
    [[8], null],
  ];
  for (const [input, expected] of cases) {
    it(`reads ${inspect(input)} as ${expected}`, () => {
      assert.equal(serviceOptions.normalizeTimeOfDayStartHour?.(input), expected);
    });
  }
});

describe('resolveTimeOfDayStartHour', () => {
  it('resolves an authored hour first, then the default id, then nothing', () => {
    const resolve = (option) => serviceOptions.resolveTimeOfDayStartHour?.(option);
    assert.equal(resolve({ id: 'dawn' }), 4);
    assert.equal(resolve({ id: 'day' }), 8);
    assert.equal(resolve({ id: 'dusk' }), 17);
    assert.equal(resolve({ id: 'night' }), 21);
    assert.equal(resolve({ id: 'dawn', startHour: 6 }), 6);
    assert.equal(resolve({ id: 'night', startHour: 0 }), 0, 'midnight is authored, not absent');
    assert.equal(resolve({ id: 'witching-hour' }), null);
    assert.equal(resolve({ id: 'constructor' }), null, 'only the four default ids carry defaults');
    assert.equal(resolve(null), null);
  });
});

const PARITY_VALUES = [
  'dawn',
  { id: 'day', startHour: 8 },
  { id: 'dusk', startHour: '17' },
  { id: 'night', startHour: null },
  { id: 'midnight', startHour: 0 },
  { id: 'witching', startHour: true },
  { id: 'noon', startHour: '' },
  { id: 'late', startHour: -1 },
  { id: 'half', startHour: 1.5 },
];

describe('the service and manager-store normalizers agree on start hours', () => {
  const normalizers = {
    service: (values) => serviceOptions.normalizeConditionOptions('timeOfDay', values),
    store: (values) => storeOptions.normalizeGatheringConditionOptions('timeOfDay', values),
  };
  for (const [name, normalize] of Object.entries(normalizers)) {
    it(`the ${name} normalizer stores only an authored start hour`, () => {
      const options = normalize(PARITY_VALUES);
      assert.deepStrictEqual(
        options.map((option) => [option.id, startHourOf(option)]),
        [
          ['dawn', 'absent'],
          ['day', 8],
          ['dusk', 17],
          ['night', 'absent'],
          ['midnight', 0],
          ['witching', 'absent'],
          ['noon', 'absent'],
          ['late', 'absent'],
          ['half', 'absent'],
        ]
      );
      assert.deepStrictEqual(
        options.map((option) => serviceOptions.resolveTimeOfDayStartHour?.(option)),
        [4, 8, 17, 21, 0, null, null, null, null],
        'defaults are resolved on read'
      );
    });

    it(`the ${name} normalizer never gives a weather option a start hour`, () => {
      const options =
        name === 'service'
          ? serviceOptions.normalizeConditionOptions('weather', [{ id: 'rain', startHour: 3 }])
          : storeOptions.normalizeGatheringConditionOptions('weather', [
              { id: 'rain', startHour: 3 },
            ]);
      assert.equal(startHourOf(options[0]), 'absent');
    });
  }
});

describe('a start hour survives the service', () => {
  it('keeps time-of-day start hours through a config read', () => {
    const service = new GatheringRichStateService({
      getSetting: () => ({
        systems: {
          sys1: {
            conditions: {
              weather: { values: [{ id: 'rain', startHour: 3 }] },
              timeOfDay: { values: [{ id: 'dawn', startHour: 5 }, 'night'] },
            },
          },
        },
      }),
    });
    const { weather, timeOfDay } = service._config().systems.sys1.conditions;
    assert.deepStrictEqual(timeOfDay.values.map(startHourOf), [5, 'absent']);
    assert.deepStrictEqual(weather.values.map(startHourOf), ['absent']);
  });

  it('keeps what the manager authored when the service sets the time of day', async () => {
    const settings = {
      lastManagedCraftingSystem: 'sys1',
      gatheringConfig: {
        systems: {
          sys1: {
            conditions: {
              weather: { values: [{ id: 'rain', startHour: 3 }] },
              timeOfDay: { values: ['dawn', 'day', 'night'] },
            },
          },
        },
      },
    };
    const system = makeSystem({ features: { gathering: true } });
    const store = createAdminStore(createServices(system, [], [], { settings }));
    await store.updateGatheringConditionValue('timeOfDay', 'dawn', { startHour: 5 }, 'sys1');
    await store.addGatheringConditionValue(
      'timeOfDay',
      { label: 'Witching', startHour: 0 },
      'sys1'
    );

    const payloads = [];
    const service = new GatheringRichStateService({
      getSetting: () => structuredClone(settings.gatheringConfig),
      setSetting: async (_key, value) => {
        payloads.push(value);
      },
    });
    await service.setTimeOfDay('day');

    const { weather, timeOfDay } = payloads.at(-1).systems.sys1.conditions;
    assert.equal(timeOfDay.current, 'day');
    assert.deepStrictEqual(
      timeOfDay.values.map((option) => [option.id, startHourOf(option)]),
      [
        ['dawn', 5],
        ['day', 'absent'],
        ['night', 'absent'],
        ['witching', 0],
      ]
    );
    assert.deepStrictEqual(weather.values.map(startHourOf), ['absent']);
  });
});
