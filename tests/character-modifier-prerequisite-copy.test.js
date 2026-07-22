import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapModifierToPrerequisite,
  mapPrerequisiteToModifier,
  stripExpressionSigil,
} from '../src/systems/characterModifierPrerequisiteCopy.js';
import {
  DEFAULT_PREREQUISITE_OPERATOR,
  normalizeCharacterPrerequisite,
} from '../src/systems/characterPrerequisites.js';

// The gathering modifier normalizer is store-private, so this local mirror asserts
// the mapped modifier partial survives the SAME shape the store normalizer produces
// ({ id, label, icon, expression }). Kept minimal on purpose — the real normalizer
// is exercised by the store tests; here we only need to prove the copy output is a
// valid modifier partial.
function normalizeModifierLike(partial, id = 'generated-id') {
  return {
    id,
    label: String(partial.label || id),
    icon: String(partial.icon || 'fa-solid fa-user'),
    expression: String(partial.expression ?? '').trim(),
  };
}

describe('stripExpressionSigil (issue 768 inline summary display)', () => {
  it('strips a single leading @ from a bare path expression', () => {
    assert.equal(stripExpressionSigil('@skills.nature.value'), 'skills.nature.value');
  });

  it('leaves a @-less expression unchanged', () => {
    assert.equal(stripExpressionSigil('1d4'), '1d4');
  });

  it('strips only the leading @ of a compound formula', () => {
    assert.equal(stripExpressionSigil('@abilities.str.mod + 1d4'), 'abilities.str.mod + 1d4');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(stripExpressionSigil('  @a.b  '), 'a.b');
  });

  it('returns an empty string for nullish or empty input', () => {
    assert.equal(stripExpressionSigil(''), '');
    assert.equal(stripExpressionSigil(null), '');
    assert.equal(stripExpressionSigil(undefined), '');
  });
});

describe('mapModifierToPrerequisite (issue 768)', () => {
  it('carries label→name and icon→icon cleanly', () => {
    const result = mapModifierToPrerequisite({
      id: 'mod-1',
      label: 'Herbalism',
      icon: 'fa-solid fa-leaf',
      expression: '@skills.nature.value',
    });
    assert.equal(result.name, 'Herbalism');
    assert.equal(result.icon, 'fa-solid fa-leaf');
  });

  it('strips a single leading @ from a bare expression to form the path', () => {
    const result = mapModifierToPrerequisite({ expression: '@skills.cra.rank' });
    assert.equal(result.path, 'skills.cra.rank');
  });

  it('leaves a compound formula as-is (minus a leading @) for the GM to fix', () => {
    const result = mapModifierToPrerequisite({ expression: '@abilities.str.mod + 1d4' });
    assert.equal(result.path, 'abilities.str.mod + 1d4');
  });

  it('defaults op to the shared default and value to null (dropped roll logic)', () => {
    const result = mapModifierToPrerequisite({ label: 'X', expression: '@a.b' });
    assert.equal(result.op, DEFAULT_PREREQUISITE_OPERATOR);
    assert.equal(result.value, null);
  });

  it('never carries the source id', () => {
    const result = mapModifierToPrerequisite({ id: 'mod-1', label: 'X' });
    assert.ok(!('id' in result), 'id is not copied — the destination add op assigns a fresh one');
  });

  it('tolerates a non-object input', () => {
    const result = mapModifierToPrerequisite(null);
    assert.equal(result.name, '');
    assert.equal(result.path, '');
    assert.equal(result.op, DEFAULT_PREREQUISITE_OPERATOR);
  });

  it('produces output valid under the prerequisite normalizer', () => {
    const partial = mapModifierToPrerequisite({
      label: 'Alchemy',
      icon: 'fa-solid fa-flask',
      expression: '@skills.alchemy.value',
    });
    const normalized = normalizeCharacterPrerequisite({ id: 'p1', ...partial });
    assert.equal(normalized.id, 'p1');
    assert.equal(normalized.name, 'Alchemy');
    assert.equal(normalized.icon, 'fa-solid fa-flask');
    assert.equal(normalized.path, 'skills.alchemy.value');
    assert.equal(normalized.op, DEFAULT_PREREQUISITE_OPERATOR);
    assert.equal(normalized.value, null);
  });
});

describe('mapPrerequisiteToModifier (issue 768)', () => {
  it('carries name→label and icon→icon cleanly', () => {
    const result = mapPrerequisiteToModifier({
      id: 'p1',
      name: 'Trained',
      icon: 'fa-solid fa-graduation-cap',
      path: 'skills.cra.rank',
      op: 'gte',
      value: 2,
    });
    assert.equal(result.label, 'Trained');
    assert.equal(result.icon, 'fa-solid fa-graduation-cap');
  });

  it('re-adds a leading @ to form the expression from a bare path', () => {
    const result = mapPrerequisiteToModifier({ path: 'skills.cra.rank' });
    assert.equal(result.expression, '@skills.cra.rank');
  });

  it('does not double-@ an already-prefixed path', () => {
    const result = mapPrerequisiteToModifier({ path: '@skills.cra.rank' });
    assert.equal(result.expression, '@skills.cra.rank');
  });

  it('maps an empty path to an empty expression', () => {
    const result = mapPrerequisiteToModifier({ name: 'X', path: '' });
    assert.equal(result.expression, '');
  });

  it('drops op and value (no counterpart on a roll modifier)', () => {
    const result = mapPrerequisiteToModifier({ name: 'X', path: 'a.b', op: 'gte', value: 2 });
    assert.ok(!('op' in result), 'op is dropped');
    assert.ok(!('value' in result), 'value is dropped');
  });

  it('never carries the source id', () => {
    const result = mapPrerequisiteToModifier({ id: 'p1', name: 'X' });
    assert.ok(!('id' in result), 'id is not copied');
  });

  it('produces output valid under a modifier-shaped normalizer', () => {
    const partial = mapPrerequisiteToModifier({
      name: 'Trained',
      icon: 'fa-solid fa-graduation-cap',
      path: 'skills.cra.rank',
    });
    const normalized = normalizeModifierLike(partial, 'm1');
    assert.equal(normalized.id, 'm1');
    assert.equal(normalized.label, 'Trained');
    assert.equal(normalized.icon, 'fa-solid fa-graduation-cap');
    assert.equal(normalized.expression, '@skills.cra.rank');
  });
});

describe('modifier ↔ prerequisite round trip (issue 768)', () => {
  it('preserves name/icon and the bare @path across a round trip', () => {
    const modifier = { label: 'Herbalism', icon: 'fa-solid fa-leaf', expression: '@skills.nature.value' };
    const back = mapPrerequisiteToModifier(mapModifierToPrerequisite(modifier));
    assert.equal(back.label, modifier.label);
    assert.equal(back.icon, modifier.icon);
    assert.equal(back.expression, modifier.expression);
  });
});
