/**
 * The ingredient solver's PER-NODE cost, measured rather than assumed (issue 1083).
 *
 * `INGREDIENT_SEARCH_NODE_CAP` bounds how many nodes the backtracking search may visit. It has
 * never bounded the WORK those nodes imply, because the ledger was copied and restored in full
 * at every node: per-node cost was O(|availableItems|), so a 1,000-stack party inventory at the
 * cap is on the order of 2x10^8 Map operations on the main thread. "Adversarial fixtures remain
 * bounded by the existing safety cap" was therefore not a falsifiable claim about elapsed time.
 *
 * This file makes it falsifiable. It counts LEDGER OPERATIONS — every `get` / `set` / `clear` /
 * iteration of the shared `remaining` map — across two inventories that differ ONLY in how many
 * non-matching filler stacks they carry. A fixed search tree over a fixed set of matching stacks
 * must cost the same number of ledger operations whether the actor holds 20 stacks or 2,000.
 *
 * ## Where the counter rides, and why it is not vacuous
 *
 * The counter rides on the INPUT to the code under measurement, exactly as the benchmark
 * harness's counters do (`tests/helpers/scale/scaleCounters.js`): `_initialRemaining` is the one
 * factory that mints the ledger, so a per-instance patch swaps in a counting Map without
 * touching `src/`. A `Map` SUBCLASS rather than a Proxy or a plain object, because the solver
 * consumes `remaining` as a Map through four distinct surfaces (`get`, `set`, `clear`, and
 * iteration via `new Map(remaining)`) and a subclass keeps every one of them faithful.
 *
 * The failure this repository keeps re-learning is a counter that CANNOT go up — see
 * `countingFacade` in `tests/helpers/scale/scaleProbes.js`, which throws at wrap time on a
 * missing method for exactly this reason. Three defences here:
 *
 *  1. {@link installCountingLedger}'s `assertUsed` fails unless the patched factory is the one
 *     the resolve pass actually called, so a moved seam is loud rather than silently green;
 *  2. the seeded ledger's size is asserted against the fixture's own stack count, so a fixture
 *     that silently failed to generate cannot report a flat, green zero;
 *  3. a POSITIVE control asserts the same counter DOES move when the search tree grows, so
 *     "equal across inventory sizes" cannot be satisfied by a counter that is stuck.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createOperationCounters } from './helpers/scale/scaleCounters.js';

globalThis.foundry = { utils: { randomID: () => crypto.randomUUID() } };

const { IngredientSet, INGREDIENT_SEARCH_NODE_CAP } = await import(
  '../src/models/IngredientSet.js'
);

/**
 * A `remaining` ledger that counts the operations performed on it.
 *
 * Counting is ARMED after seeding. Seeding is inherently O(|availableItems|) — the ledger has
 * one entry per held stack by definition — and it happens once per resolve pass, so folding it
 * into the measurement would guarantee growth and measure the wrong thing. What this file
 * asserts is the PER-NODE term, which is the one the node cap never bounded.
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

/**
 * Swap `set`'s ledger factory for a counting one, and prove the swap took.
 *
 * @param {IngredientSet} set
 * @param {object} counters
 * @param {string} key
 * @returns {{assertUsed: (expectedStacks: number) => void}}
 */
function installCountingLedger(set, counters, key) {
  const original = set._initialRemaining.bind(set);
  const ledgers = [];
  set._initialRemaining = (availableItems) => {
    const ledger = new CountingLedger(counters, key);
    for (const [ledgerKey, value] of original(availableItems)) {
      // Through the prototype, so seeding is not counted.
      Map.prototype.set.call(ledger, ledgerKey, value);
    }
    ledger.arm();
    ledgers.push(ledger);
    return ledger;
  };
  return {
    assertUsed(expectedStacks) {
      assert.ok(
        ledgers.length > 0,
        'the counting ledger was never minted, so this counter could never go up — the ' +
          '`_initialRemaining` seam has moved and the probe needs fixing, not the assertion'
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

function item(uuid, quantity = 1) {
  return { uuid, system: { quantity } };
}

/**
 * The fixture's identity oracle. A tag option matches the two real stacks; a component option
 * matches the single stack its `componentId` names (`cmp-a` -> stack `a`), so the two option
 * kinds genuinely overlap on stack `a` rather than merely looking as though they do.
 */
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

/**
 * The contended core, identical in every fixture below: a `quantity: 3` tag group and a
 * `quantity: 1` component group competing for stack `a`. The front-loaded greedy pick takes all
 * three units from `a` and strands the component group, so the search genuinely backtracks and
 * enumerates unit plans — it is not a fixture that succeeds on its first guess.
 */
function contendedGroups() {
  return [
    { id: 'g-tag', options: [tagOption(3)] },
    { id: 'g-comp-a', options: [componentOption('cmp-a')] },
  ];
}

/** The two matching stacks, plus `fillerStacks` held stacks that match nothing at all. */
function inventoryWithFiller(fillerStacks) {
  const items = [item('a', 3), item('b', 3)];
  for (let index = 0; index < fillerStacks; index += 1) items.push(item(`filler-${index}`, 3));
  return items;
}

/**
 * Resolve the contended set against an inventory of `2 + fillerStacks` stacks and report the
 * ledger operations it cost.
 */
function resolveAndCount(fillerStacks, groups = contendedGroups()) {
  const counters = createOperationCounters();
  const set = new IngredientSet({ id: 's', ingredientGroups: groups });
  const probe = installCountingLedger(set, counters, 'ledgerOps');
  const items = inventoryWithFiller(fillerStacks);

  const selection = set.resolveIngredientSelection(items, CONTENDED_MATCHER);

  probe.assertUsed(items.length);
  assert.equal(selection.success, true, 'the contended fixture must be satisfiable');
  return { ledgerOps: counters.get('ledgerOps'), selection, stacks: items.length };
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
  // The equality above only means something if both runs did the same amount of SEARCHING. A
  // fixture whose tree collapsed at the larger size would report equal ledger operations for
  // the wrong reason.
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
  const twoContentions = resolveAndCount(18, [
    ...contendedGroups(),
    { id: 'g-comp-b', options: [componentOption('cmp-b')] },
  ]);

  assert.ok(
    twoContentions.ledgerOps > oneContention.ledgerOps,
    `a bigger search must cost more ledger operations: ${oneContention.ledgerOps} -> ` +
      `${twoContentions.ledgerOps}`
  );
});

/**
 * The stated wall-clock budget for the adversarial fixture below, on the reference machine
 * (Windows 11, Node 22.22.2, this checkout).
 *
 * The issue asks for a budget rather than "bounded by the node cap", because the cap never
 * bounded time. It is set at roughly 25x the measured figure on purpose. A wall-clock assertion
 * is a flaky test if it is tight — see `tests/helpers/scale/scaleProbes.js` on why this
 * repository asserts counts and not milliseconds — so the REGRESSION guard here is the
 * machine-invariant ledger-operation count below, and this ceiling exists only to catch the
 * specific failure the counts cannot express: a resolve that no longer completes in human time.
 *
 * Measured on this checkout for the cap-hitting fixture at 1,000 held stacks:
 *
 * | held stacks | before (snapshot/restore) | after (undo journal) |
 * |-------------|---------------------------|----------------------|
 * | 20          | 98 ms                     | 47 ms                |
 * | 500         | 814 ms                    | 42 ms                |
 * | 1,000       | 1,694 ms                  | 35 ms                |
 *
 * The shape is the point, not the ratio: the before column is linear in held stacks and the
 * after column is flat. A 1,000 ms budget is met by the after column with 28x of headroom and
 * missed by the before column at the same fixture.
 */
const ADVERSARIAL_BUDGET_MS = 1000;

/**
 * The adversarial fixture: ten groups all drawing `quantity: 2` from the SAME six-stack pool
 * that holds twelve units in total, so twenty units are demanded from twelve.
 *
 * Unsatisfiable, and expensively so. Every group has twenty-one distinct unit plans over the
 * pool, they all contend, and no prefix can be pruned by a shortfall the solver can see early —
 * so the search explores until it reaches its node bound. That is the ONLY fixture shape that
 * exercises the per-node ledger term at full scale: an enumeration blow-up inside a single
 * group (`_enumerateUnitPlansFrom`) bumps the same budget but never copied the ledger, so it
 * would have shown no difference at all.
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

test('an adversarial cap-hitting search completes inside its stated wall-clock budget', () => {
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
  assert.ok(
    elapsed < ADVERSARIAL_BUDGET_MS,
    `a full ${INGREDIENT_SEARCH_NODE_CAP}-node search over ${items.length} held stacks took ` +
      `${elapsed.toFixed(0)} ms, over the stated ${ADVERSARIAL_BUDGET_MS} ms budget`
  );
});

test('the adversarial search costs the same ledger operations at 20 and 1,000 stacks', () => {
  // The machine-invariant half of the criterion above, and the one that is a real regression
  // guard. The node bound is reached at the identical node count either way, so the two runs
  // perform the identical search; only the inventory around it differs.
  const measure = (fillerStacks) => {
    const counters = createOperationCounters();
    const set = adversarialSet();
    const probe = installCountingLedger(set, counters, 'ledgerOps');
    const items = adversarialInventory(fillerStacks);
    const selection = set.resolveIngredientSelection(items, ADVERSARIAL_MATCHER);
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
  // The mechanism, asserted directly rather than only through its cost. `Map#clear` was the
  // signature of the old restore, and one surviving call site would reintroduce the O(inventory)
  // term this issue removed without necessarily failing the totals on a small fixture.
  const set = new IngredientSet({ id: 's', ingredientGroups: contendedGroups() });
  const original = set._initialRemaining.bind(set);
  let clears = 0;
  let iterations = 0;
  set._initialRemaining = (availableItems) => {
    const seeded = original(availableItems);
    const ledger = new (class extends Map {
      clear() {
        clears += 1;
        return super.clear();
      }
      [Symbol.iterator]() {
        iterations += 1;
        return super[Symbol.iterator]();
      }
    })(seeded);
    return ledger;
  };

  const selection = set.resolveIngredientSelection(inventoryWithFiller(18), CONTENDED_MATCHER);

  assert.equal(selection.success, true);
  assert.ok(selection.searchStats.nodes > 0, 'the fixture must search');
  assert.equal(clears, 0, 'the search must not clear the ledger');
  assert.equal(iterations, 0, 'the search must not copy the ledger by iterating it');
});
