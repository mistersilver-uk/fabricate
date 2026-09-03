/**
 * The row-agnostic bulk selection model shared by the manager's browsers (issues 772, 1010).
 *
 * These cases MOVED here from `component-bulk-edit-model.test.js` when the helpers
 * themselves moved to `src/utils/bulkSelectionModel.js`; they were not copied. A copy is
 * the very thing the extraction exists to prevent — SonarCloud fails on
 * `new_duplicated_lines_density > 3%`, and `sonar.cpd.exclusions` is inert under Automatic
 * Analysis, so `tests/**` counts towards it just as `src/**` does.
 *
 * The semantics pinned here are the ones the plan called easy to get subtly wrong:
 *
 * - the page-selection state being computed over the RENDERED rows while the
 *   select-all-results affordance covers ALL filtered rows, with an EMPTY page reading
 *   `none` rather than the `'all'` a naive `every()` over `[]` would produce;
 * - `count` being the WHOLE selection rather than its intersection with the page;
 * - every selection helper returning a NEW `Set`, which is what makes the lifted browser
 *   state propagate.
 *
 * The helpers are exercised under their own names here, and the last case pins the aliased
 * re-export the component surfaces still import — the "no call site changed" claim that
 * made this extraction safe to do in one move.
 *
 * Top-level under `tests/` deliberately: the `npm test` glob covers `tests/*.test.js`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeBulkSelection,
  normalizeSelectionIds,
  pruneBulkSelection,
  setBulkSelection,
  toggleBulkSelection,
} from '../src/utils/bulkSelectionModel.js';
import {
  describeComponentSelection,
  pruneComponentSelection,
  setComponentSelection,
  toggleComponentSelection,
} from '../src/utils/componentBulkEditModel.js';

describe('bulk selection model (issue 772) — describing the selection', () => {
  const describe_ = (pageIds, filteredIds, selectedIds) =>
    describeBulkSelection({ pageIds, filteredIds, selectedIds: new Set(selectedIds) });

  it('reports none for an EMPTY page — a naive every() over [] would report all', () => {
    // A checked page box over a no-results search is the bug this rule exists for.
    const empty = describe_([], [], []);
    assert.equal(empty.pageSelectionState, 'none');
    assert.equal(empty.count, 0);
    assert.equal(empty.showSelectAllResults, false);
    assert.equal(empty.selectAllResultsCount, 0);
  });

  it('reports none, some and all over the RENDERED rows', () => {
    const page = ['a', 'b', 'c'];
    assert.equal(describe_(page, page, []).pageSelectionState, 'none');
    assert.equal(describe_(page, page, ['b']).pageSelectionState, 'some');
    assert.equal(describe_(page, page, ['a', 'b']).pageSelectionState, 'some');
    assert.equal(describe_(page, page, ['a', 'b', 'c']).pageSelectionState, 'all');
  });

  it('keeps the page control and the results action DISTINCT', () => {
    const page = ['a', 'b'];
    const filtered = ['a', 'b', 'c', 'd'];

    const pageFull = describe_(page, filtered, page);
    assert.equal(pageFull.pageSelectionState, 'all', 'the page is fully selected…');
    assert.equal(pageFull.showSelectAllResults, true, '…but two filtered rows are still unreached');
    assert.equal(pageFull.selectAllResultsCount, 4);
    assert.equal(pageFull.count, 2);

    const everything = describe_(page, filtered, filtered);
    assert.equal(everything.showSelectAllResults, false, 'the link disappears once nothing is left');
    assert.equal(everything.count, 4);
  });

  it('hides the results action when the page IS the whole filtered set', () => {
    const page = ['a', 'b'];
    assert.equal(describe_(page, page, []).showSelectAllResults, false);
  });

  it('counts the whole selection, including rows on another page', () => {
    // Acceptance 14: a selection made on page 1 survives paging and is still counted.
    const described = describe_(['c', 'd'], ['a', 'b', 'c', 'd'], ['a', 'b']);
    assert.equal(described.count, 2);
    assert.equal(described.pageSelectionState, 'none', 'none of the RENDERED rows are selected');
  });
});

describe('bulk selection model (issue 772) — the selection set', () => {
  it('toggleBulkSelection adds, removes, and always returns a NEW Set', () => {
    const empty = new Set();
    const withA = toggleBulkSelection(empty, 'a');
    assert.notEqual(withA, empty, 'the Svelte side propagates on reference change');
    assert.deepEqual([...withA], ['a']);
    assert.equal(empty.size, 0, 'the input Set is not mutated');

    const withoutA = toggleBulkSelection(withA, 'a');
    assert.notEqual(withoutA, withA);
    assert.deepEqual([...withoutA], []);
  });

  it('setBulkSelection selects or clears a whole run of ids', () => {
    const selected = setBulkSelection(new Set(['a']), ['b', 'c'], true);
    assert.deepEqual([...selected].sort(), ['a', 'b', 'c']);

    const cleared = setBulkSelection(selected, ['a', 'b'], false);
    assert.notEqual(cleared, selected);
    assert.deepEqual([...cleared], ['c']);
  });

  it('pruneBulkSelection drops ids that no longer resolve to a row', () => {
    // A delete, an unlink or a search change must never leave a phantom id in the
    // count or in an Apply.
    const selected = new Set(['a', 'b', 'c']);
    const pruned = pruneBulkSelection(selected, ['a', 'c', 'd']);
    assert.notEqual(pruned, selected);
    assert.deepEqual([...pruned], ['a', 'c']);
    assert.deepEqual([...selected], ['a', 'b', 'c'], 'the input Set is not mutated');
    assert.deepEqual([...pruneBulkSelection(selected, [])], []);
  });

  it('componentBulkEditModel re-exports all four under the names its call sites import', () => {
    // The Component Studio's Svelte surfaces still import `…ComponentSelection`. This is
    // the identity that let the helpers move without one of them changing, so a mis-aliased
    // re-export must fail here rather than surface as a hung or obscure mounted suite.
    assert.equal(describeComponentSelection, describeBulkSelection);
    assert.equal(toggleComponentSelection, toggleBulkSelection);
    assert.equal(setComponentSelection, setBulkSelection);
    assert.equal(pruneComponentSelection, pruneBulkSelection);
  });
});

describe('bulk selection model (issue 1132) — the id coercion', () => {
  // IT TRIMS, and that is not cosmetic. `describeRecipeDeleteImpact` — the leaf the recipe
  // set delete's STATEMENT counts through — trims the ids it is handed, while the WRITE
  // normalizes through here. The two sides therefore disagreed about `' r1 '`: the card
  // stated `deletable: 1` and the write reported `deleted: 0`. Unreachable through the
  // shipped callers, which forward the describer's already-trimmed ids, and closed anyway,
  // because the whole design rests on the two sides being unable to disagree.
  it('trims, so the describer and the writer cannot mean different ids', () => {
    assert.deepEqual(normalizeSelectionIds([' r1 ', 'r2	']), ['r1', 'r2']);
  });

  it('still de-duplicates AFTER trimming, so padding cannot smuggle a second copy in', () => {
    assert.deepEqual(normalizeSelectionIds(['r1', ' r1']), ['r1']);
  });

  it('drops a whitespace-only id rather than keeping an empty one', () => {
    assert.deepEqual(normalizeSelectionIds(['  ', 'r1']), ['r1']);
  });
});
