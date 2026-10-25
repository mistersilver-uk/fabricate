/**
 * Svelte action that calls a callback when a mousedown occurs outside the
 * bound node, or when Escape is pressed while the action is enabled. Both are
 * heard on the node's own document, and a node is told by `nodeType` (issue 2454).
 * While enabled, `onDetached` is called once when the node leaves that document, read when a
 * mutation is delivered, so a removal and re-insertion in one run of script calls nothing; a node
 * attached while disconnected is not watched, nor is a document the node moves to (issue 2671).
 *
 * @param {HTMLElement} node
 * @param {{
 *   enabled?: boolean,
 *   onDismiss?: Function,
 *   onDetached?: Function,
 *   additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 * }} [options]
 * @returns {{
 *   update(newOptions?: {
 *     enabled?: boolean,
 *     onDismiss?: Function,
 *     onDetached?: Function,
 *     additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 *   }): void,
 *   destroy(): void
 * }}
 */
export function dismissOnOutsideClick(node, options = {}) {
  let enabled = options.enabled !== false;
  let onDismiss = options.onDismiss;
  let onDetached = options.onDetached;
  let additionalNodes = options.additionalNodes;
  // The document the pair is bound to, so it is removed from that one.
  let bound = null;
  let watch = null;

  function getAdditionalNodes() {
    const resolved = typeof additionalNodes === 'function' ? additionalNodes() : additionalNodes;
    if (!resolved) return [];
    return Array.isArray(resolved) ? resolved : [resolved];
  }

  function dismiss(event) {
    if (typeof onDismiss === 'function') {
      onDismiss(event);
    }
  }

  function handleMouseDown(event) {
    const { target } = event;
    if (typeof target?.nodeType !== 'number') return;
    if (node.contains(target)) return;
    if (getAdditionalNodes().some((extraNode) => typeof extraNode?.nodeType === 'number' && extraNode.contains(target))) return;
    dismiss(event);
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
    doc.addEventListener('mousedown', handleMouseDown, true);
    doc.addEventListener('keydown', handleKeyDown, true);
    bound = doc;
  }

  function detach() {
    unwatch();
    if (!bound) return;
    bound.removeEventListener('mousedown', handleMouseDown, true);
    bound.removeEventListener('keydown', handleKeyDown, true);
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
