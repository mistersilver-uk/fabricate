/**
 * THE PICKER KEEPS DOM FOCUS ON ONE ELEMENT (issue 1503).
 *
 * `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element —
 * the HOLDER — and drive selection with `aria-activedescendant`, and forbids roving focus onto
 * the option rows because it re-arms Foundry's canvas bindings: with focus on a row, Space pauses
 * the game and the arrows pan the map behind the open window. There is a second, independent
 * reason the rows must not take focus, and it is visual: `styles/fabricate.css` rings any focused
 * `[tabindex]` under `.fabricate` with a 2px accent outline at a POSITIVE offset, and every
 * option row is now a `[tabindex]` element, so a row that took focus would draw a competing ring
 * around the keyboard cursor's own inset one.
 *
 * ── WHY THESE ASSERTIONS AND NOT "THE ARROWS WORK" ──────────────────────────────────────────
 * The arithmetic — wrap, the ends, the grid axes, the -1 sentinel — is proved in
 * `tests/util/listbox-navigation.test.js` against the pure module, without a compile or a DOM.
 * What only a mount can prove is the WIRING, and each clause here is a different way for the
 * wiring to be wrong while the arithmetic is right:
 *
 *   - focus INVARIANCE across a long run of presses, dispatched on `document.activeElement` so
 *     the test cannot accidentally keep addressing an element the model has already left;
 *   - the holder's `aria-activedescendant` naming a row that EXISTS, which is the whole
 *     substitute for focus as far as a screen reader is concerned;
 *   - the -1 sentinel being observable — no row marked before the first arrow key, and Enter
 *     doing NOTHING until one is;
 *   - the pointer path suppressing focus, which happy-dom cannot show as a focus move at all
 *     (it never moves focus on `mousedown`), so the assertion is on `defaultPrevented`;
 *   - the empty branch omitting BOTH activedescendant attributes, because the `role="listbox"`
 *     element they would point at does not render there.
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { placeCaret } from '../helpers/listboxKeyboardDriver.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const TAGS = [
  { id: 'metal', label: 'Metal', icon: 'fas fa-tag' },
  { id: 'wood', label: 'Wood', icon: 'fas fa-tag' },
  { id: 'cloth', label: 'Cloth', icon: 'fas fa-tag' },
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-picker-keyboard-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
  ],
  componentPath: 'src/ui/svelte/components/SearchablePopover.svelte',
});

const chosen = [];

const mountPicker = (props) =>
  harness.mount({
    options: TAGS,
    triggerLabel: 'Tag',
    triggerAriaLabel: 'Add tag',
    dialogAriaLabel: 'Add tag',
    searchPlaceholder: 'Search tags...',
    emptyHint: 'No tags defined',
    onChoose: (id) => {
      chosen.push(id);
    },
    ...props,
  });

/** The trigger button, which is the picker root's own first button. */
const trigger = () => harness.target.querySelector('.fabricate-picker button');

/**
 * Open the picker and settle the focus move.
 *
 * The primitive focuses its query field from a `queueMicrotask` inside an effect, and returns
 * focus to the trigger from a `tick().then(...)`, so both directions need a real turn of the
 * loop rather than a `flushSync`.
 */
async function openPanel() {
  trigger().click();
  flushSync();
  await settle();
  return harness.target.querySelector('.fabricate-picker-popover');
}

/** Let Svelte's flush and the primitive's own microtask-scheduled focus moves run. */
async function settle() {
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

/**
 * Press a key ON THE ELEMENT THAT CURRENTLY HOLDS FOCUS.
 *
 * Addressing `document.activeElement` rather than a captured node is the point: a model that
 * moved focus onto a row would have this test's own keystrokes follow it, and a run that kept
 * dispatching at the original holder could report an unchanged `activeElement` while the browser
 * had in fact moved on.
 */
function pressKey(key, modifiers = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  document.activeElement.dispatchEvent(event);
  flushSync();
  return event;
}

/** The panel's option rows, in rendered order. */
const optionRows = (panel) => [...panel.querySelectorAll('[role="option"]')];

/** The row the model marks as the keyboard cursor's, of which there must never be more than one. */
const markedRows = (panel) => [...panel.querySelectorAll('[data-active-option="true"]')];

/** The holder's activedescendant, or `null` when it names nothing. */
const activeDescendant = (holder) => holder.getAttribute('aria-activedescendant');

/** Type into the panel's query field, as a GM filtering the list does. */
function search(panel, term) {
  const field = panel.querySelector('.manager-travel-popover-search input');
  field.value = term;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  flushSync();
  return field;
}

/** Type a query and then PUT THE CARET SOMEWHERE, which is the whole subject of the caret clauses. */
function searchWithCaret(panel, term, caret) {
  return placeCaret(search(panel, term), caret);
}

describe('1503 SearchablePopover — the listbox focus model', () => {
  before(harness.setup);
  after(harness.teardown);

  describe('the search shape, where the query field is the holder', () => {
    it('keeps DOM focus on the query field across ten ArrowDown presses', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      assert.ok(Boolean(holder), 'the panel renders a query field');
      assert.equal(
        document.activeElement,
        holder,
        'the query field takes focus on open, so it is the element the arrows are pressed on'
      );
      assert.equal(holder.getAttribute('role'), 'combobox');
      assert.equal(
        holder.getAttribute('aria-controls'),
        panel.querySelector('[role="listbox"]').id,
        'the holder points at the list it drives, and that id resolves to a rendered element'
      );

      const rows = optionRows(panel);
      assert.equal(rows.length, 3, 'three options, so ten presses wrap more than once');

      const announced = [];
      for (let press = 0; press < 10; press += 1) {
        const event = pressKey('ArrowDown');
        assert.ok(
          event.defaultPrevented,
          `press ${press + 1} is consumed by the listbox rather than scrolling the panel`
        );
        assert.ok(
          document.activeElement === holder,
          `press ${press + 1} moved DOM focus off the holder to <${document.activeElement?.tagName}>`
        );
        announced.push(activeDescendant(holder));
      }

      assert.deepEqual(
        announced,
        [0, 1, 2, 0, 1, 2, 0, 1, 2, 0].map((index) => rows[index].id),
        'the cursor advances one row per press and wraps, while focus never moves'
      );
      assert.deepEqual(
        markedRows(panel).map((row) => row.id),
        [rows[0].id],
        'exactly one row is marked, and it is the one the holder names'
      );
      harness.remount();
    });

    it('leaves the whole list unmarked until the first arrow key', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      assert.deepEqual(
        markedRows(panel).map((row) => row.id),
        [],
        'the sentinel is -1, not 0: an open panel has no keyboard cursor until the GM asks for one'
      );
      assert.equal(
        activeDescendant(holder),
        null,
        'a holder that names no row is what makes the absent cursor audible as well as visible'
      );
      assert.deepEqual(
        optionRows(panel).map((row) => row.getAttribute('tabindex')),
        ['-1', '-1', '-1'],
        'every row is out of the tab order, so Tab cannot walk focus into the list either'
      );
      assert.deepEqual(
        optionRows(panel).map((row) => row.getAttribute('data-keyboard-focus')),
        ['true', 'true', 'true'],
        'a `tabindex="-1"` non-form element must declare itself focused to Foundry'
      );
      harness.remount();
    });

    it('drops the cursor when the query rebuilds the list', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(activeDescendant(holder), optionRows(panel)[1].id, 'the cursor is on row 2');

      search(panel, 'o');
      assert.deepEqual(
        optionRows(panel).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Wood', 'Cloth'],
        'the query rebuilt the list, so index 1 now names a different option than it did'
      );
      assert.deepEqual(
        markedRows(panel).map((row) => row.id),
        [],
        'index 1 in the OLD list is not a cursor position in the new one, so there is no cursor'
      );
      assert.equal(activeDescendant(holder), null);
      harness.remount();
    });

    it('never marks a row of the INCOMING list with the outgoing cursor', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(activeDescendant(holder), optionRows(panel)[1].id, 'the cursor is on Wood');

      // THE DEFECT THIS REFUSES IS A WINDOW, NOT A STATE, so the assertion is on the DOM's own
      // record of what happened rather than on what is there afterwards. Cleared from an
      // `$effect`, the cursor is reset AFTER the derived pass that rebuilt the list — so index 1
      // is written onto the new row at index 1 (Cloth) and taken off again in the same
      // `flushSync`, and every assertion in this file that reads the settled DOM reports clean.
      // A `MutationObserver` sees both writes; `oldValue === null` is the one that says GAINED.
      const observer = new window.MutationObserver(() => {});
      observer.observe(panel, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-active-option'],
        attributeOldValue: true,
      });
      search(panel, 'o');
      const gained = observer
        .takeRecords()
        .filter((record) => record.oldValue === null)
        .map((record) => record.target.textContent.replace(/\s+/g, ' ').trim());
      observer.disconnect();

      assert.deepEqual(
        optionRows(panel).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Wood', 'Cloth'],
        'the query rebuilt the list, so index 1 names Cloth where it named Wood'
      );
      assert.deepEqual(
        gained,
        [],
        'no row of the new list is EVER marked by a cursor the GM set in the old one, not even ' +
          'for the one flush a reset written as an `$effect` would take to correct it'
      );
      harness.remount();
    });

    it('drops the cursor when the CALLER replaces the options under an open panel', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(activeDescendant(holder), optionRows(panel)[1].id, 'the cursor is on Wood');

      // The third input that rebuilds the list, and the only one that reaches neither `toggle`
      // nor a keystroke: a caller swapping `options` while the panel is open with the query
      // unchanged. Same COUNT, different vocabulary — so a generation keyed on the query alone
      // would carry index 1 over onto a row the GM has never seen, and Enter would choose it.
      await harness.setProps({
        options: [
          { id: 'iron', label: 'Iron' },
          { id: 'silver', label: 'Silver' },
          { id: 'gold', label: 'Gold' },
        ],
      });
      const replaced = harness.target.querySelector('.fabricate-picker-popover');
      assert.deepEqual(
        optionRows(replaced).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Iron', 'Silver', 'Gold'],
        'the panel is still open over an entirely different list'
      );
      assert.deepEqual(markedRows(replaced).map((row) => row.id), [], 'and nothing in it is active');
      assert.equal(activeDescendant(replaced.querySelector('.manager-travel-popover-search input')), null);
      harness.remount();
    });

    it('does nothing on Enter until a row is active, then chooses that row', async () => {
      chosen.length = 0;
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      const ignored = pressKey('Enter');
      assert.deepEqual(chosen, [], 'Enter with no cursor must not choose the first row for the GM');
      assert.ok(
        !ignored.defaultPrevented,
        'an Enter this widget does not act on is left to the form/field it was pressed in'
      );
      assert.ok(
        Boolean(harness.target.querySelector('.fabricate-picker-popover')),
        'and the panel stays open, because nothing was chosen'
      );

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(activeDescendant(holder), optionRows(panel)[1].id);
      const acted = pressKey('Enter');
      assert.ok(acted.defaultPrevented, 'the Enter that chooses is consumed');
      assert.deepEqual(chosen, ['wood'], 'Enter chooses the row the holder was naming');
      harness.remount();
    });

    it('reaches the ends with Home and End and leaves a typed character alone', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      const rows = optionRows(panel);

      pressKey('End');
      assert.equal(activeDescendant(holder), rows[2].id);
      pressKey('Home');
      assert.equal(activeDescendant(holder), rows[0].id);

      const typed = pressKey('m');
      assert.ok(
        !typed.defaultPrevented,
        'a printable character belongs to the query field; consuming it would make the search ' +
          'field unusable while the panel is open'
      );
      assert.equal(document.activeElement, holder);
      harness.remount();
    });

    it('refuses a modified ARROW too, which no caret rule would have saved', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      // THE MODIFIER GUARD IS GENERAL, and the caret boundary cannot stand in for it: ArrowUp and
      // ArrowDown are not caret keys at all, so `caretOwnsKey` returns false for them at every
      // offset and a widget that only consulted the boundary would take `Shift+ArrowDown` and
      // move the cursor. `Shift+ArrowDown` in a text field extends the selection to the end of
      // the value in every browser, and `Ctrl+ArrowUp` is a paragraph jump — neither is anything
      // this list has an answer for. The spec states the rule over EVERY key the holder consumes
      // for exactly this reason, `Enter` alone excepted.
      for (const [key, modifiers] of [
        ['ArrowDown', { shiftKey: true }],
        ['ArrowUp', { ctrlKey: true }],
        ['ArrowDown', { altKey: true }],
        ['ArrowDown', { metaKey: true }],
      ]) {
        const pressed = pressKey(key, modifiers);
        const name = `${Object.keys(modifiers)[0].replace('Key', '')}+${key}`;
        assert.ok(!pressed.defaultPrevented, `${name} belongs to the field`);
        assert.equal(activeDescendant(holder), null, `${name} moved the cursor`);
      }

      // AND THE CONTROL IS THE SAME KEY UNMODIFIED, so the loop above cannot be passing because
      // the arrows stopped working altogether.
      assert.ok(pressKey('ArrowDown').defaultPrevented);
      assert.equal(activeDescendant(holder), optionRows(panel)[0].id);
      harness.remount();
    });

    it('suppresses the pointer default so a click chooses without moving focus', async () => {
      chosen.length = 0;
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      const row = optionRows(panel)[1];

      // happy-dom never moves focus on `mousedown`, so an assertion that `activeElement` is
      // unchanged here would pass whether or not the component suppressed anything. The
      // suppression itself is what is asserted, because that is the mechanism a real browser
      // acts on.
      const mousedown = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
      row.dispatchEvent(mousedown);
      flushSync();
      assert.ok(
        mousedown.defaultPrevented,
        'without this a click would focus the row, re-arm the canvas bindings and draw a second ' +
          'accent ring at a positive offset around the keyboard cursor'
      );
      assert.equal(document.activeElement, holder);

      row.click();
      flushSync();
      assert.deepEqual(chosen, ['wood'], 'and the click still chooses');
      harness.remount();
    });

    it('returns focus to the trigger on Escape', async () => {
      await mountPicker({});
      const panel = await openPanel();
      assert.equal(document.activeElement, panel.querySelector('input'));

      pressKey('Escape');
      await settle();
      assert.ok(
        !harness.target.querySelector('.fabricate-picker-popover'),
        'Escape closes the panel'
      );
      assert.equal(
        document.activeElement,
        trigger(),
        'and focus lands back on the control the GM opened, not on the document body'
      );
      harness.remount();
    });

    it('opens with no cursor after a close, even with the same options and an empty query', async () => {
      chosen.length = 0;
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      pressKey('ArrowDown');
      pressKey('ArrowDown');
      assert.equal(activeDescendant(holder), optionRows(panel)[1].id, 'the cursor is on Wood');

      pressKey('Escape');
      await settle();
      assert.ok(!harness.target.querySelector('.fabricate-picker-popover'), 'the panel is shut');

      // A CURSOR CANNOT OUTLIVE ITS PANEL EITHER, and the generation stamp alone cannot see this
      // one: with the same `options` and the query reset to empty, the string this reopen builds
      // is BYTE-IDENTICAL to the one the abandoned index was stamped under, so a cursor kept
      // across the close reads as live again. Three presses reach it — arrow, Escape, reopen —
      // and the panel would come back with a row marked, the holder naming it, the list scrolled
      // to it and Enter choosing it without the GM ever arrowing into this pass.
      const reopened = await openPanel();
      const reopenedHolder = reopened.querySelector('.manager-travel-popover-search input');

      assert.deepEqual(
        optionRows(reopened).map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
        ['Metal', 'Wood', 'Cloth'],
        'the same three options and no query, which is what makes the generation repeat'
      );
      assert.deepEqual(
        markedRows(reopened).map((row) => row.id),
        [],
        'opening starts a fresh pass over the options, so nothing in the new list is active'
      );
      assert.equal(
        activeDescendant(reopenedHolder),
        null,
        'and the holder names no row, because there is no cursor for it to announce'
      );

      const ignored = pressKey('Enter');
      assert.deepEqual(chosen, [], 'Enter stays a no-op until the GM arrows into THIS pass');
      assert.ok(!ignored.defaultPrevented, 'so the key is left to the field it was pressed in');
      harness.remount();
    });
  });

  describe('the search-suppressed shape, where the TRIGGER is the holder', () => {
    it('makes the trigger the combobox and keeps focus on it while the panel is open', async () => {
      await mountPicker({ showSearch: false, triggerHasPopup: 'listbox' });
      const button = trigger();
      button.focus();
      const panel = await openPanel();

      assert.ok(!panel.querySelector('input'), 'this shape renders no query field at all');
      assert.equal(button.getAttribute('role'), 'combobox');
      assert.equal(
        button.getAttribute('data-keyboard-focus'),
        'true',
        'a formless <button> answers Foundry`s `hasFocus` false, so the holder must declare ' +
          'itself or every keybinding stays live while it holds focus'
      );
      assert.equal(
        button.getAttribute('aria-controls'),
        panel.querySelector('[role="listbox"]').id
      );
      assert.equal(
        document.activeElement,
        button,
        'the trigger, not the panel, is the element focus stays on in this shape'
      );

      const rows = optionRows(panel);
      const announced = [];
      for (let press = 0; press < 10; press += 1) {
        pressKey('ArrowDown');
        assert.ok(
          document.activeElement === button,
          `press ${press + 1} moved focus off the trigger to <${document.activeElement?.tagName}>`
        );
        announced.push(activeDescendant(button));
      }
      assert.deepEqual(
        announced,
        [0, 1, 2, 0, 1, 2, 0, 1, 2, 0].map((index) => rows[index].id),
        'the cursor wraps over the rows while the trigger keeps focus throughout'
      );
      harness.remount();
    });

    it('consumes the Enter that chooses, so it cannot also toggle the trigger shut', async () => {
      chosen.length = 0;
      await mountPicker({ showSearch: false, triggerHasPopup: 'listbox' });
      trigger().focus();
      const panel = await openPanel();

      pressKey('ArrowDown');
      assert.equal(activeDescendant(trigger()), optionRows(panel)[0].id);
      const acted = pressKey('Enter');
      assert.ok(
        acted.defaultPrevented,
        'an unprevented Enter on a <button> fires its click, which would toggle the panel shut ' +
          'instead of choosing the row the GM had arrowed to'
      );
      assert.deepEqual(chosen, ['metal']);
      harness.remount();
    });

    it('answers a MODIFIED Enter too, which is the one key the modifier rule excepts', async () => {
      chosen.length = 0;
      await mountPicker({ showSearch: false, triggerHasPopup: 'listbox' });
      trigger().focus();
      const panel = await openPanel();

      pressKey('ArrowDown');
      assert.equal(activeDescendant(trigger()), optionRows(panel)[0].id);
      const acted = pressKey('Enter', { shiftKey: true });
      assert.ok(
        acted.defaultPrevented,
        'the general modifier rule is answered AFTER Enter for exactly this reason: a declined ' +
          "Shift+Enter reaches the button's own activation and shuts the panel"
      );
      assert.deepEqual(chosen, ['metal'], 'so it confirms the row the GM had arrowed to');
      harness.remount();
    });
  });

  describe('the empty branch, where there is no list to point at', () => {
    it('names neither a list nor a row, because the listbox element does not render', async () => {
      await mountPicker({ options: [] });
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      assert.ok(
        !panel.querySelector('[role="listbox"]'),
        'the empty branch replaces the list rather than rendering an empty one'
      );
      assert.ok(Boolean(panel.querySelector('.manager-travel-popover-empty')), 'it renders a note');
      assert.equal(
        holder.getAttribute('aria-controls'),
        null,
        'an `aria-controls` pointing at an id that resolves to no element is a defect, so the ' +
          'attribute is conditioned on the same predicate the list is'
      );
      assert.equal(holder.getAttribute('aria-activedescendant'), null);
      assert.equal(
        holder.getAttribute('role'),
        'combobox',
        'the holder is still the holder — it is the LIST that is absent, not the control'
      );

      const inert = pressKey('ArrowDown');
      assert.ok(
        !inert.defaultPrevented,
        'with nothing to move a cursor over, the arrows are left to the field'
      );
      assert.equal(document.activeElement, holder);
      assert.equal(holder.getAttribute('aria-activedescendant'), null);
      harness.remount();
    });

    it('drops the list and the cursor together when a query empties it', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      pressKey('ArrowDown');
      assert.ok(Boolean(activeDescendant(holder)), 'a cursor exists while the list does');

      search(panel, 'zzz');
      assert.ok(!panel.querySelector('[role="listbox"]'), 'the filtered-to-nothing branch renders');
      assert.equal(holder.getAttribute('aria-controls'), null);
      assert.equal(holder.getAttribute('aria-activedescendant'), null);
      harness.remount();
    });
  });

  describe('the caret boundary, where the holder is a TEXT FIELD', () => {
    // Four keys are the caret's before they are the cursor's, and the component hands each of
    // them over only from the edge at which the caret would not move. Every clause below fixes
    // the same query — `o`, which matches Wood and Cloth — and varies ONLY where the caret sits,
    // so a clause that passed for a reason other than the boundary would have to pass for both
    // positions and the pair would collapse.

    it('takes End for the cursor when the caret is already at the end of the query', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      searchWithCaret(panel, 'o', 1);

      const pressed = pressKey('End');
      assert.ok(pressed.defaultPrevented, 'there is nowhere for the caret to go, so the list has it');
      assert.equal(
        activeDescendant(holder),
        optionRows(panel)[1].id,
        'End reaches the last row of the FILTERED list, which is what the key is for'
      );
      harness.remount();
    });

    it('leaves End to the caret while there is text to its right', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      searchWithCaret(panel, 'o', 0);

      const pressed = pressKey('End');
      assert.ok(
        !pressed.defaultPrevented,
        'a GM editing a query must keep the key that jumps to the end of what they typed'
      );
      assert.equal(
        activeDescendant(holder),
        null,
        'and the cursor does not move either, or the key would do two things at once'
      );
      assert.deepEqual(markedRows(panel).map((row) => row.id), []);
      harness.remount();
    });

    it('takes Home for the cursor at the start of the query and leaves it otherwise', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      searchWithCaret(panel, 'o', 1);
      const left = pressKey('Home');
      assert.ok(!left.defaultPrevented, 'there is text to the caret`s left, so Home is the field`s');
      assert.equal(activeDescendant(holder), null);

      searchWithCaret(panel, 'o', 0);
      const taken = pressKey('Home');
      assert.ok(taken.defaultPrevented, 'at the start of the query the caret cannot move, so the list has it');
      assert.equal(activeDescendant(holder), optionRows(panel)[0].id);
      harness.remount();
    });

    it('leaves a SELECTION alone whichever edge it touches', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      searchWithCaret(panel, 'o', [0, 1]);

      const pressed = pressKey('End');
      assert.ok(
        !pressed.defaultPrevented,
        'End over a selection collapses it to the end of the value — a caret movement the ' +
          'offsets alone would report as "nowhere to go", because both edges are at a boundary'
      );
      assert.equal(activeDescendant(holder), null);
      harness.remount();
    });

    it('never takes a MODIFIED caret key, even from the edge that would hand it over', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      searchWithCaret(panel, 'o', 1);

      // The caret is at the edge, so the boundary rule ALONE would hand every one of these to
      // the list. `Shift+End` selects to the end of the query and `Ctrl+Home` jumps to its
      // start: they are the ordinary way a GM fixes a typo in a long search, and none of them
      // is a cursor movement this widget has anything to offer in exchange for.
      for (const [key, modifiers] of [
        ['End', { shiftKey: true }],
        ['Home', { ctrlKey: true }],
        ['End', { metaKey: true }],
        ['ArrowRight', { shiftKey: true }],
      ]) {
        const pressed = pressKey(key, modifiers);
        const name = `${Object.keys(modifiers)[0].replace('Key', '')}+${key}`;
        assert.ok(!pressed.defaultPrevented, `${name} belongs to the field`);
        assert.equal(activeDescendant(holder), null, `${name} moved the cursor`);
      }
      harness.remount();
    });

    it('keeps the whole map on a TRIGGER holder, which has no caret to protect', async () => {
      await mountPicker({ showSearch: false, triggerHasPopup: 'listbox' });
      const button = trigger();
      button.focus();
      const panel = await openPanel();
      const rows = optionRows(panel);

      // A `<button>` has no `selectionStart` at all, so the boundary predicate is false for it by
      // construction and the five search-suppressed call sites keep exactly today's key map.
      const pressed = pressKey('End');
      assert.ok(pressed.defaultPrevented, 'End on a trigger holder is the list`s, as it always was');
      assert.equal(activeDescendant(button), rows[2].id);
      assert.ok(pressKey('Home').defaultPrevented);
      assert.equal(activeDescendant(button), rows[0].id);
      harness.remount();
    });

    it('gives a FRESHLY OPENED panel all four keys, because the query is empty', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      // Both edges of an empty field are the same position, so nothing is owed to the caret —
      // and this is the state a GM is in when they actually arrow through a list.
      assert.equal(holder.value, '', 'the panel opens with no query');
      assert.ok(pressKey('End').defaultPrevented);
      assert.equal(activeDescendant(holder), optionRows(panel)[2].id);
      assert.ok(pressKey('Home').defaultPrevented);
      assert.equal(activeDescendant(holder), optionRows(panel)[0].id);
      harness.remount();
    });
  });

  describe('the grid form, whose horizontal axis competes with the same caret', () => {
    it('takes ArrowRight at the end of the query and leaves it mid-query', async () => {
      await mountPicker({ as: 'grid', columns: 2 });
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      // ArrowLeft/Right are not a convenience here: with two columns ArrowDown steps +2 over the
      // flat order, so on an even filtered count half the tiles are unreachable without them.
      searchWithCaret(panel, 'o', 1);
      assert.ok(pressKey('ArrowRight').defaultPrevented, 'at the end of the query the grid has it');
      assert.equal(activeDescendant(holder), optionRows(panel)[0].id);

      // The query is UNCHANGED, so the list — and therefore the cursor — is the same one; only
      // the caret moved. That is what makes the pair a controlled comparison.
      searchWithCaret(panel, 'o', 0);
      const left = pressKey('ArrowRight');
      assert.ok(!left.defaultPrevented, 'with text to its right the caret keeps it');
      assert.equal(
        activeDescendant(holder),
        optionRows(panel)[0].id,
        'and the cursor stayed exactly where the previous press put it'
      );
      harness.remount();
    });

    it('takes ArrowLeft at the start of the query and leaves it mid-query', async () => {
      await mountPicker({ as: 'grid', columns: 2 });
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      searchWithCaret(panel, 'o', 0);
      assert.ok(pressKey('ArrowLeft').defaultPrevented, 'at the start of the query the grid has it');
      assert.equal(activeDescendant(holder), optionRows(panel)[1].id, 'ArrowLeft from the sentinel lands on the END of the flat order');

      searchWithCaret(panel, 'o', 1);
      const kept = pressKey('ArrowLeft');
      assert.ok(!kept.defaultPrevented, 'with text to its left the caret keeps it');
      assert.equal(
        activeDescendant(holder),
        optionRows(panel)[1].id,
        'and the cursor stayed where the previous press put it, because only the caret moved'
      );
      harness.remount();
    });
  });

  describe('the panel`s own chrome, which must not become the focus holder', () => {
    it('suppresses a mousedown on the panel inset so DOM focus stays on the holder', async () => {
      await mountPicker({});
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');

      // The panel is `role="dialog" tabindex="-1"`, so it is the nearest focusable ancestor of
      // its own inset, its inter-row gaps, its header and its empty note. A click landing on any
      // of them would focus the DIALOG — and the key map is bound to the holder, so the arrows
      // would stop moving and typing would go nowhere, with no ring drawn to explain it because
      // the module root rings `:focus-visible` only and a mouse click does not match it.
      const onPanel = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
      panel.dispatchEvent(onPanel);
      flushSync();
      assert.ok(
        onPanel.defaultPrevented,
        'without this the panel takes focus off the holder and the whole keyboard model dies'
      );
      assert.equal(document.activeElement, holder);

      // AND THE EXCEPTION IS REAL. Suppressing the field`s own `mousedown` would break caret
      // placement and text selection in the one control the GM types into.
      const onField = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
      holder.dispatchEvent(onField);
      flushSync();
      assert.ok(
        !onField.defaultPrevented,
        'the query field owns its caret, so its pointer default is left alone'
      );
      harness.remount();
    });
  });

  describe('the caller seam that feeds the cursor its list', () => {
    it('renders the empty branch when `filterOptions` returns something that is not an array', async () => {
      // Everything downstream INDEXES what the seam returns — the cursor arithmetic, the option
      // ids, `renderedOptions[activeIndex]` — so a seam returning a bare object or a string would
      // throw inside a `$derived` and take the whole panel down, with a stack that names this
      // component rather than the caller that misread the contract. The coercion belongs here
      // because this is where the assumption is made.
      await mountPicker({ filterOptions: () => 'not an array' });
      const panel = await openPanel();

      assert.ok(!panel.querySelector('[role="listbox"]'), 'no list, because there are no rows');
      assert.ok(
        Boolean(panel.querySelector('.manager-travel-popover-empty')),
        'the empty branch renders instead of the panel dying'
      );
      assert.ok(!pressKey('ArrowDown').defaultPrevented, 'and there is no cursor to move');
      harness.remount();
    });
  });

  describe('the grouped branch, whose ids are numbered over the FLAT rendered order', () => {
    it('gives every row across every bucket a distinct id the cursor walks in order', async () => {
      await mountPicker({
        optionGroups: [
          { id: 'hard', label: 'Hard' },
          { id: 'soft', label: 'Soft' },
        ],
        options: [
          { id: 'metal', label: 'Metal', group: 'hard' },
          { id: 'stone', label: 'Stone', group: 'hard' },
          { id: 'cloth', label: 'Cloth', group: 'soft' },
          { id: 'loose', label: 'Loose' },
        ],
      });
      const panel = await openPanel();
      const holder = panel.querySelector('.manager-travel-popover-search input');
      const rows = optionRows(panel);

      assert.equal(rows.length, 4, 'four rows across three buckets, one of them heading-less');
      assert.equal(
        new Set(rows.map((row) => row.id)).size,
        4,
        'a per-bucket index would restart at 0 in every group and emit duplicate DOM ids, which ' +
          'is what makes `aria-activedescendant` ambiguous rather than merely untidy'
      );

      const announced = [];
      for (let press = 0; press < 5; press += 1) {
        pressKey('ArrowDown');
        announced.push(activeDescendant(holder));
      }
      assert.deepEqual(
        announced,
        [rows[0].id, rows[1].id, rows[2].id, rows[3].id, rows[0].id],
        'the cursor walks the rows in the order they are DRAWN — the concatenation of the ' +
          'buckets — and wraps at the end of the last one'
      );
      harness.remount();
    });
  });
});
