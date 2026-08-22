/**
 * Issue 1010 — the recipe browser's pure bulk staging model.
 *
 * Everything the recipe bulk edit can be reasoned about without a DOM lives in
 * `src/utils/recipeBulkEditModel.js`; the Svelte surfaces are wiring. This suite owns the
 * semantics the plan pinned as easy to get subtly wrong, and each of them is a case that
 * can actually fail:
 *
 * - the check tier's THREE distinct instructions — leave alone, clear to the default DC,
 *   set a named tier — round-tripping through one `<select>` value without `''` and
 *   `'__default__'` ever collapsing into each other;
 * - `checkTierId` being emitted on PRESENCE of its staged flag, never on the truthiness of
 *   its value, so a staged `null` survives — asserted with `Object.hasOwn` on both sides,
 *   because `edit.checkTierId === undefined` cannot tell an absent key from a present one;
 * - `enabled: false` and `locked: false` surviving the same projection, for the same reason;
 * - a book never being simultaneously staged for add and for remove, asserted against a
 *   HAND-BUILT hostile draft so the invariant is proven structural in the model's own
 *   normalization rather than merely a property of the setter that usually feeds it;
 * - a removal-only draft counting as a change, so `Apply` enables for it;
 * - the per-book selection count being read from each projected row's `recipeItemIds`,
 *   which is basis-aware, and NEVER from a definition's own `recipeIds`;
 * - the check-tier gate reporting each of its five reasons, and reporting `available` only
 *   when the gate is open AND the system actually authors tiers;
 * - the blocked-enable forecast counting the same rows the row pill pills — in particular
 *   NOT counting an already-enabled blocked recipe, which the activation gate never refuses.
 *
 * The SELECTION half is not re-tested here: it lives in `bulkSelectionModel.js` and is
 * pinned by `bulk-selection-model.test.js`. This suite only pins that the recipe-flavoured
 * aliases really are those functions.
 *
 * Top-level under `tests/` deliberately: the `npm test` glob covers `tests/*.test.js`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveActiveCraftingCheckFormula } from '../src/systems/checkModifierResolver.js';
import * as sharedSelection from '../src/utils/bulkSelectionModel.js';
import { createRecipeBrowserState } from '../src/utils/recipeBrowserModel.js';
import {
  RECIPE_CHECK_TIER_DEFAULT,
  RECIPE_CHECK_TIER_UNCHANGED,
  bulkRecipeBookOp,
  bulkRecipeCheckTierSelectValue,
  bulkRecipeDraftHasChanges,
  countBlockedRecipeEnables,
  countRecipeBookMembership,
  createRecipeBulkDraft,
  describeRecipeCheckTierAxis,
  describeRecipeSelection,
  pruneRecipeSelection,
  setBulkRecipeBookOp,
  setBulkRecipeCategory,
  setBulkRecipeCheckTier,
  setBulkRecipeLock,
  setBulkRecipeStatus,
  setRecipeSelection,
  toBulkRecipeEdit,
  toggleRecipeSelection,
} from '../src/utils/recipeBulkEditModel.js';

/** The two book lists, the only part of a draft the membership cases care about. */
const books = (draft) => ({ bookAdd: draft.bookAdd, bookRemove: draft.bookRemove });

/** A projected recipe row, carrying only the two fields the forecast reads. */
const row = (id, enabled, enableBlocked) => ({ id, name: id, enabled, enableBlocked });

describe('recipe bulk edit model (issue 1010) — the staged draft', () => {
  it('createRecipeBulkDraft returns a FRESH, wholly unstaged draft each call', () => {
    const first = createRecipeBulkDraft();
    const second = createRecipeBulkDraft();

    assert.deepEqual(first, {
      category: '',
      status: 'unchanged',
      lock: 'unchanged',
      checkTierStaged: false,
      checkTierId: null,
      bookAdd: [],
      bookRemove: [],
    });
    assert.equal(bulkRecipeDraftHasChanges(first), false);
    assert.deepEqual(toBulkRecipeEdit(first), {});
    assert.notEqual(first, second);
    assert.notEqual(first.bookAdd, second.bookAdd);
    assert.notEqual(first.bookRemove, second.bookRemove);
  });

  it('stages category, status and lock without mutating the draft it was given', () => {
    const fresh = createRecipeBulkDraft();
    const categorised = setBulkRecipeCategory(fresh, 'Alchemy');
    const disabled = setBulkRecipeStatus(categorised, 'disable');
    const unlocked = setBulkRecipeLock(disabled, 'unlock');

    assert.equal(unlocked.category, 'Alchemy');
    assert.equal(unlocked.status, 'disable');
    assert.equal(unlocked.lock, 'unlock');

    // Each input survives untouched: every helper returns a NEW draft.
    assert.equal(fresh.category, '');
    assert.equal(categorised.status, 'unchanged');
    assert.equal(disabled.lock, 'unchanged');
    assert.notEqual(unlocked, disabled);
  });

  it('falls an unrecognised status or lock value back to unchanged rather than staging it', () => {
    // A stray segment value can only ever UNSTAGE an axis, never stage an edit nobody asked
    // for — so a malformed draft can never apply a surprise write to a whole selection.
    const staged = setBulkRecipeLock(
      setBulkRecipeStatus(createRecipeBulkDraft(), 'enable'),
      'lock'
    );

    assert.equal(setBulkRecipeStatus(staged, 'obliterate').status, 'unchanged');
    assert.equal(setBulkRecipeLock(staged, 'weld').lock, 'unchanged');
    assert.deepEqual(toBulkRecipeEdit(setBulkRecipeStatus(staged, 'obliterate')), { locked: true });
  });

  it('reads a removal-only draft as a change, so Apply is live for it', () => {
    // `Remove` is reachable in ONE gesture from the pick card, so a removal-only draft is
    // not an exotic state; reading only `bookAdd` would leave Apply inert for it.
    const removalOnly = setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'remove');

    assert.deepEqual(books(removalOnly), { bookAdd: [], bookRemove: ['tome'] });
    assert.equal(bulkRecipeDraftHasChanges(removalOnly), true);
    assert.deepEqual(toBulkRecipeEdit(removalOnly), { removeBookIds: ['tome'] });
  });

  it('reads a whitespace-only category as unstaged on both the Apply gate and the write', () => {
    const blank = setBulkRecipeCategory(createRecipeBulkDraft(), '   ');
    assert.equal(bulkRecipeDraftHasChanges(blank), false);
    assert.equal(Object.hasOwn(toBulkRecipeEdit(blank), 'category'), false);
  });
});

describe('recipe bulk edit model — the recipe-book op setter', () => {
  // The control SETS an op rather than advancing a cycle, so the model must be idempotent
  // per op and reachable in one step from any starting state. A cycle-shaped helper could
  // not express "the GM pressed Remove" without knowing what they had pressed before.
  it('setBulkRecipeBookOp lands on the named op from ANY starting state, in one call', () => {
    const start = {
      none: createRecipeBulkDraft(),
      add: setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'add'),
      remove: setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'remove'),
    };
    const expected = {
      none: { bookAdd: [], bookRemove: [] },
      add: { bookAdd: ['tome'], bookRemove: [] },
      remove: { bookAdd: [], bookRemove: ['tome'] },
    };

    for (const [from, draft] of Object.entries(start)) {
      for (const [to, shape] of Object.entries(expected)) {
        assert.deepEqual(
          books(setBulkRecipeBookOp(draft, 'tome', to)),
          shape,
          `${from} -> ${to} is one call, not a walk`
        );
      }
    }
  });

  it('is idempotent: pressing the same op twice stages it once', () => {
    const once = setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'add');
    const twice = setBulkRecipeBookOp(once, 'tome', 'add');
    assert.deepEqual(books(twice), { bookAdd: ['tome'], bookRemove: [] });
  });

  it('treats an unrecognised op as UNSTAGE rather than staging something nobody asked for', () => {
    const staged = setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'add');
    assert.deepEqual(books(setBulkRecipeBookOp(staged, 'tome', 'obliterate')), {
      bookAdd: [],
      bookRemove: [],
    });
  });

  it('stages each book independently and leaves the other axes alone', () => {
    const staged = setBulkRecipeCheckTier(
      setBulkRecipeCategory(createRecipeBulkDraft(), 'Alchemy'),
      RECIPE_CHECK_TIER_DEFAULT
    );
    const withTome = setBulkRecipeBookOp(staged, 'tome', 'remove');
    const mixed = setBulkRecipeBookOp(withTome, 'grimoire', 'add');

    assert.deepEqual(books(mixed), { bookAdd: ['grimoire'], bookRemove: ['tome'] });
    assert.equal(mixed.category, 'Alchemy');
    assert.equal(mixed.checkTierStaged, true);
    assert.equal(mixed.checkTierId, null);
    // The inputs are untouched.
    assert.deepEqual(books(staged), { bookAdd: [], bookRemove: [] });
    assert.deepEqual(books(withTome), { bookAdd: [], bookRemove: ['tome'] });
  });

  it('ignores a blank book id instead of staging an empty membership change', () => {
    const draft = setBulkRecipeBookOp(createRecipeBulkDraft(), '', 'add');
    assert.deepEqual(books(draft), { bookAdd: [], bookRemove: [] });
    assert.equal(bulkRecipeDraftHasChanges(draft), false);
  });

  it('bulkRecipeBookOp reads back exactly what was staged, and normalizes a hostile draft', () => {
    const draft = setBulkRecipeBookOp(
      setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'add'),
      'grimoire',
      'remove'
    );

    assert.equal(bulkRecipeBookOp(draft, 'tome'), 'add');
    assert.equal(bulkRecipeBookOp(draft, 'grimoire'), 'remove');
    assert.equal(bulkRecipeBookOp(draft, 'atlas'), 'none');
    // `bookAdd` wins the collision in `readDraft`, so the reader agrees with the write.
    assert.equal(
      bulkRecipeBookOp({ bookAdd: ['tome'], bookRemove: ['tome'] }, 'tome'),
      'add',
      'one book, one op — the reader can never report a state the write cannot produce'
    );
  });

  it('never stages one book as BOTH add and remove — proven against a hostile draft', () => {
    // Hand-built rather than cycled: the invariant has to be structural in the model's own
    // normalization, so a draft that arrived from anywhere else — a persisted blob, a test
    // fixture, a future panel — cannot hand the write primitive a book on both lists and
    // make "apply removals after additions" order-dependent.
    const hostile = {
      category: 'Alchemy',
      status: 'enable',
      lock: 'lock',
      checkTierStaged: true,
      checkTierId: 'tier-a',
      bookAdd: ['tome', 'grimoire'],
      bookRemove: ['tome', 'scroll'],
    };

    const edit = toBulkRecipeEdit(hostile);
    assert.deepEqual(edit.addBookIds, ['tome', 'grimoire']);
    assert.deepEqual(edit.removeBookIds, ['scroll']);

    // …and every other reader of the draft agrees, without a setter ever running.
    const normalized = setBulkRecipeBookOp(hostile, 'atlas', 'add');
    assert.deepEqual(books(normalized), {
      bookAdd: ['tome', 'grimoire', 'atlas'],
      bookRemove: ['scroll'],
    });
    assert.equal(bulkRecipeDraftHasChanges(hostile), true);
  });
});

describe('recipe bulk edit model — countRecipeBookMembership', () => {
  /** A projected recipe row in the shape `_buildRecipeList` emits. */
  const membershipRow = (id, recipeItemIds) => ({ id, name: id, recipeItemIds });

  it('counts, per book, how many of the SELECTED rows that book holds', () => {
    const counts = countRecipeBookMembership([
      membershipRow('r1', ['tome', 'grimoire']),
      membershipRow('r2', ['tome']),
      membershipRow('r3', []),
    ]);

    assert.equal(counts.get('tome'), 2);
    assert.equal(counts.get('grimoire'), 1);
    assert.equal(counts.get('atlas'), undefined, 'a book holding none of them is simply absent');
  });

  // THE POINT OF THIS HELPER. Membership resolves through the monotone
  // `system.membershipResolvesByRecipeIds` marker, and while it is unset it resolves through
  // the legacy `recipe.recipeItemId` scalar — so a book that holds every selected recipe can
  // still carry an EMPTY `definition.recipeIds`. A count sourced from the definition would
  // report "holds none selected" on exactly the legacy worlds that most need this axis, and
  // would disable Remove for a book the GM can see on every one of those rows.
  //
  // The rows below are what `_buildRecipeList` projects for such a system:
  // `recipeItemIds` comes from `recipeItemDefinitionsContaining` (`utils/recipeItemMembership.js`),
  // which takes the basis as a parameter and is therefore basis-aware.
  // `tests/recipe-book-membership-basis.test.js` proves that projection against a real
  // legacy-basis store; this case proves the counter reads it rather than the definition.
  it('reads each row\'s basis-aware recipeItemIds, never a definition\'s own recipeIds', () => {
    const legacyBasisDefinition = { id: 'tome', resolvedName: 'Forgecraft Folio', recipeIds: [] };
    const rows = [membershipRow('r1', ['tome']), membershipRow('r2', ['tome'])];

    assert.deepEqual(
      legacyBasisDefinition.recipeIds,
      [],
      'the fixture really is legacy-basis: the definition itself knows nothing'
    );
    assert.equal(
      countRecipeBookMembership(rows).get(legacyBasisDefinition.id),
      2,
      'counting from definition.recipeIds would report 0 and disable Remove'
    );
  });

  it('is total over junk input and coerces ids to strings', () => {
    assert.equal(countRecipeBookMembership(null).size, 0);
    assert.equal(countRecipeBookMembership([null, {}, { recipeItemIds: 'tome' }]).size, 0);
    assert.equal(countRecipeBookMembership([{ recipeItemIds: [7] }]).get('7'), 1);
  });

  it('counts a row once per book even if the projection repeated an id', () => {
    assert.equal(countRecipeBookMembership([membershipRow('r1', ['tome', 'tome'])]).get('tome'), 1);
  });
});

describe('recipe bulk edit model — the check-tier axis and its three instructions', () => {
  it('round-trips all three select values, and never collapses the two sentinels', () => {
    const fresh = createRecipeBulkDraft();
    const cases = [
      { value: RECIPE_CHECK_TIER_UNCHANGED, staged: false, id: null },
      { value: RECIPE_CHECK_TIER_DEFAULT, staged: true, id: null },
      { value: 'tier-a', staged: true, id: 'tier-a' },
    ];

    for (const { value, staged, id } of cases) {
      const draft = setBulkRecipeCheckTier(fresh, value);
      assert.equal(draft.checkTierStaged, staged, `${value} staged the axis wrongly`);
      assert.equal(draft.checkTierId, id, `${value} staged the wrong tier id`);
      assert.equal(bulkRecipeCheckTierSelectValue(draft), value, `${value} did not round-trip`);
    }

    // The two sentinels are DIFFERENT instructions, and neither is the other.
    assert.notEqual(RECIPE_CHECK_TIER_UNCHANGED, RECIPE_CHECK_TIER_DEFAULT);
    const leaveAlone = setBulkRecipeCheckTier(fresh, RECIPE_CHECK_TIER_UNCHANGED);
    const clearToDefault = setBulkRecipeCheckTier(fresh, RECIPE_CHECK_TIER_DEFAULT);
    assert.notEqual(
      bulkRecipeCheckTierSelectValue(leaveAlone),
      bulkRecipeCheckTierSelectValue(clearToDefault)
    );
    assert.equal(bulkRecipeDraftHasChanges(leaveAlone), false);
    assert.equal(bulkRecipeDraftHasChanges(clearToDefault), true);
  });

  it('unstages the axis when the select returns to Leave unchanged', () => {
    const staged = setBulkRecipeCheckTier(createRecipeBulkDraft(), 'tier-a');
    const cleared = setBulkRecipeCheckTier(staged, RECIPE_CHECK_TIER_UNCHANGED);

    assert.equal(cleared.checkTierStaged, false);
    assert.equal(cleared.checkTierId, null);
    assert.equal(bulkRecipeCheckTierSelectValue(cleared), RECIPE_CHECK_TIER_UNCHANGED);
    // The input draft is untouched.
    assert.equal(staged.checkTierId, 'tier-a');
  });

  it('emits checkTierId IF AND ONLY IF the axis is staged — including a staged null', () => {
    // `Object.hasOwn` on both sides: `edit.checkTierId === undefined` cannot tell an absent
    // key ("leave every tier alone") from a present `null` ("clear every tier to the
    // default DC"), and those are two different writes over a whole selection.
    const unstaged = toBulkRecipeEdit(createRecipeBulkDraft());
    assert.equal(Object.hasOwn(unstaged, 'checkTierId'), false, 'an unstaged axis was emitted');

    const cleared = toBulkRecipeEdit(
      setBulkRecipeCheckTier(createRecipeBulkDraft(), RECIPE_CHECK_TIER_DEFAULT)
    );
    assert.equal(Object.hasOwn(cleared, 'checkTierId'), true, 'a staged null was dropped');
    assert.equal(cleared.checkTierId, null);

    const named = toBulkRecipeEdit(setBulkRecipeCheckTier(createRecipeBulkDraft(), 'tier-a'));
    assert.equal(Object.hasOwn(named, 'checkTierId'), true);
    assert.equal(named.checkTierId, 'tier-a');
  });
});

describe('recipe bulk edit model — projection of the falsy-but-real keys', () => {
  it('emits enabled: false and locked: false rather than dropping them', () => {
    const retire = setBulkRecipeLock(
      setBulkRecipeStatus(createRecipeBulkDraft(), 'disable'),
      'unlock'
    );
    const edit = toBulkRecipeEdit(retire);

    assert.equal(Object.hasOwn(edit, 'enabled'), true, 'Disable was dropped by truthiness');
    assert.equal(edit.enabled, false);
    assert.equal(Object.hasOwn(edit, 'locked'), true, 'Unlock was dropped by truthiness');
    assert.equal(edit.locked, false);
  });

  it('emits the whole staged set, and only the staged set', () => {
    let draft = setBulkRecipeCategory(createRecipeBulkDraft(), 'Alchemy');
    draft = setBulkRecipeStatus(draft, 'enable');
    draft = setBulkRecipeCheckTier(draft, 'tier-a');
    draft = setBulkRecipeBookOp(draft, 'tome', 'add');

    assert.deepEqual(toBulkRecipeEdit(draft), {
      category: 'Alchemy',
      enabled: true,
      checkTierId: 'tier-a',
      addBookIds: ['tome'],
    });
    // Lock was never staged, so the write is never told about it.
    assert.equal(Object.hasOwn(toBulkRecipeEdit(draft), 'locked'), false);
  });

  it('copies the book lists rather than aliasing the draft into the write', () => {
    const draft = setBulkRecipeBookOp(createRecipeBulkDraft(), 'tome', 'add');
    const edit = toBulkRecipeEdit(draft);
    edit.addBookIds.push('grimoire');
    assert.deepEqual(draft.bookAdd, ['tome']);
  });
});

describe('recipe bulk edit model — describeRecipeCheckTierAxis', () => {
  const tiers = [{ id: 'tier-a', name: 'Tricky', dc: 14 }];

  // One case per reason. The three gated modes are each given a NON-EMPTY tier list, so a
  // case can only pass by reporting its own reason rather than falling through to `noTiers`.
  const cases = [
    {
      why: 'progressive systems put difficulty on the result component',
      axis: {
        craftingCheckMode: 'progressive',
        craftingCheck: { simple: { tiers } },
        tierOptions: tiers,
      },
      reason: 'progressive',
    },
    {
      why: 'a dynamic DC is resolved at craft time',
      axis: {
        craftingCheckMode: 'simple',
        craftingCheck: { simple: { dcMode: 'dynamic', tiers } },
        tierOptions: tiers,
      },
      reason: 'dynamic',
    },
    {
      why: 'a fixed routed check takes difficulty from the minimum success tier',
      axis: {
        craftingCheckMode: 'routed',
        craftingCheck: { routed: { type: 'fixed', tiers } },
        tierOptions: tiers,
      },
      reason: 'fixed',
    },
    {
      // REACHABLE, and by an ordinary authoring choice: `resolveActiveCraftingCheckFormula`
      // returns a `null` slot for an alchemy system at `alchemy.checkMode: 'none'`, which is
      // a well-formed system. It must not be told its resolution mode is unrecognised.
      why: 'this resolution mode rolls no crafting check at all',
      axis: { craftingCheckMode: null, craftingCheck: { simple: { tiers } }, tierOptions: tiers },
      reason: 'noCheck',
    },
    {
      why: 'a mode outside the canonical set is defensive, and reachable only by omission',
      axis: {
        craftingCheckMode: undefined,
        craftingCheck: { simple: { tiers } },
        tierOptions: tiers,
      },
      reason: 'unrecognisedMode',
    },
    {
      why: 'the gate is open but the check authors no tiers to pick from',
      axis: {
        craftingCheckMode: 'simple',
        craftingCheck: { simple: { tiers: [] } },
        tierOptions: [],
      },
      reason: 'noTiers',
    },
  ];

  for (const { why, axis, reason } of cases) {
    it(`reports ${reason} — ${why}`, () => {
      assert.deepEqual(describeRecipeCheckTierAxis(axis), { available: false, reason });
    });
  }

  it('is available only when the gate is open AND the tier list is non-empty', () => {
    const simple = { craftingCheckMode: 'simple', craftingCheck: { simple: { dcMode: 'static' } } };
    const routed = { craftingCheckMode: 'routed', craftingCheck: { routed: { type: 'relative' } } };

    assert.deepEqual(describeRecipeCheckTierAxis({ ...simple, tierOptions: tiers }), {
      available: true,
      reason: null,
    });
    assert.deepEqual(describeRecipeCheckTierAxis({ ...routed, tierOptions: tiers }), {
      available: true,
      reason: null,
    });
    // Open gate, no tiers — available is false, and the reason says which of the two it is.
    assert.equal(describeRecipeCheckTierAxis({ ...simple, tierOptions: [] }).available, false);
    assert.equal(describeRecipeCheckTierAxis({ ...routed, tierOptions: [] }).reason, 'noTiers');
  });

  // The reachability claim, taken from the REAL producer of `craftingCheckMode` rather than
  // from a `null` this suite typed itself. If `resolveActiveCraftingCheckFormula` ever stops
  // returning a `null` slot for alchemy-`none`, or the gate stops distinguishing it, this
  // fails — which is the only way the JSDoc's "reachable" claim stays honest.
  it('reports noCheck for the alchemy system the resolver gives a null slot', () => {
    const system = {
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'none' },
      craftingCheck: { simple: { dcMode: 'static', rollFormula: '1d20', tiers } },
    };
    const slot = resolveActiveCraftingCheckFormula(system).slot;
    assert.equal(slot, null, 'alchemy at checkMode none rolls no check');
    assert.deepEqual(
      describeRecipeCheckTierAxis({
        craftingCheck: system.craftingCheck,
        craftingCheckMode: slot,
        tierOptions: [],
      }),
      { available: false, reason: 'noCheck' },
      'a well-formed system must never be told its resolution mode is unrecognised'
    );
  });

  it('is total over malformed input rather than throwing at a browser render', () => {
    assert.deepEqual(describeRecipeCheckTierAxis(), {
      available: false,
      reason: 'unrecognisedMode',
    });
    assert.deepEqual(describeRecipeCheckTierAxis(null), {
      available: false,
      reason: 'unrecognisedMode',
    });
    // A gate-open system whose tier list arrived as something other than an array.
    assert.equal(
      describeRecipeCheckTierAxis({ craftingCheckMode: 'simple', tierOptions: 'tier-a' }).reason,
      'noTiers'
    );
  });
});

describe('recipe bulk edit model — countBlockedRecipeEnables', () => {
  const rows = [
    row('blocked-off', false, true),
    row('blocked-on', true, true),
    row('clean-off', false, false),
    row('clean-on', true, false),
  ];

  it('is 0 unless Enable is actually staged', () => {
    // Neither Disable nor Unchanged transitions a recipe into the enabled state, so the
    // activation gate cannot refuse anything and there is nothing to forecast.
    assert.equal(countBlockedRecipeEnables(rows, 'unchanged'), 0);
    assert.equal(countBlockedRecipeEnables(rows, 'disable'), 0);
    assert.equal(countBlockedRecipeEnables(rows, 'enable'), 1);
  });

  it('counts only rows that are BOTH off and blocked', () => {
    assert.equal(countBlockedRecipeEnables([row('a', false, true)], 'enable'), 1);
    assert.equal(countBlockedRecipeEnables([row('a', false, false)], 'enable'), 0);
    assert.equal(countBlockedRecipeEnables([row('a', true, false)], 'enable'), 0);
  });

  it('counts an ALREADY-ENABLED blocked recipe as 0', () => {
    // The activation gate fires only on a false -> true transition, so an enabled recipe is
    // never refused however broken it is — its row wears `Incomplete`, not `Can't enable`.
    // Counting it would let the panel claim more recipes will stay off than rows are pilled.
    assert.equal(countBlockedRecipeEnables([row('a', true, true)], 'enable'), 0);
    assert.equal(
      countBlockedRecipeEnables([row('a', true, true), row('b', false, true)], 'enable'),
      1
    );
  });

  it('tolerates malformed rows instead of throwing under the panel', () => {
    assert.equal(countBlockedRecipeEnables(undefined, 'enable'), 0);
    assert.equal(countBlockedRecipeEnables(null, 'enable'), 0);
    assert.equal(countBlockedRecipeEnables('not-rows', 'enable'), 0);
    assert.equal(countBlockedRecipeEnables([], 'enable'), 0);
    // A row missing the fields entirely is counted by NEITHER this forecast nor the row
    // pill, which tests `enabled === false` just as strictly.
    assert.equal(countBlockedRecipeEnables([null, {}, { enableBlocked: true }], 'enable'), 0);
    assert.equal(countBlockedRecipeEnables([undefined, row('a', false, true)], 'enable'), 1);
  });
});

describe('recipe bulk edit model — the selection half', () => {
  it('re-exports the SHARED selection helpers rather than owning a second copy', () => {
    assert.equal(describeRecipeSelection, sharedSelection.describeBulkSelection);
    assert.equal(toggleRecipeSelection, sharedSelection.toggleBulkSelection);
    assert.equal(setRecipeSelection, sharedSelection.setBulkSelection);
    assert.equal(pruneRecipeSelection, sharedSelection.pruneBulkSelection);
  });

  it('seeds the lifted browser state with a FRESH, empty selection Set each call', () => {
    const first = createRecipeBrowserState();
    const second = createRecipeBrowserState();

    assert.ok(first.bulkSelectedRecipeIds instanceof Set);
    assert.equal(first.bulkSelectedRecipeIds.size, 0);
    assert.notEqual(first.bulkSelectedRecipeIds, second.bulkSelectedRecipeIds);
    first.bulkSelectedRecipeIds.add('recipe-1');
    assert.equal(second.bulkSelectedRecipeIds.has('recipe-1'), false);
  });
});
