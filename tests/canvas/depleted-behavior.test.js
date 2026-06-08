/**
 * Pure-decision coverage for the depleted-behavior planner (Phase 6).
 *
 * `planDepletedBehavior` decides the token mutation for a depleted/respawned
 * transition: stash-on-first-deplete, apply image/postfix/both, terminal delete,
 * revert-from-stash, and idempotency. The thin GM-socket edge
 * (`buildDepletedBehaviorWriter`) is exercised here with fakes so the routing
 * (update vs delete vs no-op, identify) is asserted without `game.*`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { planDepletedBehavior, buildDepletedBehaviorWriter } from '../../src/canvas/depletedBehavior.js';

function token({ src = 'icons/orig.webp', name = 'Iron Vein', nodeOriginal } = {}) {
  const flags = { fabricate: { isInteractable: true } };
  if (nodeOriginal !== undefined) flags.fabricate.nodeOriginal = nodeOriginal;
  return { id: 't1', parent: { id: 's1' }, texture: { src }, name, flags };
}

// --- no behavior configured -------------------------------------------------

test('no behavior configured ⇒ no-op in both depleted and not-depleted states', () => {
  assert.deepEqual(planDepletedBehavior({ behavior: null, depleted: true, token: token() }), { action: 'none' });
  assert.deepEqual(planDepletedBehavior({ behavior: {}, depleted: false, token: token() }), { action: 'none' });
});

// --- apply on first depletion (stash) ---------------------------------------

test('swapImage applies a texture and stashes the original on first depletion', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp' },
    depleted: true,
    token: token()
  });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.texture.src, 'icons/depleted.webp');
  assert.deepEqual(plan.update.flags.fabricate.nodeOriginal, { img: 'icons/orig.webp', name: 'Iron Vein' });
  assert.equal(plan.update.name, undefined, 'swap-only does not touch the name');
});

test('postfixName appends "(depleted)" and stashes the original', () => {
  const plan = planDepletedBehavior({
    behavior: { postfixName: true },
    depleted: true,
    token: token({ name: 'Iron Vein' })
  });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.name, 'Iron Vein (depleted)');
  assert.equal(plan.update.texture, undefined, 'postfix-only does not swap the image');
  assert.equal(plan.update.flags.fabricate.nodeOriginal.name, 'Iron Vein');
});

test('both swap + postfix apply together', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp', postfixName: true },
    depleted: true,
    token: token()
  });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.texture.src, 'icons/depleted.webp');
  assert.equal(plan.update.name, 'Iron Vein (depleted)');
});

// --- idempotency: do not re-stash / re-apply --------------------------------

test('apply is idempotent — a token already carrying nodeOriginal is a no-op', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp', postfixName: true },
    depleted: true,
    token: token({ nodeOriginal: { img: 'icons/orig.webp', name: 'Iron Vein' } })
  });
  assert.deepEqual(plan, { action: 'none' }, 'no re-stash / re-apply when already in the depleted visual');
});

// --- terminal delete --------------------------------------------------------

test('deleteToken on depletion is terminal — action: delete, no update/stash', () => {
  const plan = planDepletedBehavior({ behavior: { deleteToken: true }, depleted: true, token: token() });
  assert.deepEqual(plan, { action: 'delete' });
});

test('deleteToken mutual exclusion: swap/postfix are ignored even if present on the raw behavior', () => {
  const plan = planDepletedBehavior({
    behavior: { deleteToken: true, swapImage: 'icons/depleted.webp', postfixName: true },
    depleted: true,
    token: token()
  });
  assert.deepEqual(plan, { action: 'delete' }, 'normalization drops the dead swap/postfix, leaving a pure delete');
});

// --- revert on respawn ------------------------------------------------------

test('revert restores image + name and clears the stash when no longer depleted', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp', postfixName: true },
    depleted: false,
    token: token({ src: 'icons/depleted.webp', name: 'Iron Vein (depleted)', nodeOriginal: { img: 'icons/orig.webp', name: 'Iron Vein' } })
  });
  assert.equal(plan.action, 'revert');
  assert.equal(plan.update.texture.src, 'icons/orig.webp');
  assert.equal(plan.update.name, 'Iron Vein');
  assert.equal(plan.update.flags.fabricate.nodeOriginal, null, 'the stash is cleared on revert');
});

test('revert is idempotent — nothing stashed means nothing to revert', () => {
  const plan = planDepletedBehavior({
    behavior: { swapImage: 'icons/depleted.webp' },
    depleted: false,
    token: token() // no nodeOriginal
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
    identify: (tok) => (tok?.id ? { sceneId: tok.parent.id, tokenId: tok.id } : null)
  });
  return { apply, updates, deletes };
}

test('writer routes an apply transition as a token.update through the GM edge', () => {
  const { apply, updates, deletes } = recordingWriter();
  apply({ token: token(), behavior: { swapImage: 'icons/depleted.webp' }, depleted: true });
  assert.equal(updates.length, 1);
  assert.equal(deletes.length, 0);
  assert.deepEqual({ sceneId: updates[0].sceneId, tokenId: updates[0].tokenId }, { sceneId: 's1', tokenId: 't1' });
  assert.equal(updates[0].update.texture.src, 'icons/depleted.webp');
});

test('writer routes a deleteToken transition as a token.delete through the GM edge', () => {
  const { apply, updates, deletes } = recordingWriter();
  apply({ token: token(), behavior: { deleteToken: true }, depleted: true });
  assert.equal(deletes.length, 1);
  assert.equal(updates.length, 0);
  assert.deepEqual(deletes[0], { sceneId: 's1', tokenId: 't1' });
});

test('writer no-ops (no update, no delete) when the plan is none', () => {
  const { apply, updates, deletes } = recordingWriter();
  apply({ token: token(), behavior: null, depleted: true });
  assert.equal(updates.length, 0);
  assert.equal(deletes.length, 0);
});
