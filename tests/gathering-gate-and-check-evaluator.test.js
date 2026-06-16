import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringGateAndCheckEvaluator } from '../src/systems/GatheringGateAndCheckEvaluator.js';

function makeEvaluator({ expressionResults = new Map() } = {}) {
  const expressionCalls = [];
  const evaluator = new GatheringGateAndCheckEvaluator({
    evaluateExpression: async (payload) => {
      expressionCalls.push(payload);
      const { expression } = payload;
      const result = expressionResults instanceof Map ? expressionResults.get(expression) : expressionResults[expression];
      if (result instanceof Error) throw result;
      return result;
    }
  });

  return { evaluator, expressionCalls };
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

test('visibility compares numeric formula against threshold', async () => {
  const { evaluator, expressionCalls } = makeEvaluator({
    expressionResults: new Map([
      ['1d20 + @skills.sur.mod', 15],
      ['12', 12]
    ])
  });

  const result = await evaluator.evaluateVisibility({
    gate: { formula: '1d20 + @skills.sur.mod', threshold: '12' },
    actor,
    viewer,
    environment,
    task
  });

  assert.equal(result.visible, true);
  assert.equal(result.reasonCode, 'VISIBLE');
  assert.equal(result.diagnostic, null);
  assert.equal(expressionCalls[0].kind, 'visibilityFormula');
  assert.equal(expressionCalls[0].actor, actor);
  assert.equal(expressionCalls[0].viewer, viewer);
  assert.equal(expressionCalls[0].environment, environment);
  assert.equal(expressionCalls[0].task, task);
  assert.equal(expressionCalls[1].kind, 'visibilityThreshold');
  assert.equal(expressionCalls[1].formulaValue, 15);
  assert.equal(expressionCalls[1].viewer, viewer);
});

test('visibility accepts boolean threshold comparison outcomes', async () => {
  const { evaluator } = makeEvaluator({
    expressionResults: new Map([
      ['@skills.sur.mod', 4],
      ['@skills.sur.mod >= 6', false]
    ])
  });

  const result = await evaluator.evaluateVisibility({
    gate: { formula: '@skills.sur.mod', threshold: '@skills.sur.mod >= 6' },
    actor,
    viewer,
    environment,
    task
  });

  assert.equal(result.visible, false);
  assert.equal(result.reasonCode, 'HIDDEN');
});

test('checks preserve numeric values when threshold derives success or failure', async () => {
  const { evaluator, expressionCalls } = makeEvaluator({
    expressionResults: new Map([
      ['1d20 + @skills.nat.mod', 11],
      ['15', 15]
    ])
  });

  const result = await evaluator.evaluateCheck({
    check: { formula: '1d20 + @skills.nat.mod', threshold: '15' },
    actor,
    environment,
    task
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'failure');
  assert.equal(result.value, 11);
  assert.equal(result.reasonCode, 'CHECK_FAILURE');
  assert.equal(expressionCalls[0].kind, 'checkFormula');
  assert.equal(expressionCalls[0].actor, actor);
  assert.equal(expressionCalls[0].environment, environment);
  assert.equal(expressionCalls[0].task, task);
  assert.equal(expressionCalls[1].kind, 'checkThreshold');
  assert.equal(expressionCalls[1].formulaValue, 11);
});

test('checks tolerate absent threshold', async () => {
  const { evaluator } = makeEvaluator({
    expressionResults: new Map([['@attributes.perception.total', 7]])
  });

  const result = await evaluator.evaluateCheck({
    check: { formula: '@attributes.perception.total' },
    actor,
    environment,
    task
  });

  assert.equal(result.success, null);
  assert.equal(result.status, null);
  assert.equal(result.value, 7);
  assert.equal(result.reasonCode, 'CHECK_VALUE');
});

test('misconfigured check without formula returns a provider-free diagnostic', async () => {
  const { evaluator } = makeEvaluator();

  const misconfiguredCheck = await evaluator.evaluateCheck({
    check: { threshold: '12' },
    actor,
    environment,
    task
  });
  assert.equal(misconfiguredCheck.success, null);
  assert.equal(misconfiguredCheck.status, null);
  assert.equal(misconfiguredCheck.reasonCode, 'MISCONFIGURED_PROVIDER');
  assert.equal(misconfiguredCheck.diagnostic.provider, null);
});

test('thrown expression errors return diagnostics without raw throws', async () => {
  const { evaluator: expressionEvaluator } = makeEvaluator({
    expressionResults: new Map([
      ['@skills.sur.mod', new Error('expression exploded')]
    ])
  });

  const expressionVisibility = await expressionEvaluator.evaluateVisibility({
    gate: { formula: '@skills.sur.mod', threshold: '12' },
    actor,
    viewer,
    environment,
    task
  });
  assert.equal(expressionVisibility.visible, false);
  assert.equal(expressionVisibility.reasonCode, 'PROVIDER_ERROR');
  assert.equal(expressionVisibility.diagnostic.message, 'expression exploded');
  assert.equal(expressionVisibility.diagnostic.provider, null);

  const expressionCheck = await expressionEvaluator.evaluateCheck({
    check: { formula: '@skills.sur.mod', threshold: '12' },
    actor,
    environment,
    task
  });
  assert.equal(expressionCheck.success, null);
  assert.equal(expressionCheck.status, null);
  assert.equal(expressionCheck.reasonCode, 'PROVIDER_ERROR');
  assert.equal(expressionCheck.diagnostic.message, 'expression exploded');
});

// ---------------------------------------------------------------------------
// evaluateRequirement
// ---------------------------------------------------------------------------

test('null requirement is allowed with NO_REQUIREMENT reason', async () => {
  const { evaluator } = makeEvaluator();
  const result = await evaluator.evaluateRequirement({ actor });
  assert.equal(result.allowed, true);
  assert.equal(result.reasonCode, 'NO_REQUIREMENT');
});

test('requirement allows when expression is truthy', async () => {
  const { evaluator, expressionCalls } = makeEvaluator({
    expressionResults: new Map([['@flags.proficient', 1]])
  });
  const result = await evaluator.evaluateRequirement({
    requirement: { formula: '@flags.proficient' },
    actor
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reasonCode, 'REQUIREMENT_MET');
  assert.equal(expressionCalls[0].kind, 'toolRequirement');
});

test('requirement blocks when expression is zero', async () => {
  const { evaluator } = makeEvaluator({
    expressionResults: new Map([['@flags.proficient', 0]])
  });
  const result = await evaluator.evaluateRequirement({
    requirement: { formula: '@flags.proficient' },
    actor
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'REQUIREMENT_FAILED');
});

test('requirement blocks when expression returns boolean false', async () => {
  const { evaluator } = makeEvaluator({
    expressionResults: new Map([['@flags.proficient', false]])
  });
  const result = await evaluator.evaluateRequirement({
    requirement: { formula: '@flags.proficient' },
    actor
  });
  assert.equal(result.allowed, false);
});

test('requirement without formula is misconfigured', async () => {
  const { evaluator } = makeEvaluator();
  const result = await evaluator.evaluateRequirement({
    requirement: { formula: '' },
    actor
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'MISCONFIGURED_PROVIDER');
  assert.equal(result.diagnostic.provider, null);
});
