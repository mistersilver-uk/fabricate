/**
 * The two shared leaves behind a recipe delete's impact statement (issue 1132).
 *
 * The point of this module existing is that the STATED number and the PERFORMED write
 * are not two models of one operation: `CraftingSystemManager.deleteRecipes` and
 * `adminStore.describeRecipeDelete` count through the SAME functions, so a drift between
 * "2 books & scrolls will lose them" and what the `craftingSystems` write actually does
 * is unrepresentable rather than merely unasserted.
 *
 * Two numbers live here and they are deliberately different questions:
 *
 *   - `affectedIds` — the recipe items that will no longer contain these recipes. It is
 *     BASIS-AWARE and true in both bases, and it is what the GM is shown.
 *   - `prunes` — the definitions whose `recipeIds[]` array is actually rewritten. On a
 *     legacy-basis system this is empty as a THEOREM of `_normalizeSystem`'s inference
 *     (a system whose marker is unset is by construction one where every `recipeIds` is
 *     empty), not because anything here branches on the basis to skip work.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { selectWritableActors } from '../src/systems/writableActors.js';
import {
  buildLearnedRecipeActorIndex,
  describeRecipeDeleteImpact,
  planRecipeItemMembershipPrune,
  selectLearnerActorIds,
} from '../src/utils/recipeDeleteImpact.js';

const BOOK_A_UUID = 'Item.bookA';
const BOOK_B_UUID = 'Item.bookB';

function definitions({ a = [], b = [] } = {}) {
  return [
    { id: 'book-a', name: 'Book A', originItemUuid: BOOK_A_UUID, recipeIds: [...a] },
    { id: 'book-b', name: 'Book B', originItemUuid: BOOK_B_UUID, recipeIds: [...b] },
  ];
}

function recipe(id, extra = {}) {
  return { id, name: id.toUpperCase(), ...extra };
}

/**
 * An actor whose learned-knowledge flag lives at the doubly-nested path
 * `getFlag('fabricate', 'fabricate.learnedRecipes')` every writer persists it at, so the
 * index is read exactly as the runtime reads it rather than off a convenience field.
 */
function learner(id, learnedIds, { isOwner = true } = {}) {
  const learned = Object.fromEntries(learnedIds.map((rid) => [rid, { learnedAt: 1 }]));
  return {
    id,
    isOwner,
    getFlag: (scope, key) =>
      scope === 'fabricate' && key === 'fabricate.learnedRecipes' ? learned : undefined,
  };
}

describe('planRecipeItemMembershipPrune', () => {
  it('counts DISTINCT recipe items and rewrites only the definitions that hold an id', () => {
    const defs = definitions({ a: ['r1', 'r2', 'r3'], b: ['r9'] });
    const plan = planRecipeItemMembershipPrune(defs, [recipe('r1'), recipe('r2')], true);

    assert.deepEqual(plan.affectedIds, ['book-a'], 'two recipes in one book is ONE book');
    assert.equal(plan.prunes.length, 1, 'only the definition that held them is rewritten');
    assert.deepEqual(plan.prunes[0].recipeIds, ['r3'], 'the surviving member is retained');
    assert.deepEqual(
      defs[0].recipeIds,
      ['r1', 'r2', 'r3'],
      'planning is PURE — it hands the caller the next array rather than writing it'
    );
  });

  it('spans several definitions and leaves untouched ones out of both numbers', () => {
    const defs = definitions({ a: ['r1'], b: ['r2'] });
    const plan = planRecipeItemMembershipPrune(defs, [recipe('r1'), recipe('r2')], true);
    assert.deepEqual(plan.affectedIds.sort(), ['book-a', 'book-b']);
    assert.equal(plan.prunes.length, 2);
  });

  it('rewrites nothing when no definition holds a doomed id', () => {
    const defs = definitions({ a: ['r9'] });
    const plan = planRecipeItemMembershipPrune(defs, [recipe('r1')], true);
    assert.deepEqual(plan.affectedIds, []);
    assert.equal(plan.prunes.length, 0);
  });

  it('states the legacy basis honestly: books lose the recipe, nothing is rewritten', () => {
    // A legacy-basis system: every `recipeIds` is empty, membership lives on the recipe.
    const defs = definitions();
    const plan = planRecipeItemMembershipPrune(
      defs,
      [recipe('r-scalar', { recipeItemId: 'book-a' }), recipe('r-uuid', { linkedRecipeItemUuid: BOOK_B_UUID })],
      false
    );

    assert.deepEqual(plan.affectedIds.sort(), ['book-a', 'book-b'], 'the stated count is basis-aware');
    assert.equal(
      plan.prunes.length,
      0,
      'nothing dangles under the legacy basis, so nothing is rewritten'
    );
  });

  it('does not fall through to the uuid leg when a scalar names nothing', () => {
    // Mirrors `_resolveLegacyMembershipDefinition`: a PRESENT `recipeItemId` resolves by
    // definition id and the uuid branch is never consulted, even when that id dangles.
    const plan = planRecipeItemMembershipPrune(
      definitions(),
      [recipe('r', { recipeItemId: 'book-gone', linkedRecipeItemUuid: BOOK_A_UUID })],
      false
    );
    assert.deepEqual(plan.affectedIds, []);
  });

  it('ignores the legacy scalar once the basis has switched', () => {
    const plan = planRecipeItemMembershipPrune(
      definitions(),
      [recipe('r', { recipeItemId: 'book-a' })],
      true
    );
    assert.deepEqual(plan.affectedIds, [], 'a modern-basis system resolves membership by array only');
  });

  it('tolerates absent definitions and recipes rather than throwing', () => {
    assert.deepEqual(planRecipeItemMembershipPrune(null, null, true), { affectedIds: [], prunes: [] });
    assert.deepEqual(planRecipeItemMembershipPrune(undefined, [recipe('r')], false), {
      affectedIds: [],
      prunes: [],
    });
  });
});

describe('buildLearnedRecipeActorIndex', () => {
  it('is scoped to the writable actors through the SAME selector the cascade uses', () => {
    // The identity pin (issue 1132): one shared collection carrying a non-owned actor,
    // which BOTH `selectWritableActors` and the learner index must exclude. If the
    // cascade is ever narrowed, this fails rather than the count silently over-reporting.
    const actors = [learner('a1', ['r1']), learner('a2', ['r1'], { isOwner: false })];

    assert.deepEqual(
      selectWritableActors(actors).map((actor) => actor.id),
      ['a1'],
      'the cascade selector excludes the non-owned actor'
    );
    const index = buildLearnedRecipeActorIndex(actors);
    assert.deepEqual([...(index.get('r1') ?? [])], ['a1'], 'and so does the learner index');
  });

  it('reads a Foundry collection through its `contents`', () => {
    const index = buildLearnedRecipeActorIndex({ contents: [learner('a1', ['r1', 'r2'])] });
    assert.deepEqual([...index.keys()].sort(), ['r1', 'r2']);
  });

  it('is empty rather than thrown for a headless world', () => {
    assert.equal(buildLearnedRecipeActorIndex(undefined).size, 0);
    assert.equal(buildLearnedRecipeActorIndex(null).size, 0);
  });
});

describe('selectLearnerActorIds', () => {
  it('is a DISTINCT union across the selection', () => {
    const index = buildLearnedRecipeActorIndex([
      learner('a1', ['r1', 'r2']),
      learner('a2', ['r2']),
      learner('a3', ['r9']),
    ]);
    assert.deepEqual(
      selectLearnerActorIds(index, ['r1', 'r2']).sort(),
      ['a1', 'a2'],
      'an actor who learned both recipes is counted once'
    );
    assert.deepEqual(selectLearnerActorIds(index, ['r-none']), []);
    assert.deepEqual(selectLearnerActorIds(null, ['r1']), []);
  });
});

describe('describeRecipeDeleteImpact', () => {
  const recipes = [
    recipe('r1'),
    recipe('r2'),
    recipe('r3', { recipeItemId: 'book-b' }),
  ];

  it('states three independent numbers over a modern-basis system', () => {
    const impact = describeRecipeDeleteImpact(['r1', 'r2'], {
      recipes,
      recipeItemDefinitions: definitions({ a: ['r1', 'r2'] }),
      membershipResolvesByRecipeIds: true,
      learnerIndex: buildLearnedRecipeActorIndex([learner('a1', ['r1']), learner('a2', ['r2'])]),
    });

    assert.equal(impact.deletable, 2);
    assert.deepEqual(impact.deletableIds, ['r1', 'r2']);
    assert.equal(impact.recipeItemsAffected, 1, 'two recipes in one book is ONE recipe item');
    assert.deepEqual(impact.recipeItemIds, ['book-a']);
    assert.equal(impact.learnersAffected, 2);
    assert.deepEqual(impact.learnerIds.sort(), ['a1', 'a2']);
  });

  it('drops an id that names no recipe rather than inflating the stated count', () => {
    const impact = describeRecipeDeleteImpact(['r1', 'ghost'], {
      recipes,
      recipeItemDefinitions: definitions({ a: ['r1'] }),
      membershipResolvesByRecipeIds: true,
    });
    assert.equal(impact.deletable, 1, 'a stale selected id is not deletable');
    assert.deepEqual(impact.deletableIds, ['r1']);
  });

  it('states the recipe-item figure on a legacy-basis system, where nothing is rewritten', () => {
    const defs = definitions();
    const impact = describeRecipeDeleteImpact(['r3'], {
      recipes,
      recipeItemDefinitions: defs,
      membershipResolvesByRecipeIds: false,
    });
    assert.equal(impact.recipeItemsAffected, 1, 'the book does stop containing it');
    assert.equal(
      planRecipeItemMembershipPrune(defs, [recipes[2]], false).prunes.length,
      0,
      'and the write rewrites no definition — the two numbers differ BY DEFINITION'
    );
  });

  it('returns the zero impact rather than throwing on a render path', () => {
    const zero = {
      deletable: 0,
      deletableIds: [],
      recipeItemsAffected: 0,
      recipeItemIds: [],
      learnersAffected: 0,
      learnerIds: [],
    };
    assert.deepEqual(describeRecipeDeleteImpact(['r1'], undefined), zero, 'absent system');
    assert.deepEqual(describeRecipeDeleteImpact(null, { recipes }), zero, 'no selection');
    assert.deepEqual(
      describeRecipeDeleteImpact(['r1'], { recipes: null, recipeItemDefinitions: null }),
      zero,
      'a stale system id resolves to nothing'
    );
  });
});
