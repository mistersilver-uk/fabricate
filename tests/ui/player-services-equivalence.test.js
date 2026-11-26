/**
 * The player services bag built through `createPlayerServices` against the one the shell's
 * forwarder hands back (issue 1906, Phase 4 of issue 1674): the same keys, the same store order,
 * the same facade calls with the same threaded `presentTools` and `interactableRef`, and the shell
 * state read at call time rather than captured at build time.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PLAYER_SERVICE_KEYS,
  PLAYER_STORE_KEYS,
  buildPlayerWorld,
  installPlayerWorld,
  normaliseForGolden,
  playerArgumentsFor,
} from '../fixtures/managerServicesCorpus.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { withFabricateLifecycleReplay } from '../helpers/extension-composition-harness.js';

const STATION = { systemId: 'sys-1', toolId: 'tool-1', componentId: 'comp-1' };
const REF = { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' };

function build(createPlayerServices, state = {}) {
  const shell = { activeCanvasTool: null, scopedInteractableRef: null, tabs: [], ...state };
  const services = createPlayerServices({
    activeCanvasTool: () => shell.activeCanvasTool,
    scopedInteractableRef: () => shell.scopedInteractableRef,
    selectTab: (tab) => {
      shell.tabs.push(tab);
    },
  });
  return { shell, services };
}

async function reachedBy(services, world) {
  const before = world.journal.length;
  for (const key of PLAYER_SERVICE_KEYS) {
    // The confirm dialog opens a real Foundry dialog, which this recording world does not stand in.
    if (PLAYER_STORE_KEYS.includes(key) || key === 'confirmDialog') continue;
    await services[key](...playerArgumentsFor(key));
  }
  return world.journal.slice(before).map((entry) => normaliseForGolden(entry));
}

describe('createPlayerServices', () => {
  it('exposes the corpus key set with the six stores created in order', async () =>
    withModules(async ({ createPlayerServices }) => {
      const world = buildPlayerWorld();
      const restore = installPlayerWorld(world);
      try {
        const { services } = build(createPlayerServices);
        assert.deepStrictEqual(Object.keys(services).sort(byCodePoint), [...PLAYER_SERVICE_KEYS]);
        assert.deepStrictEqual(
          Object.keys(services).filter((key) => PLAYER_STORE_KEYS.includes(key)),
          [...PLAYER_STORE_KEYS]
        );
      } finally {
        restore();
      }
    }));

  it('reaches the facade exactly as the shell forwarder does, station and ref included', async () =>
    withModules(async ({ createPlayerServices, SvelteFabricateApp }) => {
      const state = { activeCanvasTool: STATION, scopedInteractableRef: REF };
      const direct = buildPlayerWorld();
      let directReached;
      let restore = installPlayerWorld(direct);
      try {
        directReached = await reachedBy(build(createPlayerServices, state).services, direct);
      } finally {
        restore();
      }
      const viaShell = buildPlayerWorld();
      restore = installPlayerWorld(viaShell);
      try {
        const app = Object.assign(Object.create(SvelteFabricateApp.prototype), {
          _activeCanvasTool: STATION,
          _scopedInteractableRef: REF,
        });
        const services = app._buildServices();
        assert.deepStrictEqual(Object.keys(services).sort(byCodePoint), [...PLAYER_SERVICE_KEYS]);
        assert.deepStrictEqual(await reachedBy(services, viaShell), directReached);
      } finally {
        restore();
      }
      assert.ok(
        JSON.stringify(directReached).includes('"toolIds":["tool-1"]'),
        'the station must actually be threaded'
      );
      assert.ok(JSON.stringify(directReached).includes('"behaviorId":"b1"'));
    }));

  it('reads the shell state at call time, not at build time', async () =>
    withModules(async ({ createPlayerServices }) => {
      const world = buildPlayerWorld();
      const restore = installPlayerWorld(world);
      try {
        const { shell, services } = build(createPlayerServices);
        assert.equal(services.getActiveCanvasTool(), null);
        shell.activeCanvasTool = STATION;
        assert.strictEqual(services.getActiveCanvasTool(), STATION);
        shell.scopedInteractableRef = REF;
        services.startGatheringAttempt({ taskId: 't' });
        const [, args] = world.journal.at(-1);
        assert.deepStrictEqual(args.interactableRef, REF);
      } finally {
        restore();
      }
    }));

  it('mints an attempt id from Foundry at call time, and hands the journal the same source', async () =>
    withModules(async ({ createPlayerServices }) => {
      const restore = installPlayerWorld(buildPlayerWorld());
      try {
        const { services } = build(createPlayerServices);
        let minted = 0;
        globalThis.foundry.utils.randomID = () => `minted-${(minted += 1)}`;
        assert.deepStrictEqual(
          [services.newAttemptId(), services.newAttemptId()],
          ['minted-1', 'minted-2']
        );
        assert.strictEqual(typeof services.journal.iterative.takeAction, 'function');
      } finally {
        restore();
      }
    }));

  it('navigates through the selectTab accessor after selecting the run or recipe', async () =>
    withModules(async ({ createPlayerServices }) => {
      const world = buildPlayerWorld();
      const restore = installPlayerWorld(world);
      try {
        const { shell, services } = build(createPlayerServices);
        const selected = [];
        services.crafting = {
          select: (id) => {
            selected.push(['crafting', id]);
          },
        };
        services.journal = {
          select: (...args) => {
            selected.push(['journal', ...args]);
          },
        };
        services.navigateToCraftingRecipe('r-1');
        services.navigateToJournalRun('run-1');
        assert.deepStrictEqual(selected, [
          ['crafting', 'r-1'],
          ['journal', 'run-1', 'crafting'],
        ]);
        assert.deepStrictEqual(shell.tabs, ['crafting', 'journal']);
      } finally {
        restore();
      }
    }));

  it('answers a distinct bag, with its own stores, on every call', async () =>
    withModules(async ({ createPlayerServices }) => {
      const world = buildPlayerWorld();
      const restore = installPlayerWorld(world);
      try {
        const first = build(createPlayerServices).services;
        const second = build(createPlayerServices).services;
        assert.notStrictEqual(first, second);
        assert.notStrictEqual(first.crafting, second.crafting);
      } finally {
        restore();
      }
    }));
});

/** Both modules, loaded through the Vite runner the production rune compilation needs. */
async function withModules(run) {
  await withFabricateLifecycleReplay(async ({ loadModule }) => {
    const { createPlayerServices } = await loadModule('/src/ui/playerServices.js');
    const { SvelteFabricateApp } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
    await run({ createPlayerServices, SvelteFabricateApp });
  });
}
