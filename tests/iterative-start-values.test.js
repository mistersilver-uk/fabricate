/** Start values resolve once per Counter Instance, in order, clamped and recorded (`resolution-modes`). */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import { counter, deepFreeze, instance, library } from './helpers/iterativeAttemptFixtures.js';
import { scriptedRollDie } from './helpers/scriptedRollDie.js';

const reads = [];
for (const name of ['CONFIG', 'foundry', 'game']) {
  Object.defineProperty(globalThis, name, {
    get() {
      reads.push(name);
      throw new Error('forbidden global');
    },
    configurable: true,
  });
}

const { resolveStartedWith } = await import('../src/systems/iterative/resolveAttempt.js');

after(() => assert.deepEqual(reads, [], 'no start-value module reads a Foundry global'));

/** Resolves on a deep-frozen library; `instances` replaces the default three. */
function start({ instances, counters, version, script = [], fill, rollData = {} } = {}) {
  const held = deepFreeze(
    library({
      ...(instances && { instances }),
      ...(counters && { counters }),
      ...(version && { version }),
    })
  );
  const before = structuredClone(held);
  const die = scriptedRollDie(script, { fill });
  const result = resolveStartedWith({ library: held, rollData, rollDie: die.rollDie });
  assert.deepEqual(held, before, 'the library is never mutated');
  return { result, die };
}

const heatFormula = (startFormula) => [
  instance('heat', { start: 2, min: 1, max: 18, target: 12, startFormula }),
];

describe('resolveStartedWith', () => {
  it('takes a plain start in Counter Instance order, with no formula value and no rolls', () => {
    const { result, die } = start();
    assert.deepEqual(result, {
      ok: true,
      counters: [
        { counterId: 'heat', value: 2 },
        { counterId: 'ember', value: 5 },
        { counterId: 'fuel', value: 3 },
      ],
      startedWith: [
        { counterId: 'heat', value: 2, formulaValue: null, rolls: [], clamped: false },
        { counterId: 'ember', value: 5, formulaValue: null, rolls: [], clamped: false },
        { counterId: 'fuel', value: 3, formulaValue: null, rolls: [], clamped: false },
      ],
    });
    assert.deepEqual(die.requested, []);
  });

  it('records one total per dice term, and the formula value replaces the start', () => {
    const { result, die } = start({ instances: heatFormula('2d6 + 1d4 + 1'), script: [1, 2, 3] });
    assert.deepEqual(result.startedWith, [
      { counterId: 'heat', value: 7, formulaValue: 7, rolls: [3, 3], clamped: false },
    ]);
    assert.deepEqual(result.counters, [{ counterId: 'heat', value: 7 }]);
    assert.deepEqual(die.requested, [6, 6, 4]);
    die.assertDrained();
  });

  it('reads the configured bounds and target, and the roll data', () => {
    const formula = '@min.heat + @target.heat + @abilities.mod';
    const { result } = start({
      instances: heatFormula(formula),
      rollData: { abilities: { mod: 3 } },
    });
    assert.equal(result.startedWith[0].formulaValue, 16);
    assert.equal(result.startedWith[0].value, 16);
    assert.equal(result.startedWith[0].clamped, false);
  });

  it('clamps to the effective bounds and flags it, keeping the unclamped formula value', () => {
    const high = start({ instances: heatFormula('1d20'), script: [19] }).result;
    assert.deepEqual(high.startedWith[0], {
      counterId: 'heat',
      value: 18,
      formulaValue: 19,
      rolls: [19],
      clamped: true,
    });
    assert.equal(start({ instances: heatFormula('0 - 4') }).result.startedWith[0].value, 1);
    const plain = start({ instances: [instance('fuel', { start: 15, min: 4, max: 6 })] }).result;
    assert.deepEqual(plain.startedWith[0], {
      counterId: 'fuel',
      value: 10,
      formulaValue: null,
      rolls: [],
      clamped: true,
    });
  });

  it('draws in Counter Instance order, each formula once', () => {
    const instances = [
      instance('heat', { start: 2, min: 1, max: 18, startFormula: '1d6' }),
      instance('ember', { start: 5, startFormula: '1d8' }),
    ];
    const { result, die } = start({ instances, script: [3, 4] });
    assert.deepEqual(die.requested, [6, 8]);
    assert.deepEqual(
      result.counters.map((entry) => entry.value),
      [3, 4]
    );
    die.assertDrained();
  });

  it('holds an empty Counter Instance list as nothing to start', () => {
    assert.deepEqual(start({ instances: [] }).result, { ok: true, counters: [], startedWith: [] });
  });

  it('is deterministic for the same inputs and script', () => {
    const options = { instances: heatFormula('3d6x'), script: [2, 6, 3, 1] };
    assert.deepEqual(start(options).result, start(options).result);
  });

  describe('refuses', () => {
    it('a library from a newer build', () => {
      const { result } = start({ version: 2 });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'version-unsupported');
    });

    it('a null start, bound or target as invalid-entry naming the counter', () => {
      for (const extra of [{ start: null }, { min: null }, { max: null }, { target: null }]) {
        const { result } = start({ instances: [instance('heat', { start: 2, ...extra })] });
        assert.equal(result.reason, 'invalid-entry', JSON.stringify(extra));
        assert.equal(result.detail.entryId, 'heat');
      }
    });

    it('a start that is not a finite number as invalid-entry on the instance', () => {
      for (const bad of [NaN, Infinity, 'two']) {
        const { result } = start({ instances: [instance('heat', { start: bad })] });
        assert.equal(result.reason, 'invalid-entry', String(bad));
        assert.deepEqual(result.detail, { entryId: 'heat', kind: 'instance' });
      }
    });

    it('a limit outside its enum on a counter an instance uses, and only on that one', () => {
      const spare = (extra) => [counter('heat', { limit: 'none' }), counter('spare', extra)];
      const used = start({ counters: [counter('heat', { limit: 'sideways' })] }).result;
      assert.equal(used.reason, 'invalid-entry');
      assert.deepEqual(used.detail, { entryId: 'heat', kind: 'counter' });
      const unused = start({
        instances: [instance('heat')],
        counters: spare({ limit: 'sideways' }),
      });
      assert.equal(unused.result.ok, true);
      const nullBound = spare({ limit: 'global', min: null });
      assert.equal(start({ instances: [instance('heat')], counters: nullBound }).result.ok, true);
    });

    it('an @counter, @sessionCount or @check read as an invalid expression', () => {
      for (const [formula, expressionReason] of [
        ['@counter.heat', 'forbidden-root'],
        ['@sessionCount', 'forbidden-root'],
        ['@check.value', 'forbidden-root'],
        ['@max.ember', 'unresolved-path'],
        ['1 +', 'invalid'],
        ['1d6x>=1', 'explode-limit'],
      ]) {
        const { result } = start({ instances: heatFormula(formula), fill: 3 });
        assert.equal(result.ok, false, formula);
        assert.equal(result.reason, 'expression-invalid', formula);
        assert.deepEqual(result.detail, { entryId: 'heat', expressionReason }, formula);
      }
    });

    it('a die that cannot answer as roll-unavailable naming the counter', () => {
      const { result } = start({ instances: heatFormula('1d6'), fill: 9 });
      assert.equal(result.reason, 'roll-unavailable');
      assert.deepEqual(result.detail, { entryId: 'heat' });
    });

    it('with nothing started, even after an earlier counter drew', () => {
      const instances = [
        instance('heat', { start: 2, min: 1, max: 18, startFormula: '1d6' }),
        instance('ember', { start: 5, startFormula: '1 +' }),
      ];
      const { result } = start({ instances, script: [3] });
      assert.deepEqual(Object.keys(result).sort(byCodePoint), ['detail', 'ok', 'reason']);
    });
  });
});
