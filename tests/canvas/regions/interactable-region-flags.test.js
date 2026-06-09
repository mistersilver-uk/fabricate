import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  buildInteractableBehaviorSchema,
  buildInteractableBehaviorSystem,
  readInteractableBehaviorSystem,
  isInteractableRegionBehavior,
  buildLinkedVisualFlags,
  readLinkedVisualRef
} from '../../../src/canvas/regions/interactableRegionFlags.js';

/**
 * A fake `foundry.data.fields` namespace. Each field class records its own kind +
 * the options it was constructed with, so the schema shape is fully inspectable
 * without Foundry.
 */
function makeFakeFields() {
  function makeFieldClass(kind) {
    return class FakeField {
      constructor(options = {}) {
        this.kind = kind;
        this.options = options;
      }
    };
  }
  // SchemaField records its nested field map so we can assert nested shapes.
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

test('exposes the behaviour subtype constant', () => {
  assert.equal(INTERACTABLE_BEHAVIOR_SUBTYPE, 'fabricate.interactable');
});

test('buildInteractableBehaviorSchema produces the full field set with a fake fields namespace', () => {
  const schema = buildInteractableBehaviorSchema(makeFakeFields());

  assert.deepEqual(Object.keys(schema).sort(), [
    'activation',
    'environmentId',
    'interactableType',
    'linkedVisual',
    'name',
    'presentation',
    'sourceUuid',
    'state',
    'systemId',
    'taskId',
    'toolId'
  ]);

  assert.equal(schema.interactableType.kind, 'StringField');
  assert.deepEqual(schema.interactableType.options.choices, ['tool', 'gatheringTask']);
  assert.equal(schema.interactableType.options.blank, false);

  assert.equal(schema.sourceUuid.kind, 'StringField');
  assert.equal(schema.systemId.kind, 'StringField');

  for (const nullableKey of ['toolId', 'taskId', 'environmentId']) {
    assert.equal(schema[nullableKey].kind, 'StringField', nullableKey);
    assert.equal(schema[nullableKey].options.nullable, true, nullableKey);
    assert.equal(schema[nullableKey].options.initial, null, nullableKey);
  }

  assert.equal(schema.name.kind, 'StringField');
  // A region-first interactable carries NO per-interactable node pool — the
  // environment's `nodeRuntime[taskId]` owns depletion/respawn — so there is no
  // behaviour `node` schema field.
  assert.equal('node' in schema, false);
});

test('buildInteractableBehaviorSchema nests presentation/linkedVisual/state/activation with the right choices', () => {
  const schema = buildInteractableBehaviorSchema(makeFakeFields());

  assert.equal(schema.presentation.kind, 'SchemaField');
  assert.equal(schema.presentation.fields.promptText.options.nullable, true);
  assert.equal(schema.presentation.fields.hidden.kind, 'BooleanField');

  const lv = schema.linkedVisual.fields;
  assert.equal(lv.uuid.options.nullable, true);
  assert.deepEqual(lv.documentName.options.choices, ['Tile', 'Drawing', 'Token']);
  assert.equal(lv.documentName.options.nullable, true);
  assert.deepEqual(lv.mode.options.choices, ['marker', 'none']);
  assert.equal(lv.mode.options.initial, 'marker');
  assert.deepEqual(lv.missingPolicy.options.choices, ['ignore', 'warn', 'recreate']);
  assert.equal(lv.missingPolicy.options.initial, 'warn');

  const state = schema.state.fields;
  assert.equal(state.enabled.options.initial, true);
  assert.equal(state.consumed.options.initial, false);
  assert.equal(state.locked.options.initial, false);
  assert.equal(state.uses.kind, 'SchemaField');
  assert.equal(state.uses.fields.max.options.nullable, true);
  assert.equal(state.uses.fields.used.kind, 'NumberField');
  assert.equal(state.cooldown.fields.seconds.options.nullable, true);
  assert.equal(state.cooldown.fields.lastUsedWorldTime.options.nullable, true);

  const activation = schema.activation.fields;
  assert.deepEqual(activation.trigger.options.choices, ['regionEnter']);
  assert.deepEqual(activation.audience.options.choices, ['players', 'all']);
});

test('buildInteractableBehaviorSchema rejects a missing fields namespace', () => {
  assert.throws(() => buildInteractableBehaviorSchema());
  assert.throws(() => buildInteractableBehaviorSchema(null));
});

test('buildInteractableBehaviorSystem applies sane defaults for a tool', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    systemId: 'sys',
    toolId: 't1',
    name: 'Forge Anvil'
  });
  assert.equal(system.interactableType, 'tool');
  assert.equal(system.toolId, 't1');
  assert.equal(system.taskId, null);
  assert.equal(system.environmentId, null);
  assert.equal('node' in system, false, 'no per-interactable node field');
  assert.deepEqual(system.state, {
    enabled: true,
    consumed: false,
    locked: false,
    uses: { max: null, used: 0 },
    cooldown: { seconds: null, lastUsedWorldTime: null }
  });
  assert.deepEqual(system.activation, { trigger: 'regionEnter', audience: 'players' });
  assert.deepEqual(system.linkedVisual, {
    uuid: null,
    documentName: null,
    mode: 'marker',
    missingPolicy: 'warn'
  });
  assert.deepEqual(system.presentation, { promptText: null, hidden: false });
});

test('buildInteractableBehaviorSystem carries the environment for a gathering task (no per-interactable node)', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    systemId: 'sys',
    taskId: 'task1',
    environmentId: 'env-7',
    presentation: { promptText: 'Mine here', hidden: true },
    linkedVisual: { uuid: 'Scene.s.Tile.t', documentName: 'Tile', mode: 'none', missingPolicy: 'recreate' }
  });
  assert.equal(system.taskId, 'task1');
  assert.equal(system.toolId, null);
  assert.equal(system.environmentId, 'env-7');
  assert.equal('node' in system, false, 'no per-interactable node field');
  assert.deepEqual(system.presentation, { promptText: 'Mine here', hidden: true });
  assert.deepEqual(system.linkedVisual, {
    uuid: 'Scene.s.Tile.t',
    documentName: 'Tile',
    mode: 'none',
    missingPolicy: 'recreate'
  });
});

test('buildInteractableBehaviorSystem never emits a node and rejects bad input', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    systemId: 'sys'
  });
  assert.equal('node' in system, false, 'no per-interactable node field');
  assert.throws(() => buildInteractableBehaviorSystem({ interactableType: 'nope', sourceUuid: 'x' }));
  assert.throws(() => buildInteractableBehaviorSystem({ interactableType: 'tool', sourceUuid: '  ' }));
});

test('readInteractableBehaviorSystem round-trips a built system on a fake behaviour', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    systemId: 'sys',
    taskId: 'task1',
    environmentId: 'env-1',
    name: 'Iron Vein'
  });
  const behavior = { type: 'fabricate.interactable', system };
  const view = readInteractableBehaviorSystem(behavior);
  assert.equal(view.interactableType, 'gatheringTask');
  assert.equal(view.taskId, 'task1');
  assert.equal(view.environmentId, 'env-1');
  assert.equal(view.name, 'Iron Vein');
  assert.equal('node' in view, false, 'the reader does not surface a per-interactable node');
  assert.equal(view.state.enabled, true);
  assert.equal(view.activation.trigger, 'regionEnter');
});

test('readInteractableBehaviorSystem defends against partial/absent state', () => {
  const view = readInteractableBehaviorSystem({
    type: 'fabricate.interactable',
    system: { interactableType: 'tool', sourceUuid: 'x', systemId: 's' }
  });
  assert.equal(view.state.enabled, true);
  assert.equal(view.state.consumed, false);
  assert.deepEqual(view.state.uses, { max: null, used: 0 });
  assert.deepEqual(view.state.cooldown, { seconds: null, lastUsedWorldTime: null });
});

test('readInteractableBehaviorSystem returns null for non-interactables', () => {
  assert.equal(readInteractableBehaviorSystem(null), null);
  assert.equal(readInteractableBehaviorSystem({}), null);
  assert.equal(readInteractableBehaviorSystem({ type: 'other', system: {} }), null);
  assert.equal(
    readInteractableBehaviorSystem({ type: 'fabricate.interactable', system: { interactableType: 'mystery' } }),
    null
  );
});

test('isInteractableRegionBehavior is a type predicate tolerant of null', () => {
  assert.equal(isInteractableRegionBehavior({ type: 'fabricate.interactable' }), true);
  assert.equal(isInteractableRegionBehavior({ type: 'other' }), false);
  assert.equal(isInteractableRegionBehavior(null), false);
  assert.equal(isInteractableRegionBehavior(undefined), false);
  assert.equal(isInteractableRegionBehavior({}), false);
});

test('linked-visual flags build/read round-trip', () => {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid: 'Scene.s.Region.r', behaviorId: 'b1' });
  assert.deepEqual(fabricate, {
    isInteractableVisual: true,
    linkedRegionUuid: 'Scene.s.Region.r',
    linkedBehaviorId: 'b1'
  });
  const ref = readLinkedVisualRef({ flags: { fabricate } });
  assert.deepEqual(ref, { regionUuid: 'Scene.s.Region.r', behaviorId: 'b1' });
});

test('buildLinkedVisualFlags rejects empty ids', () => {
  assert.throws(() => buildLinkedVisualFlags({ regionUuid: '', behaviorId: 'b' }));
  assert.throws(() => buildLinkedVisualFlags({ regionUuid: 'r', behaviorId: '  ' }));
});

test('readLinkedVisualRef rejects non-visual documents', () => {
  assert.equal(readLinkedVisualRef(null), null);
  assert.equal(readLinkedVisualRef({}), null);
  assert.equal(readLinkedVisualRef({ flags: {} }), null);
  assert.equal(readLinkedVisualRef({ flags: { fabricate: { isInteractableVisual: false } } }), null);
  assert.equal(
    readLinkedVisualRef({ flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: 'r' } } }),
    null
  );
});
