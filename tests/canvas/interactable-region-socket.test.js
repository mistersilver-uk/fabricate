/**
 * Unit coverage for the region-first PURE socket validators + routers.
 *
 * Behaviour-update writer: the active GM applies locally (no round-trip), a
 * non-GM emits. Activate routes to validateAndGrant only on the active GM.
 * Granted routes to openGrant only for the targeted local user. Bad payloads are
 * rejected. No live Foundry runtime — collaborators are injected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERACTABLE_BEHAVIOR_UPDATE,
  INTERACTABLE_VISUAL_UPDATE,
  INTERACTABLE_VISUAL_DELETE,
  INTERACTABLE_ACTIVATE,
  INTERACTABLE_ACTIVATION_GRANTED,
  INTERACTABLE_ACTIVATION_DENIED,
  validateBehaviorUpdatePayload,
  validateVisualUpdatePayload,
  validateVisualDeletePayload,
  validateActivatePayload,
  validateActivationGrantedPayload,
  validateActivationDeniedPayload,
  createInteractableBehaviorWriter,
  routeInteractableBehaviorMessage,
  routeInteractableActivateMessage,
  routeInteractableActivationGranted,
  routeInteractableActivationDenied
} from '../../src/canvas/interactableSocket.js';
import { mayApplyNonGmBehaviorUpdate } from '../../src/canvas/regions/interactableRegionFlags.js';

const NODE_UPDATE = { system: { node: { current: 1 } } };

let capturedWarnings;
let originalWarn;
function silenceWarnings() {
  capturedWarnings = [];
  originalWarn = console.warn;
  console.warn = (...args) => capturedWarnings.push(args);
}
function restoreWarnings() {
  console.warn = originalWarn;
}

// --- behaviour-update validation --------------------------------------------

test('validateBehaviorUpdatePayload accepts a well-formed payload', () => {
  assert.deepEqual(
    validateBehaviorUpdatePayload({ action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }),
    { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }
  );
});

test('validateBehaviorUpdatePayload rejects malformed payloads', () => {
  assert.equal(validateBehaviorUpdatePayload(null), null);
  assert.equal(validateBehaviorUpdatePayload({ action: 'other', sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }), null);
  assert.equal(validateBehaviorUpdatePayload({ action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: '', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }), null);
  assert.equal(validateBehaviorUpdatePayload({ action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: '', behaviorId: 'b1', update: NODE_UPDATE }), null);
  assert.equal(validateBehaviorUpdatePayload({ action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: '', update: NODE_UPDATE }), null);
  assert.equal(validateBehaviorUpdatePayload({ action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: [1] }), null);
});

// --- visual update / delete validation --------------------------------------

test('validateVisualUpdatePayload accepts uuid or docId+documentName', () => {
  const byUuid = validateVisualUpdatePayload({ action: INTERACTABLE_VISUAL_UPDATE, sceneId: 's1', visualUuid: 'Scene.s1.Tile.t1', update: { x: 1 } });
  assert.equal(byUuid.visualUuid, 'Scene.s1.Tile.t1');
  const byDoc = validateVisualUpdatePayload({ action: INTERACTABLE_VISUAL_UPDATE, sceneId: 's1', docId: 't1', documentName: 'Tile', update: { x: 1 } });
  assert.equal(byDoc.docId, 't1');
  assert.equal(byDoc.documentName, 'Tile');
});

test('validateVisualUpdatePayload rejects when neither uuid nor docId+documentName present', () => {
  assert.equal(validateVisualUpdatePayload({ action: INTERACTABLE_VISUAL_UPDATE, sceneId: 's1', update: { x: 1 } }), null);
  assert.equal(validateVisualUpdatePayload({ action: INTERACTABLE_VISUAL_UPDATE, sceneId: 's1', docId: 't1', update: { x: 1 } }), null);
  assert.equal(validateVisualUpdatePayload({ action: INTERACTABLE_VISUAL_UPDATE, sceneId: 's1', visualUuid: 'u', update: null }), null);
});

test('validateVisualDeletePayload requires scene + a visual identity', () => {
  assert.equal(validateVisualDeletePayload({ action: INTERACTABLE_VISUAL_DELETE, sceneId: 's1', visualUuid: 'u' }).visualUuid, 'u');
  assert.equal(validateVisualDeletePayload({ action: INTERACTABLE_VISUAL_DELETE, sceneId: 's1' }), null);
});

// --- activate / granted validation ------------------------------------------

test('validateActivatePayload requires scene/region/behaviour + user and passes the rest through', () => {
  const ok = validateActivatePayload({
    action: INTERACTABLE_ACTIVATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1',
    userId: 'u1', sourceUuid: 'Item.x', interactableType: 'tool'
  });
  assert.equal(ok.userId, 'u1');
  assert.equal(ok.sourceUuid, 'Item.x');
  assert.equal(ok.interactableType, 'tool');
  assert.equal(validateActivatePayload({ action: INTERACTABLE_ACTIVATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1' }), null);
});

test('validateActivationGrantedPayload requires user + requestId or behaviorId', () => {
  assert.equal(validateActivationGrantedPayload({ action: INTERACTABLE_ACTIVATION_GRANTED, userId: 'u1', behaviorId: 'b1' }).behaviorId, 'b1');
  assert.equal(validateActivationGrantedPayload({ action: INTERACTABLE_ACTIVATION_GRANTED, userId: 'u1', requestId: 'q1' }).requestId, 'q1');
  assert.equal(validateActivationGrantedPayload({ action: INTERACTABLE_ACTIVATION_GRANTED, userId: 'u1' }), null);
  assert.equal(validateActivationGrantedPayload({ action: INTERACTABLE_ACTIVATION_GRANTED, behaviorId: 'b1' }), null);
});

// --- behaviour-update writer ------------------------------------------------

test('behaviour writer applies locally on the active GM, emits on a non-GM', () => {
  const applied = [];
  const emitted = [];
  const gm = createInteractableBehaviorWriter({ isActiveGM: () => true, emitUpdate: (p) => emitted.push(p), applyUpdate: (a) => applied.push(a) });
  gm.write({ sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE });
  assert.deepEqual(applied, [{ sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }]);
  assert.equal(emitted.length, 0);

  applied.length = 0;
  const player = createInteractableBehaviorWriter({ isActiveGM: () => false, emitUpdate: (p) => emitted.push(p), applyUpdate: (a) => applied.push(a) });
  player.write({ sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE });
  assert.equal(applied.length, 0);
  assert.deepEqual(emitted, [{ action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }]);
});

test('behaviour writer drops a malformed write', () => {
  let touched = false;
  const writer = createInteractableBehaviorWriter({ isActiveGM: () => true, emitUpdate: () => { touched = true; }, applyUpdate: () => { touched = true; } });
  writer.write({ sceneId: '', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE });
  assert.equal(touched, false);
});

// --- inbound behaviour-update router ----------------------------------------

test('behaviour router applies an inbound update only on the active GM', () => {
  const applied = [];
  assert.equal(routeInteractableBehaviorMessage(
    { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE },
    { isActiveGM: () => true, applyUpdate: (a) => applied.push(a) }
  ), true);
  assert.deepEqual(applied, [{ sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }]);

  const ignored = [];
  assert.equal(routeInteractableBehaviorMessage(
    { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE },
    { isActiveGM: () => false, applyUpdate: (a) => ignored.push(a) }
  ), false);
  assert.equal(ignored.length, 0);
});

// --- sender-auth: non-GM behaviour-update allowlist (issue 593) -------------

test('mayApplyNonGmBehaviorUpdate permits ONLY system.node writes (nested + dot-notation)', () => {
  // Legitimate issue-302 player scoped-pool decrement.
  assert.equal(mayApplyNonGmBehaviorUpdate({ system: { node: { current: 3 } } }), true);
  assert.equal(mayApplyNonGmBehaviorUpdate({ 'system.node.current': 3 }), true);
  assert.equal(mayApplyNonGmBehaviorUpdate({ system: { node: { current: 3, respawn: { at: 1 } } } }), true);
});

test('mayApplyNonGmBehaviorUpdate refuses every non-node write (fail-closed)', () => {
  // The forward-link forge (issue 534 step 1).
  assert.equal(mayApplyNonGmBehaviorUpdate({ system: { linkedVisual: { uuid: 'Scene.s1.Tile.t1' } } }), false);
  assert.equal(mayApplyNonGmBehaviorUpdate({ system: { state: { enabled: false } } }), false);
  assert.equal(mayApplyNonGmBehaviorUpdate({ system: { state: { locked: true } } }), false);
  assert.equal(mayApplyNonGmBehaviorUpdate({ presentation: { hidden: true } }), false);
  // A dot-notation-smuggled foreign key alongside a node key rejects the whole write.
  assert.equal(mayApplyNonGmBehaviorUpdate({ 'system.node.current': 1, 'system.linkedVisual.uuid': 'x' }), false);
  assert.equal(mayApplyNonGmBehaviorUpdate({ system: { node: { current: 1 }, state: { enabled: false } } }), false);
  // Empty / malformed updates fail closed.
  assert.equal(mayApplyNonGmBehaviorUpdate({}), false);
  assert.equal(mayApplyNonGmBehaviorUpdate(null), false);
  assert.equal(mayApplyNonGmBehaviorUpdate([{ system: { node: {} } }]), false);
});

test('behaviour router refuses a NON-GM sender writing system.linkedVisual (forge), applies a node-only write', () => {
  silenceWarnings();
  try {
    const forged = [];
    // Non-GM sender forging the forward link → refused, no apply, warns.
    assert.equal(
      routeInteractableBehaviorMessage(
        { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: { system: { linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' } } } },
        { isActiveGM: () => true, senderIsGM: false, applyUpdate: (a) => forged.push(a) }
      ),
      false
    );
    assert.equal(forged.length, 0, 'no forge write reaches the behaviour');
    assert.equal(capturedWarnings.length, 1, 'the refused forge is logged');

    // Non-GM sender writing ONLY system.node → applied (issue-302 gather decrement).
    const applied = [];
    assert.equal(
      routeInteractableBehaviorMessage(
        { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE },
        { isActiveGM: () => true, senderIsGM: false, applyUpdate: (a) => applied.push(a) }
      ),
      true
    );
    assert.deepEqual(applied, [{ sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: NODE_UPDATE }]);
  } finally {
    restoreWarnings();
  }
});

test('behaviour router lets a GM sender write ANY field (state, linkedVisual)', () => {
  const applied = [];
  assert.equal(
    routeInteractableBehaviorMessage(
      { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: { system: { state: { enabled: false } } } },
      { isActiveGM: () => true, senderIsGM: true, applyUpdate: (a) => applied.push(a) }
    ),
    true
  );
  assert.equal(applied.length, 1);
});

test('behaviour router refuses a NON-GM write mixing system.node with a foreign field', () => {
  silenceWarnings();
  try {
    const applied = [];
    assert.equal(
      routeInteractableBehaviorMessage(
        { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', update: { system: { node: { current: 1 }, state: { enabled: false } } } },
        { isActiveGM: () => true, senderIsGM: false, applyUpdate: (a) => applied.push(a) }
      ),
      false
    );
    assert.equal(applied.length, 0);
  } finally {
    restoreWarnings();
  }
});

// --- activate routing -------------------------------------------------------

test('activate routes to validateAndGrant only on the active GM', () => {
  const granted = [];
  const payload = { action: INTERACTABLE_ACTIVATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', userId: 'u1' };
  assert.equal(routeInteractableActivateMessage(payload, { isActiveGM: () => true, validateAndGrant: (r) => granted.push(r) }), true);
  assert.equal(granted.length, 1);
  assert.equal(granted[0].userId, 'u1');

  const ignored = [];
  assert.equal(routeInteractableActivateMessage(payload, { isActiveGM: () => false, validateAndGrant: (r) => ignored.push(r) }), false);
  assert.equal(ignored.length, 0);

  assert.equal(routeInteractableActivateMessage({ action: 'other' }, { isActiveGM: () => true, validateAndGrant: () => {} }), false);
});

test('activate refuses an impersonated request (payload userId !== authenticated sender)', () => {
  silenceWarnings();
  try {
    const granted = [];
    const payload = { action: INTERACTABLE_ACTIVATE, sceneId: 's1', regionId: 'r1', behaviorId: 'b1', userId: 'victim' };
    // The attacker emits a request claiming to be `victim`, but the server-attested
    // sender is `attacker`. Refused, no grant.
    assert.equal(
      routeInteractableActivateMessage(payload, { isActiveGM: () => true, senderId: 'attacker', validateAndGrant: (r) => granted.push(r) }),
      false
    );
    assert.equal(granted.length, 0);
    // The matching sender is honored.
    const ok = [];
    assert.equal(
      routeInteractableActivateMessage(payload, { isActiveGM: () => true, senderId: 'victim', validateAndGrant: (r) => ok.push(r) }),
      true
    );
    assert.equal(ok.length, 1);
  } finally {
    restoreWarnings();
  }
});

// --- granted routing --------------------------------------------------------

test('granted routes to openGrant only for the targeted local user', () => {
  const opened = [];
  const payload = { action: INTERACTABLE_ACTIVATION_GRANTED, userId: 'u1', behaviorId: 'b1', grant: { tab: 'gathering' } };
  assert.equal(routeInteractableActivationGranted(payload, { isLocalUser: (id) => id === 'u1', openGrant: (g) => opened.push(g) }), true);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].grant, { tab: 'gathering' });

  const ignored = [];
  assert.equal(routeInteractableActivationGranted(payload, { isLocalUser: (id) => id === 'someoneElse', openGrant: (g) => ignored.push(g) }), false);
  assert.equal(ignored.length, 0);
});

// --- denied validation + routing --------------------------------------------

test('validateActivationDeniedPayload requires the action + userId and normalizes the reason', () => {
  const ok = validateActivationDeniedPayload({ action: INTERACTABLE_ACTIVATION_DENIED, userId: 'u1', reason: 'LOCKED' });
  assert.deepEqual(ok, { action: INTERACTABLE_ACTIVATION_DENIED, userId: 'u1', reason: 'LOCKED' });
  // A blank/absent reason normalizes to null (the receiver maps it to the generic key).
  assert.equal(validateActivationDeniedPayload({ action: INTERACTABLE_ACTIVATION_DENIED, userId: 'u1' }).reason, null);
  assert.equal(validateActivationDeniedPayload({ action: INTERACTABLE_ACTIVATION_DENIED, userId: 'u1', reason: '  ' }).reason, null);
  // Rejected: wrong action, missing user, non-object.
  assert.equal(validateActivationDeniedPayload({ action: 'other', userId: 'u1' }), null);
  assert.equal(validateActivationDeniedPayload({ action: INTERACTABLE_ACTIVATION_DENIED, userId: '' }), null);
  assert.equal(validateActivationDeniedPayload(null), null);
});

test('denied routes to notifyDenied only for the targeted local user; bad payloads are dropped', () => {
  const notified = [];
  const payload = { action: INTERACTABLE_ACTIVATION_DENIED, userId: 'u1', reason: 'COOLDOWN' };
  assert.equal(routeInteractableActivationDenied(payload, { isLocalUser: (id) => id === 'u1', notifyDenied: (r) => notified.push(r) }), true);
  assert.deepEqual(notified, ['COOLDOWN']);

  const ignored = [];
  assert.equal(routeInteractableActivationDenied(payload, { isLocalUser: (id) => id === 'someoneElse', notifyDenied: (r) => ignored.push(r) }), false);
  assert.equal(ignored.length, 0);

  assert.equal(routeInteractableActivationDenied({ action: 'other' }, { isLocalUser: () => true, notifyDenied: () => {} }), false);
});
