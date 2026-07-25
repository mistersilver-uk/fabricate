import test from 'node:test';
import assert from 'node:assert/strict';

const {
  appendToolBonusTerms,
  composeToolBonusTerms,
  evaluateToolCheckContribution,
  evaluateToolPrerequisiteGate,
  ingredientSetToolsAreActive,
  resolveToolPrerequisites,
} = await import('../src/systems/toolCheckBonus.js');

const definitions = [
  { id: 'strong', path: 'abilities.str', op: 'gte', value: 2 },
  { id: 'trained', path: 'skills.craft', op: 'gte', value: 1 },
];

function actor(id, values = {}) {
  return { id, values };
}

function prerequisiteEvaluator({ actor: boundActor, prerequisite }) {
  return Number(boundActor?.values?.[prerequisite.path] || 0) >= Number(prerequisite.value || 0);
}

test('resolveToolPrerequisites preserves selected order and reports stale ids', () => {
  assert.deepEqual(
    resolveToolPrerequisites({ prerequisiteIds: ['trained', 'missing', 'strong'], definitions }),
    {
      resolved: [definitions[1], definitions[0]],
      unresolvedIds: ['missing'],
    }
  );
});

test('enabled prerequisite gates use AND semantics and unresolved ids fail closed', async () => {
  const result = await evaluateToolPrerequisiteGate({
    tool: {
      prerequisites: {
        enabled: true,
        ids: ['strong', 'trained', 'missing'],
        gateMode: 'usability',
      },
    },
    actor: actor('primary', { 'abilities.str': 3, 'skills.craft': 2 }),
    prerequisiteDefinitions: definitions,
    evaluatePrerequisite: prerequisiteEvaluator,
  });

  assert.equal(result.prerequisitesPassed, false);
  assert.equal(result.usable, false);
  assert.equal(result.bonusEligible, false);
  assert.deepEqual(result.unresolvedIds, ['missing']);
});

test('an enabled empty prerequisite selection fails closed', async () => {
  const result = await evaluateToolPrerequisiteGate({
    tool: { prerequisites: { enabled: true, ids: [], gateMode: 'usability' } },
    actor: actor('primary'),
    prerequisiteDefinitions: definitions,
    evaluatePrerequisite: prerequisiteEvaluator,
  });

  assert.equal(result.prerequisitesPassed, false);
  assert.equal(result.usable, false);
});

test('disabled gates retain ids without evaluating or blocking', async () => {
  let calls = 0;
  const result = await evaluateToolPrerequisiteGate({
    tool: { prerequisites: { enabled: false, ids: ['strong'], gateMode: 'usability' } },
    actor: actor('primary'),
    prerequisiteDefinitions: definitions,
    evaluatePrerequisite: () => {
      calls += 1;
      return false;
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.usable, true);
  assert.equal(result.bonusEligible, true);
});

test('bonus-only failure preserves usability while suppressing the bonus', async () => {
  const result = await evaluateToolPrerequisiteGate({
    tool: { prerequisites: { enabled: true, ids: ['strong'], gateMode: 'bonus' } },
    actor: actor('primary', { 'abilities.str': 0 }),
    prerequisiteDefinitions: definitions,
    evaluatePrerequisite: prerequisiteEvaluator,
  });

  assert.equal(result.usable, true);
  assert.equal(result.bonusEligible, false);
});

test('owned contribution binds prerequisite and bonus evaluation to the matched item actor', async () => {
  const primaryActor = actor('primary', { 'abilities.str': 10 });
  const owner = actor('owner', { 'abilities.str': 3 });
  const seenActors = [];
  const result = await evaluateToolCheckContribution({
    tool: {
      id: 'hammer',
      label: 'Hammer',
      prerequisites: { enabled: true, ids: ['strong'], gateMode: 'usability' },
      bonus: { enabled: true, expression: '@abilities.str' },
    },
    matchedItem: { parent: owner },
    primaryActor,
    prerequisiteDefinitions: definitions,
    evaluatePrerequisite: (payload) => {
      seenActors.push(payload.actor);
      return prerequisiteEvaluator(payload);
    },
    evaluateExpression: ({ actor: boundActor }) => {
      seenActors.push(boundActor);
      return boundActor.values['abilities.str'];
    },
  });

  assert.equal(result.actor, owner);
  assert.equal(result.usable, true);
  assert.equal(result.value, 3);
  assert.deepEqual(seenActors, [owner, owner]);
});

test('virtual-present contribution binds to the primary actor and evaluation failure yields zero', async () => {
  const primaryActor = actor('primary', { 'abilities.str': 4 });
  const result = await evaluateToolCheckContribution({
    tool: {
      id: 'virtual',
      prerequisites: { enabled: true, ids: ['strong'], gateMode: 'bonus' },
      bonus: { enabled: true, expression: 'bad' },
    },
    primaryActor,
    prerequisiteDefinitions: definitions,
    evaluatePrerequisite: prerequisiteEvaluator,
    evaluateExpression: () => {
      throw new Error('bad expression');
    },
  });

  assert.equal(result.actor, primaryActor);
  assert.equal(result.usable, true);
  assert.equal(result.value, 0);
});

test('disabled Tools never evaluate or contribute their bonus', async () => {
  let evaluations = 0;
  const result = await evaluateToolCheckContribution({
    tool: {
      id: 'disabled',
      enabled: false,
      prerequisites: { enabled: false, ids: [], gateMode: 'bonus' },
      bonus: { enabled: true, expression: '@abilities.str' },
    },
    primaryActor: actor('primary', { 'abilities.str': 4 }),
    evaluateExpression: () => {
      evaluations += 1;
      return 4;
    },
  });

  assert.equal(evaluations, 0);
  assert.equal(result.value, 0);
});

test('composition adds every finite non-zero contribution', () => {
  const composed = composeToolBonusTerms([
    { toolId: 'a', label: 'A', value: 2 },
    { toolId: 'b', label: 'B', value: 5 },
    { toolId: 'penalty', label: 'Penalty', value: -2 },
    { toolId: 'zero', label: 'Zero', value: 0 },
  ]);

  assert.equal(composed.total, 5);
  assert.deepEqual(
    composed.terms.map((term) => term.toolId),
    ['a', 'b', 'penalty']
  );
});

test('Ingredient Set Tool references require routed-by-ingredients and a non-blank name', () => {
  assert.equal(
    ingredientSetToolsAreActive({ resolutionMode: 'routedByIngredients' }, { name: ' Ore route ' }),
    true
  );
  assert.equal(
    ingredientSetToolsAreActive({ resolutionMode: 'simple' }, { name: 'Ore route' }),
    false
  );
  assert.equal(
    ingredientSetToolsAreActive({ resolutionMode: 'routedByIngredients' }, { name: '  ' }),
    false
  );
});

test('labeled formula terms strip bracket and control characters', () => {
  const controlCharacters = String.fromCodePoint(0, 9, 10, 31, 127);
  assert.equal(
    appendToolBonusTerms('1d20', [{ label: `Odd${controlCharacters}[Tool]\nName`, value: 3 }]),
    '1d20 + 3[Odd Tool Name]'
  );
});
