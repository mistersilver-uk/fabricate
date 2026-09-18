/**
 * Simulating an Up/Down arrow press on a numeric input, in happy-dom (issue 1050). WHY A KEYDOWN
 * EVENT IS NOT ENOUGH ────────────────────────────────────────────── `Stepper` deliberately owns NO
 * keydown handler.
 */

import assert from 'node:assert/strict';

/**
 * Step a native number input the way the browser does for an Up/Down key press.
 *
 * @param {HTMLInputElement} input The `<input type="number">` under test.
 * @param {'up'|'down'} [direction] Which arrow was pressed.
 * @returns {string} The input's value after the step.
 */
export function stepNativeNumberInput(input, direction = 'up') {
  if (direction === 'up') input.stepUp();
  else input.stepDown();
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  return input.value;
}

/**
 * Assert a migrated field is a real, steppable number input, then step it once.
 *
 * @param {HTMLInputElement} field The element a suite located by its `data-*` hook.
 * @param {'up'|'down'} [direction] Which arrow was pressed.
 * @param {string} [name] How to describe the field when an assertion fails.
 * @returns {string} The field's value after the step, for the caller to assert on.
 */
export function stepMigratedNumberField(field, direction = 'up', name = 'the migrated field') {
  assert.ok(Boolean(field), `${name} renders`);
  assert.equal(field.tagName, 'INPUT', `${name}'s data-* hook rides inputProps onto the <input>`);
  assert.equal(field.type, 'number', `${name} is still a native number input, so Up/Down step it`);
  return stepNativeNumberInput(field, direction);
}

/** Dispatch a real Up/Down key press, for a control that handles the key ITSELF. */
export function pressArrowKey(input, direction = 'up') {
  input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', {
      key: direction === 'up' ? 'ArrowUp' : 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
  );
}
