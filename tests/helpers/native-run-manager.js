/**
 * A `CraftingRunManager` double for a legacy (native) crafting run.
 *
 * @param {object} [options] `stepCount`/`stepIndex` shape the run; `onSuccess`/`onFailure` spy the
 * terminal payloads.
 */
export function nativeCraftRunManager({
  stepCount = 1,
  stepIndex = 0,
  onSuccess,
  onFailure
} = {}) {
  const run = {
    id: 'run-1',
    status: 'inProgress',
    currentStepIndex: stepIndex,
    steps: Array.from({ length: Math.max(stepCount, stepIndex + 1) }, (_unused, index) => ({
      stepId: `step-${index + 1}`,
      index,
      status: index === stepIndex ? 'inProgress' : 'pending',
      consumedIngredients: [],
      usedTools: [],
      createdResults: []
    }))
  };
  const updates = [];
  let active = true;
  let discarded = false;
  const finish = (current, status) => {
    active = false;
    return { ...current, status };
  };
  return {
    findActiveRunForRecipe: () => null,
    getActiveRun: (_actor, runId) => (active && runId === run.id ? run : null),
    async createRun() {
      active = true;
      return run;
    },
    async updateRun(_actor, updated) {
      updates.push(structuredClone(updated));
      return updated;
    },
    async discardRun(_actor, runId) {
      if (!active || runId !== run.id) return null;
      active = false;
      discarded = true;
      return run;
    },
    canProceedTimeGate: () => true,
    async markStepInProgress(_actor, current) {
      return current;
    },
    async markStepWaitingForTime(_actor, current) {
      return current;
    },
    async completeStepSuccess(_actor, current, _index, payload) {
      onSuccess?.(payload);
      return finish(current, 'succeeded');
    },
    async completeStepFailure(_actor, current, _index, _reason, payload) {
      onFailure?.(payload);
      return finish(current, 'failed');
    },
    inspectDiscarded: () => discarded,
    inspectRun: () => run,
    inspectUpdates: () => updates
  };
}
