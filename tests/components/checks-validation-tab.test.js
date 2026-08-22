import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-checks-validation-',
  // The ONE shared checks-tree manifest (issue 1095, BM9), imported rather than
  // re-typed. A `.js` or `.svelte` the tree renders but the harness omits HANGS the
  // suite (# cancelled) rather than failing it, so a per-file copy of this list is a
  // per-file chance to be silently unrunnable.
  rawModules: CHECKS_TREE_RAW_MODULES,
  compiledModules: CHECKS_TREE_COMPILED_MODULES,
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

  it('renders the tier-step target issues and their shared green tick (issue 975)', async () => {
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'a', name: 'Success', success: true, dc: 0 }],
            checkBreakage: {
              triggers: [
                {
                  id: 't1',
                  condition: { type: 'rollTotal', operator: '<=', value: 1 },
                  outcome: 'none',
                  breakTools: false,
                  tierStep: { mode: 'target', steps: 1, tierId: 'gone' },
                },
                {
                  id: 't2',
                  condition: { type: 'rollTotal', operator: '>=', value: 20 },
                  outcome: 'none',
                  breakTools: false,
                  tierStep: { mode: 'target', steps: 1, tierId: 'a' },
                },
              ],
            },
          },
        },
      ],
    });
    const tick = target.querySelector('[data-check="tierStepTargetsResolve"]');
    assert.ok(tick, 'the paired readiness check renders');
    assert.equal(tick.dataset.satisfied, 'false');
    // Both issues carry real localized copy, not a bare id echoed back to the GM.
    for (const id of ['danglingTierStepTarget', 'multipleTierStepTargets']) {
      const issue = target.querySelector(`[data-issue="${id}"]`);
      assert.ok(issue, `${id} is listed`);
      // The row title moved to the shared `EditorValidationSurface`'s own class when
      // issue 1096 rebuilt this route on it. Retargeted rather than dropped: what this
      // line proves — that the id resolves to real copy instead of being echoed at the GM
      // — is unchanged by which component renders the span.
      const title = issue.querySelector('.manager-recipe-val-title').textContent.trim();
      assert.notEqual(title, id, `${id} resolves to copy rather than echoing its own id`);
    }
    assert.ok(
      !target.querySelector('[data-issue-severity="critical"]'),
      'neither is critical — a target count is guidance, not breakage'
    );
    harness.remount();
  });

  it('reports a healthy check as zero counters and no issue rows', async () => {
    const target = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } }],
    });
    // The per-section "No issues detected." note retired with the hand-rolled markup: the
    // shared surface says the same thing with its three counters, which are a stronger
    // statement because they are also what the rail badge and the section dots are summed
    // from. Asserting on them rather than on the note keeps the claim ("this check is
    // clean") and drops only the sentence that used to carry it.
    assert.equal(
      target.querySelector('[data-editor-validation-count="blocking"]').textContent.trim(),
      '0'
    );
    assert.equal(
      target.querySelector('[data-editor-validation-count="warnings"]').textContent.trim(),
      '0'
    );
    assert.ok(
      !target.querySelector('[data-issue]'),
      'a clean check lists no issue rows at all'
    );
    harness.remount();
  });

  it('deep-links each issue to the ACTIVITY and the SECTION that owns its control', async () => {
    // The whole point of rebuilding on the shared surface. A GM who reads "no roll formula"
    // on this route has to get to the control that fixes it, and the section is half of
    // that answer — the map this reads is proven exhaustive against the frozen issue
    // registry in `tests/checks-readiness.test.js`, so an id can never bucket nowhere.
    const selected = [];
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'salvage',
          mode: 'routed',
          check: {
            type: 'relative',
            rollFormula: '',
            relativeOutcomes: [{ id: 'a', name: '', success: false, dc: 0 }],
          },
        },
      ],
      onSelectIssue: (target_) => selected.push(target_),
    });
    const rows = [...target.querySelectorAll('[data-issue]')];
    assert.ok(rows.length >= 2, 'the fixture raises more than one issue');
    for (const row of rows) row.querySelector('.manager-recipe-val-view').click();
    assert.deepEqual(
      selected.filter((entry) => entry.section === 'roll').map((entry) => entry.activity),
      ['salvage'],
      'the missing formula routes to the salvage roll section'
    );
    assert.ok(
      selected.some((entry) => entry.section === 'outcomes'),
      'the unnamed tier routes to Outcomes'
    );
    assert.ok(
      selected.every((entry) => typeof entry.section === 'string' && entry.section),
      'no issue deep-links to a null section'
    );
    harness.remount();
  });
});
