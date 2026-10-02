/** The essence pool's surplus per essence (issue 1518). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { essenceOvershoots } from '../src/ui/svelte/apps/crafting/detail/essenceOvershoot.js';

const radiant = (overrides = {}) => ({
  groupId: 'g-radiant',
  essenceId: 'radiant',
  name: 'Radiant',
  need: 4,
  delivered: 4,
  ...overrides,
});

const carrier = (allocatedUnits, perUnit, itemKey = 'Item.dusk') => ({
  itemKey,
  allocatedUnits,
  perUnit,
});

test('an allocation that delivers exactly the need overshoots nothing', () => {
  assert.deepEqual(
    essenceOvershoots({ requirements: [radiant()], carriers: [carrier(2, { radiant: 2 })] }),
    []
  );
});

test('the surplus is read from the carriers, because a requirement caps delivered at its need', () => {
  assert.deepEqual(
    essenceOvershoots({ requirements: [radiant()], carriers: [carrier(3, { radiant: 2 })] }),
    [{ essenceId: 'radiant', name: 'Radiant', amount: 2 }]
  );
});

test('a short allocation is not an overshoot', () => {
  assert.deepEqual(
    essenceOvershoots({
      requirements: [radiant({ delivered: 2 })],
      carriers: [carrier(1, { radiant: 2 })],
    }),
    []
  );
});

test('two requirements for one essence are one threshold, and one line', () => {
  const pool = {
    requirements: [radiant({ need: 2 }), radiant({ groupId: 'g-radiant-2', need: 3 })],
    carriers: [carrier(2, { radiant: 2 }), carrier(1, { radiant: 2, shadow: 1 }, 'Item.moss')],
  };
  assert.deepEqual(essenceOvershoots(pool), [{ essenceId: 'radiant', name: 'Radiant', amount: 1 }]);
});

test('an essence no requirement asks for is never reported', () => {
  const pool = { requirements: [radiant()], carriers: [carrier(2, { radiant: 2, shadow: 5 })] };
  assert.deepEqual(essenceOvershoots(pool), []);
});

test('an unnamed requirement is named by its id, and a missing pool reports nothing', () => {
  assert.deepEqual(
    essenceOvershoots({
      requirements: [radiant({ name: '', need: 1 })],
      carriers: [carrier(1, { radiant: 2 })],
    }),
    [{ essenceId: 'radiant', name: 'radiant', amount: 1 }]
  );
  assert.deepEqual(essenceOvershoots(null), []);
});
