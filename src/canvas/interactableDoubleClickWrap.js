/**
 * Pure decision for the V13 interaction-permission wrap on canvas interactable
 * TILES.
 *
 * Fabricate interactables are Foundry TILES (no actor, no sheet). In Foundry V13
 * whether a pointer interaction is DELIVERED is gated by
 * `MouseInteractionManager#can(action, event)`. A Tile is GM scenery and is not
 * natively pointer-interactive for a non-GM player, so we PERMIT the hover
 * interaction for interactable tiles ({@link shouldPermitInteractableAction}) so a
 * player's `hoverIn`/`hoverOut` reaches the handler and the discoverability
 * tooltip shows.
 *
 * The double-click itself is NOT routed through this permission gate or an
 * `_onClickLeft2` wrap — for a non-controllable tile placeable the
 * MouseInteractionManager click-sequence never runs `_onClickLeft2`. The
 * double-click is delivered by a raw PIXI pointer listener with our own
 * double-click detection (see `interactableTileInteractivity.js`).
 *
 * The DECISION is pure and lives here, tested with fake Tile-like objects and no
 * live Foundry. The actual install (resolving the V13 MouseInteractionManager
 * defensively, capturing the method, delegating) is the thin Foundry edge in
 * {@link InteractableManager}.
 */

/**
 * The interaction actions we permit on an interactable tile for ALL users
 * (including non-GM players): the hover that surfaces the discoverability
 * tooltip. (The double-click is delivered by the raw PIXI pointer listener, not
 * through this gate.)
 */
const PERMITTED_INTERACTABLE_ACTIONS = Object.freeze(['hoverIn', 'hoverOut']);

/**
 * Decide whether to PERMIT a pointer interaction `action` on a placeable. Returns
 * `true` ONLY when the action is one we explicitly allow for an interactable tile
 * (so a non-GM's double-click / hover is delivered); returns `null` otherwise so
 * the caller DELEGATES to the original permission gate (the default Foundry
 * decision for every non-interactable placeable and every other action).
 *
 * `null` (delegate) is deliberately distinct from `false` — we never want to
 * DENY an action here; we only ADD permission for the interactable cases.
 *
 * @param {string} action                              The interaction action name.
 * @param {object} placeableDocument                   The placeable's document.
 * @param {(document: object) => boolean} isInteractable Predicate (`isInteractableTile`).
 * @returns {true|null} `true` ⇒ permit; `null` ⇒ delegate to the original gate.
 */
export function shouldPermitInteractableAction(action, placeableDocument, isInteractable) {
  if (typeof isInteractable !== 'function') return null;
  if (!PERMITTED_INTERACTABLE_ACTIONS.includes(action)) return null;
  return isInteractable(placeableDocument) === true ? true : null;
}
