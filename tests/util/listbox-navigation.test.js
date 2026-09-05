import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activeOptionId, nextActiveIndex } from '../../src/ui/svelte/util/listboxNavigation.js';

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
