import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFabricateFlag,
  setFabricateFlag,
  stampItemDataRoleIdentity,
} from '../src/config/flags.js';

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

class FakeDocument {
  constructor({ activeScopes = ['fabricate'], flags = {} } = {}) {
    this.activeScopes = new Set(activeScopes);
    this._flags = flags;
  }

  get flags() {
    return this._flags;
  }

  getFlag(scope, key) {
    if (!this.activeScopes.has(scope)) {
      throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    }
    return getPathValue(this._flags[scope], key);
  }

  async setFlag(scope, key, value) {
    if (!this.activeScopes.has(scope)) {
      throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    }
    if (!this._flags[scope] || typeof this._flags[scope] !== 'object') {
      this._flags[scope] = {};
    }
    setPathValue(this._flags[scope], key, value);
    return value;
  }
}

test('setFabricateFlag writes under fabricate namespace and fabricate.* key', async () => {
  const doc = new FakeDocument();
  const payload = { recipe1: { learnedAt: 123 } };
  await setFabricateFlag(doc, 'learnedRecipes', payload);
  assert.deepEqual(doc.flags.fabricate.fabricate.learnedRecipes, payload);
});

test('getFabricateFlag reads fabricate.* key from fabricate namespace', () => {
  const payload = { active: { run1: { id: 'run1' } }, history: [] };
  const doc = new FakeDocument({
    flags: {
      fabricate: {
        fabricate: {
          craftingRuns: payload
        }
      }
    }
  });

  assert.deepEqual(getFabricateFlag(doc, 'craftingRuns', null), payload);
});

test('getFabricateFlag returns default for missing value', () => {
  const doc = new FakeDocument();
  assert.equal(getFabricateFlag(doc, 'missing', 'fallback'), 'fallback');
});

test('getFabricateFlag and setFabricateFlag fail closed when scope is invalid', async () => {
  const doc = new FakeDocument({ activeScopes: [] });
  assert.equal(getFabricateFlag(doc, 'craftingRuns', 'fallback'), 'fallback');
  const result = await setFabricateFlag(doc, 'craftingRuns', { active: {}, history: [] });
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// stampItemDataRoleIdentity (issue 780): the shared write-side stamp behind every
// creation site that needs a durable per-system identity leaf. Builds the
// doubly-nested `flags.fabricate.fabricate.roles[systemId][roleKey]` path with a
// dotted-systemId guard and sibling-preserving `||=`.
// ---------------------------------------------------------------------------

test('stampItemDataRoleIdentity builds the doubly-nested roles path', () => {
  const itemData = {};
  stampItemDataRoleIdentity(itemData, 'sysA', 'componentId', 'comp-1');
  assert.equal(itemData.flags.fabricate.fabricate.roles.sysA.componentId, 'comp-1');
});

test('stampItemDataRoleIdentity stamps an arbitrary role leaf (toolId)', () => {
  const itemData = {};
  stampItemDataRoleIdentity(itemData, 'sysA', 'toolId', 'tool-9');
  assert.equal(itemData.flags.fabricate.fabricate.roles.sysA.toolId, 'tool-9');
});

test('stampItemDataRoleIdentity rejects a dotted (unsafe) systemId — no mis-nested path', () => {
  const itemData = {};
  stampItemDataRoleIdentity(itemData, 'sys.with.dots', 'componentId', 'comp-1');
  assert.equal(itemData.flags, undefined, 'an unsafe system id writes nothing at all');
});

test('stampItemDataRoleIdentity rejects a missing id or roleKey', () => {
  const noId = {};
  stampItemDataRoleIdentity(noId, 'sysA', 'componentId', null);
  assert.equal(noId.flags, undefined, 'a nullish id stamps nothing');

  const noRole = {};
  stampItemDataRoleIdentity(noRole, 'sysA', null, 'comp-1');
  assert.equal(noRole.flags, undefined, 'a nullish roleKey stamps nothing');

  const noItem = stampItemDataRoleIdentity(null, 'sysA', 'componentId', 'comp-1');
  assert.equal(noItem, undefined, 'a nullish itemData is a safe no-op');
});

test('stampItemDataRoleIdentity preserves sibling flags and sibling-system roles leaves', () => {
  const itemData = {
    flags: {
      core: { sourceId: 'Item.src' },
      fabricate: { fabricate: { roles: { sysB: { componentId: 'other' } } } },
    },
  };
  stampItemDataRoleIdentity(itemData, 'sysA', 'componentId', 'comp-1');
  assert.equal(itemData.flags.core.sourceId, 'Item.src', 'unrelated sibling flags survive');
  assert.equal(
    itemData.flags.fabricate.fabricate.roles.sysB.componentId,
    'other',
    'a roles leaf for a DIFFERENT system survives'
  );
  assert.equal(itemData.flags.fabricate.fabricate.roles.sysA.componentId, 'comp-1');
});

test('stampItemDataRoleIdentity co-stamps componentId and toolId under one system leaf', () => {
  const itemData = {};
  stampItemDataRoleIdentity(itemData, 'sysA', 'componentId', 'comp-1');
  stampItemDataRoleIdentity(itemData, 'sysA', 'toolId', 'tool-1');
  assert.deepEqual(itemData.flags.fabricate.fabricate.roles.sysA, {
    componentId: 'comp-1',
    toolId: 'tool-1',
  });
});
