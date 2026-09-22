import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatheringSceneAccess, getTokenSceneUuid, resolveViewerScene } from '../src/gatheringBootstrapAdapters.js';

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
  // The restriction is additive with the realm/stamina/node gates, which also
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

// Issue 1912: a player's start is evaluated on the ACTIVE GM's client, so the gate must judge the
// REQUESTING viewer's viewed scene and that scene's tokens, never the evaluating client's canvas.

test("the scene gate asks for the requesting viewer's scene, not the evaluating client's", () => {
  const viewer = { id: 'player', isGM: false, viewedScene: 'mines' };
  const asked = [];
  const access = createGatheringSceneAccess({
    getCurrentScene: (forViewer) => {
      asked.push(forViewer);
      return { uuid: 'Scene.mines' };
    }
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor: actorWithTokens([tokenOn('Scene.mines')]),
    viewer
  });
  assert.deepEqual(result, { allowed: true });
  assert.deepEqual(asked, [viewer]);
});

test("the scene gate finds the actor's token on the linked scene when this client views another", () => {
  const mines = { uuid: 'Scene.mines' };
  const onMines = { parent: mines };
  const actor = {
    // Foundry's `getActiveTokens` answers for the viewed canvas alone — here the GM's other scene.
    getActiveTokens: () => [],
    getDependentTokens: ({ scenes }) => [onMines].filter(token => scenes.includes(token.parent))
  };
  const access = createGatheringSceneAccess({
    getCurrentScene: () => mines
  });
  const result = access.canAttempt({
    environment: { sceneUuid: 'Scene.mines' },
    actor,
    viewer: { id: 'player', isGM: false, viewedScene: 'mines' }
  });
  assert.deepEqual(result, { allowed: true });
});

test("resolveViewerScene prefers a remote viewer's viewed scene and falls back to this client's", () => {
  const mines = { id: 'mines', uuid: 'Scene.mines' };
  const other = { id: 'other', uuid: 'Scene.other' };
  const scenes = { get: (id) => [mines, other].find(scene => scene.id === id) ?? null };
  const currentUser = { id: 'gm' };
  const currentScene = () => other;
  const resolve = (viewer) => resolveViewerScene({ viewer, currentUser, scenes, currentScene });
  // A remote player viewing the mines while this (GM) client views another scene.
  assert.equal(resolve({ id: 'player', viewedScene: 'mines' }), mines);
  // The local user always answers with this client's current scene.
  assert.equal(resolve({ id: 'gm', viewedScene: 'mines' }), other);
  // A remote viewer that has not broadcast a scene, or names one that is gone, falls back.
  assert.equal(resolve({ id: 'player', viewedScene: null }), other);
  assert.equal(resolve({ id: 'player', viewedScene: 'missing' }), other);
  assert.equal(resolve(null), other);
});
