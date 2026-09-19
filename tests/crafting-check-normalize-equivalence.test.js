/**
 * The EQUIVALENCE PIN for the crafting-check, trigger and crit normalizers (issue 1698). It lands
 * against the unchanged `CraftingSystemManager` and is byte-frozen through the extraction into
 * `src/systems/normalize/craftingCheck.js`, so the golden is evidence the move changed nothing.
 * It drives the three activity entry points AND `_normalizeSystem`, because the chokepoint's
 * wiring of the three delegates is part of what must not move.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * A SEEDED id counter, reset exactly once per scenario before the first pass and NEVER before the
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
const {
  craftingCheckScenarios,
  modifierSelectionScenarios,
  corpusSystem,
  knownModifierBasis,
  CORPUS_FLOORS,
} = await import('./helpers/craftingCheckNormalizeCorpus.js');

const GOLDEN_URL = new URL('./fixtures/craftingCheckNormalize.golden.json', import.meta.url);
const RECORD_ENV = 'UPDATE_CRAFTING_CHECK_NORMALIZE_GOLDEN';

/** The three activity entry points, in the order the id counter is consumed. */
const ENTRY_POINTS = Object.freeze({
  crafting: '_normalizeCraftingCheck',
  salvage: '_normalizeSalvageCraftingCheck',
  gathering: '_normalizeGatheringCraftingCheck',
});

/** The system key each activity's check is persisted under; nothing else in the output is pinned. */
const SYSTEM_CHECK_KEYS = Object.freeze({
  crafting: 'craftingCheck',
  salvage: 'salvageCraftingCheck',
  gathering: 'gatheringCraftingCheck',
});

/** A manager with no injected stores, so the Valid Id Basis comes from the payload alone. */
function freshManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

function callEntryPoint(manager, method, check, scenario) {
  return scenario.omitValidIds
    ? manager[method](check)
    : manager[method](check, scenario.validIds);
}

function callModifierSelection(manager, check, scenario) {
  return scenario.omitValidIds
    ? manager._normalizeCheckModifierSelection(check)
    : manager._normalizeCheckModifierSelection(check, scenario.validIds);
}

const pickCheckKeys = (system) =>
  Object.fromEntries(Object.values(SYSTEM_CHECK_KEYS).map((key) => [key, system[key]]));

/** Run the whole corpus once, in a fixed order, so every minted id is reproducible. */
function runCorpus() {
  const manager = freshManager();
  const first = { entryPoints: {}, normalizeSystem: {}, modifierSelection: {} };
  const refeed = { entryPoints: {}, normalizeSystem: {} };

  for (const scenario of craftingCheckScenarios()) {
    resetMintedIds();
    const pass = {};
    const again = {};
    for (const [activity, method] of Object.entries(ENTRY_POINTS)) {
      pass[activity] = callEntryPoint(manager, method, scenario.check, scenario);
    }
    for (const [activity, method] of Object.entries(ENTRY_POINTS)) {
      again[activity] = callEntryPoint(manager, method, pass[activity], scenario);
    }
    first.entryPoints[scenario.name] = pass;
    refeed.entryPoints[scenario.name] = again;
  }

  for (const scenario of craftingCheckScenarios()) {
    // The chokepoint derives its own Valid Id Basis from `system.modifiers`, so the comparison
    // run passes that same known basis rather than the scenario's.
    resetMintedIds();
    const viaDelegates = Object.fromEntries(
      Object.entries(ENTRY_POINTS).map(([activity, method]) => [
        SYSTEM_CHECK_KEYS[activity],
        manager[method](scenario.check, knownModifierBasis()),
      ])
    );
    resetMintedIds();
    const normalized = manager._normalizeSystem(corpusSystem(scenario.check));
    first.normalizeSystem[scenario.name] = { viaDelegates, viaSystem: pickCheckKeys(normalized) };
    refeed.normalizeSystem[scenario.name] = pickCheckKeys(manager._normalizeSystem(normalized));
  }

  for (const scenario of modifierSelectionScenarios()) {
    resetMintedIds();
    first.modifierSelection[scenario.name] = callModifierSelection(
      manager,
      scenario.check,
      scenario
    );
  }

  return { first, refeed };
}

const { first: actual, refeed } = runCorpus();

/**
 * The golden records the entry-point pass and the two direct modifier-selection calls. It does NOT
 * record the `_normalizeSystem` pass a second time: the chokepoint's three checks are proved equal
 * to the delegate outputs run with the same basis, which pins them to the same golden transitively
 * and without a second 90KB copy of it.
 */
const recorded = { entryPoints: actual.entryPoints, modifierSelection: actual.modifierSelection };

if (process.env[RECORD_ENV] === '1') {
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(recorded)),
    recorded,
    'a normalized value does not survive a JSON round-trip, so the golden would record a shape ' +
      'the manager never emitted; fix the corpus or the normalizer before recording'
  );
  writeFileSync(GOLDEN_URL, `${JSON.stringify(recorded, null, 2)}\n`);
}

const golden = JSON.parse(readFileSync(GOLDEN_URL, 'utf8'));

const REGENERATE = `${RECORD_ENV}=1 node --conditions=browser --test tests/crafting-check-normalize-equivalence.test.js`;

test('the corpus is not vacuous', () => {
  assert.ok(
    craftingCheckScenarios().length >= CORPUS_FLOORS.scenarios,
    'the scenario matrix was gutted'
  );
  assert.ok(
    modifierSelectionScenarios().length >= CORPUS_FLOORS.modifierSelectionCases,
    'the direct modifier-selection cases were gutted'
  );
  assert.deepStrictEqual(
    Object.keys(golden.entryPoints),
    craftingCheckScenarios().map((scenario) => scenario.name),
    `the golden was recorded from a different corpus; re-record with ${REGENERATE}`
  );
  assert.ok(totalMinted > 0, 'no id was minted, so the determinism discipline proves nothing');
});

for (const scenario of craftingCheckScenarios()) {
  test(`${scenario.name}: the three activity entry points emit the golden shape`, () => {
    assert.deepStrictEqual(
      actual.entryPoints[scenario.name],
      golden.entryPoints[scenario.name],
      `the activity normalizers changed shape for ${scenario.name}`
    );
  });

  test(`${scenario.name}: re-feeding each entry point's output changes nothing`, () => {
    assert.deepStrictEqual(
      refeed.entryPoints[scenario.name],
      actual.entryPoints[scenario.name],
      `${scenario.name} no longer re-normalizes to itself; an id was re-minted or a read alias round-trips`
    );
  });

  test(`${scenario.name}: _normalizeSystem emits exactly what the three delegates emit`, () => {
    const { viaSystem, viaDelegates } = actual.normalizeSystem[scenario.name];
    assert.deepStrictEqual(
      viaSystem,
      viaDelegates,
      `the chokepoint's wiring of the three check delegates changed for ${scenario.name}`
    );
  });

  test(`${scenario.name}: re-feeding _normalizeSystem's output changes nothing`, () => {
    assert.deepStrictEqual(
      refeed.normalizeSystem[scenario.name],
      actual.normalizeSystem[scenario.name].viaSystem,
      `${scenario.name} no longer re-normalizes to itself through _normalizeSystem`
    );
  });
}

for (const scenario of modifierSelectionScenarios()) {
  test(`${scenario.name}: the direct modifier selection emits the golden shape`, () => {
    assert.deepStrictEqual(
      actual.modifierSelection[scenario.name],
      golden.modifierSelection[scenario.name],
      'the Valid Id Basis sentinel changed: an unknown basis must prune nothing'
    );
  });
}
