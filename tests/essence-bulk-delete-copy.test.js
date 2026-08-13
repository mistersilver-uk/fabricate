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
      'Confirm delete — 1 essence definition(s) will be deleted and 1 recipe(s) rewritten',
      'not "1 essence definitions" / "1 recipes" — the shipped defect'
    );
  });

  it('DeleteConfirmAria still carries both counts when neither is 1', () => {
    assert.equal(
      interpolate(bulkEdit.DeleteConfirmAria, { count: 2, recipes: 3 }),
      'Confirm delete — 2 essence definition(s) will be deleted and 3 recipe(s) rewritten'
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

  // Issue 1144 — the twin of the component toast's `DeletedWithDisabled` string. The toast
  // is the ONLY feedback that survives the panel unmounting on a successful delete, and
  // "recipes disabled" is the most consequential of the three outcomes reported: recipes the
  // GM's players could craft this morning and cannot craft now.
  it('DeletedWithDisabled reports the disable count as well as the other two', () => {
    assert.equal(
      interpolate(bulkEdit.DeletedWithDisabled, { count: 3, recipes: 2, disabled: 1 }),
      'Deleted 3 essence(s) and rewrote 2 recipe(s), disabling 1 of them.'
    );
  });

  it('the zero-disable case has its own shorter sentence, not a trailing "0 of them"', () => {
    // Two whole sentences rather than one plus an appended clause: a locale that cannot
    // append an English subordinate clause is the usual cost of building a sentence out of
    // fragments.
    assert.ok(!bulkEdit.Deleted.includes('{disabled}'), 'the short form names no disable count');
    assert.notEqual(bulkEdit.Deleted, bulkEdit.DeletedWithDisabled);
  });
});

// WCAG 2.5.3 Label in Name (issue 1132). A speech-input user activates a control by saying what
// they can READ, so the accessible name has to CONTAIN the visible label string. Both essence
// faces failed, and the conversion onto the shared `BulkDeleteCard` is what forced the audit:
//
//  - the ARMED name opened "Confirm deleting …" beside a button reading "Confirm delete";
//  - the IDLE PLURAL name read "Delete 3 essence definitions" beside "Delete 3 essences". The
//    `…One` branch passed only by luck — "Delete 1 essence definition" happens to contain
//    "Delete 1 essence" — which is precisely why it is asserted here rather than assumed.
//
// The component twin's identical block is in `component-bulk-delete-copy.test.js`; both are
// pinned per FACE, because the pair is one label edit away from breaking the same way again.
describe('1132/copy essence bulk-delete names contain their visible labels', () => {
  it('the ARMED accessible name contains, and leads with, the armed label', () => {
    const name = interpolate(bulkEdit.DeleteConfirmAria, { count: 4, recipes: 2 });
    assert.ok(
      name.includes(bulkEdit.DeleteConfirm),
      `"${name}" must contain the visible label "${bulkEdit.DeleteConfirm}"`
    );
    assert.ok(name.startsWith(bulkEdit.DeleteConfirm), 'and lead with it, so it is said first');
  });

  it('the IDLE accessible name contains the idle visible label at both counts', () => {
    assert.ok(
      interpolate(bulkEdit.DeleteAria, { count: 3 }).includes(
        interpolate(bulkEdit.Delete, { count: 3 })
      ),
      'the plural pair — the half that shipped broken'
    );
    assert.ok(bulkEdit.DeleteAriaOne.includes(bulkEdit.DeleteOne), 'and the singular pair');
  });

  it('the armed announcement names the consequence, not just the state', () => {
    // The card renders a live region on every studio now, so the Essence Studio needs something
    // for it to say: a region that exists and never speaks is an affordance that lies. A bare
    // "armed" would tell a screen-reader user that something changed but not what confirming
    // would do.
    const announcement = interpolate(bulkEdit.DeleteArmedAnnouncement, { count: 3, recipes: 2 });
    assert.match(announcement, /3 essence definition\(s\)/);
    assert.match(announcement, /2 recipe\(s\)/);
    assert.match(announcement, /again/i, 'and says a SECOND activation is what deletes');
  });
});
