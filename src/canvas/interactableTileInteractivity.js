/**
 * Make interactable Tile placeables pointer-eventful for ALL users so the hover
 * discoverability tooltip works (a Tile has no nameplate).
 *
 * A Foundry Tile is GM scenery: for a non-GM player the placeable is not in the
 * active control layer, so the tiles-layer container does not route pointer
 * events DOWN into the placeable — neither the `MouseInteractionManager`
 * click-sequence (`_onClickLeft2`) nor a raw per-placeable `pointerdown` listener
 * ever fires for it. Live V13 testing confirmed hover works (the hover handlers
 * are wired through the interaction manager + the permission wrap) but the
 * double-click never reaches the placeable. The double-click is therefore
 * delivered at the CANVAS STAGE level — a raw PIXI `pointerdown` listener on
 * `canvas.stage` (the always-interactive PIXI interaction root) runs our own
 * double-click detection ({@link registerPointerEvent}) and hit-tests the
 * interactable tiles (see `interactableTileHitTest.js` + the stage-listener
 * install in `InteractableManager.js`), matching Monk's Active Tiles' canvas-level
 * approach. This module supplies the hover-supporting pointer enablement AND the
 * pure double-click detector the stage listener consumes.
 *
 * The pure decision — "is this placeable an interactable tile we should enable?"
 * — is {@link isInteractableTile} from `interactableTileFlags.js`. The
 * PIXI/Foundry mutations (PIXI v7 `eventMode = 'static'` / legacy
 * `interactive = true`, `interactiveChildren`, `cursor`, a `hitArea`, and
 * ensuring + activating the `MouseInteractionManager` so hover routes) are the
 * thin edge in {@link enableInteractableTilePointerEvents}.
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

/** Max gap (ms) between two pointer events to count as a double-click. */
const DOUBLE_CLICK_WINDOW_MS = 400;

/** Max distance (px) between two pointer events for a double-click. */
const DOUBLE_CLICK_DISTANCE_PX = 5;
const DOUBLE_CLICK_DISTANCE_SQ = DOUBLE_CLICK_DISTANCE_PX * DOUBLE_CLICK_DISTANCE_PX;

/**
 * Pure double-click detector. Records the incoming pointer event into the mutable
 * `state` and reports whether it completes a double-click. A second event lands as
 * a `'double'` only when it falls WITHIN {@link DOUBLE_CLICK_WINDOW_MS} of, and
 * WITHIN {@link DOUBLE_CLICK_DISTANCE_PX} of, the previous recorded event; any
 * event that does not (the first event, one after the window, or one too far away)
 * is a `'single'`. After reporting `'double'` the state is reset so a subsequent
 * event starts a fresh sequence (no triple-counting).
 *
 * This is the timing decision the canvas-stage `pointerdown` listener consumes
 * (the stage-listener install in `InteractableManager.js`); it is pure and
 * unit-testable in isolation, with no PIXI/Foundry dependency.
 *
 * @param {{ time?: number, x?: number, y?: number }} state  Mutable carrier of the
 *   last recorded event (initialise as `{}`).
 * @param {{ time: number, x: number, y: number }} event  The incoming event.
 * @returns {'double'|'single'}
 */
export function registerPointerEvent(state, event) {
  if (!state || !event) return 'single';
  const time = Number(event.time);
  const x = Number(event.x);
  const y = Number(event.y);

  const prevTime = Number(state.time);
  const hasPrev = Number.isFinite(prevTime)
    && Number.isFinite(Number(state.x))
    && Number.isFinite(Number(state.y));

  if (hasPrev && Number.isFinite(time)) {
    const withinWindow = (time - prevTime) >= 0 && (time - prevTime) <= DOUBLE_CLICK_WINDOW_MS;
    const dx = x - Number(state.x);
    const dy = y - Number(state.y);
    const withinDistance = (dx * dx + dy * dy) <= DOUBLE_CLICK_DISTANCE_SQ;
    if (withinWindow && withinDistance) {
      // Reset so the next event begins a fresh sequence.
      state.time = undefined;
      state.x = undefined;
      state.y = undefined;
      return 'double';
    }
  }

  // First event, or a non-completing one: record it as the new anchor.
  state.time = time;
  state.x = x;
  state.y = y;
  return 'single';
}

/**
 * Enable pointer interactivity on a single placeable IFF its document is a
 * Fabricate interactable tile. Pure-decision gated, defensive, idempotent.
 *
 * Steps (each guarded so a missing property/method is skipped, not thrown):
 *  1. Set the PIXI event mode so the placeable participates in pointer routing:
 *     `eventMode = 'static'` (PIXI v7 / V13) AND the legacy `interactive = true`
 *     alias, covering either build. Set `cursor = 'pointer'` for affordance and
 *     ensure a `hitArea` if the placeable needs one for hit-testing.
 *  2. Allow children (the mesh / frame) to receive events: `interactiveChildren
 *     = true`.
 *  3. Ensure the placeable owns a `MouseInteractionManager` and ACTIVATE it so
 *     `hoverIn` (the tooltip) is delivered even when the player's active control
 *     layer is not the tiles layer — preferring the placeable's own
 *     `activateListeners()` (which both creates and activates), then falling
 *     back to `_createInteractionManager()` + `mouseInteractionManager.activate()`.
 *
 * The double-click is NOT delivered here — it is handled at the canvas STAGE
 * level (see the module header) because the tiles-layer container does not route
 * pointer events into a tile placeable for a non-active layer / non-GM.
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
  try { placeable.cursor = 'pointer'; } catch (_err) { /* tolerate. */ }
  ensureHitArea(placeable);

  // 3: ensure + activate the interaction manager so hover routes to the wrapped
  // `_onHoverIn` (tooltip) regardless of the active control layer.
  activatePlaceableInteraction(placeable);

  try { placeable[ENABLED_FLAG] = true; } catch (_err) { /* tolerate frozen. */ }
  return true;
}

/**
 * Ensure the placeable has a PIXI `hitArea` covering the tile so a pointer event
 * hit-tests against it even when no child mesh provides hit geometry. Uses the
 * resolved tile width/height and a `PIXI.Rectangle`; no-op when one is already
 * set, when no usable dimensions resolve, or when `PIXI.Rectangle` is absent.
 *
 * @param {object} placeable
 * @returns {void}
 */
function ensureHitArea(placeable) {
  try {
    if (placeable.hitArea) return; // already has hit geometry.
  } catch (_err) { return; }
  const width = Number(placeable?.document?.width ?? placeable?.width ?? 0);
  const height = Number(placeable?.document?.height ?? placeable?.height ?? 0);
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return;
  const RectangleClass = globalThis.PIXI?.Rectangle;
  if (typeof RectangleClass !== 'function') return;
  try {
    placeable.hitArea = new RectangleClass(0, 0, width, height);
  } catch (_err) { /* tolerate. */ }
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
