/** Phase 1 (issue 335) — pure scene-scan → display rows for the GM Manage Interactables panel. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scanSceneInteractables,
  buildInteractableRow,
  classifyMarkerStatus,
  MARKER_STATUS,
} from '../../../src/canvas/regions/interactableSceneScan.js';

/** A minimal interactable behaviour document fake. */
function behavior({
  id = 'b1',
  regionId = 'r1',
  sceneId = 's1',
  interactableType = 'tool',
  name = '',
  toolId = 'tool-1',
  taskId = null,
  sourceUuid = 'Fabricate.sys.tool.tool-1',
  systemId = 'sys',
  linkedVisual = { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile', mode: 'marker', missingPolicy: 'warn' },
  state = {},
} = {}) {
  return {
    id,
    type: 'fabricate.interactable',
    parent: { id: regionId, parent: { id: sceneId } },
    system: {
      interactableType,
      name,
      toolId,
      taskId,
      sourceUuid,
      systemId,
      linkedVisual,
      state,
    },
  };
}

function scene(regions) {
  return { regions };
}

describe('classifyMarkerStatus', () => {
  it('reports the resolved documentName for a present Tile / Drawing / Token marker', () => {
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Tile' } }, true),
      MARKER_STATUS.TILE
    );
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Drawing' } }, true),
      MARKER_STATUS.DRAWING
    );
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Token' } }, true),
      MARKER_STATUS.TOKEN
    );
  });

  it('reports region-only when there is no configured marker', () => {
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'none', uuid: null, documentName: null } }, false),
      MARKER_STATUS.REGION_ONLY
    );
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'marker', uuid: '', documentName: null } }, false),
      MARKER_STATUS.REGION_ONLY
    );
  });

  it('reports missing when a configured marker does not resolve', () => {
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Tile' } }, false),
      MARKER_STATUS.MISSING
    );
  });

  it('defaults a resolved marker with an UNKNOWN documentName to Tile (still present)', () => {
    assert.equal(
      classifyMarkerStatus({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Wall' } }, true),
      MARKER_STATUS.TILE
    );
  });
});

describe('buildInteractableRow', () => {
  it('returns null for a non-interactable behaviour', () => {
    assert.equal(buildInteractableRow({ type: 'other.thing', system: {} }), null);
  });

  it('returns null for an interactable behaviour with an INVALID interactableType', () => {
    assert.equal(
      buildInteractableRow({ type: 'fabricate.interactable', system: { interactableType: 'bogus' } }),
      null
    );
  });

  it('returns null when the behaviour has no resolvable ref (missing parent ids)', () => {
    // A valid system but no parent region/scene ⇒ identifyRegionBehaviorRef yields null.
    assert.equal(
      buildInteractableRow({ type: 'fabricate.interactable', system: { interactableType: 'tool', toolId: 't' } }),
      null
    );
  });

  it('never surfaces the unconfigured sentinel: no id, no name, not configured', () => {
    const row = buildInteractableRow(
      behavior({
        name: '',
        toolId: '',
        taskId: null,
        sourceUuid: 'Fabricate.unconfigured.tool',
        systemId: 'Fabricate.unconfigured.system',
        linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' },
      }),
      { resolveSourceLabel: () => '', resolveVisualResolved: () => false }
    );
    assert.equal(row.sourceConfigured, false);
    assert.equal(row.sourceResolved, false);
    assert.equal(row.sourceId, '');
    assert.equal(row.sourceLabel, '');
    assert.equal(row.name, '');
    assert.ok(!JSON.stringify(row).includes('Fabricate.unconfigured'), 'the sentinel is on no field');
  });

  it('builds a row with ref, name, type, source label, state, and marker status', () => {
    const row = buildInteractableRow(
      behavior({ name: 'Old Anvil', state: { enabled: true, locked: false, consumed: false } }),
      {
        resolveSourceLabel: () => "Smith's Anvil",
        resolveVisualResolved: () => true,
      }
    );
    assert.deepEqual(row.ref, { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' });
    assert.equal(row.name, 'Old Anvil');
    assert.equal(row.interactableType, 'tool');
    assert.equal(row.sourceLabel, "Smith's Anvil");
    assert.equal(row.markerStatus, MARKER_STATUS.TILE);
    assert.deepEqual(row.state, { enabled: true, locked: false, consumed: false });
  });

  it('names the row by its stored name, else the resolved label, else the id', () => {
    const resolved = { resolveSourceLabel: () => "Smith's Anvil", resolveVisualResolved: () => false };
    const unresolved = { resolveSourceLabel: () => null, resolveVisualResolved: () => false };
    assert.equal(buildInteractableRow(behavior({ name: 'Old Anvil' }), resolved).name, 'Old Anvil');
    assert.equal(buildInteractableRow(behavior({ name: '' }), resolved).name, "Smith's Anvil");
    assert.equal(buildInteractableRow(behavior({ name: '' }), unresolved).name, 'tool-1');
  });

  it('a Tool the resolver cannot find is unresolved, keeps its stored name and reports its id', () => {
    const row = buildInteractableRow(behavior({ name: 'Orphaned smelter', toolId: 'gone-tool' }), {
      resolveSourceLabel: () => null,
      resolveVisualResolved: () => false,
    });
    assert.equal(row.sourceResolved, false);
    assert.equal(row.sourceConfigured, true);
    assert.equal(row.sourceLabel, '', 'the title is not repeated as the source label');
    assert.equal(row.sourceId, 'gone-tool');
    assert.equal(row.name, 'Orphaned smelter');
  });

  it('a resolved label equal to the stored name is still resolved', () => {
    const row = buildInteractableRow(behavior({ name: "Smith's Anvil" }), {
      resolveSourceLabel: () => "Smith's Anvil",
      resolveVisualResolved: () => false,
    });
    assert.equal(row.sourceResolved, true);
    assert.equal(row.sourceLabel, "Smith's Anvil");
    assert.equal(row.sourceId, 'tool-1');
  });

  it('reflects locked + consumed state flags', () => {
    const row = buildInteractableRow(
      behavior({ state: { enabled: false, locked: true, consumed: true } }),
      { resolveVisualResolved: () => true }
    );
    assert.deepEqual(row.state, { enabled: false, locked: true, consumed: true });
  });

  it('a Task the resolver cannot find is unresolved and reports its taskId', () => {
    const row = buildInteractableRow(
      behavior({
        interactableType: 'gatheringTask',
        name: 'Mossbed',
        toolId: null,
        taskId: 'task-9',
        sourceUuid: 'Fabricate.sys.gatheringTask.task-9',
        linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' },
      }),
      { resolveSourceLabel: () => '', resolveVisualResolved: () => false }
    );
    assert.equal(row.interactableType, 'gatheringTask');
    assert.equal(row.sourceResolved, false);
    assert.equal(row.sourceLabel, '');
    assert.equal(row.sourceId, 'task-9');
    assert.equal(row.name, 'Mossbed');
    assert.equal(row.markerStatus, MARKER_STATUS.REGION_ONLY);
  });

  it('a resolved row reports the id it resolved from', () => {
    const row = buildInteractableRow(
      behavior({
        interactableType: 'gatheringTask',
        toolId: null,
        taskId: 'task-9',
        sourceUuid: 'Fabricate.sys.gatheringTask.task-9',
      }),
      { resolveSourceLabel: () => 'Forage', resolveVisualResolved: () => true }
    );
    assert.equal(row.sourceResolved, true);
    assert.equal(row.sourceId, 'task-9');
  });
});

describe('scanSceneInteractables', () => {
  it('flattens every interactable behaviour across regions, skipping non-interactables', () => {
    const regions = [
      { behaviors: [behavior({ id: 'a', regionId: 'r1' }), { type: 'other', system: {} }] },
      { behaviors: [behavior({ id: 'b', regionId: 'r2' })] },
    ];
    const rows = scanSceneInteractables(scene(regions), { resolveVisualResolved: () => true });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.ref.behaviorId), ['a', 'b']);
  });

  it('tolerates a live Collection shape (.contents) for regions + behaviors', () => {
    const regions = { contents: [{ behaviors: { contents: [behavior({ id: 'c' })] } }] };
    const rows = scanSceneInteractables({ regions }, { resolveVisualResolved: () => false });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].markerStatus, MARKER_STATUS.MISSING);
  });

  it('tolerates a live Collection shape with only .values() for regions + behaviors', () => {
    const regionsCollection = {
      values: () => [{ behaviors: { values: () => [behavior({ id: 'v' })].values() } }].values(),
    };
    const rows = scanSceneInteractables({ regions: regionsCollection }, { resolveVisualResolved: () => true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ref.behaviorId, 'v');
  });

  it('returns an empty list for a scene with no regions', () => {
    assert.deepEqual(scanSceneInteractables({ regions: [] }), []);
    assert.deepEqual(scanSceneInteractables({}), []);
  });
});
