/**
 * Provenance-aware interactable deletion (issue 533).
 *
 * P0 data-loss regression: deleting a PROMOTED interactable used to call
 * `region.delete()` on the user's whole Region, destroying their geometry and every
 * foreign (non-Fabricate) behaviour on it. These tests pin the pure ownership
 * decision + the executor edge so that:
 *   - a Fabricate-CREATED region (no foreign behaviours) still deletes the Region;
 *   - a PROMOTED region — or any region carrying foreign behaviours — deletes ONLY
 *     Fabricate's behaviour(s), preserving the Region and foreign behaviours;
 *   - a LEGACY region with no ownership flag defaults to the safe (do-not-destroy)
 *     promoted path.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INTERACTABLE_BEHAVIOR_SUBTYPE } from '../../../src/canvas/regions/interactableRegionFlags.js';
import {
  REGION_OWNERSHIP_FLAG,
  buildInteractableRegionFlags,
  isFabricateOwnedRegion,
  readRegionBehaviors,
  decideInteractableDeletion,
  planInteractableDeletion,
  executeInteractableDeletion,
} from '../../../src/canvas/regions/interactableDeletion.js';

const FAB = INTERACTABLE_BEHAVIOR_SUBTYPE;

/** A fake Region document that records the mutation calls the edge makes. */
function makeFakeRegion({ owned = false, behaviors = [] } = {}) {
  const calls = { delete: 0, deleteEmbedded: [], unsetFlag: [] };
  return {
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

describe('interactable region ownership flag', () => {
  it('stamps flags.fabricate.interactableRegion at create time', () => {
    assert.deepEqual(buildInteractableRegionFlags(), {
      fabricate: { [REGION_OWNERSHIP_FLAG]: true },
    });
  });

  it('reads ownership from raw flags and from a live getFlag document', () => {
    assert.equal(isFabricateOwnedRegion({ flags: buildInteractableRegionFlags() }), true);
    assert.equal(isFabricateOwnedRegion({ flags: {} }), false);
    assert.equal(isFabricateOwnedRegion(null), false);
    const live = { getFlag: (scope, key) => scope === 'fabricate' && key === REGION_OWNERSHIP_FLAG };
    assert.equal(isFabricateOwnedRegion(live), true);
  });

  it('reads behaviours from the V13 collection + array shapes', () => {
    const rows = [{ id: 'a', type: FAB }];
    assert.deepEqual(readRegionBehaviors({ behaviors: { contents: rows } }), rows);
    assert.deepEqual(readRegionBehaviors({ behaviors: { values: () => rows.values() } }), rows);
    assert.deepEqual(readRegionBehaviors({ behaviors: rows }), rows);
    assert.deepEqual(readRegionBehaviors({}), []);
  });
});

describe('decideInteractableDeletion', () => {
  it('deletes the whole region for a Fabricate-created region with no foreign behaviours', () => {
    const plan = decideInteractableDeletion({
      fabricateOwnsRegion: true,
      behaviors: [{ id: 'fab-1', type: FAB }],
      targetBehaviorId: 'fab-1',
    });
    assert.deepEqual(plan, { scope: 'region' });
  });

  it('deletes only the Fabricate behaviour for a PROMOTED foreign region', () => {
    const plan = decideInteractableDeletion({
      fabricateOwnsRegion: false,
      behaviors: [
        { id: 'lighting', type: 'adjustDarknessLevel' },
        { id: 'fab-1', type: FAB },
      ],
      targetBehaviorId: 'fab-1',
    });
    assert.equal(plan.scope, 'behavior');
    assert.deepEqual(plan.behaviorIds, ['fab-1']);
    assert.equal(plan.clearRegionOwnershipFlag, false);
  });

  it('keeps a Fabricate-created region alive when it also carries a foreign behaviour, and clears the stale stamp', () => {
    const plan = decideInteractableDeletion({
      fabricateOwnsRegion: true,
      behaviors: [
        { id: 'fab-1', type: FAB },
        { id: 'weather', type: 'thirdparty.weather' },
      ],
      targetBehaviorId: 'fab-1',
    });
    assert.equal(plan.scope, 'behavior');
    assert.deepEqual(plan.behaviorIds, ['fab-1']);
    assert.equal(plan.clearRegionOwnershipFlag, true);
  });

  it('SAFE LEGACY DEFAULT: unknown provenance (no flag) is treated as promoted / do-not-destroy', () => {
    const plan = decideInteractableDeletion({
      fabricateOwnsRegion: false,
      behaviors: [{ id: 'fab-1', type: FAB }],
      targetBehaviorId: 'fab-1',
    });
    assert.equal(plan.scope, 'behavior');
    assert.deepEqual(plan.behaviorIds, ['fab-1']);
  });

  it('falls back to every Fabricate behaviour when no target id is supplied', () => {
    const plan = decideInteractableDeletion({
      fabricateOwnsRegion: false,
      behaviors: [
        { id: 'fab-1', type: FAB },
        { id: 'fab-2', type: FAB },
        { id: 'other', type: 'x' },
      ],
    });
    assert.equal(plan.scope, 'behavior');
    assert.deepEqual(plan.behaviorIds, ['fab-1', 'fab-2']);
  });
});

describe('executeInteractableDeletion', () => {
  it('CREATED region: deletes the Region document', async () => {
    const region = makeFakeRegion({ owned: true, behaviors: [{ id: 'fab-1', type: FAB }] });
    const plan = planInteractableDeletion(region, { targetBehaviorId: 'fab-1' });
    await executeInteractableDeletion(region, plan);
    assert.equal(region.calls.delete, 1);
    assert.equal(region.calls.deleteEmbedded.length, 0);
  });

  it('PROMOTED region with a foreign behaviour: NEVER deletes the Region — only Fabricate\'s behaviour survives removal', async () => {
    const region = makeFakeRegion({
      owned: false,
      behaviors: [
        { id: 'condition', type: 'macro' },
        { id: 'fab-1', type: FAB },
      ],
    });
    const plan = planInteractableDeletion(region, { targetBehaviorId: 'fab-1' });
    await executeInteractableDeletion(region, plan);
    // The user's Region and foreign behaviour survive: no region.delete().
    assert.equal(region.calls.delete, 0);
    assert.deepEqual(region.calls.deleteEmbedded, [
      { type: 'RegionBehavior', ids: ['fab-1'] },
    ]);
  });

  it('LEGACY promoted interactable (no ownership flag): does not destroy the Region', async () => {
    const region = makeFakeRegion({ owned: false, behaviors: [{ id: 'fab-1', type: FAB }] });
    const plan = planInteractableDeletion(region, { targetBehaviorId: 'fab-1' });
    await executeInteractableDeletion(region, plan);
    assert.equal(region.calls.delete, 0);
    assert.deepEqual(region.calls.deleteEmbedded, [
      { type: 'RegionBehavior', ids: ['fab-1'] },
    ]);
  });

  it('CREATED region kept alive by a foreign behaviour: removes the behaviour and clears the stale ownership stamp', async () => {
    const region = makeFakeRegion({
      owned: true,
      behaviors: [
        { id: 'fab-1', type: FAB },
        { id: 'weather', type: 'thirdparty.weather' },
      ],
    });
    const plan = planInteractableDeletion(region, { targetBehaviorId: 'fab-1' });
    await executeInteractableDeletion(region, plan);
    assert.equal(region.calls.delete, 0);
    assert.deepEqual(region.calls.deleteEmbedded, [
      { type: 'RegionBehavior', ids: ['fab-1'] },
    ]);
    assert.deepEqual(region.calls.unsetFlag, [
      { scope: 'fabricate', key: REGION_OWNERSHIP_FLAG },
    ]);
  });
});
