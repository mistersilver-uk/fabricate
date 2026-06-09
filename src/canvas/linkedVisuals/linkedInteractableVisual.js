/**
 * Linked-visual resolution + creation/relink for the region-first
 * `fabricate.interactable` model.
 *
 * In the region-first model the authoritative state lives on the Region Behaviour
 * (`fabricate.interactable`). A linked Tile/Drawing/Token is a presentation-only
 * marker resolved from `behaviorSystem.linkedVisual.{uuid,documentName}`. A MISSING
 * linked visual is a clean no-op (the interactable still works — the key advantage
 * of the region-first pivot), handled per the behaviour's `missingPolicy`.
 *
 * Only the resolve (`globalThis.fromUuidSync` / scene lookup) and the create/relink
 * (routed via the injected GM-socket / behaviour-write seams) are edges; the
 * relink/missing-policy DECISIONS stay PURE.
 */

import { buildLinkedVisualFlags, readInteractableBehaviorSystem } from '../regions/interactableRegionFlags.js';

/**
 * Resolve the live linked-visual document for a behaviour. EDGE: reads
 * `behaviorSystem.linkedVisual.{uuid,documentName}` and resolves the document
 * defensively via `globalThis.fromUuidSync`, falling back to a scene-embedded
 * lookup when a `{ scene }` is supplied. No-throw: any failure resolves to null.
 *
 * @param {object} behaviorSystem A behaviour `system` (or normalized view).
 * @param {object} [ctx]
 * @param {object} [ctx.scene] Optional scene for an embedded-document fallback.
 * @returns {{ doc: object, documentName: string } | null}
 */
export function resolveLinkedVisual(behaviorSystem, { scene } = {}) {
  const linked = behaviorSystem?.linkedVisual;
  if (!linked || typeof linked !== 'object') return null;
  const documentName = typeof linked.documentName === 'string' ? linked.documentName : null;
  const uuid = typeof linked.uuid === 'string' && linked.uuid.trim() ? linked.uuid.trim() : null;
  if (!documentName || !uuid) return null;

  // Primary path: resolve the live document by UUID.
  let doc = null;
  try {
    doc = globalThis.fromUuidSync?.(uuid) ?? null;
  } catch (_error) {
    doc = null;
  }

  // Fallback: a scene-embedded collection lookup (Tiles/Drawings/Tokens) when
  // the UUID resolver is unavailable. Pull the trailing id off the UUID.
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
  } catch (_error) {
    return null;
  }
  return null;
}

/**
 * Build the Tile-document create payload for a linked interactable visual. PURE:
 * shapes the `texture`/x/y/width/height plus the reverse linked-visual flag block
 * that points back at the owning Region + Behaviour (via
 * {@link buildLinkedVisualFlags}). The caller performs the actual
 * `TileDocument.create` at the edge.
 *
 * @param {object} params
 * @param {string} params.regionUuid  The owning Region's uuid.
 * @param {string} params.behaviorId  The owning behaviour's id.
 * @param {string} [params.texture]   Tile image path.
 * @param {number} [params.x]
 * @param {number} [params.y]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @returns {object} The Tile-document create data.
 */
export function buildLinkedTileData({ regionUuid, behaviorId, texture, x, y, width, height } = {}) {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid, behaviorId });
  return {
    texture: { src: typeof texture === 'string' && texture.trim() ? texture.trim() : DEFAULT_LINKED_TILE_IMG },
    x: Number(x ?? 0),
    y: Number(y ?? 0),
    width: Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : DEFAULT_LINKED_TILE_SIZE,
    height: Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : DEFAULT_LINKED_TILE_SIZE,
    flags: { fabricate }
  };
}

const DEFAULT_LINKED_TILE_IMG = 'icons/svg/item-bag.svg';
const DEFAULT_LINKED_TILE_SIZE = 100;

const DEFAULT_LINKED_DRAWING_SIZE = 200;
// A labelled translucent rectangle with a visible boundary stroke — a sensible
// default "zone" marker for a Drawing-backed interactable.
const DEFAULT_DRAWING_STROKE = '#ffaa00';
const DEFAULT_DRAWING_FILL = '#ffaa00';

/**
 * Build the Drawing-document create payload for a linked interactable visual.
 * PURE: shapes a labelled rectangle (`shape.type='r'`) with a boundary stroke +
 * translucent fill, plus the reverse linked-visual flag block that points back at
 * the owning Region + Behaviour (via {@link buildLinkedVisualFlags}). The caller
 * performs the actual `DrawingDocument.create` at the edge.
 *
 * @param {object} params
 * @param {string} params.regionUuid  The owning Region's uuid.
 * @param {string} params.behaviorId  The owning behaviour's id.
 * @param {string} [params.text]        The drawing label (default: empty).
 * @param {string} [params.strokeColor] Hex stroke colour.
 * @param {string} [params.fillColor]   Hex fill colour.
 * @param {number} [params.x]
 * @param {number} [params.y]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @returns {object} The Drawing-document create data.
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
  height
} = {}) {
  const { fabricate } = buildLinkedVisualFlags({ regionUuid, behaviorId });
  const w = Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : DEFAULT_LINKED_DRAWING_SIZE;
  const h = Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : DEFAULT_LINKED_DRAWING_SIZE;
  const stroke = typeof strokeColor === 'string' && strokeColor.trim() ? strokeColor.trim() : DEFAULT_DRAWING_STROKE;
  const fill = typeof fillColor === 'string' && fillColor.trim() ? fillColor.trim() : DEFAULT_DRAWING_FILL;
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
    flags: { fabricate }
  };
}

/**
 * Create the linked Drawing marker for a behaviour. EDGE: builds the create
 * payload via {@link buildLinkedDrawingData} and performs the real
 * `DrawingDocument.create` (preferring the V13-namespaced class, then a scene
 * `createEmbeddedDocuments` fallback). Returns the created DrawingDocument, or
 * null when it could not be created (no-throw).
 *
 * @param {object} params
 * @param {object} params.scene       The scene to create the Drawing in.
 * @param {object} params.behavior    The owning `fabricate.interactable` behaviour.
 * @param {number} [params.x]
 * @param {number} [params.y]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {string} [params.text]       The drawing label (defaults to the interactable name).
 * @param {string} [params.strokeColor]
 * @param {string} [params.fillColor]
 * @returns {Promise<object|null>}
 */
export async function createLinkedDrawing({ scene, behavior, x, y, width, height, text, strokeColor, fillColor } = {}) {
  if (!scene) return null;
  const region = behavior?.parent ?? null;
  const regionUuid = typeof region?.uuid === 'string' ? region.uuid : null;
  const behaviorId = behavior?.id ?? behavior?._id ?? null;
  if (!regionUuid || !behaviorId) return null;

  // Default the label to the interactable name when no explicit text is given.
  const label = typeof text === 'string'
    ? text
    : (typeof behavior?.system?.name === 'string' ? behavior.system.name : '');

  let drawingData;
  try {
    drawingData = buildLinkedDrawingData({ regionUuid, behaviorId, text: label, strokeColor, fillColor, x, y, width, height });
  } catch (_error) {
    return null;
  }

  try {
    const DrawingDocument = globalThis.foundry?.documents?.DrawingDocument
      ?? globalThis.CONFIG?.Drawing?.documentClass;
    if (DrawingDocument?.create) {
      return await DrawingDocument.create(drawingData, { parent: scene }) ?? null;
    }
    if (scene.createEmbeddedDocuments) {
      const [created] = await scene.createEmbeddedDocuments('Drawing', [drawingData]);
      return created ?? null;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

/**
 * Create the linked Tile marker for a behaviour. EDGE: builds the create payload
 * via {@link buildLinkedTileData} and performs the real `TileDocument.create`
 * (preferring the V13-namespaced class, then a scene `createEmbeddedDocuments`
 * fallback). Returns the created TileDocument, or null when it could not be
 * created (no-throw).
 *
 * @param {object} params
 * @param {object} params.scene       The scene to create the Tile in.
 * @param {object} params.behavior    The owning `fabricate.interactable` behaviour
 *   (carries `id` + `parent` Region for the reverse flags).
 * @param {string} [params.texture]
 * @param {number} [params.x]
 * @param {number} [params.y]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @returns {Promise<object|null>}
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
  } catch (_error) {
    return null;
  }

  try {
    const TileDocument = globalThis.foundry?.documents?.TileDocument
      ?? globalThis.CONFIG?.Tile?.documentClass;
    if (TileDocument?.create) {
      return await TileDocument.create(tileData, { parent: scene }) ?? null;
    }
    if (scene.createEmbeddedDocuments) {
      const [created] = await scene.createEmbeddedDocuments('Tile', [tileData]);
      return created ?? null;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

/**
 * Decide the behaviour-system patch needed to RELINK a behaviour to a
 * GM-selected document. PURE: validates the selected document is a supported
 * linked-visual kind (Tile/Drawing/Token) carrying a uuid, and returns the
 * `{ linkedVisual: { uuid, documentName } }` patch to merge onto the behaviour
 * system — or null when the selection is unusable.
 *
 * @param {object} selectedDoc  The GM-selected document (TileDocument/DrawingDocument/TokenDocument).
 * @returns {{ linkedVisual: { uuid: string, documentName: string } } | null}
 */
export function planRelinkVisual(selectedDoc) {
  const uuid = typeof selectedDoc?.uuid === 'string' && selectedDoc.uuid.trim() ? selectedDoc.uuid.trim() : null;
  const documentName = resolveDocumentName(selectedDoc);
  if (!uuid || !documentName) return null;
  return { linkedVisual: { uuid, documentName } };
}

function resolveDocumentName(doc) {
  const name = doc?.documentName ?? doc?.constructor?.documentName ?? null;
  if (name === 'Tile' || name === 'Drawing' || name === 'Token') return name;
  return null;
}

/**
 * Build the reverse-flag CLEAR patch for a previously-linked visual: nulls out the
 * `flags.fabricate.{isInteractableVisual,linkedRegionUuid,linkedBehaviorId}` block
 * so a stale marker no longer reports itself as an interactable visual. PURE.
 *
 * @returns {{ flags: { fabricate: { isInteractableVisual: null, linkedRegionUuid: null, linkedBehaviorId: null } } }}
 */
export function buildClearLinkedVisualFlags() {
  return {
    flags: {
      fabricate: {
        isInteractableVisual: null,
        linkedRegionUuid: null,
        linkedBehaviorId: null
      }
    }
  };
}

/**
 * Relink a behaviour to a GM-selected document. EDGE: computes the pure relink
 * patch ({@link planRelinkVisual}) and persists it through the injected
 * `applyBehaviorUpdate` seam (the active-GM behaviour write), THEN writes the
 * reverse linked-visual flag block onto the newly-selected document and CLEARS the
 * reverse flags off the previously-linked document (when one exists and differs).
 * Without the reverse flag, `readLinkedVisualRef` returns null and the Tile-HUD
 * "Configure Fabricate Interactable" entry never appears on a relinked tile.
 * Returns the applied behaviour patch, or null when the selection was unusable.
 *
 * @param {object} behavior        The owning behaviour (carries the ref + the
 *   previously-linked uuid via `behavior.system.linkedVisual`).
 * @param {object} selectedDoc     The GM-selected document.
 * @param {object} deps
 * @param {(args: object) => (void|Promise<void>)} deps.applyBehaviorUpdate
 *   Persist the behaviour `{ system: { linkedVisual } }` patch (active-GM routed).
 * @param {(behavior: object) => ({sceneId,regionId,behaviorId}|null)} deps.identify
 * @param {(args: { sceneId: string, visualUuid: string, documentName: string, update: object }) => (void|Promise<void>)} [deps.applyVisualUpdate]
 *   Write a visual document update (the reverse-flag write/clear), active-GM routed.
 * @returns {Promise<object|null>}
 */
export async function relinkVisual(behavior, selectedDoc, { applyBehaviorUpdate, identify, applyVisualUpdate } = {}) {
  const patch = planRelinkVisual(selectedDoc);
  if (!patch) return null;
  const ref = identify?.(behavior);
  if (!ref) return null;

  // Capture the PRIOR linked visual BEFORE awaiting the forward update. In live
  // Foundry `applyBehaviorUpdate` mutates `behavior.system.linkedVisual` in place,
  // so reading `prior` after the await would already see the NEW uuid and the OLD
  // marker's reverse flag would never be cleared (a stale `isInteractableVisual`
  // marker would linger). Snapshot it first.
  const prior = behavior?.system?.linkedVisual ?? null;
  const priorUuid = typeof prior?.uuid === 'string' && prior.uuid.trim() ? prior.uuid.trim() : null;
  const priorDocumentName = typeof prior?.documentName === 'string' ? prior.documentName : null;

  await applyBehaviorUpdate?.({ ...ref, update: { system: patch } });

  // Write the reverse linked-visual flag onto the newly-selected document so the
  // Tile-HUD entry resolves; and clear it off the previously-linked document.
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
        update: buildClearLinkedVisualFlags()
      });
    }

    // Write the reverse flag onto the NEW marker. `buildLinkedVisualFlags`
    // returns the `{ fabricate }` block; wrap it as a `{ flags }` document patch.
    if (regionUuid && behaviorId) {
      await applyVisualUpdate({
        sceneId: ref.sceneId,
        visualUuid: newUuid,
        documentName: newDocumentName,
        update: { flags: buildLinkedVisualFlags({ regionUuid, behaviorId }) }
      });
    }
  }

  return patch;
}

/**
 * Recreate the linked Tile for a behaviour (e.g. after the GM deleted the
 * marker). EDGE: creates a fresh Tile via {@link createLinkedTile}, then writes
 * the new uuid + `documentName:'Tile'` back onto the behaviour system through the
 * injected `applyBehaviorUpdate` seam. Returns the created Tile, or null.
 *
 * @param {object} behavior
 * @param {object} params
 * @param {object} params.scene
 * @param {string} [params.texture]
 * @param {number} [params.x]
 * @param {number} [params.y]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {object} deps
 * @param {(args: object) => (void|Promise<void>)} deps.applyBehaviorUpdate
 * @param {(behavior: object) => ({sceneId,regionId,behaviorId}|null)} deps.identify
 * @returns {Promise<object|null>}
 */
export async function recreateLinkedTile(behavior, { scene, texture, x, y, width, height } = {}, { applyBehaviorUpdate, identify } = {}) {
  const tile = await createLinkedTile({ scene, behavior, texture, x, y, width, height });
  if (!tile) return null;
  const ref = identify?.(behavior);
  const uuid = typeof tile?.uuid === 'string' ? tile.uuid : null;
  if (ref && uuid) {
    await applyBehaviorUpdate?.({ ...ref, update: { system: { linkedVisual: { uuid, documentName: 'Tile' } } } });
  }
  return tile;
}

/**
 * Recreate the linked Drawing for a behaviour (e.g. after the GM deleted the
 * marker, or to upgrade a region-only interactable to a Drawing marker). EDGE:
 * creates a fresh Drawing via {@link createLinkedDrawing}, then writes the new
 * uuid + `documentName:'Drawing'` back onto the behaviour system through the
 * injected `applyBehaviorUpdate` seam. Returns the created Drawing, or null.
 *
 * @param {object} behavior
 * @param {object} params
 * @param {object} params.scene
 * @param {number} [params.x]
 * @param {number} [params.y]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {string} [params.text]
 * @param {string} [params.strokeColor]
 * @param {string} [params.fillColor]
 * @param {object} deps
 * @param {(args: object) => (void|Promise<void>)} deps.applyBehaviorUpdate
 * @param {(behavior: object) => ({sceneId,regionId,behaviorId}|null)} deps.identify
 * @returns {Promise<object|null>}
 */
export async function recreateLinkedDrawing(behavior, { scene, x, y, width, height, text, strokeColor, fillColor } = {}, { applyBehaviorUpdate, identify } = {}) {
  const drawing = await createLinkedDrawing({ scene, behavior, x, y, width, height, text, strokeColor, fillColor });
  if (!drawing) return null;
  const ref = identify?.(behavior);
  const uuid = typeof drawing?.uuid === 'string' ? drawing.uuid : null;
  if (ref && uuid) {
    await applyBehaviorUpdate?.({ ...ref, update: { system: { linkedVisual: { uuid, documentName: 'Drawing' } } } });
  }
  return drawing;
}

/**
 * Decide what to do about a behaviour's MISSING linked visual, per its
 * `missingPolicy`. PURE: reads `linkedVisual.{uuid,documentName,missingPolicy}`
 * and reports the resolution intent without performing any I/O.
 *
 *   - no configured visual (mode 'none' / no uuid) → `{ action:'none' }`.
 *   - visual present (resolved !== null)            → `{ action:'ok' }`.
 *   - missing + 'ignore'                            → `{ action:'none' }`.
 *   - missing + 'warn'                              → `{ action:'warn' }`.
 *   - missing + 'recreate' (Tile)                   → `{ action:'recreate' }`.
 *   - missing + 'recreate' (Drawing/Token)          → `{ action:'warn' }` (no auto-recreate of a non-Tile).
 *
 * @param {object} behaviorSystem
 * @param {boolean} resolved  Whether the live visual currently resolves.
 * @returns {{ action: 'none'|'ok'|'warn'|'recreate' }}
 */
export function planMissingPolicy(behaviorSystem, resolved) {
  const linked = behaviorSystem?.linkedVisual && typeof behaviorSystem.linkedVisual === 'object'
    ? behaviorSystem.linkedVisual
    : {};
  const hasConfiguredVisual = linked.mode === 'marker' && typeof linked.uuid === 'string' && linked.uuid.trim();
  if (!hasConfiguredVisual) return { action: 'none' };
  if (resolved === true) return { action: 'ok' };

  const policy = linked.missingPolicy;
  if (policy === 'ignore') return { action: 'none' };
  if (policy === 'recreate' && linked.documentName === 'Tile') return { action: 'recreate' };
  return { action: 'warn' };
}

/**
 * Apply a behaviour's missing-linked-visual policy. EDGE: resolves the live
 * visual, computes the pure {@link planMissingPolicy} decision, then either
 * no-ops (ok/none/ignore), notifies (warn), or recreates the Tile (recreate).
 * No-throw.
 *
 * @param {object} behaviorSystem  Behaviour system (or normalized view).
 * @param {object} params
 * @param {object} [params.scene]            Scene for the embedded-document fallback + recreate.
 * @param {object} [params.behavior]         Live behaviour (needed for recreate).
 * @param {(message: string) => void} [params.notify]  Warn channel.
 * @param {(behavior: object, params: object) => Promise<object|null>} [params.recreate]
 *   Recreate seam (defaults to {@link recreateLinkedTile}-style); injectable.
 * @returns {Promise<{ action: string }>}
 */
export async function applyMissingPolicy(behaviorSystem, { scene, behavior, notify, recreate } = {}) {
  const system = behaviorSystem && typeof behaviorSystem === 'object'
    ? (behaviorSystem.linkedVisual ? behaviorSystem : (readInteractableBehaviorSystem(behaviorSystem) ?? behaviorSystem))
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
