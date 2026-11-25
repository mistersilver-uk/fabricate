/**
 * The recipe editor's step handlers, over the root's in-flight recipe draft. `draft` is a thunk read
 * at each call, so a handler sees what the previous patch left; `patch(partial)` stages a change,
 * `confirm(options)` resolves truthy to proceed, and `text`/`localize` are the root's localizers.
 * A confirming handler reads the draft again once `confirm` resolves, because `DialogV2` is not
 * modal and the GM can edit while it is open.
 */

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

function deletePrompt(step, context, { text, localize }) {
  const name =
    String(step.name || '').trim() ||
    text('FABRICATE.Admin.Manager.Recipe.UnnamedStep', 'this step');
  const alsoDeleted = localize(
    DELETE_ALSO_KEYS[context] || 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoAll'
  );
  return {
    title: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepTitle'),
    content: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepContent', { name, alsoDeleted }),
    confirmLabel: localize('FABRICATE.Admin.Manager.Recipe.DeleteStep'),
  };
}

export function createRecipeStepHandlers({ draft, patch, confirm, text, localize }) {
  function currentSteps() {
    const recipe = draft();
    return Array.isArray(recipe?.steps) ? [...recipe.steps] : [];
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
    patch({ steps: [seeded] });
    return true;
  }

  // Reverting multi-step → single-step discards the per-step authoring, so warn
  // before staging the empty steps array (engine falls back to top-level fields).
  async function handleRevertToSingleStep() {
    const recipe = draft();
    if (!recipe) return false;
    const confirmed = await confirm?.(revertPrompt(recipe, { text, localize }));
    if (!confirmed || !draft()) return false;
    patch({ steps: [] });
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
    patch({ steps });
    return true;
  }

  function handleReorderSteps(from, to) {
    if (!draft()) return false;
    const steps = currentSteps();
    if (from < 0 || to < 0 || from >= steps.length || to >= steps.length || from === to)
      return false;
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    patch({ steps });
    return true;
  }

  function handleUpdateStep(stepId, stepPatch) {
    if (!draft() || !stepPatch) return false;
    const steps = currentSteps().map((step) =>
      step.id === stepId ? { ...step, ...stepPatch } : step
    );
    patch({ steps });
    return true;
  }

  // Deleting a step removes the whole step (its ingredients, results, and tools).
  async function handleDeleteStep(stepId, context = 'overview') {
    if (!draft()) return false;
    const step = currentSteps().find((entry) => entry?.id === stepId);
    if (!step) return false;
    const confirmed = await confirm?.(deletePrompt(step, context, { text, localize }));
    if (!confirmed || !draft()) return false;
    const steps = currentSteps();
    if (!steps.some((entry) => entry?.id === stepId)) return false;
    patch({ steps: steps.filter((entry) => entry?.id !== stepId) });
    return true;
  }

  return {
    handleEnterMultiStep,
    handleRevertToSingleStep,
    handleAddStep,
    handleReorderSteps,
    handleUpdateStep,
    handleDeleteStep,
  };
}
