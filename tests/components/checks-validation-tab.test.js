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

  it('draws an older issue as its short title over its sentence (issue 2082)', async () => {
    const target = await harness.mount({
      sections: [unfinishedRoutedSection('crafting', '', '')],
    });
    const words = (id) => {
      const row = target.querySelector(`[data-issue="${id}"]`);
      return [
        row.querySelector('.manager-recipe-val-title').textContent.trim(),
        row.querySelector('.manager-recipe-val-detail').textContent.trim(),
      ];
    };
    assert.deepEqual(words('noRollFormula'), [
      'The check has no roll formula',
      'Nothing is rolled, so this check cannot resolve until you enter a formula.',
    ]);
    assert.deepEqual(words('unnamedOutcome'), [
      'An outcome tier has no name',
      'An unnamed tier cannot be routed to a result group. Name every tier.',
    ]);
    assert.deepEqual(words('noSuccessOutcome'), [
      'No tier counts as a success',
      'Every tier is marked as a failure, so this check can never succeed. Mark at least one tier as Success.',
    ]);
    harness.remount();
  });

  it('shows transformed modifier names as one warning without blocking readiness', async () => {
    const longName = 'A transformed modifier name long enough to wrap without clipping';
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'simple',
          check: { rollFormula: '1d20' },
          modifierContext: {
            catalogue: [
              { id: 'count', label: longName, expression: '1d20cs>15' },
              { id: 'flat', label: 'Flat', expression: '-2' },
            ],
            systemPolicy: 'highest',
            defaultModifierIds: ['count', 'flat'],
          },
        },
      ],
    });
    const issue = target.querySelector('[data-issue="modifierAverageUnavailable"]');
    assert.ok(issue, 'the ranking warning renders on the shared Validation row');
    assert.equal(issue.dataset.issueSeverity, 'warning');
    assert.match(issue.textContent, new RegExp(longName));
    assert.ok(!target.querySelector('[data-issue-severity="critical"]'), 'saving remains unblocked');
    assert.ok(!target.querySelector('[data-issue="modifierExpressionInvalid"]'));
    harness.remount();
  });

  it('names an invalid salvage override and an invalid gathering task override (issue 2078)', async () => {
    const attributeMultiply = {
      product: 'sum',
      direction: 'under',
      target: { source: 'attribute', expression: '@skills.craft.value', adjustmentKind: 'multiply' },
    };
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'salvage',
          mode: 'simple',
          check: { rollFormula: '1d20', evaluation: attributeMultiply },
          components: [
            { id: 'c1', name: 'Iron Longsword', salvage: { enabled: true, adjustmentOverride: -2 } },
          ],
        },
        {
          subsystem: 'gathering',
          mode: 'routed',
          check: { rollFormula: '1d20', evaluation: attributeMultiply },
          gatheringTasks: [
            { id: 't1', name: 'Prospect for Ore', resolutionMode: 'routed', adjustmentOverride: -2 },
          ],
        },
      ],
    });
    const salvageIssue = target.querySelector(
      '[data-checks-validation-section="salvage"] [data-issue="adjustmentInvalidForKind"]'
    );
    assert.ok(Boolean(salvageIssue), 'the salvage section lists the fault');
    assert.match(salvageIssue.textContent, /Iron Longsword/);
    const gatheringIssue = target.querySelector(
      '[data-checks-validation-section="gathering"] [data-issue="adjustmentInvalidForKind"]'
    );
    assert.ok(Boolean(gatheringIssue), 'the gathering section lists the fault');
    assert.match(gatheringIssue.textContent, /Prospect for Ore/);
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

  it('lists every issue row, blocking then warning, before the passes (issue 2130)', async () => {
    // A blocking tier, a ranking warning and a satisfied formula tick share one group.
    const target = await harness.mount({
      sections: [
        {
          ...unfinishedRoutedSection('crafting', '1d20', '  '),
          modifierContext: {
            catalogue: [
              { id: 'count', label: 'Count', expression: '1d20cs>15' },
              { id: 'flat', label: 'Flat', expression: '-2' },
            ],
            systemPolicy: 'highest',
            defaultModifierIds: ['count', 'flat'],
          },
        },
      ],
    });
    const group = target.querySelector('[data-checks-validation-section="crafting"]');
    const statuses = [...group.querySelectorAll('.manager-recipe-val-row')].map((row) =>
      ['block', 'warn', 'pass'].find((status) => row.classList.contains(`is-${status}`))
    );
    for (const status of ['block', 'warn', 'pass']) {
      assert.ok(statuses.includes(status), `the fixture draws a ${status} row`);
    }
    const rank = (status) => ['block', 'warn', 'pass'].indexOf(status);
    assert.deepEqual(
      statuses,
      [...statuses].sort((left, right) => rank(left) - rank(right)),
      `every issue row precedes every pass row; got ${JSON.stringify(statuses)}`
    );
    harness.remount();
  });

  it('names a check with warnings and no blocking issue "Enabled with warnings" (issue 2130)', async () => {
    const target = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '' } }],
    });
    assert.equal(railCounts(target).blocking, 0, 'the fixture blocks nothing');
    assert.ok(railCounts(target).warnings > 0, 'and warns');
    const hero = target.querySelector('[data-editor-validation-summary]');
    assert.equal(hero.dataset.editorValidationSummary, 'warn');
    assert.equal(
      hero.querySelector('.manager-recipe-rail-summary-title').textContent.trim(),
      'Enabled with warnings'
    );
    assert.equal(
      hero.querySelector('.manager-recipe-rail-summary-sub').textContent.trim(),
      'Saves and enables — review the warnings when you can.'
    );
    harness.remount();
  });

  it('words the blocked and the unsaved hero as the prototype does (issue 2130)', async () => {
    const heroText = (root) =>
      ['title', 'sub'].map((part) =>
        root.querySelector(`.manager-recipe-rail-summary-${part}`).textContent.trim()
      );
    const blocked = await harness.mount({
      sections: [unfinishedRoutedSection('crafting', '1d20', '  ')],
    });
    assert.deepEqual(heroText(blocked), [
      'Blocked from enabling',
      'Clear the blocking issues before this crafting system can be enabled.',
    ]);
    harness.remount();
    const unsaved = await harness.mount({
      sections: [{ subsystem: 'crafting', mode: 'simple', check: { rollFormula: '' } }],
      dirty: true,
      dirtyActivities: ['crafting'],
    });
    assert.equal(heroText(unsaved)[0], 'No blocking issues, but not saved yet', 'never "Clean"');
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

  it('lists a transient warning naming the Preview-as actor without counting it (issue 2003)', async () => {
    const section = {
      subsystem: 'crafting',
      mode: 'routed',
      check: {
        type: 'relative',
        rollFormula: '1d100',
        evaluation: {
          product: 'sum',
          direction: 'under',
          target: { source: 'attribute', expression: '@skills.craft.value', adjustmentKind: 'add' },
        },
        relativeOutcomes: [{ id: 'a', name: 'Success', success: true, dc: 0 }],
      },
    };
    const without = await harness.mount({ sections: [section] });
    const counted = railCounts(without);
    assert.ok(!without.querySelector('[data-issue-transient]'), 'no actor, no warning');
    harness.remount();

    const target = await harness.mount({
      sections: [section],
      previewActor: { name: 'Vosk', rollData: {} },
    });
    const row = target.querySelector('[data-issue="attributePathUnresolvedForPreview"]');
    assert.ok(Boolean(row), 'the warning is listed');
    assert.ok(row.hasAttribute('data-issue-transient'), 'and marked transient');
    assert.match(row.textContent, /"actor":"Vosk","path":"@skills\.craft\.value"/, 'naming them');
    assert.deepEqual(railCounts(target), counted, 'the tally is what it was with no actor');
    const hero = target.querySelector('[data-editor-validation-summary]');
    assert.equal(hero.dataset.editorValidationSummary, 'pass', 'a transient warning gates nothing');
    assert.match(hero.textContent, /HeroReady|Ready to enable/u, 'the hero stays Ready to enable');
    harness.remount();
  });

  it('lists the count pool faults route-only, and a count transient without counting it (issue 2004)', async () => {
    const section = {
      subsystem: 'crafting',
      mode: 'simple',
      check: {
        rollFormula: '',
        evaluation: {
          product: 'count',
          direction: 'under',
          pool: { die: 20, base: '2d4', threshold: '1d4 + 6', required: 3 },
        },
        tiers: [{ id: 'u', name: 'Unset Work', successes: null }],
      },
    };
    const calls = [];
    const target = await harness.mount({
      sections: [section],
      onSelectIssue: (route, focusTarget) => calls.push([route, focusTarget]),
    });
    for (const id of ['countPoolInvalid', 'countThresholdInvalid', 'countTierWithoutSuccesses']) {
      const row = target.querySelector(`[data-issue="${id}"]`);
      assert.ok(Boolean(row), `${id} is listed`);
      row.querySelector('.manager-recipe-val-view').click();
    }
    assert.ok(!target.querySelector('[data-issue="noRollFormula"]'), 'the retained formula is inert');
    assert.deepEqual(
      calls.map(([route, focusTarget]) => [route.section, focusTarget]),
      [
        ['roll', 'checks-count-base'],
        ['roll', 'checks-count-threshold'],
        ['roll', 'checks-count-tier-successes'],
      ],
      'each count row addresses the control that clears it (issue 2006)'
    );
    harness.remount();

    const pooled = {
      ...section,
      check: {
        rollFormula: '',
        evaluation: { product: 'count', pool: { base: '@skills.smith.rank', required: 1 } },
      },
    };
    const without = await harness.mount({ sections: [pooled] });
    const counted = railCounts(without);
    harness.remount();
    const withActor = await harness.mount({
      sections: [pooled],
      previewActor: { name: 'Vosk', rollData: {} },
    });
    const row = withActor.querySelector('[data-issue="countPathUnresolvedForPreview"]');
    assert.ok(row?.hasAttribute('data-issue-transient'), 'listed, and marked transient');
    assert.deepEqual(railCounts(withActor), counted, 'the tally is what it was with no actor');
    harness.remount();
  });

  it('shows a fault once, as its issue, when several success-counting checks fail at once (issue 2083)', async () => {
    // Four checks fail together here (issue 2004's success-counting pools can fail up to seven
    // ways at once): before this fix each one drew a generic checklist row AND its own issue
    // row, so a single set of real faults read as double its own count.
    const from = (value) => ({ enabled: true, faces: { kind: 'from', value } });
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'simple',
          check: {
            rollFormula: '',
            evaluation: {
              product: 'count',
              direction: 'over',
              pool: { die: 20, base: '2', threshold: '13', required: 2, cancel: from(25), explode: from(1) },
            },
            tiers: [
              { id: 'arcane', name: 'Arcane Work', successes: 3 },
              { id: 'unset', name: 'Unset Work', successes: null },
            ],
          },
        },
      ],
    });
    for (const [id, checkId] of [
      ['countFaceBeyondDie', 'countFacesOnDie'],
      ['countExplodeUnbounded', 'countExplosionStops'],
      ['countTierWithoutSuccesses', 'countTiersSetSuccesses'],
      ['countRequiredExceedsMaxPool', 'countRequiredWithinMaxPool'],
    ]) {
      const rows = target.querySelectorAll(`[data-issue="${id}"]`);
      assert.equal(rows.length, 1, `${id} reads once, not as a checklist row plus an issue row`);
      assert.equal(
        rows[0].dataset.check,
        checkId,
        `${id}'s row carries its owning check's tick/cross, on the SAME row`
      );
      assert.equal(rows[0].dataset.satisfied, 'false');
    }
    assert.deepEqual(
      railCounts(target),
      { passing: 3, warnings: 1, blocking: 3 },
      'one real warning and three real blockers (the unset tier blocks since issue 2006) — each once'
    );
    assert.deepEqual(
      tallyMatchingRail(target),
      railCounts(target),
      'the rail is a tally of the rows, so a fault counted twice would disagree with itself'
    );
    harness.remount();
  });

  it('blocks additional dice with no source beside the base-pool ceiling, View focusing the path (issue 2008)', async () => {
    const pool = (path) => ({
      die: 20,
      base: '2',
      threshold: '13',
      required: 2,
      additionalDice: { enabled: true, source: 'path', path, max: 1 },
    });
    const section = (path) => ({
      subsystem: 'crafting',
      mode: 'simple',
      check: {
        rollFormula: '',
        evaluation: { product: 'count', direction: 'over', pool: pool(path) },
        tiers: [{ id: 'arcane', name: 'Arcane Work', successes: 3 }],
      },
    });
    const calls = [];
    const target = await harness.mount({
      sections: [section('')],
      onSelectIssue: (route, focusTarget) => {
        calls.push([route, focusTarget]);
      },
    });
    const row = target.querySelector('[data-issue="countAdditionalDiceSourceMissing"]');
    assert.ok(Boolean(row), 'the source row is listed');
    assert.equal(row.dataset.check, 'countAdditionalDiceSourceSet', 'on its own tick');
    assert.equal(row.dataset.issueSeverity, 'critical');
    assert.equal(
      row.querySelector('.manager-recipe-val-title').textContent.trim(),
      'Additional dice are allowed but have no source'
    );
    assert.ok(
      Boolean(target.querySelector('[data-issue="countRequiredExceedsBasePool"]')),
      'the base-pool ceiling row is listed beside it'
    );
    assert.ok(!target.querySelector('[data-issue="countRequiredExceedsMaxPool"]'), 'Arcane Work fits the ceiling');
    row.querySelector('.manager-recipe-val-view').click();
    assert.deepEqual(calls, [[{ activity: 'crafting', section: 'roll' }, 'checks-additional-dice-path']]);
    assert.equal(target.querySelector('[data-editor-validation-summary]').dataset.editorValidationSummary, 'block');
    harness.remount();

    const stored = section('system.resources.momentum.value');
    const without = await harness.mount({ sections: [stored] });
    const counted = railCounts(without);
    assert.ok(!without.querySelector('[data-issue^="countAdditionalDice"]'), 'a stored path raises nothing');
    harness.remount();
    const withActor = await harness.mount({
      sections: [stored],
      previewActor: { name: 'Vosk', rollData: {}, readStored: () => ({ value: 2, overridden: true }) },
    });
    const transient = withActor.querySelector('[data-issue="countAdditionalDicePathUnresolvedForPreview"]');
    assert.ok(transient?.hasAttribute('data-issue-transient'), 'the overridden value is a transient row');
    assert.deepEqual(railCounts(withActor), counted, 'the tally is what it was with no actor');
    harness.remount();
  });

  it('never renders a false-green pass beside a progressive roll-under blocker (issue 2106 review)', async () => {
    // `progressiveHigherIsBetter` had no `CHECK_TO_ISSUES` owner, so this used to render BOTH a
    // real critical `progressiveUnderUnsupported` row AND a separate green pass tick for the very
    // check that fault is about.
    const target = await harness.mount({
      sections: [
        {
          subsystem: 'crafting',
          mode: 'progressive',
          check: { rollFormula: '1d20', evaluation: { product: 'sum', direction: 'under' } },
        },
      ],
    });
    const rows = target.querySelectorAll('[data-issue="progressiveUnderUnsupported"]');
    assert.equal(rows.length, 1, 'the fault reads once');
    const row = rows[0];
    assert.equal(row.dataset.check, 'progressiveHigherIsBetter', 'on the check it belongs to');
    assert.equal(row.dataset.satisfied, 'false');
    assert.equal(row.dataset.issueSeverity, 'critical');
    assert.ok(
      !target.querySelector('[data-check="progressiveHigherIsBetter"][data-satisfied="true"]'),
      'no pass row exists for a check this readiness result failed'
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

// ── A SUMMING FORMULA THAT COUNTS, AND ITS CONVERT (issue 2006, N21, N24) ─────────────────────
describe('the free-text counting formula row (issue 2006)', () => {
  before(async () => {
    await harness.setup();
  });
  after(() => {
    harness.teardown();
  });

  const summed = (rollFormula, extra = {}) => ({
    subsystem: 'crafting',
    mode: 'simple',
    check: {
      rollFormula,
      dc: 12,
      thresholdMode: 'meet',
      evaluation: { product: 'sum', direction: 'over', target: { source: 'fixed' } },
      ...extra,
    },
  });
  const row = (root) => root.querySelector('[data-issue="freeTextCountingFormula"]');
  const button = (root) => row(root).querySelector('.manager-recipe-val-view');

  it('carries Convert in place of View, named and described, and stages nothing itself', async () => {
    const converts = [];
    const selected = [];
    const target = await harness.mount({
      sections: [summed('2d20cs<=@skills.survival.value')],
      onConvert: (subsystem) => converts.push(subsystem),
      onSelectIssue: (route) => selected.push(route),
    });
    assert.equal(row(target).dataset.issueSeverity, 'warning');
    assert.equal(row(target).querySelectorAll('.manager-recipe-val-view').length, 1, 'one verb');
    const action = button(target);
    assert.ok(action.hasAttribute('data-validation-row-action'), 'the row action, not View');
    // The harness resolves no lang file, so the surface's localized words read as their keys.
    assert.equal(action.textContent.trim(), 'FABRICATE.Admin.Manager.Checks.Count.Convert.Action');
    assert.equal(action.dataset.keyboardFocus, 'true');
    const description = target.querySelector(`#${action.getAttribute('aria-describedby')}`);
    assert.equal(
      description.textContent.trim(),
      'FABRICATE.Admin.Manager.Checks.Count.Convert.Description'
    );
    action.click();
    assert.deepEqual(converts, ['crafting'], 'the host is asked to stage the conversion');
    assert.deepEqual(selected, [], 'Convert replaces View, it does not also route');
    assert.deepEqual(railCounts(target).blocking, 0, 'the warning feeds no blocking tally');
    harness.remount();
  });

  it('describes the exceed copy, and draws View alone for a formula that does not convert', async () => {
    const exceed = await harness.mount({ sections: [summed('6d10cs>=8', { thresholdMode: 'exceed' })] });
    const describedBy = button(exceed).getAttribute('aria-describedby');
    assert.equal(
      exceed.querySelector(`#${describedBy}`).textContent.trim(),
      'FABRICATE.Admin.Manager.Checks.Count.Convert.DescriptionExceed'
    );
    harness.remount();

    const calls = [];
    const target = await harness.mount({
      sections: [summed('6d10cs>=8df<=8')],
      onSelectIssue: (route, focusTarget) => calls.push([route.section, focusTarget]),
    });
    const view = button(target);
    assert.ok(!view.hasAttribute('data-validation-row-action'), 'no action, only View');
    assert.equal(view.textContent.trim(), 'FABRICATE.Admin.Manager.Validation.View');
    assert.ok(!view.hasAttribute('aria-describedby'));
    view.click();
    assert.deepEqual(calls, [['roll', 'checks-roll-formula']]);
    harness.remount();
  });

  it('is absent while the check counts, and for a formula that does not count', async () => {
    const counting = summed('2d20cs<=10', {
      evaluation: { product: 'count', direction: 'under', pool: { die: 20, base: '2', threshold: '10' } },
    });
    for (const section of [counting, summed('2d20kh1'), summed('1d20 + 5')]) {
      const target = await harness.mount({ sections: [section] });
      assert.ok(!row(target), JSON.stringify(section.check.rollFormula));
      harness.remount();
    }
  });
});

// ── THE PAIR, AND THE HOST THAT JOINS IT (issue 1517) ───────────────────────────────────────
describeValidationAddressPairing({
  title: 'every Checks address the producer emits is carried by a real control',
  producerFile: 'checks/checksReadiness.js',
  tableName: 'CHECK_ISSUE_CONTROLS',
  // From the two per-kind maps through the table, which names them by reference (issue 2006).
  tablePattern: /(const FACE_CONTROLS[\s\S]*?const CHECK_ISSUE_CONTROLS = Object\.freeze\(\{[\s\S]*?\n\}\);)/u,
  addressPattern: /'(checks-[^']+)'/gu,
  expectedAddressCount: 15,
  expectation:
    'the roll field, the character-value field, the trigger list, the seven count controls, ' +
    'the two advantage controls and the three additional-dice sources',
  // WHICH FILE IS SUPPOSED TO CARRY WHICH ADDRESS. This is the half a producer cannot check.
  destinations: {
    'checks-roll-formula': 'checks/CheckFormulaFields.svelte',
    'checks-target-expression': 'checks/CheckDifficultyCard.svelte',
    'checks-triggers': 'checks/CheckTriggers.svelte',
    'checks-count-base': 'checks/CheckCountPoolFields.svelte',
    'checks-count-threshold': 'checks/CheckCountPoolFields.svelte',
    'checks-count-explode': 'checks/CheckCountPoolFields.svelte',
    'checks-count-explode-face': 'checks/CheckCountPoolFields.svelte',
    'checks-count-cancel-face': 'checks/CheckCountPoolFields.svelte',
    'checks-count-required': 'checks/CheckDifficultyCard.svelte',
    'checks-count-tier-successes': 'checks/CheckRecipeTiers.svelte',
    'checks-advantage-mode': 'checks/CheckPromptOptions.svelte',
    'checks-advantage-bonus': 'checks/CheckPromptOptions.svelte',
    'checks-additional-dice-path': 'checks/CheckAdditionalDiceFields.svelte',
    'checks-additional-dice-read-macro': 'checks/CheckAdditionalDiceFields.svelte',
    'checks-additional-dice-spend-macro': 'checks/CheckAdditionalDiceFields.svelte',
  },
  // Stamped through a primitive's attribute bag or prop; the mounted Review tests focus each one
  // (`check-preview-mounted`, `check-count-readiness-mounted`). `checks-advantage-mode` is the
  // same shape: `SegmentedControl` stamps the literal onto its radio from an option prop, so no
  // `data-validation-target="checks-advantage-mode"` is ever written together in one file.
  // `checks-advantage-bonus` sits directly on its own `<input>`, so it is not deferred.
  focusProvenElsewhere: [
    'checks-target-expression',
    'checks-count-base',
    'checks-count-threshold',
    'checks-count-explode',
    'checks-count-explode-face',
    'checks-count-cancel-face',
    'checks-count-required',
    'checks-count-tier-successes',
    'checks-advantage-mode',
    'checks-additional-dice-path',
    'checks-additional-dice-read-macro',
    'checks-additional-dice-spend-macro',
  ],
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
