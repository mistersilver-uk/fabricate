// ONE anchored-popover action, replacing the seven hand-written positioning passes that had
// already drifted apart (issue 1500): the measurement, the flip, the clamp, the style write and the
// resize/capture-scroll listener pair, resolved once.
// `layout` is a REQUIRED option with NO default, and that is a dependency decision: a default would
// put one of the two layout modules in the static-import closure of every caller, and the mounted
// harness walks that closure. For the same reason there are no app-specific selectors here — a
// caller's boundary arrives through `bounds`, and `util/overlayBounds.js` owns the manager's own.
// The element this portals into and the element it measures against are ONE, because one call
// answers both; `util/overlayHost.js` states what separating them costs.
import { overlayHostRect, resolveOverlayHost } from '../util/overlayHost.js';

import { portal } from './portal.js';

// The popover family's own margin — `computeIconPickerPopoverLayout`'s `viewportMargin` default —
// so it belongs here while the SELECTOR that finds the boundary does not.
const BOUNDS_INSET = 16;

// ALL THREE, so a measured width is the whole answer (issue 1520). The layout has already applied
// every constraint the caller stated, but a bare inline `width` is still constrained by whatever
// `min-width`/`max-width` the panel's class rules carry — a `max-width` bounds a used `width`
// regardless of where that width came from, so it is not a cascade contest an inline declaration
// can win. Restating the band in CSS answers one call site and leaves the next to rediscover it.
function panelWidthDeclarations(width) {
  return [`width: ${width}px;`, `min-width: ${width}px;`, `max-width: ${width}px;`];
}

// The picker layout wants a HOST-RELATIVE trigger box and a viewport; this action hands `layout`
// raw viewport rects plus the host's box, which is the shape the MENU layout wants. Six callers
// need the same translation, so it is written once — and `compute` is a parameter, so this module
// still pulls no layout module into anyone's dependency closure.
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

// This action writes `node`'s inline `style`, so the component must NOT also bind `style` on it.
// `component` is REQUIRED because `resolveOverlayHost` deduplicates its missing-host report per
// name, so a shared default would let the first mis-mounted overlay silence every other one.
// A FUNCTION `trigger` is re-read on every pass, which is what lets a caller whose trigger unmounts
// while open fall back to its picker root. `layoutOptions` is called on EVERY measure, but a value
// read only inside that closure is NOT a dependency of `update`, so a caller whose option can
// change while the panel is open must re-measure it; no shipped caller's can.
// `applyWidth: false` is for a panel that sizes to its content, where writing a width fixes the box;
// `ignoreScrollWithin` drops events from inside the panel, which move neither it nor its trigger.
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
      parts.push(...panelWidthDeclarations(layout.width));
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
    // Null on the first pass, before a row exists to measure: the list fills the panel for one
    // frame rather than taking a guessed height that jumps when the real one arrives.
    write(
      styleTargets().list,
      Number.isFinite(layout.listMaxHeight) ? `max-height: ${layout.listMaxHeight}px;` : ''
    );
  }

  // THE TARGET IS NOT ALWAYS A NODE: `resize` fires on `window` and `Node.contains()` takes a
  // `Node?`, so `node.contains(window)` THROWS rather than answering false — which is how a resize
  // used to throw out of the listener and skip the reposition it was meant to trigger. A non-`Node`
  // target did not start inside the panel, so a resize RE-MEASURES (issue 1500).
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
