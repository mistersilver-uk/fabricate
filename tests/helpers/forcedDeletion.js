/**
 * Doubles for Foundry's forced-deletion forms (issue 1842): V13's `-=<key>: null` and V14's
 * `foundry.data.operators.ForcedDeletion` at the bare key; and for its forced-replacement forms,
 * V13's `==<key>: value` and V14's `ForcedReplacement.create(value)` at the bare key.
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

/** Stands in for V14's `foundry.data.operators.ForcedReplacement`, holding the value it assigns. */
export class FakeForcedReplacement {
  constructor(value) {
    this.value = value;
  }

  static create(value) {
    return new FakeForcedReplacement(value);
  }

  get [Symbol.toStringTag]() {
    return 'ForcedReplacement';
  }
}

export function isForcedReplacement(value) {
  return value instanceof FakeForcedReplacement;
}

export function isForcedReplacementInstalled() {
  return globalThis.foundry?.data?.operators?.ForcedReplacement === FakeForcedReplacement;
}

function assertNoLegacyKeys(payload, prefix, kind, path) {
  if (!payload || typeof payload !== 'object' || isForcedDeletion(payload)) return;
  for (const [key, value] of Object.entries(payload)) {
    assert.ok(
      !key.split('.').some((segment) => segment.startsWith(prefix)),
      `${path} carries the legacy ${kind} key "${key}" while the operator is installed`
    );
    assertNoLegacyKeys(value, prefix, kind, `${path}.${key}`);
  }
}

/** Fails on any key, or dotted key segment, that spells the legacy `-=` form. */
export function assertNoLegacyDeletionKeys(payload, path = 'payload') {
  assertNoLegacyKeys(payload, '-=', 'deletion', path);
}

/** Every double's recorder: log the write, refusing a legacy key while its operator is installed. */
export function recordWrite(log, payload, entry = payload) {
  if (isForcedDeletionInstalled()) assertNoLegacyDeletionKeys(payload);
  if (isForcedReplacementInstalled()) assertNoLegacyKeys(payload, '==', 'replacement', 'payload');
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

/** The `{ key, value }` one entry replaces wholesale, or `null` when it is an ordinary write. */
export function replacedKey(key, value) {
  if (isForcedReplacement(value)) return { key, value: value.value };
  return key.startsWith('==') ? { key: key.slice(2), value } : null;
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

/** A V13 golden in the V14 form: each `==<key>: value` becomes `<key>: ForcedReplacement`. */
export function toReplacementForm(value) {
  if (Array.isArray(value)) return value.map(toReplacementForm);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => {
      const segments = key.split('.');
      const last = segments.at(-1);
      if (!last.startsWith('==')) return [key, toReplacementForm(inner)];
      const bare = [...segments.slice(0, -1), last.slice(2)].join('.');
      return [bare, FakeForcedReplacement.create(inner)];
    })
  );
}

function installOperator(name, Operator) {
  const root = globalThis.foundry;
  if (!root) {
    const created = { data: { operators: { [name]: Operator } } };
    globalThis.foundry = created;
    return () => {
      if (Object.is(globalThis.foundry, created)) delete globalThis.foundry;
    };
  }
  if (!Object.hasOwn(root, 'data')) {
    root.data = { operators: { [name]: Operator } };
    return () => delete root.data;
  }
  if (!Object.hasOwn(root.data, 'operators')) {
    root.data.operators = { [name]: Operator };
    return () => delete root.data.operators;
  }
  const { operators } = root.data;
  const hadPrior = Object.hasOwn(operators, name);
  const prior = operators[name];
  operators[name] = Operator;
  return () => {
    if (hadPrior) operators[name] = prior;
    else delete operators[name];
  };
}

/** Install the operator; the returned restore removes exactly the node this created. */
export function installForcedDeletion() {
  return installOperator('ForcedDeletion', FakeForcedDeletion);
}

/** Install the replacement operator, restored the same way as {@link installForcedDeletion}. */
export function installForcedReplacement() {
  return installOperator('ForcedReplacement', FakeForcedReplacement);
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

/**
 * Registers `name` once per replacement form. `form.apply()` installs both V14 operators (a V14
 * build carries both) or asserts both absent on V13; `form.expect(golden)` returns a V13 `==`
 * golden in the form under test.
 */
export function forEachReplacementForm(name, body) {
  for (const v14 of [false, true]) {
    test(`${name} [${v14 ? 'V14 operator' : 'V13 == key'}]`, async (t) => {
      let applied = false;
      const form = {
        v14,
        apply() {
          assert.equal(applied, false, 'apply() runs once per test');
          applied = true;
          if (v14) {
            t.after(installForcedDeletion());
            t.after(installForcedReplacement());
            assert.equal(globalThis.foundry.data.operators.ForcedReplacement, FakeForcedReplacement);
          } else {
            assert.equal(globalThis.foundry?.data?.operators?.ForcedDeletion, undefined);
            assert.equal(globalThis.foundry?.data?.operators?.ForcedReplacement, undefined);
          }
        },
        expect: (golden) => (v14 ? toReplacementForm(golden) : golden),
      };
      await body(form, t);
      assert.ok(applied, 'the body never applied its replacement form');
    });
  }
}
