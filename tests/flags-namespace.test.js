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
    this._flags[scope][key] = value;
    return value;
  }

  async update(changes) {
    for (const [path, value] of Object.entries(changes)) {
      const [root, scope] = String(path).split('.');
      if (root === 'flags' && !this.activeScopes.has(scope)) {
        throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
      }
      setPathValue({ flags: this._flags }, path, value);
    }
    return this;
  }

  updateSource() {}
}

test('setFabricateFlag writes a nested value that Foundry V13 getFlag can read', async () => {
  const doc = new FakeDocument();
  const payload = { recipe1: { learnedAt: 123 } };
  await setFabricateFlag(doc, 'learnedRecipes', payload);
  assert.deepEqual(doc.flags.fabricate.fabricate.learnedRecipes, payload);
  assert.deepEqual(getFabricateFlag(doc, 'learnedRecipes'), payload);
  assert.equal(doc.flags.fabricate['fabricate.learnedRecipes'], undefined);
});

test('setFabricateFlag preserves nested siblings through one flattened update', async () => {
  const doc = new FakeDocument({
    flags: {
      fabricate: {
        fabricate: {
          roles: {
            sysA: { componentId: 'component-1' },
            sysB: { toolId: 'tool-b' },
          },
        },
      },
    },
  });

  await setFabricateFlag(doc, 'roles.sysA.toolId', 'tool-a');

  assert.deepEqual(doc.flags.fabricate.fabricate.roles, {
    sysA: { componentId: 'component-1', toolId: 'tool-a' },
    sysB: { toolId: 'tool-b' },
  });
});

test('setFabricateFlag preserves the dotted-key contract for non-DataModel collaborators', async () => {
  const setFlagCalls = [];
  const doc = {
    flags: {
      fabricate: { fabricate: { roles: { sysA: { componentId: 'component-1' } } } },
    },
    getFlag(scope, key) {
      return getPathValue(this.flags[scope], key);
    },
    async setFlag(scope, key, value) {
      setFlagCalls.push({ scope, key, value });
      setPathValue(this.flags[scope], key, value);
      return value;
    },
  };

  await setFabricateFlag(doc, 'roles.sysA.toolId', 'tool-a');

  assert.deepEqual(setFlagCalls, [
    { scope: 'fabricate', key: 'fabricate.roles.sysA.toolId', value: 'tool-a' },
  ]);
  assert.deepEqual(doc.flags.fabricate.fabricate.roles.sysA, {
    componentId: 'component-1',
    toolId: 'tool-a',
  });
});

test('setFabricateFlag stores null as a value rather than treating it as deletion', async () => {
  const doc = new FakeDocument({
    flags: {
      fabricate: {
        fabricate: { roles: { sysA: { componentId: 'component-1', toolId: 'tool-a' } } },
      },
    },
  });

  await setFabricateFlag(doc, 'roles.sysA.toolId', null);

  assert.equal(Object.hasOwn(doc.flags.fabricate.fabricate.roles.sysA, 'toolId'), true);
  assert.equal(doc.flags.fabricate.fabricate.roles.sysA.toolId, null);
  assert.equal(doc.flags.fabricate.fabricate.roles.sysA.componentId, 'component-1');
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

test('getFabricateFlag fails closed but setFabricateFlag surfaces an invalid scope', async () => {
  const doc = new FakeDocument({ activeScopes: [] });
  assert.equal(getFabricateFlag(doc, 'craftingRuns', 'fallback'), 'fallback');
  await assert.rejects(
    () => setFabricateFlag(doc, 'craftingRuns', { active: {}, history: [] }),
    /not valid or not currently active/,
  );
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
