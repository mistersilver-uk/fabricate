/**
 * Pure decision for the V13 Token `_onClickLeft2` (double-click) wrap.
 *
 * In Foundry V13 a double-click on a Token runs `Token#_onClickLeft2`, which
 * opens the token's actor sheet (for a GM) or no-ops (for a player). A Fabricate
 * interactable token is backed by a shared "Fabricate Interactable" actor, so the
 * default behaviour leaks that actor's sheet to GMs and does nothing for players.
 *
 * We wrap the V13 Token double-click handler once (installed at register()), and
 * this pure function decides what the wrapper should do for a given token. The
 * actual install (capturing the V13 class method, binding `this`, suppressing the
 * default) is the thin Foundry edge in {@link InteractableManager}; the DECISION
 * — interactable ⇒ dispatch + suppress, otherwise ⇒ delegate — is tested here
 * with a fake Token-like object and no live Foundry.
 *
 * @param {object} tokenDocument                       The token's document.
 * @param {(document: object) => boolean} isInteractable Predicate (the shared
 *   `isInteractableToken` flag check).
 * @returns {'dispatch'|'delegate'} `'dispatch'` ⇒ route to the Fabricate
 *   double-click handler and SUPPRESS the V13 default (for BOTH GM and player);
 *   `'delegate'` ⇒ call the captured original V13 handler.
 */
export function decideInteractableDoubleClick(tokenDocument, isInteractable) {
  if (typeof isInteractable !== 'function') return 'delegate';
  return isInteractable(tokenDocument) === true ? 'dispatch' : 'delegate';
}
