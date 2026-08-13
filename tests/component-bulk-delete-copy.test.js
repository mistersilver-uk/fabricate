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
      'Confirm delete — 1 component(s) and 1 recipe(s) affected. This cannot be undone.',
      'not "1 components" / "1 recipes"'
    );
  });

  it('DeleteConfirmAria still carries both counts when neither is 1', () => {
    assert.equal(
      interpolate(bulkEdit.DeleteConfirmAria, { count: 4, recipes: 2 }),
      'Confirm delete — 4 component(s) and 2 recipe(s) affected. This cannot be undone.'
    );
  });

  // IT STATES THE IRREVERSIBILITY, like its essence and recipe siblings (issue 1132, review
  // round). This panel carries no standing hint, so the armed accessible name is the ONLY
  // place a screen-reader user is told that deleting components is permanent — and it was a
  // bare count fragment with no full stop while both other studios ended "This cannot be
  // undone." Deleting components is no less permanent than deleting an essence.
  it('the armed accessible name states that the delete cannot be undone', () => {
    assert.match(bulkEdit.DeleteConfirmAria, /cannot be undone/i);
  });

  // WCAG 2.5.3 Label in Name. A speech-input user activates a control by saying what they
  // can READ, so the accessible name has to CONTAIN the visible label string. The armed
  // name opened "Confirm deleting …", which does not contain "Confirm delete", so the armed
  // half of a destructive two-step control was unactivatable by voice — the one state where
  // being unable to speak the name is most consequential.
  it('the armed accessible name CONTAINS the armed visible label', () => {
    const name = interpolate(bulkEdit.DeleteConfirmAria, { count: 4, recipes: 2 });
    assert.ok(
      name.includes(bulkEdit.DeleteConfirm),
      `"${name}" must contain the visible label "${bulkEdit.DeleteConfirm}"`
    );
    assert.ok(name.startsWith(bulkEdit.DeleteConfirm), 'and lead with it, so it is said first');
  });

  it('the IDLE accessible name contains the idle visible label at both counts', () => {
    // The idle pair needs no reordering — the `…Aria` sibling is the visible label verbatim —
    // but the pairing is asserted rather than assumed, because it is one label edit away from
    // breaking in the same way the armed pair did.
    assert.ok(
      interpolate(bulkEdit.DeleteAria, { count: 3 }).includes(
        interpolate(bulkEdit.Delete, { count: 3 })
      )
    );
    assert.ok(bulkEdit.DeleteAriaOne.includes(bulkEdit.DeleteOne));
  });

  it('the armed announcement names the consequence, not just the state', () => {
    // Arming changes the button's label and name while it holds focus, which is not reliably
    // announced; the polite live region is what carries the change. A bare "armed" would tell
    // a screen-reader user that something changed but not what confirming would do.
    const announcement = interpolate(bulkEdit.DeleteArmedAnnouncement, { count: 3, recipes: 2 });
    assert.match(announcement, /3 component\(s\)/);
    assert.match(announcement, /2 recipe\(s\)/);
    assert.match(announcement, /again/i, 'and says a SECOND activation is what deletes');
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

  // The toast is the ONLY feedback that survives the panel unmounting on a successful delete,
  // and "recipes disabled" is the most consequential of the three outcomes — recipes the GM's
  // players could craft this morning and cannot craft now. It was the one number the toast
  // did not report.
  it('DeletedWithDisabled reports the disable count as well as the other two', () => {
    assert.equal(
      interpolate(bulkEdit.DeletedWithDisabled, { count: 3, recipes: 2, disabled: 1 }),
      'Deleted 3 component(s) and rewrote 2 recipe(s), disabling 1 of them.'
    );
  });

  it('the zero-disable case has its own shorter sentence, not a trailing "0 of them"', () => {
    // Two whole sentences rather than one plus an appended clause: a locale that cannot append
    // an English subordinate clause is the usual cost of building a sentence out of fragments.
    assert.ok(!bulkEdit.Deleted.includes('{disabled}'), 'the short form names no disable count');
    assert.notEqual(bulkEdit.Deleted, bulkEdit.DeletedWithDisabled);
  });
});

describe('1129/copy component bulk-delete single-count strings branch on One', () => {
  it('the impact rows never read "1 components" or "1 recipes"', () => {
    assert.equal(bulkEdit.ImpactComponentsOne, '1 component will be deleted.');
    assert.equal(bulkEdit.ImpactRecipesOne, '1 recipe will be rewritten.');
    assert.equal(
      bulkEdit.ImpactDisabledOne,
      '1 of those recipes is enabled today and will be disabled.'
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
      '2 of those recipes are enabled today and will be disabled.'
    );
  });

  // `recipesDisabled` counts a TRANSITION — recipes enabled today that this delete will
  // switch off — and deliberately excludes recipes that were already disabled. The old
  // wording, "N of those recipes will be left uncraftable and disabled", described the
  // resulting STATE, under which an already-disabled recipe plainly belongs in the count; a
  // GM reading it against a library holding disabled recipes would read the number as an
  // undercount and distrust the whole statement.
  it('the disabled rows name the TRANSITION rather than the resulting state', () => {
    for (const row of [
      bulkEdit.ImpactDisabledOne,
      interpolate(bulkEdit.ImpactDisabled, { count: 2 }),
    ]) {
      assert.match(row, /enabled today/, 'the excluded set is named, not left to be inferred');
      assert.match(row, /will be disabled/, 'and the change is future, not a description');
      assert.ok(
        !/left uncraftable and disabled/.test(row),
        'the state phrasing made the already-disabled exclusion read as an undercount'
      );
    }
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
