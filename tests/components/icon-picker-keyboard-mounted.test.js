/**
 * THE ICON PICKER KEEPS DOM FOCUS ON ONE ELEMENT (issue 1503).
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
 * `tests/helpers/listboxKeyboardDriver.js`. `icon-picker-mounted.test.js` owns this component's
 * SELECTION semantics — which row is current for an aliased or retired stored value.
 *
 * What is specific to THIS component is the PINNED ROW. The list is 750 rows long and the row the
 * stored value resolves to is rendered once at the TOP, outside the alphabetical `each`. The
 * cursor and the option `id`s are therefore numbered over the FLAT RENDERED order — the pinned
 * row first, then the alphabetical remainder — and this suite is what proves it: an index that
 * counted only the `each` would put row 0's id on the second row a GM sees, so
 * `aria-activedescendant` would name one row while another drew the cursor.
 */

import assert from 'node:assert/strict';
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
  placeCaret,
  typeQuery,
} from '../helpers/listboxKeyboardDriver.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ICON_PICKER = 'src/ui/svelte/components/IconPicker.svelte';

/** A query narrowing the 750-row vocabulary to four rows, so a wrap costs six presses not 751. */
const FOUR_ROW_QUERY = 'bolt';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-picker-keyboard-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  // The picker renders through the shared primitive, which renders `Chip` and `EmptyState`
  // (issue 1503). Omitting any of the three does not FAIL this suite — the closure validator
  // throws in `before()` and `node --test` reports every test here as `# cancelled`.
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    ICON_PICKER,
  ],
  componentPath: ICON_PICKER,
});

const chosen = [];

before(harness.setup);
after(() => harness.teardown());
afterEach(() => harness.remount());

/** The picker's own trigger, which is the element focus must return to on close. */
const trigger = (root) => root.querySelector('.essence-icon-picker-trigger');

/** The holder: the panel's query field, which is where DOM focus stays for the panel's whole life. */
const holderOf = (root) => root.querySelector(':scope .essence-icon-picker-search input');

/** Open the panel and settle the focus move onto the query field. */
async function openPanel(props = {}) {
  const root = await harness.mount({
    value: 'fas fa-crown',
    onChange: (iconClass) => {
      chosen.push(iconClass);
    },
    ...props,
  });
  trigger(root).click();
  flushSync();
  await settle();
  const panel = root.querySelector('.fabricate-icon-picker-popover');
  assert.ok(Boolean(panel), 'clicking the trigger opens the panel');
  return { root, panel };
}

/**
 * Open the panel and narrow it to four rows.
 *
 * Narrowing is not a shortcut around the pinned row — the case below addresses that directly —
 * it is what makes a WRAP affordable: the unfiltered list is 750 rows, so proving the ring closes
 * would otherwise cost 751 synthesized keydowns per case.
 */
async function openFourRowPanel() {
  const { root, panel } = await openPanel();
  typeQuery(holderOf(panel), FOUR_ROW_QUERY);
  const rows = optionRows(panel);
  assert.equal(rows.length, 4, `"${FOUR_ROW_QUERY}" narrows the vocabulary to four rows`);
  return { root, panel, rows };
}

describe('1503 IconPicker — the listbox focus model', () => {
  it('holds focus on the query field and announces the row the cursor is on', async () => {
    const { panel, rows } = await openFourRowPanel();
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

    assert.deepEqual(
      announceAcross({ holder, key: 'ArrowDown', presses: 6 }),
      [0, 1, 2, 3, 0, 1].map((index) => rows[index].id),
      'the cursor advances one row per press and wraps, while focus never moves'
    );
    assert.deepEqual(
      markedRows(panel).map((row) => row.id),
      [rows[1].id],
      'exactly one row is marked, and it is the one the holder names'
    );
  });

  it('leaves the whole list unmarked until the first arrow key', async () => {
    const { panel } = await openFourRowPanel();
    assertRestingList(panel, holderOf(panel));
  });

  it('numbers the cursor over the FLAT rendered order, pinned row first', async () => {
    const { panel } = await openPanel({ value: 'fas fa-crown' });
    const holder = holderOf(panel);
    const rows = optionRows(panel);

    assert.equal(rows.length, 750, 'the whole vocabulary is drawn: the pinned row plus 749 others');
    assert.ok(
      rows[0].classList.contains('pinned'),
      'the row the stored value resolves to is rendered ONCE at the top, outside the `each`'
    );
    assert.equal(rows[0].title, 'Crown', 'and it is the stored value, not the alphabetical first');
    assert.equal(
      new Set(rows.map((row) => row.id)).size,
      rows.length,
      'the pinned row and the alphabetical remainder are numbered over ONE sequence, so no two ' +
        'rows share a DOM id — an index counted per branch would give the pinned row and the ' +
        'first listed row the same id, and `aria-activedescendant` would be ambiguous'
    );

    pressKey('ArrowDown');
    assert.equal(
      activeDescendant(holder),
      rows[0].id,
      'entering the list lands on the PINNED row, because it is index 0 of the flat rendered ' +
        'order — an index counted over the `each` alone would put id 0 on the second row a GM sees'
    );
    assert.deepEqual(
      markedRows(panel).map((row) => row.title),
      ['Crown'],
      'and the row that draws the cursor is the row the holder named'
    );

    pressKey('ArrowUp');
    assert.equal(
      activeDescendant(holder),
      rows[749].id,
      'ArrowUp off the pinned row wraps to the LAST row of the alphabetical remainder'
    );
  });

  it('reaches the ends with Home and End and leaves a typed character alone', async () => {
    const { panel, rows } = await openFourRowPanel();
    const holder = holderOf(panel);

    // HOME AND END ARE THE CARET'S FIRST, and this picker is where that matters most: its query
    // field is the one a GM types a whole icon name into, so the keys that jump to the ends of
    // that text cannot be taken unconditionally. The component hands each of them to the cursor
    // only from the edge at which the caret would not move — so after typing, End (the caret is
    // already at the end of `bolt`) is the list's, and Home is not until the caret is at 0.
    pressKey('End');
    assert.equal(activeDescendant(holder), rows[3].id, 'End reaches the last row');

    const kept = pressKey('Home');
    assert.ok(
      !kept.defaultPrevented,
      'with the caret at the end of a typed query, Home is how a GM gets back to the start of ' +
        'what they typed — taking it would leave the field with no way to reach its own start'
    );
    assert.equal(activeDescendant(holder), rows[3].id, 'and the cursor did not move either');

    placeCaret(holder, 0);
    pressKey('Home');
    assert.equal(activeDescendant(holder), rows[0].id, 'Home reaches the first');

    const typed = pressKey('c');
    assert.ok(
      !typed.defaultPrevented,
      'a printable character belongs to the query field; consuming it would make the search ' +
        'field unusable while the panel is open'
    );
    assert.ok(globalThis.document.activeElement === holder, 'focus is still on the holder');
  });

  it('drops the cursor when the query rebuilds the list', async () => {
    const { panel, rows } = await openFourRowPanel();
    const holder = holderOf(panel);

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    assert.equal(activeDescendant(holder), rows[1].id, 'the cursor is on row 2');

    typeQuery(holder, 'crown');
    assert.deepEqual(
      optionRows(panel).map((row) => row.title),
      ['Crown'],
      'the query rebuilt the list, so index 1 does not even exist in it any more'
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
    const { root, panel, rows } = await openFourRowPanel();
    const holder = holderOf(panel);

    const ignored = pressKey('Enter');
    assert.deepEqual(chosen, [], 'Enter with no cursor must not choose the first row for the GM');
    assert.ok(
      !ignored.defaultPrevented,
      'an Enter this widget does not act on is left to the field it was pressed in'
    );
    assert.ok(
      Boolean(root.querySelector('.fabricate-icon-picker-popover')),
      'and the panel stays open, because nothing was chosen'
    );

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    assert.equal(activeDescendant(holder), rows[1].id);
    const acted = pressKey('Enter');
    assert.ok(acted.defaultPrevented, 'the Enter that chooses is consumed');
    assert.deepEqual(
      chosen,
      ['fas fa-bolt-lightning'],
      'Enter chooses the row the holder was naming'
    );
  });

  it('suppresses the pointer default so a click chooses without moving focus', async () => {
    chosen.length = 0;
    const { panel, rows } = await openFourRowPanel();

    assertPointerSuppressed(rows[1], holderOf(panel));

    rows[1].click();
    flushSync();
    assert.deepEqual(chosen, ['fas fa-bolt-lightning'], 'and the click still chooses');
  });

  it('returns focus to the trigger when the panel closes', async () => {
    const { root, panel } = await openPanel();
    assert.ok(
      globalThis.document.activeElement === holderOf(panel),
      'focus is on the query field before the close'
    );

    pressKey('Escape');
    await settle();
    assert.ok(
      !root.querySelector('.fabricate-icon-picker-popover'),
      'Escape closes the panel — `dismissOnOutsideClick` takes it at the document capture phase'
    );
    assert.ok(
      globalThis.document.activeElement === trigger(root),
      'and focus lands back on the control the GM opened, not on the document body: the query ' +
        'field it was on has just been unmounted, so without a restore focus falls to <body> ' +
        'and Tab restarts from the top of the sheet'
    );
  });

  it('names no row when the query matches nothing, and leaves the arrows to the field', async () => {
    const { panel } = await openPanel();
    const holder = holderOf(panel);

    typeQuery(holder, 'zzzzz');
    assert.equal(optionRows(panel).length, 0, 'nothing matched, so no rows');
    assert.ok(
      Boolean(panel.querySelector('.manager-travel-popover-empty')),
      'the shared empty branch renders where the rows would have been'
    );
    assert.equal(
      holder.getAttribute('aria-activedescendant'),
      null,
      'a holder cannot name a row when there is no row to name'
    );
    // THE LIST ELEMENT IS GONE, NOT MERELY EMPTY, since the picker was re-platformed onto the
    // shared primitive: the empty note is a SIBLING of the `role="listbox"` box rather than a
    // child of it, because a listbox's only valid children are its options. So the holder drops
    // `aria-controls` too — an `aria-controls` pointing at an id that resolves to no element is a
    // defect, and it is conditioned on exactly the predicate the list is.
    assert.ok(
      !panel.querySelector('[role="listbox"]'),
      'the list is replaced by the note, not filled with it'
    );
    assert.equal(
      holder.getAttribute('aria-controls'),
      null,
      'and the holder controls nothing while there is no list element to control'
    );

    const inert = pressKey('ArrowDown');
    assert.ok(
      !inert.defaultPrevented,
      'with nothing to move a cursor over, the arrows are left to the field'
    );
    assert.ok(globalThis.document.activeElement === holder, 'focus is still on the holder');
  });
});
