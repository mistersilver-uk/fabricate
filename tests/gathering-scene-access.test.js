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
    getCurrentScene: () => null
  });
  assert.deepEqual(access.canAttempt({ environment: {}, actor: actorWithTokens() }), { allowed: true });
});

test('the scene gate applies to GMs too — wrong scene is blocked', () => {
  // The restriction is additive with the region/stamina/node gates, which also
  // gate GMs; GMs are NOT exempt from the scene-token presence requirement.
  const access = createGatheringSceneAccess({
    getCurrentScene: () => ({ uuid: 'Scene.other' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens([tokenOn('Scene.mines')]),
    viewer: { isGM: true }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'SCENE_TOKEN_BLOCKED');
  assert.equal(result.messageKey, 'FABRICATE.Gathering.Blocked.SceneMissing');
});

test('the scene gate applies to GMs too — on the scene with a token is allowed', () => {
  const access = createGatheringSceneAccess({
    getCurrentScene: () => ({ uuid: 'Scene.mines' })
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens([tokenOn('Scene.mines')]),
    viewer: { isGM: true }
  });
  assert.deepEqual(result, { allowed: true });
});

test('viewing the wrong scene is blocked with SceneMissing', () => {
  const access = createGatheringSceneAccess({
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

test('viewing the linked scene without a token is blocked with TokenMissing', () => {
  const access = createGatheringSceneAccess({
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

test('viewing the linked scene with a token present is allowed', () => {
  const access = createGatheringSceneAccess({
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
