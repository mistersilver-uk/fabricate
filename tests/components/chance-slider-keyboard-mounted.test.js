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

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
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

/**
 * The press-and-commit cases, as a table.
 *
 * Each one mounts a slider, presses arrows and reads back what the component committed — so
 * written out as separate `it()` bodies they were the same six lines three times over, differing
 * only in the props, the presses and the expected values. Those are the table; the body below is
 * written once.
 *
 * `commits` is the WHOLE call log after each press, not the last entry, so a case that committed
 * twice for one press fails rather than passing on its final value. `displays` is asserted after
 * every press for the reason the first case's comment used to give: reading the field only at the
 * END of a round trip that returns to its starting value cannot fail — it starts there — so the
 * read has to happen while the value is somewhere the mount did not put it.
 */
const KEYBOARD_CASES = [
  {
    title: 'steps and commits on ArrowUp and ArrowDown',
    props: { value: 40, min: 0, max: 100, step: 1 },
    presses: [
      { direction: 'up', commits: [41], displays: '41', why: 'ArrowUp steps through the clamp' },
      {
        direction: 'down',
        commits: [41, 40],
        displays: '40',
        why: 'and ArrowDown steps back',
      },
    ],
  },
  {
    // The clamp is the reason this component handles the key itself instead of leaving it to the
    // browser, so a keyboard test that never reached a bound would not distinguish the two.
    title: 'clamps a keyboard step at the bounds rather than running past them',
    props: { value: 100, min: 0, max: 100, step: 1 },
    presses: [
      { direction: 'up', commits: [100], displays: '100', why: 'stepping past the max commits it' },
    ],
  },
  {
    title: 'honours a step size larger than one',
    props: { value: 20, min: 0, max: 100, step: 5 },
    presses: [
      { direction: 'up', commits: [25], displays: '25', why: 'it steps by its own `step`, not 1' },
    ],
  },
];

describe('ChanceSlider keyboard stepping (issue 1050, R1)', () => {
  for (const testCase of KEYBOARD_CASES) {
    it(testCase.title, async () => {
      const { calls, number } = await mountSlider(testCase.props);
      for (const press of testCase.presses) {
        pressArrowKey(number, press.direction);
        assert.deepEqual(calls, press.commits, press.why);
        assert.equal(number.value, press.displays, `${press.why} — and the field follows it`);
      }
    });
  }

  it('keeps the range track as the pointer affordance the suppression rule relies on', async () => {
    // R1's whole justification. If the range half ever went away, the number field would be a bare
    // input with a suppressed spinner and no pointer path at all — R2's situation, but broken.
    //
    // This used to assert `range.type === 'range'`, which the `input[type="range"]` query that
    // FOUND the element already entails — it could not fail. What R1 actually rests on is not
    // that a range element exists but that it drives the SAME value: one number, two
    // affordances. So the track is dragged and the number half is read back, which is the part
    // the query cannot imply and which fails if the two halves are ever decoupled.
    const { calls, number, range } = await mountSlider({ value: 40, min: 0, max: 100, step: 1 });
    range.value = '73';
    range.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();
    assert.deepEqual(calls, [73], 'dragging the track commits through the shared clamp');
    assert.equal(number.value, '73', 'and the number half re-renders to the value the track set');
  });
});
