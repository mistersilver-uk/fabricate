// A `Popover`'s anchor, named by id (issue 2861). It is looked up from an element of the popover's
// own mount, in that element's root (its document, or the open shadow root it is in), and it counts
// only while that element and the anchor are connected and the anchor has a layout box, so a
// removed, re-rendered or `display: none` anchor is told apart from a present one.
import { heldBy } from '../util/overlayHost.js';

// What can move or replace the anchor while the mount is attached: a node added or removed, or an
// id, class, style or `hidden` written anywhere in the document, as a re-render, a reflow or a
// Foundry window's `setPosition` does. While it is detached only its return is watched.
const WATCHED = Object.freeze({
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['id', 'class', 'style', 'hidden'],
});
const RETURN = Object.freeze({ childList: true, subtree: true });

/** The anchor `id` names from `node`, or `null`; an `id` that is not a non-empty string names none. */
export function resolveAnchor(node, id) {
  if (typeof id !== 'string' || id === '' || !node?.isConnected) return null;
  const root = node.getRootNode?.();
  const scope = typeof root?.getElementById === 'function' ? root : node.ownerDocument;
  // ratchet-exempt(lint): an id is matched as text, never parsed as a selector
  const found = scope.getElementById(id);
  return found?.isConnected && found.getClientRects().length > 0 ? found : null;
}

/**
 * Whether `anchor` lies wholly outside its window's viewport or outside an ancestor that clips its
 * overflow, as when its scroller has scrolled it away; an anchor that draws no box is never judged.
 */
export function anchorClipped(anchor) {
  const box = anchor.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;
  const view = anchor.ownerDocument?.defaultView;
  const outside = (edge) =>
    box.bottom <= edge.top ||
    box.top >= edge.bottom ||
    box.right <= edge.left ||
    box.left >= edge.right;
  if (view && outside({ top: 0, left: 0, bottom: view.innerHeight, right: view.innerWidth })) {
    return true;
  }
  for (let at = anchor.parentElement; at; at = at.parentElement) {
    const style = view?.getComputedStyle?.(at);
    if (!style || (style.overflowX === 'visible' && style.overflowY === 'visible')) continue;
    if (outside(at.getBoundingClientRect())) return true;
  }
  return false;
}

/**
 * Svelte action: while `enabled`, calls `onChange(anchor)` with `resolveAnchor(node, id)` at once,
 * and once per animation frame after delivered mutations of the node's document, which ignore those
 * inside `ignore()`, the panel: `onChange` when the answer changed, `onMoved()` when it did not and
 * names an anchor. Disabled, it calls `onChange(null)` and watches nothing.
 */
export function followAnchor(node, params) {
  let options = params ?? {};
  let current;
  let watch = null;
  let mode = null;
  let frame = 0;
  const view = () => node.ownerDocument?.defaultView ?? null;

  function observe() {
    const Observer = view()?.MutationObserver;
    const usable = options.enabled && typeof Observer === 'function';
    const wanted = usable ? (node.isConnected ? WATCHED : RETURN) : null;
    if (wanted === mode) return;
    watch?.disconnect();
    watch = null;
    mode = wanted;
    if (!wanted) return;
    watch = new Observer(schedule);
    watch.observe(node.ownerDocument, wanted);
  }

  function read() {
    frame = 0;
    const next = options.enabled ? resolveAnchor(node, options.id) : null;
    if (next !== current) {
      current = next;
      options.onChange?.(next);
    } else if (next) options.onMoved?.();
    observe();
  }

  function schedule(records) {
    const panel = options.ignore?.();
    if (frame || records.every((record) => panel && heldBy(panel, record.target))) return;
    frame = view()?.requestAnimationFrame?.(read) ?? 0;
  }

  function cancel() {
    if (frame) view()?.cancelAnimationFrame?.(frame);
    frame = 0;
  }

  read();
  return {
    update(next) {
      options = next ?? {};
      cancel();
      read();
    },
    destroy() {
      cancel();
      watch?.disconnect();
      watch = null;
      mode = null;
    },
  };
}
