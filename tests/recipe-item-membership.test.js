/**
 * The ONE implementation of recipe↔book membership (issue 1155).
 *
 * The rule used to be written out five times — twice in `CraftingSystemManager`, once in
 * `RecipeVisibilityService`, once in `utils/recipeDeleteImpact.js` and once in the admin
 * recipe-row projection — and the copies had already drifted: the row projection had no
 * `linkedRecipeItemUuid` → `originItemUuid` leg, so on an un-migrated world the GM
 * browser's book column and the delete card's impact statement could name different books
 * for the same recipe. `tests/recipe-book-membership-basis.test.js` is where the readers
 * are held to ONE answer through their real call shapes; this suite holds the leaf they
 * all now ask to its own contract.
 *
 * Two things here are worth more than the rest:
 *
 *   - the legacy fallback ORDER, including its refusal to fall through on a dangling
 *     `recipeItemId`. Both directions are asserted, because a change that simply disabled
 *     the uuid leg would satisfy the refusal on its own;
 *   - the INJECTED data access. `CraftingSystemManager` and `RecipeVisibilityService`
 *     answer the `recipeIds[]` leg from the retained index (issue 1076) rather than a
 *     per-check scan, so the seam that unification introduced is "the lookup disagrees
 *     with the scan". Both forms are run over one battery so that seam cannot open
 *     quietly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { indexedMembershipLookups } from '../src/utils/definitionIndex.js';
import {
  recipeItemDefinitionsContaining,
  resolveLegacyMembershipDefinition,
} from '../src/utils/recipeItemMembership.js';

const BOOK_A_UUID = 'Item.bookA';
const BOOK_B_UUID = 'Item.bookB';

// A FRESH array every call. `getDefinitionIndex` caches per array identity and rebuilds
// only on a revision bump, so reusing one array across cases with different `recipeIds`
// would read a stale index and make the equivalence check below vacuous.
function definitions({ a = [], b = [] } = {}) {
  return [
    { id: 'book-a', name: 'Book A', originItemUuid: BOOK_A_UUID, recipeIds: [...a] },
    { id: 'book-b', name: 'Book B', originItemUuid: BOOK_B_UUID, recipeIds: [...b] },
  ];
}

function ids(definitionList) {
  return definitionList.map((definition) => definition.id);
}

describe('recipeItemDefinitionsContaining — the membership basis', () => {
  it('reads the definition arrays, in definition order', () => {
    const defs = definitions({ a: ['r1'], b: ['r1', 'r2'] });
    assert.deepEqual(ids(recipeItemDefinitionsContaining(defs, { id: 'r1' }, true)), [
      'book-a',
      'book-b',
    ]);
  });

  it('falls back to the legacy scalar only while the marker is unset', () => {
    const recipe = { id: 'r1', recipeItemId: 'book-a' };
    assert.deepEqual(ids(recipeItemDefinitionsContaining(definitions(), recipe, false)), ['book-a']);
    assert.deepEqual(
      ids(recipeItemDefinitionsContaining(definitions(), recipe, true)),
      [],
      'once the basis is recipeIds, an empty array means an empty book'
    );
  });

  it('treats a missing marker as the LEGACY basis, not the canonical one', () => {
    // `=== true`, so `undefined` fails to the safe direction: a system that has not been
    // normalized must not read as migrated and drop every scalar-only member.
    const recipe = { id: 'r1', recipeItemId: 'book-b' };
    assert.deepEqual(ids(recipeItemDefinitionsContaining(definitions(), recipe, undefined)), [
      'book-b',
    ]);
  });

  it('never consults the legacy scalar when the arrays already answer', () => {
    const defs = definitions({ b: ['r1'] });
    assert.deepEqual(
      ids(recipeItemDefinitionsContaining(defs, { id: 'r1', recipeItemId: 'book-a' }, false)),
      ['book-b'],
      'the canonical basis wins even on an un-migrated system'
    );
  });

  it('answers nothing for a recipe with no id, and tolerates a junk definition array', () => {
    assert.deepEqual(recipeItemDefinitionsContaining(definitions(), { id: '  ' }, false), []);
    assert.deepEqual(recipeItemDefinitionsContaining(null, { id: 'r1' }, false), []);
    assert.deepEqual(
      recipeItemDefinitionsContaining([null, undefined, 'nope'], { id: 'r1' }, false),
      []
    );
  });

  it('hands back a fresh array, so a caller cannot corrupt a shared index bucket', () => {
    const defs = definitions({ a: ['r1'] });
    const first = recipeItemDefinitionsContaining(defs, { id: 'r1' }, true, indexedMembershipLookups);
    first.length = 0;
    assert.deepEqual(
      ids(recipeItemDefinitionsContaining(defs, { id: 'r1' }, true, indexedMembershipLookups)),
      ['book-a'],
      'emptying the returned array must not empty the index bucket behind it'
    );
  });
});

describe('recipeItemDefinitionsContaining — the legacy fallback order', () => {
  it('resolves an ABSENT recipeItemId through linkedRecipeItemUuid → originItemUuid', () => {
    // The leg the admin row projection did not have. This is the case where unification
    // CHANGED what the GM browser shows for an un-migrated world.
    const recipe = { id: 'r1', linkedRecipeItemUuid: BOOK_B_UUID };
    assert.deepEqual(ids(recipeItemDefinitionsContaining(definitions(), recipe, false)), ['book-b']);
  });

  it('refuses to fall through when a PRESENT recipeItemId names nothing', () => {
    // Deliberate and load-bearing: falling through on a dangling id (as the 1.13.0
    // migration does) would state a membership the legacy basis never resolved.
    const recipe = { id: 'r1', recipeItemId: 'book-gone', linkedRecipeItemUuid: BOOK_A_UUID };
    assert.deepEqual(ids(recipeItemDefinitionsContaining(definitions(), recipe, false)), []);
  });

  it('prefers the scalar over the uuid when BOTH resolve', () => {
    const recipe = { id: 'r1', recipeItemId: 'book-a', linkedRecipeItemUuid: BOOK_B_UUID };
    assert.deepEqual(ids(recipeItemDefinitionsContaining(definitions(), recipe, false)), ['book-a']);
  });

  it('resolves at most one definition, and none for an unlinked recipe', () => {
    assert.equal(resolveLegacyMembershipDefinition(definitions(), { id: 'r1' }), null);
    assert.equal(
      resolveLegacyMembershipDefinition(definitions(), { id: 'r1', linkedRecipeItemUuid: '   ' }),
      null,
      'a blank uuid is not a link'
    );
  });

  it('trims both sides of every comparison', () => {
    const recipe = { id: ' r1 ', recipeItemId: ' book-a ' };
    assert.deepEqual(ids(recipeItemDefinitionsContaining(definitions(), recipe, false)), ['book-a']);
  });
});

/**
 * The battery, as `(name, definitions, recipe, marker)`. Every shape the rule can take,
 * run twice: once through the leaf's own scan and once through the index-backed lookup the
 * two hot readers inject.
 */
const BATTERY = [
  ['unlinked recipe, legacy basis', definitions, { id: 'r1' }, false],
  ['membership by recipeIds', () => definitions({ a: ['r1'] }), { id: 'r1' }, true],
  ['membership in two books', () => definitions({ a: ['r1'], b: ['r1'] }), { id: 'r1' }, true],
  [
    'membership listed twice in one book',
    () => definitions({ a: ['r1', 'r1'] }),
    { id: 'r1' },
    true,
  ],
  ['membership missed, marker set', () => definitions({ a: ['r2'] }), { id: 'r1' }, true],
  ['legacy scalar', definitions, { id: 'r1', recipeItemId: 'book-b' }, false],
  ['legacy uuid', definitions, { id: 'r1', linkedRecipeItemUuid: BOOK_A_UUID }, false],
  [
    'dangling scalar with a resolvable uuid',
    definitions,
    { id: 'r1', recipeItemId: 'gone', linkedRecipeItemUuid: BOOK_A_UUID },
    false,
  ],
  [
    'arrays answer first on a legacy-basis system',
    () => definitions({ b: ['r1'] }),
    { id: 'r1', recipeItemId: 'book-a' },
    false,
  ],
  ['legacy scalar ignored once marked', definitions, { id: 'r1', recipeItemId: 'book-a' }, true],
];

describe('recipeItemDefinitionsContaining — data access is injected, the rule is not', () => {
  it('answers identically through the retained index and through the plain scan', () => {
    // The seam unification introduced. An injected lookup substitutes HOW a set of
    // definitions is found; the moment it substitutes WHICH question is asked, the two
    // hot readers quietly stop agreeing with the delete card and the browser row again.
    let compared = 0;
    for (const [name, buildDefinitions, recipe, marker] of BATTERY) {
      const scanned = recipeItemDefinitionsContaining(buildDefinitions(), recipe, marker);
      const indexed = recipeItemDefinitionsContaining(
        buildDefinitions(),
        recipe,
        marker,
        indexedMembershipLookups
      );
      assert.deepEqual(ids(indexed), ids(scanned), name);
      compared += 1;
    }
    assert.equal(compared, BATTERY.length, 'every battery case really ran');
    assert.ok(compared > 0, 'the battery is not empty, so this comparison is not vacuous');
  });

  it('is not vacuous: the battery contains cases that resolve, in both bases', () => {
    // Without this, a rule that returned `[]` for everything would satisfy the comparison
    // above and read green.
    const resolved = BATTERY.filter(
      ([, buildDefinitions, recipe, marker]) =>
        recipeItemDefinitionsContaining(buildDefinitions(), recipe, marker).length > 0
    );
    assert.ok(resolved.length >= 5, `${resolved.length} battery cases resolve a definition`);
    assert.ok(
      resolved.some(([, , , marker]) => marker === true) &&
        resolved.some(([, , , marker]) => marker === false),
      'both bases are represented among the resolving cases'
    );
  });

  it('accepts a lookup backed by prebuilt maps, as the first-write seed injects', () => {
    // `_seedMembershipFromLegacyScalars` resolves every recipe in one pass against maps it
    // built once, and must resolve exactly what the readers resolve or switching basis
    // would change resolved membership.
    const defs = definitions();
    const byId = new Map(defs.map((definition) => [definition.id, definition]));
    const bySource = new Map(defs.map((definition) => [definition.originItemUuid, definition]));
    const seedLookups = {
      byDefinitionId: (_definitions, id) => byId.get(id) ?? null,
      byOriginItemUuid: (_definitions, uuid) => bySource.get(uuid) ?? null,
    };

    assert.equal(
      resolveLegacyMembershipDefinition(defs, { id: 'r1', recipeItemId: 'book-b' }, seedLookups)?.id,
      'book-b'
    );
    assert.equal(
      resolveLegacyMembershipDefinition(
        defs,
        { id: 'r1', linkedRecipeItemUuid: BOOK_A_UUID },
        seedLookups
      )?.id,
      'book-a'
    );
    assert.equal(
      resolveLegacyMembershipDefinition(
        defs,
        { id: 'r1', recipeItemId: 'gone', linkedRecipeItemUuid: BOOK_A_UUID },
        seedLookups
      ),
      null,
      'the refusal to fall through survives the injection'
    );
  });
});
