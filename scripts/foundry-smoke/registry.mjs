/**
 * The smoke walk as data, in walk order. A group scenario owns an error or phase boundary and runs
 * its `children` through `runChildren`; only the descriptors listed here are registry entries.
 * No cleanup or teardown entry appears: cleanup runs from the runner's `finally`, off the walk.
 */

import bootAndJoin from './scenarios/boot-and-join.mjs';
import phaseBActorsItems from './scenarios/phase-b-actors-items.mjs';
import phaseCCraftingSystem from './scenarios/phase-c-crafting-system.mjs';

export const SMOKE_SCENARIOS = Object.freeze([
  bootAndJoin,
  phaseBActorsItems,
  phaseCCraftingSystem
]);

function flattenScenarioIds(scenarios) {
  return scenarios.flatMap((scenario) => [
    scenario.id,
    ...flattenScenarioIds(scenario.children ?? [])
  ]);
}

export const SMOKE_SCENARIO_IDS = Object.freeze(flattenScenarioIds(SMOKE_SCENARIOS));
