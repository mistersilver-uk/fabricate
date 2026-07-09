import test from 'node:test';
import assert from 'node:assert/strict';

import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';

// Character-prerequisite learning gate (issue 544), integrated with the issue-511
// books/scrolls model: the gate lives on a recipe item's `caps.learn`
// (`characterPrerequisiteIds`) and is evaluated at every learn entry point next to
// the existing recipe `prerequisite`.

function getPathValue(obj, key) {
  return String(key)
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}
function setPathValue(obj, key, value) {
  const parts = String(key).split('.');
  const last = parts.pop();
  let cursor = obj;
  for (const part of parts) {
    if (typeof cursor[part] !== 'object' || cursor[part] === null) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[last] = value;
}

class FakeDoc {
  constructor(flagsArg = {}) {
    this._flags = { fabricate: flagsArg };
  }
  getFlag(scope, key) {
    if (!this._flags[scope]) return undefined;
    return getPathValue(this._flags[scope], key);
  }
  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
    return value;
  }
  async unsetFlag() {}
}

class FakeItem extends FakeDoc {
  constructor({ uuid = 'Actor.actor-1.Item.book', sourceId = 'Compendium.world.items.book' } = {}) {
    super();
    this.uuid = uuid;
    this.name = 'Book';
    this.flags = { core: { sourceId } };
    this.deleted = false;
  }
  async delete() {
    this.deleted = true;
  }
}

class FakeActor extends FakeDoc {
  constructor({ id = 'actor-1', items = [], rollData = {} } = {}) {
    super();
    this.id = id;
    this.name = 'Hero';
    this.items = items;
    this._rollData = rollData;
    for (const item of items) if (item && !item.parent) item.parent = this;
  }
  getRollData() {
    return this._rollData;
  }
}

const EXPERT = { id: 'p-expert', name: 'Expert Crafter', path: 'skills.cra.rank', op: 'gte', value: 2 };

function buildSystem({ characterPrerequisiteIds = ['p-expert'], capped = false, characterPrerequisites = [EXPERT] } = {}) {
  return {
    id: 'system-1',
    resolutionMode: capped ? 'simple' : 'alchemy',
    alchemy: { learnOnCraft: true },
    characterPrerequisites,
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: { mode: 'learned', learn: { dragDropEnabled: true } },
    },
    recipeItemDefinitions: [
      {
        id: 'book',
        sourceItemUuid: 'Compendium.world.items.book',
        recipeIds: ['recipe-1', 'recipe-2'],
        caps: {
          item: { limitUses: false },
          learn: {
            consumeOnLearn: false,
            limitLearning: capped,
            learnsAllowed: capped ? 3 : undefined,
            characterPrerequisiteIds,
          },
        },
      },
    ],
  };
}

function buildRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    name: 'Masterwork Blade',
    craftingSystemId: 'system-1',
    enabled: true,
    recipeItemId: 'book',
    visibility: { restricted: false, allowedUserIds: [] },
    ...overrides,
  };
}

function buildService(system, recipes) {
  return new RecipeVisibilityService(
    { getRecipes: () => recipes },
    { getSystem: (id) => (id === system.id ? system : null) }
  );
}

test('learnRecipe: ungated book is learnable', async () => {
  const system = buildSystem({ characterPrerequisiteIds: [] });
  const recipe = buildRecipe();
  const actor = new FakeActor({ items: [new FakeItem()], rollData: { skills: { cra: { rank: 0 } } } });
  const result = await buildService(system, [recipe]).learnRecipe({ recipe, craftingActor: actor });
  assert.equal(result.success, true);
});

test('learnRecipe: gate passes when the actor meets the character prerequisite', async () => {
  const system = buildSystem();
  const recipe = buildRecipe();
  const actor = new FakeActor({ items: [new FakeItem()], rollData: { skills: { cra: { rank: 3 } } } });
  const result = await buildService(system, [recipe]).learnRecipe({ recipe, craftingActor: actor });
  assert.equal(result.success, true);
});

test('learnRecipe: gate blocks a failing actor with a reason', async () => {
  const system = buildSystem();
  const recipe = buildRecipe();
  const actor = new FakeActor({ items: [new FakeItem()], rollData: { skills: { cra: { rank: 1 } } } });
  const result = await buildService(system, [recipe]).learnRecipe({ recipe, craftingActor: actor });
  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.CharacterPrerequisiteNotMet');
  assert.equal(result.messageData.reason, 'Expert Crafter');
});

test('learnRecipe: a dangling prerequisite id fails open (no definition ⇒ ungated)', async () => {
  const system = buildSystem({ characterPrerequisites: [] });
  const recipe = buildRecipe();
  const actor = new FakeActor({ items: [new FakeItem()], rollData: {} });
  const result = await buildService(system, [recipe]).learnRecipe({ recipe, craftingActor: actor });
  assert.equal(result.success, true);
});

test('learnRecipeFromOwnedBook: gate blocks a failing actor', async () => {
  const system = buildSystem();
  const recipe = buildRecipe();
  const actor = new FakeActor({ items: [new FakeItem()], rollData: { skills: { cra: { rank: 0 } } } });
  const result = await buildService(system, [recipe]).learnRecipeFromOwnedBook({
    recipe,
    craftingActor: actor,
  });
  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.CharacterPrerequisiteNotMet');
});

test('learnOneRecipeFromItem (capped): gate blocks a failing actor', async () => {
  const system = buildSystem({ capped: true });
  const recipe = buildRecipe();
  const item = new FakeItem();
  const actor = new FakeActor({ items: [item], rollData: { skills: { cra: { rank: 1 } } } });
  const result = await buildService(system, [recipe]).learnOneRecipeFromItem({
    recipe,
    ownedItem: item,
    actor,
  });
  assert.equal(result.success, false);
  assert.equal(result.message, 'FABRICATE.Knowledge.CharacterPrerequisiteNotMet');
});

test('previewOwnedItemLearning: a failing actor cannot bulk-learn the gated recipe', () => {
  const system = buildSystem();
  const recipes = [buildRecipe(), buildRecipe({ id: 'recipe-2', name: 'Second' })];
  const item = new FakeItem();
  const actor = new FakeActor({ items: [item], rollData: { skills: { cra: { rank: 1 } } } });
  const preview = buildService(system, recipes).previewOwnedItemLearning({
    ownedItem: item,
    actor,
    mode: 'auto',
  });
  assert.equal(preview.learnedRecipes.length, 0, 'no gated recipe is bulk-learnable');
});

test('previewOwnedItemLearning: a passing actor bulk-learns the book recipes', () => {
  const system = buildSystem();
  const recipes = [buildRecipe(), buildRecipe({ id: 'recipe-2', name: 'Second' })];
  const item = new FakeItem();
  const actor = new FakeActor({ items: [item], rollData: { skills: { cra: { rank: 2 } } } });
  const preview = buildService(system, recipes).previewOwnedItemLearning({
    ownedItem: item,
    actor,
    mode: 'auto',
  });
  assert.deepEqual(
    preview.learnedRecipes.map((r) => r.id).sort(),
    ['recipe-1', 'recipe-2']
  );
});

test('getLearnableRecipesFromItem: a blocked capped recipe is filtered from the picker', () => {
  const system = buildSystem({ capped: true });
  const recipes = [buildRecipe(), buildRecipe({ id: 'recipe-2', name: 'Second' })];
  const item = new FakeItem();
  const actor = new FakeActor({ items: [item], rollData: { skills: { cra: { rank: 1 } } } });
  const state = buildService(system, recipes).getLearnableRecipesFromItem({ ownedItem: item, actor });
  assert.deepEqual(state.recipes, [], 'no recipe offered when the gate fails');
});

test('learnRecipeOnCraft: a blocked actor does not auto-learn on craft', async () => {
  const system = buildSystem();
  const recipe = buildRecipe();
  const actor = new FakeActor({ items: [new FakeItem()], rollData: { skills: { cra: { rank: 1 } } } });
  await buildService(system, [recipe]).learnRecipeOnCraft(recipe, actor);
  assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
});
