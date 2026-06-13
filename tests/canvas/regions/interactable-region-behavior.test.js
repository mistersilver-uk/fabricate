import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createInteractableRegionBehaviorClass,
  assignInteractableBehaviorRegistration,
  registerInteractableRegionBehavior
} from '../../../src/canvas/regions/FabricateInteractableRegionBehavior.js';
import { INTERACTABLE_BEHAVIOR_SUBTYPE } from '../../../src/canvas/regions/interactableRegionFlags.js';

class FakeRegionBehaviorType {}

// A base class whose static `_createEventsField` records its args and returns a
// recognisable sentinel field, mirroring the V13 RegionBehaviorType seam Foundry
// uses to populate the behaviour's `events` subscription Set.
class FakeRegionBehaviorTypeWithEvents {
  static lastEventsArgs = null;
  static _createEventsField(args) {
    FakeRegionBehaviorTypeWithEvents.lastEventsArgs = args;
    return { kind: 'EventsField', args };
  }
}

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
  // A gatheringTask interactable may be linked to the task or own its own node
  // pool, gated by the `taskNodeLink` discriminator (default 'linked').
  assert.ok(schema.taskNodeLink);
  assert.ok('node' in schema);
});

test('defineSchema subscribes to tokenEnter/tokenExit via the base events field', () => {
  FakeRegionBehaviorTypeWithEvents.lastEventsArgs = null;
  const Class = createInteractableRegionBehaviorClass({
    RegionBehaviorType: FakeRegionBehaviorTypeWithEvents,
    fields: makeFakeFields()
  });
  const schema = Class.defineSchema();
  // The subscription field is built from the base static `_createEventsField`,
  // restricting + defaulting the subscribed set to the token enter/exit events.
  assert.equal(schema.events.kind, 'EventsField');
  assert.deepEqual(FakeRegionBehaviorTypeWithEvents.lastEventsArgs, {
    events: ['tokenEnter', 'tokenExit'],
    initial: ['tokenEnter', 'tokenExit']
  });
  // The static `events` handler MAP (dispatch) is independent of the subscription
  // field and still exposes both handlers.
  assert.equal(typeof Class.events.tokenEnter, 'function');
  assert.equal(typeof Class.events.tokenExit, 'function');
});

test('defineSchema degrades gracefully when _createEventsField is absent', () => {
  // FakeRegionBehaviorType has no `_createEventsField`: no throw, schema returned
  // without an `events` field (the behaviour simply subscribes to nothing).
  const Class = createInteractableRegionBehaviorClass({
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  const schema = Class.defineSchema();
  assert.ok(schema.interactableType);
  assert.equal(schema.events, undefined);
  assert.equal(typeof Class.events.tokenEnter, 'function');
  assert.equal(typeof Class.events.tokenExit, 'function');
});

test('the class declares LOCALIZATION_PREFIXES and every schema field path is labeled in en.json', () => {
  const Class = createInteractableRegionBehaviorClass({
    RegionBehaviorType: FakeRegionBehaviorType,
    fields: makeFakeFields()
  });
  // The prefix drives the core schema-driven sheet's field labels/hints.
  assert.deepEqual(Class.LOCALIZATION_PREFIXES, ['FABRICATE.RegionBehavior.Interactable']);

  const lang = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../lang/en.json', import.meta.url)), 'utf8')
  );
  const fieldsBlock = lang?.FABRICATE?.RegionBehavior?.Interactable?.FIELDS;
  assert.ok(fieldsBlock && typeof fieldsBlock === 'object', 'en.json declares the FIELDS block');

  // Walk the built schema's field paths (the fake SchemaField stores `.fields`)
  // and assert each leaf field has a label so nothing renders blank on the sheet.
  const schema = Class.defineSchema();
  const leafPaths = [];
  const walk = (fieldMap, prefix) => {
    for (const [name, field] of Object.entries(fieldMap)) {
      if (name === 'events') continue; // the base subscription field, not ours.
      const path = prefix ? `${prefix}.${name}` : name;
      if (field?.kind === 'SchemaField' && field.fields && typeof field.fields === 'object') {
        walk(field.fields, path);
      } else {
        leafPaths.push(path);
      }
    }
  };
  walk(schema, '');

  const resolveLabel = (path) => {
    let node = fieldsBlock;
    for (const segment of path.split('.')) {
      node = node?.[segment];
      if (!node) return null;
    }
    return typeof node?.label === 'string' && node.label.trim() ? node.label : null;
  };

  for (const path of leafPaths) {
    assert.ok(resolveLabel(path), `FIELDS.${path}.label must be present so the field is not blank`);
  }
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

test('static events pass the RegionBehavior DOCUMENT (this.behavior), not the data model', async () => {
  // In V13 a `RegionBehaviorType` `static events` handler runs with `this` bound
  // to the DATA MODEL (the `system`), whose `type`/`system`/`parent` are NOT the
  // document's. The manager needs the DOCUMENT, so the handler must forward
  // `this.behavior`. Here `this` is a fake data model whose `behavior` getter
  // returns a fake RegionBehavior document; the manager must receive THAT, never
  // the data model itself.
  const previousGame = globalThis.game;
  const captured = [];
  const fakeDocument = { type: 'fabricate.interactable', system: { interactableType: 'tool' } };
  const fakeDataModel = {
    interactableType: 'tool', // a bare system field — proves we did NOT forward `this`
    get behavior() { return fakeDocument; }
  };
  globalThis.game = {
    fabricate: {
      interactableManager: {
        onRegionEnter: async (_event, behavior) => { captured.push(['enter', behavior]); },
        onRegionExit: async (_event, behavior) => { captured.push(['exit', behavior]); }
      }
    }
  };
  try {
    const Class = createInteractableRegionBehaviorClass({
      RegionBehaviorType: FakeRegionBehaviorType,
      fields: makeFakeFields()
    });
    await Class.events.tokenEnter.call(fakeDataModel, { user: 'u' });
    await Class.events.tokenExit.call(fakeDataModel, { user: 'u' });
    assert.equal(captured.length, 2);
    assert.equal(captured[0][1], fakeDocument, 'tokenEnter forwarded the document');
    assert.notEqual(captured[0][1], fakeDataModel, 'tokenEnter did NOT forward the data model');
    assert.equal(captured[1][1], fakeDocument, 'tokenExit forwarded the document');
    assert.notEqual(captured[1][1], fakeDataModel, 'tokenExit did NOT forward the data model');
  } finally {
    if (previousGame === undefined) delete globalThis.game; else globalThis.game = previousGame;
  }
});

test('static events fall back to this.parent when this.behavior is absent', async () => {
  // Some base shapes expose the parent document via `this.parent` rather than the
  // `this.behavior` getter; the handler must use it as the next fallback.
  const previousGame = globalThis.game;
  const captured = [];
  const fakeDocument = { type: 'fabricate.interactable', system: { interactableType: 'tool' } };
  const fakeDataModel = { interactableType: 'tool', parent: fakeDocument };
  globalThis.game = {
    fabricate: {
      interactableManager: {
        onRegionEnter: async (_event, behavior) => { captured.push(['enter', behavior]); },
        onRegionExit: async (_event, behavior) => { captured.push(['exit', behavior]); }
      }
    }
  };
  try {
    const Class = createInteractableRegionBehaviorClass({
      RegionBehaviorType: FakeRegionBehaviorType,
      fields: makeFakeFields()
    });
    await Class.events.tokenEnter.call(fakeDataModel, { user: 'u' });
    await Class.events.tokenExit.call(fakeDataModel, { user: 'u' });
    assert.equal(captured[0][1], fakeDocument, 'tokenEnter forwarded this.parent');
    assert.equal(captured[1][1], fakeDocument, 'tokenExit forwarded this.parent');
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
