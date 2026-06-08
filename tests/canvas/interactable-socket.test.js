/**
 * Unit coverage for the PURE GM-routed Interactable node-update socket logic.
 *
 * Mirrors `tests/hazard-scene-coordinator.test.js`: only the active GM applies a
 * token write; the GM-on-GM case applies LOCALLY (no socket round-trip, because
 * an emit never reaches the emitter); a non-GM emits; malformed payloads are
 * rejected. No live Foundry runtime — the apply/emit side-effects are injected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_NODE_UPDATE,
  INTERACTABLE_NODE_DELETE,
  validateNodeUpdatePayload,
  validateNodeDeletePayload,
  createInteractableNodeWriter,
  createInteractableTokenDeleter,
  routeInteractableSocketMessage,
  routeInteractableDeleteMessage
} from '../../src/canvas/interactableSocket.js';

const UPDATE = { flags: { fabricate: { node: { current: 1 } } } };

test('socket channel is the shared fabricate module channel', () => {
  assert.equal(INTERACTABLE_SOCKET, 'module.fabricate');
  assert.equal(INTERACTABLE_NODE_UPDATE, 'interactableNodeUpdate');
});

// --- payload validation -----------------------------------------------------

test('validateNodeUpdatePayload accepts a well-formed payload', () => {
  const ok = validateNodeUpdatePayload({ action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: UPDATE });
  assert.deepEqual(ok, { action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: UPDATE });
});

test('validateNodeUpdatePayload rejects malformed payloads', () => {
  assert.equal(validateNodeUpdatePayload(null), null);
  assert.equal(validateNodeUpdatePayload({ action: 'other', sceneId: 's1', tokenId: 't1', update: UPDATE }), null);
  assert.equal(validateNodeUpdatePayload({ action: INTERACTABLE_NODE_UPDATE, sceneId: '', tokenId: 't1', update: UPDATE }), null);
  assert.equal(validateNodeUpdatePayload({ action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: '', update: UPDATE }), null);
  assert.equal(validateNodeUpdatePayload({ action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: null }), null);
  assert.equal(validateNodeUpdatePayload({ action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: [1, 2] }), null);
});

// --- writer: GM applies locally, non-GM emits -------------------------------

test('writer applies locally on the active GM (no socket round-trip)', () => {
  const applied = [];
  const emitted = [];
  const writer = createInteractableNodeWriter({
    isActiveGM: () => true,
    emitUpdate: (p) => emitted.push(p),
    applyUpdate: (a) => applied.push(a)
  });
  writer.write({ sceneId: 's1', tokenId: 't1', update: UPDATE });
  assert.deepEqual(applied, [{ sceneId: 's1', tokenId: 't1', update: UPDATE }]);
  assert.equal(emitted.length, 0, 'the GM does NOT emit its own write (an emit never reaches the emitter)');
});

test('writer emits to the active GM on a non-GM client', () => {
  const applied = [];
  const emitted = [];
  const writer = createInteractableNodeWriter({
    isActiveGM: () => false,
    emitUpdate: (p) => emitted.push(p),
    applyUpdate: (a) => applied.push(a)
  });
  writer.write({ sceneId: 's1', tokenId: 't1', update: UPDATE });
  assert.equal(applied.length, 0, 'a non-GM does not apply directly');
  assert.deepEqual(emitted, [{ action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: UPDATE }]);
});

test('writer drops a malformed write request', () => {
  let touched = false;
  const writer = createInteractableNodeWriter({
    isActiveGM: () => true,
    emitUpdate: () => { touched = true; },
    applyUpdate: () => { touched = true; }
  });
  writer.write({ sceneId: '', tokenId: 't1', update: UPDATE });
  assert.equal(touched, false);
});

// --- inbound router: only the active GM applies -----------------------------

test('router applies an inbound node update only on the active GM', () => {
  const applied = [];
  const applied2 = [];

  const wasApplied = routeInteractableSocketMessage(
    { action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: UPDATE },
    { isActiveGM: () => true, applyUpdate: (a) => applied.push(a) }
  );
  assert.equal(wasApplied, true);
  assert.deepEqual(applied, [{ sceneId: 's1', tokenId: 't1', update: UPDATE }]);

  const wasApplied2 = routeInteractableSocketMessage(
    { action: INTERACTABLE_NODE_UPDATE, sceneId: 's1', tokenId: 't1', update: UPDATE },
    { isActiveGM: () => false, applyUpdate: (a) => applied2.push(a) }
  );
  assert.equal(wasApplied2, false, 'a non-active-GM ignores the inbound update');
  assert.equal(applied2.length, 0);
});

test('router ignores malformed / non-node inbound payloads', () => {
  let touched = false;
  const deps = { isActiveGM: () => true, applyUpdate: () => { touched = true; } };
  assert.equal(routeInteractableSocketMessage(null, deps), false);
  assert.equal(routeInteractableSocketMessage({ action: 'hazardScenePrompt' }, deps), false);
  assert.equal(routeInteractableSocketMessage({ action: INTERACTABLE_NODE_UPDATE, sceneId: 's1' }, deps), false);
  assert.equal(touched, false);
});

// --- terminal deleteToken routing (Phase 6) ---------------------------------

test('validateNodeDeletePayload requires a scene + token id', () => {
  assert.equal(validateNodeDeletePayload(null), null);
  assert.equal(validateNodeDeletePayload({ action: 'other', sceneId: 's', tokenId: 't' }), null);
  assert.equal(validateNodeDeletePayload({ action: INTERACTABLE_NODE_DELETE, sceneId: 's1' }), null);
  assert.deepEqual(
    validateNodeDeletePayload({ action: INTERACTABLE_NODE_DELETE, sceneId: ' s1 ', tokenId: ' t1 ' }),
    { action: INTERACTABLE_NODE_DELETE, sceneId: 's1', tokenId: 't1' }
  );
});

test('the deleter applies LOCALLY on the active GM (no socket round-trip)', () => {
  const applied = [];
  const emitted = [];
  const deleter = createInteractableTokenDeleter({
    isActiveGM: () => true,
    emitDelete: (p) => emitted.push(p),
    applyDelete: (a) => applied.push(a)
  });
  deleter.delete({ sceneId: 's1', tokenId: 't1' });
  assert.deepEqual(applied, [{ sceneId: 's1', tokenId: 't1' }]);
  assert.equal(emitted.length, 0, 'the active GM never emits its own delete');
});

test('a non-active-GM EMITS the delete for the active GM to apply', () => {
  const applied = [];
  const emitted = [];
  const deleter = createInteractableTokenDeleter({
    isActiveGM: () => false,
    emitDelete: (p) => emitted.push(p),
    applyDelete: (a) => applied.push(a)
  });
  deleter.delete({ sceneId: 's1', tokenId: 't1' });
  assert.equal(applied.length, 0);
  assert.deepEqual(emitted, [{ action: INTERACTABLE_NODE_DELETE, sceneId: 's1', tokenId: 't1' }]);
});

test('the inbound delete router applies only on the active GM', () => {
  const applied = [];
  assert.equal(
    routeInteractableDeleteMessage(
      { action: INTERACTABLE_NODE_DELETE, sceneId: 's1', tokenId: 't1' },
      { isActiveGM: () => true, applyDelete: (a) => applied.push(a) }
    ),
    true
  );
  assert.deepEqual(applied, [{ sceneId: 's1', tokenId: 't1' }]);

  const ignored = [];
  assert.equal(
    routeInteractableDeleteMessage(
      { action: INTERACTABLE_NODE_DELETE, sceneId: 's1', tokenId: 't1' },
      { isActiveGM: () => false, applyDelete: (a) => ignored.push(a) }
    ),
    false
  );
  assert.equal(ignored.length, 0);
});
