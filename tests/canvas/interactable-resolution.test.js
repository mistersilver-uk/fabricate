/**
 * Unit coverage for the PURE canvas-interactable helpers: drop classification +
 * spawn-payload shaping (`interactableResolution.js`) and double-click dispatch
 * routing (`interactableDispatch.js`). The Foundry-bound `InteractableManager`
 * seams are exercised separately in `interactable-manager.test.js`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyInteractableDrop,
  buildSpawnRequest,
  buildActiveCanvasTool,
  buildInteractableSourceUuid,
  parseInteractableSourceUuid
} from '../../src/canvas/interactableResolution.js';
import {
  describeInteractableDispatch,
  dispatchInteractableDoubleClick
} from '../../src/canvas/interactableDispatch.js';

// --- synthetic source identity round-trip ---

test('source uuid build/parse round-trips for tool and task', () => {
  const toolUuid = buildInteractableSourceUuid({ interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1' });
  assert.equal(toolUuid, 'Fabricate.sysA.tool.tool-1');
  assert.deepEqual(parseInteractableSourceUuid(toolUuid), {
    interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1'
  });

  const taskUuid = buildInteractableSourceUuid({ interactableType: 'gatheringTask', systemId: 'sysA', referenceId: 'task-9' });
  assert.equal(taskUuid, 'Fabricate.sysA.gatheringTask.task-9');
  assert.deepEqual(parseInteractableSourceUuid(taskUuid), {
    interactableType: 'gatheringTask', systemId: 'sysA', referenceId: 'task-9'
  });
});

test('parse rejects malformed identities', () => {
  assert.equal(parseInteractableSourceUuid('Item.abc'), null);
  assert.equal(parseInteractableSourceUuid('Fabricate.sys.widget.x'), null);
  assert.equal(parseInteractableSourceUuid('Fabricate.sys.tool'), null);
  assert.equal(parseInteractableSourceUuid(42), null);
});

// --- activeCanvasTool payload (Phase 4) ---

test('buildActiveCanvasTool produces the normalized { componentId, systemId, toolId, label } shape', () => {
  assert.deepEqual(
    buildActiveCanvasTool({ systemId: 'sysA', toolId: 'tool-1', tool: { componentId: 'comp-axe', label: ' Forge ' } }),
    { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: 'Forge' }
  );
});

test('buildActiveCanvasTool returns null when the tool has no componentId', () => {
  assert.equal(buildActiveCanvasTool({ systemId: 'sysA', toolId: 'tool-1', tool: { componentId: '  ' } }), null);
  assert.equal(buildActiveCanvasTool({ systemId: 'sysA', toolId: 'tool-1', tool: null }), null);
});

test('buildActiveCanvasTool defaults a missing label to an empty string', () => {
  assert.deepEqual(
    buildActiveCanvasTool({ systemId: 'sysA', toolId: 'tool-1', tool: { componentId: 'comp-axe' } }),
    { componentId: 'comp-axe', systemId: 'sysA', toolId: 'tool-1', label: '' }
  );
});

// --- drop classification ---

const deps = () => ({
  getTool: ({ systemId, toolId }) => (systemId === 'sysA' && toolId === 'tool-1' ? { id: 'tool-1', componentId: 'c1' } : null),
  getTask: ({ systemId, taskId }) => (systemId === 'sysA' && taskId === 'task-9' ? { id: 'task-9', name: 'Mine Ore' } : null),
  resolveItemUuidToTool: (uuid) => (uuid === 'Item.known' ? { systemId: 'sysA', toolId: 'tool-1' } : null)
});

test('classifies a tool drag payload', () => {
  const result = classifyInteractableDrop({ fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' } }, deps());
  assert.equal(result.interactableType, 'tool');
  assert.equal(result.systemId, 'sysA');
  assert.equal(result.referenceId, 'tool-1');
  assert.equal(result.sourceUuid, 'Fabricate.sysA.tool.tool-1');
  assert.deepEqual(result.entry, { id: 'tool-1', componentId: 'c1' });
});

test('classifies a gathering-task drag payload', () => {
  const result = classifyInteractableDrop({ fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } }, deps());
  assert.equal(result.interactableType, 'gatheringTask');
  assert.equal(result.referenceId, 'task-9');
  assert.equal(result.sourceUuid, 'Fabricate.sysA.gatheringTask.task-9');
});

test('non-matching payloads classify as null (default drop not suppressed)', () => {
  // unknown tool id
  assert.equal(classifyInteractableDrop({ fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'nope' } }, deps()), null);
  // unknown task id
  assert.equal(classifyInteractableDrop({ fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'nope' } }, deps()), null);
  // unknown interactable type
  assert.equal(classifyInteractableDrop({ fabricate: { interactableType: 'widget', systemId: 'sysA', toolId: 'tool-1' } }, deps()), null);
  // missing systemId
  assert.equal(classifyInteractableDrop({ fabricate: { interactableType: 'tool', toolId: 'tool-1' } }, deps()), null);
  // a plain foundry item drop with no fabricate payload and no uuid match
  assert.equal(classifyInteractableDrop({ type: 'Item', uuid: 'Item.unknown' }, deps()), null);
  assert.equal(classifyInteractableDrop('Actor.x', deps()), null);
});

test('classifies a dropped item uuid that maps to a tool', () => {
  const result = classifyInteractableDrop({ type: 'Item', uuid: 'Item.known' }, deps());
  assert.equal(result.interactableType, 'tool');
  assert.equal(result.sourceUuid, 'Fabricate.sysA.tool.tool-1');

  const fromString = classifyInteractableDrop('Item.known', deps());
  assert.equal(fromString.sourceUuid, 'Fabricate.sysA.tool.tool-1');
});

// --- spawn payload shaping ---

test('buildSpawnRequest shapes a tool spawn (no environmentId)', () => {
  const classification = classifyInteractableDrop({ fabricate: { interactableType: 'tool', systemId: 'sysA', toolId: 'tool-1' } }, deps());
  const request = buildSpawnRequest({ classification, point: { x: 120, y: 240 } });
  assert.deepEqual(request, {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    x: 120,
    y: 240
  });
});

test('buildSpawnRequest carries environmentId + the task name for a gathering task', () => {
  const classification = classifyInteractableDrop({ fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } }, deps());
  const request = buildSpawnRequest({ classification, point: { x: 10, y: 20 }, environmentId: 'env-3' });
  assert.deepEqual(request, {
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
    environmentId: 'env-3',
    name: 'Mine Ore', // nameplate identifies the gathering point (discoverability)
    x: 10,
    y: 20
  });
});

test('buildSpawnRequest snapshots the task node CONFIG via buildNode (config + runtime)', () => {
  const nodeDeps = {
    getTask: () => ({ id: 'task-9', name: 'Mine Ore', nodes: { enabled: true, max: 3 } })
  };
  const classification = classifyInteractableDrop({ fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } }, nodeDeps);
  const request = buildSpawnRequest({
    classification,
    point: { x: 1, y: 2 },
    buildNode: (task) => ({ ...task.nodes, current: task.nodes.max })
  });
  assert.deepEqual(request.node, { enabled: true, max: 3, current: 3 });
});

test('buildSpawnRequest omits node for a task with no node config (unlimited gathering point)', () => {
  const classification = classifyInteractableDrop({ fabricate: { interactableType: 'gatheringTask', systemId: 'sysA', taskId: 'task-9' } }, deps());
  const request = buildSpawnRequest({ classification, point: { x: 1, y: 2 }, buildNode: () => null });
  assert.equal('node' in request, false, 'no node snapshot is carried for an unlimited node');
});

test('buildSpawnRequest returns null for no classification', () => {
  assert.equal(buildSpawnRequest({ classification: null, point: { x: 1, y: 2 } }), null);
});

// --- double-click dispatch routing ---

function toolToken() {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1' } } };
}
function taskToken() {
  return { flags: { fabricate: { isInteractable: true, interactableType: 'gatheringTask', sourceUuid: 'Fabricate.sysA.gatheringTask.task-9', environmentId: 'env-3', node: { current: 2 } } } };
}

test('describeInteractableDispatch resolves the routed descriptor', () => {
  assert.deepEqual(describeInteractableDispatch(toolToken()), {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    systemId: 'sysA',
    referenceId: 'tool-1',
    environmentId: null,
    node: null
  });
  assert.deepEqual(describeInteractableDispatch(taskToken()), {
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
    systemId: 'sysA',
    referenceId: 'task-9',
    environmentId: 'env-3',
    node: { current: 2 }
  });
  assert.equal(describeInteractableDispatch({ flags: {} }), null);
});

test('dispatch routes tool tokens to onTool', () => {
  const tools = [];
  const tasks = [];
  const dispatched = dispatchInteractableDoubleClick(toolToken(), {
    onTool: (d) => tools.push(d),
    onGatheringTask: (d) => tasks.push(d)
  });
  assert.equal(tools.length, 1);
  assert.equal(tasks.length, 0);
  assert.equal(tools[0].referenceId, 'tool-1');
  assert.equal(dispatched.interactableType, 'tool');
});

test('dispatch routes gathering-task tokens to onGatheringTask', () => {
  const tools = [];
  const tasks = [];
  const dispatched = dispatchInteractableDoubleClick(taskToken(), {
    onTool: (d) => tools.push(d),
    onGatheringTask: (d) => tasks.push(d)
  });
  assert.equal(tasks.length, 1);
  assert.equal(tools.length, 0);
  assert.equal(tasks[0].environmentId, 'env-3');
  assert.equal(dispatched.interactableType, 'gatheringTask');
});

test('dispatch is a no-op for non-interactable tokens', () => {
  let called = false;
  const dispatched = dispatchInteractableDoubleClick({ flags: {} }, {
    onTool: () => { called = true; },
    onGatheringTask: () => { called = true; }
  });
  assert.equal(dispatched, null);
  assert.equal(called, false);
});
