/**
 * Knowledge surface pure projection (issue 785).
 *
 * The uses derivations are pinned as ONE table over `(limitUses, maxUses,
 * timesUsed)` rather than as rendered strings, because the contract under test is
 * that `spent` is the exact complement of
 * `RecipeVisibilityService._filterNonExhausted` on BOTH axes — including the
 * `Number(timesUsed || 0)` coercion and the fail-open on a non-finite or
 * non-positive `maxUses`. A row that claimed a copy was spent while the runtime
 * still granted craftability from it would be the worst failure this surface has.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWLEDGE_TAB_LEARNED_RECIPES,
  KNOWLEDGE_TAB_RECIPE_ITEMS,
  canExpendRecipeItemUse,
  defaultKnowledgeTab,
  eraseFreesNoSlot,
  filterKnowledgeRoster,
  isRecipeItemSpent,
  learnedRecipeSource,
  projectKnowledgeCharacter,
  projectKnowledgeSnapshot,
  projectLearnedRecipeRow,
  projectOwnedCopyRow,
  recipeItemLabelFromUuid,
  recipeItemRemainingUses,
  recipeItemTypeFromRecipeCount,
  usesChipState,
} from '../src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js';

// (label, limitUses, maxUses, timesUsed) -> (remaining, spent, canExpend, usesChip).
// `spent` mirrors `_filterNonExhausted`: keep when `!limitUses`, keep when maxUses
// is not a finite number > 0, else keep while `Number(timesUsed || 0) < maxUses`.
const USES_CASES = [
  // limitUses false: unlimited on every timesUsed, and Expend is never offered.
  ['uncapped, unused', false, 5, 0, null, false, false, 'unlimited'],
  ['uncapped, used', false, 5, 99, null, false, false, 'unlimited'],
  ['uncapped, no maxUses', false, undefined, 3, null, false, false, 'unlimited'],
  // limitUses true with an invalid maxUses: FAIL-OPEN to unlimited, never spent.
  ['capped, maxUses 0', true, 0, 4, null, false, true, 'unlimited'],
  ['capped, maxUses -1', true, -1, 4, null, false, true, 'unlimited'],
  ['capped, maxUses undefined', true, undefined, 4, null, false, true, 'unlimited'],
  ['capped, maxUses NaN', true, Number.NaN, 4, null, false, true, 'unlimited'],
  ['capped, maxUses Infinity', true, Number.POSITIVE_INFINITY, 4, null, false, true, 'unlimited'],
  ['capped, maxUses null', true, null, 4, null, false, true, 'unlimited'],
  // limitUses true with a real cap: the timesUsed axis, including coercions.
  ['capped, timesUsed undefined', true, 3, undefined, 3, false, true, 'remaining'],
  ['capped, timesUsed null', true, 3, null, 3, false, true, 'remaining'],
  ['capped, timesUsed 0', true, 3, 0, 3, false, true, 'remaining'],
  ['capped, timesUsed -1', true, 3, -1, 4, false, true, 'remaining'],
  ['capped, timesUsed string', true, 5, '3', 2, false, true, 'remaining'],
  ['capped, one charge left', true, 5, 4, 1, false, true, 'remaining'],
  ['capped, exactly spent', true, 5, 5, 0, true, false, 'spent'],
  ['capped, over-spent clamps', true, 5, 9, 0, true, false, 'spent'],
  // A numeric-string maxUses coerces exactly as `Number(cfg.maxUses)` does.
  ['string maxUses, remaining', true, '3', 1, 2, false, true, 'remaining'],
  ['string maxUses, spent', true, '3', 3, 0, true, false, 'spent'],
];

const TYPE_CASES = [
  [0, 'Incomplete'],
  [1, 'Scroll'],
  [2, 'Book'],
  [7, 'Book'],
  [undefined, 'Incomplete'],
  ['2', 'Book'],
];

// (label, sourceItemUuid, sourceOwned, sourceItemName, sourceDefinitionName,
//  sourceCapped) -> (sourceKind, sourceName, freesNoSlot).
const LEARNED_SOURCE_CASES = [
  ['auto-learn entry', null, false, '', 'Grand Codex', true, 'autoLearn', '', true],
  [
    'source copy still owned and capped',
    'Actor.a.Item.i',
    true,
    'Journeyman Primer',
    'Primer',
    true,
    'ownedCopy',
    'Journeyman Primer',
    false,
  ],
  [
    'source copy still owned but uncapped book frees nothing',
    'Actor.a.Item.i',
    true,
    'Journeyman Primer',
    'Primer',
    false,
    'ownedCopy',
    'Journeyman Primer',
    true,
  ],
  [
    'dangling uuid falls back to the member definition name',
    'Actor.a.Item.gone',
    false,
    '',
    'Grand Codex',
    true,
    'lostCopy',
    'Grand Codex',
    true,
  ],
  [
    'dangling uuid with no definition falls back to the uuid tail',
    'Actor.a.Item.xyz',
    false,
    '',
    '',
    true,
    'uuid',
    'xyz',
    true,
  ],
];

function capsOf([, limitUses, maxUses, timesUsed]) {
  return { limitUses, maxUses, timesUsed };
}

describe('knowledgeStudio uses derivations', () => {
  it('derives remaining / spent / canExpend / usesChip across both axes', () => {
    for (const testCase of USES_CASES) {
      const [label, , , , remaining, spent, canExpend, usesChip] = testCase;
      const caps = capsOf(testCase);
      assert.equal(recipeItemRemainingUses(caps), remaining, `${label}: remaining`);
      assert.equal(isRecipeItemSpent(caps), spent, `${label}: spent`);
      assert.equal(canExpendRecipeItemUse(caps), canExpend, `${label}: canExpend`);
      assert.equal(usesChipState(caps), usesChip, `${label}: usesChip`);
    }
  });

  it('projects the same derivations onto an owned-copy row', () => {
    for (const testCase of USES_CASES) {
      const [label, limitUses, maxUses, timesUsed, remaining, spent, canExpend, usesChip] =
        testCase;
      const row = projectOwnedCopyRow({ itemId: 'i1', limitUses, maxUses, timesUsed });
      assert.equal(row.remaining, remaining, `${label}: row.remaining`);
      assert.equal(row.spent, spent, `${label}: row.spent`);
      assert.equal(row.canExpend, canExpend, `${label}: row.canExpend`);
      assert.equal(row.usesChip, usesChip, `${label}: row.usesChip`);
      assert.equal(row.timesUsed, Number(timesUsed || 0), `${label}: row.timesUsed coercion`);
    }
  });

  it('never gates canExpend on inert — an inert-but-not-spent copy is still expendable', () => {
    const caps = { limitUses: true, maxUses: 5, timesUsed: 1 };
    const inertRow = projectOwnedCopyRow({ itemId: 'i1', ...caps, inert: true });
    const plainRow = projectOwnedCopyRow({ itemId: 'i1', ...caps, inert: false });

    assert.equal(inertRow.inert, true);
    assert.equal(inertRow.spent, false, 'inert is NOT folded into spent');
    assert.equal(
      inertRow.canExpend,
      true,
      'inert does not gate Expend — the craft path ignores it'
    );
    assert.equal(inertRow.usesChip, 'remaining', 'the fifth state keeps its remaining-tone chip');
    assert.equal(plainRow.canExpend, inertRow.canExpend, 'inert changes nothing about canExpend');
  });

  it('projects inert independently of spent for a spent copy', () => {
    const row = projectOwnedCopyRow({
      itemId: 'i1',
      limitUses: true,
      maxUses: 2,
      timesUsed: 2,
      inert: true,
    });
    assert.equal(row.spent, true);
    assert.equal(row.inert, true);
    assert.equal(row.usesChip, 'spent');
    assert.equal(row.canExpend, false);
  });
});

describe('knowledgeStudio labels and tab default', () => {
  it('derives the recipe-item type from the linked-recipe count', () => {
    for (const [count, expected] of TYPE_CASES) {
      assert.equal(recipeItemTypeFromRecipeCount(count), expected, `count ${String(count)}`);
    }
  });

  it('labels an unresolved recipe item by its trailing uuid segment', () => {
    assert.equal(recipeItemLabelFromUuid('Actor.abc.Item.def'), 'def');
    assert.equal(recipeItemLabelFromUuid(''), '');
    assert.equal(recipeItemLabelFromUuid(null), '');
  });

  it('opens on Learned recipes only when the system has zero recipe item definitions', () => {
    assert.equal(defaultKnowledgeTab(0), KNOWLEDGE_TAB_LEARNED_RECIPES);
    assert.equal(defaultKnowledgeTab(undefined), KNOWLEDGE_TAB_LEARNED_RECIPES);
    assert.equal(defaultKnowledgeTab(1), KNOWLEDGE_TAB_RECIPE_ITEMS);
    assert.equal(defaultKnowledgeTab(12), KNOWLEDGE_TAB_RECIPE_ITEMS);
  });
});

describe('knowledgeStudio learned-recipe rows', () => {
  it('walks the source-name ladder and states when an erase frees no budget', () => {
    for (const testCase of LEARNED_SOURCE_CASES) {
      const [
        label,
        sourceItemUuid,
        sourceOwned,
        sourceItemName,
        sourceDefinitionName,
        sourceCapped,
        expectedKind,
        expectedName,
        expectedFreesNoSlot,
      ] = testCase;
      const raw = {
        recipeId: 'r1',
        recipeName: 'Smelt Copper',
        sourceItemUuid,
        sourceOwned,
        sourceItemName,
        sourceDefinitionName,
        sourceCapped,
      };
      const source = learnedRecipeSource(raw);
      assert.equal(source.kind, expectedKind, `${label}: kind`);
      assert.equal(source.name, expectedName, `${label}: name`);
      assert.equal(eraseFreesNoSlot(raw), expectedFreesNoSlot, `${label}: freesNoSlot`);

      const row = projectLearnedRecipeRow(raw);
      assert.equal(row.sourceKind, expectedKind, `${label}: row.sourceKind`);
      assert.equal(row.sourceName, expectedName, `${label}: row.sourceName`);
      assert.equal(row.freesNoSlot, expectedFreesNoSlot, `${label}: row.freesNoSlot`);
    }
  });
});

describe('knowledgeStudio character projection', () => {
  const partyPoolCopy = {
    itemId: 'i-total',
    itemUuid: 'Actor.a1.Item.i-total',
    name: 'Party Codex',
    limitUses: true,
    maxUses: 5,
    timesUsed: 0,
    learnScope: 'total',
  };

  it('raises the D8 hazard only for a total-scope copy that still sources a learned entry', () => {
    const hazard = projectKnowledgeCharacter({
      id: 'a1',
      name: 'Aria',
      ownedCopies: [partyPoolCopy],
      learnedRecipes: [{ recipeId: 'r1', sourceItemUuid: 'Actor.a1.Item.i-total' }],
    });
    assert.equal(hazard.hasPartyPoolHazard, true);

    const unsourced = projectKnowledgeCharacter({
      id: 'a1',
      ownedCopies: [partyPoolCopy],
      learnedRecipes: [{ recipeId: 'r1', sourceItemUuid: 'Actor.a1.Item.other' }],
    });
    assert.equal(unsourced.hasPartyPoolHazard, false, 'no learned entry names this copy');

    const perInstance = projectKnowledgeCharacter({
      id: 'a1',
      ownedCopies: [{ ...partyPoolCopy, learnScope: 'perInstance' }],
      learnedRecipes: [{ recipeId: 'r1', sourceItemUuid: 'Actor.a1.Item.i-total' }],
    });
    assert.equal(perInstance.hasPartyPoolHazard, false, 'perInstance scope strands nothing');
  });

  it('rolls up counts and marks an untracked character', () => {
    const tracked = projectKnowledgeCharacter({
      id: 'a1',
      name: 'Aria',
      ownedCopies: [partyPoolCopy],
      learnedRecipes: [{ recipeId: 'r1' }, { recipeId: 'r2' }],
      otherSystemCount: 3,
      orphanCount: 1,
    });
    assert.equal(tracked.itemCount, 1);
    assert.equal(tracked.learnedCount, 2);
    assert.equal(tracked.otherSystemCount, 3);
    assert.equal(tracked.orphanCount, 1);
    assert.equal(tracked.tracked, true);

    const empty = projectKnowledgeCharacter({ id: 'a2', name: 'Bran' });
    assert.equal(empty.itemCount, 0);
    assert.equal(empty.learnedCount, 0);
    assert.equal(empty.tracked, false, 'an empty character renders the "Nothing tracked" row');
  });
});

describe('knowledgeStudio snapshot projection', () => {
  const raw = {
    systemId: 'sys1',
    definitionCount: 2,
    characters: [
      { id: 'a1', name: 'Aria' },
      { id: 'a2', name: 'Bran the Bold' },
    ],
  };

  it('returns the empty state when inactive or unsnapshotted', () => {
    for (const [label, snapshot, options] of [
      ['inactive', raw, { active: false }],
      ['no snapshot', null, { active: true }],
    ]) {
      const projected = projectKnowledgeSnapshot(snapshot, options);
      assert.equal(projected.characters.length, 0, `${label}: no characters`);
      assert.equal(projected.selectedCharacter, null, `${label}: no selection`);
    }
  });

  it('falls back to the first character when the requested selection is gone', () => {
    const projected = projectKnowledgeSnapshot(raw, { active: true, selectedActorId: 'missing' });
    assert.equal(projected.selectedActorId, 'a1');
    assert.equal(projected.selectedCharacter.name, 'Aria');
    assert.equal(projected.characters.length, 2);
    assert.equal(projected.definitionCount, 2);
  });

  it('honours a live selection and the entry-resolved default tab', () => {
    const projected = projectKnowledgeSnapshot(raw, {
      active: true,
      selectedActorId: 'a2',
      defaultTab: KNOWLEDGE_TAB_LEARNED_RECIPES,
    });
    assert.equal(projected.selectedActorId, 'a2');
    assert.equal(projected.defaultTab, KNOWLEDGE_TAB_LEARNED_RECIPES);
  });

  it('builds a NEW object on every call', () => {
    const first = projectKnowledgeSnapshot(raw, { active: true });
    const second = projectKnowledgeSnapshot(raw, { active: true });
    assert.notEqual(first, second, 'never a shared reference the UI cannot re-propagate from');
    assert.notEqual(first.characters, second.characters);
  });

  it('filters the roster by name', () => {
    const projected = projectKnowledgeSnapshot(raw, { active: true });
    assert.deepEqual(
      filterKnowledgeRoster(projected.characters, 'bran').map((row) => row.id),
      ['a2']
    );
    assert.equal(filterKnowledgeRoster(projected.characters, '  ').length, 2);
    assert.equal(filterKnowledgeRoster(projected.characters, 'zzz').length, 0);
  });
});
