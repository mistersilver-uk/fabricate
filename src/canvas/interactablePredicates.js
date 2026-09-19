/**
 * The pure decisions behind `InteractableManager` — ownership, prompt eligibility, containment,
 * drop geometry, icon choice — with every runtime value a parameter the manager edge computed.
 */

import { regionContainsTokenDocument } from './regionHitTest.js';
import { isInteractableRegionBehavior } from './regions/interactableRegionFlags.js';

/** Fallback tile image when no tool/task icon can be resolved. */
export const DEFAULT_INTERACTABLE_IMG = 'icons/svg/item-bag.svg';

/** Does this user own the token (player owns the actor, or GM)? Tolerates both shapes. */
export function ownsToken(token, { isGM } = {}) {
  const doc = token?.document ?? token;
  if (!doc) return false;
  if (isGM === true) return true;
  if (typeof doc.isOwner === 'boolean') return doc.isOwner === true;
  const actor = doc.actor ?? null;
  if (actor && typeof actor.isOwner === 'boolean') return actor.isOwner === true;
  if (typeof token?.controlled === 'boolean') return token.controlled === true;
  return false;
}

/** The mover and a NON-GM owner see the prompt; never GM-owns-everything, which would spam. */
export function shouldPromptForEnter({ event, token, currentUser } = {}) {
  const isMover = !!(
    event?.user &&
    currentUser &&
    String(event.user.id) === String(currentUser.id)
  );
  const isOwningPlayer =
    currentUser?.isGM !== true && ownsToken(token, { isGM: currentUser?.isGM === true });
  return isMover || isOwningPlayer;
}

/** The token a region behaviour event carries, under either V13 shape. */
export function eventToken(event) {
  return event?.data?.token ?? event?.token ?? null;
}

/** The first `fabricate.interactable` behaviour on a freshly-created Region document. */
export function firstInteractableBehavior(regionDoc) {
  const list = collectionEntries(regionDoc?.behaviors);
  return list.find((behavior) => isInteractableRegionBehavior(behavior)) ?? list[0] ?? null;
}

/** A scene's token DOCUMENTS, tolerating the V13 collection and array shapes. */
export function sceneTokenDocs(scene) {
  return collectionEntries(scene?.tokens);
}

function collectionEntries(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (typeof collection?.values === 'function') return [...collection.values()];
  if (Array.isArray(collection)) return collection;
  return [];
}

/** Containment per `data-models/spec.md` requirement 6: cannot locate ⇒ admit, any token admits. */
export function tokenInsideRegion({ behavior, actorId } = {}) {
  const region = behavior?.parent ?? null;
  const tokenDocs = sceneTokenDocs(region?.parent ?? null).filter(
    (token) => String(token?.actorId ?? token?.actor?.id ?? '') === String(actorId ?? '')
  );
  if (tokenDocs.length === 0) return true;
  return tokenDocs.some((tokenDoc) => regionContainsTokenDocument(region, tokenDoc) === true);
}

export function dropPoint(data) {
  return { x: Number(data?.x ?? 0), y: Number(data?.y ?? 0) };
}

/** The REQUESTING user's control of the named actor, never the validating GM's. */
export function canControlActor({ actor, user } = {}) {
  if (!actor) return false;
  if (user?.isGM === true) return true;
  if (typeof actor.testUserPermission === 'function' && user) {
    try {
      return actor.testUserPermission(user, 'OWNER') === true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

/**
 * The region rectangle overlaying a spawn: a Tile renders CENTRED on its `x/y`, a Region rectangle
 * TOP-LEFT. It emits no anchor (V14 initialises those at 0) and keeps the non-zero `gridSize`
 * fallback, since V13 rejects a zero dimension and resolves the create to a silent no-spawn.
 */
export function regionRectangleFor({ tile, region, gridSize } = {}) {
  if (!tile) {
    return {
      x: Number(region?.shape?.x ?? 0),
      y: Number(region?.shape?.y ?? 0),
      width: Number(region?.shape?.width ?? gridSize),
      height: Number(region?.shape?.height ?? gridSize),
    };
  }
  return {
    x: Number(tile.x ?? 0) - Number(tile.width ?? gridSize) / 2,
    y: Number(tile.y ?? 0) - Number(tile.height ?? gridSize) / 2,
    width: Number(tile.width ?? region?.shape?.width ?? gridSize),
    height: Number(tile.height ?? region?.shape?.height ?? gridSize),
  };
}

/** The view centre: the stage's own answer wins, else the scene midpoint, else the origin. */
export function viewCenterFrom({ stageCenter, dimensions } = {}) {
  if (stageCenter) return stageCenter;
  if (dimensions && Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height)) {
    return { x: Number(dimensions.width) / 2, y: Number(dimensions.height) / 2 };
  }
  return { x: 0, y: 0 };
}

/** The scene-space point under the screen centre, or null when the stage cannot answer. */
export function screenCenterToScene({ stage, PointClass, width, height } = {}) {
  const toLocal = stage?.toLocal;
  if (typeof toLocal !== 'function' || typeof PointClass !== 'function') return null;
  try {
    const local = toLocal.call(
      stage,
      new PointClass(Number(width ?? 0) / 2, Number(height ?? 0) / 2)
    );
    if (local && Number.isFinite(local.x) && Number.isFinite(local.y)) {
      return { x: local.x, y: local.y };
    }
  } catch {
    return null;
  }
  return null;
}

/** A tool station's icon comes from its linked component; anything else uses the entry's own. */
export function iconTextureFor({ classification, components = [] } = {}) {
  const entry = classification?.entry ?? null;
  if (classification?.interactableType === 'tool') {
    const component = (Array.isArray(components) ? components : []).find(
      (candidate) => String(candidate?.id ?? '') === String(entry?.componentId)
    );
    const img = component?.img;
    if (typeof img === 'string' && img.trim()) return img.trim();
  }
  const entryImg = entry?.img;
  if (typeof entryImg === 'string' && entryImg.trim()) return entryImg.trim();
  return DEFAULT_INTERACTABLE_IMG;
}

/** The first candidate grid size that is a positive number, else one square of 100. */
export function gridSizeFrom(...candidates) {
  const size = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  return Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 100;
}
