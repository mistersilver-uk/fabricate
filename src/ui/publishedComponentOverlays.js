/**
 * The overlay host chain of one published mount whose entry opens overlays (issue 2454). Each
 * overlay opening under `target` takes a `display: contents` container in the host the chain picks
 * at that moment, mounted on Fabricate's runtime so its delegated handlers run in any document;
 * `close` releases every container still held. The contract is
 * `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import {
  OVERLAY_HOST_SELECTOR,
  acquireStandaloneOverlayLayer,
  createOverlayContainer,
  registerOverlayChain,
  unregisterOverlayChain,
} from './svelte/util/overlayHost.js';
import { FABRICATE_THEME_ATTRIBUTE } from './theme.js';

const KEEP = () => {};

// A detached window's own theme is stale after a change, so an ancestor's is read before the main one.
function themeAttributes(target) {
  let themed = target;
  while (themed && !themed.hasAttribute?.(FABRICATE_THEME_ATTRIBUTE)) themed = themed.parentElement;
  const source = themed ?? globalThis.document?.documentElement;
  const theme = source?.getAttribute?.(FABRICATE_THEME_ATTRIBUTE);
  return theme ? { [FABRICATE_THEME_ATTRIBUTE]: theme } : {};
}

/** The option while it is in the target's document, else the nearest overlay root, else the layer. */
function placeFor(target, option) {
  if (option?.isConnected && option.ownerDocument === target.ownerDocument) {
    return { host: option, release: KEEP };
  }
  const root = target.closest?.(OVERLAY_HOST_SELECTOR);
  if (root) return { host: root, release: KEEP };
  return acquireStandaloneOverlayLayer(target.ownerDocument, themeAttributes(target));
}

/**
 * Registers and returns the chain for `target`; `runtime()` reads the seam's runtime, whose
 * `overlay` component draws nothing, and `report(error)` receives a failed container unmount.
 */
export function openOverlayChain({ target, option, runtime, report }) {
  const held = new Map();

  function unmountQuietly(mounted) {
    try {
      const result = runtime().unmount(mounted);
      if (typeof result?.then === 'function') result.then(undefined, report);
    } catch (error) {
      report(error);
    }
  }

  const chain = {
    acquire(overlay) {
      const lease = held.get(overlay);
      if (lease) return lease.container;
      const place = placeFor(target, option);
      const container = createOverlayContainer(place.host, chain);
      try {
        const { mount, overlay: empty } = runtime();
        held.set(overlay, { container, place, mounted: mount(empty, { target: container }) });
      } catch (error) {
        container.remove();
        place.release();
        throw error;
      }
      return container;
    },
    release(overlay) {
      const lease = held.get(overlay);
      if (!lease) return;
      held.delete(overlay);
      unmountQuietly(lease.mounted);
      lease.container.remove();
      lease.place.release();
    },
    close() {
      for (const overlay of held.keys()) chain.release(overlay);
      unregisterOverlayChain(target, chain);
    },
  };
  registerOverlayChain(target, chain);
  return chain;
}
