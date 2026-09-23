/**
 * Doubles for Foundry's forced-deletion forms (issue 1842): V13's `-=<key>: null` and V14's
 * `foundry.data.operators.ForcedDeletion` at the bare key.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/** Stands in for V14's `foundry.data.operators.ForcedDeletion`. */
export class FakeForcedDeletion {
  /** Names the operator in an assertion diff, as core's own class name would. */
  get [Symbol.toStringTag]() {
    return 'ForcedDeletion';
  }
}

export function isForcedDeletion(value) {
  return value instanceof FakeForcedDeletion;
}

export function isForcedDeletionInstalled() {
  return globalThis.foundry?.data?.operators?.ForcedDeletion === FakeForcedDeletion;
}

/** Fails on any key, or dotted key segment, that spells the legacy `-=` form. */
export function assertNoLegacyDeletionKeys(payload, path = 'payload') {
  if (!payload || typeof payload !== 'object' || isForcedDeletion(payload)) return;
  for (const [key, value] of Object.entries(payload)) {
    assert.ok(
      !key.split('.').some((segment) => segment.startsWith('-=')),
      `${path} carries the legacy deletion key "${key}" while the operator is installed`
    );
    assertNoLegacyDeletionKeys(value, `${path}.${key}`);
  }
}

/** Every double's recorder: log the write, refusing a legacy key while the operator is installed. */
export function recordWrite(log, payload, entry = payload) {
  if (isForcedDeletionInstalled()) assertNoLegacyDeletionKeys(payload);
  log.push(entry);
}

/**
 * The key one entry deletes, or `null` when it is an ordinary write. A `-=` key must carry
 * `null`, as core's `_migrateDeletionKey` requires.
 */
export function deletedKey(key, value) {
  if (isForcedDeletion(value)) return key;
  if (!key.startsWith('-=')) return null;
  if (value !== null) throw new Error(`"${key}" is a deletion key but its value is not null`);
  return key.slice(2);
}

export function countForcedDeletions(value) {
  if (isForcedDeletion(value)) return 1;
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value).reduce((total, inner) => total + countForcedDeletions(inner), 0);
}

/** An exact, non-zero operator count, so an anti-guard over zero recorded writes cannot pass. */
export function assertForcedDeletionCount(payloads, expected) {
  assert.ok(expected >= 1, 'a V14 test must expect at least one operator');
  assert.equal(countForcedDeletions(payloads), expected, 'operator leaves across recorded writes');
}

/** A V13 golden in the V14 form: each `-=<key>: null` becomes `<key>: ForcedDeletion`. */
export function toOperatorForm(value) {
  if (Array.isArray(value)) return value.map(toOperatorForm);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => {
      const segments = key.split('.');
      const last = segments.at(-1);
      if (!last.startsWith('-=') || inner !== null) return [key, toOperatorForm(inner)];
      return [[...segments.slice(0, -1), last.slice(2)].join('.'), new FakeForcedDeletion()];
    })
  );
}

/** Install the operator; the returned restore removes exactly the node this created. */
export function installForcedDeletion() {
  const root = globalThis.foundry;
  if (!root) {
    const created = { data: { operators: { ForcedDeletion: FakeForcedDeletion } } };
    globalThis.foundry = created;
    return () => {
      if (Object.is(globalThis.foundry, created)) delete globalThis.foundry;
    };
  }
  if (!Object.hasOwn(root, 'data')) {
    root.data = { operators: { ForcedDeletion: FakeForcedDeletion } };
    return () => delete root.data;
  }
  if (!Object.hasOwn(root.data, 'operators')) {
    root.data.operators = { ForcedDeletion: FakeForcedDeletion };
    return () => delete root.data.operators;
  }
  const { operators } = root.data;
  const hadPrior = Object.hasOwn(operators, 'ForcedDeletion');
  const prior = operators.ForcedDeletion;
  operators.ForcedDeletion = FakeForcedDeletion;
  return () => {
    if (hadPrior) operators.ForcedDeletion = prior;
    else delete operators.ForcedDeletion;
  };
}

/**
 * Registers `name` once per form. The body calls `deletion.apply()` after its own global setup:
 * the V14 arm installs the operator there and restores it after the test, the V13 arm asserts
 * it is absent. `deletion.expect(golden)` returns the golden in the form under test, and
 * `deletion.assertOperators(payloads, n)` expects exactly `n` operators on V14 and none on V13.
 */
export function forEachDeletionForm(name, body) {
  for (const v14 of [false, true]) {
    test(`${name} [${v14 ? 'V14 operator' : 'V13 -= key'}]`, async (t) => {
      let applied = false;
      const deletion = {
        v14,
        apply() {
          assert.equal(applied, false, 'apply() runs once per test');
          applied = true;
          if (v14) {
            t.after(installForcedDeletion());
            assert.equal(globalThis.foundry.data.operators.ForcedDeletion, FakeForcedDeletion);
          } else {
            assert.equal(globalThis.foundry?.data?.operators?.ForcedDeletion, undefined);
          }
        },
        expect: (golden) => (v14 ? toOperatorForm(golden) : golden),
        assertOperators(payloads, expected) {
          if (v14) assertForcedDeletionCount(payloads, expected);
          else assert.equal(countForcedDeletions(payloads), 0, 'V13 writes no operator');
        },
      };
      await body(deletion, t);
      assert.ok(applied, 'the body never applied its deletion form');
    });
  }
}
