/**
 * The standalone style root (issue 2456): the private `display: contents` element the seam writes
 * in a target with no Fabricate root, so an entry stating `standaloneRoot` draws under the module
 * sheet's `.fabricate` rules there. Every node test reads `nodeType`, because a Foundry 14 detached
 * window's classes belong to another realm. The contract is
 * `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import { FABRICATE_THEME_ATTRIBUTE } from './theme.js';

const STANDALONE_ROOT_CLASS = 'fabricate-standalone-root';

/** M16's Fabricate root for a `'fabricate'` entry: a `.fabricate` that is no standalone root. */
export const FABRICATE_ROOT_SELECTOR = `.fabricate:not(.${STANDALONE_ROOT_CLASS})`;

/** Any `.fabricate` above a target, a standalone style root included: where none is written. */
export const ANY_FABRICATE_SELECTOR = '.fabricate';

const SHADOW_ROOT_NODE = 11;

/**
 * The theme attribute the standalone overlay layer and the standalone style root carry. A Foundry
 * 14 detached window's <html> holds a copy of the main one's attributes made when it opened, stale
 * after a theme change, so the walk stops below it and falls back to the main one.
 */
export function themeAttributes(target) {
  const main = globalThis.document?.documentElement;
  const top = target.ownerDocument?.documentElement;
  let themed = target;
  while (themed && themed !== top && !themed.hasAttribute?.(FABRICATE_THEME_ATTRIBUTE)) {
    themed = themed.parentElement;
  }
  const source = themed && themed !== top ? themed : main;
  const theme = source?.getAttribute?.(FABRICATE_THEME_ATTRIBUTE);
  return theme ? { [FABRICATE_THEME_ATTRIBUTE]: theme } : {};
}

/** Whether `element` sits in a shadow root, which the module sheet does not reach. */
export const inShadowRoot = (element) => element.getRootNode?.()?.nodeType === SHADOW_ROOT_NODE;

/** Appends a standalone style root to `target`, in `target`'s document, and returns it. */
export function writeStandaloneRoot(target) {
  const root = target.ownerDocument.createElement('div');
  root.style.display = 'contents';
  root.className = `fabricate ${STANDALONE_ROOT_CLASS}`;
  for (const [name, value] of Object.entries(themeAttributes(target))) {
    root.setAttribute(name, value);
  }
  target.append(root);
  return root;
}
