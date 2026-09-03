import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_SCENE_SOCKET,
  collectLinkedEventScenes,
  createEventSceneTrigger,
  routeEventSceneSocketMessage
} from '../src/systems/eventSceneCoordinator.js';

test('socket channel is the fabricate module channel', () => {
  assert.equal(EVENT_SCENE_SOCKET, 'module.fabricate');
});

test('collectLinkedEventScenes keeps only linked events and dedupes by scene', () => {
  const result = collectLinkedEventScenes([
    { name: 'Cave-in', linkedSceneUuid: 'Scene.a' },
    { name: 'No link' },
    { name: 'Empty', linkedSceneUuid: '' },
    { name: 'Dup', linkedSceneUuid: 'Scene.a' },
    { name: 'Storm', linkedSceneUuid: 'Scene.b' }
  ]);
  assert.deepEqual(result, [
    { sceneUuid: 'Scene.a', eventName: 'Cave-in' },
    { sceneUuid: 'Scene.b', eventName: 'Storm' }
  ]);
});

test('collectLinkedEventScenes tolerates non-array input', () => {
  assert.deepEqual(collectLinkedEventScenes(undefined), []);
  assert.deepEqual(collectLinkedEventScenes(null), []);
});

test('trigger shows the prompt directly on the GM client', () => {
  const shown = [];
  const emitted = [];
  const trigger = createEventSceneTrigger({
    isGM: () => true,
    emitPrompt: (entry) => emitted.push(entry),
    showPrompt: (entry) => shown.push(entry)
  });
  trigger.apply({ events: [{ name: 'Cave-in', linkedSceneUuid: 'Scene.a' }] });
  assert.deepEqual(shown, [{ sceneUuid: 'Scene.a', eventName: 'Cave-in' }]);
  assert.equal(emitted.length, 0);
});

test('trigger emits to the GM when run on a player client', () => {
  const shown = [];
  const emitted = [];
  const trigger = createEventSceneTrigger({
    isGM: () => false,
    emitPrompt: (entry) => emitted.push(entry),
    showPrompt: (entry) => shown.push(entry)
  });
  trigger.apply({ events: [{ name: 'Storm', linkedSceneUuid: 'Scene.b' }] });
  assert.deepEqual(emitted, [{ sceneUuid: 'Scene.b', eventName: 'Storm' }]);
  assert.equal(shown.length, 0);
});

test('trigger does nothing when no event has a linked scene', () => {
  let calls = 0;
  const trigger = createEventSceneTrigger({
    isGM: () => true,
    emitPrompt: () => { calls++; },
    showPrompt: () => { calls++; }
  });
  trigger.apply({ events: [{ name: 'Plain' }] });
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
  routeEventSceneSocketMessage({ action: 'eventScenePrompt', sceneUuid: 'Scene.a', eventName: 'Cave-in' }, deps);
  assert.deepEqual(shown, [{ sceneUuid: 'Scene.a', eventName: 'Cave-in' }]);

  shown.length = 0;
  routeEventSceneSocketMessage(
    { action: 'eventScenePrompt', sceneUuid: 'Scene.a' },
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
  routeEventSceneSocketMessage({ action: 'pullToScene', sceneUuid: 'Scene.x', userIds: ['u2', 'u3'] }, deps);
  assert.deepEqual(pulled, ['Scene.x']);

  pulled.length = 0;
  routeEventSceneSocketMessage({ action: 'pullToScene', sceneUuid: 'Scene.x', userIds: ['u3'] }, deps);
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
  routeEventSceneSocketMessage(null, deps);
  routeEventSceneSocketMessage({ action: 'unknown' }, deps);
  assert.equal(touched, false);
});
