import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import { getItemSourceReferences } from '../utils/sourceUuid.js';

const LEARN_RECIPE_MESSAGES = {
  systemNotFound: 'FABRICATE.Knowledge.SystemNotFound',
  learningDisabled: 'FABRICATE.Knowledge.LearningDisabled',
  linkedItemRequired: 'FABRICATE.Knowledge.LinkedItemRequired',
  alreadyLearned: 'FABRICATE.Knowledge.AlreadyLearned',
  noMatchingItem: 'FABRICATE.Knowledge.NoMatchingItem',
  learnBudgetSpent: 'FABRICATE.Knowledge.LearnBudgetSpent',
  learnedRecipe: 'FABRICATE.Knowledge.LearnedRecipe',
  learnedRecipes: 'FABRICATE.Knowledge.LearnedRecipes',
  learnedRecipesPartial: 'FABRICATE.Knowledge.LearnedRecipesPartial',
  noNewRecipesLearned: 'FABRICATE.Knowledge.NoNewRecipesLearned',
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
    return (
      Array.isArray(visibility.allowedUserIds) && visibility.allowedUserIds.includes(viewer?.id)
    );
  }

  _getRecipeItemDefinition(recipe) {
    const system = this._getCraftingSystem(recipe);
    if (!system || !recipe?.recipeItemId) return null;
    return (
      this.craftingSystemManager?.getRecipeItemDefinition?.(system.id, recipe.recipeItemId) ||
      (system.recipeItemDefinitions || []).find((def) => def.id === recipe.recipeItemId) ||
      null
    );
  }

  _getRecipeItemSourceUuid(recipe) {
    return (
      this._getRecipeItemDefinition(recipe)?.sourceItemUuid || recipe?.linkedRecipeItemUuid || null
    );
  }

  _hasRecipeItemReference(recipe) {
    return Boolean(recipe?.recipeItemId || recipe?.linkedRecipeItemUuid);
  }

  _isMatchingRecipeItem(recipe, item) {
    const linked = this._getRecipeItemSourceUuid(recipe);
    if (!linked || !item) return false;
    // Match against the item's full source-reference set — live uuid, compendium
    // source AND `_stats.duplicateSource` — so a book duplicated (dragged) from a
    // world template still resolves. Source-uuid-only matching loses the link for
    // world-duplicated copies (the same trap components avoid).
    return getItemSourceReferences(item).includes(linked);
  }

  _isActorOwnedItem(ownedItem, actor) {
    if (!ownedItem || !actor) return false;
    return (
      ownedItem.parent === actor ||
      ownedItem.actor === actor ||
      actor.items?.has?.(ownedItem.id) ||
      (Array.isArray(actor.items) && actor.items.includes(ownedItem))
    );
  }

  _getLearnedMap(actor) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', {});
    return learned && typeof learned === 'object' ? learned : {};
  }

  async _setLearnedMap(actor, learned) {
    return await setFabricateFlag(actor, 'learnedRecipes', learned);
  }

  _getRecipeItemUsage(item) {
    const usage = getFabricateFlag(item, 'recipeItemUsage', {});
    return Number(usage?.timesUsed || 0);
  }

  async _setRecipeItemUsage(item, timesUsed) {
    await setFabricateFlag(item, 'recipeItemUsage', {
      timesUsed: Math.max(0, Math.floor(timesUsed)),
    });
  }

  // Per item-DOCUMENT-instance learn count for the recipe-item learn cap (issue
  // 511). Mirrors `recipeItemUsage.timesUsed` (`_getRecipeItemUsage` /
  // `_setRecipeItemUsage`): the count lives on the physical item document, so a
  // stacked qty>1 document shares one count, the budget accumulates across every
  // actor that holds the document, and it is not reset on transfer/ownership
  // change (the flag travels with the item data).
  _getRecipeItemLearnCount(item) {
    const learning = getFabricateFlag(item, 'recipeItemLearning', {});
    return Number(learning?.learnedCount || 0);
  }

  async _setRecipeItemLearnCount(item, learnedCount) {
    await setFabricateFlag(item, 'recipeItemLearning', {
      learnedCount: Math.max(0, Math.floor(learnedCount)),
    });
  }

  _getKnowledgeConfig(system) {
    return (
      system?.recipeVisibility?.knowledge || {
        mode: 'itemOrLearned',
        learn: { dragDropEnabled: true },
      }
    );
  }

  // Per-recipe-item use/learn caps (issue 511). Caps live on the recipe's linked
  // recipe item definition (`definition.caps`) rather than one system-wide config,
  // so two books in the same system can differ. Resolves via the recipe's
  // `recipeItemId`; a recipe with no resolvable definition FAILS CLOSED to uncapped
  // (the same permissive default `_getKnowledgeConfig` fell back to, and consistent
  // with the invalid-cap → unlimited convention). `mode` and `dragDropEnabled` stay
  // system-wide and are read from `_getKnowledgeConfig`, never from here.
  _getRecipeItemCaps(recipe) {
    const caps = this._getRecipeItemDefinition(recipe)?.caps;
    return {
      item: {
        limitUses: caps?.item?.limitUses === true,
        maxUses: caps?.item?.maxUses,
        destroyWhenExhausted: caps?.item?.destroyWhenExhausted === true,
      },
      learn: {
        consumeOnLearn: caps?.learn?.consumeOnLearn !== false,
        limitRecipes: caps?.learn?.limitRecipes === true,
        maxRecipes: caps?.learn?.maxRecipes,
        destroyWhenSpent: caps?.learn?.destroyWhenSpent === true,
      },
    };
  }

  _collectCandidateItems(recipe, craftingActor, componentSourceActors = []) {
    const actors = [];
    if (craftingActor) actors.push(craftingActor);
    for (const actor of componentSourceActors || []) {
      if (!actor) continue;
      if (actors.some((a) => a.id === actor.id)) continue;
      actors.push(actor);
    }

    const matched = [];
    for (const [actorIdx, actor] of actors.entries()) {
      const items = [...(actor.items || [])];
      for (const [itemIdx, item] of items.entries()) {
        if (!this._isMatchingRecipeItem(recipe, item)) continue;
        matched.push({
          actor,
          item,
          actorOrder: actorIdx,
          itemOrder: itemIdx,
          timesUsed: this._getRecipeItemUsage(item),
        });
      }
    }
    return matched;
  }

  _filterNonExhausted(matches, knowledgeItemCfg = {}) {
    if (!knowledgeItemCfg?.limitUses) return matches;
    const maxUses = Number(knowledgeItemCfg?.maxUses);
    if (!Number.isFinite(maxUses) || maxUses <= 0) return matches;
    return matches.filter((entry) => Number(entry.timesUsed || 0) < maxUses);
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

  /**
   * Evaluate whether a viewer has knowledge access to a recipe.
   *
   * GM bypass: a GM is always granted access (`reason: 'gm'`). The returned
   * `hasLearned: true` / `hasMatchedItem: true` flags signal "access is always
   * granted for a GM" — they do NOT represent the GM actor's actual learned
   * state or item ownership, and `matchedItems` is intentionally left empty
   * because no real items are collected on this path. Callers that need the
   * actual set of owned, matching recipe items (e.g. `learnRecipe` selecting an
   * item to consume, or `applyRecipeItemUseOnCraft` deciding whether to track a
   * use) must NOT read `matchedItems` from this result for a GM; they must
   * collect candidate items directly via `_collectCandidateItems` /
   * `_filterNonExhausted` so they react to what the actor really owns.
   */
  evaluateKnowledgeAccess({ recipe, viewer, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    const knowledge = this._getKnowledgeConfig(system);
    if (viewer?.isGM) {
      return {
        granted: true,
        reason: 'gm',
        hasLearned: true,
        hasMatchedItem: true,
        matchedItems: [],
      };
    }

    const caps = this._getRecipeItemCaps(recipe);
    const learnedMap = this._getLearnedMap(craftingActor);
    const hasLearned = !!learnedMap?.[recipe.id];
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const matchedItems = this._filterNonExhausted(allMatches, caps.item);
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
      matchedItems,
    };
  }

  /**
   * Whether a recipe's item-based knowledge is exhausted for a viewer: the
   * system uses item-limited knowledge (`knowledge.item.limitUses`), the actor
   * (or a component-source actor) DOES own at least one matching recipe item, but
   * every such item has reached its `maxUses` cap. Returns `false` when the
   * system does not limit uses, when no matching item is owned at all (that is an
   * "unknown"/teaser state, not "exhausted"), or when at least one non-exhausted
   * item remains. Read-only; composes the same candidate-collection +
   * non-exhausted filter the learn/use paths rely on, so the player listing's
   * "exhausted" status agrees with what the engine would refuse to consume.
   *
   * @param {object} args
   * @param {object} args.recipe
   * @param {object|null} args.craftingActor
   * @param {object[]} [args.componentSourceActors]
   * @returns {boolean}
   */
  isKnowledgeItemExhausted({ recipe, craftingActor, componentSourceActors = [] }) {
    const caps = this._getRecipeItemCaps(recipe);
    if (!caps.item.limitUses) return false;
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    if (allMatches.length === 0) return false;
    const nonExhausted = this._filterNonExhausted(allMatches, caps.item);
    return nonExhausted.length === 0;
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
      manuallySet: entry.manuallySet === true,
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
        reason: 'teaser-discovered',
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
        teaserDescription,
      },
    };
  }

  async discoverFragment(actor, fragmentId, system) {
    const fragments = system?.teaserConfig?.fragments || [];
    const fragment = fragments.find((f) => f.id === fragmentId);
    if (!fragment) return;

    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const updated = { ...all };

    for (const recipeId of fragment.recipeIds || []) {
      const entry = updated[recipeId] || {
        progress: 0,
        fragments: [],
        discoveredAt: null,
        manuallySet: false,
      };

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
        discoveredAt,
      };
    }

    await setFabricateFlag(actor, 'discoveryProgress', updated);
  }

  async setDiscoveryProgress(actor, recipeId, progress) {
    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const entry = all?.[recipeId] || {
      progress: 0,
      fragments: [],
      discoveredAt: null,
      manuallySet: false,
    };
    const clampedProgress = Math.min(100, Math.max(0, Number(progress) || 0));

    const updated = {
      ...all,
      [recipeId]: {
        ...entry,
        progress: clampedProgress,
        manuallySet: true,
      },
    };

    await setFabricateFlag(actor, 'discoveryProgress', updated);
  }

  getDiscoveryProgressForActor(actor, _systemId) {
    return getFabricateFlag(actor, 'discoveryProgress', {}) || {};
  }

  evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) {
      return { visible: false, craftable: false, reason: 'missing-system' };
    }

    // Alchemy mode: recipes hidden from non-GM by default, but formula items
    // can make unlearned recipes visible (with a Learn button) when the system
    // also uses knowledge visibility with a linked recipe item.
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
      // Check if the player has a formula item that could teach this recipe
      if (this._hasRecipeItemReference(recipe)) {
        const knowledge = this.evaluateKnowledgeAccess({
          recipe,
          viewer,
          craftingActor,
          componentSourceActors,
        });
        if (knowledge.hasMatchedItem) {
          return { visible: true, craftable: false, reason: 'knowledge', knowledge };
        }
      }
      return { visible: false, craftable: false, reason: 'alchemy-not-learned', knowledge: null };
    }

    const listMode = system?.recipeVisibility?.listMode || 'global';
    let visible;
    let knowledge = null;

    // Teaser mode: handled separately
    if (listMode === 'teaser') {
      return this._evaluateTeaserAccess({ recipe, viewer, craftingActor, system });
    }

    if (viewer?.isGM) {
      visible = true;
    } else if (listMode === 'knowledge') {
      knowledge = this.evaluateKnowledgeAccess({
        recipe,
        viewer,
        craftingActor,
        componentSourceActors,
      });
      visible = knowledge.granted || knowledge.hasMatchedItem;
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
        knowledge,
      };
    }

    if (!viewer?.isGM && recipe.locked) {
      return { visible: true, craftable: false, reason: 'locked', knowledge };
    }

    if (knowledge && !knowledge.granted) {
      return { visible: true, craftable: false, reason: 'knowledge', knowledge };
    }

    return { visible: true, craftable: true, reason: 'ok', knowledge };
  }

  getVisibleRecipes({ viewer, craftingSystemId, craftingActor, componentSourceActors = [] }) {
    const recipes = this.recipeManager.getRecipes({
      enabled: true,
      craftingSystemId,
    });

    return recipes
      .map((recipe) => ({
        recipe,
        access: this.evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors }),
      }))
      .filter((entry) => entry.access.visible);
  }

  guardCraftStart({ viewer, recipe, craftingActor, componentSourceActors = [] }) {
    return this.evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors });
  }

  async learnRecipe({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return { success: false, message: LEARN_RECIPE_MESSAGES.systemNotFound };

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['learned', 'itemOrLearned'].includes(mode)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learningDisabled };
    }
    if (!this._hasRecipeItemReference(recipe)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    // Learning consumes/anchors a real owned recipe item, so we must evaluate
    // the actor's actual inventory directly rather than trusting
    // `evaluateKnowledgeAccess().matchedItems` — that array is empty on the GM
    // bypass path, which would make a GM who genuinely owns a matching item fail
    // with `noMatchingItem`. Collecting candidates here means a GM (or player)
    // who owns a match can learn, while one who owns none still cannot.
    const caps = this._getRecipeItemCaps(recipe);
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const matchedItems = this._filterNonExhausted(allMatches, caps.item);
    const selected = this._selectDeterministic(matchedItems);
    if (!selected) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: selected.item.uuid,
      },
    };
    await this._setLearnedMap(craftingActor, next);

    if (caps.learn.consumeOnLearn === true) {
      await selected.item.delete();
    }

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
    };
  }

  // Whether a recipe's crafting system has an EFFECTIVE learn cap (issue 511):
  // `limitRecipes === true` AND a finite positive `maxRecipes`. A system that
  // toggled `limitRecipes` on but carries an invalid/missing `maxRecipes` is
  // NOT treated as capped — it fails closed to the uncapped/unlimited learn path
  // (mirroring how `_filterNonExhausted` treats an invalid `maxUses` as
  // unlimited) rather than bricking its linked recipes with a zero budget.
  _isRecipeItemLearnCapped(recipe) {
    return Number.isFinite(this._getLearnCapForRecipe(recipe));
  }

  // The finite positive learn cap for a capped recipe, or undefined.
  _getLearnCapForRecipe(recipe) {
    const caps = this._getRecipeItemCaps(recipe);
    if (caps.learn.limitRecipes !== true) return;
    const max = Number(caps.learn.maxRecipes);
    return Number.isFinite(max) && max > 0 ? max : undefined;
  }

  // FN1 (issue 511) — capped-system recipes surface the item-sheet picker path
  // ('manual') REGARDLESS of `dragDropEnabled`, and are NEVER auto-learned on
  // drop ('auto'). Uncapped recipes keep the original split: auto-learn when
  // `dragDropEnabled === true`, else the manual sheet path. This lets one dropped
  // book auto-learn its uncapped-system recipes while routing only the
  // capped-system ones to the picker (DN2).
  _isRecipeEligibleForOwnedItemLearning(recipe, mode = 'auto') {
    if (!recipe || recipe.enabled === false) return false;

    const system = this._getCraftingSystem(recipe);
    if (!system) return false;
    if ((system?.recipeVisibility?.listMode || 'global') !== 'knowledge') return false;

    const knowledge = this._getKnowledgeConfig(system);
    if (!['learned', 'itemOrLearned'].includes(knowledge?.mode || 'itemOrLearned')) return false;

    // Effective cap only — a `limitRecipes` system with an invalid `maxRecipes`
    // behaves as uncapped here (fails closed to the normal learn path).
    const capped = this._isRecipeItemLearnCapped(recipe);
    const dragDropEnabled = knowledge?.learn?.dragDropEnabled !== false;

    if (mode === 'manual') {
      // The picker surfaces capped systems always; uncapped systems only when
      // auto-drop is off.
      return capped || dragDropEnabled === false;
    }
    // Auto-drop learns only uncapped systems that opt into drag-and-drop.
    return capped === false && dragDropEnabled === true;
  }

  _getOwnedItemLearningCandidates({ ownedItem, mode = 'auto' } = {}) {
    if (!ownedItem) return [];
    const recipes = this.recipeManager?.getRecipes?.({ enabled: true }) || [];
    return recipes.filter(
      (recipe) =>
        this._isRecipeEligibleForOwnedItemLearning(recipe, mode) &&
        this._hasRecipeItemReference(recipe) &&
        this._isMatchingRecipeItem(recipe, ownedItem)
    );
  }

  _buildOwnedItemLearningResult({
    actor,
    ownedItem,
    mode,
    matchedRecipes = [],
    learnedRecipes = [],
    alreadyLearnedRecipes = [],
    consumedItem = false,
    silent = false,
  }) {
    let notificationKind = 'silent';
    let message = null;
    const shouldNotify = silent !== true && matchedRecipes.length > 0;

    if (shouldNotify) {
      if (learnedRecipes.length > 0 && alreadyLearnedRecipes.length > 0) {
        notificationKind = 'partial';
        message = LEARN_RECIPE_MESSAGES.learnedRecipesPartial;
      } else if (learnedRecipes.length > 0) {
        notificationKind = 'success';
        message = LEARN_RECIPE_MESSAGES.learnedRecipes;
      } else {
        notificationKind = 'alreadyKnown';
        message = LEARN_RECIPE_MESSAGES.noNewRecipesLearned;
      }
    }

    const recipeNames = learnedRecipes.map((recipe) => recipe.name).filter(Boolean);
    const matchedRecipeNames = matchedRecipes.map((recipe) => recipe.name).filter(Boolean);
    return {
      actor,
      ownedItem,
      mode,
      matchedRecipes,
      learnedRecipes,
      alreadyLearnedRecipes,
      learnableRecipes: learnedRecipes,
      consumedItem,
      shouldNotify,
      notificationKind,
      message,
      messageData: {
        actor: actor?.name || actor?.id || '',
        item: ownedItem?.name || ownedItem?.uuid || '',
        name: recipeNames[0] || matchedRecipeNames[0] || '',
        recipes: recipeNames.join(', '),
        matchedRecipes: matchedRecipeNames.join(', '),
        count: learnedRecipes.length,
        matchedCount: matchedRecipes.length,
      },
    };
  }

  previewOwnedItemLearning({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
    mode = 'auto',
  } = {}) {
    if (!this._isActorOwnedItem(ownedItem, actor)) {
      return this._buildOwnedItemLearningResult({ actor, ownedItem, mode, silent: true });
    }

    // Capped-system recipes are learned one-at-a-time through the item-sheet
    // picker (getLearnableRecipesFromItem / learnOneRecipeFromItem), never in the
    // bulk drop/manual path, so they are suppressed here per matched recipe
    // (DN2). Uncapped matched recipes in the same drop still learn in bulk.
    const matchedRecipes = this._getOwnedItemLearningCandidates({ ownedItem, mode }).filter(
      (recipe) => !this._isRecipeItemLearnCapped(recipe)
    );
    const learnedMap = this._getLearnedMap(actor);
    const alreadyLearnedRecipes = [];
    const learnableRecipes = [];

    for (const recipe of matchedRecipes) {
      if (learnedMap?.[recipe.id]) {
        alreadyLearnedRecipes.push(recipe);
      } else {
        learnableRecipes.push(recipe);
      }
    }

    // `consumeOnLearn` is ignored for capped books (superseded by
    // `destroyWhenSpent`), but capped recipes are already excluded above, so this
    // only ever sees uncapped recipes (UN4).
    const consumedItem = learnableRecipes.some((recipe) => {
      const system = this._getCraftingSystem(recipe);
      const knowledge = this._getKnowledgeConfig(system);
      return knowledge?.learn?.consumeOnLearn === true;
    });

    return this._buildOwnedItemLearningResult({
      actor,
      ownedItem,
      mode,
      matchedRecipes,
      learnedRecipes: learnableRecipes,
      alreadyLearnedRecipes,
      consumedItem,
    });
  }

  async learnRecipesFromOwnedItem({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
    viewer = null,
    mode = 'auto',
  } = {}) {
    const preview = this.previewOwnedItemLearning({ ownedItem, actor, viewer, mode });
    if (preview.matchedRecipes.length === 0 || preview.learnedRecipes.length === 0) {
      return {
        ...preview,
        learnedRecipes: [],
        consumedItem: false,
        message: preview.message,
        messageData: {
          ...preview.messageData,
          count: 0,
          recipes: '',
        },
      };
    }

    const learnedMap = this._getLearnedMap(actor);
    const learnedAt = Date.now();
    const next = { ...learnedMap };

    for (const recipe of preview.learnedRecipes) {
      next[recipe.id] = {
        learnedAt,
        sourceItemUuid: ownedItem.uuid,
      };
    }

    await this._setLearnedMap(actor, next);

    const confirmedLearnedMap = this._getLearnedMap(actor);
    const writeSucceeded = preview.learnedRecipes.every(
      (recipe) => confirmedLearnedMap?.[recipe.id]?.sourceItemUuid === ownedItem.uuid
    );
    if (!writeSucceeded) {
      return this._buildOwnedItemLearningResult({
        actor,
        ownedItem,
        mode,
        matchedRecipes: preview.matchedRecipes,
        learnedRecipes: [],
        alreadyLearnedRecipes: preview.alreadyLearnedRecipes,
        consumedItem: false,
        silent: true,
      });
    }

    if (preview.consumedItem === true) {
      await ownedItem.delete?.();
    }

    return this._buildOwnedItemLearningResult({
      actor,
      ownedItem,
      mode,
      matchedRecipes: preview.matchedRecipes,
      learnedRecipes: preview.learnedRecipes,
      alreadyLearnedRecipes: preview.alreadyLearnedRecipes,
      consumedItem: preview.consumedItem === true,
    });
  }

  /**
   * Read-only view of the capped recipes a player can still learn from one owned
   * recipe item (issue 511). Returns the item's linked, capped-system recipes the
   * actor has not yet learned, plus the item-document's remaining learn budget
   * (`remainingBudget = maxRecipes − count`). The recipe list is empty and
   * `remainingBudget` is `0` once the budget is spent. Only capped-system recipes
   * participate — uncapped recipes learn in bulk via `learnRecipesFromOwnedItem`.
   *
   * @param {object} args
   * @param {object} args.ownedItem
   * @param {object|null} [args.actor]
   * @returns {{recipes: object[], remainingBudget: number, maxRecipes: number|undefined, count: number}}
   */
  getLearnableRecipesFromItem({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
  } = {}) {
    const empty = { recipes: [], remainingBudget: 0, maxRecipes: undefined, count: 0 };
    if (!ownedItem || !actor) return empty;
    if (!this._isActorOwnedItem(ownedItem, actor)) return empty;

    const cappedCandidates = this._getOwnedItemLearningCandidates({
      ownedItem,
      mode: 'manual',
    }).filter((recipe) => this._isRecipeItemLearnCapped(recipe));
    if (cappedCandidates.length === 0) return empty;

    // The budget is per item-document instance (mirrors recipeItemUsage). When
    // several capped systems link the same physical item, use the most permissive
    // cap; in practice one book links to one system's recipes.
    const caps = cappedCandidates
      .map((recipe) => this._getLearnCapForRecipe(recipe))
      .filter((value) => Number.isFinite(value));
    const maxRecipes = caps.length > 0 ? Math.max(...caps) : undefined;
    const count = this._getRecipeItemLearnCount(ownedItem);
    const remainingBudget = Number.isFinite(maxRecipes) ? Math.max(0, maxRecipes - count) : 0;

    const learnedMap = this._getLearnedMap(actor);
    const unlearned = cappedCandidates.filter((recipe) => !learnedMap?.[recipe.id]);

    return {
      recipes: remainingBudget > 0 ? unlearned : [],
      remainingBudget,
      maxRecipes,
      count,
    };
  }

  /**
   * Learn exactly one capped recipe from an owned recipe item (issue 511),
   * enforcing the per-document learn budget. Validates the link, that the recipe
   * is not already learned, and that `remainingBudget > 0`; writes one
   * `learnedRecipes` entry, increments the item-document learn count, and deletes
   * the item when the count reaches `maxRecipes` iff `destroyWhenSpent`. For
   * capped books `consumeOnLearn` is ignored.
   *
   * @param {object} args
   * @param {object} args.recipe
   * @param {object} args.ownedItem
   * @param {object|null} [args.actor]
   * @returns {Promise<{success: boolean, message: string, messageData?: object, destroyed?: boolean, remainingBudget?: number}>}
   */
  async learnOneRecipeFromItem({
    recipe,
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
  } = {}) {
    if (!recipe || !ownedItem || !actor) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }
    if (
      !this._isActorOwnedItem(ownedItem, actor) ||
      !this._isMatchingRecipeItem(recipe, ownedItem)
    ) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }
    if (!this._isRecipeItemLearnCapped(recipe)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }

    const learnedMap = this._getLearnedMap(actor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    const maxRecipes = this._getLearnCapForRecipe(recipe);
    const count = this._getRecipeItemLearnCount(ownedItem);
    const remainingBudget = Number.isFinite(maxRecipes) ? maxRecipes - count : 0;
    if (remainingBudget <= 0) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learnBudgetSpent };
    }

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: ownedItem.uuid,
      },
    };
    await this._setLearnedMap(actor, next);

    const nextCount = count + 1;
    await this._setRecipeItemLearnCount(ownedItem, nextCount);

    const caps = this._getRecipeItemCaps(recipe);
    const spent = Number.isFinite(maxRecipes) && nextCount >= maxRecipes;
    let destroyed = false;
    if (spent && caps.learn.destroyWhenSpent === true) {
      await ownedItem.delete?.();
      destroyed = true;
    }

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
      destroyed,
      remainingBudget: Number.isFinite(maxRecipes) ? Math.max(0, maxRecipes - nextCount) : 0,
    };
  }

  /**
   * Learn exactly one recipe from a book the crafting actor (or a component-source
   * actor) owns, for the player Inventory learn affordance (issue 511). Resolves
   * the owned book document deterministically, then:
   *  - a capped system enforces the per-document learn budget and destroy-when-spent
   *    (delegates to {@link learnOneRecipeFromItem});
   *  - an uncapped system (or a cap toggled on with an invalid `maxRecipes`, which
   *    fails closed to uncapped) writes one `learnedRecipes` entry and NEVER
   *    consumes the book — `consumeOnLearn` is ignored here so learning one recipe
   *    from a multi-recipe book does not strand its remaining recipes.
   *
   * @param {object} args
   * @param {object} args.recipe
   * @param {object|null} args.craftingActor Where the learned recipe is recorded.
   * @param {object[]} [args.componentSourceActors] Additional inventory sources.
   * @returns {Promise<{success: boolean, message: string, messageData?: object, destroyed?: boolean, remainingBudget?: number}>}
   */
  async learnRecipeFromOwnedBook({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return { success: false, message: LEARN_RECIPE_MESSAGES.systemNotFound };

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['learned', 'itemOrLearned'].includes(mode)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learningDisabled };
    }
    if (!this._hasRecipeItemReference(recipe)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }
    if (!craftingActor) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    // Resolve the owned book document (crafting actor first) the same way the craft
    // and drop paths do — never trust the GM-bypass matchedItems array.
    const matches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const selected = this._selectDeterministic(matches);
    if (!selected) return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };

    // An EFFECTIVE cap (enabled + finite positive max) routes through the
    // budget-enforcing capped path; an invalid cap falls through to uncapped.
    if (
      this._isRecipeItemLearnCapped(recipe) &&
      Number.isFinite(this._getLearnCapForRecipe(recipe))
    ) {
      return this.learnOneRecipeFromItem({
        recipe,
        ownedItem: selected.item,
        actor: craftingActor,
      });
    }

    const next = {
      ...learnedMap,
      [recipe.id]: { learnedAt: Date.now(), sourceItemUuid: selected.item.uuid },
    };
    await this._setLearnedMap(craftingActor, next);
    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
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
    const caps = this._getRecipeItemCaps(recipe);
    if (!caps.item.limitUses) return;

    const matches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const nonExhausted = this._filterNonExhausted(matches, caps.item);
    const selected = this._selectDeterministic(nonExhausted);
    if (!selected) return;

    const nextUses = Number(selected.timesUsed || 0) + 1;
    await this._setRecipeItemUsage(selected.item, nextUses);

    const maxUses = Number(caps.item.maxUses);
    const exhausted = Number.isFinite(maxUses) && maxUses > 0 && nextUses >= maxUses;
    if (exhausted && caps.item.destroyWhenExhausted === true) {
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
        sourceItemUuid: null,
      },
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
