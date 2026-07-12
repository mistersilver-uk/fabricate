/**
 * Edge coverage for the active-GM Foundry glue in `interactableSocketBridge.js`:
 * the three mutation seams reachable over the shared `module.fabricate` socket
 * (`applyInteractableBehaviorUpdate`, `applyInteractableVisualUpdate`,
 * `applyInteractableVisualDelete`). Each seam now carries an OWNERSHIP guard so a
 * drifted/reused/crafted id or uuid can never mutate or delete a foreign document.
 *
 * These drive the real functions through injected `globalThis.game` /
 * `globalThis.fromUuidSync` fakes (no live Foundry). A foreign target must be left
 * untouched; a genuine Fabricate target still updates/deletes.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyInteractableBehaviorUpdate,
  applyInteractableVisualUpdate,
  applyInteractableVisualDelete,
} from '../../src/canvas/interactableSocketBridge.js';

const SCENE_ID = 's1';
const REGION_ID = 'r1';
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

// A recording Tile document. `flags` decides ownership (reverse linked-visual flag).
function makeVisual(flags = {}) {
  const updates = [];
  const deletes = [];
  return {
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

const OWNED_VISUAL_FLAGS = {
  fabricate: { isInteractableVisual: true, linkedRegionUuid: 'Scene.s1.Region.r1', linkedBehaviorId: BEHAVIOR_ID },
};

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

function installVisual(doc) {
  globalThis.fromUuidSync = (uuid) => (uuid === VISUAL_UUID ? doc : null);
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
  it('applies the update on a genuine Fabricate interactable visual', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(doc);
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

  it('still permits the relink provenance STAMP onto a not-yet-owned document', async () => {
    // The relink edge writes the reverse flag onto a GM-selected tile that is not
    // yet a Fabricate visual; that write must not be blocked by the guard.
    const fresh = makeVisual({});
    installVisual(fresh);
    await applyInteractableVisualUpdate({
      sceneId: SCENE_ID,
      visualUuid: VISUAL_UUID,
      update: { flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: 'Scene.s1.Region.r1', linkedBehaviorId: BEHAVIOR_ID } } },
    });
    assert.equal(fresh.updates.length, 1, 'the reverse-flag stamp is applied');
  });
});

describe('applyInteractableVisualDelete ownership guard', () => {
  it('deletes a genuine Fabricate interactable visual', async () => {
    const doc = makeVisual(OWNED_VISUAL_FLAGS);
    installVisual(doc);
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
});
