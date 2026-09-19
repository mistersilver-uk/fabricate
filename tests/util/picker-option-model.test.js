import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  activeCursorIndex,
  filteredCountLabel,
  groupedOptionBuckets,
  labelSubstringFilter,
  optionListGeneration,
  pickerEmptiness,
  renderedOptionOrder,
  selectedOptionIds,
} from '../../src/ui/svelte/util/pickerOptionModel.js';

// The arithmetic a picker's option list is built from, unit-tested without mounting (issue 1719).

const row = (id, group) => ({ id, label: id, ...(group ? { group } : {}) });

describe('picker option model: the list arithmetic', () => {
  describe('labelSubstringFilter', () => {
    it('short-circuits an empty query to the list it was handed', () => {
      const options = [row('iron'), row('copper')];
      assert.equal(labelSubstringFilter(options, ''), options);
    });

    it('matches a lower-cased substring of the label, anywhere in it', () => {
      const options = [{ id: 'a', label: 'Iron Ingot' }, { id: 'b', label: 'Copper Wire' }];
      assert.deepEqual(
        labelSubstringFilter(options, 'ingot').map((option) => option.id),
        ['a']
      );
      assert.deepEqual(
        labelSubstringFilter(options, 'wir').map((option) => option.id),
        ['b']
      );
    });

    it('reads a missing label as the empty string rather than throwing on it', () => {
      assert.deepEqual(labelSubstringFilter([{ id: 'a' }], 'a'), []);
    });
  });

  describe('groupedOptionBuckets', () => {
    it('offsets each bucket by the rows before it, which is what makes the cursor flat', () => {
      const buckets = groupedOptionBuckets(
        [row('a', 'metal'), row('b', 'metal'), row('c', 'wood')],
        [
          { id: 'metal', label: 'Metals' },
          { id: 'wood', label: 'Woods' },
        ]
      );
      assert.deepEqual(
        buckets.map((bucket) => [bucket.id, bucket.offset, bucket.options.length]),
        [
          ['metal', 0, 2],
          ['wood', 2, 1],
        ]
      );
    });

    it('drops an emptied bucket and re-offsets the ones after it', () => {
      // A group whose rows all filtered out disappears, so the offsets cannot be read off the
      // declared group order — they have to be accumulated over the surviving buckets.
      const buckets = groupedOptionBuckets(
        [row('a', 'metal'), row('c', 'wood')],
        [{ id: 'metal' }, { id: 'stone' }, { id: 'wood' }]
      );
      assert.deepEqual(
        buckets.map((bucket) => [bucket.id, bucket.offset]),
        [
          ['metal', 0],
          ['wood', 1],
        ]
      );
    });

    it('collects ungrouped and unknown-group rows into one unlabelled bucket, last', () => {
      const buckets = groupedOptionBuckets(
        [row('a', 'metal'), row('loose'), row('elsewhere', 'not-declared')],
        [{ id: 'metal', label: 'Metals' }]
      );
      assert.deepEqual(
        buckets.map((bucket) => [bucket.id, bucket.label, bucket.options.map((o) => o.id)]),
        [
          ['metal', 'Metals', ['a']],
          ['__ungrouped', '', ['loose', 'elsewhere']],
        ]
      );
    });

    it('answers with no buckets when no group is declared, rather than one holding everything', () => {
      // The ungrouped shape is a different render — no `role="group"`, no heading — so "one bucket
      // of everything" would be a silently different panel rather than a tidier answer.
      assert.deepEqual(groupedOptionBuckets([row('a')], []), []);
      assert.deepEqual(groupedOptionBuckets([row('a')], undefined), []);
      assert.deepEqual(groupedOptionBuckets([row('a')], [{ label: 'no id' }]), []);
    });
  });

  describe('renderedOptionOrder', () => {
    it('flattens the buckets, and falls back to the filtered rows when there are none', () => {
      const filtered = [row('a'), row('b')];
      assert.deepEqual(
        renderedOptionOrder([{ options: [row('b')] }, { options: [row('a')] }], filtered).map(
          (option) => option.id
        ),
        ['b', 'a']
      );
      assert.equal(renderedOptionOrder([], filtered), filtered);
    });
  });

  describe('optionListGeneration', () => {
    it('changes with the open state, the query, the length and both end ids', () => {
      const options = [row('a'), row('b')];
      const stamp = optionListGeneration({ open: true, query: '', options });
      assert.notEqual(stamp, optionListGeneration({ open: false, query: '', options }));
      assert.notEqual(stamp, optionListGeneration({ open: true, query: 'a', options }));
      assert.notEqual(
        stamp,
        optionListGeneration({ open: true, query: '', options: [row('a'), row('b'), row('c')] })
      );
      assert.notEqual(
        stamp,
        optionListGeneration({ open: true, query: '', options: [row('z'), row('b')] })
      );
      assert.notEqual(
        stamp,
        optionListGeneration({ open: true, query: '', options: [row('a'), row('z')] })
      );
    });

    it('is stable across two reads of the same list, so a cursor survives a re-render', () => {
      const first = optionListGeneration({ open: true, query: 'ir', options: [row('a'), row('b')] });
      const second = optionListGeneration({
        open: true,
        query: 'ir',
        options: [row('a'), row('b')],
      });
      assert.equal(first, second);
      assert.equal(optionListGeneration({ open: false, query: '', options: [] }), 'closed//0//');
    });
  });

  describe('activeCursorIndex', () => {
    it('answers the sentinel for a position stamped against an older list', () => {
      assert.equal(activeCursorIndex({ generation: 'now', index: 2 }, 'now', 4), 2);
      assert.equal(activeCursorIndex({ generation: 'before', index: 2 }, 'now', 4), -1);
      assert.equal(activeCursorIndex(undefined, 'now', 4), -1);
    });

    it('clamps a position past the end, which the stamp alone cannot see', () => {
      // A caller's own `filterOptions` narrows the list from state the stamp does not read, so the
      // range check is a second guard rather than a restatement of the first.
      assert.equal(activeCursorIndex({ generation: 'now', index: 3 }, 'now', 4), 3);
      assert.equal(activeCursorIndex({ generation: 'now', index: 4 }, 'now', 4), -1);
      assert.equal(activeCursorIndex({ generation: 'now', index: 0 }, 'now', 0), -1);
      assert.equal(activeCursorIndex({ generation: 'now', index: -1 }, 'now', 4), -1);
    });
  });

  describe('selectedOptionIds', () => {
    it('is a set only in multiple mode, and admits the empty-string id', () => {
      assert.deepEqual([...selectedOptionIds(['a', 'b'], true)], ['a', 'b']);
      assert.deepEqual([...selectedOptionIds('a', true)], ['a']);
      assert.deepEqual([...selectedOptionIds('', true)], ['']);
      assert.equal(selectedOptionIds('a', false).size, 0);
    });
  });

  describe('filteredCountLabel', () => {
    it('substitutes both placeholders in the caller`s own template', () => {
      assert.equal(filteredCountLabel('{matched} of {total}', 3, 12), '3 of 12');
      assert.equal(filteredCountLabel('{total} total, {matched} shown', 0, 5), '5 total, 0 shown');
      assert.equal(filteredCountLabel('no placeholders', 3, 12), 'no placeholders');
    });
  });

  describe('pickerEmptiness', () => {
    it('separates a list holding nothing from a query that emptied one', () => {
      assert.deepEqual(
        pickerEmptiness({
          total: 0,
          matched: 0,
          noMatchesText: 'No matches',
          emptyHint: 'Nothing here',
          emptyDetail: 'Add one first',
        }),
        { message: 'Nothing here', body: 'Add one first' }
      );
      assert.deepEqual(
        pickerEmptiness({
          total: 4,
          matched: 0,
          noMatchesText: 'No matches',
          emptyHint: 'Nothing here',
          emptyDetail: 'Add one first',
        }),
        { message: 'No matches', body: '' }
      );
    });
  });
});
