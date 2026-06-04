import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatheringSceneAccess, getTokenSceneUuid } from '../src/gatheringBootstrapAdapters.js';

function actorWithTokens(tokens = []) {
  return { getActiveTokens: () => tokens };
}

function tokenOn(sceneUuid) {
  return { parent: { uuid: sceneUuid } };
}

test('scene gate allows environments without a linked scene', () => {
  const access = createGatheringSceneAccess({
    getCurrentUser: () => ({ isGM: false }),
    getCurrentScene: () => null
  });
  assert.deepEqual(access.canAttempt({ environment: {}, actor: actorWithTokens() }), { allowed: true });
});

test('GM viewer bypasses the scene gate regardless of scene or token', () => {
  const access = createGatheringSceneAccess({
    getCurrentUser: () => ({ isGM: false }),
    getCurrentScene: () => ({ uuid: 'Scene.other' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens(),
    viewer: { isGM: true }
  });
  assert.deepEqual(result, { allowed: true });
});

test('GM bypass falls back to the current user when no viewer is passed', () => {
  const access = createGatheringSceneAccess({
    getCurrentUser: () => ({ isGM: true }),
    getCurrentScene: () => ({ uuid: 'Scene.other' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens()
  });
  assert.deepEqual(result, { allowed: true });
});

test('non-GM viewing the wrong scene is blocked with SceneMissing', () => {
  const access = createGatheringSceneAccess({
    getCurrentUser: () => ({ isGM: false }),
    getCurrentScene: () => ({ uuid: 'Scene.other' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens([tokenOn('Scene.mines')]),
    viewer: { isGM: false }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'SCENE_TOKEN_BLOCKED');
  assert.equal(result.messageKey, 'FABRICATE.Gathering.Blocked.SceneMissing');
});

test('non-GM viewing the linked scene without a token is blocked with TokenMissing', () => {
  const access = createGatheringSceneAccess({
    getCurrentUser: () => ({ isGM: false }),
    getCurrentScene: () => ({ uuid: 'Scene.mines' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens([tokenOn('Scene.other')]),
    viewer: { isGM: false }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'SCENE_TOKEN_BLOCKED');
  assert.equal(result.messageKey, 'FABRICATE.Gathering.Blocked.TokenMissing');
});

test('non-GM viewing the linked scene with a token present is allowed', () => {
  const access = createGatheringSceneAccess({
    getCurrentUser: () => ({ isGM: false }),
    getCurrentScene: () => ({ uuid: 'Scene.mines' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens([tokenOn('Scene.mines')]),
    viewer: { isGM: false }
  });
  assert.deepEqual(result, { allowed: true });
});

test('getTokenSceneUuid resolves V13 token shapes', () => {
  assert.equal(getTokenSceneUuid({ parent: { uuid: 'Scene.a' } }), 'Scene.a');
  assert.equal(getTokenSceneUuid({ scene: { uuid: 'Scene.b' } }), 'Scene.b');
  assert.equal(getTokenSceneUuid({ document: { parent: { uuid: 'Scene.c' } } }), 'Scene.c');
  assert.equal(getTokenSceneUuid({}), null);
});
