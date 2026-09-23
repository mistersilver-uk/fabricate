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
  planRecipeTagRemovals,
} from '../src/ui/model/vocabularyCascade.js';
import {
  buildVocabularyUsage,
  countRecipeTagPlaceholders,
  dedupeVocabularyEntries,
  normalizeVocabularyKey,
} from '../src/ui/model/vocabularyUsage.js';

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

  it('strips a deleted tag from recipe tag-placeholder ingredients, grouped and legacy shapes', () => {
    const recipes = [
      {
        id: 'r1',
        ingredientSets: [
          {
            ingredientGroups: [
              { options: [{ match: { type: 'tags', tags: ['herb', 'ore'], tagMatch: 'any' } }] },
              { options: [{ match: { type: 'component', componentId: 'c1' } }] },
            ],
          },
        ],
      },
      {
        id: 'r2',
        steps: [
          { ingredientSets: [{ ingredients: [{ match: { type: 'tags', tags: ['ORE'] } }] }] },
        ],
      },
      // No placeholder names the tag, so it is never patched.
      { id: 'r3', ingredientSets: [{ ingredientGroups: [{ options: [] }] }] },
    ];
    assert.deepEqual(planRecipeTagRemovals(recipes, 'ore'), [
      {
        id: 'r1',
        updates: {
          ingredientSets: [
            {
              ingredientGroups: [
                { options: [{ match: { type: 'tags', tags: ['herb'], tagMatch: 'any' } }] },
                { options: [{ match: { type: 'component', componentId: 'c1' } }] },
              ],
            },
          ],
        },
      },
      {
        id: 'r2',
        updates: {
          steps: [{ ingredientSets: [{ ingredients: [{ match: { type: 'tags', tags: [] } }] }] }],
        },
      },
    ]);
  });

  it('leaves an emptied placeholder with an empty tags array, never the deleted tag', () => {
    const recipes = [
      { id: 'r1', ingredientSets: [{ ingredientGroups: [{ options: [{ match: { type: 'tags', tags: ['ore'] } }] }] }] },
    ];
    const [patch] = planRecipeTagRemovals(recipes, 'ore');
    assert.deepEqual(patch.updates.ingredientSets[0].ingredientGroups[0].options[0].match.tags, []);
  });

  it('returns no recipe patch for the empty tag name', () => {
    assert.deepEqual(planRecipeTagRemovals([{ id: 'r1', ingredientSets: [] }], ''), []);
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

describe('the system vocabulary row key and its de-duplication (issue 1397)', () => {
  /** The visible names one call yields, which is what the row list draws. */
  const names = (entries, options) =>
    dedupeVocabularyEntries(entries, options).map((entry) => entry.name);

  it('keys a row on its trimmed lower-cased name and a blank on the reserved bucket', () => {
    assert.equal(normalizeVocabularyKey('  Potions '), 'potions');
    assert.equal(normalizeVocabularyKey('HERB'), 'herb');
    assert.equal(normalizeVocabularyKey(''), 'general');
    assert.equal(normalizeVocabularyKey('   '), 'general');
    assert.equal(normalizeVocabularyKey(null), 'general');
  });

  it('is deliberately NOT the counting key, which leaves a blank uncounted', () => {
    // The counting key reads a record's stored value; an uncategorised recipe belongs to no
    // vocabulary entry, so folding it into `general` here would invent references.
    const usage = buildVocabularyUsage([{ category: '', ingredientSets: [] }], []);
    assert.equal(usage.categoryUsage.get('general'), undefined);
    assert.equal(usage.categoryUsage.get(''), 1);
  });

  it('keeps the FIRST spelling of a collapsed key, in stored order', () => {
    assert.deepEqual(names(['Potions', 'potions']), ['Potions']);
    assert.deepEqual(names(['potions', 'Potions']), ['potions']);
    assert.deepEqual(names(['herb', 'HERB', ' Herb ']), ['herb']);
  });

  it('carries every spelling that collapsed into the record, in stored order', () => {
    // What the row's `title` is built from, and what the store must delete: a survivor left in
    // storage renders as a second row under a name the GM thought they had removed.
    assert.deepEqual(dedupeVocabularyEntries([' Potions ', 'potions', 'POTIONS']), [
      { key: 'potions', name: 'Potions', spellings: ['Potions', 'potions', 'POTIONS'] },
    ]);
    assert.deepEqual(dedupeVocabularyEntries(['Ore'])[0].spellings, ['Ore']);
  });

  it('drops the reserved bucket only where the caller reserves one', () => {
    // The two CATEGORY builders prepend the locked General row outside this set, so a second row
    // under its id would crash the keyed list. The TAG vocabulary reserves nothing, and a tag
    // literally named `general` is an entry a GM can store, reference, count and must manage.
    assert.deepEqual(names(['General', 'Potions'], { reservesGeneral: true }), ['Potions']);
    assert.deepEqual(names([' general ', 'GENERAL'], { reservesGeneral: true }), []);
    assert.deepEqual(names([' general ', 'GENERAL']), ['general']);
    assert.deepEqual(names(['General', 'Potions']), ['General', 'Potions']);
  });

  it('drops blanks and non-strings, and never returns an entry that renders as nothing', () => {
    assert.deepEqual(names(['  ', '', null, undefined, 'Ore']), ['Ore']);
    assert.deepEqual(dedupeVocabularyEntries(null), []);
    assert.deepEqual(dedupeVocabularyEntries(undefined), []);
  });

  it('orders the survivors by localeCompare rather than by storage order', () => {
    assert.deepEqual(names(['ore', 'Ale', 'herb']), ['Ale', 'herb', 'ore']);
  });
});
