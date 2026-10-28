// Whether `target` is a node inside `node` or `extras`, a node, an array or a resolver of either,
// every node told by `nodeType`.
function holds([node, extras], target) {
  if (typeof target?.nodeType !== 'number') return false;
  const resolved = typeof extras === 'function' ? extras() : extras;
  return [node, ...[resolved ?? []].flat()].some(
    (each) => typeof each?.nodeType === 'number' && each.contains(target)
  );
}

/**
 * Svelte action that calls a callback when a mousedown occurs outside the
 * bound node, or when Escape is pressed while the action is enabled. Both are
 * heard on the node's own document, and a node is told by `nodeType` (issue 2454).
 * While enabled, `onDetached` is called once when the node leaves that document, read when a
 * mutation is delivered, so a removal and re-insertion in one run of script calls nothing; a node
 * attached while disconnected is not watched, nor is a document the node moves to (issue 2671).
 * A node inside a shadow root is reported when that root's host leaves the document, and not when
 * the removal happens inside the root; a later mutation elsewhere in the document reports it.
 * `onFocusLeave` is called for a focusout from inside to a node outside, never for a `null` one.
 *
 * @param {HTMLElement} node
 * @param {{
 *   enabled?: boolean,
 *   onDismiss?: Function,
 *   onDetached?: Function,
 *   onFocusLeave?: Function,
 *   additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 * }} [options]
 * @returns {{
 *   update(newOptions?: {
 *     enabled?: boolean,
 *     onDismiss?: Function,
 *     onDetached?: Function,
 *     onFocusLeave?: Function,
 *     additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 *   }): void,
 *   destroy(): void
 * }}
 */
export function dismissOnOutsideClick(node, options = {}) {
  let enabled = options.enabled !== false;
  let onDismiss = options.onDismiss;
  let onDetached = options.onDetached;
  let onFocusLeave = options.onFocusLeave;
  let additionalNodes = options.additionalNodes;
  // The document the pair is bound to, so it is removed from that one.
  let bound = null;
  let watch = null;

  function dismiss(event) {
    if (typeof onDismiss === 'function') onDismiss(event);
  }

  function handleMouseDown(event) {
    const { target } = event;
    if (typeof target?.nodeType !== 'number') return;
    if (holds([node, additionalNodes], target)) return;
    dismiss(event);
  }

  function handleFocusOut(event) {
    const inside = [node, additionalNodes];
    if (typeof onFocusLeave !== 'function' || !holds(inside, event.target)) return;
    const next = event.relatedTarget;
    if (typeof next?.nodeType === 'number' && !holds(inside, next)) onFocusLeave(event);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      dismiss(event);
    }
  }

  function unwatch() {
    watch?.disconnect();
    watch = null;
  }

  function onMutation() {
    if (node.isConnected) return;
    unwatch();
    if (typeof onDetached === 'function') onDetached();
  }

  function syncWatch() {
    if (!bound || typeof onDetached !== 'function') {
      unwatch();
      return;
    }
    const Observer = bound.defaultView?.MutationObserver;
    if (watch || !node.isConnected || typeof Observer !== 'function') return;
    watch = new Observer(onMutation);
    watch.observe(bound, { childList: true, subtree: true });
  }

  function attach() {
    const doc = node?.ownerDocument;
    if (bound || typeof doc?.addEventListener !== 'function') return;
    doc.addEventListener('mousedown', handleMouseDown, { capture: true });
    doc.addEventListener('keydown', handleKeyDown, { capture: true });
    doc.addEventListener('focusout', handleFocusOut, { capture: true });
    bound = doc;
  }

  function detach() {
    unwatch();
    if (!bound) return;
    bound.removeEventListener('mousedown', handleMouseDown, { capture: true });
    bound.removeEventListener('keydown', handleKeyDown, { capture: true });
    bound.removeEventListener('focusout', handleFocusOut, { capture: true });
    bound = null;
  }

  if (enabled) {
    attach();
    syncWatch();
  }

  return {
    update(newOptions = {}) {
      onDismiss = newOptions.onDismiss;
      onDetached = newOptions.onDetached;
      onFocusLeave = newOptions.onFocusLeave;
      additionalNodes = newOptions.additionalNodes;
      const nextEnabled = newOptions.enabled !== false;
      if (nextEnabled !== enabled) {
        enabled = nextEnabled;
        if (enabled) attach();
        else detach();
      }
      syncWatch();
    },

    destroy() {
      detach();
    }
  };
}
