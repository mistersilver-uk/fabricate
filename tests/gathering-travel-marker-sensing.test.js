import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getActorTokensOnScenes,
  senseTravelMarkerRegions
} from '../src/gatheringBootstrapAdapters.js';

/**
 * A Foundry-shaped actor (issue 1912): `getActiveTokens` answers ONLY for the scene THIS client
 * views, `getDependentTokens` for every scene the actor has a token on, so a sensor that reads the
 * canvas goes red the moment the evaluating client — the active GM's — looks at another scene.
 */
function foundryActor({ tokens = [], viewedScene = null } = {}) {
  return {
    getActiveTokens: (_linked = false, document = false) => {
      assert.equal(document, true, 'production reads token DOCUMENTS');
      return tokens.filter(token => token.parent === viewedScene);
    },
    getDependentTokens: ({ scenes = null, linked = false, concreteOnly = false } = {}) => {
      assert.equal(linked, false, 'unlinked marker tokens count too');
      assert.equal(concreteOnly, true, 'only tokens the scene actually holds');
      const wanted = scenes ? new Set(Array.isArray(scenes) ? scenes : [scenes]) : null;
      return tokens.filter(token => !wanted || wanted.has(token.parent));
    }
  };
}

function scene(id) {
  return { id, uuid: `Scene.${id}`, regions: [] };
}

function tokenOn(parent, { regions = null, x = 0, y = 0 } = {}) {
  return { parent, x, y, width: 1, height: 1, regions };
}

test('senseTravelMarkerRegions reads the marker on a scene this client is NOT viewing', () => {
  const worldMap = scene('map');
  const battleMap = scene('battle');
  const region = { uuid: 'Scene.map.Region.verdant' };
  const actor = foundryActor({
    tokens: [tokenOn(worldMap, { regions: new Set([region]) })],
    viewedScene: battleMap
  });
  const sensed = senseTravelMarkerRegions({ actor });
  assert.deepEqual([...sensed], ['Scene.map.Region.verdant']);
});

test('senseTravelMarkerRegions unions the marker regions across scenes', () => {
  const worldMap = scene('map');
  const other = scene('other');
  const actor = foundryActor({
    tokens: [
      tokenOn(worldMap, { regions: new Set([{ uuid: 'Scene.map.Region.a' }]) }),
      tokenOn(other, { regions: new Set([{ uuid: 'Scene.other.Region.b' }, { uuid: '' }]) })
    ],
    viewedScene: null
  });
  const sensed = senseTravelMarkerRegions({ actor });
  assert.deepEqual(
    [...sensed].sort((a, b) => a.localeCompare(b)),
    ['Scene.map.Region.a', 'Scene.other.Region.b']
  );
});

test('senseTravelMarkerRegions falls back to the position hit-test when membership is unavailable', () => {
  const worldMap = scene('map');
  const token = tokenOn(worldMap, { regions: null });
  const actor = foundryActor({ tokens: [token], viewedScene: null });
  const calls = [];
  const sensed = senseTravelMarkerRegions({
    actor,
    hitTest: ({ scene: hitScene, token: hitToken }) => {
      calls.push({ hitScene, hitToken });
      return ['Scene.map.Region.hit'];
    }
  });
  assert.deepEqual([...sensed], ['Scene.map.Region.hit']);
  assert.deepEqual(calls, [{ hitScene: worldMap, hitToken: token }]);
});

test('senseTravelMarkerRegions answers empty for no actor or no tokens', () => {
  assert.deepEqual([...senseTravelMarkerRegions({ actor: null })], []);
  assert.deepEqual([...senseTravelMarkerRegions({ actor: foundryActor() })], []);
});

test('getActorTokensOnScenes prefers every-scene dependent tokens over the viewed canvas', () => {
  const worldMap = scene('map');
  const battleMap = scene('battle');
  const onMap = tokenOn(worldMap);
  const onBattle = tokenOn(battleMap);
  const actor = foundryActor({ tokens: [onMap, onBattle], viewedScene: battleMap });
  assert.deepEqual(getActorTokensOnScenes(actor), [onMap, onBattle]);
  assert.deepEqual(getActorTokensOnScenes(actor, [worldMap]), [onMap]);
  assert.deepEqual(getActorTokensOnScenes(actor, [scene('elsewhere')]), []);
});

test('getActorTokensOnScenes falls back to getActiveTokens for adapters without getDependentTokens', () => {
  const worldMap = scene('map');
  const onMap = tokenOn(worldMap);
  const elsewhere = tokenOn(scene('other'));
  const legacy = { getActiveTokens: () => [onMap, elsewhere] };
  assert.deepEqual(getActorTokensOnScenes(legacy), [onMap, elsewhere]);
  assert.deepEqual(getActorTokensOnScenes(legacy, [worldMap]), [onMap]);
  assert.deepEqual(getActorTokensOnScenes(null), []);
  assert.deepEqual(getActorTokensOnScenes({}), []);
});
