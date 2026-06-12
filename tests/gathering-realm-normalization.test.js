import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGatheringRealm,
  normalizeGatheringRealmList,
  normalizeGatheringRealmModifier,
  normalizeGatheringRealmSceneMapping,
  normalizeGatheringRealmSettings,
  validateGatheringRealm,
  validateGatheringRealmList,
  validateGatheringRealmSettings
} from '../src/systems/gatheringRealms.js';

let counter = 0;
const randomID = () => `id-${++counter}`;

test('normalizeGatheringRealm applies defaults and forces craftingSystemId to owner', () => {
  const realm = normalizeGatheringRealm(
    { name: 'Verdant Expanse', craftingSystemId: 'foreign-system' },
    { craftingSystemId: 'system-a', randomID }
  );
  assert.equal(realm.craftingSystemId, 'system-a');
  assert.equal(realm.enabled, true);
  assert.equal(realm.secret, false);
  assert.deepEqual(realm.biomes, []);
  assert.deepEqual(realm.sceneMappings, []);
  assert.deepEqual(realm.modifiers, []);
  assert.ok(realm.id);
});

test('normalizeGatheringRealm honors explicit enabled/secret/biomes', () => {
  const realm = normalizeGatheringRealm(
    { id: 'r1', name: 'Ashen March', enabled: false, secret: true, biomes: ['Volcanic', 'volcanic', 'Ash'] },
    { craftingSystemId: 'system-a', randomID }
  );
  assert.equal(realm.id, 'r1');
  assert.equal(realm.enabled, false);
  assert.equal(realm.secret, true);
  assert.deepEqual(realm.biomes, ['volcanic', 'ash']);
});

test('normalizeGatheringRealmModifier coerces unknown enums and non-finite value on read', () => {
  const modifier = normalizeGatheringRealmModifier(
    { id: 'm1', kind: 'bogus', operation: 'divide', visibility: 'whoKnows', value: 'NaN' },
    { randomID }
  );
  assert.equal(modifier.kind, 'custom');
  assert.equal(modifier.operation, 'add');
  assert.equal(modifier.visibility, 'visible');
  assert.equal(modifier.value, 0);
  assert.equal(modifier.enabled, true);
});

test('normalizeGatheringRealmModifier keeps known enums, finite values, and default enabled', () => {
  const modifier = normalizeGatheringRealmModifier(
    { id: 'm1', kind: 'yield', operation: 'multiply', visibility: 'gmOnly', value: 1.5, note: ' extra ' },
    { randomID }
  );
  assert.equal(modifier.kind, 'yield');
  assert.equal(modifier.operation, 'multiply');
  assert.equal(modifier.visibility, 'gmOnly');
  assert.equal(modifier.value, 1.5);
  assert.equal(modifier.note, 'extra');
});

test('normalizeGatheringRealmSceneMapping preserves stale uuids verbatim', () => {
  const mapping = normalizeGatheringRealmSceneMapping(
    { id: 'sm1', sceneUuid: 'Scene.gone', sceneRegionUuid: 'Scene.gone.Realm.poof' },
    { randomID }
  );
  assert.equal(mapping.sceneUuid, 'Scene.gone');
  assert.equal(mapping.sceneRegionUuid, 'Scene.gone.Realm.poof');
});

test('validateGatheringRealm rejects unknown modifier enums and non-finite values', () => {
  const errors = validateGatheringRealm({
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

test('validateGatheringRealm rejects duplicate modifier ids and duplicate scene mapping ids', () => {
  const errors = validateGatheringRealm({
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

test('validateGatheringRealmList rejects duplicate realm ids', () => {
  const errors = validateGatheringRealmList([
    { id: 'r1', name: 'A' },
    { id: 'r1', name: 'B' }
  ]);
  assert.ok(errors.some(e => e.includes('Duplicate realm id "r1"')));
});

test('normalizeGatheringRealmSettings coerces unknown values to defaults on read (BOTH directions)', () => {
  assert.deepEqual(normalizeGatheringRealmSettings({}), { enabled: false, revealMode: 'manual', modifierVisibility: 'visible' });
  assert.deepEqual(
    normalizeGatheringRealmSettings({ revealMode: 'bogus', modifierVisibility: 'whoKnows' }),
    { enabled: false, revealMode: 'manual', modifierVisibility: 'visible' }
  );
  assert.deepEqual(
    normalizeGatheringRealmSettings({ enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' }),
    { enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' }
  );
});

test('normalizeGatheringRealmSettings: enabled defaults false and only explicit true enables', () => {
  assert.equal(normalizeGatheringRealmSettings({}).enabled, false, 'missing → false');
  assert.equal(normalizeGatheringRealmSettings({ enabled: true }).enabled, true, 'true → true');
  assert.equal(normalizeGatheringRealmSettings({ enabled: false }).enabled, false, 'false → false');
  // Non-boolean truthy/falsey coerce to false (only an explicit boolean true enables).
  assert.equal(normalizeGatheringRealmSettings({ enabled: 'true' }).enabled, false, 'string "true" → false');
  assert.equal(normalizeGatheringRealmSettings({ enabled: 1 }).enabled, false, 'number 1 → false');
});

test('validateGatheringRealmSettings rejects unknown values at save boundary', () => {
  assert.deepEqual(validateGatheringRealmSettings({ enabled: false, revealMode: 'manual', modifierVisibility: 'visible' }), []);
  const errors = validateGatheringRealmSettings({ revealMode: 'bogus', modifierVisibility: 'whoKnows' });
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => e.includes('revealMode')));
  assert.ok(errors.some(e => e.includes('modifierVisibility')));
});

test('validateGatheringRealmSettings rejects a non-boolean enabled but accepts booleans', () => {
  assert.deepEqual(validateGatheringRealmSettings({ enabled: true }), []);
  assert.deepEqual(validateGatheringRealmSettings({ enabled: false }), []);
  const errors = validateGatheringRealmSettings({ enabled: 'yes' });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('enabled'));
});

test('normalizeGatheringRealmList preserves stale scene mappings as readable', () => {
  const list = normalizeGatheringRealmList(
    [{ id: 'r1', name: 'A', sceneMappings: [{ id: 'sm1', sceneUuid: 'Scene.stale', sceneRegionUuid: 'gone' }] }],
    { craftingSystemId: 'system-a', randomID }
  );
  assert.equal(list[0].sceneMappings[0].sceneUuid, 'Scene.stale');
  assert.equal(list[0].sceneMappings[0].sceneRegionUuid, 'gone');
});
