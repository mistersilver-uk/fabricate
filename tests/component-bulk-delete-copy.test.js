/**
 * Pins the component bulk-delete strings the mounted `ComponentBulkEditPanel` suite cannot
 * reach without mounting the much heavier `CraftingSystemManagerRoot` (issue 1129).
 *
 * The twin of `essence-bulk-delete-copy.test.js`, and it follows that file's binding
 * decision rather than re-litigating it: `…Deleted` and `…DeleteConfirmAria` each carry TWO
 * independent counts in one sentence, and no sibling key in `lang/en.json` pluralizes two
 * numbers at once — the established `…One` convention only ever branches on ONE count. So
 * these two strings use the "(s)" idiom, which is count-agreement-neutral by construction,
 * instead of a four-way 1/1, 1/N, N/1, N/N key matrix.
 *
 * The SINGLE-count strings do branch, because they can: the panel renders `…One` siblings
 * for the three impact rows and the button label, so those are pinned here at both ends too.
 * The mounted suite proves the panel SELECTS the right key; this proves the key it selects
 * actually reads correctly.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = JSON.parse(readFileSync(join(ROOT, 'lang/en.json'), 'utf8'));
const bulkEdit = lang.FABRICATE.Admin.Manager.Component.BulkEdit;
const deleteConfirm = lang.FABRICATE.Admin.Manager.Component.DeleteConfirm;

// Mirrors the `format()` helper every call site uses: one `.replace()` per token.
function interpolate(template, data) {
  let result = template;
  for (const [token, value] of Object.entries(data)) {
    result = result.replace(`{${token}}`, String(value));
  }
  return result;
}

describe('1129/copy component bulk-delete two-count strings', () => {
  it('DeleteConfirmAria reads correctly with both counts at 1', () => {
    assert.equal(
      interpolate(bulkEdit.DeleteConfirmAria, { count: 1, recipes: 1 }),
      'Confirm deleting 1 component(s) and rewriting 1 recipe(s)',
      'not "1 components" / "1 recipes"'
    );
  });

  it('DeleteConfirmAria still carries both counts when neither is 1', () => {
    assert.equal(
      interpolate(bulkEdit.DeleteConfirmAria, { count: 4, recipes: 2 }),
      'Confirm deleting 4 component(s) and rewriting 2 recipe(s)'
    );
  });

  it('Deleted (the post-delete toast) reads correctly with both counts at 1', () => {
    assert.equal(
      interpolate(bulkEdit.Deleted, { count: 1, recipes: 1 }),
      'Deleted 1 component(s) and rewrote 1 recipe(s).'
    );
  });

  it('Deleted still carries both counts when neither is 1', () => {
    assert.equal(
      interpolate(bulkEdit.Deleted, { count: 3, recipes: 2 }),
      'Deleted 3 component(s) and rewrote 2 recipe(s).'
    );
  });
});

describe('1129/copy component bulk-delete single-count strings branch on One', () => {
  it('the impact rows never read "1 components" or "1 recipes"', () => {
    assert.equal(bulkEdit.ImpactComponentsOne, '1 component will be deleted.');
    assert.equal(bulkEdit.ImpactRecipesOne, '1 recipe will be rewritten.');
    assert.equal(
      bulkEdit.ImpactDisabledOne,
      '1 of those recipes will be left uncraftable and disabled.'
    );
  });

  it('the plural impact rows carry their count token', () => {
    assert.equal(
      interpolate(bulkEdit.ImpactComponents, { count: 5 }),
      '5 components will be deleted.'
    );
    assert.equal(interpolate(bulkEdit.ImpactRecipes, { count: 2 }), '2 recipes will be rewritten.');
    assert.equal(
      interpolate(bulkEdit.ImpactDisabled, { count: 2 }),
      '2 of those recipes will be left uncraftable and disabled.'
    );
  });

  it('the button label and its aria name agree at both ends', () => {
    assert.equal(bulkEdit.DeleteOne, 'Delete 1 component');
    assert.equal(bulkEdit.DeleteAriaOne, 'Delete 1 component');
    assert.equal(interpolate(bulkEdit.Delete, { count: 3 }), 'Delete 3 components');
    assert.equal(interpolate(bulkEdit.DeleteAria, { count: 3 }), 'Delete 3 components');
  });

  it('the armed label is the confirm word, not a repeat of the idle label', () => {
    assert.equal(bulkEdit.DeleteConfirm, 'Confirm delete');
    assert.notEqual(bulkEdit.DeleteConfirm, bulkEdit.DeleteOne);
  });
});

describe('1129/copy the singular delete dialog states the same arithmetic', () => {
  // The bulk panel and the single-component dialog are fed by the SAME describer, so their
  // copy must be able to say the same thing. A dialog that named no numbers — which is what
  // shipped before this issue — cannot.
  it('names both the rewrite count and the disable count', () => {
    const sentence = interpolate(deleteConfirm.Content, {
      name: 'Iron',
      recipes: 2,
      disabled: 1,
    });
    assert.match(sentence, /2 recipe\(s\)/);
    assert.match(sentence, /1 of them/);
    assert.match(sentence, /Iron/);
  });

  it('titles the dialog with the component name', () => {
    assert.equal(interpolate(deleteConfirm.Title, { name: 'Iron' }), 'Delete Iron?');
  });
});
