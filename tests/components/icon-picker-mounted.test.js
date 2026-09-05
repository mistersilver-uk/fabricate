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

/**
 * The picker's own no-matches sentence, as a KEY.
 *
 * The harness's `game.i18n.localize` returns the key for anything it does not carry
 * (`tests/helpers/svelte-component-harness.js`), so a rendered key is what proves which localized
 * string reached the panel. That is the whole point here: the primitive draws its own
 * `No matches` default whenever a caller wires this sentence to `emptyHint` instead of
 * `noMatchesHint`, and only the branch that carries the picker's OWN words is correct — the
 * unfiltered branch is unreachable in this component, because a no-query panel always pins the
 * resolved row.
 */
const NO_ICONS_FOUND = 'FABRICATE.Admin.Features.Essences.NoIconsFound';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-picker-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
  ],
  // THE PICKER RENDERS THROUGH THE SHARED PRIMITIVE (issue 1503), so its panel, its search row,
  // its option rows and its empty note are `SearchablePopover`'s elements — and `SearchablePopover`
  // renders `Chip` and `EmptyState`. A `.svelte` the mounted tree renders but this list omits does
  // NOT fail the suite: `validateMountedComponentDependencies` throws in `before()` and
  // `node --test` reports every test here as `# cancelled`, never `# fail`.
  //
  // This suite is invisible to `mounted-harness-primitive-allowlist.test.js` by construction: it
  // names the picker through a const, and that gate's bare-identifier reader resolves one only
  // through a `for (const X of …)` binding, which this file has none of. So the omission would
  // surface nowhere but here.
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    ICON_PICKER,
  ],
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

  it('says NO ICONS MATCHED when a query matches nothing, in the primitive`s own empty branch', async () => {
    const { root } = await openPicker('fas fa-cog');
    await search(root, 'zzzznotaglyph');

    assert.equal(optionRows(root).length, 0, 'nothing matched');
    assert.equal(pinnedRows(root).length, 0, 'and no pinned row masks that');

    // The `<p class="hint">` this picker used to draw is gone, and so is the defect it carried:
    // `hint` is only painted by `.fabricate-manager .hint`, so the sentence rendered UNSTYLED
    // anywhere outside the manager. The shared primitive's own empty branch replaces it, as a
    // SIBLING of the listbox rather than a child of it — a listbox's only valid children are its
    // options.
    const empty = root.querySelector('.manager-travel-popover-empty');
    assert.ok(Boolean(empty), 'the shared empty branch renders in the list`s place');
    assert.equal(empty.getAttribute('role'), 'status');
    assert.equal(empty.getAttribute('aria-live'), 'polite');
    assert.ok(
      !root.querySelector('[role="listbox"]'),
      'the list is REPLACED, not filled: an empty listbox with a sentence inside it is what the ' +
        'shared branch exists to stop'
    );

    // WHICH EMPTINESS. `NoIconsFound` is the FILTERED sentence and belongs to `noMatchesHint`:
    // the only reachable route into this branch is "a query matched nothing", because a panel with
    // no active query always pins the resolved row. Wired to `emptyHint` instead, the primitive
    // would answer with its own `No matches` default here and the picker's own words would never
    // render at all.
    const line = empty.textContent.replaceAll(/\s+/g, ' ').trim();
    assert.match(line, new RegExp(NO_ICONS_FOUND));
    assert.doesNotMatch(
      line,
      /No matches/,
      'the picker`s own sentence reaches `noMatchesHint`, so the primitive`s generic default is ' +
        'never the one a GM reads here'
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

describe('IconPicker trigger, across the primitive`s spread', () => {
  /**
   * WHAT A SPREAD MAY DO TO A CALLER'S OWN BUTTON, and what it must never do (issue 1503).
   *
   * The trigger is the caller's own markup inside a `trigger` snippet, and the attribute object
   * the primitive hands that snippet is spread LAST — deliberately, so the primitive keeps
   * `type`, the ARIA pair and the handlers that carry the focus model. That order is also the
   * hazard: Svelte's `set_attributes` REMOVES an attribute whose spread value is `undefined`, and
   * a spread `disabled: false` OVERRIDES a caller's own `disabled={true}` because it is not
   * undefined. Both are answered in the primitive rather than here — an undefined-value filter
   * and a caller-owned key list — and these are the assertions that prove it on the rendered DOM,
   * which a source read cannot: the erasure happens at runtime.
   *
   * `manager-mounted.test.js` already asserts this trigger's `title` on a real manager screen and
   * must stay green with no edit; these cases are the component-level net beneath it.
   */
  it('keeps the caller`s own name, class, style and context menu, and gains the primitive`s contract', async () => {
    const root = await harness.mount({
      value: 'fas fa-cog',
      buttonTitle: 'Change icon',
      iconOnly: true,
      triggerClass: 'manager-vocabulary-icon-trigger',
      triggerStyle: 'color: rgb(1, 2, 3)',
    });
    const trigger = root.querySelector('.essence-icon-picker-trigger');
    assert.ok(Boolean(trigger), 'the picker trigger renders');

    assert.equal(
      trigger.getAttribute('aria-label'),
      'Change icon',
      'the accessible name is the CALLER`s localized string; the primitive renders no button of ' +
        'its own in this shape, so nothing else can name it'
    );
    assert.equal(trigger.getAttribute('title'), 'Change icon');
    assert.ok(
      trigger.classList.contains('manager-vocabulary-icon-trigger'),
      '`triggerClass` still lands on this button — it is a no-op only for the primitive`s own'
    );
    assert.ok(trigger.classList.contains('icon-only'), 'and so does the icon-only variant');
    assert.match(trigger.getAttribute('style') ?? '', /rgb\(1, 2, 3\)/);

    assert.equal(trigger.getAttribute('type'), 'button');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(
      trigger.getAttribute('aria-expanded'),
      'false',
      'the spread ADDS the primitive`s contract, which is why it goes last'
    );
  });

  it('names the trigger from the picker`s own vocabulary when the caller passes no title', async () => {
    const root = await harness.mount({ value: 'fas fa-cog' });
    const trigger = root.querySelector('.essence-icon-picker-trigger');

    assert.equal(
      trigger.getAttribute('aria-label'),
      'FABRICATE.Admin.Features.Essences.ChooseIcon'
    );
    assert.equal(trigger.getAttribute('title'), 'FABRICATE.Admin.Features.Essences.ChooseIcon');
  });

  it('keeps a caller`s disabled trigger disabled, so no panel opens mid-save', async () => {
    const root = await harness.mount({ value: 'fas fa-cog', disabled: true });
    const trigger = root.querySelector('.essence-icon-picker-trigger');

    assert.equal(
      trigger.disabled,
      true,
      'three shipped surfaces disable this trigger while a save is in flight ' +
        '(`disabled={saving}`, `disabled={inert}`), and the refusal is the native attribute on ' +
        'the caller`s own button'
    );
    trigger.click();
    await settle();
    assert.ok(
      !root.querySelector('.fabricate-icon-picker-popover'),
      'so the click opens nothing: a spread that overrode `disabled` with its own `false` would ' +
        'give the GM an editable picker over a saving essence'
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
