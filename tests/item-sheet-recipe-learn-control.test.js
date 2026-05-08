import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value)
  }
};
globalThis.game = { user: { id: 'user-1', name: 'Player', isGM: false } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const {
  RECIPE_LEARN_HEADER_ACTION,
  buildConfirmContent,
  buildV1HeaderButton,
  buildV2HeaderControl,
  getManualPreview,
  registerItemSheetRecipeLearnControl
} = await import('../src/ui/ItemSheetRecipeLearnControl.js');

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
    this.deleted = false;
  }

  async delete() {
    this.deleted = true;
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
  name = 'Potion of Light',
  craftingSystemId = 'system-1',
  recipeItemId = 'book'
} = {}) {
  return {
    id,
    name,
    craftingSystemId,
    recipeItemId,
    linkedRecipeItemUuid: null,
    visibility: { restricted: false, allowedUserIds: [] },
    locked: false,
    enabled: true
  };
}

function buildSystem({
  id = 'system-1',
  dragDropEnabled = false,
  consumeOnLearn = false
} = {}) {
  return {
    id,
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'learned',
        item: { limitUses: false },
        learn: { consumeOnLearn, dragDropEnabled }
      }
    },
    recipeItemDefinitions: [{ id: 'book', sourceItemUuid: 'shared-source' }]
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
  systems = { 'system-1': buildSystem() },
  recipes = [buildRecipe()],
  actorCanUpdate = true
} = {}) {
  const item = new FakeItem();
  const actor = new FakeActor({ items: [item], canUpdate: actorCanUpdate });
  return {
    actor,
    item,
    service: buildService({ systems, recipes })
  };
}

function createMixedScopeScenario() {
  const systems = {
    'auto-system': buildSystem({ id: 'auto-system', dragDropEnabled: true }),
    'manual-system': buildSystem({ id: 'manual-system', dragDropEnabled: false })
  };
  const recipes = [
    buildRecipe({ id: 'auto-recipe', name: 'Auto Recipe', craftingSystemId: 'auto-system' }),
    buildRecipe({ id: 'manual-recipe', name: 'Manual Recipe', craftingSystemId: 'manual-system' })
  ];
  return createScenario({ systems, recipes });
}

function makeDeps(overrides = {}) {
  const infoMessages = [];
  const hookCalls = [];
  return {
    infoMessages,
    hookCalls,
    game: globalThis.game,
    Hooks: {
      on: (event, handler) => {
        hookCalls.push({ event, handler });
        return handler;
      }
    },
    notify: {
      info: (message) => infoMessages.push(message),
      warn: () => {}
    },
    localize: (key, data) => `${key}:${data?.actor || ''}:${data?.recipes || ''}`,
    confirmDialog: async () => true,
    ...overrides
  };
}

function makeFakeHeaderButton() {
  const listeners = new Map();
  return {
    addEventListener: (type, handler) => {
      listeners.set(type, handler);
    },
    async click() {
      listeners.get('click')?.({
        preventDefault() {},
        stopPropagation() {}
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
}

describe('ItemSheetRecipeLearnControl', () => {
  it('builds no preview for unowned items', () => {
    const { service } = createScenario();

    const preview = getManualPreview({ document: { uuid: 'Item.world' } }, service, globalThis.game);

    assert.equal(preview, null);
  });

  it('builds no preview without mutation permission', () => {
    const { item, service } = createScenario({ actorCanUpdate: false });

    const preview = getManualPreview({ document: item }, service, globalThis.game);

    assert.equal(preview, null);
  });

  it('hides manual header controls when drag-drop learning stays enabled', () => {
    const { item, service } = createScenario({
      systems: { 'system-1': buildSystem({ dragDropEnabled: true }) }
    });
    const deps = makeDeps();

    assert.equal(getManualPreview({ document: item }, service, globalThis.game), null);
    assert.equal(buildV1HeaderButton({ document: item }, service, deps), null);
    assert.equal(buildV2HeaderControl({ document: item }, service, deps), null);
  });

  it('shows manual header controls when drag-drop learning is disabled and the item can teach a recipe', () => {
    const { item, service } = createScenario();
    const deps = makeDeps();

    const preview = getManualPreview({ document: item }, service, globalThis.game);
    const v1 = buildV1HeaderButton({ document: item }, service, deps);
    const v2 = buildV2HeaderControl({ document: item }, service, deps);

    assert.deepEqual(preview.learnedRecipes.map(recipe => recipe.id), ['recipe-1']);
    assert.equal(v1.class, 'fabricate-learn-recipe');
    assert.equal(v1.icon, 'fas fa-book-open');
    assert.equal(v1.label, 'FABRICATE.Knowledge.ManualLearnAction::');
    assert.equal(v2.action, RECIPE_LEARN_HEADER_ACTION);
    assert.equal(v2.icon, 'fas fa-book-open');
    assert.equal(v2.label, 'FABRICATE.Knowledge.ManualLearnAction');
  });

  it('hides manual header controls when matching recipes are already learned', () => {
    const item = new FakeItem();
    const actor = new FakeActor({
      items: [item],
      flagsArg: {
        fabricate: {
          learnedRecipes: {
            'recipe-1': { learnedAt: 123, sourceItemUuid: item.uuid }
          }
        }
      }
    });
    const service = buildService({
      systems: { 'system-1': buildSystem() },
      recipes: [buildRecipe()]
    });
    const deps = makeDeps();

    assert.equal(actor.items[0], item);
    assert.equal(getManualPreview({ document: item }, service, globalThis.game), null);
    assert.equal(buildV1HeaderButton({ document: item }, service, deps), null);
    assert.equal(buildV2HeaderControl({ document: item }, service, deps), null);
  });

  it('confirmation content includes consume warning when learning will delete the item', () => {
    const { item, service } = createScenario({
      systems: { 'system-1': buildSystem({ consumeOnLearn: true }) }
    });
    const preview = getManualPreview({ document: item }, service, globalThis.game);

    const content = buildConfirmContent(preview, (key, data) => `${key} ${data.actor} ${data.recipes}`);

    assert.match(content, /ManualLearnConfirmBody/);
    assert.match(content, /ManualLearnConsumeWarning/);
    assert.match(content, /Alara/);
    assert.match(content, /Potion of Light/);
  });

  it('registers V1 and ApplicationV2 hooks and the V2 click handler only learns manual-scope recipes', async () => {
    const { actor, item, service } = createMixedScopeScenario();
    const deps = makeDeps();
    let rendered = 0;

    const registration = registerItemSheetRecipeLearnControl(service, deps);
    const sheet = {
      document: item,
      options: { actions: {} },
      render: () => {
        rendered += 1;
      }
    };

    assert.deepEqual(
      deps.hookCalls.map(call => call.event),
      ['getItemSheetHeaderButtons', 'getHeaderControlsApplicationV2', 'renderApplicationV2']
    );

    const buttons = [];
    registration.v1Handler(sheet, buttons);
    assert.equal(buttons[0].class, 'fabricate-learn-recipe');

    const controls = [{ action: 'close', icon: 'fas fa-times', label: 'Close' }];
    registration.v2HeaderHandler(sheet, controls);
    assert.ok(controls.some(control => control.action === RECIPE_LEARN_HEADER_ACTION));
    assert.equal(typeof sheet.options.actions[RECIPE_LEARN_HEADER_ACTION], 'function');

    await sheet.options.actions[RECIPE_LEARN_HEADER_ACTION]({
      preventDefault() {},
      stopPropagation() {}
    }, {});

    const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.deepEqual(Object.keys(learned), ['manual-recipe']);
    assert.equal(rendered, 1);
    assert.equal(deps.infoMessages.length, 1);
    assert.match(deps.infoMessages[0], /Manual Recipe/);
  });

  it('binds V2 fallback clicks against the ApplicationV2 frame, not only rendered inner HTML', async () => {
    const { actor, item, service } = createScenario();
    const deps = makeDeps();
    const registration = registerItemSheetRecipeLearnControl(service, deps);
    const headerButton = makeFakeHeaderButton();
    const sheet = {
      document: item,
      element: {
        querySelector: (selector) =>
          selector === `[data-action="${RECIPE_LEARN_HEADER_ACTION}"]` ? headerButton : null
      },
      render() {}
    };

    const bound = registration.v2RenderHandler(sheet, {
      querySelector: () => null
    });
    await headerButton.click();

    const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.equal(bound, true);
    assert.deepEqual(Object.keys(learned), ['recipe-1']);
  });

  it('confirmation cancel is a no-op', async () => {
    const { actor, item, service } = createScenario();
    const registration = registerItemSheetRecipeLearnControl(service, makeDeps({
      confirmDialog: async () => false
    }));

    const result = await registration.handleManualLearn({ document: item, render() {} });

    assert.equal(result, false);
    assert.equal(actor.getFlag('fabricate', 'fabricate.learnedRecipes'), undefined);
  });

  it('does not learn twice while a manual confirm dialog is in flight', async () => {
    const { actor, item, service } = createScenario();
    let resolveConfirm;
    const registration = registerItemSheetRecipeLearnControl(service, makeDeps({
      confirmDialog: async () => new Promise(resolve => {
        resolveConfirm = resolve;
      })
    }));
    const sheet = { document: item, render() {} };

    const first = registration.handleManualLearn(sheet);
    const second = registration.handleManualLearn(sheet);
    resolveConfirm(true);

    await first;
    assert.equal(await second, false);

    const learned = actor.getFlag('fabricate', 'fabricate.learnedRecipes');
    assert.deepEqual(Object.keys(learned), ['recipe-1']);
  });
});
