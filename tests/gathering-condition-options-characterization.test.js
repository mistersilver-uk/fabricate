/**
 * Frozen characterization of the two condition-option normalizers (issue 2431): the manager
 * store's and the gathering service's, which already diverge and are moved, never merged. Read
 * only through public seams, so the extraction proves itself by leaving this file unchanged.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { get } from 'svelte/store';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';

import { createServices, makeSystem } from './helpers/adminStoreServices.js';

const RAW = Object.freeze({
  vocabularies: { weather: ['Clear', { id: 'rain' }], timeOfDay: 'dawn,dusk' },
  systems: {
    sys1: {
      conditions: {
        weather: {
          enabled: true,
          current: 'Acid Rain',
          values: [
            'acid rain',
            'Ash Fall',
            { id: 'Clear', label: '', icon: '' },
            { value: 'fog bank', label: ' Fog Bank ', icon: 'fa-solid fa-smog extra' },
            { label: 'Gale', icon: 'fa-wind' },
            { id: 'acid-rain', label: 'Duplicate' },
            '',
            null,
            { id: '' },
          ],
        },
        timeOfDay: {
          enabled: true,
          current: 'nowhere',
          values: [
            'dawn',
            { id: 'night', label: 'Night', icon: 'far fa-moon' },
            { id: 'witching-hour', icon: 'fab fa-ghost' },
            'XY',
            { id: 'dusk', icon: 'not-an-icon' },
          ],
        },
      },
    },
    sys2: {
      conditions: { weather: { values: 'rain, snow' }, timeOfDay: { enabled: false, values: [] } },
    },
    sys3: {},
  },
});

const option = (id, label, icon) => ({ id, label, icon });

function conditionsOf(config) {
  return {
    vocabularies: {
      weather: config.vocabularies.weather,
      timeOfDay: config.vocabularies.timeOfDay,
    },
    systems: Object.fromEntries(
      Object.entries(config.systems).map(([id, system]) => [id, system.conditions])
    ),
  };
}

function storeOver(gatheringConfig) {
  const settings = { gatheringConfig, lastManagedCraftingSystem: 'sys1' };
  const system = makeSystem({ features: { gathering: true } });
  return { store: createAdminStore(createServices(system, [], [], { settings })), settings };
}

describe('the manager store condition-option normalizer', () => {
  it('normalizes ids, labels and icons, splitting a comma list', () => {
    const { store } = storeOver(structuredClone(RAW));
    assert.deepStrictEqual(conditionsOf(get(store.viewState).gatheringConfig), {
      vocabularies: {
        weather: [
          option('clear', 'Clear', 'fas fa-sun'),
          option('rain', 'Rain', 'fas fa-mortar-pestle'),
        ],
        timeOfDay: [
          option('dawn', 'Dawn', 'fas fa-cloud-sun'),
          option('dusk', 'Dusk', 'fas fa-cloud-moon'),
        ],
      },
      systems: {
        sys1: {
          weather: {
            enabled: true,
            current: 'acid-rain',
            values: [
              option('acid-rain', 'Acid Rain', 'fas fa-cloud-sun'),
              option('ash-fall', 'Ash Fall', 'fas fa-cloud-sun'),
              option('clear', 'Clear', 'fas fa-mortar-pestle'),
              option('fog-bank', 'Fog Bank', 'fas fa-smog'),
              option('gale', 'Gale', 'fas fa-wind'),
            ],
          },
          timeOfDay: {
            enabled: true,
            current: 'dawn',
            values: [
              option('dawn', 'Dawn', 'fas fa-cloud-sun'),
              option('night', 'Night', 'far fa-moon'),
              option('witching-hour', 'Witching Hour', 'fab fa-ghost'),
              option('xy', 'XY', 'fas fa-clock'),
              option('dusk', 'Dusk', 'fas fa-mortar-pestle'),
            ],
          },
        },
        sys2: {
          weather: {
            enabled: true,
            current: 'rain',
            values: [
              option('rain', 'Rain', 'fas fa-cloud-rain'),
              option('snow', 'Snow', 'fas fa-snowflake'),
            ],
          },
          timeOfDay: { enabled: false, current: 'day', values: [] },
        },
        sys3: {
          weather: {
            enabled: true,
            current: 'clear',
            values: [
              option('clear', 'Clear', 'fas fa-sun'),
              option('rain', 'Rain', 'fas fa-mortar-pestle'),
            ],
          },
          timeOfDay: {
            enabled: true,
            current: 'dawn',
            values: [
              option('dawn', 'Dawn', 'fas fa-cloud-sun'),
              option('dusk', 'Dusk', 'fas fa-cloud-moon'),
            ],
          },
        },
      },
    });
  });

  it('adds a value through the option normalizer, refusing a blank or an unknown kind', async () => {
    const { store, settings } = storeOver({
      systems: { sys1: { conditions: { timeOfDay: { values: ['dawn', 'night'] } } } },
    });
    assert.equal(
      await store.addGatheringConditionValue(
        'timeOfDay',
        { label: 'Witching Hour', icon: 'fa-solid fa-ghost' },
        'sys1'
      ),
      true
    );
    assert.equal(await store.addGatheringConditionValue('timeOfDay', 'high noon', 'sys1'), true);
    assert.equal(
      await store.addGatheringConditionValue('timeOfDay', { label: 'Night', icon: 'x' }, 'sys1'),
      true
    );
    assert.equal(await store.addGatheringConditionValue('timeOfDay', '  ', 'sys1'), false);
    assert.equal(await store.addGatheringConditionValue('fog', 'mist', 'sys1'), false);
    assert.deepStrictEqual(settings.gatheringConfig.systems.sys1.conditions.timeOfDay.values, [
      option('dawn', 'Dawn', 'fas fa-cloud-sun'),
      option('night', 'Night', 'fas fa-moon'),
      option('witching-hour', 'Witching Hour', 'fas fa-ghost'),
      option('high-noon', 'High Noon', 'fas fa-clock'),
    ]);
  });

  it('merges a label and icon update onto one option, keeping its id', async () => {
    const { store, settings } = storeOver({
      systems: { sys1: { conditions: { timeOfDay: { values: ['dawn', 'night'] } } } },
    });
    const update = (valueId, updates) =>
      store.updateGatheringConditionValue('timeOfDay', valueId, updates, 'sys1');
    assert.equal(await update('Night', { label: '  Midnight  ', id: 'other' }), true);
    assert.equal(await update('night', { label: ' \t ' }), true);
    assert.equal(await update('night', { icon: 'fa-regular fa-star' }), true);
    assert.equal(await update('dawn', {}), true);
    assert.equal(await update('nowhere', { label: 'Lost' }), false);
    assert.equal(await update('night', null), false);
    assert.deepStrictEqual(settings.gatheringConfig.systems.sys1.conditions.timeOfDay.values, [
      option('dawn', 'Dawn', 'fas fa-cloud-sun'),
      option('night', 'Midnight', 'far fa-star'),
    ]);
  });
});

describe('the gathering service condition-option normalizer', () => {
  it('normalizes ids, labels and icons, keeping a comma list as one value', () => {
    const service = new GatheringRichStateService({
      getSetting: () => structuredClone(RAW),
      setSetting: async () => {},
    });
    assert.deepStrictEqual(conditionsOf(service._config()), {
      vocabularies: { weather: ['clear', 'rain'], timeOfDay: ['dawn-dusk'] },
      systems: {
        sys1: {
          weather: {
            enabled: true,
            current: 'acid-rain',
            values: [
              option('acid-rain', 'Acid Rain', 'fas fa-cloud-sun'),
              option('ash-fall', 'Ash Fall', 'fas fa-cloud-sun'),
              option('clear', 'Clear', 'fas fa-sun'),
              option('fog-bank', 'Fog Bank', 'fa-solid fa-smog'),
              option('gale', 'Gale', 'fas fa-wind'),
            ],
          },
          timeOfDay: {
            enabled: true,
            current: 'dawn',
            values: [
              option('dawn', 'Dawn', 'fas fa-cloud-sun'),
              option('night', 'Night', 'far fa-moon'),
              option('witching-hour', 'Witching Hour', 'fab fa-ghost'),
              option('xy', 'XY', 'fas fa-clock'),
              option('dusk', 'Dusk', 'fas fa-cloud-moon'),
            ],
          },
        },
        sys2: {
          weather: {
            enabled: true,
            current: 'rain-snow',
            values: [option('rain-snow', 'Rain Snow', 'fas fa-cloud-sun')],
          },
          timeOfDay: { enabled: false, current: 'day', values: [] },
        },
        sys3: {
          weather: {
            enabled: true,
            current: 'clear',
            values: [
              option('clear', 'Clear', 'fas fa-sun'),
              option('rain', 'Rain', 'fas fa-cloud-rain'),
            ],
          },
          timeOfDay: {
            enabled: true,
            current: 'dawn-dusk',
            values: [option('dawn-dusk', 'Dawn Dusk', 'fas fa-clock')],
          },
        },
      },
    });
  });
});
