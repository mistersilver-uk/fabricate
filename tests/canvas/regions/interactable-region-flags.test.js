import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERACTABLE_BEHAVIOR_SUBTYPE,
  UNCONFIGURED_SOURCE_UUID,
  UNCONFIGURED_SYSTEM_ID,
  buildInteractableBehaviorSchema,
  buildInteractableBehaviorSystem,
  readInteractableBehaviorSystem,
  isInteractableRegionBehavior,
  isUnconfiguredInteractable,
  buildLinkedVisualFlags,
  readLinkedVisualRef,
  isInteractableVisual,
  mayApplyInteractableVisualUpdate
} from '../../../src/canvas/regions/interactableRegionFlags.js';
import { parseInteractableSourceUuid } from '../../../src/canvas/interactableResolution.js';

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
    'node',
    'presentation',
    'sourceUuid',
    'state',
    'systemId',
    'taskId',
    'taskNodeLink',
    'toolId'
  ]);

  assert.equal(schema.interactableType.kind, 'StringField');
  assert.deepEqual(schema.interactableType.options.choices, ['tool', 'gatheringTask']);
  assert.equal(schema.interactableType.options.blank, false);
  // Unconfigured-sentinel initials (issue 342) keep the three identity fields
  // required/blank:false while letting the native empty-system instantiation
  // produce a valid-but-unconfigured behaviour.
  assert.equal(schema.interactableType.options.initial, 'tool');

  assert.equal(schema.sourceUuid.kind, 'StringField');
  assert.equal(schema.sourceUuid.options.required, true);
  assert.equal(schema.sourceUuid.options.blank, false);
  assert.equal(schema.sourceUuid.options.initial, UNCONFIGURED_SOURCE_UUID);
  assert.equal(schema.systemId.kind, 'StringField');
  assert.equal(schema.systemId.options.required, true);
  assert.equal(schema.systemId.options.blank, false);
  assert.equal(schema.systemId.options.initial, UNCONFIGURED_SYSTEM_ID);

  for (const nullableKey of ['toolId', 'taskId', 'environmentId']) {
    assert.equal(schema[nullableKey].kind, 'StringField', nullableKey);
    assert.equal(schema[nullableKey].options.nullable, true, nullableKey);
    assert.equal(schema[nullableKey].options.initial, null, nullableKey);
  }

  assert.equal(schema.name.kind, 'StringField');
  // A gatheringTask interactable may be LINKED to the task or UNLINKED with its
  // own independent node pool, gated by `taskNodeLink` (default 'linked' shares the
  // task's `environment.nodeRuntime[taskId]`). The independent pool is stored
  // verbatim in the `node` ObjectField.
  assert.equal(schema.taskNodeLink.kind, 'StringField');
  assert.equal(schema.taskNodeLink.options.initial, 'linked');
  assert.deepEqual(schema.taskNodeLink.options.choices, ['linked', 'unlinked']);
  assert.equal(schema.node.kind, 'ObjectField');
  assert.equal(schema.node.options.nullable, true);
  assert.equal(schema.node.options.initial, null);
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
  // A tool is forced to linked with a null node (only a gatheringTask may carry
  // an independent pool).
  assert.equal(system.taskNodeLink, 'linked');
  assert.equal(system.node, null);
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

test('buildInteractableBehaviorSystem carries the environment for a gathering task (linked node by default)', () => {
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
  // No taskNodeLink requested → default linked, null node.
  assert.equal(system.taskNodeLink, 'linked');
  assert.equal(system.node, null);
  assert.deepEqual(system.presentation, { promptText: 'Mine here', hidden: true });
  assert.deepEqual(system.linkedVisual, {
    uuid: 'Scene.s.Tile.t',
    documentName: 'Tile',
    mode: 'none',
    missingPolicy: 'recreate'
  });
});

test('buildInteractableBehaviorSystem forces a tool to linked and rejects bad input', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    systemId: 'sys',
    // A tool may never carry an independent node, even if one is requested.
    taskNodeLink: 'unlinked',
    node: { enabled: true, max: 5, current: 5 }
  });
  assert.equal(system.taskNodeLink, 'linked');
  assert.equal(system.node, null);
  assert.throws(() => buildInteractableBehaviorSystem({ interactableType: 'nope', sourceUuid: 'x' }));
  assert.throws(() => buildInteractableBehaviorSystem({ interactableType: 'tool', sourceUuid: '  ' }));
});

test('buildInteractableBehaviorSystem carries an independent node for a gatheringTask when taskNodeLink is unlinked', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    systemId: 'sys',
    taskId: 'task1',
    environmentId: 'env-7',
    taskNodeLink: 'unlinked',
    node: { enabled: true, max: 5, current: 3, depletionTiming: 'onSuccess' }
  });
  assert.equal(system.taskNodeLink, 'unlinked');
  assert.equal(system.node.max, 5);
  assert.equal(system.node.current, 3);
  assert.equal(system.node.depletionTiming, 'onSuccess');
});

test('buildInteractableBehaviorSystem downgrades to linked when the independent node is empty', () => {
  const system = buildInteractableBehaviorSystem({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    systemId: 'sys',
    taskId: 'task1',
    taskNodeLink: 'unlinked',
    node: null
  });
  assert.equal(system.taskNodeLink, 'linked');
  assert.equal(system.node, null);
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
  // Default linked round-trips with a null independent node.
  assert.equal(view.taskNodeLink, 'linked');
  assert.equal(view.node, null);
  assert.equal(view.state.enabled, true);
  assert.equal(view.activation.trigger, 'regionEnter');
});

test('readInteractableBehaviorSystem surfaces an unlinked node and downgrades a malformed one', () => {
  const scoped = readInteractableBehaviorSystem({
    type: 'fabricate.interactable',
    system: {
      interactableType: 'gatheringTask',
      sourceUuid: 'x',
      systemId: 's',
      taskId: 't',
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 4, current: 2 }
    }
  });
  assert.equal(scoped.taskNodeLink, 'unlinked');
  assert.equal(scoped.node.max, 4);
  assert.equal(scoped.node.current, 2);

  // Link claims unlinked but the node does not normalize → DOWNGRADE to linked.
  const downgraded = readInteractableBehaviorSystem({
    type: 'fabricate.interactable',
    system: {
      interactableType: 'gatheringTask',
      sourceUuid: 'x',
      systemId: 's',
      taskId: 't',
      taskNodeLink: 'unlinked',
      node: null
    }
  });
  assert.equal(downgraded.taskNodeLink, 'linked');
  assert.equal(downgraded.node, null);

  // A tool never surfaces an independent node even if the raw system claims one.
  const tool = readInteractableBehaviorSystem({
    type: 'fabricate.interactable',
    system: {
      interactableType: 'tool',
      sourceUuid: 'x',
      systemId: 's',
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 4, current: 2 }
    }
  });
  assert.equal(tool.taskNodeLink, 'linked');
  assert.equal(tool.node, null);
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

test('UNCONFIGURED sentinels are the documented constants', () => {
  assert.equal(UNCONFIGURED_SOURCE_UUID, 'Fabricate.unconfigured.tool');
  assert.equal(UNCONFIGURED_SYSTEM_ID, 'unconfigured');
});

test('the unconfigured sourceUuid sentinel parses to null (non-resolvable)', () => {
  // The sentinel is a 3-segment string, so no resolver can mistake it for a real
  // tool/task — `_sourceExists` returns false for it and activation is denied.
  assert.equal(parseInteractableSourceUuid(UNCONFIGURED_SOURCE_UUID), null);
});

test('isUnconfiguredInteractable truth table (tool & gatheringTask)', () => {
  // Sentinel sourceUuid + systemId, no real id → unconfigured.
  assert.equal(
    isUnconfiguredInteractable({
      interactableType: 'tool',
      sourceUuid: UNCONFIGURED_SOURCE_UUID,
      systemId: UNCONFIGURED_SYSTEM_ID
    }),
    true
  );

  // Empty sourceUuid → unconfigured.
  assert.equal(
    isUnconfiguredInteractable({ interactableType: 'tool', sourceUuid: '', systemId: 'sys', toolId: 't1' }),
    true
  );

  // Sentinel systemId only → unconfigured.
  assert.equal(
    isUnconfiguredInteractable({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sys.tool.t1',
      systemId: UNCONFIGURED_SYSTEM_ID,
      toolId: 't1'
    }),
    true
  );

  // tool with a real source but MISSING toolId → unconfigured.
  assert.equal(
    isUnconfiguredInteractable({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sys.tool.t1',
      systemId: 'sys',
      toolId: null
    }),
    true
  );

  // gatheringTask MISSING taskId → unconfigured.
  assert.equal(
    isUnconfiguredInteractable({
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sys.gatheringTask.k1',
      systemId: 'sys',
      taskId: ''
    }),
    true
  );

  // Unknown/missing type → unconfigured. Also a null system.
  assert.equal(isUnconfiguredInteractable({ interactableType: 'mystery', sourceUuid: 'x', systemId: 's' }), true);
  assert.equal(isUnconfiguredInteractable(null), true);
  assert.equal(isUnconfiguredInteractable(undefined), true);

  // A FULLY-configured tool → false.
  assert.equal(
    isUnconfiguredInteractable({
      interactableType: 'tool',
      sourceUuid: 'Fabricate.sys.tool.t1',
      systemId: 'sys',
      toolId: 't1'
    }),
    false
  );

  // A FULLY-configured gatheringTask → false.
  assert.equal(
    isUnconfiguredInteractable({
      interactableType: 'gatheringTask',
      sourceUuid: 'Fabricate.sys.gatheringTask.k1',
      systemId: 'sys',
      taskId: 'k1'
    }),
    false
  );
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

test('isInteractableVisual is true only for a well-formed reverse-flag document', () => {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid: 'Scene.s.Region.r', behaviorId: 'b1' });
  assert.equal(isInteractableVisual({ flags: { fabricate } }), true);
  // Foreign / drifted documents.
  assert.equal(isInteractableVisual(null), false);
  assert.equal(isInteractableVisual({}), false);
  assert.equal(isInteractableVisual({ flags: {} }), false);
  assert.equal(isInteractableVisual({ flags: { fabricate: { isInteractableVisual: false } } }), false);
  // Truthy marker but incomplete ref → not a valid visual.
  assert.equal(isInteractableVisual({ flags: { fabricate: { isInteractableVisual: true } } }), false);
});

test('mayApplyInteractableVisualUpdate permits an owned doc or a provenance-stamp write', () => {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid: 'Scene.s.Region.r', behaviorId: 'b1' });
  const ownedDoc = { flags: { fabricate } };
  const foreignDoc = { flags: {} };

  // An already-owned visual accepts any write.
  assert.equal(mayApplyInteractableVisualUpdate(ownedDoc, { hidden: true }), true);
  // A foreign document rejects a core-data write (hidden/texture).
  assert.equal(mayApplyInteractableVisualUpdate(foreignDoc, { hidden: true }), false);
  assert.equal(mayApplyInteractableVisualUpdate(foreignDoc, { texture: { src: 'x' } }), false);
  // The relink stamp (writing the reverse flag onto a GM-selected doc) is allowed.
  assert.equal(
    mayApplyInteractableVisualUpdate(foreignDoc, { flags: { fabricate: { isInteractableVisual: true } } }),
    true
  );
  // A clear write (isInteractableVisual: null) onto a foreign doc is NOT a stamp → rejected.
  assert.equal(
    mayApplyInteractableVisualUpdate(foreignDoc, { flags: { fabricate: { isInteractableVisual: null } } }),
    false
  );
});
