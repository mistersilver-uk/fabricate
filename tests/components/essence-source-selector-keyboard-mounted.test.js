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
 *
 * ── WHAT THIS SUITE ANSWERS FOR AFTER THE RE-PLATFORM (issue 1503) ─────────────────────
 * The panel, the query field, the list and every tile are now `SearchablePopover`'s elements, and
 * this component supplies a `trigger` snippet, an `option` snippet and its own class family. Three
 * things follow that only a mounted DOM can see, and each has its own case below.
 *
 *   1. THE TRIGGER SURVIVES THE SPREAD. The caller spreads the primitive's `attributes` LAST, so
 *      its own `aria-label`, `title` and `disabled` are the ones a defect would erase: Svelte's
 *      `set_attributes` REMOVES an attribute whose spread value is `undefined`, and a spread
 *      `disabled: false` would override a caller's `disabled={true}` mid-save. The primitive omits
 *      both classes of key; these cases are the runtime net for that, because a source read of the
 *      snippet cannot see an attribute erased at render time.
 *   2. THE LIST'S FORM IS EMITTED, not styled inline: `data-picker-as="grid"` and
 *      `data-picker-columns="2"` on the `role="listbox"` element, because `anchoredPopover`
 *      rewrites the list's whole `style` attribute on every measure. The sheet paints the grid
 *      from those attributes, and the class lists below are what lets it.
 *   3. THE MARKED ROW IS THE STORED ONE, which depends on `value={value?.id}` reaching the
 *      primitive — it marks with `option.id === value`, so without the mapping
 *      `[aria-selected='true']` matches nothing in a panel no frame photographs.
 *
 * What this suite CANNOT answer for: anything needing a resolved cascade. The harness compiles with
 * `css: 'injected'` and never loads `styles/fabricate.css` (`tests/helpers/scoped-component-css.js`
 * records that happy-dom cannot compute a cascade), and happy-dom returns zero-sized rects, so no
 * inline panel width is ever written here. The width band is read from the source instead, and the
 * sheet's own `max-width` is `icon-picker-layout.test.js`'s to read.
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
  compiledModules: [
    // The primitive this component now renders, plus the two import-free leaves it renders
    // itself. A `.svelte` the mounted tree reaches but the harness omits does not fail — the
    // closure validator throws in `before()` and `node --test` reports `# cancelled`.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    SOURCE_SELECTOR,
  ],
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

/**
 * The two trigger labels, by key rather than by sentence.
 *
 * The harness's `localize` returns the key it is handed, so a rendered label IS its key here —
 * which is what makes these assertions read the component's choice of string rather than a
 * translation. `ChangeSourceItem` carries the stored item's name after it, because a trigger whose
 * value is an IMAGE has no other way to say which item it is holding.
 */
const CHANGE_KEY = 'FABRICATE.Admin.Features.Essences.ChangeSourceItem';
const DROP_OR_PICK_KEY = 'FABRICATE.Admin.Features.Essences.DropOrPickSourceItem';

/** A node's authored classes, with Svelte's per-component scope hash removed. */
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

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

  it('names no row when the list is empty, and leaves the arrows to the field', async () => {
    const { panel } = await openPanel({ items: [] });
    const holder = holderOf(panel);

    assert.equal(optionRows(panel).length, 0, 'no items, so no rows');
    assert.equal(
      holder.getAttribute('aria-activedescendant'),
      null,
      'a holder cannot name a row when there is no row to name'
    );
    assert.equal(
      holder.getAttribute('aria-controls'),
      null,
      'and it controls nothing either: the primitive renders NO `role="listbox"` element in the ' +
        'empty branch, so an `aria-controls` naming one would point at an id that resolves to ' +
        'nothing — which is worse than omitting it'
    );
    assert.ok(
      !panel.querySelector('[role="listbox"]'),
      'the list element itself is absent, which is the structural half of the empty re-platform'
    );

    const inert = pressKey('ArrowDown');
    assert.ok(
      !inert.defaultPrevented,
      'with nothing to move a cursor over, the arrows are left to the field'
    );
    assert.ok(globalThis.document.activeElement === holder, 'focus is still on the holder');
  });

  // ── THE TWO EMPTINESSES, AND WHERE THE NOTE NOW SITS (issue 1503) ───────────────────────
  //
  // A catalogue that holds nothing and a query that matched nothing are different facts, and this
  // component always had two sentences for them — but it drew both as a `<p class="hint">` INSIDE
  // its two-column grid, so the note rendered at roughly HALF the panel's width and reached
  // `.fabricate-manager .hint` for its colour, which draws nothing at all outside the manager.
  // The primitive's `EmptyState note` replaces both: one quiet line, full panel width, in a
  // `role="status"` region that is a SIBLING of the list rather than a non-`option` child of a
  // `role="listbox"`.
  it('says the catalogue is empty when nothing is authored, across the whole panel', async () => {
    const { panel } = await openPanel({ items: [] });

    const note = panel.querySelector('.manager-travel-popover-empty');
    assert.ok(Boolean(note), 'the empty branch renders the note region the primitive owns');
    assert.ok(
      !panel.querySelector('.essence-source-picker-empty'),
      'and the `<p class="hint">` it replaces is gone, with it the `.fabricate-manager .hint` ' +
        'colour this shared component could only read inside the manager'
    );
    assert.equal(note.getAttribute('role'), 'status');
    assert.equal(
      note.getAttribute('aria-live'),
      'polite',
      'the region announces itself as the GM types, because its CONTENT is what changes'
    );
    assert.ok(
      authoredClasses(note.parentElement).includes('manager-travel-popover'),
      'the note is a child of the PANEL, not of the two-column grid it used to render at half ' +
        `the width of: ${authoredClasses(note.parentElement).join(' ')}`
    );
    assert.ok(
      authoredClasses(note.querySelector('.manager-empty')).includes('is-note'),
      'and it is the NOTE variant rather than the dashed hero, which is the shared treatment'
    );
    assert.match(
      note.textContent.replace(/\s+/g, ' ').trim(),
      /NoComponentsAvailable/,
      'an unfiltered emptiness gets the sentence about the SYSTEM, through `emptyHint`'
    );
  });

  it('says nothing matched when a query empties an authored catalogue', async () => {
    const { panel } = await openPanel({});
    typeQuery(holderOf(panel), 'zzzz');

    const note = panel.querySelector('.manager-travel-popover-empty');
    assert.ok(Boolean(note), 'a filtered-to-nothing grid renders the same note region');
    const line = note.textContent.replace(/\s+/g, ' ').trim();
    assert.match(
      line,
      /NoMatchingComponents/,
      'a filtered emptiness gets the sentence about the QUERY, through `noMatchesHint`'
    );
    assert.ok(
      !line.includes('NoComponentsAvailable'),
      'a GM who typed a query into a system holding five components must not be told the system ' +
        `holds none: ${line}`
    );
  });

  // ── CRITERION 1: THE TRIGGER SURVIVES THE SPREAD ────────────────────────────────────────
  //
  // These two cases are the RUNTIME net for the primitive's omission rule, and they are mounted
  // rather than source-read for a reason the source cannot see: the caller spreads `attributes`
  // LAST, so an `aria-label: undefined` key in that object would REMOVE the label the snippet
  // wrote, and a `disabled: false` key would override a caller's `disabled={true}`. Both are
  // invisible to a reader of this component's markup and to the compiler.
  it('keeps the accessible name the snippet wrote, after the primitive spread', async () => {
    const stored = await mountSelector({ value: { id: 'cloth', name: 'Linen Cloth' } });
    const holding = trigger(stored);
    assert.equal(
      holding.getAttribute('aria-label'),
      `${CHANGE_KEY}: Linen Cloth`,
      'the trigger of a picker HOLDING an item names the item, because its value is an image ' +
        'and has no other voice'
    );
    assert.equal(
      holding.getAttribute('title'),
      `${CHANGE_KEY}: Linen Cloth`,
      'and the tooltip says the same thing, which is what `manager-mounted.test.js` reads on the ' +
        'icon picker side of this same rule'
    );

    // The primitive's own contract arrived through the same spread, which is what proves the
    // spread ran at all rather than the assertions above passing on an un-spread button.
    assert.equal(holding.getAttribute('type'), 'button');
    assert.equal(holding.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(holding.getAttribute('aria-expanded'), 'false');

    harness.remount();
    const empty = await mountSelector({});
    assert.equal(
      trigger(empty).getAttribute('aria-label'),
      DROP_OR_PICK_KEY,
      'and an EMPTY trigger names the two things a GM can do to it'
    );
  });

  it('renders the refusal the caller set, and refuses to open on it', async () => {
    const root = await mountSelector({
      disabled: true,
      value: { id: 'cloth', name: 'Linen Cloth' },
    });
    const button = trigger(root);

    assert.ok(
      button.hasAttribute('disabled'),
      'a caller-set `disabled` survives the spread. Without it three shipped surfaces would ' +
        'render an ENABLED trigger mid-save, because the primitive`s own `disabled` is `false`'
    );
    assert.ok(
      !root.querySelector('.essence-source-clear'),
      'and the clear button stays away while the row is saving, exactly as before'
    );

    button.click();
    flushSync();
    await settle();
    assert.ok(
      !root.querySelector('.fabricate-source-picker-popover'),
      'a disabled trigger opens no panel: the browser refuses the click, and the guard inside ' +
        'the primitive refuses it too'
    );
  });

  // ── CRITERION 3(a): WHAT A MOUNTED DOM CAN SEE OF THE GRID ──────────────────────────────
  it('emits the grid form on the list rather than styling it inline', async () => {
    const columns = sheetGridColumns();
    const { panel } = await openPanel({});
    const list = panel.querySelector('[role="listbox"]');

    assert.equal(
      list.getAttribute('data-picker-as'),
      'grid',
      'the list declares its FORM as an attribute. An inline `display: grid` would be erased: ' +
        '`anchoredPopover` rewrites the whole `style` attribute of this element on every measure'
    );
    assert.equal(
      list.getAttribute('data-picker-columns'),
      String(columns),
      'and it declares the count the sheet draws, so one rung paints what the key map steps by'
    );
    assert.equal(
      list.getAttribute('style'),
      null,
      'nothing writes an inline style here: this caller measures no list metrics, so the ' +
        'primitive registers no secondary style target at all'
    );
  });

  it('composes the primitive class with this picker own on every element', async () => {
    const { root, panel } = await openPanel({});
    const pickerRoot = root.querySelector('.fabricate-picker');

    // EXACT lists, not `includes`. The sheet's rules for this picker are (0,2,0) descendant
    // selectors under the caller's roots and the primitive's alike, so a class silently dropped
    // from any one of these five elements deletes a rule rather than merely renaming a hook —
    // and nothing else in the repository can see it, because no frame photographs this panel.
    assert.deepEqual(authoredClasses(pickerRoot), [
      'fabricate-picker',
      'manager-travel-picker',
      'fabricate-source-picker',
      'essence-source-selector',
    ]);
    assert.deepEqual(authoredClasses(panel), [
      'fabricate-picker-popover',
      'manager-travel-popover',
      'fabricate-source-picker-popover',
      'essence-source-picker-popover',
    ]);
    assert.deepEqual(authoredClasses(panel.querySelector('.essence-source-picker-search')), [
      'manager-travel-popover-search',
      'essence-source-picker-search',
    ]);
    assert.deepEqual(authoredClasses(panel.querySelector('[role="listbox"]')), [
      'manager-travel-popover-options',
      'essence-source-picker-grid',
    ]);
    assert.deepEqual(authoredClasses(optionRows(panel)[0]), [
      'manager-travel-option',
      'essence-source-picker-option',
    ]);

    // The row's CONTENT is the caller's snippet and nothing else. A trailing marker or a Chip
    // appended after it would retarget every `span` reader the sheet and the suites use.
    const tile = optionRows(panel)[0];
    assert.equal(tile.children.length, 2, 'the option snippet is the row SOLE content');
    assert.equal(tile.querySelector('img').getAttribute('src'), ITEMS[0].img);
    assert.equal(tile.querySelector('span:last-child').textContent, 'Iron Ore');
  });

  it('asks the primitive for the shared width band rather than the withdrawn 420', () => {
    // A SOURCE READ, and it is the only route there is: happy-dom returns zero-sized rects, so
    // `computeIconPickerPopoverLayout` refuses and no inline width is ever written in a mounted
    // DOM. The sheet's own governing `max-width` is `icon-picker-layout.test.js`'s to read.
    const source = readFileSync(resolve(repoRoot, SOURCE_SELECTOR), 'utf8');
    assert.match(source, /minWidth=\{280\}/, 'the 280px floor is this picker own, and is kept');
    assert.match(
      source,
      /maxWidth=\{340\}/,
      'the ceiling is the SHARED band. The 420 it used to ask for was already dead — the shared ' +
        'panel rule caps the box at 340px — so asking for it would state a width nothing honours'
    );
    assert.ok(
      !source.includes('420'),
      'and the withdrawn number is gone rather than left beside the real one'
    );
  });

  it('marks the stored item as the current value without making it the cursor', async () => {
    const { panel } = await openPanel({ value: { id: 'cloth', name: 'Linen Cloth' } });
    const rows = optionRows(panel);
    const marked = rows.filter((row) => row.getAttribute('aria-selected') === 'true');

    assert.equal(
      marked.length,
      1,
      'EXACTLY one row is the current value. This is what `value={value?.id}` buys: the primitive ' +
        'marks with `option.id === value`, so a caller passing the whole item object marks nothing'
    );
    assert.equal(
      rows.indexOf(marked[0]),
      2,
      'and it is the third tile — the one whose `option.id` is the stored item`s id, not the ' +
        'one whose name sorts first'
    );
    assert.equal(marked[0].title, 'Linen Cloth');
    assert.deepEqual(
      markedRows(panel).map((row) => row.id),
      [],
      'the CURRENT VALUE and the KEYBOARD CURSOR are different states: opening on a stored item ' +
        'does not put the cursor anywhere'
    );
  });
});
