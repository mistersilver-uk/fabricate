// Svelte action making an element a native HTML5 drag SOURCE (`dragDrop.js` is the drop half). The
// caller's `getPayload()` is serialized as JSON onto the `text/plain` DataTransfer entry, which is
// exactly what Foundry's `getDragEventData` reads back before dispatching `dropCanvasData`; a falsy
// payload declines the drag.
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
