// Where a portaled overlay lives and what its coordinates are measured from (issues 1466, 1520).
// INVARIANT: the coordinate origin and the portal target are the same element — both come from one
// `acquireOverlayHost` call, and `overlayHostRect` measures a seam container by its host, because
// computing them apart is what let them diverge (the defect this replaces). A class is eligible
// only if it is itself positioned, so it is the containing block of the absolute panel appended to
// it; `tests/components/portal-host-app-root.test.js` pins that, and that no component hard-codes a
// root of its own.

export const OVERLAY_HOST_ROOT_CLASSES = Object.freeze(['fabricate-manager', 'fabricate-app']);

/**
 * The explicit host for an overlay opened while no Fabricate application is open (a companion or
 * macro roll prompt): a fixed layer on `<body>` carrying the Fabricate theme scope. It is not an
 * application root, so it is resolved beside those roots rather than listed among them.
 */
export const STANDALONE_OVERLAY_HOST_CLASS = 'fabricate-standalone-overlay';

export const APPLICATION_HOST_SELECTOR = OVERLAY_HOST_ROOT_CLASSES.map((cls) => `.${cls}`).join(
  ', '
);

export const OVERLAY_HOST_SELECTOR = `${APPLICATION_HOST_SELECTOR}, .${STANDALONE_OVERLAY_HOST_CLASS}`;

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

/** The class walk from `node`, falling back to its own document's `<body>`. */
export function resolveOverlayHost(node, { component = 'An overlay component' } = {}) {
  const doc = node?.ownerDocument;
  if (!doc) return null;

  const root = node.closest?.(OVERLAY_HOST_SELECTOR);
  if (root) return root;

  reportMissingHost(component);
  return doc.body;
}

// A published mount's overlay chain by its target, and each seam container by the chain that
// made it, so an overlay opened inside another's panel joins that panel's chain (issue 2454).
const chains = new WeakMap();
const containerChains = new WeakMap();
const owners = new WeakMap();

export function registerOverlayChain(target, chain) {
  chains.set(target, chain);
}

export function unregisterOverlayChain(target, chain) {
  if (chains.get(target) === chain) chains.delete(target);
}

function chainAbove(node) {
  for (let at = node; at; at = at.parentNode) {
    const chain = chains.get(at) ?? containerChains.get(at);
    if (chain) return chain;
  }
  return null;
}

// Each acquired overlay by the element it was opened from, until it is released (issue 2660).
// An overlay acquired from itself, as a `Modal` dialog is, is not stored, so a `Modal` never
// counts as opened from another.
const openedFrom = new Map();

function recordOpener(overlay, anchor) {
  if (anchor?.nodeType === 1 && anchor !== overlay) openedFrom.set(overlay, anchor);
  else openedFrom.delete(overlay);
}

/**
 * The host `overlay` portals into while open: under a registered published mount, the container
 * its chain holds for `overlay`, the same one until `releaseOverlayHost`; otherwise the class walk
 * from `anchor`. The nearest registered target above `anchor` wins.
 */
export function acquireOverlayHost(overlay, anchor, options) {
  const chain = chainAbove(anchor);
  const held = owners.get(overlay);
  if (held && held !== chain) releaseOverlayHost(overlay);
  recordOpener(overlay, anchor);
  if (!chain) return resolveOverlayHost(anchor, options);
  owners.set(overlay, chain);
  return chain.acquire(overlay);
}

export function releaseOverlayHost(overlay) {
  openedFrom.delete(overlay);
  const chain = owners.get(overlay);
  owners.delete(overlay);
  chain?.release(overlay);
}

/** True when `node`, told by its `nodeType`, is in `container`, or in an open shadow root whose host chain reaches it. */
export function heldBy(container, node) {
  for (let at = node; typeof at?.nodeType === 'number'; at = at.getRootNode?.().host) {
    if (container?.contains?.(at)) return true;
  }
  return false;
}

/**
 * Every held overlay opened from an element `root` holds, or from one such an overlay holds, to a
 * fixed point; `root` itself is never in the answer.
 */
export function overlaysOpenedFrom(root) {
  const found = [];
  let grew = openedFrom.size > 0;
  while (grew) {
    grew = false;
    for (const [overlay, anchor] of openedFrom) {
      if (overlay === root || found.includes(overlay)) continue;
      if (heldBy(root, anchor) || found.some((panel) => heldBy(panel, anchor))) {
        found.push(overlay);
        grew = true;
      }
    }
  }
  return found;
}

/**
 * What a container on the standalone layer states: the pointer, which the layer does not take, and
 * a Fabricate window's typeface and Foundry's application size, which `<body>` does not state.
 */
const ON_STANDALONE_LAYER = Object.freeze({
  pointerEvents: 'auto',
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--font-size-14)',
});

/**
 * A `display: contents` container in `host` for `chain`, so `host` stays the containing block; on
 * the standalone layer its panel takes the pointer and draws in a Fabricate window's face.
 */
export function createOverlayContainer(host, chain) {
  const container = host.ownerDocument.createElement('div');
  container.style.display = 'contents';
  if (host.classList?.contains(STANDALONE_OVERLAY_HOST_CLASS)) {
    Object.assign(container.style, ON_STANDALONE_LAYER);
  }
  host.append(container);
  containerChains.set(container, chain);
  return container;
}

/** A themed standalone layer on `doc.body`, carrying each of `attributes`. */
export function createStandaloneOverlayLayer(doc, attributes = {}) {
  const layer = doc.createElement('div');
  layer.className = `fabricate ${STANDALONE_OVERLAY_HOST_CLASS}`;
  for (const [name, value] of Object.entries(attributes)) layer.setAttribute(name, value);
  doc.body.append(layer);
  return layer;
}

// One shared layer per document, created on the first acquire and removed on the last release. It
// spans its window's viewport, the box `overlayHostRect` measures it as, so a panel placed by
// `right` or `bottom` lands where it was measured; it takes no pointer, so the page stays usable.
const sharedLayers = new WeakMap();

function spanViewport(layer) {
  Object.assign(layer.style, { right: '0', bottom: '0', pointerEvents: 'none' });
  return layer;
}

export function acquireStandaloneOverlayLayer(doc, attributes) {
  let shared = sharedLayers.get(doc);
  if (!shared?.layer.isConnected) {
    shared = { layer: spanViewport(createStandaloneOverlayLayer(doc, attributes)), count: 0 };
    sharedLayers.set(doc, shared);
  }
  shared.count += 1;
  let released = false;
  return {
    host: shared.layer,
    release() {
      if (released) return;
      released = true;
      shared.count -= 1;
      if (shared.count > 0) return;
      shared.layer.remove();
      if (sharedLayers.get(doc) === shared) sharedLayers.delete(doc);
    },
  };
}

// Deliberately NO viewport fallback for an application root or an explicit host: a viewport-origin
// rect under a panel that did not move is exactly the defect above, and zero degrades to the
// callers' own `|| innerWidth` sizing guard. A seam container draws no box, so its host is
// measured, and the standalone layer, fixed to its window's viewport, is that viewport.
export function overlayHostRect(host) {
  const box = containerChains.has(host) ? host.parentElement : host;
  const view = box?.matches?.(`.${STANDALONE_OVERLAY_HOST_CLASS}`) && box.ownerDocument.defaultView;
  if (view) return { left: 0, top: 0, width: view.innerWidth, height: view.innerHeight };
  return box?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
}
