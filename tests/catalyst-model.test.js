/**
 * Unit tests for the Catalyst model (T-002, T-038)
 * Tests construction, serialization, validation, and round-trip fidelity
 * against the spec 002 contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal stubs so the module can load without a Foundry runtime
globalThis.foundry = { utils: { getProperty: () => undefined } };

const { Catalyst } = await import('../src/models/Catalyst.js');

// ---------------------------------------------------------------------------
// FakeItem helper for applyDegradation tests (T-006)
//
// getFabricateFlag calls item.getFlag('fabricate', normalizeFlagKey(key))
// where normalizeFlagKey prepends 'fabricate.' -- so the real call is:
//   item.getFlag('fabricate', 'fabricate.<key>')
//
// We store state in this._flags = { fabricate: <flags arg> }.
// getFlag('fabricate', 'fabricate.X') uses dot-path traversal on
// this._flags['fabricate'], resolving 'fabricate.X' as
//   this._flags.fabricate.fabricate.X
// So the flags constructor arg must be { fabricate: { X: value } }.
// ---------------------------------------------------------------------------

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, part) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[part];
  }, object);
}

function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target = target[part];
  }
  target[last] = value;
}

class FakeItem {
  constructor(flags = {}) {
    // _flags.fabricate = flags, so path 'fabricate.X' resolves to flags.fabricate.X
    this._flags = { fabricate: flags };
    this.deleted = false;
  }

  getFlag(scope, key) {
    if (!this._flags[scope]) return undefined;
    return getPathValue(this._flags[scope], key);
  }

  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
    return value;
  }

  async unsetFlag(scope, key) {
    // Navigate to the parent and delete the leaf key
    const parts = String(key).split('.');
    const last = parts.pop();
    const parent = getPathValue(this._flags[scope], parts.join('.'));
    if (parent && typeof parent === 'object') {
      delete parent[last];
    }
  }

  async delete() {
    this.deleted = true;
  }
}

// ---------------------------------------------------------------------------
// Construction — primary key: componentId
// ---------------------------------------------------------------------------

test('Catalyst construction - defaults produce a valid spec-shape', () => {
  const cat = new Catalyst({ componentId: 'item-forge' });

  assert.equal(cat.componentId, 'item-forge');
  assert.equal(cat.degradesOnUse, false);
  assert.equal(cat.destroyWhenExhausted, false);
  assert.equal(cat.maxUses, null);
});

test('Catalyst construction - accepts all spec fields', () => {
  const cat = new Catalyst({
    componentId: 'item-anvil',
    degradesOnUse: true,
    destroyWhenExhausted: true,
    maxUses: 10,
  });

  assert.equal(cat.componentId, 'item-anvil');
  assert.equal(cat.degradesOnUse, true);
  assert.equal(cat.destroyWhenExhausted, true);
  assert.equal(cat.maxUses, 10);
});

test('Catalyst construction - maxUses null when not provided', () => {
  const cat = new Catalyst({ componentId: 'item-x' });
  assert.equal(cat.maxUses, null);
});

test('Catalyst construction - maxUses null when explicitly null', () => {
  const cat = new Catalyst({ componentId: 'item-x', maxUses: null });
  assert.equal(cat.maxUses, null);
});

test('Catalyst construction - maxUses coerced to number from string', () => {
  const cat = new Catalyst({ componentId: 'item-x', maxUses: '5' });
  assert.equal(cat.maxUses, 5);
  assert.equal(typeof cat.maxUses, 'number');
});

test('Catalyst construction - degradesOnUse defaults false', () => {
  const cat = new Catalyst({ componentId: 'item-x' });
  assert.equal(cat.degradesOnUse, false);
});

test('Catalyst construction - destroyWhenExhausted defaults false', () => {
  const cat = new Catalyst({ componentId: 'item-x' });
  assert.equal(cat.destroyWhenExhausted, false);
});

test('Catalyst construction - empty data object yields null componentId', () => {
  const cat = new Catalyst({});
  assert.equal(cat.componentId, null);
});

// ---------------------------------------------------------------------------
// Construction — AC2: systemItemId accepted as fallback (migration support)
// ---------------------------------------------------------------------------

test('Catalyst construction - systemItemId fallback: stored as componentId', () => {
  const cat = new Catalyst({ systemItemId: 'item-legacy' });
  assert.equal(cat.componentId, 'item-legacy');
});

test('Catalyst construction - componentId takes precedence over systemItemId', () => {
  const cat = new Catalyst({ componentId: 'item-new', systemItemId: 'item-old' });
  assert.equal(cat.componentId, 'item-new');
});

// ---------------------------------------------------------------------------
// Legacy fields are NOT present
// ---------------------------------------------------------------------------

test('Catalyst - legacy field mustBeEquipped is not present', () => {
  const cat = new Catalyst({ componentId: 'x', mustBeEquipped: true });
  assert.equal(cat.mustBeEquipped, undefined);
});

test('Catalyst - legacy field proximityRequired is not present', () => {
  const cat = new Catalyst({ componentId: 'x', proximityRequired: true });
  assert.equal(cat.proximityRequired, undefined);
});

test('Catalyst - legacy field qualityBonus is not present', () => {
  const cat = new Catalyst({ componentId: 'x', qualityBonus: true });
  assert.equal(cat.qualityBonus, undefined);
});

test('Catalyst - legacy field durabilityAttribute is not present', () => {
  const cat = new Catalyst({ componentId: 'x', durabilityAttribute: 'system.dur' });
  assert.equal(cat.durabilityAttribute, undefined);
});

test('Catalyst - legacy field degradeAmount is not present', () => {
  const cat = new Catalyst({ componentId: 'x', degradeAmount: 2 });
  assert.equal(cat.degradeAmount, undefined);
});

test('Catalyst - legacy field proximityDistance is not present', () => {
  const cat = new Catalyst({ componentId: 'x', proximityDistance: 10 });
  assert.equal(cat.proximityDistance, undefined);
});

test('Catalyst - legacy field qualityAttribute is not present', () => {
  const cat = new Catalyst({ componentId: 'x', qualityAttribute: 'system.quality' });
  assert.equal(cat.qualityAttribute, undefined);
});

test('Catalyst - legacy field itemUuid is not present', () => {
  const cat = new Catalyst({ componentId: 'x', itemUuid: 'some-uuid' });
  assert.equal(cat.itemUuid, undefined);
});

test('Catalyst - legacy field name is not present', () => {
  const cat = new Catalyst({ componentId: 'x', name: 'Forge' });
  assert.equal(cat.name, undefined);
});

test('Catalyst - legacy field required is not present', () => {
  const cat = new Catalyst({ componentId: 'x', required: false });
  assert.equal(cat.required, undefined);
});

// ---------------------------------------------------------------------------
// Serialization - toJSON
// AC3: toJSON emits both componentId (primary) and systemItemId (transitional alias)
// ---------------------------------------------------------------------------

test('Catalyst.toJSON - emits componentId as primary key', () => {
  const cat = new Catalyst({
    componentId: 'item-forge',
    degradesOnUse: true,
    destroyWhenExhausted: true,
    maxUses: 10,
  });

  const json = cat.toJSON();
  assert.equal(json.componentId, 'item-forge');
  assert.equal(json.degradesOnUse, true);
  assert.equal(json.destroyWhenExhausted, true);
  assert.equal(json.maxUses, 10);
});

test('Catalyst.toJSON - emits systemItemId as transitional alias', () => {
  const cat = new Catalyst({ componentId: 'item-forge' });
  const json = cat.toJSON();
  assert.equal(json.systemItemId, 'item-forge');
});

test('Catalyst.toJSON - componentId and systemItemId have the same value', () => {
  const cat = new Catalyst({ componentId: 'item-anvil' });
  const json = cat.toJSON();
  assert.equal(json.componentId, json.systemItemId);
});

test('Catalyst.toJSON - does not include legacy fields', () => {
  const cat = new Catalyst({ componentId: 'item-x' });
  const json = cat.toJSON();

  assert.equal(json.mustBeEquipped, undefined);
  assert.equal(json.proximityRequired, undefined);
  assert.equal(json.qualityBonus, undefined);
  assert.equal(json.durabilityAttribute, undefined);
  assert.equal(json.degradeAmount, undefined);
  assert.equal(json.proximityDistance, undefined);
  assert.equal(json.qualityAttribute, undefined);
  assert.equal(json.itemUuid, undefined);
  assert.equal(json.name, undefined);
  assert.equal(json.required, undefined);
  assert.equal(json.tag, undefined);
  assert.equal(json.mustBeInInventory, undefined);
});

test('Catalyst.toJSON - maxUses null is serialized as null', () => {
  const cat = new Catalyst({ componentId: 'item-x' });
  const json = cat.toJSON();
  assert.equal(json.maxUses, null);
});

// ---------------------------------------------------------------------------
// Deserialization - fromJSON
// ---------------------------------------------------------------------------

test('Catalyst.fromJSON - round-trips all spec fields using componentId', () => {
  const original = {
    componentId: 'item-anvil',
    degradesOnUse: true,
    destroyWhenExhausted: true,
    maxUses: 5,
  };

  const cat = Catalyst.fromJSON(original);

  assert.equal(cat.componentId, 'item-anvil');
  assert.equal(cat.degradesOnUse, true);
  assert.equal(cat.destroyWhenExhausted, true);
  assert.equal(cat.maxUses, 5);
});

test('Catalyst.fromJSON - accepts legacy systemItemId as fallback', () => {
  const cat = Catalyst.fromJSON({ systemItemId: 'item-legacy', degradesOnUse: false, maxUses: null });
  assert.equal(cat.componentId, 'item-legacy');
});

test('Catalyst.fromJSON - toJSON round-trip preserves componentId', () => {
  const original = {
    componentId: 'item-crucible',
    degradesOnUse: false,
    destroyWhenExhausted: false,
    maxUses: null,
  };

  const roundTripped = Catalyst.fromJSON(original).toJSON();

  assert.equal(roundTripped.componentId, original.componentId);
  assert.equal(roundTripped.systemItemId, original.componentId);
  assert.equal(roundTripped.degradesOnUse, original.degradesOnUse);
  assert.equal(roundTripped.destroyWhenExhausted, original.destroyWhenExhausted);
  assert.equal(roundTripped.maxUses, original.maxUses);
});

test('Catalyst.fromJSON - round-trip with maxUses integer', () => {
  const original = {
    componentId: 'item-chisel',
    degradesOnUse: true,
    destroyWhenExhausted: true,
    maxUses: 20,
  };

  const roundTripped = Catalyst.fromJSON(original).toJSON();
  assert.equal(roundTripped.componentId, original.componentId);
  assert.equal(roundTripped.maxUses, original.maxUses);
});

test('Catalyst.fromJSON - handles legacy data gracefully (no crash)', () => {
  // Legacy JSON that may come from old saved data
  const legacyData = {
    systemItemId: 'item-forge',
    itemUuid: 'old-uuid',
    name: 'Old Forge',
    required: true,
    mustBeEquipped: true,
    proximityRequired: false,
    proximityDistance: 5,
    degradesOnUse: false,
    degradeAmount: 1,
    durabilityAttribute: 'system.durability',
    maxUses: null,
    qualityBonus: false,
    qualityAttribute: 'system.quality',
  };

  // Should not throw; just ignores unknown fields
  assert.doesNotThrow(() => Catalyst.fromJSON(legacyData));

  const cat = Catalyst.fromJSON(legacyData);
  // componentId is populated via systemItemId fallback
  assert.equal(cat.componentId, 'item-forge');
  assert.equal(cat.degradesOnUse, false);
  assert.equal(cat.destroyWhenExhausted, false);
  assert.equal(cat.maxUses, null);
  // Legacy fields absent
  assert.equal(cat.mustBeEquipped, undefined);
  assert.equal(cat.itemUuid, undefined);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('Catalyst.validate - valid when componentId is set', () => {
  const cat = new Catalyst({
    componentId: 'item-forge',
    degradesOnUse: false,
    destroyWhenExhausted: false,
    maxUses: null,
  });

  const result = cat.validate();
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('Catalyst.validate - invalid when componentId is null', () => {
  const cat = new Catalyst({});
  const result = cat.validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(e => /componentId/.test(e)));
});

test('Catalyst.validate - invalid when componentId is empty string', () => {
  const cat = new Catalyst({ componentId: '' });
  const result = cat.validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /componentId/.test(e)));
});

// maxUses validation is conditional on degradesOnUse

test('Catalyst.validate - invalid when maxUses is zero and degradesOnUse is true', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 0 });
  const result = cat.validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /maxUses/.test(e)));
});

test('Catalyst.validate - invalid when maxUses is negative and degradesOnUse is true', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: -1 });
  const result = cat.validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /maxUses/.test(e)));
});

test('Catalyst.validate - valid when maxUses is null (unlimited)', () => {
  const cat = new Catalyst({ componentId: 'x', maxUses: null });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - valid when maxUses is positive integer', () => {
  const cat = new Catalyst({ componentId: 'x', maxUses: 1 });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - degradesOnUse true with maxUses null is valid', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: null });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - destroyWhenExhausted true without maxUses is valid', () => {
  // destroyWhenExhausted only meaningful when maxUses is set, but not a hard error
  const cat = new Catalyst({ componentId: 'x', destroyWhenExhausted: true, maxUses: null });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

// ---------------------------------------------------------------------------
// T-051: maxUses validation matrix (degradesOnUse x maxUses)
// ---------------------------------------------------------------------------

test('Catalyst.validate - valid when degradesOnUse is false and maxUses is null', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: false, maxUses: null });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - valid when degradesOnUse is false and maxUses is zero', () => {
  // maxUses is irrelevant when catalyst does not degrade
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: false, maxUses: 0 });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - valid when degradesOnUse is false and maxUses is negative', () => {
  // maxUses is irrelevant when catalyst does not degrade
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: false, maxUses: -1 });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - valid when degradesOnUse is false and maxUses is positive integer', () => {
  // maxUses is accepted but ignored when catalyst does not degrade
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: false, maxUses: 5 });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - valid when degradesOnUse is true and maxUses is null (unlimited)', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: null });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - valid when degradesOnUse is true and maxUses is positive integer', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 5 });
  const result = cat.validate();
  assert.equal(result.valid, true);
});

test('Catalyst.validate - invalid when degradesOnUse is true and maxUses is zero', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 0 });
  const result = cat.validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /maxUses/.test(e)));
});

test('Catalyst.validate - invalid when degradesOnUse is true and maxUses is negative', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: -1 });
  const result = cat.validate();
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /maxUses/.test(e)));
});

test('Catalyst.validate - error message mentions degradesOnUse context', () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 0 });
  const result = cat.validate();
  assert.ok(result.errors.some(e => /degradesOnUse/.test(e)));
});

// ---------------------------------------------------------------------------
// T-006: applyDegradation - increment, exhaustion, destruction, legacy migration
// ---------------------------------------------------------------------------

test('applyDegradation - does nothing when degradesOnUse is false', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: false });
  const item = new FakeItem();
  await cat.applyDegradation(item);
  // No catalystItemUsage flag should be set (path: fabricate.catalystItemUsage under scope 'fabricate')
  assert.equal(item.getFlag('fabricate', 'fabricate.catalystItemUsage'), undefined);
  assert.equal(item.deleted, false);
});

test('applyDegradation - increments timesUsed from 0 to 1 on first use', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 5 });
  const item = new FakeItem();
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 1 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - increments timesUsed from existing value (2 to 3)', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 10 });
  // Seed with existing usage: _flags.fabricate.fabricate.catalystItemUsage = { timesUsed: 2 }
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 2 } } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 3 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - does not delete item when timesUsed < maxUses', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, destroyWhenExhausted: true, maxUses: 3 });
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 1 } } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 2 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - deletes item when timesUsed reaches maxUses and destroyWhenExhausted is true', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, destroyWhenExhausted: true, maxUses: 3 });
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 2 } } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 3 });
  assert.equal(item.deleted, true);
});

test('applyDegradation - does not delete when destroyWhenExhausted is false even at maxUses', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, destroyWhenExhausted: false, maxUses: 3 });
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 2 } } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 3 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - does not delete when maxUses is null (unlimited uses)', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, destroyWhenExhausted: true, maxUses: null });
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 999 } } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 1000 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - migrates legacy catalystUses bare number to new shape', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 10 });
  // Legacy format: bare number stored at _flags.fabricate.fabricate.catalystUses
  const item = new FakeItem({ fabricate: { catalystUses: 5 } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  // Should have migrated 5 uses and then incremented to 6
  assert.deepEqual(usage, { timesUsed: 6 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - legacy migration with zero uses starts from 0', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 10 });
  const item = new FakeItem({ fabricate: { catalystUses: 0 } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 1 });
  assert.equal(item.deleted, false);
});

test('applyDegradation - legacy migration triggers destruction when migrated count reaches maxUses', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, destroyWhenExhausted: true, maxUses: 3 });
  // Legacy: 2 uses already recorded
  const item = new FakeItem({ fabricate: { catalystUses: 2 } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  assert.deepEqual(usage, { timesUsed: 3 });
  assert.equal(item.deleted, true);
});

test('applyDegradation - new format takes precedence over legacy when both exist', async () => {
  const cat = new Catalyst({ componentId: 'x', degradesOnUse: true, maxUses: 10 });
  // Both old and new flags present; new should take precedence
  const item = new FakeItem({ fabricate: { catalystItemUsage: { timesUsed: 7 }, catalystUses: 2 } });
  await cat.applyDegradation(item);
  const usage = item.getFlag('fabricate', 'fabricate.catalystItemUsage');
  // Should use 7 from new format, not 2 from legacy
  assert.deepEqual(usage, { timesUsed: 8 });
  assert.equal(item.deleted, false);
});
