/**
 * The player shell bag's retained-claim seams: a GM reads the cached claim and nobody else does,
 * and a Craft or Brew the authority refuses with `recovery-required` reaches the GM's release prompt.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  RecordingApplicationV2,
  buildPlayerWorld,
  installPlayerWorld,
} from '../fixtures/managerServicesCorpus.js';
import { withProductionApplication } from '../helpers/extension-composition-harness.js';

let constructShell;
let releaseShell;

// One booted shell class for the file; each scenario builds a fresh bag from a fresh instance.
before(async () => {
  let ready;
  const booted = new Promise((resolve) => {
    ready = resolve;
  });
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const running = withProductionApplication(
    {
      modulePath: '/src/ui/SvelteFabricateApp.svelte.js',
      exportName: 'SvelteFabricateApp',
      ApplicationV2: RecordingApplicationV2,
      hooks: { on: () => 1, off: () => {}, once: () => 1 },
    },
    async (app) => {
      constructShell = () => new app.constructor();
      ready();
      await done;
    }
  );
  releaseShell = () => {
    finish();
    return running;
  };
  await booted;
});

after(async () => {
  await releaseShell();
});

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
    answer = constructShell()._buildServices().getRetainedJournalClaim();
  } finally {
    restore();
  }
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

const press = (action) => (options) =>
  options.buttons.find((button) => button.action === action)?.callback?.();

/**
 * Drive the real player bag's `crafting.craft` and/or `alchemy.brew` (`kind` is `craft`, `brew` or
 * `both`, started together) against a facade that refuses the start with `reason`. The viewer
 * answers the prompt with `choose`, and with none the dialog stays open until `dialogs` is read.
 */
async function refusedStart({ kind, choose = null, isGM = true, reason = 'recovery-required' }) {
  const out = {};
  const world = buildPlayerWorld();
  world.game.user.isGM = isGM;
  const refused = { success: false, reason };
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
    await withDialog(choose ? press(choose) : () => {}, async (dialogs) => {
      const services = constructShell()._buildServices();
      const craft = () => services.crafting.craft({ id: 'r1' });
      const brew = async () => {
        await services.alchemy.load();
        services.alchemy.add('ashsalt');
        return services.alchemy.brew();
      };
      if (kind === 'both') {
        const started = [craft(), brew()];
        await new Promise((resolve) => setTimeout(resolve, 25));
        out.openedWhilePending = dialogs.length;
        for (const options of dialogs) press('cancel')(options);
        out.results = await Promise.all(started);
      } else {
        await (kind === 'craft' ? craft() : brew());
      }
      out.dialogs = dialogs;
    });
    out.journal = world.journal.filter(
      ([channel]) => channel === 'reconcile' || channel === 'notify.warn'
    );
  } finally {
    restore();
  }
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

  it('opens one prompt when a Craft and a Brew are both refused while it is open', async () => {
    const { dialogs, openedWhilePending, results, journal } = await refusedStart({ kind: 'both' });
    assert.equal(openedWhilePending, 1, 'the second refusal awaits the open prompt');
    assert.equal(dialogs.length, 1);
    assert.deepEqual(
      results.map((result) => result?.reason),
      ['recovery-required', 'recovery-required'],
      'both starts resolve with their refusal'
    );
    assert.deepEqual(
      journal.map(([channel]) => channel),
      ['notify.warn', 'notify.warn'],
      'each refusal is toasted and nothing is recorded'
    );
  });

  for (const kind of ['craft', 'brew']) {
    it(`shows a player only the ${kind} refusal`, async () => {
      const { dialogs, journal } = await refusedStart({ kind, choose: 'reconciled', isGM: false });
      assert.deepEqual(dialogs, []);
      assert.deepEqual(journal, [['notify.warn', '[FABRICATE.App.Journal.Actions.ClaimRetained]']]);
    });

    it(`opens no prompt for a ${kind} refused for another reason`, async () => {
      const { dialogs, journal } = await refusedStart({
        kind,
        choose: 'reconciled',
        reason: 'ledger-missing',
      });
      assert.deepEqual(dialogs, []);
      assert.deepEqual(journal, [['notify.warn', '[FABRICATE.App.Journal.Actions.LedgerMissing]']]);
    });
  }
});
