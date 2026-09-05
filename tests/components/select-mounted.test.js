/**
 * THE APP'S ONE SELECT, WIRED (issue 1504).
 *
 * `src/ui/svelte/components/Select.svelte` is a THIN COMPOSITION over `SearchablePopover` with the
 * query field suppressed, so almost nothing here is about arithmetic: the cursor's numbers are
 * proved against the pure module in `tests/util/listbox-navigation.test.js` and the primitive's own
 * focus model in `tests/components/searchable-popover-keyboard-mounted.test.js`. What only a mount
 * of THIS component can show is the JOIN — every place where the select's own vocabulary
 * (`option.value`, three size rungs, a tick column, a derived group heading) has to line up with
 * the primitive's (`option.id`, `option.dataId`, `optionGroups`) — and every clause below is a way
 * for that join to be wrong while both halves are individually correct.
 *
 * Four of those joins are silent failures rather than loud ones, which is why each gets a clause
 * of its own and a named mutation that reds it:
 *
 *   - `aria-selected` is a STRICT equality inside the primitive. Forward a NUMERIC `value` and
 *     `'25' === 25` is false, so no row is marked at all — invisible at the one converting site
 *     that also passes `showTick={false}`;
 *   - `data-popover-option` is written as `option.dataId || undefined`, so a `dataId` of `''`
 *     omits the attribute. The bulk panels' leading "Leave unchanged" row is exactly that value,
 *     and it is the row a capture walk most needs to click;
 *   - `option.group` alone renders NO heading: the primitive buckets on `optionGroups`, and
 *     returns a flat list when that prop is empty. So the derivation is the feature;
 *   - the panel's width band is declared TWICE — as props, because the layout computes an inline
 *     width inside it, and in CSS, because the sheet's own `min-width: 240px` floors that result.
 *     Two copies of three numbers is a mirror, so a clause reads both out of the component.
 *
 * ── WHY THE SENTINEL IS PINNED AGAINST THE SOURCE ───────────────────────────────────────────
 * `__unchanged__` is a hand-maintained mirror across three places that no single gate spans: the
 * component, this suite, and any View Lab step or Foundry-smoke step that clicks the default row.
 * If the component's spelling drifted, nothing in `npm test` would red — the only symptom would be
 * a click timeout in a capture run, hours later and in a different job. So the literal is read out
 * of `Select.svelte`'s own source and compared against the value these cases use.
 *
 * ── WHY THE PAINT IS NOT ASSERTED HERE ──────────────────────────────────────────────────────
 * `tests/helpers/scoped-component-css.js` records that happy-dom cannot compute a cascade and that
 * no mounted harness loads `styles/fabricate.css`. Every geometry, fill, radius and focus claim is
 * therefore made in a real browser, in `tests/components/manager-layout.test.js`. What this file
 * asserts about appearance is only which HOOK is emitted — the size class, the tick element, the
 * `aria-*` state — never what it computes to.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const selectPath = resolve(repoRoot, 'src/ui/svelte/components/Select.svelte');
const selectSource = readFileSync(selectPath, 'utf8');

/**
 * THE SENTINEL THIS SUITE AND EVERY DRIVER STEP USE, stated independently of the component.
 *
 * Written as a literal rather than imported so the source clause below is a real comparison: an
 * import would make the two sides the same object and the mirror would be unfalsifiable.
 */
const UNCHANGED_OPTION_ID = '__unchanged__';

/**
 * The bulk-edit shape: an empty-string sentinel leading a grouped list with hints and a gated row.
 *
 * It is one fixture rather than five because every join this suite is about is present in it at
 * once — the sentinel, a NUMERIC-free string value, two groups in first-appearance order, an
 * ungrouped tail, a hint, a badge and a gated row with its reason.
 */
const TIERS = [
  { value: '', label: 'Leave unchanged', group: 'Instructions' },
  { value: 'default', label: 'Restore the default', group: 'Instructions' },
  {
    value: 'novice',
    label: 'Novice (DC 10)',
    hint: 'Takes the best tier the roll reaches.',
    group: 'Per tier',
  },
  { value: 'adept', label: 'Adept (DC 15)', group: 'Per tier' },
  { value: 'master', label: 'Master (DC 20)', group: 'Per tier', badge: 'New' },
  { value: 'downtime', label: 'Downtime', disabled: true, disabledReason: 'Premium' },
];

/** The page-size shape, whose values are NUMBERS. Decision XX's whole subject. */
const PAGE_SIZES = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
];

/** Four flat rows, two of them beginning with `P`, so a repeated character has somewhere to go. */
const MODES = [
  { value: 'simple', label: 'Simple' },
  { value: 'routed', label: 'Routed by check' },
  { value: 'progressive', label: 'Progressive' },
  { value: 'preview', label: 'Preview only' },
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-select-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/Select.svelte',
  ],
  componentPath: 'src/ui/svelte/components/Select.svelte',
});

/** Every value `onChange` was handed, in order, WITH ITS TYPE — which is half the point. */
const changed = [];

function mountSelect(props) {
  changed.length = 0;
  return harness.mount({
    options: MODES,
    ariaLabel: 'Resolution',
    onChange: (value) => {
      changed.push(value);
    },
    ...props,
  });
}

/** The trigger button, which is the picker root's own only button while the panel is shut. */
const trigger = () => harness.target.querySelector(':scope .fabricate-select button');
const panel = () => harness.target.querySelector('.fabricate-select-popover');
const optionRows = () => [...harness.target.querySelectorAll('[role="option"]')];
const activeDescendant = () => trigger().getAttribute('aria-activedescendant');

/** Let Svelte's flush and the primitive's microtask-scheduled focus moves run. */
async function settle() {
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

/**
 * Press a key ON THE ELEMENT THAT CURRENTLY HOLDS FOCUS.
 *
 * Addressing `document.activeElement` rather than a captured node is what makes the "focus never
 * moves onto a row" clause falsifiable: a model with roving focus would have this suite's own
 * keystrokes follow the focus, and a run that kept dispatching at the trigger could report an
 * unchanged `activeElement` while the browser had in fact moved on.
 */
function pressKey(key, modifiers = {}) {
  const event = new globalThis.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  document.activeElement.dispatchEvent(event);
  flushSync();
  return event;
}

/**
 * Press a key AT A STATED CLOCK, so the type-ahead's inactivity window is observable both ways.
 *
 * `util/listboxNavigation.js` reads `Date.now()` when its caller states no clock, and the picker
 * deliberately states none so it has no timer to leak. A real wait could prove the reset but never
 * prove that a keystroke INSIDE the window extends rather than restarts the prefix: between two
 * synchronous dispatches, a slow machine looks exactly like the defect.
 */
function pressKeyAt(key, at) {
  const realNow = Date.now;
  Date.now = () => at;
  try {
    return pressKey(key);
  } finally {
    Date.now = realNow;
  }
}

async function openPanel() {
  trigger().click();
  flushSync();
  await settle();
  return panel();
}

/** The label of the row the trigger is announcing as active, or null. */
function announcedLabel() {
  const id = activeDescendant();
  if (!id) return null;
  return harness.target.querySelector(`[id="${id}"]`)?.textContent.replaceAll(/\s+/g, ' ').trim();
}

/** One row's own label text, without the tick, the badge or the reason. */
const labelOf = (row) => row.querySelector('.fabricate-select-label')?.textContent.trim();

describe('1504 Select — the select every screen renders', () => {
  before(harness.setup);
  after(harness.teardown);

  describe('the trigger is the combobox, and the holder', () => {
    it('announces a listbox, renders no query field, and holds focus itself', async () => {
      await mountSelect({});
      const button = trigger();

      assert.equal(button.getAttribute('role'), 'combobox', 'the primitive`s own trigger shape');
      assert.equal(button.getAttribute('aria-haspopup'), 'listbox');
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      assert.equal(
        button.getAttribute('data-keyboard-focus'),
        'true',
        'without it every Foundry keybinding stays live while the trigger holds focus'
      );

      button.focus();
      const open = await openPanel();
      assert.ok(
        !open.querySelector('input'),
        'a select is a select-only combobox: there is no query field to render'
      );
      // A NODE-VERSUS-NODE `assert.equal` IS A HEAP HAZARD HERE, not a style choice: on failure
      // `node:assert` serialises the actual value to build its diff and walks a mounted
      // happy-dom element's circular tree until the heap dies, so a one-line focus defect
      // surfaces as an OOM and a cancelled suite with no message. The boolean says the same thing
      // and fails with a sentence.
      assert.ok(
        document.activeElement === button,
        'the TRIGGER is the holder, and the panel opening does not take focus off it'
      );
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      assert.equal(
        button.getAttribute('aria-controls'),
        open.querySelector('[role="listbox"]').id,
        'and it points at the list it drives'
      );
      harness.remount();
    });

    it('keeps DOM focus on the trigger across ten ArrowDown presses, and wraps', async () => {
      await mountSelect({});
      const button = trigger();
      button.focus();
      await openPanel();

      const announced = [];
      for (let press = 0; press < 10; press += 1) {
        pressKey('ArrowDown');
        assert.ok(
          document.activeElement === button,
          `press ${press + 1}: DOM focus is still the trigger's, not the row's`
        );
        announced.push(announcedLabel());
      }

      assert.deepEqual(
        announced,
        [
          'Simple',
          'Routed by check',
          'Progressive',
          'Preview only',
          'Simple',
          'Routed by check',
          'Progressive',
          'Preview only',
          'Simple',
          'Routed by check',
        ],
        'the cursor advances and WRAPS on a closed ring while focus never moves'
      );
      assert.equal(
        harness.target.querySelectorAll('[data-active-option="true"]').length,
        1,
        'and exactly one row is marked, so the announcement and the paint cannot disagree'
      );
      harness.remount();
    });

    it('reaches the outermost ENABLED options with Home and End', async () => {
      await mountSelect({
        options: [
          { value: 'first', label: 'First', disabled: true, disabledReason: 'Premium' },
          { value: 'middle', label: 'Middle' },
          { value: 'last', label: 'Last', disabled: true, disabledReason: 'Premium' },
        ],
      });
      trigger().focus();
      await openPanel();

      pressKey('End');
      assert.equal(
        announcedLabel(),
        'Middle',
        'End scans INWARD from the last row: a gated end is not a position to announce'
      );
      pressKey('Home');
      assert.equal(announcedLabel(), 'Middle', 'and Home scans inward from the first');
      harness.remount();
    });

    it('Escape closes and returns focus; Enter commits the caller`s own typed value', async () => {
      await mountSelect({ options: PAGE_SIZES, value: 10 });
      trigger().focus();
      await openPanel();

      pressKey('Escape');
      await settle();
      assert.ok(!panel(), 'Escape closes the panel');
      assert.ok(
        document.activeElement === trigger(),
        'and returns focus to the trigger it was opened from'
      );
      assert.deepEqual(changed, [], 'while committing nothing');

      await openPanel();
      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(announcedLabel(), '25');
      pressKey('Enter');
      await settle();
      assert.deepEqual(
        changed,
        [25],
        'onChange is handed the option`s own value, the NUMBER 25 rather than the string'
      );
      assert.equal(
        typeof changed[0],
        'number',
        'the caller gets back exactly the type it passed in, which the string ids do not carry'
      );
      harness.remount();
    });
  });

  describe('readonly takes focus and refuses; disabled does neither', () => {
    it('readonly is aria-disabled, focusable and shut', async () => {
      await mountSelect({ readonly: true });
      const button = trigger();

      assert.equal(button.getAttribute('aria-disabled'), 'true');
      assert.ok(!button.disabled, 'and NOT natively disabled, or it would not take focus at all');
      button.focus();
      assert.ok(document.activeElement === button, 'a readonly select is still a tab stop');

      button.click();
      flushSync();
      await settle();
      assert.ok(!panel(), 'and it refuses to open');
      harness.remount();
    });

    it('disabled takes no focus and opens nothing', async () => {
      await mountSelect({ disabled: true });
      const button = trigger();

      assert.ok(button.disabled, 'the whole control is off');
      button.click();
      flushSync();
      await settle();
      assert.ok(!panel(), 'so there is nothing to open');
      harness.remount();
    });
  });

  describe('the accessible name, and the labelled form', () => {
    it('ariaLabelledBy lands as aria-labelledby on the trigger', async () => {
      await mountSelect({ ariaLabel: '', ariaLabelledBy: 'scoped-list-sort-label' });
      assert.equal(trigger().getAttribute('aria-labelledby'), 'scoped-list-sort-label');
      assert.ok(
        !trigger().getAttribute('aria-label'),
        'and no aria-label beside it: a labelledby WINS, so a string there would be dead text'
      );
      harness.remount();
    });

    it('a label renders <Field as="label"> and points the trigger at its own caption', async () => {
      await mountSelect({ label: 'Resolution', hint: 'Applies to every recipe here.' });

      const field = harness.target.querySelector('label.manager-field');
      assert.ok(Boolean(field), 'the labelled form is the shared Field column, on a <label> host');
      const caption = field.querySelector('.fabricate-select-caption');
      assert.equal(caption.textContent.trim(), 'Resolution');
      assert.ok(caption.id.length > 0, 'the caption is addressable, per instance');
      assert.equal(
        trigger().getAttribute('aria-labelledby'),
        caption.id,
        'a <label> does not name a <button> by containment, so the caption is POINTED at'
      );
      assert.ok(
        !trigger().getAttribute('aria-label'),
        'and the caption is the name, so no string duplicates it'
      );
      assert.equal(
        field.querySelector('.fabricate-select-note')?.textContent.trim(),
        'Applies to every recipe here.',
        'the hint renders after the control, which is the column Field documents'
      );
      assert.ok(!field.querySelector('.fabricate-select-error'), 'and no error line without one');
      harness.remount();
    });

    it('an error replaces the hint rather than stacking under it', async () => {
      await mountSelect({ label: 'Resolution', hint: 'Applies here.', error: 'Pick a mode.' });
      const field = harness.target.querySelector('label.manager-field');
      assert.equal(
        field.querySelector('.fabricate-select-error').textContent.trim(),
        'Pick a mode.'
      );
      assert.ok(
        !field.querySelector('.fabricate-select-note'),
        'a field that is wrong states what is wrong, not what it is for'
      );
      harness.remount();
    });
  });

  describe('the option identity both halves have to agree on', () => {
    it('marks a NUMERIC value`s row aria-selected, because String(value) is forwarded', async () => {
      await mountSelect({ options: PAGE_SIZES, value: 25 });
      await openPanel();

      const selected = optionRows().filter((row) => row.getAttribute('aria-selected') === 'true');
      assert.deepEqual(
        selected.map((row) => labelOf(row)),
        ['25'],
        'the primitive compares `option.id === value` STRICTLY, so both sides must be strings'
      );
      harness.remount();
    });

    it('gives EVERY rendered row a data-popover-option, the empty sentinel included', async () => {
      await mountSelect({ options: TIERS, value: '' });
      await openPanel();
      const rows = optionRows();

      assert.equal(rows.length, TIERS.length, 'every authored option renders');
      assert.deepEqual(
        rows.filter((row) => !row.getAttribute('data-popover-option')).map((row) => labelOf(row)),
        [],
        'a row with no identity handle is addressable only by its localized label, which is not ' +
          'a selector — and the capture registry`s own idiom clicks [data-popover-option="…"]'
      );
      assert.deepEqual(
        rows.map((row) => row.getAttribute('data-popover-option')),
        [UNCHANGED_OPTION_ID, 'default', 'novice', 'adept', 'master', 'downtime'],
        'and the empty-string value takes the declared sentinel rather than being omitted'
      );
      assert.equal(
        rows[0].getAttribute('aria-selected'),
        'true',
        'while the sentinel row is still the one the empty value selects'
      );
      harness.remount();
    });

    it('spells the sentinel in Select.svelte`s own source, so the mirror cannot drift', () => {
      // A HAND-MAINTAINED MIRROR WITH NO OTHER GATE. The literal lives in the component, in this
      // suite and in any capture or smoke step that clicks the default row; a drift would red
      // nothing in `npm test` and would surface only as a click timeout in a capture run.
      const declaration = selectSource.match(/const UNCHANGED_OPTION_ID = '([^']+)';/);
      assert.ok(Boolean(declaration), 'Select.svelte declares the sentinel as a named constant');
      assert.equal(
        declaration[1],
        UNCHANGED_OPTION_ID,
        'the component`s spelling and the one this suite and every driver step use are one value'
      );
      assert.equal(
        selectSource.match(/'__unchanged__'/g)?.length,
        1,
        'and it is declared exactly ONCE in the component, so there is one place to change'
      );
    });
  });

  describe('the group headings, which option.group alone does not render', () => {
    it('derives them in FIRST-APPEARANCE order with the ungrouped rows trailing', async () => {
      await mountSelect({ options: TIERS });
      const open = await openPanel();

      const headings = [...open.querySelectorAll('.manager-travel-popover-group-label')].map(
        (heading) => heading.textContent.trim()
      );
      assert.deepEqual(
        headings,
        ['Instructions', 'Per tier'],
        'the primitive buckets on `optionGroups`, which is DERIVED here — `option.group` alone ' +
          'renders a flat list with no heading at all'
      );

      const buckets = [...open.querySelectorAll('[data-popover-group]')].map((bucket) => ({
        id: bucket.getAttribute('data-popover-group'),
        rows: [...bucket.querySelectorAll('[role="option"]')].map((row) => labelOf(row)),
      }));
      assert.deepEqual(buckets, [
        { id: 'Instructions', rows: ['Leave unchanged', 'Restore the default'] },
        { id: 'Per tier', rows: ['Novice (DC 10)', 'Adept (DC 15)', 'Master (DC 20)'] },
        { id: '__ungrouped', rows: ['Downtime'] },
      ]);
      assert.equal(
        open
          .querySelector('[data-popover-group="__ungrouped"]')
          .querySelectorAll('.manager-travel-popover-group-label').length,
        0,
        'and the trailing bucket carries no heading, because it names nothing'
      );
      harness.remount();
    });

    it('renders no heading at all for a flat list', async () => {
      await mountSelect({ options: MODES });
      const open = await openPanel();
      assert.equal(
        open.querySelectorAll('.manager-travel-popover-group-label').length,
        0,
        'a list with no `group` on any option is one bucketless list, exactly as before'
      );
      harness.remount();
    });
  });

  describe('the row`s own content, which Select draws through the option snippet', () => {
    it('gives every row a tick when showTick is on, and none when it is off', async () => {
      await mountSelect({ options: MODES, value: 'routed' });
      let open = await openPanel();
      assert.equal(
        open.querySelectorAll('.fabricate-select-tick').length,
        MODES.length,
        'the tick is on EVERY row, or the label column goes ragged — which row SHOWS it is a ' +
          'CSS read of the row`s own aria-selected, so the marker cannot disagree with the name'
      );
      harness.remount();

      await mountSelect({ options: MODES, value: 'routed', showTick: false });
      open = await openPanel();
      assert.equal(
        open.querySelectorAll('.fabricate-select-tick').length,
        0,
        'and the column is gone entirely where the trigger already states the value'
      );
      harness.remount();
    });

    it('draws a hint as a second line, a badge, and a gated row`s reason', async () => {
      await mountSelect({ options: TIERS });
      await openPanel();

      const hinted = optionRows().find((row) => labelOf(row) === 'Novice (DC 10)');
      assert.equal(
        hinted.querySelector('.fabricate-select-hint').textContent.trim(),
        'Takes the best tier the roll reaches.'
      );
      assert.ok(
        Boolean(hinted.querySelector('.fabricate-select-lines')),
        'a hinted row is TWO lines, and the wrapper is what keeps the label ellipsising'
      );

      const badged = optionRows().find((row) => labelOf(row) === 'Master (DC 20)');
      assert.equal(badged.querySelector('[data-popover-option-badge]').textContent.trim(), 'New');

      const gated = optionRows().find((row) => labelOf(row) === 'Downtime');
      assert.equal(gated.getAttribute('aria-disabled'), 'true');
      assert.equal(
        gated.querySelector('[data-popover-option-reason]').textContent.trim(),
        'Premium',
        'opacity alone is not a reason, and the reason is INSIDE the button so it is announced'
      );
      harness.remount();
    });

    it('steps the cursor over a gated row and refuses its click', async () => {
      await mountSelect({ options: TIERS });
      trigger().focus();
      await openPanel();

      pressKey('End');
      assert.equal(
        announcedLabel(),
        'Master (DC 20) New',
        'the last row is gated, so End lands on the last ENABLED one — and its badge is part of ' +
          'what is announced, because the badge is drawn INSIDE the row button'
      );

      const gated = optionRows().find((row) => labelOf(row) === 'Downtime');
      gated.click();
      flushSync();
      await settle();
      assert.deepEqual(changed, [], 'and a click on it chooses nothing');
      assert.ok(Boolean(panel()), 'the panel does not close on a refused choice either');
      harness.remount();
    });

    it('returns the cursor unmoved when every row is gated', async () => {
      await mountSelect({
        options: [
          { value: 'a', label: 'Alpha', disabled: true, disabledReason: 'Premium' },
          { value: 'b', label: 'Beta', disabled: true, disabledReason: 'Premium' },
        ],
      });
      trigger().focus();
      await openPanel();

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      pressKey('End');
      assert.equal(
        activeDescendant(),
        null,
        'a fully gated list has nowhere to put a cursor, and the skip scan TERMINATES rather ' +
          'than looping — the sentinel is what "nothing is active" already means'
      );
      assert.deepEqual(changed, []);
      harness.remount();
    });

    it('lands the first ArrowDown on the first enabled row when the value itself is gated', async () => {
      await mountSelect({
        options: [
          { value: 'downtime', label: 'Downtime', disabled: true, disabledReason: 'Premium' },
          { value: 'simple', label: 'Simple' },
        ],
        value: 'downtime',
      });
      trigger().focus();
      await openPanel();
      assert.equal(
        activeDescendant(),
        null,
        'an opened panel has no cursor at all: the -1 sentinel is the primitive`s contract'
      );

      pressKey('ArrowDown');
      assert.equal(
        announcedLabel(),
        'Simple',
        'so the first arrow enters at the first ENABLED row, skipping the gated current value'
      );
      harness.remount();
    });
  });

  describe('the type-ahead, whose primary case is a CLOSED trigger', () => {
    it('opens the panel with the typed match as the ACTIVE option', async () => {
      await mountSelect({ options: MODES });
      const button = trigger();
      button.focus();
      assert.equal(button.getAttribute('aria-expanded'), 'false', 'the panel starts shut');

      const typed = pressKeyAt('p', 1000);
      await settle();

      assert.ok(typed.defaultPrevented, 'the type-ahead consumed the character');
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      assert.ok(Boolean(panel()), 'and the panel is really rendered, not merely announced');
      assert.equal(
        announcedLabel(),
        'Progressive',
        'the WAI-ARIA select-only behaviour: the match becomes ACTIVE, it is not selected'
      );
      assert.deepEqual(changed, [], 'a typed character commits nothing on its own');
      harness.remount();
    });

    it('leaves a closed panel shut when the prefix matches nothing', async () => {
      await mountSelect({ options: MODES });
      trigger().focus();

      pressKeyAt('z', 1000);
      await settle();

      assert.equal(trigger().getAttribute('aria-expanded'), 'false');
      assert.ok(!panel(), 'a mistyped character is not a state change');
      assert.equal(activeDescendant(), null);
      assert.deepEqual(changed, []);
      harness.remount();
    });

    it('commits nothing when the GM dismisses the panel they typed open', async () => {
      // THE ACTIVE OPTION IS NOT THE VALUE. Escape, an outside click and focus leaving the trigger
      // all close through the primitive's own `close()`, which calls no `onChoose` — so every
      // dismissal path leaves the value exactly as it was.
      await mountSelect({ options: MODES });
      trigger().focus();

      pressKeyAt('p', 1000);
      await settle();
      assert.equal(announcedLabel(), 'Progressive');
      pressKey('Escape');
      await settle();
      assert.ok(!panel(), 'Escape closes the panel it typed open');
      assert.deepEqual(changed, [], 'and chooses nothing on the way out');

      pressKeyAt('p', 2000);
      await settle();
      assert.ok(Boolean(panel()), 'typed open again');
      document.body.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true }));
      flushSync();
      await settle();
      assert.ok(!panel(), 'an outside click closes it too');
      assert.deepEqual(changed, [], 'and still commits nothing');
      harness.remount();
    });

    it('REFINES on a second character with the panel open, and CYCLES past the window', async () => {
      await mountSelect({ options: MODES });
      trigger().focus();
      await openPanel();

      pressKeyAt('p', 1000);
      assert.equal(announcedLabel(), 'Progressive', '`p` reaches the first P');
      pressKeyAt('r', 1200);
      pressKeyAt('e', 1300);
      assert.equal(
        announcedLabel(),
        'Preview only',
        'a multi-character prefix typed inside the window is a SEARCH, not a walk'
      );
      assert.equal(trigger().getAttribute('aria-expanded'), 'true', 'and the panel stayed open');

      pressKeyAt('p', 2000);
      assert.equal(
        announcedLabel(),
        'Progressive',
        'past the inactivity window the buffer starts over, so the same character CYCLES'
      );
      pressKeyAt('p', 2200);
      assert.equal(announcedLabel(), 'Preview only', 'and cycles on round the ring');
      assert.deepEqual(changed, [], 'none of which chose anything');
      harness.remount();
    });

    it('matches the rendered LABEL case-insensitively, and skips a gated row', async () => {
      await mountSelect({
        options: [
          { value: 'progressive', label: 'Progressive', disabled: true, disabledReason: 'Premium' },
          { value: 'preview', label: 'Preview only' },
        ],
      });
      trigger().focus();

      pressKeyAt('P', 1000);
      await settle();
      assert.equal(
        announcedLabel(),
        'Preview only',
        'a capital matches, and the gated first P is skipped exactly as the arrows skip it'
      );
      harness.remount();
    });

    it('refuses the type-ahead on a trigger that already refuses to open', async () => {
      await mountSelect({ options: MODES, readonly: true });
      trigger().focus();

      const typed = pressKeyAt('p', 1000);
      await settle();
      assert.ok(!typed.defaultPrevented, 'the key is not this widget`s');
      assert.ok(
        !panel(),
        'a typed character is not a route around a refusal stated everywhere else'
      );
      harness.remount();
    });
  });

  describe('the size rungs, and the hooks a call site addresses', () => {
    it('emits the rung on the trigger and on the panel, and defaults to form', async () => {
      for (const rung of ['form', 'inline', 'toolbar']) {
        await mountSelect({ size: rung });
        assert.equal(trigger().getAttribute('data-select-size'), rung);
        assert.ok(
          trigger().className.split(/\s+/).includes(`fabricate-select-trigger-${rung}`),
          `${rung}: the trigger carries its rung's class`
        );
        const open = await openPanel();
        assert.ok(
          open.className.split(/\s+/).includes(`fabricate-select-popover-${rung}`),
          `${rung}: and so does the panel, which is portaled away from it`
        );
        harness.remount();
      }

      await mountSelect({});
      assert.equal(trigger().getAttribute('data-select-size'), 'form', 'form is the default rung');
      harness.remount();

      await mountSelect({ size: 'enormous' });
      assert.equal(
        trigger().getAttribute('data-select-size'),
        'form',
        'and an unrecognised rung falls back to it rather than rendering unstyled'
      );
      harness.remount();
    });

    it('marks the panel`s tick polarity, which is what insets a group heading', async () => {
      await mountSelect({ options: TIERS });
      assert.ok(
        (await openPanel()).className.split(/\s+/).includes('fabricate-select-popover-ticked'),
        'a heading must clear the tick column, so the panel states whether it has one'
      );
      harness.remount();

      await mountSelect({ options: TIERS, showTick: false });
      assert.ok(
        !(await openPanel()).className.split(/\s+/).includes('fabricate-select-popover-ticked'),
        'and falls back to the row`s own inset when there is no column to clear'
      );
      harness.remount();
    });

    it('declares one panel width band, in the props AND in the CSS that floors them', () => {
      // A MIRROR WITH A REAL REASON AND THEREFORE A REAL GUARD. `anchoredPopover` writes the
      // panel's width as an inline style computed inside `[minWidth, maxWidth]`, so the band has
      // to be props; the sheet's own `min-width: 240px` then floors that result, so it has to be
      // CSS as well. Two copies of three pairs is what this clause pins together.
      const table = selectSource.match(/const SIZES = Object\.freeze\(\{[\s\S]*?\n {2}\}\);/)?.[0];
      assert.ok(Boolean(table), 'Select.svelte declares its rungs in one frozen table');

      for (const rung of ['form', 'inline', 'toolbar']) {
        const fromTable = table.match(
          new RegExp(String.raw`${rung}: Object\.freeze\(\{ minWidth: (\d+), maxWidth: (\d+) \}\)`)
        );
        assert.ok(Boolean(fromTable), `${rung} has a row in the table`);
        const fromCss = selectSource.match(
          new RegExp(
            String.raw`\.fabricate-select-popover-${rung}\)? \{\s*min-width: (\d+)px;` +
              String.raw`\s*max-width: (\d+)px;`
          )
        );
        assert.ok(Boolean(fromCss), `${rung} has a panel rule declaring its band`);
        assert.deepEqual(
          [fromCss[1], fromCss[2]],
          [fromTable[1], fromTable[2]],
          `${rung}: the prop band and the CSS band are one pair of numbers, not two`
        );
      }
    });

    it('forwards triggerData, id, name, invalid and mono onto the control itself', async () => {
      await mountSelect({
        triggerData: { 'data-pagination-size': '' },
        id: 'page-size',
        name: 'pageSize',
        invalid: true,
        mono: true,
        icon: 'fas fa-list',
        value: 'routed',
      });
      const button = trigger();

      assert.equal(
        button.getAttribute('data-pagination-size'),
        '',
        'a call site`s own hook goes on the CONTROL, not on a wrapper around it'
      );
      assert.equal(button.getAttribute('id'), 'page-size');
      assert.equal(button.getAttribute('name'), 'pageSize');
      assert.equal(button.getAttribute('aria-invalid'), 'true');
      assert.ok(
        Boolean(button.querySelector('.fas.fa-list')),
        'and the leading glyph is the trigger`s own'
      );
      assert.ok(
        button
          .querySelector('.fabricate-select-value')
          .className.split(/\s+/)
          .includes('fabricate-select-value-mono'),
        'mono is a class on the value span, so tabular figures reach the numerals'
      );
      harness.remount();

      await mountSelect({});
      assert.ok(
        !trigger().getAttribute('aria-invalid'),
        'and a valid select carries no aria-invalid at all, rather than "false"'
      );
      harness.remount();
    });

    it('shows the placeholder while the value names no option, and marks it as one', async () => {
      await mountSelect({ options: MODES, value: null, placeholder: 'Choose a mode' });
      const value = trigger().querySelector('.fabricate-select-value');
      assert.equal(value.textContent.trim(), 'Choose a mode');
      assert.ok(
        value.className.split(/\s+/).includes('fabricate-select-value-placeholder'),
        'a placeholder is quieter than a value, so it is told apart in the markup'
      );
      await openPanel();
      assert.deepEqual(
        optionRows()
          .filter((row) => row.getAttribute('aria-selected') === 'true')
          .map((row) => labelOf(row)),
        [],
        'and no row is selected: null names no option, and String(null) matches none of them'
      );
      harness.remount();

      await mountSelect({ options: MODES, value: 'routed', placeholder: 'Choose a mode' });
      assert.equal(
        trigger().querySelector('.fabricate-select-value').textContent.trim(),
        'Routed by check',
        'and a real value replaces it'
      );
      harness.remount();
    });
  });
});
