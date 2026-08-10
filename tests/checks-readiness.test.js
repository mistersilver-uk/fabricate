import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateCheckReadiness } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import { planRetiredPlaceholderStrip } from '../src/utils/craftingCheckExpression.js';
import { RETIRED_PLACEMENT_CORPUS } from './helpers/retiredPlaceholderOracle.js';

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
    const { checks, issues } = evaluateCheckReadiness({}, { mode: 'd100' });
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
    for (const mode of ['simple', 'progressive', 'alchemy', 'd100']) {
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
  const tabSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte'),
    'utf8'
  );
  const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

  // A check literal is `{ id, satisfied }`, an issue literal `{ id, severity }` — the
  // discriminator is the SECOND key, so this finds them wherever they are built,
  // inline or inside an extracted helper.
  function idsBy(secondKey) {
    const pattern = new RegExp(`\\{\\s*id:\\s*'([^']+)',\\s*${secondKey}:`, 'g');
    return [...readinessSource.matchAll(pattern)].map((match) => match[1]).sort();
  }

  function mapEntries(name) {
    const start = tabSource.indexOf(`const ${name} = {`);
    assert.notEqual(start, -1, `${name} is declared in ChecksValidationTab.svelte`);
    const end = tabSource.indexOf('\n  };', start);
    assert.notEqual(end, -1, `${name} is terminated`);
    const body = tabSource.slice(start, end);
    return [...body.matchAll(/^\s{4}(\w+):\s*\[\s*\n?\s*'([^']+)'/gm)].map((match) => ({
      id: match[1],
      key: match[2],
    }));
  }

  function langLeaf(key) {
    return `FABRICATE.Admin.Manager.Checks.Validation.${key}`
      .split('.')
      .reduce((node, part) => (node == null ? undefined : node[part]), en);
  }

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
      { mode: 'd100' }
    );
    assert.deepEqual(checks, []);
    assert.deepEqual(issues, []);
  });
});
