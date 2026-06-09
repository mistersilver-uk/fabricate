/**
 * Unit coverage for linked-visual resolution + creation/relink/missing-policy.
 *
 * Covers resolving a linked Tile/Drawing/Token by uuid and via the scene-embedded
 * fallback, building/creating linked markers, relinking (with reverse-flag write +
 * old-marker clear), recreation, and the missing-linked-visual policy decisions.
 * The resolve edge (`globalThis.fromUuidSync`) is faked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLinkedVisual,
  buildLinkedTileData,
  createLinkedTile,
  buildLinkedDrawingData,
  createLinkedDrawing,
  recreateLinkedDrawing,
  planRelinkVisual,
  relinkVisual,
  buildClearLinkedVisualFlags,
  recreateLinkedTile,
  planMissingPolicy,
  applyMissingPolicy
} from '../../src/canvas/linkedVisuals/linkedInteractableVisual.js';

function withFromUuid(map, fn) {
  const prev = globalThis.fromUuidSync;
  globalThis.fromUuidSync = (uuid) => map[uuid] ?? null;
  try {
    return fn();
  } finally {
    globalThis.fromUuidSync = prev;
  }
}

function tileDoc({ uuid = 'Scene.s1.Tile.t1', src = 'orig.webp', original = null } = {}) {
  return {
    uuid,
    parent: { id: 's1' },
    texture: { src },
    flags: original ? { fabricate: { nodeOriginal: original } } : {}
  };
}

test('resolveLinkedVisual resolves a Tile by uuid', () => {
  const doc = tileDoc();
  const resolved = withFromUuid({ 'Scene.s1.Tile.t1': doc }, () => resolveLinkedVisual(
    { linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' } }
  ));
  assert.equal(resolved.doc, doc);
  assert.equal(resolved.documentName, 'Tile');
});

test('resolveLinkedVisual returns null without uuid/documentName, no-throw', () => {
  assert.equal(resolveLinkedVisual({ linkedVisual: { uuid: null, documentName: 'Tile' } }), null);
  assert.equal(resolveLinkedVisual({ linkedVisual: { uuid: 'x', documentName: null } }), null);
  assert.equal(resolveLinkedVisual({}), null);
});

test('resolveLinkedVisual falls back to a scene-embedded lookup', () => {
  const doc = tileDoc({ uuid: 'Scene.s1.Tile.t9' });
  const scene = { tiles: { get: (id) => (id === 't9' ? doc : null) } };
  const resolved = withFromUuid({}, () => resolveLinkedVisual(
    { linkedVisual: { uuid: 'Scene.s1.Tile.t9', documentName: 'Tile' } },
    { scene }
  ));
  assert.equal(resolved.doc, doc);
});

test('resolveLinkedVisual resolves a Drawing by uuid and via the scene-embedded fallback', () => {
  const doc = { uuid: 'Scene.s1.Drawing.d1', parent: { id: 's1' } };
  const byUuid = withFromUuid({ 'Scene.s1.Drawing.d1': doc }, () => resolveLinkedVisual(
    { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' } }
  ));
  assert.equal(byUuid.doc, doc);
  assert.equal(byUuid.documentName, 'Drawing');

  const scene = { drawings: { get: (id) => (id === 'd1' ? doc : null) } };
  const byScene = withFromUuid({}, () => resolveLinkedVisual(
    { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' } },
    { scene }
  ));
  assert.equal(byScene.doc, doc);
});

test('resolveLinkedVisual resolves a Token by uuid and via scene.tokens.get fallback', () => {
  const doc = { uuid: 'Scene.s1.Token.k1', parent: { id: 's1' } };
  const byUuid = withFromUuid({ 'Scene.s1.Token.k1': doc }, () => resolveLinkedVisual(
    { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' } }
  ));
  assert.equal(byUuid.doc, doc);
  assert.equal(byUuid.documentName, 'Token');

  // Fallback: UUID resolver unavailable → scene.tokens.get(trailingId).
  const scene = { tokens: { get: (id) => (id === 'k1' ? doc : null) } };
  const byScene = withFromUuid({}, () => resolveLinkedVisual(
    { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' } },
    { scene }
  ));
  assert.equal(byScene.doc, doc);
});

test('planMissingPolicy reports none (not warn) for a region-only interactable', () => {
  // The distinction the config panel relies on: mode 'none' is intentional, so it
  // is `action:'none'` (no spurious "missing" warning), NOT a missing-policy warn.
  assert.deepEqual(
    planMissingPolicy({ linkedVisual: { mode: 'none', uuid: null, documentName: null, missingPolicy: 'warn' } }, false),
    { action: 'none' }
  );
});

// --- buildLinkedTileData / createLinkedTile (create) -------------------------

test('buildLinkedTileData shapes the tile create payload with the reverse linked-visual flags', () => {
  const data = buildLinkedTileData({
    regionUuid: 'Scene.s1.Region.r1', behaviorId: 'beh-1',
    texture: 'icons/tools/axe.webp', x: 10, y: 20, width: 100, height: 100
  });
  assert.deepEqual(data.texture, { src: 'icons/tools/axe.webp' });
  assert.equal(data.x, 10);
  assert.equal(data.y, 20);
  assert.equal(data.width, 100);
  assert.equal(data.height, 100);
  assert.deepEqual(data.flags.fabricate, {
    isInteractableVisual: true,
    linkedRegionUuid: 'Scene.s1.Region.r1',
    linkedBehaviorId: 'beh-1'
  });
});

test('createLinkedTile creates the linked Tile via the scene + region/behaviour refs', async () => {
  const created = [];
  const scene = {
    async createEmbeddedDocuments(type, payloads) {
      if (type !== 'Tile') return [];
      const tile = { id: 't1', uuid: 'Scene.s1.Tile.t1', ...payloads[0] };
      created.push(tile);
      return [tile];
    }
  };
  const behavior = { id: 'beh-1', parent: { uuid: 'Scene.s1.Region.r1' } };
  const tile = await createLinkedTile({ scene, behavior, texture: 'x.webp', x: 0, y: 0, width: 100, height: 100 });
  assert.equal(created.length, 1);
  assert.equal(tile, created[0]);
  assert.equal(tile.flags.fabricate.linkedRegionUuid, 'Scene.s1.Region.r1');
  assert.equal(tile.flags.fabricate.linkedBehaviorId, 'beh-1');
});

test('createLinkedTile returns null (no-throw) when the region uuid / behaviour id is missing', async () => {
  const scene = { async createEmbeddedDocuments() { throw new Error('must not create'); } };
  assert.equal(await createLinkedTile({ scene, behavior: { id: null, parent: null } }), null);
});

// --- buildLinkedDrawingData / createLinkedDrawing (create) -------------------

test('buildLinkedDrawingData shapes a labelled rectangle with the reverse linked-visual flags', () => {
  const data = buildLinkedDrawingData({
    regionUuid: 'Scene.s1.Region.r1', behaviorId: 'beh-1',
    text: 'Boundary', x: 10, y: 20, width: 200, height: 150
  });
  assert.equal(data.x, 10);
  assert.equal(data.y, 20);
  assert.equal(data.shape.type, 'r');
  assert.equal(data.shape.width, 200);
  assert.equal(data.shape.height, 150);
  assert.equal(data.text, 'Boundary');
  assert.deepEqual(data.flags.fabricate, {
    isInteractableVisual: true,
    linkedRegionUuid: 'Scene.s1.Region.r1',
    linkedBehaviorId: 'beh-1'
  });
});

test('createLinkedDrawing creates a DrawingDocument carrying the reverse flag, defaulting the label to the interactable name', async () => {
  const created = [];
  const scene = {
    async createEmbeddedDocuments(type, payloads) {
      if (type !== 'Drawing') return [];
      const drawing = { id: 'd1', uuid: 'Scene.s1.Drawing.d1', ...payloads[0] };
      created.push(drawing);
      return [drawing];
    }
  };
  const behavior = { id: 'beh-1', parent: { uuid: 'Scene.s1.Region.r1' }, system: { name: 'Herb patch' } };
  const drawing = await createLinkedDrawing({ scene, behavior, x: 0, y: 0, width: 200, height: 200 });
  assert.equal(created.length, 1);
  assert.equal(drawing, created[0]);
  assert.equal(drawing.text, 'Herb patch', 'defaults the label to the interactable name');
  assert.equal(drawing.flags.fabricate.linkedRegionUuid, 'Scene.s1.Region.r1');
  assert.equal(drawing.flags.fabricate.linkedBehaviorId, 'beh-1');
});

test('createLinkedDrawing returns null (no-throw) when the region uuid / behaviour id is missing', async () => {
  const scene = { async createEmbeddedDocuments() { throw new Error('must not create'); } };
  assert.equal(await createLinkedDrawing({ scene, behavior: { id: null, parent: null } }), null);
});

test('recreateLinkedDrawing creates a fresh Drawing and writes the new uuid + documentName Drawing back', async () => {
  const updates = [];
  const scene = {
    async createEmbeddedDocuments(type, payloads) {
      if (type !== 'Drawing') return [];
      return [{ id: 'd9', uuid: 'Scene.s1.Drawing.d9', ...payloads[0] }];
    }
  };
  const behavior = { id: 'beh-1', parent: { uuid: 'Scene.s1.Region.r1' }, system: { name: 'Zone' } };
  const drawing = await recreateLinkedDrawing(behavior, { scene }, {
    applyBehaviorUpdate: (a) => updates.push(a),
    identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' })
  });
  assert.equal(drawing.uuid, 'Scene.s1.Drawing.d9');
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].update, { system: { linkedVisual: { uuid: 'Scene.s1.Drawing.d9', documentName: 'Drawing' } } });
});

// --- relink (decision + edge) ------------------------------------------------

test('planRelinkVisual returns the linkedVisual patch for a supported selected document', () => {
  assert.deepEqual(planRelinkVisual({ uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' }), {
    linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' }
  });
  assert.deepEqual(planRelinkVisual({ uuid: 'Scene.s1.Tile.t1', constructor: { documentName: 'Tile' } }), {
    linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' }
  });
});

test('planRelinkVisual returns null for an unusable selection', () => {
  assert.equal(planRelinkVisual({ uuid: '', documentName: 'Tile' }), null);
  assert.equal(planRelinkVisual({ uuid: 'x', documentName: 'Actor' }), null);
  assert.equal(planRelinkVisual(null), null);
});

test('relinkVisual persists the relink patch through the behaviour-update seam', async () => {
  const updates = [];
  const patch = await relinkVisual(
    { id: 'beh-1' },
    { uuid: 'Scene.s1.Token.k1', documentName: 'Token' },
    {
      applyBehaviorUpdate: (a) => updates.push(a),
      identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' })
    }
  );
  assert.deepEqual(patch, { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' } });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1',
    update: { system: { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' } } }
  });
});

test('relinkVisual derives documentName from a selected Drawing and writes the reverse flag', async () => {
  const behaviorUpdates = [];
  const visualUpdates = [];
  const behavior = {
    id: 'beh-1',
    parent: { uuid: 'Scene.s1.Region.r1' },
    // Previously linked to a Tile — relinking to a Drawing clears the old Tile.
    system: { linkedVisual: { uuid: 'Scene.s1.Tile.old', documentName: 'Tile' } }
  };
  const patch = await relinkVisual(
    behavior,
    { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' },
    {
      applyBehaviorUpdate: (a) => behaviorUpdates.push(a),
      identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' }),
      applyVisualUpdate: (a) => visualUpdates.push(a)
    }
  );

  // documentName derived from the SELECTED Drawing, not hardcoded to Tile.
  assert.deepEqual(patch, { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' } });
  assert.deepEqual(behaviorUpdates[0].update, {
    system: { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' } }
  });

  // Clears the old Tile (documentName Tile), sets the reverse flag on the new Drawing.
  assert.equal(visualUpdates.length, 2);
  const [clearOld, setNew] = visualUpdates;
  assert.equal(clearOld.visualUuid, 'Scene.s1.Tile.old');
  assert.equal(clearOld.documentName, 'Tile');
  assert.equal(clearOld.update.flags.fabricate.isInteractableVisual, null);
  assert.equal(setNew.visualUuid, 'Scene.s1.Drawing.d1');
  assert.equal(setNew.documentName, 'Drawing');
  assert.equal(setNew.update.flags.fabricate.isInteractableVisual, true);
});

test('relinkVisual derives documentName Token from a selected Token, writes the reverse flag, clears the old marker', async () => {
  const behaviorUpdates = [];
  const visualUpdates = [];
  const behavior = {
    id: 'beh-1',
    parent: { uuid: 'Scene.s1.Region.r1' },
    // Previously linked to a Tile — relinking to a Token clears the old Tile.
    system: { linkedVisual: { uuid: 'Scene.s1.Tile.old', documentName: 'Tile' } }
  };
  // The selected document is a TokenDocument: documentName via constructor.documentName.
  const selectedToken = { uuid: 'Scene.s1.Token.k1', constructor: { documentName: 'Token' } };
  const patch = await relinkVisual(behavior, selectedToken, {
    applyBehaviorUpdate: (a) => behaviorUpdates.push(a),
    identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' }),
    applyVisualUpdate: (a) => visualUpdates.push(a)
  });

  // documentName derived from the SELECTED Token, not hardcoded.
  assert.deepEqual(patch, { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' } });
  assert.deepEqual(behaviorUpdates[0].update, {
    system: { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' } }
  });

  // Clears the old Tile, writes the reverse linked-visual flag onto the Token.
  // (The reverse flag is a FLAG, not actor data — it never touches the actor.)
  assert.equal(visualUpdates.length, 2);
  const [clearOld, setNew] = visualUpdates;
  assert.equal(clearOld.visualUuid, 'Scene.s1.Tile.old');
  assert.equal(clearOld.documentName, 'Tile');
  assert.equal(clearOld.update.flags.fabricate.isInteractableVisual, null);
  assert.equal(setNew.visualUuid, 'Scene.s1.Token.k1');
  assert.equal(setNew.documentName, 'Token');
  assert.deepEqual(setNew.update.flags.fabricate, {
    isInteractableVisual: true,
    linkedRegionUuid: 'Scene.s1.Region.r1',
    linkedBehaviorId: 'beh-1'
  });
});

test('relinkVisual writes the reverse flag onto the new tile and clears it off the old tile', async () => {
  const behaviorUpdates = [];
  const visualUpdates = [];
  const behavior = {
    id: 'beh-1',
    parent: { uuid: 'Scene.s1.Region.r1' },
    // Previously linked to a different tile.
    system: { linkedVisual: { uuid: 'Scene.s1.Tile.old', documentName: 'Tile' } }
  };
  const patch = await relinkVisual(
    behavior,
    { uuid: 'Scene.s1.Tile.new', documentName: 'Tile' },
    {
      applyBehaviorUpdate: (a) => behaviorUpdates.push(a),
      identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' }),
      applyVisualUpdate: (a) => visualUpdates.push(a)
    }
  );

  // Forward patch on the behaviour.
  assert.deepEqual(patch, { linkedVisual: { uuid: 'Scene.s1.Tile.new', documentName: 'Tile' } });
  assert.equal(behaviorUpdates.length, 1);
  assert.deepEqual(behaviorUpdates[0].update, {
    system: { linkedVisual: { uuid: 'Scene.s1.Tile.new', documentName: 'Tile' } }
  });

  // Two visual writes: clear the OLD tile first, then set the reverse flag on NEW.
  assert.equal(visualUpdates.length, 2);
  const [clearOld, setNew] = visualUpdates;
  assert.equal(clearOld.visualUuid, 'Scene.s1.Tile.old');
  assert.equal(clearOld.update.flags.fabricate.isInteractableVisual, null);
  assert.equal(clearOld.update.flags.fabricate.linkedRegionUuid, null);
  assert.equal(clearOld.update.flags.fabricate.linkedBehaviorId, null);

  assert.equal(setNew.visualUuid, 'Scene.s1.Tile.new');
  assert.equal(setNew.documentName, 'Tile');
  assert.deepEqual(setNew.update.flags.fabricate, {
    isInteractableVisual: true,
    linkedRegionUuid: 'Scene.s1.Region.r1',
    linkedBehaviorId: 'beh-1'
  });
});

test('relinkVisual clears the OLD marker even when applyBehaviorUpdate mutates behavior.system in place (live Foundry)', async () => {
  // Live Foundry's behaviour update mutates `behavior.system.linkedVisual` IN
  // PLACE — so by the time the forward await resolves, `behavior.system` already
  // carries the NEW uuid. If `relinkVisual` read the prior link AFTER the await it
  // would see the new uuid and never clear the OLD document's reverse flag. This
  // simulates that mutation and asserts the OLD marker's reverse flag IS cleared.
  const visualUpdates = [];
  const behavior = {
    id: 'beh-1',
    parent: { uuid: 'Scene.s1.Region.r1' },
    system: { linkedVisual: { uuid: 'Scene.s1.Tile.old', documentName: 'Tile' } }
  };
  const applyBehaviorUpdate = async ({ update }) => {
    // Mutate the live behaviour system in place, exactly like Foundry's update.
    behavior.system.linkedVisual = { ...behavior.system.linkedVisual, ...update.system.linkedVisual };
  };

  await relinkVisual(
    behavior,
    { uuid: 'Scene.s1.Tile.new', documentName: 'Tile' },
    {
      applyBehaviorUpdate,
      identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' }),
      applyVisualUpdate: (a) => visualUpdates.push(a)
    }
  );

  // The OLD marker's reverse flag MUST still be cleared despite the in-place mutation.
  assert.equal(visualUpdates.length, 2);
  const [clearOld, setNew] = visualUpdates;
  assert.equal(clearOld.visualUuid, 'Scene.s1.Tile.old');
  assert.equal(clearOld.update.flags.fabricate.isInteractableVisual, null);
  assert.equal(setNew.visualUuid, 'Scene.s1.Tile.new');
  assert.equal(setNew.update.flags.fabricate.isInteractableVisual, true);
});

test('relinkVisual writes the reverse flag on the new tile and skips the clear when there was no prior link', async () => {
  const visualUpdates = [];
  const behavior = { id: 'beh-1', parent: { uuid: 'Scene.s1.Region.r1' }, system: { linkedVisual: { uuid: null, documentName: null } } };
  await relinkVisual(
    behavior,
    { uuid: 'Scene.s1.Tile.new', documentName: 'Tile' },
    {
      applyBehaviorUpdate: () => {},
      identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' }),
      applyVisualUpdate: (a) => visualUpdates.push(a)
    }
  );
  // Only the reverse-flag write on the new tile; no clear (no prior link).
  assert.equal(visualUpdates.length, 1);
  assert.equal(visualUpdates[0].visualUuid, 'Scene.s1.Tile.new');
  assert.equal(visualUpdates[0].update.flags.fabricate.isInteractableVisual, true);
});

test('relinkVisual does not re-clear when the selection matches the prior link', async () => {
  const visualUpdates = [];
  const behavior = { id: 'beh-1', parent: { uuid: 'Scene.s1.Region.r1' }, system: { linkedVisual: { uuid: 'Scene.s1.Tile.same', documentName: 'Tile' } } };
  await relinkVisual(
    behavior,
    { uuid: 'Scene.s1.Tile.same', documentName: 'Tile' },
    {
      applyBehaviorUpdate: () => {},
      identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' }),
      applyVisualUpdate: (a) => visualUpdates.push(a)
    }
  );
  // Same tile: just refresh the reverse flag, no clear of a different tile.
  assert.equal(visualUpdates.length, 1);
  assert.equal(visualUpdates[0].visualUuid, 'Scene.s1.Tile.same');
  assert.equal(visualUpdates[0].update.flags.fabricate.isInteractableVisual, true);
});

test('buildClearLinkedVisualFlags nulls the reverse flag block', () => {
  assert.deepEqual(buildClearLinkedVisualFlags(), {
    flags: { fabricate: { isInteractableVisual: null, linkedRegionUuid: null, linkedBehaviorId: null } }
  });
});

// --- recreate ----------------------------------------------------------------

test('recreateLinkedTile creates a fresh Tile and writes the new uuid back', async () => {
  const updates = [];
  const scene = {
    async createEmbeddedDocuments(type, payloads) {
      if (type !== 'Tile') return [];
      return [{ id: 't9', uuid: 'Scene.s1.Tile.t9', ...payloads[0] }];
    }
  };
  const behavior = { id: 'beh-1', parent: { uuid: 'Scene.s1.Region.r1' } };
  const tile = await recreateLinkedTile(behavior, { scene, texture: 'x.webp' }, {
    applyBehaviorUpdate: (a) => updates.push(a),
    identify: () => ({ sceneId: 's1', regionId: 'r1', behaviorId: 'beh-1' })
  });
  assert.equal(tile.uuid, 'Scene.s1.Tile.t9');
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].update, { system: { linkedVisual: { uuid: 'Scene.s1.Tile.t9', documentName: 'Tile' } } });
});

// --- missing policy ----------------------------------------------------------

test('planMissingPolicy: no configured visual → none', () => {
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'none', uuid: null } }, false), { action: 'none' });
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'marker', uuid: '' } }, false), { action: 'none' });
});

test('planMissingPolicy: present visual → ok', () => {
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'marker', uuid: 'u', missingPolicy: 'warn' } }, true), { action: 'ok' });
});

test('planMissingPolicy: missing visual respects the policy', () => {
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'marker', uuid: 'u', missingPolicy: 'ignore' } }, false), { action: 'none' });
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'marker', uuid: 'u', missingPolicy: 'warn' } }, false), { action: 'warn' });
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Tile', missingPolicy: 'recreate' } }, false), { action: 'recreate' });
  // recreate is Tile-only; a missing Drawing falls back to warn.
  assert.deepEqual(planMissingPolicy({ linkedVisual: { mode: 'marker', uuid: 'u', documentName: 'Drawing', missingPolicy: 'recreate' } }, false), { action: 'warn' });
});

test('applyMissingPolicy warns for a missing warn-policy visual and recreates a missing recreate-policy Tile', async () => {
  const warns = [];
  const recreated = [];
  // warn: the visual does not resolve (no fromUuid map) → warn channel fires.
  const warnDecision = await withFromUuid({}, () => applyMissingPolicy(
    { linkedVisual: { mode: 'marker', uuid: 'Scene.s1.Tile.gone', documentName: 'Tile', missingPolicy: 'warn' } },
    { notify: (m) => warns.push(m) }
  ));
  assert.deepEqual(warnDecision, { action: 'warn' });
  assert.deepEqual(warns, ['FABRICATE.Canvas.Interactable.LinkedVisualMissing']);

  const recreateDecision = await withFromUuid({}, () => applyMissingPolicy(
    { linkedVisual: { mode: 'marker', uuid: 'Scene.s1.Tile.gone', documentName: 'Tile', missingPolicy: 'recreate' } },
    { behavior: { id: 'beh-1' }, recreate: (behavior) => { recreated.push(behavior); return Promise.resolve({}); } }
  ));
  assert.deepEqual(recreateDecision, { action: 'recreate' });
  assert.equal(recreated.length, 1, 'the recreate seam was invoked for a missing recreate-policy Tile');
});
