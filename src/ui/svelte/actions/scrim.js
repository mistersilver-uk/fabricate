// The actions a `Modal` dialog's scrim takes (issue 2859), and what counts as inside a dialog.
import { heldBy, overlaysOpenedFrom } from '../util/overlayHost.js';

const SCRIM = '[data-manager-modal-scrim]';

/** Every panel opened from inside `container`, wherever it is portaled, and the scrim just before one. */
export function openedInside(container) {
  return overlaysOpenedFrom(container).flatMap((panel) => {
    const before = panel.previousElementSibling;
    return before?.matches?.(SCRIM) ? [panel, before] : [panel];
  });
}

/** True when `origin` is in a node `openedInside(container)` holds. */
export const inPanelOpenedFrom = (container, origin) =>
  openedInside(container).some((node) => heldBy(node, origin));

// Places `node` just before `next` when the action runs and whenever `next` changes; it does not
// follow a later move of `next`.
export function precede(node, next) {
  const place = (target) => {
    if (target?.parentNode && node.nextSibling !== target) target.before(node);
  };
  place(next);
  return { update: place, destroy: () => node.remove() };
}

// Cancels a wheel or a touch drag over `node`, so the host under it does not scroll; registered
// non-passive, which Svelte's own `onwheel` and `ontouchmove` handlers are not.
export function holdScroll(node) {
  const hold = (event) => event.preventDefault();
  for (const type of ['wheel', 'touchmove']) {
    node.addEventListener(type, hold, { passive: false });
  }
  return {
    destroy() {
      for (const type of ['wheel', 'touchmove']) node.removeEventListener(type, hold);
    },
  };
}
