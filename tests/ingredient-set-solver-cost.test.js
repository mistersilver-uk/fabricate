/**
 * The ingredient solver's PER-NODE cost, measured rather than assumed (issue 1083).
 *
 * `INGREDIENT_SEARCH_NODE_CAP` bounds how many nodes the backtracking search may visit. It has
 * never bounded the WORK those nodes imply, because the ledger was copied and restored in full
 * at every node: per-node cost was O(|availableItems|), so a 1,000-stack party inventory at the
 * cap is on the order of 2x10^8 Map operations on the main thread. "Adversarial fixtures remain
 * bounded by the existing safety cap" was therefore not a falsifiable claim about elapsed time.
 *
 * This file makes it falsifiable. There were TWO inventory-sized per-node terms and they were
 * removed by two different mechanisms, so they need two different counters:
 *
 *  1. **the ledger term** — the whole `remaining` map copied and restored per node, removed by
 *     the undo journal. Counted as LEDGER OPERATIONS (`get`/`set`/`clear`/iteration of the
 *     shared map) across two inventories differing ONLY in non-matching filler stacks.
 *  2. **the matcher term** — every option re-matched against the whole of `availableItems` once
 *     per option per node, removed by the per-pass index. Counted as MATCHER INVOCATIONS, split
 *     by whether the index existed yet.
 *
 * The second is the one a ledger counter is structurally blind to: `_optionCandidates` returns
 * the same MATCHING stacks indexed or not, so the ledger reads that follow it are identical
 * either way. Deleting the index lookup outright (`index?.optionItems.get(option) ??` never
 * consulted) leaves the ledger counts, every correctness suite and the resolve's wall clock
 * within budget, while taking matcher invocations from 10,000 to 54,671,000 on the adversarial
 * fixture at 1,000 stacks. The essence half (`index.essence`, feeding `_essenceCarriers`) is
 * counted the same way through the `resolveItemEssences` probe.
 *
 * ## The shape of the matcher assertion
 *
 * NOT raw equality across inventory sizes: the index build itself is one deliberate pass over
 * `availableItems` per non-currency option, so total invocations are `options x stacks` by
 * design and grow linearly on purpose. The invariant that matters is the per-NODE one, so the
 * counter is split at the moment the pass index has been built and the assertion is that the
 * count after that point is exactly ZERO — the search must never re-match anything. That also
 * pins the "derived per resolve pass, never retained" clause from the front of the counter: the
 * index is asserted to be built exactly once per resolve.
 *
 * ## Where the counters ride, and why they are not vacuous
 *
 * They ride on the INPUTS to the code under measurement, exactly as the benchmark harness's
 * counters do (`tests/helpers/scale/scaleCounters.js`), so nothing here edits `src/`:
 * `_initialRemaining` is the one factory that mints the ledger, and the matcher and essence
 * probe are arguments the caller already supplies. A `Map` SUBCLASS rather than a Proxy or a
 * plain object, because the solver consumes `remaining` as a Map through four distinct surfaces
 * (`get`, `set`, `clear`, and iteration via `new Map(remaining)`) and a subclass keeps every
 * one of them faithful.
 *
 * The failure this repository keeps re-learning is a counter that CANNOT go up — see
 * `countingFacade` in `tests/helpers/scale/scaleProbes.js`, which throws at wrap time on a
 * missing method for exactly this reason. Four defences here:
 *
 *  1. {@link installCountingLedger}'s `assertUsed` fails unless the patched factory is the one
 *     the resolve pass actually called, so a moved seam is loud rather than silently green;
 *  2. the seeded ledger's size is asserted against the fixture's own stack count, so a fixture
 *     that silently failed to generate cannot report a flat, green zero;
 *  3. a POSITIVE control asserts the same counter DOES move when the search tree grows, so
 *     "equal across inventory sizes" cannot be satisfied by a counter that is stuck;
 *  4. the matcher/essence counters assert a POSITIVE pre-index count derived from the fixture's
 *     own declared scale, so a probe that was never wired in cannot satisfy the zero.
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

/**
 * Split every subsequent probe invocation by whether the per-pass index already exists.
 *
 * `_buildPassIndex` is the one place the index is minted, so wrapping it gives an exact
 * boundary between "the deliberate once-per-pass scan" and "per-node work". `builds` is the
 * non-vacuity guard for the boundary itself: if the seam moved, `armed` would never flip and
 * every `afterIndex === 0` assertion below would be vacuously true.
 *
 * @param {IngredientSet} set
 * @returns {{armed: boolean, builds: number}}
 */
function armAfterPassIndex(set) {
  const phase = { armed: false, builds: 0 };
  const original = set._buildPassIndex.bind(set);
  set._buildPassIndex = (...args) => {
    phase.builds += 1;
    const index = original(...args);
    phase.armed = true;
    return index;
  };
  return phase;
}

/**
 * Wrap a caller-supplied probe (the ingredient matcher, or the essence resolver) so its
 * invocations are counted on either side of the {@link armAfterPassIndex} boundary.
 *
 * @param {Function} probe
 * @param {{armed: boolean}} phase
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
const essenceOption = (essenceId, amount) => ({
  quantity: 1,
  match: { type: 'essence', essenceId, amount },
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

/**
 * The same contended core with a live essence BLOCK bolted on, so the indexed ESSENCE carrier
 * path is measured too. Without a fixture of this shape half the indexed per-node work — the
 * `resolveEssences` probe plus a ledger read per held document, re-run at every terminal node —
 * is simply not exercised, and disabling it would leave every counter here flat.
 *
 * Stack `a` is the block's only carrier at 1 fire per unit, so the block competes with BOTH
 * other groups for it: the tag group needs 3 units, the component group needs 1 of `a`, and the
 * block needs 2 more of `a`. Only the assignment that sends the tag group entirely to `b`
 * satisfies all three, so this genuinely backtracks rather than resolving on a fast path.
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

/** The options `_buildPassIndex` runs the matcher over: every non-currency, non-essence one. */
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
  const ledger = installCountingLedger(set, counters, 'ledgerOps');
  const phase = armAfterPassIndex(set);
  const matcher = countingProbe(CONTENDED_MATCHER, phase);
  const essenceProbe = essences ? countingProbe(essences, phase) : null;
  const items = inventoryWithFiller(fillerStacks);

  const selection = set.resolveIngredientSelection(items, matcher.probe, {
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
  const twoContentions = resolveAndCount(18, {
    groups: [...contendedGroups(), { id: 'g-comp-b', options: [componentOption('cmp-b')] }],
  });

  assert.ok(
    twoContentions.ledgerOps > oneContention.ledgerOps,
    `a bigger search must cost more ledger operations: ${oneContention.ledgerOps} -> ` +
      `${twoContentions.ledgerOps}`
  );
});

// ---------------------------------------------------------------------------
// The SECOND per-node term: matcher invocations. Invisible to every counter above,
// because an indexed and an unindexed `_optionCandidates` return the same matching
// stacks and therefore provoke the same ledger reads.
// ---------------------------------------------------------------------------

test('the pass index is built ONCE per resolve, never per node', () => {
  // The lifetime clause, asserted rather than asserted-about: `openspec/specs/recipes-and-steps`
  // requires the index to be derived per resolve pass. An index rebuilt per node would satisfy
  // "no matcher call after the index exists" trivially and reinstate the whole term.
  const small = resolveAndCount(18);
  const large = resolveAndCount(1998);

  assert.equal(small.passIndexBuilds, 1, 'one index per resolve at 20 stacks');
  assert.equal(large.passIndexBuilds, 1, 'and still one at 2,000 — it is not per node');
  assert.ok(small.selection.searchStats.nodes > 0, 'the fixture must actually search');
});

test('no matcher invocation happens after the pass index exists', () => {
  // The guard for `_optionCandidates`. Its `index?.optionItems.get(option) ??` fallback is a
  // SILENT degradation: on an index miss it re-filters the whole of `availableItems` through the
  // matcher, per option, per node — and returns exactly the same stacks, so no correctness test,
  // no ledger count and no wall-clock budget can see it. Measured with the lookup deleted, this
  // fixture goes from a four-figure count to an eight-figure one while every other assertion in
  // this repository stays green.
  //
  // Zero rather than an inventory-independence relation, because the deliberate index build IS
  // one pass over the inventory per option and so is linear on purpose. Per NODE the answer is
  // exactly none.
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
    // index runs the matcher over every held stack once per matchable option. A probe that was
    // never wired in, or a boundary that never armed, reports zero here too.
    assert.equal(
      run.matcher.beforeIndex,
      run.matchedOptions * run.stacks,
      `the pass index must scan the inventory exactly once per matchable option ` +
        `(${run.matchedOptions} x ${run.stacks})`
    );
  }
});

test('no essence probe runs after the pass index exists, at either inventory size', () => {
  // The essence half of the same fallback (`_essenceCarriers`' `if (index?.essence)`). Disabling
  // it reinstates a `resolveEssences` call per held document at EVERY terminal node — the
  // carrier walk the index exists to pay for once.
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
  // The ledger counter DOES see the essence regression — `_essenceCarriers` reads `remaining`
  // once per held document per terminal on the unindexed path — but only against a fixture that
  // has an essence block at all. Measured with the indexed carrier path disabled: 60 ledger
  // operations at 20 stacks and 2,020 at 1,000, against 24 either way here.
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
 * The stated wall-clock budget for the adversarial fixture below, on the reference machine
 * (Windows 11, Node 22.22.2, this checkout). Issue 1083's acceptance criteria ask for a budget
 * rather than "bounded by the node cap", because the cap never bounded time.
 *
 * It is RECORDED here and reported by the test as a diagnostic; it is deliberately NOT asserted.
 * Two reasons, and the second is the decisive one:
 *
 *  1. `tests/helpers/scale/scaleProbes.js` and `tests/scale-regression-guards.test.js` state the
 *     convention this repository settled on — a wall-clock assertion is not a regression guard,
 *     it is a flaky test, because CI timing varies far more than the effects worth catching.
 *  2. Its catching set is a strict SUBSET of the counters'. Everything that misses this ceiling
 *     also fails a ledger-operation count (reinstating the per-node snapshot/restore fails four
 *     assertions here, of which this was only one), and the one regression the ledger counters
 *     structurally cannot express — bypassing the pass index, above — costs 208 ms against a
 *     1,000 ms ceiling and would sail through it with 5x to spare. A clock that misses the only
 *     defect it was uniquely placed to catch is decoration.
 *
 * Measured on this checkout for the cap-hitting fixture:
 *
 * | held stacks | before (snapshot/restore) | after (undo journal) |
 * |-------------|---------------------------|----------------------|
 * | 20          | 98 ms                     | 47 ms                |
 * | 500         | 814 ms                    | 42 ms                |
 * | 1,000       | 1,694 ms                  | 35 ms                |
 *
 * The shape is the point, not the ratio: the before column is linear in held stacks and the
 * after column is flat. What makes that falsifiable on every machine is the ledger-operation
 * count in the next test, not this table.
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

test('an adversarial cap-hitting search is measured against its stated wall-clock budget', (t) => {
  // The fixture's own integrity IS asserted — it must be genuinely unsatisfiable and must
  // genuinely reach the node bound, or the two counting tests either side of it are measuring
  // something other than the adversarial case. Only the elapsed time is recorded rather than
  // asserted; see ADVERSARIAL_BUDGET_MS above for why.
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
