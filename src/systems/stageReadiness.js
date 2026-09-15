/**
 * ONE reading of "this versioned crafting stage may be committed", shared by the engine's stage
 * commands and by the Journal projection. Classifying it twice let a control render enabled in a
 * state the command behind it refuses (issue 1648); every cause is named here, once.
 */
import { buildStepRecipeView } from './stepRecipeView.js';

/** Blocker codes, also the Journal's `actions.disabledReason`. */
export const STAGE_BLOCKERS = Object.freeze({
  material: 'selectionRequired',
  essence: 'essenceRequired',
  currency: 'currencyRequired',
  choice: 'choiceRequired',
  tool: 'toolRequired',
});

/** Reported before `choice`, because acquiring is what fixes them and choosing cannot. */
const SHORTFALL_ORDER = Object.freeze([
  STAGE_BLOCKERS.material,
  STAGE_BLOCKERS.essence,
  STAGE_BLOCKERS.currency,
]);

/** The ingredient family a resolved option belongs to. */
export function ingredientKind(option) {
  if (option?.itemUuid) return 'item';
  const type = option?.match?.type;
  if (type === 'tags') return 'tag';
  if (['component', 'essence', 'currency'].includes(type)) return type;
  return 'unknown';
}

/** The player's allocation, or `null` when it names another stage or route and so is not one. */
export function scopedEssenceAllocation(payload, stepId, ingredientSetId) {
  const allocation = payload?.allocation;
  if (!allocation || typeof allocation !== 'object') return null;
  if (String(payload.stepId ?? '') !== String(stepId ?? '')) return null;
  if (String(payload.ingredientSetId ?? '') !== String(ingredientSetId ?? '')) return null;
  return allocation;
}

/** Essence groups the carrier ledger cannot fund. Re-allocating cannot repair these. */
export function unfundedEssenceGroupIds(essencePool) {
  const requirements = Array.isArray(essencePool?.requirements) ? essencePool.requirements : [];
  return new Set(
    requirements
      .filter((entry) => (Number(entry?.owned) || 0) < (Number(entry?.need) || 0))
      .map((entry) => (entry?.groupId == null ? null : String(entry.groupId)))
  );
}

/**
 * Why one unmet group is unmet. A finite `have < need` is stock to acquire whatever the family;
 * an essence miss is one only when the carrier ledger cannot cover it, because an allocation the
 * player can still redistribute is a choice.
 */
export function missingGroupBlocker(group, unfunded = new Set()) {
  const kind = ingredientKind(group?.ingredient);
  if (kind === 'essence') {
    const id = group?.group?.id ?? group?.groupId ?? group?.id;
    return unfunded.has(id == null ? null : String(id))
      ? STAGE_BLOCKERS.essence
      : STAGE_BLOCKERS.choice;
  }
  if (!Number.isFinite(group?.have) || !Number.isFinite(group?.need) || group.have >= group.need) {
    return STAGE_BLOCKERS.choice;
  }
  return kind === 'currency' ? STAGE_BLOCKERS.currency : STAGE_BLOCKERS.material;
}

/**
 * What a resolved selection is short of, or `null` when it resolves. One that fails while nothing
 * it names is short is waiting on the player's own pick.
 * @returns {string|null} A `STAGE_BLOCKERS` code.
 */
export function selectionBlocker(selection) {
  if (selection?.success === true) return null;
  const unfunded = unfundedEssenceGroupIds(selection?.essencePool);
  const groups = Array.isArray(selection?.missingGroups) ? selection.missingGroups : [];
  const causes = new Set(groups.map((group) => missingGroupBlocker(group, unfunded)));
  return SHORTFALL_ORDER.find((code) => causes.has(code)) ?? STAGE_BLOCKERS.choice;
}

/**
 * Whether the PERSISTED plan names every pick the stage will commit: an option per multi-option
 * group, and an in-scope essence allocation that delivers something. The resolver invents both
 * when absent and then reports success, so its verdict cannot answer this on its own.
 * @returns {boolean}
 */
export function stageSelectionInputsComplete(ingredientSet, plan, stepId) {
  const groups = Array.isArray(ingredientSet?.ingredientGroups)
    ? ingredientSet.ingredientGroups
    : [];
  const overrides = plan?.ingredientOptionOverrides ?? {};
  const selectedOptions = groups.map((group) => {
    const options = Array.isArray(group?.options) ? group.options : [];
    const supplied = Object.hasOwn(overrides, group?.id);
    const raw = supplied ? overrides[group?.id]?.optionIndex : 0;
    const selectedIndex =
      ['number', 'string'].includes(typeof raw) && String(raw).trim() ? Number(raw) : NaN;
    if (options.length > 1 && !supplied) return null;
    return Number.isSafeInteger(selectedIndex) && selectedIndex >= 0
      ? (options.at(selectedIndex) ?? null)
      : null;
  });
  if (selectedOptions.includes(null)) return false;
  const requiresEssenceAllocation =
    Object.keys(ingredientSet?.essences ?? {}).length > 0 ||
    selectedOptions.some((option) => option.match?.type === 'essence');
  if (!requiresEssenceAllocation) return true;
  const allocation = scopedEssenceAllocation(
    plan?.ingredientEssenceAllocation,
    stepId,
    ingredientSet?.id
  );
  return (
    allocation !== null &&
    Object.values(allocation).some((units) => Number.isFinite(Number(units)) && Number(units) > 0)
  );
}

/**
 * The stage's single readiness verdict. `toolsAvailable` and `currencyAffordable` default to
 * `true` so a caller that cannot answer them says so by omission rather than inventing a refusal.
 * @returns {{ready: boolean, blocker: string|null}}
 */
export function classifyStageReadiness({
  selection = null,
  inputsComplete = true,
  toolsAvailable = true,
  currencyAffordable = true,
} = {}) {
  const shortfall = selectionBlocker(selection);
  // A real shortfall outranks an unmade pick: telling a player to choose when nothing they
  // can choose will help is the worse of the two failures.
  const ordered = [
    SHORTFALL_ORDER.includes(shortfall) ? shortfall : null,
    inputsComplete ? null : STAGE_BLOCKERS.choice,
    shortfall,
    toolsAvailable ? null : STAGE_BLOCKERS.tool,
    currencyAffordable ? null : STAGE_BLOCKERS.currency,
  ];
  const blocker = ordered.find(Boolean) ?? null;
  return { ready: blocker === null, blocker };
}

/**
 * Every tool the stage requires, with whether the actor holds it, through the SAME recipe-manager
 * seam `CraftingEngine._validateTools` uses, so a tool the command refuses on is one this reports
 * as missing. `null` when nothing can answer.
 * @returns {Array<{id, name, img, available, needsRepair}>|null}
 */
export function resolveStageToolStates({
  recipeManager,
  recipe,
  recipeStep,
  ingredientSet,
  sourceActors = [],
  primaryActor = null,
}) {
  if (typeof recipeManager?.getToolsForSet !== 'function') return null;
  if (typeof recipeManager?.resolveToolStates !== 'function') return null;
  const view = buildStepRecipeView(recipe, recipeStep);
  try {
    const tools = recipeManager.getToolsForSet(view, ingredientSet);
    if (!Array.isArray(tools) || tools.length === 0) return [];
    const states = recipeManager.resolveToolStates(view, tools, sourceActors, { primaryActor });
    return tools.map((tool, index) => ({
      id: String(tool?.id ?? '').trim() || null,
      name: String(states?.[index]?.name ?? tool?.label ?? tool?.name ?? ''),
      img: String(states?.[index]?.img ?? tool?.img ?? '').trim() || null,
      available: states?.[index]?.available === true,
      needsRepair: states?.[index]?.needsRepair === true,
    }));
  } catch {
    return null;
  }
}
