/**
 * The ingredient solver's PER-NODE cost, measured rather than assumed (issue 1083).
 * `INGREDIENT_SEARCH_NODE_CAP` bounds how many nodes the backtracking search may visit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createOperationCounters } from './helpers/scale/scaleCounters.js';

globalThis.foundry = { utils: { randomID: () => crypto.randomUUID() } };

const { IngredientSet, INGREDIENT_SEARCH_NODE_CAP } = await import(
  '../src/models/IngredientSet.js'
);
const { buildPassIndexDefault, createIngredientSolver } = await import(
  '../src/models/ingredientAssignment.js'
);
const { seedRemaining: seedRemainingDefault } = await import('../src/models/ingredientLedger.js');

/**
 * A `remaining` ledger that counts the operations performed on it. Counting is ARMED after seeding.
 */
class CountingLedger extends Map {
  constructor(counters, key) {
    super();
    this.counters = counters;
    this.key = key;
    this.armed = false;
  }

  arm() {
    this.armed = true;
  }

  bump(amount) {
    if (this.armed) this.counters.bump(this.key, amount);
  }

  get(mapKey) {
    this.bump(1);
    return super.get(mapKey);
  }

  set(mapKey, value) {
    this.bump(1);
    return super.set(mapKey, value);
  }

  clear() {
    // A wholesale reset costs one operation plus the entries it drops, which is precisely the
    // cost `_restoreRemaining` used to pay on EVERY backtrack.
    this.bump(1 + this.size);
    return super.clear();
  }

  [Symbol.iterator]() {
    // `new Map(remaining)` — the per-node snapshot this issue removed — reads the whole ledger
    // through this method, so iteration has to cost what it actually costs or the counter would
    // report a copy as free.
    this.bump(this.size);
    return super[Symbol.iterator]();
  }
}

/** A counting `seedRemaining` seam for the solver, with the guard that proves it was bound. */
function countingLedgerSeam(counters, key) {
  const ledgers = [];
  const seedRemaining = (availableItems) => {
    const ledger = new CountingLedger(counters, key);
    for (const [ledgerKey, value] of seedRemainingDefault(availableItems)) {
      // Through the prototype, so seeding is not counted.
      Map.prototype.set.call(ledger, ledgerKey, value);
    }
    ledger.arm();
    ledgers.push(ledger);
    return ledger;
  };
  return {
    seedRemaining,
    assertUsed(expectedStacks) {
      assert.ok(
        ledgers.length > 0,
        'the counting ledger was never minted, so this counter could never go up — the ' +
          '`seedRemaining` seam has moved and the probe needs fixing, not the assertion'
      );
      assert.equal(
        ledgers[0].size,
        expectedStacks,
        'the seeded ledger must hold one entry per held stack; a fixture that failed to ' +
          'generate would report a flat zero instead'
      );
    },
  };
}

/**
 * Split every subsequent probe invocation by whether the per-pass index already exists: the index is
 * minted in one place, so this seam is an exact boundary between the once-per-pass scan and a node.
 */
function passIndexPhase() {
  const phase = { armed: false, builds: 0 };
  phase.buildPassIndex = (...args) => {
    phase.builds += 1;
    const index = buildPassIndexDefault(...args);
    phase.armed = true;
    return index;
  };
  return phase;
}

function instrumentedSolver(set, ledger, phase) {
  return createIngredientSolver({
    ingredientGroups: set.ingredientGroups,
    ingredientSetId: set.id,
    seedRemaining: ledger.seedRemaining,
    buildPassIndex: phase.buildPassIndex,
  });
}

/**
 * Wrap a caller-supplied probe (the ingredient matcher, or the essence resolver) so its invocations
 * are counted on either side of the {@link armAfterPassIndex} boundary.
 *
 * @returns {{probe: Function, tally: {beforeIndex: number, afterIndex: number}}}
 */
function countingProbe(probe, phase) {
  const tally = { beforeIndex: 0, afterIndex: 0 };
  return {
    tally,
    probe: (...args) => {
      if (phase.armed) tally.afterIndex += 1;
      else tally.beforeIndex += 1;
      return probe(...args);
    },
  };
}

function item(uuid, quantity = 1) {
  return { uuid, system: { quantity } };
}

/** The fixture's identity oracle. */
const CONTENDED_MATCHER = (option, held) => {
  const match = option?.match;
  if (match?.type === 'tags') return held.uuid === 'a' || held.uuid === 'b';
  if (match?.type === 'component') return `cmp-${held.uuid}` === match.componentId;
  return false;
};

const tagOption = (quantity) => ({
  quantity,
  match: { type: 'tags', tags: ['t'], tagMatch: 'any' },
});
const componentOption = (componentId) => ({
  quantity: 1,
  match: { type: 'component', componentId },
});
const essenceOption = (essenceId, amount) => ({
  quantity: 1,
  match: { type: 'essence', essenceId, amount },
});

/**
 * The contended core, identical in every fixture below: a `quantity: 3` tag group and a `quantity:
 * 1` component group competing for stack `a`.
 */
function contendedGroups() {
  return [
    { id: 'g-tag', options: [tagOption(3)] },
    { id: 'g-comp-a', options: [componentOption('cmp-a')] },
  ];
}

/**
 * The same contended core with a live essence BLOCK bolted on, so the indexed ESSENCE carrier path
 * is measured too.
 */
function contendedGroupsWithEssence() {
  return [...contendedGroups(), { id: 'g-ess', options: [essenceOption('fire', 2)] }];
}

const ESSENCE_TABLE = { a: { fire: 1 } };
const ESSENCE_FIXTURE = {
  groups: contendedGroupsWithEssence(),
  essences: (held) => ESSENCE_TABLE[held.uuid] ?? {},
};

/** The two matching stacks, plus `fillerStacks` held stacks that match nothing at all. */
function inventoryWithFiller(fillerStacks) {
  const items = [item('a', 3), item('b', 3)];
  for (let index = 0; index < fillerStacks; index += 1) items.push(item(`filler-${index}`, 3));
  return items;
}

/** The options the pass index runs the matcher over: every non-currency, non-essence one. */
function matchedOptionCount(groups) {
  return groups.reduce(
    (total, group) =>
      total +
      group.options.filter((option) => !['currency', 'essence'].includes(option.match.type)).length,
    0
  );
}

/**
 * Resolve the contended set against an inventory of `2 + fillerStacks` stacks and report every
 * cost it paid: ledger operations, matcher invocations and essence-probe invocations, the last
 * two split at the moment the per-pass index came into existence.
 */
function resolveAndCount(fillerStacks, { groups = contendedGroups(), essences = null } = {}) {
  const counters = createOperationCounters();
  const set = new IngredientSet({ id: 's', ingredientGroups: groups });
  const ledger = countingLedgerSeam(counters, 'ledgerOps');
  const phase = passIndexPhase();
  const matcher = countingProbe(CONTENDED_MATCHER, phase);
  const essenceProbe = essences ? countingProbe(essences, phase) : null;
  const items = inventoryWithFiller(fillerStacks);

  const selection = instrumentedSolver(set, ledger, phase).resolve(items, matcher.probe, {
    resolveItemEssences: essenceProbe?.probe,
  });

  ledger.assertUsed(items.length);
  assert.equal(selection.success, true, 'the contended fixture must be satisfiable');
  return {
    ledgerOps: counters.get('ledgerOps'),
    selection,
    stacks: items.length,
    passIndexBuilds: phase.builds,
    matcher: matcher.tally,
    essences: essenceProbe?.tally ?? null,
    matchedOptions: matchedOptionCount(groups),
  };
}

test('per-node ledger cost is independent of held-stack count', () => {
  // 20 stacks is the token inventory every corpus-axis benchmark profile carries; 2,000 is an
  // order of magnitude past the 1,000-stack point at which the inventory axis was measured.
  const small = resolveAndCount(18);
  const large = resolveAndCount(1998);

  assert.equal(small.stacks, 20);
  assert.equal(large.stacks, 2000);
  assert.ok(small.ledgerOps > 0, 'the fixture must actually touch the ledger');
  assert.equal(
    large.ledgerOps,
    small.ledgerOps,
    `a fixed search tree must cost the same ledger operations at any inventory size: ` +
      `${small.ledgerOps} at ${small.stacks} stacks -> ${large.ledgerOps} at ${large.stacks}. ` +
      'A per-node snapshot/restore of the whole ledger makes this ratio track the stack count.'
  );
});

test('the same search tree is explored at both inventory sizes', () => {
  // The equality above only means something if both runs did the same amount of SEARCHING.
  const small = resolveAndCount(18);
  const large = resolveAndCount(1998);

  assert.ok(
    small.selection.searchStats.nodes > 0,
    'the contended fixture must enter the search rather than resolve on a fast path'
  );
  assert.equal(large.selection.searchStats.nodes, small.selection.searchStats.nodes);
  assert.equal(small.selection.searchStats.capHit, false);
});

test('the ledger counter moves when the SEARCH grows, so it is not stuck', () => {
  // The positive control. `assert.equal(large, small)` is satisfiable by a counter that can
  // only ever report one number, so the same counter has to be shown moving under the axis it
  // is supposed to be sensitive to: the size of the search, not the size of the inventory.
  const oneContention = resolveAndCount(18);
  const twoContentions = resolveAndCount(18, {
    groups: [...contendedGroups(), { id: 'g-comp-b', options: [componentOption('cmp-b')] }],
  });

  assert.ok(
    twoContentions.ledgerOps > oneContention.ledgerOps,
    `a bigger search must cost more ledger operations: ${oneContention.ledgerOps} -> ` +
      `${twoContentions.ledgerOps}`
  );
});

// The SECOND per-node term: matcher invocations.

test('the pass index is built ONCE per resolve, never per node', () => {
  // The lifetime clause, asserted rather than asserted-about: `openspec/specs/recipes-and-steps`
  // requires the index to be derived per resolve pass.
  const small = resolveAndCount(18);
  const large = resolveAndCount(1998);

  assert.equal(small.passIndexBuilds, 1, 'one index per resolve at 20 stacks');
  assert.equal(large.passIndexBuilds, 1, 'and still one at 2,000 — it is not per node');
  assert.ok(small.selection.searchStats.nodes > 0, 'the fixture must actually search');
});

test('no matcher invocation happens after the pass index exists', () => {
  // The guard for `candidateStacksForOption`.
  const small = resolveAndCount(18);
  const large = resolveAndCount(1998);

  for (const run of [small, large]) {
    assert.equal(
      run.matcher.afterIndex,
      0,
      `the search re-matched options against the inventory ${run.matcher.afterIndex} times at ` +
        `${run.stacks} stacks. Every candidate pool is in the pass index; a miss falls back to ` +
        'an O(|availableItems|) matcher scan per option per node, which is the term issue 1083 ' +
        'removed and the one no ledger counter can express.'
    );
    // Non-vacuity, derived from the fixture's declared scale rather than a recorded number: the
    // index runs the matcher over every held stack once per matchable option.
    assert.equal(
      run.matcher.beforeIndex,
      run.matchedOptions * run.stacks,
      `the pass index must scan the inventory exactly once per matchable option ` +
        `(${run.matchedOptions} x ${run.stacks})`
    );
  }
});

test('no essence probe runs after the pass index exists, at either inventory size', () => {
  // The essence half of the same fallback: the block's carrier scan taking its indexed branch.
  const small = resolveAndCount(18, ESSENCE_FIXTURE);
  const large = resolveAndCount(1998, ESSENCE_FIXTURE);

  for (const run of [small, large]) {
    assert.equal(
      run.essences.afterIndex,
      0,
      `the block re-probed held items ${run.essences.afterIndex} times after the index was ` +
        `built, at ${run.stacks} stacks`
    );
    assert.equal(
      run.essences.beforeIndex,
      run.stacks,
      'the index probes each held stack exactly once per pass'
    );
  }
});

test('an essence-carrying contended set costs the same ledger operations at any inventory size', () => {
  // The ledger counter DOES see the essence regression — the block's carrier scan reads `remaining`
  // once per held document per terminal on the unindexed path — but only against a fixture that has
  // an essence block at all.
  const small = resolveAndCount(18, ESSENCE_FIXTURE);
  const large = resolveAndCount(1998, ESSENCE_FIXTURE);

  assert.ok(small.selection.searchStats.nodes > 0, 'the essence fixture must search');
  assert.equal(
    large.selection.searchStats.nodes,
    small.selection.searchStats.nodes,
    'both runs must explore the same tree'
  );
  assert.ok(small.ledgerOps > 0, 'the fixture must actually touch the ledger');
  assert.equal(
    large.ledgerOps,
    small.ledgerOps,
    `an essence block must cost the same ledger operations at any inventory size: ` +
      `${small.ledgerOps} at ${small.stacks} stacks -> ${large.ledgerOps} at ${large.stacks}`
  );
});

/**
 * The stated wall-clock budget for the adversarial fixture below, on the reference machine (Windows
 * 11, Node 22.22.2, this checkout) (issue 1083).
 */
const ADVERSARIAL_BUDGET_MS = 1000;

/**
 * The adversarial fixture: ten groups all drawing `quantity: 2` from the SAME six-stack pool that
 * holds twelve units in total, so twenty units are demanded from twelve. Unsatisfiable, and
 * expensively so.
 */
function adversarialSet() {
  return new IngredientSet({
    id: 'adversarial',
    ingredientGroups: Array.from({ length: 10 }, (_unused, index) => ({
      id: `g-${index}`,
      options: [tagOption(2)],
    })),
  });
}

const ADVERSARIAL_MATCHER = (option, held) =>
  option?.match?.type === 'tags' && held.uuid.startsWith('pool-');

function adversarialInventory(fillerStacks) {
  const items = Array.from({ length: 6 }, (_unused, index) => item(`pool-${index}`, 2));
  for (let index = 0; index < fillerStacks; index += 1) items.push(item(`filler-${index}`, 3));
  return items;
}

test('an adversarial cap-hitting search is measured against its stated wall-clock budget', (t) => {
  // The fixture's own integrity IS asserted — it must be genuinely unsatisfiable and must genuinely
  // reach the node bound, or the two counting tests either side of it are measuring something other
  // than the adversarial case.
  const items = adversarialInventory(994);
  assert.equal(items.length, 1000);

  const started = performance.now();
  const selection = adversarialSet().resolveIngredientSelection(items, ADVERSARIAL_MATCHER);
  const elapsed = performance.now() - started;

  assert.equal(selection.success, false, 'the fixture must be genuinely unsatisfiable');
  assert.equal(
    selection.searchStats.capHit,
    true,
    'the fixture must reach the node bound, or it is not measuring the adversarial case'
  );
  t.diagnostic(
    `a full ${INGREDIENT_SEARCH_NODE_CAP}-node search over ${items.length} held stacks took ` +
      `${elapsed.toFixed(0)} ms against the stated ${ADVERSARIAL_BUDGET_MS} ms reference budget ` +
      '(recorded, not asserted)'
  );
});

test('the adversarial search costs the same ledger operations at 20 and 1,000 stacks', () => {
  // The machine-invariant half of the criterion above, and the one that is a real regression guard.
  const measure = (fillerStacks) => {
    const counters = createOperationCounters();
    const set = adversarialSet();
    const probe = countingLedgerSeam(counters, 'ledgerOps');
    const items = adversarialInventory(fillerStacks);
    const selection = createIngredientSolver({
      ingredientGroups: set.ingredientGroups,
      ingredientSetId: set.id,
      seedRemaining: probe.seedRemaining,
    }).resolve(items, ADVERSARIAL_MATCHER);
    probe.assertUsed(items.length);
    return { ledgerOps: counters.get('ledgerOps'), stats: selection.searchStats };
  };

  const small = measure(14);
  const large = measure(994);

  assert.equal(small.stats.capHit, true);
  assert.equal(large.stats.nodes, small.stats.nodes, 'both runs must explore the same tree');
  assert.ok(small.ledgerOps > 0);
  assert.equal(
    large.ledgerOps,
    small.ledgerOps,
    `a cap-hitting search must cost the same ledger operations at any inventory size: ` +
      `${small.ledgerOps} at 20 stacks -> ${large.ledgerOps} at 1,000`
  );
});

test('the ledger is never cleared wholesale during a search', () => {
  // The mechanism, asserted directly rather than only through its cost.
  const set = new IngredientSet({ id: 's', ingredientGroups: contendedGroups() });
  const minted = [];
  let clears = 0;
  let iterations = 0;
  const seedRemaining = (availableItems) => {
    const ledger = new (class extends Map {
      clear() {
        clears += 1;
        return super.clear();
      }
      [Symbol.iterator]() {
        iterations += 1;
        return super[Symbol.iterator]();
      }
    })(seedRemainingDefault(availableItems));
    minted.push(ledger);
    return ledger;
  };

  const items = inventoryWithFiller(18);
  const selection = createIngredientSolver({
    ingredientGroups: set.ingredientGroups,
    ingredientSetId: set.id,
    seedRemaining,
  }).resolve(items, CONTENDED_MATCHER);

  assert.equal(selection.success, true);
  assert.ok(selection.searchStats.nodes > 0, 'the fixture must search');
  // Both counters read zero when nothing was instrumented, so the seam is proved live first.
  assert.ok(minted.length > 0, 'the instrumented ledger was never minted');
  assert.equal(minted[0].size, items.length, 'the seeded ledger holds one entry per held stack');
  assert.equal(clears, 0, 'the search must not clear the ledger');
  assert.equal(iterations, 0, 'the search must not copy the ledger by iterating it');
});
