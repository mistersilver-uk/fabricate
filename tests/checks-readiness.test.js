import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CHECK_ISSUE_SECTIONS,
  CHECK_READINESS_ISSUE_IDS,
  CHECK_READINESS_MODES,
  CHECK_SECTION_IDS,
  evaluateCheckReadiness,
  readinessModeForSlot,
  sectionForIssue,
} from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import {
  buildCheckModifierContext,
  resolveActiveCraftingCheckFormula,
} from '../src/systems/checkModifierResolver.js';
import {
  CHECK_ISSUE_LABELS,
  CHECK_TICK_LABELS,
  checkIssueCopy,
  interpolate,
} from '../src/ui/svelte/apps/manager/checks/checksCopy.js';
import { planRetiredPlaceholderStrip } from '../src/utils/craftingCheckExpression.js';
import { RETIRED_PLACEMENT_CORPUS } from './helpers/retiredPlaceholderOracle.js';
import { recordedModifierRoll } from './helpers/recordedModifierRollShapes.js';

const repoRoot = resolve(import.meta.dirname, '..');

function check(checks, id) {
  return checks.find((entry) => entry.id === id);
}

function routedWithTargets(tierIds, outcomes = [{ id: 'a', name: 'Success', success: true, dc: 0 }]) {
  return {
    type: 'relative',
    rollFormula: '1d20',
    relativeOutcomes: outcomes,
    checkBreakage: {
      triggers: tierIds.map((tierId, index) => ({
        id: `t${index}`,
        condition: { type: 'rollTotal', operator: '<=', value: 1 },
        outcome: 'none',
        breakTools: false,
        tierStep: { mode: 'target', steps: 1, tierId },
      })),
    },
  };
}

describe('evaluateCheckReadiness', () => {
  it('flags a simple check with no roll formula', () => {
    const { checks, issues } = evaluateCheckReadiness({ rollFormula: '' }, { mode: 'simple' });
    assert.equal(check(checks, 'hasRollFormula').satisfied, false);
    assert.ok(issues.some((i) => i.id === 'noRollFormula' && i.severity === 'warning'));
    // Simple checks have no outcome-tier rules.
    assert.equal(check(checks, 'outcomesNamed'), undefined);
    assert.equal(check(checks, 'hasSuccessOutcome'), undefined);
  });

  it('reports a simple check with a formula as ready', () => {
    const { checks, issues } = evaluateCheckReadiness({ rollFormula: '1d20' }, { mode: 'simple' });
    assert.equal(check(checks, 'hasRollFormula').satisfied, true);
    assert.equal(issues.length, 0);
  });

  it('returns nothing to validate for the gathering d100 roll', () => {
    const { checks, issues } = evaluateCheckReadiness({}, { mode: 'none' });
    assert.equal(checks.length, 0);
    assert.equal(issues.length, 0);
  });

  it('flags an unnamed routed outcome tier', () => {
    const { checks, issues } = evaluateCheckReadiness(
      {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [
          { id: 'a', name: 'Success', success: true, dc: 0 },
          { id: 'b', name: '   ', success: false, dc: -5 },
        ],
      },
      { mode: 'routed' }
    );
    assert.equal(check(checks, 'outcomesNamed').satisfied, false);
    assert.ok(issues.some((i) => i.id === 'unnamedOutcome' && i.severity === 'critical'));
  });

  it('flags a routed check with no Success tier', () => {
    const { checks, issues } = evaluateCheckReadiness(
      {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [{ id: 'a', name: 'Botch', success: false, dc: 0 }],
      },
      { mode: 'routed' }
    );
    assert.equal(check(checks, 'hasSuccessOutcome').satisfied, false);
    assert.ok(issues.some((i) => i.id === 'noSuccessOutcome' && i.severity === 'critical'));
  });

  it('flags overlapping and invalid fixed tier ranges', () => {
    const { checks, issues } = evaluateCheckReadiness(
      {
        type: 'fixed',
        rollFormula: '1d20',
        fixedOutcomes: [
          { id: 'a', name: 'Low', success: true, start: 1, end: 12 },
          { id: 'b', name: 'High', success: true, start: 10, end: 20 },
          { id: 'c', name: 'Bad', success: true, start: 30, end: 25 },
        ],
      },
      { mode: 'routed' }
    );
    assert.equal(check(checks, 'rangesNoOverlap').satisfied, false);
    assert.equal(check(checks, 'rangesValid').satisfied, false);
    assert.ok(issues.some((i) => i.id === 'rangeOverlap' && i.severity === 'critical'));
    assert.ok(issues.some((i) => i.id === 'rangeInvalid' && i.severity === 'critical'));
  });

  it('reports a well-formed routed check as ready', () => {
    const { issues } = evaluateCheckReadiness(
      {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [
          { id: 'a', name: 'Success', success: true, dc: 0 },
          { id: 'b', name: 'Failure', success: false, dc: -5 },
        ],
      },
      { mode: 'routed' }
    );
    assert.equal(issues.length, 0);
  });

  it('does not apply outcome-tier rules to a routed check with no tiers yet', () => {
    const { checks, issues } = evaluateCheckReadiness(
      { type: 'relative', rollFormula: '1d20', relativeOutcomes: [] },
      { mode: 'routed' }
    );
    // Only the roll-formula readiness check applies; an empty tier list is not an error.
    assert.equal(check(checks, 'outcomesNamed'), undefined);
    assert.equal(check(checks, 'hasSuccessOutcome'), undefined);
    assert.equal(issues.length, 0);
  });
});

describe('evaluateCheckReadiness: tier-step targets (issue 975)', () => {
  it('says nothing at all when no trigger sets a target', () => {
    const { checks, issues } = evaluateCheckReadiness(
      {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [{ id: 'a', name: 'Success', success: true, dc: 0 }],
        checkBreakage: {
          triggers: [
            {
              id: 't0',
              condition: { type: 'rollTotal', operator: '<=', value: 1 },
              outcome: 'none',
              breakTools: false,
              tierStep: { mode: 'up', steps: 2, tierId: null },
            },
          ],
        },
      },
      { mode: 'routed' }
    );
    assert.equal(check(checks, 'tierStepTargetsResolve'), undefined, 'no target, no rule');
    assert.equal(issues.length, 0, 'a relative step is never a target problem');
  });

  it('ticks the paired check when a single target resolves', () => {
    const { checks, issues } = evaluateCheckReadiness(routedWithTargets(['a']), { mode: 'routed' });
    assert.equal(check(checks, 'tierStepTargetsResolve').satisfied, true);
    assert.equal(issues.length, 0);
  });

  it('warns on a target naming no tier on the active list', () => {
    const { checks, issues } = evaluateCheckReadiness(routedWithTargets(['gone']), {
      mode: 'routed',
    });
    assert.equal(check(checks, 'tierStepTargetsResolve').satisfied, false);
    assert.ok(issues.some((i) => i.id === 'danglingTierStepTarget' && i.severity === 'warning'));
  });

  it('treats a target that has chosen no tier at all as dangling', () => {
    const { issues } = evaluateCheckReadiness(routedWithTargets([null]), { mode: 'routed' });
    assert.ok(issues.some((i) => i.id === 'danglingTierStepTarget'));
  });

  it('reports a target authored before any tier exists', () => {
    // The tier-count gate on the outcome rules must not swallow this: authoring the
    // trigger first is a normal top-down order, and the relative↔fixed type switch
    // dangles every tierId at once.
    const { checks, issues } = evaluateCheckReadiness(routedWithTargets(['a'], []), {
      mode: 'routed',
    });
    assert.equal(check(checks, 'tierStepTargetsResolve').satisfied, false);
    assert.ok(issues.some((i) => i.id === 'danglingTierStepTarget'));
    assert.equal(check(checks, 'outcomesNamed'), undefined, 'the tier rules stay silent');
  });

  it('warns as GUIDANCE when two or more triggers set a target', () => {
    const { checks, issues } = evaluateCheckReadiness(
      routedWithTargets(['a', 'b'], [
        { id: 'a', name: 'Ruined', success: false, dc: -5 },
        { id: 'b', name: 'Fine', success: true, dc: 0 },
      ]),
      { mode: 'routed' }
    );
    const ambiguous = issues.find((i) => i.id === 'multipleTierStepTargets');
    assert.ok(ambiguous, 'the count is reported');
    assert.equal(ambiguous.severity, 'warning', 'as a warning, never critical — it is a static count');
    assert.equal(check(checks, 'tierStepTargetsResolve').satisfied, false);
  });

  it('does not apply the tier-step rules outside routed mode', () => {
    for (const mode of ['simple', 'progressive', 'none']) {
      const { checks, issues } = evaluateCheckReadiness(routedWithTargets(['gone']), { mode });
      assert.equal(check(checks, 'tierStepTargetsResolve'), undefined, `${mode} has no tiers`);
      assert.equal(
        issues.some((i) => i.id === 'danglingTierStepTarget'),
        false,
        `${mode} reports no tier-step issue`
      );
    }
  });
});

// The Validation tab's label maps are hand-maintained mirrors of the ids this
// evaluator emits, and nothing else gates them: an id with no entry renders its own
// raw id to the GM, and an entry whose lang key is missing renders the fallback
// forever. Both rot silently, so they are compared as SETS here.
describe('checks readiness label maps do not drift', () => {
  const readinessSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/checksReadiness.js'),
    'utf8'
  );
  const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

  // A check literal is `{ id, satisfied }` — the discriminator is the SECOND key, so this
  // finds them wherever they are built, inline or inside an extracted helper.
  //
  // ISSUE ids are no longer extracted by source scan (issue 1095): they come from the
  // exported `CHECK_READINESS_ISSUE_IDS` registry, which `pushIssue` REFUSES to emit
  // outside. A scan would be the second hand-copied mirror the registry exists to remove.
  function idsBy(secondKey) {
    if (secondKey === 'severity') return [...CHECK_READINESS_ISSUE_IDS].sort();
    const pattern = new RegExp(`\\{\\s*id:\\s*'([^']+)',\\s*${secondKey}:`, 'g');
    return [...readinessSource.matchAll(pattern)].map((match) => match[1]).sort();
  }

  // The two copy maps are a real MODULE now (issue 1096), shared by the Validation route and
  // by the section-level Callout, so this reads the exported objects rather than scanning one
  // component's source for a literal. A scan could only prove what one file spells; the
  // import proves what both surfaces actually render from.
  const LABEL_MAPS = {
    CHECK_LABELS: CHECK_TICK_LABELS,
    ISSUE_LABELS: CHECK_ISSUE_LABELS,
  };

  function mapEntries(name) {
    return Object.entries(LABEL_MAPS[name]).map(([id, meta]) => ({ id, key: meta[0] }));
  }

  function langLeaf(key) {
    return `FABRICATE.Admin.Manager.Checks.Validation.${key}`
      .split('.')
      .reduce((node, part) => (node == null ? undefined : node[part]), en);
  }

  it('resolves an issue id to the SAME namespaced key both surfaces localize against', () => {
    // The Validation route and the section Callout each hold their own `text()` bridge, so
    // the thing that keeps them describing one issue identically is this one resolver.
    const copy = checkIssueCopy('noRollFormula');
    assert.equal(copy.key, 'FABRICATE.Admin.Manager.Checks.Validation.IssueNoRollFormula');
    assert.equal(typeof langLeaf('IssueNoRollFormula'), 'string');
    // An id with no entry answers with itself rather than throwing, so an unlocalized new id
    // renders visibly wrong instead of blanking the surface.
    assert.deepEqual(checkIssueCopy('notAnIssue'), {
      key: 'FABRICATE.Admin.Manager.Checks.Validation.notAnIssue',
      fallback: 'notAnIssue',
    });
  });

  it('finds the ids the evaluator can emit (the extractor is not vacuous)', () => {
    assert.ok(idsBy('satisfied').length >= 6, 'check ids were found');
    assert.ok(idsBy('severity').length >= 7, 'issue ids were found');
  });

  for (const [kind, secondKey, mapName] of [
    ['check', 'satisfied', 'CHECK_LABELS'],
    ['issue', 'severity', 'ISSUE_LABELS'],
  ]) {
    it(`every ${kind} id has a ${mapName} entry, and vice versa`, () => {
      const entries = mapEntries(mapName);
      assert.deepEqual(
        entries.map((entry) => entry.id).sort(),
        idsBy(secondKey),
        `${mapName} must mirror the ${kind} ids exactly`
      );
    });

    it(`every ${mapName} entry resolves to a string in en.json`, () => {
      for (const entry of mapEntries(mapName)) {
        assert.equal(
          typeof langLeaf(entry.key),
          'string',
          `${entry.id} maps to ${entry.key}, which must be a string leaf in en.json`
        );
      }
    });
  }
});

// ── the retired check-modifier placeholder (issue 1094) ────────────────────
//
// The whole block exists because MUTATION found it missing. Changing the predicate from
// `.present` to `.nonAdditive` left every test in this file green — killing the warning for
// exactly the case task 6 exists to prevent, which is a GM who reads an old guide, types
// the placeholder, and has it removed silently on the way to the roll.
describe('retired placeholder readiness', () => {
  const issue = (issues, id) => issues.find((entry) => entry.id === id);

  it('WARNS on an additive placement, which is genuinely ignorable', () => {
    const { issues } = evaluateCheckReadiness({ rollFormula: '1d20 + @craftingmod' });
    const warning = issue(issues, 'retiredPlaceholderInFormula');
    assert.ok(warning, 'the strip is never silent at the authoring surface');
    assert.equal(warning.severity, 'warning');
    assert.equal(issue(issues, 'retiredPlaceholderBreaksFormula'), undefined);
  });

  it('does NOT warn on a formula that merely looks similar', () => {
    // The negative control the mutation exposed: without it, a predicate that never fires
    // passes this file. `@craftingmodifier` is a different token and is left alone.
    const { issues } = evaluateCheckReadiness({ rollFormula: '1d20 + @craftingmodifier' });
    assert.equal(issue(issues, 'retiredPlaceholderInFormula'), undefined);
    assert.equal(issue(issues, 'retiredPlaceholderBreaksFormula'), undefined);
  });

  it('does NOT warn on an ordinary formula', () => {
    const { issues } = evaluateCheckReadiness({ rollFormula: '1d20 + @abilities.med.mod' });
    assert.equal(issue(issues, 'retiredPlaceholderInFormula'), undefined);
  });

  // The SPLIT, driven from the SHARED CORPUS rather than a hand-picked list — and the
  // difference is the whole finding. The four formulas this used to name happen to be the
  // ones a `nonAdditive` classifier ALSO gets right, so a split asking the classifier
  // instead of the decider passed. `1d20 * -@craftingmod`, `1d20 - @craftingmod -` and
  // `@craftingmod +` are `nonAdditive: false` and REFUSED (their residue is structurally
  // incomplete), and on those three the tab said "it is ignored and removed before the
  // roll, so delete it" — advice that leaves `1d20 * ` on disk while the migration counted
  // the same formula `untouched` and said it would not roll.
  //
  // Every row of the corpus is therefore asserted here, not a sample of it: the corpus IS
  // the set of placements the shim refuses, so the tab must report every one of them as the
  // formula-breaking case.
  it('raises a CRITICAL, not a warning, on every placement the shim refuses', () => {
    for (const [label, rollFormula] of RETIRED_PLACEMENT_CORPUS) {
      // The corpus rows are refused, so the tab is being asked about the right set. Asserted
      // in-line so a corpus row that stopped being refused fails HERE rather than silently
      // weakening the loop below into a tautology.
      assert.equal(
        planRetiredPlaceholderStrip(rollFormula).outcome,
        'refused',
        `${label}: the shim refuses it`
      );
      const { issues } = evaluateCheckReadiness({ rollFormula });
      const critical = issue(issues, 'retiredPlaceholderBreaksFormula');
      assert.ok(critical, `${label}: ${rollFormula}`);
      assert.equal(critical.severity, 'critical', `${label}: ${rollFormula}`);
      assert.equal(
        issue(issues, 'retiredPlaceholderInFormula'),
        undefined,
        `${label}: the two are mutually exclusive, so a GM gets ONE instruction`
      );
    }
  });

  // The three rows the classifier calls ADDITIVE and the decider REFUSES, named explicitly
  // so the reason this split changed cannot be lost in a corpus loop.
  it('is critical for a refused placement the placement classifier alone calls additive', () => {
    for (const rollFormula of ['1d20 * -@craftingmod', '1d20 - @craftingmod -', '@craftingmod +']) {
      const { checks, issues } = evaluateCheckReadiness({ rollFormula });
      assert.ok(issue(issues, 'retiredPlaceholderBreaksFormula'), rollFormula);
      assert.equal(
        issue(issues, 'retiredPlaceholderInFormula'),
        undefined,
        `${rollFormula}: "delete it" would leave a dangling operator on disk`
      );
      assert.equal(
        check(checks, 'hasRollFormula').satisfied,
        false,
        `${rollFormula}: it cannot roll, so the tick cannot be green`
      );
    }
  });

  // THE INVARIANT THIS TAB EXISTS TO REPORT. `hasRollFormula` must agree with the
  // `checkUsable` every other surface dispatches on, or the Validation tab ticks
  // "Has a roll formula" green next to a check that cannot roll.
  it('reads hasRollFormula POST-shim, so it cannot disagree with checkUsable', () => {
    for (const [label, rollFormula] of [['placeholder only', '@craftingmod'], ...RETIRED_PLACEMENT_CORPUS]) {
      const { checks, issues } = evaluateCheckReadiness({ rollFormula });
      assert.equal(
        check(checks, 'hasRollFormula').satisfied,
        false,
        `${label} (${rollFormula}): authored, but it cannot roll`
      );
      assert.ok(issue(issues, 'noRollFormula'), `${label}: ${rollFormula}`);
    }
    // …and an additive placement still leaves a real formula standing.
    const { checks } = evaluateCheckReadiness({ rollFormula: '1d20 + @craftingmod' });
    assert.equal(check(checks, 'hasRollFormula').satisfied, true);
  });

  // The legacy routed alias the `1.21.0` migration sweeps. Readiness reads `rollFormula`,
  // so without this the one field the migration can rewrite is the one the GM is never
  // told about.
  it('inspects the legacy routed.rollExpression alias too', () => {
    const warned = evaluateCheckReadiness({
      rollFormula: '1d20',
      rollExpression: '1d20 + @craftingmod',
    });
    assert.ok(issue(warned.issues, 'retiredPlaceholderInFormula'), 'the alias is inspected');

    const broken = evaluateCheckReadiness({
      rollFormula: '1d20',
      rollExpression: 'max(@craftingmod, 2)',
    });
    assert.ok(issue(broken.issues, 'retiredPlaceholderBreaksFormula'), 'and split the same way');

    // Including the residue-refused rows, which is the alias reading the same DECIDER
    // rather than its own copy of the placement classifier.
    const dangling = evaluateCheckReadiness({
      rollFormula: '1d20',
      rollExpression: '1d20 - @craftingmod -',
    });
    assert.ok(
      issue(dangling.issues, 'retiredPlaceholderBreaksFormula'),
      'a structurally incomplete residue on the alias is critical too'
    );
    assert.equal(issue(dangling.issues, 'retiredPlaceholderInFormula'), undefined);
  });

  it('says nothing at all for the gathering d100 mode, which authors no formula', () => {
    const { checks, issues } = evaluateCheckReadiness(
      { rollFormula: '1d20 * @craftingmod' },
      { mode: 'none' }
    );
    assert.deepEqual(checks, []);
    assert.deepEqual(issues, []);
  });
});

// ── the issue-id registry is a SOURCE OF TRUTH, not a convention (issue 1095, BH3/C3) ──
//
// Every id used to be an inline literal in the function body, so the only way to enumerate
// the set was to call the function with enough fixtures to reach every branch — which
// cannot prove completeness, because an unreached branch contributes nothing. Downstream
// surfaces need the whole set (the Validation route buckets each id to a section), and a
// hand-copied mirror of an unprovable list is how those two drift.
describe('CHECK_READINESS_ISSUE_IDS is the source of truth for every issue id', () => {
  const readinessPath = resolve(
    repoRoot,
    'src/ui/svelte/apps/manager/checks/checksReadiness.js'
  );
  const source = readFileSync(readinessPath, 'utf8');

  it('is frozen, non-empty and free of duplicates', () => {
    assert.ok(Object.isFrozen(CHECK_READINESS_ISSUE_IDS), 'a consumer cannot mutate it');
    assert.ok(CHECK_READINESS_ISSUE_IDS.length > 0);
    assert.equal(
      new Set(CHECK_READINESS_ISSUE_IDS).size,
      CHECK_READINESS_ISSUE_IDS.length,
      'a duplicated id would make an exhaustiveness count lie'
    );
  });

  // THE MECHANICAL GUARD, and the reason a frozen export alone is not one:
  // `issues.push({ id: 'newThing' })` still compiles beside it, and a behavioural test can
  // only fail for branches a fixture reaches. Every emit goes through `pushIssue`, which
  // THROWS on an unregistered id — so an id added without registering it cannot work.
  it('refuses an unregistered id at the funnel, loudly', () => {
    // The funnel is not exported, so it is exercised the way production reaches it: by
    // loading a COPY of the module with one id removed from the registry. The copy is
    // built in memory and imported as a data: URL, so nothing on disk is touched.
    const mutated = source.replace("  'noRollFormula',\n", '');
    assert.notEqual(mutated, source, 'the mutation must actually change the module');
    return import(`data:text/javascript;base64,${Buffer.from(rewriteImports(mutated)).toString('base64')}`).then(
      (module) => {
        assert.throws(
          () => module.evaluateCheckReadiness({ rollFormula: '' }),
          /unregistered issue id "noRollFormula"/,
          'an id the registry does not carry must not reach the returned list'
        );
      }
    );
  });

  // The other half: nothing may build an issue by direct `push`, bypassing the funnel.
  // A source scan is what catches an id on a branch no fixture reaches.
  it('builds no issue literal outside the registry declaration', () => {
    const body = source.slice(source.indexOf('const REGISTERED_ISSUE_IDS'));
    const literals = [...body.matchAll(/\{\s*id:\s*'([^']+)',\s*severity:/g)].map((m) => m[1]);
    assert.deepEqual(
      literals,
      [],
      'these issues are built as literals rather than through `pushIssue`, so the registry ' +
        'cannot refuse them:\n  ' + literals.join('\n  ')
    );
  });

  it('carries every id the evaluator actually emits across its branches', () => {
    // A behavioural sweep, deliberately kept ALONGSIDE the mechanical guards rather than
    // instead of them: it proves the registry is not merely consistent with itself.
    const emitted = new Set();
    const collect = (check, options) => {
      for (const issue of evaluateCheckReadiness(check, options).issues) emitted.add(issue.id);
    };
    const catalogue = [
      { id: 'ok', label: 'Ok', expression: '@a' },
      { id: 'bad', label: 'Bad', expression: '@b', min: 5, max: -1 },
      { id: 'huge', label: 'Huge', expression: '@c', min: 1e21 },
      // An expression NOTHING can roll (issue 1118 review): the reducer refuses `1d4]`
      // outright, with no dice engine needed. This row reaches `modifierExpressionInvalid`.
      { id: 'broken', label: 'Broken', expression: '1d4]' },
      // A ROLL-shaped expression, kept in the sweep as a NEGATIVE control (issue 1118): a
      // check appends it as dice now, so it must raise NOTHING. While it raised
      // `modifierRollExpression` this row was what reached that branch, and the sweep below
      // asserts the registry equals what these fixtures emit — so leaving the row in is what
      // makes the retirement observable rather than merely untested.
      { id: 'rolls', label: 'Rolls', expression: '1d4' },
    ];
    const context = (ids) => ({ catalogue, systemPolicy: 'addAll', defaultModifierIds: ids });
    collect({ rollFormula: '' }, { mode: 'simple' });
    collect({ rollFormula: '1d20 + @craftingmod' }, { mode: 'simple' });
    collect({ rollFormula: '1d20 * @craftingmod' }, { mode: 'simple' });
    collect(
      {
        rollFormula: '1d20',
        type: 'fixed',
        fixedOutcomes: [
          { id: 'a', name: '', start: 1, end: 9, success: false },
          { id: 'b', name: 'Rough', start: 11, end: 17, success: false },
        ],
        checkBreakage: { triggers: [{ tierStep: { mode: 'target', tierId: 'ghost' } }] },
      },
      { mode: 'routed' }
    );
    collect(
      {
        rollFormula: '1d20',
        type: 'fixed',
        fixedOutcomes: [
          { id: 'a', name: 'Slag', start: 9, end: 1, success: true },
          { id: 'b', name: 'Rough', start: 1, end: 20, success: true },
        ],
        checkBreakage: {
          triggers: [
            { tierStep: { mode: 'target', tierId: 'a' } },
            { tierStep: { mode: 'target', tierId: 'b' } },
          ],
        },
      },
      { mode: 'routed' }
    );
    // Two VALID ranges that overlap. The invalid-range fixture above cannot reach
    // `rangeOverlap` at all: `findRangeConflicts` excludes a `start > end` span from overlap
    // detection, so it needs a fixture of its own.
    collect(
      {
        rollFormula: '1d20',
        type: 'fixed',
        fixedOutcomes: [
          { id: 'a', name: 'Slag', start: 1, end: 10, success: true },
          { id: 'b', name: 'Rough', start: 5, end: 20, success: true },
        ],
      },
      { mode: 'routed' }
    );
    collect({ rollFormula: '' }, { mode: 'simple', modifierContext: context(['ok', 'bad']) });
    collect({ rollFormula: '1d20' }, { mode: 'simple', modifierContext: context(['huge']) });
    collect({}, { mode: 'none', modifierContext: context(['ok']) });
    // The same no-check mode on GATHERING, which reaches the other inert sentence: its d100
    // rolls, so it reports the missing modifier seam rather than a missing check.
    collect({}, { mode: 'none', modifierContext: context(['ok']), activity: 'gathering' });
    collect({ rollFormula: '1d20' }, { mode: 'simple', modifierContext: context(['rolls']) });
    collect({ rollFormula: '1d20' }, { mode: 'simple', modifierContext: context(['broken']) });
    for (const id of emitted) {
      assert.ok(
        CHECK_READINESS_ISSUE_IDS.includes(id),
        `${id} is emitted but not registered — #1096's issue-to-section map would drop it`
      );
    }
    // THE CONVERSE, and it is the half that has teeth. `>= 10` against a 14-entry registry
    // passed while four branches went unreached, which is exactly the state that lets a
    // registered id ship with no branch behind it (or a branch stop emitting) unnoticed. Set
    // EQUALITY says the sweep reaches every registered id AND that every id it reaches is
    // registered, so registering a new one without exercising it fails here.
    assert.deepEqual(
      [...emitted].sort(),
      [...CHECK_READINESS_ISSUE_IDS].sort(),
      'the sweep must reach EVERY registered issue id, and no others'
    );
  });
});

/**
 * Rewrite the module's RELATIVE imports to absolute file URLs, so a `data:` copy of it
 * resolves the same dependencies the real file does.
 */
function rewriteImports(text) {
  const base = pathToFileURL(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/checksReadiness.js')
  ).href;
  return text.replaceAll(/from '(\.[^']+)'/g, (_match, specifier) => `from '${new URL(specifier, base).href}'`);
}

// ── rangeGap: the third range rule, which nothing reported before (issue 1095, DN6) ──
describe('rangeGap', () => {
  const gapped = {
    rollFormula: '1d20',
    type: 'fixed',
    fixedOutcomes: [
      { id: 'slag', name: 'Slag', start: 1, end: 9, success: false },
      { id: 'rough', name: 'Rough', start: 11, end: 17, success: true },
    ],
  };

  it('fires on a gapped fixed set, at critical, where nothing fired before', () => {
    const { checks, issues } = evaluateCheckReadiness(gapped, { mode: 'routed' });
    const gap = issues.find((issue) => issue.id === 'rangeGap');
    assert.ok(gap, 'the unclaimed value 10 is reported');
    assert.equal(gap.severity, 'critical');
    assert.equal(
      checks.find((check) => check.id === 'rangesContiguous')?.satisfied,
      false,
      'and the readiness row reads as unsatisfied'
    );
    // PROVEN TO RAISE NOTHING AGAINST THE PRE-CHANGE EVALUATOR: the two rules that DID
    // exist both stay silent on this set, which is exactly why the gap was unreported.
    assert.equal(issues.find((issue) => issue.id === 'rangeInvalid'), undefined);
    assert.equal(issues.find((issue) => issue.id === 'rangeOverlap'), undefined);
  });

  it('stays silent on a contiguous set', () => {
    const contiguous = structuredClone(gapped);
    contiguous.fixedOutcomes[1].start = 10;
    const { issues } = evaluateCheckReadiness(contiguous, { mode: 'routed' });
    assert.equal(issues.find((issue) => issue.id === 'rangeGap'), undefined);
  });

  it('measures the set’s own span, so a deliberate window is not a gap', () => {
    // `2d20` rolls 2-40 and a GM who authors 7-34 has authored a window, not a mistake.
    // Only a hole BETWEEN two authored tiers is reported.
    const window = {
      rollFormula: '2d20',
      type: 'fixed',
      fixedOutcomes: [
        { id: 'a', name: 'A', start: 7, end: 20, success: false },
        { id: 'b', name: 'B', start: 21, end: 34, success: true },
      ],
    };
    assert.equal(
      evaluateCheckReadiness(window, { mode: 'routed' }).issues.find(
        (issue) => issue.id === 'rangeGap'
      ),
      undefined
    );
  });

  // DN6's premise correction, asserted so no copy or test may call these warnings.
  it('rangeInvalid and rangeOverlap are CRITICAL, not warnings', () => {
    const invalid = evaluateCheckReadiness(
      {
        rollFormula: '1d20',
        type: 'fixed',
        fixedOutcomes: [{ id: 'a', name: 'A', start: 9, end: 1, success: true }],
      },
      { mode: 'routed' }
    ).issues;
    assert.equal(invalid.find((issue) => issue.id === 'rangeInvalid')?.severity, 'critical');
    const overlapping = evaluateCheckReadiness(
      {
        rollFormula: '1d20',
        type: 'fixed',
        fixedOutcomes: [
          { id: 'a', name: 'A', start: 1, end: 10, success: true },
          { id: 'b', name: 'B', start: 5, end: 20, success: true },
        ],
      },
      { mode: 'routed' }
    ).issues;
    assert.equal(overlapping.find((issue) => issue.id === 'rangeOverlap')?.severity, 'critical');
  });
});

// ── check-modifier readiness (issue 1095) ──────────────────────────────────────────────
describe('check-modifier readiness', () => {
  const catalogue = [
    { id: 'ok', label: 'Ok', expression: '@a' },
    { id: 'inverted', label: 'Inverted', expression: '@b', min: 5, max: -1 },
    { id: 'huge', label: 'Huge', expression: '@c', min: 1e21 },
    // An expression the reducer refuses outright, so it is detectable with no dice engine.
    { id: 'broken', label: 'Broken', expression: '1d4]' },
  ];
  const context = (ids) => ({ catalogue, systemPolicy: 'addAll', defaultModifierIds: ids });

  it('BLOCKS on an authored min > max, matching gathering’s refuse posture', () => {
    const { checks, issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['inverted']) }
    );
    const issue = issues.find((entry) => entry.id === 'modifierBoundsInverted');
    assert.ok(issue, 'an inverted pair is reported');
    assert.equal(issue.severity, 'critical', 'BLOCKING — the entry silently contributes 0');
    assert.equal(
      checks.find((check) => check.id === 'modifierBoundsValid')?.satisfied,
      false
    );
  });

  // The second blocking bounds fault, and a SEPARATE id: "your minimum is above your
  // maximum" and "this number cannot appear in a roll formula" need different repairs, and
  // `1e21` is not an inversion. Its damage used to spread past its own entry — clamping to
  // it poisoned the SUM and `appendCheckModifierTerm` dropped the whole term.
  it('BLOCKS on a bound the dice grammar cannot express, as its own issue', () => {
    const { checks, issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['huge']) }
    );
    const issue = issues.find((entry) => entry.id === 'modifierBoundsUnsafe');
    assert.ok(issue, 'an inexpressible bound is reported');
    assert.equal(issue.severity, 'critical');
    assert.equal(
      issues.find((entry) => entry.id === 'modifierBoundsInverted'),
      undefined,
      'and it is NOT reported as an inversion — the repair is different'
    );
    assert.equal(checks.find((check) => check.id === 'modifierBoundsValid')?.satisfied, false);
  });

  // Issue 1118. A check appends a rolling modifier AS DICE, so the rule the retired
  // `modifierRollExpression` enforced no longer exists. Asserted from the REGISTRY as well
  // as from a fixture, because an id that is merely never raised looks identical to one
  // that is raised on a branch this fixture does not reach.
  it('says NOTHING about an expression that rolls dice, on any rule', () => {
    const rolling = [
      { id: 'rolls', label: 'Rolls', expression: '1d4' },
      { id: 'pool', label: 'Pool', expression: '{1d6,1d8}kh1' },
    ];
    for (const systemPolicy of ['addAll', 'highest', 'bySubject', 'playerPicks']) {
      const { checks, issues } = evaluateCheckReadiness(
        { rollFormula: '1d20' },
        {
          mode: 'simple',
          modifierContext: {
            catalogue: rolling,
            systemPolicy,
            defaultModifierIds: ['rolls', 'pool'],
          },
        }
      );
      assert.deepEqual(issues, [], `${systemPolicy}: a rolling modifier is not a defect`);
      assert.equal(
        checks.find((check) => check.id === 'modifierBoundsValid')?.satisfied,
        true,
        `${systemPolicy}: the bounds rule still ran, so this is not silence from an early return`
      );
    }
    assert.ok(
      !CHECK_READINESS_ISSUE_IDS.includes('modifierRollExpression'),
      'the id is retired from the registry, not merely unreachable'
    );
    assert.ok(
      !Object.hasOwn(CHECK_ISSUE_SECTIONS, 'modifierRollExpression'),
      'and from the section map, so no bucket names an id nothing can raise'
    );
  });

  // Both bounds faults NAME the offending entries. A shared library can be long, and the
  // Validation route's sentence is the only place a GM is told WHICH entry to repair.
  it('names the offending entries on both bounds faults', () => {
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['ok', 'inverted', 'huge']) }
    );
    assert.deepEqual(
      issues.find((entry) => entry.id === 'modifierBoundsInverted')?.data,
      { names: 'Inverted' }
    );
    assert.deepEqual(
      issues.find((entry) => entry.id === 'modifierBoundsUnsafe')?.data,
      { names: 'Huge' },
      'and each names only its OWN fault, so the two sentences are separately repairable'
    );
  });

  // THE SENTENCE, not the payload. Asserting `issue.data` leaves `interpolate()` free to be
  // a no-op — the whole suite stayed byte-identical when it was made one — and a GM would
  // then read a literal `({names})` on a blocking issue. This drives the same two steps the
  // Validation route and the section Callout drive: resolve the copy, then interpolate it.
  it('renders the named entries INTO the sentence a GM reads', () => {
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['ok', 'inverted', 'huge', 'broken']) }
    );
    const sentenceFor = (id) => {
      const issue = issues.find((entry) => entry.id === id);
      return interpolate(checkIssueCopy(id).fallback, issue?.data);
    };
    for (const [id, name] of [
      ['modifierBoundsInverted', 'Inverted'],
      ['modifierBoundsUnsafe', 'Huge'],
      ['modifierExpressionInvalid', 'Broken'],
    ]) {
      const sentence = sentenceFor(id);
      assert.ok(sentence.includes(`(${name})`), `${id} names the entry: ${sentence}`);
      assert.ok(!sentence.includes('{names}'), `${id} leaves no raw placeholder: ${sentence}`);
      assert.ok(!sentence.includes('Ok'), `${id} names only its own fault: ${sentence}`);
    }
  });

  it('falls back to the entry id when a faulted entry has no label', () => {
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      {
        mode: 'simple',
        modifierContext: {
          catalogue: [{ id: 'unnamed', expression: '@a', min: 5, max: -1 }],
          systemPolicy: 'addAll',
          defaultModifierIds: ['unnamed'],
        },
      }
    );
    assert.deepEqual(issues[0].data, { names: 'unnamed' }, 'an unnamed entry is still locatable');
  });

  // Issue 1118 review. Retiring `modifierRollExpression` left NO signal for an entry that
  // contributes nothing for EXPRESSION reasons — including three that would have failed the
  // check outright had the engine guard not dropped them first.
  it('BLOCKS on an expression that cannot contribute, whatever the reason', () => {
    // The last four are ENGINE-only faults: they reduce cleanly and only a dice engine can
    // refuse them, so the recorded 14.365 double has to be installed for this test to reach
    // them at all. Without it `fragmentRolls` fails open and those rows pass vacuously.
    const previousRoll = globalThis.Roll;
    globalThis.Roll = recordedModifierRoll();
    try {
      const unusable = [
        ['reducer refuses the text', '1d4]'],
        ['a bare word', 'damage'],
        ['nothing authored at all', ''],
        ['an unterminated flavour', '1d4[fire'],
        ['a capitalised function name', 'MAX(1d4,2)'],
        ['more dice than Foundry will roll', '1000d6'],
        ['a decimal with no leading digit', '1d4 + .5'],
      ];
      for (const [why, expression] of unusable) {
        const { checks, issues } = evaluateCheckReadiness(
          { rollFormula: '1d20' },
          {
            mode: 'simple',
            modifierContext: {
              catalogue: [{ id: 'x', label: 'Broken one', expression }],
              systemPolicy: 'addAll',
              defaultModifierIds: ['x'],
            },
          }
        );
        const issue = issues.find((entry) => entry.id === 'modifierExpressionInvalid');
        assert.ok(issue, `${why} (${expression}) is reported`);
        assert.equal(issue.severity, 'critical', `${why}: BLOCKING`);
        assert.deepEqual(issue.data, { names: 'Broken one' });
        assert.equal(
          checks.find((check) => check.id === 'modifierExpressionsResolve')?.satisfied,
          false,
          `${why}: the tick follows the issue`
        );
      }
    } finally {
      globalThis.Roll = previousRoll;
    }
  });

  it('says nothing about an expression that resolves, however exotic', () => {
    // The negative half. Each of these is a legal Foundry formula, and three of them
    // (`pow`, `sqrt`, `clamp`) were refused by the reducer until this round.
    for (const expression of [
      '@skills.med.mod',
      '1d4',
      '{1d6,1d8}kh1',
      'floor(1d8 / 2)',
      'pow(1d4, 2)',
      'sqrt(1d4)',
      'clamp(1d8, 1, 6)',
      '0',
    ]) {
      const { checks, issues } = evaluateCheckReadiness(
        { rollFormula: '1d20' },
        {
          mode: 'simple',
          modifierContext: {
            catalogue: [{ id: 'x', label: 'Fine', expression }],
            systemPolicy: 'addAll',
            defaultModifierIds: ['x'],
          },
        }
      );
      assert.deepEqual(issues, [], `${expression} is usable`);
      assert.equal(
        checks.find((check) => check.id === 'modifierExpressionsResolve')?.satisfied,
        true,
        `${expression}: the tick is green`
      );
    }
  });

  // A BOUNDS fault is reported under its own repair and NOT a second time as an expression
  // fault: one entry named under two different instructions is worse than one.
  it('does not report a bounds fault a second time as an expression fault', () => {
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['inverted', 'huge']) }
    );
    assert.equal(
      issues.find((entry) => entry.id === 'modifierExpressionInvalid'),
      undefined,
      'both entries have perfectly readable expressions; only their bounds are wrong'
    );
  });

  it('says nothing about an entry this activity does not apply', () => {
    // The catalogue is SHARED across three activities, so a gathering section has no
    // business reporting an entry only crafting selects. Eligibility, not membership.
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['ok']) }
    );
    assert.equal(issues.find((entry) => entry.id === 'modifierBoundsInverted'), undefined);
  });

  it('reports noModifierSupport under gathering d100 — the ONE owned path for that state', () => {
    const { issues } = evaluateCheckReadiness(
      {},
      { mode: 'none', modifierContext: context(['ok']), activity: 'gathering' }
    );
    assert.ok(
      issues.find((entry) => entry.id === 'modifiersInertNoModifierSupport'),
      'the d100 against each drop chance IS the check; it just takes no modifiers yet'
    );
    assert.equal(
      issues.find((entry) => entry.id === 'modifiersInertNoCheck'),
      undefined,
      'd100 DOES roll a check, so the mode-rolls-nothing sentence would be false here'
    );
    // …and the d100 branch still validates nothing else: there is nothing authored.
    assert.equal(issues.find((entry) => entry.id === 'noRollFormula'), undefined);
  });

  it('keeps the mode-rolls-nothing reading for alchemy none, which really rolls nothing', () => {
    const { issues } = evaluateCheckReadiness(
      {},
      { mode: 'none', modifierContext: context(['ok']), activity: 'crafting' }
    );
    assert.ok(issues.find((entry) => entry.id === 'modifiersInertNoCheck'));
    assert.equal(
      issues.find((entry) => entry.id === 'modifiersInertNoModifierSupport'),
      undefined
    );
  });

  it('reports noFormula when a check slot exists but is empty', () => {
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '' },
      { mode: 'simple', modifierContext: context(['ok']) }
    );
    assert.ok(issues.find((entry) => entry.id === 'modifiersInertNoFormula'));
    assert.equal(issues.find((entry) => entry.id === 'modifiersInertNoCheck'), undefined);
  });

  it('says nothing at all when the activity selects no modifier', () => {
    // Gated on a NON-EMPTY eligible set for the reason the card gates its notice: warning
    // that nothing does anything, when nothing was authored, is noise on first contact.
    for (const options of [
      { mode: 'simple', modifierContext: context([]) },
      { mode: 'simple' },
      { mode: 'none', modifierContext: context([]) },
    ]) {
      const { issues } = evaluateCheckReadiness({ rollFormula: '' }, options);
      assert.equal(
        issues.filter((entry) => entry.id.startsWith('modifier')).length,
        0,
        `${JSON.stringify(options.mode)}: an empty selection reports no modifier issue`
      );
    }
  });
});

// ── The issue-id → SECTION map (issue 1096) ──────────────────────────────────────────
//
// Three surfaces read this map: the section strip's warning dots, the rail's per-activity
// badge and the Validation route's deep links. Bucketing "by issue id" is exactly the shape
// that rots silently — issue 1095 added three ids at once — so the map is held to SET
// EQUALITY against the frozen registry the evaluator itself pushes from, in both
// directions, and each direction is proven able to fail.
describe('the issue-to-section map is exhaustive against the frozen registry', () => {
  const mapPath = resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/checksReadiness.js');
  const mapSource = readFileSync(mapPath, 'utf8');
  // The two anchors, hoisted so each mutation is one substitution against a line that is
  // asserted to exist rather than a quoted fragment repeated inline.
  const REGISTRY_ANCHOR = `  'noRollFormula',\n`;
  const BUCKET_ANCHOR = `  noRollFormula: 'roll',\n`;

  it('buckets every registered id, and nothing else', () => {
    assert.deepEqual(
      Object.keys(CHECK_ISSUE_SECTIONS).sort(),
      [...CHECK_READINESS_ISSUE_IDS].sort(),
      'the map key set must EQUAL the registry, not merely be contained in it'
    );
  });

  it('names only real sections, and rangeGap belongs to Outcomes', () => {
    for (const [id, section] of Object.entries(CHECK_ISSUE_SECTIONS)) {
      assert.ok(
        CHECK_SECTION_IDS.includes(section),
        `${id} buckets to "${section}", which is not one of the five sections`
      );
    }
    // The hole is between two authored TIERS, and the rows that close it are on Outcomes.
    assert.equal(sectionForIssue('rangeGap'), 'outcomes');
    // An id no bucket claims answers `null` rather than defaulting to a section whose
    // controls could not clear it.
    assert.equal(sectionForIssue('notAnIssueId'), null);
  });

  // BOTH NEGATIVE CONTROLS, because the assertion above can fail for two different reasons
  // and a guard that only proves one of them is half a guard. Each mutation is applied to a
  // COPY of the module loaded as a data: URL, and each is checked to have actually changed
  // the source before it is trusted — a replacement that matched nothing would leave the
  // suite green and read as "the map is fine".
  async function loadMutated(mutated) {
    assert.notEqual(mutated, mapSource, 'the mutation must actually change the module');
    return import(
      `data:text/javascript;base64,${Buffer.from(rewriteImports(mutated)).toString('base64')}`
    );
  }

  it('FAILS when an id is added to the registry with no bucket', async () => {
    const module = await loadMutated(
      mapSource.replace(
        REGISTRY_ANCHOR,
        `${REGISTRY_ANCHOR}  'brandNewIssue',
`
      )
    );
    assert.notDeepEqual(
      Object.keys(module.CHECK_ISSUE_SECTIONS).sort(),
      [...module.CHECK_READINESS_ISSUE_IDS].sort(),
      'an unbucketed registered id must break set equality'
    );
    assert.equal(module.sectionForIssue('brandNewIssue'), null);
  });

  it('FAILS when a bucket names an id the registry does not carry', async () => {
    const module = await loadMutated(
      mapSource.replace(BUCKET_ANCHOR, `${BUCKET_ANCHOR}  ghostIssue: 'roll',
`)
    );
    assert.notDeepEqual(
      Object.keys(module.CHECK_ISSUE_SECTIONS).sort(),
      [...module.CHECK_READINESS_ISSUE_IDS].sort(),
      'a bucket for an unregistered id must break set equality'
    );
  });
});

// ── The readiness mode is the ENGINE'S OWN SLOT, not a second mapping (issue 1096) ─────
//
// `evaluateCheckReadiness` branches on `mode === 'routed'`, and no subsystem's authored
// resolution mode is ever that string. Something has to translate; the question is WHAT
// translates. `checkModifierResolver` already decides which `craftingCheck` sub-config the
// engine rolls, and a second mapping beside it disagreed with it for exactly one
// configuration — alchemy at `checkMode: 'tiered'` — so the rail badge picked its DRAFT by
// one mapping and its RULES by the other and evaluated an untouched simple check under
// routed rules.
describe('readinessModeForSlot', () => {
  it('is the identity on every real slot, and names the no-check case', () => {
    assert.equal(readinessModeForSlot('routed'), 'routed');
    assert.equal(readinessModeForSlot('simple'), 'simple');
    assert.equal(readinessModeForSlot('progressive'), 'progressive');
    assert.equal(readinessModeForSlot(null), 'none', 'a mode that rolls nothing is its own mode');
    assert.equal(readinessModeForSlot(undefined), 'none');
  });

  it('agrees with the resolver for every crafting mode, including the two it used to fight', () => {
    // The oracle is the RESOLVER, not a restatement of the table under test: these are the
    // slots the engine actually rolls, so a readiness mode derived from them cannot describe
    // a check the engine does not run.
    const slotFor = (resolutionMode, checkMode = 'none') =>
      resolveActiveCraftingCheckFormula({
        resolutionMode,
        alchemy: { checkMode },
        craftingCheck: { simple: {}, routed: {}, progressive: {} },
      }).slot;

    assert.equal(readinessModeForSlot(slotFor('routedByCheck')), 'routed');
    assert.equal(readinessModeForSlot(slotFor('progressive')), 'progressive');
    assert.equal(readinessModeForSlot(slotFor('simple')), 'simple');
    // NOT routed: `routedByIngredients` routes on the ingredient set and authors its optional
    // pass/fail check on the shared simple slot, so it must not reach the tier rules at all.
    assert.equal(readinessModeForSlot(slotFor('routedByIngredients')), 'simple');
    // THE TWO THE SECOND MAPPING GOT WRONG.
    assert.equal(
      readinessModeForSlot(slotFor('alchemy', 'tiered')),
      'routed',
      'alchemy + tiered rolls the ROUTED slot, so it is evaluated under routed rules'
    );
    assert.equal(readinessModeForSlot(slotFor('alchemy', 'simple')), 'simple');
    assert.equal(
      readinessModeForSlot(slotFor('alchemy', 'none')),
      'none',
      'alchemy + none rolls NOTHING; coercing it to simple demanded a formula it has no field for'
    );
    assert.equal(readinessModeForSlot(slotFor('somethingNew')), 'none', 'an unknown mode rolls nothing');
  });

  it('is what makes a routedByCheck tier fault reportable AT ALL', () => {
    // The whole point, asserted end to end rather than as a string mapping: the same broken
    // tier list is silent under the raw mode and critical under the resolved one.
    const broken = {
      rollFormula: '1d20',
      type: 'relative',
      relativeOutcomes: [{ id: 'a', name: '   ', success: false, dc: 0 }],
    };
    assert.throws(
      () => evaluateCheckReadiness(broken, { mode: 'routedByCheck' }),
      /unsupported mode/,
      'the RAW mode is REFUSED now — it used to be silently evaluated as if it were simple'
    );
    const resolved = evaluateCheckReadiness(broken, {
      mode: readinessModeForSlot('routed'),
    });
    assert.deepEqual(
      resolved.issues.map((issue) => issue.id).sort(),
      ['noSuccessOutcome', 'unnamedOutcome'],
      'and the resolved one reports both faults'
    );
  });

  it('reports NO missing-formula issue for a mode that rolls no check', () => {
    // The rail badge showed a permanent, unclearable "1 issue" on alchemy `none`: the route
    // renders no formula field, so no control the GM can reach could ever satisfy it.
    const alchemyNone = evaluateCheckReadiness(
      { rollFormula: '' },
      { mode: readinessModeForSlot(null) }
    );
    assert.deepEqual(alchemyNone.issues, [], 'no check means nothing to report about a formula');
    assert.deepEqual(alchemyNone.checks, [], 'and no tick claiming a formula it cannot have');
    // The SAME check under the mode it used to be coerced to, to prove the assertion above
    // is discriminating rather than vacuous.
    const asSimple = evaluateCheckReadiness({ rollFormula: '' }, { mode: 'simple' });
    assert.ok(
      asSimple.issues.some((issue) => issue.id === 'noRollFormula'),
      'the coerced reading is what raised the unclearable badge'
    );
  });

  it('still reports an inert modifier selection under a no-check mode', () => {
    // The no-check branch is not a bare early return: a selection authored on a check that
    // rolls nothing is the one thing left worth saying.
    const inert = evaluateCheckReadiness(
      {},
      {
        mode: readinessModeForSlot(null),
        modifierContext: buildCheckModifierContext(
          {
            // A USABLE expression, so this test stays about inertness. An entry with none
            // at all now raises `modifierExpressionInvalid` too, which is correct and is
            // asserted on its own below.
            modifiers: [{ id: 'm1', name: 'Focus', expression: '@focus', min: 0, max: 2 }],
            craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['m1'] },
          },
          'crafting',
          null
        ),
      }
    );
    assert.deepEqual(
      inert.issues.map((issue) => issue.id),
      ['modifiersInertNoCheck']
    );
  });

  it('refuses a mode outside its own vocabulary rather than defaulting', () => {
    for (const mode of ['routedByCheck', 'alchemy', 'd100', 'routedByIngredients']) {
      assert.throws(
        () => evaluateCheckReadiness({}, { mode }),
        /unsupported mode/,
        `${mode} is a resolution mode, not a readiness mode`
      );
    }
    for (const mode of CHECK_READINESS_MODES) {
      assert.doesNotThrow(() => evaluateCheckReadiness({}, { mode }));
    }
  });
});
