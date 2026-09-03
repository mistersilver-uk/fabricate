/**
 * `CraftingSystemManager.applyBulkEditToRecipes` — the recipe set-apply write primitive
 * behind the Recipe Studio's multi-select bulk edit (issue 1010).
 *
 * It lives on `CraftingSystemManager` rather than `RecipeManager` because the book axis
 * writes `system.recipeItemDefinitions[].recipeIds` and `RecipeManager` has no `save()` for
 * that setting. The whole point of the primitive is a bounded write: at most ONE `recipes`
 * world write and at most ONE `craftingSystems` world write per apply, none for an axis
 * that changed nothing, with books written first so the membership-basis marker is
 * committed before anything reads membership against it.
 *
 * Both managers are REAL here, with only their `save()` replaced by a counter. That is what
 * gives the suite teeth: `updateRecipe`'s persistence validation, its activation gate and
 * the alchemy signature scan all run for real, so the two error branches are genuinely
 * provoked by fixture data rather than by a stub that throws on demand.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const hookCalls = [];
const consoleWarnings = [];

let craftingSystemManagerRef = null;

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (object, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], object),
  },
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  i18n: { localize: (key) => key, format: (key) => key },
  fabricate: { getCraftingSystemManager: () => craftingSystemManagerRef },
  settings: { get: () => undefined, set: async () => {} },
};

globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.Hooks = {
  callAll: (name, payload) => {
    hookCalls.push({ name, payload });
  },
};

// `updateRecipe` logs one debug line per recipe; the batch would drown the reporter.
console.debug = () => {};
const realConsoleWarn = console.warn;
console.warn = (message) => {
  consoleWarnings.push(String(message));
};

// The panel's own staging model, so the falsy-but-real payloads below are built by the
// REAL producer rather than restated as literals the assertions cannot fail against.
const {
  RECIPE_CHECK_TIER_DEFAULT,
  createRecipeBulkDraft,
  setBulkRecipeCategory,
  setBulkRecipeCheckTier,
  setBulkRecipeLock,
  setBulkRecipeStatus,
  toBulkRecipeEdit,
} = await import('../src/utils/recipeBulkEditModel.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
// The PANEL side of the offer/accept pair, imported so the parity guard below compares the
// write against the real producer of the dropdown rather than against a restated list.
const { resolveRecipeCheckTierOptions } = await import('../src/utils/routedOutcomeKeywords.js');
const { resolveActiveCraftingCheckFormula } = await import(
  '../src/systems/checkModifierResolver.js'
);

const SYSTEM_ID = 'sys1';
const TIER_EASY = 't-easy';
const TIER_HARD = 't-hard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A complete, craftable recipe: one ingredient set, one populated result group. */
function completeRecipe(id, overrides = {}) {
  return {
    id,
    name: overrides.name || `Recipe ${id}`,
    craftingSystemId: SYSTEM_ID,
    category: 'general',
    enabled: false,
    locked: false,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          {
            id: `${id}-grp`,
            name: 'Ingredients',
            options: [{ componentId: 'comp-a', quantity: 1 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  };
}

/**
 * Structurally VALID but INCOMPLETE — no ingredient sets, no result groups. `updateRecipe`
 * with `allowIncomplete: true` persists it happily and then refuses the enable, which is the
 * `RecipeActivationError` branch.
 */
function shellRecipe(id, overrides = {}) {
  return {
    id,
    name: overrides.name || `Shell ${id}`,
    craftingSystemId: SYSTEM_ID,
    category: 'general',
    enabled: false,
    locked: false,
    ...overrides,
  };
}

/**
 * Structurally BROKEN — outcome routing naming a result group that does not exist, which
 * `_validate` reports even with `requireComplete: false`. `allowIncomplete: true` still runs
 * `validateStructure()`, so this recipe fails PERSISTENCE and is the `RecipePersistenceError`
 * branch: the class this change makes newly selectable, and the reason an uncaught throw
 * would abort the batch after the books save had already committed.
 */
function brokenRecipe(id, overrides = {}) {
  return completeRecipe(id, { outcomeRouting: { success: 'no-such-group' }, ...overrides });
}

function bookDefinition(id, recipeIds = []) {
  return {
    id,
    name: `Book ${id}`,
    img: `icons/${id}.webp`,
    originItemUuid: `Item.${id}`,
    recipeIds,
    caps: { item: {}, learn: {} },
  };
}

function systemData({ definitions, marker = true, resolutionMode = 'simple', alchemy } = {}) {
  const system = {
    id: SYSTEM_ID,
    name: 'Arcana',
    resolutionMode,
    ...(alchemy ? { alchemy } : {}),
    categories: ['Potions', 'Scrolls'],
    items: [{ id: 'comp-a', name: 'Aqua Vitae', tags: [] }],
    craftingCheck: {
      enabled: true,
      simple: {
        dcMode: 'static',
        rollFormula: '1d20',
        tiers: [
          { id: TIER_EASY, name: 'Easy', dc: 8 },
          { id: TIER_HARD, name: 'Hard', dc: 16 },
        ],
      },
      routed: {
        type: 'relative',
        tiers: [{ id: 'routed-tier', name: 'Tricky', dc: 12 }],
      },
    },
    recipeItemDefinitions: definitions ?? [
      bookDefinition('book-a'),
      bookDefinition('book-b'),
      bookDefinition('book-c'),
    ],
  };
  if (marker) system.membershipResolvesByRecipeIds = true;
  return system;
}

/**
 * One real `RecipeManager` and one real `CraftingSystemManager`, wired to each other, with
 * `save()` replaced by a counter on EACH so the two single-write guarantees are provable
 * independently of one another.
 */
function makeFixture({ recipes = [], system = systemData() } = {}) {
  hookCalls.length = 0;
  consoleWarnings.length = 0;

  const recipeManager = new RecipeManager();
  recipeManager.initialized = true;
  for (const data of recipes) recipeManager.recipes.set(data.id, new Recipe(data));
  recipeManager.saveCount = 0;
  recipeManager.save = async () => {
    recipeManager.saveCount += 1;
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.systems.set(SYSTEM_ID, manager._normalizeSystem(system));
  manager.initialized = true;
  manager.saveCount = 0;
  manager.save = async () => {
    manager.saveCount += 1;
  };

  craftingSystemManagerRef = manager;
  return { manager, recipeManager };
}

function recipeOf(fixture, id) {
  return fixture.recipeManager.recipes.get(id);
}

function definitionOf(fixture, id) {
  return fixture.manager.getSystem(SYSTEM_ID).recipeItemDefinitions.find((def) => def.id === id);
}

function hookNames(name) {
  return hookCalls.filter((call) => call.name === name);
}

/** Count every ASSIGNMENT to each definition's `recipeIds`, so "written once" is provable. */
function watchMembershipWrites(fixture) {
  const writes = new Map();
  for (const definition of fixture.manager.getSystem(SYSTEM_ID).recipeItemDefinitions) {
    let held = definition.recipeIds;
    writes.set(definition.id, 0);
    Object.defineProperty(definition, 'recipeIds', {
      configurable: true,
      enumerable: true,
      get: () => held,
      set: (next) => {
        writes.set(definition.id, writes.get(definition.id) + 1);
        held = next;
      },
    });
  }
  return writes;
}

// ---------------------------------------------------------------------------

describe('applyBulkEditToRecipes — guards', () => {
  beforeEach(() => {
    game.user.isGM = true;
  });

  it('requires a GM', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });
    game.user.isGM = false;

    await assert.rejects(
      () => fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { category: 'Potions' }),
      /GM permissions required/
    );
    assert.equal(fixture.recipeManager.saveCount, 0);
    assert.equal(fixture.manager.saveCount, 0);
  });

  it('throws for an unknown system', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    await assert.rejects(
      () => fixture.manager.applyBulkEditToRecipes('nope', ['r1'], { category: 'Potions' }),
      /Crafting system not found/
    );
  });

  it('no-ops on an unstaged edit, and on a non-object one', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    for (const edit of [{}, null, 'nonsense']) {
      const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], edit);
      assert.equal(result.updated, 0, `unstaged edit ${JSON.stringify(edit)} writes nothing`);
    }
    assert.equal(fixture.recipeManager.saveCount, 0);
    assert.equal(fixture.manager.saveCount, 0);
    assert.equal(hookCalls.length, 0);
  });

  it('no-ops on an empty id set even with staged axes', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, [], {
      category: 'Potions',
      addBookIds: ['book-a'],
    });

    assert.deepEqual(
      { updated: result.updated, booksUpdated: result.booksUpdated },
      { updated: 0, booksUpdated: 0 }
    );
    assert.equal(fixture.recipeManager.saveCount, 0);
    assert.equal(fixture.manager.saveCount, 0);
  });
});

describe('applyBulkEditToRecipes — the two save guarantees', () => {
  it('a recipes-only edit writes the recipes setting once and the systems setting never', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1'), completeRecipe('r2')] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
      category: 'Potions',
      locked: true,
    });

    assert.equal(result.updated, 2);
    assert.deepEqual(result.recipeIds, ['r1', 'r2']);
    assert.equal(fixture.recipeManager.saveCount, 1, 'exactly one recipes write for the set');
    assert.equal(fixture.manager.saveCount, 0, 'the systems setting is untouched');
    assert.equal(recipeOf(fixture, 'r1').category, 'Potions');
    assert.equal(recipeOf(fixture, 'r2').locked, true);
  });

  it('a books-only edit writes the systems setting once and the recipes setting never', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
      addBookIds: ['book-a'],
    });

    assert.equal(result.booksUpdated, 1);
    assert.deepEqual(result.bookIds, ['book-a']);
    assert.equal(result.updated, 0, 'no recipe field changed');
    assert.equal(fixture.manager.saveCount, 1, 'exactly one systems write');
    assert.equal(fixture.recipeManager.saveCount, 0, 'the recipes setting is untouched');
  });

  it('a both-axes edit writes each setting exactly once', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1'), completeRecipe('r2')] });

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
      category: 'Potions',
      addBookIds: ['book-b'],
    });

    assert.equal(fixture.manager.saveCount, 1);
    assert.equal(fixture.recipeManager.saveCount, 1);
  });

  it('a resolved no-op with staged keys saves nothing at all', async () => {
    // Every staged axis already agrees with every selected recipe, so the minimal patch is
    // empty for each of them and no `updateRecipe` call is made.
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2')],
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
      category: 'general',
      enabled: false,
      locked: false,
    });

    assert.equal(result.updated, 0);
    assert.equal(fixture.recipeManager.saveCount, 0, 'an axis that changed nothing writes nothing');
    assert.equal(fixture.manager.saveCount, 0);
    assert.equal(hookCalls.length, 0, 'and announces nothing');
  });
});

describe('applyBulkEditToRecipes — the three falsy-but-real axes', () => {
  // `toBulkRecipeEdit` emits `enabled: false`, `locked: false` and `checkTierId: null` — the
  // panel's Disable, Unlock and Default DC — present if and only if staged. Each needs its
  // OWN case: a truthiness guard drops all three while every test that stages the truthy
  // side of the same axis keeps passing, so covering Enable does not cover Disable.
  //
  // Each payload below is built by the REAL producer rather than hand-written, so the
  // precondition that documents why the case discriminates ("staged, and falsy") is an
  // assertion about `toBulkRecipeEdit` and fails if the model stops emitting that shape.
  // Asserting it against a literal declared two lines above documented the same intent and
  // could not fail.
  it('a staged DISABLE turns an enabled recipe off', async () => {
    const edit = toBulkRecipeEdit(setBulkRecipeStatus(createRecipeBulkDraft(), 'disable'));
    assert.equal(Object.hasOwn(edit, 'enabled'), true, 'staged');
    assert.equal(edit.enabled, false, 'and falsy');
    const fixture = makeFixture({ recipes: [completeRecipe('r1', { enabled: true })] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], edit);

    assert.equal(recipeOf(fixture, 'r1').enabled, false, 'Disable is a real instruction');
    assert.deepEqual(result.recipeIds, ['r1']);
    assert.equal(fixture.recipeManager.saveCount, 1);
  });

  it('a staged UNLOCK unlocks a locked recipe', async () => {
    const edit = toBulkRecipeEdit(setBulkRecipeLock(createRecipeBulkDraft(), 'unlock'));
    assert.equal(Object.hasOwn(edit, 'locked'), true, 'staged');
    assert.equal(edit.locked, false, 'and falsy');
    const fixture = makeFixture({ recipes: [completeRecipe('r1', { locked: true })] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], edit);

    assert.equal(recipeOf(fixture, 'r1').locked, false, 'Unlock is a real instruction');
    assert.deepEqual(result.recipeIds, ['r1']);
  });

  it('leaves status and lock alone when their keys are ABSENT', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1', { enabled: true, locked: true })],
    });

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { category: 'Potions' });

    const recipe = recipeOf(fixture, 'r1');
    assert.equal(recipe.enabled, true, 'an unstaged status axis is not defaulted to false');
    assert.equal(recipe.locked, true, 'nor an unstaged lock axis');
  });
});

describe('applyBulkEditToRecipes — the cohort', () => {
  it('ignores an id belonging to ANOTHER system', async () => {
    const foreign = completeRecipe('r-foreign', { craftingSystemId: 'sys2' });
    const fixture = makeFixture({ recipes: [completeRecipe('r1'), foreign] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r-foreign'], {
      category: 'Potions',
    });

    assert.deepEqual(result.recipeIds, ['r1']);
    assert.equal(
      recipeOf(fixture, 'r-foreign').category,
      'general',
      'the foreign recipe is untouched'
    );
  });

  it('ignores a DANGLING id that resolves to no recipe at all', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    const result = await fixture.manager.applyBulkEditToRecipes(
      SYSTEM_ID,
      ['r1', 'deleted-yesterday'],
      { category: 'Potions' }
    );

    assert.deepEqual(result.recipeIds, ['r1']);
    assert.equal(fixture.recipeManager.saveCount, 1, 'a dangling id is absent, not an error');
  });
});

describe('applyBulkEditToRecipes — the check tier axis', () => {
  it('clears the tier for a PRESENT null while an ABSENT key leaves it alone', async () => {
    // Both payloads come from the REAL producer over the panel's own two drafts — Default
    // DC staged, and the category axis alone — so this precondition asserts
    // `toBulkRecipeEdit`'s presence contract rather than restating two literals.
    const staged = toBulkRecipeEdit(
      setBulkRecipeCheckTier(createRecipeBulkDraft(), RECIPE_CHECK_TIER_DEFAULT)
    );
    const unstaged = toBulkRecipeEdit(setBulkRecipeCategory(createRecipeBulkDraft(), 'Potions'));
    // The discriminator is PRESENCE, never truthiness: both payloads read falsy here.
    assert.equal(Object.hasOwn(staged, 'checkTierId'), true);
    assert.equal(Object.hasOwn(unstaged, 'checkTierId'), false);
    assert.ok(!staged.checkTierId, 'staged reads falsy too');
    assert.ok(
      !unstaged.checkTierId,
      'unstaged reads falsy, so a truthiness guard cannot tell them apart'
    );

    const cleared = makeFixture({ recipes: [completeRecipe('r1', { checkTierId: TIER_EASY })] });
    await cleared.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], staged);
    assert.equal(recipeOf(cleared, 'r1').checkTierId, null, 'Default DC is a real instruction');

    const left = makeFixture({ recipes: [completeRecipe('r1', { checkTierId: TIER_EASY })] });
    await left.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], unstaged);
    assert.equal(recipeOf(left, 'r1').checkTierId, TIER_EASY, 'an unstaged axis is left alone');
  });

  it('sets a tier the system authors', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1', { checkTierId: TIER_EASY })] });

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { checkTierId: TIER_HARD });

    assert.equal(recipeOf(fixture, 'r1').checkTierId, TIER_HARD);
  });

  it('throws on a tier this system does not author, with ZERO saves on either manager', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    await assert.rejects(
      () =>
        fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
          checkTierId: 'tier-from-another-system',
          category: 'Potions',
          addBookIds: ['book-a'],
        }),
      /Check tier not authored/
    );

    assert.equal(fixture.recipeManager.saveCount, 0);
    assert.equal(fixture.manager.saveCount, 0);
    assert.equal(recipeOf(fixture, 'r1').category, 'general', 'the co-staged axes did not land');
    assert.deepEqual(definitionOf(fixture, 'book-a').recipeIds, []);
  });
});

describe('applyBulkEditToRecipes — which tiers a resolution mode offers', () => {
  // The manager resolves the active crafting-check SLOT with the SAME helper the manager
  // root's panel resolves it with (`resolveActiveCraftingCheckFormula`), so the offer and
  // the write cannot disagree. Each arm is pinned by behaviour rather than by reading a
  // private back — and the three alchemy rows are the ones that caught the drift: alchemy
  // rolls whichever slot its OWN `checkMode` names, not the simple slot a hand-rolled
  // manager-side mode map assumed for every alchemy system.
  const MODES = [
    { resolutionMode: 'simple', accepts: TIER_HARD, refuses: 'routed-tier' },
    { resolutionMode: 'routedByIngredients', accepts: TIER_HARD, refuses: 'routed-tier' },
    { resolutionMode: 'routedByCheck', accepts: 'routed-tier', refuses: TIER_HARD },
    { resolutionMode: 'progressive', accepts: null, refuses: TIER_HARD },
    {
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'simple' },
      accepts: TIER_HARD,
      refuses: 'routed-tier',
    },
    {
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'tiered' },
      accepts: 'routed-tier',
      refuses: TIER_HARD,
    },
    { resolutionMode: 'alchemy', alchemy: { checkMode: 'none' }, accepts: null, refuses: TIER_HARD },
  ];

  for (const mode of MODES) {
    const label = mode.alchemy
      ? `${mode.resolutionMode}/${mode.alchemy.checkMode}`
      : mode.resolutionMode;
    it(`${label} refuses "${mode.refuses}"`, async () => {
      const fixture = makeFixture({
        recipes: [completeRecipe('r1')],
        system: systemData({ resolutionMode: mode.resolutionMode, alchemy: mode.alchemy }),
      });

      await assert.rejects(
        () =>
          fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
            checkTierId: mode.refuses,
          }),
        /Check tier not authored/
      );

      // Default DC stays legal in every mode: clearing a tier is never mode-specific.
      const cleared = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
        checkTierId: null,
      });
      assert.equal(cleared.updated, 0, 'the fixture recipe already has no tier');

      if (mode.accepts) {
        await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
          checkTierId: mode.accepts,
        });
        assert.equal(recipeOf(fixture, 'r1').checkTierId, mode.accepts);
      }
    });
  }

  // THE PARITY GUARD the "kept structurally identical" comment always needed and never had.
  //
  // The manager root offers the bulk panel exactly
  // `resolveRecipeCheckTierOptions(craftingCheck, resolveActiveCraftingCheckFormula(system).slot)`
  // (`CraftingSystemManagerRoot.svelte`'s `recipeCheckTierOptions`). This asserts the WRITE
  // accepts every id that offer contains and nothing else, over the same mode matrix — so a
  // second hand-rolled slot derivation on either side fails here rather than at a GM's apply.
  it('accepts exactly the tier ids the panel would have offered, in every mode', async () => {
    for (const mode of MODES) {
      const system = systemData({
        resolutionMode: mode.resolutionMode,
        alchemy: mode.alchemy,
      });
      const offered = resolveRecipeCheckTierOptions(
        system.craftingCheck,
        resolveActiveCraftingCheckFormula(system).slot
      ).map((tier) => String(tier.id));
      const label = mode.alchemy
        ? `${mode.resolutionMode}/${mode.alchemy.checkMode}`
        : mode.resolutionMode;

      // Every AUTHORED tier on either slot, so the complement is a real refusal rather than
      // an id no system anywhere declares.
      const authored = [TIER_EASY, TIER_HARD, 'routed-tier'];
      for (const tierId of authored) {
        const fixture = makeFixture({ recipes: [completeRecipe('r1')], system });
        const apply = () =>
          fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { checkTierId: tierId });
        if (offered.includes(tierId)) {
          await apply();
          assert.equal(
            recipeOf(fixture, 'r1').checkTierId,
            tierId,
            `${label} must accept the offered tier ${tierId}`
          );
        } else {
          await assert.rejects(apply, /Check tier not authored/, `${label} must refuse ${tierId}`);
        }
      }
    }
  });
});

describe('applyBulkEditToRecipes — a refused enable', () => {
  it('leaves the recipe off, counts it, and still applies every UNGATED axis', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), shellRecipe('r-shell')],
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r-shell'], {
      enabled: true,
      category: 'Potions',
      locked: true,
    });

    assert.equal(recipeOf(fixture, 'r1').enabled, true, 'the enableable recipe is enabled');
    const shell = recipeOf(fixture, 'r-shell');
    assert.equal(shell.enabled, false, 'the refused recipe stays off');
    assert.equal(shell.category, 'Potions', 'but still receives the ungated category');
    assert.equal(shell.locked, true, 'and the ungated lock');

    assert.equal(result.blockedEnables, 1);
    assert.deepEqual(result.blockedRecipeIds, ['r-shell']);
    assert.deepEqual(result.recipeIds, ['r1', 'r-shell'], 'the retry counts as an update');
    assert.equal(fixture.recipeManager.saveCount, 1, 'the retry does not cost a second write');
  });

  it('counts a blocked recipe with NO ungated axis without counting it as updated', async () => {
    const fixture = makeFixture({ recipes: [shellRecipe('r-shell')] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r-shell'], {
      enabled: true,
    });

    assert.deepEqual(result.blockedRecipeIds, ['r-shell']);
    assert.deepEqual(result.recipeIds, [], 'nothing landed, so nothing is reported updated');
    assert.equal(fixture.recipeManager.saveCount, 0, 'and nothing is persisted');
  });
});

describe('applyBulkEditToRecipes — a recipe that cannot be persisted', () => {
  it('records it in rejected, logs it, and does NOT abort the batch', async () => {
    // The broken recipe sits in the MIDDLE of the cohort, so an uncaught throw would be
    // visible as the trailing recipes never being touched.
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), brokenRecipe('r-broken'), completeRecipe('r2')],
    });

    const result = await fixture.manager.applyBulkEditToRecipes(
      SYSTEM_ID,
      ['r1', 'r-broken', 'r2'],
      { category: 'Potions' }
    );

    assert.equal(result.rejected, 1);
    assert.deepEqual(result.rejectedRecipeIds, ['r-broken']);
    assert.deepEqual(result.recipeIds, ['r1', 'r2'], 'the batch continued past the rejection');
    assert.equal(recipeOf(fixture, 'r2').category, 'Potions', 'the recipe AFTER it still applied');
    assert.equal(
      recipeOf(fixture, 'r-broken').category,
      'general',
      'the rejected recipe is unchanged'
    );
    assert.equal(fixture.recipeManager.saveCount, 1);
    assert.ok(
      consoleWarnings.some((message) => message.includes('r-broken')),
      'the "see the console" clause in the post-apply notification points at a real log line'
    );
  });

  it('rejects a broken recipe even while its book membership is being changed', async () => {
    // The books save has already committed by the time the loop runs, so this is the exact
    // shape an uncaught persistence throw would corrupt.
    const fixture = makeFixture({ recipes: [brokenRecipe('r-broken'), completeRecipe('r1')] });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r-broken', 'r1'], {
      category: 'Potions',
      addBookIds: ['book-a'],
    });

    assert.deepEqual(result.rejectedRecipeIds, ['r-broken']);
    assert.deepEqual(
      definitionOf(fixture, 'book-a').recipeIds,
      ['r-broken', 'r1'],
      'membership is a book-side fact and is unaffected by the recipe rejection'
    );
    assert.equal(fixture.manager.saveCount, 1);
    assert.equal(fixture.recipeManager.saveCount, 1);
  });
});

describe('applyBulkEditToRecipes — the book axis', () => {
  it('writes each ADDed definition ONCE with the union, and leaves the others byte-identical', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2')],
      system: systemData({
        definitions: [
          bookDefinition('book-a', ['r2']),
          bookDefinition('book-b'),
          bookDefinition('book-c', ['r-other']),
        ],
      }),
    });
    const untouchedBefore = JSON.stringify(definitionOf(fixture, 'book-c'));
    const untouchedArray = definitionOf(fixture, 'book-c').recipeIds;
    const writes = watchMembershipWrites(fixture);

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
      addBookIds: ['book-a'],
    });

    assert.deepEqual(definitionOf(fixture, 'book-a').recipeIds, ['r2', 'r1'], 'a union, deduped');
    assert.equal(writes.get('book-a'), 1, 'the touched definition is written exactly once');
    assert.equal(writes.get('book-b'), 0, 'an untouched definition is not written at all');
    assert.equal(writes.get('book-c'), 0);
    assert.equal(
      JSON.stringify(definitionOf(fixture, 'book-c')),
      untouchedBefore,
      'byte-identical'
    );
    assert.ok(
      definitionOf(fixture, 'book-c').recipeIds === untouchedArray,
      'and not even re-created as an equal array'
    );
    assert.deepEqual(result.bookIds, ['book-a']);
  });

  it('writes the DIFFERENCE for a removal and leaves out-of-selection members in place', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2')],
      system: systemData({
        definitions: [bookDefinition('book-a', ['r1', 'r-other', 'r2']), bookDefinition('book-b')],
      }),
    });

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
      removeBookIds: ['book-a'],
    });

    assert.deepEqual(definitionOf(fixture, 'book-a').recipeIds, ['r-other']);
    assert.equal(fixture.manager.saveCount, 1);
  });

  it('applies one operation per definition across a mixed add/remove draft', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1')],
      system: systemData({
        definitions: [bookDefinition('book-a'), bookDefinition('book-b', ['r1'])],
      }),
    });
    const writes = watchMembershipWrites(fixture);

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
      addBookIds: ['book-a'],
      removeBookIds: ['book-b'],
    });

    assert.deepEqual(definitionOf(fixture, 'book-a').recipeIds, ['r1']);
    assert.deepEqual(definitionOf(fixture, 'book-b').recipeIds, []);
    assert.equal(writes.get('book-a'), 1);
    assert.equal(writes.get('book-b'), 1);
    assert.equal(result.booksUpdated, 2);
    assert.equal(fixture.manager.saveCount, 1, 'still one systems write for the whole draft');
  });

  it('saves nothing when the requested membership change resolves to no difference', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1')],
      system: systemData({ definitions: [bookDefinition('book-a', ['r1'])] }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
      addBookIds: ['book-a'],
    });

    assert.equal(result.booksUpdated, 0);
    assert.equal(fixture.manager.saveCount, 0);
    assert.equal(hookNames('fabricate.craftingSystemsChanged').length, 0);
  });
});

/**
 * `booksUpdated` counts DEFINITIONS whose membership array changed; the post-apply
 * notification reports MEMBERSHIP EDGES. Those are different numbers and neither derives
 * from the other: adding one book to twelve recipes is one definition and twelve edges,
 * and adding two books to one recipe is two definitions and two edges. The GM asked "put
 * these recipes in that book", so the edge count is the one that answers them.
 */
describe('applyBulkEditToRecipes — the membership EDGE counts', () => {
  it('counts one addition per recipe the book did not already hold, never per definition', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2'), completeRecipe('r3')],
      system: systemData({ definitions: [bookDefinition('book-a', ['r2'])] }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2', 'r3'], {
      addBookIds: ['book-a'],
    });

    assert.equal(result.booksUpdated, 1, 'one DEFINITION changed');
    assert.equal(result.bookAdditions, 2, 'but two EDGES were created — r2 was already a member');
    assert.equal(result.bookRemovals, 0);
  });

  it('counts one removal per recipe the book actually held, ignoring the rest', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2'), completeRecipe('r3')],
      system: systemData({ definitions: [bookDefinition('book-a', ['r1', 'r-other'])] }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2', 'r3'], {
      removeBookIds: ['book-a'],
    });

    assert.equal(result.bookRemovals, 1, 'only r1 was a member; r-other is out of the selection');
    assert.equal(result.bookAdditions, 0);
    assert.deepEqual(definitionOf(fixture, 'book-a').recipeIds, ['r-other']);
  });

  it('sums both edge counts across a mixed draft over several definitions', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2')],
      system: systemData({
        definitions: [
          bookDefinition('book-a'),
          bookDefinition('book-b'),
          bookDefinition('book-c', ['r1', 'r2']),
        ],
      }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
      addBookIds: ['book-a', 'book-b'],
      removeBookIds: ['book-c'],
    });

    assert.equal(result.bookAdditions, 4, 'two books x two recipes');
    assert.equal(result.bookRemovals, 2);
    assert.equal(result.booksUpdated, 3, 'and the definition count stays its own number');
  });

  it('reports zero edges for a no-op membership request', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1')],
      system: systemData({ definitions: [bookDefinition('book-a', ['r1'])] }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
      addBookIds: ['book-a'],
    });

    assert.equal(result.bookAdditions, 0);
    assert.equal(result.bookRemovals, 0);
  });

  // The legacy-basis seed is a BASIS CARRY-ACROSS, not a requested edit. Counting its
  // writes as additions would tell the GM they added members to books they never named —
  // on the one apply where the number is largest and least explicable.
  it('never counts the legacy-scalar seed as a requested addition', async () => {
    const fixture = makeFixture({
      recipes: [
        completeRecipe('r1', { recipeItemId: 'book-b' }),
        completeRecipe('r2', { linkedRecipeItemUuid: 'Item.book-c' }),
      ],
      system: systemData({ marker: false }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], {
      addBookIds: ['book-a'],
    });

    assert.deepEqual(definitionOf(fixture, 'book-b').recipeIds, ['r1'], 'the seed still ran');
    assert.deepEqual(definitionOf(fixture, 'book-c').recipeIds, ['r2']);
    assert.equal(result.bookAdditions, 1, 'and only the REQUESTED edge is reported');
  });

  it('never counts an edge for a recipe outside the selected system', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1')],
      system: systemData({ definitions: [bookDefinition('book-a')] }),
    });

    const result = await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r-foreign'], {
      addBookIds: ['book-a'],
    });

    assert.equal(result.bookAdditions, 1, 'a dangling id is absent from the cohort, not an edge');
  });
});

describe('applyBulkEditToRecipes — the membership-basis marker', () => {
  /**
   * A legacy-basis system: no marker, every `recipeIds` empty, membership carried by the
   * per-recipe scalars. This method mutates definitions directly and so BYPASSES the
   * `updateRecipeItemDefinition` choke point — it is the one path where the seed could still
   * be silently missing, and the failure it prevents is permanent: every OTHER definition's
   * scalar-only members stranded by one write, recoverable only by re-authoring each book.
   */
  function legacyFixture() {
    return makeFixture({
      recipes: [
        completeRecipe('r1', { recipeItemId: 'book-b' }),
        completeRecipe('r2', { linkedRecipeItemUuid: 'Item.book-c' }),
        completeRecipe('r3'),
      ],
      system: systemData({ marker: false }),
    });
  }

  it('seeds every definition from the legacy scalars and SETS the marker', async () => {
    const fixture = legacyFixture();
    assert.equal(
      fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds,
      false,
      'precondition: the fixture really is on the legacy basis'
    );

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { addBookIds: ['book-a'] });

    assert.equal(fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds, true);
    assert.deepEqual(definitionOf(fixture, 'book-a').recipeIds, ['r1'], 'the requested add landed');
    assert.deepEqual(
      definitionOf(fixture, 'book-b').recipeIds,
      ['r1'],
      'the scalar-resolved member was carried across, not orphaned'
    );
    assert.deepEqual(
      definitionOf(fixture, 'book-c').recipeIds,
      ['r2'],
      'including a member of a book the batch never named, resolved by the uuid leg'
    );
    assert.equal(fixture.manager.saveCount, 1, 'seed, change and marker land in ONE systems write');
  });

  it('does not re-seed on a later write', async () => {
    const fixture = legacyFixture();
    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { addBookIds: ['book-a'] });
    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { removeBookIds: ['book-b'] });

    assert.deepEqual(definitionOf(fixture, 'book-b').recipeIds, [], 'the removal is not undone');
    assert.equal(fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds, true);
  });

  it('leaves an unmarked system alone when the book axis is not staged', async () => {
    const fixture = legacyFixture();

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { category: 'Potions' });

    assert.equal(
      fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds,
      false,
      'a recipe-field edit is not a membership write and must not switch the basis'
    );
    assert.deepEqual(definitionOf(fixture, 'book-b').recipeIds, []);
    assert.equal(fixture.manager.saveCount, 0);
  });
});

describe('applyBulkEditToRecipes — a rejecting save', () => {
  it('leaves the recipes map untouched when the BOOKS save rejects', async () => {
    // Pinned to a draft touching BOTH axes with the books save failing, because that is the
    // only ordering this invariant can distinguish: under a recipes-only or books-only draft
    // it would hold whichever order the write used, and the case would prove nothing.
    const fixture = makeFixture({ recipes: [completeRecipe('r1'), completeRecipe('r2')] });
    fixture.manager.save = async () => {
      throw new Error('SETTINGS_MODIFY revoked');
    };

    await assert.rejects(
      () =>
        fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2'], {
          category: 'Potions',
          addBookIds: ['book-a'],
        }),
      /SETTINGS_MODIFY revoked/
    );

    assert.equal(recipeOf(fixture, 'r1').category, 'general', 'no recipe was mutated');
    assert.equal(recipeOf(fixture, 'r2').category, 'general');
    assert.equal(fixture.recipeManager.saveCount, 0, 'and the recipes setting was never written');
    assert.equal(hookCalls.length, 0, 'nothing was announced');
  });
});

describe('applyBulkEditToRecipes — change notification', () => {
  it('emits at most one of EACH Fabricate change hook for a both-axes apply', async () => {
    const fixture = makeFixture({
      recipes: [completeRecipe('r1'), completeRecipe('r2'), completeRecipe('r3')],
    });

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1', 'r2', 'r3'], {
      category: 'Potions',
      addBookIds: ['book-a'],
    });

    // Asserted by FABRICATE hook name: Foundry's own `updateSetting` is not suppressible and
    // fires per settings write, so a bare "one hook" count would be meaningless.
    assert.equal(hookNames('fabricate.recipesChanged').length, 1);
    assert.equal(hookNames('fabricate.craftingSystemsChanged').length, 1);
    assert.deepEqual(hookNames('fabricate.recipesChanged')[0].payload.recipeIds, [
      'r1',
      'r2',
      'r3',
    ]);
  });

  it('announces only the axis that changed', async () => {
    const fixture = makeFixture({ recipes: [completeRecipe('r1')] });

    await fixture.manager.applyBulkEditToRecipes(SYSTEM_ID, ['r1'], { addBookIds: ['book-a'] });

    assert.equal(hookNames('fabricate.craftingSystemsChanged').length, 1);
    assert.equal(
      hookNames('fabricate.recipesChanged').length,
      0,
      'no recipe changed, so the recipes hook would be a lie'
    );
  });
});

// Restore the reporter's own console once the module's tests are registered.
process.on('exit', () => {
  console.warn = realConsoleWarn;
});
