/** Issue 1782 — the library's `<DataTable>`: a captioned table, its rows, its pager and its states. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
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

  it('keeps its caption and drops the header row when empty, saying what would fill it', async () => {
    const action = createRawSnippet(() => ({
      render: () => '<button data-probe-add="">Add</button>',
    }));
    const root = await harness.mount(
      base({ rows: [], empty: { icon: 'fas fa-gift', title: 'No crafts yet.', action } })
    );
    assert.equal(nameOf(root, tableIn(root)), 'Crafts 0');
    assert.ok(!root.querySelector('thead'), 'no column head above no rows');
    assert.match(root.querySelector('tbody').textContent, /No crafts yet\./);
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
