const DEFAULT_RECIPE_LIST_LIMIT = 5;

export function localizeRecipeLearning(key, data = null) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return key;
  if (data && typeof i18n.format === 'function') return i18n.format(key, data);
  return i18n.localize?.(key) || key;
}

function capRecipeList(recipes = [], limit = DEFAULT_RECIPE_LIST_LIMIT) {
  const names = recipes.map(recipe => recipe?.name).filter(Boolean);
  const visible = names.slice(0, limit);
  const remaining = Math.max(0, names.length - visible.length);
  return {
    names,
    list: remaining > 0
      ? `${visible.join(', ')} (+${remaining})`
      : visible.join(', ')
  };
}

export function buildRecipeLearningMessageData(result) {
  const learnedList = capRecipeList(result?.learnedRecipes || []);
  const matchedList = capRecipeList(result?.matchedRecipes || []);
  return {
    ...(result?.messageData || {}),
    actor: result?.actor?.name || result?.actor?.id || result?.messageData?.actor || '',
    item: result?.ownedItem?.name || result?.ownedItem?.uuid || result?.messageData?.item || '',
    name: learnedList.names[0] || matchedList.names[0] || result?.messageData?.name || '',
    recipes: learnedList.list,
    matchedRecipes: matchedList.list,
    count: learnedList.names.length,
    matchedCount: matchedList.names.length
  };
}

export function notifyOwnedItemLearningResult(result, {
  notify = globalThis.ui?.notifications,
  localize = localizeRecipeLearning
} = {}) {
  if (!result?.shouldNotify || !result.message || !notify) return false;

  const message = localize(result.message, buildRecipeLearningMessageData(result));
  if (result.notificationKind === 'alreadyKnown') {
    notify.warn?.(message);
  } else {
    notify.info?.(message);
  }
  return true;
}

export function resolveOwnedItemActor(item) {
  const actor = item?.parent || item?.actor || null;
  if (!actor) return null;
  if (item?.parent && item.parent !== actor) return null;
  return actor;
}

export function canMutateOwnedItem(item, actor, user = globalThis.game?.user) {
  if (!item || !actor || !user) return false;
  if (typeof item.canUserModify === 'function') {
    return item.canUserModify(user, 'update') === true;
  }
  if (typeof actor.canUserModify === 'function') {
    return actor.canUserModify(user, 'update') === true;
  }
  return item.isOwner === true || actor.isOwner === true;
}

/**
 * Register the createItem hook for automatic recipe-item learning.
 *
 * @param {RecipeVisibilityService} visibilityService
 * @param {object} [deps]
 * @returns {Function} The hook handler
 */
export function registerRecipeItemLearningHook(visibilityService, deps = {}) {
  const hooks = deps.Hooks || globalThis.Hooks;
  const game = deps.game || globalThis.game;
  const notify = deps.notify || globalThis.ui?.notifications;
  const localize = deps.localize || localizeRecipeLearning;

  const handler = async (item, options, userId) => {
    if (!visibilityService) return;
    if (game?.user?.id !== userId) return;

    const actor = resolveOwnedItemActor(item);
    if (!actor) return;
    if (!canMutateOwnedItem(item, actor, game?.user)) return;

    const result = await visibilityService.learnRecipesFromOwnedItem({
      ownedItem: item,
      actor,
      viewer: game?.user || null,
      mode: 'auto'
    });

    notifyOwnedItemLearningResult(result, { notify, localize });
  };

  if (hooks?.on) {
    hooks.on('createItem', handler);
  }

  return handler;
}
