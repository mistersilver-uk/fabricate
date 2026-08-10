import test from 'node:test';
import assert from 'node:assert/strict';

const {
  appendCheckModifierTerm,
  appendToolBonusTerms,
  CHECK_MODIFIER_TERM_LABEL,
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

// ── appendCheckModifierTerm (issue 1094) ────────────────────────────────────

test('the check-modifier flavour label is the fixed ASCII literal Modifiers', () => {
  // Deliberately NOT localized, and this is a correctness constraint rather than an i18n
  // oversight: the label lands inside a roll formula, and `parsePlainDiceGroups` splits on
  // flavour brackets, so a localized label containing a `\d*d\d+` token would be tokenized
  // as a phantom crit-eligible die group — a tokenizer that also backs `hasPlainD20` and
  // `applyD20Advantage`.
  assert.equal(CHECK_MODIFIER_TERM_LABEL, 'Modifiers');
});

test('appendCheckModifierTerm appends one flavoured term, sign-split', () => {
  assert.equal(appendCheckModifierTerm('1d20', { value: 3 }), '1d20 + 3[Modifiers]');
  // `Constant` is unsigned, so `+ -2[Modifiers]` would not parse but `- 2[Modifiers]` does.
  assert.equal(appendCheckModifierTerm('1d20', { value: -2 }), '1d20 - 2[Modifiers]');
});

test('appendCheckModifierTerm SKIPS a zero term, leaving the formula trimmed but intact', () => {
  assert.equal(appendCheckModifierTerm('  1d20 + @prof  ', { value: 0 }), '1d20 + @prof');
});

test('appendCheckModifierTerm appends a fractional value, which the grammar accepts', () => {
  assert.equal(appendCheckModifierTerm('1d20', { value: 1.5 }), '1d20 + 1.5[Modifiers]');
  assert.equal(appendCheckModifierTerm('1d20', { value: -0.25 }), '1d20 - 0.25[Modifiers]');
});

// A7. `Constant = _ [0-9]+ ("." [0-9]+)?` has NO exponent production, so `+ 1e-7[Modifiers]`
// parses as `StringTerm("1e")` minus `NumericTerm(7[Modifiers])` and THROWS at evaluate
// (`allowStrings` defaults false). The term is skipped rather than rounded: a check
// modifier is the GM's arithmetic, and silently substituting a different number is worse
// than contributing nothing.
test('appendCheckModifierTerm SKIPS a value that stringifies to exponent notation', () => {
  for (const value of [1e-7, -1e-7, 1e21, -1e21, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.equal(
      appendCheckModifierTerm('1d20', { value }),
      '1d20',
      `${value} must not be emitted as a Constant`
    );
  }
});

test('appendCheckModifierTerm SKIPS a non-finite or non-numeric value', () => {
  for (const value of [Number.NaN, Infinity, -Infinity, undefined, null, 'three', {}]) {
    assert.equal(appendCheckModifierTerm('1d20', { value }), '1d20');
  }
  assert.equal(appendCheckModifierTerm('1d20'), '1d20', 'no term bag at all');
});

test('appendCheckModifierTerm keeps an empty formula empty', () => {
  assert.equal(appendCheckModifierTerm('', { value: 3 }), '');
  assert.equal(appendCheckModifierTerm('   ', { value: 3 }), '');
});

// ONE implementation, not two. The delegation is what keeps the sign split, the bracketing,
// `sanitizeTermLabel` and the zero-skip from drifting between the tool and modifier paths.
test('appendCheckModifierTerm emits exactly what appendToolBonusTerms emits for one term', () => {
  for (const value of [3, -2, 1.5, 0]) {
    assert.equal(
      appendCheckModifierTerm('1d20 + 1[Kit]', { value }),
      appendToolBonusTerms('1d20 + 1[Kit]', [{ value, label: CHECK_MODIFIER_TERM_LABEL }])
    );
  }
});

test('appendCheckModifierTerm sanitizes an overridden label the same way tool bonuses do', () => {
  const controlCharacters = String.fromCodePoint(0, 9, 10, 31, 127);
  assert.equal(
    appendCheckModifierTerm('1d20', { value: 2, label: `Mo${controlCharacters}[d]s` }),
    '1d20 + 2[Mo ds]'
  );
});
