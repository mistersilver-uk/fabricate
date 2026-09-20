/**
 * One crafting system's runtime knowledge state across a roster of actors, as PLAIN data (issue
 * 785). Foundry-free by construction: the roster, the definitions and the caps reader all arrive
 * as collaborators, because resolving any of them needs `game` and this module is under an armed
 * `no-restricted-globals` root. Every derivation the surface shows — remaining/spent/inert, the
 * source-name ladder, the D8 hazard — belongs to `knowledgeStudio`, not here.
 */
import { getFabricateFlag } from '../config/flags.js';
import { matchRecipeItemDefinition } from '../utils/sourceUuid.js';

import { readStackQuantity } from './itemStackQuantity.js';

/**
 * Caps MUST resolve through the engine's reader, never raw `definition.caps` — `_getRecipeItemCaps`
 * folds every legacy derivation (`destroyWhenExhausted` → `whenSpent`, `limitRecipes`/`maxRecipes`
 * → `limitLearning`/`learnsAllowed`, `learningMode` → `learnScope`) that the projection's own
 * derivations assume. `_capsForDefinition` is the definition-only extraction of it.
 */
export function recipeItemCaps(service, definition) {
  if (typeof service?._capsForDefinition === 'function') {
    return service._capsForDefinition(definition);
  }
  if (typeof service?._getRecipeItemCaps === 'function') {
    return service._getRecipeItemCaps(null, definition);
  }
  return { item: {}, learn: {} };
}

function collectKnowledgeOwnedCopies(items, context) {
  const copies = [];
  for (const item of items) {
    const { definition, tier } = matchRecipeItemDefinition(
      item,
      context.definitions,
      context.systemId
    );
    if (!definition) continue;
    const definitionId = String(definition.id || '');
    const caps = context.capsById.get(definitionId) || { item: {}, learn: {} };
    const usage = getFabricateFlag(item, 'recipeItemUsage', {}) || {};
    copies.push({
      itemId: item.id,
      itemUuid: item.uuid || '',
      name: item.name || '',
      img: item.img || '',
      quantity: readStackQuantity(item),
      timesUsed: usage.timesUsed,
      inert: usage.inert === true,
      matchTier: tier,
      definitionId,
      definitionName: definition.name || '',
      recipeCount: context.recipeCountById.get(definitionId) || 0,
      limitUses: caps.item?.limitUses === true,
      maxUses: caps.item?.maxUses,
      learnScope: caps.learn?.learnScope || 'perInstance',
    });
  }
  return copies;
}

// `learnedRecipes` is system-AGNOSTIC while definitions are per-system, so an entry belonging to
// another system, or to a recipe that no longer resolves at all, becomes a roll-up rather than a
// row. The orphan roll-up is the only pointer to the all-systems reset grain, which is the only
// grain that can clear those keys (`forgetSystemLearnedRecipes` leaves them in place).
function collectKnowledgeLearnedEntries(actor, items, context) {
  const learnedMap = getFabricateFlag(actor, 'learnedRecipes', {}) || {};
  const ownedByUuid = new Map(items.map((item) => [item.uuid, item]));
  const learnedRecipes = [];
  let otherSystemCount = 0;
  let orphanCount = 0;

  for (const [recipeId, entry] of Object.entries(learnedMap)) {
    const recipe = context.recipeManager?.getRecipe?.(recipeId) || null;
    if (!recipe) {
      orphanCount += 1;
      continue;
    }
    if (String(recipe.craftingSystemId || '') !== context.systemId) {
      otherSystemCount += 1;
      continue;
    }
    const sourceItemUuid = entry?.sourceItemUuid || null;
    const ownedSource = sourceItemUuid ? ownedByUuid.get(sourceItemUuid) || null : null;
    const sourceDefinition = ownedSource
      ? matchRecipeItemDefinition(ownedSource, context.definitions, context.systemId).definition
      : null;
    const sourceCaps = sourceDefinition
      ? context.capsById.get(String(sourceDefinition.id || ''))
      : null;
    learnedRecipes.push({
      recipeId: String(recipeId),
      recipeName: recipe.name || '',
      recipeImg: recipe.img || '',
      recipeCategory: recipe.category || '',
      craftingSystemId: recipe.craftingSystemId || '',
      learnedAt: entry?.learnedAt || 0,
      sourceItemUuid,
      sourceOwned: !!ownedSource,
      sourceItemName: ownedSource?.name || '',
      // Rung 2 of the learned-source ladder: the MEMBER recipe-item definition name, which is what
      // survives deletion of the copy a recipe was learned from.
      sourceDefinitionName: context.definitionNameByRecipeId.get(String(recipeId)) || '',
      // Only a CAPPED book consumes learn budget, so only a capped book can release any on erase.
      sourceCapped: sourceCaps?.learn?.limitLearning === true,
      // The GM-grant pair (issue 1289), carried RAW and uncoerced. This literal is a hand-built
      // allowlist, so a field it does not name never reaches `learnedRecipeSource` at all. They are
      // deliberately not defaulted: the ladder tests `granted === true` and
      // `typeof grantedBy === 'string'` strictly, and a `String(...)`/`|| ''` here would coerce a
      // hostile value into a plausible-looking one before it got there.
      granted: entry?.granted,
      grantedBy: entry?.grantedBy,
    });
  }
  return { learnedRecipes, otherSystemCount, orphanCount };
}

function describeKnowledgeActor(actor, context) {
  // `Array.from`, never a spread: an `EmbeddedCollection` is iterable, but a non-iterable stand-in
  // answers `[]` here and throws under a spread. The identity projection keeps that spelling under
  // `unicorn/prefer-spread`, which reports only the single-argument call.
  const items = Array.from(actor.items || [], (item) => item);
  return {
    id: actor.id,
    name: actor.name,
    img: actor.img || '',
    ownedCopies: collectKnowledgeOwnedCopies(items, context),
    ...collectKnowledgeLearnedEntries(actor, items, context),
  };
}

/**
 * @param {object} input `actors` are LIVE documents (the projection reads `actor.items` and the
 *   actor's flags); `capsFor` is the definition-only caps reader, injected so a raw
 *   `definition.caps` read cannot creep back in.
 * @returns {{systemId: string, definitionCount: number, characters: object[]}}
 */
export function buildKnowledgeSnapshot({
  systemId,
  definitions = [],
  actors = [],
  recipeManager = null,
  capsFor,
} = {}) {
  const capsById = new Map();
  const recipeCountById = new Map();
  const definitionNameByRecipeId = new Map();
  for (const definition of definitions) {
    const id = String(definition?.id || '');
    const memberIds = Array.isArray(definition?.recipeIds) ? definition.recipeIds : [];
    capsById.set(id, capsFor(definition));
    recipeCountById.set(id, memberIds.length);
    for (const recipeId of memberIds) {
      const key = String(recipeId);
      if (!definitionNameByRecipeId.has(key)) {
        definitionNameByRecipeId.set(key, definition?.name || '');
      }
    }
  }

  const context = {
    systemId: String(systemId || ''),
    definitions,
    capsById,
    recipeCountById,
    definitionNameByRecipeId,
    recipeManager,
  };
  return {
    systemId: context.systemId,
    definitionCount: definitions.length,
    characters: actors.map((actor) => describeKnowledgeActor(actor, context)),
  };
}
