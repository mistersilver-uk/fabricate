/**
 * IconPicker selection semantics for the one-row-per-glyph vocabulary introduced by PR #1274.
 *
 * Stored values are not guaranteed to be the exact class the picker now offers: Font Awesome
 * aliases such as `cog` resolve to the offered `gear` row, regular-weight values remain valid even
 * though the picker deliberately offers only one solid row per glyph, and a value stored before the
 * vocabulary narrowed may not be offered at all. In every case opening the picker must expose
 * exactly one selected option to sighted and assistive-tech users — and, because the popover shows
 * seven or eight rows of an alphabetical list hundreds long, must expose it WITHOUT SCROLLING.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ICON_PICKER = 'src/ui/svelte/components/IconPicker.svelte';

/**
 * `src/utils/categoryIcons.js`'s `DEFAULT_CATEGORY_ICON`, restated rather than imported: this suite
 * mounts a component and must not drag an unrelated module into the harness allowlist to name one
 * string. It is the most common stored value the narrowed vocabulary no longer offers.
 */
const STORED_BUT_NOT_OFFERED = 'fas fa-folder';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-picker-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [ICON_PICKER],
  componentPath: ICON_PICKER,
});

before(async () => {
  await harness.setup();
  // happy-dom's Window is flattened onto `globalThis` by setupDOM() (see
  // tests/helpers/svelte-dom.js), and `globalThis` itself has no `addEventListener`. The
  // popover-positioning effect registers `window` resize/scroll listeners whenever the picker
  // opens; stub them so the effect does not crash when tests open the picker.
  window.addEventListener ??= () => {};
  window.removeEventListener ??= () => {};
});
after(() => harness.teardown());
afterEach(() => harness.remount());

function settle() {
  flushSync();
  return tick().then(flushSync);
}

function optionRows(root) {
  return [...root.querySelectorAll('.essence-icon-picker-option')];
}

function pinnedRows(root) {
  return [...root.querySelectorAll('.essence-icon-picker-option.pinned')];
}

function selectedRows(root) {
  return [...root.querySelectorAll('.essence-icon-picker-option[aria-selected="true"]')];
}

function rowIconClass(row) {
  return row?.querySelector('.essence-icon-picker-preview i')?.className ?? '';
}

function rowLabel(row) {
  return row?.querySelector('span:last-child')?.textContent?.trim() ?? '';
}

async function openPicker(value) {
  const root = await harness.mount({ value });
  const trigger = root.querySelector('.essence-icon-picker-trigger');
  assert.ok(trigger, 'the picker trigger renders');
  trigger.click();
  await settle();

  return { root, trigger, selected: selectedRows(root) };
}

async function search(root, term) {
  const input = root.querySelector('.essence-icon-picker-search input');
  assert.ok(input, 'the picker search box renders');
  input.value = term;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  return input;
}

function selectedIconClass(selected) {
  assert.equal(selected.length, 1, 'opening the picker exposes exactly one selected row');
  return rowIconClass(selected[0]);
}

describe('IconPicker canonical row selection', () => {
  it('selects the preferred row when the stored class uses an alias', async () => {
    const { trigger, selected } = await openPicker('fas fa-cog');

    assert.match(
      rowIconClass(trigger),
      /\bfa-gear\b/,
      'the trigger resolves the stored alias to the preferred glyph row'
    );
    assert.equal(selectedIconClass(selected), 'fas fa-gear');
  });

  it('selects the solid row for a stored regular class without rewriting its trigger preview', async () => {
    const { trigger, selected } = await openPicker('far fa-bell');

    assert.equal(
      rowIconClass(trigger),
      'far fa-bell',
      'a persisted regular value remains renderable as the value the GM originally chose'
    );
    assert.equal(
      selectedIconClass(selected),
      'fas fa-bell',
      'the one offered row for that glyph is selected even though its weight differs'
    );
  });
});

describe('IconPicker pinned resolved row', () => {
  it('renders the resolved row first so the selection needs no scrolling', async () => {
    const { root, selected } = await openPicker('fas fa-cog');
    const rows = optionRows(root);

    assert.ok(rows.length > 1, 'the picker renders the full alphabetical list');
    assert.equal(
      rowIconClass(rows[0]),
      'fas fa-gear',
      'the resolved row is the FIRST row, not wherever the alphabet puts it'
    );
    assert.equal(rows[0].getAttribute('aria-selected'), 'true');
    assert.equal(pinnedRows(root).length, 1, 'exactly one row is pinned');
    assert.equal(pinnedRows(root)[0], rows[0]);
    assert.equal(selected.length, 1, 'the pinned row is the only selected row');
    assert.equal(selected[0], rows[0]);
  });

  it('renders the resolved row once, not twice', async () => {
    const { root } = await openPicker('fas fa-cog');
    const gearRows = optionRows(root).filter((row) => rowIconClass(row) === 'fas fa-gear');

    assert.equal(gearRows.length, 1, 'the pinned row is removed from the list beneath it');
  });

  it('pins a stored value the list no longer offers, and keeps it selectable', async () => {
    const { root, selected } = await openPicker(STORED_BUT_NOT_OFFERED);
    const rows = optionRows(root);

    assert.equal(
      rowIconClass(rows[0]),
      STORED_BUT_NOT_OFFERED,
      'the picker is honest about what is persisted rather than opening with no selection'
    );
    assert.equal(rowLabel(rows[0]), 'Folder', 'the pinned fallback row is named, not a bare class');
    assert.equal(selected.length, 1, 'exactly one row is selected');
    assert.equal(selected[0], rows[0]);
    assert.equal(
      rows[0].disabled,
      false,
      'the pinned fallback row is a live option, so re-choosing it is possible'
    );
  });

  it('drops the pinned row once a query is typed, and restores it when the query clears', async () => {
    const { root } = await openPicker('fas fa-cog');
    const unfilteredCount = optionRows(root).length;
    assert.equal(pinnedRows(root).length, 1, 'the resolved row is pinned before any query');

    // `gear` rather than a term picked for scarcity: the two suites above already depend on the
    // gear row existing, so this test adds no new assumption about which glyphs the vocabulary
    // carries. The assertion is on the PINNED marker, not on a row's position, for the same reason
    // — a filtered list legitimately contains the resolved row, just not above the results.
    await search(root, 'gear');
    const filtered = optionRows(root);
    assert.ok(filtered.length > 0, 'the query matches at least one row');
    assert.ok(filtered.length < unfilteredCount, 'the query actually filtered the list');
    assert.equal(pinnedRows(root).length, 0, 'no row is pinned above a filtered list');

    await search(root, '');
    assert.equal(pinnedRows(root).length, 1, 'clearing the query restores the pinned row');
    assert.equal(rowIconClass(optionRows(root)[0]), 'fas fa-gear');
  });

  it('still renders the empty state when a query matches nothing', async () => {
    const { root } = await openPicker('fas fa-cog');
    await search(root, 'zzzznotaglyph');

    assert.equal(optionRows(root).length, 0, 'nothing matched');
    assert.equal(pinnedRows(root).length, 0, 'and no pinned row masks that');
    assert.ok(
      root.querySelector('.essence-icon-picker-empty'),
      'the no-results message survives the pinned-row split'
    );
  });

  it('labels a row with its name alone, with no weight in the tooltip', async () => {
    const { root } = await openPicker('fas fa-cog');
    const rows = optionRows(root);

    assert.equal(rows[0].getAttribute('title'), 'Gear');
    assert.equal(
      rows.some((row) => (row.getAttribute('title') ?? '').includes('(')),
      false,
      'no row implies the weight choice the picker no longer offers'
    );
  });
});

describe('IconPicker popover repositioning', () => {
  it('ignores scrolling inside the popover and still follows a scroll outside it', async () => {
    const { root } = await openPicker('fas fa-cog');
    const trigger = root.querySelector('.essence-icon-picker-trigger');
    const options = root.querySelector('.essence-icon-picker-options');
    assert.ok(options, 'the options list renders');

    // Repositioning is measured by the one call it cannot avoid making. The scroll listener is
    // registered on `document` in CAPTURE, so the options list's own scrolling reaches it — and
    // recomputing there costs two `closest()` traversals and a forced reflow per event to arrive
    // at the position already applied, because scrolling inside the popover moves neither the
    // popover nor the trigger it is anchored to.
    let measurements = 0;
    const measure = trigger.getBoundingClientRect.bind(trigger);
    trigger.getBoundingClientRect = () => {
      measurements += 1;
      return measure();
    };

    options.dispatchEvent(new Event('scroll'));
    await settle();
    assert.equal(measurements, 0, 'scrolling the options list re-measures nothing');

    root.dispatchEvent(new Event('scroll'));
    await settle();
    assert.ok(measurements > 0, 'scrolling an ancestor still repositions the popover');
  });
});
