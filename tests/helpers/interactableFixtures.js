/** The `fabricate.interactable` fixtures the canvas suites share (issue 1704). */

import { gridScene } from './regionContainmentFakes.js';

/** A configured tool station's behaviour system, carrying every field the canvas modules read. */
export function interactableSystem(overrides = {}) {
  return {
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    systemId: 'sysA',
    toolId: 'tool-1',
    taskId: null,
    environmentId: null,
    name: 'Forge Anvil',
    presentation: { promptText: 'Use the forge', hidden: false },
    linkedVisual: { uuid: null, documentName: null, mode: 'marker', missingPolicy: 'warn' },
    node: null,
    state: {
      enabled: true,
      consumed: false,
      locked: false,
      uses: { max: null, used: 0 },
      cooldown: { seconds: null, lastUsedWorldTime: null },
    },
    activation: { trigger: 'regionEnter', audience: 'players' },
    ...overrides,
  };
}

/** Behaviour `beh-1` on region `region-1` of scene `scene-1`, reachable by id and by parent. */
export function placedBehavior({ system = interactableSystem(), tokens = [] } = {}) {
  const scene = gridScene({ id: 'scene-1', tokens });
  const region = { id: 'region-1', uuid: 'Scene.scene-1.Region.region-1', parent: scene };
  const behavior = { id: 'beh-1', type: 'fabricate.interactable', system, parent: region };
  region.behaviors = { get: (id) => (id === 'beh-1' ? behavior : null), contents: [behavior] };
  scene.regions = { get: (id) => (id === 'region-1' ? region : null), contents: [region] };
  return behavior;
}

/** A tool drop as `classifyInteractableDrop` classifies it. */
export function toolClassification(overrides = {}) {
  return {
    interactableType: 'tool',
    systemId: 'sysA',
    referenceId: 'tool-1',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    entry: { id: 'tool-1', componentId: 'comp-axe', label: 'Forge Anvil' },
    ...overrides,
  };
}

/** Its gathering-task sibling. */
export function taskClassification() {
  return {
    interactableType: 'gatheringTask',
    systemId: 'sysA',
    referenceId: 'task-9',
    sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
    entry: { id: 'task-9', name: 'Chop Wood' },
  };
}
