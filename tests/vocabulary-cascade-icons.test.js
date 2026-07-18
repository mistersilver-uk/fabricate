import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCategoryIcon,
  normalizeCategoryIconMap,
  categoryIconFor,
  withCategoryIcon,
  DEFAULT_CATEGORY_ICON,
} from '../src/utils/categoryIcons.js';
import {
  planRecipeCategoryReassignments,
  planComponentCategoryReassignments,
  planTagRemovals,
} from '../src/utils/vocabularyCascade.js';
import { buildVocabularyUsage, countRecipeTagPlaceholders } from '../src/utils/vocabularyUsage.js';

describe('categoryIcons (issue 689)', () => {
  it('normalizes a Font Awesome class string and rejects markup', () => {
    assert.equal(normalizeCategoryIcon('  fas fa-flask  '), 'fas fa-flask');
    assert.equal(normalizeCategoryIcon('<i>x</i>'), '');
    assert.equal(normalizeCategoryIcon(42), '');
    assert.equal(normalizeCategoryIcon('x'.repeat(80)), '');
  });

  it('filters a stored icon map to the allowed category names, lowercasing keys', () => {
    const map = normalizeCategoryIconMap(
      { Potions: 'fas fa-flask', gone: 'fas fa-ghost', general: 'fas fa-folder' },
      ['general', 'Potions']
    );
    assert.deepEqual(map, { potions: 'fas fa-flask', general: 'fas fa-folder' });
  });

  it('falls back to the default icon when a category has none', () => {
    assert.equal(categoryIconFor({ potions: 'fas fa-flask' }, 'Potions'), 'fas fa-flask');
    assert.equal(categoryIconFor({}, 'Potions'), DEFAULT_CATEGORY_ICON);
  });

  it('sets and clears one category icon without mutating the source map', () => {
    const base = { potions: 'fas fa-flask' };
    const set = withCategoryIcon(base, 'Elixirs', 'fas fa-vial');
    assert.deepEqual(set, { potions: 'fas fa-flask', elixirs: 'fas fa-vial' });
    assert.deepEqual(base, { potions: 'fas fa-flask' }, 'source map is untouched');
    const cleared = withCategoryIcon(set, 'potions', '');
    assert.deepEqual(cleared, { elixirs: 'fas fa-vial' });
  });
});

describe('vocabularyCascade (issue 689)', () => {
  it('reassigns only the recipes carrying the deleted recipe category to general', () => {
    const recipes = [
      { id: 'r1', category: 'Potions' },
      { id: 'r2', category: 'potions' },
      { id: 'r3', category: 'Armor' },
      { id: 'r4' },
    ];
    assert.deepEqual(planRecipeCategoryReassignments(recipes, 'Potions'), [
      { id: 'r1', category: 'general' },
      { id: 'r2', category: 'general' },
    ]);
  });

  it('never reassigns for the reserved general bucket', () => {
    assert.deepEqual(
      planRecipeCategoryReassignments([{ id: 'r1', category: 'general' }], 'general'),
      []
    );
  });

  it('reassigns components carrying the deleted component category to general', () => {
    const components = [
      { id: 'c1', category: 'Reagent' },
      { id: 'c2', category: 'Metal' },
    ];
    assert.deepEqual(planComponentCategoryReassignments(components, 'Reagent'), [
      { id: 'c1', category: 'general' },
    ]);
  });

  it('strips a deleted tag from every component carrying it', () => {
    const components = [
      { id: 'c1', tags: ['herb', 'ore'] },
      { id: 'c2', tags: ['metal'] },
      { id: 'c3', tags: ['ORE', 'moon'] },
    ];
    assert.deepEqual(planTagRemovals(components, 'ore'), [
      { id: 'c1', tags: ['herb'] },
      { id: 'c3', tags: ['moon'] },
    ]);
  });
});

describe('vocabularyUsage (issue 689)', () => {
  it('counts a tag from a recipe tag-placeholder ingredient, not only components', () => {
    const tagUsage = new Map();
    const recipe = {
      ingredientSets: [
        {
          ingredientGroups: [
            { options: [{ match: { type: 'tags', tags: ['herb', 'moon'] } }] },
            { options: [{ match: { type: 'component', componentId: 'c1' } }] },
          ],
        },
      ],
    };
    countRecipeTagPlaceholders(recipe, tagUsage);
    assert.equal(tagUsage.get('herb'), 1);
    assert.equal(tagUsage.get('moon'), 1);
    assert.equal(tagUsage.get('c1'), undefined);
  });

  it('walks per-step ingredient sets and the legacy ingredients shape', () => {
    const tagUsage = new Map();
    countRecipeTagPlaceholders(
      { steps: [{ ingredientSets: [{ ingredients: [{ match: { type: 'tags', tags: ['fuel'] } }] }] }] },
      tagUsage
    );
    assert.equal(tagUsage.get('fuel'), 1);
  });

  it('rolls up all three vocabularies, crediting tags on both components and recipes', () => {
    const usage = buildVocabularyUsage(
      [
        { category: 'Potions', ingredientSets: [] },
        {
          category: 'general',
          ingredientSets: [{ ingredientGroups: [{ options: [{ match: { type: 'tags', tags: ['herb'] } }] }] }],
        },
      ],
      [
        { category: 'Reagent', tags: ['herb', 'ore'] },
        { category: 'general', tags: ['ore'] },
      ]
    );
    assert.equal(usage.categoryUsage.get('potions'), 1);
    assert.equal(usage.componentCategoryUsage.get('reagent'), 1);
    // herb: one component + one recipe placeholder; ore: two components.
    assert.equal(usage.tagUsage.get('herb'), 2);
    assert.equal(usage.tagUsage.get('ore'), 2);
    assert.equal(usage.categoryReferenceCount, 2);
    assert.equal(usage.componentCategoryReferenceCount, 2);
    assert.equal(usage.tagReferenceCount, 4);
  });
});
