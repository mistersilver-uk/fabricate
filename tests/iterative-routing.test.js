/** Terminal routing and the counter rule evaluator (`resolution-modes` § Iterative Terminal Routing). */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { atLeast, deepFreeze } from './helpers/iterativeAttemptFixtures.js';

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

const { evaluateCounterRule } = await import('../src/systems/iterative/counterRule.js');
const { producedLineHolds, selectProducedGroup } =
  await import('../src/systems/iterative/routing.js');

after(() => assert.deepEqual(reads, [], 'no routing module reads a Foundry global'));

const facts = (counters = {}, extra = {}) =>
  deepFreeze({
    counters: new Map(Object.entries({ heat: 8, ember: 2, ...counters })),
    sessionCount: 3,
    previousActionId: null,
    ...extra,
  });

describe('evaluateCounterRule', () => {
  const OPS = [
    ['>=', [8, 9, 7], [true, false, true]],
    ['<=', [8, 9, 7], [true, true, false]],
    ['>', [8, 9, 7], [false, false, true]],
    ['<', [8, 9, 7], [false, true, false]],
    ['=', [8, 9, 7], [true, false, false]],
  ];
  for (const [op, values, expected] of OPS) {
    it(`compares a counter with ${op}`, () => {
      const held = values.map((value) =>
        evaluateCounterRule({ source: 'counter', counterId: 'heat', op, value }, facts())
      );
      assert.deepEqual(held, expected);
    });
  }

  it('compares the session count', () => {
    assert.equal(
      evaluateCounterRule({ source: 'sessionCount', op: '>=', value: 3 }, facts()),
      true
    );
    assert.equal(
      evaluateCounterRule({ source: 'sessionCount', op: '>', value: 3 }, facts()),
      false
    );
  });

  it('matches previousAction against the previous action id, and none when there is none', () => {
    const rule = { source: 'previousAction', actionIds: ['a', 'b'] };
    assert.equal(evaluateCounterRule(rule, facts({}, { previousActionId: 'b' })), true);
    assert.equal(evaluateCounterRule(rule, facts({}, { previousActionId: 'c' })), false);
    assert.equal(evaluateCounterRule(rule, facts()), false);
  });

  it('holds no rule that names an absent counter or does not parse', () => {
    assert.equal(evaluateCounterRule(atLeast('ghost', 0), facts()), false);
    assert.equal(
      evaluateCounterRule({ source: 'counter', counterId: 'heat', op: '~', value: 1 }, facts()),
      false
    );
    assert.equal(evaluateCounterRule(null, facts()), false);
    assert.equal(evaluateCounterRule({ source: 'tool' }, facts()), false);
  });
});

describe('producedLineHolds', () => {
  it('holds an empty or absent rule list, and a list only when every rule holds', () => {
    assert.equal(producedLineHolds({ end: 'success', rules: [] }, facts()), true);
    assert.equal(producedLineHolds({ end: 'success' }, facts()), true);
    assert.equal(
      producedLineHolds(
        { end: 'success', rules: [atLeast('heat', 8), atLeast('ember', 2)] },
        facts()
      ),
      true
    );
    assert.equal(
      producedLineHolds(
        { end: 'success', rules: [atLeast('heat', 8), atLeast('ember', 3)] },
        facts()
      ),
      false
    );
  });
});

describe('selectProducedGroup', () => {
  const groups = deepFreeze([
    { id: 'rare', producedWhen: [{ end: 'success', rules: [atLeast('heat', 12)] }] },
    {
      id: 'either',
      producedWhen: [
        { end: 'success', rules: [atLeast('heat', 99)] },
        { end: 'success', rules: [atLeast('heat', 8)] },
      ],
    },
    { id: 'always', producedWhen: [{ end: 'success', rules: [] }] },
    { id: 'slag', role: 'failure', producedWhen: [{ end: 'failure', rules: [] }] },
    { id: 'bare' },
  ]);

  it('selects the first group in order whose line for the end holds', () => {
    assert.equal(selectProducedGroup(groups, 'success', facts({ heat: 12 })).id, 'rare');
    assert.equal(selectProducedGroup(groups, 'success', facts()).id, 'either');
    assert.equal(selectProducedGroup(groups, 'success', facts({ heat: 1 })).id, 'always');
  });

  it('reads lines as alternatives, so one holding line is enough', () => {
    const only = groups.filter((group) => group.id === 'either');
    assert.equal(selectProducedGroup(only, 'success', facts()).id, 'either');
    assert.equal(selectProducedGroup(only, 'success', facts({ heat: 1 })), null);
  });

  it('selects nothing when no line matches the end, and never a group with no producedWhen', () => {
    assert.equal(
      selectProducedGroup(
        groups.filter((g) => g.id === 'bare'),
        'success',
        facts()
      ),
      null
    );
    assert.equal(selectProducedGroup(groups.slice(0, 2), 'failure', facts()), null);
    assert.equal(selectProducedGroup([], 'success', facts()), null);
    assert.equal(selectProducedGroup(undefined, 'success', facts()), null);
  });

  it('selects the failure group by its producedWhen alone, never by its role', () => {
    assert.equal(selectProducedGroup(groups, 'failure', facts()).id, 'slag');
    const unrouted = [
      { id: 'slag', role: 'failure' },
      { id: 'plain', producedWhen: [{ end: 'success', rules: [] }] },
    ];
    assert.equal(selectProducedGroup(unrouted, 'failure', facts()), null);
  });

  it('reads the facts it is given and never mutates them or the groups', () => {
    const held = facts();
    const before = structuredClone(groups);
    selectProducedGroup(groups, 'success', held);
    assert.deepEqual(groups, before);
  });
});
