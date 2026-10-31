/**
 * Puts the mount point of a `Modal` in a companion's region and opens the real overlay chain with
 * that region as its `overlayHost`, as `ui.mount('Modal', { target, overlayHost })` does (issue 2818).
 * `kind` is the containing block the region makes for fixed content: `plain` makes none,
 * `contain` is `contain: layout`, `container` is `container-type: inline-size`, as the Manager's
 * root sets, `transform` is a `transform`, and `scroll` is `contain: layout` on a region that
 * scrolls a tall column of its own (issue 2859).
 */
import { mount, unmount } from 'svelte';

import { openOverlayChain } from '../../../src/ui/publishedComponentOverlays.js';

const REGION_STYLES = Object.freeze({
  plain: {},
  contain: { contain: 'layout' },
  container: { containerType: 'inline-size' },
  transform: { transform: 'translateZ(0)' },
  scroll: { contain: 'layout', overflow: 'auto' },
});

/** A layer of the companion's own, below the dialog's `z-index`, covering the whole region. */
function companionLayer() {
  const layer = document.createElement('div');
  layer.dataset.companionLayer = '';
  Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '50' });
  return layer;
}

/**
 * @param {HTMLElement} scroller The element the region is appended to.
 * @param {HTMLElement} mountPoint The `target` the dialog is mounted into, moved into the region.
 * @param {string} kind A key of `REGION_STYLES`.
 * @returns {HTMLElement} The region, which is the chain's `overlayHost`.
 */
export function hostInRegion(scroller, mountPoint, kind) {
  const region = document.createElement('div');
  region.dataset.region = kind;
  Object.assign(region.style, {
    position: 'relative',
    width: '700px',
    height: '360px',
    border: '1px solid currentColor',
    ...REGION_STYLES[kind],
  });
  region.append(companionLayer(), mountPoint);
  if (kind === 'scroll') {
    const column = document.createElement('div');
    column.dataset.regionColumn = '';
    column.style.height = '1200px';
    region.append(column);
  }
  scroller.append(region);
  openOverlayChain({
    target: mountPoint,
    option: region,
    runtime: () => ({ mount, unmount, overlay: () => {} }),
    report: (error) => {
      throw error;
    },
  });
  return region;
}
