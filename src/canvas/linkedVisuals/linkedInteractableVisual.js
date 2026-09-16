/**
 * Resolve, create and relink the presentation-only Tile/Drawing/Token marker for a
 * `fabricate.interactable` region behaviour (`data-models/spec.md` § Linked Visual reverse flags).
 * Authoritative state lives on the behaviour; a missing marker is a clean no-op.
 * Only the resolve and the create/relink writes are edges — every decision here is pure.
 */

import {
  buildLinkedVisualFlags,
  readInteractableBehaviorSystem,
} from '../regions/interactableRegionFlags.js';

/**
 * EDGE. Resolves `behaviorSystem.linkedVisual` by uuid, falling back to a `{ scene }`-embedded
 * lookup. No-throw: any failure resolves to null.
 */
export function resolveLinkedVisual(behaviorSystem, { scene } = {}) {
  const linked = behaviorSystem?.linkedVisual;
  if (!linked || typeof linked !== 'object') return null;
  const documentName = typeof linked.documentName === 'string' ? linked.documentName : null;
  const uuid = typeof linked.uuid === 'string' && linked.uuid.trim() ? linked.uuid.trim() : null;
  if (!documentName || !uuid) return null;

  let doc;
  try {
    doc = globalThis.fromUuidSync?.(uuid) ?? null;
  } catch {
    doc = null;
  }

  // Scene-embedded fallback when the UUID resolver is unavailable: take the trailing id.
  if (!doc && scene) {
    const docId = uuid.includes('.') ? uuid.split('.').pop() : uuid;
    doc = lookupEmbedded(scene, documentName, docId);
  }

  if (!doc) return null;
  return { doc, documentName };
}

function lookupEmbedded(scene, documentName, docId) {
  if (!scene || !docId) return null;
  try {
    if (documentName === 'Tile') return scene.tiles?.get?.(docId) ?? null;
    if (documentName === 'Drawing') return scene.drawings?.get?.(docId) ?? null;
    if (documentName === 'Token') return scene.tokens?.get?.(docId) ?? null;
  } catch {
    return null;
  }
  return null;
}

/**
 * PURE. The `TileDocument.create` payload, including the reverse linked-visual flags pointing
 * back at the owning Region and behaviour; the caller performs the create.
 */
export function buildLinkedTileData({ regionUuid, behaviorId, texture, x, y, width, height } = {}) {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid, behaviorId });
  return {
    texture: {
      src: typeof texture === 'string' && texture.trim() ? texture.trim() : DEFAULT_LINKED_TILE_IMG,
    },
    x: Number(x ?? 0),
    y: Number(y ?? 0),
    width:
      Number.isFinite(Number(width)) && Number(width) > 0
        ? Number(width)
        : DEFAULT_LINKED_TILE_SIZE,
    height:
      Number.isFinite(Number(height)) && Number(height) > 0
        ? Number(height)
        : DEFAULT_LINKED_TILE_SIZE,
    flags: { fabricate },
  };
}

const DEFAULT_LINKED_TILE_IMG = 'icons/svg/item-bag.svg';
const DEFAULT_LINKED_TILE_SIZE = 100;

const DEFAULT_LINKED_DRAWING_SIZE = 200;
// The default "zone" marker for a Drawing-backed interactable.
const DEFAULT_DRAWING_STROKE = '#ffaa00';
const DEFAULT_DRAWING_FILL = '#ffaa00';

/**
 * PURE. The `DrawingDocument.create` payload — a labelled rectangle plus the same reverse
 * linked-visual flags; the caller performs the create.
 */
export function buildLinkedDrawingData({
  regionUuid,
  behaviorId,
  text,
  strokeColor,
  fillColor,
  x,
  y,
  width,
  height,
} = {}) {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid, behaviorId });
  const w =
    Number.isFinite(Number(width)) && Number(width) > 0
      ? Number(width)
      : DEFAULT_LINKED_DRAWING_SIZE;
  const h =
    Number.isFinite(Number(height)) && Number(height) > 0
      ? Number(height)
      : DEFAULT_LINKED_DRAWING_SIZE;
  const stroke =
    typeof strokeColor === 'string' && strokeColor.trim()
      ? strokeColor.trim()
      : DEFAULT_DRAWING_STROKE;
  const fill =
    typeof fillColor === 'string' && fillColor.trim() ? fillColor.trim() : DEFAULT_DRAWING_FILL;
  return {
    x: Number(x ?? 0),
    y: Number(y ?? 0),
    shape: { type: 'r', width: w, height: h },
    text: typeof text === 'string' ? text : '',
    strokeColor: stroke,
    strokeWidth: 2,
    fillType: 1, // CONST.DRAWING_FILL_TYPES.SOLID
    fillColor: fill,
    fillAlpha: 0.15,
    fontSize: 24,
    textColor: stroke,
    flags: { fabricate },
  };
}

/**
 * EDGE. Creates the linked Drawing marker, preferring the V13-namespaced class and falling back
 * to the scene's `createEmbeddedDocuments`. No-throw: returns null when it could not be created.
 */
export async function createLinkedDrawing({
  scene,
  behavior,
  x,
  y,
  width,
  height,
  text,
  strokeColor,
  fillColor,
} = {}) {
  if (!scene) return null;
  const region = behavior?.parent ?? null;
  const regionUuid = typeof region?.uuid === 'string' ? region.uuid : null;
  const behaviorId = behavior?.id ?? behavior?._id ?? null;
  if (!regionUuid || !behaviorId) return null;

  // Default the label to the interactable name when no explicit text is given.
  const label =
    typeof text === 'string'
      ? text
      : typeof behavior?.system?.name === 'string'
        ? behavior.system.name
        : '';

  let drawingData;
  try {
    drawingData = buildLinkedDrawingData({
      regionUuid,
      behaviorId,
      text: label,
      strokeColor,
      fillColor,
      x,
      y,
      width,
      height,
    });
  } catch {
    return null;
  }

  try {
    const DrawingDocument =
      globalThis.foundry?.documents?.DrawingDocument ?? globalThis.CONFIG?.Drawing?.documentClass;
    if (DrawingDocument?.create) {
      return (await DrawingDocument.create(drawingData, { parent: scene })) ?? null;
    }
    if (scene.createEmbeddedDocuments) {
      const [created] = await scene.createEmbeddedDocuments('Drawing', [drawingData]);
      return created ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * EDGE. Creates the linked Tile marker, preferring the V13-namespaced class and falling back to
 * the scene's `createEmbeddedDocuments`. No-throw: returns null when it could not be created.
 */
export async function createLinkedTile({ scene, behavior, texture, x, y, width, height } = {}) {
  if (!scene) return null;
  const region = behavior?.parent ?? null;
  const regionUuid = typeof region?.uuid === 'string' ? region.uuid : null;
  const behaviorId = behavior?.id ?? behavior?._id ?? null;
  if (!regionUuid || !behaviorId) return null;

  let tileData;
  try {
    tileData = buildLinkedTileData({ regionUuid, behaviorId, texture, x, y, width, height });
  } catch {
    return null;
  }

  try {
    const TileDocument =
      globalThis.foundry?.documents?.TileDocument ?? globalThis.CONFIG?.Tile?.documentClass;
    if (TileDocument?.create) {
      return (await TileDocument.create(tileData, { parent: scene })) ?? null;
    }
    if (scene.createEmbeddedDocuments) {
      const [created] = await scene.createEmbeddedDocuments('Tile', [tileData]);
      return created ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * PURE. The `{ linkedVisual: { uuid, documentName } }` patch relinking a behaviour to a
 * GM-selected Tile/Drawing/Token, or null when the selection is not a supported kind with a uuid.
 */
export function planRelinkVisual(selectedDoc) {
  const uuid =
    typeof selectedDoc?.uuid === 'string' && selectedDoc.uuid.trim()
      ? selectedDoc.uuid.trim()
      : null;
  const documentName = resolveDocumentName(selectedDoc);
  if (!uuid || !documentName) return null;
  return { linkedVisual: { uuid, documentName } };
}

function resolveDocumentName(doc) {
  const name = doc?.documentName ?? doc?.constructor?.documentName ?? null;
  if (['Tile', 'Drawing', 'Token'].includes(name)) return name;
  return null;
}

/**
 * PURE. Nulls the reverse `flags.fabricate` block so a stale marker stops reporting itself as an
 * interactable visual.
 */
export function buildClearLinkedVisualFlags() {
  return {
    flags: {
      fabricate: {
        isInteractableVisual: null,
        linkedRegionUuid: null,
        linkedBehaviorId: null,
      },
    },
  };
}

/**
 * EDGE. Persists the relink patch through `applyBehaviorUpdate`, then writes the reverse flags
 * onto the newly-selected document and clears them off the previous one.
 * Without the reverse flag `readLinkedVisualRef` returns null and the Tile-HUD "Configure
 * Fabricate Interactable" entry never appears on a relinked marker.
 */
export async function relinkVisual(
  behavior,
  selectedDoc,
  { applyBehaviorUpdate, identify, applyVisualUpdate } = {}
) {
  const patch = planRelinkVisual(selectedDoc);
  if (!patch) return null;
  const ref = identify?.(behavior);
  if (!ref) return null;

  // Snapshot the PRIOR linked visual BEFORE awaiting the forward update: live Foundry mutates
  // `behavior.system.linkedVisual` in place, so reading it afterwards sees the NEW uuid and the
  // old marker's reverse flag is never cleared.
  const prior = behavior?.system?.linkedVisual ?? null;
  const priorUuid = typeof prior?.uuid === 'string' && prior.uuid.trim() ? prior.uuid.trim() : null;
  const priorDocumentName = typeof prior?.documentName === 'string' ? prior.documentName : null;

  await applyBehaviorUpdate?.({ ...ref, update: { system: patch } });

  if (typeof applyVisualUpdate === 'function') {
    const region = behavior?.parent ?? null;
    const regionUuid = typeof region?.uuid === 'string' ? region.uuid : null;
    const behaviorId = behavior?.id ?? behavior?._id ?? null;
    const newUuid = patch.linkedVisual.uuid;
    const newDocumentName = patch.linkedVisual.documentName;

    // Clear the OLD marker first (when one exists and is a different document).
    if (priorUuid && priorUuid !== newUuid) {
      await applyVisualUpdate({
        sceneId: ref.sceneId,
        visualUuid: priorUuid,
        documentName: priorDocumentName ?? newDocumentName,
        update: buildClearLinkedVisualFlags(),
      });
    }

    if (regionUuid && behaviorId) {
      await applyVisualUpdate({
        sceneId: ref.sceneId,
        visualUuid: newUuid,
        documentName: newDocumentName,
        update: { flags: buildLinkedVisualFlags({ regionUuid, behaviorId }) },
      });
    }
  }

  return patch;
}

/**
 * EDGE. Creates a replacement Tile and writes its uuid back onto the behaviour through
 * `applyBehaviorUpdate`. Returns the created Tile, or null.
 */
export async function recreateLinkedTile(
  behavior,
  { scene, texture, x, y, width, height } = {},
  { applyBehaviorUpdate, identify } = {}
) {
  const tile = await createLinkedTile({ scene, behavior, texture, x, y, width, height });
  if (!tile) return null;
  const ref = identify?.(behavior);
  const uuid = typeof tile?.uuid === 'string' ? tile.uuid : null;
  if (ref && uuid) {
    await applyBehaviorUpdate?.({
      ...ref,
      update: { system: { linkedVisual: { uuid, documentName: 'Tile' } } },
    });
  }
  return tile;
}

/**
 * EDGE. Creates a replacement Drawing (also the region-only to Drawing-marker upgrade) and writes
 * its uuid back onto the behaviour through `applyBehaviorUpdate`. Returns the created Drawing, or null.
 */
export async function recreateLinkedDrawing(
  behavior,
  { scene, x, y, width, height, text, strokeColor, fillColor } = {},
  { applyBehaviorUpdate, identify } = {}
) {
  const drawing = await createLinkedDrawing({
    scene,
    behavior,
    x,
    y,
    width,
    height,
    text,
    strokeColor,
    fillColor,
  });
  if (!drawing) return null;
  const ref = identify?.(behavior);
  const uuid = typeof drawing?.uuid === 'string' ? drawing.uuid : null;
  if (ref && uuid) {
    await applyBehaviorUpdate?.({
      ...ref,
      update: { system: { linkedVisual: { uuid, documentName: 'Drawing' } } },
    });
  }
  return drawing;
}

/**
 * PURE. The intent for a behaviour's missing marker, per `linkedVisual.missingPolicy`
 * (`data-models/spec.md` § Linked Visual reverse flags, requirement 3). Only a Tile is auto-recreated; a
 * missing Drawing or Token under `recreate` degrades to `warn`.
 */
export function planMissingPolicy(behaviorSystem, resolved) {
  const linked =
    behaviorSystem?.linkedVisual && typeof behaviorSystem.linkedVisual === 'object'
      ? behaviorSystem.linkedVisual
      : {};
  const hasConfiguredVisual =
    linked.mode === 'marker' && typeof linked.uuid === 'string' && linked.uuid.trim();
  if (!hasConfiguredVisual) return { action: 'none' };
  if (resolved === true) return { action: 'ok' };

  const policy = linked.missingPolicy;
  if (policy === 'ignore') return { action: 'none' };
  if (policy === 'recreate' && linked.documentName === 'Tile') return { action: 'recreate' };
  return { action: 'warn' };
}

/**
 * EDGE. Resolves the live visual, then applies `planMissingPolicy`: no-op, notify, or recreate
 * the Tile through the injectable `recreate` seam. No-throw.
 */
export async function applyMissingPolicy(
  behaviorSystem,
  { scene, behavior, notify, recreate } = {}
) {
  const system =
    behaviorSystem && typeof behaviorSystem === 'object'
      ? behaviorSystem.linkedVisual
        ? behaviorSystem
        : (readInteractableBehaviorSystem(behaviorSystem) ?? behaviorSystem)
      : {};
  const resolved = resolveLinkedVisual(system, { scene }) !== null;
  const decision = planMissingPolicy(system, resolved);

  if (decision.action === 'warn') {
    notify?.('FABRICATE.Canvas.Interactable.LinkedVisualMissing');
  } else if (decision.action === 'recreate' && typeof recreate === 'function') {
    await recreate(behavior, { scene });
  }
  return decision;
}
