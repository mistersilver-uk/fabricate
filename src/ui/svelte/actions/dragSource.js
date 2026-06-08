/**
 * Svelte action: make an element a native HTML5 drag SOURCE that writes a
 * Foundry-compatible drag payload onto the DataTransfer.
 *
 * The existing `dragDrop.js` action is the DROP half only (no drag source), so
 * this is net-new (Phase 7). It is intentionally generic: the caller supplies a
 * `getPayload()` returning the object to serialize. The payload is written to
 * the `text/plain` DataTransfer entry as JSON, which is exactly what Foundry's
 * canvas drop pipeline (`getDragEventData`) reads back before dispatching
 * `dropCanvasData`.
 *
 * Usage in a .svelte component:
 *   <div use:dragSource={{ getPayload: () => buildPayload(row) }}>…</div>
 *
 * @param {HTMLElement} node
 * @param {object} options
 * @param {() => (object|null)} options.getPayload  Returns the drag payload, or
 *   null/empty to decline the drag.
 * @param {string} [options.activeClass='fab-dragging']  Class toggled while dragging.
 * @returns {{ update(o: object): void, destroy(): void }}
 */
export function dragSource(node, options) {
  let getPayload = options?.getPayload;
  let activeClass = options?.activeClass ?? 'fab-dragging';

  function handleDragStart(event) {
    const payload = typeof getPayload === 'function' ? getPayload() : null;
    if (!payload) {
      // Nothing to drag — cancel so we do not start an empty drag.
      event.preventDefault?.();
      return;
    }
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!json) {
      event.preventDefault?.();
      return;
    }
    event.dataTransfer?.setData?.('text/plain', json);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    node.classList.add(activeClass);
  }

  function handleDragEnd() {
    node.classList.remove(activeClass);
  }

  node.setAttribute('draggable', 'true');
  node.addEventListener('dragstart', handleDragStart);
  node.addEventListener('dragend', handleDragEnd);

  return {
    update(newOptions) {
      getPayload = newOptions?.getPayload;
      const newActiveClass = newOptions?.activeClass ?? 'fab-dragging';
      if (newActiveClass !== activeClass) {
        node.classList.remove(activeClass);
        activeClass = newActiveClass;
      }
    },
    destroy() {
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('dragend', handleDragEnd);
      node.classList.remove(activeClass);
    }
  };
}
