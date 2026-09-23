/**
 * The admin store's GM Knowledge behaviour corpus (issue 1708): what the surface asks the snapshot
 * seam for, when it asks nothing at all, which notification each mutation raises, and the whole
 * published object after every op.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertConvergent,
  assertStatePatch,
  createSectionHarness,
  makeCorpusSystem,
} from '../helpers/adminSectionCorpus.js';

function seamCalls(entries, seam) {
  return entries.filter((entry) => entry.seam === seam).map((entry) => entry.args);
}

const STACKED_COPY = {
  itemId: 'stack',
  itemUuid: 'Actor.a1.Item.stack',
  name: 'Grand Codex',
  quantity: 3,
  timesUsed: 0,
  matchTier: 'identity',
  definitionId: 'codex',
  definitionName: 'Codex',
  recipeCount: 2,
  limitUses: false,
  learnScope: 'total',
};

const SINGLE_COPY = {
  ...STACKED_COPY,
  itemId: 'single',
  itemUuid: 'Actor.a1.Item.single',
  name: 'Loose Scroll',
  quantity: 1,
  recipeCount: 1,
};

function snapshot({ systemId, definitionCount }) {
  return {
    systemId,
    definitionCount,
    characters: [
      {
        id: 'a1',
        name: 'Aria',
        img: 'aria.png',
        ownedCopies: [{ ...STACKED_COPY }, { ...SINGLE_COPY }],
        learnedRecipes: [],
      },
      { id: 'a2', name: 'Brannon', img: '', ownedCopies: [], learnedRecipes: [] },
    ],
  };
}

function knowledgeWorld(overrides = {}) {
  return {
    systems: [
      makeCorpusSystem(),
      makeCorpusSystem({ id: 'sys2', name: 'System Two', features: { gathering: false } }),
    ],
    knowledgeSnapshots: {
      sys1: snapshot({ systemId: 'sys1', definitionCount: 2 }),
      sys2: snapshot({ systemId: 'sys2', definitionCount: 0 }),
    },
    ...overrides,
  };
}

/**
 * Hold every snapshot read on its own deferred, so a test settles each read in the order it names.
 * `next()` resolves with the next read once the store has asked for it.
 */
function holdKnowledgeReads(harness) {
  const reads = [];
  const waiters = [];
  harness.services.getKnowledgeSnapshot = (systemId) => {
    harness.journal.record('getKnowledgeSnapshot', [systemId]);
    let settle;
    const promise = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    reads.push({ systemId, ...settle });
    waiters.shift()?.();
    return promise;
  };
  let taken = 0;
  return {
    async next() {
      if (reads.length <= taken) await new Promise((resolve) => waiters.push(resolve));
      return reads[taken++];
    },
  };
}

function knowledgeFlags(harness) {
  const { loading, error, systemId } = harness.state().knowledge;
  return { loading, error, systemId, rows: harness.state().knowledge.characters.length };
}

async function settleMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('adminStore knowledge section loading and error states (issue 1969)', () => {
  it('entry publishes loading before the seam call, then the rows', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      const read = harness.services.getKnowledgeSnapshot;
      let seen = null;
      harness.services.getKnowledgeSnapshot = (systemId) => {
        seen = knowledgeFlags(harness);
        return read(systemId);
      };
      await harness.store.setKnowledgeActive(true);
      assert.deepStrictEqual(seen, { loading: true, error: false, systemId: '', rows: 0 });
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: 'sys1',
        rows: 2,
      });
    } finally {
      harness.dispose();
    }
  });

  it("a switch's cleared publish carries loading and no error", async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    const published = [];
    let unsubscribe = () => {};
    try {
      await harness.store.setKnowledgeActive(true);
      unsubscribe = harness.store.viewState.subscribe((state) => {
        published.push({ ...state.knowledge });
      });
      published.length = 0;
      await harness.store.selectSystem('sys1');
      const cleared = published.find((entry) => entry.active && entry.systemId === '');
      assert.ok(cleared, 'the cleared projection is published');
      assert.equal(cleared.loading, true);
      assert.equal(cleared.error, false);
      assert.equal(published.at(-1).loading, false);
    } finally {
      unsubscribe();
      harness.dispose();
    }
  });

  it('a stale read resolving after a switch leaves the new system loading', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      const reads = holdKnowledgeReads(harness);
      const first = harness.store.selectSystem('sys1');
      const sys1 = await reads.next();
      const second = harness.store.selectSystem('sys2');
      const sys2 = await reads.next();
      assert.deepStrictEqual([sys1.systemId, sys2.systemId], ['sys1', 'sys2']);

      sys1.resolve(snapshot({ systemId: 'sys1', definitionCount: 2 }));
      await first;
      // Force a publish, so an internal flag the stale read moved cannot hide behind no publish.
      harness.store.selectKnowledgeActor('a1');
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: true,
        error: false,
        systemId: '',
        rows: 0,
      });

      sys2.resolve(snapshot({ systemId: 'sys2', definitionCount: 0 }));
      await second;
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: 'sys2',
        rows: 2,
      });
    } finally {
      harness.dispose();
    }
  });

  it('a stale read rejecting after a switch leaves the new system loading and still throws', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      const reads = holdKnowledgeReads(harness);
      const first = harness.store.selectSystem('sys1');
      const sys1 = await reads.next();
      const second = harness.store.selectSystem('sys2');
      const sys2 = await reads.next();

      sys1.reject(new Error('stale read failed'));
      await assert.rejects(first, /stale read failed/);
      harness.store.selectKnowledgeActor('a1');
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: true,
        error: false,
        systemId: '',
        rows: 0,
      });

      sys2.resolve(snapshot({ systemId: 'sys2', definitionCount: 0 }));
      await second;
      assert.equal(knowledgeFlags(harness).loading, false);
      assert.equal(knowledgeFlags(harness).rows, 2);
    } finally {
      harness.dispose();
    }
  });

  it('a current read that rejects publishes the error and still throws', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      harness.services.getKnowledgeSnapshot = async () => {
        throw new Error('scan failed');
      };
      await assert.rejects(harness.store.setKnowledgeActive(true), /scan failed/);
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: true,
        systemId: '',
        rows: 0,
      });
    } finally {
      harness.dispose();
    }
  });

  it('an error clears on a hook read, and re-entry or a switch replaces it with loading', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    const published = [];
    let unsubscribe = () => {};
    try {
      const read = harness.services.getKnowledgeSnapshot;
      const failing = async () => {
        throw new Error('scan failed');
      };
      harness.services.getKnowledgeSnapshot = failing;
      await assert.rejects(harness.store.setKnowledgeActive(true), /scan failed/);

      // A hook-driven read leaves the error showing until it settles, then publishes the rows.
      harness.services.getKnowledgeSnapshot = read;
      harness.store.scheduleKnowledgeRefresh();
      assert.equal(knowledgeFlags(harness).error, true);
      await settleMicrotasks();
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: 'sys1',
        rows: 2,
      });

      // Back into the error, then re-entry replaces it with loading before its read settles.
      await harness.store.setKnowledgeActive(false);
      harness.services.getKnowledgeSnapshot = failing;
      await assert.rejects(harness.store.setKnowledgeActive(true), /scan failed/);
      assert.equal(knowledgeFlags(harness).error, true);
      const reads = holdKnowledgeReads(harness);
      const entered = harness.store.setKnowledgeActive(true);
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: true,
        error: false,
        systemId: '',
        rows: 0,
      });
      (await reads.next()).reject(new Error('scan failed'));
      await assert.rejects(entered, /scan failed/);
      assert.equal(knowledgeFlags(harness).error, true);

      // And so does a switch: its cleared publish is loading before its read is even asked for.
      unsubscribe = harness.store.viewState.subscribe((state) => {
        published.push({ ...state.knowledge });
      });
      published.length = 0;
      const switched = harness.store.selectSystem('sys2');
      const sys2 = await reads.next();
      const firstLoading = published.findIndex((entry) => entry.loading === true);
      assert.ok(firstLoading !== -1, 'the switch publishes loading');
      assert.ok(
        published.slice(firstLoading).every((entry) => entry.error === false),
        'and the error is gone from that publish on'
      );
      assert.equal(knowledgeFlags(harness).loading, true);
      sys2.resolve(snapshot({ systemId: 'sys2', definitionCount: 0 }));
      await switched;
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: 'sys2',
        rows: 2,
      });
    } finally {
      unsubscribe();
      harness.dispose();
    }
  });

  it('only the latest read settles loading, and a superseded rejection moves neither flag', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      await harness.store.setKnowledgeActive(true);
      const reads = holdKnowledgeReads(harness);
      const switched = harness.store.selectSystem('sys2');
      const switchRead = await reads.next();
      harness.store.scheduleKnowledgeRefresh();
      const hookRead = await reads.next();

      switchRead.reject(new Error('superseded read failed'));
      await assert.rejects(switched, /superseded read failed/);
      harness.store.selectKnowledgeActor('a1');
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: true,
        error: false,
        systemId: '',
        rows: 0,
      });

      hookRead.resolve(snapshot({ systemId: 'sys2', definitionCount: 0 }));
      await settleMicrotasks();
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: 'sys2',
        rows: 2,
      });
    } finally {
      harness.dispose();
    }
  });

  it('a superseded rejection sets no error even after the latest read found no snapshot', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      await harness.store.setKnowledgeActive(true);
      const reads = holdKnowledgeReads(harness);
      const stale = harness.store.refreshKnowledge({ force: true });
      const staleRead = await reads.next();
      const latest = harness.store.refreshKnowledge({ force: true });
      (await reads.next()).resolve(null);
      await latest;

      staleRead.reject(new Error('superseded read failed'));
      await assert.rejects(stale, /superseded read failed/);
      harness.store.selectKnowledgeActor('a1');
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: '',
        rows: 0,
      });
    } finally {
      harness.dispose();
    }
  });

  it('a read superseded by leaving writes no cache, so re-entry loads and resolves its own tab', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      const reads = holdKnowledgeReads(harness);
      const entered = harness.store.setKnowledgeActive(true);
      const leftBehind = await reads.next();
      await harness.store.setKnowledgeActive(false);
      // Zero definitions would resolve the Learned tab, which the re-entry read must not inherit.
      leftBehind.resolve(snapshot({ systemId: 'sys1', definitionCount: 0 }));
      await entered;

      const reentered = harness.store.setKnowledgeActive(true);
      const reentryRead = await reads.next();
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: true,
        error: false,
        systemId: '',
        rows: 0,
      });
      reentryRead.resolve(snapshot({ systemId: 'sys1', definitionCount: 2 }));
      await reentered;
      assert.equal(knowledgeFlags(harness).loading, false);
      assert.equal(knowledgeFlags(harness).rows, 2);
      assert.equal(harness.state().knowledge.defaultTab, 'recipeItems');
    } finally {
      harness.dispose();
    }
  });

  it('a populated re-read never publishes loading or error, and a failed one keeps the rows', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    const published = [];
    let unsubscribe = () => {};
    try {
      await harness.store.setKnowledgeActive(true);
      unsubscribe = harness.store.viewState.subscribe((state) => {
        published.push({ ...state.knowledge });
      });
      published.length = 0;

      harness.store.scheduleKnowledgeRefresh();
      await settleMicrotasks();
      await harness.store.eraseLearnedRecipe('a1', 'r1');
      harness.services.getKnowledgeSnapshot = async () => {
        throw new Error('re-read failed');
      };
      await assert.rejects(harness.store.eraseLearnedRecipe('a1', 'r1'), /re-read failed/);

      assert.ok(published.length >= 3, `the re-reads published: ${published.length}`);
      for (const entry of published) {
        assert.equal(entry.loading, false, 'a populated re-read never publishes loading');
        assert.equal(entry.error, false, 'a populated re-read never publishes an error');
        assert.equal(entry.characters.length, 2, 'the last rows stay published');
      }
    } finally {
      unsubscribe();
      harness.dispose();
    }
  });

  it('destroying stops an in-flight read settling the surface', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      harness.services.getKnowledgeSnapshot = async () => {
        throw new Error('scan failed');
      };
      await assert.rejects(harness.store.setKnowledgeActive(true), /scan failed/);
      await harness.store.setKnowledgeActive(false);

      const reads = holdKnowledgeReads(harness);
      const entered = harness.store.setKnowledgeActive(true);
      const inFlight = await reads.next();
      const before = harness.state().knowledge;
      harness.store.destroy();
      inFlight.reject(new Error('scan failed'));
      await assert.rejects(entered, /scan failed/);
      assert.deepStrictEqual(harness.state().knowledge, before, 'a destroyed store publishes nothing');
    } finally {
      harness.dispose();
    }
  });

  it('a read whose system changed under it without a switch writes nothing', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      const reads = holdKnowledgeReads(harness);
      const entered = harness.store.setKnowledgeActive(true);
      const read = await reads.next();
      // A selection moved by the shared refresh's fallback (the selected system deleted elsewhere)
      // advances no read generation, so only the system half of the guard can discard this read.
      harness.store.selectedSystemId.set('sys2');
      read.resolve(snapshot({ systemId: 'sys1', definitionCount: 2 }));
      await entered;
      harness.store.selectKnowledgeActor('a1');
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: true,
        error: false,
        systemId: '',
        rows: 0,
      });
    } finally {
      harness.dispose();
    }
  });

  it('a current read that finds no snapshot after an error clears the error', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      harness.services.getKnowledgeSnapshot = async () => {
        throw new Error('scan failed');
      };
      await assert.rejects(harness.store.setKnowledgeActive(true), /scan failed/);
      harness.services.getKnowledgeSnapshot = async () => null;
      await harness.store.refreshKnowledge({ force: true });
      assert.deepStrictEqual(knowledgeFlags(harness), {
        loading: false,
        error: false,
        systemId: '',
        rows: 0,
      });
    } finally {
      harness.dispose();
    }
  });

  it('a same-system read left over from before a switch away and back is discarded', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      await harness.store.setKnowledgeActive(true);
      const reads = holdKnowledgeReads(harness);
      const stale = harness.store.refreshKnowledge({ force: true });
      const staleRead = await reads.next();
      const release = [];
      harness.services.setSetting = () => new Promise((resolve) => release.push(resolve));
      const away = harness.store.selectSystem('sys2');
      await settleMicrotasks();
      const back = harness.store.selectSystem('sys1');
      await settleMicrotasks();
      assert.equal(release.length, 2, 'both switches are parked before their reads begin');
      staleRead.resolve(snapshot({ systemId: 'sys1', definitionCount: 2 }));
      assert.equal(await stale, false, 'the pre-switch read is superseded');
      harness.store.selectKnowledgeActor('a1');
      assert.equal(knowledgeFlags(harness).loading, true);
      assert.equal(knowledgeFlags(harness).rows, 0);
      release.forEach((resolve) => resolve());
      (await reads.next()).resolve(snapshot({ systemId: 'sys2', definitionCount: 0 }));
      (await reads.next()).resolve(snapshot({ systemId: 'sys1', definitionCount: 2 }));
      await Promise.all([away, back]);
    } finally {
      harness.dispose();
    }
  });
});

describe('adminStore knowledge section corpus', () => {
  it('reads the snapshot seam zero times while the surface is closed', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      const before = harness.state();
      assert.equal(await harness.store.refreshKnowledge(), false);
      assert.equal(await harness.store.refreshKnowledge({ force: true }), false);
      assert.equal(harness.store.selectKnowledgeActor('a1'), false);
      harness.store.scheduleKnowledgeRefresh();
      await Promise.resolve();
      const entries = harness.drain();
      assert.deepStrictEqual(seamCalls(entries, 'getKnowledgeSnapshot'), []);
      assertStatePatch(before, harness.state(), {}, 'a closed surface publishes nothing');
    } finally {
      harness.dispose();
    }
  });

  it('entering the surface reads one snapshot and publishes only the knowledge key', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      const before = harness.state();
      assert.equal(await harness.store.setKnowledgeActive(true), true);
      const entries = harness.drain();
      assert.deepStrictEqual(seamCalls(entries, 'getKnowledgeSnapshot'), [['sys1']]);
      const after = harness.state();
      assertStatePatch(before, after, { knowledge: after.knowledge });
      assert.equal(after.knowledge.active, true);
      assert.equal(after.knowledge.systemId, 'sys1');
      assert.equal(after.knowledge.defaultTab, 'recipeItems');
      assert.equal(after.knowledge.selectedActorId, 'a1');

      harness.resetPublishes();
      assert.equal(harness.store.selectKnowledgeActor('a2'), true);
      assert.equal(harness.publishes(), 1, 'a selection is one out-of-band publish');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), []);
      assert.equal(harness.state().knowledge.selectedActorId, 'a2');
    } finally {
      harness.dispose();
    }
  });

  it('re-resolves the default tab once per surface entry, and again after a system change', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      assert.equal(harness.state().knowledge.defaultTab, 'learnedRecipes');
      // A second read inside one entry must not re-resolve: a GM authoring a definition elsewhere
      // would otherwise yank the open tab mid-task.
      await harness.store.refreshKnowledge({ force: true });
      assert.equal(harness.state().knowledge.defaultTab, 'learnedRecipes');
      harness.drain();

      await harness.store.selectSystem('sys1');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), [['sys1']]);
      assert.equal(harness.state().knowledge.systemId, 'sys1');
      assert.equal(harness.state().knowledge.defaultTab, 'recipeItems');
    } finally {
      harness.dispose();
    }
  });

  it('a system switch never publishes the previous system and clears before it reads', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    const published = [];
    let unsubscribe = () => {};
    try {
      await harness.store.setKnowledgeActive(true);
      unsubscribe = harness.store.viewState.subscribe((state) => {
        published.push({ active: state.knowledge?.active, systemId: state.knowledge?.systemId });
      });
      published.length = 0;

      await harness.store.selectSystem('sys1');
      const systemIds = published.map((entry) => entry.systemId);
      assert.ok(!systemIds.includes('sys2'), `no publish carries sys2: ${systemIds.join(',')}`);
      const cleared = published.findIndex((entry) => entry.active && entry.systemId === '');
      assert.ok(cleared !== -1, 'the cleared projection is published');
      assert.ok(cleared < systemIds.indexOf('sys1'), 'and it lands before the new system');
      assert.equal(systemIds.at(-1), 'sys1');
    } finally {
      unsubscribe();
      harness.dispose();
    }
  });

  it('a snapshot read that resolves after a later switch is discarded', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();
      const read = harness.services.getKnowledgeSnapshot;
      let release;
      let requested;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const sys1Requested = new Promise((resolve) => {
        requested = resolve;
      });
      harness.services.getKnowledgeSnapshot = (systemId) => {
        if (systemId !== 'sys1') return read(systemId);
        harness.journal.record('getKnowledgeSnapshot', [systemId]);
        requested();
        return held;
      };

      const first = harness.store.selectSystem('sys1');
      await Promise.race([sys1Requested, first]);
      await harness.store.selectSystem('sys2');
      release(snapshot({ systemId: 'sys1', definitionCount: 2 }));
      await first;

      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), [
        ['sys1'],
        ['sys2'],
      ]);
      assert.equal(harness.state().knowledge.systemId, 'sys2');
    } finally {
      harness.dispose();
    }
  });

  it('a system reset confirmed across a switch resets the system it was asked for', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();
      harness.services.confirmDialog = async () => {
        await harness.store.selectSystem('sys1');
        return true;
      };
      await harness.store.resetActorSystemKnowledge('a1');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'resetActorKnowledge'), [
        [{ actorId: 'a1', systemId: 'sys2' }],
      ]);
    } finally {
      harness.dispose();
    }
  });

  it('the selected character survives a switch when the new system still has it', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ settings: { lastManagedCraftingSystem: 'sys2' } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      harness.store.selectKnowledgeActor('a2');
      await harness.store.selectSystem('sys1');
      assert.equal(harness.state().knowledge.systemId, 'sys1');
      assert.equal(harness.state().knowledge.selectedActorId, 'a2');
    } finally {
      harness.dispose();
    }
  });

  it('a system switch with the surface closed reads nothing and publishes no knowledge', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      const before = harness.state().knowledge;
      await harness.store.selectSystem('sys2');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), []);
      assert.deepStrictEqual(harness.state().knowledge, before);
    } finally {
      harness.dispose();
    }
  });

  it('a repeated forced refresh converges on one snapshot read per call', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();
      await assertConvergent(harness, () => harness.store.refreshKnowledge({ force: true }), [
        'getKnowledgeSnapshot',
      ]);
    } finally {
      harness.dispose();
    }
  });

  it('deleteOwnedRecipeItem confirms for a stack and not for a single copy', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({
        knowledgeResults: {
          deleteOwnedRecipeItem: { success: true, message: 'FABRICATE.Knowledge.Manage.Deleted' },
        },
      })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();

      const stacked = await harness.store.deleteOwnedRecipeItem('a1', 'stack');
      const stackedEntries = harness.drain();
      assert.equal(stacked.success, true);
      assert.equal(seamCalls(stackedEntries, 'confirmDialog').length, 1);
      assert.deepStrictEqual(seamCalls(stackedEntries, 'deleteOwnedRecipeItem'), [
        [{ actorId: 'a1', itemId: 'stack' }],
      ]);
      assert.deepStrictEqual(seamCalls(stackedEntries, 'notify.info'), [
        ['FABRICATE.Knowledge.Manage.Deleted'],
      ]);
      assert.equal(
        seamCalls(stackedEntries, 'getKnowledgeSnapshot').length,
        1,
        'a mutation re-reads the snapshot'
      );

      const single = await harness.store.deleteOwnedRecipeItem('a1', 'single');
      const singleEntries = harness.drain();
      assert.equal(single.success, true);
      assert.deepStrictEqual(seamCalls(singleEntries, 'confirmDialog'), []);
    } finally {
      harness.dispose();
    }
  });

  it('a refused stack confirm cancels without touching the mutation seam', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({ answers: { confirmDialog: [false] } })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();
      const result = await harness.store.deleteOwnedRecipeItem('a1', 'stack');
      const entries = harness.drain();
      assert.deepStrictEqual(result, { success: false, cancelled: true });
      assert.deepStrictEqual(seamCalls(entries, 'deleteOwnedRecipeItem'), []);
      assert.deepStrictEqual(seamCalls(entries, 'getKnowledgeSnapshot'), []);
    } finally {
      harness.dispose();
    }
  });

  it('a mutation seam that answers nothing falls back to the failure result', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();
      const result = await harness.store.eraseLearnedRecipe('a1', 'r1');
      const entries = harness.drain();
      assert.deepStrictEqual(result, {
        success: false,
        message: 'FABRICATE.Knowledge.Manage.Failed',
      });
      assert.deepStrictEqual(seamCalls(entries, 'notify.error'), [
        ['FABRICATE.Knowledge.Manage.Failed'],
      ]);
      assert.deepStrictEqual(seamCalls(entries, 'notify.info'), []);
    } finally {
      harness.dispose();
    }
  });

  it('expend and the two resets carry their own arguments and confirm copy', async () => {
    const harness = await createSectionHarness(
      knowledgeWorld({
        knowledgeResults: {
          expendRecipeItemUse: { success: true, message: 'FABRICATE.Knowledge.Manage.Spent' },
          resetActorKnowledge: { success: true, message: 'FABRICATE.Knowledge.Manage.Reset' },
        },
      })
    );
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();

      await harness.store.expendRecipeItemUse('a1', 'stack');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'expendRecipeItemUse'), [
        [{ actorId: 'a1', itemId: 'stack', definitionId: 'codex', systemId: 'sys1' }],
      ]);

      await harness.store.resetActorSystemKnowledge('a1');
      const systemReset = harness.drain();
      assert.equal(seamCalls(systemReset, 'confirmDialog').length, 1);
      assert.deepStrictEqual(seamCalls(systemReset, 'resetActorKnowledge'), [
        [{ actorId: 'a1', systemId: 'sys1' }],
      ]);

      await harness.store.resetActorAllKnowledge('a1');
      const allReset = harness.drain();
      assert.equal(seamCalls(allReset, 'confirmDialog').length, 1);
      assert.deepStrictEqual(seamCalls(allReset, 'resetActorKnowledge'), [
        [{ actorId: 'a1', systemId: null }],
      ]);
    } finally {
      harness.dispose();
    }
  });

  it('leaving the surface and destroying it both stop every seam read', async () => {
    const harness = await createSectionHarness(knowledgeWorld());
    try {
      await harness.store.setKnowledgeActive(true);
      harness.drain();
      assert.equal(await harness.store.setKnowledgeActive(false), false);
      assert.equal(harness.state().knowledge.active, false);
      assert.equal(harness.state().knowledge.systemId, '');
      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), []);

      await harness.store.setKnowledgeActive(true);
      harness.drain();
      harness.store.destroy();
      harness.store.scheduleKnowledgeRefresh();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), []);
    } finally {
      harness.dispose();
    }
  });
});
