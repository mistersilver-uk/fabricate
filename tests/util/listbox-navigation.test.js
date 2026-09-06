import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  activeOptionId,
  nextActiveIndex,
  typeAheadCursor,
} from '../../src/ui/svelte/util/listboxNavigation.js';

// The arithmetic of a keyboard cursor over a listbox, unit-tested WITHOUT MOUNTING (issue 1503).
// That is the whole reason the module exists: `SearchablePopover` holds the cursor as component
// state, and proving that ArrowDown wraps from the last row to the first through a mounted DOM
// costs a compile, a happy-dom document and ten synthesized events per case. The mounted suite
// proves the WIRING — which element listens, what `aria-activedescendant` says, that focus never
// moves — and this proves the numbers.

describe('listbox navigation: the cursor arithmetic', () => {
  describe('nextActiveIndex', () => {
    it('enters the list from the ends, because -1 means NOTHING is active', () => {
      // -1 is not "before the first row", it is "the GM has not arrowed into this list at all",
      // which is why ArrowUp from it lands on the LAST row rather than staying put.
      assert.equal(nextActiveIndex(-1, 4, 'ArrowDown'), 0);
      assert.equal(nextActiveIndex(-1, 4, 'ArrowUp'), 3);
    });

    it('steps one row per press in a single-column list', () => {
      assert.equal(nextActiveIndex(0, 4, 'ArrowDown'), 1);
      assert.equal(nextActiveIndex(2, 4, 'ArrowDown'), 3);
      assert.equal(nextActiveIndex(2, 4, 'ArrowUp'), 1);
    });

    it('wraps at both ends', () => {
      // A picker's list is a closed ring rather than a scrollbar: the tenth ArrowDown in a
      // four-option list has to land somewhere, and stopping at the bottom makes a long list
      // unreachable upwards from the top.
      assert.equal(nextActiveIndex(3, 4, 'ArrowDown'), 0);
      assert.equal(nextActiveIndex(0, 4, 'ArrowUp'), 3);
    });

    it('reaches the ends with Home and End', () => {
      assert.equal(nextActiveIndex(2, 4, 'Home'), 0);
      assert.equal(nextActiveIndex(2, 4, 'End'), 3);
      assert.equal(nextActiveIndex(-1, 4, 'Home'), 0);
      assert.equal(nextActiveIndex(-1, 4, 'End'), 3);
    });

    it('leaves a printable character and every non-navigation key alone', () => {
      // `null` is the signal the caller needs: the holder is a QUERY FIELD, so a key this module
      // does not own must fall through to the input rather than being consumed. A module that
      // returned `current` instead would be indistinguishable from "the cursor did not move", and
      // the component would `preventDefault()` every letter the GM types.
      for (const key of ['a', 'Z', '1', ' ', 'Enter', 'Escape', 'Tab', 'PageDown', 'Backspace']) {
        assert.equal(nextActiveIndex(1, 4, key), null, `${key} is not a cursor key`);
      }
    });

    it('has nothing to move when the list is empty', () => {
      // The empty branch renders no listbox at all, so every navigation key is inert there.
      for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
        assert.equal(nextActiveIndex(-1, 0, key), null, `${key} over an empty list`);
      }
    });

    it('treats a count that is not a positive integer as an empty list', () => {
      for (const count of [-1, 1.5, NaN, '3', null, undefined]) {
        assert.equal(nextActiveIndex(0, count, 'ArrowDown'), null, `count ${String(count)}`);
      }
    });

    it('treats an out-of-range cursor as nothing active rather than clamping it', () => {
      // A query change resets the cursor, but a caller that swaps `options` under an open panel
      // can leave the index past the end of the new list. Re-entering from the end is the only
      // reading that cannot select a row the GM never saw.
      assert.equal(nextActiveIndex(9, 3, 'ArrowDown'), 0);
      assert.equal(nextActiveIndex(9, 3, 'ArrowUp'), 2);
      assert.equal(nextActiveIndex(NaN, 3, 'ArrowDown'), 0);
      assert.equal(nextActiveIndex(1.5, 3, 'ArrowDown'), 0);
    });

    it('has no horizontal axis in a single-column list', () => {
      // ArrowLeft in a one-column list is not "the previous row": nothing sits to the left of a
      // row, and consuming the key would take Left/Right away from the query field's own caret.
      assert.equal(nextActiveIndex(1, 4, 'ArrowLeft'), null);
      assert.equal(nextActiveIndex(1, 4, 'ArrowRight'), null);
      assert.equal(nextActiveIndex(1, 4, 'ArrowLeft', { columns: 1 }), null);
    });

    it('moves by a row on the vertical axis and by a cell on the horizontal one in a grid', () => {
      // The grid form of the panel (`as="grid"`, the source picker's image tiles): ArrowDown is a
      // ROW, which is `columns` cells, and ArrowRight is one cell.
      assert.equal(nextActiveIndex(0, 6, 'ArrowDown', { columns: 3 }), 3);
      assert.equal(nextActiveIndex(3, 6, 'ArrowUp', { columns: 3 }), 0);
      assert.equal(nextActiveIndex(0, 6, 'ArrowRight', { columns: 3 }), 1);
      assert.equal(nextActiveIndex(1, 6, 'ArrowLeft', { columns: 3 }), 0);
    });

    it('wraps a grid over the FLAT order, so a ragged last row is still reachable', () => {
      // Five options in three columns leaves a two-cell last row. Wrapping over the flat index
      // rather than over a rectangle is what keeps every option reachable from every other.
      assert.equal(nextActiveIndex(4, 5, 'ArrowDown', { columns: 3 }), 2);
      assert.equal(nextActiveIndex(0, 5, 'ArrowUp', { columns: 3 }), 2);
      assert.equal(nextActiveIndex(4, 5, 'ArrowRight', { columns: 3 }), 0);
      assert.equal(nextActiveIndex(0, 5, 'ArrowLeft', { columns: 3 }), 4);
    });

    it('enters a grid at an end rather than at a row offset', () => {
      assert.equal(nextActiveIndex(-1, 6, 'ArrowDown', { columns: 3 }), 0);
      assert.equal(nextActiveIndex(-1, 6, 'ArrowUp', { columns: 3 }), 5);
      assert.equal(nextActiveIndex(-1, 6, 'ArrowRight', { columns: 3 }), 0);
      assert.equal(nextActiveIndex(-1, 6, 'ArrowLeft', { columns: 3 }), 5);
    });

    it('falls back to one column when `columns` is not a usable number', () => {
      for (const columns of [0, -2, 1.5, NaN, 'two', null, undefined]) {
        assert.equal(
          nextActiveIndex(0, 4, 'ArrowDown', { columns }),
          1,
          `columns ${String(columns)} steps one row`
        );
        assert.equal(
          nextActiveIndex(0, 4, 'ArrowRight', { columns }),
          null,
          `columns ${String(columns)} has no horizontal axis`
        );
      }
    });

    it('reads no options object at all', () => {
      assert.equal(nextActiveIndex(0, 4, 'ArrowDown', undefined), 1);
    });
  });

  // ── THE DISABLED AXIS (issue 1504) ────────────────────────────────────────────────────────
  //
  // A converted `<select>` can gate an option — a premium tier, a mode this world cannot reach —
  // and a cursor that lands on one announces a row whose Enter does nothing. The predicate is an
  // INDEX predicate rather than the option array so the arithmetic stays off the option shape;
  // these cases are the arithmetic, and the mounted suite proves the wiring that supplies it.
  describe('nextActiveIndex with an `isDisabled` predicate', () => {
    /** Rows 1 and 2 of a four-row list are gated, so a skip has to cross more than one. */
    const gated = (...indexes) => {
      const set = new Set(indexes);
      return (index) => set.has(index);
    };

    it('steps OVER a gated row rather than landing on it', () => {
      assert.equal(nextActiveIndex(0, 4, 'ArrowDown', { isDisabled: gated(1, 2) }), 3);
      assert.equal(nextActiveIndex(3, 4, 'ArrowUp', { isDisabled: gated(1, 2) }), 0);
    });

    it('keeps the ring closed while it skips, so the last enabled row wraps to the first', () => {
      assert.equal(nextActiveIndex(3, 4, 'ArrowDown', { isDisabled: gated(0) }), 1);
      assert.equal(nextActiveIndex(1, 4, 'ArrowUp', { isDisabled: gated(0) }), 3);
    });

    it('enters the list at the outermost ENABLED row from the sentinel', () => {
      assert.equal(nextActiveIndex(-1, 4, 'ArrowDown', { isDisabled: gated(0) }), 1);
      assert.equal(nextActiveIndex(-1, 4, 'ArrowUp', { isDisabled: gated(3) }), 2);
    });

    it('reaches the nearest ENABLED end with Home and End', () => {
      // EDGE (a). Home landing on a gated first option would announce a row the GM cannot choose
      // and leave Enter a no-op they have no way to explain, so both keys scan INWARD.
      assert.equal(nextActiveIndex(2, 4, 'Home', { isDisabled: gated(0, 1) }), 2);
      assert.equal(nextActiveIndex(1, 4, 'End', { isDisabled: gated(2, 3) }), 1);
      assert.equal(nextActiveIndex(-1, 4, 'Home', { isDisabled: gated(0) }), 1);
      assert.equal(nextActiveIndex(-1, 4, 'End', { isDisabled: gated(3) }), 2);
    });

    it('terminates and holds the cursor still when EVERY option is gated', () => {
      // EDGE (b). The scan is bounded by the row count rather than by "until it comes back
      // round", because a ring with nothing enabled is exactly the case those two differ on: the
      // first terminates, the second spins forever and hangs the window on one keypress.
      const none = () => true;
      for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
        assert.equal(nextActiveIndex(2, 4, key, { isDisabled: none }), 2, `${key} from a row`);
        assert.equal(nextActiveIndex(-1, 4, key, { isDisabled: none }), -1, `${key} from nothing`);
      }
    });

    it('reads an out-of-range cursor as the sentinel when nothing is enabled to move to', () => {
      // A caller that swapped `options` under an open panel can leave the index past the end.
      // Returning it unchanged would have the holder announce an id that resolves to no element.
      assert.equal(nextActiveIndex(9, 3, 'ArrowDown', { isDisabled: () => true }), -1);
    });

    it('seeds at the first ENABLED option when the selected value is itself gated', () => {
      // EDGE (c). This is the idiom a caller opening on a value uses: `Home` from the selected
      // row is "the first row the GM could actually choose", and it is the same answer from the
      // sentinel, so a seed does not need to know whether a value was found.
      const isDisabled = gated(0, 1);
      assert.equal(nextActiveIndex(1, 4, 'Home', { isDisabled }), 2);
      assert.equal(nextActiveIndex(-1, 4, 'Home', { isDisabled }), 2);
      assert.equal(nextActiveIndex(0, 4, 'ArrowDown', { isDisabled }), 2);
    });

    it('walks the FLAT order when it skips in a grid, so a gated column strands nothing', () => {
      // The press is `columns` wide; the skip scan is one cell. A scan that kept stepping by
      // `columns` would only ever visit one column of the ring, so a grid whose first column was
      // gated would leave every enabled tile beside it unreachable.
      assert.equal(nextActiveIndex(0, 6, 'ArrowDown', { columns: 3, isDisabled: gated(3) }), 4);
      assert.equal(nextActiveIndex(4, 6, 'ArrowUp', { columns: 3, isDisabled: gated(1) }), 0);
    });

    it('is TODAY`S ARITHMETIC for every caller that passes no predicate', () => {
      // The compatibility contract in one case: absent `disabled` means absent predicate means
      // the pre-1504 numbers, with no skip scan run at all. A predicate that gates nothing must
      // agree with it, or the axis is not free after all.
      const never = () => false;
      for (const [current, key] of [
        [-1, 'ArrowDown'],
        [-1, 'ArrowUp'],
        [0, 'ArrowDown'],
        [3, 'ArrowDown'],
        [0, 'ArrowUp'],
        [2, 'Home'],
        [2, 'End'],
        [9, 'ArrowDown'],
      ]) {
        const bare = nextActiveIndex(current, 4, key);
        assert.equal(nextActiveIndex(current, 4, key, {}), bare, `${key} from ${current}`);
        assert.equal(
          nextActiveIndex(current, 4, key, { isDisabled: undefined }),
          bare,
          `${key} from ${current} with an undefined predicate`
        );
        assert.equal(
          nextActiveIndex(current, 4, key, { isDisabled: never }),
          bare,
          `${key} from ${current} with a predicate that gates nothing`
        );
      }
    });

    it('still returns null for a key it does not own, whatever is gated', () => {
      assert.equal(nextActiveIndex(1, 4, 'a', { isDisabled: () => true }), null);
      assert.equal(nextActiveIndex(1, 4, 'ArrowLeft', { isDisabled: () => true }), null);
      assert.equal(nextActiveIndex(-1, 0, 'ArrowDown', { isDisabled: () => false }), null);
    });
  });

  // ── THE TYPE-AHEAD (issue 1504) ───────────────────────────────────────────────────────────
  //
  // A native `<select>` jumps to the option a typed character names. Issue 1503 routes printable
  // keys to the query field and a select-only combobox has no query field, so every converted
  // control would lose the behaviour unless it is built back here, once, for all of them.
  describe('typeAheadCursor', () => {
    const LABELS = ['Anvil', 'Beaker', 'Ash', 'Coin', 'Amber'];

    /** The clock, stated rather than read, so the inactivity window is observable. */
    const AT = 10_000;

    /** One keystroke against a stated clock. */
    const type = (current, key, extra = {}) =>
      typeAheadCursor(current, LABELS, key, { now: AT, ...extra });

    it('jumps to the first option whose LABEL begins with the character', () => {
      const typed = type(-1, 'b');
      assert.equal(typed.index, 1);
      assert.deepEqual(typed.buffer, { text: 'b', at: AT });
    });

    it('matches case-insensitively, because a GM does not type the label`s case', () => {
      assert.equal(type(-1, 'B').index, 1);
      assert.equal(type(-1, 'a').index, 0);
      assert.equal(typeAheadCursor(-1, ['ÉCLAT', 'other'], 'é', { now: AT }).index, 0);
    });

    it('CYCLES the options beginning with a repeated character', () => {
      // `a`, `a`, `a` walks Anvil → Ash → Amber → Anvil rather than searching for `aaa`, which
      // is the one behaviour a plain prefix match gets wrong.
      let cursor = -1;
      const walked = [];
      let buffer;
      for (let press = 0; press < 4; press += 1) {
        const typed = type(cursor, 'a', { buffer });
        buffer = typed.buffer;
        cursor = typed.index;
        walked.push(typed.index);
      }
      assert.deepEqual(walked, [0, 2, 4, 0]);
      assert.equal(buffer.text, 'aaaa', 'the buffer still holds every keystroke');
    });

    it('REFINES rather than cycles once the prefix has two different characters', () => {
      // Typing `am` after `a` matched Anvil must reach Amber, and typing `an` must STAY on
      // Anvil — a prefix scan that started at the row after the cursor could never do the second.
      const first = type(-1, 'a');
      assert.equal(first.index, 0, 'the first `a` is Anvil');
      assert.equal(type(first.index, 'm', { buffer: first.buffer }).index, 4, 'Amber');
      assert.equal(type(first.index, 'n', { buffer: first.buffer }).index, 0, 'still Anvil');
    });

    it('resets after the inactivity window, so the same character then cycles again', () => {
      const first = typeAheadCursor(-1, LABELS, 'a', { now: AT });
      assert.equal(first.index, 0);

      const withinWindow = typeAheadCursor(first.index, LABELS, 's', {
        now: AT + 400,
        buffer: first.buffer,
      });
      assert.equal(withinWindow.buffer.text, 'as', 'a keystroke inside the window EXTENDS');
      assert.equal(withinWindow.index, 2, 'and `as` is Ash');

      const afterWindow = typeAheadCursor(first.index, LABELS, 'a', {
        now: AT + 501,
        buffer: first.buffer,
      });
      assert.equal(afterWindow.buffer.text, 'a', 'a keystroke past the window STARTS OVER');
      assert.equal(
        afterWindow.index,
        2,
        'so the second `a` cycles to Ash rather than seeking `aa`'
      );
    });

    it('takes its window from the caller, and 500ms when the caller states none', () => {
      const seed = { text: 'a', at: AT };
      assert.equal(
        typeAheadCursor(0, LABELS, 's', { now: AT + 500, buffer: seed }).buffer.text,
        'as',
        'the boundary itself is still inside the window'
      );
      assert.equal(
        typeAheadCursor(0, LABELS, 's', { now: AT + 200, buffer: seed, resetAfter: 100 }).buffer
          .text,
        's',
        'a caller may state a shorter window'
      );
    });

    it('reads the clock itself when the caller states none', () => {
      // The one impurity, and it is a DEFAULT rather than a read: requiring `now` would put the
      // same `Date.now()` at every call site and make a forgotten one silently disable the reset.
      const before = Date.now();
      const typed = typeAheadCursor(-1, LABELS, 'c');
      assert.ok(
        typed.buffer.at >= before && typed.buffer.at <= Date.now(),
        'the buffer is stamped with the real clock'
      );
      assert.equal(typed.index, 3);
    });

    it('SKIPS a gated option, for the same reason the arrows do', () => {
      const isDisabled = (index) => index === 0;
      assert.equal(type(-1, 'a', { isDisabled }).index, 2, 'Anvil is gated, so `a` reaches Ash');
      assert.equal(
        type(-1, 'a', { isDisabled: () => true }).index,
        null,
        'a wholly gated list matches nothing rather than announcing an unchoosable row'
      );
    });

    it('leaves the cursor alone on a prefix that matches nothing, and still extends the buffer', () => {
      const first = typeAheadCursor(-1, LABELS, 'z', { now: AT });
      assert.equal(first.index, null, 'nothing begins with `z`');
      assert.deepEqual(first.buffer, { text: 'z', at: AT });

      const rescued = typeAheadCursor(-1, LABELS, 'q', { now: AT + 10, buffer: first.buffer });
      assert.equal(rescued.buffer.text, 'zq', 'the failed prefix is carried, not discarded');
      assert.equal(rescued.index, null);
    });

    it('owns no key that is not a single printable character', () => {
      // Every navigation and editing key spells itself out, so the length test needs no list to
      // maintain — and returning `null` is what lets the component leave the key entirely alone.
      for (const key of [
        'Enter',
        'Escape',
        'Tab',
        'ArrowDown',
        'Home',
        'End',
        'Backspace',
        'Delete',
        'PageDown',
        'F2',
        '',
        undefined,
        null,
      ]) {
        assert.equal(typeAheadCursor(-1, LABELS, key, { now: AT }), null, `the key ${String(key)}`);
      }
    });

    it('takes SPACE as a continuation and never as an opening', () => {
      // Space is the trigger button's own key — it activates it — so a bare Space must fall
      // through. Inside a live prefix it is a character like any other: `Routed by check`.
      assert.equal(typeAheadCursor(-1, LABELS, ' ', { now: AT }), null, 'nothing is buffered');
      const started = typeAheadCursor(-1, ['Routed by check', 'Simple'], 'r', { now: AT });
      const continued = typeAheadCursor(started.index, ['Routed by check', 'Simple'], ' ', {
        now: AT + 10,
        buffer: started.buffer,
      });
      assert.equal(continued.buffer.text, 'r ', 'the space extends the live prefix');
      assert.equal(continued.index, null, '`r ` is not a prefix of `Routed by check`');
    });

    it('matches nothing at all when there are no labels to match against', () => {
      for (const labels of [[], undefined, null, 'Anvil', 7]) {
        const typed = typeAheadCursor(-1, labels, 'a', { now: AT });
        assert.equal(typed.index, null, `labels ${String(labels)}`);
        assert.deepEqual(typed.buffer, { text: 'a', at: AT }, 'and the buffer still advances');
      }
    });

    it('tolerates a label that is missing, empty or not a string', () => {
      const labels = [undefined, '', 42, '  Amber  '];
      assert.equal(typeAheadCursor(-1, labels, 'a', { now: AT }).index, 3, 'trimmed and compared');
      assert.equal(typeAheadCursor(-1, labels, '4', { now: AT }).index, 2, 'a number is coerced');
    });

    it('ignores a buffer that is not one, rather than continuing a prefix it cannot read', () => {
      for (const buffer of [null, undefined, {}, { text: 'a' }, { text: 7, at: AT }, 'a']) {
        const typed = typeAheadCursor(-1, LABELS, 'b', { now: AT, buffer });
        assert.equal(typed.buffer.text, 'b', `buffer ${JSON.stringify(buffer)}`);
        assert.equal(typed.index, 1);
      }
    });
  });

  describe('activeOptionId', () => {
    it('names a row by its position in the flat rendered order', () => {
      assert.equal(activeOptionId('c7', 0), 'c7-option-0');
      assert.equal(activeOptionId('c7', 12), 'c7-option-12');
    });

    it('names NOTHING when no row is active', () => {
      // `undefined` rather than an empty string, because that is what makes Svelte OMIT
      // `aria-activedescendant` instead of writing an id that resolves to no element.
      assert.equal(activeOptionId('c7', -1), undefined);
      assert.equal(activeOptionId('c7', 1.5), undefined);
      assert.equal(activeOptionId('c7', NaN), undefined);
      assert.equal(activeOptionId('c7', '0'), undefined);
    });

    it('names nothing without an instance prefix, because a bare index is not unique', () => {
      // Two open pickers indexing from 0 would emit the same DOM id, and an
      // `aria-activedescendant` pointing at a duplicated id is ambiguous document-wide.
      assert.equal(activeOptionId('', 0), undefined);
      assert.equal(activeOptionId(undefined, 0), undefined);
      assert.equal(activeOptionId(null, 0), undefined);
    });

    it('is the id every row carries, so the holder can point at one of them', () => {
      // The invariant the mounted suite leans on: the holder's `aria-activedescendant` is built
      // by the SAME function as the rows' `id`, so a mismatch is impossible by construction.
      const rows = [0, 1, 2].map((index) => activeOptionId('c3', index));
      assert.deepEqual(rows, ['c3-option-0', 'c3-option-1', 'c3-option-2']);
      assert.equal(activeOptionId('c3', nextActiveIndex(-1, 3, 'End')), 'c3-option-2');
    });
  });
});
