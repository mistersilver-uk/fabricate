/** The resolution-mode change confirm content (issue 2514). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { summarizeModeChange } from '../../src/systems/migrateRecipeForModeChange.js';
import { modeChangeConfirmContent } from '../../src/ui/svelte/stores/modeChangeConfirm.js';

const EMPTY = { migrated: 0, deleted: [], droppedIngredientSets: [], droppedFailureSets: [] };
const summary = (overrides) => ({ ...EMPTY, ...overrides });
const english = () => '';
const paragraphs = (html) => html.match(/<p>.*?<\/p>/gu) ?? [];

/** A localize double that echoes the key and its data, so a test can read what was passed. */
const echo = (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key);

describe('modeChangeConfirmContent', () => {
  it('says only how many recipes migrate when nothing is deleted or dropped', () => {
    const html = modeChangeConfirmContent(summary({ migrated: 3 }), 'routedByCheck', english);
    assert.equal(html, '<p>3 recipe(s) will be migrated to routedByCheck.</p>');
  });

  it('names the deleted recipes', () => {
    const html = modeChangeConfirmContent(
      summary({ migrated: 1, deleted: ['Iron Bar', 'Gold Bar'] }),
      'simple',
      english
    );
    assert.equal(
      html,
      '<p>1 recipe(s) will be migrated to simple; 2 cannot be migrated and will be deleted: Iron Bar, Gold Bar.</p>'
    );
  });

  it('lists the dropped ingredient sets per recipe, an unnamed or blank set reading "Set N"', () => {
    const html = modeChangeConfirmContent(
      summary({
        migrated: 2,
        droppedIngredientSets: [
          {
            recipe: 'Recipe A',
            sets: [
              { name: 'Gold route', index: 1 },
              { name: ' '.repeat(3), index: 2 },
            ],
          },
          { recipe: 'Recipe B', sets: [{ name: undefined, index: 3 }] },
        ],
      }),
      'alchemy',
      english
    );
    const [, dropped] = paragraphs(html);
    assert.equal(
      dropped,
      '<p>2 recipe(s) will keep only their first ingredient set; these ingredient sets will be dropped: Recipe A (Gold route, Set 3); Recipe B (Set 4).</p>'
    );
  });

  it('lists the recipes losing their failure set', () => {
    const html = modeChangeConfirmContent(
      summary({ migrated: 2, droppedFailureSets: ['Fizzle', 'Spark'] }),
      'progressive',
      english
    );
    assert.equal(paragraphs(html).length, 2);
    assert.equal(
      paragraphs(html)[1],
      '<p>2 recipe(s) will lose their failure result set, which progressive does not have: Fizzle, Spark.</p>'
    );
  });

  it('escapes recipe and set names in every paragraph', () => {
    const html = modeChangeConfirmContent(
      summary({
        migrated: 2,
        deleted: ['<b>D</b>'],
        droppedIngredientSets: [{ recipe: '<i>A</i>', sets: [{ name: '"S"&', index: 1 }] }],
        droppedFailureSets: ['<u>F</u>'],
      }),
      'alchemy',
      english
    );
    const [deletion, dropped, failure] = paragraphs(html);
    assert.ok(deletion.includes('&lt;b&gt;D&lt;/b&gt;'));
    assert.ok(dropped.includes('&lt;i&gt;A&lt;/i&gt; (&quot;S&quot;&amp;)'));
    assert.ok(failure.includes('&lt;u&gt;F&lt;/u&gt;'));
    assert.ok(!/<[biu]>/u.test(html), 'no authored markup survives');
  });

  it('passes the localized keys their data, with the localized mode and set labels', () => {
    const labels = {
      'FABRICATE.Admin.SystemSettings.ResolutionProgressive': 'Progressive',
      'FABRICATE.Admin.Manager.Recipe.SetLabel': 'Satz',
    };
    const localize = (key, data) => labels[key] ?? echo(key, data);
    const html = modeChangeConfirmContent(
      summary({
        migrated: 1,
        droppedIngredientSets: [{ recipe: 'A', sets: [{ index: 0 }] }],
        droppedFailureSets: ['F'],
      }),
      'progressive',
      localize
    );
    assert.deepEqual(paragraphs(html), [
      '<p>FABRICATE.Admin.SystemSettings.ResolutionModeChangeContent {"count":1,"mode":"Progressive"}</p>',
      '<p>FABRICATE.Admin.SystemSettings.ResolutionModeChangeDroppedSets {"count":1,"sets":"A (Satz 1)"}</p>',
      '<p>FABRICATE.Admin.SystemSettings.ResolutionModeChangeDroppedFailureSets {"count":1,"mode":"Progressive","names":"F"}</p>',
    ]);
  });

  it('falls back to the mode id when the mode has no label', () => {
    const html = modeChangeConfirmContent(summary({ migrated: 1 }), 'customMode', echo);
    assert.ok(html.includes('"mode":"customMode"'));
  });

  it('uses the English fallback when localize returns an empty string or undefined', () => {
    for (const localize of [() => '', () => undefined, undefined]) {
      const html = modeChangeConfirmContent(
        summary({ migrated: 1, droppedIngredientSets: [{ recipe: 'A', sets: [{ index: 1 }] }] }),
        'alchemy',
        localize
      );
      assert.ok(html.startsWith('<p>1 recipe(s) will be migrated to alchemy.</p>'));
      assert.ok(html.includes('dropped: A (Set 2).'));
    }
  });

  it('renders summarizeModeChange output end to end', () => {
    const recipes = [
      {
        id: 'r-a',
        name: 'Recipe A',
        ingredientSets: [{ id: 's-1' }, { id: 's-2', name: 'Gold route' }],
        resultGroups: [{ id: 'g-1', results: [] }],
      },
      {
        id: 'r-f',
        name: 'Fizzle',
        ingredientSets: [{ id: 's-1' }],
        resultGroups: [
          { id: 'g-1', results: [] },
          { id: 'g-f', role: 'failure', results: [] },
        ],
      },
    ];
    assert.equal(
      modeChangeConfirmContent(summarizeModeChange(recipes, 'simple', 'alchemy'), 'alchemy', english),
      '<p>2 recipe(s) will be migrated to alchemy.</p>' +
        '<p>1 recipe(s) will keep only their first ingredient set; these ingredient sets will be dropped: Recipe A (Gold route).</p>'
    );
    assert.deepEqual(
      paragraphs(modeChangeConfirmContent(summarizeModeChange(recipes, 'simple', 'progressive'), 'progressive', english)),
      [
        '<p>1 recipe(s) will be migrated to progressive; 1 cannot be migrated and will be deleted: Recipe A.</p>',
        '<p>1 recipe(s) will lose their failure result set, which progressive does not have: Fizzle.</p>',
      ],
      'the deleted Recipe A contributes no dropped ingredient sets'
    );
  });
});
