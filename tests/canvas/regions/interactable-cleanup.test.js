/**
 * Uninstall-safe world cleanup for `fabricate.interactable` behaviours + markers
 * (issue 535).
 *
 * These tests pin the pure decision + the executor edge so that a GM "prepare for
 * uninstall" sweep:
 *   - removes EXACTLY Fabricate's `fabricate.interactable` behaviours and Fabricate's
 *     own Tile/Drawing markers, and NEVER a parent Region, a foreign behaviour, or a
 *     GM-owned Token marker;
 *   - clears Fabricate's region-ownership stamp and Token reverse flags;
 *   - handles legacy/unflagged provenance conservatively (behaviour still removed,
 *     region never deleted);
 *   - is a no-op on an empty world.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INTERACTABLE_BEHAVIOR_SUBTYPE } from '../../../src/canvas/regions/interactableRegionFlags.js';
import {
  REGION_OWNERSHIP_FLAG,
  buildInteractableRegionFlags,
} from '../../../src/canvas/regions/interactableDeletion.js';
import {
  decideSceneInteractableCleanup,
  decideWorldInteractableCleanup,
  executeWorldInteractableCleanup,
  planHasWork,
} from '../../../src/canvas/regions/interactableCleanup.js';

const FAB = INTERACTABLE_BEHAVIOR_SUBTYPE;

/** A Foundry-collection-shaped fake that both iterates (decide) and resolves by id (execute). */
function makeCollection(docs) {
  return {
    contents: docs,
    get: (id) => docs.find((doc) => String(doc.id) === String(id)) ?? null,
  };
}

/** A Fabricate linked-visual flag block (the reverse ref a marker carries). */
function visualFlags() {
  return {
    fabricate: {
      isInteractableVisual: true,
      linkedRegionUuid: 'Scene.s1.Region.r1',
      linkedBehaviorId: 'fab-1',
    },
  };
}

describe('decideWorldInteractableCleanup', () => {
  it('is a no-op on an empty world', () => {
    assert.deepEqual(decideWorldInteractableCleanup([]), {
      scenes: [],
      summary: {
        scenesTouched: 0,
        behaviorsRemoved: 0,
        visualsDeleted: 0,
        visualFlagsCleared: 0,
        regionFlagsCleared: 0,
      },
    });
    assert.equal(planHasWork(decideWorldInteractableCleanup([])), false);
    // A scene with no Fabricate documents also produces no work.
    const clean = decideWorldInteractableCleanup([
      { id: 's', regions: [{ id: 'r', behaviors: [{ id: 'x', type: 'adjustDarknessLevel' }] }] },
    ]);
    assert.deepEqual(clean.scenes, []);
    assert.equal(planHasWork(clean), false);
  });

  it('removes exactly Fabricate behaviours and never a foreign behaviour, and never lists a region for deletion', () => {
    const scene = {
      id: 's1',
      name: 'Cavern',
      regions: [
        {
          id: 'r1',
          name: 'Promoted lighting region',
          flags: {}, // promoted: no ownership stamp
          behaviors: [
            { id: 'lighting', type: 'adjustDarknessLevel' },
            { id: 'fab-1', type: FAB },
          ],
        },
      ],
    };
    const plan = decideWorldInteractableCleanup([scene]);
    assert.equal(plan.summary.scenesTouched, 1);
    assert.equal(plan.summary.behaviorsRemoved, 1);
    assert.equal(plan.summary.regionFlagsCleared, 0);
    const region = plan.scenes[0].regions[0];
    assert.deepEqual(region.removeBehaviorIds, ['fab-1']);
    assert.equal(region.clearOwnershipFlag, false);
    // The plan carries no region-deletion concept at all — only behaviour removals.
    assert.equal('deleteRegion' in region, false);
    assert.ok(!('deleteRegions' in plan.scenes[0]));
  });

  it('deletes Tile + Drawing markers, de-flags (never deletes) Token markers, and clears the ownership stamp', () => {
    const scene = {
      id: 's1',
      name: 'Cavern',
      regions: [
        {
          id: 'r1',
          flags: buildInteractableRegionFlags(), // Fabricate-created region
          behaviors: [{ id: 'fab-1', type: FAB }],
        },
      ],
      tiles: [
        { id: 'tile-1', flags: visualFlags() },
        { id: 'tile-foreign', flags: { core: {} } }, // not Fabricate's → untouched
      ],
      drawings: [{ id: 'draw-1', flags: visualFlags() }],
      tokens: [{ id: 'token-1', flags: visualFlags() }],
    };
    const plan = decideWorldInteractableCleanup([scene]);
    const scenePlan = plan.scenes[0];
    assert.deepEqual(scenePlan.deleteVisuals, [
      { documentName: 'Tile', id: 'tile-1' },
      { documentName: 'Drawing', id: 'draw-1' },
    ]);
    assert.deepEqual(scenePlan.clearVisualFlags, [{ documentName: 'Token', id: 'token-1' }]);
    assert.equal(scenePlan.regions[0].clearOwnershipFlag, true);
    assert.deepEqual(plan.summary, {
      scenesTouched: 1,
      behaviorsRemoved: 1,
      visualsDeleted: 2,
      visualFlagsCleared: 1,
      regionFlagsCleared: 1,
    });
  });

  it('LEGACY/unflagged provenance: removes the behaviour but never marks the region for deletion', () => {
    const scene = {
      id: 's1',
      regions: [{ id: 'r1', flags: {}, behaviors: [{ id: 'fab-1', type: FAB }] }],
    };
    const region = decideSceneInteractableCleanup(scene).regions[0];
    assert.deepEqual(region.removeBehaviorIds, ['fab-1']);
    assert.equal(region.clearOwnershipFlag, false);
  });

  it('FAILS CLOSED: a marker with a malformed reverse flag is never selected for deletion', () => {
    // isInteractableVisual is true but the ref is incomplete (no linkedRegionUuid /
    // linkedBehaviorId), so readLinkedVisualRef returns null and the doc is NOT ours.
    const scene = {
      id: 's1',
      regions: [],
      tiles: [{ id: 'malformed', flags: { fabricate: { isInteractableVisual: true } } }],
      drawings: [
        { id: 'partial', flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: 'Scene.s1.Region.r1' } } },
      ],
    };
    const plan = decideWorldInteractableCleanup([scene]);
    assert.deepEqual(plan.scenes, []);
    assert.equal(planHasWork(plan), false);
  });

  it('removes an ORPHANED marker (a Fabricate tile whose behaviour is already gone)', () => {
    const scene = {
      id: 's1',
      regions: [],
      tiles: [{ id: 'orphan', flags: visualFlags() }],
    };
    const plan = decideWorldInteractableCleanup([scene]);
    assert.deepEqual(plan.scenes[0].deleteVisuals, [{ documentName: 'Tile', id: 'orphan' }]);
    assert.equal(plan.summary.visualsDeleted, 1);
  });
});

describe('executeWorldInteractableCleanup', () => {
  function makeRegion({ id, owned, behaviors }) {
    const calls = { delete: 0, deleteEmbedded: [], unsetFlag: [] };
    return {
      id,
      calls,
      flags: owned ? buildInteractableRegionFlags() : {},
      behaviors,
      async delete() {
        calls.delete += 1;
      },
      async deleteEmbeddedDocuments(type, ids) {
        calls.deleteEmbedded.push({ type, ids });
      },
      async unsetFlag(scope, key) {
        calls.unsetFlag.push({ scope, key });
      },
    };
  }

  it('removes only Fabricate behaviours + markers, clears flags, and NEVER deletes a region or a token', async () => {
    const region = makeRegion({
      id: 'r1',
      owned: true,
      behaviors: [
        { id: 'foreign', type: 'adjustDarknessLevel' },
        { id: 'fab-1', type: FAB },
      ],
    });
    const tokenCalls = { update: [] };
    const sceneCalls = { deleteEmbedded: [] };
    const scene = {
      id: 's1',
      calls: sceneCalls,
      regions: makeCollection([region]),
      tiles: makeCollection([{ id: 'tile-1', flags: visualFlags() }]),
      drawings: makeCollection([{ id: 'draw-1', flags: visualFlags() }]),
      tokens: makeCollection([
        {
          id: 'token-1',
          flags: visualFlags(),
          async update(patch) {
            tokenCalls.update.push(patch);
          },
        },
      ]),
      async deleteEmbeddedDocuments(type, ids) {
        sceneCalls.deleteEmbedded.push({ type, ids });
      },
    };

    const plan = decideWorldInteractableCleanup([scene]);
    const applied = await executeWorldInteractableCleanup([scene], plan);

    // Region kept; only the Fabricate behaviour removed; foreign behaviour untouched.
    assert.equal(region.calls.delete, 0);
    assert.deepEqual(region.calls.deleteEmbedded, [{ type: 'RegionBehavior', ids: ['fab-1'] }]);
    assert.deepEqual(region.calls.unsetFlag, [{ scope: 'fabricate', key: REGION_OWNERSHIP_FLAG }]);
    // Tile + Drawing markers deleted from the scene.
    assert.deepEqual(sceneCalls.deleteEmbedded, [
      { type: 'Tile', ids: ['tile-1'] },
      { type: 'Drawing', ids: ['draw-1'] },
    ]);
    // Token de-flagged, never deleted.
    assert.equal(tokenCalls.update.length, 1);
    assert.equal(tokenCalls.update[0].flags.fabricate.isInteractableVisual, null);
    assert.deepEqual(applied, {
      behaviorsRemoved: 1,
      visualsDeleted: 2,
      visualFlagsCleared: 1,
      regionFlagsCleared: 1,
    });
  });

  it('tolerates a throwing document and keeps sweeping the rest', async () => {
    const bad = makeRegion({ id: 'r1', owned: false, behaviors: [{ id: 'fab-1', type: FAB }] });
    bad.deleteEmbeddedDocuments = async () => {
      throw new Error('boom');
    };
    const good = makeRegion({ id: 'r2', owned: false, behaviors: [{ id: 'fab-2', type: FAB }] });
    const scene = {
      id: 's1',
      regions: makeCollection([bad, good]),
    };
    const plan = decideWorldInteractableCleanup([scene]);
    const applied = await executeWorldInteractableCleanup([scene], plan);
    // The good region still had its behaviour removed despite the bad one throwing.
    assert.deepEqual(good.calls.deleteEmbedded, [{ type: 'RegionBehavior', ids: ['fab-2'] }]);
    assert.equal(applied.behaviorsRemoved, 1);
  });

  it('is a no-op when the plan has no scenes', async () => {
    const applied = await executeWorldInteractableCleanup([], { scenes: [] });
    assert.deepEqual(applied, {
      behaviorsRemoved: 0,
      visualsDeleted: 0,
      visualFlagsCleared: 0,
      regionFlagsCleared: 0,
    });
  });
});
