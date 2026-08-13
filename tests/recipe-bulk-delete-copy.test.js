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
    assert.equal(
      interpolate(bulkEdit.ImpactItems, { count: 2 }),
      'Will be removed from 2 books & scrolls.'
    );
    assert.equal(bulkEdit.ImpactItemsOne, 'Will be removed from 1 book or scroll.');
  });

  // ONE COUNTABLE NOUN FOR ONE COUNT, ACROSS ALL FOUR SURFACES. The recipe-item figure is
  // named on the card, in the armed accessible name, in the completion toast and in the
  // singular dialog, and it was named two ways: `books & scrolls` on the card and
  // `recipe item(s)` on the other three. The aria/visible pair was the worst of it, because
  // `aria-describedby` points AT the card's list — a screen-reader user heard "2 recipe
  // item(s)" as the name of a control described by a row reading "2 books & scrolls".
  //
  // The DISPLAY NAME won, and the corpus is the reason: every other item-referring string in
  // this namespace already says it (`BookPick`, `BookSearch`/`BookSearchOne`, `BookNoMatch`,
  // `BookClearPick`, `AppliedBooks*`), so naming it `recipe item` here would have traded a
  // four-surface split for a one-against-ten split inside the studio's own copy.
  it('names the recipe-item figure with ONE noun across card, dialog, toast and aria', () => {
    const surfaces = [
      ['card plural', interpolate(bulkEdit.ImpactItems, { count: 2 })],
      ['card singular', bulkEdit.ImpactItemsOne],
      ['armed aria', interpolate(bulkEdit.DeleteConfirmAria, { count: 3, items: 2, learners: 4 })],
      ['toast (items)', interpolate(bulkEdit.DeletedWithItems, { count: 3, items: 2 })],
      [
        'toast (both)',
        interpolate(bulkEdit.DeletedWithItemsAndLearners, { count: 3, items: 2, learners: 4 }),
      ],
      [
        'dialog (both)',
        interpolate(deleteConfirm.Content, { name: 'Sunfire Draught', items: 2, learners: 4 }),
      ],
      ['dialog (items)', interpolate(deleteConfirm.ContentItems, { name: 'X', items: 2 })],
    ];
    for (const [where, sentence] of surfaces) {
      assert.match(sentence, /books? (?:&|or) scrolls?/i, `${where} names the display name`);
      assert.equal(
        /recipe items?\b/i.test(sentence),
        false,
        `${where} must not name the same count a second way ("${sentence}")`
      );
    }
  });

  // The display name has no count-neutral singular, so the strings carrying two or three
  // counts say "{items} of your books & scrolls" rather than "book(s) or scroll(s)". The
  // whole point is that it reads correctly at ONE.
  it('reads correctly at a count of one in every multi-count string', () => {
    const one = /1 of your books & scrolls/;
    assert.match(interpolate(bulkEdit.DeleteConfirmAria, { count: 1, items: 1, learners: 1 }), one);
    assert.match(interpolate(bulkEdit.DeletedWithItems, { count: 1, items: 1 }), one);
    assert.match(
      interpolate(bulkEdit.DeletedWithItemsAndLearners, { count: 1, items: 1, learners: 1 }),
      one
    );
    assert.match(interpolate(deleteConfirm.Content, { name: 'X', items: 1, learners: 1 }), one);
  });

  // Every consequence row is a FORECAST, and it sits one line under a subject row that says
  // "will be deleted". "Removed from 1 book or scroll." above a button that has not been
  // pressed reads as current state, and the mood split between the two made the card look
  // like a description of what had already happened.
  it('states each consequence in the future, not as accomplished fact', () => {
    for (const [key, value] of [
      ['ImpactItems', interpolate(bulkEdit.ImpactItems, { count: 2 })],
      ['ImpactItemsOne', bulkEdit.ImpactItemsOne],
      ['ImpactLearners', interpolate(bulkEdit.ImpactLearners, { count: 4 })],
      ['ImpactLearnersOne', bulkEdit.ImpactLearnersOne],
    ]) {
      assert.match(value, /^Will be /, `${key} states a forecast, not a completed state`);
    }
    assert.match(bulkEdit.ImpactRecipes, /will be deleted/);
    assert.match(bulkEdit.ImpactRecipesOne, /will be deleted/);
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
    // THE LEARNERS ROW IS SCANNED WHOLE, AND THAT IS THE CORRECTION. It used to be checked
    // only up to the dash, on the argument that the "it" in "a spent book or scroll cannot
    // teach it again" named the book. It did not: the book is the SUBJECT of "cannot teach",
    // so its object is the recipe — and with three recipes selected, "cannot teach it again"
    // names one of three. The exemption made this gate green ON the defect it exists to
    // catch, which is worse than not having it, so the whole string is banned now.
    for (const [key, value] of [
      ['ImpactLearners', interpolate(bulkEdit.ImpactLearners, { count: 4 })],
      ['ImpactLearnersOne', bulkEdit.ImpactLearnersOne],
    ]) {
      assert.equal(
        PRONOUN.test(value),
        false,
        `${key} pronominalizes the recipes somewhere in "${value}" — including inside the qualifier, where "cannot teach it again" names the recipe and not the book`
      );
    }
  });

  // The OTHER half of the same class, and the one the qualifier still carried after the
  // pronoun went: the row branches on the LEARNER count, and "their learn slot" agrees with
  // the number of slots each character spent — which is how many of the SELECTED recipes
  // they had learned. One character who learned three of them loses three slots and still
  // read the singular branch. A general statement of the rule is true at every combination.
  it('states the spent-slot rule without agreeing with a count the row does not branch on', () => {
    for (const [key, value] of [
      ['ImpactLearners', interpolate(bulkEdit.ImpactLearners, { count: 4 })],
      ['ImpactLearnersOne', bulkEdit.ImpactLearnersOne],
    ]) {
      assert.equal(
        /their learn slots?\b/i.test(value),
        false,
        `${key} makes the slot count agree with the character count ("${value}")`
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

    assert.equal(render(1, 1), '1 recipe will be deleted. Will be removed from 1 book or scroll.');
    assert.equal(render(3, 1), '3 recipes will be deleted. Will be removed from 1 book or scroll.');
    assert.equal(render(1, 2), '1 recipe will be deleted. Will be removed from 2 books & scrolls.');
    assert.equal(
      render(3, 2),
      '3 recipes will be deleted. Will be removed from 2 books & scrolls.'
    );
  });

  // THE CARD AS PUBLISHED, at the counts the View Lab fixtures produce (3 recipes, 1 recipe
  // item, 2 characters). This is the sentence in the frame this change ships as its
  // evidence, and it is the exact combination the pronoun defect read wrong in.
  it('reads correctly at 3 recipes / 1 recipe item / 2 characters, the published frame', () => {
    const card = [
      interpolate(bulkEdit.ImpactRecipes, { count: 3 }),
      bulkEdit.ImpactItemsOne,
      interpolate(bulkEdit.ImpactLearners, { count: 2 }),
    ].join(' ');

    assert.equal(
      card,
      '3 recipes will be deleted. Will be removed from 1 book or scroll. Will be forgotten by 2 characters — spent learn slots are not given back, and a spent book or scroll cannot teach a deleted recipe again.'
    );
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
      assert.match(sentence, /learn slots are not given back/i);
      assert.match(sentence, /cannot teach a deleted recipe again/i);
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
    assert.match(name, /2 of your books & scrolls/);
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

  it('names the recipe items that no longer contain them', () => {
    const sentence = interpolate(bulkEdit.DeletedWithItems, { count: 3, items: 2 });
    assert.match(sentence, /3 recipe\(s\)/);
    assert.match(sentence, /2 of your books & scrolls/);
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
    assert.match(sentence, /2 of your books & scrolls/);
    assert.match(sentence, /4 character\(s\)/);
  });

  it('reads correctly with every count at 1, which is what the "(s)" idiom buys', () => {
    assert.equal(
      interpolate(bulkEdit.DeletedWithItemsAndLearners, { count: 1, items: 1, learners: 1 }),
      'Deleted 1 recipe(s), removed them from 1 of your books & scrolls, and 1 character(s) forgot them.'
    );
  });
});

describe('1132/copy the singular dialog reports the same arithmetic', () => {
  it('carries both counts, and its own confirm-button label', () => {
    const content = interpolate(deleteConfirm.Content, { name: 'Sunfire Draught', items: 2, learners: 4 });
    assert.match(content, /Sunfire Draught/);
    assert.match(content, /2 of your books & scrolls/);
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

  // FOUR BRANCHES, BECAUSE THE TWO CONSEQUENCES ARE INDEPENDENT. Gating them as a pair made
  // the commonest single delete of all — in one book, learned by nobody — render
  // "… and forgotten by 0 character(s)", and its mirror render "removed from 0 recipe
  // item(s)". The card omits a zero consequence rather than stating it; the dialog for the
  // same action has to obey the same rule, and each single-consequence branch must carry
  // only the number it is for.
  it('has a branch per consequence, so neither is ever stated as a nought', () => {
    const itemsOnly = interpolate(deleteConfirm.ContentItems, { name: 'Sunfire Draught', items: 2 });
    assert.match(itemsOnly, /2 of your books & scrolls/);
    assert.equal(/character/i.test(itemsOnly), false, 'and says nothing about characters');

    const learnersOnly = interpolate(deleteConfirm.ContentLearners, {
      name: 'Sunfire Draught',
      learners: 4,
    });
    assert.match(learnersOnly, /4 character\(s\)/);
    assert.equal(
      /books? (?:&|or) scrolls?/i.test(learnersOnly),
      false,
      'and the learner-only branch says nothing about books'
    );
  });

  it('states the consequence in the FUTURE — the recipe still exists as the GM reads it', () => {
    for (const [key, value] of [
      ['Content', interpolate(deleteConfirm.Content, { name: 'X', items: 2, learners: 4 })],
      ['ContentItems', interpolate(deleteConfirm.ContentItems, { name: 'X', items: 2 })],
      ['ContentLearners', interpolate(deleteConfirm.ContentLearners, { name: 'X', learners: 4 })],
    ]) {
      assert.match(value, /It will be /, `${key} describes what deleting WILL do`);
    }
  });

  it('names the learn slot only where a character is actually named', () => {
    // The trailing "a character does not get their learn slot back" is a consequence OF the
    // learner clause. On the items-only branch there is no learner, so the sentence would be
    // a warning about nobody.
    assert.match(deleteConfirm.Content, /learn slot back/);
    assert.match(deleteConfirm.ContentLearners, /learn slot back/);
    assert.equal(/learn slot/.test(deleteConfirm.ContentItems), false);
    assert.equal(/learn slot/.test(deleteConfirm.ContentPlain), false);
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
