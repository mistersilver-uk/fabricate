import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HAZARD_SCENE_SOCKET,
  collectLinkedHazardScenes,
  createHazardSceneTrigger,
  routeHazardSceneSocketMessage
} from '../src/systems/hazardSceneCoordinator.js';

test('socket channel is the fabricate module channel', () => {
  assert.equal(HAZARD_SCENE_SOCKET, 'module.fabricate');
});

test('collectLinkedHazardScenes keeps only linked hazards and dedupes by scene', () => {
  const result = collectLinkedHazardScenes([
    { name: 'Cave-in', linkedSceneUuid: 'Scene.a' },
    { name: 'No link' },
    { name: 'Empty', linkedSceneUuid: '' },
    { name: 'Dup', linkedSceneUuid: 'Scene.a' },
    { name: 'Storm', linkedSceneUuid: 'Scene.b' }
  ]);
  assert.deepEqual(result, [
    { sceneUuid: 'Scene.a', hazardName: 'Cave-in' },
    { sceneUuid: 'Scene.b', hazardName: 'Storm' }
  ]);
});

test('collectLinkedHazardScenes tolerates non-array input', () => {
  assert.deepEqual(collectLinkedHazardScenes(undefined), []);
  assert.deepEqual(collectLinkedHazardScenes(null), []);
});

test('trigger shows the prompt directly on the GM client', () => {
  const shown = [];
  const emitted = [];
  const trigger = createHazardSceneTrigger({
    isGM: () => true,
    emitPrompt: (entry) => emitted.push(entry),
    showPrompt: (entry) => shown.push(entry)
  });
  trigger.apply({ hazards: [{ name: 'Cave-in', linkedSceneUuid: 'Scene.a' }] });
  assert.deepEqual(shown, [{ sceneUuid: 'Scene.a', hazardName: 'Cave-in' }]);
  assert.equal(emitted.length, 0);
});

test('trigger emits to the GM when run on a player client', () => {
  const shown = [];
  const emitted = [];
  const trigger = createHazardSceneTrigger({
    isGM: () => false,
    emitPrompt: (entry) => emitted.push(entry),
    showPrompt: (entry) => shown.push(entry)
  });
  trigger.apply({ hazards: [{ name: 'Storm', linkedSceneUuid: 'Scene.b' }] });
  assert.deepEqual(emitted, [{ sceneUuid: 'Scene.b', hazardName: 'Storm' }]);
  assert.equal(shown.length, 0);
});

test('trigger does nothing when no hazard has a linked scene', () => {
  let calls = 0;
  const trigger = createHazardSceneTrigger({
    isGM: () => true,
    emitPrompt: () => { calls++; },
    showPrompt: () => { calls++; }
  });
  trigger.apply({ hazards: [{ name: 'Plain' }] });
  assert.equal(calls, 0);
});

test('socket router shows the prompt only for the active GM', () => {
  const shown = [];
  const deps = {
    currentUserId: () => 'u1',
    isActiveGM: () => true,
    showPrompt: (entry) => shown.push(entry),
    viewSceneForSelf: () => {}
  };
  routeHazardSceneSocketMessage({ action: 'hazardScenePrompt', sceneUuid: 'Scene.a', hazardName: 'Cave-in' }, deps);
  assert.deepEqual(shown, [{ sceneUuid: 'Scene.a', hazardName: 'Cave-in' }]);

  shown.length = 0;
  routeHazardSceneSocketMessage(
    { action: 'hazardScenePrompt', sceneUuid: 'Scene.a' },
    { ...deps, isActiveGM: () => false }
  );
  assert.equal(shown.length, 0);
});

test('socket router pulls only the targeted user to the scene', () => {
  const pulled = [];
  const deps = {
    currentUserId: () => 'u2',
    isActiveGM: () => false,
    showPrompt: () => {},
    viewSceneForSelf: (uuid) => pulled.push(uuid)
  };
  routeHazardSceneSocketMessage({ action: 'pullToScene', sceneUuid: 'Scene.x', userIds: ['u2', 'u3'] }, deps);
  assert.deepEqual(pulled, ['Scene.x']);

  pulled.length = 0;
  routeHazardSceneSocketMessage({ action: 'pullToScene', sceneUuid: 'Scene.x', userIds: ['u3'] }, deps);
  assert.equal(pulled.length, 0);
});

test('socket router ignores malformed payloads', () => {
  let touched = false;
  const deps = {
    currentUserId: () => 'u1',
    isActiveGM: () => true,
    showPrompt: () => { touched = true; },
    viewSceneForSelf: () => { touched = true; }
  };
  routeHazardSceneSocketMessage(null, deps);
  routeHazardSceneSocketMessage({ action: 'unknown' }, deps);
  assert.equal(touched, false);
});
