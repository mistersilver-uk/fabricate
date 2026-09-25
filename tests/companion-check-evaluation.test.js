import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHECK_EVALUATION_CAPABILITIES,
  resolveCompanionCheckEvaluation,
  supportsCompanionCheckEvaluation,
} from '../src/systems/companionCheckEvaluation.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';

describe('companion check evaluation boundary', () => {
  it('defaults an absent evaluation and freezes executable capability rows', () => {
    assert.deepEqual(resolveCompanionCheckEvaluation(undefined), {
      ok: true,
      evaluation: normalizeCheckEvaluation(),
    });
    assert.deepEqual(CHECK_EVALUATION_CAPABILITIES, {
      version: 1,
      modes: [{ product: 'sum', direction: 'over', targetSources: ['fixed'], interactive: true }],
      additionalDice: false,
    });
    assert.ok(Object.isFrozen(CHECK_EVALUATION_CAPABILITIES));
    assert.ok(Object.isFrozen(CHECK_EVALUATION_CAPABILITIES.modes));
    assert.ok(Object.isFrozen(CHECK_EVALUATION_CAPABILITIES.modes[0]));
    assert.ok(Object.isFrozen(CHECK_EVALUATION_CAPABILITIES.modes[0].targetSources));
  });

  it('retains valid inactive fields and supplies defaults for a partial record', () => {
    const input = {
      target: { expression: 12, baseAdjustment: -1.5 },
      pool: {
        die: 6,
        additionalDice: { enabled: true, source: 'macro', max: 4 },
      },
    };
    const result = resolveCompanionCheckEvaluation(input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.evaluation, normalizeCheckEvaluation(input));
    assert.equal(supportsCompanionCheckEvaluation(result.evaluation, true), true);
    assert.equal(supportsCompanionCheckEvaluation({ ...result.evaluation, direction: 'under' }), false);
    assert.equal(supportsCompanionCheckEvaluation({ ...result.evaluation, product: 'count' }), false);
    assert.equal(
      supportsCompanionCheckEvaluation({
        ...result.evaluation,
        target: { ...result.evaluation.target, source: 'attribute' },
      }),
      false
    );
  });

  it('refuses malformed supplied fields before the permissive shared normalizer runs', () => {
    const invalid = [
      null,
      [],
      new Date(),
      { extra: true },
      { product: 'dice' },
      { direction: 'left' },
      { thresholdMode: 'exceed' },
      { target: null },
      { target: [] },
      { target: new Date() },
      { target: { expression: Number.NaN } },
      { target: { adjustmentKind: 'divide' } },
      { target: { baseAdjustment: '2' } },
      { pool: { die: 1 } },
      { pool: [] },
      { pool: new Date() },
      { pool: { die: '10' } },
      { pool: { required: 21 } },
      { pool: { required: 1.5 } },
      { pool: { zeroPoolFails: 1 } },
      { pool: { explode: [] } },
      { pool: { explode: { faces: [] } } },
      { pool: { explode: { faces: { kind: 'worst' } } } },
      { pool: { explode: { faces: { value: 11 } } } },
      { pool: { cancel: { faces: { kind: 'best' } } } },
      { pool: { additionalDice: { source: 'actor' } } },
      { pool: { additionalDice: { max: 0 } } },
      { pool: { additionalDice: { path: 3 } } },
      { pool: { additionalDice: { enabled: 'false' } } },
    ];
    for (const value of invalid) {
      assert.deepEqual(resolveCompanionCheckEvaluation(value), { ok: false }, String(value));
    }
  });

  it('rejects nested accessors without invoking them', () => {
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'product', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('must not execute');
      },
    });
    const nested = { pool: { explode: { faces: accessor } } };
    assert.deepEqual(resolveCompanionCheckEvaluation(accessor), { ok: false });
    assert.deepEqual(resolveCompanionCheckEvaluation(nested), { ok: false });
    assert.equal(reads, 0);
  });
});
