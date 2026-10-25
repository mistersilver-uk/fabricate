// ONE anchored-popover action, replacing the seven hand-written positioning passes that had
// already drifted apart (issue 1500): the measurement, the flip, the clamp, the style write and the
// resize/capture-scroll listener pair, resolved once.
// `layout` is a REQUIRED option with NO default, and that is a dependency decision: a default would
// put one of the two layout modules in the static-import closure of every caller, and the mounted
// harness walks that closure. For the same reason there are no app-specific selectors here — a
// caller's boundary arrives through `bounds`, and `util/overlayBounds.js` owns the manager's own.
// The element this portals into and the element it measures against are ONE, because one call
// answers both; `util/overlayHost.js` states what separating them costs.
import { acquireOverlayHost, overlayHostRect, releaseOverlayHost } from '../util/overlayHost.js';

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
// still pulls no layout module into anyone's dependency closure. `view` is the panel's own window,
// whose viewport sizes a host that reports no box.
export function hostRelativePopoverLayout(compute) {
  return (triggerRect, panelRect, hostRect, bounds, options, view = globalThis) =>
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
        width: hostRect.width || view.innerWidth,
        height: hostRect.height || view.innerHeight,
      },
      { ...options, minLeft: bounds?.minLeft, maxRight: bounds?.maxRight }
    );
}

// THE TARGET IS NOT ALWAYS A NODE: `resize` fires on `window` and `Node.contains()` takes a
// `Node?`, so `node.contains(window)` THROWS rather than answering false — which is how a resize
// used to throw out of the listener and skip the reposition it was meant to trigger. A non-`Node`
// target did not start inside the panel, so a resize RE-MEASURES (issue 1500).
// A node is told by `nodeType`, so one from a detached window's realm counts (issue 2454).
function startedInsidePanel(node, event) {
  const target = event?.target;
  if (!target) return false;
  if (target === node) return true;
  if (typeof target.nodeType !== 'number') return false;
  return node.contains(target) === true;
}

// The first pass measures the panel in whatever face the page has loaded so far, and a fallback face
// is wider than the real one, so a panel that sizes to its content is placed by a width it then
// loses: an end-aligned or start-aligned edge lands off its trigger by the difference. Fonts still
// loading settle the width, so one more pass follows them; with none loading it is a no-op repeat.
function afterFontsLoad(doc, run) {
  // The chain rejects only if a measure throws, which surfaces as an unhandled rejection.
  void doc?.fonts?.ready?.then?.(run);
}

// The caller's `bounds`: a resolver of its own, or a selector whose nearest match above the anchor
// clips the panel, inset by the family's margin.
function resolveBounds(bounds, hostRect, anchor) {
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

function panelStyle(layout, { applyWidth, maxHeightCap }) {
  const parts = [];

  if (Number.isFinite(layout.left)) parts.push(`left: ${layout.left}px;`, 'right: auto;');
  else if (Number.isFinite(layout.right)) parts.push('left: auto;', `right: ${layout.right}px;`);

  if (applyWidth !== false && Number.isFinite(layout.width)) {
    parts.push(...panelWidthDeclarations(layout.width));
  }

  if (Number.isFinite(layout.maxHeight)) {
    const cap = Number(maxHeightCap) || 0;
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

// This action writes `node`'s inline `style`, so the component must NOT also bind `style` on it.
// `component` is REQUIRED because `resolveOverlayHost` deduplicates its missing-host report per
// name, so a shared default would let the first mis-mounted overlay silence every other one.
// A FUNCTION `trigger` is re-read on every pass, which is what lets a caller whose trigger unmounts
// while open fall back to its picker root. `layoutOptions` is called on EVERY measure, but a value
// read only inside that closure is NOT a dependency of `update`, so a caller whose option can
// change while the panel is open must re-measure it; no shipped caller's can.
// `applyWidth: false` is for a panel that sizes to its content, where writing a width fixes the box;
// `ignoreScrollWithin` drops events from inside the panel, which move neither it nor its trigger.
// Every listener binds to the panel's own document and window; a panel whose document has no window
// binds none and is treated as closed. `layout` is called with that window as a sixth argument.
export function anchoredPopover(node, params = {}) {
  if (!node?.ownerDocument) {
    return {
      update() {},
      destroy() {},
    };
  }

  let options = params ?? {};
  let portalHandle = null;
  let host = null;
  // The document and window the listener pair is bound to, so it is removed from those.
  let bound = null;
  let destroyed = false;
  // One font-load re-measure per open: an `update` while open queues no second one.
  let fontsQueued = false;

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

  function viewOf() {
    return node.ownerDocument?.defaultView ?? null;
  }

  function isOpen() {
    return options.open !== false && viewOf() !== null;
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

  function measure() {
    if (!isOpen() || !host) return;

    const anchor = anchorElement();
    if (!anchor) return;

    const hostRect = overlayHostRect(host);
    const layout = options.layout(
      anchor.getBoundingClientRect(),
      node.getBoundingClientRect(),
      hostRect,
      resolveBounds(options.bounds, hostRect, anchor),
      typeof options.layoutOptions === 'function' ? (options.layoutOptions() ?? {}) : {},
      viewOf()
    );

    if (!layout) {
      clear();
      return;
    }

    write(node, panelStyle(layout, options));
    // Null on the first pass, before a row exists to measure: the list fills the panel for one
    // frame rather than taking a guessed height that jumps when the real one arrives.
    write(
      styleTargets().list,
      Number.isFinite(layout.listMaxHeight) ? `max-height: ${layout.listMaxHeight}px;` : ''
    );
  }

  function onViewportChange(event) {
    if (options.ignoreScrollWithin && startedInsidePanel(node, event)) return;
    measure();
  }

  function attach() {
    const doc = node.ownerDocument;
    const view = viewOf();
    if (bound || typeof view?.addEventListener !== 'function') return;
    view.addEventListener('resize', onViewportChange);
    doc.addEventListener('scroll', onViewportChange, true);
    bound = { doc, view };
  }

  function detach() {
    if (!bound) return;
    bound.view.removeEventListener('resize', onViewportChange);
    bound.doc.removeEventListener('scroll', onViewportChange, true);
    bound = null;
  }

  function portalToHost() {
    host = acquireOverlayHost(node, anchorElement(), { component: options.component });
    if (portalHandle) portalHandle.update(host);
    else portalHandle = portal(node, host);
  }

  function releaseHost() {
    host = null;
    releaseOverlayHost(node);
  }

  function sync() {
    validate();
    if (!isOpen()) {
      fontsQueued = false;
      detach();
      clear();
      releaseHost();
      return;
    }
    portalToHost();
    measure();
    attach();
    if (fontsQueued) return;
    fontsQueued = true;
    afterFontsLoad(node.ownerDocument, () => !destroyed && measure());
  }

  try {
    sync();
  } catch (error) {
    destroyed = true;
    detach();
    portalHandle?.destroy();
    portalHandle = null;
    releaseHost();
    throw error;
  }

  return {
    update(next) {
      options = next ?? {};
      sync();
    },

    destroy() {
      destroyed = true;
      detach();
      portalHandle?.destroy();
      portalHandle = null;
      releaseHost();
    },
  };
}
