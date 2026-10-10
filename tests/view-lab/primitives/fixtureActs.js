/**
 * The only events a Primitive Lab fixture's `act` may drive (issue 2339), each dispatched on an
 * element the specimen rendered and settled before it returns. Every event bubbles, because Svelte
 * delegates `click`, `keydown` and `input` to the root. Focus is synthetic: an act's state must not
 * depend on holding document focus, which another specimen's act or a press elsewhere takes away.
 */
import { flushSync, tick } from 'svelte';

/** The key names an act presses. */
export const KEYS = Object.freeze({ ARROW_DOWN: 'ArrowDown', ARROW_UP: 'ArrowUp' });

/** How often {@link waitFor} re-reads its predicate. */
const POLL_MS = 16;

/** Run Svelte's pending effects and updates, so an act reads the DOM its last event produced. */
export async function settle() {
  flushSync();
  await tick();
  flushSync();
}

export async function click(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle();
}

export async function press(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await settle();
}

/** Write `text` into an input and announce it, as typing would. */
export async function type(input, text) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

/** Dispatch `focus` without `.focus()`, so no other frame's blur can close what it opened. */
export async function focus(element) {
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await settle();
}

/**
 * Resolve once `predicate()` holds, for a state an asynchronous source or effect produces.
 *
 * @param {() => unknown} predicate Re-read every frame until truthy.
 * @param {string} description What is awaited, named in the rejection.
 * @param {number} [limitMs] How long to wait before rejecting.
 * @returns {Promise<void>}
 */
export async function waitFor(predicate, description, limitMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > limitMs) throw new Error(`timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    await settle();
  }
}

/** The lab's localizer, so a fixture draws the shipped caller's own copy from a `…Key` in `data`. */
export function localize(key) {
  return globalThis.game.i18n.localize(key);
}

export function format(key, data) {
  return globalThis.game.i18n.format(key, data);
}
