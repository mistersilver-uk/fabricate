/**
 * The manager's own clipping boundaries for a portaled overlay panel (issue 1500).
 *
 * ── WHY THESE SELECTORS ARE NOT IN THE COMPONENTS ───────────────────────────────────────────
 * A shared component under `src/ui/svelte/components/` works wherever it is mounted — that is the
 * whole premise of the directory, and `util/overlayHost.js` records what it cost when three of
 * them quietly did not. A hard-coded `.manager-main` inside one of them is the same coupling in a
 * quieter spelling: it names a scroller that exists in exactly one application.
 *
 * So the SELECTOR is a value rather than a component detail. Each overlay component takes a
 * `bounds` prop and a caller may pass its own; the defaults live here, outside both the shared
 * directory and the action, so that:
 *
 *   - the `anchoredPopover` action carries no app-specific selector at all, and
 *   - moving a component into `components/` does not drag a manager selector in with it.
 *
 * ── WHY THE DEFAULTS ARE HERE RATHER THAN AT EVERY CALL SITE ────────────────────────────────
 * Every shipped caller relies on today's boundary, and one of them — `ModifierPillSelect`, which
 * renders `SearchablePopover` — belongs to another change in flight. A default that reproduces
 * the shipped boundary keeps all of them, including that one, positioning exactly as they do
 * today, while still letting any caller state its own.
 *
 * ── TWO ALGORITHMS, BECAUSE THE SHIPPED CODE HAD TWO ────────────────────────────────────────
 * A selector STRING is the `closest()` form: the nearest matching ancestor, contributing nothing
 * when there is none. `ancestorScrollerBounds` is the second, and the difference is not cosmetic
 * — it SKIPS a candidate that is zero-sized or `display: contents`, because such an element is
 * not a box the panel can be clipped against, and it falls back to the host's own inset edges
 * rather than to nothing.
 */

/**
 * The manager and admin scrollers a picker panel is clipped against.
 *
 * @type {string}
 */
export const MANAGER_SCROLLER_SELECTOR = '.admin-main, .manager-main, .manager-table-scroll';

/**
 * The manager's main column alone, for a control that only ever renders inside it.
 *
 * @type {string}
 */
export const MANAGER_MAIN_SELECTOR = '.manager-main';

/**
 * `MANAGER_SCROLLER_SELECTOR` plus the World > Parties pane's OWN scroller (issue 1182): that
 * pane scrolls itself rather than sitting inside `.manager-table-scroll`, so without it a card's
 * travel-actor picker is bounded by the manager shell and can be laid out past the pane's right
 * edge.
 *
 * @type {string}
 */
export const PICKER_SCROLLER_SELECTOR =
  '.admin-main, .manager-main, .manager-table-scroll, .manager-travel-parties-content, .manager-travel-parties';

/** The inset a clipped panel keeps from its boundary, matching `anchoredPopover`'s own. */
const INSET = 16;

/**
 * A `bounds` resolver that walks up from the anchor to the first USABLE matching ancestor.
 *
 * @param {string} selector The boundary vocabulary.
 * @returns {(hostRect: {left: number, width: number}, anchor: Element|null) => {minLeft: number, maxRight: number}}
 */
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

/**
 * The default boundary for `SearchablePopover`: the walk over `PICKER_SCROLLER_SELECTOR`.
 *
 * @type {(hostRect: {left: number, width: number}, anchor: Element|null) => {minLeft: number, maxRight: number}}
 */
export const pickerScrollerBounds = ancestorScrollerBounds(PICKER_SCROLLER_SELECTOR);
