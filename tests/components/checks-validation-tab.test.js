import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { railCounts, tallyMatchingRail } from '../helpers/validationSurfaceReadings.js';
import {
  describeValidationAddressPairing,
  describeValidationHostContract,
} from '../helpers/validationAddressContracts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-checks-validation-',
  // The ONE shared checks-tree manifest (issue 1095, BM9).
  rawModules: CHECKS_TREE_RAW_MODULES,
  compiledModules: CHECKS_TREE_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte',
});

// ── THE ROUTED FIXTURES, BUILT RATHER THAN RE-TYPED ─────────────────────────────────────────

/** A routed check whose only tier is unnamed and not a Success: raises both outcome issues. */
const unfinishedRoutedSection = (subsystem, rollFormula, tierName) => ({
  subsystem,
  mode: 'routed',
  check: {
    type: 'relative',
    rollFormula,
    relativeOutcomes: [{ id: 'a', name: tierName, success: false, dc: 0 }],
  },
});

/**
 * A routed crafting check with a healthy Success tier whose breakage triggers name tier targets.
 *
 * @param {...[string, string, number, string]} targets `[trigger id, operator, value, tier id]`.
 */
const tierStepTargetSection = (...targets) => ({
  subsystem: 'crafting',
  mode: 'routed',
  check: {
    type: 'relative',
    rollFormula: '1d20',
    relativeOutcomes: [{ id: 'a', name: 'Success', success: true, dc: 0 }],
    checkBreakage: {
      triggers: targets.map(([id, operator, value, tierId]) => ({
        id,
        condition: { type: 'rollTotal', operator, value },
        outcome: 'none',
        breakTools: false,
        tierStep: { mode: 'target', steps: 1, tierId },
      })),
    },
  },
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
      sections: [unfinishedRoutedSection('crafting', '1d20', '  ')],
    });
    assert.ok(target.querySelector('[data-issue="unnamedOutcome"]'), 'unnamed tier issue listed');
    assert.ok(target.querySelector('[data-issue="noSuccessOutcome"]'), 'no-Success issue listed');
    assert.ok(
      target.querySelector('[data-issue-severity="critical"]'),
      'a critical issue group renders'
    );
    harness.remount();
  });

  it('draws a critical issue ABOVE the ticks of its own subsystem group (issue 1517)', async () => {
    // THE ONE ROUTE WHERE TWO KINDS OF ROW SHARE A GROUP.
    const target = await harness.mount({
      sections: [unfinishedRoutedSection('crafting', '1d20', '  ')],
    });
    const rows = [
      ...target.querySelectorAll(
        '[data-checks-validation-section="crafting"] .manager-recipe-val-row'
      ),
    ];
    const kinds = rows.map((row) => (row.dataset.issue ? 'issue' : 'tick'));
    const ticks = kinds.indexOf('tick');
    assert.ok(ticks >= 0, 'the fixture draws at least one check tick to be risen above');
    assert.ok(
      rows.filter((row) => row.dataset.issueSeverity === 'critical').length > 0,
      'and at least one critical issue'
    );
    const lastCritical = rows.reduce(
      (found, row, index) => (row.dataset.issueSeverity === 'critical' ? index : found),
      -1
    );
    assert.ok(
      lastCritical < ticks,
      'every critical issue must precede the first tick of its group. A GM opens this tab ' +
        'because something is wrong, and reads down: the blocker cannot sit under a list of ' +
        `things that passed. Got ${JSON.stringify(kinds)} with the last critical at ` +
        `${lastCritical} and the first tick at ${ticks}`
    );
    harness.remount();
  });

  it('renders the tier-step target issues and their shared green tick (issue 975)', async () => {
    const target = await harness.mount({
      sections: [tierStepTargetSection(['t1', '<=', 1, 'gone'], ['t2', '>=', 20, 'a'])],
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
    // The per-section "No issues detected." note retired with the hand-rolled markup.
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

  it('counts the synthesised result row of a subsystem with no tick and no issue', async () => {
    // THE STATE THE RAIL'S REWRITE WAS FOR.
    const target = await harness.mount({
      sections: [{ subsystem: 'gathering', mode: 'none', check: {} }],
    });

    assert.ok(
      Boolean(target.querySelector('[data-checks-no-issues="gathering"]')),
      'the group states its result rather than rendering a heading over nothing'
    );
    assert.equal(
      target.querySelector('[data-editor-validation-count="passing"]').textContent.trim(),
      '1',
      'and the rail counts that row, where it read 0'
    );
    assert.deepEqual(
      tallyMatchingRail(target),
      railCounts(target),
      'the rail is a TALLY OF THE ROWS, so the two cannot disagree - which is the whole defect: ' +
        'a count is a reading of a result, and there were two readings'
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
      sections: [unfinishedRoutedSection('salvage', '', '')],
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

  // ── THE ROW ACTION'S TWO ADDRESSES (issue 1517) ─────────────────────────────────────────────
  describe('the Checks validation row action addresses a control (issue 1517)', () => {
    const viewButton = (root, id) =>
      root.querySelector(`[data-issue="${id}"] .manager-recipe-val-view`);

    it('hands the host BOTH addresses for a roll issue, and the ROUTE ALONE for an outcomes one', async () => {
      // WHICH OF THE TWO SHAPES A ROW IS, asserted rather than assumed. Route-only is a stated
      // outcome on this route and not a degradation: the Outcomes section's tier rows are
      // authored inline in the check editors and the row names no single tier, so those rows
      // change route and focus nothing. A `focusTarget` quietly going missing from the roll row
      // would otherwise degrade into exactly that, invisibly.
      const calls = [];
      const target = await harness.mount({
        sections: [unfinishedRoutedSection('salvage', '', '')],
        onSelectIssue: (route, focusTarget) => calls.push([route, focusTarget]),
      });

      viewButton(target, 'noRollFormula').click();
      viewButton(target, 'unnamedOutcome').click();
      assert.deepEqual(calls, [
        [{ activity: 'salvage', section: 'roll' }, 'checks-roll-formula'],
        [{ activity: 'salvage', section: 'outcomes' }, undefined],
      ]);
      harness.remount();
    });

    it('addresses the trigger LIST for a tier-step issue, which is a set rather than one control', async () => {
      const calls = [];
      const target = await harness.mount({
        sections: [tierStepTargetSection(['t1', '<=', 1, 'gone'])],
        onSelectIssue: (route, focusTarget) => calls.push([route, focusTarget]),
      });
      viewButton(target, 'danglingTierStepTarget').click();
      assert.deepEqual(calls, [[{ activity: 'crafting', section: 'triggers' }, 'checks-triggers']]);
      harness.remount();
    });

    it('gives a satisfied tick no action at all, so the button only ever reaches a defect', async () => {
      const target = await harness.mount({
        sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '1d20' } }],
      });
      const tick = target.querySelector('[data-check="hasRollFormula"]');
      assert.equal(tick.dataset.satisfied, 'true', 'the fixture draws a satisfied tick');
      assert.ok(
        !tick.querySelector('.manager-recipe-val-view'),
        'and a passing tick renders no View button'
      );
      harness.remount();
    });
  });
});

// ── THE PAIR, AND THE HOST THAT JOINS IT (issue 1517) ───────────────────────────────────────
describeValidationAddressPairing({
  title: 'every Checks address the producer emits is carried by a real control',
  producerFile: 'checks/ChecksValidationTab.svelte',
  tableName: 'CHECK_ISSUE_CONTROLS',
  tablePattern: /const CHECK_ISSUE_CONTROLS = Object\.freeze\(\{([\s\S]*?)\n {2}\}\);/u,
  addressPattern: /'([^']+)',/gu,
  expectedAddressCount: 2,
  expectation: 'the roll field and the trigger list',
  // WHICH FILE IS SUPPOSED TO CARRY WHICH ADDRESS. This is the half a producer cannot check.
  destinations: {
    'checks-roll-formula': 'checks/CheckFormulaFields.svelte',
    'checks-triggers': 'checks/CheckTriggers.svelte',
  },
  routeNoun: 'route',
  destinationNoun: 'section',
});

describeValidationHostContract({
  title: 'ChecksView wires the row action in the order the mechanism needs',
  hostFile: 'checks/ChecksView.svelte',
  tabComponent: 'ChecksValidationTab',
  routeCall: 'onOpenActivity(',
  regionMarker: 'data-checks-issue-announcement',
  regionOutsideNoun: 'route switch',
  mustPrecede: [
    {
      marker: "{#if activity === 'validation'}",
      present: 'the route switch must exist',
      order: 'the region sits outside the route switch',
    },
  ],
});
