/**
 * The manager store authors a time-of-day option's `startHour` (issue 2431): an add carries it, an
 * update sets or clears it, and weather options never take one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from '../helpers/adminStoreServices.js';

function storeWithConditions() {
  const settings = {
    lastManagedCraftingSystem: 'sys1',
    gatheringConfig: {
      systems: {
        sys1: {
          conditions: {
            weather: { values: ['rain'] },
            timeOfDay: { values: ['dawn', 'day', { id: 'night', startHour: 22 }] },
          },
        },
      },
    },
  };
  const system = makeSystem({ features: { gathering: true } });
  const store = createAdminStore(createServices(system, [], [], { settings }));
  const values = (kind) => settings.gatheringConfig.systems.sys1.conditions[kind].values;
  return { store, values };
}

const startHours = (options) =>
  options.map((option) => [option.id, Object.hasOwn(option, 'startHour') ? option.startHour : '-']);

describe('the manager store authors time-of-day start hours', () => {
  it('adds a time of day with its start hour, midnight included', async () => {
    const { store, values } = storeWithConditions();
    const add = (value) => store.addGatheringConditionValue('timeOfDay', value, 'sys1');
    assert.equal(await add({ label: 'Witching Hour', icon: 'fas fa-ghost', startHour: 2 }), true);
    assert.equal(await add({ label: 'Midnight', startHour: 0 }), true);
    assert.equal(await add({ label: 'Vesper', startHour: null }), true);
    assert.deepStrictEqual(startHours(values('timeOfDay')), [
      ['dawn', '-'],
      ['day', '-'],
      ['night', 22],
      ['witching-hour', 2],
      ['midnight', 0],
      ['vesper', '-'],
    ]);
  });

  it('sets, keeps and clears a start hour through an update', async () => {
    const { store, values } = storeWithConditions();
    const update = (id, updates) =>
      store.updateGatheringConditionValue('timeOfDay', id, updates, 'sys1');
    assert.equal(await update('dawn', { startHour: 6 }), true);
    assert.equal(await update('dawn', { label: 'Sunrise' }), true);
    assert.equal(await update('day', { startHour: '9' }), true);
    assert.equal(await update('night', { startHour: null }), true);
    assert.deepStrictEqual(startHours(values('timeOfDay')), [
      ['dawn', 6],
      ['day', 9],
      ['night', '-'],
    ]);
    assert.equal(values('timeOfDay')[0].label, 'Sunrise');
  });

  it('never stores a default start hour or a weather start hour', async () => {
    const { store, values } = storeWithConditions();
    await store.addGatheringConditionValue('weather', { label: 'Ash', startHour: 3 }, 'sys1');
    await store.updateGatheringConditionValue('weather', 'rain', { startHour: 4 }, 'sys1');
    assert.deepStrictEqual(startHours(values('weather')), [
      ['rain', '-'],
      ['ash', '-'],
    ]);
    assert.deepStrictEqual(startHours(values('timeOfDay')), [
      ['dawn', '-'],
      ['day', '-'],
      ['night', 22],
    ]);
  });
});
