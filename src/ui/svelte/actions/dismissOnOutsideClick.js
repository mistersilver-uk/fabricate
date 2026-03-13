/**
 * Svelte action that calls a callback when a mousedown occurs outside the
 * bound node, or when Escape is pressed while the action is enabled.
 *
 * @param {HTMLElement} node
 * @param {{ enabled?: boolean, onDismiss?: Function }} [options]
 * @returns {{ update(newOptions?: { enabled?: boolean, onDismiss?: Function }): void, destroy(): void }}
 */
export function dismissOnOutsideClick(node, options = {}) {
  const canListen = typeof document !== 'undefined' && document?.addEventListener;

  let enabled = options.enabled !== false;
  let onDismiss = options.onDismiss;
  let attached = false;

  function dismiss(event) {
    if (typeof onDismiss === 'function') {
      onDismiss(event);
    }
  }

  function handleMouseDown(event) {
    if (!(event.target instanceof Node)) return;
    if (node.contains(event.target)) return;
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
