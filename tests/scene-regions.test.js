import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readSceneRegions,
  toCssColor,
  filterActorUuidsInsideRegion
} from '../src/ui/svelte/util/sceneRegions.js';

test('readSceneRegions extracts uuid, name and color from an array collection', () => {
  const scene = {
    uuid: 'Scene.abc',
    regions: [
      { uuid: 'Scene.abc.Region.r1', name: 'Forest', color: '#1a9c4f' },
      { uuid: 'Scene.abc.Region.r2', name: 'Cave', color: '#332211' }
    ]
  };
  const result = readSceneRegions(scene);
  assert.equal(result.sceneUuid, 'Scene.abc');
  assert.deepEqual(result.regions, [
    { sceneRegionUuid: 'Scene.abc.Region.r1', name: 'Forest', color: '#1a9c4f' },
    { sceneRegionUuid: 'Scene.abc.Region.r2', name: 'Cave', color: '#332211' }
  ]);
});

test('readSceneRegions walks EmbeddedCollection (.contents), Map (.values) and iterables', () => {
  const region = { uuid: 'Scene.x.Region.r', name: 'R', color: '#000000' };

  const contentsForm = readSceneRegions({ uuid: 'Scene.x', regions: { contents: [region] } });
  assert.equal(contentsForm.regions.length, 1);

  const mapForm = readSceneRegions({ uuid: 'Scene.x', regions: new Map([[region.uuid, region]]) });
  assert.equal(mapForm.regions.length, 1);

  const iterableForm = readSceneRegions({ uuid: 'Scene.x', regions: new Set([region]) });
  assert.equal(iterableForm.regions.length, 1);
});

test('readSceneRegions returns empty defaults when scene or regions are absent', () => {
  assert.deepEqual(readSceneRegions(null), { sceneUuid: '', regions: [] });
  assert.deepEqual(readSceneRegions({}), { sceneUuid: '', regions: [] });
  assert.deepEqual(readSceneRegions({ uuid: 'Scene.empty', regions: [] }), {
    sceneUuid: 'Scene.empty',
    regions: []
  });
});

test('readSceneRegions drops regions without a uuid', () => {
  const scene = {
    uuid: 'Scene.x',
    regions: [
      { name: 'No uuid', color: '#fff' },
      { uuid: 'Scene.x.Region.ok', name: 'Ok', color: '#fff' }
    ]
  };
  const result = readSceneRegions(scene);
  assert.deepEqual(result.regions.map(r => r.sceneRegionUuid), ['Scene.x.Region.ok']);
});

test('toCssColor coerces Color instances, numbers, bare hex and falls back', () => {
  // Foundry V13 Color instance exposes `.css`.
  assert.equal(toCssColor({ css: '#abcdef' }), '#abcdef');
  // Color-like object without .css but a #rrggbb toString.
  assert.equal(toCssColor({ toString: () => '#123456' }), '#123456');
  // Packed 24-bit number.
  assert.equal(toCssColor(0xff0000), '#ff0000');
  assert.equal(toCssColor(0x00ff00), '#00ff00');
  // Bare hex string gets a leading '#'.
  assert.equal(toCssColor('abcabc'), '#abcabc');
  assert.equal(toCssColor('#abcabc'), '#abcabc');
  // Unusable values yield '' so the consumer can fall back to a themed default.
  assert.equal(toCssColor(null), '');
  assert.equal(toCssColor(undefined), '');
  assert.equal(toCssColor('   '), '');
});

test('filterActorUuidsInsideRegion keeps only actors whose token centre is inside', () => {
  // Region "contains" any point with x < 100.
  const regionDoc = { testPoint: ({ x }) => x < 100 };
  const centers = {
    'Actor.in': { x: 10, y: 10 },
    'Actor.out': { x: 200, y: 10 },
    'Actor.notoken': null,
    'Actor.nan': { x: Number.NaN, y: 5 }
  };
  const inside = filterActorUuidsInsideRegion({
    regionDoc,
    actorUuids: ['Actor.in', 'Actor.out', 'Actor.notoken', 'Actor.nan'],
    resolveActorTokenCenter: (uuid) => centers[uuid] ?? null
  });
  assert.deepEqual(inside, ['Actor.in']);
});

test('filterActorUuidsInsideRegion is defensive about inputs and testPoint throwing', () => {
  const resolve = () => ({ x: 1, y: 1 });
  // Missing / malformed regionDoc.
  assert.deepEqual(filterActorUuidsInsideRegion({ regionDoc: null, actorUuids: ['a'], resolveActorTokenCenter: resolve }), []);
  assert.deepEqual(filterActorUuidsInsideRegion({ regionDoc: {}, actorUuids: ['a'], resolveActorTokenCenter: resolve }), []);
  // Missing actor list / resolver.
  assert.deepEqual(filterActorUuidsInsideRegion({ regionDoc: { testPoint: () => true } }), []);
  // testPoint throwing => treated as not-contained, not a crash.
  const throwingRegion = { testPoint: () => { throw new Error('boom'); } };
  assert.deepEqual(
    filterActorUuidsInsideRegion({ regionDoc: throwingRegion, actorUuids: ['a'], resolveActorTokenCenter: resolve }),
    []
  );
});
