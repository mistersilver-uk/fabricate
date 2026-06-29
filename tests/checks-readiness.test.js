import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateCheckReadiness } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';

function check(checks, id) {
  return checks.find((entry) => entry.id === id);
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
