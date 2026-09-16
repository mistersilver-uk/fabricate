import { getDragEventData } from '../util/foundryBridge.js';

// Svelte action wiring an element into Foundry's drag-and-drop: dragover/dragleave/drop listeners,
// an active CSS class, and `onDrop` with the extracted drag data. `onActiveChange` exists because
// the class alone serves a CSS-only hover state, while a zone that swaps its ICON or COPY (the
// component editor's identity strip, issue 676) needs the state in the component — and re-listening
// for dragover beside this action would be a second, drifting copy of the same bookkeeping.
export function dragDrop(node, options) {
  // Mutable so `update()` can change them without re-attaching listeners.
  let dropCallback = options?.onDrop;
  let activeClass = options?.activeClass ?? 'drop-active';
  let disabled = options?.disabled ?? false;
  let activeChangeCallback = options?.onActiveChange;

  // `add`/`remove`, not `classList.toggle(cls, force)`: this action's DOM surface is deliberately
  // narrow, and widening it broke every caller that hands it a minimal element stub.
  function setActive(active) {
    if (active) node.classList.add(activeClass);
    else node.classList.remove(activeClass);
    if (typeof activeChangeCallback === 'function') activeChangeCallback(active);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setActive(true);
  }

  function handleDragLeave(event) {
    // `relatedTarget` is the element being ENTERED: still inside `node` means we never left.
    if (node.contains(event.relatedTarget)) return;
    setActive(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setActive(false);
    const data = getDragEventData(event);
    if (data !== null && data !== undefined && typeof dropCallback === 'function') {
      dropCallback(data);
    }
  }

  function attach() {
    node.addEventListener('dragover', handleDragOver);
    node.addEventListener('dragleave', handleDragLeave);
    node.addEventListener('drop', handleDrop);
  }

  function detach() {
    node.removeEventListener('dragover', handleDragOver);
    node.removeEventListener('dragleave', handleDragLeave);
    node.removeEventListener('drop', handleDrop);
    setActive(false);
  }

  if (!disabled) {
    attach();
  }

  return {
    update(newOptions) {
      const newDisabled = newOptions.disabled ?? false;
      const newActiveClass = newOptions.activeClass ?? 'drop-active';

      dropCallback = newOptions.onDrop;
      activeChangeCallback = newOptions.onActiveChange;

      if (newDisabled !== disabled) {
        if (newDisabled) {
          detach();
        } else {
          attach();
        }
        disabled = newDisabled;
      }

      if (newActiveClass !== activeClass) {
        node.classList.remove(activeClass);
        activeClass = newActiveClass;
      }
    },

    destroy() {
      detach();
    }
  };
}
