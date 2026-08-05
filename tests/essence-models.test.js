/**
 * Issue 1036 — the pure Essence Studio models.
 *
 * Three modules, all leaves: `essenceBulkEditModel.js` (the staged bulk-edit draft),
 * `essenceValidation.js` (the add-new offer projection and the editor's Validation tab) and
 * `essenceBrowserModel.js` (filter → sort → paginate). Plus the two shared extractions this
 * change made — the `unchanged | enable | disable` status axis and the reference predicate —
 * each pinned at the point the extraction could have gone wrong.
 *
 * The bulk-edit projection is table-driven over ALL EIGHT staged/unstaged combinations
 * because two of its keys are FALSY BUT REAL: `colorToken: null` (Clear colour) and
 * `enabled: false` (Disable). A truthiness guard anywhere downstream silently drops the two
 * most ordinary operations the panel offers, and only key PRESENCE distinguishes them from
 * an unstaged axis.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BULK_STATUS_VALUES, normalizeBulkStatus } from '../src/utils/bulkSelectionModel.js';
import {
  ESSENCE_BULK_COLOUR_NONE,
  ESSENCE_BULK_COLOUR_UNCHANGED,
  ESSENCE_BULK_STATUS_VALUES,
  bulkEssenceColourControlValue,
  bulkEssenceDraftHasChanges,
  createEssenceBulkDraft,
  describeEssenceDeleteImpact,
  setBulkEssenceColour,
  setBulkEssenceIcon,
  setBulkEssenceStatus,
  toBulkEssenceEdit,
} from '../src/utils/essenceBulkEditModel.js';
import {
  buildEssenceBrowserModel,
  createEssenceBrowserState,
  essenceStatusCounts,
  filterEssences,
  sortEssences,
} from '../src/utils/essenceBrowserModel.js';
import {
  essenceEditorValidation,
  selectableEssenceOptions,
} from '../src/utils/essenceValidation.js';
import { recipeReferencesEssence } from '../src/utils/recipeEssenceReferences.js';
import {
  RECIPE_BULK_STATUS_VALUES,
  setBulkRecipeStatus,
  toBulkRecipeEdit,
} from '../src/utils/recipeBulkEditModel.js';

// ---------------------------------------------------------------------------
// Criterion 10 — the bulk-edit projection is PRESENCE-gated, over all eight combinations
// ---------------------------------------------------------------------------

/** Build a draft through the REAL setters, so the table cannot drift from the producer. */
function stage({ icon, colour, status }) {
  let draft = createEssenceBulkDraft();
  if (icon !== undefined) draft = setBulkEssenceIcon(draft, icon);
  if (colour !== undefined) draft = setBulkEssenceColour(draft, colour);
  if (status !== undefined) draft = setBulkEssenceStatus(draft, status);
  return draft;
}

const EIGHT_COMBINATIONS = [
  { staged: {}, expected: {} },
  { staged: { icon: 'fas fa-star' }, expected: { icon: 'fas fa-star' } },
  { staged: { colour: ESSENCE_BULK_COLOUR_NONE }, expected: { colorToken: null } },
  { staged: { status: 'disable' }, expected: { enabled: false } },
  {
    staged: { icon: 'fas fa-star', colour: 'aqua' },
    expected: { icon: 'fas fa-star', colorToken: 'aqua' },
  },
  {
    staged: { icon: 'fas fa-star', status: 'enable' },
    expected: { icon: 'fas fa-star', enabled: true },
  },
  {
    staged: { colour: ESSENCE_BULK_COLOUR_NONE, status: 'disable' },
    expected: { colorToken: null, enabled: false },
  },
  {
    staged: { icon: 'fas fa-star', colour: 'rose', status: 'disable' },
    expected: { icon: 'fas fa-star', colorToken: 'rose', enabled: false },
  },
];

describe('1036/10 — toBulkEssenceEdit emits an axis key IFF that axis is staged', () => {
  for (const { staged, expected } of EIGHT_COMBINATIONS) {
    const label = Object.keys(staged).join('+') || 'nothing';
    it(`stages ${label}`, () => {
      const edit = toBulkEssenceEdit(stage(staged));
      assert.deepEqual(edit, expected);
      assert.deepEqual(
        Object.keys(edit).sort((a, b) => a.localeCompare(b)),
        Object.keys(expected).sort((a, b) => a.localeCompare(b)),
        'no key is emitted for an unstaged axis, and none is dropped for a falsy staged one'
      );
    });
  }

  it('distinguishes Clear colour from Leave unchanged by KEY PRESENCE alone', () => {
    const cleared = toBulkEssenceEdit(stage({ colour: ESSENCE_BULK_COLOUR_NONE }));
    const untouched = toBulkEssenceEdit(stage({ colour: ESSENCE_BULK_COLOUR_UNCHANGED }));
    assert.equal(Object.hasOwn(cleared, 'colorToken'), true);
    assert.equal(cleared.colorToken, null);
    assert.equal(Object.hasOwn(untouched, 'colorToken'), false);
  });

  it('keeps Apply live for a staged Clear colour and a staged Disable', () => {
    assert.equal(bulkEssenceDraftHasChanges(stage({ colour: ESSENCE_BULK_COLOUR_NONE })), true);
    assert.equal(bulkEssenceDraftHasChanges(stage({ status: 'disable' })), true);
    assert.equal(bulkEssenceDraftHasChanges(createEssenceBulkDraft()), false);
  });

  it('round-trips the colour control value without collapsing the two sentinels', () => {
    assert.equal(
      bulkEssenceColourControlValue(stage({ colour: ESSENCE_BULK_COLOUR_UNCHANGED })),
      ESSENCE_BULK_COLOUR_UNCHANGED
    );
    assert.equal(
      bulkEssenceColourControlValue(stage({ colour: ESSENCE_BULK_COLOUR_NONE })),
      ESSENCE_BULK_COLOUR_NONE
    );
    assert.equal(bulkEssenceColourControlValue(stage({ colour: 'mauve' })), 'mauve');
  });

  it('returns a NEW draft from every setter and never mutates its input', () => {
    const draft = createEssenceBulkDraft();
    const next = setBulkEssenceStatus(draft, 'disable');
    assert.notEqual(next, draft);
    assert.equal(draft.status, 'unchanged');
  });
});

// ---------------------------------------------------------------------------
// Criterion 22 — the shared status axis, after the extraction
// ---------------------------------------------------------------------------

describe('1036/22 — the extracted unchanged|enable|disable status axis', () => {
  it('is ONE frozen list, shared by the recipe and essence models', () => {
    assert.deepEqual([...BULK_STATUS_VALUES], ['unchanged', 'enable', 'disable']);
    assert.equal(RECIPE_BULK_STATUS_VALUES, BULK_STATUS_VALUES, 'the recipe name is a re-export');
    assert.equal(ESSENCE_BULK_STATUS_VALUES, BULK_STATUS_VALUES, 'so is the essence name');
  });

  it('normalizes an unrecognised value to unchanged rather than staging an edit', () => {
    assert.equal(normalizeBulkStatus('nope'), 'unchanged');
    assert.equal(normalizeBulkStatus(undefined), 'unchanged');
    assert.equal(setBulkRecipeStatus(undefined, 'nope').status, 'unchanged');
  });

  for (const [status, expected] of [
    ['disable', { enabled: false }],
    ['enable', { enabled: true }],
    ['unchanged', {}],
  ]) {
    it(`still emits ${JSON.stringify(expected)} for a recipe staged as ${status}`, () => {
      const recipeEdit = toBulkRecipeEdit(setBulkRecipeStatus(undefined, status));
      const essenceEdit = toBulkEssenceEdit(setBulkEssenceStatus(undefined, status));
      assert.deepEqual(recipeEdit, expected, 'the recipe site survived the move');
      assert.deepEqual(essenceEdit, expected, 'and the essence site agrees with it exactly');
    });
  }
});

// ---------------------------------------------------------------------------
// The add-new offer projection (the pure half of criteria 2 and 18)
// ---------------------------------------------------------------------------

describe('1036 — selectableEssenceOptions', () => {
  const OPTIONS = [
    { id: 'fire', name: 'Fire', enabled: true },
    { id: 'water', name: 'Water', enabled: false },
    { id: 'air', name: 'Air' },
  ];

  it('withholds a DISABLED essence from the add-new offer', () => {
    assert.deepEqual(
      selectableEssenceOptions(OPTIONS).map((option) => option.id),
      ['fire', 'air']
    );
  });

  it('negative control: an ENABLED essence IS offered, so the filter is not filtering everything', () => {
    assert.ok(selectableEssenceOptions(OPTIONS).some((option) => option.id === 'fire'));
  });

  it('is default-TRUE, matching the persisted field — an option with no key is offered', () => {
    assert.ok(selectableEssenceOptions(OPTIONS).some((option) => option.id === 'air'));
  });

  it('does not mutate or alias the UNFILTERED list it was handed', () => {
    const offered = selectableEssenceOptions(OPTIONS);
    assert.notEqual(offered, OPTIONS);
    assert.equal(OPTIONS.length, 3, 'the prop boundary keeps every essence, disabled or not');
  });

  it('is total over junk input rather than throwing under a render', () => {
    assert.deepEqual(selectableEssenceOptions(null), []);
    assert.deepEqual(selectableEssenceOptions('fire'), []);
  });
});

// ---------------------------------------------------------------------------
// Criterion 23 (the shared reference predicate half)
// ---------------------------------------------------------------------------

describe('1036/23 — recipeReferencesEssence, extracted for the store and the manager', () => {
  const legacyMapRecipe = { ingredientSets: [{ id: 's1', essences: { fire: 2 } }] };
  const optionRecipe = {
    ingredientSets: [
      {
        id: 's1',
        ingredientGroups: [{ options: [{ match: { type: 'essence', essenceId: 'fire' } }] }],
      },
    ],
  };
  const stepRecipe = {
    steps: [{ ingredientSets: [{ id: 's2', essences: { fire: 1 } }] }],
  };

  it('walks the legacy per-set map branch', () => {
    assert.equal(recipeReferencesEssence(legacyMapRecipe, 'fire'), true);
    assert.equal(recipeReferencesEssence(legacyMapRecipe, 'water'), false);
  });

  it('walks the first-class essence OPTION branch', () => {
    assert.equal(recipeReferencesEssence(optionRecipe, 'fire'), true);
    assert.equal(recipeReferencesEssence(optionRecipe, 'water'), false);
  });

  it('walks STEP-level ingredient sets as well as recipe-level ones', () => {
    assert.equal(recipeReferencesEssence(stepRecipe, 'fire'), true);
  });

  it('accepts a Recipe INSTANCE through toJSON as well as a plain projection', () => {
    const instance = { toJSON: () => legacyMapRecipe };
    assert.equal(recipeReferencesEssence(instance, 'fire'), true);
  });

  it('is total over an empty or malformed recipe', () => {
    assert.equal(recipeReferencesEssence(null, 'fire'), false);
    assert.equal(recipeReferencesEssence({}, 'fire'), false);
    assert.equal(recipeReferencesEssence({ ingredientSets: [null] }, 'fire'), false);
  });
});

// ---------------------------------------------------------------------------
// The editor's Validation tab
// ---------------------------------------------------------------------------

describe('1036 — essenceEditorValidation', () => {
  const COMPLETE = {
    name: 'Fire',
    icon: 'fas fa-fire',
    description: 'Elemental heat',
    colorToken: 'rose',
    enabled: true,
  };

  function check(result, id) {
    return result.checks.find((entry) => entry.id === id);
  }

  it('passes every check for a complete, enabled, coloured essence', () => {
    const result = essenceEditorValidation(COMPLETE);
    assert.deepEqual(result.counts, { passing: 7, warnings: 0, blocking: 0 });
  });

  it('treats a missing name and a missing icon as BLOCKING', () => {
    const result = essenceEditorValidation({ ...COMPLETE, name: '  ', icon: '' });
    assert.equal(result.counts.blocking, 2);
    assert.equal(check(result, 'name').valid, false);
    assert.equal(check(result, 'icon').valid, false);
  });

  it('treats a missing description as a WARNING, not a blocker', () => {
    const result = essenceEditorValidation({ ...COMPLETE, description: '' });
    assert.deepEqual(result.counts, { passing: 6, warnings: 1, blocking: 0 });
  });

  it('treats an UNSET colour as a PASS — an unset essence renders in the theme accent by design', () => {
    const result = essenceEditorValidation({ ...COMPLETE, colorToken: null });
    assert.equal(check(result, 'colour').valid, true);
    assert.equal(check(result, 'colour').state, 'unset');
    // The SEVERITY, not just the verdict. `unset` is not one of the three failure states,
    // so `valid` stays true whatever severity the row carries — which made "a pass, not a
    // warning" true by accident and a re-classification to `warning` invisible. The tab
    // renders this value, so it is part of the contract.
    assert.equal(
      check(result, 'colour').severity,
      'info',
      'the colour row is INFORMATIONAL: it can never fail, and must never be presented as a warning'
    );
    assert.deepEqual(result.counts, { passing: 7, warnings: 0, blocking: 0 });
  });

  it('pins the severity of every enumerated check, so a re-classification cannot ship silently', () => {
    const result = essenceEditorValidation(COMPLETE, { componentUsageCount: 1 });
    assert.deepEqual(
      result.checks.map((entry) => [entry.id, entry.severity]),
      [
        ['name', 'blocking'],
        ['icon', 'blocking'],
        ['colour', 'info'],
        ['description', 'warning'],
        ['macro', 'warning'],
        ['source', 'warning'],
        ['usage', 'info'],
      ],
      'in render order, with the two informational rows explicitly informational'
    );
  });

  it('warns about an unresolvable macro ONLY when features.propertyMacros is on', () => {
    const essence = { ...COMPLETE, propertyMacroUuid: 'Macro.gone' };
    assert.equal(
      check(essenceEditorValidation(essence, { macroResolved: false }), 'macro').valid,
      true,
      'the gate is off, so the tab asserts nothing about a macro that cannot run'
    );
    assert.equal(
      check(
        essenceEditorValidation(essence, { propertyMacrosEnabled: true, macroResolved: false }),
        'macro'
      ).valid,
      false
    );
  });

  it('passes the macro row while resolution is still in flight', () => {
    const result = essenceEditorValidation(
      { ...COMPLETE, propertyMacroUuid: 'Macro.pending' },
      { propertyMacrosEnabled: true, macroResolved: null }
    );
    assert.equal(check(result, 'macro').valid, true, 'a spinner must not read as a defect');
  });

  it('warns about a broken source ONLY when features.effectTransfer is on', () => {
    for (const sourceState of ['stale', 'missing']) {
      assert.equal(
        check(essenceEditorValidation(COMPLETE, { sourceState }), 'source').valid,
        true,
        'gate off ⇒ no warning'
      );
      assert.equal(
        check(
          essenceEditorValidation(COMPLETE, { effectTransferEnabled: true, sourceState }),
          'source'
        ).valid,
        false,
        `gate on ⇒ ${sourceState} warns`
      );
    }
    assert.equal(
      check(
        essenceEditorValidation(COMPLETE, { effectTransferEnabled: true, sourceState: 'linked' }),
        'source'
      ).valid,
      true,
      'a healthy link passes'
    );
  });

  it('reports disabled-and-in-use as INFORMATIONAL, never as a failure', () => {
    const result = essenceEditorValidation(
      { ...COMPLETE, enabled: false },
      { componentUsageCount: 4, recipeUsageCount: 2 }
    );
    assert.equal(check(result, 'usage').state, 'disabled-in-use');
    assert.equal(check(result, 'usage').valid, true, 'the headline state of this feature is not a defect');
    assert.deepEqual(result.counts, { passing: 7, warnings: 0, blocking: 0 });
  });

  it('distinguishes a disabled-and-unused essence from a disabled-and-carried one', () => {
    const unused = essenceEditorValidation({ ...COMPLETE, enabled: false });
    assert.equal(check(unused, 'usage').state, 'disabled-unused');
  });
});

// ---------------------------------------------------------------------------
// The browser model
// ---------------------------------------------------------------------------

describe('1036 — essenceBrowserModel', () => {
  const ROWS = [
    { id: 'fire', name: 'Fire', enabled: true, sourceState: 'linked', componentUsageCount: 3, recipeUsageCount: 1 },
    { id: 'water', name: 'Water', enabled: false, sourceState: 'stale', componentUsageCount: 1, recipeUsageCount: 4 },
    { id: 'air', name: 'Air', sourceState: 'none', componentUsageCount: 0, recipeUsageCount: 0 },
    { id: 'earth', name: 'Earth', enabled: false, sourceState: 'missing', componentUsageCount: 2, recipeUsageCount: 0 },
  ];

  it('seeds a FRESH lifted browser state, with a NEW selection Set each call', () => {
    const first = createEssenceBrowserState();
    const second = createEssenceBrowserState();
    assert.notEqual(first.bulkSelectedEssenceIds, second.bulkSelectedEssenceIds);
    assert.equal(first.statusFilter, 'all');
    assert.equal(first.viewMode, 'list');
  });

  it('filters by status, reading an absent `enabled` as enabled', () => {
    assert.deepEqual(
      filterEssences(ROWS, { status: 'enabled' }).map((row) => row.id),
      ['fire', 'air']
    );
    assert.deepEqual(
      filterEssences(ROWS, { status: 'disabled' }).map((row) => row.id),
      ['water', 'earth']
    );
  });

  it('negative control: an unrecognised status filter matches everything rather than nothing', () => {
    assert.equal(filterEssences(ROWS, { status: 'sideways' }).length, ROWS.length);
    assert.equal(filterEssences(ROWS, {}).length, ROWS.length);
  });

  it('filters by source state, with needs-attention as the union of the two broken states', () => {
    assert.deepEqual(
      filterEssences(ROWS, { source: 'needs-attention' }).map((row) => row.id),
      ['water', 'earth']
    );
    assert.deepEqual(
      filterEssences(ROWS, { source: 'linked' }).map((row) => row.id),
      ['fire']
    );
    assert.deepEqual(
      filterEssences(ROWS, { source: 'none' }).map((row) => row.id),
      ['air']
    );
  });

  it('counts each status over the rows it is given', () => {
    assert.deepEqual(essenceStatusCounts(ROWS), { all: 4, enabled: 2, disabled: 2 });
  });

  it('sorts by name, by status (enabled first) and by each usage count, with name as the tiebreak', () => {
    assert.deepEqual(
      sortEssences(ROWS, { key: 'name' }).map((row) => row.id),
      ['air', 'earth', 'fire', 'water']
    );
    assert.deepEqual(
      sortEssences(ROWS, { key: 'status' }).map((row) => row.id),
      ['air', 'fire', 'earth', 'water'],
      'enabled first, names ascending inside each run'
    );
    assert.deepEqual(
      sortEssences(ROWS, { key: 'recipes', direction: 'desc' }).map((row) => row.id),
      ['water', 'fire', 'air', 'earth']
    );
  });

  it('does not mutate the rows it sorts', () => {
    const rows = [...ROWS];
    sortEssences(rows, { key: 'name' });
    assert.deepEqual(
      rows.map((row) => row.id),
      ROWS.map((row) => row.id)
    );
  });

  it('clamps an out-of-range page rather than stranding the pager on an empty one', () => {
    const model = buildEssenceBrowserModel(ROWS, { pageSize: 2, pageIndex: 9 });
    assert.equal(model.pageIndex, 1);
    assert.deepEqual(model.essences.map((row) => row.id), ['fire', 'water']);
    assert.deepEqual([model.rangeStart, model.rangeEnd, model.totalCount], [3, 4, 4]);
  });

  it('reports an empty result as 0..0, never 1..0', () => {
    const model = buildEssenceBrowserModel([], { pageSize: 2 });
    assert.deepEqual([model.rangeStart, model.rangeEnd, model.totalCount], [0, 0, 0]);
  });

  it('reports the status counts over the UNFILTERED rows, so the control keeps saying what it would find', () => {
    const model = buildEssenceBrowserModel(ROWS, { status: 'enabled' });
    assert.deepEqual(model.statusCounts, { all: 4, enabled: 2, disabled: 2 });
    assert.deepEqual(model.filteredIds, ['air', 'fire'], 'while the rows themselves ARE filtered');
  });
});

// ---------------------------------------------------------------------------
// The bulk delete impact statement
// ---------------------------------------------------------------------------

describe('1036 — describeEssenceDeleteImpact', () => {
  // The SHARED-CARRIER fixture, deliberately shaped so a sum and a union differ. This
  // mirrors what `tests/essence-manager-set-apply.test.js` proves the manager does:
  // 3 essences across 2 SHARED recipes is `recipesUpdated: 2`, because each referencing
  // recipe is rewritten ONCE for the whole selection. Summing per-essence counts would
  // report 4 — a sidebar telling the GM twice the truth. The identities are what make the
  // two answers distinguishable at all; a counts-only fixture cannot fail this.
  const SELECTION = [
    {
      id: 'fire',
      name: 'Fire',
      deleteBlocked: false,
      componentUsageItems: [{ id: 'comp-a' }],
      recipeUsageIds: ['r1', 'r2'],
    },
    {
      id: 'water',
      name: 'Water',
      deleteBlocked: false,
      componentUsageItems: [{ id: 'comp-a' }],
      recipeUsageIds: ['r2'],
    },
    {
      id: 'earth',
      name: 'Earth',
      deleteBlocked: true,
      componentUsageItems: [{ id: 'comp-z' }],
      recipeUsageIds: ['r9'],
    },
  ];

  it('reports the UNION of affected recipes, not the sum of per-essence counts', () => {
    const impact = describeEssenceDeleteImpact(SELECTION);
    assert.equal(impact.deletable, 2, 'selection size 3, deletable 2');
    assert.equal(
      impact.recipeRewrites,
      2,
      'r1 and r2 — the sum over the two deletable rows would be 3, and 2 is what the cascade rewrites'
    );
  });

  it('unions the carrying COMPONENTS too, so a component carrying two selected essences counts once', () => {
    const impact = describeEssenceDeleteImpact(SELECTION);
    assert.equal(
      impact.componentsAffected,
      1,
      'one component carries both deletable essences; the sum would be 2'
    );
  });

  it('accepts a bare id array as well as the store `{id, …}` row shape', () => {
    const impact = describeEssenceDeleteImpact([
      { id: 'fire', componentUsageIds: ['comp-a', 'comp-b'], recipeUsageIds: ['r1'] },
      { id: 'water', componentUsageIds: ['comp-b'], recipeUsageIds: ['r1'] },
    ]);
    assert.equal(impact.componentsAffected, 2, 'comp-a and comp-b, with comp-b counted once');
    assert.equal(impact.recipeRewrites, 1);
  });

  it('excludes and NAMES the blocked members, and excludes their usage from the impact', () => {
    const impact = describeEssenceDeleteImpact(SELECTION);
    assert.equal(impact.blocked, 1);
    assert.deepEqual(impact.blockedNames, ['Earth']);
    assert.deepEqual(impact.deletableIds, ['fire', 'water']);
    assert.deepEqual(
      [impact.recipeRewrites, impact.componentsAffected],
      [
        describeEssenceDeleteImpact(SELECTION.slice(0, 2)).recipeRewrites,
        describeEssenceDeleteImpact(SELECTION.slice(0, 2)).componentsAffected,
      ],
      "dropping the blocked row changes nothing — its own recipe and component are not touched"
    );
  });

  it('is INERT when every selection member is blocked', () => {
    const impact = describeEssenceDeleteImpact([SELECTION[2]]);
    assert.equal(impact.canDelete, false);
    assert.equal(impact.deletable, 0);
    assert.deepEqual(impact.blockedNames, ['Earth']);
    assert.equal(impact.componentsAffected, 0);
    assert.equal(impact.recipeRewrites, 0);
  });

  it('recomputes from the selection it is given rather than caching', () => {
    assert.equal(describeEssenceDeleteImpact(SELECTION.slice(0, 1)).recipeRewrites, 2);
    assert.equal(describeEssenceDeleteImpact(SELECTION.slice(1, 2)).recipeRewrites, 1);
  });

  it('contributes NOTHING for a row supplying no identities, rather than an over-count', () => {
    // A projection that has not been taught to emit ids yet under-reports visibly instead
    // of inventing a number the operation will not match.
    const impact = describeEssenceDeleteImpact([{ id: 'fire', recipeUsageCount: 7 }]);
    assert.equal(impact.recipeRewrites, 0);
    assert.equal(impact.componentsAffected, 0);
  });

  it('is total over junk rows instead of throwing under the panel', () => {
    const impact = describeEssenceDeleteImpact([null, { id: 'x' }]);
    assert.equal(impact.deletable, 2);
    assert.equal(impact.componentsAffected, 0);
  });
});
