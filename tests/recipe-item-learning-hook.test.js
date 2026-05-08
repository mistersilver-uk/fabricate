import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.game = { user: { id: 'user-1', name: 'Player', isGM: false } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const {
  registerRecipeItemLearningHook,
  canMutateOwnedItem,
  notifyOwnedItemLearningResult
} = await import('../src/systems/RecipeItemLearningHook.js');

const ALARA_IMAGE = 'assets/img/Alara the Alchemist.webp';

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, part) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[part];
  }, object);
}

function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target = target[part];
  }
  target[last] = value;
}

class FakeDocument {
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
}

class FakeItem extends FakeDocument {
  constructor({
    uuid = 'Actor.actor-1.Item.formula',
    name = 'Formula',
    sourceId = 'shared-source',
    flagsArg = {}
  } = {}) {
    super(flagsArg);
    this.uuid = uuid;
    this.name = name;
    this.flags = sourceId ? { core: { sourceId } } : {};
  }
}

class FakeActor extends FakeDocument {
  constructor({ id = 'actor-1', name = 'Alara', img = ALARA_IMAGE, items = [], flagsArg = {}, canUpdate = true } = {}) {
    super(flagsArg);
    this.id = id;
    this.name = name;
    this.img = img;
    this.items = items;
    this.canUserModify = () => canUpdate;

    for (const item of items) {
      if (!item.parent) item.parent = this;
      item.canUserModify = () => canUpdate;
    }
  }
}

function buildRecipe({
  id = 'recipe-1',
  name = 'Potion',
  craftingSystemId = 'system-1',
  recipeItemId = 'book',
  linkedRecipeItemUuid = null
} = {}) {
  return {
    id,
    name,
    craftingSystemId,
    recipeItemId,
    linkedRecipeItemUuid,
    visibility: { restricted: false, allowedUserIds: [] },
    locked: false,
    enabled: true
  };
}

function buildSystem({
  id = 'system-1',
  dragDropEnabled = true,
  sourceItemUuid = 'shared-source',
  listMode = 'knowledge',
  knowledgeMode = 'learned'
} = {}) {
  return {
    id,
    recipeVisibility: {
      listMode,
      knowledge: {
        mode: knowledgeMode,
        item: { limitUses: false },
        learn: { consumeOnLearn: false, dragDropEnabled }
      }
    },
    recipeItemDefinitions: [{ id: 'book', sourceItemUuid }]
  };
}

function buildService({ systems, recipes }) {
  const recipeManager = {
    getRecipes: () => recipes
  };
  const craftingSystemManager = {
    getSystem: (id) => systems[id] || null,
    getRecipeItemDefinition: (systemId, definitionId) =>
      (systems[systemId]?.recipeItemDefinitions || []).find(definition => definition.id === definitionId) || null
  };
  return new RecipeVisibilityService(recipeManager, craftingSystemManager);
}

function createScenario({
  item = new FakeItem(),
  recipes = [buildRecipe()],
  systems = { 'system-1': buildSystem() },
  actorCanUpdate = true
} = {}) {
  const actor = new FakeActor({ items: [item], canUpdate: actorCanUpdate });
  return {
    actor,
    item,
    service: buildService({ systems, recipes })
  };
}

function makeResult(overrides = {}) {
  return {
    shouldNotify: true,
    notificationKind: 'success',
    message: 'FABRICATE.Knowledge.LearnedRecipes',
    actor: { name: 'Alara', img: ALARA_IMAGE },
    ownedItem: { name: 'Formula' },
    learnedRecipes: [{ name: 'Potion' }],
    matchedRecipes: [{ name: 'Potion' }],
    messageData: {},
    ...overrides
  };
}

describe('RecipeItemLearningHook', () => {
  let infoMessages;
  let warnMessages;
  let hookRegistrations;

  beforeEach(() => {
    infoMessages = [];
    warnMessages = [];
    hookRegistrations = [];
  });

  function deps(overrides = {}) {
    return {
      game: globalThis.game,
      Hooks: {
        on: (event, handler) => {
          hookRegistrations.push({ event, handler });
          return handler;
        }
      },
      notify: {
        info: (message) => infoMessages.push(message),
        warn: (message) => warnMessages.push(message)
      },
      localize: (key, data) => `${key}:${data.actor}:${data.recipes || data.matchedRecipes}`,
      ...overrides
    };
  }

  it('registers createItem and auto-learns matched owned item creation for the triggering user', async () => {
    const { actor, item, service } = createScenario();

    registerRecipeItemLearningHook(service, deps());
    const createItemHook = hookRegistrations.find(entry => entry.event === 'createItem');
    await createItemHook.handler(item, {}, 'user-1');

    assert.deepEqual(hookRegistrations.map(entry => entry.event), ['createItem']);
    const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.equal(learned['recipe-1'].sourceItemUuid, item.uuid);
    assert.equal(infoMessages.length, 1);
    assert.equal(warnMessages.length, 0);
  });

  it('learns when the created owned item UUID directly matches the recipe definition', async () => {
    const item = new FakeItem({ uuid: 'Actor.actor-1.Item.exact', sourceId: null });
    const { actor, service } = createScenario({
      item,
      systems: {
        'system-1': buildSystem({ sourceItemUuid: 'Actor.actor-1.Item.exact' })
      }
    });

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.equal(learned['recipe-1'].sourceItemUuid, item.uuid);
    assert.equal(infoMessages.length, 1);
  });

  it('silently ignores items created by a different user', async () => {
    const calls = [];
    const service = { learnRecipesFromOwnedItem: async () => calls.push(true) };

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(new FakeItem(), {}, 'user-2');

    assert.equal(calls.length, 0);
    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('silently ignores items without an actor parent', async () => {
    const calls = [];
    const service = { learnRecipesFromOwnedItem: async () => calls.push(true) };

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler({ uuid: 'Item.world' }, {}, 'user-1');

    assert.equal(calls.length, 0);
    assert.equal(infoMessages.length, 0);
  });

  it('silently ignores items without mutation permission', async () => {
    const { item } = createScenario({ actorCanUpdate: false });
    const calls = [];
    const service = { learnRecipesFromOwnedItem: async () => calls.push(true) };

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    assert.equal(calls.length, 0);
    assert.equal(infoMessages.length, 0);
  });

  it('remains silent when no recipe matches the created owned item', async () => {
    const { actor, item, service } = createScenario({
      systems: {
        'system-1': buildSystem({ sourceItemUuid: 'different-source' })
      }
    });

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('does not notify when the service returns an explicit silent outcome', async () => {
    const actor = new FakeActor();
    const item = new FakeItem();
    item.parent = actor;
    item.canUserModify = actor.canUserModify;
    const service = {
      learnRecipesFromOwnedItem: async () => makeResult({
        shouldNotify: false,
        notificationKind: 'silent',
        message: null,
        learnedRecipes: [],
        matchedRecipes: []
      })
    };

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('remains silent when drag-drop learning is disabled by recipe visibility settings', async () => {
    const { actor, item, service } = createScenario({
      systems: {
        'system-1': buildSystem({ dragDropEnabled: false })
      }
    });

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('auto-learns only the auto-enabled scope when one item matches mixed systems', async () => {
    const recipes = [
      buildRecipe({ id: 'auto-recipe', name: 'Auto Recipe', craftingSystemId: 'auto-system' }),
      buildRecipe({ id: 'manual-recipe', name: 'Manual Recipe', craftingSystemId: 'manual-system' })
    ];
    const { actor, item, service } = createScenario({
      recipes,
      systems: {
        'auto-system': buildSystem({ id: 'auto-system', dragDropEnabled: true }),
        'manual-system': buildSystem({ id: 'manual-system', dragDropEnabled: false })
      }
    });

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.deepEqual(Object.keys(learned), ['auto-recipe']);
    assert.equal(infoMessages.length, 1);
    assert.match(infoMessages[0], /Auto Recipe/);
  });

  it('remains silent for non-knowledge recipe visibility systems', async () => {
    const { actor, item, service } = createScenario({
      systems: {
        'system-1': buildSystem({ listMode: 'global' })
      }
    });

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('remains silent when knowledge mode is item-only', async () => {
    const { actor, item, service } = createScenario({
      systems: {
        'system-1': buildSystem({ knowledgeMode: 'item' })
      }
    });

    registerRecipeItemLearningHook(service, deps());
    await hookRegistrations[0].handler(item, {}, 'user-1');

    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 0);
  });

  it('warns for already-known outcomes and reports one notification max', () => {
    const notified = notifyOwnedItemLearningResult(makeResult({
      notificationKind: 'alreadyKnown',
      message: 'FABRICATE.Knowledge.NoNewRecipesLearned',
      learnedRecipes: [],
      matchedRecipes: [{ name: 'Potion' }]
    }), deps());

    assert.equal(notified, true);
    assert.equal(infoMessages.length, 0);
    assert.equal(warnMessages.length, 1);
  });

  it('uses document mutation APIs before ownership fallbacks', () => {
    const actor = new FakeActor({ canUpdate: false });
    const item = {
      parent: actor,
      isOwner: true,
      canUserModify: () => false
    };

    assert.equal(canMutateOwnedItem(item, actor, globalThis.game.user), false);
  });
});
