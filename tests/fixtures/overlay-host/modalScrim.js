/**
 * The scene a dimmed `Modal` (issue 2859) is judged over: `?busy=1` draws controls in the window
 * behind the dialog, `?stack=1` gives the window a `z-index` as ApplicationV2 does and stacks a
 * second Foundry window above it, and `?standalone=1` mounts the dialog outside every Fabricate
 * root through the real overlay chain, so it opens on the standalone layer.
 */
import { mount, unmount } from 'svelte';

import { openOverlayChain } from '../../../src/ui/publishedComponentOverlays.js';

/** Controls and text in the window behind the dialog, each a `data-behind` hook. */
function busyWindow(scroller) {
  const row = document.createElement('div');
  row.dataset.behind = 'row';
  Object.assign(row.style, { display: 'flex', gap: '8px', padding: '8px', background: '#2b3831' });
  for (const label of ['Recipes', 'Components', 'Essences']) {
    const button = document.createElement('button');
    Object.assign(button, { type: 'button', textContent: label });
    button.dataset.behind = label;
    row.append(button);
  }
  scroller.prepend(row);
}

/** The window at `z-index` 101 and a Foundry window at 102 over the viewport's right edge. */
function stackedWindows(frame) {
  frame.style.zIndex = '101';
  const above = document.createElement('div');
  above.className = 'application';
  above.dataset.windowAbove = '';
  Object.assign(above.style, {
    right: '0',
    top: '0',
    width: '120px',
    height: '800px',
    zIndex: '102',
  });
  document.body.append(above);
}

/** Moves `mountPoint` to `<body>`, under no Fabricate root, and opens its chain with no option. */
function onStandaloneLayer(mountPoint) {
  document.body.append(mountPoint);
  openOverlayChain({
    target: mountPoint,
    option: null,
    runtime: () => ({ mount, unmount, overlay: () => {} }),
    report: (error) => {
      throw error;
    },
  });
}

/** Sets the scene `params` name around the window `scroller` sits in and the dialog's `mountPoint`. */
export function stageScrim(params, scroller, mountPoint) {
  if (params.get('busy') === '1') busyWindow(scroller);
  if (params.get('stack') === '1') stackedWindows(scroller.closest('.application'));
  if (params.get('standalone') === '1') onStandaloneLayer(mountPoint);
}
