import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import { getSourceUuid } from '../utils/sourceUuid.js';

const LEARN_RECIPE_MESSAGES = {
  systemNotFound: 'FABRICATE.Knowledge.SystemNotFound',
  learningDisabled: 'FABRICATE.Knowledge.LearningDisabled',
  linkedItemRequired: 'FABRICATE.Knowledge.LinkedItemRequired',
  alreadyLearned: 'FABRICATE.Knowledge.AlreadyLearned',
  noMatchingItem: 'FABRICATE.Knowledge.NoMatchingItem',
  learnedRecipe: 'FABRICATE.Knowledge.LearnedRecipe'
};

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
    const sourceId = getSourceUuid(item);
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


  _getDiscoveryProgress(actor, recipeId) {
    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const entry = all?.[recipeId];
    if (!entry || typeof entry !== 'object') {
      return { progress: 0, fragments: [], discoveredAt: null, manuallySet: false };
    }
    return {
      progress: Number(entry.progress || 0),
      fragments: Array.isArray(entry.fragments) ? entry.fragments : [],
      discoveredAt: entry.discoveredAt || null,
      manuallySet: entry.manuallySet === true
    };
  }

  _computeEffectiveProgress(actor, recipeId, system) {
    const stored = this._getDiscoveryProgress(actor, recipeId);
    const fragments = system?.teaserConfig?.fragments || [];
    let fragmentProgress = 0;
    for (const frag of fragments) {
      if (!Array.isArray(frag.recipeIds) || !frag.recipeIds.includes(recipeId)) continue;
      if (stored.fragments.includes(frag.id)) {
        fragmentProgress += Number(frag.progressValue || 0);
      }
    }
    return Math.min(100, stored.progress + fragmentProgress);
  }

  _evaluateTeaserAccess({ recipe, viewer, craftingActor, system }) {
    // GM sees everything fully
    if (viewer?.isGM) {
      return { visible: true, craftable: true, reason: 'ok' };
    }

    // Recipe opts out of teaser mode — fully visible
    if (recipe?.teaser?.enabled === false) {
      return { visible: true, craftable: true, reason: 'ok' };
    }

    const progress = this._computeEffectiveProgress(craftingActor, recipe.id, system);
    const threshold = recipe?.teaser?.revealThreshold ?? 100;
    const hiddenFields = recipe?.teaser?.hiddenFields ?? ['ingredients', 'results', 'description'];
    const teaserDescription = recipe?.teaser?.teaserDescription ?? '';

    const stored = this._getDiscoveryProgress(craftingActor, recipe.id);
    const isDiscovered = stored.discoveredAt !== null || progress >= threshold;

    if (isDiscovered) {
      return {
        visible: true,
        craftable: true,
        reason: 'teaser-discovered'
      };
    }

    return {
      visible: true,
      craftable: false,
      reason: 'teaser',
      teaserState: {
        isTeaser: true,
        progress,
        hiddenFields,
        teaserDescription
      }
    };
  }

  async discoverFragment(actor, fragmentId, system) {
    const fragments = system?.teaserConfig?.fragments || [];
    const fragment = fragments.find(f => f.id === fragmentId);
    if (!fragment) return;

    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const updated = { ...all };

    for (const recipeId of (fragment.recipeIds || [])) {
      const entry = updated[recipeId] || { progress: 0, fragments: [], discoveredAt: null, manuallySet: false };

      // Idempotent — skip if already discovered this fragment
      if (entry.fragments.includes(fragmentId)) continue;

      const newFragments = [...entry.fragments, fragmentId];
      const newProgress = entry.progress; // manual progress unchanged

      // Compute total including all fragment contributions
      let totalFragmentProgress = 0;
      for (const frag of fragments) {
        if (!frag.recipeIds?.includes(recipeId)) continue;
        if (newFragments.includes(frag.id)) {
          totalFragmentProgress += Number(frag.progressValue || 0);
        }
      }
      const effectiveProgress = Math.min(100, newProgress + totalFragmentProgress);

      // Check if this discovery causes auto-transition
      let discoveredAt = entry.discoveredAt;
      if (!discoveredAt) {
        const recipe = this.recipeManager.getRecipe?.(recipeId);
        const threshold = recipe?.teaser?.revealThreshold ?? 100;
        if (effectiveProgress >= threshold) {
          discoveredAt = Date.now();
        }
      }

      updated[recipeId] = {
        ...entry,
        fragments: newFragments,
        discoveredAt
      };
    }

    await setFabricateFlag(actor, 'discoveryProgress', updated);
  }

  async setDiscoveryProgress(actor, recipeId, progress) {
    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const entry = all?.[recipeId] || { progress: 0, fragments: [], discoveredAt: null, manuallySet: false };
    const clampedProgress = Math.min(100, Math.max(0, Number(progress) || 0));

    const updated = {
      ...all,
      [recipeId]: {
        ...entry,
        progress: clampedProgress,
        manuallySet: true
      }
    };

    await setFabricateFlag(actor, 'discoveryProgress', updated);
  }

  getDiscoveryProgressForActor(actor, systemId) {
    return getFabricateFlag(actor, 'discoveryProgress', {}) || {};
  }

  evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) {
      return { visible: false, craftable: false, reason: 'missing-system' };
    }

    // Alchemy mode: recipes hidden from non-GM by default
    if (system?.resolutionMode === 'alchemy') {
      if (viewer?.isGM) {
        return { visible: true, craftable: true, reason: 'ok', knowledge: null };
      }
      const alchemyCfg = system?.alchemy || {};
      if (alchemyCfg.learnOnCraft !== true) {
        return { visible: false, craftable: false, reason: 'alchemy-hidden', knowledge: null };
      }
      const learnedMap = this._getLearnedMap(craftingActor);
      if (learnedMap?.[recipe.id]) {
        return { visible: true, craftable: true, reason: 'alchemy-learned', knowledge: null };
      }
      return { visible: false, craftable: false, reason: 'alchemy-not-learned', knowledge: null };
    }

    const listMode = system?.recipeVisibility?.listMode || 'global';
    let visible = false;
    let knowledge = null;

    // Teaser mode: handled separately
    if (listMode === 'teaser') {
      return this._evaluateTeaserAccess({ recipe, viewer, craftingActor, system });
    }

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
    if (!system) return { success: false, message: LEARN_RECIPE_MESSAGES.systemNotFound };

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['learned', 'itemOrLearned'].includes(mode)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learningDisabled };
    }
    if (!recipe?.linkedRecipeItemUuid) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    const access = this.evaluateKnowledgeAccess({ recipe, viewer, craftingActor, componentSourceActors });
    const selected = this._selectDeterministic(access.matchedItems || []);
    if (!selected) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
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

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name }
    };
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

  async learnRecipeOnCraft(recipe, craftingActor) {
    const system = this._getCraftingSystem(recipe);
    if (!system || system.resolutionMode !== 'alchemy') return;
    if (system.alchemy?.learnOnCraft !== true) return;
    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) return;
    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: null
      }
    };
    await this._setLearnedMap(craftingActor, next);
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
