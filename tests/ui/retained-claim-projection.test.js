import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { projectRetainedClaim } from '../../src/ui/presenters/retainedClaimProjection.js';

describe('projectRetainedClaim', () => {
  it('keeps the five fields a GM reads and drops the request identity', () => {
    const projected = projectRetainedClaim({
      claimId: ' claim-1 ',
      requestId: 'request-1',
      requestStatus: 'pending',
      requestKind: 'command',
      failureReason: 'operation-failed',
      failureMessage: 'Boom',
      claimedAt: '1000',
    });
    assert.deepEqual(projected, {
      claimId: 'claim-1',
      requestKind: 'command',
      failureReason: 'operation-failed',
      failureMessage: 'Boom',
      claimedAt: 1000,
    });
  });

  it('nulls a missing field rather than omitting it', () => {
    assert.deepEqual(projectRetainedClaim({ claimId: 'claim-2', claimedAt: 'soon' }), {
      claimId: 'claim-2',
      requestKind: null,
      failureReason: null,
      failureMessage: null,
      claimedAt: null,
    });
  });

  for (const [label, value] of [
    ['absent', undefined],
    ['null', null],
    ['without a claim id', { requestKind: 'command' }],
    ['with a blank claim id', { claimId: '\t' }],
  ]) {
    it(`answers null for a value ${label}`, () => {
      assert.equal(projectRetainedClaim(value), null);
    });
  }
});
