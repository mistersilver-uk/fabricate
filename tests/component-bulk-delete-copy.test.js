/**
 * Pins the component bulk-remove strings the mounted `ComponentBulkEditPanel` suite cannot reach
 * without mounting the much heavier `CraftingSystemManagerRoot` (issue 1129; the set delete became
 * the reference's `Remove N components from {system}…` leg in the panel's dock for issue 1371
 * r16-list, maintainer ruling M23).
 *
 * The twin of `essence-bulk-delete-copy.test.js`, and it follows that file's binding decision
 * rather than re-litigating it: `…Deleted` and `…RemoveArmedAnnouncement` each carry TWO
 * independent counts in one sentence, and no sibling key in `lang/en.json` pluralizes two numbers
 * at once — the established `…One` convention only ever branches on ONE count. So those strings
 * use the "(s)" idiom, which is count-agreement-neutral by construction, instead of a four-way
 * 1/1, 1/N, N/1, N/N key matrix. Both are AT-ONLY or toast strings; nothing visible carries "(s)".
 *
 * The SINGLE-count strings do branch, because they can: the remove leg's label and its note's
 * recipe sentences render `…One` siblings, so those are pinned here at both ends too. The mounted
 * suite proves the panel SELECTS the right key; this proves the key it selects actually reads.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = JSON.parse(readFileSync(join(ROOT, 'lang/en.json'), 'utf8'));
const bulkEdit = lang.FABRICATE.Admin.Manager.Component.BulkEdit;
const deleteConfirm = lang.FABRICATE.Admin.Manager.Component.DeleteConfirm;

// Mirrors the `format()` helper every call site uses: one substitution per token.
function interpolate(template, data) {
  let result = template;
  for (const [token, value] of Object.entries(data)) {
    result = result.replaceAll(`{${token}}`, String(value));
  }
  return result;
}

describe('1129/copy component bulk-remove two-count strings', () => {
  it('RemoveArmedAnnouncement reads correctly with both counts at 1', () => {
    assert.equal(
      interpolate(bulkEdit.RemoveArmedAnnouncement, { count: 1, recipes: 1, system: 'Forge' }),
      'Remove armed. Activate again to remove 1 component(s) from Forge and rewrite 1 recipe(s).',
      'not "1 components" / "1 recipes"'
    );
  });

  it('the armed announcement names the consequence, not just the state', () => {
    // Arming changes the button's label and name while it holds focus, which is not reliably
    // announced; the polite live region is what carries the change. A bare "armed" would tell a
    // screen-reader user that something changed but not what confirming would do.
    const announcement = interpolate(bulkEdit.RemoveArmedAnnouncement, {
      count: 3,
      recipes: 2,
      system: 'Forge',
    });
    assert.match(announcement, /3 component\(s\) from Forge/);
    assert.match(announcement, /2 recipe\(s\)/);
    assert.match(announcement, /again/i, 'and says a SECOND activation is what removes');
  });

  it('Deleted (the post-remove toast) reads correctly with both counts at 1', () => {
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

  // The toast is the ONLY feedback that survives the panel unmounting on a successful remove, and
  // "recipes disabled" is the most consequential of the three outcomes — recipes the GM's players
  // could craft this morning and cannot craft now. It was the one number the toast did not report.
  it('DeletedWithDisabled reports the disable count as well as the other two', () => {
    assert.equal(
      interpolate(bulkEdit.DeletedWithDisabled, { count: 3, recipes: 2, disabled: 1 }),
      'Deleted 3 component(s) and rewrote 2 recipe(s), disabling 1 of them.'
    );
  });

  it('the zero-disable case has its own shorter sentence, not a trailing "0 of them"', () => {
    // Two whole sentences rather than one plus an appended clause: a locale that cannot append an
    // English subordinate clause is the usual cost of building a sentence out of fragments.
    assert.ok(!bulkEdit.Deleted.includes('{disabled}'), 'the short form names no disable count');
    assert.notEqual(bulkEdit.Deleted, bulkEdit.DeletedWithDisabled);
  });
});

describe('1129/copy component bulk-remove single-count strings branch on One', () => {
  it('the note’s recipe sentences never read "1 recipes"', () => {
    assert.equal(bulkEdit.ImpactRecipesOne, '1 recipe will be rewritten.');
    assert.equal(
      bulkEdit.ImpactDisabledOne,
      '1 of those recipes is enabled today and will be disabled.'
    );
  });

  it('the plural recipe sentences carry their count token', () => {
    assert.equal(interpolate(bulkEdit.ImpactRecipes, { count: 2 }), '2 recipes will be rewritten.');
    assert.equal(
      interpolate(bulkEdit.ImpactDisabled, { count: 2 }),
      '2 of those recipes are enabled today and will be disabled.'
    );
  });

  // `recipesDisabled` counts a TRANSITION — recipes enabled today that this remove will switch
  // off — and deliberately excludes recipes that were already disabled. The old wording, "N of
  // those recipes will be left uncraftable and disabled", described the resulting STATE, under
  // which an already-disabled recipe plainly belongs in the count; a GM reading it against a
  // library holding disabled recipes would read the number as an undercount.
  it('the disabled sentences name the TRANSITION rather than the resulting state', () => {
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

  it('the remove label branches on its count and names the system (`proto:5645`)', () => {
    assert.equal(interpolate(bulkEdit.RemoveOne, { system: 'Forge' }), 'Remove 1 component from Forge…');
    assert.equal(
      interpolate(bulkEdit.Remove, { count: 3, system: 'Forge' }),
      'Remove 3 components from Forge…'
    );
    assert.equal(
      interpolate(bulkEdit.RemoveNone, { system: 'Forge' }),
      'Remove from Forge…',
      'uncounted where nothing can go: `Remove 0 components…` is a promise of an outcome'
    );
  });

  it('the armed label is the confirm sentence, not a repeat of the idle label', () => {
    assert.equal(
      interpolate(bulkEdit.RemoveArmed, { count: 3, system: 'Forge' }),
      'Confirm — remove 3 from Forge'
    );
    assert.equal(bulkEdit.RemoveBlocked, 'Cannot remove');
    assert.notEqual(bulkEdit.RemoveArmed, bulkEdit.Remove);
  });

  it('the note states the in-system scope and NOT the reference’s broken-ingredient cascade', () => {
    // The store's `deleteComponents` repairs every referencing recipe; a note promising a broken
    // ingredient would state a consequence the store does not perform, in the false direction.
    const note = interpolate(bulkEdit.RemoveNote, { system: 'Forge' });
    assert.match(note, /rules in Forge only/);
    assert.match(note, /every other system are untouched/);
    assert.doesNotMatch(note, /broken ingredient/i);
    assert.doesNotMatch(bulkEdit.RemoveNoteNone, /broken ingredient/i);
  });
});

describe('1129/copy the singular delete dialog states the same arithmetic', () => {
  // The bulk panel and the single-component dialog are fed by the SAME describer, so their copy
  // must be able to say the same thing. A dialog that named no numbers — which is what shipped
  // before this issue — cannot.
  it('names both the rewrite count and the disable count', () => {
    const sentence = interpolate(deleteConfirm.Content, {
      name: 'Iron',
      recipes: 2,
      disabled: 1,
    });
    assert.match(sentence, /2 recipe\(s\)/);
    assert.match(sentence, /1 of those recipes/);
    assert.match(sentence, /Iron/);
  });
});
