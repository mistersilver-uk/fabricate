import { confirmDialog } from './foundryCompat.js';
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

function buildV1HeaderButton(sheet, visibilityService, deps = {}) {
  const localize = deps.localize || localizeRecipeLearning;
  if (!getManualPreview(sheet, visibilityService, deps.game || globalThis.game)) return null;
  return {
    class: 'fabricate-learn-recipe',
    icon: 'fas fa-book-open',
    label: localize('FABRICATE.Knowledge.ManualLearnAction'),
    onclick: () => handleManualLearn(sheet, visibilityService, deps)
  };
}

function buildV2HeaderControl(sheet, visibilityService, deps = {}) {
  if (!getManualPreview(sheet, visibilityService, deps.game || globalThis.game)) return null;
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
      await handleManualLearn(sheet, visibilityService, deps);
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
    void handleManualLearn(sheet, visibilityService, deps);
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
    handleManualLearn: (sheet) => handleManualLearn(sheet, visibilityService, deps)
  };
}

export {
  ACTION as RECIPE_LEARN_HEADER_ACTION,
  buildConfirmContent,
  buildV1HeaderButton,
  buildV2HeaderControl,
  getManualPreview,
  handleManualLearn
};
