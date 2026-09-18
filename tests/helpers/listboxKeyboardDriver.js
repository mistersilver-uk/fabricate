/**
 * DRIVING A LISTBOX FROM THE KEYBOARD, once, for every picker that has one (issue 1503).
 * `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element and
 * drive selection with `aria-activedescendant`.
 */

import assert from 'node:assert/strict';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

/** Let Svelte's flush AND the pickers' own microtask-scheduled focus moves run. */
export async function settle() {
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

/**
 * Press a key ON THE ELEMENT THAT CURRENTLY HOLDS FOCUS.
 *
 * @param {string} key The `KeyboardEvent.key` to send.
 * @returns {KeyboardEvent} The dispatched event, so a caller can assert on `defaultPrevented` —
 *   which is how "the listbox consumed this" is distinguished from "it fell through to the field".
 */
export function pressKey(key) {
  const event = new globalThis.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  globalThis.document.activeElement.dispatchEvent(event);
  flushSync();
  return event;
}

/** The rows of a rendered listbox, in the order they are DRAWN — which is the order the cursor walks. */
export function optionRows(root) {
  return [...root.querySelectorAll('[role="option"]')];
}

/** The row the model marks as the keyboard cursor's, of which there must never be more than one. */
export function markedRows(root) {
  return [...root.querySelectorAll('[data-active-option="true"]')];
}

/** The row the holder ANNOUNCES, or `null` when it names none. */
export function activeDescendant(holder) {
  return holder.getAttribute('aria-activedescendant');
}

/** Type into a picker's query field, the way a GM narrowing a long list does. */
export function typeQuery(field, term) {
  field.value = term;
  field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  flushSync();
}

/**
 * Put the caret somewhere in a query field, which is what decides who owns Home/End/Left/Right.
 *
 * @param {HTMLInputElement} field The query field.
 * @param {number|[number, number]} caret An offset, or a two-element RANGE — the third state the
 * boundary distinguishes, because a selection belongs to the field whichever edge it touches.
 */
export function placeCaret(field, caret) {
  const [start, end] = Array.isArray(caret) ? caret : [caret, caret];
  field.selectionStart = start;
  field.selectionEnd = end;
  return field;
}

/**
 * Press one key `presses` times, asserting after EVERY press that focus is still on the holder, and
 * return what the holder announced each time.
 *
 * @param {Element} options.holder The element that must hold DOM focus for the panel's whole life.
 * @param {string} options.key The key to repeat.
 * @param {number} options.presses How many times to press it.
 * @param {boolean} [options.consumed] Whether the listbox is expected to consume the key.
 * @returns {string[]} The holder's `aria-activedescendant` after each press.
 */
export function announceAcross({ holder, key, presses, consumed = true }) {
  const announced = [];
  for (let press = 0; press < presses; press += 1) {
    const event = pressKey(key);
    if (consumed) {
      assert.ok(
        event.defaultPrevented,
        `press ${press + 1} of ${key} is consumed by the listbox rather than reaching the field`
      );
    }
    assert.ok(
      globalThis.document.activeElement === holder,
      `press ${press + 1} of ${key} moved DOM focus off the holder to ` +
        `<${globalThis.document.activeElement?.tagName}>, which re-arms Foundry's canvas ` +
        'bindings and draws a competing accent ring around the keyboard cursor'
    );
    announced.push(activeDescendant(holder));
  }
  return announced;
}

/**
 * Assert the whole list is unmarked, every row is out of the tab order, and every row declares
 * itself focused to Foundry.
 */
export function assertRestingList(root, holder) {
  assert.deepEqual(
    markedRows(root).map((row) => row.id),
    [],
    'the sentinel is -1, not 0: an open panel has no keyboard cursor until the GM asks for one'
  );
  assert.equal(
    activeDescendant(holder),
    null,
    'a holder that names no row is what makes the absent cursor audible as well as visible'
  );

  const rows = optionRows(root);
  assert.ok(rows.length > 0, 'the resting assertions are about a list that has rows');
  assert.equal(
    rows.filter((row) => row.getAttribute('tabindex') !== '-1').length,
    0,
    'every row is out of the tab order, so Tab cannot walk focus into the list either'
  );
  assert.equal(
    rows.filter((row) => row.getAttribute('data-keyboard-focus') !== 'true').length,
    0,
    'a `tabindex="-1"` element that is not a form field must declare itself focused to Foundry, ' +
      'or every keybinding stays live while the panel is open'
  );
  assert.equal(
    new Set(rows.map((row) => row.id)).size,
    rows.length,
    'each row has a distinct DOM id, because an `aria-activedescendant` pointing at a duplicated ' +
      'id is ambiguous document-wide rather than merely untidy'
  );
}

/** Assert a `mousedown` on a row is suppressed, then that clicking it still chooses. */
export function assertPointerSuppressed(row, holder) {
  const mousedown = new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  row.dispatchEvent(mousedown);
  flushSync();
  assert.ok(
    mousedown.defaultPrevented,
    'without this a click would focus the row, re-arm the canvas bindings and draw a second ' +
      'accent ring at a positive offset around the keyboard cursor'
  );
  assert.ok(globalThis.document.activeElement === holder, 'and focus is still on the holder');
}
