/**
 * The modifier expression suggestion chips (issue 1096).
 *
 * Two things are pinned here, and the FIRST is the one that matters. A suggestion row is
 * only useful if it offers paths the ACTIVE world actually defines: `@abilities.wis.mod`
 * resolves in `dnd5e` and to nothing at all in `pf2e`, where the same value is
 * `@actor.system.abilities.wis.mod`. A hard-coded row would therefore be silently wrong in
 * every world but one, which is why the system-specific half is derived from the same
 * per-Foundry-system bundle the card's `Seed presets` button seeds from.
 *
 * The ORACLE is deliberately not the derivation. Asserting "the dnd5e chips equal
 * `getCharacterModifierPresetsForFoundrySystem('dnd5e')` filtered by id" would restate the
 * implementation and pass for any bundle at all, including an empty one. So the expected
 * roll-data paths are written out literally: the test knows what `dnd5e` and `pf2e` call a
 * wisdom modifier, and a change that stopped consulting the world would have to disagree
 * with one of them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendModifierExpressionTerm,
  getModifierExpressionSuggestions,
} from '../src/config/modifierExpressionSuggestions.js';

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

// ── Appending ────────────────────────────────────────────────────────────────────────────
// The chips BUILD an expression, so the join is the behaviour. Each case below is a way the
// naive `${current} + ${term}` produces something Foundry's Roll grammar rejects.
const APPEND_CASES = [
  {
    name: 'joins two terms with a single +',
    current: '@abilities.wis.mod',
    term: '1d4',
    expected: '@abilities.wis.mod + 1d4',
  },
  {
    name: 'an empty expression takes the term alone, with NO leading +',
    current: '',
    term: '@abilities.wis.mod',
    expected: '@abilities.wis.mod',
  },
  {
    name: 'an absent expression is treated as empty',
    current: undefined,
    term: '1d4',
    expected: '1d4',
  },
  {
    name: 'a trailing + is COMPLETED rather than doubled',
    current: '@abilities.wis.mod +',
    term: '1d4',
    expected: '@abilities.wis.mod + 1d4',
  },
  {
    name: 'so is a trailing + with the whitespace a GM actually leaves behind',
    current: '@abilities.wis.mod +   ',
    term: '1d4',
    expected: '@abilities.wis.mod + 1d4',
  },
  {
    name: 'a trailing - is respected, so the chip never turns a subtraction into an addition',
    current: '@abilities.wis.mod -',
    term: '2',
    expected: '@abilities.wis.mod - 2',
  },
  {
    name: 'an open bracket takes the term with no operator at all',
    current: 'floor((',
    term: '@abilities.wis.mod',
    expected: 'floor(( @abilities.wis.mod',
  },
  {
    name: 'an empty term leaves the expression untouched',
    current: '@abilities.wis.mod',
    term: '',
    expected: '@abilities.wis.mod',
  },
];

for (const { name, current, term, expected } of APPEND_CASES) {
  test(`appendModifierExpressionTerm ${name}`, () => {
    assert.equal(appendModifierExpressionTerm(current, term), expected);
  });
}

test('appending is cumulative — two chips build one compound expression', () => {
  const once = appendModifierExpressionTerm('', '@abilities.wis.mod');
  const twice = appendModifierExpressionTerm(once, '1d4');
  assert.equal(twice, '@abilities.wis.mod + 1d4', 'the second chip appends, it does not replace');
});
