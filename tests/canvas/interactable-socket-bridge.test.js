/**
 * Edge coverage for the active-GM Foundry glue in `interactableSocketBridge.js`:
 * the three mutation seams reachable over the shared `module.fabricate` socket
 * (`applyInteractableBehaviorUpdate`, `applyInteractableVisualUpdate`,
 * `applyInteractableVisualDelete`). Each seam carries an OWNERSHIP guard so a
 * drifted/reused/crafted id or uuid can never mutate or delete a foreign document.
 *
 * The visual update/delete seams additionally require a BIDIRECTIONAL link: a
 * reverse flag (mintable via a stamp-only socket write) does not by itself authorize
 * a core-data write or a delete — the linked `fabricate.interactable` behaviour must
 * forward-link back to the same document. Only the relink provenance stamp (which
 * writes no core data) is exempt. This is defense-in-depth that raises the escalation
 * bar, not a full closure — the forward link is itself socket-writable, so complete
 * closure needs socket sender authentication (tracked by issue 593).
 *
 * These drive the real functions through injected `globalThis.game` /
 * `globalThis.fromUuidSync` fakes (no live Foundry).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyInteractableBehaviorUpdate,
  applyInteractableVisualUpdate,
  applyInteractableVisualDelete,
  handleInteractableSocketMessage,
} from '../../src/canvas/interactableSocketBridge.js';
import {
  INTERACTABLE_BEHAVIOR_UPDATE,
  INTERACTABLE_VISUAL_UPDATE,
  INTERACTABLE_VISUAL_DELETE,
  INTERACTABLE_ACTIVATE,
} from '../../src/canvas/interactableSocket.js';

const SCENE_ID = 's1';
const REGION_ID = 'r1';
const REGION_UUID = 'Scene.s1.Region.r1';
const BEHAVIOR_ID = 'b1';
const VISUAL_UUID = 'Scene.s1.Tile.t1';

// A recording behaviour document. `type` decides ownership.
function makeBehavior(type) {
  const calls = [];
  return {
    type,
    calls,
    update(update) {
      calls.push(update);
      return Promise.resolve();
    },
  };
}

// A recording Tile document. `flags` decides the reverse-flag claim; `uuid` is the
// identity the behaviour's forward link must match.
function makeVisual(flags = {}, uuid = VISUAL_UUID) {
  const updates = [];
  const deletes = [];
  return {
    uuid,
    flags,
    updates,
    deletes,
    update(update) {
      updates.push(update);
      return Promise.resolve();
    },
    delete() {
      deletes.push(true);
      return Promise.resolve();
    },
  };
}

// The reverse flag a genuine (or minted) visual carries, pointing at BEHAVIOR_ID.
const OWNED_VISUAL_FLAGS = {
  fabricate: { isInteractableVisual: true, linkedRegionUuid: REGION_UUID, linkedBehaviorId: BEHAVIOR_ID },
};

// A `fabricate.interactable` behaviour whose forward link points at `forwardUuid`.
function makeLinkedBehavior(forwardUuid) {
  return { type: 'fabricate.interactable', system: { linkedVisual: { uuid: forwardUuid } } };
}

let warnings;
let originalWarn;

function installBehavior(behavior) {
  globalThis.game = {
    scenes: {
      get: (id) =>
        id === SCENE_ID
          ? { regions: { get: (rid) => (rid === REGION_ID ? { behaviors: { get: (bid) => (bid === BEHAVIOR_ID ? behavior : null) } } : null) } }
          : null,
    },
  };
}

// Resolve the visual by uuid AND (optionally) the linked region by its uuid, so the
// bidirectional round-trip can find the behaviour. `linkedBehavior` null → the
// reverse flag points at a behaviour that does not resolve (fake-behaviour case).
function installVisual(doc, linkedBehavior = null) {
  globalThis.fromUuidSync = (uuid) => {
    if (uuid === VISUAL_UUID) return doc;
    if (uuid === REGION_UUID) {
      return { behaviors: { get: (bid) => (bid === BEHAVIOR_ID ? linkedBehavior : null) } };
    }
    return null;
  };
}

beforeEach(() => {
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
});

afterEach(() => {
  console.warn = originalWarn;
  delete globalThis.game;
  delete globalThis.fromUuidSync;
});

describe('applyInteractableBehaviorUpdate ownership guard', () => {
  it('applies the update on a genuine fabricate.interactable behaviour', async () => {
    const behavior = makeBehavior('fabricate.interactable');
    installBehavior(behavior);
    await applyInteractableBehaviorUpdate({
      sceneId: SCENE_ID,
      regionId: REGION_ID,
      behaviorId: BEHAVIOR_ID,
      update: { system: { state: { enabled: false } } },
    });
    assert.equal(behavior.calls.length, 1);
    assert.deepEqual(behavior.calls[0], { system: { state: { enabled: false } } });
  });

  it('refuses to mutate a FOREIGN behaviour resolved by the same ids (logs, no write)', async () => {
    const foreign = makeBehavior('core.executeMacro');
    installBehavior(foreign);
    await applyInteractableBehaviorUpdate({
      sceneId: SCENE_ID,
      regionId: REGION_ID,
      behaviorId: BEHAVIOR_ID,
      update: { system: { state: { enabled: false } } },
    });
    assert.equal(foreign.calls.length, 0, 'no write to a non-Fabricate behaviour');
    assert.equal(warnings.length, 1, 'the refused write is logged');
  });
});

describe('applyInteractableVisualUpdate ownership guard', () => {
  it('applies a core-data update on a genuinely bidirectionally-linked visual', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(doc, makeLinkedBehavior(VISUAL_UUID)); // forward link matches the doc
    await applyInteractableVisualUpdate({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { hidden: true } });
    assert.equal(doc.updates.length, 1);
    assert.deepEqual(doc.updates[0], { hidden: true });
  });

  it('refuses a core-data write to a FOREIGN document resolved by uuid (logs, no write)', async () => {
    const foreign = makeVisual({}); // no reverse flag
    installVisual(foreign);
    await applyInteractableVisualUpdate({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { hidden: true, texture: { src: 'x' } } });
    assert.equal(foreign.updates.length, 0, 'no write to a foreign tile');
    assert.equal(warnings.length, 1);
  });

  it('refuses a payload that SMUGGLES core data alongside the provenance stamp (foreign doc, no write)', async () => {
    // The single-message exploit: a stamp is present so the naive check would allow
    // it, but the same payload also carries hidden/texture/geometry against a foreign
    // tile. The strict allowlist must reject the whole write.
    const foreign = makeVisual({});
    installVisual(foreign);
    await applyInteractableVisualUpdate({
      sceneId: SCENE_ID,
      visualUuid: VISUAL_UUID,
      update: { flags: { fabricate: { isInteractableVisual: true } }, hidden: true, texture: { src: 'evil.webp' }, x: 0, y: 0 },
    });
    assert.equal(foreign.updates.length, 0, 'the smuggled core-data write is refused');
    assert.equal(warnings.length, 1);
  });

  it('refuses a DOT-NOTATION smuggle (flattened stamp key + flattened core key) against a foreign doc', async () => {
    const foreign = makeVisual({});
    installVisual(foreign);
    await applyInteractableVisualUpdate({
      sceneId: SCENE_ID,
      visualUuid: VISUAL_UUID,
      update: { 'flags.fabricate.isInteractableVisual': true, hidden: true },
    });
    assert.equal(foreign.updates.length, 0, 'the dot-notation smuggle is refused');
    assert.equal(warnings.length, 1);
  });

  it('refuses a core-data write on a MINTED reverse flag whose behaviour does not resolve (escalation step 2)', async () => {
    // The attacker minted the reverse flag (stamp-only, allowed) but points it at a
    // behaviour id that resolves to nothing. A core-data write must NOT be honored.
    const minted = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(minted, null); // behaviour does not resolve
    await applyInteractableVisualUpdate({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { hidden: true } });
    assert.equal(minted.updates.length, 0, 'a minted reverse flag does not authorize a core write');
    assert.equal(warnings.length, 1);
  });

  it('refuses a core-data write when the linked behaviour forward-links to a DIFFERENT document (escalation step 2)', async () => {
    // The attacker minted a reverse flag pointing at a REAL behaviour, but that
    // behaviour's forward link points at its genuine tile, not the attacker's target.
    const minted = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(minted, makeLinkedBehavior('Scene.s1.Tile.genuine')); // forward link mismatch
    await applyInteractableVisualUpdate({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { hidden: true } });
    assert.equal(minted.updates.length, 0, 'a mismatched forward link does not authorize a core write');
    assert.equal(warnings.length, 1);
  });

  it('still permits the relink provenance STAMP onto a not-yet-owned document', async () => {
    // The relink edge writes the reverse flag onto a GM-selected tile that is not
    // yet a Fabricate visual; that write must not be blocked by the guard.
    const fresh = makeVisual({});
    installVisual(fresh);
    await applyInteractableVisualUpdate({
      sceneId: SCENE_ID,
      visualUuid: VISUAL_UUID,
      update: { flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: REGION_UUID, linkedBehaviorId: BEHAVIOR_ID } } },
    });
    assert.equal(fresh.updates.length, 1, 'the reverse-flag stamp is applied');
  });
});

describe('applyInteractableVisualDelete ownership guard', () => {
  it('deletes a genuinely bidirectionally-linked visual', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(doc, makeLinkedBehavior(VISUAL_UUID));
    await applyInteractableVisualDelete({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID });
    assert.equal(doc.deletes.length, 1);
  });

  it('refuses to delete a FOREIGN document resolved by uuid (logs, no delete)', async () => {
    const foreign = makeVisual({}); // no reverse flag
    installVisual(foreign);
    await applyInteractableVisualDelete({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID });
    assert.equal(foreign.deletes.length, 0, 'no delete of a foreign document');
    assert.equal(warnings.length, 1);
  });

  it('refuses to delete a MINTED reverse flag whose behaviour does not resolve (escalation step 2)', async () => {
    const minted = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(minted, null);
    await applyInteractableVisualDelete({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID });
    assert.equal(minted.deletes.length, 0, 'a minted reverse flag does not authorize a delete');
    assert.equal(warnings.length, 1);
  });

  it('refuses to delete when the linked behaviour forward-links to a DIFFERENT document (escalation step 2)', async () => {
    const minted = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(minted, makeLinkedBehavior('Scene.s1.Tile.genuine'));
    await applyInteractableVisualDelete({ sceneId: SCENE_ID, visualUuid: VISUAL_UUID });
    assert.equal(minted.deletes.length, 0, 'a mismatched forward link does not authorize a delete');
    assert.equal(warnings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Sender authentication (issue 593): handleInteractableSocketMessage gates the
// privileged edges on the server-attested socket SENDER (the trusted 2nd callback
// arg), not the receiver alone. These drive the full inbound dispatch through
// real apply* seams so the sender gate is exercised end-to-end.
// ---------------------------------------------------------------------------

const GM_ID = 'gm1';

// This client is the active GM (the receiver that applies). `game.user ===
// game.users.activeGM` makes `isActiveGM()` true. `behavior`/`visual`/`linkedBehavior`
// wire the resolvers the real apply* seams walk.
function installActiveGmWorld({ behavior = null, visual = null, linkedBehavior = null } = {}) {
  const gm = { id: GM_ID };
  globalThis.game = {
    user: gm,
    users: { activeGM: gm },
    scenes: {
      get: (id) =>
        id === SCENE_ID
          ? { regions: { get: (rid) => (rid === REGION_ID ? { behaviors: { get: (bid) => (bid === BEHAVIOR_ID ? behavior : null) } } : null) } }
          : null,
    },
  };
  globalThis.fromUuidSync = (uuid) => {
    if (uuid === VISUAL_UUID) return visual;
    if (uuid === REGION_UUID) return { behaviors: { get: (bid) => (bid === BEHAVIOR_ID ? linkedBehavior : null) } };
    return null;
  };
}

// A non-GM sender: any id other than the GM; `isSenderGM` resolves it as non-GM.
const NON_GM_SENDER = { senderId: 'player1', isSenderGM: (id) => id === GM_ID };
// A GM sender.
const GM_SENDER = { senderId: GM_ID, isSenderGM: (id) => id === GM_ID };

describe('handleInteractableSocketMessage sender authentication (issue 593)', () => {
  it('refuses a NON-GM VISUAL_DELETE against a genuinely-linked tile (no delete, warns)', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installActiveGmWorld({ visual: doc, linkedBehavior: makeLinkedBehavior(VISUAL_UUID) });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_VISUAL_DELETE, sceneId: SCENE_ID, visualUuid: VISUAL_UUID },
      NON_GM_SENDER
    );
    await Promise.resolve();
    assert.equal(doc.deletes.length, 0, 'a non-GM sender cannot delete even a linked visual');
    assert.equal(warnings.length, 1);
  });

  it('refuses a NON-GM core-field VISUAL_UPDATE (hidden) even on a linked tile (no write, warns)', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installActiveGmWorld({ visual: doc, linkedBehavior: makeLinkedBehavior(VISUAL_UUID) });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_VISUAL_UPDATE, sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { hidden: true } },
      NON_GM_SENDER
    );
    await Promise.resolve();
    assert.equal(doc.updates.length, 0, 'a non-GM sender cannot core-mutate a visual');
    assert.equal(warnings.length, 1);
  });

  it('refuses a NON-GM BEHAVIOR_UPDATE carrying system.linkedVisual (forward-link forge)', async () => {
    const behavior = makeBehavior('fabricate.interactable');
    installActiveGmWorld({ behavior });
    handleInteractableSocketMessage(
      {
        action: INTERACTABLE_BEHAVIOR_UPDATE,
        sceneId: SCENE_ID,
        regionId: REGION_ID,
        behaviorId: BEHAVIOR_ID,
        update: { system: { linkedVisual: { uuid: VISUAL_UUID, documentName: 'Tile' } } },
      },
      NON_GM_SENDER
    );
    await Promise.resolve();
    assert.equal(behavior.calls.length, 0, 'the forward-link forge never reaches the behaviour');
    assert.equal(warnings.length, 1);
  });

  it('refuses a NON-GM VISUAL_UPDATE minting a reverse flag (stamp)', async () => {
    const fresh = makeVisual({});
    installActiveGmWorld({ visual: fresh });
    handleInteractableSocketMessage(
      {
        action: INTERACTABLE_VISUAL_UPDATE,
        sceneId: SCENE_ID,
        visualUuid: VISUAL_UUID,
        update: { flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: REGION_UUID, linkedBehaviorId: BEHAVIOR_ID } } },
      },
      NON_GM_SENDER
    );
    await Promise.resolve();
    assert.equal(fresh.updates.length, 0, 'a non-GM sender cannot mint a reverse flag');
    assert.equal(warnings.length, 1);
  });

  it('blocks the full #534 3-message chain replayed from a NON-GM sender (foreign tile untouched)', async () => {
    // The foreign target tile the attacker wants to delete. It carries no genuine
    // link; the behaviour is a real fabricate.interactable the attacker discovered.
    const foreignTile = makeVisual({});
    const behavior = makeBehavior('fabricate.interactable');
    behavior.system = { linkedVisual: { uuid: null } };
    installActiveGmWorld({ behavior, visual: foreignTile });

    // (1) Forge the forward link on the behaviour.
    handleInteractableSocketMessage(
      { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: SCENE_ID, regionId: REGION_ID, behaviorId: BEHAVIOR_ID, update: { system: { linkedVisual: { uuid: VISUAL_UUID, documentName: 'Tile' } } } },
      NON_GM_SENDER
    );
    // (2) Mint the reverse flag on the foreign tile.
    handleInteractableSocketMessage(
      { action: INTERACTABLE_VISUAL_UPDATE, sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: REGION_UUID, linkedBehaviorId: BEHAVIOR_ID } } } },
      NON_GM_SENDER
    );
    // (3) Delete the foreign tile.
    handleInteractableSocketMessage(
      { action: INTERACTABLE_VISUAL_DELETE, sceneId: SCENE_ID, visualUuid: VISUAL_UUID },
      NON_GM_SENDER
    );
    await Promise.resolve();

    assert.equal(behavior.calls.length, 0, 'step 1 forge is refused');
    assert.equal(foreignTile.updates.length, 0, 'step 2 mint is refused');
    assert.equal(foreignTile.deletes.length, 0, 'step 3 delete never reaches the foreign tile');
    assert.equal(warnings.length, 3, 'each refused step is logged');
  });

  it('permits a GM sender: relink stamp VISUAL_UPDATE, state BEHAVIOR_UPDATE', async () => {
    // Relink stamp onto a fresh GM-selected tile.
    const fresh = makeVisual({});
    installActiveGmWorld({ visual: fresh });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_VISUAL_UPDATE, sceneId: SCENE_ID, visualUuid: VISUAL_UUID, update: { flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: REGION_UUID, linkedBehaviorId: BEHAVIOR_ID } } } },
      GM_SENDER
    );
    await Promise.resolve();
    assert.equal(fresh.updates.length, 1, 'a GM sender may write the relink stamp');

    // A GM sender may write any behaviour field (e.g. state), unlike a non-GM.
    const behavior = makeBehavior('fabricate.interactable');
    installActiveGmWorld({ behavior });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: SCENE_ID, regionId: REGION_ID, behaviorId: BEHAVIOR_ID, update: { system: { state: { enabled: false } } } },
      GM_SENDER
    );
    await Promise.resolve();
    assert.equal(behavior.calls.length, 1, 'a GM sender may write state');
    assert.deepEqual(behavior.calls[0], { system: { state: { enabled: false } } });
  });

  it('permits a GM sender to delete a genuinely-linked visual (secondary-GM apply)', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installActiveGmWorld({ visual: doc, linkedBehavior: makeLinkedBehavior(VISUAL_UUID) });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_VISUAL_DELETE, sceneId: SCENE_ID, visualUuid: VISUAL_UUID },
      GM_SENDER
    );
    await Promise.resolve();
    assert.equal(doc.deletes.length, 1, 'a GM sender may delete a linked visual');
  });

  it('permits a legitimate NON-GM gather: a system.node-only BEHAVIOR_UPDATE is applied', async () => {
    const behavior = makeBehavior('fabricate.interactable');
    installActiveGmWorld({ behavior });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: SCENE_ID, regionId: REGION_ID, behaviorId: BEHAVIOR_ID, update: { system: { node: { current: 2 } } } },
      NON_GM_SENDER
    );
    await Promise.resolve();
    assert.equal(behavior.calls.length, 1, 'the issue-302 scoped-pool decrement is applied');
    assert.deepEqual(behavior.calls[0], { system: { node: { current: 2 } } });
  });

  it('refuses a NON-GM BEHAVIOR_UPDATE mixing system.node with a foreign field', async () => {
    const behavior = makeBehavior('fabricate.interactable');
    installActiveGmWorld({ behavior });
    handleInteractableSocketMessage(
      { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId: SCENE_ID, regionId: REGION_ID, behaviorId: BEHAVIOR_ID, update: { system: { node: { current: 2 }, state: { enabled: false } } } },
      NON_GM_SENDER
    );
    await Promise.resolve();
    assert.equal(behavior.calls.length, 0, 'a mixed node + foreign write is refused wholesale');
    assert.equal(warnings.length, 1);
  });

  it('refuses an impersonated INTERACTABLE_ACTIVATE (payload userId !== sender)', () => {
    const behavior = makeBehavior('fabricate.interactable');
    installActiveGmWorld({ behavior });
    const granted = [];
    handleInteractableSocketMessage(
      { action: INTERACTABLE_ACTIVATE, sceneId: SCENE_ID, regionId: REGION_ID, behaviorId: BEHAVIOR_ID, userId: 'victim' },
      { senderId: 'attacker', isSenderGM: () => false, validateAndGrant: (r) => granted.push(r) }
    );
    assert.equal(granted.length, 0, 'an impersonated activation is refused before validate/grant');

    // The genuine requester (userId === sender) is granted.
    handleInteractableSocketMessage(
      { action: INTERACTABLE_ACTIVATE, sceneId: SCENE_ID, regionId: REGION_ID, behaviorId: BEHAVIOR_ID, userId: 'victim' },
      { senderId: 'victim', isSenderGM: () => false, validateAndGrant: (r) => granted.push(r) }
    );
    assert.equal(granted.length, 1, 'the authenticated requester is honored');
  });
});
