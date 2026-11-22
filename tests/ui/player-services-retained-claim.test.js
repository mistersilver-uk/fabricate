/** The player bag's `getRetainedJournalClaim` seam: a GM reads the cached claim, nobody else does. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlayerWorld, installPlayerWorld } from '../fixtures/managerServicesCorpus.js';
import { withFabricateLifecycleReplay } from '../helpers/extension-composition-harness.js';

const RETAINED = {
  claimId: 'claim-9',
  requestId: 'request-9',
  requestStatus: 'pending',
  requestKind: 'recovery',
  failureReason: 'reconstruction-failed',
  failureMessage: 'No ledger',
  claimedAt: 4000,
};

/** The seam against a world whose viewer is `isGM` and whose authority answers `availability`. */
async function seamAnswer({ isGM, availability, facade = true }) {
  let answer;
  let reads = 0;
  await withFabricateLifecycleReplay(async ({ loadModule }) => {
    const { createPlayerServices } = await loadModule('/src/ui/playerServices.js');
    const world = buildPlayerWorld();
    world.game.user.isGM = isGM;
    world.game.fabricate = facade
      ? {
          getJournalRunAuthorityAvailability: () => {
            reads += 1;
            return availability;
          },
        }
      : undefined;
    const restore = installPlayerWorld(world);
    try {
      const services = createPlayerServices({
        activeCanvasTool: () => null,
        scopedInteractableRef: () => null,
        selectTab: () => {},
      });
      answer = services.getRetainedJournalClaim();
    } finally {
      restore();
    }
  });
  return { answer, reads };
}

describe('getRetainedJournalClaim', () => {
  it('projects the cached retained claim for a GM, without the request identity', async () => {
    const { answer } = await seamAnswer({
      isGM: true,
      availability: { available: false, reason: 'recovery-required', retained: RETAINED },
    });
    assert.deepEqual(answer, {
      claimId: 'claim-9',
      requestKind: 'recovery',
      failureReason: 'reconstruction-failed',
      failureMessage: 'No ledger',
      claimedAt: 4000,
    });
  });

  it('answers null for a GM when the availability carries no claim', async () => {
    const { answer } = await seamAnswer({
      isGM: true,
      availability: { available: false, reason: 'recovery-required' },
    });
    assert.equal(answer, null);
  });

  it('answers null for a player even with a claim cached, and never reads the authority', async () => {
    const { answer, reads } = await seamAnswer({
      isGM: false,
      availability: { available: false, reason: 'recovery-required', retained: RETAINED },
    });
    assert.equal(answer, null);
    assert.equal(reads, 0);
  });

  it('answers null for a claim with no usable id', async () => {
    const { answer } = await seamAnswer({
      isGM: true,
      availability: { retained: { ...RETAINED, claimId: '' } },
    });
    assert.equal(answer, null);
  });

  it('answers null when the facade is absent', async () => {
    const { answer } = await seamAnswer({ isGM: true, availability: null, facade: false });
    assert.equal(answer, null);
  });
});
