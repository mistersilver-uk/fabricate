import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGatheringRegion,
  normalizeGatheringRegionList,
  normalizeGatheringRegionModifier,
  normalizeGatheringRegionSceneMapping,
  normalizeGatheringRegionSettings,
  validateGatheringRegion,
  validateGatheringRegionList,
  validateGatheringRegionSettings
} from '../src/systems/gatheringRegions.js';

let counter = 0;
const randomID = () => `id-${++counter}`;

test('normalizeGatheringRegion applies defaults and forces craftingSystemId to owner', () => {
  const region = normalizeGatheringRegion(
    { name: 'Verdant Expanse', craftingSystemId: 'foreign-system' },
    { craftingSystemId: 'system-a', randomID }
  );
  assert.equal(region.craftingSystemId, 'system-a');
  assert.equal(region.enabled, true);
  assert.equal(region.secret, false);
  assert.deepEqual(region.biomes, []);
  assert.deepEqual(region.sceneMappings, []);
  assert.deepEqual(region.modifiers, []);
  assert.ok(region.id);
});

test('normalizeGatheringRegion honors explicit enabled/secret/biomes', () => {
  const region = normalizeGatheringRegion(
    { id: 'r1', name: 'Ashen March', enabled: false, secret: true, biomes: ['Volcanic', 'volcanic', 'Ash'] },
    { craftingSystemId: 'system-a', randomID }
  );
  assert.equal(region.id, 'r1');
  assert.equal(region.enabled, false);
  assert.equal(region.secret, true);
  assert.deepEqual(region.biomes, ['volcanic', 'ash']);
});

test('normalizeGatheringRegionModifier coerces unknown enums and non-finite value on read', () => {
  const modifier = normalizeGatheringRegionModifier(
    { id: 'm1', kind: 'bogus', operation: 'divide', visibility: 'whoKnows', value: 'NaN' },
    { randomID }
  );
  assert.equal(modifier.kind, 'custom');
  assert.equal(modifier.operation, 'add');
  assert.equal(modifier.visibility, 'visible');
  assert.equal(modifier.value, 0);
  assert.equal(modifier.enabled, true);
});

test('normalizeGatheringRegionModifier keeps known enums, finite values, and default enabled', () => {
  const modifier = normalizeGatheringRegionModifier(
    { id: 'm1', kind: 'yield', operation: 'multiply', visibility: 'gmOnly', value: 1.5, note: ' extra ' },
    { randomID }
  );
  assert.equal(modifier.kind, 'yield');
  assert.equal(modifier.operation, 'multiply');
  assert.equal(modifier.visibility, 'gmOnly');
  assert.equal(modifier.value, 1.5);
  assert.equal(modifier.note, 'extra');
});

test('normalizeGatheringRegionSceneMapping preserves stale uuids verbatim', () => {
  const mapping = normalizeGatheringRegionSceneMapping(
    { id: 'sm1', sceneUuid: 'Scene.gone', sceneRegionUuid: 'Scene.gone.Region.poof' },
    { randomID }
  );
  assert.equal(mapping.sceneUuid, 'Scene.gone');
  assert.equal(mapping.sceneRegionUuid, 'Scene.gone.Region.poof');
});

test('validateGatheringRegion rejects unknown modifier enums and non-finite values', () => {
  const errors = validateGatheringRegion({
    name: 'Bad',
    modifiers: [
      { id: 'm1', kind: 'bogus', operation: 'add', visibility: 'visible', value: 1 },
      { id: 'm2', kind: 'yield', operation: 'divide', visibility: 'visible', value: 1 },
      { id: 'm3', kind: 'yield', operation: 'add', visibility: 'private', value: 1 },
      { id: 'm4', kind: 'yield', operation: 'add', visibility: 'visible', value: Infinity }
    ]
  });
  assert.equal(errors.length, 4);
  assert.ok(errors.some(e => e.includes('kind')));
  assert.ok(errors.some(e => e.includes('operation')));
  assert.ok(errors.some(e => e.includes('visibility')));
  assert.ok(errors.some(e => e.includes('value')));
});

test('validateGatheringRegion rejects duplicate modifier ids and duplicate scene mapping ids', () => {
  const errors = validateGatheringRegion({
    name: 'Dupes',
    modifiers: [
      { id: 'm1', kind: 'yield', operation: 'add', visibility: 'visible', value: 1 },
      { id: 'm1', kind: 'yield', operation: 'add', visibility: 'visible', value: 1 }
    ],
    sceneMappings: [
      { id: 'sm1', sceneUuid: 'a', sceneRegionUuid: 'b' },
      { id: 'sm1', sceneUuid: 'c', sceneRegionUuid: 'd' }
    ]
  });
  assert.ok(errors.some(e => e.includes('duplicate modifier id')));
  assert.ok(errors.some(e => e.includes('duplicate scene mapping id')));
});

test('validateGatheringRegionList rejects duplicate region ids', () => {
  const errors = validateGatheringRegionList([
    { id: 'r1', name: 'A' },
    { id: 'r1', name: 'B' }
  ]);
  assert.ok(errors.some(e => e.includes('Duplicate region id "r1"')));
});

test('normalizeGatheringRegionSettings coerces unknown values to defaults on read (BOTH directions)', () => {
  assert.deepEqual(normalizeGatheringRegionSettings({}), { revealMode: 'manual', modifierVisibility: 'visible' });
  assert.deepEqual(
    normalizeGatheringRegionSettings({ revealMode: 'bogus', modifierVisibility: 'whoKnows' }),
    { revealMode: 'manual', modifierVisibility: 'visible' }
  );
  assert.deepEqual(
    normalizeGatheringRegionSettings({ revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' }),
    { revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' }
  );
});

test('validateGatheringRegionSettings rejects unknown values at save boundary', () => {
  assert.deepEqual(validateGatheringRegionSettings({ revealMode: 'manual', modifierVisibility: 'visible' }), []);
  const errors = validateGatheringRegionSettings({ revealMode: 'bogus', modifierVisibility: 'whoKnows' });
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => e.includes('revealMode')));
  assert.ok(errors.some(e => e.includes('modifierVisibility')));
});

test('normalizeGatheringRegionList preserves stale scene mappings as readable', () => {
  const list = normalizeGatheringRegionList(
    [{ id: 'r1', name: 'A', sceneMappings: [{ id: 'sm1', sceneUuid: 'Scene.stale', sceneRegionUuid: 'gone' }] }],
    { craftingSystemId: 'system-a', randomID }
  );
  assert.equal(list[0].sceneMappings[0].sceneUuid, 'Scene.stale');
  assert.equal(list[0].sceneMappings[0].sceneRegionUuid, 'gone');
});
