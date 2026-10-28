/** The Checks section strip speaks each section's count with the unit it counts (issue 2491). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
  APP_LOCALIZER_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-checks-tabs-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    ...APP_LOCALIZER_RAW_MODULES,
  ],
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/checks/ChecksEditorTabs.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksEditorTabs.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const section = (id, labelFallback, extra = {}) => ({
  id,
  icon: 'fas fa-list',
  labelKey: `FABRICATE.Admin.Manager.Checks.Sections.${labelFallback}`,
  labelFallback,
  count: null,
  issues: 0,
  ...extra,
});

describe('ChecksEditorTabs names its section counts', () => {
  it('states the unit per section, singular at one, and keeps the dot`s name in the tab name', async () => {
    const root = await harness.mount({
      sections: [
        section('outcomes', 'Outcomes', { count: 3, issues: 2 }),
        section('triggers', 'Triggers', { count: 1 }),
        section('modifiers', 'Modifiers', { count: 0 }),
        section('roll', 'Roll', { count: 2 }),
      ],
      activeSection: 'outcomes',
    });
    const name = (id) =>
      root.querySelector(`[data-checks-section-button="${id}"]`).getAttribute('aria-label');
    assert.equal(name('outcomes'), 'Outcomes, 3 outcomes, 2 issues');
    assert.equal(name('triggers'), 'Triggers, 1 trigger');
    assert.equal(name('modifiers'), null, 'a zero count draws nothing and names nothing');
    assert.equal(name('roll'), null, 'a section with no unit draws its numeral unnamed');
    assert.equal(root.querySelector('[data-checks-section-count="roll"]')?.textContent.trim(), '2');
  });
});
