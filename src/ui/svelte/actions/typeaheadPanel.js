// A typeahead combobox's suggestion list as a floating surface (issue 2157): portalled to the
// nearest application root and placed directly beneath its field, sharing the field's left edge,
// at least as wide as the field, and flipped above it only where the root has no room below.
// `trigger` is the visual field box. `maxHeightCap` bounds the panel, and `rows` (`pitch`, `gap`,
// `chrome`) floors that bound to whole rows. `onOutsidePress` reports a press on neither the field
// nor the panel, which the caller owns because an open list is its state and not this action's.
import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';

import { anchoredPopover, hostRelativePopoverLayout } from './anchoredPopover.js';

const GAP = 4;
const MIN_WIDTH = 220;

const hostRelative = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

function positive(value) {
  return Math.max(Number(value) || 0, 0);
}

// The panel's own content decides whether it fits below, so a short list stays beneath a field
// that a full one would have to flip away from. Zero where the engine reports no layout.
function neededHeight(node, cap) {
  const natural = positive(node.scrollHeight) + positive(node.offsetHeight - node.clientHeight);
  if (natural > 0 && cap > 0) return Math.min(natural, cap);
  return natural || cap;
}

function layoutFor(node, read) {
  return (triggerRect, panelRect, hostRect, bounds) => {
    const { maxHeightCap, rows } = read();
    const cap = positive(maxHeightCap);
    const chrome = positive(rows?.chrome);
    // One figure as both ends of the band: the layout reads a zero as "use my default".
    const width = Math.max(positive(triggerRect.width), MIN_WIDTH);
    const layout = hostRelative(triggerRect, panelRect, hostRect, bounds, {
      horizontalAlign: 'left',
      gap: GAP,
      minWidth: width,
      maxWidth: width,
      preferredMaxHeight: cap || undefined,
      minUsableHeight: neededHeight(node, cap) || undefined,
      rowPitch: rows?.pitch,
      rowGap: rows?.gap,
      chromeHeight: chrome,
    });
    if (!layout || !Number.isFinite(layout.listMaxHeight)) return layout;
    return { ...layout, maxHeight: layout.listMaxHeight + chrome };
  };
}

export function typeaheadPanel(node, params = {}) {
  let options = params ?? {};

  function anchor() {
    return typeof options.trigger === 'function' ? options.trigger() : options.trigger;
  }

  function popoverParams() {
    return {
      component: options.component,
      trigger: anchor,
      layout: layoutFor(node, () => options),
      maxHeightCap: options.maxHeightCap,
      ignoreScrollWithin: true,
    };
  }

  function onPress(event) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (node.contains(target) || anchor()?.contains?.(target)) return;
    options.onOutsidePress?.(event);
  }

  const popover = anchoredPopover(node, popoverParams());
  const canListen = typeof document !== 'undefined';
  if (canListen) document.addEventListener('mousedown', onPress, { capture: true });

  return {
    update(next) {
      options = next ?? {};
      popover.update(popoverParams());
    },

    destroy() {
      if (canListen) document.removeEventListener('mousedown', onPress, { capture: true });
      popover.destroy();
    },
  };
}
