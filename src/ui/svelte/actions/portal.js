// Move a node into a different DOM container without changing component state. A FUNCTION target
// receives the portaled node, so a caller resolves its host by walking UP from itself; a
// document-wide `querySelector('.fabricate-manager')` finds the manager wherever it is, so a dialog
// opened in the player window would portal into a DIFFERENT WINDOW (issue 1466). A selector string
// is therefore not a target at all (issue 1500): an element, a resolver, or nothing.
export function portal(node, target) {
  if (typeof document === 'undefined') {
    return {
      update() {},
      destroy() {}
    };
  }

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
