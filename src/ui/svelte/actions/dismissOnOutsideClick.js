/**
 * Svelte action that calls a callback when a mousedown occurs outside the
 * bound node, or when Escape is pressed while the action is enabled.
 *
 * @param {HTMLElement} node
 * @param {{
 *   enabled?: boolean,
 *   onDismiss?: Function,
 *   additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 * }} [options]
 * @returns {{
 *   update(newOptions?: {
 *     enabled?: boolean,
 *     onDismiss?: Function,
 *     additionalNodes?: HTMLElement | null | Array<HTMLElement | null> | (() => HTMLElement | null | Array<HTMLElement | null>)
 *   }): void,
 *   destroy(): void
 * }}
 */
export function dismissOnOutsideClick(node, options = {}) {
  const canListen = typeof document !== 'undefined' && document?.addEventListener;

  let enabled = options.enabled !== false;
  let onDismiss = options.onDismiss;
  let additionalNodes = options.additionalNodes;
  let attached = false;

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
    if (!(event.target instanceof Node)) return;
    if (node.contains(event.target)) return;
    if (getAdditionalNodes().some((extraNode) => extraNode instanceof Node && extraNode.contains(event.target))) return;
    dismiss(event);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      dismiss(event);
    }
  }

  function attach() {
    if (!canListen || attached) return;
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    attached = true;
  }

  function detach() {
    if (!canListen || !attached) return;
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    attached = false;
  }

  if (enabled) {
    attach();
  }

  return {
    update(newOptions = {}) {
      onDismiss = newOptions.onDismiss;
      additionalNodes = newOptions.additionalNodes;
      const nextEnabled = newOptions.enabled !== false;
      if (nextEnabled !== enabled) {
        enabled = nextEnabled;
        if (enabled) attach();
        else detach();
      }
    },

    destroy() {
      detach();
    }
  };
}
