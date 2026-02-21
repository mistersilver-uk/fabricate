import test from 'node:test';
import assert from 'node:assert/strict';

import { getFabricateFlag, setFabricateFlag } from '../src/config/flags.js';

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
