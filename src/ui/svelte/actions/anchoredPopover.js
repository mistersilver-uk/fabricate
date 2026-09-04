/**
 * ONE anchored-popover action, and the seven copies it replaces (issue 1500).
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────────────────────
 * Seven surfaces each carried the same positioning pass, hand-written:
 *
 *   function updatePopoverPosition() {
 *     if (!open || !triggerButton || typeof window === 'undefined') return;
 *     const hostRect = overlayHostRect(resolveOverlayHost(pickerRoot, { component: '…' }));
 *     const triggerRect = triggerButton.getBoundingClientRect();
 *     const layout = computeIconPickerPopoverLayout({ …host-relative trigger… }, …);
 *     popoverStyle = [`left: ${layout.left}px;`, 'right: auto;', …].join(' ');
 *   }
 *
 * plus, in every one of them, a `$effect` that called it once, added `resize` on `window` and a
 * CAPTURE-phase `scroll` on `document`, and removed both on teardown. The bodies agreed on the
 * hard parts — the host is the coordinate origin, the vertical branch writes `top: auto` when it
 * flips — and disagreed on the incidental ones, which is the shape a copy always takes: four of
 * them clipped with `closest()`, one walked `parentElement`, one filtered scrolls that started
 * inside the panel, one guarded `typeof window.addEventListener !== 'function'` and the others
 * did not.
 *
 * Six were shared components. The seventh was a screen region — the environments browser's biome
 * colour picker — and it is the reason this header says seven rather than six: it was found by
 * review AFTER the six converted, in the one directory nobody had thought to grep, which is the
 * ordinary way a family like this is undercounted.
 *
 * A copy is not a defect until it drifts, and this family had already drifted in the direction
 * that matters: `src/ui/svelte/util/overlayHost.js` records six copies of the HOST lookup going
 * wrong at once. This action is the same consolidation applied one layer out — the measurement,
 * the flip, the clamp, the style write and the listener pair, resolved once.
 *
 * ── WHAT IS DELIBERATELY *NOT* IN HERE ──────────────────────────────────────────────────────
 * `layout` is a REQUIRED option with no default, and that is a dependency decision rather than a
 * style one. Two layout algorithms ship — `util/iconPickerPopover.js` for the pickers and
 * `util/actionMenuLayout.js` for the overflow menus — and a default would make this module import
 * one of them, which would put it in the static-import closure of EVERY caller. The mounted-test
 * harness walks that closure (`tests/helpers/svelte-component-harness.js`), so a manifest that
 * compiles only `ActionMenu` would be forced to declare the picker layout it never runs. Each
 * caller passes the function from the module it already imports; this file imports neither.
 *
 * For the same reason there are NO app-specific selectors here. A caller's clipping boundary
 * arrives through `bounds`, as a selector string or as a resolver; `src/ui/svelte/util/
 * overlayBounds.js` owns the manager's own selectors and the `parentElement` walk.
 *
 * ── THE HOST IS THE ORIGIN, ALWAYS ──────────────────────────────────────────────────────────
 * The element this action portals into and the element it measures against are the same one, and
 * they are the same one because a single call answers both. `util/overlayHost.js` records at
 * length what happens when those two answers are computed separately: byte-identical markup, a
 * panel in the wrong place, and nothing in the repository able to see it.
 */
import { overlayHostRect, resolveOverlayHost } from '../util/overlayHost.js';

import { portal } from './portal.js';

/**
 * The inset a clipping boundary keeps from the panel, in CSS pixels.
 *
 * 16, because that is what all seven copies used and what `computeIconPickerPopoverLayout`'s own
 * `viewportMargin` defaults to. It is the popover family's margin rather than any one app's, so
 * it belongs here while the SELECTOR that finds the boundary does not.
 */
const BOUNDS_INSET = 16;

/**
 * Adapt a `computeIconPickerPopoverLayout`-shaped function to this action's `layout` contract.
 *
 * The picker layout takes a HOST-RELATIVE trigger box and a `{ width, height }` viewport, while
 * the action hands its `layout` raw viewport rects plus the host's own box — the shape the menu
 * layout wants. Six of the seven callers need exactly the same translation between the two, so it
 * is written once here rather than six times as an inline arrow.
 *
 * It imports nothing: the caller supplies `compute`, so this module still pulls no layout module
 * into anyone's dependency closure.
 *
 * @param {(triggerRect: object, viewport: {width: number, height: number}, options: object) => object|null} compute
 * @returns {(triggerRect: DOMRect, panelRect: DOMRect, hostRect: object, bounds: object, options: object) => object|null}
 */
export function hostRelativePopoverLayout(compute) {
  return (triggerRect, panelRect, hostRect, bounds, options) =>
    compute(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      {
        width: hostRect.width || window.innerWidth,
        height: hostRect.height || window.innerHeight,
      },
      { ...options, minLeft: bounds?.minLeft, maxRight: bounds?.maxRight }
    );
}

/**
 * Position a portaled overlay panel against its trigger, in its application host's coordinates.
 *
 * @param {HTMLElement} node The panel. It is portaled into the resolved host and its inline
 *   `style` is written by this action, so the component must NOT also bind `style` on it.
 * @param {object} params
 * @param {string} params.component REQUIRED. The component name `resolveOverlayHost` reports an
 *   unhosted overlay under. It deduplicates per name, so a shared default would let the first
 *   mis-mounted overlay silence every other one for the session.
 * @param {HTMLElement|(() => HTMLElement|null)|null} params.trigger The anchor. A function is
 *   re-read on every pass, which is what lets a caller whose trigger UNMOUNTS while open
 *   (`SearchablePopover`'s inline-search mode) fall back to its picker root.
 * @param {boolean} [params.open] Defaults to true, because the usual caller only renders the
 *   panel while it is open.
 * @param {(triggerRect: DOMRect, panelRect: DOMRect, hostRect: object, bounds: object, options: object) => object|null} params.layout
 *   REQUIRED. See the header for why there is no default.
 * @param {() => object} [params.layoutOptions] Called on EVERY measure, so a caller whose options
 *   are themselves measured (`IconPicker`'s row pitch and popover chrome) keeps re-measuring.
 * @param {string|((hostRect: object, anchor: HTMLElement|null) => object)} [params.bounds] The
 *   clipping boundary. A string is `anchor.closest(selector)`, contributing nothing when it
 *   misses; a function is a caller-supplied resolver.
 * @param {object|(() => object)} [params.targets] Secondary style targets. `list` receives the
 *   layout's `listMaxHeight` (issue 1280's whole-row flooring).
 * @param {number} [params.maxHeightCap] A post-hoc cap on the layout's own `maxHeight`. `0`
 *   (the default) means uncapped.
 * @param {boolean} [params.applyWidth] Whether the layout's `width` is written. False for a panel
 *   that sizes to its content (`width: max-content`), where writing a width would fix the box.
 * @param {boolean} [params.ignoreScrollWithin] Drop viewport events that started inside the panel
 *   itself. The panel is anchored to the trigger and scrolling INSIDE it moves neither, so the
 *   answer a re-measure would recompute is the one already applied.
 * @returns {{update(next: object): void, destroy(): void}}
 */
export function anchoredPopover(node, params = {}) {
  if (typeof document === 'undefined') {
    return {
      update() {},
      destroy() {},
    };
  }

  let options = params ?? {};
  let portalHandle = null;
  let listening = false;

  function validate() {
    if (!options.component) {
      throw new TypeError(
        'anchoredPopover requires a `component` name: resolveOverlayHost deduplicates its ' +
          'missing-host report per component, so an unnamed overlay would silence every other one.'
      );
    }
    if (typeof options.layout !== 'function') {
      throw new TypeError(
        `anchoredPopover requires a \`layout\` function (${options.component}). There is no ` +
          'default, so that this action imports neither layout module — see its header.'
      );
    }
  }

  function anchorElement() {
    const resolved = typeof options.trigger === 'function' ? options.trigger() : options.trigger;
    return resolved ?? null;
  }

  function isOpen() {
    return options.open !== false;
  }

  function styleTargets() {
    const resolved = typeof options.targets === 'function' ? options.targets() : options.targets;
    return resolved ?? {};
  }

  function write(target, value) {
    target?.setAttribute?.('style', value);
  }

  function clear() {
    write(node, '');
    write(styleTargets().list, '');
  }

  function resolveBounds(hostRect, anchor) {
    const { bounds } = options;
    if (!bounds) return {};
    if (typeof bounds === 'function') return bounds(hostRect, anchor) ?? {};

    const boundary = anchor?.closest?.(bounds);
    const rect = boundary?.getBoundingClientRect?.();
    if (!rect) return {};

    return {
      minLeft: rect.left - hostRect.left + BOUNDS_INSET,
      maxRight: rect.right - hostRect.left - BOUNDS_INSET,
    };
  }

  function panelStyle(layout) {
    const parts = [];

    if (Number.isFinite(layout.left)) parts.push(`left: ${layout.left}px;`, 'right: auto;');
    else if (Number.isFinite(layout.right)) parts.push('left: auto;', `right: ${layout.right}px;`);

    if (options.applyWidth !== false && Number.isFinite(layout.width)) {
      parts.push(`width: ${layout.width}px;`);
    }

    if (Number.isFinite(layout.maxHeight)) {
      const cap = Number(options.maxHeightCap) || 0;
      const maxHeight = cap > 0 ? Math.min(layout.maxHeight, cap) : layout.maxHeight;
      parts.push(`max-height: ${maxHeight}px;`);
    }

    parts.push(
      layout.placement === 'top'
        ? `top: auto; bottom: ${layout.bottom}px;`
        : `top: ${layout.top}px; bottom: auto;`
    );

    return parts.join(' ');
  }

  function resolveHost(anchor) {
    return resolveOverlayHost(anchor, { component: options.component });
  }

  function measure() {
    if (!isOpen() || typeof window === 'undefined') return;

    const anchor = anchorElement();
    if (!anchor) return;

    const hostRect = overlayHostRect(resolveHost(anchor));
    const layout = options.layout(
      anchor.getBoundingClientRect(),
      node.getBoundingClientRect(),
      hostRect,
      resolveBounds(hostRect, anchor),
      typeof options.layoutOptions === 'function' ? (options.layoutOptions() ?? {}) : {}
    );

    if (!layout) {
      clear();
      return;
    }

    write(node, panelStyle(layout));
    // Null on the first pass, before any row has been laid out to measure. The list then falls
    // back to filling the panel, which is one frame of the previous behaviour rather than a
    // guessed height that jumps once the real one arrives.
    write(
      styleTargets().list,
      Number.isFinite(layout.listMaxHeight) ? `max-height: ${layout.listMaxHeight}px;` : ''
    );
  }

  /**
   * Did this event start inside the panel? See `ignoreScrollWithin`.
   *
   * THE TARGET IS NOT ALWAYS A NODE. `resize` fires on `window`, and `Node.contains()` takes a
   * `Node?` — so `node.contains(window)` THROWS rather than answering false. The six copies this
   * action replaces all carried that shape, and in the one caller that sets `ignoreScrollWithin`
   * (`IconPicker`) it meant a window resize threw out of the listener and the reposition it was
   * supposed to trigger never ran. Issue 1500 fixes it here: a non-`Node` target did not start
   * inside the panel, so a resize now RE-MEASURES. That is this action's one deliberate
   * behaviour change, and it moves the panel back to its trigger after a resize instead of
   * leaving it where the pre-resize measurement put it.
   */
  function startedInsidePanel(event) {
    const target = event?.target;
    if (!target) return false;
    if (target === node) return true;
    if (!(target instanceof Node)) return false;
    return node.contains(target) === true;
  }

  function onViewportChange(event) {
    if (options.ignoreScrollWithin && startedInsidePanel(event)) return;
    measure();
  }

  function attach() {
    if (listening || typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('scroll', onViewportChange, true);
    listening = true;
  }

  function detach() {
    if (!listening) return;
    window.removeEventListener('resize', onViewportChange);
    document.removeEventListener('scroll', onViewportChange, true);
    listening = false;
  }

  function portalToHost() {
    const host = resolveHost(anchorElement());
    if (portalHandle) portalHandle.update(host);
    else portalHandle = portal(node, host);
  }

  function sync() {
    validate();
    if (!isOpen()) {
      detach();
      clear();
      return;
    }
    portalToHost();
    measure();
    attach();
  }

  sync();

  return {
    update(next) {
      options = next ?? {};
      sync();
    },

    destroy() {
      detach();
      portalHandle?.destroy();
      portalHandle = null;
    },
  };
}
