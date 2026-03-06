import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

/**
 * Visibility, knowledge access, and learn-state service.
 */
export class RecipeVisibilityService {
  constructor(recipeManager, craftingSystemManager) {
    this.recipeManager = recipeManager;
    this.craftingSystemManager = craftingSystemManager;
  }

  _getCraftingSystem(recipe) {
    if (!recipe?.craftingSystemId) return null;
    return this.craftingSystemManager?.getSystem(recipe.craftingSystemId) || null;
  }

  _isRecipeVisibleByPlayerListMode(recipe, viewer) {
    if (viewer?.isGM) return true;
    const visibility = recipe?.visibility || {};
    if (visibility.restricted !== true) return true;
    return Array.isArray(visibility.allowedUserIds) && visibility.allowedUserIds.includes(viewer?.id);
  }

  _isMatchingRecipeItem(recipe, item) {
    const linked = recipe?.linkedRecipeItemUuid;
    if (!linked || !item) return false;
    const sourceId = foundry.utils.getProperty(item, 'flags.core.sourceId');
    return item.uuid === linked || sourceId === linked;
  }

  _getLearnedMap(actor) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', {});
    return learned && typeof learned === 'object' ? learned : {};
  }

  async _setLearnedMap(actor, learned) {
    await setFabricateFlag(actor, 'learnedRecipes', learned);
  }

  _getRecipeItemUsage(item) {
    const usage = getFabricateFlag(item, 'recipeItemUsage', {});
    return Number(usage?.timesUsed || 0);
  }

  async _setRecipeItemUsage(item, timesUsed) {
    await setFabricateFlag(item, 'recipeItemUsage', { timesUsed: Math.max(0, Math.floor(timesUsed)) });
  }

  _getKnowledgeConfig(system) {
    return system?.recipeVisibility?.knowledge || {
      mode: 'itemOrLearned',
      item: { limitUses: false },
      learn: { consumeOnLearn: true }
    };
  }

  _collectCandidateItems(recipe, craftingActor, componentSourceActors = []) {
    const actors = [];
    if (craftingActor) actors.push(craftingActor);
    for (const actor of componentSourceActors || []) {
      if (!actor) continue;
      if (actors.some(a => a.id === actor.id)) continue;
      actors.push(actor);
    }

    const matched = [];
    for (let actorIdx = 0; actorIdx < actors.length; actorIdx++) {
      const actor = actors[actorIdx];
      const items = Array.from(actor.items || []);
      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        if (!this._isMatchingRecipeItem(recipe, item)) continue;
        matched.push({
          actor,
          item,
          actorOrder: actorIdx,
          itemOrder: itemIdx,
          timesUsed: this._getRecipeItemUsage(item)
        });
      }
    }
    return matched;
  }

  _filterNonExhausted(matches, knowledgeItemCfg = {}) {
    if (!knowledgeItemCfg?.limitUses) return matches;
    const maxUses = Number(knowledgeItemCfg?.maxUses);
    if (!Number.isFinite(maxUses) || maxUses <= 0) return matches;
    return matches.filter(entry => Number(entry.timesUsed || 0) < maxUses);
  }

  _selectDeterministic(matches) {
    const sorted = [...matches].sort((a, b) => {
      const byUsage = Number(b.timesUsed || 0) - Number(a.timesUsed || 0);
      if (byUsage !== 0) return byUsage;
      const byActor = Number(a.actorOrder) - Number(b.actorOrder);
      if (byActor !== 0) return byActor;
      return Number(a.itemOrder) - Number(b.itemOrder);
    });
    return sorted[0] || null;
  }

  evaluateKnowledgeAccess({ recipe, viewer, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    const knowledge = this._getKnowledgeConfig(system);
    if (viewer?.isGM) {
      return {
        granted: true,
        reason: 'gm',
        hasLearned: true,
        hasMatchedItem: true,
        matchedItems: []
      };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    const hasLearned = !!learnedMap?.[recipe.id];
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const matchedItems = this._filterNonExhausted(allMatches, knowledge?.item || {});
    const hasMatchedItem = matchedItems.length > 0;

    const mode = knowledge?.mode || 'itemOrLearned';
    let granted = false;
    if (mode === 'item') granted = hasMatchedItem;
    if (mode === 'learned') granted = hasLearned;
    if (mode === 'itemOrLearned') granted = hasMatchedItem || hasLearned;

    return {
      granted,
      reason: granted ? 'ok' : 'knowledge',
      hasLearned,
      hasMatchedItem,
      matchedItems
    };
  }

  evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) {
      return { visible: false, craftable: false, reason: 'missing-system' };
    }

    const listMode = system?.recipeVisibility?.listMode || 'global';
    let visible = false;
    let knowledge = null;

    if (viewer?.isGM) {
      visible = true;
    } else if (listMode === 'knowledge') {
      knowledge = this.evaluateKnowledgeAccess({ recipe, viewer, craftingActor, componentSourceActors });
      visible = knowledge.granted;
    } else if (listMode === 'player') {
      visible = this._isRecipeVisibleByPlayerListMode(recipe, viewer);
    } else {
      // Global mode: all enabled recipes are visible to all players.
      visible = true;
    }

    if (!visible) {
      return {
        visible: false,
        craftable: false,
        reason: knowledge ? 'knowledge' : 'visibility',
        knowledge
      };
    }

    if (!viewer?.isGM && recipe.locked) {
      return { visible: true, craftable: false, reason: 'locked', knowledge };
    }

    if (!viewer?.isGM && listMode === 'knowledge') {
      knowledge = knowledge || this.evaluateKnowledgeAccess({ recipe, viewer, craftingActor, componentSourceActors });
      if (!knowledge.granted) {
        return { visible: true, craftable: false, reason: 'knowledge', knowledge };
      }
    }

    return { visible: true, craftable: true, reason: 'ok', knowledge };
  }

  getVisibleRecipes({ viewer, craftingSystemId, craftingActor, componentSourceActors = [] }) {
    const recipes = this.recipeManager.getRecipes({
      enabled: true,
      craftingSystemId
    });

    return recipes
      .map(recipe => ({
        recipe,
        access: this.evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors })
      }))
      .filter(entry => entry.access.visible);
  }

  guardCraftStart({ viewer, recipe, craftingActor, componentSourceActors = [] }) {
    return this.evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors });
  }

  async learnRecipe({ viewer, recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return { success: false, message: 'Crafting system not found' };

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['learned', 'itemOrLearned'].includes(mode)) {
      return { success: false, message: 'Learning is not enabled for this crafting system' };
    }
    if (!recipe?.linkedRecipeItemUuid) {
      return { success: false, message: 'Recipe item link is required to learn this recipe' };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: 'Recipe is already learned' };
    }

    const access = this.evaluateKnowledgeAccess({ recipe, viewer, craftingActor, componentSourceActors });
    const selected = this._selectDeterministic(access.matchedItems || []);
    if (!selected) {
      return { success: false, message: 'No matching recipe item available to learn' };
    }

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: selected.item.uuid
      }
    };
    await this._setLearnedMap(craftingActor, next);

    if (knowledge?.learn?.consumeOnLearn === true) {
      await selected.item.delete();
    }

    return { success: true, message: `Learned recipe: ${recipe.name}` };
  }

  async applyRecipeItemUseOnCraft({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return;
    const listMode = system?.recipeVisibility?.listMode || 'player';
    if (listMode !== 'knowledge') return;

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['item', 'itemOrLearned'].includes(mode)) return;
    if (!knowledge?.item?.limitUses) return;

    const matches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const nonExhausted = this._filterNonExhausted(matches, knowledge.item);
    const selected = this._selectDeterministic(nonExhausted);
    if (!selected) return;

    const nextUses = Number(selected.timesUsed || 0) + 1;
    await this._setRecipeItemUsage(selected.item, nextUses);

    const maxUses = Number(knowledge?.item?.maxUses);
    const exhausted = Number.isFinite(maxUses) && maxUses > 0 && nextUses >= maxUses;
    if (exhausted && knowledge?.item?.destroyWhenExhausted === true) {
      await selected.item.delete();
    }
  }

  async cleanupLearnedRecipes(validRecipeIds = new Set()) {
    for (const actor of game.actors || []) {
      const learned = this._getLearnedMap(actor);
      const next = {};
      let changed = false;
      for (const [recipeId, value] of Object.entries(learned || {})) {
        if (!validRecipeIds.has(recipeId)) {
          changed = true;
          continue;
        }
        next[recipeId] = value;
      }

      if (changed) {
        await this._setLearnedMap(actor, next);
      }
    }
  }
}
