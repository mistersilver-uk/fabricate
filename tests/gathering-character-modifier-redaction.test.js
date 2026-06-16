import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRichState, makeEngine, environment, DEFAULT_TEST_ACTOR } from './helpers/gathering.js';

function configFor({ entries = [], tasks = [], events = [] } = {}) {
  return {
    systems: {
      'system-test': {
        rules: { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops' },
        characterModifiers: entries,
        tasks,
        events
      }
    }
  };
}

const STR_LIB = [{ id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', expression: '@abilities.str.mod' }];

const BLIND_TASK = {
  id: 'task-blind',
  name: 'Hidden Forage',
  dropRows: [{ id: 'drop-secret', componentId: 'herb', quantity: 1, dropRate: 100, characterModifiers: [{ id: 'r', modifierId: 'strength', operator: '+' }] }]
};

test('non-GM viewer of blind history sees only contribution number', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIB, tasks: [BLIND_TASK] }),
    rolls: [100],
    evaluateExpression: () => 5
  });
  const env = environment({ selectionMode: 'blind' });
  const calls = {};
  const engine = makeEngine({ richState: service, env, calls });
  const viewer = { id: 'u', isGM: false };
  const result = await engine.startAttempt({ viewer, actor: DEFAULT_TEST_ACTOR, environmentId: 'env-test' });
  assert.equal(result.accepted, true);
  const payload = calls.terminal[0].payload;
  // The snapshot should be redacted in the terminal payload
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('drop-secret'), false, 'row id must be redacted');
  assert.equal(serialized.includes('@abilities.str.mod'), false, 'effective expression must be redacted');
  assert.equal(serialized.includes('strength'), false, 'modifier id must be redacted');
  // But the numeric contribution must remain so the player sees the post-clamp number
  if (payload.characterModifierSnapshot) {
    const rows = payload.characterModifierSnapshot.rows || [];
    assert.equal(rows[0]?.rowId, null);
    assert.equal(rows[0]?.contributions[0]?.contribution, 5);
  }
});

test('GM viewer sees full evidence on the same run', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIB, tasks: [BLIND_TASK] }),
    rolls: [100],
    evaluateExpression: () => 5
  });
  const env = environment({ selectionMode: 'blind' });
  const calls = {};
  const engine = makeEngine({ richState: service, env, calls });
  const viewer = { id: 'gm', isGM: true };
  const result = await engine.startAttempt({ viewer, actor: DEFAULT_TEST_ACTOR, environmentId: 'env-test' });
  assert.equal(result.accepted, true);
  const payload = calls.terminal[0].payload;
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('drop-secret'), true, 'GM sees row id');
  if (payload.characterModifierSnapshot) {
    const evidence = payload.characterModifierSnapshot.rows[0].contributions[0];
    assert.equal(evidence.modifierId, 'strength');
    assert.equal(evidence.effectiveExpression, '@abilities.str.mod');
  }
});

test('hidden row identity is redacted in blind snapshot', async () => {
  const { service } = makeRichState({
    config: configFor({ entries: STR_LIB, tasks: [BLIND_TASK] }),
    rolls: [100],
    evaluateExpression: () => 2
  });
  const env = environment({ selectionMode: 'blind' });
  const calls = {};
  const engine = makeEngine({ richState: service, env, calls });
  const result = await engine.startAttempt({ viewer: { id: 'u', isGM: false }, actor: DEFAULT_TEST_ACTOR, environmentId: 'env-test' });
  assert.equal(result.accepted, true);
  const snapshot = calls.terminal[0].payload.characterModifierSnapshot;
  if (snapshot) {
    for (const row of snapshot.rows || []) {
      assert.equal(row.rowId, null, 'row id is redacted');
      for (const entry of row.contributions) {
        assert.equal(entry.modifierId, undefined, 'modifier id is stripped');
        assert.equal(entry.effectiveExpression, undefined, 'expression is stripped');
      }
    }
  }
});
