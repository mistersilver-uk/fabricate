/**
 * Pure-decision coverage for the tile depleted-behavior planner.
 *
 * `planDepletedBehavior` decides the tile mutation for a depleted/respawned
 * transition: stash-on-first-deplete, apply swap-image, terminal delete,
 * revert-from-stash, and idempotency. Tiles have NO nameplate, so the
 * `postfixName` mode is DROPPED — it never produces a name change. The thin
 * GM-socket edge (`buildDepletedBehaviorWriter`) is exercised here with fakes so
 * the routing (update vs delete vs no-op, identify) is asserted without `game.*`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { planDepletedBehavior, buildDepletedBehaviorWriter } from '../../src/canvas/depletedBehavior.js';

function tile({ src = 'icons/orig.webp', nodeOriginal } = {}) {
  const flags = { fabricate: { isInteractable: true } };
  if (nodeOriginal !== undefined) flags.fabricate.nodeOriginal = nodeOriginal;
  return { id: 't1', parent: { id: 's1' }, texture: { src }, flags };
}

// --- no behavior configured -------------------------------------------------

test('no behavior configured ⇒ no-op in both depleted and not-depleted states', () => {
  assert.deepEqual(planDepletedBehavior({ behavior: null, depleted: true, tile: tile() }), { action: 'none' });
  assert.deepEqual(planDepletedBehavior({ behavior: {}, depleted: false, tile: tile() }), { action: 'none' });
});

// --- apply on first depletion (stash) ---------------------------------------

test('swapImage applies a texture and stashes the original on first depletion', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp' },
    depleted: true,
    tile: tile()
  });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.texture.src, 'icons/depleted.webp');
  assert.deepEqual(plan.update.flags.fabricate.nodeOriginal, { img: 'icons/orig.webp' });
  assert.equal(plan.update.name, undefined, 'tiles never carry a name change');
});

// --- postfixName is DROPPED for tiles ---------------------------------------

test('postfixName is NOT applied for tiles (no nameplate) — a postfix-only behavior is a no-op', () => {
  const plan = planDepletedBehavior({
    behavior: { postfixName: true },
    depleted: true,
    tile: tile()
  });
  assert.deepEqual(plan, { action: 'none' }, 'postfix-only depleted behavior changes nothing on a tile');
});

test('swap + postfix together applies ONLY the swap (postfix is dropped for tiles)', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp', postfixName: true },
    depleted: true,
    tile: tile()
  });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.texture.src, 'icons/depleted.webp');
  assert.equal(plan.update.name, undefined, 'the postfix name is never applied to a tile');
});

// --- idempotency: do not re-stash / re-apply --------------------------------

test('apply is idempotent — a tile already carrying nodeOriginal is a no-op', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp' },
    depleted: true,
    tile: tile({ nodeOriginal: { img: 'icons/orig.webp' } })
  });
  assert.deepEqual(plan, { action: 'none' }, 'no re-stash / re-apply when already in the depleted visual');
});

// --- terminal delete --------------------------------------------------------

test('deleteToken on depletion is terminal — action: delete, no update/stash', () => {
  const plan = planDepletedBehavior({ behavior: { deleteToken: true }, depleted: true, tile: tile() });
  assert.deepEqual(plan, { action: 'delete' });
});

test('deleteToken mutual exclusion: swap/postfix are ignored even if present on the raw behavior', () => {
  const plan = planDepletedBehavior({
    behavior: { deleteToken: true, swapImage: 'icons/depleted.webp', postfixName: true },
    depleted: true,
    tile: tile()
  });
  assert.deepEqual(plan, { action: 'delete' }, 'normalization drops the dead swap/postfix, leaving a pure delete');
});

// --- revert on respawn ------------------------------------------------------

test('revert restores the image and clears the stash when no longer depleted', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp' },
    depleted: false,
    tile: tile({ src: 'icons/depleted.webp', nodeOriginal: { img: 'icons/orig.webp' } })
  });
  assert.equal(plan.action, 'revert');
  assert.equal(plan.update.texture.src, 'icons/orig.webp');
  assert.equal(plan.update.name, undefined, 'no name to restore on a tile');
  assert.equal(plan.update.flags.fabricate.nodeOriginal, null, 'the stash is cleared on revert');
});

test('revert is idempotent — nothing stashed means nothing to revert', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp' },
    depleted: false,
    tile: tile() // no nodeOriginal
  });
  assert.deepEqual(plan, { action: 'none' });
});

// --- writer edge routing ----------------------------------------------------

function recordingWriter() {
  const updates = [];
  const deletes = [];
  const apply = buildDepletedBehaviorWriter({
    emitUpdate: (args) => updates.push(args),
    emitDelete: (args) => deletes.push(args),
    identify: (t) => (t?.id ? { sceneId: t.parent.id, tileId: t.id } : null)
  });
  return { apply, updates, deletes };
}

test('writer routes an apply transition as a tile.update through the GM edge', () => {
  const { apply, updates, deletes } = recordingWriter();
  apply({ tile: tile(), behavior: { swapImage: 'icons/depleted.webp' }, depleted: true });
  assert.equal(updates.length, 1);
  assert.equal(deletes.length, 0);
  assert.deepEqual({ sceneId: updates[0].sceneId, tileId: updates[0].tileId }, { sceneId: 's1', tileId: 't1' });
  assert.equal(updates[0].update.texture.src, 'icons/depleted.webp');
});

test('writer routes a deleteToken transition as a tile.delete through the GM edge', () => {
  const { apply, updates, deletes } = recordingWriter();
  apply({ tile: tile(), behavior: { deleteToken: true }, depleted: true });
  assert.equal(deletes.length, 1);
  assert.equal(updates.length, 0);
  assert.deepEqual(deletes[0], { sceneId: 's1', tileId: 't1' });
});

test('writer no-ops (no update, no delete) when the plan is none', () => {
  const { apply, updates, deletes } = recordingWriter();
  apply({ tile: tile(), behavior: null, depleted: true });
  assert.equal(updates.length, 0);
  assert.equal(deletes.length, 0);
});
