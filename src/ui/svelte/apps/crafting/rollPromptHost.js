/** Mounts one roll prompt over the Fabricate window that asked for it and settles it exactly once. */
import { flushSync, mount, unmount } from 'svelte';

import { FABRICATE_THEME_ATTRIBUTE } from '../../../theme.js';
import {
  APPLICATION_HOST_SELECTOR,
  STANDALONE_OVERLAY_HOST_CLASS,
} from '../../util/overlayHost.js';

function windowDepth(root) {
  const frame = root.closest('.application') ?? root;
  const depth = Number.parseInt(
    frame.ownerDocument.defaultView?.getComputedStyle(frame).zIndex,
    10
  );
  return Number.isFinite(depth) ? depth : 0;
}

/**
 * Engine code has no node to walk up from, so this is the one document-wide root lookup. With
 * several Fabricate windows open the innermost root holding focus wins, then the frontmost window
 * by z-index, then the later one in document order.
 */
export function findApplicationHost(doc) {
  const roots = [...doc.querySelectorAll(APPLICATION_HOST_SELECTOR)];
  const focused = roots.findLast((root) => root.contains(doc.activeElement));
  if (focused) return focused;
  return roots.reduce(
    (best, root) => (best && windowDepth(best) > windowDepth(root) ? best : root),
    null
  );
}

function createStandaloneHost(doc) {
  const layer = doc.createElement('div');
  layer.className = `fabricate ${STANDALONE_OVERLAY_HOST_CLASS}`;
  const theme = doc.documentElement.getAttribute(FABRICATE_THEME_ATTRIBUTE);
  if (theme) layer.setAttribute(FABRICATE_THEME_ATTRIBUTE, theme);
  doc.body.append(layer);
  return layer;
}

/**
 * Resolve with the prompt's raw answer, or `null` when it is dismissed or cannot open. The
 * component, the standalone layer and focus are all released on every exit path.
 */
export async function openRollPromptModal(
  data,
  {
    doc = globalThis.document,
    loadComponent = () => import('./RollPrompt.svelte'),
    mountComponent = mount,
    unmountComponent = unmount,
  } = {}
) {
  let Component;
  try {
    Component = (await loadComponent()).default;
  } catch (error) {
    console.error('Fabricate | Roll prompt failed to load:', error);
    return null;
  }
  const applicationHost = findApplicationHost(doc);
  const host = applicationHost ?? createStandaloneHost(doc);
  return new Promise((resolve) => {
    let mounted = null;
    let settled = false;
    const settle = (answer) => {
      if (settled) return;
      settled = true;
      if (mounted) unmountComponent(mounted);
      mounted = null;
      if (!applicationHost) host.remove();
      resolve(answer);
    };
    try {
      mounted = mountComponent(Component, {
        target: host,
        props: { data, onSubmit: (answer) => settle(answer), onDismiss: () => settle(null) },
      });
      flushSync();
    } catch (error) {
      console.error('Fabricate | Roll prompt failed to mount:', error);
      settle(null);
    }
  });
}
