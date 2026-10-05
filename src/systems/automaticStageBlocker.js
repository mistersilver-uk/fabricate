/**
 * Whether the world clock may finish a crafting stage with no player act (D-010). The engine refuses
 * an automatic execute on this answer and the Journal draws its bolt on it, so the two cannot drift.
 */
import { resolveActiveCraftingCheckFormula } from './checkModifierResolver.js';
import { owesClaimablePick } from './choiceGroupAward.js';
import { worldTimeDueStep } from './worldTimeDueStep.js';

/** The stage's chosen ingredient set, or its first authored one when none is chosen. */
export function stageIngredientSet(step, selectedId) {
  const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  if (selectedId == null || selectedId === '') return sets[0] ?? null;
  return sets.find((set) => String(set?.id) === String(selectedId)) ?? null;
}

/** Why an automatic advance may not resolve this stage — `{code, message}` — or null when it may. */
export function automaticStageBlocker({ run, recipe, step, selectedSet, system }) {
  if (run?.completionMode !== 'worldTime') {
    return { code: 'manualPreference', message: 'This crafting run requires manual completion.' };
  }
  if (Array.isArray(selectedSet?.ingredients) && selectedSet.ingredients.length > 0) {
    return { code: 'materials', message: 'Automatic completion requires a no-input stage.' };
  }
  if (
    (Array.isArray(step?.toolIds) && step.toolIds.length > 0) ||
    (Array.isArray(recipe?.toolIds) && recipe.toolIds.length > 0)
  ) {
    return { code: 'tools', message: 'Automatic completion cannot use crafting tools.' };
  }
  const activeCheck = resolveActiveCraftingCheckFormula(system);
  if (activeCheck.requiresCheck || activeCheck.checkUsable) {
    return {
      code: 'playerCheck',
      message: 'Automatic completion cannot resolve a player check.',
    };
  }
  return null;
}

/**
 * Whether the world clock will finish this crafting run's current stage: the world-time scan takes
 * it once its gate passes, and that stage, read with the selection and the recipe's system a timed
 * execute reads, carries no automatic blocker. `claimability` is the settle's owed-pick rule.
 */
export function completesAsTimePasses({ run, recipe, getSystem, claimability }) {
  const owesAwardChoice = () => owesClaimablePick(run, claimability);
  const runStep = worldTimeDueStep(run, { owesAwardChoice });
  if (!runStep) return false;
  const steps = typeof recipe?.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
  const step = steps[Number(run.currentStepIndex)];
  const selectedSet = stageIngredientSet(step, runStep.selectionPlan?.selectedIngredientSetId);
  if (!step || !selectedSet) return false;
  const system = getSystem(recipe?.craftingSystemId);
  return automaticStageBlocker({ run, recipe, step, selectedSet, system }) === null;
}
