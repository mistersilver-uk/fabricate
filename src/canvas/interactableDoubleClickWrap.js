/**
 * Pure decisions for the V13 Tile double-click + interaction-permission wraps.
 *
 * Fabricate interactables are Foundry TILES (no actor, no sheet). In Foundry V13
 * a double-click on a placeable runs `PlaceableObject#_onClickLeft2` (inherited
 * by the Tile class), and whether a pointer interaction is even DELIVERED is
 * gated by `MouseInteractionManager#can(action, event)`. A non-GM player has no
 * native double-click on a tile, so we must both:
 *
 *  1. PERMIT the interaction for interactable tiles ({@link shouldPermitInteractableAction}),
 *     so a player's `clickLeft2` (and `hoverIn` for the tooltip) reaches the handler.
 *  2. INTERCEPT the double-click ({@link decideInteractableDoubleClick}): for an
 *     interactable tile, dispatch to the Fabricate UI and SUPPRESS the default;
 *     for any other placeable, delegate to the captured original handler.
 *
 * Both DECISIONS are pure and live here, tested with fake Tile-like objects and
 * no live Foundry. The actual install (resolving the V13 Tile class +
 * MouseInteractionManager defensively, capturing methods, binding `this`,
 * suppressing) is the thin Foundry edge in {@link InteractableManager}.
 */

/**
 * Decide what the wrapped `_onClickLeft2` should do for a given tile.
 *
 * @param {object} tileDocument                       The tile's document.
 * @param {(document: object) => boolean} isInteractable Predicate (the shared
 *   `isInteractableTile` flag check).
 * @returns {'dispatch'|'delegate'} `'dispatch'` ⇒ route to the Fabricate
 *   double-click handler and SUPPRESS the V13 default (for BOTH GM and player);
 *   `'delegate'` ⇒ call the captured original V13 handler.
 */
export function decideInteractableDoubleClick(tileDocument, isInteractable) {
  if (typeof isInteractable !== 'function') return 'delegate';
  return isInteractable(tileDocument) === true ? 'dispatch' : 'delegate';
}

/**
 * The interaction actions we permit on an interactable tile for ALL users
 * (including non-GM players): the double-click that opens the Fabricate UI, plus
 * the hover that surfaces the discoverability tooltip.
 */
const PERMITTED_INTERACTABLE_ACTIONS = Object.freeze(['clickLeft2', 'hoverIn', 'hoverOut']);

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
