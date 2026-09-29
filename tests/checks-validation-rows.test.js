import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECK_NEVER_FAILS,
  CHECK_TO_ISSUES,
  checksValidationRowStates,
} from '../src/ui/svelte/apps/manager/checks/checksValidationRows.js';
import { CHECK_READINESS_ISSUE_IDS } from '../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import { CHECK_TICK_LABELS } from '../src/ui/svelte/apps/manager/checks/checksCopy.js';

const check = (id, satisfied) => ({ id, satisfied });
const issue = (id, severity = 'warning', data = null) => ({ id, severity, data });

describe('CHECK_TO_ISSUES', () => {
  it('names only registered issue ids, and is frozen', () => {
    assert.ok(Object.isFrozen(CHECK_TO_ISSUES));
    for (const [checkId, owners] of Object.entries(CHECK_TO_ISSUES)) {
      assert.ok(Array.isArray(owners) && owners.length > 0, `${checkId} names at least one owner`);
      for (const owner of owners) {
        assert.ok(
          CHECK_READINESS_ISSUE_IDS.includes(owner),
          `${checkId} -> ${owner}, which is not a registered issue id`
        );
      }
    }
  });
});

// THE COMPLETENESS GUARD (issue 2106 review): a check id in neither map fails silently GREEN,
// exactly the `progressiveHigherIsBetter` defect this round found — `checksValidationRowStates`
// falls through to `issueRowStatus(null)`, which used to be masked by `ChecksValidationTab`'s
// `passRow` fallback rather than caught here. `CHECK_TICK_LABELS` is the tick-id source of truth
// `tests/checks-readiness.test.js` already proves exhaustive against the evaluator's own branches.
describe('every check id is mapped to an owning issue, or explicitly never fails', () => {
  const tickIds = Object.keys(CHECK_TICK_LABELS);

  it('is a non-vacuous sweep', () => {
    assert.ok(tickIds.length >= 20, 'CHECK_TICK_LABELS was read');
  });

  it('CHECK_TO_ISSUES and CHECK_NEVER_FAILS are disjoint', () => {
    const overlap = CHECK_NEVER_FAILS.filter((id) => Object.hasOwn(CHECK_TO_ISSUES, id));
    assert.deepEqual(overlap, [], 'an id in both is a contradiction — it both fails and never does');
  });

  it('covers every tick id, and FAILS if a mapping is removed', () => {
    const unmapped = tickIds.filter(
      (id) => !Object.hasOwn(CHECK_TO_ISSUES, id) && !CHECK_NEVER_FAILS.includes(id)
    );
    assert.deepEqual(
      unmapped,
      [],
      'these ids own no issue and are not declared exempt, so an unsatisfied check would ' +
        'fall through to a bare warn cross with no issue text, or — before issue 2106\'s review ' +
        'fix — render a false-green pass: ' + unmapped.join(', ')
    );
  });
});

// The behaviour issue 2083 rules on: a fault reads once, as its issue, at that issue's severity;
// the checklist line keeps its tick/cross on the SAME row rather than adding a second one.
describe('checksValidationRowStates', () => {
  it('merges a failing check with the issue it owns into ONE row', () => {
    const readiness = {
      checks: [check('hasRollFormula', false)],
      issues: [issue('noRollFormula', 'warning')],
    };
    const rows = checksValidationRowStates(readiness);
    assert.equal(rows.length, 1, 'the fault reads once, not twice');
    assert.deepEqual(rows[0], {
      checkId: 'hasRollFormula',
      satisfied: false,
      issue: readiness.issues[0],
      status: 'warn',
    });
  });

  it('leaves a satisfied check as a pass row with no issue', () => {
    const readiness = { checks: [check('hasRollFormula', true)], issues: [] };
    const rows = checksValidationRowStates(readiness);
    assert.deepEqual(rows, [
      { checkId: 'hasRollFormula', satisfied: true, issue: null, status: 'pass' },
    ]);
  });

  it('gives an issue no check claims its own route-only row', () => {
    const readiness = { checks: [], issues: [issue('modifierAverageUnavailable')] };
    const rows = checksValidationRowStates(readiness);
    assert.deepEqual(rows, [
      { checkId: '', satisfied: false, issue: readiness.issues[0], status: 'warn' },
    ]);
  });

  // A check that can fail two independent ways at once (issue 975): both are real, distinct
  // faults, so both must still be reported — one merged onto the check, one on its own.
  it('claims only the first of two simultaneous owners, and keeps the second as its own row', () => {
    const dangling = issue('danglingTierStepTarget', 'warning');
    const ambiguous = issue('multipleTierStepTargets', 'warning');
    const readiness = {
      checks: [check('tierStepTargetsResolve', false)],
      issues: [dangling, ambiguous],
    };
    const rows = checksValidationRowStates(readiness);
    assert.equal(rows.length, 2, 'two distinct faults, two rows');
    assert.deepEqual(rows[0], {
      checkId: 'tierStepTargetsResolve',
      satisfied: false,
      issue: dangling,
      status: 'warn',
    });
    assert.deepEqual(rows[1], {
      checkId: '',
      satisfied: false,
      issue: ambiguous,
      status: 'warn',
    });
  });

  // THE FALSE-GREEN REGRESSION (issue 2106 review): an unsatisfied check with NO claimed issue —
  // whether `CHECK_TO_ISSUES` names an owner the readiness result did not actually raise, or an id
  // has no owner at all — must never read `pass`. Before this fix `ChecksValidationTab`'s
  // `issue ? issueRow(...) : passRow(...)` sent every unclaimed row through `passRow`, which
  // hard-coded `status: 'pass'` regardless of `satisfied`.
  it('is warn, never a false-green pass, for an unsatisfied check no issue claims', () => {
    const readiness = { checks: [check('progressiveHigherIsBetter', false)], issues: [] };
    const rows = checksValidationRowStates(readiness);
    assert.deepEqual(rows, [
      { checkId: 'progressiveHigherIsBetter', satisfied: false, issue: null, status: 'warn' },
    ]);
  });

  // THE REGRESSION THIS ISSUE FIXES: success-counting checks (issue 2004) can fail up to seven
  // ways at once, and before this fix each one drew a generic warning checklist row AND its own
  // issue row — fourteen rows, double-counted, for seven real faults.
  it('draws exactly one row per fault, however many success-counting checks fail at once', () => {
    const ids = [
      ['countPoolReadable', 'countPoolInvalid', 'critical'],
      ['countThresholdReadable', 'countThresholdInvalid', 'critical'],
      ['countFacesOnDie', 'countFaceBeyondDie', 'warning'],
      ['countExplosionStops', 'countExplodeUnbounded', 'critical'],
      ['countTiersSetSuccesses', 'countTierWithoutSuccesses', 'warning'],
      ['countRequiredWithinMaxPool', 'countRequiredExceedsMaxPool', 'critical'],
      ['countRequiredWithinBasePool', 'countRequiredExceedsBasePool', 'warning'],
    ];
    const readiness = {
      checks: ids.map(([checkId]) => check(checkId, false)),
      issues: ids.map(([, issueId, severity]) => issue(issueId, severity)),
    };
    const rows = checksValidationRowStates(readiness);
    assert.equal(rows.length, 7, 'seven faults, seven rows — not fourteen');
    for (const [row, [checkId, , severity]] of rows.map((row, index) => [row, ids[index]])) {
      assert.equal(row.checkId, checkId);
      assert.equal(row.issue.severity, severity);
    }
  });
});
