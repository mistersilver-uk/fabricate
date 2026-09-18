/**
 * The recipe bulk-delete strings (issue 1132) — the third and last studio's copy suite, and the
 * twin of `essence-bulk-delete-copy.test.js` / `component-bulk-delete-copy.test.js`.
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
    // manager's own navigation already uses for the same vocabulary.
    assert.equal(
      interpolate(bulkEdit.ImpactItems, { count: 2 }),
      'Will be removed from 2 books & scrolls.'
    );
    assert.equal(bulkEdit.ImpactItemsOne, 'Will be removed from 1 book or scroll.');
  });

  // ONE COUNTABLE NOUN FOR ONE COUNT, ACROSS ALL FOUR SURFACES.
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

  // The display name has no count-neutral singular, so the strings carrying two or three counts say
  // "{items} of your books & scrolls" rather than "book(s) or scroll(s)".
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

  // Every consequence row is a FORECAST, and it sits one line under a subject row that says "will
  // be deleted".
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

  // THE ROW COUNTS ARE INDEPENDENT, AND THE COPY MUST NOT ASSUME THEY AGREE.
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
    // THE LEARNERS ROW IS SCANNED WHOLE, AND THAT IS THE CORRECTION.
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

  // The OTHER half of the same class, and the one the qualifier still carried after the pronoun
  // went: the row branches on the LEARNER count, and "their learn slot" agrees with the number of
  // slots each character spent — which is how many of the SELECTED recipes they had learned.
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

  // THE CARD AS PUBLISHED, at the counts the View Lab fixtures produce (3 recipes, 1 recipe item, 2
  // characters).
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
    // The qualifier is the load-bearing half of that sentence, and it is a PROPERTY rather than a
    // count: `cleanupLearnedRecipes` forgets with `freeLearnBudget: false` and an orphan entry
    // frees nothing regardless, so a GM reading a bare "will forget" has every reason to read it as
    // re-teachable.
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
  // WCAG 2.5.3 Label in Name. A speech-input user activates a control by saying what they can READ,
  // so the accessible name has to CONTAIN the visible label string.
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
  // The toast is the only feedback that survives the panel unmounting on a successful delete, so a
  // dropped clause is invisible in every other test.
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

  // FOUR BRANCHES, BECAUSE THE TWO CONSEQUENCES ARE INDEPENDENT.
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
    // The trailing "a character does not get their learn slot back" is a consequence OF the learner
    // clause.
    assert.match(deleteConfirm.Content, /learn slot back/);
    assert.match(deleteConfirm.ContentLearners, /learn slot back/);
    assert.equal(/learn slot/.test(deleteConfirm.ContentItems), false);
    assert.equal(/learn slot/.test(deleteConfirm.ContentPlain), false);
  });
});

describe('1132/copy the delete subtree makes no affirmative refund promise', () => {
  // The one thing this copy must never imply is that a character gets their learn slot back.
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
    // A "must match nothing" assertion is worth exactly as much as the proof that it could have
    // matched something.
    assert.ok(FORBIDDEN.test('their learn slots are restored'), 'the pattern catches an offender');
    assert.equal(
      FORBIDDEN.test('they do not get their learn slots back'.replace(NEGATED, '')),
      false,
      'and the negated construction survives it'
    );
  });
});
