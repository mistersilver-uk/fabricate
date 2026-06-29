import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-checks-validation-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // checksReadiness classifies fixed-tier ranges via the shared expression util.
    'src/utils/craftingCheckExpression.js',
    'src/ui/svelte/apps/manager/checks/checksReadiness.js',
  ],
  compiledModules: ['src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte',
});

describe('ChecksValidationTab (mounted)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('renders a per-subsystem section for every in-play check', async () => {
    const target = await harness.mount({
      sections: [
        { subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } },
        { subsystem: 'salvage', mode: 'simple', check: { rollFormula: '1d20' } },
      ],
    });
    assert.ok(
      target.querySelector('[data-checks-validation-section="crafting"]'),
      'a crafting section renders'
    );
    assert.ok(
      target.querySelector('[data-checks-validation-section="salvage"]'),
      'a salvage section renders'
    );
    harness.remount();
  });

  it('shows the roll-formula readiness check and a warning when the formula is missing', async () => {
    const target = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '' } }],
    });
    const formulaCheck = target.querySelector(
      '[data-checks-validation-section="crafting"] [data-check="hasRollFormula"]'
    );
    assert.ok(formulaCheck, 'the roll-formula readiness check renders');
    assert.equal(formulaCheck.dataset.satisfied, 'false', 'it is unsatisfied with no formula');
    assert.ok(
      target.querySelector('[data-issue="noRollFormula"]'),
      'a missing-formula issue is listed'
    );
    assert.ok(
      target.querySelector('[data-issue-severity="warning"]'),
      'the missing formula is a warning'
    );
    harness.remount();
  });

  it('lists routed outcome-tier issues (unnamed tier, no Success) as critical', async () => {
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'a', name: '  ', success: false, dc: 0 }],
          },
        },
      ],
    });
    assert.ok(target.querySelector('[data-issue="unnamedOutcome"]'), 'unnamed tier issue listed');
    assert.ok(target.querySelector('[data-issue="noSuccessOutcome"]'), 'no-Success issue listed');
    assert.ok(
      target.querySelector('[data-issue-severity="critical"]'),
      'a critical issue group renders'
    );
    harness.remount();
  });

  it('reports a healthy check with a per-section no-issues note', async () => {
    const target = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } }],
    });
    assert.ok(
      target.querySelector('[data-checks-no-issues="crafting"]'),
      'the crafting section reports no issues'
    );
    assert.equal(
      target.querySelector('[data-issue-severity="critical"]'),
      null,
      'no critical issues are listed'
    );
    harness.remount();
  });
});
