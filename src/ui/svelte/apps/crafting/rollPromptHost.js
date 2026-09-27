/** Mounts one roll prompt over the Fabricate window that asked for it and settles it exactly once. */
import { flushSync, mount, unmount } from 'svelte';

import { FABRICATE_THEME_ATTRIBUTE } from '../../../theme.js';
import {
  APPLICATION_HOST_SELECTOR,
  STANDALONE_OVERLAY_HOST_CLASS,
} from '../../util/overlayHost.js';

/**
 * The Fabricate root a player started the roll from: the one holding focus or, when focus is
 * nowhere because the clicked button disabled itself, the one under the pointer. Anything else,
 * such as a companion or macro call, returns `null` and takes the standalone layer. A minimized
 * window never hosts, and of nested roots the innermost wins.
 */
export function findApplicationHost(doc) {
  const active = doc.activeElement;
  const focusNowhere = !active || active === doc.body || active === doc.documentElement;
  const started = (root) => (focusNowhere ? root.matches(':hover') : root.contains(active));
  const roots = [...doc.querySelectorAll(APPLICATION_HOST_SELECTOR)];
  return roots.findLast((root) => started(root) && !root.closest('.minimized')) ?? null;
}

/** The ApplicationV2 that owns a host, so its `close` event can settle the prompt. */
function applicationOf(host) {
  const frame = host.closest('.application');
  return frame ? (globalThis.foundry?.applications?.instances?.get(frame.id) ?? null) : null;
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
 * Settle when the host window goes away: its application's `close` event where one resolves,
 * otherwise a document observer watching for the host leaving the page. Returns the release.
 */
function watchHostClose(doc, host, app, onClose) {
  if (app) {
    app.addEventListener('close', onClose, { once: true });
    return () => app.removeEventListener('close', onClose);
  }
  const Observer = doc.defaultView?.MutationObserver;
  if (typeof Observer !== 'function') return () => {};
  const observer = new Observer(() => {
    if (!host.isConnected) onClose();
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Resolve with the prompt's raw answer, or `null` when it is dismissed, its window closes or it
 * cannot open. The component, the standalone layer, the close watch and focus are all released
 * on every exit path.
 */
export async function openRollPromptModal(
  data,
  {
    doc = globalThis.document,
    loadComponent = () => import('./RollPrompt.svelte'),
    mountComponent = mount,
    unmountComponent = unmount,
    resolveApplication = applicationOf,
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
    let releaseWatch = () => {};
    const settle = (answer) => {
      if (settled) return;
      settled = true;
      releaseWatch();
      if (mounted) unmountComponent(mounted);
      mounted = null;
      if (!applicationHost) host.remove();
      resolve(answer);
    };
    if (applicationHost) {
      releaseWatch = watchHostClose(doc, host, resolveApplication(host), () => settle(null));
    }
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
