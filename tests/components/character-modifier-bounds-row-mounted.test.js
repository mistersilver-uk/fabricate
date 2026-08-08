/**
 * `CharacterModifierBoundsRow` MOUNTED (issue 1050) — the forwarding contract, not just the
 * primitive's own emission.
 *
 * Mutation testing on PR #1053 found the real gap: `allowUnset` being present on a call site
 * proves the PRIMITIVE (`Stepper`) emits `null` when cleared — `stepper-unset-fill.test.js` pins
 * that — and `stepper-call-site-contract.test.js` proves this row PASSES `allowUnset` through.
 * Neither can see the row's own `patch` functions in between:
 *
 *   patch: (next) => ({ min: next })
 *
 * coercing `next` from `null` to `0` there (e.g. `next ?? 0`) is format-clean, lint-clean, and
 * every existing suite — including both contract suites above — stays green through it. Only
 * mounting the row and reading what its `onChange` callback actually RECEIVES can see that.
 *
 * One mounted suite on this component covers all four genuine-absence character-modifier bounds
 * (drop min/max, event min/max — D1a): the row was extracted in issue 1050 precisely so the two
 * call sites in `CraftingSystemManagerRoot.svelte` share one `<Stepper>` driven from a two-entry
 * descriptor list, rather than four near-identical markup blocks.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ROW_PATH = 'src/ui/svelte/apps/manager/environment/CharacterModifierBoundsRow.svelte';
const STEPPER_PATH = 'src/ui/svelte/components/Stepper.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-character-modifier-bounds-row-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js', 'src/ui/svelte/components/stepperLabels.js'],
  compiledModules: [STEPPER_PATH, ROW_PATH],
  componentPath: ROW_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Mount the row and return its two Stepper inputs plus the recorded `onChange` patches. */
async function mountRow(props) {
  const patches = [];
  const root = await harness.mount({ ...props, onChange: (patch) => patches.push(patch) });
  const inputs = [...root.querySelectorAll('[data-stepper-input]')];
  return { patches, minInput: inputs[0], maxInput: inputs[1] };
}

/** Type `raw` into the field the way a user would, firing the real `input` event. */
function type(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

// ── One shared shape for both bounds, so the table carries the difference rather than a second
//    near-identical `it()` block (SonarCloud new-code duplication) ───────────────────────────
const BOUND_CASES = [
  { key: 'min', field: 'minInput', value: 5 },
  { key: 'max', field: 'maxInput', value: 20 },
];

describe('CharacterModifierBoundsRow forwarding contract (issue 1050)', () => {
  for (const { key, field, value } of BOUND_CASES) {
    it(`clearing the ${key} bound emits { ${key}: null }, not { ${key}: 0 }`, async () => {
      const { patches, [field]: input } = await mountRow({ [key]: value });
      type(input, '');
      assert.deepEqual(
        patches,
        [{ [key]: null }],
        `clearing ${key} must forward absence through the row's own patch, not a coerced 0`
      );
      assert.notDeepEqual(patches, [{ [key]: 0 }], `a cleared ${key} bound is not a bound of 0`);
    });

    it(`entering a real number for ${key} emits that number, so the callback is proven to fire`, async () => {
      const { patches, [field]: input } = await mountRow({ [key]: null });
      type(input, '7');
      assert.deepEqual(
        patches,
        [{ [key]: 7 }],
        `a real edit to ${key} must reach the update callback with the typed number`
      );
    });
  }

  it('keeps the two bounds independent — editing min never emits a max patch and vice versa', async () => {
    const { patches, minInput } = await mountRow({ min: 5, max: 20 });
    type(minInput, '');
    assert.deepEqual(patches, [{ min: null }], 'only the edited bound is patched');
  });
});
