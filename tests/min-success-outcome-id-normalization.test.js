/**
 * Tests for Recipe.minSuccessOutcomeId — the optional per-recipe reference to a
 * fixed-type routed check's minimum success tier. Mirrors the checkTierId pattern:
 * a trimmed non-empty string or null, round-tripping through toJSON/fromJSON.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
global.game = { user: { name: 'Test User' } };

const { Recipe } = await import('../src/models/Recipe.js');

const RESULT_GROUPS = [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }];

describe('Recipe.minSuccessOutcomeId', () => {
  it('defaults to null when omitted', () => {
    const recipe = new Recipe({ name: 'Test', resultGroups: RESULT_GROUPS });
    assert.equal(recipe.minSuccessOutcomeId, null);
  });

  it('keeps a trimmed non-empty string', () => {
    const recipe = new Recipe({ name: 'Test', minSuccessOutcomeId: '  high  ', resultGroups: RESULT_GROUPS });
    assert.equal(recipe.minSuccessOutcomeId, 'high');
  });

  it('normalizes whitespace-only / non-string to null', () => {
    assert.equal(new Recipe({ name: 'T', minSuccessOutcomeId: '   ', resultGroups: RESULT_GROUPS }).minSuccessOutcomeId, null);
    assert.equal(new Recipe({ name: 'T', minSuccessOutcomeId: 42, resultGroups: RESULT_GROUPS }).minSuccessOutcomeId, null);
    assert.equal(new Recipe({ name: 'T', minSuccessOutcomeId: null, resultGroups: RESULT_GROUPS }).minSuccessOutcomeId, null);
  });

  it('serializes into toJSON and round-trips through fromJSON', () => {
    const original = new Recipe({ name: 'Test', minSuccessOutcomeId: 'high', resultGroups: RESULT_GROUPS });
    const json = original.toJSON();
    assert.equal(json.minSuccessOutcomeId, 'high');
    const restored = Recipe.fromJSON(json);
    assert.equal(restored.minSuccessOutcomeId, 'high');
  });

  it('round-trips a null override', () => {
    const restored = Recipe.fromJSON(new Recipe({ name: 'T', resultGroups: RESULT_GROUPS }).toJSON());
    assert.equal(restored.minSuccessOutcomeId, null);
  });
});
