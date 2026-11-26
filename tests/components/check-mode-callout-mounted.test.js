/** The Checks mode callout's outcome-tier fact, mounted: singular at exactly one (issue 3030). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { CHECK_EDITOR_RAW_MODULES } from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const CALLOUT_PATH = 'src/ui/svelte/apps/manager/checks/CheckModeCallout.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-check-mode-callout-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: [CALLOUT_PATH],
  componentPath: CALLOUT_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('CheckModeCallout outcome-tier fact', () => {
  for (const [outcomeCount, expected] of [
    [0, '0 tiers'],
    [1, '1 tier'],
    [2, '2 tiers'],
  ]) {
    it(`reads "${expected}" at ${outcomeCount}`, async () => {
      const root = await harness.mount({
        activity: 'crafting',
        mode: 'routedByCheck',
        outcomeCount,
      });
      const value = root.querySelector(':scope [data-checks-mode-fact="outcomes"] b');
      assert.ok(Boolean(value), 'the outcomes fact renders its value');
      assert.equal(value.textContent.trim(), expected);
    });
  }
});
