/**
 * One armed focus request, settled once the caller hands back the edit that asked for it. A miss
 * disarms it unless `keepUntilHeld`, so a refused write never moves focus. The focus runs as a task,
 * so it lands after a menu hands focus back to its trigger. The caller's `$effect` reads its own
 * tracked state before calling `settle`, because an unarmed `settle` reads nothing.
 */
export function createPendingFocus({ keepUntilHeld = false } = {}) {
  let pending = null;
  return {
    arm(request) {
      pending = request;
    },
    settle(holds, focus) {
      if (pending == null) return;
      const request = pending;
      if (!holds(request)) {
        if (!keepUntilHeld) pending = null;
        return;
      }
      pending = null;
      setTimeout(() => focus(request), 0);
    },
  };
}
