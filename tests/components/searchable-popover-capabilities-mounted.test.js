/**
 * THE CAPABILITIES THE PICKER'S SPECIMEN NAMES, WIRED (issue 1503).
 *
 * `openspec/specs/design-system/library.html`'s `<SearchPopover>` specimen names capabilities the
 * shipped primitive did not have, and two hand-rolled look-alikes — `IconPicker` and
 * `EssenceSourceSelector` — exist because of exactly that gap. This suite covers the ten the
 * rebuild adds, and each clause is a way for the WIRING to be wrong while the prop is declared:
 *
 *   - the `trigger` snippet hands the primitive the CALLER'S OWN button, which is the element the
 *     panel must anchor to. Without it `anchoredPopover` falls back to the picker ROOT — for the
 *     source picker a whole drag-and-drop shell — and the panel is measured against the wrong box;
 *   - the SPREAD must not subtract. The caller spreads `attributes` LAST so the primitive's
 *     `type`, ARIA and handlers cannot be overridden, and Svelte's `set_attributes` REMOVES an
 *     attribute whose spread value is `undefined` and OVERRIDES one whose spread value is
 *     `false`. So the object omits undefined-valued keys AND omits `disabled`/`aria-disabled`
 *     whenever a `trigger` snippet is supplied. Both halves are asserted, because either one
 *     alone leaves a shipped defect: without the first, eleven trigger buttons render UNNAMED;
 *     without the second, three surfaces render an ENABLED trigger mid-save;
 *   - the grid key map moves by `columns` on the vertical axis and by ONE on the horizontal,
 *     which is a different arithmetic from the list form rather than a relabelling of it;
 *   - `filterOptions` is consulted on EVERY pass INCLUDING an empty query, because the pinned
 *     resolved row the icon picker draws above its alphabetical list is a no-query behaviour. The
 *     derivation it replaces short-circuited to the raw array when the query was empty, so a seam
 *     consulted only under a query would silently drop the pin.
 *
 * The arithmetic itself is proved in `tests/util/listbox-navigation.test.js` and the focus model
 * in `tests/components/searchable-popover-keyboard-mounted.test.js`; this suite is about the
 * caller-facing seams.
 *
 * ── WHY A COMPILED FIXTURE CALLER ───────────────────────────────────────────────────────────
 * `tests/fixtures/searchable-popover/CapabilityHost.svelte` is the call site, because the spread
 * rule is a fact about the compiler: only a real `<button …attrs {...attributes}>` puts the
 * caller's own attributes and the primitive's spread through one `set_attributes` call. A snippet
 * synthesized in JavaScript would apply them by hand and prove nothing.
 *
 * ── WHY THE GEOMETRY CLAUSES SYNTHESIZE THEIR BOXES ─────────────────────────────────────────
 * happy-dom lays nothing out: every `getBoundingClientRect` is a zero box, and its globals are
 * FLATTENED onto `globalThis`, which has neither `innerWidth` nor `addEventListener`. Left alone
 * that makes three of this suite's clauses vacuous rather than green — the layout correctly
 * refuses to position anything against a zero-width host, and the action's own
 * `typeof window.addEventListener !== 'function'` guard declines to listen at all.
 *
 * So the geometry clauses state the boxes they are reasoning about — a 1024x768 application host,
 * a 140x30 trigger at (200, 100), and a `bounds` resolver in the documented function form of that
 * prop — exactly as `tests/actions/anchored-popover.test.js` does for the action itself. The
 * panel's INLINE style then becomes readable, which is the ONLY place `horizontalAlign` and
 * `measureListMetrics` are observable: both are consumed inside the layout rather than emitted as
 * markup, and happy-dom cannot compute a cascade to read them back from.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** Five options, so a two-column grid has a ragged last row and `columns` is observable. */
const ICONS = [
  { id: 'anvil', label: 'Anvil', icon: 'fas fa-hammer' },
  { id: 'beaker', label: 'Beaker', icon: 'fas fa-flask' },
  { id: 'coin', label: 'Coin', icon: 'fas fa-coins' },
  { id: 'dagger', label: 'Dagger', icon: 'fas fa-khanda' },
  { id: 'ember', label: 'Ember', icon: 'fas fa-fire' },
];

/** The trigger's box, in host coordinates. The panel is anchored to it. */
const TRIGGER_RECT = Object.freeze({
  left: 200,
  right: 340,
  top: 100,
  bottom: 130,
  width: 140,
  height: 30,
});

/** The application host's box. It is the layout's coordinate origin AND its viewport. */
const HOST_RECT = Object.freeze({
  left: 0,
  right: 1024,
  top: 0,
  bottom: 768,
  width: 1024,
  height: 768,
});

/** A boundary wide enough for the layout to return a position. See the header. */
const openBounds = () => ({ minLeft: 0, maxRight: 1000 });

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-picker-capabilities-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'tests/fixtures/searchable-popover/CapabilityHost.svelte',
  ],
  componentPath: 'tests/fixtures/searchable-popover/CapabilityHost.svelte',
});

const chosen = [];

const mountPicker = (props) =>
  harness.mount({
    options: ICONS,
    triggerLabel: 'Icon',
    dialogAriaLabel: 'Choose an icon',
    searchPlaceholder: 'Search icons...',
    emptyHint: 'No icons defined',
    onChoose: (id) => {
      chosen.push(id);
    },
    ...props,
  });

/** The button the GM clicks — the caller's own when a `trigger` snippet is supplied. */
const trigger = () => harness.target.querySelector('.fabricate-picker button');
const pickerRoot = () => harness.target.querySelector('.fabricate-picker');
const panel = () => harness.target.querySelector('.fabricate-picker-popover');

/** Let Svelte's flush and the primitive's microtask-scheduled focus moves run. */
async function settle() {
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

async function openPanel() {
  trigger().click();
  flushSync();
  await settle();
  return panel();
}

/**
 * Stub one element's box and COUNT the reads.
 *
 * The count is the instrument for two clauses at once: which element the panel is anchored to
 * (only the anchor's box is ever read) and whether a viewport event re-measured.
 */
function stubRect(element, rect) {
  const reads = { count: 0 };
  element.getBoundingClientRect = () => {
    reads.count += 1;
    return { ...rect };
  };
  return reads;
}

/**
 * Give the layout a host, a trigger and a boundary it can answer with.
 *
 * Returns the trigger's read counter, which is the instrument for "which element was measured".
 */
function stubGeometry() {
  stubRect(harness.target, HOST_RECT);
  return stubRect(trigger(), TRIGGER_RECT);
}

/**
 * Make `window.addEventListener` a function, so `anchoredPopover` installs its listener pair.
 *
 * The action guards on `typeof window.addEventListener !== 'function'`, and happy-dom's globals
 * are flattened onto `globalThis`, which has no such method — so without this the action listens
 * for nothing and every re-measure clause below would pass by never running. The `resize` half is
 * deliberately a black hole: only the CAPTURE-phase `scroll` listener, which the action installs
 * on the real `document`, is under test here.
 *
 * @returns {() => void} Restores `globalThis`.
 */
function installWindowEventGuardStub() {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return () => {
    delete globalThis.addEventListener;
    delete globalThis.removeEventListener;
  };
}

function pressKey(key) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(event);
  flushSync();
  return event;
}

/** Type into the panel's query field, as a GM filtering the list does. */
function search(open, term) {
  const field = open.querySelector('.manager-travel-popover-search input');
  field.value = term;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  flushSync();
}

/**
 * One element's class list, in authored ORDER and without the compiler's own scoping hash.
 *
 * The order is the assertion: `optionClass` is the caller's row class and `option.class` is a
 * fact about the row's DATA, so the second has to come after the first to out-rank it on a tie.
 */
const authoredClasses = (element) =>
  element
    .getAttribute('class')
    .split(/\s+/)
    .filter(Boolean)
    .filter((name) => !name.startsWith('svelte-'));

const optionRows = (open) => [...open.querySelectorAll('[role="option"]')];
const listOf = (open) => open.querySelector('[role="listbox"]');
const activeDescendant = (holder) => holder.getAttribute('aria-activedescendant');
const holderOf = (open) => open.querySelector('.manager-travel-popover-search input');

describe('1503 SearchablePopover — the capabilities its specimen names', () => {
  let restoreWindowEvents = () => {};

  before(async () => {
    await harness.setup();
    restoreWindowEvents = installWindowEventGuardStub();
  });
  after(() => {
    restoreWindowEvents();
    harness.teardown();
  });

  describe('the `trigger` snippet', () => {
    it('renders the caller’s button instead of its own, and keeps the primitive’s contract', async () => {
      await mountPicker({ useTriggerSnippet: true, callerAriaLabel: 'Change icon' });
      const button = trigger();

      assert.ok(button.classList.contains('caller-trigger'), 'the caller draws its own button');
      assert.equal(
        pickerRoot().querySelectorAll('button').length,
        1,
        'and the primitive renders NO button of its own, so there is one control, not two'
      );
      assert.equal(button.getAttribute('type'), 'button');
      assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      assert.equal(
        button.getAttribute('data-caller-open'),
        'false',
        'the snippet is handed `open` as well as `attributes`'
      );

      await openPanel();
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      assert.equal(button.getAttribute('data-caller-open'), 'true');
      harness.remount();
    });

    it('hands the primitive the SNIPPET’s button, so the panel anchors to it and not to the picker root', async () => {
      await mountPicker({
        useTriggerSnippet: true,
        callerAriaLabel: 'Change icon',
        bounds: openBounds,
      });
      const button = trigger();
      stubRect(harness.target, HOST_RECT);
      const rootReads = stubRect(pickerRoot(), {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
      });
      const buttonReads = stubRect(button, TRIGGER_RECT);

      const open = await openPanel();

      assert.ok(buttonReads.count > 0, 'the snippet’s button is the element that was measured');
      assert.equal(
        rootReads.count,
        0,
        'the picker root is never measured: with the attachment the primitive HAS the real trigger, ' +
          'and the `triggerButton ?? pickerRoot` fallback is not reached'
      );
      assert.match(
        open.getAttribute('style'),
        /left: 200px;/,
        'the panel is laid out from the trigger’s own left edge (200), not from the root’s (0)'
      );
      assert.match(
        open.getAttribute('style'),
        /width: 240px;/,
        'and inside the primitive’s width band'
      );
      harness.remount();
    });

    it('returns focus to the caller’s button when the panel closes', async () => {
      chosen.length = 0;
      await mountPicker({ useTriggerSnippet: true, callerAriaLabel: 'Change icon' });
      const button = trigger();
      const open = await openPanel();

      optionRows(open)[1].click();
      flushSync();
      await settle();

      assert.deepEqual(chosen, ['beaker']);
      assert.ok(!panel(), 'choosing closes the panel');
      assert.equal(
        document.activeElement,
        button,
        'focus returns to the element the attachment handed over, which is the caller’s button'
      );
      harness.remount();
    });
  });

  describe('the omission rule — a spread can add, but never subtract or override', () => {
    it('keeps the caller’s own `aria-label` and `title` after the spread', async () => {
      await mountPicker({
        useTriggerSnippet: true,
        callerAriaLabel: 'Change icon',
        callerTitle: 'Change icon',
      });
      const button = trigger();

      assert.equal(
        button.getAttribute('aria-label'),
        'Change icon',
        'the primitive omits its undefined `aria-label`, so the caller’s name survives the ' +
          'spread. Without this every snippet-triggered picker renders UNNAMED.'
      );
      assert.equal(button.getAttribute('title'), 'Change icon');
      assert.ok(
        !button.hasAttribute('data-recipe-add'),
        'and an undefined key is omitted rather than written as an empty attribute'
      );
      harness.remount();
    });

    it('keeps a caller-set `disabled` after the spread, and refuses to open', async () => {
      await mountPicker({
        useTriggerSnippet: true,
        callerAriaLabel: 'Change icon',
        callerDisabled: true,
      });
      const button = trigger();

      assert.ok(
        button.hasAttribute('disabled'),
        'the primitive omits `disabled` and `aria-disabled` from a snippet spread: `false` is not ' +
          'undefined, so an undefined filter alone would override the caller’s own ' +
          '`disabled={true}` and render an ENABLED trigger mid-save'
      );
      assert.ok(!button.hasAttribute('aria-disabled'), 'and the advisory twin is omitted with it');

      button.click();
      flushSync();
      await settle();
      assert.ok(!panel(), 'a disabled trigger opens nothing');
      harness.remount();
    });

    it('resolves a `triggerAriaLabel` conflict in favour of the spread', async () => {
      await mountPicker({
        useTriggerSnippet: true,
        callerAriaLabel: 'Caller name',
        triggerAriaLabel: 'Primitive name',
      });

      assert.equal(
        trigger().getAttribute('aria-label'),
        'Primitive name',
        'a caller supplying a `trigger` snippet names the button IN the snippet and does not pass ' +
          '`triggerAriaLabel`; passing both is a conflict the spread-last rule resolves this way'
      );
      harness.remount();
    });
  });

  describe('the `option` snippet', () => {
    it('is the row’s ONLY content, so a label reader still finds the label last', async () => {
      await mountPicker({
        useOptionSnippet: true,
        options: [
          {
            id: 'anvil',
            label: 'Anvil',
            icon: 'fas fa-hammer',
            trailing: 'Linked',
            trailingIcon: 'fas fa-check',
            meta: 'A fact',
          },
        ],
      });
      const open = await openPanel();
      const row = optionRows(open)[0];

      assert.deepEqual(
        [...row.children].map((child) => child.className),
        ['caller-row-tile', 'caller-row-label'],
        'the caller draws the row content and the primitive draws nothing else inside the button'
      );
      assert.equal(
        row.querySelector('span:last-child').textContent.trim(),
        'Anvil',
        'a trailing Chip or marker would silently retarget the `span:last-child` label reader the ' +
          'icon picker’s own suite uses'
      );
      assert.ok(
        !row.querySelector('.manager-travel-option-name'),
        'and the default label span is not drawn'
      );
      harness.remount();
    });

    it('leaves the primitive’s own row content in place when no snippet is supplied', async () => {
      await mountPicker({
        options: [{ id: 'anvil', label: 'Anvil', icon: 'fas fa-hammer', trailing: 'Linked' }],
      });
      const open = await openPanel();
      const row = optionRows(open)[0];

      assert.equal(row.querySelector('.manager-travel-option-name').textContent.trim(), 'Anvil');
      assert.ok(
        Boolean(row.querySelector('i.fas.fa-hammer')),
        'the primitive still draws the icon'
      );
      harness.remount();
    });
  });

  describe('`as="grid"` with `columns`', () => {
    it('emits the form and the column count on the list, and moves the cursor by both axes', async () => {
      await mountPicker({ as: 'grid', columns: 2 });
      const open = await openPanel();
      const list = listOf(open);
      const holder = holderOf(open);
      const rows = optionRows(open);

      assert.equal(
        list.getAttribute('data-picker-as'),
        'grid',
        'the form is an ATTRIBUTE rather than an inline style, because `anchoredPopover` rewrites ' +
          'the list’s whole style attribute on every measure'
      );
      assert.equal(list.getAttribute('data-picker-columns'), '2');

      pressKey('ArrowDown');
      assert.equal(
        activeDescendant(holder),
        rows[0].id,
        'entering the grid lands on the first cell'
      );
      pressKey('ArrowDown');
      assert.equal(
        activeDescendant(holder),
        rows[2].id,
        'the vertical axis moves by `columns`, which is what makes it a grid rather than a list'
      );
      pressKey('ArrowRight');
      assert.equal(activeDescendant(holder), rows[3].id, 'the horizontal axis moves by one cell');
      pressKey('ArrowUp');
      assert.equal(activeDescendant(holder), rows[1].id);
      pressKey('ArrowLeft');
      assert.equal(activeDescendant(holder), rows[0].id);
      harness.remount();
    });

    it('leaves the list form single-axis, and declares itself as one', async () => {
      await mountPicker({});
      const open = await openPanel();
      const list = listOf(open);
      const holder = holderOf(open);
      const rows = optionRows(open);

      assert.equal(list.getAttribute('data-picker-as'), 'list');
      assert.ok(
        !list.hasAttribute('data-picker-columns'),
        'a list has no column count to declare, so the attribute is absent rather than 1'
      );

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(activeDescendant(holder), rows[1].id, 'the list form moves one row per press');
      const sideways = pressKey('ArrowRight');
      assert.equal(activeDescendant(holder), rows[1].id, 'and has no horizontal axis at all');
      assert.ok(
        !sideways.defaultPrevented,
        'so Left/Right stay with the query field’s own caret rather than being swallowed'
      );
      harness.remount();
    });
  });

  describe('`filterOptions`', () => {
    it('is consulted on the EMPTY-QUERY pass, which is what a pinned row depends on', async () => {
      const queries = [];
      // The icon picker's own shape: the resolved row is PINNED above the list and EXCLUDED from
      // it, so the seam's rows carry no duplicate `id` — which the primitive keys its `each` on.
      const pinnedFirst = (options, query) => {
        queries.push(query);
        const matches = options.filter(
          (option) => option.id !== 'anvil' && option.label.toLowerCase().includes(query)
        );
        return [{ id: 'anvil', label: 'Anvil (resolved)', class: 'pinned' }, ...matches];
      };

      await mountPicker({ filterOptions: pinnedFirst, optionClass: 'caller-option' });
      const open = await openPanel();

      assert.deepEqual(
        queries.filter((query) => query === ''),
        [''],
        'the seam runs on the no-query pass. The derivation it replaces short-circuited to the raw ' +
          'array when the query was empty, which would drop the pinned row entirely.'
      );
      assert.deepEqual(
        optionRows(open).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Anvil (resolved)', 'Beaker', 'Coin', 'Dagger', 'Ember'],
        'the seam’s rows are the rendered rows, in the order it returned them'
      );
      assert.deepEqual(
        authoredClasses(optionRows(open)[0]),
        ['manager-travel-option', 'caller-option', 'pinned'],
        'a per-option `class` is appended AFTER `optionClass`, so a fact about the DATA can out-rank ' +
          'the caller’s own row class'
      );

      search(open, 'be');
      assert.equal(
        queries.at(-1),
        'be',
        'and it is handed the normalized query on every later pass'
      );
      assert.deepEqual(
        optionRows(panel()).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Anvil (resolved)', 'Beaker', 'Ember'],
        'the pin survives a query because the seam, not the primitive, decides what is listed'
      );
      harness.remount();
    });

    it('filters by label substring when no seam is supplied', async () => {
      await mountPicker({});
      const open = await openPanel();

      search(open, 'an');
      assert.deepEqual(
        optionRows(panel()).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Anvil'],
        'the default is today’s exact filter, so all 21 shipped importers are unchanged'
      );
      harness.remount();
    });
  });

  describe('the class pass-throughs', () => {
    it('lands each caller class on the primitive’s own element, beside the primitive’s own', async () => {
      await mountPicker({
        pickerClass: 'caller-picker',
        popoverClass: 'caller-popover',
        searchClass: 'caller-search',
        listClass: 'caller-list',
        optionClass: 'caller-option',
      });
      const open = await openPanel();

      assert.ok(pickerRoot().classList.contains('caller-picker'));
      assert.ok(
        pickerRoot().classList.contains('manager-travel-picker'),
        'the primitive keeps its own'
      );
      assert.ok(open.classList.contains('caller-popover'));
      assert.ok(
        open.querySelector('.manager-travel-popover-search').classList.contains('caller-search')
      );
      assert.ok(
        Boolean(open.querySelector('.caller-search input')),
        'a caller’s `.x-search input` selector keeps resolving, which is what lets an adopting ' +
          'picker re-platform without editing its own mounted suite'
      );
      assert.ok(listOf(open).classList.contains('caller-list'));
      assert.deepEqual(
        optionRows(open).map((row) => row.classList.contains('caller-option')),
        [true, true, true, true, true]
      );
      harness.remount();
    });
  });

  describe('the layout seams', () => {
    it('lays the panel out from the caller’s `horizontalAlign`', async () => {
      await mountPicker({ bounds: openBounds, horizontalAlign: 'right' });
      stubGeometry();
      const rightAligned = await openPanel();
      assert.match(
        rightAligned.getAttribute('style'),
        /left: 100px;/,
        'right-aligned: the panel’s RIGHT edge meets the trigger’s (340 - 240 = 100)'
      );
      harness.remount();

      await mountPicker({ bounds: openBounds });
      stubGeometry();
      const leftAligned = await openPanel();
      assert.match(
        leftAligned.getAttribute('style'),
        /left: 200px;/,
        "the default is 'left', which is the value the primitive hard-coded before it was a prop"
      );
      harness.remount();
    });

    it('hands `measureListMetrics` the primitive’s own three elements and floors the list to whole rows', async () => {
      const seen = [];
      await mountPicker({
        bounds: openBounds,
        measureListMetrics: (elements) => {
          seen.push(elements);
          return { rowPitch: 38, rowGap: 6, chromeHeight: 50 };
        },
      });
      stubGeometry();
      const open = await openPanel();
      const list = listOf(open);

      const withList = seen.filter((elements) => elements.list);
      assert.ok(
        withList.length > 0,
        'the callback runs on every measure, including after the list binds'
      );
      assert.equal(
        withList.at(-1).popover,
        open,
        'the popover element is the primitive’s own panel'
      );
      assert.equal(withList.at(-1).list, list, 'the list element is the primitive’s own listbox');
      assert.equal(
        withList.at(-1).search,
        open.querySelector('.manager-travel-popover-search input'),
        'and the query field is the primitive’s own input: after adoption the caller owns none of them'
      );
      assert.equal(
        list.getAttribute('style'),
        'max-height: 298px;',
        'the measured pitch reaches the layout and is written to `targets.list`: 380 of panel less ' +
          '50 of chrome is 8 whole 38px rows, less the trailing 6px gap'
      );
      harness.remount();
    });

    it('leaves the list unstyled for a caller that measures nothing', async () => {
      await mountPicker({ bounds: openBounds });
      stubGeometry();
      const open = await openPanel();

      assert.ok(
        !listOf(open).hasAttribute('style'),
        'no callback means no `targets.list`, so the 21 shipped importers keep a list the action ' +
          'never writes to at all'
      );
      harness.remount();
    });

    it('drops a scroll that started inside the panel only when the caller asks', async () => {
      await mountPicker({ bounds: openBounds, ignoreScrollWithin: true });
      const ignoring = stubGeometry();
      const ignoringPanel = await openPanel();
      const before = ignoring.count;
      // NOT `{ bubbles: true }`: a real `scroll` does not bubble, which is exactly why the action
      // listens in CAPTURE on `document`. A bubbling stand-in would reach the listener by a route
      // the product never uses.
      ignoringPanel.dispatchEvent(new window.Event('scroll'));
      flushSync();
      assert.equal(
        ignoring.count,
        before,
        'scrolling INSIDE the panel moves neither the panel nor its trigger, so the answer a ' +
          're-measure would recompute is the one already applied'
      );
      harness.remount();

      await mountPicker({ bounds: openBounds });
      const measuring = stubGeometry();
      const measuringPanel = await openPanel();
      const baseline = measuring.count;
      measuringPanel.dispatchEvent(new window.Event('scroll'));
      flushSync();
      assert.ok(
        measuring.count > baseline,
        'and the default is unchanged: every viewport event re-measures, as it does today'
      );
      harness.remount();
    });
  });

  describe('`triggerOnKeydown`', () => {
    it('runs AFTER the primitive’s own handler, so a caller cannot delete the focus model', async () => {
      const seen = [];
      await mountPicker({
        showSearch: false,
        triggerHasPopup: 'listbox',
        triggerAriaLabel: 'Choose an icon',
        triggerOnKeydown: (event) => {
          seen.push({ key: event.key, prevented: event.defaultPrevented });
        },
      });
      const button = trigger();
      const open = await openPanel();

      const event = new window.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(event);
      flushSync();

      assert.equal(
        activeDescendant(button),
        optionRows(open)[0].id,
        'the primitive’s own key map still ran: in this shape the TRIGGER is the holder, so a ' +
          'caller handler that replaced `onkeydown` would delete the whole focus model'
      );
      assert.deepEqual(
        seen,
        [{ key: 'ArrowDown', prevented: true }],
        'and the caller’s handler ran after it, which is observable as the default ALREADY being ' +
          'prevented by the time it was called'
      );
      harness.remount();
    });
  });
});
