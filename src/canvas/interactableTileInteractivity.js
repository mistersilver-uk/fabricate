/**
 * Make interactable Tile placeables pointer-eventful for ALL users AND deliver a
 * double-click to the Fabricate UI via a raw PIXI pointer listener.
 *
 * A Foundry Tile is GM scenery: for a non-GM player the placeable is not in the
 * active control layer, so the `MouseInteractionManager` click-sequence state
 * machine never runs `_onClickLeft2` for it — even though `_onHoverIn` DOES fire
 * (live V13 testing confirmed hover works but double-click never reached the
 * wrapped `_onClickLeft2`). Wrapping `_onClickLeft2` is therefore the wrong
 * mechanism. Instead we attach a RAW PIXI pointer listener to the placeable
 * (hover proves the placeable receives pointer events) and implement our own
 * double-click detection, then call `InteractableManager.instance._onDoubleClick`
 * directly.
 *
 * The pure decision — "is this placeable an interactable tile we should enable?"
 * — is {@link isInteractableTile} from `interactableTileFlags.js`; the
 * double-click TIMING decision is the pure {@link registerPointerEvent}. The
 * PIXI/Foundry mutations (PIXI v7 `eventMode = 'static'` / legacy
 * `interactive = true`, `interactiveChildren`, `cursor`, a `hitArea`, and the
 * `.on('pointerdown', …)` wiring) are the thin edge in
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
import { InteractableManager } from './InteractableManager.js';

/** Marker so the per-placeable enablement runs its mutations at most once. */
const ENABLED_FLAG = '_fabricateInteractableEnabled';

/** Marker so the raw PIXI pointer listener is bound at most once per placeable. */
const POINTER_BOUND_FLAG = '_fabricatePointerBound';

/** Property under which the bound pointer handler is stashed (for detach). */
const POINTER_HANDLER_KEY = '_fabricatePointerHandler';

/** Property under which the per-placeable double-click detector state lives. */
const POINTER_STATE_KEY = '_fabricatePointerState';

/** PIXI pointer event we listen for to drive our own double-click detection. */
const POINTER_EVENT = 'pointerdown';

/** Max gap (ms) between two pointer events to count as a double-click. */
const DOUBLE_CLICK_WINDOW_MS = 400;

/** Max squared distance (px²) between two pointer events for a double-click. */
const DOUBLE_CLICK_DISTANCE_PX = 5;
const DOUBLE_CLICK_DISTANCE_SQ = DOUBLE_CLICK_DISTANCE_PX * DOUBLE_CLICK_DISTANCE_PX;

/**
 * Pure double-click detector. Records the incoming pointer event into the mutable
 * `state` and reports whether it completes a double-click. A second event lands
 * as a `'double'` only when it falls WITHIN {@link DOUBLE_CLICK_WINDOW_MS} of, and
 * WITHIN {@link DOUBLE_CLICK_DISTANCE_PX} of, the previous recorded event; any
 * event that does not (the first event, one after the window, or one too far
 * away) is a `'single'`. After reporting `'double'` the state is reset so a
 * subsequent event starts a fresh sequence (no triple-counting).
 *
 * @param {{ time?: number, x?: number, y?: number }} state  Mutable per-placeable
 *   carrier of the last recorded event (initialise as `{}`).
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
 *  4. Attach a RAW PIXI pointer listener (`pointerdown`) that runs our own
 *     double-click detection ({@link registerPointerEvent}) and, on a double,
 *     calls `InteractableManager.instance._onDoubleClick(document)` directly —
 *     bypassing the click-sequence state machine that never runs `_onClickLeft2`
 *     for a non-controllable tile placeable. Bound idempotently and detachable.
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

  // 4: attach our raw double-click pointer listener (the actual double-click
  // delivery mechanism — see the module header).
  attachDoubleClickPointerListener(placeable);

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
 * Attach a raw PIXI `pointerdown` listener to the placeable that performs our own
 * double-click detection and, on a `'double'`, dispatches to
 * `InteractableManager.instance._onDoubleClick(document)`. Idempotent (guarded by
 * {@link POINTER_BOUND_FLAG}) and no-throw when `.on` is absent. The bound handler
 * and the per-placeable detector state are stashed so {@link detachDoubleClickPointerListener}
 * can remove them on tile destroy.
 *
 * @param {object} placeable
 * @returns {void}
 */
function attachDoubleClickPointerListener(placeable) {
  if (placeable[POINTER_BOUND_FLAG] === true) return;
  if (typeof placeable.on !== 'function') return; // not a PIXI event emitter — tolerate.

  const state = {};
  const handler = (event) => {
    const point = resolveEventPoint(event);
    const decision = registerPointerEvent(state, {
      time: resolveEventTime(event),
      x: point.x,
      y: point.y
    });
    if (decision !== 'double') return;
    try {
      InteractableManager.instance?._onDoubleClick?.(placeable.document);
    } catch (_err) { /* tolerate a dispatch failure; never break canvas input. */ }
  };

  try {
    placeable.on(POINTER_EVENT, handler);
  } catch (_err) { return; } // tolerate an exotic emitter.

  try { placeable[POINTER_STATE_KEY] = state; } catch (_err) { /* tolerate frozen. */ }
  try { placeable[POINTER_HANDLER_KEY] = handler; } catch (_err) { /* tolerate frozen. */ }
  try { placeable[POINTER_BOUND_FLAG] = true; } catch (_err) { /* tolerate frozen. */ }
}

/**
 * Detach the raw double-click pointer listener bound by
 * {@link attachDoubleClickPointerListener}. Idempotent + no-throw; safe to call
 * on `destroyTile` / the placeable's teardown.
 *
 * @param {object} placeable
 * @returns {void}
 */
export function detachDoubleClickPointerListener(placeable) {
  if (!placeable) return;
  const handler = placeable[POINTER_HANDLER_KEY];
  if (handler && typeof placeable.off === 'function') {
    try { placeable.off(POINTER_EVENT, handler); } catch (_err) { /* tolerate. */ }
  }
  try { delete placeable[POINTER_HANDLER_KEY]; } catch (_err) { /* tolerate. */ }
  try { delete placeable[POINTER_STATE_KEY]; } catch (_err) { /* tolerate. */ }
  try { delete placeable[POINTER_BOUND_FLAG]; } catch (_err) { /* tolerate. */ }
}

/**
 * Resolve a `{ x, y }` point from a PIXI federated pointer event, preferring the
 * stage-global coordinates (stable across the scroll/zoom transform) and falling
 * back to the raw client coordinates, then the origin.
 *
 * @param {object} event
 * @returns {{ x: number, y: number }}
 */
function resolveEventPoint(event) {
  const global = event?.global ?? event?.data?.global;
  const x = Number(global?.x ?? event?.clientX ?? event?.x ?? 0);
  const y = Number(global?.y ?? event?.clientY ?? event?.y ?? 0);
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

/**
 * Resolve an event timestamp (ms). Prefers the event's own `timeStamp`, falling
 * back to `performance.now()` / `Date.now()` so detection works regardless of
 * the federated-event shape.
 *
 * @param {object} event
 * @returns {number}
 */
function resolveEventTime(event) {
  const stamp = Number(event?.timeStamp);
  if (Number.isFinite(stamp) && stamp > 0) return stamp;
  const perfNow = globalThis.performance?.now?.();
  if (Number.isFinite(perfNow)) return perfNow;
  return Date.now();
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
