/**
 * The harness that measures the harness (issue 1071).
 *
 * A benchmark harness IS measurement code, so the defect class it is prone to is a fixture that
 * silently generates the wrong thing and a counter that cannot go up. Both fail SILENTLY: the
 * run stays green, the numbers look plausible, and the whole performance programme calibrates
 * against nothing. Every assertion below is aimed at one of those two.
 *
 * The load-bearing ones, in the order they matter:
 *
 * 1. **The inventory axis is independent of corpus size.** #1070 is explicit that a profile
 *    scaling both together cannot attribute a regression to either. Proved by generating the
 *    SAME held-inventory spec against two different library sizes and against no corpus at all.
 * 2. **A majority of held items resolve to NO component.** The counter-intuitive requirement:
 *    an all-component inventory exercises the cheap durable tier and would let every criterion
 *    go green while the reported 7.5 s regression survives untouched.
 * 3. **The counters can actually go up, and by an amount derived from the declared scale.** A
 *    miss over an N-component library must examine at least N candidates; a durable-flag hit
 *    must examine strictly fewer. Asserting against a recorded observation instead would pass
 *    against a counter that had been silently disconnected. This covers the three counter kinds
 *    this file imports — `countingCandidates`, `countingActor`, `countCalls` — and NOT
 *    `scaleCounters.js`'s fourth, `countingEnumerations`, whose non-vacuity is proved at its
 *    use site by the bulk guards in `tests/runtime-definition-indexes.test.js`. Stated so the
 *    list above is not read as a claim of exhaustiveness over the module.
 * 4. **A different seed produces a different corpus.** Otherwise "deterministic" would be
 *    indistinguishable from "ignores its inputs".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertComparable, captureEnvelope } from '../scripts/lib/benchmarkEnvelope.js';
import { medianRatioWithBand, quantile, summarise } from '../scripts/lib/benchmarkStats.js';
import { BENCHMARK_CASES, casesForProfile } from './helpers/scale/benchmarkCases.js';
import { fixtureChecksum, stableStringify } from './helpers/scale/fixtureChecksum.js';
import { buildComponentLibrary } from './helpers/scale/scaleComponents.js';
import {
  countCalls,
  countingActor,
  countingCandidates,
  createOperationCounters,
} from './helpers/scale/scaleCounters.js';
import { INVENTORY_SERIES, buildHeldInventory } from './helpers/scale/scaleInventory.js';
import {
  DEFAULT_SEED,
  SCALE_PROFILES,
  SCALE_PROFILE_NAMES,
  buildScaleFixture,
} from './helpers/scale/scaleProfiles.js';
import { createSeededRandom, pickDistinct } from './helpers/scale/scaleRandom.js';

const SYSTEM_ID = 'benchsys';

function libraryOf(count, seed = 7) {
  return buildComponentLibrary({ count, random: createSeededRandom(seed), systemId: SYSTEM_ID });
}

function inventoryOf({ stacks, components, seed = 7, ...rest }) {
  return buildHeldInventory({
    stacks,
    components,
    systemId: SYSTEM_ID,
    random: createSeededRandom(seed),
    ...rest,
  });
}

describe('scale fixtures are reproducible from {profile, seed} alone', () => {
  for (const profile of SCALE_PROFILE_NAMES) {
    it(`${profile} regenerates identically`, () => {
      const first = buildScaleFixture({ profile, seed: DEFAULT_SEED });
      const second = buildScaleFixture({ profile, seed: DEFAULT_SEED });
      assert.equal(
        fixtureChecksum(first.recipes),
        fixtureChecksum(second.recipes),
        'the recipe corpus must be a pure function of {profile, seed}'
      );
      assert.equal(fixtureChecksum(first.components), fixtureChecksum(second.components));
      assert.equal(fixtureChecksum(first.inventory.actors), fixtureChecksum(second.inventory.actors));
    });

    it(`${profile} honours its declared scale`, () => {
      const fixture = buildScaleFixture({ profile, seed: DEFAULT_SEED });
      const { scale } = SCALE_PROFILES[profile];
      assert.equal(fixture.components.length, scale.components, 'component library size');
      if (scale.recipes !== undefined) {
        assert.equal(fixture.recipes.length, scale.recipes, 'recipe corpus size');
      }
      if (scale.tools) assert.equal(fixture.tools.length, scale.tools, 'tool library size');
      // A generator that returned an empty corpus would satisfy every "is it deterministic"
      // assertion above, so the declared scale is checked as a value, not as "non-empty".
      assert.ok(fixture.components.length > 0, 'a library of zero components measures nothing');
    });
  }

  it('a DIFFERENT seed produces a different corpus', () => {
    const base = buildScaleFixture({ profile: 'simple-corpus', seed: DEFAULT_SEED });
    const other = buildScaleFixture({ profile: 'simple-corpus', seed: DEFAULT_SEED + 1 });
    assert.notEqual(
      fixtureChecksum(base.recipes),
      fixtureChecksum(other.recipes),
      'a generator that ignores its seed is deterministic in exactly the useless sense'
    );
  });

  it('refuses an unknown profile by name rather than returning an empty fixture', () => {
    assert.throws(
      () => buildScaleFixture({ profile: 'no-such-profile' }),
      /Unknown scale profile "no-such-profile"/
    );
  });
});

describe('pickDistinct returns exactly the requested scale', () => {
  // The sampler is the one place a fixture generator can silently produce the WRONG SCALE, which
  // is the defect class the whole harness exists to catch. SonarCloud's S1994 flagged its old
  // fill loop for testing `chosen.size` while incrementing `index`; that loop terminated
  // correctly, but nothing here proved it did, and nothing bounded it if the clamp above it ever
  // moved. These assertions bind the contract instead of the implementation.
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];

  for (const count of [0, 1, 3, 6]) {
    it(`returns exactly ${count} distinct elements`, () => {
      const picked = pickDistinct(createSeededRandom(11), pool, count);
      assert.equal(picked.length, count);
      assert.equal(new Set(picked).size, count, 'every element must be distinct');
      for (const entry of picked) assert.ok(pool.includes(entry), 'and drawn from the pool');
    });
  }

  it('clamps a count larger than the pool instead of padding with undefined', () => {
    const picked = pickDistinct(createSeededRandom(11), pool, 99);
    assert.equal(picked.length, pool.length);
    assert.ok(
      picked.every((entry) => entry !== undefined),
      'an out-of-range index would surface as an undefined element, not as an error'
    );
  });

  it('returns elements in ascending POOL order, not draw order', () => {
    // Draw order would make the fixture checksum depend on the draw sequence, so two runs that
    // picked the same set differently would report generator drift that is not there.
    const picked = pickDistinct(createSeededRandom(3), pool, 4);
    const positions = picked.map((entry) => pool.indexOf(entry));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  });

  it('terminates and still returns the full count for a degenerate generator', () => {
    // A generator pinned at 0 is the pathological input the old rejection-sampling guard existed
    // for. Selection sampling has no guard and no fallback: it cannot spin, because it runs
    // exactly `count` iterations.
    const picked = pickDistinct(() => 0, pool, 4);
    assert.equal(picked.length, 4);
    assert.equal(new Set(picked).size, 4);
  });

  it('is reproducible from its seed', () => {
    assert.deepEqual(
      pickDistinct(createSeededRandom(42), pool, 3),
      pickDistinct(createSeededRandom(42), pool, 3)
    );
  });

  it('tolerates a non-array pool rather than throwing mid-generation', () => {
    assert.deepEqual(pickDistinct(createSeededRandom(1), null, 3), []);
  });
});

describe('the held-inventory axis varies independently of corpus size', () => {
  it('the same inventory spec against two library sizes yields the same stacks', () => {
    const small = inventoryOf({ stacks: 500, components: libraryOf(200) });
    const large = inventoryOf({ stacks: 500, components: libraryOf(5000) });
    const count = (inventory) =>
      inventory.actors.reduce((total, actor) => total + actor.items.length, 0);
    assert.equal(count(small), 500);
    assert.equal(count(large), 500);
    assert.deepEqual(small.mix, large.mix, 'the declared mix must not depend on library size');
  });

  it('growing the inventory does not grow the library', () => {
    const components = libraryOf(5000);
    for (const stacks of INVENTORY_SERIES) {
      const inventory = inventoryOf({ stacks, components });
      assert.equal(
        components.length,
        5000,
        'buildHeldInventory must not mutate or re-generate the library it resolves against'
      );
      assert.equal(
        inventory.actors.reduce((total, actor) => total + actor.items.length, 0),
        stacks
      );
    }
  });

  it('1,000 held stacks are generable against a 5,000-component library with NO corpus', () => {
    // The acceptance criterion states this as a disqualifier: "a generator that cannot produce
    // 1,000 held stacks against a 5,000-component library without also changing the corpus does
    // not satisfy this". `buildHeldInventory` takes no recipes at all, so it cannot.
    const inventory = inventoryOf({ stacks: 1000, components: libraryOf(5000) });
    assert.equal(
      inventory.actors.reduce((total, actor) => total + actor.items.length, 0),
      1000
    );
  });

  it('the series is reported at 100 / 500 / 1,000', () => {
    assert.deepEqual([...INVENTORY_SERIES], [100, 500, 1000]);
    const fixture = buildScaleFixture({ profile: 'held-inventory', seed: DEFAULT_SEED });
    assert.equal(fixture.inventorySeries.length, 3);
    assert.deepEqual(
      fixture.inventorySeries.map((entry) => entry.mix.stacks),
      [100, 500, 1000]
    );
    // Every series point resolves against the SAME library and the SAME corpus, which is the
    // only arrangement in which a difference between them is attributable to held-stack count.
    assert.equal(fixture.components.length, 5000);
    assert.equal(fixture.recipes.length, SCALE_PROFILES['held-inventory'].scale.recipes);
  });
});

describe('most held items resolve to NO component', () => {
  it('the default mix is majority-unmatched', () => {
    const inventory = inventoryOf({ stacks: 1000, components: libraryOf(5000) });
    const matched = inventory.mix.durable + inventory.mix.sourceRef;
    assert.ok(
      inventory.mix.unmatched > matched,
      `a benchmark inventory must be mostly unmatched items; got ${inventory.mix.unmatched} ` +
        `unmatched vs ${matched} matched. An all-component inventory exercises the CHEAP ` +
        'identity tier and hides the branch that costs a full library scan.'
    );
    assert.equal(inventory.mix.unmatched, 700);
    assert.equal(inventory.byKind.unmatched.length, 700);
    assert.equal(inventory.byKind.durable.length + inventory.byKind.sourceRef.length, 300);
  });

  it('every held-inventory profile point declares its mix', () => {
    const fixture = buildScaleFixture({ profile: 'held-inventory', seed: DEFAULT_SEED });
    for (const entry of fixture.inventorySeries) {
      assert.equal(entry.mix.unmatchedRatio, 0.7);
      assert.equal(
        entry.mix.unmatched + entry.mix.durable + entry.mix.sourceRef,
        entry.mix.stacks
      );
    }
  });

  it('an unmatched stack carries no Fabricate identity and a matched one does', () => {
    const components = libraryOf(50);
    const inventory = inventoryOf({ stacks: 100, components });
    const [unmatched] = inventory.byKind.unmatched;
    const [durable] = inventory.byKind.durable;
    assert.ok(!unmatched.getFlag('fabricate', 'fabricate.roles'), 'unmatched carries no roles map');
    assert.ok(!unmatched.getFlag('fabricate', 'fabricate.componentId'), 'nor a legacy scalar');
    assert.ok(unmatched.uuid, 'but it DOES carry a uuid — which is what makes the miss expensive');
    assert.ok(
      Boolean(durable.getFlag('fabricate', 'fabricate.roles')?.[SYSTEM_ID]?.componentId),
      'a durable stack carries a per-system roles claim'
    );
  });

  it('the crafting actor holds at least one component the matcher can find', () => {
    const inventory = inventoryOf({ stacks: 100, components: libraryOf(50) });
    assert.ok(
      inventory.craftingActorComponentIds.length > 0,
      'a case probing a component nobody holds reports zero matches forever, which is ' +
        'indistinguishable from an inventory that silently failed to generate'
    );
  });
});

describe('the operation counters can go up, and by the right amount', () => {
  it('countingCandidates counts one bump per element the predicate examined', () => {
    const counters = createOperationCounters();
    const array = countingCandidates([1, 2, 3, 4, 5], counters, 'examined');
    assert.ok(Array.isArray(array), 'resolvers guard on Array.isArray — the wrapper must pass');
    assert.equal(array.find((value) => value === 3), 3);
    assert.equal(counters.get('examined'), 3, 'find stops at the match');
    counters.reset();
    assert.equal(array.find((value) => value === 99), undefined);
    assert.equal(counters.get('examined'), 5, 'a miss examines everything');
  });

  it('a counter that never fires reads zero rather than reporting success', () => {
    const counters = createOperationCounters();
    assert.equal(counters.get('never-bumped'), 0);
    assert.deepEqual(counters.snapshot(), {});
  });

  it('countingActor counts BOTH re-reads and items scanned', () => {
    const counters = createOperationCounters();
    const actor = countingActor({ id: 'a', items: [1, 2, 3] }, counters, 'held');
    assert.equal(actor.id, 'a', 'own properties survive the wrap');
    void [...actor.items];
    void [...actor.items];
    assert.equal(counters.get('heldReads'), 2, 'the per-recipe re-flattening term');
    assert.equal(counters.get('heldScanned'), 6, 'the item-count term that grows with inventory');
  });

  it('countCalls wraps ONE instance and restores it', () => {
    const counters = createOperationCounters();
    class Validator {
      overlap(a, b) {
        return a === b;
      }
    }
    const validator = new Validator();
    const restore = countCalls(validator, 'overlap', counters, 'comparisons');
    assert.equal(validator.overlap(1, 1), true);
    assert.equal(counters.get('comparisons'), 1);
    restore();
    validator.overlap(1, 1);
    assert.equal(counters.get('comparisons'), 1, 'restoring must stop the counting');
    assert.equal(
      new Validator().overlap(1, 1),
      true,
      'the prototype must be untouched — a prototype patch would leak into every other case'
    );
  });
});

describe('the fixture checksum detects generator drift and nothing else', () => {
  it('is independent of key insertion order', () => {
    assert.equal(fixtureChecksum({ a: 1, b: 2 }), fixtureChecksum({ b: 2, a: 1 }));
  });

  it('distinguishes an absent field from a present one', () => {
    assert.notEqual(fixtureChecksum({ a: 1 }), fixtureChecksum({ a: 1, b: undefined }));
  });

  it('does not silently drop a function-valued field', () => {
    // A held stack carries a `getFlag` closure. Dropping functions would make a flagged and an
    // unflagged item checksum identically — exactly the distinction the profiles exist to make.
    assert.equal(stableStringify({ getFlag: () => null }), '{"getFlag":<function:getFlag>}');
  });

  it('is sensitive to array ORDER', () => {
    assert.notEqual(fixtureChecksum([1, 2]), fixtureChecksum([2, 1]));
  });

  // A checksum's only job is to notice difference, so a value that serialises to the same text as
  // a DIFFERENT value is the function silently failing. These are the collapses that existed.
  it('does not collapse two distinct symbols', () => {
    assert.notEqual(fixtureChecksum(Symbol('a')), fixtureChecksum(Symbol('b')));
  });

  it('does not collapse two distinct dates', () => {
    assert.notEqual(fixtureChecksum(new Date(0)), fixtureChecksum(new Date(1)));
    assert.notEqual(fixtureChecksum(new Date(0)), fixtureChecksum({}));
  });

  it('does not collapse distinct non-finite numbers', () => {
    assert.notEqual(fixtureChecksum(Number.NaN), fixtureChecksum(Number.POSITIVE_INFINITY));
    assert.notEqual(fixtureChecksum(Number.POSITIVE_INFINITY), fixtureChecksum('Infinity'));
  });

  it('distinguishes a durable held stack from an unmatched one', () => {
    // The concrete version of the concern: these two stacks are the whole point of the inventory
    // mix, they carry an identical `getFlag` closure, and if the checksum collapsed them a
    // 70/30 fixture and a 0/100 fixture could hash the same.
    const inventory = inventoryOf({ stacks: 100, components: libraryOf(50) });
    assert.notEqual(
      fixtureChecksum(inventory.byKind.durable[0]),
      fixtureChecksum(inventory.byKind.unmatched[0])
    );
  });

  it('distinguishes two FIXTURES differing only in a previously-collapsing field', () => {
    // The collapse that mattered is not at the scalar level, it is at the fixture level: two
    // otherwise-identical fixture objects that hash the same are two fixtures the drift guard can
    // no longer tell apart. Both fields below rendered identically before — a Date fell through
    // to the plain-object branch where `Object.keys` yields `[]` (so every date was `{}`), and a
    // symbol hit `JSON.stringify`, which returns the VALUE `undefined` rather than a string.
    const withDateA = { id: 'c-1', stamped: new Date(0) };
    const withDateB = { id: 'c-1', stamped: new Date(86_400_000) };
    assert.notEqual(fixtureChecksum(withDateA), fixtureChecksum(withDateB));

    const withSymbolA = { id: 'c-1', kind: Symbol('durable') };
    const withSymbolB = { id: 'c-1', kind: Symbol('unmatched') };
    assert.notEqual(fixtureChecksum(withSymbolA), fixtureChecksum(withSymbolB));

    // And neither renders as the token the old implementation produced.
    assert.ok(!stableStringify(withDateA).includes('"stamped":{}'), 'a date is no longer `{}`');
    assert.ok(
      !stableStringify(withSymbolA).includes('undefined'),
      'a symbol is no longer the literal `undefined`'
    );
  });

  it('orders keys by code unit, which is what makes the digest machine-independent', () => {
    // Pins the comparator, and pins it AGAINST `localeCompare` specifically. A locale-aware
    // compare orders "a" before "B" in en-GB but code-unit order puts "B" first, so swapping the
    // comparator for the obvious-looking one would make the same fixture hash differently on two
    // machines with different ICU data — the exact non-determinism this module exists to remove.
    assert.equal(stableStringify({ a: 1, B: 2 }), '{"B":2,"a":1}');
    assert.equal(stableStringify({ B: 2, a: 1 }), '{"B":2,"a":1}');
    assert.equal(fixtureChecksum({ a: 1, B: 2 }), fixtureChecksum({ B: 2, a: 1 }));
  });

  it('orders keys at every depth, not just the top level', () => {
    const left = { outer: { z: 1, a: { y: 2, b: 3 } } };
    const right = { outer: { a: { b: 3, y: 2 }, z: 1 } };
    assert.equal(stableStringify(left), stableStringify(right));
    assert.equal(stableStringify(left), '{"outer":{"a":{"b":3,"y":2},"z":1}}');
  });

  it('emits no [object Object] for any registered profile fixture', () => {
    // The direct answer to "is a value stringifying as [object Object]?". Asserted against every
    // profile rather than reasoned about, because the fixtures are what actually matter.
    for (const profile of SCALE_PROFILE_NAMES) {
      const fixture = buildScaleFixture({ profile, seed: DEFAULT_SEED });
      for (const part of [fixture.components, fixture.recipes, fixture.inventory.actors]) {
        assert.ok(
          !stableStringify(part).includes('[object Object]'),
          `${profile} serialises a value as [object Object], which collapses distinct fixtures`
        );
      }
    }
  });
});

describe('the compare tool refuses incomparable environments', () => {
  const base = {
    nodeVersion: '22.22.2',
    cpuModel: 'Bench CPU X1',
    arch: 'x64',
  };

  it('permits identical environments', () => {
    assert.deepEqual(assertComparable(base, { ...base }), { comparable: true, reasons: [] });
  });

  for (const field of ['nodeVersion', 'cpuModel', 'arch']) {
    it(`refuses a differing ${field} and names it`, () => {
      const { comparable, reasons } = assertComparable(base, { ...base, [field]: 'other' });
      assert.equal(comparable, false);
      assert.equal(reasons.length, 1);
      assert.match(reasons[0], new RegExp(`^${field}: `));
    });
  }

  it('refuses a missing field rather than treating absence as agreement', () => {
    const { comparable, reasons } = assertComparable(base, { ...base, cpuModel: undefined });
    assert.equal(comparable, false);
    assert.match(reasons[0], /<missing>/);
  });

  it('captures every envelope field the run record promises', () => {
    const envelope = captureEnvelope({
      repoRoot: process.cwd(),
      fixtureProfile: 'simple-corpus',
      fixtureSeed: 1071,
      harnessVersion: 1,
    });
    for (const field of [
      'commit',
      'branch',
      'dirty',
      'nodeVersion',
      'v8Version',
      'os',
      'arch',
      'cpuModel',
      'cpuCount',
      'totalMemMB',
      'containerized',
      'fixtureProfile',
      'fixtureSeed',
      'harnessVersion',
    ]) {
      assert.ok(field in envelope, `envelope is missing "${field}"`);
    }
  });
});

describe('class-2 statistics report ratios with a band', () => {
  it('reports a slower candidate as a ratio above 1', () => {
    const comparison = medianRatioWithBand([10, 10, 10, 10, 10], [20, 20, 20, 20, 20]);
    assert.equal(comparison.ratio, 2);
    assert.ok(comparison.separated, 'two non-overlapping sample sets have separated');
  });

  it('declines to separate overlapping samples', () => {
    const comparison = medianRatioWithBand([10, 12, 14, 16, 18], [11, 13, 15, 17, 19]);
    assert.ok(!comparison.separated, 'overlapping samples support no claim of a difference');
  });

  it('summarises quartiles without mutating the caller array', () => {
    const samples = [5, 1, 3];
    const stats = summarise(samples);
    assert.deepEqual(samples, [5, 1, 3]);
    assert.equal(stats.median, 3);
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  });

  it('refuses an empty sample set rather than reporting NaN', () => {
    // A NaN would flow into the run record and the human report as "NaN ms", which reads like a
    // measurement rather than like the absence of one.
    assert.throws(() => summarise([]), /at least one sample/);
    assert.throws(() => quantile([], 0.5), /at least one sample/);
  });
});

describe('the case registry is coherent', () => {
  it('every case id is unique', () => {
    const ids = BENCHMARK_CASES.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, 'a duplicate id silently overwrites a baseline');
  });

  it('every case names a registered profile, and every profile has cases', () => {
    for (const entry of BENCHMARK_CASES) {
      assert.ok(SCALE_PROFILES[entry.profile], `case "${entry.id}" names unknown profile`);
      assert.ok(typeof entry.run === 'function', `case "${entry.id}" has no run()`);
      assert.ok(typeof entry.setup === 'function', `case "${entry.id}" has no setup()`);
      assert.ok(entry.description, `case "${entry.id}" has no description`);
    }
    for (const profile of SCALE_PROFILE_NAMES) {
      assert.ok(casesForProfile(profile).length > 0, `profile "${profile}" has no cases`);
    }
  });

  it('the miss case and the hit case are BOTH present at every series point', () => {
    // The acceptance criterion names the miss case specifically, and the pair is what makes it
    // meaningful: a miss number with no hit number to compare it to says nothing.
    for (const stacks of INVENTORY_SERIES) {
      const ids = BENCHMARK_CASES.map((entry) => entry.id);
      assert.ok(ids.includes(`identity.resolveComponentForItem.miss@${stacks}`));
      assert.ok(ids.includes(`identity.resolveComponentForItem.hit@${stacks}`));
      assert.ok(ids.includes(`craftingEngine.findComponentItems@${stacks}`));
      assert.ok(ids.includes(`craftingEngine.findComponentItems.bulk@${stacks}`));
      assert.ok(ids.includes(`craftingListing.buildListing@${stacks}`));
      assert.ok(ids.includes(`inventoryListing.buildListing@${stacks}`));
    }
  });
});
