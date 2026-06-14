/**
 * Phase 1 (issue 335) — pure scene-scan → display rows for the GM Manage
 * Interactables panel. Covers each marker-status variant, each state flag, the
 * source-label fallback chain, and the tolerance of the live Collection shapes.
 */

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

  it('falls back to the raw sourceUuid when label, name, and id are all blank', () => {
    const row = buildInteractableRow(
      behavior({
        name: '',
        toolId: '',
        taskId: null,
        sourceUuid: 'Fabricate.sys.tool.lonely',
        linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' },
      }),
      { resolveSourceLabel: () => '', resolveVisualResolved: () => false }
    );
    assert.equal(row.sourceLabel, 'Fabricate.sys.tool.lonely');
    assert.equal(row.name, 'Fabricate.sys.tool.lonely');
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

  it('falls back name → source label → id when fields are blank', () => {
    const row = buildInteractableRow(behavior({ name: '' }), {
      resolveSourceLabel: () => '',
      resolveVisualResolved: () => false,
    });
    // No label, no name ⇒ falls to the bare toolId.
    assert.equal(row.sourceLabel, 'tool-1');
    assert.equal(row.name, 'tool-1');
  });

  it('reflects locked + consumed state flags', () => {
    const row = buildInteractableRow(
      behavior({ state: { enabled: false, locked: true, consumed: true } }),
      { resolveVisualResolved: () => true }
    );
    assert.deepEqual(row.state, { enabled: false, locked: true, consumed: true });
  });

  it('reports a gathering-task taskId fallback label', () => {
    const row = buildInteractableRow(
      behavior({
        interactableType: 'gatheringTask',
        toolId: null,
        taskId: 'task-9',
        sourceUuid: 'Fabricate.sys.gatheringTask.task-9',
        linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' },
      }),
      { resolveSourceLabel: () => '', resolveVisualResolved: () => false }
    );
    assert.equal(row.interactableType, 'gatheringTask');
    assert.equal(row.sourceLabel, 'task-9');
    assert.equal(row.markerStatus, MARKER_STATUS.REGION_ONLY);
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
