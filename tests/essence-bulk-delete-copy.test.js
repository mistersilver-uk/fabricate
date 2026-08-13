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

// Issue 1156: the singular delete dialog stated both consequence figures unconditionally, so
// the commonest single delete of all — an essence carried by nothing and required by no
// recipe — read "This removes it from 0 component(s) and rewrites 0 recipe(s) that require
// it." The recipe dialog fixed this for its own consequences in #1152 and added the
// `ui-integration` clause making zero-omission the rule for every studio's singular dialog;
// this is the essence sibling of that fix.
describe('1156/copy the essence delete dialog omits zero consequences', () => {
  const deleteConfirm = lang.FABRICATE.Admin.Manager.Essence.DeleteConfirm;

  it('names both counts when both are non-zero', () => {
    const content = interpolate(deleteConfirm.Content, { name: 'Fire', components: 2, recipes: 3 });
    assert.match(content, /Fire/);
    assert.match(content, /2 component\(s\)/);
    assert.match(content, /3 recipe\(s\)/);
  });

  // FOUR BRANCHES, BECAUSE THE TWO CONSEQUENCES ARE INDEPENDENT (`describeEssenceDeleteImpact`):
  // an essence can carry no component yet be required by recipes, or the reverse.
  it('has a branch per consequence, so neither is ever stated as a nought', () => {
    const componentsOnly = interpolate(deleteConfirm.ContentComponents, {
      name: 'Fire',
      components: 2,
    });
    assert.match(componentsOnly, /2 component\(s\)/);
    assert.equal(/recipe/i.test(componentsOnly), false, 'and says nothing about recipes');

    const recipesOnly = interpolate(deleteConfirm.ContentRecipes, { name: 'Fire', recipes: 3 });
    assert.match(recipesOnly, /3 recipe\(s\)/);
    assert.equal(/component/i.test(recipesOnly), false, 'and says nothing about components');
  });

  it('has a numberless branch, so an essence reaching nothing says so plainly', () => {
    const plain = interpolate(deleteConfirm.ContentPlain, { name: 'Fire' });
    assert.match(plain, /Fire/);
    assert.match(plain, /permanent/i);
    assert.equal(/\d/.test(plain.replace('Fire', '')), false, 'and names no count');
  });

  it('states every branch in the FUTURE, not as accomplished fact', () => {
    for (const [key, data] of [
      ['Content', { name: 'X', components: 2, recipes: 3 }],
      ['ContentComponents', { name: 'X', components: 2 }],
      ['ContentRecipes', { name: 'X', recipes: 3 }],
    ]) {
      const value = interpolate(deleteConfirm[key], data);
      assert.match(value, /will be (removed|rewritten)/, `${key} describes what deleting WILL do`);
    }
  });

  it('reads correctly at a count of one in the combined branch', () => {
    const content = interpolate(deleteConfirm.Content, { name: 'X', components: 1, recipes: 1 });
    assert.match(content, /1 component\(s\)/);
    assert.match(content, /1 recipe\(s\)/);
  });

  it('every branch states that deleting is permanent', () => {
    for (const [key, data] of [
      ['Content', { name: 'X', components: 2, recipes: 3 }],
      ['ContentComponents', { name: 'X', components: 2 }],
      ['ContentRecipes', { name: 'X', recipes: 3 }],
      ['ContentPlain', { name: 'X' }],
    ]) {
      assert.match(
        interpolate(deleteConfirm[key], data),
        /permanent/i,
        `${key} states permanence`
      );
    }
  });

  it('titles the dialog with the essence name', () => {
    assert.equal(interpolate(deleteConfirm.Title, { name: 'Fire' }), 'Delete Fire?');
  });
});

describe('1156/copy the essence delete dialog uses correct verb agreement at recipes: 1', () => {
  const deleteConfirm = lang.FABRICATE.Admin.Manager.Essence.DeleteConfirm;

  it('uses singular "requires" in ContentRecipesOne when recipes count is 1', () => {
    const sentence = interpolate(deleteConfirm.ContentRecipesOne, { name: 'Fire' });
    assert.match(
      sentence,
      /1 recipe that requires it/,
      'singular verb "requires" at recipes: 1'
    );
    assert.ok(!sentence.includes('that require it'), 'not plural "require"');
    assert.match(sentence, /Fire/);
  });

  it('reads the ContentRecipesOne string in full', () => {
    const sentence = interpolate(deleteConfirm.ContentRecipesOne, { name: 'Fire' });
    assert.equal(
      sentence,
      'Delete essence Fire? 1 recipe that requires it will be rewritten. Deleting is permanent — an essence you recreate is a new essence.'
    );
  });

  it('uses singular "requires" in ContentOne when recipes count is 1 and components are present', () => {
    const sentence = interpolate(deleteConfirm.ContentOne, { name: 'Fire', components: 2 });
    assert.match(
      sentence,
      /1 recipe that requires it/,
      'singular verb "requires" at recipes: 1'
    );
    assert.ok(!sentence.includes('that require it'), 'not plural "require"');
    assert.match(sentence, /2 component\(s\)/);
    assert.match(sentence, /Fire/);
  });

  it('reads the ContentOne string in full when recipes: 1 and components: 2', () => {
    const sentence = interpolate(deleteConfirm.ContentOne, { name: 'Fire', components: 2 });
    assert.equal(
      sentence,
      'Delete essence Fire? It will be removed from 2 component(s), and 1 recipe that requires it will be rewritten. Deleting is permanent — an essence you recreate is a new essence.'
    );
  });
});
