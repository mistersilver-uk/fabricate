/**
 * `ChanceSlider` keeps its keyboard stepping, MOUNTED (issue 1050, register entry R1).
 *
 * R1 is the one control allowed to keep a bare `type="number"` and still lose its native spinner:
 * its sibling `type="range"` track is already a pointer-driven stepping affordance for the same
 * value, so the drawn arrows would be a third path to one number. That carve-out is only sound
 * while the KEYBOARD path survives, and here the keyboard path is not the browser's — this
 * component intercepts Up/Down in `handleNumberKeydown` and commits through its own clamp,
 * calling `preventDefault()` so the native step never runs.
 *
 * `handleNumberKeydown` therefore became load-bearing the moment Phase 5 shipped the suppression
 * rule, and nothing tested it. Deleting it would leave the field pointer-only for anyone reaching
 * it through the number input, which is exactly the regression PR #1037 refused to ship — and it
 * would fail no test in the repo without this one. `stepper-spinner.test.js` pins that the handler
 * is still WIRED; this pins that it still works.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { pressArrowKey } from '../helpers/numericKeyboardStep.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CHANCE_SLIDER = 'src/ui/svelte/components/ChanceSlider.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chance-slider-keyboard-',
  // Import-free leaf, so it needs no `rawModules` and nothing else compiled.
  compiledModules: [CHANCE_SLIDER],
  componentPath: CHANCE_SLIDER,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Mount a slider and return its two inputs plus the recorded `onChange` arguments. */
async function mountSlider(props = {}) {
  const calls = [];
  const root = await harness.mount({ ...props, onChange: (next) => calls.push(next) });
  const number = root.querySelector('input[type="number"]');
  const range = root.querySelector('input[type="range"]');
  assert.ok(Boolean(number), 'the number half renders');
  assert.ok(Boolean(range), 'and the range track it shares its value with');
  return { calls, number, range };
}

describe('ChanceSlider keyboard stepping (issue 1050, R1)', () => {
  it('steps and commits on ArrowUp and ArrowDown', async () => {
    const { calls, number } = await mountSlider({ value: 40, min: 0, max: 100, step: 1 });
    pressArrowKey(number, 'up');
    assert.deepEqual(calls, [41], 'ArrowUp commits the stepped value through the clamp');
    pressArrowKey(number, 'down');
    assert.deepEqual(calls, [41, 40], 'and ArrowDown steps back');
    assert.equal(number.value, '40', 'the displayed value follows the commit');
  });

  it('clamps a keyboard step at the bounds rather than running past them', async () => {
    // The clamp is the reason this component handles the key itself instead of leaving it to the
    // browser, so a keyboard test that never reached a bound would not distinguish the two.
    const { calls, number } = await mountSlider({ value: 100, min: 0, max: 100, step: 1 });
    pressArrowKey(number, 'up');
    assert.deepEqual(calls, [100], 'stepping past the max commits the max');
  });

  it('honours a step size larger than one', async () => {
    const { calls, number } = await mountSlider({ value: 20, min: 0, max: 100, step: 5 });
    pressArrowKey(number, 'up');
    assert.deepEqual(calls, [25], 'the component steps by its own `step`, not by 1');
  });

  it('keeps the range track as the pointer affordance the suppression rule relies on', async () => {
    // R1's whole justification. If the range half ever went away, the number field would be a bare
    // input with a suppressed spinner and no pointer path at all — R2's situation, but broken.
    const { range } = await mountSlider({ value: 40 });
    assert.equal(range.type, 'range', 'the sibling track is still a real range input');
  });
});
