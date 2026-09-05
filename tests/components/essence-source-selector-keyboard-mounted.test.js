/**
 * THE SOURCE PICKER KEEPS DOM FOCUS ON ONE ELEMENT (issue 1503).
 *
 * `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element —
 * the HOLDER — and drive selection with `aria-activedescendant`, and forbids roving focus onto
 * the option rows because it re-arms Foundry's canvas bindings: with focus on a row, Space pauses
 * the game and the arrows pan the map behind the open window. There is a second, independent
 * reason the rows must not take focus, and it is visual: `styles/fabricate.css` rings any focused
 * `[tabindex]` under `.fabricate` with a 2px accent outline at a POSITIVE offset
 * (`.fabricate [tabindex]:focus-visible`), and every option row is now a `[tabindex]` element, so
 * a row that took focus would draw a competing ring around the keyboard cursor's own inset one.
 *
 * ── WHY THIS PICKER'S OWN SUITE, AND WHAT ONLY IT CAN SHOW ───────────────────────────────────
 * The arithmetic is proved in `tests/util/listbox-navigation.test.js` against the pure module,
 * with no compile and no DOM; the shared driver these cases run through lives in
 * `tests/helpers/listboxKeyboardDriver.js`. What is specific to THIS component is the GRID: its
 * panel is drawn `grid-template-columns: repeat(2, minmax(0, 1fr))`, so the vertical arrows must
 * step by TWO and the horizontal ones must mean something at all — a single-column key map would
 * make ArrowDown walk across the visual row rather than down the column the GM is reading.
 *
 * Five items in two columns is deliberate: it leaves a RAGGED last row, which a rectangular wrap
 * would strand and a flat-order wrap reaches.
 *
 * `EssenceSourceSelector`'s panel appears in NO View Lab case (`scripts/lib/viewLabCases.js`
 * records that `.essence-source-trigger` is in no case's steps), so this suite is the only
 * instrument that sees the panel's DOM at all.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  activeDescendant,
  announceAcross,
  assertPointerSuppressed,
  assertRestingList,
  markedRows,
  optionRows,
  pressKey,
  settle,
  typeQuery,
} from '../helpers/listboxKeyboardDriver.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SOURCE_SELECTOR = 'src/ui/svelte/components/EssenceSourceSelector.svelte';

/** Five, so two columns leave a ragged last row of one. */
const ITEMS = Object.freeze([
  { id: 'ore', name: 'Iron Ore', img: 'icons/commodities/metal/ingot-stack-steel.webp' },
  { id: 'bark', name: 'Ash Bark', img: 'icons/commodities/wood/bark-brown.webp' },
  { id: 'cloth', name: 'Linen Cloth', img: 'icons/commodities/cloth/cloth-bolt-white.webp' },
  { id: 'salt', name: 'Rock Salt', img: 'icons/commodities/gems/powder-white.webp' },
  { id: 'wax', name: 'Bees Wax', img: 'icons/commodities/materials/wax-yellow.webp' },
]);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-source-selector-keyboard-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [SOURCE_SELECTOR],
  componentPath: SOURCE_SELECTOR,
});

const chosen = [];

/**
 * The column count the SHEET draws this panel at, read rather than restated.
 *
 * The component's key map has to know how many columns the grid has — that is what makes
 * ArrowDown step down the column the GM is reading instead of sideways — so the count is a MIRROR
 * of `styles/fabricate.css`, and a mirror rots silently. Reading the sheet here and measuring the
 * cursor's real step against it is what makes a future re-tile of the panel fail this suite
 * instead of quietly transposing the arrow keys.
 */
function sheetGridColumns() {
  const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
  const rule = sheet.match(
    /\.fabricate-source-picker-popover \.essence-source-picker-grid \{([^}]*)\}/g
  );
  assert.ok(rule, 'the sheet still has a rule for the source picker grid');
  const template = rule
    .map((block) => block.match(/grid-template-columns:\s*repeat\((\d+),/))
    .find(Boolean);
  assert.ok(template, 'and one of its blocks declares a repeated column template');
  return Number(template[1]);
}

before(harness.setup);
after(() => harness.teardown());
afterEach(() => harness.remount());

const mountSelector = (props) =>
  harness.mount({
    items: ITEMS,
    onSelect: (id) => {
      chosen.push(id);
    },
    ...props,
  });

/** The picker's own trigger, which is the element focus must return to on close. */
const trigger = (root) => root.querySelector('.essence-source-trigger');

/** The holder: the panel's query field, which is where DOM focus stays for the panel's whole life. */
const holderOf = (root) => root.querySelector(':scope .essence-source-picker-search input');

/** Open the panel and settle the focus move onto the query field. */
async function openPanel(props) {
  const root = await mountSelector(props);
  trigger(root).click();
  flushSync();
  await settle();
  const panel = root.querySelector('.fabricate-source-picker-popover');
  assert.ok(Boolean(panel), 'clicking the trigger opens the panel');
  return { root, panel };
}

describe('1503 EssenceSourceSelector — the listbox focus model', () => {
  it('holds focus on the query field and announces the row the cursor is on', async () => {
    const { panel } = await openPanel({});
    const holder = holderOf(panel);

    assert.ok(
      globalThis.document.activeElement === holder,
      'the query field takes focus on open, so it is the element the arrows are pressed on'
    );
    assert.equal(holder.getAttribute('role'), 'combobox');
    assert.equal(
      holder.getAttribute('aria-controls'),
      panel.querySelector('[role="listbox"]').id,
      'the holder points at the list it drives, and that id resolves to a rendered element'
    );
    assert.equal(holder.getAttribute('aria-expanded'), 'true');

    const rows = optionRows(panel);
    assert.equal(rows.length, 5, 'five items, so two columns leave a ragged last row of one');

    const announced = announceAcross({ holder, key: 'ArrowDown', presses: 6 });
    assert.deepEqual(
      announced,
      [0, 2, 4, 1, 3, 0].map((index) => rows[index].id),
      'ArrowDown steps down a COLUMN — two cells in a two-column grid — and wraps over the flat ' +
        'order, which is what keeps the ragged last row reachable'
    );
    assert.deepEqual(
      markedRows(panel).map((row) => row.id),
      [rows[0].id],
      'exactly one row is marked, and it is the one the holder names'
    );
  });

  it('leaves the whole list unmarked until the first arrow key', async () => {
    const { panel } = await openPanel({});
    assertRestingList(panel, holderOf(panel));
  });

  it('steps the vertical arrows by as many cells as the sheet draws columns', async () => {
    const columns = sheetGridColumns();
    assert.equal(columns, 2, 'the sheet still draws this panel in two columns');

    const { panel } = await openPanel({});
    const holder = holderOf(panel);
    const rows = optionRows(panel);

    pressKey('ArrowDown');
    assert.equal(activeDescendant(holder), rows[0].id, 'entering the grid lands on the first tile');
    pressKey('ArrowDown');
    assert.equal(
      activeDescendant(holder),
      rows[columns].id,
      'one ArrowDown moves by exactly one ROW, which is `columns` cells — a key map that had ' +
        'drifted from the sheet would move the cursor sideways to the tile beside it'
    );
  });

  it('moves one cell across the row with the horizontal arrows', async () => {
    const { panel } = await openPanel({});
    const holder = holderOf(panel);
    const rows = optionRows(panel);

    assert.deepEqual(
      announceAcross({ holder, key: 'ArrowRight', presses: 3 }),
      [rows[0].id, rows[1].id, rows[2].id],
      'a two-column grid has a horizontal axis, and ArrowRight moves one CELL along it'
    );
    assert.deepEqual(
      announceAcross({ holder, key: 'ArrowLeft', presses: 2 }),
      [rows[1].id, rows[0].id],
      'and ArrowLeft comes back the same way'
    );
  });

  it('reaches the ends with Home and End and leaves a typed character alone', async () => {
    const { panel } = await openPanel({});
    const holder = holderOf(panel);
    const rows = optionRows(panel);

    pressKey('End');
    assert.equal(activeDescendant(holder), rows[4].id, 'End reaches the last row');
    pressKey('Home');
    assert.equal(activeDescendant(holder), rows[0].id, 'Home reaches the first');

    const typed = pressKey('l');
    assert.ok(
      !typed.defaultPrevented,
      'a printable character belongs to the query field; consuming it would make the search ' +
        'field unusable while the panel is open'
    );
    assert.ok(globalThis.document.activeElement === holder, 'focus is still on the holder');
  });

  it('drops the cursor when the query rebuilds the list', async () => {
    const { panel } = await openPanel({});
    const holder = holderOf(panel);

    pressKey('ArrowRight');
    pressKey('ArrowRight');
    assert.equal(activeDescendant(holder), optionRows(panel)[1].id, 'the cursor is on row 2');

    typeQuery(holder, 'a');
    assert.deepEqual(
      optionRows(panel).map((row) => row.title),
      ['Ash Bark', 'Rock Salt', 'Bees Wax'],
      'the query rebuilt the list, so index 1 now names a different item than it did'
    );
    assert.deepEqual(
      markedRows(panel).map((row) => row.id),
      [],
      'index 1 in the OLD list is not a cursor position in the new one, so there is no cursor'
    );
    assert.equal(activeDescendant(holder), null);
  });

  it('does nothing on Enter until a row is active, then chooses that row', async () => {
    chosen.length = 0;
    const { root, panel } = await openPanel({});
    const holder = holderOf(panel);

    const ignored = pressKey('Enter');
    assert.deepEqual(chosen, [], 'Enter with no cursor must not choose the first row for the GM');
    assert.ok(
      !ignored.defaultPrevented,
      'an Enter this widget does not act on is left to the field it was pressed in'
    );
    assert.ok(
      Boolean(root.querySelector('.fabricate-source-picker-popover')),
      'and the panel stays open, because nothing was chosen'
    );

    pressKey('ArrowRight');
    pressKey('ArrowRight');
    assert.equal(activeDescendant(holder), optionRows(panel)[1].id);
    const acted = pressKey('Enter');
    assert.ok(acted.defaultPrevented, 'the Enter that chooses is consumed');
    assert.deepEqual(chosen, ['bark'], 'Enter chooses the row the holder was naming');
  });

  it('suppresses the pointer default so a click chooses without moving focus', async () => {
    chosen.length = 0;
    const { panel } = await openPanel({});
    const row = optionRows(panel)[1];

    assertPointerSuppressed(row, holderOf(panel));

    row.click();
    flushSync();
    assert.deepEqual(chosen, ['bark'], 'and the click still chooses');
  });

  it('returns focus to the trigger when the panel closes', async () => {
    const { root, panel } = await openPanel({});
    assert.ok(
      globalThis.document.activeElement === holderOf(panel),
      'focus is on the query field before the close'
    );

    pressKey('Escape');
    await settle();
    assert.ok(
      !root.querySelector('.fabricate-source-picker-popover'),
      'Escape closes the panel — `dismissOnOutsideClick` takes it at the document capture phase'
    );
    assert.ok(
      globalThis.document.activeElement === trigger(root),
      'and focus lands back on the control the GM opened, not on the document body: the query ' +
        'field it was on has just been unmounted, so without a restore focus falls to <body> ' +
        'and Tab restarts from the top of the sheet'
    );
  });

  it('marks the stored item as the current value without making it the cursor', async () => {
    const { panel } = await openPanel({ value: { id: 'cloth', name: 'Linen Cloth' } });

    assert.deepEqual(
      optionRows(panel)
        .filter((row) => row.getAttribute('aria-selected') === 'true')
        .map((row) => row.title),
      ['Linen Cloth'],
      'exactly one row is the current value, and it is the row whose id matches the stored item'
    );
    assert.deepEqual(
      markedRows(panel).map((row) => row.id),
      [],
      'the CURRENT VALUE and the KEYBOARD CURSOR are different states: opening on a stored item ' +
        'does not put the cursor anywhere'
    );
  });

  it('names no row when the list is empty, and leaves the arrows to the field', async () => {
    const { panel } = await openPanel({ items: [] });
    const holder = holderOf(panel);

    assert.equal(optionRows(panel).length, 0, 'no items, so no rows');
    assert.ok(
      Boolean(panel.querySelector('.essence-source-picker-empty')),
      'the empty note renders in the list the rows would have filled'
    );
    assert.equal(
      holder.getAttribute('aria-activedescendant'),
      null,
      'a holder cannot name a row when there is no row to name'
    );
    assert.equal(
      holder.getAttribute('aria-controls'),
      panel.querySelector('[role="listbox"]').id,
      'the list ELEMENT still renders here — the note is drawn inside it — so `aria-controls` ' +
        'still resolves to a rendered element'
    );

    const inert = pressKey('ArrowDown');
    assert.ok(
      !inert.defaultPrevented,
      'with nothing to move a cursor over, the arrows are left to the field'
    );
    assert.ok(globalThis.document.activeElement === holder, 'focus is still on the holder');
  });
});
