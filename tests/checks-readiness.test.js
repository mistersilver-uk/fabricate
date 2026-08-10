import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CHECK_READINESS_ISSUE_IDS, evaluateCheckReadiness } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
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
    collect({}, { mode: 'd100', modifierContext: context(['ok']) });
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

  it('says nothing about an entry this activity does not apply', () => {
    // The catalogue is SHARED across three activities, so a gathering section has no
    // business reporting an entry only crafting selects. Eligibility, not membership.
    const { issues } = evaluateCheckReadiness(
      { rollFormula: '1d20' },
      { mode: 'simple', modifierContext: context(['ok']) }
    );
    assert.equal(issues.find((entry) => entry.id === 'modifierBoundsInverted'), undefined);
  });

  it('reports noCheck under gathering d100 — the ONE owned path for that state', () => {
    const { issues } = evaluateCheckReadiness(
      {},
      { mode: 'd100', modifierContext: context(['ok']) }
    );
    assert.ok(
      issues.find((entry) => entry.id === 'modifiersInertNoCheck'),
      'd100 rolls no authored formula, so a selection made here never applies'
    );
    // …and the d100 branch still validates nothing else: there is nothing authored.
    assert.equal(issues.find((entry) => entry.id === 'noRollFormula'), undefined);
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
      { mode: 'd100', modifierContext: context([]) },
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
