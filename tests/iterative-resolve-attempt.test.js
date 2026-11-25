/** The Iterative Attempt resolver: its frozen phases, refusals, draw order and entry (`resolution-modes`). */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import {
  action,
  atLeast,
  cost,
  deepFreeze,
  effect,
  instance,
  library,
  logEntry,
  state,
  step,
} from './helpers/iterativeAttemptFixtures.js';
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

const { buildAttemptLibrary, iterativeLabels } =
  await import('../src/systems/iterative/attemptLibrary.js');
const { counterRuleFault } = await import('../src/systems/iterative/counterRule.js');
const { ATTEMPT_PHASES, ITERATIVE_ATTEMPT_REFUSALS, preflightAttempt, resolveAttempt } =
  await import('../src/systems/iterative/resolveAttempt.js');
const { iterativeEntryFault } = await import('../src/systems/normalize/iterativeLibrary.js');

after(() => assert.deepEqual(reads, [], 'no resolver module reads a Foundry global'));

const HIT = Object.freeze({ success: true, outcomeId: 'hit', value: 14 });

/**
 * Resolves one attempt on deep-frozen inputs with a scripted die. `tweak(inputs)` edits the plain
 * inputs before they are frozen; the outcome carries a deep copy of them as they were.
 */
function go({
  state: stateOptions,
  action: actionOptions,
  library: libraryOptions,
  check = null,
  rollData = {},
  script = [],
  fill,
  tweak,
} = {}) {
  const inputs = {
    state: state(stateOptions),
    action: action(actionOptions),
    library: library(libraryOptions),
    rollData,
    check,
  };
  tweak?.(inputs);
  deepFreeze(inputs);
  const before = structuredClone(inputs);
  const die = scriptedRollDie(script, { fill });
  const result = resolveAttempt({ ...inputs, rollDie: die.rollDie });
  assert.deepEqual(inputs, before, 'no input is mutated');
  return { result, die, inputs };
}

const counterValues = (next) =>
  Object.fromEntries(next.counters.map((c) => [c.counterId, c.value]));

/** The attempt must succeed; returns its result. */
function succeeds(options) {
  const { result, die } = go(options);
  assert.equal(result.ok, true, `refused as ${result.reason} ${JSON.stringify(result.detail)}`);
  return { ...result, die };
}

const effectsOn = (...effects) => ({ effects });
const OPEN_STEP = { library: { step: step({ success: [atLeast('heat', 99)] }) } };

describe('ATTEMPT_PHASES', () => {
  it('is the frozen D3 order', () => {
    assert.deepEqual(ATTEMPT_PHASES, [
      'preflight',
      'check',
      'costs',
      'effects',
      'clamp',
      'terminal',
      'everySession',
      'reclamp',
      'countdown',
      'routing',
    ]);
    assert.ok(Object.isFrozen(ATTEMPT_PHASES));
  });
});

const ghost = effect('e', 'ghost', 'add', '1');
const BAD_RULE = { source: 'counter', counterId: 'heat', op: '~', value: 1 };

/** Each refusal reason with one input that raises it. */
const REFUSALS = [
  ['version-unsupported', { state: { version: 2 } }],
  ['version-unsupported', { library: { version: 2 } }],
  ['step-ended', { state: { terminal: { kind: 'success', attempt: 1, resultGroupId: null } } }],
  ['invalid-entry', { action: { availability: { combine: 'all', rules: [BAD_RULE] } } }],
  ['invalid-entry', { action: { costs: [{ id: 'c', amount: '1' }] } }],
  ['invalid-entry', { action: effectsOn({ ...effect('e', 'heat', 'mul', '1') }) }],
  ['invalid-entry', { action: { check: 'sometimes' } }],
  ['invalid-entry', { library: { step: step({ success: [{ source: 'counter' }] }) } }],
  ['invalid-entry', { library: { resultGroups: [{ id: 'g', producedWhen: [{ end: 'x' }] }] } }],
  [
    'invalid-entry',
    {
      library: {
        resultGroups: [{ id: 'g', producedWhen: [{ end: 'success', rules: [BAD_RULE] }] }],
      },
    },
  ],
  ['invalid-entry', { library: { instances: [instance('heat', { start: null })] } }],
  ['invalid-entry', { library: { instances: [instance('heat', { max: null })] } }],
  ['invalid-entry', { library: { instances: [instance('heat', { target: null })] } }],
  [
    'invalid-entry',
    { library: { counters: [{ id: 'heat', label: 'H', limit: 'global', min: null }] } },
  ],
  ['invalid-entry', { library: { instances: [instance('heat', { startFormula: null })] } }],
  ['invalid-entry', { library: { counters: [{ id: 'heat', label: 'H', limit: 'sideways' }] } }],
  ['invalid-entry', { action: { costs: 'free' } }],
  ['invalid-entry', { action: { effects: 'none' } }],
  ['invalid-entry', { action: { availability: { combine: 'all', rules: 'always' } } }],
  ['invalid-entry', { state: { values: { heat: null } } }],
  ['invalid-entry', { state: { attemptCount: 'one' } }],
  [
    'invalid-entry',
    { tweak: (i) => (i.state.counters = i.state.counters.filter((c) => c.counterId !== 'heat')) },
  ],
  ['invalid-entry', { tweak: (i) => (i.state.counters = [...i.state.counters, null]) }],
  [
    'invalid-entry',
    { library: { step: step({ actions: { mode: 'only', actionIds: 'workshop' } }) } },
  ],
  ['invalid-entry', { library: { step: step({ hiddenCounterIds: 'heat' }) } }],
  ['invalid-entry', { library: { step: step({ lockedCounterIds: 'heat' }) } }],
  ['invalid-entry', { library: { step: step({ actions: 'all' }) } }],
  ['action-not-allowed', { library: { step: step({ actions: { mode: 'only', actionIds: [] } }) } }],
  ['unknown-counter', { action: { costs: [cost('c', 'ghost', '1')] } }],
  ['unknown-counter', { action: effectsOn(ghost) }],
  [
    'unknown-counter',
    { action: { availability: { combine: 'all', rules: [atLeast('ghost', 1)] } } },
  ],
  ['unknown-counter', { library: { step: step({ failure: [atLeast('ghost', 1)] }) } }],
  [
    'action-unavailable',
    { action: { availability: { combine: 'all', rules: [atLeast('heat', 9)] } } },
  ],
  ['cost-unaffordable', { action: { costs: [cost('c', 'fuel', '4')] } }],
  ['expression-invalid', { action: { costs: [cost('c', 'ember', '1d4')] } }],
  ['expression-invalid', { action: { costs: [cost('c', 'ember', '@check.value')] } }],
  ['expression-invalid', { action: { costs: [cost('c', 'ember', '-1')] } }],
  ['expression-invalid', { action: effectsOn(effect('e', 'heat', 'add', '1 +')) }],
  [
    'expression-invalid',
    { action: effectsOn(effect('e', 'heat', 'add', '@counter.nope')), fill: 1 },
  ],
  ['expression-invalid', { action: effectsOn(effect('e', 'heat', 'add', '1d6x>=1')), fill: 3 }],
  ['roll-unavailable', { action: effectsOn(effect('e', 'heat', 'add', '1d6')), fill: 9 }],
  ['check-mismatch', { action: { check: 'roll' } }],
  ['check-mismatch', { check: HIT }],
  [
    'check-mismatch',
    { action: { check: 'roll' }, check: { success: 1, outcomeId: null, value: 3 } },
  ],
  [
    'check-mismatch',
    { action: { check: 'roll' }, check: { success: true, outcomeId: 3, value: 3 } },
  ],
  ['check-mismatch', { action: { check: 'roll' }, check: { success: true, outcomeId: null } }],
];

describe('refusals', () => {
  it('list every reason the resolver can return, and every row is covered', () => {
    const reasons = Object.values(ITERATIVE_ATTEMPT_REFUSALS).sort(byCodePoint);
    assert.deepEqual([...new Set(REFUSALS.map(([reason]) => reason))].sort(byCodePoint), reasons);
    assert.ok(Object.isFrozen(ITERATIVE_ATTEMPT_REFUSALS));
  });

  for (const [reason, options] of REFUSALS) {
    it(`refuses as ${reason}: ${JSON.stringify(options).slice(0, 90)}`, () => {
      const { result } = go(options);
      assert.equal(result.ok, false);
      assert.equal(result.reason, reason);
      assert.equal(typeof result.detail, 'object');
      assert.deepEqual(Object.keys(result).sort(byCodePoint), ['detail', 'ok', 'reason']);
    });
  }

  it('names the state row a state is missing', () => {
    const tweak = (i) =>
      (i.state.counters = i.state.counters.filter((c) => c.counterId !== 'heat'));
    assert.deepEqual(go({ tweak }).result.detail, { entryId: 'heat', kind: 'state' });
  });

  it('refuses a counter limit outside its enum only for a counter an instance uses', () => {
    const counters = (limit) => [...library().counters, { id: 'spare', label: 'Spare', limit }];
    assert.equal(go({ library: { counters: counters('sideways') } }).result.ok, true);
    const used = { ...library().counters[1], limit: 'sideways' };
    const held = [library().counters[0], used, library().counters[2]];
    const { result } = go({ library: { counters: held } });
    assert.equal(result.reason, 'invalid-entry');
    assert.deepEqual(result.detail, { entryId: 'ember', kind: 'counter' });
  });

  it('names the entry and the expression reason of an invalid expression', () => {
    const detailOf = (options) => go(options).result.detail;
    assert.deepEqual(detailOf({ action: { costs: [cost('c', 'ember', '1d4')] } }), {
      entryId: 'c',
      expressionReason: 'dice',
    });
    assert.deepEqual(detailOf({ action: { costs: [cost('c', 'ember', '-1')] } }), {
      entryId: 'c',
      expressionReason: 'negative-cost',
    });
    const runaway = { action: effectsOn(effect('e', 'heat', 'add', '1d6x>=1')), fill: 3 };
    assert.deepEqual(detailOf(runaway), { entryId: 'e', expressionReason: 'explode-limit' });
    const dead = { action: effectsOn(effect('e', 'heat', 'add', '1d6')), fill: 9 };
    assert.deepEqual(detailOf(dead), { entryId: 'e' });
  });

  it('refuses in the order version, ended, invalid, allowed, counter, availability, expression, cost, check', () => {
    const chain = [
      ['version-unsupported', (i) => (i.state.version = 2)],
      [
        'step-ended',
        (i) => (i.state.terminal = { kind: 'failure', attempt: 1, resultGroupId: null }),
      ],
      ['invalid-entry', (i) => (i.state.counters[0].value = null)],
      ['action-not-allowed', (i) => (i.library.step.actions = { mode: 'only', actionIds: [] })],
      [
        'unknown-counter',
        (i) => {
          i.action.costs.push(cost('g', 'ghost', '1'));
        },
      ],
      ['action-unavailable', (i) => (i.action.availability.rules = [atLeast('heat', 99)])],
      [
        'expression-invalid',
        (i) => {
          i.action.costs.push(cost('x', 'ember', '1d4'));
        },
      ],
      [
        'cost-unaffordable',
        (i) => {
          i.action.costs.push(cost('big', 'fuel', '4'));
        },
      ],
      ['check-mismatch', (i) => (i.action.check = 'roll')],
    ];
    for (const [index, [reason]] of chain.entries()) {
      const tweak = (inputs) => {
        for (const [, patch] of chain.slice(index)) patch(inputs);
      };
      assert.equal(go({ tweak }).result.reason, reason);
    }
  });

  it('counts no attempt and no session, and draws nothing, on a refusal', () => {
    const { result, die, inputs } = go({
      action: { costs: [cost('c', 'fuel', '4')], effects: [effect('e', 'heat', 'add', '1d6')] },
    });
    assert.equal(result.reason, 'cost-unaffordable');
    assert.deepEqual(die.requested, []);
    assert.equal(inputs.state.attemptCount, 0);
    assert.equal(inputs.state.sessionCount, 0);
  });

  it('never calls the die for a negative cost', () => {
    const { result, die } = go({ action: { costs: [cost('c', 'ember', '0 - 1')] } });
    assert.equal(result.detail.expressionReason, 'negative-cost');
    assert.deepEqual(die.requested, []);
  });
});

describe('invalid-entry agrees with the C2 fault helpers', () => {
  const bads = [
    ['cost', { id: 'c', counterId: 'ember', amount: {} }],
    ['cost', { id: 'Bad', counterId: 'ember', amount: '1' }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), op: 'mul' }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), when: { combine: 'maybe' } }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), target: { kind: 'tool' } }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), when: { success: 'yes' } }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), when: { checkOutcomeIds: 'hit' } }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), when: { checkOutcomeIds: ['hit', ' '] } }],
    ['effect', { ...effect('e', 'heat', 'add', '1'), when: { rules: 'always' } }],
  ];
  for (const [kind, entry] of bads) {
    it(`refuses a ${kind} that iterativeEntryFault faults`, () => {
      assert.notEqual(iterativeEntryFault(kind, entry), null);
      const patch = kind === 'cost' ? { costs: [entry] } : { effects: [entry] };
      assert.equal(go({ action: patch }).result.reason, 'invalid-entry');
    });
  }

  it('accepts a cost and an effect that parse', () => {
    const good = [cost('c', 'ember', '1'), effect('e', 'heat', 'add', '1')];
    assert.equal(iterativeEntryFault('cost', good[0]), null);
    assert.equal(iterativeEntryFault('effect', good[1]), null);
    assert.equal(go({ action: { costs: [good[0]], effects: [good[1]] } }).result.ok, true);
  });

  it('refuses a rule that counterRuleFault faults, wherever the rule sits', () => {
    const bad = [BAD_RULE, { source: 'previousAction', actionIds: [] }, { source: 'later' }];
    for (const rule of bad) {
      assert.notEqual(counterRuleFault(rule), null);
      const rows = [
        { action: { availability: { combine: 'all', rules: [rule] } } },
        { action: effectsOn(effect('e', 'heat', 'add', '1', { combine: 'all', rules: [rule] })) },
        { library: { step: step({ failure: [rule] }) } },
      ];
      for (const options of rows) assert.equal(go(options).result.reason, 'invalid-entry');
    }
    assert.equal(counterRuleFault(atLeast('heat', 1)), null);
  });
});

describe('preflight', () => {
  const inputsFor = (options = {}) => ({
    state: state(options.state),
    action: action(options.action),
    library: library(options.library),
    rollData: options.rollData ?? {},
  });

  it('allows an action under all, and under only when it is named', () => {
    const allowed = (actions) => go({ library: { step: step({ actions }) } }).result.ok;
    assert.equal(allowed({ mode: 'all', actionIds: [] }), true);
    assert.equal(allowed({ mode: 'only', actionIds: ['work'] }), true);
    assert.equal(allowed({ mode: 'only', actionIds: ['other'] }), false);
    assert.equal(allowed({ mode: 'only', actionIds: [] }), false);
  });

  it('judges availability under all and any, an empty list being open', () => {
    const [lit, dark] = [atLeast('ember', 5), atLeast('heat', 9)];
    const open = (combine, rules) => go({ action: { availability: { combine, rules } } }).result.ok;
    assert.equal(open('all', [lit, dark]), false);
    assert.equal(open('all', [lit]), true);
    assert.equal(open('any', [lit, dark]), true);
    assert.equal(open('any', [dark, dark]), false);
    assert.equal(open('all', []), true);
    assert.equal(open('any', []), true);
  });

  it('reads previousAction from the newest log entry, and no entry matches none', () => {
    const rule = { source: 'previousAction', actionIds: ['inspect'] };
    const availability = { combine: 'all', rules: [rule] };
    const ok = (log) => go({ state: { log }, action: { availability } }).result.ok;
    assert.equal(ok([]), false);
    assert.equal(ok([logEntry(1, 'inspect')]), true);
    assert.equal(ok([logEntry(1, 'inspect'), logEntry(2, 'work')]), false);
  });

  it('reads sessionCount as it stood when the attempt began', () => {
    const rules = [{ source: 'sessionCount', op: '<', value: 1 }];
    const ok = (sessionCount) =>
      go({ state: { sessionCount }, action: { availability: { combine: 'all', rules } } }).result
        .ok;
    assert.equal(ok(0), true);
    assert.equal(ok(1), false);
  });

  it('checks each needsEnough cost alone against the value held at the start', () => {
    const afford = (costs) => go({ action: { costs } }).result;
    assert.equal(afford([cost('c', 'ember', '6')]).reason, 'cost-unaffordable');
    assert.equal(afford([cost('c', 'ember', '5')]).ok, true);
    const pair = afford([cost('a', 'ember', '3'), cost('b', 'ember', '3')]);
    assert.equal(pair.ok, true);
    assert.equal(counterValues(pair.next).ember, -1);
    const loose = afford([cost('c', 'ember', '9', false)]);
    assert.equal(counterValues(loose.next).ember, -4);
    assert.deepEqual(afford([cost('a', 'ember', '3'), cost('b', 'ember', '9')]).detail, {
      entryId: 'b',
      counterId: 'ember',
      amount: 9,
    });
  });

  it('ignores a cost on a locked counter, even one it could not afford', () => {
    const locked = step({ lockedCounterIds: ['fuel'] });
    const outcome = preflightAttempt(
      inputsFor({ action: { costs: [cost('c', 'fuel', '4')] }, library: { step: locked } })
    );
    assert.deepEqual(outcome, { ok: true, costs: [] });
  });

  it('returns each unlocked cost amount, read against the state as it began', () => {
    const costs = [cost('a', 'ember', '@counter.heat + 1'), cost('b', 'ember', '@abilities.str')];
    const outcome = preflightAttempt(
      inputsFor({ action: { costs }, rollData: { abilities: { str: 2 } } })
    );
    assert.deepEqual(outcome, {
      ok: true,
      costs: [
        { costId: 'a', counterId: 'ember', amount: 3 },
        { costId: 'b', counterId: 'ember', amount: 2 },
      ],
    });
  });
});

describe('the check phase', () => {
  it('takes null for a free action and a summary for a rolled one', () => {
    assert.equal(go({ action: { check: 'roll' }, check: HIT }).result.ok, true);
    const miss = { success: false, outcomeId: null, value: 3 };
    assert.equal(go({ action: { check: 'roll' }, check: miss }).result.ok, true);
    assert.equal(go({ check: null }).result.ok, true);
  });

  it('records the summary in the entry as three keys', () => {
    const { entry } = succeeds({ action: { check: 'roll' }, check: { ...HIT, extra: 1 } });
    assert.deepEqual(entry.check, HIT);
    assert.equal(succeeds({}).entry.check, null);
  });

  it('is not terminal on a failed check', () => {
    const miss = { success: false, outcomeId: null, value: 3 };
    const { terminal } = succeeds({
      action: { check: 'roll' },
      check: miss,
      state: { values: { heat: 11 } },
    });
    assert.equal(terminal.kind, 'success');
    const failed = succeeds({ action: { check: 'roll' }, check: miss, ...OPEN_STEP });
    assert.equal(failed.terminal, null);
  });
});

describe('the costs phase', () => {
  it('reuses the amounts preflight read, each against the state as it began', () => {
    const costs = [cost('a', 'ember', '2'), cost('b', 'ember', '@counter.ember - 3')];
    const { next, entry } = succeeds({ action: { costs }, ...OPEN_STEP });
    assert.equal(counterValues(next).ember, 1);
    assert.deepEqual(entry.paid, [{ counterId: 'ember', delta: -4 }]);
  });

  it('records paid deltas as negative amounts in first-touch order, omitting zeros', () => {
    const costs = [
      cost('a', 'ember', '2'),
      cost('b', 'heat', '1'),
      cost('c', 'fuel', '0'),
      cost('d', 'ember', '1'),
    ];
    const { entry } = succeeds({ action: { costs }, ...OPEN_STEP });
    assert.deepEqual(entry.paid, [
      { counterId: 'ember', delta: -3 },
      { counterId: 'heat', delta: -1 },
    ]);
  });

  it('skips a locked counter', () => {
    const locked = step({ success: [atLeast('heat', 99)], lockedCounterIds: ['ember'] });
    const { next, entry } = succeeds({
      action: { costs: [cost('a', 'ember', '2')] },
      library: { step: locked },
    });
    assert.equal(counterValues(next).ember, 5);
    assert.deepEqual(entry.paid, []);
  });
});

describe('the effects phase', () => {
  it('applies in authored order, add and subtract accumulating and set replacing', () => {
    const effects = [
      effect('a', 'heat', 'add', '3'),
      effect('b', 'heat', 'set', '10'),
      effect('c', 'heat', 'add', '1'),
      effect('d', 'ember', 'subtract', '2'),
    ];
    const { next, entry } = succeeds({ action: effectsOn(...effects), ...OPEN_STEP });
    assert.equal(counterValues(next).heat, 11);
    assert.equal(counterValues(next).ember, 3);
    assert.deepEqual(entry.changed, [
      { counterId: 'heat', delta: 9 },
      { counterId: 'ember', delta: -2 },
    ]);
  });

  it('takes a set delta against the draft at that point, and omits a zero total', () => {
    const effects = [effect('a', 'heat', 'add', '4'), effect('b', 'heat', 'set', '1')];
    const first = succeeds({ action: effectsOn(...effects), ...OPEN_STEP });
    assert.deepEqual(first.entry.changed, [{ counterId: 'heat', delta: -1 }]);
    const cancel = [effect('a', 'heat', 'add', '3'), effect('b', 'heat', 'subtract', '3')];
    assert.deepEqual(succeeds({ action: effectsOn(...cancel), ...OPEN_STEP }).entry.changed, []);
  });

  it('reads every amount and predicate from the state as it began, after costs', () => {
    const action = {
      costs: [cost('c', 'fuel', '2')],
      effects: [
        effect('e', 'ember', 'add', '@counter.fuel'),
        effect('f', 'heat', 'add', '@sessionCount'),
      ],
    };
    const { next } = succeeds({ action, state: { sessionCount: 2 }, ...OPEN_STEP });
    assert.equal(counterValues(next).ember, 8);
    assert.equal(counterValues(next).fuel, 1);
    assert.equal(counterValues(next).heat, 4);
  });

  it('reads @check.value and the roll data', () => {
    const effects = [effect('e', 'heat', 'add', '@check.value - @abilities.mod')];
    const { next } = succeeds({
      action: { check: 'roll', ...effectsOn(...effects) },
      check: HIT,
      rollData: { abilities: { mod: 4 } },
      ...OPEN_STEP,
    });
    assert.equal(counterValues(next).heat, 12);
  });

  const KEYS = [
    ['checkOutcomeIds hit', { combine: 'all', checkOutcomeIds: ['hit'] }, true],
    ['checkOutcomeIds miss', { combine: 'all', checkOutcomeIds: ['miss'] }, false],
    ['success true', { combine: 'all', success: true }, true],
    ['success false', { combine: 'all', success: false }, false],
    ['value met', { combine: 'all', value: { op: '>=', value: 14 } }, true],
    ['value short', { combine: 'all', value: { op: '>', value: 14 } }, false],
    ['rule held', { combine: 'all', rules: [atLeast('heat', 2)] }, true],
    ['rule failed', { combine: 'all', rules: [atLeast('heat', 3)] }, false],
    [
      'previousAction',
      { combine: 'all', rules: [{ source: 'previousAction', actionIds: ['inspect'] }] },
      true,
    ],
    ['all with one false', { combine: 'all', checkOutcomeIds: ['hit'], success: false }, false],
    [
      'all with every key true',
      {
        combine: 'all',
        checkOutcomeIds: ['hit'],
        success: true,
        value: { op: '<=', value: 14 },
        rules: [atLeast('heat', 2)],
      },
      true,
    ],
    ['any with one true', { combine: 'any', checkOutcomeIds: ['miss'], success: true }, true],
    ['any with none true', { combine: 'any', checkOutcomeIds: ['miss'], success: false }, false],
    ['any over rules', { combine: 'any', rules: [atLeast('heat', 9), atLeast('heat', 2)] }, true],
    ['an empty all', { combine: 'all' }, true],
    ['an empty any', { combine: 'any' }, true],
  ];
  for (const [name, when, applies] of KEYS) {
    it(`applies an effect for ${name}: ${applies}`, () => {
      const { next } = succeeds({
        action: { check: 'roll', ...effectsOn(effect('e', 'heat', 'add', '5', when)) },
        check: HIT,
        state: { log: [logEntry(1, 'inspect')] },
        ...OPEN_STEP,
      });
      assert.equal(counterValues(next).heat, applies ? 7 : 2);
    });
  }

  it('skips an effect that reads a check fact when there is no summary, drawing nothing', () => {
    const effects = [
      effect('a', 'heat', 'add', '1d4', { combine: 'all', success: true }),
      effect('b', 'heat', 'add', '1d4 + @check.value'),
      effect('c', 'heat', 'add', '1d4', { combine: 'any', checkOutcomeIds: ['hit'] }),
      effect('d', 'heat', 'add', '1d4', { combine: 'all', value: { op: '>', value: 0 } }),
      effect('e', 'heat', 'add', '3'),
    ];
    const { next, die } = succeeds({ action: effectsOn(...effects), ...OPEN_STEP });
    assert.equal(counterValues(next).heat, 5);
    assert.deepEqual(die.requested, []);
  });

  it('skips an effect on a locked counter before its amount is read', () => {
    const locked = step({ success: [atLeast('heat', 99)], lockedCounterIds: ['heat'] });
    const effects = [effect('a', 'heat', 'add', '1d6 +'), effect('b', 'ember', 'add', '1')];
    const { next, die } = succeeds({ action: effectsOn(...effects), library: { step: locked } });
    assert.equal(counterValues(next).heat, 2);
    assert.equal(counterValues(next).ember, 6);
    assert.deepEqual(die.requested, []);
  });

  it('never rounds an amount implicitly', () => {
    const { next } = succeeds({
      action: effectsOn(effect('a', 'ember', 'add', '1 / 4')),
      ...OPEN_STEP,
    });
    assert.equal(counterValues(next).ember, 5.25);
  });
});

describe('the clamp phase', () => {
  const clamped = (counterId, op, amount) =>
    succeeds({ action: effectsOn(effect('e', counterId, op, amount)), ...OPEN_STEP });

  it('holds a perRecipe counter to the instance bounds over the counter bounds', () => {
    assert.equal(counterValues(clamped('heat', 'add', '100').next).heat, 18);
    assert.equal(counterValues(clamped('heat', 'subtract', '50').next).heat, 1);
  });

  it('holds a global counter to the system bounds, ignoring an instance override', () => {
    assert.equal(counterValues(clamped('fuel', 'add', '100').next).fuel, 10);
    assert.equal(counterValues(clamped('fuel', 'subtract', '100').next).fuel, 0);
  });

  it('leaves a counter with no limit unbounded', () => {
    assert.equal(counterValues(clamped('ember', 'add', '1000').next).ember, 1005);
    assert.equal(counterValues(clamped('ember', 'subtract', '1000').next).ember, -995);
  });

  it('records paid and changed before the clamp', () => {
    assert.deepEqual(clamped('heat', 'add', '100').entry.changed, [
      { counterId: 'heat', delta: 100 },
    ]);
  });

  it('holds a counter that sat outside its bounds to them', () => {
    const { next } = succeeds({ state: { values: { heat: 40 } }, ...OPEN_STEP });
    assert.equal(counterValues(next).heat, 18);
  });
});

describe('the terminal phase', () => {
  const outcome = (stepOptions, options = {}) =>
    succeeds({ library: { step: step(stepOptions) }, ...options }).terminal;

  it('succeeds only when every success rule holds, and never with none', () => {
    const rules = [atLeast('heat', 2), atLeast('ember', 5)];
    assert.equal(outcome({ success: rules }).kind, 'success');
    assert.equal(outcome({ success: [...rules, atLeast('fuel', 9)] }), null);
    assert.equal(outcome({ success: [] }), null);
  });

  it('fails when any failure rule holds, and a success outranks it', () => {
    const failure = [atLeast('heat', 9), atLeast('ember', 5)];
    assert.equal(outcome({ success: [atLeast('heat', 99)], failure }).kind, 'failure');
    assert.equal(outcome({ success: [], failure }).kind, 'failure');
    assert.equal(outcome({ success: [atLeast('heat', 2)], failure }).kind, 'success');
    assert.equal(outcome({ success: [atLeast('heat', 99)], failure: [atLeast('heat', 99)] }), null);
  });

  it('reads the session count this Crafting Session already advanced', () => {
    const fifth = { source: 'sessionCount', op: '>=', value: 5 };
    const rules = { success: [atLeast('heat', 99)], failure: [fifth] };
    assert.equal(outcome(rules, { state: { sessionCount: 3 } }), null);
    assert.equal(outcome(rules, { state: { sessionCount: 4 } }).kind, 'failure');
    const free = { action: { usesSession: false } };
    assert.equal(outcome(rules, { state: { sessionCount: 4 }, ...free }), null);
  });

  it('reads previousAction as the action being resolved', () => {
    const rules = { success: [{ source: 'previousAction', actionIds: ['work'] }] };
    const log = [logEntry(1, 'inspect')];
    assert.equal(outcome(rules, { state: { log } }).kind, 'success');
    assert.equal(
      outcome(
        { success: [{ source: 'previousAction', actionIds: ['inspect'] }] },
        { state: { log } }
      ),
      null
    );
  });

  it('reads the post-clamp counters', () => {
    const rules = { success: [atLeast('heat', 19)] };
    const options = { action: effectsOn(effect('e', 'heat', 'add', '100')) };
    assert.equal(outcome(rules, options), null);
  });
});

describe('terminal routing in an attempt', () => {
  const finish = (resultGroups, values = { heat: 10 }) =>
    succeeds({ library: resultGroups ? { resultGroups } : {}, state: { values } }).terminal;

  it('selects the first group whose line for the end holds', () => {
    assert.deepEqual(finish(undefined, { heat: 16 }), {
      kind: 'success',
      attempt: 1,
      resultGroupId: 'g-fine',
    });
    assert.equal(finish(undefined, { heat: 10 }).resultGroupId, 'g-plain');
  });

  it('writes an explicit null when no group matches', () => {
    const terminal = finish([{ id: 'g', producedWhen: [{ end: 'failure', rules: [] }] }]);
    assert.deepEqual(terminal, { kind: 'success', attempt: 1, resultGroupId: null });
    assert.equal(Object.hasOwn(terminal, 'resultGroupId'), true);
  });

  it('selects the failure group only by its producedWhen', () => {
    const failing = { library: { step: step({ success: [], failure: [atLeast('heat', 1)] }) } };
    assert.equal(succeeds(failing).terminal.resultGroupId, 'g-slag');
    const bare = [{ id: 'g-slag', role: 'failure' }];
    const stripped = { library: { ...failing.library, resultGroups: bare } };
    assert.equal(succeeds(stripped).terminal.resultGroupId, null);
  });

  it('routes on the final draft, so the line rules see this attempt', () => {
    const groups = [
      { id: 'g-hot', producedWhen: [{ end: 'success', rules: [atLeast('ember', 6)] }] },
    ];
    const hot = succeeds({
      library: { resultGroups: groups },
      state: { values: { heat: 10 } },
      action: effectsOn(effect('e', 'ember', 'add', '1')),
    });
    assert.equal(hot.terminal.resultGroupId, 'g-hot');
    assert.equal(
      succeeds({ library: { resultGroups: groups }, state: { values: { heat: 10 } } }).terminal
        .resultGroupId,
      null
    );
  });
});

describe('the entry and the next state', () => {
  it('stamps the attempt, the session number and the action', () => {
    const { entry, next } = succeeds({ state: { attemptCount: 3, sessionCount: 2 }, ...OPEN_STEP });
    assert.equal(entry.attempt, 4);
    assert.equal(entry.sessionNumber, 3);
    assert.equal(entry.actionId, 'work');
    assert.deepEqual(Object.keys(entry).sort(byCodePoint), [
      'actionId',
      'attempt',
      'changed',
      'check',
      'paid',
      'rolls',
      'sessionNumber',
    ]);
    assert.equal(next.attemptCount, 4);
    assert.equal(next.sessionCount, 3);
  });

  it('counts a free action as an attempt but not a session', () => {
    const { entry, next } = succeeds({
      action: { usesSession: false },
      state: { attemptCount: 1, sessionCount: 2 },
      ...OPEN_STEP,
    });
    assert.equal(entry.sessionNumber, null);
    assert.equal(next.sessionCount, 2);
    assert.equal(next.attemptCount, 2);
  });

  it('holds exactly the D2 keys and carries the log and extension keys unchanged', () => {
    const extra = {
      log: [logEntry(1, 'inspect')],
      compacted: { upTo: 1 },
      labels: { counters: [{ id: 'heat', label: 'Heat' }], actions: [] },
      startedWith: [{ counterId: 'heat', value: 2, formulaValue: null, rolls: [], clamped: false }],
      toolBreakOwed: { attempt: 1 },
    };
    const { next } = succeeds({ state: extra, ...OPEN_STEP });
    assert.deepEqual(Object.keys(next).sort(byCodePoint), [
      'attemptCount',
      'compacted',
      'counters',
      'labels',
      'log',
      'sessionCount',
      'startedWith',
      'terminal',
      'toolBreakOwed',
      'version',
    ]);
    for (const [key, value] of Object.entries(extra)) assert.deepEqual(next[key], value, key);
    assert.deepEqual(next.counters, [
      { counterId: 'heat', value: 2 },
      { counterId: 'ember', value: 5 },
      { counterId: 'fuel', value: 3 },
    ]);
    assert.equal(next.version, 1);
    assert.equal(next.terminal, null);
  });

  it('never aliases the state it was built from', () => {
    const { inputs, result } = go({
      state: { log: [logEntry(1, 'x')], toolBreakOwed: { attempt: 1 } },
      ...OPEN_STEP,
    });
    for (const key of ['counters', 'log', 'startedWith', 'toolBreakOwed']) {
      assert.notEqual(result.next[key], inputs.state[key], key);
    }
    assert.notEqual(result.next, inputs.state);
  });

  it('gives the terminal the entry attempt and the same value in the result and the state', () => {
    const { terminal, next, entry } = succeeds({
      state: { attemptCount: 6, values: { heat: 10 } },
    });
    assert.equal(terminal.attempt, entry.attempt);
    assert.deepEqual(terminal, next.terminal);
    assert.notEqual(terminal, next.terminal);
  });

  it('gives the same outputs for the same inputs and script', () => {
    const options = {
      action: effectsOn(effect('e', 'heat', 'add', '2d6x')),
      script: [3, 4],
      ...OPEN_STEP,
    };
    const [first, second] = [succeeds(options), succeeds(options)];
    delete first.die;
    delete second.die;
    assert.deepEqual(first, second);
  });
});

describe('the phases with no body yet', () => {
  it('leave the draft alone, and reclamp is idempotent', () => {
    const effects = effectsOn(effect('e', 'heat', 'add', '100'));
    const first = succeeds({ action: effects, ...OPEN_STEP });
    assert.equal(counterValues(first.next).heat, 18);
    const again = succeeds({
      action: action({ id: 'idle' }),
      state: { ...first.next, values: undefined },
      ...OPEN_STEP,
    });
    assert.deepEqual(again.next.counters, first.next.counters);
    assert.equal(again.next.sessionCount, 2);
    assert.deepEqual(again.entry.changed, []);
  });
});

describe('draw order', () => {
  it('draws effects in authored order, terms left to right, and a skipped effect not at all', () => {
    const effects = [
      effect('a', 'heat', 'add', '1d4'),
      effect('b', 'heat', 'add', '2d6kh1'),
      effect('c', 'ember', 'add', '1d8', { combine: 'all', success: true }),
      effect('d', 'heat', 'add', '1d6x'),
      effect('f', 'heat', 'add', '3'),
    ];
    const { entry, die } = succeeds({
      action: effectsOn(...effects),
      script: [4, 2, 5, 6, 3],
      ...OPEN_STEP,
    });
    assert.deepEqual(die.requested, [4, 6, 6, 6, 6]);
    assert.deepEqual(entry.rolls, [
      { effectId: 'a', total: 4 },
      { effectId: 'b', total: 5 },
      { effectId: 'd', total: 9 },
    ]);
    die.assertDrained();
  });

  it('draws a term explosions before the next effect', () => {
    const effects = [effect('a', 'heat', 'add', '1d6x + 1d4'), effect('b', 'ember', 'add', '1d6')];
    const { entry, die } = succeeds({
      action: effectsOn(...effects),
      script: [6, 3, 2, 5],
      ...OPEN_STEP,
    });
    assert.deepEqual(die.requested, [6, 6, 4, 6]);
    assert.deepEqual(entry.rolls, [
      { effectId: 'a', total: 11 },
      { effectId: 'b', total: 5 },
    ]);
    die.assertDrained();
  });

  it('draws nothing for costs and records no roll for a dice-free effect', () => {
    const { entry, die } = succeeds({
      action: { costs: [cost('c', 'ember', '1')], ...effectsOn(effect('e', 'heat', 'add', '2')) },
      ...OPEN_STEP,
    });
    assert.deepEqual(die.requested, []);
    assert.deepEqual(entry.rolls, []);
  });
});

describe('the attempt library', () => {
  const system = {
    version: 1,
    counters: [{ id: 'heat', label: 'Heat', limit: 'none' }],
    actions: [{ id: 'work', label: 'Work', costs: [] }],
  };
  const stepConfig = { actions: { mode: 'all', actionIds: [] }, success: [], failure: [] };
  const groups = [
    { id: 'g1', name: 'Name', producedWhen: [{ end: 'success', rules: [] }] },
    { id: 'g2', role: 'failure' },
  ];

  it('gathers one step of a single-step recipe', () => {
    const recipe = {
      iterative: { counters: [{ counterId: 'heat', start: 1 }], step: stepConfig },
      resultGroups: groups,
    };
    assert.deepEqual(buildAttemptLibrary(system, recipe, 0), {
      version: 1,
      counters: system.counters,
      actions: system.actions,
      instances: [{ counterId: 'heat', start: 1 }],
      step: stepConfig,
      resultGroups: [
        { id: 'g1', producedWhen: [{ end: 'success', rules: [] }] },
        { id: 'g2', role: 'failure' },
      ],
    });
  });

  it('gathers the step of a multi-step recipe by index, and nothing past the last', () => {
    const second = { ...stepConfig, success: [atLeast('heat', 2)] };
    const recipe = {
      iterative: { counters: [] },
      steps: [
        { iterative: stepConfig, resultGroups: [] },
        { iterative: second, resultGroups: groups },
      ],
    };
    assert.deepEqual(buildAttemptLibrary(system, recipe, 1).step, second);
    assert.equal(buildAttemptLibrary(system, recipe, 1).resultGroups.length, 2);
    const past = buildAttemptLibrary(system, recipe, 5);
    assert.equal(past.step, null);
    assert.deepEqual(past.resultGroups, []);
  });

  it('labels every counter and action by its id', () => {
    const labels = iterativeLabels({
      counters: [
        { id: 'heat', label: 'Heat', limit: 'none' },
        { id: 'ember', label: 'Embers' },
      ],
      actions: [{ id: 'work', label: 'Work', costs: [] }],
    });
    assert.deepEqual(labels, {
      counters: [
        { id: 'heat', label: 'Heat' },
        { id: 'ember', label: 'Embers' },
      ],
      actions: [{ id: 'work', label: 'Work' }],
    });
    assert.deepEqual(iterativeLabels({}), { counters: [], actions: [] });
  });
});
