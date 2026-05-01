/**
 * Tests for T-014: Stale Preferences Cleanup
 *
 * Pure unit tests — no FoundryVTT globals required.
 * Uses injectable getSetting/setSetting mocks.
 *
 * Group 1: lastManagedCraftingSystem validation (3 tests)
 * Group 2: lastGatheringActor cleanup (3 tests)
 * Group 3: Progressive-order preferences cleanup (3 tests)
 * Group 4: Combined behaviour (2 tests)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupStalePreferences,
  isGatheringActorSelectableByUser
} from '../src/config/preferencesCleanup.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries({
    lastGatheringActor: '',
    lastManagedCraftingSystem: '',
    progressiveResultOrder: {},
    ...initial
  }));
  const calls = { get: [], set: [] };

  function getSetting(key) {
    calls.get.push(key);
    return store.get(key) ?? null;
  }

  async function setSetting(key, value) {
    calls.set.push({ key, value });
    store.set(key, value);
    return value;
  }

  return { store, calls, getSetting, setSetting };
}

function makeGatheringActorResolvers({ actorsById = {}, selectableActorIds = [] } = {}) {
  const selectable = new Set(selectableActorIds);

  return {
    resolveGatheringActor: (actorId) => actorsById[actorId] ?? null,
    isSelectableGatheringActor: (actor) => selectable.has(actor?.id)
  };
}

// ---------------------------------------------------------------------------
// Group 1: lastManagedCraftingSystem validation
// ---------------------------------------------------------------------------

test('resets lastManagedCraftingSystem to empty when it references a missing system', async () => {
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastManagedCraftingSystem: 'system-gone'
  });

  await cleanupStalePreferences(new Set(), new Set(), getSetting, setSetting);

  assert.equal(store.get('lastManagedCraftingSystem'), '');
  const setCall = calls.set.find(c => c.key === 'lastManagedCraftingSystem');
  assert.ok(setCall, 'setSetting should be called for lastManagedCraftingSystem');
  assert.equal(setCall.value, '');
});

test('leaves lastManagedCraftingSystem unchanged when it references a valid system', async () => {
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastManagedCraftingSystem: 'system-a'
  });

  await cleanupStalePreferences(new Set(['system-a', 'system-b']), new Set(), getSetting, setSetting);

  assert.equal(store.get('lastManagedCraftingSystem'), 'system-a');
  const setCall = calls.set.find(c => c.key === 'lastManagedCraftingSystem');
  assert.equal(setCall, undefined, 'setSetting should NOT be called when value is valid');
});

test('leaves lastManagedCraftingSystem unchanged when it is already empty', async () => {
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastManagedCraftingSystem: ''
  });

  await cleanupStalePreferences(new Set(), new Set(), getSetting, setSetting);

  assert.equal(store.get('lastManagedCraftingSystem'), '');
  const setCall = calls.set.find(c => c.key === 'lastManagedCraftingSystem');
  assert.equal(setCall, undefined, 'setSetting should NOT be called when value is already empty');
});

// ---------------------------------------------------------------------------
// Group 2: lastGatheringActor cleanup
// ---------------------------------------------------------------------------

test('resets lastGatheringActor when the remembered actor no longer resolves', async () => {
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastGatheringActor: 'actor-gone'
  });

  await cleanupStalePreferences(
    new Set(),
    new Set(),
    getSetting,
    setSetting,
    makeGatheringActorResolvers()
  );

  assert.equal(store.get('lastGatheringActor'), '');
  const setCall = calls.set.find(c => c.key === 'lastGatheringActor');
  assert.ok(setCall, 'setSetting should be called for lastGatheringActor');
  assert.equal(setCall.value, '');
});

test('resets lastGatheringActor when the remembered actor is no longer selectable', async () => {
  const rememberedActor = { id: 'actor-1', name: 'Gatherer' };
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastGatheringActor: rememberedActor.id
  });

  await cleanupStalePreferences(
    new Set(),
    new Set(),
    getSetting,
    setSetting,
    makeGatheringActorResolvers({
      actorsById: { [rememberedActor.id]: rememberedActor },
      selectableActorIds: []
    })
  );

  assert.equal(store.get('lastGatheringActor'), '');
  const setCall = calls.set.find(c => c.key === 'lastGatheringActor');
  assert.ok(setCall, 'setSetting should be called for an unselectable remembered actor');
  assert.equal(setCall.value, '');
});

test('preserves lastGatheringActor when the remembered actor still resolves and is selectable', async () => {
  const rememberedActor = { id: 'actor-1', name: 'Gatherer' };
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastGatheringActor: rememberedActor.id
  });

  await cleanupStalePreferences(
    new Set(),
    new Set(),
    getSetting,
    setSetting,
    makeGatheringActorResolvers({
      actorsById: { [rememberedActor.id]: rememberedActor },
      selectableActorIds: [rememberedActor.id]
    })
  );

  assert.equal(store.get('lastGatheringActor'), rememberedActor.id);
  const setCall = calls.set.find(c => c.key === 'lastGatheringActor');
  assert.equal(setCall, undefined, 'setSetting should not be called for a valid remembered actor');
});

test('preserves lastGatheringActor when cleanup runs without gathering actor resolver options', async () => {
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastGatheringActor: 'actor-1',
    lastManagedCraftingSystem: 'dead-system'
  });

  await cleanupStalePreferences(
    new Set(),
    new Set(),
    getSetting,
    setSetting
  );

  assert.equal(store.get('lastGatheringActor'), 'actor-1');
  assert.equal(store.get('lastManagedCraftingSystem'), '');
  assert.equal(
    calls.set.find(c => c.key === 'lastGatheringActor'),
    undefined,
    'setSetting should not be called for lastGatheringActor without resolver seams'
  );
  assert.ok(
    calls.set.find(c => c.key === 'lastManagedCraftingSystem'),
    'stale system cleanup should still run'
  );
});

test('gathering actor selectability is based on actor existence and ownership only', () => {
  assert.equal(isGatheringActorSelectableByUser(null, { isGM: true }), false);
  assert.equal(isGatheringActorSelectableByUser({ id: 'npc-1', type: 'npc' }, { isGM: true }), true);
  assert.equal(isGatheringActorSelectableByUser({ id: 'group-1', type: 'group', isOwner: true }, { isGM: false }), true);
  assert.equal(
    isGatheringActorSelectableByUser({
      id: 'npc-2',
      type: 'npc',
      testUserPermission: (_user, permission) => permission === 'OWNER'
    }, { isGM: false }),
    true
  );
  assert.equal(isGatheringActorSelectableByUser({ id: 'actor-1', type: 'character' }, { isGM: false }), false);
});

// ---------------------------------------------------------------------------
// Group 3: Progressive-order preferences cleanup
// ---------------------------------------------------------------------------

test('removes progressive-order entries for missing recipes', async () => {
  const { store, getSetting, setSetting } = makeSettings({
    progressiveResultOrder: {
      'recipe-gone': ['r1', 'r2'],
      'recipe-valid': ['r3', 'r4']
    }
  });

  await cleanupStalePreferences(new Set(), new Set(['recipe-valid']), getSetting, setSetting);

  const result = store.get('progressiveResultOrder');
  assert.deepEqual(result, { 'recipe-valid': ['r3', 'r4'] });
});

test('retains all progressive-order entries when all recipes are valid', async () => {
  const order = { 'recipe-a': ['r1'], 'recipe-b': ['r2', 'r3'] };
  const { store, calls, getSetting, setSetting } = makeSettings({
    progressiveResultOrder: order
  });

  await cleanupStalePreferences(new Set(), new Set(['recipe-a', 'recipe-b']), getSetting, setSetting);

  assert.deepEqual(store.get('progressiveResultOrder'), order);
  const setCall = calls.set.find(c => c.key === 'progressiveResultOrder');
  assert.equal(setCall, undefined, 'setSetting should NOT be called when no entries need removal');
});

test('does not call setSetting for progressiveResultOrder when no entries need removal', async () => {
  const { calls, getSetting, setSetting } = makeSettings({
    progressiveResultOrder: { 'recipe-x': [0, 1] }
  });

  await cleanupStalePreferences(new Set(), new Set(['recipe-x']), getSetting, setSetting);

  const setKeys = calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('progressiveResultOrder'), 'setSetting should not be called for progressiveResultOrder');
});

// ---------------------------------------------------------------------------
// Group 4: Combined behaviour
// ---------------------------------------------------------------------------

test('cleans both stale system and stale recipe preferences in one call', async () => {
  const { store, calls, getSetting, setSetting } = makeSettings({
    lastManagedCraftingSystem: 'dead-system',
    progressiveResultOrder: {
      'dead-recipe': [0, 1],
      'live-recipe': [1, 0]
    }
  });

  await cleanupStalePreferences(
    new Set(['live-system']),
    new Set(['live-recipe']),
    getSetting,
    setSetting
  );

  assert.equal(store.get('lastManagedCraftingSystem'), '');
  assert.deepEqual(store.get('progressiveResultOrder'), { 'live-recipe': [1, 0] });

  const setKeys = calls.set.map(c => c.key);
  assert.ok(setKeys.includes('lastManagedCraftingSystem'));
  assert.ok(setKeys.includes('progressiveResultOrder'));
});

test('does nothing when all preferences are valid — no setSetting calls for either', async () => {
  const { calls, getSetting, setSetting } = makeSettings({
    lastManagedCraftingSystem: 'system-1',
    progressiveResultOrder: { 'recipe-1': [0, 1] }
  });

  await cleanupStalePreferences(
    new Set(['system-1']),
    new Set(['recipe-1']),
    getSetting,
    setSetting
  );

  assert.equal(calls.set.length, 0, 'setSetting should not be called at all when all preferences are valid');
});
