/** `ChanceSlider` keeps its keyboard stepping, MOUNTED (issue 1050, register entry R1). */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/** The class string `ChanceSlider` writes inline on its root element, READ out of the component. */
const ROOT_CLASSES = (() => {
  const source = readFileSync(resolve(repoRoot, CHANCE_SLIDER), 'utf8');
  const match = source.match(/class="(fabricate-slider[^"]*)"/);
  assert.ok(match, 'ChanceSlider must write its family root inline on its root element');
  return match[1];
})();

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

/** The press-and-commit cases, as a table. */
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

describe('ChanceSlider root emission (issue 1508)', () => {
  // THE ROOT-EMISSION PROOF ON THE RENDERED DOM.
  it('renders its root span carrying the family root FIRST, on the element itself', async () => {
    const root = await harness.mount({ value: 40, min: 0, max: 100, step: 1 });
    const node = root.querySelector('[data-chance-slider]');
    assert.ok(Boolean(node), 'the slider renders its root element');
    assert.equal(node.tagName, 'SPAN');

    const value = node.getAttribute('class');
    // NAMED, rather than a `TypeError` on `null.split`.
    assert.ok(
      typeof value === 'string',
      'the slider rendered its root element with NO `class` attribute at all, so every rule ' +
        'rooted at `fabricate-slider` now matches nothing while the source text still reads right'
    );
    assert.equal(
      value.replace(/ ?svelte-[a-z0-9]+/g, ''),
      ROOT_CLASSES,
      'the rendered root must carry exactly the class string the component writes'
    );
    // THE POSITION, by equality rather than by `classList.contains`.
    assert.equal(value.split(/\s+/)[0], 'fabricate-slider');
  });

  it('renders the descendants every re-rooted rule is a chain beneath', async () => {
    // The family's other twenty-two selectors are DESCENDANT chains under that root.
    const root = await harness.mount({ value: 40, min: 0, max: 100, step: 1 });
    for (const selector of [
      '.fabricate-slider .manager-drop-rate-percent',
      '.fabricate-slider .manager-drop-rate-percent input[type="number"]',
      '.fabricate-slider .manager-drop-rate-control',
      '.fabricate-slider .manager-drop-rate-track',
      '.fabricate-slider .manager-drop-rate-fill',
      '.fabricate-slider .manager-drop-rate-control input[type="range"]',
    ]) {
      assert.ok(
        Boolean(root.querySelector(selector)),
        `the rendered tree must match \`${selector}\`, which is a shipped rule of this family`
      );
    }
  });
});

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
    // R1's whole justification. If the range half ever went away.
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
