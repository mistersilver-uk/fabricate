/**
 * Move a node into a different DOM container without changing component state.
 *
 * @param {HTMLElement} node
 * @param {HTMLElement | string | (() => HTMLElement | null) | null} target
 * @returns {{ update(nextTarget: HTMLElement | string | (() => HTMLElement | null) | null): void, destroy(): void }}
 */
export function portal(node, target) {
  if (typeof document === 'undefined') {
    return {
      update() {},
      destroy() {}
    };
  }

  /**
   * @param {HTMLElement | string | (() => HTMLElement | null) | null} value
   * @returns {HTMLElement | null}
   */
  function resolveTarget(value) {
    const resolved = typeof value === 'function' ? value() : value;

    if (!resolved) return null;
    if (typeof resolved === 'string') {
      return document.querySelector(resolved);
    }

    return resolved instanceof HTMLElement ? resolved : null;
  }

  let currentTarget = null;

  function moveTo(nextTarget) {
    if (!nextTarget || nextTarget === currentTarget) return;
    nextTarget.appendChild(node);
    currentTarget = nextTarget;
  }

  moveTo(resolveTarget(target));

  return {
    update(nextTarget) {
      moveTo(resolveTarget(nextTarget));
    },

    destroy() {
      node.remove();
    }
  };
}
