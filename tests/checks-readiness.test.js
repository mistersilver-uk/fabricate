import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateCheckReadiness } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';

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
