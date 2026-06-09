import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInteractableRegionBehaviorClass,
  assignInteractableBehaviorRegistration,
  registerInteractableRegionBehavior
} from '../../../src/canvas/regions/FabricateInteractableRegionBehavior.js';
import { INTERACTABLE_BEHAVIOR_SUBTYPE } from '../../../src/canvas/regions/interactableRegionFlags.js';

class FakeRegionBehaviorType {}

function makeFakeFields() {
  function makeFieldClass(kind) {
    return class FakeField {
      constructor(options = {}) {
        this.kind = kind;
        this.options = options;
      }
    };
  }
  class FakeSchemaField {
    constructor(fieldMap = {}, options = {}) {
      this.kind = 'SchemaField';
      this.fields = fieldMap;
      this.options = options;
    }
  }
  return {
    StringField: makeFieldClass('StringField'),
    BooleanField: makeFieldClass('BooleanField'),
    NumberField: makeFieldClass('NumberField'),
    ObjectField: makeFieldClass('ObjectField'),
    SchemaField: FakeSchemaField
  };
}

function makeFakeConfig() {
  return {
    RegionBehavior: {
      dataModels: {},
      typeIcons: {},
      typeLabels: {}
    }
  };
}

test('factory builds a subclass whose defineSchema returns the behaviour schema', () => {
  const Class = createInteractableRegionBehaviorClass({
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  assert.ok(Class.prototype instanceof FakeRegionBehaviorType);
  const schema = Class.defineSchema();
  assert.ok(schema.interactableType);
  assert.ok(schema.state);
  assert.equal(schema.node.kind, 'ObjectField');
});

test('factory rejects a missing base class or fields namespace', () => {
  assert.throws(() => createInteractableRegionBehaviorClass({ fields: makeFakeFields() }));
  assert.throws(() => createInteractableRegionBehaviorClass({ RegionBehaviorType: FakeRegionBehaviorType }));
});

test('static events expose tokenEnter/tokenExit that no-throw when no manager is present', async () => {
  const previousGame = globalThis.game;
  const previousFabricate = globalThis.fabricate;
  delete globalThis.game;
  delete globalThis.fabricate;
  try {
    const Class = createInteractableRegionBehaviorClass({
      RegionBehaviorType: FakeRegionBehaviorType,
      fields: makeFakeFields()
    });
    assert.equal(typeof Class.events.tokenEnter, 'function');
    assert.equal(typeof Class.events.tokenExit, 'function');
    // `this` is undefined here; the handlers must still resolve without throwing.
    await assert.doesNotReject(Class.events.tokenEnter.call(undefined, { user: 'u' }));
    await assert.doesNotReject(Class.events.tokenExit.call(undefined, { user: 'u' }));
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
    if (previousFabricate === undefined) delete globalThis.fabricate; else globalThis.fabricate = previousFabricate;
  }
});

test('static events delegate to the manager seam when present', async () => {
  const previousGame = globalThis.game;
  const calls = [];
  globalThis.game = {
    fabricate: {
      interactableManager: {
        onRegionEnter: async (event) => { calls.push(['enter', event]); },
        onRegionExit: async (event) => { calls.push(['exit', event]); }
      }
    }
  };
  try {
    const Class = createInteractableRegionBehaviorClass({
      RegionBehaviorType: FakeRegionBehaviorType,
      fields: makeFakeFields()
    });
    await Class.events.tokenEnter.call({ id: 'b1' }, { user: 'u' });
    await Class.events.tokenExit.call({ id: 'b1' }, { user: 'u' });
    assert.deepEqual(calls.map((c) => c[0]), ['enter', 'exit']);
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test('assignInteractableBehaviorRegistration mutates a fake config and is idempotent', () => {
  const config = makeFakeConfig();
  const Class = createInteractableRegionBehaviorClass({
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  const registered = assignInteractableBehaviorRegistration(config, Class, { icon: 'fas fa-x', label: 'FABRICATE.X' });
  assert.equal(registered, Class);
  assert.equal(config.RegionBehavior.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE], Class);
  assert.equal(config.RegionBehavior.typeIcons[INTERACTABLE_BEHAVIOR_SUBTYPE], 'fas fa-x');
  assert.equal(config.RegionBehavior.typeLabels[INTERACTABLE_BEHAVIOR_SUBTYPE], 'FABRICATE.X');

  // Idempotent: a second call with a different class does NOT overwrite.
  class OtherClass extends FakeRegionBehaviorType {}
  const again = assignInteractableBehaviorRegistration(config, OtherClass);
  assert.equal(again, Class);
  assert.equal(config.RegionBehavior.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE], Class);
});

test('assignInteractableBehaviorRegistration is a no-op for a malformed config', () => {
  assert.equal(assignInteractableBehaviorRegistration({}, function () {}), null);
  assert.equal(assignInteractableBehaviorRegistration({ RegionBehavior: {} }, function () {}), null);
});

test('registerInteractableRegionBehavior resolves injected deps and registers', () => {
  const config = makeFakeConfig();
  const Class = registerInteractableRegionBehavior(config, {
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  assert.ok(typeof Class === 'function');
  assert.equal(config.RegionBehavior.dataModels[INTERACTABLE_BEHAVIOR_SUBTYPE], Class);
  assert.equal(config.RegionBehavior.typeIcons[INTERACTABLE_BEHAVIOR_SUBTYPE], 'fas fa-mortar-pestle');
  assert.ok(typeof config.RegionBehavior.typeLabels[INTERACTABLE_BEHAVIOR_SUBTYPE] === 'string');
});

test('registerInteractableRegionBehavior is idempotent (returns the existing class)', () => {
  const config = makeFakeConfig();
  const first = registerInteractableRegionBehavior(config, {
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  const second = registerInteractableRegionBehavior(config, {
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  assert.equal(first, second);
});

test('registerInteractableRegionBehavior is a defensive no-op when deps are missing', () => {
  // No injected deps and no globalThis.foundry → null, no throw.
  const previousFoundry = globalThis.foundry;
  delete globalThis.foundry;
  try {
    assert.equal(registerInteractableRegionBehavior(makeFakeConfig(), {}), null);
    // Missing dataModels block → null.
    assert.equal(
      registerInteractableRegionBehavior({ RegionBehavior: {} }, { RegionBehaviorType: FakeRegionBehaviorType, fields: makeFakeFields() }),
      null
    );
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry; else globalThis.foundry = previousFoundry;
  }
});
