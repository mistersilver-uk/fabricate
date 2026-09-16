// The manager's own clipping boundaries for a portaled overlay panel (issue 1500). The SELECTORS
// are values rather than component details, so a shared component under `components/` and the
// `anchoredPopover` action carry no app-specific selector; each overlay takes a `bounds` prop, and
// these defaults reproduce the shipped boundary for every caller that passes none.

export const MANAGER_SCROLLER_SELECTOR = '.admin-main, .manager-main, .manager-table-scroll';

// The manager's main column alone, for a control that only ever renders inside it.
export const MANAGER_MAIN_SELECTOR = '.manager-main';

// Adds the World > Parties pane's OWN scroller (issue 1182): that pane scrolls itself rather than
// sitting inside `.manager-table-scroll`, so without it a travel-actor picker is bounded by the
// manager shell and can be laid out past the pane's right edge.
export const PICKER_SCROLLER_SELECTOR =
  '.admin-main, .manager-main, .manager-table-scroll, .manager-travel-parties-content, .manager-travel-parties';

/** The inset a clipped panel keeps from its boundary, matching `anchoredPopover`'s own. */
const INSET = 16;

// Walks up to the first USABLE matching ancestor, SKIPPING one that is zero-sized or
// `display: contents` — not a box a panel can be clipped against — and falling back to the host's
// own inset edges rather than to nothing.
export function ancestorScrollerBounds(selector) {
  return (hostRect, anchor) => {
    let candidate = anchor?.parentElement ?? null;
    while (candidate) {
      if (candidate.matches?.(selector)) {
        const rect = candidate.getBoundingClientRect?.();
        const display = globalThis.getComputedStyle?.(candidate)?.display;
        if (rect && rect.width > 0 && rect.height > 0 && display !== 'contents') {
          return {
            minLeft: rect.left - hostRect.left + INSET,
            maxRight: rect.right - hostRect.left - INSET,
          };
        }
      }
      candidate = candidate.parentElement;
    }

    return {
      minLeft: INSET,
      maxRight: Math.max(INSET, hostRect.width - INSET),
    };
  };
}

export const pickerScrollerBounds = ancestorScrollerBounds(PICKER_SCROLLER_SELECTOR);
