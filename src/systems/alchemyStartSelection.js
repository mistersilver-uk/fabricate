/**
 * A version-1 brew's start inputs, derived on the GM from the canonical submission (issue 2574):
 * the signature matcher's per-option rule, the complete selection plan, and the requirement set
 * the start funds from the submitted units alone.
 */
import { itemKeyOf } from '../models/ingredientLedger.js';
import { accumulateSubmissionEssences } from '../utils/essenceResolver.js';
import { essencesOfItem } from '../utils/itemEssences.js';

import { stageIngredientSet } from './automaticStageBlocker.js';
import { CraftingLifecycleExecutionError } from './CraftingLifecycleExecutor.js';
import { readStoredStackQuantity } from './itemStackQuantity.js';

/** The unfunded refusal is a lang key, so the banner and toast localize it (issue 2574). */
const UNFUNDED_MESSAGE = 'FABRICATE.App.Journal.Reason.AlchemySubmissionUnfunded';

/**
 * The matcher's rule over `{ item, componentId }` records: counting is per occurrence, by the
 * collector's component id (issue 572), and a unit counts towards every option it fits.
 * An essence option is amount-based and ignored under `skipEssence`.
 */
export function submissionOptionRule({ submittedItems, components, signatureValidator, system }) {
  const componentIds = submittedItems.map((record) => record?.componentId ?? null);
  const essences =
    system?.features?.essences === true
      ? accumulateSubmissionEssences(submittedItems, { components, systemId: system?.id })
      : null;
  const unitsOf = (ids) => {
    const wanted = ids instanceof Set ? ids : new Set(ids);
    return componentIds.filter((id) => id != null && wanted.has(id)).length;
  };
  const optionMet = (option, skipEssence) => {
    if (option?.match?.type === 'essence') {
      if (skipEssence) return false;
      const essenceId = String(option.match.essenceId || '').trim();
      const amount = Math.max(0, Number(option.match.amount) || 0);
      // A no-op essence option (id-less or zero amount) is trivially satisfied.
      if (!essenceId || amount <= 0) return true;
      return (essences?.[essenceId] || 0) >= amount;
    }
    const optionIds = signatureValidator.expandIngredientToComponentIds(option, components);
    return unitsOf(optionIds) >= Math.max(1, Number(option?.quantity) || 1);
  };
  const groupMet = (group, groupComponentIds, skipEssence) => {
    const options = Array.isArray(group?.options) ? group.options : [];
    if (options.length === 0) return unitsOf(groupComponentIds) > 0;
    return options.some((option) => optionMet(option, skipEssence));
  };
  return { essences, optionMet, groupMet };
}

/**
 * The plan a matched start commits, scoped to the first step and the matched set: for each
 * multi-option group the option `resolveFunded(set)` drew from the submitted units, else the first
 * the submission meets, and an essence allocation over the submitted carriers.
 * A recipe without that set gets the set id alone.
 */
export function deriveAlchemySelectionPlan({
  steps,
  ingredientSetId,
  submittedItems,
  components,
  signatureValidator,
  system,
  resolveFunded = null,
}) {
  const plan = { selectedIngredientSetId: ingredientSetId };
  const step = Array.isArray(steps) ? steps[0] : null;
  const set = stageIngredientSet(step, ingredientSetId);
  if (!set || set.id !== ingredientSetId) return plan;
  const groups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
  const funded = fundedSelection(resolveFunded, set);
  const rule = submissionOptionRule({ submittedItems, components, signatureValidator, system });
  const skipEssence = system?.features?.essences !== true;
  const overrides = {};
  const essenceIds = new Set(Object.keys(set.essences ?? {}));
  for (const [index, group] of groups.entries()) {
    const options = Array.isArray(group?.options) ? group.options : [];
    const chosen = funded
      ? funded.selectedIngredients?.[index]
      : options.find((option) => rule.optionMet(option, skipEssence));
    const picked = options.indexOf(chosen);
    if (options.length > 1 && group?.id != null && picked !== -1) {
      overrides[group.id] = { optionIndex: picked };
    }
    const match = options[Math.max(picked, 0)]?.match;
    if (!funded && match?.type === 'essence' && String(match.essenceId ?? '').trim()) {
      essenceIds.add(String(match.essenceId).trim());
    }
  }
  if (Object.keys(overrides).length > 0) plan.ingredientOptionOverrides = overrides;
  const allocation = {
    ...carrierAllocation(submittedItems, components, essenceIds),
    ...funded?.essenceAllocation,
  };
  if (Object.keys(allocation).length > 0) {
    plan.ingredientEssenceAllocation = { stepId: step.id ?? null, ingredientSetId, allocation };
  }
  return plan;
}

/** The funded resolution, or null when the submitted units cannot fund the set. */
function fundedSelection(resolveFunded, set) {
  if (typeof resolveFunded !== 'function') return null;
  try {
    const selection = resolveFunded(set);
    return selection?.success === true ? selection : null;
  } catch (error) {
    if (error instanceof CraftingLifecycleExecutionError) return null;
    throw error;
  }
}

/** `{ [itemKey]: submitted units }` over the records carrying any of `essenceIds`, or null. */
function carrierAllocation(submittedItems, components, essenceIds) {
  if (essenceIds.size === 0) return null;
  const byId = new Map((components ?? []).map((entry) => [entry?.id, entry]));
  const allocation = {};
  for (const record of submittedItems) {
    const carried = essencesOfItem(record.item, () => byId.get(record.componentId) ?? null);
    if ([...essenceIds].every((id) => !(carried[id] > 0))) continue;
    const key = itemKeyOf(record.item);
    allocation[key] = (allocation[key] ?? 0) + 1;
  }
  return Object.keys(allocation).length > 0 ? allocation : null;
}

/**
 * `set` itself unless `trusted` attests a matched brew; otherwise a view resolving from the
 * submitted Items alone, each offering its submitted units, whose plan also spends every submitted
 * unit it does not draw. Both refusals throw, so the start discards its run with nothing spent.
 */
export function submissionFundedSet(set, trusted, sourceActors) {
  if (trusted?.matched !== true || trusted?.activityKind !== 'alchemy') return set;
  if (typeof set?.resolveIngredientSelection !== 'function') return set;
  const view = Object.create(set);
  view.resolveIngredientSelection = (availableItems, matcher, options = {}) => {
    const submission = submittedUnits(trusted, sourceActors);
    const funding = availableItems.filter((item) => submission.has(itemKeyOf(item)));
    const seedRemaining = (items) =>
      new Map(items.map((item) => [itemKeyOf(item), submission.get(itemKeyOf(item))?.units ?? 0]));
    const selection = set.resolveIngredientSelection(funding, matcher, {
      ...options,
      seedRemaining,
    });
    return withResidual(selection, submission);
  };
  view.toJSON = () => (typeof set.toJSON === 'function' ? set.toJSON() : set);
  return view;
}

/** Item key → `{ item, units, componentId }` for the submission, or a stale-submission throw. */
function submittedUnits(trusted, sourceActors) {
  const uuids = Array.isArray(trusted.submittedItemUuids) ? trusted.submittedItemUuids : [];
  const componentIds = Array.isArray(trusted.submittedComponentIds)
    ? trusted.submittedComponentIds
    : [];
  const held = new Map(
    (sourceActors ?? []).flatMap((actor) => [...(actor?.items ?? [])]).map((i) => [itemKeyOf(i), i])
  );
  const submission = new Map();
  for (const [index, uuid] of uuids.entries()) {
    const entry = submission.get(uuid) ?? {
      item: held.get(uuid),
      units: 0,
      componentId: componentIds[index] ?? null,
    };
    entry.units += 1;
    submission.set(uuid, entry);
  }
  for (const { item, units } of submission.values()) {
    if (!item || units > readStoredStackQuantity(item, { absentDefault: 1 })) {
      throw new CraftingLifecycleExecutionError(
        'The submitted alchemy ingredients are stale.',
        'STALE_ALCHEMY_SUBMISSION'
      );
    }
  }
  return submission;
}

/** The selection with the undrawn submitted units appended, or an unfunded throw. */
function withResidual(selection, submission) {
  if (selection?.success !== true) {
    throw Object.assign(
      new CraftingLifecycleExecutionError(UNFUNDED_MESSAGE, 'ALCHEMY_SUBMISSION_UNFUNDED'),
      { reason: 'alchemy-submission-unfunded' }
    );
  }
  const plan = Array.isArray(selection.plan) ? selection.plan : [];
  const drawn = new Map();
  for (const entry of plan) {
    const key = itemKeyOf(entry.item);
    drawn.set(key, (drawn.get(key) ?? 0) + (Number(entry.quantity) || 0));
  }
  const residual = [];
  for (const [key, { item, units, componentId }] of submission) {
    const left = units - (drawn.get(key) ?? 0);
    if (left > 0) residual.push({ item, quantity: left, ingredient: { componentId } });
  }
  return { ...selection, plan: [...plan, ...residual] };
}
