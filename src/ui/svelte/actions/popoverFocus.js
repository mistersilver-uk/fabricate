// The focus and key model of a `Popover` panel (issue 2861): focus enters it when it is drawn, Tab
// and Shift+Tab wrap inside it, Tab on the anchor enters it, Escape in it or on the anchor closes it
// unless an expanded control there keeps its own, and focus that was inside it as it closed returns
// to the anchor.
import { heldBy } from '../util/overlayHost.js';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Where an event started: the first entry of its composed path, so an open shadow root counts. */
export const originOf = (event) => event.composedPath?.()[0] ?? event.target;

/** The focusable elements `node` holds, in tree order, outside every `[inert]` subtree. */
export function focusablesIn(node) {
  return [...node.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest('[inert]'));
}

/** The panel's body, the scrolling column that is focus's fallback. */
const bodyOf = (node) => node.querySelector(':scope > .fabricate-popover-body');

/** Where focus enters: the first control, else the body, so the keyboard can scroll it, else the panel. */
const entryOf = (node) => focusablesIn(node)[0] ?? bodyOf(node) ?? node;

function isPage(element) {
  const doc = element?.ownerDocument;
  return !element || element === doc?.body || element === doc?.documentElement;
}

// Whether `origin` sits in an `aria-expanded="true"` control `container` holds, looking through open
// shadow roots to their hosts; an expanded ancestor of the container never counts.
function expandedIn(container, origin) {
  for (let at = origin; at?.closest; at = at.getRootNode?.().host) {
    const control = at.closest('[aria-expanded="true"]');
    if (control) return heldBy(container, control);
  }
  return false;
}

/**
 * Svelte action: a microtask after the panel is drawn, focus moves to `entryOf` it, unless it is
 * already inside or `mayEnter(onPage)` refuses, `onPage` counting an element no longer connected.
 * On destroy, when focus was inside as it closed, `anchor()` is focused a frame later if it is connected and focus is
 * then on the page. Focus leaves on a move to a node outside, or a press outside that `holds` does
 * not count as inside, heard on the window's capture phase before a document listener can close
 * the panel; a focusout to no node, as the removal of a focused element can report, is no move.
 */
export function popoverFocus(node, params) {
  let options = params ?? {};
  let inside = false;
  const doc = node.ownerDocument;
  const view = doc?.defaultView;
  const enter = () => {
    inside = true;
  };
  const leave = (event) => {
    const next = event.relatedTarget ?? event.target;
    if (typeof next?.nodeType !== 'number' || heldBy(node, next)) return;
    if (event.type === 'mousedown' && options.holds?.(next)) return;
    inside = false;
  };
  node.addEventListener('focusin', enter);
  node.addEventListener('focusout', leave);
  view?.addEventListener?.('mousedown', leave, true);
  queueMicrotask(() => {
    if (!node.isConnected || heldBy(node, doc.activeElement)) return;
    const active = doc.activeElement;
    if (options.mayEnter && !options.mayEnter(isPage(active) || !active.isConnected)) return;
    entryOf(node).focus?.();
  });
  return {
    update(next) {
      options = next ?? {};
    },
    destroy() {
      node.removeEventListener('focusin', enter);
      node.removeEventListener('focusout', leave);
      view?.removeEventListener?.('mousedown', leave, true);
      if (!inside) return;
      const { anchor } = options;
      view?.requestAnimationFrame?.(() => {
        const target = anchor?.();
        if (isPage(doc.activeElement) && target?.isConnected) target.focus?.();
      });
    },
  };
}

// From the panel or its body Tab enters at either end; from an end it wraps to the other.
function wrapTab(event, node) {
  const inside = focusablesIn(node);
  if (inside.length === 0) {
    event.preventDefault();
    return;
  }
  const active = node.ownerDocument.activeElement;
  const [first, last] = [inside[0], inside.at(-1)];
  const atEdge = event.shiftKey ? active === first : active === last;
  if (active !== node && active !== bodyOf(node) && !atEdge) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

/**
 * Svelte action, judged on the window's capture phase, before any control can stop the key or
 * collapse itself: Escape in the panel or on `anchor()` calls `onEscape()`, prevented and stopped
 * there, unless it went down in an expanded control inside; Tab on the anchor moves focus into the
 * panel. Tab inside wraps, on the panel's own listener. Never for a composing key.
 */
export function popoverKeys(node, params) {
  let options = params ?? {};
  const view = node.ownerDocument?.defaultView;
  const onWindowKeydown = (event) => {
    if (event.isComposing || event.defaultPrevented) return;
    const origin = originOf(event);
    const onAnchor = heldBy(options.anchor?.(), origin);
    if (event.key === 'Tab' && !event.shiftKey && onAnchor) {
      event.preventDefault();
      entryOf(node).focus?.();
      return;
    }
    if (event.key !== 'Escape' || (!onAnchor && !heldBy(node, origin))) return;
    if (expandedIn(node, origin)) return;
    event.preventDefault();
    event.stopPropagation();
    options.onEscape?.();
  };
  const onKeydown = (event) => {
    if (event.key === 'Tab' && !event.isComposing && !event.defaultPrevented) wrapTab(event, node);
  };
  view?.addEventListener?.('keydown', onWindowKeydown, true);
  node.addEventListener('keydown', onKeydown);
  return {
    update(next) {
      options = next ?? {};
    },
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      view?.removeEventListener?.('keydown', onWindowKeydown, true);
    },
  };
}
