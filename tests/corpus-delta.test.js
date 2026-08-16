/**
 * `corpusDelta()` — the per-record sibling of `corpusChanged` (issue 1078, under #1070).
 *
 * Three rules carry the whole contract, and each has a named test below:
 *
 * 1. An inserted or deleted record is attributed to ITS OWN id and to nothing else. The
 *    delta pairs by record id, so the records after an insertion are unchanged — index
 *    pairing would report the entire tail as changed and reintroduce, on the path that runs
 *    on every connected client, exactly the over-broad invalidation this work removes.
 * 2. A pure reordering is a change that cannot be attributed to any record, so it reports
 *    `reordered: true` with an EMPTY per-record delta and its consumers route broadly.
 * 3. A changed record yields the set of fields that actually differ.
 *
 * `corpusChanged`'s own contract is asserted alongside, because the point of adding a
 * sibling rather than generalising it is that the cheap boolean keeps short-circuiting.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { corpusChanged, corpusDelta, patchCorpusInPlace } from '../src/systems/revisionTokens.js';

/** A minimal record with an id and two independent fields. */
function record(id, overrides = {}) {
  return { id, name: `Record ${id}`, category: 'raw', ...overrides };
}

/** The ids the delta attributed a change to, in delta order. */
const attributed = (delta) => [...delta.perRecord.keys()];

describe('corpusDelta — an INSERTED record is attributed to itself alone', () => {
  it('reports the inserted id only, and leaves every record after it unchanged', () => {
    const before = [record('a'), record('b'), record('c')];
    const after = [record('a'), record('inserted'), record('b'), record('c')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, true);
    assert.equal(delta.reordered, false, 'an insertion is fully attributable, not a reorder');
    assert.deepEqual(attributed(delta), ['inserted']);
    assert.equal(delta.perRecord.get('inserted').kind, 'added');
    assert.deepEqual(
      delta.perRecord.get('inserted').fields,
      ['category', 'id', 'name'],
      'a record that was not there before has every one of its fields in the change'
    );
    assert.equal(delta.perRecord.get('inserted').before, null);
    assert.equal(delta.perRecord.get('inserted').after.id, 'inserted');
  });

  it('does NOT pair by index — b and c shifted position and did not change', () => {
    // The defect this rule exists to prevent, stated as its own assertion: `corpusChanged`
    // compares position 1 against position 1, so an index-paired delta would report `b` and
    // `c` as changed. One recipe create would then invalidate every later recipe.
    const before = [record('a'), record('b'), record('c')];
    const after = [record('inserted'), record('a'), record('b'), record('c')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.perRecord.has('b'), false, 'b only moved position; it did not change');
    assert.equal(delta.perRecord.has('c'), false);
    assert.deepEqual(attributed(delta), ['inserted']);
    assert.equal(delta.reordered, false, 'a leading insertion preserves the common order');
  });
});

describe('corpusDelta — a DELETED record is attributed to itself alone', () => {
  it('reports the removed id, carrying its previous value and no next value', () => {
    const before = [record('a'), record('b'), record('c')];
    const after = [record('a'), record('c')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, true);
    assert.equal(delta.reordered, false);
    assert.deepEqual(attributed(delta), ['b']);
    const removed = delta.perRecord.get('b');
    assert.equal(removed.kind, 'removed');
    assert.equal(removed.after, null);
    assert.equal(removed.before.name, 'Record b');
    assert.deepEqual(removed.fields, ['category', 'id', 'name']);
  });
});

describe('corpusDelta — a pure REORDERING is broad', () => {
  it('reports changed and reordered with an EMPTY per-record delta', () => {
    const before = [record('a'), record('b'), record('c')];
    const after = [record('c'), record('a'), record('b')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, true, 'order is significant, exactly as it is for corpusChanged');
    assert.equal(corpusChanged(before, after), true, 'and the cheap boolean agrees');
    assert.equal(delta.reordered, true);
    assert.equal(
      delta.perRecord.size,
      0,
      'every record is individually equal to its counterpart, so nothing is attributable'
    );
  });

  it('stays reordered even when a record also changed, so the consumer cannot narrow', () => {
    const before = [record('a'), record('b')];
    const after = [record('b', { name: 'Renamed' }), record('a')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.reordered, true);
    assert.deepEqual(attributed(delta), ['b'], 'the field change is still reported');
  });

  it('reports a corpus that cannot be paired by id as unattributable', () => {
    // Unreachable from either manager's reload(), whose corpora are Map values keyed by the
    // same id — but this is an exported function and "I cannot attribute this" must fail safe.
    const before = [record('dup'), record('dup')];
    const after = [record('dup'), record('dup', { name: 'Changed' })];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, true);
    assert.equal(delta.reordered, true, 'duplicate ids route broadly rather than guessing');
    assert.equal(delta.perRecord.size, 0);
  });

  it('reports an unchanged unpairable corpus as unchanged, not as a reorder', () => {
    const before = [record('dup'), record('dup')];
    const after = [record('dup'), record('dup')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, false);
    assert.equal(delta.reordered, false);
  });
});

describe('corpusDelta — a CHANGED record yields its field set', () => {
  it('names only the fields that differ', () => {
    const before = [record('a'), record('b')];
    const after = [record('a'), record('b', { name: 'Renamed', extra: 7 })];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, true);
    assert.equal(delta.reordered, false);
    assert.deepEqual(attributed(delta), ['b']);
    const changed = delta.perRecord.get('b');
    assert.equal(changed.kind, 'changed');
    assert.deepEqual(
      changed.fields,
      ['extra', 'name'],
      'category and id are identical and must not appear'
    );
    assert.equal(changed.before.name, 'Record b');
    assert.equal(changed.after.name, 'Renamed');
  });

  it('sees a field REMOVED as well as one rewritten', () => {
    const before = [{ id: 'a', name: 'A', category: 'raw' }];
    const after = [{ id: 'a', name: 'A' }];

    assert.deepEqual(corpusDelta(before, after).perRecord.get('a').fields, ['category']);
  });

  it('compares with JSON.stringify key semantics, so an undefined field is absent', () => {
    const before = [{ id: 'a', name: 'A', note: undefined }];
    const after = [{ id: 'a', name: 'A' }];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, false, 'JSON.stringify drops an undefined value; so does this');
    assert.equal(delta.perRecord.size, 0);
  });

  it('reports nothing at all for an unchanged corpus', () => {
    const before = [record('a'), record('b')];
    const after = [record('a'), record('b')];

    const delta = corpusDelta(before, after);

    assert.equal(delta.changed, false);
    assert.equal(delta.reordered, false);
    assert.equal(delta.perRecord.size, 0);
    assert.equal(corpusChanged(before, after), false);
  });

  it('applies the projection to both sides, and reports the PROJECTED record', () => {
    const before = [{ id: 'a', toJSON: () => ({ id: 'a', name: 'A' }) }];
    const after = [{ id: 'a', toJSON: () => ({ id: 'a', name: 'B' }) }];

    const delta = corpusDelta(before, after, { project: (r) => r.toJSON() });

    assert.deepEqual(delta.perRecord.get('a').fields, ['name']);
    assert.equal(delta.perRecord.get('a').after.name, 'B');
    assert.equal(
      typeof delta.perRecord.get('a').after.toJSON,
      'undefined',
      'consumers attribute over the projected shape, not the live model object'
    );
  });

  it('honours a custom identify, so a corpus keyed on something else still pairs', () => {
    const before = [{ key: 'a', name: 'A' }];
    const after = [{ key: 'a', name: 'B' }];

    const delta = corpusDelta(before, after, { identify: (r) => r.key });

    assert.deepEqual(attributed(delta), ['a']);
  });

  it('takes the reference fast path for a record that is the SAME object', () => {
    const shared = record('a');
    let projections = 0;
    const project = (r) => {
      projections += 1;
      return r;
    };

    const delta = corpusDelta([shared], [shared], { project });

    assert.equal(delta.changed, false);
    assert.equal(projections, 0, 'a reference-equal record costs one pointer comparison');
  });
});

describe('patchCorpusInPlace — the reuse licence, in one place', () => {
  /** A live corpus map and the freshly parsed replacement for it. */
  function corpora(beforeRecords, afterRecords) {
    const retained = new Map(beforeRecords.map((entry) => [entry.id, entry]));
    const next = new Map(afterRecords.map((entry) => [entry.id, entry]));
    return { retained, next, delta: corpusDelta(retained.values(), next.values()) };
  }

  it('keeps the map object and every record the delta proved unchanged', () => {
    const kept = record('a');
    const { retained, next, delta } = corpora([kept, record('b')], [record('a'), record('b')]);

    patchCorpusInPlace(retained, next, delta);

    assert.ok(retained.get('a') === kept, 'a structurally equal record keeps its object');
    assert.equal(delta.changed, false);
  });

  it('takes the FRESH record for an id the delta reported changed', () => {
    const stale = record('a');
    const fresh = record('a', { name: 'Renamed' });
    const neighbour = record('b');
    const { retained, next, delta } = corpora([stale, neighbour], [fresh, record('b')]);

    patchCorpusInPlace(retained, next, delta);

    assert.ok(retained.get('a') === fresh, 'a changed record must not donate its object');
    assert.ok(retained.get('b') === neighbour, 'and its unchanged neighbour is untouched');
  });

  it('rewrites the retained map to the PERSISTED order, not to arrival order', () => {
    // The trap this exists to avoid: appending an insertion at the end would leave the map
    // ordered differently from storage, and the next save would replicate that reordering to
    // every client as a broad, unattributable invalidation.
    const { retained, next, delta } = corpora(
      [record('a'), record('b')],
      [record('a'), record('inserted'), record('b')]
    );

    patchCorpusInPlace(retained, next, delta);

    assert.deepEqual([...retained.keys()], ['a', 'inserted', 'b']);
  });

  it('drops an id the replacement corpus no longer holds', () => {
    const { retained, next, delta } = corpora([record('a'), record('b')], [record('a')]);

    patchCorpusInPlace(retained, next, delta);

    assert.deepEqual([...retained.keys()], ['a']);
  });
});

describe('corpusChanged keeps its own contract', () => {
  it('still short-circuits at the first differing record', () => {
    let projections = 0;
    const project = (r) => {
      projections += 1;
      return r;
    };
    const before = [record('a'), record('b'), record('c')];
    const after = [record('a', { name: 'Changed' }), record('b'), record('c')];

    assert.equal(corpusChanged(before, after, project), true);
    assert.equal(
      projections,
      2,
      'the boolean stops at the first difference; only corpusDelta walks everything'
    );
  });

  it('still answers true immediately when the lengths differ', () => {
    let projections = 0;
    const project = (r) => {
      projections += 1;
      return r;
    };

    assert.equal(corpusChanged([record('a')], [record('a'), record('b')], project), true);
    assert.equal(projections, 0);
  });
});
