/**
 * DRIVING A LISTBOX FROM THE KEYBOARD, once, for every picker that has one (issue 1503).
 *
 * `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element and
 * drive selection with `aria-activedescendant`. Three components implement that model —
 * `SearchablePopover` and, until the epic folds them into it, `IconPicker` and
 * `EssenceSourceSelector` — and a mounted suite per component would otherwise carry a third copy
 * of the same six-function driver. The copies are what the duplication gate counts, and worse,
 * they are where the three suites would quietly stop asking the same question.
 *
 * ── WHY THE KEY IS DISPATCHED AT `document.activeElement` ────────────────────────────────────
 * The one thing these suites exist to prove is that focus does NOT move onto a row. A driver that
 * kept dispatching at the node it captured on open would report an unchanged `activeElement` even
 * from a model that had roved focus away from it, because it would never have asked the document
 * where focus actually is. Addressing `document.activeElement` makes the test follow the focus,
 * so a model that moves it is caught by the very next press.
 */

import assert from 'node:assert/strict';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

/**
 * Let Svelte's flush AND the pickers' own microtask-scheduled focus moves run.
 *
 * Both directions of the focus contract are deferred: a panel focuses its query field from a
 * `queueMicrotask` inside an effect, and a close returns focus to the trigger from a
 * `tick().then(...)`. Neither is visible to a bare `flushSync`, so a settle that skipped the turn
 * of the loop would read the focus state from before the move.
 */
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

/**
 * The row the model marks as the keyboard cursor's, of which there must never be more than one.
 *
 * Returned as a list rather than a node precisely so "two rows are marked" is a visible failure
 * rather than a first-match read that hides it.
 */
export function markedRows(root) {
  return [...root.querySelectorAll('[data-active-option="true"]')];
}

/** The row the holder ANNOUNCES, or `null` when it names none. */
export function activeDescendant(holder) {
  return holder.getAttribute('aria-activedescendant');
}

/**
 * Type into a picker's query field, the way a GM narrowing a long list does.
 *
 * An explicit `value` plus a dispatched `input` is the repo's idiom for a deterministic mounted
 * update; a synthesized `keydown` of a printable character would not change the field's value.
 */
export function typeQuery(field, term) {
  field.value = term;
  field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  flushSync();
}

/**
 * Put the caret somewhere in a query field, which is what decides who owns Home/End/Left/Right.
 *
 * Four keys are the caret's before they are the list cursor's, and `SearchablePopover` hands each
 * of them to the cursor ONLY from the edge at which the caret would not move. happy-dom follows
 * the HTML spec and collapses the selection to the end of the value when `value` is assigned, so
 * `typeQuery` alone always leaves the caret at one particular edge — a suite that never called
 * this would measure that edge and never the other, and would read as though there were no rule.
 *
 * @param {HTMLInputElement} field The query field.
 * @param {number|[number, number]} caret An offset, or a two-element RANGE — the third state the
 *   boundary distinguishes, because a selection belongs to the field whichever edge it touches.
 */
export function placeCaret(field, caret) {
  const [start, end] = Array.isArray(caret) ? caret : [caret, caret];
  field.selectionStart = start;
  field.selectionEnd = end;
  return field;
}

/**
 * Press one key `presses` times, asserting after EVERY press that focus is still on the holder,
 * and return what the holder announced each time.
 *
 * The run is long on purpose. A single press cannot distinguish a model that keeps focus from one
 * that moves it back, and a wrap needs more presses than there are rows.
 *
 * @param {object} options
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
 *
 * The three go together because they are one decision seen from three sides: rows carry
 * `tabindex="-1"` so Tab cannot walk into the list, a `tabindex` element that is not a form field
 * must carry `data-keyboard-focus` or Foundry leaves every keybinding live, and the -1 sentinel
 * means an opened panel has no cursor until the GM asks for one.
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

/**
 * Assert a `mousedown` on a row is suppressed, then that clicking it still chooses.
 *
 * happy-dom never moves focus on `mousedown`, so an assertion that `activeElement` is unchanged
 * would pass whether or not the component suppressed anything. The suppression itself is the
 * mechanism a real browser acts on, so `defaultPrevented` is what is asserted.
 */
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
