/**
 * The recipe editor's step handlers, over the root's in-flight recipe draft. `draft` and `iterative`
 * are thunks read at each call, so a handler sees what the previous patch left; `patch(partial)`
 * stages a change, `confirm(options)` resolves truthy to proceed, and `text`/`localize` are the
 * root's localizers. A confirming handler reads the draft again once `confirm` resolves, because
 * `DialogV2` is not modal. Under `iterative` every patch is `withIterativeStepMoved`'s.
 */
import { withIterativeStepMoved } from './iterative/iterativeStepMove.js';

/** A fresh step id, from Foundry's generator where it exists. */
export function newStepId() {
  return (
    globalThis.foundry?.utils?.randomID?.() || `step-${Math.random().toString(36).slice(2, 10)}`
  );
}

const DELETE_ALSO_KEYS = {
  ingredients: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoIngredients',
  results: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoResults',
  tools: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoTools',
};

function revertPrompt(recipe, { text, localize }) {
  const name =
    String(recipe.name || '').trim() ||
    text('FABRICATE.Admin.Manager.Recipe.UnnamedRecipe', 'this recipe');
  return {
    title: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepTitle'),
    content: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepContent', { name }),
    confirmLabel: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepConfirm'),
  };
}

const stepName = (step, index, text) =>
  String(step?.name || '').trim() ||
  `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${index + 1}`;

/** Collapse keeps step 1 whole and removes the others with their result sets. */
function collapsePrompt(steps, { text, localize }) {
  const others = steps.slice(1).map((step, index) => stepName(step, index + 1, text));
  const content =
    others.length === 1
      ? 'FABRICATE.Admin.Manager.Recipe.Iterative.CollapseContentOne'
      : 'FABRICATE.Admin.Manager.Recipe.Iterative.CollapseContent';
  return {
    title: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepTitle'),
    content: localize(content, {
      first: stepName(steps[0], 0, text),
      others: others.join(', '),
    }),
    confirmLabel: localize('FABRICATE.Admin.Manager.Recipe.Iterative.CollapseConfirm'),
  };
}

function deletePrompt(step, context, { text, localize, iterative = false }) {
  const name =
    String(step.name || '').trim() ||
    text('FABRICATE.Admin.Manager.Recipe.UnnamedStep', 'this step');
  const also = localize(
    DELETE_ALSO_KEYS[context] || 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoAll'
  );
  const alsoDeleted = iterative
    ? `${also}${localize('FABRICATE.Admin.Manager.Recipe.Iterative.DeleteStepAlso')}`
    : also;
  return {
    title: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepTitle'),
    content: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepContent', { name, alsoDeleted }),
    confirmLabel: localize('FABRICATE.Admin.Manager.Recipe.DeleteStep'),
  };
}

/** Revert or Collapse, and delete: the handlers that confirm, each reading the draft once it resolves. */
function confirmingHandlers(seams, { currentSteps, patchSteps }) {
  const { draft, patch, confirm, iterative, text, localize } = seams;

  // Collapse keeps step 1 whole, so a sole step loses nothing and is collapsed without asking.
  async function collapseToOneStep() {
    const steps = currentSteps();
    if (steps.length > 1 && !(await confirm?.(collapsePrompt(steps, { text, localize })))) {
      return false;
    }
    if (!draft()) return false;
    patchSteps([]);
    return true;
  }

  // Reverting multi-step → single-step discards the per-step authoring, so warn
  // before staging the empty steps array (engine falls back to top-level fields).
  async function handleRevertToSingleStep() {
    const recipe = draft();
    if (!recipe) return false;
    if (iterative()) return collapseToOneStep();
    const confirmed = await confirm?.(revertPrompt(recipe, { text, localize }));
    if (!confirmed || !draft()) return false;
    patch({ steps: [] });
    return true;
  }

  // Deleting a step removes the whole step (its ingredients, results, and tools). An iterative
  // recipe's sole step is never deleted: Collapse is the way back to one step.
  const deletable = (steps, stepId) =>
    steps.some((entry) => entry?.id === stepId) && !(iterative() && steps.length <= 1);

  async function handleDeleteStep(stepId, context = 'overview') {
    if (!draft()) return false;
    const step = currentSteps().find((entry) => entry?.id === stepId);
    if (!step || !deletable(currentSteps(), stepId)) return false;
    const prompt = deletePrompt(step, context, { text, localize, iterative: iterative() });
    const confirmed = await confirm?.(prompt);
    if (!confirmed || !draft()) return false;
    const steps = currentSteps();
    if (!deletable(steps, stepId)) return false;
    patchSteps(steps.filter((entry) => entry?.id !== stepId));
    return true;
  }

  return { handleRevertToSingleStep, handleDeleteStep };
}

export function createRecipeStepHandlers({ iterative = () => false, ...rest }) {
  const seams = { ...rest, iterative };
  const { draft, patch, text } = seams;
  function currentSteps() {
    const recipe = draft();
    return Array.isArray(recipe?.steps) ? [...recipe.steps] : [];
  }

  /** Stages `steps`, through the iterative move when the system is iterative. */
  function patchSteps(steps) {
    patch(iterative() ? withIterativeStepMoved(draft(), steps) : { steps });
  }

  // Enter multi-step: seed Step 1 from the draft's current top-level ingredients / results / tools
  // so an already-craftable recipe stays craftable (the engine only falls back to top-level fields
  // when the steps array is empty).
  function handleEnterMultiStep() {
    const recipe = draft();
    if (!recipe) return false;
    const seeded = {
      id: newStepId(),
      name: `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} 1`,
      description: '',
      ingredientSets: recipe.ingredientSets || [],
      resultGroups: recipe.resultGroups || [],
      toolIds: recipe.toolIds || [],
    };
    patchSteps([seeded]);
    return true;
  }

  function handleAddStep() {
    if (!draft()) return false;
    const steps = currentSteps();
    steps.push({
      id: newStepId(),
      name: `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${steps.length + 1}`,
      description: '',
    });
    patchSteps(steps);
    return true;
  }

  function handleReorderSteps(from, to) {
    if (!draft()) return false;
    const steps = currentSteps();
    if (from < 0 || to < 0 || from >= steps.length || to >= steps.length || from === to)
      return false;
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    patchSteps(steps);
    return true;
  }

  function handleUpdateStep(stepId, stepPatch) {
    if (!draft() || !stepPatch) return false;
    const steps = currentSteps().map((step) =>
      step.id === stepId ? { ...step, ...stepPatch } : step
    );
    patchSteps(steps);
    return true;
  }

  return {
    handleEnterMultiStep,
    handleAddStep,
    handleReorderSteps,
    handleUpdateStep,
    ...confirmingHandlers(seams, { currentSteps, patchSteps }),
  };
}
