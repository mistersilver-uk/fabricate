/**
 * Svelte action that makes a container the SELECTION TARGET for one party card,
 * without turning the container itself into a control.
 *
 * Why an action rather than handlers on the element: the World > Parties card is a
 * plain `role="listitem"` holding a text input and several buttons. Written as
 * `<div tabindex="0" onclick onkeydown>` the compiler emits
 * `a11y_no_noninteractive_tabindex` and `a11y_no_static_element_interactions`, and
 * `scripts/check-svelte-warnings.mjs` fails on ANY warning; adding `role="button"`
 * silences both but nests a text input and three buttons inside a button role. A
 * `use:` action carries no template event attribute, so it emits no warning, and
 * capture-phase listeners on the card see every descendant interaction.
 *
 * The action is deliberately UNFILTERED — it fires for any descendant pointer press
 * or focus, which is what buys keyboard reachability with no extra tab stop per card
 * — and deliberately PASSIVE: it never calls `stopPropagation` or `preventDefault`,
 * so pressing an inner control both selects its own card and still runs that
 * control's own handler.
 *
 * It is also IDEMPOTENT, and that is load-bearing rather than cosmetic:
 * `adminStore.selectParty` clears the pane's validation errors unconditionally, so a
 * re-select on every press inside the already-selected card would wipe a live
 * duplicate-member / duplicate-travel-actor message on the GM's next click.
 *
 * @param {HTMLElement} node
 * @param {{ partyId: string, selectedPartyId: string, onSelect: (partyId: string) => void }} options
 * @returns {{ update(next: object): void, destroy(): void }}
 */
export function selectsParty(node, options) {
  let current = options || {};

  function maybeSelect() {
    const partyId = current?.partyId;
    if (!partyId) return;
    if (partyId === current?.selectedPartyId) return;
    if (typeof current?.onSelect === 'function') current.onSelect(partyId);
  }

  node.addEventListener('pointerdown', maybeSelect, true);
  node.addEventListener('focusin', maybeSelect, true);

  return {
    update(next) {
      current = next || {};
    },
    destroy() {
      node.removeEventListener('pointerdown', maybeSelect, true);
      node.removeEventListener('focusin', maybeSelect, true);
    },
  };
}
