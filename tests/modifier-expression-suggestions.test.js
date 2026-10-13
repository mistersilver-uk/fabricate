/**
 * The modifier expression suggestions (issue 1096): the terms offered are derived from the active
 * world. How a pressed term joins an expression is the expression field's, pinned by
 * `tests/components/expr-input-mounted.test.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getModifierExpressionSuggestions } from '../src/config/modifierExpressionSuggestions.js';

/** The expressions offered, in row order. */
function expressionsFor(foundrySystemId) {
  return getModifierExpressionSuggestions(foundrySystemId).map((s) => s.expression);
}

test('the system-specific chips carry the ACTIVE world’s roll-data paths, not one world’s', () => {
  const dnd5e = expressionsFor('dnd5e');
  const pf2e = expressionsFor('pf2e');

  assert.ok(
    dnd5e.includes('@abilities.wis.mod'),
    'a dnd5e world is offered the dnd5e wisdom path'
  );
  assert.ok(
    pf2e.includes('@actor.system.abilities.wis.mod'),
    'a pf2e world is offered the pf2e wisdom path, which is a DIFFERENT string'
  );
  assert.ok(
    !pf2e.includes('@abilities.wis.mod'),
    'and never the dnd5e one, which resolves to nothing there'
  );
  assert.ok(
    !dnd5e.includes('@actor.system.abilities.wis.mod'),
    'nor the converse'
  );

  // Both worlds must also offer their own SKILL path, so the row is not one lucky ability
  // key that happens to be spelled the same way twice.
  assert.ok(dnd5e.includes('@skills.sur.total'), 'dnd5e survival is the dnd5e skill shape');
  assert.ok(
    pf2e.includes('@actor.system.skills.survival.totalModifier'),
    'pf2e survival is the pf2e skill shape'
  );
});

test('an unsupported world is offered the system-agnostic terms ALONE, never another world’s paths', () => {
  const suggestions = getModifierExpressionSuggestions('shadowdark');

  assert.ok(suggestions.length > 0, 'the row is not empty — a die and a flat bonus always apply');
  assert.ok(
    suggestions.every((s) => s.systemSpecific === false),
    'nothing in an unknown world is system-specific'
  );
  assert.ok(
    suggestions.every((s) => !s.expression.includes('@')),
    'and no roll-data path is offered, because none is known to resolve'
  );
  assert.deepEqual(
    suggestions.map((s) => s.expression),
    getModifierExpressionSuggestions('').map((s) => s.expression),
    'an absent system id behaves the same as an unrecognised one'
  );
});

test('the row leads with the system-specific terms and every chip carries a distinct id', () => {
  const suggestions = getModifierExpressionSuggestions('dnd5e');
  const specific = suggestions.filter((s) => s.systemSpecific).length;

  assert.ok(specific > 0, 'a supported world contributes chips');
  assert.ok(
    suggestions.slice(0, specific).every((s) => s.systemSpecific),
    'the system-specific chips lead the row'
  );
  assert.ok(
    suggestions.slice(specific).every((s) => !s.systemSpecific),
    'and the agnostic ones trail it'
  );
  assert.equal(
    new Set(suggestions.map((s) => s.id)).size,
    suggestions.length,
    'ids are unique — they key the `{#each}`'
  );
  assert.ok(
    suggestions.every((s) => s.label && s.expression),
    'every chip has both a human label and a term to append'
  );
});
