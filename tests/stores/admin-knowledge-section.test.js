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
      const afterSelect = harness.drain();
      assert.deepStrictEqual(
        seamCalls(afterSelect, 'getKnowledgeSnapshot'),
        [],
        'selecting a system clears the cache rather than re-reading it'
      );
      assert.equal(
        harness.state().knowledge.systemId,
        'sys2',
        'clearing the cache does not republish, so the surface holds the old projection'
      );

      await harness.store.refreshKnowledge();
      assert.deepStrictEqual(seamCalls(harness.drain(), 'getKnowledgeSnapshot'), [['sys1']]);
      assert.equal(harness.state().knowledge.defaultTab, 'recipeItems');
      assert.equal(harness.state().knowledge.systemId, 'sys1');
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
