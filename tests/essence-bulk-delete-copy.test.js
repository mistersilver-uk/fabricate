/**
 * Pins the two-count essence bulk-delete strings the mounted `EssenceBulkEditPanel`
 * suite cannot reach without mounting the much heavier `CraftingSystemManagerRoot`
 * (issue 1036 — the copy defect the driver found in the published `manager-essences-
 * bulk-delete-armed` frame, plus the same class of defect in the delete-summary toast).
 *
 * `FABRICATE.Admin.Manager.Essence.BulkEdit.Deleted` and `.DeleteConfirmAria` each carry
 * TWO independent counts (an essence count and a recipe count) in one sentence. No
 * sibling key anywhere in `lang/en.json` pluralizes two numbers in one string — the
 * established `…One` convention (`GroupCountOne`, `OptionsOne`, `HeadingOne`, …) only
 * ever branches on ONE count. Rather than inventing a four-way key matrix (1/1, 1/N,
 * N/1, N/N) for two strings, this fix reuses the "(s)" idiom the SAME essence namespace
 * already uses nearby for exactly this shape of problem — see
 * `FABRICATE.Admin.Manager.Essence.DisabledInvalidatesRecipes`, "{count} enabled
 * recipe(s) require this essence…" — which is count-agreement-neutral by construction:
 * it reads correctly whichever count lands on it, so there is nothing to branch.
 *
 * This test proves that neutrality holds at both ends: count 1 does not read as a
 * mismatched plural, and a count > 1 still carries both numbers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = JSON.parse(readFileSync(join(ROOT, 'lang/en.json'), 'utf8'));
const bulkEdit = lang.FABRICATE.Admin.Manager.Essence.BulkEdit;

// Mirrors the `format()` helper both call sites use: `text(key, fallback).replace(...)`
// for each token, one occurrence per token (the same algorithm `EssenceBulkEditPanel`'s
// own `format()` and `CraftingSystemManagerRoot`'s `essenceBulkDeletedMessage` use).
function interpolate(template, data) {
  let result = template;
  for (const [token, value] of Object.entries(data)) {
    result = result.replace(`{${token}}`, String(value));
  }
  return result;
}

describe('1036/copy essence bulk-delete two-count strings', () => {
  it('DeleteConfirmAria reads correctly with both counts at 1', () => {
    assert.equal(
      interpolate(bulkEdit.DeleteConfirmAria, { count: 1, recipes: 1 }),
      'Confirm deleting 1 essence definition(s) and rewriting 1 recipe(s)',
      'not "1 essence definitions" / "1 recipes" — the shipped defect'
    );
  });

  it('DeleteConfirmAria still carries both counts when neither is 1', () => {
    assert.equal(
      interpolate(bulkEdit.DeleteConfirmAria, { count: 2, recipes: 3 }),
      'Confirm deleting 2 essence definition(s) and rewriting 3 recipe(s)'
    );
  });

  it('Deleted (the post-delete toast) reads correctly with both counts at 1', () => {
    const sentence = interpolate(bulkEdit.Deleted, { count: 1, recipes: 1 });
    assert.equal(
      sentence,
      'Deleted 1 essence(s) and rewrote 1 recipe(s).',
      'not "Deleted 1 essences and rewrote 1 recipes." — the shipped defect'
    );
  });

  it('Deleted still carries both counts when neither is 1', () => {
    const sentence = interpolate(bulkEdit.Deleted, { count: 3, recipes: 2 });
    assert.equal(sentence, 'Deleted 3 essence(s) and rewrote 2 recipe(s).');
  });
});
