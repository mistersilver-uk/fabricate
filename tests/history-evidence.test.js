import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  gmReconciliationRecord,
  holdsUncertainSettlement,
  nativeHistoryRecord,
} from '../src/systems/runHistoryEvidence.js';

const base = { disposition: 'reconciled', userId: 'gm-1', userName: 'Game Master' };

describe('gmReconciliationRecord', () => {
  it('keeps a well-formed record and omits absent optional fields', () => {
    assert.deepEqual(gmReconciliationRecord(base), base);
    assert.deepEqual(gmReconciliationRecord({ ...base, disposition: 'abandoned', userName: '' }), {
      disposition: 'abandoned',
      userId: 'gm-1',
      userName: null,
    });
  });

  it('refuses an unknown disposition or a missing user id', () => {
    for (const value of [
      { ...base, disposition: 'refunded' },
      { ...base, disposition: undefined },
      { ...base, userId: '' },
      { ...base, userId: 7 },
      null,
      'reconciled',
    ]) {
      assert.equal(gmReconciliationRecord(value), null, JSON.stringify(value));
    }
  });

  it('trims the note, drops a blank or non-string note, and caps it at 500 units', () => {
    assert.equal(gmReconciliationRecord({ ...base, note: '  checked  ' }).note, 'checked');
    for (const note of [' '.repeat(3), 42, { text: 'x' }]) {
      assert.equal(Object.hasOwn(gmReconciliationRecord({ ...base, note }), 'note'), false);
    }
    assert.equal(gmReconciliationRecord({ ...base, note: 'a'.repeat(501) }).note.length, 500);
  });

  it('never ends a capped note inside a surrogate pair', () => {
    const note = `${'a'.repeat(499)}\u{1F525}tail`;
    const capped = gmReconciliationRecord({ ...base, note }).note;
    assert.equal(capped, 'a'.repeat(499));
    const whole = `${'a'.repeat(498)}\u{1F525}tail`;
    assert.equal(
      gmReconciliationRecord({ ...base, note: whole }).note,
      `${'a'.repeat(498)}\u{1F525}`
    );
  });

  it('requires a staged record to name a valid stepIndex and strips it otherwise', () => {
    assert.deepEqual(gmReconciliationRecord({ ...base, stepIndex: 1 }, { staged: true }), {
      ...base,
      stepIndex: 1,
    });
    for (const stepIndex of [undefined, -1, 1.5, '1']) {
      assert.equal(gmReconciliationRecord({ ...base, stepIndex }, { staged: true }), null);
    }
    assert.equal(
      Object.hasOwn(gmReconciliationRecord({ ...base, stepIndex: 1 }), 'stepIndex'),
      false
    );
  });
});

describe('native history records', () => {
  it('drops a malformed gmReconciliation and normalizes a valid one', () => {
    const malformed = nativeHistoryRecord({ id: 'r', gmReconciliation: { disposition: 'nope' } });
    assert.equal(Object.hasOwn(malformed, 'gmReconciliation'), false);
    const valid = nativeHistoryRecord({
      id: 'r',
      gmReconciliation: { ...base, note: ' n ', extra: 1 },
    });
    assert.deepEqual(valid.gmReconciliation, { ...base, note: 'n' });
  });

  it('treats a settlement holding uncertain as uncertain even beside pending', () => {
    assert.equal(
      holdsUncertainSettlement({
        historySettlement: { consumption: 'uncertain', awards: 'pending' },
      }),
      true
    );
    assert.equal(
      holdsUncertainSettlement({
        historySettlement: { consumption: 'complete', awards: 'pending' },
      }),
      false
    );
    assert.equal(holdsUncertainSettlement({}), false);
  });
});
