/**
 * Move a node into a different DOM container without changing component state.
 *
 * A FUNCTION TARGET RECEIVES THE PORTALED NODE. That is what lets a caller resolve its host by
 * walking UP from itself — `resolveOverlayHost(node)` — rather than by querying the document for
 * an application root by name. The difference is not stylistic: a document-wide
 * `querySelector('.fabricate-manager')` finds the manager wherever it is, so a dialog opened in
 * the player window would portal itself into a DIFFERENT WINDOW (issue 1466). Resolving from the
 * node can only ever find an ancestor of the thing being moved.
 *
 * The argument is safely ignorable, so targets that do not need it are unaffected.
 *
 * A SELECTOR STRING IS NOT A TARGET. The string branch was a document-wide `querySelector`,
 * which is the cross-window defect above rather than a convenience, and issue 1500 deleted it —
 * so an element, a resolver, or nothing.
 *
 * @param {HTMLElement} node
 * @param {HTMLElement | ((node: HTMLElement) => HTMLElement | null) | null} target
 * @returns {{ update(nextTarget: HTMLElement | ((node: HTMLElement) => HTMLElement | null) | null): void, destroy(): void }}
 */
export function portal(node, target) {
  if (typeof document === 'undefined') {
    return {
      update() {},
      destroy() {}
    };
  }

  /**
   * @param {HTMLElement | ((node: HTMLElement) => HTMLElement | null) | null} value
   * @returns {HTMLElement | null}
   */
  function resolveTarget(value) {
    const resolved = typeof value === 'function' ? value(node) : value;

    if (!resolved) return null;

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
