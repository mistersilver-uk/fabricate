/**
 * Issue 1055 — the initialize-time fallback stamp for
 * `craftingCheck.recipeModifierAuthority`.
 *
 * The un-versioned safety net under the versioned `1.20.0` migration, for the world where
 * that migration cannot run or has not yet run on this client. It is driven HERE through
 * the real `manager.initialize()` over a `getSetting`-backed settings fixture rather than
 * by calling the private walk on a hand-built object, because three of the four things
 * worth pinning live outside the walk itself: the normalizer runs first and decides what
 * shape the walk even sees, the persistence is gated by a primary-GM tail the walk shares
 * with two other reconciliations, and the walk EARLY-RETURNS on a recipe manager missing
 * either `getRecipes` or `save` — a fixture without them produces a green-looking no-op.
 *
 * The fixture stores its `craftingCheck` with `recipeModifierAuthority` ABSENT, which is
 * the shape `_normalizeCheckModifierConfig` actually produces. A fixture using an explicit
 * `null` would pass a `=== null` implementation and ship a dead branch green.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++idCounter}`,
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;
globalThis.fromUuidSync = () => null;

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

const AUTHORITY = 'recipeModifierAuthority';

/**
 * A persisted crafting system in the shape the manager's own normalizer writes: the
 * authority key is OMITTED, never written as a placeholder.
 */
function storedSystem(overrides = {}) {
  const system = {
    id: 'sys-1',
    name: 'Herbalism',
    craftingCheck: {
      enabled: true,
      simple: { rollFormula: '1d20 + @craftingmod', dc: 12 },
      checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['med'],
      ...overrides.craftingCheck,
    },
  };
  assert.equal(
    Object.hasOwn(system.craftingCheck, AUTHORITY),
    Boolean(overrides.craftingCheck && AUTHORITY in overrides.craftingCheck),
    'fixture guard: the unstamped fixture must OMIT the key, not store an explicit null'
  );
  return { ...system, ...overrides, craftingCheck: system.craftingCheck };
}

/**
 * Install a `game` whose settings are a real read/write store, and return the store plus
 * a log of every `settings.set`. `getSetting`/`setSetting` read and write through this,
 * so `initialize()` and `save()` are the real ones.
 */
function installSettings(craftingSystems, { isGM = true } = {}) {
  const store = new Map([['craftingSystems', craftingSystems]]);
  const writes = [];
  globalThis.game = {
    user: { id: 'gm-1', isGM, name: 'Test GM' },
    users: { activeGM: { id: 'gm-1' } },
    actors: [],
    settings: {
      get: (_namespace, key) => store.get(key),
      set: async (_namespace, key, value) => {
        writes.push({ key, value });
        store.set(key, value);
        return value;
      },
    },
  };
  return { store, writes };
}

function recipeManagerWith(recipes, { saves = [] } = {}) {
  return {
    getRecipes: ({ craftingSystemId } = {}) =>
      recipes.filter(
        (recipe) => craftingSystemId === undefined || recipe.craftingSystemId === craftingSystemId
      ),
    save: async () => {
      saves.push(Date.now());
    },
  };
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

test('initialize() stamps setAndRule when any recipe in the system carries a craftingModifier', async () => {
  const { writes } = installSettings([storedSystem()]);
  const manager = new CraftingSystemManager(
    recipeManagerWith([
      { id: 'r-1', craftingSystemId: 'sys-1', craftingModifier: { policy: 'highest' } },
      { id: 'r-2', craftingSystemId: 'sys-1', craftingModifier: null },
    ])
  );

  await manager.initialize();

  assert.equal(manager.getSystem('sys-1').craftingCheck[AUTHORITY], 'setAndRule');
  const systemsWrite = writes.find((write) => write.key === 'craftingSystems');
  assert.ok(systemsWrite, 'the stamp is persisted');
  assert.equal(systemsWrite.value[0].craftingCheck[AUTHORITY], 'setAndRule');
});

test('initialize() stamps none when no recipe in the system carries one', async () => {
  installSettings([storedSystem()]);
  const manager = new CraftingSystemManager(
    recipeManagerWith([{ id: 'r-1', craftingSystemId: 'sys-1' }])
  );

  await manager.initialize();

  assert.equal(manager.getSystem('sys-1').craftingCheck[AUTHORITY], 'none');
});

test('initialize() keys on the PRESENCE of the override block, not its contents', async () => {
  for (const craftingModifier of [{}, { modifierIds: [] }, { policy: 'addAll' }]) {
    installSettings([storedSystem()]);
    const manager = new CraftingSystemManager(
      recipeManagerWith([{ id: 'r-1', craftingSystemId: 'sys-1', craftingModifier }])
    );
    await manager.initialize();
    assert.equal(
      manager.getSystem('sys-1').craftingCheck[AUTHORITY],
      'setAndRule',
      `${JSON.stringify(craftingModifier)} is a delegation`
    );
  }
});

test('initialize() derives per system, from that system’s own recipes', async () => {
  installSettings([storedSystem(), storedSystem({ id: 'sys-2' })]);
  const manager = new CraftingSystemManager(
    recipeManagerWith([
      { id: 'r-1', craftingSystemId: 'sys-2', craftingModifier: { policy: 'highest' } },
    ])
  );

  await manager.initialize();

  assert.equal(manager.getSystem('sys-1').craftingCheck[AUTHORITY], 'none');
  assert.equal(manager.getSystem('sys-2').craftingCheck[AUTHORITY], 'setAndRule');
});

test('initialize() never overwrites an authored level', async () => {
  for (const authored of ['none', 'setOnly', 'setAndRule']) {
    const { writes } = installSettings([
      storedSystem({ craftingCheck: { [AUTHORITY]: authored } }),
    ]);
    const manager = new CraftingSystemManager(
      recipeManagerWith([
        { id: 'r-1', craftingSystemId: 'sys-1', craftingModifier: { policy: 'highest' } },
      ])
    );

    await manager.initialize();

    assert.equal(manager.getSystem('sys-1').craftingCheck[AUTHORITY], authored);
    assert.equal(
      writes.some((write) => write.key === 'craftingSystems'),
      false,
      `an authored ${authored} is not re-derived, and nothing is written`
    );
  }
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

test('re-running initialize() over an already-stamped world writes nothing', async () => {
  const { store, writes } = installSettings([storedSystem()]);
  const recipes = [
    { id: 'r-1', craftingSystemId: 'sys-1', craftingModifier: { policy: 'highest' } },
  ];

  await new CraftingSystemManager(recipeManagerWith(recipes)).initialize();
  const afterFirst = writes.length;
  assert.ok(afterFirst > 0, 'the first pass stamped and persisted');
  assert.equal(store.get('craftingSystems')[0].craftingCheck[AUTHORITY], 'setAndRule');

  // A SECOND manager over the now-stamped setting — the next client boot. Re-calling
  // `initialize()` on the same instance would prove nothing: it early-returns on
  // `this.initialized`.
  const second = new CraftingSystemManager(recipeManagerWith(recipes));
  await second.initialize();
  assert.equal(writes.length, afterFirst, 'the second boot finds it resolved and writes nothing');
  assert.equal(second.getSystem('sys-1').craftingCheck[AUTHORITY], 'setAndRule');

  // …and the guarded re-entry on the same instance is a no-op too.
  await second.initialize();
  assert.equal(writes.length, afterFirst);
});

// ---------------------------------------------------------------------------
// The player client
// ---------------------------------------------------------------------------

test('a player client stamps IN MEMORY, persists nothing, and rejects nothing', async () => {
  // Only a GM may update a world Setting. This pass runs from `initialize()`, BEFORE the
  // startup-maintenance error isolation, so a rejection here would leave `initialized`
  // false and every facade method throwing for the rest of the session (issue 970).
  const { writes } = installSettings([storedSystem()], { isGM: false });
  const saves = [];
  const manager = new CraftingSystemManager(
    recipeManagerWith(
      [{ id: 'r-1', craftingSystemId: 'sys-1', craftingModifier: { policy: 'highest' } }],
      { saves }
    ),
    { isActiveGM: () => false }
  );

  await assert.doesNotReject(() => manager.initialize());

  assert.equal(manager.initialized, true, 'the session is usable');
  assert.equal(
    manager.getSystem('sys-1').craftingCheck[AUTHORITY],
    'setAndRule',
    'the in-memory pass is ungated, so the player resolves the same value the GM will'
  );
  assert.deepEqual(writes, [], 'no world setting was written');
  assert.deepEqual(saves, [], 'and no recipe save was attempted either');
});

// ---------------------------------------------------------------------------
// The walk's own precondition
// ---------------------------------------------------------------------------

test('a recipe manager missing getRecipes or save produces NO stamp at all', async () => {
  // The walk early-returns on either, so such a fixture is a silent no-op that reads as
  // "the stamp works" if the assertion is only that nothing was written. Pin the absence
  // of the stamp itself, so a future test built on a half-fixture cannot pass vacuously.
  for (const recipeManager of [
    { getRecipes: () => [] },
    { save: async () => {} },
    {},
    null,
  ]) {
    installSettings([storedSystem()]);
    const manager = new CraftingSystemManager(recipeManager);
    await manager.initialize();
    assert.equal(
      Object.hasOwn(manager.getSystem('sys-1').craftingCheck, AUTHORITY),
      false,
      `${JSON.stringify(Object.keys(recipeManager ?? {}))}: the walk never ran, so nothing is stamped`
    );
  }
});

// ---------------------------------------------------------------------------
// What the normalizer leaves for the walk
// ---------------------------------------------------------------------------

test('the normalizer runs first, so a persisted junk or null level reaches the walk as ABSENT', async () => {
  for (const stored of [null, 'byRecipe', 'bogus', 42]) {
    installSettings([{ id: 'sys-1', name: 'S', craftingCheck: { [AUTHORITY]: stored } }]);
    const manager = new CraftingSystemManager(
      recipeManagerWith([{ id: 'r-1', craftingSystemId: 'sys-1' }])
    );
    await manager.initialize();
    assert.equal(
      manager.getSystem('sys-1').craftingCheck[AUTHORITY],
      'none',
      `a persisted ${JSON.stringify(stored)} is dropped by the normalizer and then stamped`
    );
  }
});

test('the fallback deliberately ignores the persisted byRecipe policy signal', async () => {
  // `initialize()` normalizes every system BEFORE the walk, and the normalizer narrows
  // the rule to addAll/highest/playerPicks — so a persisted `byRecipe` has already been
  // coerced to `addAll` by the time the walk runs and there is no signal left to read.
  // The divergence from the versioned migration (which WOULD stamp `setAndRule` here) is
  // accepted: with no recipe override there is nothing for the delegation to delegate to,
  // so every rolled formula is identical under either stamp.
  installSettings([
    storedSystem({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } }),
  ]);
  const manager = new CraftingSystemManager(
    recipeManagerWith([{ id: 'r-1', craftingSystemId: 'sys-1' }])
  );

  await manager.initialize();

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.defaultModifierPolicy, 'addAll', 'the normalizer already coerced it');
  assert.equal(check[AUTHORITY], 'none');
});
