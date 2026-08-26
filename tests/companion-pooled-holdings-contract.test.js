/**
 * The two pooled members' CONTRACT half (issue 1342) — the result factories
 * `pooledHoldingsReadResult` and `pooledHoldingsConsumeResult`, their outcome vocabulary, their
 * two key tables and the two bounds their refusals interpolate.
 *
 * `src/systems/companionContract.js` is Foundry-free, so all of this is testable here. What is
 * NOT here is the members' behaviour — resolving a name against a crafting system's definition
 * index, pooling a ladder-aware currency balance, batching a delete per actor and restoring a
 * snapshot on failure — which lives with the leaves that do it. This suite is about what the
 * two factories PROMISE a companion, and about the derivations that keep the promise from
 * disagreeing with itself.
 *
 * Three claims carry the weight:
 *
 *   - `sufficient` is DERIVED from `available` against `requested`, and a tool's is
 *     `state === 'present'` and nothing else — so a damaged tool can never read as sufficient.
 *   - `consumed` is SUMMED, twice: each ledger row from its own takes, and the call from its
 *     rows. Nothing a caller passes can make the published total disagree with the lines
 *     beneath it.
 *   - `null` MEANS FABRICATE CANNOT SEE and `0` MEANS IT CAN PROVE NONE — the shipped
 *     `creditCurrency` rule, reused here rather than re-derived into a fourth value.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_OUTCOMES,
  POOLED_ACTORS_MAX,
  POOLED_COSTS_MAX,
  POOLED_COST_TYPES,
  POOLED_HOLDINGS_CONSUME_ENTRY_OUTCOMES,
  POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
  POOLED_HOLDINGS_READ_ENTRY_OUTCOMES,
  POOLED_HOLDINGS_READ_MESSAGE_KEYS,
  POOLED_TOOL_STATES,
  POOLED_UNSERVED_COST_TYPES,
  pooledHoldingsConsumeResult,
  pooledHoldingsReadResult,
} from '../src/systems/companionContract.js';

import {
  assertContractResult,
  assertLocalizationKey,
  assertMessageIsFromTable,
  localizedString,
} from './helpers/companionContractOutcomes.js';

/** The interpolation bag each bounded refusal's STRING needs, spelled as a member supplies it. */
const READ_MESSAGE_DATA = Object.freeze({
  invalidCosts: Object.freeze({ max: POOLED_COSTS_MAX }),
  invalidActorUuids: Object.freeze({ max: POOLED_ACTORS_MAX }),
});
const CONSUME_MESSAGE_DATA = READ_MESSAGE_DATA;

/** The complete field set of one published reading, asserted by equality rather than spot-check. */
const READING_KEYS = Object.freeze([
  'index',
  'type',
  'systemId',
  'componentId',
  'unitId',
  'requested',
  'name',
  'available',
  'sufficient',
  'state',
  'ambiguous',
  'outcome',
  'message',
]);

/** The same, for one ledger row and for one take line. */
const LEDGER_ROW_KEYS = Object.freeze([
  'index',
  'type',
  'systemId',
  'componentId',
  'unitId',
  'requested',
  'attempted',
  'consumed',
  'takes',
  'outcome',
  'message',
]);
const TAKE_KEYS = Object.freeze(['actorUuid', 'documentUuid', 'quantity']);

function readAnswer(outcome, { actorUuids = [], readings = [], messageData = null } = {}) {
  const expected = {
    success: outcome === COMPANION_OUTCOMES.read,
    actorUuids,
    readings,
    outcome,
    message: POOLED_HOLDINGS_READ_MESSAGE_KEYS[outcome],
  };
  if (messageData) expected.messageData = messageData;
  return expected;
}

function consumeAnswer(
  outcome,
  { actorUuids = [], consumed = null, ledger = [], messageData = null } = {}
) {
  const expected = {
    success: outcome === COMPANION_OUTCOMES.consumed,
    actorUuids,
    consumed,
    ledger,
    outcome,
    message: POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[outcome],
  };
  if (messageData) expected.messageData = messageData;
  return expected;
}

test('every pooled read outcome answers the WHOLE documented refusal shape', () => {
  for (const outcome of Object.keys(POOLED_HOLDINGS_READ_MESSAGE_KEYS)) {
    const messageData = READ_MESSAGE_DATA[outcome] ?? null;
    const result = pooledHoldingsReadResult(outcome, messageData);
    assertContractResult(result, readAnswer(outcome, { messageData }));
    assertMessageIsFromTable(result, POOLED_HOLDINGS_READ_MESSAGE_KEYS, `the ${outcome} answer`);
    // Both are LISTS, so their absence is empty; `null` would force every caller to guard a
    // `.length` read on an answer it did not ask a question about.
    assert.deepEqual(result.actorUuids, []);
    assert.deepEqual(result.readings, []);
    assert.equal(
      result.success,
      outcome === COMPANION_OUTCOMES.read,
      `${outcome} answers the documented success boolean`
    );
  }
});

test('every pooled consume outcome answers the WHOLE documented refusal shape', () => {
  for (const outcome of Object.keys(POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS)) {
    const messageData = CONSUME_MESSAGE_DATA[outcome] ?? null;
    const result = pooledHoldingsConsumeResult(outcome, messageData);
    assertContractResult(result, consumeAnswer(outcome, { messageData }));
    assertMessageIsFromTable(result, POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS, `the ${outcome} answer`);
    // `null` and not `0`: the total is a SUM OVER the ledger, so an empty ledger makes it
    // vacuous rather than provably zero — the rule `awardComponents` already states for
    // `awarded` beside `creditCurrency`'s pure provability rule.
    assert.equal(result.consumed, null, `${outcome} has no ledger to be a zero over`);
    assert.deepEqual(result.ledger, []);
  }
});

test('insufficient is a REFUSED ACT, where the read answering no is a success', () => {
  // The line this pair is built on: `notAffordable` is a QUESTION answered no and is a success;
  // `insufficient` is an ACT refused and is not. Answering `insufficient` with `success: true`
  // would tell a companion its downtime stage was paid for.
  assert.equal(pooledHoldingsConsumeResult('insufficient').success, false);
  assert.equal(pooledHoldingsConsumeResult('consumeFailed').success, false);
  assert.equal(pooledHoldingsReadResult('readFailed').success, false);
  // And the read's own no is DATA — a reading's `sufficient: false` — never a failed call.
  const short = pooledHoldingsReadResult('read', null, {
    actorUuids: ['Actor.a'],
    readings: [{ type: 'component', componentId: 'c1', requested: 3, available: 1, outcome: 'read' }],
  });
  assert.equal(short.success, true, 'the question WAS answered, and the answer was no');
  assert.equal(short.readings[0].sufficient, false);
});

test('a reading derives sufficient from available against requested, and never guesses', () => {
  const cases = [
    { label: 'a pool that covers the cost', requested: 2, available: 5, sufficient: true },
    { label: 'a pool exactly at the cost', requested: 2, available: 2, sufficient: true },
    { label: 'a pool short of the cost', requested: 2, available: 1, sufficient: false },
    // `0` MEANS FABRICATE CAN PROVE NONE: a component nobody carries is a confident no.
    { label: 'a provably empty pool', requested: 1, available: 0, sufficient: false },
    // `null` MEANS IT CANNOT SEE: a `macro` world with no `balance` macro is not a shortfall.
    { label: 'a pool it cannot read', requested: 1, available: null, sufficient: null },
    { label: 'a cost with no quantity', requested: null, available: 4, sufficient: null },
  ];
  for (const { label, requested, available, sufficient } of cases) {
    const result = pooledHoldingsReadResult('read', null, {
      actorUuids: ['Actor.a'],
      readings: [{ type: 'component', componentId: 'c1', requested, available, outcome: 'read' }],
    });
    const [reading] = result.readings;
    assert.equal(reading.sufficient, sufficient, `${label} reads sufficient ${sufficient}`);
    assert.equal(reading.available, available, `${label} echoes available verbatim`);
  }
  // The two zeroes are distinguishable, which is the whole point of keeping both values.
  const provable = pooledHoldingsReadResult('read', null, {
    readings: [{ type: 'component', requested: 1, available: 0, outcome: 'read' }],
  });
  const unreadable = pooledHoldingsReadResult('read', null, {
    readings: [{ type: 'currency', requested: 1, outcome: 'balanceNotConfigured' }],
  });
  assert.ok(Object.is(provable.readings[0].available, 0), 'a proven zero is 0, never null');
  assert.equal(unreadable.readings[0].available, null, 'and an unreadable pool is null, never 0');
  assert.equal(unreadable.readings[0].sufficient, null, 'so it is not reported as a shortfall');
});

test('a TOOL reading is sufficient only when present, whatever its quantities say', () => {
  // The delta's own exception, and the one a display vocabulary would get wrong: `damaged` and
  // `missing` are both display states of a REQUIRED tool, and the shipped tool gate refuses a
  // damaged tool. A gate built on the state token alone would admit one.
  const states = [
    [POOLED_TOOL_STATES.present, true],
    [POOLED_TOOL_STATES.damaged, false],
    [POOLED_TOOL_STATES.missing, false],
  ];
  for (const [state, sufficient] of states) {
    const result = pooledHoldingsReadResult('read', null, {
      readings: [
        // `available: 9` is deliberately generous: a damaged tool that IS on the sheet would
        // read as sufficient under the quantity rule, and must not.
        { type: POOLED_COST_TYPES.tool, name: 'Alembic', requested: 1, available: 9, state, outcome: 'read' },
      ],
    });
    const [reading] = result.readings;
    assert.equal(reading.state, state, `a ${state} tool echoes its own state`);
    assert.equal(reading.sufficient, sufficient, `a ${state} tool is sufficient: ${sufficient}`);
  }
  // A state token the vocabulary does not name is dropped rather than carried, and the reading
  // falls back to the quantity rule — never to a fourth tool state a caller would branch on.
  const bogus = pooledHoldingsReadResult('read', null, {
    readings: [{ type: 'tool', requested: 1, available: 1, state: 'broken', outcome: 'read' }],
  });
  assert.equal(bogus.readings[0].state, null, 'an undeclared state is not published as one');
});

test('a reading is a complete frozen record whose index comes from the answer', () => {
  const result = pooledHoldingsReadResult('read', null, {
    actorUuids: ['Actor.a', 'Actor.b'],
    readings: [
      { type: 'component', name: 'Ash', componentId: 'c1', systemId: 's1', requested: 1, available: 4, outcome: 'read' },
      // `index: 99` is the mutation this case closes: a caller-supplied index would let a
      // record claim a position it does not occupy.
      { index: 99, type: 'currency', name: 'gp', unitId: 'gp', requested: 5, available: 2, outcome: 'read' },
      { type: 'component', name: 'Nothing', outcome: 'componentNotFound' },
    ],
  });
  assert.deepEqual(
    result.readings.map((reading) => reading.index),
    [0, 1, 2],
    'the index is the record’s POSITION, taken from the map and not from the caller'
  );
  for (const reading of result.readings) {
    assert.ok(Object.isFrozen(reading), 'every reading crosses the boundary frozen');
    assert.deepEqual(Object.keys(reading), [...READING_KEYS], 'the field set is the contract');
    for (const [field, value] of Object.entries(reading)) {
      assert.notEqual(value, undefined, `${field} is null when absent, never undefined`);
    }
    assertLocalizationKey(reading.message, `the ${reading.outcome} reading`);
  }
  assert.ok(Object.isFrozen(result.readings), 'the reading LIST is frozen too');
  assert.ok(Object.isFrozen(result.actorUuids), 'and so is the echoed actor set');
  // The third reading resolved nothing, and says so in this member's OWN words rather than
  // borrowing the component award's `ComponentNotFound`.
  assert.equal(
    result.readings[2].message,
    POOLED_HOLDINGS_READ_MESSAGE_KEYS.componentNotFound,
    'a reading answers from its own member’s table'
  );
  assert.equal(result.readings[2].available, null);
  assert.equal(result.readings[2].sufficient, null);
});

test('the resolved actor set is echoed back, and only as strings', () => {
  const result = pooledHoldingsReadResult('read', null, {
    actorUuids: ['Actor.a', '', null, 7, 'Scene.s.Token.t.Actor.a'],
    readings: [],
  });
  assert.deepEqual(
    result.actorUuids,
    ['Actor.a', 'Scene.s.Token.t.Actor.a'],
    'the echo is the RESOLVED set: a caller can see exactly what the answer was computed over'
  );
});

test('a consume ledger sums its own takes, and the call sums its rows', () => {
  const result = pooledHoldingsConsumeResult('consumed', null, {
    actorUuids: ['Actor.a', 'Actor.b'],
    ledger: [
      {
        type: 'component',
        systemId: 's1',
        componentId: 'c1',
        requested: 5,
        // A caller-supplied total is IGNORED: the ledger is the total, so no two published
        // figures can disagree about what was taken.
        consumed: 99,
        outcome: 'consumed',
        takes: [
          { actorUuid: 'Actor.a', documentUuid: 'Actor.a.Item.i1', quantity: 3 },
          { actorUuid: 'Actor.b', documentUuid: 'Actor.b.Item.i2', quantity: 2 },
        ],
      },
      {
        type: 'currency',
        unitId: 'gp',
        requested: 10,
        outcome: 'consumed',
        // A currency take a game system settles as a numeric property names no document.
        takes: [{ actorUuid: 'Actor.a', quantity: 10 }],
      },
    ],
  });
  assert.equal(result.consumed, 15, 'the published total is summed from the ledger, twice over');
  assert.deepEqual(
    result.ledger.map((row) => row.consumed),
    [5, 10],
    'and each row is summed from its own takes'
  );
  assert.equal(result.ledger[1].takes[0].documentUuid, null, 'no document to name is null');
  for (const row of result.ledger) {
    assert.ok(Object.isFrozen(row), 'every ledger row is frozen');
    assert.deepEqual(Object.keys(row), [...LEDGER_ROW_KEYS]);
    assert.ok(Object.isFrozen(row.takes), 'the NESTED take list is frozen too');
    for (const take of row.takes) {
      assert.ok(Object.isFrozen(take), 'and so is every take line');
      assert.deepEqual(Object.keys(take), [...TAKE_KEYS]);
    }
  }
  assert.ok(Object.isFrozen(result.ledger));
  assert.ok(Object.isFrozen(result));
});

test('attempted is derived from the row outcome, so the flag cannot contradict it', () => {
  const result = pooledHoldingsConsumeResult('insufficient', null, {
    actorUuids: ['Actor.a'],
    ledger: [
      // The row that was short. A hostile `attempted: true` beside it is the mutation: it would
      // tell a caller a write was issued for a call that wrote nothing.
      { type: 'component', componentId: 'c1', requested: 5, attempted: true, outcome: 'insufficient' },
      { type: 'currency', unitId: 'gp', requested: 2, attempted: true, outcome: 'notAttempted' },
    ],
  });
  assert.deepEqual(
    result.ledger.map((row) => row.attempted),
    [false, false],
    'a pool short of a cost is refused BEFORE anything is written, so nothing was attempted'
  );
  assert.equal(result.consumed, 0, 'a ledger that exists but took nothing is a provable zero');
  assert.equal(result.success, false);
  for (const outcome of ['consumed', 'consumeFailed']) {
    const attempted = pooledHoldingsConsumeResult('consumed', null, {
      ledger: [{ type: 'component', outcome, takes: [] }],
    });
    assert.equal(
      attempted.ledger[0].attempted,
      true,
      `${outcome} is a row a write WAS issued for, whatever it returned`
    );
  }
});

test('neither factory lets a caller bag override a derived field', () => {
  // `buildResult` writes `success` BEFORE it spreads its extra fields, so the sharpest cell is
  // the boolean rather than any derived scalar — the shipped reasoning at `checkRollResult`,
  // applied to the one member that TAKES value away.
  const hostileRead = pooledHoldingsReadResult('readFailed', null, {
    success: true,
    actorUuids: ['Actor.a'],
    readings: [{ type: 'component', requested: 1, available: 9, sufficient: true, outcome: 'read' }],
  });
  assert.equal(hostileRead.success, false, 'a refusal is a refusal whatever the record claims');
  assert.equal(hostileRead.readings[0].sufficient, true, 'the READING is still derived, not copied');

  const hostileConsume = pooledHoldingsConsumeResult('consumeFailed', { detail: 'x' }, {
    success: true,
    consumed: 500,
    ledger: [{ type: 'component', outcome: 'consumeFailed', takes: [] }],
  });
  assert.equal(hostileConsume.success, false);
  assert.equal(hostileConsume.consumed, 0, 'the total is the ledger’s, never the caller’s 500');
});

test('an outcome neither member declares degrades to that member’s OWN generic refusal', () => {
  const read = pooledHoldingsReadResult('someOutcomeFromALaterVersion');
  assert.equal(read.success, false);
  assert.equal(read.message, POOLED_HOLDINGS_READ_MESSAGE_KEYS.readFailed);
  const consume = pooledHoldingsConsumeResult('someOutcomeFromALaterVersion');
  assert.equal(consume.success, false);
  assert.equal(consume.message, POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.consumeFailed);
  // And a READING degrades within its own table too, rather than borrowing the consume's.
  const reading = pooledHoldingsReadResult('read', null, {
    readings: [{ type: 'component', outcome: 'someOutcomeFromALaterVersion' }],
  }).readings[0];
  assert.equal(reading.message, POOLED_HOLDINGS_READ_MESSAGE_KEYS.readFailed);
  const row = pooledHoldingsConsumeResult('consumed', null, {
    ledger: [{ type: 'component', outcome: 'someOutcomeFromALaterVersion', takes: [] }],
  }).ledger[0];
  assert.equal(row.message, POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.consumeFailed);
  // A failed consume must never report itself in a failed read's words, which is the whole
  // reason the two carry SEPARATE tables rather than a shared `Holdings.*` one.
  const readStrings = new Set(Object.values(POOLED_HOLDINGS_READ_MESSAGE_KEYS));
  const shared = Object.values(POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS).filter((key) =>
    readStrings.has(key)
  );
  assert.deepEqual(shared, [], 'the pooled read and the pooled consume share no message string');
});

test('the entry-only lists are DATA, and the call-level set is computed by subtraction', () => {
  const lists = [
    ['readPooledHoldings', POOLED_HOLDINGS_READ_ENTRY_OUTCOMES, POOLED_HOLDINGS_READ_MESSAGE_KEYS],
    [
      'consumePooledHoldings',
      POOLED_HOLDINGS_CONSUME_ENTRY_OUTCOMES,
      POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
    ],
  ];
  for (const [name, entryOnly, keys] of lists) {
    assert.ok(Object.isFrozen(entryOnly), `${name}'s entry-only list is frozen data`);
    assert.ok(entryOnly.length > 0, `${name} declares entry-only outcomes`);
    for (const outcome of entryOnly) {
      assert.ok(COMPANION_OUTCOMES[outcome], `${outcome} is declared in the vocabulary`);
      assert.ok(keys[outcome], `${outcome} is a key in ${name}'s own table`);
    }
    const callLevel = Object.keys(keys).filter((outcome) => !entryOnly.includes(outcome));
    assert.ok(callLevel.length > 0, `${name} has a call-level set left after subtraction`);
    for (const outcome of entryOnly) {
      assert.equal(callLevel.includes(outcome), false, `${outcome} is not a call-level answer`);
    }
  }
  // `balanceNotConfigured` sits in the READING list rather than the call one, and that placement
  // IS its behaviour: a world with no `balance` macro must still answer every component and
  // tool cost in the same request. Promoting it to call level would block them all.
  assert.ok(
    POOLED_HOLDINGS_READ_ENTRY_OUTCOMES.includes(COMPANION_OUTCOMES.balanceNotConfigured),
    'a missing balance macro blocks NOTHING: it is one reading’s answer, not the call’s'
  );
  // `notAttempted` is the mirror claim on the consume: a call could never answer it, because
  // "nothing was attempted" is the consequence of a reason rather than a reason.
  assert.ok(
    POOLED_HOLDINGS_CONSUME_ENTRY_OUTCOMES.includes(COMPANION_OUTCOMES.notAttempted),
    'notAttempted is what the OTHER rows report when one row refused the call'
  );
});

test('the two deleted tokens are not in the vocabulary, in either spelling', () => {
  // Asserted rather than remembered. `costNotFound` would be a third spelling of the shipped
  // `componentNotFound` and `unitNotFound`, and `partiallyConsumed` would name a state an
  // all-or-nothing take cannot reach — which the dead-vocabulary sweep would then demand a key
  // for. Both were deleted in review, and this is what stops one coming back.
  for (const token of ['costNotFound', 'partiallyConsumed']) {
    assert.equal(COMPANION_OUTCOMES[token], undefined, `${token} is deliberately not declared`);
    assert.equal(POOLED_HOLDINGS_READ_MESSAGE_KEYS[token], undefined, `${token} has no read key`);
    assert.equal(
      POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[token],
      undefined,
      `${token} has no consume key`
    );
  }
  // The tokens they would have displaced ARE there, so this is not a vacuous absence check.
  for (const token of ['componentNotFound', 'unitNotFound', 'toolNotFound']) {
    assert.ok(COMPANION_OUTCOMES[token], `${token} is the spelling that stayed`);
  }
});

test('each bounded refusal interpolates its OWN bound rather than restating the number', () => {
  const bounded = [
    ['read', POOLED_HOLDINGS_READ_MESSAGE_KEYS.invalidCosts, POOLED_COSTS_MAX],
    ['read', POOLED_HOLDINGS_READ_MESSAGE_KEYS.invalidActorUuids, POOLED_ACTORS_MAX],
    ['consume', POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.invalidCosts, POOLED_COSTS_MAX],
    ['consume', POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.invalidActorUuids, POOLED_ACTORS_MAX],
  ];
  for (const [label, key, bound] of bounded) {
    const string = localizedString(key);
    assert.match(string, /\{max\}/, `${label}'s ${key} interpolates the bound as a max placeholder`);
    assert.doesNotMatch(
      string,
      new RegExp(String.raw`\b${bound}\b`),
      `${label}'s ${key} must not RESTATE the bound, or the two can drift apart`
    );
  }
  assert.equal(Number.isInteger(POOLED_ACTORS_MAX), true);
  assert.equal(Number.isInteger(POOLED_COSTS_MAX), true);
  assert.ok(POOLED_ACTORS_MAX > 0 && POOLED_COSTS_MAX > 0, 'a bound a caller can read');
});

test('every reading-level and row-level string interpolates NOTHING', () => {
  // Load-bearing rather than incidental: an entry carries no `messageData` at all, so a
  // placeholder on one of these keys puts literal braces in front of a GM with nothing able to
  // supply them. The two `{max}` strings above are CALL-level, which is why they are exempt.
  const entryLevel = [
    ...POOLED_HOLDINGS_READ_ENTRY_OUTCOMES.map((outcome) => [
      'read',
      POOLED_HOLDINGS_READ_MESSAGE_KEYS[outcome],
    ]),
    ...POOLED_HOLDINGS_CONSUME_ENTRY_OUTCOMES.map((outcome) => [
      'consume',
      POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[outcome],
    ]),
    // The four answered at BOTH levels are held to the entry-level rule, because an entry is
    // where they are read without a bag.
    ['read', POOLED_HOLDINGS_READ_MESSAGE_KEYS.read],
    ['read', POOLED_HOLDINGS_READ_MESSAGE_KEYS.readFailed],
    ['consume', POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.consumed],
    ['consume', POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.consumeFailed],
    ['consume', POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS.insufficient],
  ];
  for (const [label, key] of entryLevel) {
    assertLocalizationKey(key, `${label}'s ${key}`);
    assert.doesNotMatch(localizedString(key), /\{/, `${key} is read without a bag, so it has none`);
  }
  // And the refusals the FACADE answers with, on the shipped check-roll reasoning: they are
  // emitted before anything has been resolved.
  for (const outcome of ['gmOnly', 'noActor', 'notReady']) {
    assert.doesNotMatch(localizedString(POOLED_HOLDINGS_READ_MESSAGE_KEYS[outcome]), /\{/);
    assert.doesNotMatch(localizedString(POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[outcome]), /\{/);
  }
  for (const outcome of ['invalidCallSite', 'notElected', 'creditNotConfigured']) {
    assert.doesNotMatch(
      localizedString(POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[outcome]),
      /\{/,
      `the consume's ${outcome} is answered UP FRONT, before any free text exists`
    );
  }
});

test('the cost axes are published as symbols, and the unserved ones are not among them', () => {
  assert.ok(Object.isFrozen(POOLED_COST_TYPES));
  assert.deepEqual(Object.keys(POOLED_COST_TYPES), ['component', 'currency', 'tool']);
  for (const [name, token] of Object.entries(POOLED_COST_TYPES)) {
    assert.equal(token, name, 'each axis maps to its own token so callers never guess');
  }
  assert.ok(Object.isFrozen(POOLED_UNSERVED_COST_TYPES));
  for (const axis of POOLED_UNSERVED_COST_TYPES) {
    assert.equal(
      POOLED_COST_TYPES[axis],
      undefined,
      `${axis} must not be published as a symbol: every call that names it is refused`
    );
  }
  // The pair is what makes the two refusals decidable — "not yet" against "you mistyped".
  assert.ok(POOLED_UNSERVED_COST_TYPES.includes('essence'));
  assert.ok(POOLED_UNSERVED_COST_TYPES.includes('tag'));
  assert.ok(Object.isFrozen(POOLED_TOOL_STATES));
  assert.deepEqual(Object.keys(POOLED_TOOL_STATES), ['present', 'damaged', 'missing']);
});
