import test from 'node:test';
import assert from 'node:assert/strict';

import {
  forcedDeletionEntry,
  getFabricateFlag,
  markForcedDeletion,
  setFabricateFlag,
  stampItemDataRoleIdentity,
} from '../src/config/flags.js';
import {
  assertNoLegacyDeletionKeys,
  FakeForcedDeletion,
  forEachDeletionForm,
  isForcedDeletion,
} from './helpers/forcedDeletion.js';

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

// stampItemDataRoleIdentity (issue 780): the shared write-side stamp behind every creation site
// that needs a durable per-system identity leaf.

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

// Forced deletion (issue 1842): one helper spells the deletion for whichever build is running.

forEachDeletionForm('forcedDeletionEntry spells the deletion for the running build', (deletion) => {
  deletion.apply();
  const [path, value] = forcedDeletionEntry('flags.fabricate.state', 'retired');
  if (deletion.v14) {
    assert.equal(path, 'flags.fabricate.state.retired');
    assert.ok(isForcedDeletion(value), 'V14 carries the operator at the bare key');
  } else {
    assert.deepEqual([path, value], ['flags.fabricate.state.-=retired', null]);
  }
});

forEachDeletionForm('markForcedDeletion marks a value-tree node for the running build', (deletion) => {
  deletion.apply();
  const node = { kept: 1 };
  assert.equal(markForcedDeletion(node, 'gone'), node);
  if (deletion.v14) {
    assert.deepEqual(Object.keys(node), ['kept', 'gone']);
    assert.ok(isForcedDeletion(node.gone));
  } else {
    assert.deepEqual(node, { kept: 1, '-=gone': null });
  }
});

forEachDeletionForm('both forms refuse an unsafe key and skip a prototype segment', (deletion) => {
  deletion.apply();
  for (const key of ['a.b', '', '-=x', 'has space', 7, undefined]) {
    assert.throws(() => forcedDeletionEntry('flags.x', key), TypeError, `entry for ${String(key)}`);
    assert.throws(() => markForcedDeletion({}, key), TypeError, `mark for ${String(key)}`);
  }
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const node = {};
    assert.equal(forcedDeletionEntry('flags.x', key), null, key);
    assert.equal(markForcedDeletion(node, key), null, key);
    assert.deepEqual(Object.keys(node), [], `${key} leaves the node unmarked`);
  }
  assert.equal(isForcedDeletion(forcedDeletionEntry('flags.x', 'ok')[1]), deletion.v14);
});

test('the operator is detected at call time, never cached at module load', (t) => {
  assert.deepEqual(forcedDeletionEntry('p', 'k'), ['p.-=k', null], 'no operator yet');
  const priorFoundry = globalThis.foundry;
  t.after(() => {
    globalThis.foundry = priorFoundry;
  });
  globalThis.foundry = { data: { operators: { ForcedDeletion: FakeForcedDeletion } } };
  assert.ok(isForcedDeletion(forcedDeletionEntry('p', 'k')[1]), 'installed after import');
  globalThis.foundry = { data: { operators: {} } };
  assert.deepEqual(forcedDeletionEntry('p', 'k'), ['p.-=k', null], 'and removed again');
});

test('a non-function ForcedDeletion falls back to the V13 form', (t) => {
  const priorFoundry = globalThis.foundry;
  t.after(() => {
    globalThis.foundry = priorFoundry;
  });
  for (const ForcedDeletion of [{}, 'ForcedDeletion', null, 1]) {
    globalThis.foundry = { data: { operators: { ForcedDeletion } } };
    assert.deepEqual(forcedDeletionEntry('p', 'k'), ['p.-=k', null]);
    assert.deepEqual(markForcedDeletion({}, 'k'), { '-=k': null });
  }
});

test('the anti-guard finds a legacy key at any depth, in a dotted segment and inside an array', () => {
  const refused = (path, key) => (error) =>
    error.message.startsWith(`${path} carries the legacy deletion key "${key}"`);
  assert.throws(
    () => assertNoLegacyDeletionKeys({ a: { b: { '-=gone': null } } }),
    refused('payload.a.b', '-=gone')
  );
  assert.throws(
    () => assertNoLegacyDeletionKeys({ 'flags.fabricate.-=gone.x': null }),
    refused('payload', 'flags.fabricate.-=gone.x')
  );
  assert.throws(
    () => assertNoLegacyDeletionKeys({ list: [{ ok: 1 }, { '-=gone': null }] }),
    refused('payload.list.1', '-=gone')
  );
  assert.doesNotThrow(() =>
    assertNoLegacyDeletionKeys({
      'flags.fabricate.gone': new FakeForcedDeletion(),
      active: { run: new FakeForcedDeletion(), kept: { id: 'run' } },
      list: [new FakeForcedDeletion()],
    })
  );
});
