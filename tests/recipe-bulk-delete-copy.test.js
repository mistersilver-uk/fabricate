/**
 * The recipe bulk-delete strings (issue 1132) — the third and last studio's copy suite, and
 * the twin of `essence-bulk-delete-copy.test.js` / `component-bulk-delete-copy.test.js`.
 *
 * The strings ARE the deliverable here, not decoration around it. `AGENTS.md` permits the
 * inline two-step arm in place of `services.confirmDialog` only where the panel states the
 * impact of the pending action in view BEFORE the control is armed, so the whole carve-out
 * this card rests on is a claim about what these sentences say. A card whose copy stopped
 * naming a consequence would still arm, still delete, and still pass every mounted test.
 *
 * THE `(s)` IDIOM IS FOR MULTI-COUNT STRINGS ONLY. Read the header of
 * `essence-bulk-delete-copy.test.js` for the binding rationale: no sibling key in
 * `lang/en.json` pluralizes two numbers in one string, and the established `…One` convention
 * only ever branches on ONE count, so a string carrying two or three counts uses the
 * count-agreement-neutral "(s)" form the same namespaces already use nearby, and a
 * single-count string gets a real `…One` sibling instead.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = JSON.parse(readFileSync(join(ROOT, 'lang/en.json'), 'utf8'));
const bulkEdit = lang.FABRICATE.Admin.Manager.Recipe.BulkEdit;
const deleteConfirm = lang.FABRICATE.Admin.Manager.Recipe.DeleteConfirm;

// Mirrors the `format()` helper every call site uses: one `.replace()` per token.
function interpolate(template, data) {
  let result = template;
  for (const [token, value] of Object.entries(data)) {
    result = result.replace(`{${token}}`, String(value));
  }
  return result;
}

describe('1132/copy the recipe delete card states three independent consequences', () => {
  it('the subject row names the recipes, at both counts', () => {
    assert.equal(interpolate(bulkEdit.ImpactRecipes, { count: 3 }), '3 recipes will be deleted.');
    assert.equal(bulkEdit.ImpactRecipesOne, '1 recipe will be deleted.');
  });

  it('the recipe-item row uses the display name, at both counts', () => {
    // `recipe item` is the canonical spec noun and `books & scrolls` is the display name the
    // manager's own navigation already uses for the same vocabulary. UI copy may say "book";
    // canonical spec text may not.
    assert.equal(interpolate(bulkEdit.ImpactItems, { count: 2 }), 'Removed from 2 books & scrolls.');
    assert.equal(bulkEdit.ImpactItemsOne, 'Removed from 1 book or scroll.');
  });

  // THE ROW COUNTS ARE INDEPENDENT, AND THE COPY MUST NOT ASSUME THEY AGREE. This is the
  // defect the authored copy shipped with: the delta wrote "1 book or scroll will lose it." /
  // "{count} books & scrolls will lose them.", branching on the ITEM count while the pronoun
  // agrees with the RECIPE count. Three recipes sharing one book — an ordinary selection, and
  // one the herbalism lab world offers three ways — rendered "3 recipes will be deleted. 1
  // book or scroll will lose it."
  //
  // Branching on both counts is a 2x2 key matrix per row, which is exactly what this file's
  // header records the "(s)" idiom as existing to avoid. Dropping the pronoun instead is
  // correct in all four combinations and keeps one `…One` sibling per row.
  it('states each consequence without a pronoun for the recipes, so the counts cannot disagree', () => {
    const PRONOUN = /\b(it|them)\b/;
    for (const [key, value] of [
      ['ImpactItems', interpolate(bulkEdit.ImpactItems, { count: 2 })],
      ['ImpactItemsOne', bulkEdit.ImpactItemsOne],
    ]) {
      assert.equal(
        PRONOUN.test(value),
        false,
        `${key} pronominalizes the recipes ("${value}"), so it reads wrong whenever the recipe count and the item count disagree`
      );
    }
    // The learners row keeps "it" — but only inside the spent-slot qualifier, where it refers
    // to the BOOK OR SCROLL that can no longer teach, not to the recipes. That is why the
    // sentence is checked up to the dash rather than banned outright.
    for (const [key, value] of [
      ['ImpactLearners', interpolate(bulkEdit.ImpactLearners, { count: 4 })],
      ['ImpactLearnersOne', bulkEdit.ImpactLearnersOne],
    ]) {
      const clause = value.split('—')[0];
      assert.equal(
        PRONOUN.test(clause),
        false,
        `${key}'s leading clause ("${clause.trim()}") pronominalizes the recipes`
      );
    }
  });

  it('reads correctly across the whole count matrix, which is what dropping the pronoun buys', () => {
    // The four combinations, rendered as the card renders them. Every one of these was
    // reachable before the correction and two of them read wrong.
    const render = (recipes, items) =>
      [
        recipes === 1
          ? bulkEdit.ImpactRecipesOne
          : interpolate(bulkEdit.ImpactRecipes, { count: recipes }),
        items === 1 ? bulkEdit.ImpactItemsOne : interpolate(bulkEdit.ImpactItems, { count: items }),
      ].join(' ');

    assert.equal(render(1, 1), '1 recipe will be deleted. Removed from 1 book or scroll.');
    assert.equal(render(3, 1), '3 recipes will be deleted. Removed from 1 book or scroll.');
    assert.equal(render(1, 2), '1 recipe will be deleted. Removed from 2 books & scrolls.');
    assert.equal(render(3, 2), '3 recipes will be deleted. Removed from 2 books & scrolls.');
  });

  it('the learners row carries the spent-slot qualifier at BOTH counts', () => {
    // The qualifier is the load-bearing half of that sentence, and it is a PROPERTY rather
    // than a count: `cleanupLearnedRecipes` forgets with `freeLearnBudget: false` and an
    // orphan entry frees nothing regardless, so a GM reading a bare "will forget" has every
    // reason to read it as re-teachable. Asserted per branch, because the singular branch is
    // where a shortened rewrite would land first.
    for (const sentence of [
      interpolate(bulkEdit.ImpactLearners, { count: 4 }),
      bulkEdit.ImpactLearnersOne,
    ]) {
      assert.match(sentence, /forgotten/i);
      assert.match(sentence, /do not get their learn slots? back/i);
      assert.match(sentence, /cannot teach it again/i);
    }
  });

  it('the standing hint states the IRREVERSIBILITY, which no row can carry', () => {
    // It is always rendered, so it is also what stops the card degrading to a bare heading
    // and an arm when both consequence rows are zero-gated away.
    assert.match(bulkEdit.DeleteStandingHint, /permanent/i);
    assert.match(bulkEdit.DeleteStandingHint, /new recipe/i);
  });
});

describe('1132/copy the recipe accessible names contain their visible labels', () => {
  // WCAG 2.5.3 Label in Name. A speech-input user activates a control by saying what they
  // can READ, so the accessible name has to CONTAIN the visible label string. Both essence
  // faces shipped violating this and the conversion onto `BulkDeleteCard` is what forced the
  // audit; the recipe pair is pinned per FACE from the start rather than after the fact.
  it('the ARMED accessible name contains, and leads with, the armed label', () => {
    const name = interpolate(bulkEdit.DeleteConfirmAria, { count: 3, items: 2, learners: 4 });
    assert.ok(
      name.includes(bulkEdit.DeleteConfirm),
      `"${name}" must contain the visible label "${bulkEdit.DeleteConfirm}"`
    );
    assert.ok(name.startsWith(bulkEdit.DeleteConfirm), 'and lead with it, so it is said first');
  });

  it('the ARMED accessible name carries all three counts and the irreversibility', () => {
    // The visible armed label stays count-free — `Confirm delete` — precisely so the
    // substring relation above can hold, which means the accessible name is the ONLY place a
    // screen-reader user hears what confirming reaches.
    const name = interpolate(bulkEdit.DeleteConfirmAria, { count: 3, items: 2, learners: 4 });
    assert.match(name, /3 recipe\(s\)/);
    assert.match(name, /2 recipe item\(s\)/);
    assert.match(name, /4 character\(s\)/);
    assert.match(name, /cannot be undone/i);
  });

  it('the IDLE accessible name contains the idle visible label at both counts', () => {
    assert.ok(
      interpolate(bulkEdit.DeleteAria, { count: 3 }).includes(
        interpolate(bulkEdit.Delete, { count: 3 })
      ),
      'the plural pair'
    );
    assert.ok(bulkEdit.DeleteAriaOne.includes(bulkEdit.DeleteOne), 'and the singular pair');
  });

  it('the armed announcement names the consequence, not just the state', () => {
    // A live region that exists and never says anything useful is an affordance that lies.
    const announcement = interpolate(bulkEdit.DeleteArmedAnnouncement, { count: 3 });
    assert.match(announcement, /3 recipe\(s\)/);
    assert.match(announcement, /again/i, 'and says a SECOND activation is what deletes');
    assert.match(announcement, /cannot be undone/i);
  });
});

describe('1132/copy the post-delete toast reports every non-zero outcome', () => {
  // The toast is the only feedback that survives the panel unmounting on a successful
  // delete, so a dropped clause is invisible in every other test. Each of the four branches
  // is asserted, and each is asserted to carry the numbers its name promises — deleting a
  // clause from any of them fails here.
  it('names the recipes on the plain branch', () => {
    assert.equal(interpolate(bulkEdit.Deleted, { count: 3 }), 'Deleted 3 recipe(s).');
  });

  it('names the recipe items when the prune rewrote any', () => {
    const sentence = interpolate(bulkEdit.DeletedWithItems, { count: 3, items: 2 });
    assert.match(sentence, /3 recipe\(s\)/);
    assert.match(sentence, /2 recipe item\(s\)/);
  });

  it('names the learners when any character lost the knowledge', () => {
    const sentence = interpolate(bulkEdit.DeletedWithLearners, { count: 3, learners: 4 });
    assert.match(sentence, /3 recipe\(s\)/);
    assert.match(sentence, /4 character\(s\)/);
  });

  it('names both when both are non-zero', () => {
    const sentence = interpolate(bulkEdit.DeletedWithItemsAndLearners, {
      count: 3,
      items: 2,
      learners: 4,
    });
    assert.match(sentence, /3 recipe\(s\)/);
    assert.match(sentence, /2 recipe item\(s\)/);
    assert.match(sentence, /4 character\(s\)/);
  });

  it('reads correctly with every count at 1, which is what the "(s)" idiom buys', () => {
    assert.equal(
      interpolate(bulkEdit.DeletedWithItemsAndLearners, { count: 1, items: 1, learners: 1 }),
      'Deleted 1 recipe(s), removed them from 1 recipe item(s), and 1 character(s) forgot them.'
    );
  });
});

describe('1132/copy the singular dialog reports the same arithmetic', () => {
  it('carries both counts, and its own confirm-button label', () => {
    const content = interpolate(deleteConfirm.Content, { name: 'Sunfire Draught', items: 2, learners: 4 });
    assert.match(content, /Sunfire Draught/);
    assert.match(content, /2 recipe item\(s\)/);
    assert.match(content, /4 character\(s\)/);
    // `DialogV2.confirm` merges `yes` over a default carrying `label: "COMMON.Yes"`, so a
    // destructive confirm needs its OWN label or it reads as the generic *Yes*.
    assert.equal(deleteConfirm.Confirm, 'Delete');
    assert.equal(interpolate(deleteConfirm.Title, { name: 'Sunfire Draught' }), 'Delete Sunfire Draught?');
  });

  it('has a numberless branch, so a recipe reaching nothing says so plainly', () => {
    // Stating "removed from 0 recipe item(s) and forgotten by 0 character(s)" is noise on the
    // commonest single delete there is, and it buries the fact that does matter.
    const plain = interpolate(deleteConfirm.ContentPlain, { name: 'Sunfire Draught' });
    assert.match(plain, /Sunfire Draught/);
    assert.match(plain, /permanent/i);
    assert.equal(/\d/.test(plain.replace('Sunfire Draught', '')), false, 'and names no count');
  });
});

describe('1132/copy the delete subtree makes no affirmative refund promise', () => {
  // The one thing this copy must never imply is that a character gets their learn slot
  // back. `forgetLearnedRecipes` is called with `freeLearnBudget: false`, and an orphan
  // entry frees nothing regardless, because a `total` pool key is unreconstructable once the
  // recipe is gone — so any of these verbs would be an outright lie about the write.
  //
  // The NEGATED construction is explicitly allowed, because the authored copy contains it:
  // "they do not get their learn slots back" is the sentence that makes the consequence
  // legible, and a blanket word ban would forbid the very phrasing the card needs.
  const FORBIDDEN = /\b(restor\w*|refund\w*|regain\w*|returned|returning)\b/i;
  const NEGATED = /\bdo(?:es)? not get their learn slots? back\b/i;

  function collect(node, prefix, out) {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') out.push([path, value]);
      else if (value && typeof value === 'object') collect(value, path, out);
    }
  }

  it('contains none of restored / refunded / regained / returned', () => {
    const entries = [];
    collect(bulkEdit, '', entries);
    collect(deleteConfirm, 'DeleteConfirm', entries);
    const subtree = entries.filter(([path]) => /(^|\.)(Delete|Impact)/.test(path));
    assert.ok(subtree.length > 0, 'the scan must actually reach the Delete*/Impact* keys');

    for (const [path, value] of subtree) {
      const withoutNegation = value.replace(NEGATED, '');
      assert.equal(
        FORBIDDEN.test(withoutNegation),
        false,
        `${path} promises a refund the write does not perform: "${value}"`
      );
    }
  });

  it('the scan can actually fail — proved against a planted string', () => {
    // A "must match nothing" assertion is worth exactly as much as the proof that it could
    // have matched something. Without this, a scan whose path filter silently matched no
    // keys would read as a green gate over an empty set.
    assert.ok(FORBIDDEN.test('their learn slots are restored'), 'the pattern catches an offender');
    assert.equal(
      FORBIDDEN.test('they do not get their learn slots back'.replace(NEGATED, '')),
      false,
      'and the negated construction survives it'
    );
  });
});
