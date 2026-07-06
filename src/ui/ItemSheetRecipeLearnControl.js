import { confirmDialog, selectDialog } from './foundryCompat.js';
import {
  buildRecipeLearningMessageData,
  canMutateOwnedItem,
  localizeRecipeLearning,
  notifyOwnedItemLearningResult,
  resolveOwnedItemActor
} from '../systems/RecipeItemLearningHook.js';

const ACTION = 'fabricateLearnRecipe';
const V2_CONTROL_BOUND = Symbol.for('fabricate.recipeLearnControlBound');
const inFlightSheets = new WeakSet();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveSheetItem(sheet) {
  return sheet?.document || sheet?.object || sheet?.item || null;
}

function getManualPreview(sheet, visibilityService, game = globalThis.game) {
  const item = resolveSheetItem(sheet);
  const actor = resolveOwnedItemActor(item);
  if (!item || !actor) return null;
  if (!canMutateOwnedItem(item, actor, game?.user)) return null;

  const preview = visibilityService?.previewOwnedItemLearning?.({
    ownedItem: item,
    actor,
    viewer: game?.user || null,
    mode: 'manual'
  });
  if (!preview || preview.learnedRecipes?.length === 0) return null;
  return preview;
}

/**
 * The capped-cookbook learn state for the sheet's item, or null when the item is
 * not a capped recipe item, the budget is spent, or nothing remains to learn.
 * A capped book routes to the one-at-a-time picker; an uncapped book keeps the
 * single-confirm learn-all path (issue 511).
 */
function getCappedLearnState(sheet, visibilityService, game = globalThis.game) {
  const item = resolveSheetItem(sheet);
  const actor = resolveOwnedItemActor(item);
  if (!item || !actor) return null;
  if (!canMutateOwnedItem(item, actor, game?.user)) return null;

  const state = visibilityService?.getLearnableRecipesFromItem?.({ ownedItem: item, actor });
  if (!state || !Array.isArray(state.recipes) || state.recipes.length === 0) return null;
  if (!(state.remainingBudget > 0)) return null;
  return { item, actor, ...state };
}

// The header learn control shows when there is either a capped picker state or an
// uncapped manual-learn preview for the item.
function hasLearnAffordance(sheet, visibilityService, game = globalThis.game) {
  return (
    Boolean(getCappedLearnState(sheet, visibilityService, game)) ||
    Boolean(getManualPreview(sheet, visibilityService, game))
  );
}

function buildConfirmContent(preview, localize = localizeRecipeLearning) {
  const data = buildRecipeLearningMessageData(preview);
  const base = localize('FABRICATE.Knowledge.ManualLearnConfirmBody', data);
  const consumeWarning = preview.consumedItem === true
    ? `<p><strong>${escapeHtml(localize('FABRICATE.Knowledge.ManualLearnConsumeWarning', data))}</strong></p>`
    : '';

  return `<p>${escapeHtml(base)}</p>${consumeWarning}`;
}

async function handleManualLearn(sheet, visibilityService, deps = {}) {
  if (!sheet || inFlightSheets.has(sheet)) return false;

  const game = deps.game || globalThis.game;
  const notify = deps.notify || globalThis.ui?.notifications;
  const localize = deps.localize || localizeRecipeLearning;
  const confirm = deps.confirmDialog || confirmDialog;
  const preview = getManualPreview(sheet, visibilityService, game);
  if (!preview) return false;

  inFlightSheets.add(sheet);
  try {
    const confirmed = await confirm({
      title: localize('FABRICATE.Knowledge.ManualLearnConfirmTitle', buildRecipeLearningMessageData(preview)),
      content: buildConfirmContent(preview, localize),
      yes: () => true,
      no: () => false
    });
    if (!confirmed) return false;

    const result = await visibilityService.learnRecipesFromOwnedItem({
      ownedItem: preview.ownedItem,
      actor: preview.actor,
      viewer: game?.user || null,
      mode: 'manual'
    });
    notifyOwnedItemLearningResult(result, { notify, localize });
    sheet.render?.(false);
    return true;
  } finally {
    inFlightSheets.delete(sheet);
  }
}

/**
 * Capped-cookbook picker: open a labelled selection dialog listing the recipes
 * still learnable from this item with an "X of Y remaining" budget readout, learn
 * the chosen one, then re-render the sheet — guarding against re-rendering a
 * document that destroy-when-spent has just deleted (FN3, issue 511).
 */
async function handleCappedLearn(sheet, visibilityService, deps, state) {
  const notify = deps.notify || globalThis.ui?.notifications;
  const localize = deps.localize || localizeRecipeLearning;
  const select = deps.selectDialog || selectDialog;

  const budgetData = {
    item: state.item?.name || state.item?.uuid || '',
    remaining: state.remainingBudget,
    max: Number.isFinite(state.maxRecipes) ? state.maxRecipes : state.remainingBudget
  };
  const chosenId = await select({
    title: localize('FABRICATE.Knowledge.SelectRecipeTitle'),
    content: `${localize('FABRICATE.Knowledge.SelectRecipePrompt', budgetData)} ${localize('FABRICATE.Knowledge.SelectRecipeBudget', budgetData)}`,
    selectLabel: localize('FABRICATE.Knowledge.SelectRecipeLabel'),
    confirmLabel: localize('FABRICATE.Knowledge.SelectRecipeConfirm'),
    cancelLabel: localize('FABRICATE.Knowledge.SelectRecipeCancel'),
    options: state.recipes.map((recipe) => ({ value: recipe.id, label: recipe.name }))
  });
  if (!chosenId) return false;

  const recipe = state.recipes.find((entry) => entry.id === chosenId);
  if (!recipe) return false;

  const result = await visibilityService.learnOneRecipeFromItem({
    recipe,
    ownedItem: state.item,
    actor: state.actor
  });
  if (result?.success) {
    notify?.info?.(localize('FABRICATE.Knowledge.LearnedRecipe', { name: recipe.name }));
    // The document is gone when destroy-when-spent fired; re-rendering a deleted
    // sheet throws (and Foundry has already closed it mid-session).
    if (result.destroyed !== true) sheet.render?.(false);
  } else if (result?.message) {
    notify?.warn?.(localize(result.message, { item: budgetData.item }));
  }
  return result?.success === true;
}

// Dispatch a learn action from the item-sheet header: capped books open the
// one-at-a-time picker, uncapped books keep the single-confirm learn-all path.
async function handleLearnAction(sheet, visibilityService, deps = {}) {
  if (!sheet || inFlightSheets.has(sheet)) return false;
  const game = deps.game || globalThis.game;
  const capped = getCappedLearnState(sheet, visibilityService, game);
  if (!capped) return handleManualLearn(sheet, visibilityService, deps);

  inFlightSheets.add(sheet);
  try {
    return await handleCappedLearn(sheet, visibilityService, deps, capped);
  } finally {
    inFlightSheets.delete(sheet);
  }
}

function buildV1HeaderButton(sheet, visibilityService, deps = {}) {
  const localize = deps.localize || localizeRecipeLearning;
  if (!hasLearnAffordance(sheet, visibilityService, deps.game || globalThis.game)) return null;
  return {
    class: 'fabricate-learn-recipe',
    icon: 'fas fa-book-open',
    label: localize('FABRICATE.Knowledge.ManualLearnAction'),
    onclick: () => handleLearnAction(sheet, visibilityService, deps)
  };
}

function buildV2HeaderControl(sheet, visibilityService, deps = {}) {
  if (!hasLearnAffordance(sheet, visibilityService, deps.game || globalThis.game)) return null;
  return {
    icon: 'fas fa-book-open',
    label: 'FABRICATE.Knowledge.ManualLearnAction',
    action: ACTION,
    visible: true
  };
}

function ensureV2HeaderAction(sheet, visibilityService, deps = {}) {
  const actions = sheet?.options?.actions;
  if (!actions || typeof actions !== 'object' || typeof actions[ACTION] === 'function') {
    return false;
  }

  try {
    actions[ACTION] = async (event, target) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      await handleLearnAction(sheet, visibilityService, deps);
    };
    return true;
  } catch (_) {
    return false;
  }
}

function bindV2HeaderAction(sheet, element, visibilityService, deps = {}) {
  const button = sheet?.element?.querySelector?.(`[data-action="${ACTION}"]`)
    || element?.querySelector?.(`[data-action="${ACTION}"]`);
  if (!button || button[V2_CONTROL_BOUND]) return false;

  button.addEventListener?.('click', (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    void handleLearnAction(sheet, visibilityService, deps);
  });
  button[V2_CONTROL_BOUND] = true;
  return true;
}

export function registerItemSheetRecipeLearnControl(visibilityService, deps = {}) {
  const hooks = deps.Hooks || globalThis.Hooks;

  const v1Handler = (app, buttons) => {
    const button = buildV1HeaderButton(app, visibilityService, deps);
    if (button) buttons.unshift(button);
  };

  const v2HeaderHandler = (app, controls) => {
    const control = buildV2HeaderControl(app, visibilityService, deps);
    if (control && !controls.some(entry => entry?.action === ACTION)) {
      ensureV2HeaderAction(app, visibilityService, deps);
      controls.push(control);
    }
  };

  const v2RenderHandler = (app, element) => {
    return bindV2HeaderAction(app, element, visibilityService, deps);
  };

  if (hooks?.on) {
    hooks.on('getItemSheetHeaderButtons', v1Handler);
    hooks.on('getHeaderControlsApplicationV2', v2HeaderHandler);
    hooks.on('renderApplicationV2', v2RenderHandler);
  }

  return {
    v1Handler,
    v2HeaderHandler,
    v2RenderHandler,
    handleManualLearn: (sheet) => handleManualLearn(sheet, visibilityService, deps),
    handleLearn: (sheet) => handleLearnAction(sheet, visibilityService, deps)
  };
}

export {
  ACTION as RECIPE_LEARN_HEADER_ACTION,
  buildConfirmContent,
  buildV1HeaderButton,
  buildV2HeaderControl,
  getCappedLearnState,
  getManualPreview,
  handleLearnAction,
  handleManualLearn
};
