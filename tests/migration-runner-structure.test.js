/**
 * The structural pins the suites importing `MigrationRunner.js` lack: the writeback order the leg
 * table encodes, each leg's own empty default, per-leg isolation of the snapshot and compare
 * passes, and the containment of the version bump.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { MIGRATION_DEFERRAL_REASONS, MigrationRunner } from '../src/migration/MigrationRunner.js';
import { WRITEBACK_LEGS } from '../src/migration/migrationWritebackLegs.js';

/** A migration replacing exactly the named payload keys, each with a distinct new value. */
function changeOnly(...keys) {
  return {
    version: '9.9.9',
    label: 'change the named legs',
    migrate: () => Object.fromEntries(keys.map((key) => [key, { changed: key }])),
  };
}

/**
 * A world whose every setting holds a DISTINCT non-empty value, and a runner over it recording each
 * `setSetting` key in order. The distinct seeds are what make a swapped snapshot visible: every
 * existing fixture starts these legs at the same empty value, so a swap reads clean there.
 */
function makeWorld(migrations) {
  const store = new Map([[SETTING_KEYS.MIGRATION_VERSION, '0.0.0']]);
  const written = [];
  const getSetting = (key) => (store.has(key) ? store.get(key) : { seed: key });
  const setSetting = async (key, value) => {
    written.push(key);
    store.set(key, value);
  };
  return { runner: new MigrationRunner({ getSetting, setSetting, migrations }), written };
}

/**
 * The setting key one leg writes through, observed from the leg itself and from the runner's own
 * default corpus adapters rather than re-typed here as a second key list that would drift.
 */
async function writeKeyOf(leg) {
  const written = [];
  const record = async (key) => {
    written.push(key);
  };
  const probe = new MigrationRunner({ getSetting: () => null, setSetting: record });
  await leg.write(null, {
    setSetting: record,
    recipeCorpus: probe._recipeCorpus,
    craftingSystemCorpus: probe._craftingSystemCorpus,
  });
  return written[0];
}

/**
 * The writeback order with the clause fixing each position, all of them in
 * `destructive-changes-and-migrations/spec.md` § Migration Policy. Positions 12 and 13 are free,
 * and `gatheringParties` is deliberately NOT ordered against the systems write.
 */
const ANNOTATED_WRITEBACK_ORDER = [
  ['worldScopeRekeyMap', '§ Startup Migration Flow item 13: the ONE leg written ahead of recipes'],
  [
    'worldEssenceMergeMap',
    '§ Equivalent World Essence Merge requirement 10: the SECOND leg, immediately after ' +
      'worldScopeRekeyMap and before recipes',
  ],
  ['recipes', '§ Startup Migration Flow: the recipe writeback is ordered first'],
  ['currencyConfig', '§ Startup Migration Flow item 13: destination before the systems source'],
  ['travelConfig', '§ Startup Migration Flow item 13: destination before the systems source'],
  [
    'characterLibraries',
    '§ Startup Migration Flow item 13: destination before the systems source',
  ],
  [
    'componentScope',
    '§ World-Scope Entity Migration requirement 10: a scope destination, before the systems source',
  ],
  [
    'essenceScope',
    '§ World-Scope Entity Migration requirement 10: a scope destination, before the systems source',
  ],
  [
    'toolScope',
    '§ World-Scope Entity Migration requirement 10: a scope destination, before the systems source',
  ],
  ['systems', '§ Startup Migration Flow item 13: the source every lift above was lifted from'],
  [
    'gatheringConfig',
    '§ Migration Registry: 0.7.0 reads it as the SOURCE and the systems as the DESTINATION, and ' +
      'reordering it would destroy a pre-0.7.0 world tool library outright',
  ],
  ['environments', 'incidental'],
  [
    'gatheringParties',
    'incidental, and a documented NON-constraint: its collapse is a transform of parties into ' +
      'themselves and takes nothing from the systems, so a tear either side is equally recoverable',
  ],
];

test('table shape: the leg table carries the writeback order, position by position', () => {
  assert.deepEqual(
    WRITEBACK_LEGS.map((leg) => leg.key),
    ANNOTATED_WRITEBACK_ORDER.map(([key]) => key),
    'the annotated order above is the contract; a leg moved in the table moves without its clause'
  );
});

test('behavioural: a pass changing every leg writes them in table order, the bump last', async () => {
  const world = makeWorld([changeOnly(...WRITEBACK_LEGS.map((leg) => leg.key))]);

  await world.runner.run();

  const expected = [];
  for (const leg of WRITEBACK_LEGS) expected.push(await writeKeyOf(leg));
  expected.push(SETTING_KEYS.MIGRATION_VERSION);
  assert.deepEqual(
    world.written,
    expected,
    'the table is load-bearing rather than decorative: the pass writes in exactly its order'
  );
});

test('every leg reproduces its own empty default when the world holds nothing', async () => {
  let captured = null;
  const runner = new MigrationRunner({
    getSetting: () => null,
    setSetting: async () => {},
    migrations: [
      {
        version: '9.9.9',
        label: 'capture the payload',
        migrate: (data) => {
          captured = { ...data };
        },
      },
    ],
  });

  await runner.run();

  assert.deepEqual(captured, {
    recipes: [],
    systems: [],
    gatheringConfig: {},
    environments: [],
    gatheringParties: [],
    currencyConfig: {},
    travelConfig: {},
    characterLibraries: {},
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
    worldEssenceMergeMap: {},
  });
});

for (const leg of WRITEBACK_LEGS) {
  test(`a pass changing only ${leg.key} writes that leg and the bump, nothing else`, async () => {
    const world = makeWorld([changeOnly(leg.key)]);

    await world.runner.run();

    assert.deepEqual(
      world.written,
      [await writeKeyOf(leg), SETTING_KEYS.MIGRATION_VERSION],
      'a leg compared against another leg snapshot writes a setting nothing changed'
    );
  });
}

test('a rejecting version bump defers the pass rather than escaping run()', async () => {
  const runner = new MigrationRunner({
    getSetting: () => null,
    setSetting: async (key) => {
      if (key === SETTING_KEYS.MIGRATION_VERSION) throw new Error('tear on the bump');
    },
    migrations: [{ version: '9.9.9', label: 'change nothing', migrate: () => ({}) }],
  });

  const summary = await runner.run();

  assert.equal(summary.deferred, true, 'the rejection did not escape run()');
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED);
});
