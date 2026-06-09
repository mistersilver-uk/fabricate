/**
 * Unit coverage for linked-visual resolution + depleted-state reflection.
 *
 * The Tile branch reuses the PURE `planDepletedBehavior` (none/apply/revert/
 * delete) and routes apply/revert via `emitVisualUpdate` and the terminal delete
 * via `emitVisualDelete`. A missing visual is a no-op. Drawing/Token are Phase
 * 4/5 stubs (no-op). The resolve edge (`globalThis.fromUuidSync`) is faked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLinkedVisual,
  applyLinkedVisualDepleted,
  buildLinkedTileData,
  createLinkedTile,
  buildLinkedDrawingData,
  createLinkedDrawing,
  recreateLinkedDrawing,
  planDrawingDepleted,
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

test('applyLinkedVisualDepleted Tile branch routes a swap-image APPLY via emitVisualUpdate', () => {
  const updates = [];
  const deletes = [];
  const doc = tileDoc({ src: 'orig.webp' });
  const behaviorSystem = {
    linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' },
    node: { depletedBehavior: { swapImage: 'depleted.webp' } }
  };
  withFromUuid({ 'Scene.s1.Tile.t1': doc }, () => applyLinkedVisualDepleted({
    behaviorSystem,
    depleted: true,
    emitVisualUpdate: (a) => updates.push(a),
    emitVisualDelete: (a) => deletes.push(a)
  }));
  assert.equal(deletes.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].documentName, 'Tile');
  assert.equal(updates[0].update.texture.src, 'depleted.webp');
  assert.equal(updates[0].update.flags.fabricate.nodeOriginal.img, 'orig.webp');
});

test('applyLinkedVisualDepleted Tile branch routes a REVERT via emitVisualUpdate', () => {
  const updates = [];
  const doc = tileDoc({ src: 'depleted.webp', original: { img: 'orig.webp' } });
  const behaviorSystem = {
    linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' },
    node: { depletedBehavior: { swapImage: 'depleted.webp' } }
  };
  withFromUuid({ 'Scene.s1.Tile.t1': doc }, () => applyLinkedVisualDepleted({
    behaviorSystem,
    depleted: false,
    emitVisualUpdate: (a) => updates.push(a)
  }));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.texture.src, 'orig.webp');
  assert.equal(updates[0].update.flags.fabricate.nodeOriginal, null);
});

test('applyLinkedVisualDepleted Tile branch routes a terminal DELETE via emitVisualDelete', () => {
  const updates = [];
  const deletes = [];
  const doc = tileDoc();
  const behaviorSystem = {
    linkedVisual: { uuid: 'Scene.s1.Tile.t1', documentName: 'Tile' },
    node: { depletedBehavior: { deleteToken: true } }
  };
  withFromUuid({ 'Scene.s1.Tile.t1': doc }, () => applyLinkedVisualDepleted({
    behaviorSystem,
    depleted: true,
    emitVisualUpdate: (a) => updates.push(a),
    emitVisualDelete: (a) => deletes.push(a)
  }));
  assert.equal(updates.length, 0);
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].documentName, 'Tile');
});

test('applyLinkedVisualDepleted is a no-op when the visual is missing', () => {
  const updates = [];
  const deletes = [];
  withFromUuid({}, () => applyLinkedVisualDepleted({
    behaviorSystem: { linkedVisual: { uuid: 'Scene.s1.Tile.gone', documentName: 'Tile' }, node: { depletedBehavior: { swapImage: 'd.webp' } } },
    depleted: true,
    emitVisualUpdate: (a) => updates.push(a),
    emitVisualDelete: (a) => deletes.push(a)
  }));
  assert.equal(updates.length, 0);
  assert.equal(deletes.length, 0);
});

test('applyLinkedVisualDepleted is a clean no-op for a region-only interactable (mode none)', () => {
  // Region-only = `linkedVisual.mode:'none'`, uuid/documentName null. This is an
  // INTENTIONAL "no marker" state (distinct from a missing marker): the depleted
  // reflection resolves no visual and emits nothing — the interactable still works.
  const updates = [];
  const deletes = [];
  withFromUuid({}, () => applyLinkedVisualDepleted({
    behaviorSystem: {
      linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' },
      node: { depletedBehavior: { swapImage: 'd.webp' } }
    },
    depleted: true,
    emitVisualUpdate: (a) => updates.push(a),
    emitVisualDelete: (a) => deletes.push(a)
  }));
  assert.equal(updates.length, 0, 'no visual update is emitted with no marker');
  assert.equal(deletes.length, 0, 'no visual delete is emitted with no marker');
});

test('planMissingPolicy reports none (not warn) for a region-only interactable', () => {
  // The distinction the config panel relies on: mode 'none' is intentional, so it
  // is `action:'none'` (no spurious "missing" warning), NOT a missing-policy warn.
  assert.deepEqual(
    planMissingPolicy({ linkedVisual: { mode: 'none', uuid: null, documentName: null, missingPolicy: 'warn' } }, false),
    { action: 'none' }
  );
});

test('applyLinkedVisualDepleted Token branch is a no-op stub (Phase 5)', () => {
  const updates = [];
  const deletes = [];
  const token = { uuid: 'Scene.s1.Token.k1', parent: { id: 's1' } };
  withFromUuid({ 'Scene.s1.Token.k1': token }, () => {
    applyLinkedVisualDepleted({
      behaviorSystem: { linkedVisual: { uuid: 'Scene.s1.Token.k1', documentName: 'Token' }, node: { depletedBehavior: { swapImage: 'd.webp' } } },
      depleted: true,
      emitVisualUpdate: (a) => updates.push(a),
      emitVisualDelete: (a) => deletes.push(a)
    });
  });
  assert.equal(updates.length, 0);
  assert.equal(deletes.length, 0);
});

// --- Drawing depleted decision (pure) + apply edge ---------------------------

function drawingDoc({ uuid = 'Scene.s1.Drawing.d1', text = 'Herb patch', hidden = false, nodeOriginal = null } = {}) {
  return {
    uuid,
    parent: { id: 's1' },
    text,
    hidden,
    flags: nodeOriginal ? { fabricate: { nodeOriginal } } : {}
  };
}

test('planDrawingDepleted: default deplete HIDES the drawing and stashes the original hidden state', () => {
  const plan = planDrawingDepleted({ behavior: {}, depleted: true, drawing: drawingDoc({ hidden: false }) });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.hidden, true);
  assert.deepEqual(plan.update.flags.fabricate.nodeOriginal, { hidden: false });
  assert.equal(plan.update.text, undefined, 'no label decoration without swapImage/postfix');
});

test('planDrawingDepleted: with swapImage/postfix configured it also appends a "(depleted)" label', () => {
  const plan = planDrawingDepleted({ behavior: { swapImage: 'depleted.webp' }, depleted: true, drawing: drawingDoc({ text: 'Herb patch' }) });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.update.hidden, true);
  assert.equal(plan.update.text, 'Herb patch (depleted)');
  assert.equal(plan.update.flags.fabricate.nodeOriginal.text, 'Herb patch');
});

test('planDrawingDepleted: apply is idempotent — an already-stashed drawing is a no-op', () => {
  const plan = planDrawingDepleted({ behavior: {}, depleted: true, drawing: drawingDoc({ nodeOriginal: { hidden: false } }) });
  assert.deepEqual(plan, { action: 'none' });
});

test('planDrawingDepleted: respawn SHOWS the drawing again and restores the original text/hidden', () => {
  const plan = planDrawingDepleted({
    behavior: { swapImage: 'depleted.webp' },
    depleted: false,
    drawing: drawingDoc({ text: 'Herb patch (depleted)', hidden: true, nodeOriginal: { hidden: false, text: 'Herb patch' } })
  });
  assert.equal(plan.action, 'revert');
  assert.equal(plan.update.hidden, false);
  assert.equal(plan.update.text, 'Herb patch');
  assert.equal(plan.update.flags.fabricate.nodeOriginal, null);
});

test('planDrawingDepleted: revert is idempotent — nothing stashed means nothing to revert', () => {
  assert.deepEqual(planDrawingDepleted({ behavior: {}, depleted: false, drawing: drawingDoc() }), { action: 'none' });
});

test('planDrawingDepleted: deleteToken on deplete is terminal', () => {
  assert.deepEqual(planDrawingDepleted({ behavior: { deleteToken: true }, depleted: true, drawing: drawingDoc() }), { action: 'delete' });
});

test('applyLinkedVisualDepleted Drawing branch routes a hide APPLY via emitVisualUpdate', () => {
  const updates = [];
  const deletes = [];
  const doc = drawingDoc({ hidden: false });
  withFromUuid({ 'Scene.s1.Drawing.d1': doc }, () => applyLinkedVisualDepleted({
    behaviorSystem: { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' }, node: { depletedBehavior: {} } },
    depleted: true,
    emitVisualUpdate: (a) => updates.push(a),
    emitVisualDelete: (a) => deletes.push(a)
  }));
  assert.equal(deletes.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].documentName, 'Drawing');
  assert.equal(updates[0].update.hidden, true);
});

test('applyLinkedVisualDepleted Drawing branch routes a SHOW revert via emitVisualUpdate', () => {
  const updates = [];
  const doc = drawingDoc({ hidden: true, nodeOriginal: { hidden: false } });
  withFromUuid({ 'Scene.s1.Drawing.d1': doc }, () => applyLinkedVisualDepleted({
    behaviorSystem: { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' }, node: { depletedBehavior: {} } },
    depleted: false,
    emitVisualUpdate: (a) => updates.push(a)
  }));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.hidden, false);
});

test('applyLinkedVisualDepleted Drawing branch routes a terminal DELETE via emitVisualDelete', () => {
  const updates = [];
  const deletes = [];
  const doc = drawingDoc();
  withFromUuid({ 'Scene.s1.Drawing.d1': doc }, () => applyLinkedVisualDepleted({
    behaviorSystem: { linkedVisual: { uuid: 'Scene.s1.Drawing.d1', documentName: 'Drawing' }, node: { depletedBehavior: { deleteToken: true } } },
    depleted: true,
    emitVisualUpdate: (a) => updates.push(a),
    emitVisualDelete: (a) => deletes.push(a)
  }));
  assert.equal(updates.length, 0);
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].documentName, 'Drawing');
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
