// Shared RunModel fixtures for the Journal mounted-component tests. Centralized
// so the run-card / run-detail / journal-view suites build runs from one factory
// instead of pasting model literals (keeps new test code under the SonarCloud
// duplication budget).

/**
 * A crafting RunModel. By default it is a 2-step run gated on world time
 * (`waiting`), with a fully-populated current step detail.
 */
export function makeCraftingRun(overrides = {}) {
  const steps = overrides.steps ?? [
    {
      stepId: 's1',
      stepName: 'Brew',
      index: 0,
      status: 'waitingTime',
      timeGate: { availableAt: 1000, initiatedAt: 0, requiredSeconds: 1000 },
      detail: {
        requiredSeconds: 1000,
        primaryToolName: 'Mortar & Pestle',
        toolNames: ['Mortar & Pestle'],
        checkLabel: '1d20 vs DC 12',
        failureText: null
      },
      lastCheckResult: null
    },
    {
      stepId: 's2',
      stepName: 'Bottle',
      index: 1,
      status: 'pending',
      timeGate: null,
      detail: { requiredSeconds: null, primaryToolName: null, toolNames: [], checkLabel: null, failureText: null },
      lastCheckResult: null
    }
  ];
  return {
    id: 'run-craft-1',
    runType: 'crafting',
    status: 'waitingTime',
    derivedStatus: 'waiting',
    craftingSystemId: 'sys-1',
    craftingSystemName: 'Alchemy',
    names: { title: 'Healing Potion', subtitle: 'Alchemy' },
    redacted: false,
    img: 'icons/svg/item-bag.svg',
    stepIndex: 0,
    stepCount: steps.length,
    stepLabel: 'Step 1 of 2',
    steps,
    currentStep: steps[0],
    timeGate: steps[0]?.timeGate ?? null,
    startedAt: 100,
    updatedAt: 100,
    finishedAt: null,
    structureLabel: 'Multi-Step Recipe',
    resolutionModeLabel: 'Standard (DC)',
    recipeId: 'r1',
    taskId: null,
    flavor: '',
    failureReason: null,
    createdResults: [],
    createdResultCount: 0,
    manualAdvance: true,
    ...overrides
  };
}

/** A gathering RunModel (auto-resolve, no steps). */
export function makeGatheringRun(overrides = {}) {
  return {
    id: 'run-gather-1',
    runType: 'gathering',
    status: 'inProgress',
    derivedStatus: 'waiting',
    craftingSystemId: 'sys-1',
    craftingSystemName: 'Wilds',
    names: { title: 'Forage Herbs', subtitle: 'Wilds' },
    redacted: false,
    img: 'icons/svg/item-bag.svg',
    stepIndex: null,
    stepCount: 0,
    stepLabel: '',
    steps: [],
    currentStep: null,
    timeGate: { availableAt: 5000, initiatedAt: 0, requiredSeconds: 5000 },
    startedAt: 100,
    updatedAt: 100,
    finishedAt: null,
    structureLabel: '',
    resolutionModeLabel: '',
    recipeId: null,
    taskId: 'task-1',
    flavor: '',
    failureReason: null,
    createdResults: [],
    createdResultCount: 0,
    manualAdvance: false,
    ...overrides
  };
}

/** A succeeded terminal crafting RunModel carrying created results. */
export function makeSucceededRun(overrides = {}) {
  return makeCraftingRun({
    id: 'run-done-1',
    status: 'succeeded',
    derivedStatus: 'succeeded',
    names: { title: 'Healing Potion', subtitle: 'Alchemy' },
    timeGate: null,
    finishedAt: 4000,
    createdResults: [{ componentId: 'c1', itemUuid: 'Item.x', quantity: 3, name: 'Healing Potion', img: 'icons/svg/item-bag.svg' }],
    createdResultCount: 1,
    ...overrides
  });
}
