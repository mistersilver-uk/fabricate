/**
 * The manager's multi-select browser contract, as ONE parameterised run of cases (issue
 * 1010).
 *
 * The Component Studio shipped this behaviour first (issue 772) and the Recipe Studio
 * joins it here. Both browsers render the same `BulkSelectionToolbar` over the same
 * `bulkSelectionModel.js`, so the cases are one contract stated once and instantiated per
 * studio, not two literal runs of near-identical `it()` bodies. That is a duplication
 * decision as much as a design one: SonarCloud's new-code duplication gate counts
 * `tests/**` and `sonar.cpd.exclusions` is inert under Automatic Analysis, so a second
 * hand-copied run of these seven cases — same fixtures, same assertion prose, different
 * selector prefix — is exactly the block the gate refuses.
 *
 * Everything a studio differs on is a PARAMETER: the `data-*` hook prefix, the row class
 * and its id dataset key, the lifted-state field, the props shape, the fixtures, and the
 * per-row control count the selection box must not disturb. Nothing about the studio is
 * inferred from another parameter — a prefix that also derived the row class would make
 * one studio's naming a constraint on the other's.
 *
 * The two operations these cases keep apart are the whole point, and conflating them is
 * the defect: the tri-state box acts on the RENDERED rows (a collapsed category's rows are
 * not rendered and it must never reach them), while `Select all {N} results` acts on the
 * whole FILTERED set and is the only route to a row the page box cannot touch.
 *
 * @typedef {object} BulkSelectionStudio
 * @property {string} label            the browser's name, for the describe block.
 * @property {string} prefix           the `data-<prefix>-*` hook prefix (`recipe` / `component`).
 * @property {string} rowClass         the row's frozen class (`manager-recipe-row`).
 * @property {string} rowIdKey         the row's id dataset key (`recipeId`).
 * @property {string} selectionKey     the lifted browser-state field holding the `Set`.
 * @property {string} rowsProp         the prop the row array arrives on (`recipes`).
 * @property {object} harness          a `createMountedComponentHarness` instance.
 * @property {() => object} createBrowserState the studio's browser-state factory.
 * @property {(count: number) => object[]} makeFlatRows one category, ids from `flatId`.
 * @property {(index: number) => string} flatId the id of the nth flat row (1-based).
 * @property {() => object[]} makeGroupedRows two categories, four rows.
 * @property {{collapseHeader: string, hiddenIds: string[], visibleIds: string[]}} grouped
 * @property {(rows: object[], extra?: object) => object} props the full mount props.
 * @property {{scope: string, count: number, why: string}} rowControls the row's own
 *   button cluster: the selection control must not join it, because the Foundry smoke walk
 *   reaches the row's actions through button selectors.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

/**
 * These row ids are ASCII kebab-case, so codepoint order and `localeCompare` agree; the
 * comparator is spelled out explicitly anyway (rather than a bare `.sort()`) so a reader
 * cannot mistake the ordering for locale-default and "simplify" it back to the implicit form.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const compareIds = (a, b) => a.localeCompare(b);

/**
 * Register the seven multi-select cases against one studio.
 *
 * @param {BulkSelectionStudio} studio
 */
export function describeBrowserBulkSelection(studio) {
  const { harness, prefix, rowClass, rowIdKey, selectionKey, rowsProp } = studio;

  const rowBoxSelector = (id) => `[data-${prefix}-select="${id}"]`;
  const pageBoxSelector = `[data-${prefix}-select-all-page]`;
  const countSelector = `[data-${prefix}-selection-count]`;
  const resultsSelector = `[data-${prefix}-select-all-results]`;

  /** The ids of the rows currently rendered with a ticked selection box. */
  const bulkSelectedIds = (root) =>
    [...root.querySelectorAll(`.${rowClass}.is-bulk-selected`)].map((row) => row.dataset[rowIdKey]);

  /** The toolbar's `{N} selected` readout, or '' when nothing is selected (it is absent). */
  const selectionCountText = (root) => root.querySelector(countSelector)?.textContent.trim() || '';

  const clickRowBox = (root, id) => {
    root.querySelector(rowBoxSelector(id)).click();
    flushSync();
  };

  const mountFlat = (count, extra) =>
    harness.mount(studio.props(studio.makeFlatRows(count), extra));

  describe(`${studio.label} bulk selection (issues 772 / 1010)`, () => {
    it('ticks a row from its own trailing box, and that box is not a button', async () => {
      const root = await mountFlat(3);
      const first = studio.flatId(1);

      const box = root.querySelector(rowBoxSelector(first));
      assert.equal(box.tagName, 'INPUT', 'the selection control is a real checkbox input');
      assert.equal(
        root.querySelectorAll(`[data-${prefix}-id="${first}"] ${studio.rowControls.scope} button`)
          .length,
        studio.rowControls.count,
        studio.rowControls.why
      );

      clickRowBox(root, first);
      assert.deepEqual(bulkSelectedIds(root), [first], 'the ticked row carries is-bulk-selected');
      assert.equal(
        root.querySelector(`[data-${prefix}-id="${first}"]`).dataset[`${prefix}BulkSelected`],
        'true',
        'and states it as data, which is what a screenshot walk can assert on'
      );
      assert.match(selectionCountText(root), /1 selected/);

      clickRowBox(root, first);
      assert.deepEqual(bulkSelectedIds(root), [], 'ticking again clears the row');
      assert.equal(selectionCountText(root), '', 'the readout disappears with an empty selection');
    });

    it('toggles ONLY the rendered rows from the page box, leaving a collapsed group alone', async () => {
      const root = await harness.mount(studio.props(studio.makeGroupedRows()));

      // Collapse one category through its REAL header button, so its rows stop rendering.
      root.querySelector(`[data-group-header="${studio.grouped.collapseHeader}"]`).click();
      flushSync();
      assert.deepEqual(
        [...root.querySelectorAll(`.${rowClass}`)]
          .map((row) => row.dataset[rowIdKey])
          .sort(compareIds),
        [...studio.grouped.visibleIds].sort(compareIds),
        'only the expanded category renders rows once the other is collapsed'
      );

      const pageBox = root.querySelector(pageBoxSelector);
      pageBox.click();
      flushSync();

      assert.deepEqual(
        bulkSelectedIds(root).sort(compareIds),
        [...studio.grouped.visibleIds].sort(compareIds),
        'the page control must not reach rows the GM cannot see'
      );
      assert.match(selectionCountText(root), /2 selected/, 'and the count cannot exceed them');
      assert.equal(pageBox.checked, true, 'every RENDERED row is selected, so the box reads all');

      pageBox.click();
      flushSync();
      assert.deepEqual(bulkSelectedIds(root), [], 'clicking again clears the rendered rows');
    });

    it('reports the tri-state over the rendered rows', async () => {
      const root = await mountFlat(3);
      const pageBox = root.querySelector(pageBoxSelector);

      assert.equal(pageBox.checked, false, 'nothing selected reads unchecked');
      assert.equal(pageBox.indeterminate, false, 'and NOT indeterminate');

      clickRowBox(root, studio.flatId(1));
      assert.equal(pageBox.indeterminate, true, 'part of the page selected reads indeterminate');

      clickRowBox(root, studio.flatId(2));
      clickRowBox(root, studio.flatId(3));
      assert.equal(pageBox.checked, true, 'the whole page selected reads checked');
      assert.equal(pageBox.indeterminate, false);
    });

    it('reaches the whole filtered set through "Select all N results"', async () => {
      const root = await mountFlat(30);

      assert.ok(
        !root.querySelector(resultsSelector),
        'the results link belongs to the selection cluster and is absent with nothing selected'
      );

      clickRowBox(root, studio.flatId(1));
      const link = root.querySelector(resultsSelector);
      assert.match(link.textContent, /30/, 'the link names the whole filtered set, not the page');

      link.click();
      flushSync();
      assert.match(selectionCountText(root), /30 selected/, 'all 30 filtered rows are selected');
      assert.ok(
        !root.querySelector(resultsSelector),
        'the link disappears once the filtered set is fully selected'
      );
    });

    it('keeps a selection made on page 1 when the GM pages away', async () => {
      const root = await mountFlat(30);
      const first = studio.flatId(1);

      clickRowBox(root, first);
      root.querySelector('[data-pagination-next]').click();
      flushSync();

      assert.ok(!root.querySelector(rowBoxSelector(first)), 'page 2 does not render the first row');
      assert.match(
        selectionCountText(root),
        /1 selected/,
        'the count is the WHOLE selection, not its intersection with the page'
      );
    });

    it('drops a selected id that no longer resolves to a row', async () => {
      const root = await mountFlat(3);
      const [first, second] = [studio.flatId(1), studio.flatId(2)];

      clickRowBox(root, first);
      clickRowBox(root, second);
      assert.match(selectionCountText(root), /2 selected/);

      // A delete / unlink / refresh republishes the rows without that one.
      await harness.setProps({
        [rowsProp]: studio.makeFlatRows(3).filter((row) => row.id !== first),
      });

      assert.deepEqual(bulkSelectedIds(root), [second], 'the surviving row stays selected');
      assert.match(
        selectionCountText(root),
        /1 selected/,
        'a phantom id must never survive in the count or in an Apply'
      );
    });

    it('clears the selection on a genuine crafting-system switch', async () => {
      const shared = studio.createBrowserState();
      const rows = studio.makeFlatRows(3);

      await harness.mount(studio.props(rows, { selectedSystemId: 'sys-1', browserState: shared }));
      shared[selectionKey] = new Set([studio.flatId(1), studio.flatId(2)]);

      harness.remount();
      await harness.mount(studio.props(rows, { selectedSystemId: 'sys-1', browserState: shared }));
      assert.equal(
        shared[selectionKey].size,
        2,
        'an editor round-trip is not a system switch and must not clear it'
      );

      harness.remount();
      await harness.mount(studio.props(rows, { selectedSystemId: 'sys-2', browserState: shared }));
      assert.equal(
        shared[selectionKey].size,
        0,
        'the selection names rows the new system does not have'
      );
    });
  });
}
