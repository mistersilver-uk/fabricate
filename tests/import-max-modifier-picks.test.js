/**
 * Issue 1055 — the check-modifier pick cap across export -> import.
 *
 * The world-side `1.20.0` migration cannot help a bundle: an import arrives as JSON and
 * never passes through the settings the runner reads. `migrateExportPayload` mirrors the
 * stamp for the import path, and this drives the whole chain a GM actually takes —
 * `buildExportPayload` -> `prepareForImport` -> `CompendiumImporter.importFromPackData` —
 * rather than the derivation in isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryUtilsEnv } from './helpers/foundryEnv.js';

// The importer needs its own `game` (a pack list and a GM), so only the utils half is
// shared; both must be in place before the dynamic imports that follow.
installFoundryUtilsEnv();
globalThis.game = { packs: [], fabricate: null, user: { isGM: true } };

const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const { buildExportPayload, prepareForImport, validateImportData } =
  await import('../src/systems/CraftingSystemExporter.js');

const MAX_PICKS = 'maxModifierPicks';

function exportedSystem(craftingCheck = {}) {
  return {
    id: 'sys-legacy',
    name: 'Legacy Herbalism',
    components: [],
    craftingCheck: {
      checkModifiers: [
        { id: 'med', label: 'Medicine', expression: '@med' },
        { id: 'alch', label: 'Alchemy', expression: '@alch' },
      ],
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['med'],
      ...craftingCheck,
    },
  };
}

function exportedRecipe(craftingModifier, id = 'r-1') {
  return {
    id,
    name: 'Healing Salve',
    craftingSystemId: '__SYSTEM_ID__',
    ingredientSets: [],
    resultGroups: [],
    ...(craftingModifier === undefined ? {} : { craftingModifier }),
  };
}

/** A pre-1055 bundle: no cap key anywhere. */
function legacyBundle({ system = exportedSystem(), recipes = [] } = {}) {
  return { fabricateVersion: '1.5.0', system, recipes };
}

function makeSystemManager({ systems = [], created = [], updated = [] } = {}) {
  return {
    getSystems: () => systems,
    createSystem: async (data) => {
      const system = { ...data, id: data.id || 'new-system-id' };
      created.push(system);
      return system;
    },
    updateSystem: async (id, data) => {
      const system = { ...data, id };
      updated.push(system);
      return system;
    },
  };
}

function makeRecipeManager({ created = [], updated = [], persisted = [] } = {}) {
  const store = new Map(persisted.map((recipe) => [recipe.id, { ...recipe }]));
  return {
    getRecipe: (id) => store.get(id) ?? null,
    getRecipes: (filters = {}) =>
      [...store.values()].filter(
        (recipe) =>
          filters.craftingSystemId === undefined ||
          recipe.craftingSystemId === filters.craftingSystemId
      ),
    createRecipe: async (data) => {
      created.push(data);
      store.set(data.id, { ...data });
      return data;
    },
    updateRecipe: async (id, data) => {
      updated.push(data);
      store.set(id, { ...data });
      return data;
    },
    deleteRecipe: async (id) => store.delete(id),
    cleanupOrphanedRecipeFlags: async () => {},
    notifyRecipesChanged: () => {},
    save: async () => {},
  };
}

// ---------------------------------------------------------------------------
// prepareForImport stamps the cap before the importer ever sees the payload
// ---------------------------------------------------------------------------

test('prepareForImport caps a legacy playerPicks bundle at one pick', () => {
  const packData = prepareForImport(
    legacyBundle({ system: exportedSystem({ defaultModifierPolicy: 'playerPicks' }) })
  );
  assert.equal(
    packData.system.craftingCheck[MAX_PICKS],
    1,
    'an imported system behaves exactly like a migrated one rather than arriving unbounded'
  );
});

test('prepareForImport leaves a subject-selecting bundle unbounded and its picks intact', () => {
  // The rule token is rewritten by the `1.22.0` upcast (issue 1095); what THIS case owns
  // is that `1.20.0` stamps no cap on a subject-selecting rule and destroys no pick.
  const packData = prepareForImport(
    legacyBundle({
      system: exportedSystem({ defaultModifierPolicy: 'byRecipe' }),
      recipes: [exportedRecipe({ modifierIds: ['med', 'alch'] })],
    })
  );
  assert.equal(packData.system.craftingCheck.defaultModifierPolicy, 'bySubject');
  assert.equal(Object.hasOwn(packData.system.craftingCheck, MAX_PICKS), false);
  assert.deepEqual(packData.recipes[0].craftingModifier, { modifierIds: ['med', 'alch'] });
});

test('prepareForImport leaves a non-selecting rule unbounded', () => {
  const packData = prepareForImport(legacyBundle({ recipes: [exportedRecipe(undefined)] }));
  assert.equal(Object.hasOwn(packData.system.craftingCheck, MAX_PICKS), false);
});

test('validateImportData accepts a bundle carrying the new cap field', () => {
  const result = validateImportData(
    legacyBundle({
      system: exportedSystem({ defaultModifierPolicy: 'playerPicks', [MAX_PICKS]: 2 }),
    })
  );
  assert.equal(result.valid, true, result.errors.join('; '));
});

// ---------------------------------------------------------------------------
// The importer itself
// ---------------------------------------------------------------------------

test('importing a legacy playerPicks bundle creates a system carrying the stamped cap', async () => {
  const created = [];
  const importer = new CompendiumImporter(
    makeSystemManager({ created }),
    makeRecipeManager({ created: [] })
  );

  const summary = await importer.importFromPackData(
    prepareForImport(
      legacyBundle({ system: exportedSystem({ defaultModifierPolicy: 'playerPicks' }) })
    )
  );

  assert.equal(summary.system.created, true);
  assert.equal(created[0].craftingCheck[MAX_PICKS], 1);
});

test('importing a subject-selecting bundle creates it unbounded', async () => {
  const created = [];
  const importer = new CompendiumImporter(makeSystemManager({ created }), makeRecipeManager());
  await importer.importFromPackData(
    prepareForImport(
      legacyBundle({
        system: exportedSystem({ defaultModifierPolicy: 'byRecipe' }),
        recipes: [exportedRecipe({ modifierIds: ['med', 'alch'] })],
      })
    )
  );
  assert.equal(
    Object.hasOwn(created[0].craftingCheck, MAX_PICKS),
    false,
    'a recipe already picking two modifiers is not truncated by an unasked-for cap'
  );
});

test('an OVERWRITE import replaces the existing check block wholesale (issue 1055, accepted)', async () => {
  // `updateSystem` shallow-merges only the TOP level, so an incoming `craftingCheck`
  // replaces the existing one entirely. The incoming block carries whatever cap the
  // bundle resolved to, so the GM's local cap is superseded by the bundle's — accepted,
  // because the cap is a property of the bundle's own rule and is re-authorable in one
  // click.
  const updated = [];
  const existing = {
    id: 'sys-legacy',
    name: 'Legacy Herbalism',
    craftingCheck: { defaultModifierPolicy: 'highest', [MAX_PICKS]: 5 },
  };
  const importer = new CompendiumImporter(
    makeSystemManager({ systems: [existing], updated }),
    makeRecipeManager()
  );

  const summary = await importer.importFromPackData(
    prepareForImport(
      legacyBundle({ system: exportedSystem({ defaultModifierPolicy: 'playerPicks' }) })
    ),
    { overwriteExisting: true }
  );

  assert.equal(summary.collisions[0].resolution, 'overwritten');
  assert.equal(
    updated[0].craftingCheck[MAX_PICKS],
    1,
    'the incoming block wins wholesale, and it carries a RESOLVED cap'
  );
});

test('a non-overwrite import of an existing system writes nothing at all', async () => {
  const created = [];
  const updated = [];
  const existing = { id: 'sys-legacy', name: 'Legacy Herbalism', craftingCheck: {} };
  const importer = new CompendiumImporter(
    makeSystemManager({ systems: [existing], created, updated }),
    makeRecipeManager()
  );

  const summary = await importer.importFromPackData(prepareForImport(legacyBundle()));

  assert.equal(summary.system.skipped, true);
  assert.deepEqual([created.length, updated.length], [0, 0]);
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

test('export -> import round-trips the authored cap, the bySubject rule and every subject pick', async () => {
  const source = {
    id: 'sys-round',
    name: 'Round Trip',
    components: [],
    // The library is SYSTEM-level since issue 1095 and named `modifiers` since issue 1117,
    // and `buildExportPayload` deep-clones the system, so it round-trips for free once
    // `_normalizeSystem` emits it there.
    modifiers: [
      { id: 'med', label: 'Medicine', expression: '@med', min: -1, max: 5 },
      { id: 'alch', label: 'Alchemy', expression: '@alch' },
    ],
    craftingCheck: {
      defaultModifierPolicy: 'bySubject',
      defaultModifierIds: ['med'],
      [MAX_PICKS]: 2,
    },
  };
  const sourceRecipes = [
    {
      id: 'r-set',
      name: 'Subset',
      craftingSystemId: 'sys-round',
      craftingModifier: { modifierIds: ['med'] },
    },
    // The one shape a truthiness test silently loses.
    {
      id: 'r-empty',
      name: 'Empty',
      craftingSystemId: 'sys-round',
      craftingModifier: { modifierIds: [] },
    },
    { id: 'r-plain', name: 'Plain', craftingSystemId: 'sys-round', craftingModifier: null },
  ];

  const payload = buildExportPayload(source, sourceRecipes, '2.0.0');
  assert.equal(payload.system.craftingCheck[MAX_PICKS], 2, 'the cap is exported');

  const created = [];
  const createdRecipes = [];
  const importer = new CompendiumImporter(
    makeSystemManager({ created }),
    makeRecipeManager({ created: createdRecipes })
  );
  // Round-trip through JSON, which is what a real import reads.
  await importer.importFromPackData(prepareForImport(JSON.parse(JSON.stringify(payload))));

  assert.equal(
    created[0].craftingCheck[MAX_PICKS],
    2,
    'an authored cap survives the round trip — it is not re-derived as 1'
  );
  assert.equal(created[0].craftingCheck.defaultModifierPolicy, 'bySubject');
  // The library and its ABSENCE-PRESERVING bounds survive at the system level.
  assert.deepEqual(created[0].modifiers, [
    { id: 'med', label: 'Medicine', expression: '@med', min: -1, max: 5 },
    { id: 'alch', label: 'Alchemy', expression: '@alch' },
  ]);
  const byId = new Map(createdRecipes.map((recipe) => [recipe.id, recipe]));
  assert.deepEqual(byId.get('r-set').craftingModifier, { modifierIds: ['med'] });
  assert.deepEqual(
    byId.get('r-empty').craftingModifier,
    { modifierIds: [] },
    'an authored EMPTY set survives as a pick, not as an absence'
  );
  assert.equal(byId.get('r-plain').craftingModifier, null);
});
