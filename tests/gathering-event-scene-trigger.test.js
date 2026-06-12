import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';

function engineWithTrigger(captured) {
  return new GatheringEngine({
    hazardSceneTrigger: { apply: (args) => { captured.push(args); } }
  });
}

const BASE = {
  viewer: { id: 'u1' },
  actor: {},
  system: {},
  environment: {},
  task: { id: 't' }
};

test('terminal side effects forward triggered hazards to the scene trigger on success', async () => {
  const captured = [];
  const engine = engineWithTrigger(captured);
  await engine._commitTerminalSideEffects({
    ...BASE,
    outcome: { status: 'succeeded', resultGroups: [] },
    checkResult: { hazards: [{ id: 'h1', name: 'Cave-in', linkedSceneUuid: 'Scene.a' }] }
  });
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].hazards, [{ id: 'h1', name: 'Cave-in', linkedSceneUuid: 'Scene.a' }]);
});

test('terminal side effects forward triggered hazards to the scene trigger on failure', async () => {
  const captured = [];
  const engine = engineWithTrigger(captured);
  await engine._commitTerminalSideEffects({
    ...BASE,
    outcome: { status: 'failed', resultGroups: [] },
    checkResult: { hazards: [{ id: 'h2', name: 'Storm', linkedSceneUuid: 'Scene.b' }] }
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].hazards[0].linkedSceneUuid, 'Scene.b');
});
