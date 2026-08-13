/**
 * The Recipe Studio's set delete, store side (issue 1132).
 *
 * `describeRecipeDelete` is what the bulk panel renders BEFORE the GM arms the control, and
 * `deleteRecipes` is what the second click performs. The contract between them is
 * STRUCTURAL rather than asserted: both this describer and
 * `CraftingSystemManager.deleteRecipes` count through `utils/recipeDeleteImpact.js`, so the
 * stated numbers cannot be a parallel model of the write. What is asserted here is the
 * STORE's half — the resolution, the caching, the render-path tolerance and the failure
 * mode — plus the divergence MATRIX the delta requires, because "the statement equals the
 * write" is one claim per axis, not one fixture.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createServices,
  makeFlaggedActor,
  makeRecipe,
  makeSystem,
} from '../helpers/adminStoreServices.js';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

let originalGame;

// Three recipes, two books. `primer` holds r1 AND r2 — the distinct-union case — and
// `codex` holds r3. Two characters have learned things; `a3` is NOT owned by this client.
function seedWorld() {
  globalThis.game = {
    i18n: { localize: (key) => key, format: (key) => key },
    actors: {
      contents: [
        makeFlaggedActor({
          id: 'a1',
          flags: { fabricate: { fabricate: { learnedRecipes: { r1: 1, r2: 1 } } } },
        }),
        makeFlaggedActor({
          id: 'a2',
          flags: { fabricate: { fabricate: { learnedRecipes: { r2: 1 } } } },
        }),
        makeFlaggedActor({
          id: 'a3',
          isOwner: false,
          flags: { fabricate: { fabricate: { learnedRecipes: { r1: 1 } } } },
        }),
      ],
    },
  };
}

function modernSystem() {
  return makeSystem({
    membershipResolvesByRecipeIds: true,
    recipeItemDefinitions: [
      { id: 'primer', name: 'Primer', originItemUuid: 'Item.aaa', recipeIds: ['r1', 'r2'], caps: {} },
      { id: 'codex', name: 'Codex', originItemUuid: 'Item.bbb', recipeIds: ['r3'], caps: {} },
    ],
  });
}

function threeRecipes() {
  return [
    makeRecipe({ id: 'r1', name: 'One' }),
    makeRecipe({ id: 'r2', name: 'Two' }),
    makeRecipe({ id: 'r3', name: 'Three' }),
  ];
}

// `createServices`' system manager has no delete of its own, so each suite threads a
// recorder in. It returns the shape the real `deleteRecipes` returns.
function withDeleteRecorder(services, calls, result = null, thrown = null) {
  const systemManager = services.getCraftingSystemManager();
  services.getCraftingSystemManager = () => ({
    ...systemManager,
    deleteRecipes: async (systemId, recipeIds, options) => {
      calls.push({ systemId, recipeIds: [...recipeIds], options });
      if (thrown) throw thrown;
      return (
        result || {
          deleted: recipeIds.length,
          recipeIds: [...recipeIds],
          recipeItemsAffected: 0,
          recipeItemsRewritten: 0,
          learnersAffected: 0,
        }
      );
    },
  });
  return services;
}

beforeEach(() => {
  originalGame = globalThis.game;
  globalThis.fromUuid = async () => null;
  seedWorld();
});

afterEach(() => {
  globalThis.game = originalGame;
});

describe('1132 adminStore.describeRecipeDelete', () => {
  it('states three independent numbers, each a DISTINCT union', async () => {
    const store = createAdminStore(createServices(modernSystem(), threeRecipes()));
    await store.refresh();

    const impact = store.describeRecipeDelete(['r1', 'r2']);
    assert.equal(impact.deletable, 2);
    // ONE book, not two: `primer` holds both selected recipes.
    assert.equal(impact.recipeItemsAffected, 1);
    assert.deepEqual(impact.recipeItemIds, ['primer']);
    // TWO learners, not three: a1 learned both (counted once), a2 learned r2, and a3 is
    // not writable by this client.
    assert.equal(impact.learnersAffected, 2);
    assert.deepEqual([...impact.learnerIds].sort(), ['a1', 'a2']);
  });

  it('excludes the actor this client may not write, on the SAME set the cascade walks', async () => {
    // a3 learned r1 and nothing else, so selecting r1 alone is the sharpest probe: the
    // count is the one actor who is BOTH a learner and writable.
    const store = createAdminStore(createServices(modernSystem(), threeRecipes()));
    await store.refresh();

    const impact = store.describeRecipeDelete(['r1']);
    assert.deepEqual(impact.learnerIds, ['a1'], 'a3 is not owned by this client');
  });

  it('returns the zero impact for an empty selection rather than a partial object', async () => {
    const store = createAdminStore(createServices(modernSystem(), threeRecipes()));
    await store.refresh();

    const impact = store.describeRecipeDelete([]);
    assert.equal(impact.deletable, 0);
    assert.deepEqual(impact.deletableIds, []);
    assert.equal(impact.recipeItemsAffected, 0);
    assert.equal(impact.learnersAffected, 0);
  });

  it('returns the zero impact, not a throw, for a stale or absent system on the render path', async () => {
    // The describer runs inside a `$derived` on every selection change, so a throw here is a
    // broken panel rather than a caught error. A system id that resolves to nothing is
    // reachable: the browser publishes asynchronously and a system can be deleted under it.
    const services = createServices(modernSystem(), threeRecipes());
    const systemManager = services.getCraftingSystemManager();
    services.getCraftingSystemManager = () => ({ ...systemManager, getSystem: () => null });
    const store = createAdminStore(services);
    await store.refresh();

    const impact = store.describeRecipeDelete(['r1', 'r2']);
    assert.equal(impact.deletable, 0, 'and it is the ZERO impact, not a stale one');
    assert.equal(impact.recipeItemsAffected, 0);
    assert.equal(impact.learnersAffected, 0);
  });

  it('builds the learner index ONCE per refresh, iterating no actors per selection change', async () => {
    // The panel re-derives on every tick of a checkbox. A world walk per tick is what this
    // cache exists to prevent, and the only honest way to see it is to count the reads.
    let actorReads = 0;
    const services = createServices(modernSystem(), threeRecipes(), [], {
      getWorldActors: () => {
        actorReads += 1;
        return globalThis.game.actors.contents;
      },
    });
    const store = createAdminStore(services);
    await store.refresh();

    // Measured as DELTAS rather than absolutes: `createAdminStore` fires its own opening
    // refresh, so an absolute count would pin the constructor's behaviour by accident and
    // break the moment that changed for an unrelated reason.
    const afterRefresh = actorReads;
    assert.ok(afterRefresh > 0, 'the seam is actually reached, or the deltas below prove nothing');

    for (const ids of [['r1'], ['r1', 'r2'], ['r2'], ['r1', 'r2', 'r3']]) {
      store.describeRecipeDelete(ids);
    }
    assert.equal(actorReads, afterRefresh, 'no walk at all per selection change');

    await store.refresh();
    assert.equal(
      actorReads,
      afterRefresh + 1,
      'exactly ONE walk per refresh — the Books & Scrolls count shares this build, and a new refresh rebuilds it so it cannot go stale'
    );
  });
});

describe('1132 adminStore.describeRecipeDelete — the divergence matrix', () => {
  // ACCEPTANCE 7 is a MATRIX over the axes on which the STATED and the PERFORMED numbers
  // can legitimately differ, not a single fixture. Each number is asserted against its own
  // definition, because conflating them would produce a test written against two things that
  // differ by design, which then gets weakened until it proves nothing.

  it('AXIS 1 — membership basis: the stated recipe-item count is basis-aware', async () => {
    // On a LEGACY-basis system membership lives on the recipe's own `recipeItemId` scalar
    // and every `recipeIds` array is empty by construction. The write rewrites nothing —
    // `recipeItemsRewritten` is 0 — but the sentence "1 book or scroll" is still
    // TRUE, because the book really does stop containing the recipe. Revision 2 of this
    // delta would have stated the number and pruned nothing while claiming they matched.
    const legacy = makeSystem({
      recipeItemDefinitions: [
        { id: 'primer', name: 'Primer', originItemUuid: 'Item.aaa', recipeIds: [], caps: {} },
      ],
    });
    const recipes = [
      makeRecipe({ id: 'r1', name: 'One', recipeItemId: 'primer' }),
      makeRecipe({ id: 'r2', name: 'Two', recipeItemId: 'primer' }),
    ];
    const store = createAdminStore(createServices(legacy, recipes));
    await store.refresh();

    const impact = store.describeRecipeDelete(['r1', 'r2']);
    assert.equal(impact.deletable, 2);
    assert.equal(impact.recipeItemsAffected, 1, 'the STATED figure, distinct-unioned');
    assert.deepEqual(impact.recipeItemIds, ['primer']);
  });

  it('AXIS 2 — a stale selected id inflates neither the statement nor the write', async () => {
    // `RecipesBrowserView` prunes phantom ids only when the projection republishes, which is
    // a different moment from the click, and `RecipeManager.deleteRecipe` THROWS for an id
    // that no longer resolves. So the card states, and the button deletes, the resolvable
    // ids — and `deletableIds` is what the confirm handler is handed.
    const store = createAdminStore(createServices(modernSystem(), threeRecipes()));
    await store.refresh();

    const impact = store.describeRecipeDelete(['r1', 'ghost', 'r3']);
    assert.equal(impact.deletable, 2, 'not 3');
    assert.deepEqual(impact.deletableIds, ['r1', 'r3']);
    assert.equal(
      impact.recipeItemIds.includes('primer') && impact.recipeItemIds.includes('codex'),
      true,
      'and the consequences follow the resolvable ids only'
    );
  });

  it('AXIS 2b — a wholly stale selection states zero and is not deletable', async () => {
    const store = createAdminStore(createServices(modernSystem(), threeRecipes()));
    await store.refresh();

    const impact = store.describeRecipeDelete(['ghost-a', 'ghost-b']);
    assert.equal(impact.deletable, 0, 'which is what disables the control');
    assert.deepEqual(impact.deletableIds, []);
  });

  it('AXIS 3a — a zero recipe-item count, with learners non-zero', async () => {
    // The card gates a consequence row on its own count, so each row must be reachable at
    // zero INDEPENDENTLY of the other. `orphan` is in no book but has been learned.
    const system = modernSystem();
    const recipes = [...threeRecipes(), makeRecipe({ id: 'orphan', name: 'Orphan' })];
    globalThis.game.actors.contents[0].flags.fabricate.fabricate.learnedRecipes.orphan = 1;
    const store = createAdminStore(createServices(system, recipes));
    await store.refresh();

    const impact = store.describeRecipeDelete(['orphan']);
    assert.equal(impact.deletable, 1);
    assert.equal(impact.recipeItemsAffected, 0, 'the row the card omits');
    assert.equal(impact.learnersAffected, 1, 'the row the card still renders');
  });

  it('AXIS 3b — a zero learner count, with recipe items non-zero', async () => {
    // `r3` sits in `codex` and nobody has learned it.
    const store = createAdminStore(createServices(modernSystem(), threeRecipes()));
    await store.refresh();

    const impact = store.describeRecipeDelete(['r3']);
    assert.equal(impact.deletable, 1);
    assert.equal(impact.recipeItemsAffected, 1);
    assert.equal(impact.learnersAffected, 0, 'the row the card omits');
  });

  it('AXIS 3c — both consequence rows zero, and the SUBJECT row still has a number', async () => {
    // This is the case the subject row's zero-gate exemption exists for: a card that stated
    // nothing at all would have lost the pairing the arm depends on.
    const recipes = [...threeRecipes(), makeRecipe({ id: 'lonely', name: 'Lonely' })];
    const store = createAdminStore(createServices(modernSystem(), recipes));
    await store.refresh();

    const impact = store.describeRecipeDelete(['lonely']);
    assert.equal(impact.deletable, 1);
    assert.equal(impact.recipeItemsAffected, 0);
    assert.equal(impact.learnersAffected, 0);
  });
});

describe('1132 adminStore.deleteRecipes', () => {
  it('routes the RESOLVED ids to the manager, suppressing its per-recipe notification', async () => {
    // `notify: false` is load-bearing, not defensive: `RecipeManager.deleteRecipe` raises
    // its own singular info toast by default, so leaving it on gives the GM N toasts AND the
    // root's summary for one action.
    const calls = [];
    const services = withDeleteRecorder(createServices(modernSystem(), threeRecipes()), calls);
    const store = createAdminStore(services);
    await store.refresh();

    const result = await store.deleteRecipes(['r1', 'ghost', 'r2']);
    assert.equal(calls.length, 1, 'ONE call for the whole set');
    assert.deepEqual(calls[0].recipeIds, ['r1', 'r2'], 'the stale id never reaches the write');
    assert.equal(calls[0].options?.notify, false);
    assert.equal(result.deleted, 2);
  });

  // A DELETE THAT REACHED NOTHING REPORTS, and it is reachable with no failure at all: a
  // concurrent client deleting the same recipes between the describe and the click empties
  // the resolvable set. The store used to return the zero result in silence and the caller
  // then returned `false`, so a GM who clicked delete and saw nothing happen was told
  // nothing; only the `catch` surfaced anything at all (issue 1132, review round).
  it('writes nothing, and SAYS so, when no selected id resolves', async () => {
    const calls = [];
    const warnings = [];
    const services = withDeleteRecorder(
      createServices(modernSystem(), threeRecipes(), [], {
        notify: { info: () => {}, warn: (message) => warnings.push(message), error: () => {} },
      }),
      calls
    );
    const store = createAdminStore(services);
    await store.refresh();

    const result = await store.deleteRecipes(['ghost']);
    assert.equal(calls.length, 0);
    assert.equal(result.deleted, 0);
    assert.equal(warnings.length, 1, 'the GM is told the delete reached nothing');
    assert.ok(warnings[0], 'with a message, not an empty string');
  });

  it('reports a write that succeeded but deleted nothing, which is the same silence', async () => {
    const calls = [];
    const warnings = [];
    const services = withDeleteRecorder(
      createServices(modernSystem(), threeRecipes(), [], {
        notify: { info: () => {}, warn: (message) => warnings.push(message), error: () => {} },
      }),
      calls,
      { deleted: 0, recipeIds: [], recipeItemsAffected: 0, recipeItemsRewritten: 0, learnersAffected: 0 }
    );
    const store = createAdminStore(services);
    await store.refresh();

    const result = await store.deleteRecipes(['r1']);
    assert.equal(result.deleted, 0);
    assert.equal(warnings.length, 1);
  });

  it('reports what the WRITE returned, not what the statement predicted', async () => {
    // The two numbers are different questions — see `utils/recipeDeleteImpact.js` — so the
    // toast reads the result object rather than re-reading the describer.
    const calls = [];
    const services = withDeleteRecorder(createServices(modernSystem(), threeRecipes()), calls, {
      deleted: 2,
      recipeIds: ['r1', 'r2'],
      recipeItemsAffected: 1,
      recipeItemsRewritten: 1,
      learnersAffected: 2,
    });
    const store = createAdminStore(services);
    await store.refresh();

    const result = await store.deleteRecipes(['r1', 'r2']);
    assert.deepEqual(result, {
      deleted: 2,
      recipeIds: ['r1', 'r2'],
      recipeItemsAffected: 1,
      recipeItemsRewritten: 1,
      learnersAffected: 2,
    });
  });

  // BOTH recipe-item numbers reach the caller, and the LEGACY-BASIS shape is where it
  // matters: the write rewrites nothing while the books genuinely stop containing the
  // recipes, so a store that forwarded only the rewritten figure would leave the toast
  // announcing no recipe-item consequence at all after a card that promised one.
  it('forwards the number the CARD promised beside the number the write rewrote', async () => {
    const calls = [];
    const services = withDeleteRecorder(createServices(modernSystem(), threeRecipes()), calls, {
      deleted: 2,
      recipeIds: ['r1', 'r2'],
      recipeItemsAffected: 1,
      recipeItemsRewritten: 0,
      learnersAffected: 2,
    });
    const store = createAdminStore(services);
    await store.refresh();

    const result = await store.deleteRecipes(['r1', 'r2']);
    assert.equal(result.recipeItemsAffected, 1, 'the stated figure survives the store');
    assert.equal(result.recipeItemsRewritten, 0, 'and the performed one is not conflated with it');
  });

  it('surfaces a refused write to the GM and returns the ZERO result, not a throw', async () => {
    // Reachable, not theoretical: `_assertGM` is `game.user.isGM` while `SETTINGS_MODIFY` is
    // revocable from an assistant GM, so in a world that has revoked it the client-side gate
    // passes and the server refuses. The caller must be able to tell that apart from success
    // by a NUMBER — the zero result is an object and therefore truthy.
    const errors = [];
    const calls = [];
    const services = withDeleteRecorder(
      createServices(modernSystem(), threeRecipes(), [], {
        notify: { info: () => {}, warn: () => {}, error: (message) => errors.push(message) },
      }),
      calls,
      null,
      new Error('User lacks permission to modify this setting')
    );
    const store = createAdminStore(services);
    await store.refresh();

    const result = await store.deleteRecipes(['r1', 'r2']);
    assert.equal(result.deleted, 0);
    assert.equal(errors.length, 1, 'the GM is told');
    assert.ok(errors[0], 'with a message, not an empty string');
  });
});

describe('1132 adminStore.deleteRecipe — the studio SINGULAR', () => {
  // A recipe lives in its OWN world setting and carries its own `craftingSystemId`, while
  // the prune runs over `getSystem(systemId).recipeItemDefinitions`. The selection was being
  // preferred over the recipe, so for a recipe whose system is not the selected one the
  // recipe deleted, the prune ran over the WRONG system's definitions, found no containing
  // definition, and the recipe's real book kept the dangling id — precisely the invariant
  // this change exists to restore. The describer had the same skew, so the dialog stated
  // zero impact while the delete proceeded. `game.fabricate.deleteRecipe` has always read
  // the id off the recipe; the fallback order was simply inverted here.
  function twoSystemServices(calls, dialogs) {
    const other = makeSystem({
      id: 'sys2',
      name: 'System Two',
      membershipResolvesByRecipeIds: true,
      recipeItemDefinitions: [
        { id: 'tome', name: 'Tome', originItemUuid: 'Item.ccc', recipeIds: ['x1'], caps: {} },
      ],
    });
    const selected = modernSystem();
    const systems = [selected, other];
    const recipes = [...threeRecipes(), makeRecipe({ id: 'x1', name: 'Elsewhere', craftingSystemId: 'sys2' })];
    const services = createServices(selected, recipes, [], {
      confirmDialog: async (options) => {
        dialogs.push(options);
        return true;
      },
    });
    const systemManager = services.getCraftingSystemManager();
    services.getCraftingSystemManager = () => ({
      ...systemManager,
      getSystems: () => systems,
      getSystem: (id) => systems.find((system) => system.id === id) || null,
      deleteRecipes: async (systemId, recipeIds, options) => {
        calls.push({ systemId, recipeIds: [...recipeIds], options });
        return {
          deleted: recipeIds.length,
          recipeIds: [...recipeIds],
          recipeItemsAffected: 0,
          recipeItemsRewritten: 0,
          learnersAffected: 0,
        };
      },
    });
    return services;
  }

  it("prunes against the RECIPE's system, not the selected one", async () => {
    const calls = [];
    const store = createAdminStore(twoSystemServices(calls, []));
    await store.refresh();

    await store.deleteRecipe('x1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].systemId, 'sys2', 'the recipe is the authority on its own system');
    assert.deepEqual(calls[0].recipeIds, ['x1']);
  });

  it('states the impact against that same system, so the dialog cannot report a nought', async () => {
    // The other half of the skew: describing against the SELECTED system finds `x1` in none
    // of its definitions, so the dialog took the numberless branch for a delete that really
    // does empty a book.
    const dialogs = [];
    const store = createAdminStore(twoSystemServices([], dialogs));
    await store.refresh();

    await store.deleteRecipe('x1');
    assert.equal(dialogs.length, 1);
    assert.match(
      dialogs[0].content,
      /removed from 1 of your books & scrolls/,
      'the counted branch, computed against sys2, not the numberless one'
    );
  });

  it("falls back to the selection only when the recipe names no system", async () => {
    const calls = [];
    const dialogs = [];
    const services = twoSystemServices(calls, dialogs);
    const orphan = makeRecipe({ id: 'orphan', name: 'Orphan', craftingSystemId: '' });
    const recipeManager = services.getRecipeManager();
    services.getRecipeManager = () => ({
      ...recipeManager,
      getRecipe: (id) => (id === 'orphan' ? orphan : recipeManager.getRecipe(id)),
    });
    const store = createAdminStore(services);
    await store.refresh();

    await store.deleteRecipe('orphan');
    assert.equal(calls[0].systemId, 'sys1', 'the selection is the FALLBACK, not the authority');
  });

  it('passes the confirm shape DialogV2 actually reads, on both buttons', async () => {
    // `services.confirmDialog` calls `DialogV2.confirm` WITHOUT `normalizeDialogOptions`, so
    // a top-level `title` is read by nothing; and `DialogV2.confirm` merges `yes` and `no`
    // over defaults carrying their own labels and callbacks, so a bare function contributes
    // no own enumerable keys. `no: () => false` was harmless — the default `no.callback`
    // already returns false — but it is the identical shape, and one of the pair left in the
    // broken form is how the pattern comes back.
    //
    // VERSION NOTE for anyone extending this: the DEFAULT labels are the literals "Yes"/"No"
    // on V13.351 and the i18n keys "COMMON.Yes"/"COMMON.No" on V14.365. Asserting a supplied
    // label is version-independent; asserting a default one is not.
    const dialogs = [];
    const store = createAdminStore(twoSystemServices([], dialogs));
    await store.refresh();

    await store.deleteRecipe('r1');
    const [options] = dialogs;
    assert.equal(Object.hasOwn(options, 'title'), false, 'no top-level title, which nothing reads');
    assert.ok(options.window?.title, 'the title lands at window.title');
    assert.equal(typeof options.yes, 'object', 'yes is an object, so its label survives the merge');
    assert.equal(typeof options.yes.callback, 'function');
    assert.equal(typeof options.no, 'object', 'and so is no');
    assert.equal(typeof options.no.callback, 'function');
  });
});

describe('1132 adminStore learner-index freshness', () => {
  // `updateActor` routes a `flags` diff to `scheduleKnowledgeRefresh`, which is a TOTAL
  // no-op unless the Knowledge surface is open — so with the Recipe Studio open, a player
  // learning from a scroll left the card understating "Will be forgotten by N characters"
  // until an unrelated `refresh()`. Rebuilding at the hook would be a world walk per foreign
  // module's flag write, so the hook MARKS and the next read that needs the index rebuilds.
  it('rebuilds the index on the next read after an actor write marks it stale', async () => {
    let actorReads = 0;
    const services = createServices(modernSystem(), threeRecipes(), [], {
      getWorldActors: () => {
        actorReads += 1;
        return globalThis.game.actors.contents;
      },
    });
    const store = createAdminStore(services);
    await store.refresh();

    assert.equal(store.describeRecipeDelete(['r3']).learnersAffected, 0, 'nobody knows r3 yet');
    const afterRefresh = actorReads;

    // A player learns r3 from a scroll. Nothing in the manager has refreshed.
    globalThis.game.actors.contents[1].flags.fabricate.fabricate.learnedRecipes.r3 = 1;
    assert.equal(
      store.describeRecipeDelete(['r3']).learnersAffected,
      0,
      'and without the mark the cached index cannot see it — which is what the mark is for'
    );
    assert.equal(actorReads, afterRefresh, 'and no walk happened, so the cache still holds');

    store.markLearnedRecipeIndexStale();
    assert.equal(actorReads, afterRefresh, 'marking itself walks nothing');
    assert.equal(
      store.describeRecipeDelete(['r3']).learnersAffected,
      1,
      'the next read that needs the index rebuilds it'
    );
    assert.equal(actorReads, afterRefresh + 1, 'exactly ONE walk, on the read');

    store.describeRecipeDelete(['r3']);
    store.describeRecipeDelete(['r1']);
    assert.equal(actorReads, afterRefresh + 1, 'and the rebuild is not repeated per tick');
  });
});
