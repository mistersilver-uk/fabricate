/**
 * The player bag's retained-claim seams: a GM reads the cached claim and nobody else does, and a
 * Craft or Brew the authority refuses with `recovery-required` reaches the GM's release prompt.
 */
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

/** A recording `DialogV2` whose `answer` responds to each render. */
function withDialog(answer, body) {
  const dialogs = [];
  const prior = globalThis.foundry;
  Reflect.set(globalThis, 'foundry', {
    utils: { deepClone: (value) => ({ ...value }) },
    applications: {
      api: {
        DialogV2: class {
          constructor(options) {
            this.options = options;
          }
          render() {
            dialogs.push(this.options);
            answer(this.options);
          }
        },
      },
    },
  });
  return Promise.resolve(body(dialogs)).finally(() => {
    if (prior === undefined) Reflect.deleteProperty(globalThis, 'foundry');
    else Reflect.set(globalThis, 'foundry', prior);
  });
}

const ALCHEMY_LISTING = {
  denied: false,
  selectedActorId: 'pc',
  activeSystemId: 'sys-a',
  activeSystemName: 'Herbalism',
  systems: [
    { id: 'sys-a', name: 'Herbalism', img: null, description: '', knownCount: 0, totalCount: 0 },
  ],
  recipes: [],
  undiscoveredCount: 0,
  components: [{ componentId: 'ashsalt', name: 'Ashsalt', img: null, held: 3 }],
  fizzleKeys: [],
};

/**
 * Drive the real player bag's `crafting.craft` or `alchemy.brew` against a facade that refuses the
 * start with `recovery-required`, with the GM answering the prompt with `choose`.
 */
async function refusedStart({ kind, choose }) {
  const out = {};
  await withFabricateLifecycleReplay(async ({ loadModule }) => {
    const { createPlayerServices } = await loadModule('/src/ui/playerServices.js');
    const world = buildPlayerWorld();
    world.game.user.isGM = true;
    const refused = { success: false, reason: 'recovery-required' };
    world.game.fabricate = {
      getJournalRunAuthorityAvailability: () => ({
        available: false,
        reason: 'recovery-required',
        retained: RETAINED,
      }),
      getSelectedCraftingActorId: () => 'pc',
      getSelectedAlchemySystemId: () => 'sys-a',
      listCraftingForActor: async () => ({ summaries: [] }),
      listAlchemyForActor: async () => ALCHEMY_LISTING,
      craftRecipe: async () => refused,
      submitAlchemyAttempt: async () => refused,
      reconcileJournalRunAuthority: async (options) => {
        world.record('reconcile', options);
        return { success: true };
      },
    };
    const restore = installPlayerWorld(world);
    try {
      await withDialog(
        (options) => options.buttons.find((button) => button.action === choose)?.callback?.(),
        async (dialogs) => {
          const services = createPlayerServices({
            activeCanvasTool: () => null,
            scopedInteractableRef: () => null,
            selectTab: () => {},
          });
          if (kind === 'craft') {
            await services.crafting.craft({ id: 'r1' });
          } else {
            await services.alchemy.load();
            services.alchemy.add('ashsalt');
            await services.alchemy.brew();
          }
          out.dialogs = dialogs;
        }
      );
      out.journal = world.journal.filter(
        ([channel]) => channel === 'reconcile' || channel === 'notify.warn'
      );
    } finally {
      restore();
    }
  });
  return out;
}

describe('a start refused by a retained claim, through the real player bag', () => {
  for (const kind of ['craft', 'brew']) {
    it(`offers the GM the prompt after the ${kind} refusal and records the choice`, async () => {
      const { dialogs, journal } = await refusedStart({ kind, choose: 'abandoned' });
      assert.equal(dialogs.length, 1);
      assert.equal(
        dialogs[0].buttons.find((button) => button.default)?.action,
        'cancel',
        'Cancel is the default, so Enter releases nothing'
      );
      assert.deepEqual(
        journal.map(([channel]) => channel),
        ['notify.warn', 'reconcile', 'notify.warn'],
        'the refusal is toasted first, then the choice is recorded, then the outcome is toasted'
      );
      assert.equal(journal[0][1], '[FABRICATE.App.Journal.Actions.ClaimRetained]');
      assert.deepEqual(journal[1][1], { claimId: 'claim-9', disposition: 'abandoned' });
    });

    it(`records nothing when the GM cancels after the ${kind} refusal`, async () => {
      const { dialogs, journal } = await refusedStart({ kind, choose: 'cancel' });
      assert.equal(dialogs.length, 1);
      assert.deepEqual(
        journal.map(([channel]) => channel),
        ['notify.warn']
      );
    });
  }
});
