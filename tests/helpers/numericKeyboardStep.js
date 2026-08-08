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
