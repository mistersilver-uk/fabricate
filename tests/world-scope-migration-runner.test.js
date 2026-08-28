/**
 * THE RUNNER, TEAR RECOVERY, THE GM NOTICE AND THE DOWNGRADE DECLARATION (issue 1363, epic 1357).
 *
 * `1.30.0` writes SEVEN legs through THREE DIFFERENT SEAMS — `recipeCorpus.createOrUpdateAll`,
 * `craftingSystemCorpus.createOrUpdateAll` and `_setSetting` for the rest — so a harness that
 * wraps only `setSetting` never tears two of them while still reporting seven. Every arm below
 * tears through the leg's REAL seam.
 *
 * EACH ARM ASSERTS ITS CHANGE GATE IS TRUE BEFORE THE TEAR. Every leg is change-gated
 * (`if (recipesChanged)`, `if (systemsChanged)`, …), so a byte-identical payload skips the branch
 * and produces a "tear and recover" that never entered the code — a spurious green that reads
 * exactly like a real one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mayClearWorldScopeRekeyMap,
  remapWorldScopeIdentityFlags,
} from '../src/migration/remapWorldScopeIdentityFlags.js';
import { buildWorldScopeEntityNotice } from '../src/migration/worldScopeEntityNotice.js';
import {
  installFoundryStubs,
  makeScopeStore,
  normalizeCorpus,
  scenarioSpecs,
} from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');

/** The seven legs, and the seam each is written through. */
const LEGS = Object.freeze([
  { key: 'worldScopeRekeyMap', seam: 'setting' },
  { key: 'recipes', seam: 'recipeCorpus' },
  { key: 'componentScope', seam: 'setting' },
  { key: 'essenceScope', seam: 'setting' },
  { key: 'toolScope', seam: 'setting' },
  { key: 'craftingSystems', seam: 'craftingSystemCorpus' },
  { key: 'gatheringConfig', seam: 'setting' },
]);

class TornWrite extends Error {}

/**
 * A runner over an in-memory store, with an optional tear on ONE leg through its REAL seam.
 *
 * @param {object} initial The pre-run store contents.
 * @param {{key?: string, seam?: string}} [tear]
 * @returns {object}
 */
function makeRunner(initial, tear = {}) {
  const store = new Map(Object.entries(initial));
  const writes = [];
  const refuse = (key) => {
    if (tear.key === key) throw new TornWrite(`torn at ${key}`);
  };
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => {
      refuse(key);
      writes.push(key);
      store.set(key, JSON.parse(JSON.stringify(value)));
    },
    recipeCorpus: {
      loadAll: async () => store.get('recipes') ?? [],
      createOrUpdateAll: async (records) => {
        refuse('recipes');
        writes.push('recipes');
        store.set('recipes', JSON.parse(JSON.stringify(records)));
      },
    },
    craftingSystemCorpus: {
      loadAll: async () => store.get('craftingSystems') ?? [],
      createOrUpdateAll: async (systems) => {
        refuse('craftingSystems');
        writes.push('craftingSystems');
        store.set('craftingSystems', JSON.parse(JSON.stringify(systems)));
      },
    },
  });
  return { runner, store, writes };
}

const worldCache = new Map();

/**
 * The index of one named scenario.
 *
 * BY NAME, NOT BY POSITION: `scenarioSpecs()` grows, and a positional selector silently retargets
 * a different corpus when it does — which is how this arm came to assert on one that carries no
 * dangling reference at all.
 */
function scenarioIndex(name) {
  const index = scenarioSpecs().findIndex((scenario) => scenario.name === name);
  assert.ok(index >= 0, `no scenario named ${name}`);
  return index;
}

/**
 * A world sitting at `1.29.0`, so only the `1.30.0` entry is pending.
 *
 * MEMOIZED AND DEEP-CLONED. `_normalizeSystem` mints an id for a record that lacks one, from a
 * monotonic stub counter, so building the corpus twice would produce two corpora that differ by
 * exactly those minted ids — and every tear arm compares a torn re-run against an untorn baseline.
 */
function worldAt129(scenarioIndex = 0) {
  if (!worldCache.has(scenarioIndex)) {
    worldCache.set(
      scenarioIndex,
      normalizeCorpus(CraftingSystemManager, scenarioSpecs()[scenarioIndex].raw)
    );
  }
  const before = JSON.parse(JSON.stringify(worldCache.get(scenarioIndex)));
  return {
    migrationVersion: '1.29.0',
    recipes: before.recipes,
    craftingSystems: before.systems,
    gatheringConfig: before.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  };
}

/** The WHOLE-CORPUS final state, not merely the reference closure. */
function finalState(store) {
  return JSON.parse(
    JSON.stringify({
      recipes: store.get('recipes'),
      craftingSystems: store.get('craftingSystems'),
      gatheringConfig: store.get('gatheringConfig'),
      componentScope: store.get('componentScope'),
      essenceScope: store.get('essenceScope'),
      toolScope: store.get('toolScope'),
      worldScopeRekeyMap: store.get('worldScopeRekeyMap'),
    })
  );
}

// ---------------------------------------------------------------------------
// The untorn baseline, and the leg order
// ---------------------------------------------------------------------------

test('the untorn pass writes all SEVEN legs, with the re-key map FIRST and the three scope legs before craftingSystems', async () => {
  const { runner, store, writes } = makeRunner(worldAt129());
  const summary = await runner.run();
  assert.equal(summary.aborted, false);
  assert.equal(summary.deferred, undefined);
  for (const leg of LEGS) {
    assert.ok(writes.includes(leg.key), `the ${leg.key} leg must actually be written`);
  }
  assert.equal(writes[0], 'worldScopeRekeyMap', 'the decision record is the FIRST leg');
  assert.ok(writes.indexOf('worldScopeRekeyMap') < writes.indexOf('recipes'));
  for (const scopeKey of ['componentScope', 'essenceScope', 'toolScope']) {
    assert.ok(
      writes.indexOf(scopeKey) < writes.indexOf('craftingSystems'),
      `${scopeKey} is a DESTINATION and must precede its source`
    );
  }
  assert.equal(store.get('migrationVersion'), '1.30.0');
  // The `defaults` sub-key is WRITTEN and POPULATED: since the maintainer's donor ruling it
  // carries one record per entity whose oldest contributing system authored a liftable section.
  // Seededness still keys on key PRESENCE, so the key must be written either way.
  const componentDefaults = store.get('componentScope').defaults;
  assert.equal(typeof componentDefaults, 'object');
  assert.ok(
    Object.keys(componentDefaults).length > 0,
    'the donor-elected world defaults are persisted'
  );
  assert.ok(
    'defaults' in store.get('essenceScope') && 'defaults' in store.get('toolScope'),
    'all three scope payloads carry the `defaults` key'
  );
});

// ---------------------------------------------------------------------------
// Criterion 5 — tear recovery, all seven legs, through their real seams
// ---------------------------------------------------------------------------

for (const leg of LEGS) {
  test(`tear recovery: the ${leg.key} leg (${leg.seam} seam)`, async () => {
    // THE CHANGE GATE IS ASSERTED FIRST. A byte-identical payload skips the branch, so a tear
    // that never entered the code would otherwise read exactly like a recovered one.
    const baseline = makeRunner(worldAt129());
    await baseline.runner.run();
    assert.ok(
      baseline.writes.includes(leg.key),
      `${leg.key}: its change gate must be TRUE, or this arm proves nothing`
    );
    const untornFinal = finalState(baseline.store);

    const initial = worldAt129();
    const preRun = JSON.parse(JSON.stringify(initial));
    const torn = makeRunner(initial, { key: leg.key });
    const summary = await torn.runner.run();

    assert.equal(summary.deferred, true, `${leg.key}: the pass must DEFER, not throw`);
    assert.equal(summary.deferredReason, 'writebackFailed');
    assert.equal(
      torn.store.get('migrationVersion'),
      '1.29.0',
      `${leg.key}: migrationVersion must be left where it was found`
    );
    const legIndex = LEGS.findIndex((entry) => entry.key === leg.key);
    for (const unwritten of LEGS.slice(legIndex)) {
      assert.deepEqual(
        torn.store.get(unwritten.key),
        preRun[unwritten.key],
        `${leg.key}: the un-written ${unwritten.key} leg must be byte-identical to pre-run`
      );
    }

    // The re-run converges to the SAME FINAL STATE as an untorn run — whole-corpus, naming the
    // in-system identity fields and the three scope payloads explicitly, because a tear among
    // the three scope legs is what would otherwise leave the two identity copies unequal.
    const rerun = makeRunner(Object.fromEntries(torn.store.entries()));
    const rerunSummary = await rerun.runner.run();
    assert.equal(rerunSummary.aborted, false);
    assert.equal(rerun.store.get('migrationVersion'), '1.30.0');
    assert.deepEqual(
      finalState(rerun.store),
      untornFinal,
      `${leg.key}: the re-run must converge to the untorn final state, whole corpus`
    );
  });
}

test('the craftingSystems-to-gatheringConfig tear is the one the persisted map exists to repair', async () => {
  const baseline = makeRunner(worldAt129());
  await baseline.runner.run();
  const untornFinal = finalState(baseline.store);

  const torn = makeRunner(worldAt129(), { key: 'gatheringConfig' });
  await torn.runner.run();
  // `craftingSystems` LANDED and no longer holds the old ids, so a re-derived map would be
  // EMPTY. Only the persisted map still carries the old-to-new pairs.
  assert.ok(
    Object.keys(torn.store.get('worldScopeRekeyMap')).length > 0,
    'the decision record survived the tear'
  );
  const rerun = makeRunner(Object.fromEntries(torn.store.entries()));
  await rerun.runner.run();
  assert.deepEqual(
    finalState(rerun.store).gatheringConfig,
    untornFinal.gatheringConfig,
    "gatheringConfig's old ids must be rewritten by the re-run, from the persisted map alone"
  );
  assert.deepEqual(finalState(rerun.store), untornFinal);
});

test('the ready-pass interaction: a same-boot pass must NOT destroy the map of a torn migration', async () => {
  const torn = makeRunner(worldAt129(), { key: 'gatheringConfig' });
  await torn.runner.run();
  const mapAfterTear = torn.store.get('worldScopeRekeyMap');
  assert.ok(Object.keys(mapAfterTear).length > 0);

  // The one-shot `ready` pass runs on the SAME BOOT, because the deferred branch returns
  // normally. Its RUN gate is corpus-derived and is already true — the three scope legs landed.
  const scopeStore = makeScopeStore('components', torn.store.get('componentScope'));
  assert.equal(scopeStore.isSeeded('entities'), true, 'the corpus predicate is already TRUE');

  // …and its CLEAR gate is not.
  assert.equal(
    mayClearWorldScopeRekeyMap(torn.store.get('migrationVersion')),
    false,
    'the clear must be WITHHELD while the producing migration has not completed'
  );

  // AT THE NEXT BOOT the map is STILL PRESENT and the re-run repairs `gatheringConfig`.
  const rerun = makeRunner(Object.fromEntries(torn.store.entries()));
  await rerun.runner.run();
  assert.equal(rerun.store.get('migrationVersion'), '1.30.0');

  // AND THE MAP IS EVENTUALLY CLEARED. Without this assertion the arm passes against a pass
  // that withholds the clear but advances its own version, which orphans the map permanently.
  assert.equal(
    mayClearWorldScopeRekeyMap(rerun.store.get('migrationVersion')),
    true,
    'once the migration completes the pass may finally clear the decision record'
  );
});

test('the map-clear gate uses compareSemver, so a LEXICOGRAPHIC compare cannot defeat it', () => {
  // `'1.4.0' >= '1.30.0'` is TRUE in JavaScript, and all six of `1.4.0`-`1.9.0` are registered
  // migration versions — the worlds running the longest multi-migration pass, i.e. the most
  // tear-prone population there is.
  for (const version of ['1.4.0', '1.5.0', '1.6.0', '1.7.0', '1.8.0', '1.9.0']) {
    assert.ok(version >= '1.30.0', `the premise: '${version}' >= '1.30.0' is TRUE lexically`);
    assert.equal(
      mayClearWorldScopeRekeyMap(version),
      false,
      `a world at ${version} must NOT be allowed to clear the map`
    );
  }
  assert.equal(mayClearWorldScopeRekeyMap('1.29.0'), false);
  assert.equal(mayClearWorldScopeRekeyMap('1.30.0'), true);
  assert.equal(mayClearWorldScopeRekeyMap('1.31.0'), true);
  assert.equal(mayClearWorldScopeRekeyMap(undefined), false);
});

// ---------------------------------------------------------------------------
// Criterion 4(d) — the runner's version gate blocks re-entry
// ---------------------------------------------------------------------------

test('a persisted world tool-breakage authority SURVIVES the migration', async () => {
  // The FOURTH `toolScope` sibling. Narrowing the payload to the three sub-keys would destroy it
  // on any world this pass lifts — and the registry label rests `downgradeLosesData: false` on
  // the promise that the three scope settings "survive untouched and a re-upgrade finds them
  // intact". Nothing authors an authority at `1.30.0`, but import/export ships in this release
  // and the catalogue editors follow it.
  const initial = worldAt129();
  initial.toolScope = {
    entities: [],
    defaults: {},
    membership: {},
    toolBreakage: { authority: 'checkDriven' },
  };
  const { runner, store } = makeRunner(initial);
  await runner.run();
  assert.deepEqual(
    store.get('toolScope').toolBreakage,
    { authority: 'checkDriven' },
    'the authored world authority is preserved verbatim'
  );
  assert.ok(store.get('toolScope').entities.length > 0, 'and the lift still happened');
});

test('idempotence (d): a world already at 1.30.0 never re-enters the migration', async () => {
  const initial = worldAt129();
  initial.migrationVersion = '1.30.0';
  const { runner, writes } = makeRunner(initial);
  const summary = await runner.run();
  assert.equal(summary.ran, 0);
  assert.deepEqual(writes, [], 'nothing is persisted at all');
});

// ---------------------------------------------------------------------------
// Criterion 11 — the transient report reaches the summary and is never persisted
// ---------------------------------------------------------------------------

test('the report is threaded through all four legs and is NEVER persisted', async () => {
  const { runner, store } = makeRunner(worldAt129());
  const summary = await runner.run();
  const report = summary.worldScopeEntityReport;
  assert.ok(report, 'the report must reach the SUMMARY — a migration cannot report any other way');
  assert.ok(report.createdEntities.components > 0);
  assert.ok(Array.isArray(report.renames) && report.renames.length > 0);
  assert.ok(Array.isArray(report.mergedGroups) && report.mergedGroups.length > 0);
  assert.ok(Array.isArray(report.refusals));
  assert.ok(Array.isArray(report.flaggedForReview));
  for (const key of ['craftingSystems', 'recipes', 'gatheringConfig', 'componentScope']) {
    assert.ok(
      !JSON.stringify(store.get(key)).includes('_worldScopeEntityReport'),
      `the transient field is never persisted into ${key}`
    );
  }
  // `emptyPassSummary()` carries the key too, so a deferred or aborted pass answers `null`
  // rather than `undefined` and the consumer's guard reads the same on every path.
  const deferred = makeRunner(worldAt129(), { key: 'recipes' });
  const deferredSummary = await deferred.runner.run();
  assert.equal(deferredSummary.worldScopeEntityReport, null);
});

test('the GM notice names every rename, every refusal and every newly-prunable reference', async () => {
  const { runner } = makeRunner(
    worldAt129(scenarioIndex('dangling references and colliding essence slugs'))
  );
  const summary = await runner.run();
  const notice = buildWorldScopeEntityNotice(summary.worldScopeEntityReport, () => undefined);
  assert.ok(notice.message.length > 0, 'the notice must be PRESENT, not inferred');
  assert.equal(notice.severity, 'warn', 'a rename or a prune is a permanent warning');
  for (const rename of summary.worldScopeEntityReport.renames) {
    assert.ok(
      notice.message.includes(rename.oldId) && notice.message.includes(rename.newId),
      `every rename is named: ${rename.oldId} -> ${rename.newId}`
    );
    assert.ok(notice.message.includes(rename.systemId));
    assert.ok(notice.message.includes(rename.donorSystemId));
  }
  for (const flagged of summary.worldScopeEntityReport.flaggedForReview) {
    assert.ok(notice.message.includes(flagged.referenceId));
  }
  assert.ok(
    summary.worldScopeEntityReport.flaggedForReview.length > 0,
    'the premise: this corpus really does carry dangling references'
  );
});

test('a world with nothing to lift produces NO notice and writes NO scope setting', async () => {
  const { runner, writes } = makeRunner({
    migrationVersion: '1.29.0',
    recipes: [],
    craftingSystems: [],
    gatheringConfig: {},
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  const summary = await runner.run();
  assert.equal(
    buildWorldScopeEntityNotice(summary.worldScopeEntityReport, () => undefined).message,
    ''
  );
  for (const key of ['componentScope', 'essenceScope', 'toolScope', 'worldScopeRekeyMap']) {
    assert.ok(
      !writes.includes(key),
      `${key} must be left untouched: seeding an EMPTY entity roster is a licence to prune`
    );
  }
});

// ---------------------------------------------------------------------------
// Criterion 13 — the downgrade declaration is CHECKED, not copied
// ---------------------------------------------------------------------------

test('downgrade (a): 1.29.0 neither reads nor writes the three scope settings', () => {
  // The executable form of the claim. The double is POPULATED and carries write spies — a bare
  // spy would give an UNKNOWN basis and prune nothing, satisfying both assertions vacuously.
  const writeSpy = [];
  const populated = {
    entities: [{ id: 'comp-1', name: 'Ash Salt' }],
    defaults: {},
    membership: { 'comp-1|sys-1': { entityId: 'comp-1', systemId: 'sys-1', inherit: {} } },
  };
  const spyStore = (entityType) => {
    const store = makeScopeStore(entityType, populated);
    for (const method of ['save']) {
      store[method] = async (...args) => {
        writeSpy.push([entityType, method, args]);
      };
    }
    return store;
  };
  const manager = new CraftingSystemManager(
    { getRecipes: () => [] },
    {
      componentScopeStore: spyStore('components'),
      essenceScopeStore: spyStore('essences'),
      toolScopeStore: spyStore('tools'),
    }
  );
  assert.equal(manager._componentScopeStore.isSeeded('entities'), true, 'the double is POPULATED');
  const system = manager._normalizeSystem({
    id: 'sys-1',
    name: 'S',
    components: [{ id: 'comp-1', name: 'Ash Salt' }],
    essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
    tools: [{ id: 'tool-1', name: 'Hammer' }],
  });
  assert.deepEqual(writeSpy, [], '`_normalizeSystem` writes NOTHING to a scope store');
  assert.equal(system.components.length, 1, 'the system still carries its own arrays');
  assert.equal(system.essenceDefinitions.length, 1);
  assert.equal(system.tools.length, 1);
  assert.deepEqual(
    makeScopeStore('components', populated).corpus().entities,
    [{ id: 'comp-1', name: 'Ash Salt' }],
    'the persisted scope value is UNCHANGED — stranded, not lost'
  );
});

test('downgrade (b): the SHIPPED pre-flip normalizer re-mints toolSpecific, and the post-flip one leaves it', () => {
  // The executable form of the one-way pin the label warns about. The shipped `1.29.0` body is
  // applied as a FIXTURE FUNCTION, because that build is not in this tree.
  const shippedPreFlipNormalizer = (raw) => {
    const authority = ['toolSpecific', 'checkDriven'].includes(raw?.authority)
      ? raw.authority
      : 'toolSpecific';
    return { authority };
  };
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const created = manager._normalizeSystem({ id: 'sys-1', name: 'S' });
  assert.equal('toolBreakage' in created, false, 'a 1.30.0-created system authors no authority');

  const downgraded = shippedPreFlipNormalizer(created.toolBreakage);
  assert.deepEqual(downgraded, { authority: 'toolSpecific' }, '1.29.0 RE-MINTS a concrete token');

  const reUpgraded = manager._normalizeSystem({ ...created, toolBreakage: downgraded });
  assert.deepEqual(
    reUpgraded.toolBreakage,
    { authority: 'toolSpecific' },
    'and the post-flip normalizer leaves that concrete token in place — the system is now PINNED ' +
      'out of any world authority, which is a BEHAVIOUR caveat and not a DATA loss'
  );
});

test('the 1.30.0 registry entry declares downgradeTo 1.29.0, downgradeLosesData FALSE, and names its caveats', () => {
  const registry = new MigrationRunner({ getSetting: () => undefined, setSetting: () => {} })
    ._migrations;
  const entry = registry.find((migration) => migration.version === '1.30.0');
  assert.ok(entry, 'the 1.30.0 entry is registered');
  assert.equal(entry.downgradeTo, '1.29.0');
  assert.equal(
    entry.downgradeLosesData,
    false,
    'CHECKED rather than copied: both candidate losses were examined and both fail the registry test'
  );
  assert.doesNotMatch(
    entry.label,
    /DOWNGRADING IS NOT LOSSLESS/,
    'a truthful `false` also removes the obligation to write a clause the world cannot experience'
  );
  // The two caveats the label DOES carry, because they are real and the label is the only string
  // a GM meets at the Keep/Downgrade prompt.
  assert.match(entry.label, /prunable on the next save/);
  assert.match(entry.label, /tool specific/);
});

// ---------------------------------------------------------------------------
// The remap pass is a NO-OP without a map, so an unmigrated world is untouched
// ---------------------------------------------------------------------------

test('the identity-flag remap does nothing at all without a re-key map', async () => {
  const summary = await remapWorldScopeIdentityFlags({
    actors: [{ items: [{ getFlag: () => null }] }],
    rekeyMap: {},
    readFlag: () => null,
    writeFabricateFlag: async () => {
      throw new Error('must not write');
    },
  });
  assert.equal(summary.scannedActors, 0);
  assert.equal(summary.remappedLeaves, 0);
});
