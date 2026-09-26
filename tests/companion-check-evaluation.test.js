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
      { target: { source: 'actor' } },
      { target: { baseAdjustment: Infinity } },
      { target: { expression: true } },
      { target: { expression: null } },
      { pool: { modifierDestination: 'total' } },
      { pool: { base: null } },
      { pool: { threshold: Number.NaN } },
      { pool: { explode: { enabled: 1 } } },
      { pool: { explode: { once: 'yes' } } },
      { pool: { cancel: { enabled: null } } },
      { pool: { explode: { faces: { value: 0 } } } },
      { pool: { additionalDice: { max: 21 } } },
      { pool: { additionalDice: { readMacroUuid: 1 } } },
      { pool: { additionalDice: { spendMacroUuid: {} } } },
    ];
    for (const value of invalid) {
      assert.deepEqual(resolveCompanionCheckEvaluation(value), { ok: false }, JSON.stringify(value));
    }
  });

  it('accepts every range boundary and nullable field as the shared normalizer reads it', () => {
    const accepted = [
      { pool: { die: 2 } },
      { pool: { required: 0 } },
      { pool: { required: 20 } },
      { pool: { additionalDice: { max: 1 } } },
      { pool: { additionalDice: { max: 20 } } },
      { pool: { die: 6, explode: { faces: { value: 6 } }, cancel: { faces: { value: 1 } } } },
      { pool: { explode: { faces: { value: null } } } },
      { target: { baseAdjustment: null } },
    ];
    for (const input of accepted) {
      assert.deepEqual(
        resolveCompanionCheckEvaluation(input),
        { ok: true, evaluation: normalizeCheckEvaluation(input) },
        JSON.stringify(input)
      );
    }
  });

  it('treats an own undefined value as an omitted key at every nested level', () => {
    for (const [input, omitted] of [
      [{ direction: undefined }, {}],
      [{ target: undefined, product: 'sum' }, { product: 'sum' }],
      [{ target: { expression: undefined, source: 'fixed' } }, { target: { source: 'fixed' } }],
      [{ pool: { die: undefined, explode: { faces: undefined } } }, { pool: { explode: {} } }],
      [{ pool: { die: 6, cancel: { faces: { value: undefined } } } }, { pool: { die: 6, cancel: { faces: {} } } }],
    ]) {
      assert.deepEqual(
        resolveCompanionCheckEvaluation(input),
        { ok: true, evaluation: normalizeCheckEvaluation(omitted) },
        JSON.stringify(omitted)
      );
    }
  });

  it('refuses polluting and symbol keys and reads descriptors, never get', () => {
    for (const value of [
      JSON.parse('{"__proto__":{}}'),
      { constructor: {} },
      { toString: 'x' },
      { pool: JSON.parse('{"__proto__":{"die":6}}') },
      { [Symbol('k')]: 1 },
    ]) {
      assert.deepEqual(resolveCompanionCheckEvaluation(value), { ok: false });
    }
    const bare = Object.assign(Object.create(null), { product: 'sum' });
    assert.deepEqual(resolveCompanionCheckEvaluation(bare), {
      ok: true,
      evaluation: normalizeCheckEvaluation({ product: 'sum' }),
    });
    let gets = 0;
    const lying = new Proxy(
      { product: 'sum' },
      {
        get() {
          gets += 1;
          return 'count';
        },
      }
    );
    const resolved = resolveCompanionCheckEvaluation(lying);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.evaluation.product, 'sum');
    assert.equal(gets, 0);
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

  it('normalizes only fields found in the validated descriptor tree', () => {
    let hiddenReads = 0;
    const hidden = (key, value) =>
      new Proxy(
        {},
        {
          get(_record, name) {
            if (name === key) {
              hiddenReads += 1;
              return value;
            }
            return undefined;
          },
        }
      );
    assert.deepEqual(resolveCompanionCheckEvaluation(hidden('product', 'count')), {
      ok: true,
      evaluation: normalizeCheckEvaluation(),
    });
    assert.deepEqual(resolveCompanionCheckEvaluation({ pool: hidden('die', 1) }), {
      ok: true,
      evaluation: normalizeCheckEvaluation(),
    });
    assert.equal(hiddenReads, 0);
  });

  it('refuses reflective traps without throwing or reading hidden fields', () => {
    for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
      let reads = 0;
      const record = new Proxy(
        { product: 'sum' },
        {
          [trap]() {
            reads += 1;
            throw new Error(`${trap} failed`);
          },
        }
      );
      assert.deepEqual(resolveCompanionCheckEvaluation(record), { ok: false });
      assert.equal(reads, 1);
    }
  });
});
