/** DOM test helper for Svelte component tests. */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

/** @type {Window | null} */
let _window = null;

/**
 * Snapshot of the original property descriptors for every global we install, keyed by property
 * name. Used by teardownDOM() to restore the previous state.
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
  'HTMLMediaElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'Element',
  'Node',
  'Text',
  'Comment',
  'DocumentFragment',
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
 * Install a single value as a configurable, writable, enumerable data property on `globalThis`,
 * even when the existing descriptor is a getter-only accessor.
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
 * Restore a single global to the descriptor saved by installGlobal(). If there was no previous own
 * descriptor, the property is deleted.
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
 * Create a fresh happy-dom Window and assign its globals to `globalThis`. Previous values are saved
 * so `teardownDOM()` can restore them.
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
 * Restore all globals that `setupDOM()` replaced and close the happy-dom Window to release its
 * resources.
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

/**
 * A short, safe description of a DOM element: tag name plus the attributes a selector would have
 * matched on. Never walks into children, parents or the owner document.
 */
function describeElement(element) {
  const attributes = Array.from(element.attributes || [])
    .map((attribute) => (attribute.value ? `${attribute.name}="${attribute.value}"` : attribute.name))
    .join(' ');
  return `<${element.tagName.toLowerCase()}${attributes ? ` ${attributes}` : ''}>`;
}

/**
 * Assert that `selector` matches nothing under `root`. NEVER hand a live happy-dom node to
 * `node:assert`.
 */
export function assertNoElement(root, selector, message) {
  const found = root?.querySelector(selector) ?? null;
  assert.equal(
    found === null ? null : describeElement(found),
    null,
    message || `expected no element matching ${selector}`
  );
}
