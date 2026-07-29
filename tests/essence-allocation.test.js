/**
 * Issue 917 — `essenceAllocation.js`: the shared essence allocator.
 *
 * Three properties here are load-bearing rather than decorative, and each guards a specific
 * silent failure:
 *
 * - **The oracle.** Greedy must fund the block whenever the whole ledger could, or a player is
 *   told a craftable recipe is impossible. It is checked against an independently written
 *   one-pass sum (`sumWholeLedger` below), NOT against a second run of the allocator.
 * - **Input-order invariance.** Foundry collections reorder between reads, so an allocation
 *   that depended on the `carriers` array order would make the requirement rail flap between
 *   renders. The four-key tie-break is a total order precisely to prevent that.
 * - **Irredundancy.** Greedy is not minimal, but no single allocated unit may be individually
 *   removable — that is the property that justifies shipping no shrink pass. If it ever fails,
 *   the printed seed is the evidence a shrink pass would be revisited with.
 *
 * The random cases run through a tiny LCG over a FIXED seed list, and every assertion prints
 * its seed and scenario. The repo has no seeded generator; `Math.random()` in new code is an
 * S2245 MEDIUM vulnerability that fails the SonarCloud gate, and `crypto.getRandomValues` is
 * unreproducible — so a failing case here would be unfixable without the seed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  allocationShortfall,
  clampAllocation,
  deliveredEssences,
  greedyAllocate,
} from '../src/utils/essenceAllocation.js';

// ---------------------------------------------------------------------------
// Seeded generation
// ---------------------------------------------------------------------------

/** A numerical-recipes LCG. Returns `nextInt(bound)` over `[0, bound)`. */
function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % bound;
  };
}

const ESSENCE_IDS = Object.freeze(['ember', 'frost', 'radiant', 'shadow', 'wind']);

// A fixed, hand-written list so every run of this suite explores exactly the same cases.
// Widen it deliberately; never make it time- or environment-derived.
const SEEDS = Object.freeze([
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10_946,
  17_711, 28_657, 46_368, 75_025, 121_393, 196_418, 317_811, 514_229, 832_040, 1_346_269, 7, 11, 42,
  99, 256, 1024, 4096, 65_535, 123_456, 654_321, 999_983, 20_260_728, 31_415_926, 27_182_818,
  16_180_339, 14_142_135, 8_675_309, 5_551_212,
]);

/**
 * Build one random need + ledger. Ranges are deliberately tight so the seed list produces both
 * fundable and unfundable blocks (asserted below), and small enough that a failing scenario
 * prints as something a human can reason about.
 */
function generateScenario(seed) {
  const nextInt = createRandom(seed);
  const essenceIds = ESSENCE_IDS.slice(0, 1 + nextInt(ESSENCE_IDS.length));

  const requirements = [];
  for (const essenceId of essenceIds) {
    // Not every essence in play is required — a carrier may contribute nothing the block needs.
    if (nextInt(3) === 0) continue;
    requirements.push({ essenceId, need: 1 + nextInt(5) });
  }

  const carriers = [];
  const availableUnits = {};
  const carrierCount = nextInt(5);
  for (let index = 0; index < carrierCount; index += 1) {
    const itemKey = `item-${index}`;
    const perUnit = {};
    for (const essenceId of essenceIds) {
      const amount = nextInt(4);
      if (amount > 0) perUnit[essenceId] = amount;
    }
    const ownedUnits = 1 + nextInt(3);
    carriers.push({ itemKey, perUnit, ownedUnits });
    availableUnits[itemKey] = ownedUnits;
  }

  return { requirements, carriers, availableUnits };
}

/** Deterministic Fisher-Yates over its own LCG, so a permutation is reproducible from the seed. */
function shuffle(items, seed) {
  const nextInt = createRandom(seed);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = nextInt(index + 1);
    const held = shuffled[index];
    shuffled[index] = shuffled[swap];
    shuffled[swap] = held;
  }
  return shuffled;
}

/**
 * The oracle's right-hand side, written independently of the module under test: one pass over
 * the ledger summing every OWNED unit's contribution. Deliberately not `deliveredEssences`.
 */
function sumWholeLedger(carriers) {
  const totals = {};
  for (const carrier of carriers) {
    for (const [essenceId, perUnit] of Object.entries(carrier.perUnit)) {
      totals[essenceId] = (totals[essenceId] ?? 0) + perUnit * carrier.ownedUnits;
    }
  }
  return totals;
}

function covers(delivered, requirements) {
  return requirements.every(({ essenceId, need }) => (delivered[essenceId] ?? 0) >= need);
}

/** Every assertion message carries the seed AND the scenario, so a failure is reproducible. */
function describeCase(seed, scenario, note = '') {
  return `seed ${seed}${note === '' ? '' : ` (${note})`} — ${JSON.stringify(scenario)}`;
}

// One dual-essence carrier and one single-essence carrier, shared by the hand-written cases.
const CARRIERS = Object.freeze([
  { itemKey: 'duskcrystal', perUnit: { radiant: 2, shadow: 1 }, ownedUnits: 4 },
  { itemKey: 'emberbloom', perUnit: { ember: 3 }, ownedUnits: 2 },
]);

// ---------------------------------------------------------------------------
// deliveredEssences
// ---------------------------------------------------------------------------

describe('deliveredEssences', () => {
  const carriers = CARRIERS;

  it('scales each allocated carrier by its allocated units', () => {
    assert.deepEqual(deliveredEssences({ duskcrystal: 3 }, carriers), { radiant: 6, shadow: 3 });
  });

  it('sums a multi-essence carrier alongside a single-essence one', () => {
    assert.deepEqual(deliveredEssences({ duskcrystal: 2, emberbloom: 1 }, carriers), {
      radiant: 4,
      shadow: 2,
      ember: 3,
    });
  });

  it('contributes nothing for an unallocated, zero-allocated or unknown carrier', () => {
    assert.deepEqual(deliveredEssences({}, carriers), {});
    assert.deepEqual(deliveredEssences({ duskcrystal: 0 }, carriers), {});
    assert.deepEqual(deliveredEssences({ nothing_owned: 5 }, carriers), {});
  });

  it('survives an absent allocation or ledger rather than throwing', () => {
    assert.deepEqual(deliveredEssences(null, carriers), {});
    assert.deepEqual(deliveredEssences({ duskcrystal: 1 }, null), {});
  });
});

// ---------------------------------------------------------------------------
// allocationShortfall
// ---------------------------------------------------------------------------

describe('allocationShortfall', () => {
  const carriers = CARRIERS;

  it('returns an empty list when every requirement is delivered', () => {
    const requirements = [
      { essenceId: 'radiant', need: 4 },
      { essenceId: 'shadow', need: 2 },
    ];
    assert.deepEqual(allocationShortfall({ duskcrystal: 2 }, carriers, requirements), []);
  });

  it('reports need and have for each unmet essence, in requirement order', () => {
    const requirements = [
      { essenceId: 'ember', need: 4 },
      { essenceId: 'radiant', need: 5 },
      { essenceId: 'shadow', need: 1 },
    ];
    assert.deepEqual(
      allocationShortfall({ duskcrystal: 1, emberbloom: 1 }, carriers, requirements),
      [
        { essenceId: 'ember', need: 4, have: 3 },
        { essenceId: 'radiant', need: 5, have: 2 },
      ]
    );
  });

  it('sums two requirements naming the same essence into one shared need', () => {
    // Both requirements draw on ONE pool, so `[Radiant 2, Radiant 2]` needs 4, not 2.
    const requirements = [
      { essenceId: 'radiant', need: 2 },
      { essenceId: 'radiant', need: 2 },
    ];
    assert.deepEqual(allocationShortfall({ duskcrystal: 1 }, carriers, requirements), [
      { essenceId: 'radiant', need: 4, have: 2 },
    ]);
    assert.deepEqual(allocationShortfall({ duskcrystal: 2 }, carriers, requirements), []);
  });

  it('accepts a bare `{ essenceId: need }` map as well as the requirement array', () => {
    assert.deepEqual(allocationShortfall({ duskcrystal: 1 }, carriers, { radiant: 3 }), [
      { essenceId: 'radiant', need: 3, have: 2 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// clampAllocation
// ---------------------------------------------------------------------------

describe('clampAllocation', () => {
  it('clamps an over-allocation down to the units available', () => {
    assert.deepEqual(clampAllocation({ duskcrystal: 9 }, { duskcrystal: 3 }), { duskcrystal: 3 });
  });

  it('drops an entry that clamps to zero', () => {
    assert.deepEqual(clampAllocation({ duskcrystal: 0, emberbloom: 2 }, { emberbloom: 5 }), {
      emberbloom: 2,
    });
  });

  it('drops an item key the available-units map does not know', () => {
    // A stale allocation naming a spent or deleted stack — and a forged one naming another
    // actor's item — must be a no-op, never a lookup.
    assert.deepEqual(clampAllocation({ ghost: 4, emberbloom: 1 }, { emberbloom: 5 }), {
      emberbloom: 1,
    });
  });

  it('drops negative, fractional-to-zero and unusable requests', () => {
    const clamped = clampAllocation(
      { a: -3, b: 0.5, c: NaN, d: Infinity, e: 2.7 },
      { a: 5, b: 5, c: 5, d: 5, e: 5 }
    );
    assert.deepEqual(clamped, { e: 2 });
  });

  it('returns an empty allocation for an absent input', () => {
    assert.deepEqual(clampAllocation(null, { a: 5 }), {});
    assert.deepEqual(clampAllocation({ a: 5 }, null), {});
  });
});

// ---------------------------------------------------------------------------
// greedyAllocate — the pinned orderings
// ---------------------------------------------------------------------------

describe('greedyAllocate tie-breaks', () => {
  it('allocates a 3-Radiant carrier against a need of 1 (overshoot never filters)', () => {
    // Pinned by hand: a random seed list is very unlikely to isolate this, and treating
    // overshoot as a filter would report a perfectly craftable recipe as impossible.
    const carriers = [{ itemKey: 'duskcrystal', perUnit: { radiant: 3 }, ownedUnits: 1 }];
    const requirements = [{ essenceId: 'radiant', need: 1 }];

    const allocation = greedyAllocate(requirements, carriers, { duskcrystal: 1 });

    assert.deepEqual(allocation, { duskcrystal: 1 });
    assert.deepEqual(allocationShortfall(allocation, carriers, requirements), []);
  });

  it('prefers the lower-overshoot carrier when scores tie', () => {
    const carriers = [
      { itemKey: 'duskcrystal', perUnit: { radiant: 3 }, ownedUnits: 1 },
      { itemKey: 'sunmote', perUnit: { radiant: 1 }, ownedUnits: 1 },
    ];
    const allocation = greedyAllocate([{ essenceId: 'radiant', need: 1 }], carriers);
    assert.deepEqual(allocation, { sunmote: 1 });
  });

  it('prefers the deeper stack when score and overshoot tie', () => {
    const carriers = [
      { itemKey: 'zephyr-dust', perUnit: { radiant: 1 }, ownedUnits: 2 },
      { itemKey: 'ashen-salt', perUnit: { radiant: 1 }, ownedUnits: 5 },
    ];
    const allocation = greedyAllocate([{ essenceId: 'radiant', need: 2 }], carriers);
    assert.deepEqual(allocation, { 'ashen-salt': 2 });
  });

  it('falls back to the lexicographic item key when all three earlier keys tie', () => {
    const carriers = [
      { itemKey: 'zephyr-dust', perUnit: { radiant: 1 }, ownedUnits: 3 },
      { itemKey: 'ashen-salt', perUnit: { radiant: 1 }, ownedUnits: 3 },
    ];
    const allocation = greedyAllocate([{ essenceId: 'radiant', need: 1 }], carriers);
    assert.deepEqual(allocation, { 'ashen-salt': 1 });
  });

  it('treats a supplied available-units map as authoritative over `ownedUnits`', () => {
    const carriers = [{ itemKey: 'duskcrystal', perUnit: { radiant: 1 }, ownedUnits: 9 }];
    // Units already claimed by the component/tag plan are gone: only 2 remain.
    assert.deepEqual(greedyAllocate([{ essenceId: 'radiant', need: 5 }], carriers, {}), {});
    assert.deepEqual(
      greedyAllocate([{ essenceId: 'radiant', need: 5 }], carriers, { duskcrystal: 2 }),
      {
        duskcrystal: 2,
      }
    );
  });

  it('stops rather than looping when no carrier can contribute', () => {
    const carriers = [{ itemKey: 'emberbloom', perUnit: { ember: 3 }, ownedUnits: 4 }];
    const requirements = [{ essenceId: 'radiant', need: 2 }];

    const allocation = greedyAllocate(requirements, carriers);

    assert.deepEqual(allocation, {});
    assert.deepEqual(allocationShortfall(allocation, carriers, requirements), [
      { essenceId: 'radiant', need: 2, have: 0 },
    ]);
  });

  it('returns an empty allocation for an empty need or an empty ledger', () => {
    assert.deepEqual(
      greedyAllocate([], [{ itemKey: 'a', perUnit: { ember: 1 }, ownedUnits: 2 }]),
      {}
    );
    assert.deepEqual(greedyAllocate([{ essenceId: 'ember', need: 2 }], []), {});
  });
});

// ---------------------------------------------------------------------------
// greedyAllocate — the seeded properties
// ---------------------------------------------------------------------------

describe('greedyAllocate properties over the fixed seed list', () => {
  it('funds the block if and only if the whole ledger could (the oracle)', () => {
    let fundable = 0;
    let unfundable = 0;

    for (const seed of SEEDS) {
      const scenario = generateScenario(seed);
      const { requirements, carriers, availableUnits } = scenario;

      const allocation = greedyAllocate(requirements, carriers, availableUnits);
      const greedySucceeds = allocationShortfall(allocation, carriers, requirements).length === 0;
      // Independent one-pass reference: every owned unit, summed by hand.
      const ledgerCovers = covers(sumWholeLedger(carriers), requirements);

      assert.equal(greedySucceeds, ledgerCovers, describeCase(seed, scenario, 'oracle'));
      // The module's own whole-ledger sum must agree with the hand-written one, which is what
      // lets a caller use `deliveredEssences(availableUnits, carriers)` as the same reference.
      assert.deepEqual(
        deliveredEssences(availableUnits, carriers),
        sumWholeLedger(carriers),
        describeCase(seed, scenario, 'whole-ledger sum')
      );

      if (ledgerCovers) fundable += 1;
      else unfundable += 1;
    }

    // The generator must exercise BOTH sides of the iff, or the property is vacuous.
    assert.ok(fundable > 0, `no fundable scenario in the seed list (${fundable}/${SEEDS.length})`);
    assert.ok(unfundable > 0, `no unfundable scenario in the seed list (${SEEDS.length})`);
  });

  it('returns an identical allocation under any permutation of the carriers array', () => {
    for (const seed of SEEDS) {
      const scenario = generateScenario(seed);
      const { requirements, carriers, availableUnits } = scenario;
      const expected = JSON.stringify(greedyAllocate(requirements, carriers, availableUnits));

      const permutations = [
        carriers.toReversed(),
        shuffle(carriers, seed + 1),
        shuffle(carriers, seed + 2),
        shuffle(carriers, seed * 3 + 7),
      ];

      for (const [index, permuted] of permutations.entries()) {
        assert.equal(
          JSON.stringify(greedyAllocate(requirements, permuted, availableUnits)),
          expected,
          describeCase(seed, scenario, `permutation ${index}`)
        );
      }
    }
  });

  it('allocates no individually redundant unit when the block is funded', () => {
    let checked = 0;

    for (const seed of SEEDS) {
      const scenario = generateScenario(seed);
      const { requirements, carriers, availableUnits } = scenario;

      const allocation = greedyAllocate(requirements, carriers, availableUnits);
      if (allocationShortfall(allocation, carriers, requirements).length > 0) continue;

      for (const [itemKey, units] of Object.entries(allocation)) {
        const reduced = { ...allocation, [itemKey]: units - 1 };
        assert.ok(
          allocationShortfall(reduced, carriers, requirements).length > 0,
          describeCase(seed, scenario, `removing one unit of ${itemKey} left the block funded`)
        );
        checked += 1;
      }
    }

    assert.ok(checked > 0, 'no funded allocation in the seed list exercised the shrink property');
  });
});
