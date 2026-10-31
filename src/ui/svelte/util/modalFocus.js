// Where a trapped `Modal` dialog moves focus: its controls, the marked one focus enters on, and
// the element focus returns to after it closes (issues 2661, 2759, 2776).

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(node) {
  return [...node.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest('[inert]'));
}

// The page itself is no opener, nor a place focus stays inside a trapped dialog.
export function isPage(element) {
  const doc = element?.ownerDocument;
  return !element || element === doc?.body || element === doc?.documentElement;
}

export function restoreFocus(opener, host) {
  if (!isPage(opener) && opener.isConnected && !opener.disabled) {
    opener.focus?.();
    return;
  }
  if (!host?.isConnected) return;
  if (!host.hasAttribute('tabindex')) host.tabIndex = -1;
  host.focus?.();
}

// The first of `inside` at or inside an element whose `data-initial-focus` is `initialFocus`, in
// document order; compared as text, so a value is never read as a selector.
export function markedTarget(node, inside, initialFocus) {
  if (!initialFocus) return null;
  for (const marked of node.querySelectorAll('[data-initial-focus]')) {
    // ratchet-exempt(lint): moved unchanged from Modal.svelte, where it read the attribute itself.
    if (marked.getAttribute('data-initial-focus') !== initialFocus) continue;
    const found = inside.find((element) => marked.contains(element));
    if (found) return found;
  }
  return null;
}
