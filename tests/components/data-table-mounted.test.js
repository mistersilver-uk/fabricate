/** Issue 1782 — the library's `<DataTable>`: a captioned table, its rows, its pager and its states. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { chooseSelectOption } from '../helpers/select-control.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const DATA_TABLE = 'src/ui/svelte/components/DataTable.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-data-table-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [
    'src/ui/svelte/components/IconButton.svelte',
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/Pagination.svelte',
    DATA_TABLE,
  ],
  componentPath: DATA_TABLE,
});

const COLUMNS = [
  { key: 'name', label: 'Name', rowHeader: true },
  { key: 'qty', label: 'Qty', align: 'end', mono: true, width: '56px' },
];
const rowsOf = (length) =>
  Array.from({ length }, (_, index) => ({
    id: `r${index + 1}`,
    name: `Row ${index + 1}`,
    qty: index,
  }));
const base = (extra = {}) => ({
  columns: COLUMNS,
  rows: rowsOf(3),
  rowKey: (row) => row.id,
  heading: 'Crafts',
  ...extra,
});

const cell = createRawSnippet((row, column) => ({
  render: () => `<span data-probe-cell="${row().id}:${column().key}">${row()[column().key]}</span>`,
}));
const search = createRawSnippet(() => ({ render: () => '<input data-probe-search="" />' }));

const tableIn = (root) => root.querySelector('table');
const bodyRows = (root) => [...root.querySelectorAll(':scope tbody tr.fabricate-data-table-row')];
const nameOf = (root, element) =>
  element
    .getAttribute('aria-labelledby')
    .split(' ')
    .map((id) => root.querySelector(`[id="${id}"]`).textContent.trim())
    .join(' ');

describe('DataTable', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('is a table named by its caption, the heading and the count, with the caller class and hook', async () => {
    const root = await harness.mount(
      base({ count: 12, search, class: 'is-caller', 'data-probe-table': '' })
    );
    const table = tableIn(root);
    const caption = table.querySelector(':scope > caption');
    assert.ok(Boolean(caption), 'the heading is the table’s own caption');
    assert.equal(caption.textContent.replaceAll(/\s+/g, ' ').trim(), 'Crafts 12');
    assert.equal(nameOf(root, table), 'Crafts 12', 'the name is the heading and the count alone');
    assert.ok(
      Boolean(caption.querySelector('[data-probe-search]')),
      'the search sits in the caption'
    );
    const host = root.querySelector('.fabricate-data-table');
    assert.ok(host.classList.contains('is-caller'), 'the caller class is appended');
    assert.ok(host.hasAttribute('data-probe-table'), 'the rest spread lands on the root');
  });

  it('heads each column and puts the row-header column in a row-scoped th', async () => {
    const root = await harness.mount(base({ cell }));
    assert.deepEqual(
      [...root.querySelectorAll(':scope thead th')].map((th) => [
        th.getAttribute('scope'),
        th.textContent.trim(),
      ]),
      [
        ['col', 'Name'],
        ['col', 'Qty'],
      ]
    );
    const [first] = bodyRows(root);
    assert.equal(first.children[0].tagName, 'TH');
    assert.equal(first.children[0].getAttribute('scope'), 'row');
    assert.equal(first.children[1].tagName, 'TD');
    assert.ok(first.children[1].classList.contains('is-align-end'));
    assert.ok(first.children[1].classList.contains('is-mono'));
    assert.ok(Boolean(first.querySelector('[data-probe-cell="r1:qty"]')), 'the cell snippet draws');
    assert.equal(root.querySelector('col:nth-child(2)').style.width, '56px');
  });

  it('draws the shipped pager only on a paged table whose count exceeds a page', async () => {
    const pager = (root) => root.querySelector('.fabricate-pagination');
    let root = await harness.mount(base({ rows: rowsOf(30) }));
    assert.ok(!pager(root), 'an unpaged table never pages');
    harness.remount();
    root = await harness.mount(base({ rows: rowsOf(5), perPage: 5, perPageOptions: [5, 10] }));
    assert.ok(!pager(root), 'a count that fits one page draws no pager');
    harness.remount();
    const pages = [];
    root = await harness.mount(
      base({
        rows: rowsOf(5),
        count: 6,
        perPage: 5,
        perPageOptions: [5, 10],
        onPageChange: (index) => {
          pages.push(index);
        },
      })
    );
    assert.ok(Boolean(pager(root)), 'one record past the page draws the pager');
    assert.ok(
      tableIn(root).parentElement.nextElementSibling === pager(root),
      'the pager follows the scroll container rather than scrolling with the rows'
    );
    root.querySelector('[data-pagination-next]').click();
    assert.deepEqual(pages, [1]);
    harness.remount();
    // The pager hides only when everything fits the SMALLEST page, so a reader who chose a size
    // that holds the whole list can still choose a smaller one.
    root = await harness.mount(base({ rows: rowsOf(6), perPage: 10, perPageOptions: [5, 10] }));
    assert.ok(Boolean(pager(root)), 'six records on one page of ten still offer the page of five');
  });

  it('offers the caller`s page sizes and hands a chosen one back', async () => {
    const sizes = [];
    const root = await harness.mount(
      base({
        rows: rowsOf(5),
        count: 12,
        perPage: 10,
        perPageOptions: [5, 10],
        onPerPageChange: (size) => {
          sizes.push(size);
        },
      })
    );
    chooseSelectOption(root, '[data-pagination-size]', 5);
    assert.deepEqual(sizes, [5]);
  });

  it('marks the selected row by class alone, never focusable, and selects on a pointer click', async () => {
    const picked = [];
    const acted = [];
    const root = await harness.mount(
      base({
        selectedKey: 'r2',
        onSelectRow: (row) => {
          picked.push(row.id);
        },
        rowData: (row) => ({ 'data-probe-row': row.id }),
        rowAction: (node, row) => {
          acted.push([node.tagName, row.id]);
        },
      })
    );
    const rows = bodyRows(root);
    assert.deepEqual(
      rows.map((row) => [row.dataset.probeRow, row.classList.contains('is-selected')]),
      [
        ['r1', false],
        ['r2', true],
        ['r3', false],
      ]
    );
    assert.ok(!root.querySelector('tr[tabindex]'), 'no row takes focus');
    assert.ok(!root.querySelector('tr[aria-selected]'), 'the class is the one selection carrier');
    assert.deepEqual(acted, [
      ['TR', 'r1'],
      ['TR', 'r2'],
      ['TR', 'r3'],
    ]);
    rows[2].click();
    assert.deepEqual(picked, ['r3']);
    assert.ok(root.querySelector('.fabricate-data-table').classList.contains('is-selectable'));
  });

  it('selects a row when focus enters a control in it, and not again inside the selected row', async () => {
    const picked = [];
    const control = createRawSnippet((row) => ({
      render: () => `<button type="button" data-probe-control="${row().id}">Edit</button>`,
    }));
    const root = await harness.mount(
      base({
        cell: control,
        selectedKey: 'r1',
        onSelectRow: (row) => {
          picked.push(row.id);
        },
      })
    );
    const focusIn = (id) =>
      root
        .querySelector(`[data-probe-control="${id}"]`)
        .dispatchEvent(new globalThis.FocusEvent('focusin', { bubbles: true }));
    focusIn('r2');
    focusIn('r1');
    assert.deepEqual(
      picked,
      ['r2'],
      'tabbing into row 2 selects it; the selected row 1 is not re-picked'
    );
    assert.ok(!root.querySelector('tr[tabindex]'), 'and still no row takes focus itself');
  });

  it('selects nothing in a table that is not selectable, and matches no row to an empty key', async () => {
    const root = await harness.mount(
      base({ rows: [{ id: '', name: 'Blank', qty: 0 }], selectedKey: '', rowData: () => null })
    );
    const [only] = bodyRows(root);
    assert.ok(!only.classList.contains('is-selected'), 'an empty selectedKey selects no row');
    assert.ok(!root.querySelector('.fabricate-data-table').classList.contains('is-selectable'));
    assert.equal(only.getAttributeNames().join(' '), 'class', 'a null rowData spreads nothing');
  });

  it('draws a cell from its column key when no cell snippet is given, and names a header by its ariaLabel', async () => {
    const columns = [{ ...COLUMNS[0], label: '#', ariaLabel: 'Drop rank' }, COLUMNS[1]];
    const root = await harness.mount(base({ columns }));
    assert.deepEqual(
      [...bodyRows(root)[1].children].map((cellNode) => cellNode.textContent.trim()),
      ['Row 2', '1']
    );
    const [rank, qty] = root.querySelectorAll(':scope thead th');
    assert.equal(rank.getAttribute('aria-label'), 'Drop rank');
    assert.ok(!qty.hasAttribute('aria-label'), 'a header with a visible name takes no aria-label');
  });

  it('keeps each row`s node with its key when the rows reorder', async () => {
    const rows = rowsOf(3);
    const root = await harness.mount(base({ rows }));
    const [first, , third] = bodyRows(root);
    await harness.setProps({ rows: rows.toReversed() });
    const after = bodyRows(root);
    assert.ok(
      after[0] === third && after[2] === first,
      'the keyed rows move rather than re-render'
    );
  });

  it('keeps its caption and drops the header row when empty, saying what would fill it', async () => {
    const action = createRawSnippet(() => ({
      render: () => '<button data-probe-add="">Add</button>',
    }));
    const root = await harness.mount(
      base({
        rows: [],
        empty: {
          icon: 'fas fa-gift',
          title: 'No crafts yet.',
          hint: 'Craft one to log it.',
          action,
        },
      })
    );
    assert.equal(nameOf(root, tableIn(root)), 'Crafts 0');
    assert.ok(!root.querySelector('thead'), 'no column head above no rows');
    assert.match(root.querySelector('tbody').textContent, /No crafts yet\./);
    assert.match(root.querySelector('tbody').textContent, /Craft one to log it\./);
    assert.ok(
      Boolean(root.querySelector(':scope tbody i.fa-gift')),
      'the empty panel keeps its icon'
    );
    assert.equal(
      root.querySelector('.fabricate-data-table-status').getAttribute('colspan'),
      String(COLUMNS.length),
      'the panel spans every column'
    );
    assert.ok(
      Boolean(root.querySelector(':scope tbody [data-probe-add]')),
      'the way out is in the panel'
    );
  });

  it('states loading and an error in place of the rows', async () => {
    let root = await harness.mount(base({ loading: true }));
    assert.equal(tableIn(root).getAttribute('aria-busy'), 'true');
    assert.ok(Boolean(root.querySelector(':scope tbody [role="status"]')));
    assert.equal(bodyRows(root).length, 0);
    harness.remount();
    root = await harness.mount(base({ error: 'The history could not load' }));
    assert.equal(
      root.querySelector(':scope tbody [role="alert"]').textContent,
      'The history could not load'
    );
    harness.remount();
    root = await harness.mount(base({ loading: true, error: 'The last load failed' }));
    assert.ok(
      Boolean(root.querySelector(':scope tbody [role="status"]')),
      'a reload states loading'
    );
    assert.ok(!root.querySelector(':scope tbody [role="alert"]'), 'over the error it replaces');
  });

  it('sorts only a sortable column, through a focusable header button', async () => {
    const sorts = [];
    const columns = [{ ...COLUMNS[0], sortable: true }, COLUMNS[1]];
    const root = await harness.mount(
      base({
        columns,
        sort: { key: 'name', dir: 'asc' },
        onSort: (next) => {
          sorts.push(next);
        },
      })
    );
    const [name, qty] = root.querySelectorAll(':scope thead th');
    assert.equal(name.getAttribute('aria-sort'), 'ascending');
    assert.ok(!qty.hasAttribute('aria-sort'), 'a plain header claims no sort');
    assert.ok(!qty.querySelector('button'), 'nor looks sortable');
    const button = name.querySelector('button');
    assert.equal(button.dataset.keyboardFocus, 'true');
    button.click();
    assert.deepEqual(sorts, [{ key: 'name', dir: 'desc' }]);
  });
});
