import { getDragEventData } from '../util/foundryBridge.js';

/**
 * Svelte action that integrates a DOM element with Foundry VTT's drag-and-drop
 * system.  Attaches dragover/dragleave/drop listeners, toggles a CSS class for
 * visual feedback, extracts Foundry drag data, and invokes an onDrop callback.
 *
 * Usage in a .svelte component:
 *   <div use:dragDrop={{ onDrop: handleDrop }}>Drop items here</div>
 *
 * @param {HTMLElement} node       The element Svelte passes to the action.
 * @param {object}      options
 * @param {Function}    options.onDrop                       Callback invoked with extracted drag data.
 * @param {string}      [options.activeClass='drop-active']  CSS class toggled during dragover.
 * @param {boolean}     [options.disabled=false]             When true, no listeners are attached.
 * @returns {{ update(newOptions: object): void, destroy(): void }}
 */
export function dragDrop(node, options) {
  // Mutable state — update() can change these without re-attaching listeners.
  let dropCallback = options?.onDrop;
  let activeClass = options?.activeClass ?? 'drop-active';
  let disabled = options?.disabled ?? false;

  function handleDragOver(event) {
    event.preventDefault();
    node.classList.add(activeClass);
  }

  function handleDragLeave(event) {
    // Ignore leave events fired when the pointer moves over a child element.
    // relatedTarget is the element the pointer is entering; if it is still
    // inside node we haven't truly left the drop zone.
    if (node.contains(event.relatedTarget)) return;
    node.classList.remove(activeClass);
  }

  function handleDrop(event) {
    event.preventDefault();
    node.classList.remove(activeClass);
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
    node.classList.remove(activeClass);
  }

  if (!disabled) {
    attach();
  }

  return {
    update(newOptions) {
      const newDisabled = newOptions.disabled ?? false;
      const newActiveClass = newOptions.activeClass ?? 'drop-active';

      // Swap callback reference — no listener re-attachment needed.
      dropCallback = newOptions.onDrop;

      // Handle disabled toggle.
      if (newDisabled !== disabled) {
        if (newDisabled) {
          detach();
        } else {
          attach();
        }
        disabled = newDisabled;
      }

      // If activeClass changed while attached, remove the stale class.
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
