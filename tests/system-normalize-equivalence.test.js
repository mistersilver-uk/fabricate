/**
 * The equivalence pin for the five remaining system-normalizer clusters (issue 1713): a golden over
 * all 30 retained members and over the `_normalizeSystem` chokepoint, byte-frozen through their
 * extraction into `src/systems/normalize/`.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * A seeded id counter, reset exactly once per scenario before the first pass and never before the
 * idempotence re-feed: resetting before the re-feed would let an accidental re-mint reproduce the
 * first pass's id and go invisible, which is the behaviour the re-feed exists to catch.
 */
let mintedIds = 0;
let totalMinted = 0;
const resetMintedIds = () => {
  mintedIds = 0;
};
globalThis.foundry = {
  utils: {
    randomID: () => {
      totalMinted += 1;
      return `rid-${String(++mintedIds).padStart(4, '0')}`;
    },
  },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { memberScenarios, systemScenarios, clusterCounts, CORPUS_FLOORS } = await import(
  './helpers/systemNormalizeCorpus.js'
);

const GOLDEN_URL = new URL('./fixtures/systemNormalize.golden.json', import.meta.url);
const RECORD_ENV = 'UPDATE_SYSTEM_NORMALIZE_GOLDEN';
const REGENERATE = `${RECORD_ENV}=1 node --conditions=browser --test tests/system-normalize-equivalence.test.js`;

/** The count of retained members the five clusters leave on the manager as delegates. */
const RETAINED_MEMBER_COUNT = 30;

/**
 * JSON cannot carry `undefined`, and three normalizers emit one deliberately (`caps.item.maxUses`,
 * `caps.learn.learnsAllowed`, `component.difficulty`), so the golden encodes it explicitly. Any
 * OTHER shape JSON cannot carry — a `Set`, a `Map`, a `NaN` — survives neither leg and is caught by
 * the losslessness assertion below rather than silently dropped.
 */
const ENCODED_UNDEFINED = '__system-normalize-undefined__';

function encode(value) {
  if (value === undefined) return ENCODED_UNDEFINED;
  if (Array.isArray(value)) return value.map(encode);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, encode(inner)]));
}

function decode(value) {
  if (value === ENCODED_UNDEFINED) return undefined;
  if (Array.isArray(value)) return value.map(decode);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, decode(inner)]));
}

const roundTrip = (value) => decode(JSON.parse(JSON.stringify(encode(value))));

/** A manager with no injected stores, so every Valid Id Basis is UNKNOWN unless a row passes one. */
function freshManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

/** Run the whole corpus once, in a fixed order, so every minted id is reproducible. */
function runCorpus() {
  const manager = freshManager();
  const members = {};
  const systems = {};
  const systemRefeed = {};

  for (const scenario of memberScenarios()) {
    resetMintedIds();
    members[scenario.name] = manager[scenario.member](...scenario.args);
  }

  for (const scenario of systemScenarios()) {
    resetMintedIds();
    const pass = manager._normalizeSystem(scenario.system);
    systems[scenario.name] = pass;
    systemRefeed[scenario.name] = manager._normalizeSystem(pass);
  }

  return { members, systems, systemRefeed };
}

const actual = runCorpus();
const recorded = { members: encode(actual.members), systems: encode(actual.systems) };

if (process.env[RECORD_ENV] === '1') {
  assert.deepStrictEqual(
    roundTrip(actual),
    actual,
    'a normalized value does not survive a JSON round-trip, so the golden would record a shape ' +
      'the manager never emitted; fix the corpus or the normalizer before recording'
  );
  writeFileSync(GOLDEN_URL, `${JSON.stringify(recorded, null, 2)}\n`);
}

const golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8'));

test('the corpus covers every retained member and is not vacuous', () => {
  const scenarios = memberScenarios();
  const names = scenarios.map((scenario) => scenario.name);
  assert.deepStrictEqual(names, [...new Set(names)], 'two scenarios share a name');
  assert.equal(
    new Set(scenarios.map((scenario) => scenario.member)).size,
    RETAINED_MEMBER_COUNT,
    'the corpus no longer names exactly the 30 members the five clusters retain as delegates'
  );
  assert.deepStrictEqual(
    Object.keys(golden.members),
    names,
    `the golden was recorded from a different corpus; re-record with ${REGENERATE}`
  );
  assert.deepStrictEqual(
    Object.keys(golden.systems),
    systemScenarios().map((scenario) => scenario.name),
    `the golden was recorded from a different system list; re-record with ${REGENERATE}`
  );
  assert.ok(totalMinted > 0, 'no id was minted, so the determinism discipline proves nothing');
});

test('every cluster still carries the scenarios the floors name', () => {
  const counts = clusterCounts();
  for (const [cluster, floor] of Object.entries(CORPUS_FLOORS)) {
    if (cluster === 'systems') continue;
    assert.ok(counts[cluster] >= floor, `the ${cluster} matrix was gutted: ${counts[cluster]} < ${floor}`);
  }
  assert.ok(
    systemScenarios().length >= CORPUS_FLOORS.systems,
    'the wrapped-system list was gutted'
  );
});

for (const scenario of memberScenarios()) {
  test(`${scenario.member} emits the golden shape for ${scenario.name}`, () => {
    assert.deepStrictEqual(
      actual.members[scenario.name],
      decode(golden.members[scenario.name]),
      `${scenario.member} changed shape for ${scenario.name}`
    );
  });
}

for (const scenario of systemScenarios()) {
  test(`_normalizeSystem emits the golden shape for ${scenario.name}`, () => {
    assert.deepStrictEqual(
      actual.systems[scenario.name],
      decode(golden.systems[scenario.name]),
      `the chokepoint's wiring of the moved normalizers changed for ${scenario.name}`
    );
  });

  test(`re-feeding _normalizeSystem's output changes nothing for ${scenario.name}`, () => {
    assert.deepStrictEqual(
      actual.systemRefeed[scenario.name],
      actual.systems[scenario.name],
      `${scenario.name} no longer re-normalizes to itself; an id was re-minted or a read alias round-trips`
    );
  });
}
