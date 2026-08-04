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
 *   normalization rather than merely a property of the cycle that usually feeds it;
 * - a removal-only draft counting as a change, so `Apply` enables for it;
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

import * as sharedSelection from '../src/utils/bulkSelectionModel.js';
import { createRecipeBrowserState } from '../src/utils/recipeBrowserModel.js';
import {
  RECIPE_CHECK_TIER_DEFAULT,
  RECIPE_CHECK_TIER_UNCHANGED,
  bulkRecipeCheckTierSelectValue,
  bulkRecipeDraftHasChanges,
  countBlockedRecipeEnables,
  createRecipeBulkDraft,
  cycleBulkRecipeBook,
  describeRecipeCheckTierAxis,
  describeRecipeSelection,
  pruneRecipeSelection,
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
    // A chip cycled straight past `add` to `remove` is a real edit the book run can stage on
    // its own; reading only `bookAdd` would leave Apply inert for it.
    const removalOnly = cycleBulkRecipeBook(
      cycleBulkRecipeBook(createRecipeBulkDraft(), 'tome'),
      'tome'
    );

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

describe('recipe bulk edit model — the recipe-book tri-state cycle', () => {
  it('cycleBulkRecipeBook walks none -> add -> remove -> none, and rounds again', () => {
    const walk = [
      { bookAdd: ['tome'], bookRemove: [] },
      { bookAdd: [], bookRemove: ['tome'] },
      { bookAdd: [], bookRemove: [] },
      { bookAdd: ['tome'], bookRemove: [] },
    ];

    let draft = createRecipeBulkDraft();
    walk.forEach((expected, step) => {
      draft = cycleBulkRecipeBook(draft, 'tome');
      assert.deepEqual(books(draft), expected, `step ${step} of the cycle`);
    });
  });

  it('cycles each book independently and leaves the other axes alone', () => {
    const staged = setBulkRecipeCheckTier(
      setBulkRecipeCategory(createRecipeBulkDraft(), 'Alchemy'),
      RECIPE_CHECK_TIER_DEFAULT
    );
    const withTome = cycleBulkRecipeBook(staged, 'tome');
    const withBoth = cycleBulkRecipeBook(withTome, 'grimoire');
    const mixed = cycleBulkRecipeBook(withBoth, 'tome');

    assert.deepEqual(books(mixed), { bookAdd: ['grimoire'], bookRemove: ['tome'] });
    assert.equal(mixed.category, 'Alchemy');
    assert.equal(mixed.checkTierStaged, true);
    assert.equal(mixed.checkTierId, null);
    // The inputs are untouched.
    assert.deepEqual(books(staged), { bookAdd: [], bookRemove: [] });
    assert.deepEqual(books(withBoth), { bookAdd: ['tome', 'grimoire'], bookRemove: [] });
  });

  it('ignores a blank book id instead of staging an empty membership change', () => {
    const draft = cycleBulkRecipeBook(createRecipeBulkDraft(), '');
    assert.deepEqual(books(draft), { bookAdd: [], bookRemove: [] });
    assert.equal(bulkRecipeDraftHasChanges(draft), false);
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

    // …and every other reader of the draft agrees, without a cycle ever running.
    const normalized = cycleBulkRecipeBook(hostile, 'atlas');
    assert.deepEqual(books(normalized), {
      bookAdd: ['tome', 'grimoire', 'atlas'],
      bookRemove: ['scroll'],
    });
    assert.equal(bulkRecipeDraftHasChanges(hostile), true);
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
    draft = cycleBulkRecipeBook(draft, 'tome');

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
    const draft = cycleBulkRecipeBook(createRecipeBulkDraft(), 'tome');
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
      why: 'an unrecognised mode is defensive, and reachable only by passing null directly',
      axis: { craftingCheckMode: null, craftingCheck: { simple: { tiers } }, tierOptions: tiers },
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
