/** `recipeMatching`'s five matchers driven directly through their seam bag. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ingredientMatchesItem,
  ingredientMatchesItemByFields,
  tagIngredientMatchesItem,
  toolMatchesItem,
  toolMatchesItemByIdentity,
} from '../../src/systems/recipeMatching.js';
import { component, roleItem, tool } from '../helpers/componentIdentityFixtures.js';

globalThis.foundry ??= {
  utils: {
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};

const SYSTEM_ID = 'sys-1';
const recipeOf = (craftingSystemId = SYSTEM_ID) => ({ id: 'r-1', craftingSystemId });

/** A seam bag over one system's definitions, with tags and essences both on. */
function makeDeps({
  components = [],
  tools = [],
  features = { enableTags: true, enableEssences: true },
} = {}) {
  const byId = new Map(components.map((entry) => [entry.id, entry]));
  return {
    component: (_recipe, componentId) => byId.get(componentId) ?? null,
    systemComponents: () => components,
    systemTools: () => tools,
    features: () => features,
  };
}

/** An item carrying `flags.fabricate.tags`, which no other fixture writes. */
function taggedItem({ uuid = 'Item.owned', name = 'Iron Ore', tags = [] } = {}) {
  return {
    uuid,
    name,
    _stats: {},
    flags: { fabricate: { tags } },
    getFlag: (scope, key) => (scope === 'fabricate' && key === 'fabricate.tags' ? tags : undefined),
  };
}

test('a component ingredient matches the item the resolver answers for it', () => {
  const iron = component('c-iron', { name: 'Iron Ore', originItemUuid: 'Item.iron' });
  const deps = makeDeps({ components: [iron] });
  const item = roleItem({ uuid: 'Item.iron', name: 'Iron Ore' });
  const ingredient = { quantity: 1, match: { type: 'component', componentId: 'c-iron' } };

  assert.equal(ingredientMatchesItem(recipeOf(), deps, ingredient, item, () => iron), true);
  assert.equal(
    ingredientMatchesItem(recipeOf(), deps, ingredient, item, () => null),
    true,
    'the case-insensitive name fallback carries a template copy with no source ref (issue 540)'
  );
});

test('a component ingredient naming no managed component never matches', () => {
  const deps = makeDeps({ components: [component('c-iron', { name: 'Iron Ore' })] });
  const item = roleItem({ uuid: 'Item.iron', name: 'Iron Ore' });
  const ingredient = { quantity: 1, match: { type: 'component', componentId: 'c-ghost' } };
  assert.equal(ingredientMatchesItem(recipeOf(), deps, ingredient, item, () => null), false);
});

test('a component ingredient matching by neither source ref nor name is refused', () => {
  const iron = component('c-iron', { name: 'Iron Ore', originItemUuid: 'Item.iron' });
  const deps = makeDeps({ components: [iron] });
  const other = roleItem({ uuid: 'Item.tin', name: 'Tin Ore' });
  const ingredient = { quantity: 1, match: { type: 'component', componentId: 'c-iron' } };
  assert.equal(ingredientMatchesItem(recipeOf(), deps, ingredient, other, () => null), false);
});

test('a tag ingredient reads the union of the component tags and the item flag', () => {
  const iron = component('c-iron', { name: 'Iron Ore' });
  iron.tags = ['metal'];
  const deps = makeDeps({ components: [iron] });
  const ingredient = { quantity: 1, match: { type: 'tags', tags: ['metal'] } };
  const flagged = taggedItem({ tags: ['ore'] });

  assert.equal(
    ingredientMatchesItem(recipeOf(), deps, ingredient, flagged, () => iron),
    true,
    'the resolved component supplies the tag the item never carries (issue 857)'
  );
  assert.equal(
    ingredientMatchesItem(
      recipeOf(),
      deps,
      { quantity: 1, match: { type: 'tags', tags: ['ore'] } },
      flagged,
      () => null
    ),
    true,
    'and the item flag still counts on its own'
  );
  assert.equal(
    ingredientMatchesItem(
      recipeOf(),
      deps,
      { quantity: 1, match: { type: 'tags', tags: ['gem'] } },
      flagged,
      () => iron
    ),
    false
  );
});

test('a tag ingredient never matches while the system has tags disabled', () => {
  const deps = makeDeps({ features: { enableTags: false, enableEssences: true } });
  const ingredient = { quantity: 1, match: { type: 'tags', tags: ['metal'] } };
  assert.equal(
    tagIngredientMatchesItem(
      recipeOf(),
      deps,
      ingredient,
      taggedItem({ tags: ['metal'] }),
      { enableTags: false },
      () => null
    ),
    false
  );
  assert.equal(ingredientMatchesItem(recipeOf(), deps, ingredient, taggedItem(), () => null), false);
});

test('an ingredient with no match object falls through to the bare-field path', () => {
  const deps = makeDeps();
  const item = taggedItem({ uuid: 'Item.herb', tags: ['herb'] });
  assert.equal(
    ingredientMatchesItem(recipeOf(), deps, { itemUuid: 'Item.herb' }, item, () => null),
    true
  );
  assert.equal(
    ingredientMatchesItem(recipeOf(), deps, { itemUuid: 'Item.other' }, item, () => null),
    false
  );
});

test('the bare-field path reads uuid, legacy tag and alternatives in that order', () => {
  const features = { enableTags: true, enableEssences: false };
  const item = taggedItem({ uuid: 'Item.herb', tags: ['herb'] });

  assert.equal(ingredientMatchesItemByFields({ itemUuid: 'Item.herb' }, item, features), true);
  assert.equal(ingredientMatchesItemByFields({ tag: 'herb' }, item, features), true);
  assert.equal(ingredientMatchesItemByFields({ tag: 'ore' }, item, features), false);
  assert.equal(
    ingredientMatchesItemByFields({ tag: 'herb' }, item, { enableTags: false }),
    false,
    'the legacy tag field is still gated on the feature'
  );
  assert.equal(
    ingredientMatchesItemByFields(
      { alternatives: [{ itemUuid: 'Item.other' }, { tag: 'herb' }] },
      item,
      features
    ),
    true,
    'alternatives recurse through the same path'
  );
  assert.equal(ingredientMatchesItemByFields({}, item, features), false);
});

test('a tool matches an item by source ref, then by its snapshot name', () => {
  const hammer = tool('t-hammer', { originItemUuid: 'Item.hammer', name: 'Hammer' });
  const deps = makeDeps({ tools: [hammer] });
  const owned = roleItem({ uuid: 'Item.hammer', name: 'Hammer' });
  const namesake = roleItem({ uuid: 'Item.other-hammer', name: 'Hammer' });

  assert.equal(toolMatchesItem(recipeOf(), deps, hammer, owned), true);
  assert.equal(
    toolMatchesItem(recipeOf(), deps, hammer, namesake),
    true,
    'presence accepts the name fallback'
  );
  assert.equal(
    toolMatchesItem(recipeOf(), deps, hammer, roleItem({ uuid: 'Item.saw', name: 'Saw' })),
    false
  );
  assert.equal(toolMatchesItem(recipeOf(), deps, null, owned), false);
});

test('a nameless tool falls back to its linked component name, or refuses', () => {
  const anvil = component('c-anvil', { name: 'Anvil' });
  const linked = tool('t-anvil', { componentId: 'c-anvil' });
  const nameless = tool('t-blank', {});
  const deps = makeDeps({ components: [anvil], tools: [linked, nameless] });

  assert.equal(
    toolMatchesItem(recipeOf(), deps, linked, roleItem({ uuid: 'Item.a', name: 'Anvil' })),
    true
  );
  assert.equal(
    toolMatchesItem(recipeOf(), deps, nameless, roleItem({ uuid: 'Item.a', name: 'Anvil' })),
    false,
    'no snapshot name and no linked component is no fallback at all'
  );
});

test('durable-identity tool selection refuses the namesake the presence gate accepts', () => {
  const hammer = tool('t-hammer', { originItemUuid: 'Item.hammer', name: 'Hammer' });
  const deps = makeDeps({ tools: [hammer] });

  assert.equal(
    toolMatchesItemByIdentity(
      recipeOf(),
      deps,
      hammer,
      roleItem({ uuid: 'Item.hammer', name: 'Hammer' })
    ),
    true
  );
  assert.equal(
    toolMatchesItemByIdentity(
      recipeOf(),
      deps,
      hammer,
      roleItem({ uuid: 'Item.other-hammer', name: 'Hammer' })
    ),
    false,
    'the narrow gate never reads the snapshot name (issue 561)'
  );
  assert.equal(toolMatchesItemByIdentity(recipeOf(), deps, { name: 'Hammer' }, {}), false);
});

test('every seam resolves against the recipe it is handed, not a captured one', () => {
  const definitions = {
    'sys-a': { components: [component('c-1', { name: 'Iron Ore' })], tools: [] },
    'sys-b': { components: [], tools: [] },
  };
  const deps = {
    component: (recipe, componentId) =>
      definitions[recipe?.craftingSystemId].components.find((c) => c.id === componentId) ?? null,
    systemComponents: (recipe) => definitions[recipe?.craftingSystemId].components,
    systemTools: (recipe) => definitions[recipe?.craftingSystemId].tools,
    features: () => ({ enableTags: true, enableEssences: true }),
  };
  const ingredient = { quantity: 1, match: { type: 'component', componentId: 'c-1' } };
  const item = roleItem({ uuid: 'Item.iron', name: 'Iron Ore' });

  assert.equal(ingredientMatchesItem(recipeOf('sys-a'), deps, ingredient, item, () => null), true);
  assert.equal(ingredientMatchesItem(recipeOf('sys-b'), deps, ingredient, item, () => null), false);
});
