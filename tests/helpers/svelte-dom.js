/**
 * DOM test helper for Svelte component tests.
 *
 * Imports happy-dom and wires its Window globals into `globalThis` so that
 * Svelte compiled components and DOM APIs are available inside `node --test`
 * runs, which have no built-in browser environment.
 *
 * Usage:
 *
 *   import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
 *
 *   describe('MyComponent', () => {
 *     before(setupDOM);
 *     after(teardownDOM);
 *
 *     it('renders', () => { ... });
 *   });
 */

import { Window } from 'happy-dom';

/** @type {Window | null} */
let _window = null;

/**
 * Snapshot of the original property descriptors for every global we install,
 * keyed by property name. Used by teardownDOM() to restore the previous state.
 * @type {Map<string, PropertyDescriptor | undefined>}
 */
const _originals = new Map();

/**
 * The globals that happy-dom's Window provides and that Svelte / DOM code
 * expects to find on `globalThis`. Extend this list as needed.
 */
const DOM_GLOBALS = [
  'document',
  'window',
  'navigator',
  'location',
  'history',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSpanElement',
  'HTMLFormElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'Element',
  'Node',
  'NodeList',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'InputEvent',
  'MutationObserver',
  'IntersectionObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
  'fetch',
  'URL',
  'URLSearchParams',
  'FormData',
  'AbortController',
  'AbortSignal',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
];

/**
 * Install a single value as a configurable, writable, enumerable data property
 * on `globalThis`, even when the existing descriptor is a getter-only accessor.
 * Saves the previous descriptor in `_originals` for restoration.
 *
 * @param {string} key
 * @param {unknown} value
 */
function installGlobal(key, value) {
  _originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Restore a single global to the descriptor saved by installGlobal().
 * If there was no previous own descriptor, the property is deleted.
 *
 * @param {string} key
 */
function restoreGlobal(key) {
  const saved = _originals.get(key);
  if (saved === undefined) {
    // Property did not exist as an own descriptor before; remove it.
    try { delete globalThis[key]; } catch { /* non-configurable — leave it */ }
  } else {
    try {
      Object.defineProperty(globalThis, key, saved);
    } catch {
      // If re-defining fails (e.g. the original was non-configurable),
      // fall back to a simple assignment so we at least restore the value.
      try { globalThis[key] = saved.value; } catch { /* give up */ }
    }
  }
  _originals.delete(key);
}

/**
 * Create a fresh happy-dom Window and assign its globals to `globalThis`.
 * Previous values are saved so `teardownDOM()` can restore them.
 *
 * Call this once per test file (e.g. in a `before` hook) or per test
 * when isolation is required.
 */
export function setupDOM() {
  _window = new Window();

  for (const key of DOM_GLOBALS) {
    const value = _window[key];
    if (value === undefined) continue;
    installGlobal(key, value);
  }

  // `globalThis.window` must point to `globalThis` itself so that code which
  // does `window.document` keeps working after we flatten the globals.
  installGlobal('window', globalThis);
}

/**
 * Restore all globals that `setupDOM()` replaced and close the happy-dom
 * Window to release its resources.
 *
 * Call this in an `after` hook matching the `before` that called `setupDOM()`.
 */
export function teardownDOM() {
  for (const key of DOM_GLOBALS) {
    restoreGlobal(key);
  }

  if (_window) {
    _window.close();
    _window = null;
  }
}
