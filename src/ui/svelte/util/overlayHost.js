// Where a portaled overlay lives and what its coordinates are measured from (issues 1466, 1520).
// INVARIANT: the coordinate origin and the portal target are the same element — both resolve
// through `resolveOverlayHost`, because computing them apart is what let them diverge (the defect
// this replaces). A class is eligible only if it is itself positioned, so it is the containing
// block of the absolute panel appended to it; `tests/components/portal-host-app-root.test.js` pins
// that, and that no component hard-codes a root of its own.

export const OVERLAY_HOST_ROOT_CLASSES = Object.freeze(['fabricate-manager', 'fabricate-app']);

export const OVERLAY_HOST_SELECTOR = OVERLAY_HOST_ROOT_CLASSES.map((cls) => `.${cls}`).join(', ');

// Module-level: "warn once" must outlive the instance that warned, which is recreated per render.
const reported = new Set();

export function resetOverlayHostDiagnostics() {
  reported.clear();
}

function reportMissingHost(component) {
  if (reported.has(component)) return;
  reported.add(component);
  // `console.error`, not `notifyError`: this pass runs on every scroll and resize, so a Foundry
  // toast would paint itself into every View Lab capture frame the moment it fired once.
  console.error(
    `Fabricate: ${component} rendered an overlay outside every Fabricate application root ` +
      `(${OVERLAY_HOST_SELECTOR}), so its panel is hosted by <body> and is not clipped by any ` +
      'app. Mount it inside an application root, or add that root to ' +
      '`OVERLAY_HOST_ROOT_CLASSES` in src/ui/svelte/util/overlayHost.js.'
  );
}

export function resolveOverlayHost(node, { component = 'An overlay component' } = {}) {
  if (typeof document === 'undefined') return null;
  if (!node) return null;

  const root = node.closest?.(OVERLAY_HOST_SELECTOR);
  if (root) return root;

  reportMissingHost(component);
  return document.body;
}

// Deliberately NO viewport fallback: a viewport-origin rect under a panel that did not move is
// exactly the defect above. Zero degrades to the callers' own `|| window.innerWidth` sizing guard.
export function overlayHostRect(host) {
  return host?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
}
