/** `inputProps['aria-invalid']` reaches `Stepper`'s real `<input>` in the numeric, formatted and vertical forms (issue 3042). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { afterEach, after, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-stepper-invalid-',
  compiledModules: [STEPPER],
  componentPath: STEPPER,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const FORMS = {
  numeric: {},
  formatted: { formatValue: String, parseValue: Number },
  vertical: { orientation: 'vertical' },
};

describe('Stepper inputProps aria-invalid', () => {
  for (const [form, extra] of Object.entries(FORMS)) {
    it(`reaches the ${form} input and no other node`, async () => {
      const root = await harness.mount({
        value: 3,
        ariaLabel: 'Count',
        inputProps: { 'aria-invalid': 'true' },
        ...extra,
      });
      const invalid = [...root.querySelectorAll('[aria-invalid]')];
      assert.equal(invalid.length, 1);
      assert.ok(invalid[0].matches('input[data-stepper-input]'), 'the input carries it');
      assert.equal(invalid[0].getAttribute('aria-invalid'), 'true');
    });

    it(`leaves the ${form} input valid when the key is absent`, async () => {
      const root = await harness.mount({ value: 3, ariaLabel: 'Count', ...extra });
      assert.ok(!root.querySelector('[aria-invalid]'), 'no aria-invalid without the key');
    });
  }
});
