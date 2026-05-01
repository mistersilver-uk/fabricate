import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringGateAndCheckEvaluator } from '../src/systems/GatheringGateAndCheckEvaluator.js';

function makeEvaluator({ macroResults = new Map(), expressionResults = new Map() } = {}) {
  const macroCalls = [];
  const expressionCalls = [];
  const evaluator = new GatheringGateAndCheckEvaluator({
    runMacro: async (macroUuid, context) => {
      macroCalls.push({ macroUuid, context });
      const result = macroResults instanceof Map ? macroResults.get(macroUuid) : macroResults[macroUuid];
      if (result instanceof Error) throw result;
      return result;
    },
    evaluateExpression: async (payload) => {
      expressionCalls.push(payload);
      const { provider, expression } = payload;
      const key = `${provider}:${expression}`;
      const result = expressionResults instanceof Map ? expressionResults.get(key) : expressionResults[key];
      if (result instanceof Error) throw result;
      return result;
    }
  });

  return { evaluator, macroCalls, expressionCalls };
}

const actor = { id: 'actor-1', name: 'Test Actor' };
const viewer = { id: 'user-1' };
const environment = { id: 'env-1', name: 'Old Mine' };
const task = { id: 'task-1', name: 'Gather Iron' };

test('no visibility gate returns visible', async () => {
  const { evaluator } = makeEvaluator();

  const result = await evaluator.evaluateVisibility({ actor, viewer, environment, task });

  assert.equal(result.visible, true);
  assert.equal(result.reasonCode, 'NO_VISIBILITY_GATE');
  assert.equal(result.diagnostic, null);
});

test('macro visibility accepts boolean returns', async () => {
  const { evaluator, macroCalls } = makeEvaluator({
    macroResults: new Map([['Macro.visible', true]])
  });

  const result = await evaluator.evaluateVisibility({
    gate: { provider: 'macro', macroUuid: 'Macro.visible' },
    actor,
    viewer,
    environment,
    task
  });

  assert.equal(result.visible, true);
  assert.equal(result.reasonCode, 'VISIBLE');
  assert.equal(macroCalls[0].macroUuid, 'Macro.visible');
  assert.equal(macroCalls[0].context.actor, actor);
});

test('macro visibility accepts object returns with description', async () => {
  const { evaluator } = makeEvaluator({
    macroResults: new Map([['Macro.hidden', { visible: false, description: 'Too dark.' }]])
  });

  const result = await evaluator.evaluateVisibility({
    gate: { provider: 'macro', macroUuid: 'Macro.hidden' },
    actor,
    viewer,
    environment,
    task
  });

  assert.equal(result.visible, false);
  assert.equal(result.description, 'Too dark.');
  assert.equal(result.reasonCode, 'HIDDEN');
});

test('macro visibility malformed returns become blocked diagnostics', async () => {
  const { evaluator } = makeEvaluator({
    macroResults: new Map([['Macro.bad', { description: 'missing visible' }]])
  });

  const result = await evaluator.evaluateVisibility({
    gate: { provider: 'macro', macroUuid: 'Macro.bad' },
    actor,
    viewer,
    environment,
    task
  });

  assert.equal(result.visible, false);
  assert.equal(result.reasonCode, 'MALFORMED_RESULT');
  assert.equal(result.diagnostic.provider, 'macro');
});

test('dnd5e and pf2e visibility compare numeric formula against threshold', async () => {
  for (const provider of ['dnd5e', 'pf2e']) {
    const { evaluator, expressionCalls } = makeEvaluator({
      expressionResults: new Map([
        [`${provider}:1d20 + @skills.sur.mod`, 15],
        [`${provider}:12`, 12]
      ])
    });

    const result = await evaluator.evaluateVisibility({
      gate: { provider, formula: '1d20 + @skills.sur.mod', threshold: '12' },
      actor,
      viewer,
      environment,
      task
    });

    assert.equal(result.visible, true);
    assert.equal(result.reasonCode, 'VISIBLE');
    assert.equal(result.diagnostic, null);
    assert.equal(expressionCalls[0].kind, 'visibilityFormula');
    assert.equal(expressionCalls[0].provider, provider);
    assert.equal(expressionCalls[0].actor, actor);
    assert.equal(expressionCalls[0].viewer, viewer);
    assert.equal(expressionCalls[0].environment, environment);
    assert.equal(expressionCalls[0].task, task);
    assert.equal(expressionCalls[1].kind, 'visibilityThreshold');
    assert.equal(expressionCalls[1].formulaValue, 15);
    assert.equal(expressionCalls[1].viewer, viewer);
  }
});

test('dnd5e and pf2e visibility accept boolean threshold comparison outcomes', async () => {
  for (const provider of ['dnd5e', 'pf2e']) {
    const { evaluator } = makeEvaluator({
      expressionResults: new Map([
        [`${provider}:@skills.sur.mod`, 4],
        [`${provider}:@skills.sur.mod >= 6`, false]
      ])
    });

    const result = await evaluator.evaluateVisibility({
      gate: { provider, formula: '@skills.sur.mod', threshold: '@skills.sur.mod >= 6' },
      actor,
      viewer,
      environment,
      task
    });

    assert.equal(result.visible, false);
    assert.equal(result.reasonCode, 'HIDDEN');
  }
});

test('macro check returns numeric value and optional status', async () => {
  const { evaluator } = makeEvaluator({
    macroResults: new Map([['Macro.check', { value: 18, status: 'success', description: 'Found a vein.', data: { die: 17 } }]])
  });

  const result = await evaluator.evaluateCheck({
    check: { provider: 'macro', macroUuid: 'Macro.check' },
    actor,
    environment,
    task
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'success');
  assert.equal(result.value, 18);
  assert.equal(result.description, 'Found a vein.');
  assert.deepEqual(result.data, { die: 17 });
});

test('macro check with value only remains neutral', async () => {
  const { evaluator } = makeEvaluator({
    macroResults: new Map([['Macro.valueOnly', { value: 14, description: 'Measured progress.' }]])
  });

  const result = await evaluator.evaluateCheck({
    check: { provider: 'macro', macroUuid: 'Macro.valueOnly' },
    actor,
    environment,
    task
  });

  assert.equal(result.success, null);
  assert.equal(result.status, null);
  assert.equal(result.value, 14);
  assert.equal(result.description, 'Measured progress.');
  assert.equal(result.reasonCode, 'CHECK_VALUE');
});

test('macro check failure status normalizes to terminal failure result', async () => {
  const { evaluator } = makeEvaluator({
    macroResults: new Map([['Macro.fail', { value: 3, status: 'failed', description: 'No useful finds.' }]])
  });

  const result = await evaluator.evaluateCheck({
    check: { provider: 'macro', macroUuid: 'Macro.fail' },
    actor,
    environment,
    task
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'failure');
  assert.equal(result.value, 3);
  assert.equal(result.reasonCode, 'CHECK_FAILURE');
});

test('macro check rejects bare numeric returns and conflicting terminal hints', async () => {
  const { evaluator: numericEvaluator } = makeEvaluator({
    macroResults: new Map([['Macro.numeric', 12]])
  });

  const numeric = await numericEvaluator.evaluateCheck({
    check: { provider: 'macro', macroUuid: 'Macro.numeric' },
    actor,
    environment,
    task
  });

  assert.equal(numeric.success, null);
  assert.equal(numeric.status, null);
  assert.equal(numeric.value, 12);
  assert.equal(numeric.reasonCode, 'MALFORMED_RESULT');
  assert.equal(numeric.diagnostic.provider, 'macro');

  const { evaluator: conflictEvaluator } = makeEvaluator({
    macroResults: new Map([['Macro.conflict', { value: 9, status: 'failure', success: true }]])
  });

  const conflict = await conflictEvaluator.evaluateCheck({
    check: { provider: 'macro', macroUuid: 'Macro.conflict' },
    actor,
    environment,
    task
  });

  assert.equal(conflict.success, null);
  assert.equal(conflict.status, null);
  assert.equal(conflict.value, 9);
  assert.equal(conflict.reasonCode, 'MALFORMED_RESULT');
  assert.match(conflict.diagnostic.message, /conflicts/);
});

test('macro check rejects missing or non-finite value', async () => {
  for (const [macroUuid, macroReturn] of [
    ['Macro.missingValue', { status: 'success' }],
    ['Macro.nanValue', { value: Number.NaN, status: 'success' }],
    ['Macro.infinityValue', { value: Number.POSITIVE_INFINITY, status: 'success' }]
  ]) {
    const { evaluator } = makeEvaluator({
      macroResults: new Map([[macroUuid, macroReturn]])
    });

    const result = await evaluator.evaluateCheck({
      check: { provider: 'macro', macroUuid },
      actor,
      environment,
      task
    });

    assert.equal(result.success, null);
    assert.equal(result.status, null);
    assert.equal(result.value, null);
    assert.equal(result.reasonCode, 'MALFORMED_RESULT');
    assert.equal(result.diagnostic.provider, 'macro');
  }
});

test('dnd5e and pf2e checks preserve numeric values when threshold derives success or failure', async () => {
  for (const provider of ['dnd5e', 'pf2e']) {
    const { evaluator, expressionCalls } = makeEvaluator({
      expressionResults: new Map([
        [`${provider}:1d20 + @skills.nat.mod`, 11],
        [`${provider}:15`, 15]
      ])
    });

    const result = await evaluator.evaluateCheck({
      check: { provider, formula: '1d20 + @skills.nat.mod', threshold: '15' },
      actor,
      environment,
      task
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 'failure');
    assert.equal(result.value, 11);
    assert.equal(result.reasonCode, 'CHECK_FAILURE');
    assert.equal(expressionCalls[0].kind, 'checkFormula');
    assert.equal(expressionCalls[0].provider, provider);
    assert.equal(expressionCalls[0].actor, actor);
    assert.equal(expressionCalls[0].environment, environment);
    assert.equal(expressionCalls[0].task, task);
    assert.equal(expressionCalls[1].kind, 'checkThreshold');
    assert.equal(expressionCalls[1].formulaValue, 11);
  }
});

test('dnd5e and pf2e checks tolerate absent threshold', async () => {
  for (const provider of ['dnd5e', 'pf2e']) {
    const { evaluator } = makeEvaluator({
      expressionResults: new Map([[`${provider}:@attributes.perception.total`, 7]])
    });

    const result = await evaluator.evaluateCheck({
      check: { provider, formula: '@attributes.perception.total' },
      actor,
      environment,
      task
    });

    assert.equal(result.success, null);
    assert.equal(result.status, null);
    assert.equal(result.value, 7);
    assert.equal(result.reasonCode, 'CHECK_VALUE');
  }
});

test('unsupported and misconfigured providers return normalized diagnostic results', async () => {
  const { evaluator } = makeEvaluator();

  const unsupportedVisibility = await evaluator.evaluateVisibility({
    gate: { provider: 'other', formula: '1', threshold: '1' },
    actor,
    viewer,
    environment,
    task
  });
  assert.equal(unsupportedVisibility.visible, false);
  assert.equal(unsupportedVisibility.reasonCode, 'UNSUPPORTED_PROVIDER');
  assert.equal(unsupportedVisibility.diagnostic.provider, 'other');

  const misconfiguredCheck = await evaluator.evaluateCheck({
    check: { provider: 'dnd5e', threshold: '12' },
    actor,
    environment,
    task
  });
  assert.equal(misconfiguredCheck.success, null);
  assert.equal(misconfiguredCheck.status, null);
  assert.equal(misconfiguredCheck.reasonCode, 'MISCONFIGURED_PROVIDER');
  assert.equal(misconfiguredCheck.diagnostic.provider, 'dnd5e');
});

test('thrown macro and expression errors return provider diagnostics without raw throws', async () => {
  const { evaluator: macroEvaluator } = makeEvaluator({
    macroResults: new Map([['Macro.throw', new Error('macro exploded')]])
  });

  const macroVisibility = await macroEvaluator.evaluateVisibility({
    gate: { provider: 'macro', macroUuid: 'Macro.throw' },
    actor,
    viewer,
    environment,
    task
  });
  assert.equal(macroVisibility.visible, false);
  assert.equal(macroVisibility.reasonCode, 'PROVIDER_ERROR');
  assert.equal(macroVisibility.diagnostic.message, 'macro exploded');

  const macroCheck = await macroEvaluator.evaluateCheck({
    check: { provider: 'macro', macroUuid: 'Macro.throw' },
    actor,
    environment,
    task
  });
  assert.equal(macroCheck.success, null);
  assert.equal(macroCheck.status, null);
  assert.equal(macroCheck.reasonCode, 'PROVIDER_ERROR');
  assert.equal(macroCheck.diagnostic.message, 'macro exploded');

  const { evaluator: expressionEvaluator } = makeEvaluator({
    expressionResults: new Map([
      ['dnd5e:@skills.sur.mod', new Error('expression exploded')]
    ])
  });

  const expressionVisibility = await expressionEvaluator.evaluateVisibility({
    gate: { provider: 'dnd5e', formula: '@skills.sur.mod', threshold: '12' },
    actor,
    viewer,
    environment,
    task
  });
  assert.equal(expressionVisibility.visible, false);
  assert.equal(expressionVisibility.reasonCode, 'PROVIDER_ERROR');
  assert.equal(expressionVisibility.diagnostic.message, 'expression exploded');

  const expressionCheck = await expressionEvaluator.evaluateCheck({
    check: { provider: 'dnd5e', formula: '@skills.sur.mod', threshold: '12' },
    actor,
    environment,
    task
  });
  assert.equal(expressionCheck.success, null);
  assert.equal(expressionCheck.status, null);
  assert.equal(expressionCheck.reasonCode, 'PROVIDER_ERROR');
  assert.equal(expressionCheck.diagnostic.message, 'expression exploded');
});
