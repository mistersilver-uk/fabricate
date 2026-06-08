/**
 * Make interactable Tile placeables pointer-eventful for ALL users.
 *
 * A Foundry Tile is GM scenery: for a non-GM player the placeable is not
 * pointer-interactive, so a `clickLeft2` / `hover` never routes to the
 * placeable's `MouseInteractionManager` and the Fabricate `_onClickLeft2` /
 * `can` wraps installed in {@link InteractableManager} are never reached. The
 * permission wrap PERMITS the action, but the event must first be DELIVERED.
 *
 * This module supplies that delivery enablement. The pure decision — "is this
 * placeable an interactable tile we should enable?" — is
 * {@link isInteractableTile} from `interactableTileFlags.js`; the PIXI/Foundry
 * mutation (PIXI v7 `eventMode = 'static'` / legacy `interactive = true`,
 * `interactiveChildren`, and ensuring the placeable's `MouseInteractionManager`
 * is created and `activate()`d) is the thin edge applied in
 * {@link enableInteractableTilePointerEvents}.
 *
 * Everything is probed defensively against the installed V13/PIXI build and is
 * no-throw + idempotent, so an unexpected shape degrades to "not enabled" rather
 * than breaking canvas draw.
 *
 * V13 type evidence (foundry-vtt-types 12.331.x; runtime is V13 so this is
 * corroborating, not authoritative):
 *  - `PlaceableObject#mouseInteractionManager: MouseInteractionManager | null`
 *  - `PlaceableObject#activateListeners(): void` (creates + activates the
 *    interaction manager)
 *  - `PlaceableObject#_createInteractionManager()`
 *  - `MouseInteractionManager#activate(): this`
 *  - `MouseInteractionManager.emulateMoveEvent()` doc states an object with the
 *    "static event mode" participates in pointer routing — i.e. PIXI v7
 *    `eventMode = 'static'` is the V13 idiom; `interactive = true` is the legacy
 *    alias.
 */

import { isInteractableTile } from './interactableTileFlags.js';

/** Marker so the per-placeable enablement runs its mutations at most once. */
const ENABLED_FLAG = '_fabricateInteractableEnabled';

/**
 * Enable pointer interactivity on a single placeable IFF its document is a
 * Fabricate interactable tile. Pure-decision gated, defensive, idempotent.
 *
 * Steps (each guarded so a missing property/method is skipped, not thrown):
 *  1. Set the PIXI event mode so the placeable participates in pointer routing:
 *     `eventMode = 'static'` (PIXI v7 / V13) AND the legacy `interactive = true`
 *     alias, covering either build.
 *  2. Allow children (the mesh / frame) to receive events: `interactiveChildren
 *     = true`.
 *  3. Ensure the placeable owns a `MouseInteractionManager` and ACTIVATE it so
 *     `clickLeft2` / `hoverIn` are delivered even when the player's active
 *     control layer is not the tiles layer — preferring the placeable's own
 *     `activateListeners()` (which both creates and activates), then falling
 *     back to `_createInteractionManager()` + `mouseInteractionManager.activate()`.
 *
 * @param {object} placeable  A Tile placeable (carries `.document`).
 * @returns {boolean} `true` when this placeable was treated as interactable and
 *   the enablement ran (or was already applied); `false` otherwise.
 */
export function enableInteractableTilePointerEvents(placeable) {
  if (!placeable) return false;
  if (!isInteractableTile(placeable.document)) return false;

  // Idempotent: the mutation set runs once per placeable instance. Re-running is
  // harmless but pointless; the flag also lets a sweep skip already-enabled tiles.
  if (placeable[ENABLED_FLAG] === true) return true;

  // 1 + 2: PIXI pointer participation. `eventMode`/`interactive`/`interactiveChildren`
  // are inherited PIXI Container props; assign defensively (no-throw on a frozen
  // or exotic object).
  try {
    if ('eventMode' in placeable || typeof placeable.eventMode === 'string') {
      placeable.eventMode = 'static';
    }
  } catch (_err) { /* tolerate exotic placeables. */ }
  try { placeable.interactive = true; } catch (_err) { /* legacy alias; tolerate. */ }
  try { placeable.interactiveChildren = true; } catch (_err) { /* tolerate. */ }

  // 3: ensure + activate the interaction manager so events route to the wrapped
  // `_onClickLeft2` / `can` regardless of the active control layer.
  activatePlaceableInteraction(placeable);

  try { placeable[ENABLED_FLAG] = true; } catch (_err) { /* tolerate frozen. */ }
  return true;
}

/**
 * Ensure a placeable's `MouseInteractionManager` exists and is activated.
 *
 * Prefers the placeable's own `activateListeners()` (the V13 PlaceableObject API
 * that creates AND activates the manager); falls back to building the manager via
 * `_createInteractionManager()` and calling `activate()` on it directly. Each
 * step is probed and no-throw.
 *
 * @param {object} placeable
 * @returns {void}
 */
function activatePlaceableInteraction(placeable) {
  // Preferred: the placeable's public listener-activation. In V13 this both
  // creates `mouseInteractionManager` (if absent) and activates it.
  if (typeof placeable.activateListeners === 'function') {
    try {
      placeable.activateListeners();
    } catch (_err) { /* fall through to the manual path. */ }
  }

  // Ensure a manager instance exists (the placeable may not have built one yet
  // off the tiles layer for a non-GM).
  if (!placeable.mouseInteractionManager && typeof placeable._createInteractionManager === 'function') {
    try {
      placeable.mouseInteractionManager = placeable._createInteractionManager();
    } catch (_err) { /* tolerate. */ }
  }

  // Activate the manager so its handlers are bound and pointer events route to it.
  const manager = placeable.mouseInteractionManager;
  if (manager && typeof manager.activate === 'function') {
    try {
      manager.activate();
    } catch (_err) { /* tolerate. */ }
  }
}

/**
 * Sweep a collection of placeables, enabling pointer interactivity on every
 * interactable tile. Used on `canvasReady` to catch tiles drawn before the hook
 * was installed (and after a scene swap). Non-interactable tiles are skipped.
 *
 * @param {Iterable<object>|null|undefined} placeables  e.g. `canvas.tiles.placeables`.
 * @returns {number} How many placeables were enabled (treated as interactable).
 */
export function enableInteractableTilesIn(placeables) {
  if (!placeables) return 0;
  let count = 0;
  let iterable = placeables;
  // Tolerate both an array and a live collection that is not directly iterable.
  if (typeof iterable[Symbol.iterator] !== 'function') {
    iterable = Array.isArray(iterable?.placeables) ? iterable.placeables : [];
  }
  for (const placeable of iterable) {
    if (enableInteractableTilePointerEvents(placeable)) count += 1;
  }
  return count;
}
