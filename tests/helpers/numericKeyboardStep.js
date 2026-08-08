/**
 * Simulating an Up/Down arrow press on a numeric input, in happy-dom (issue 1050).
 *
 * ── WHY A KEYDOWN EVENT IS NOT ENOUGH ──────────────────────────────────────────────
 * `Stepper` deliberately owns NO keydown handler. Up/Down work purely as native
 * `<input type="number">` behaviour: the browser steps the value and fires `input`, which lands in
 * the component's `onInput` -> `commit`. happy-dom implements the DOM but not that user-agent
 * behaviour, so `dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))` on a Stepper
 * changes nothing and commits nothing — a test written that way asserts a value that never moved
 * and passes only because it expected no movement.
 *
 * So the user agent's own two steps are performed explicitly: `stepUp()`/`stepDown()`, which
 * happy-dom does implement, and then the `input` event the browser fires afterwards. That is
 * faithful rather than a shortcut — `stepUp()` applies the element's real `min`/`max`/`step`
 * attributes, and the commit path under test is reached through the same event a real key press
 * produces.
 *
 * ── WHAT IT CATCHES, AND WHY THE `type` GUARD IS PART OF THE POINT ─────────────────
 * `stepUp()` throws `InvalidStateError` on a non-steppable input, so a component that "fixed" its
 * spinner by switching to `type="text"` fails here rather than silently losing keyboard stepping —
 * which is the regression `Stepper.svelte`'s own header says it exists to prevent. The assertion
 * on the recorded commit then catches the other half: a call site that stopped forwarding the
 * value, or a `oninput` accidentally routed through `inputProps` and overriding the commit path.
 *
 * A control with its OWN keydown handler (`ChanceSlider`) is driven by {@link pressArrowKey}
 * instead, because there the handler IS the behaviour under test.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test` glob.
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
 * This is the preamble every keyboard non-regression test in the migration shares, and it is
 * three assertions rather than one because three different defects would each ship a
 * click-only control:
 *
 *   - the field is missing entirely (a renamed hook, a gated branch), so every later assertion
 *     would throw on `null` rather than report the field;
 *   - the `data-*` hook landed on the `Stepper`'s wrapper `<div>` instead of riding `inputProps`
 *     onto the real `<input>` — a `<div>` has no `stepUp()` and no `value`, and the smoke
 *     harness's `fill()` / `inputValue()` do not resolve against one either;
 *   - the element drifted to `type="text"`, which removes the arrows AND the native keyboard
 *     stepping this whole check exists to protect.
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

/**
 * Dispatch a real Up/Down key press, for a control that handles the key ITSELF.
 *
 * `ChanceSlider` intercepts Up/Down in `handleNumberKeydown` and commits through its own clamp, so
 * its keyboard stepping is component behaviour rather than user-agent behaviour and has to be
 * driven by the event. It is `cancelable` because the handler calls `preventDefault()`.
 *
 * @param {HTMLInputElement} input
 * @param {'up'|'down'} [direction]
 */
export function pressArrowKey(input, direction = 'up') {
  input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', {
      key: direction === 'up' ? 'ArrowUp' : 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
  );
}
