/**
 * adminStore — GM Knowledge surface (issue 785).
 *
 * Two contracts dominate here and neither is visible in rendered output, so both
 * are asserted on SPIES:
 *
 * 1. The whole-world `actors × items` scan must never join `refresh()` (invoked by
 *    ~40 mutation paths) and must be a total no-op while the surface is closed. A
 *    lazy-but-still-scanning implementation passes an empty-output assertion, so
 *    the seam spy's call count is the assertion.
 * 2. Every store action calls `refreshKnowledge({ force: true })` and NEVER
 *    `refresh()` — calling `refresh()` would work correctly at runtime and only
 *    cost performance, so nothing but a spy can catch it.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createServices, makeRecipe, makeSystem } from '../helpers/adminStoreServices.js';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

const PARTY_COPY = Object.freeze({
  itemId: 'i1',
  itemUuid: 'Actor.a1.Item.i1',
  name: 'Journeyman Primer',
  img: 'primer.png',
  quantity: 1,
  timesUsed: 1,
  inert: true,
  matchTier: 'identity',
  definitionId: 'primer',
  definitionName: 'Primer',
  recipeCount: 2,
  limitUses: true,
  maxUses: 5,
  learnScope: 'total',
});

const STACKED_COPY = Object.freeze({
  itemId: 'i2',
  itemUuid: 'Actor.a1.Item.i2',
  name: 'Grand Codex',
  quantity: 3,
  timesUsed: 0,
  matchTier: 'duplicate',
  definitionId: 'codex',
  definitionName: 'Codex',
  recipeCount: 1,
  limitUses: false,
  learnScope: 'perInstance',
});

function rawSnapshot(overrides = {}) {
  return {
    systemId: 'sys1',
    definitionCount: 2,
    characters: [
      {
        id: 'a1',
        name: 'Aria',
        img: 'aria.png',
        ownedCopies: [{ ...PARTY_COPY }, { ...STACKED_COPY }],
        learnedRecipes: [
          {
            recipeId: 'r1',
            recipeName: 'Smelt Copper',
            recipeCategory: 'smithing',
            craftingSystemId: 'sys1',
            sourceItemUuid: 'Actor.a1.Item.i1',
            sourceOwned: true,
            sourceItemName: 'Journeyman Primer',
            sourceDefinitionName: 'Primer',
            sourceCapped: true,
          },
          {
            recipeId: 'r2',
            recipeName: 'Forge Rivets',
            craftingSystemId: 'sys1',
            sourceItemUuid: 'Actor.a1.Item.gone',
            sourceOwned: false,
            sourceDefinitionName: 'Primer',
            sourceCapped: true,
          },
        ],
        otherSystemCount: 1,
        orphanCount: 2,
      },
      { id: 'a2', name: 'Bran', ownedCopies: [], learnedRecipes: [] },
    ],
    ...overrides,
  };
}

function makeHarness({ snapshot = rawSnapshot(), confirmResult = true } = {}) {
  const calls = {
    snapshot: [],
    expend: [],
    delete: [],
    erase: [],
    reset: [],
    confirm: [],
    // `refresh()` calls this optional service exactly once per run and nothing in
    // the knowledge path touches it, so its count IS the "did refresh() run" probe.
    refresh: 0,
  };
  const services = createServices(
    makeSystem({
      recipeItemDefinitions: [
        { id: 'primer', name: 'Primer', originItemUuid: 'Item.aaa', recipeIds: ['r1', 'r2'] },
        { id: 'codex', name: 'Codex', originItemUuid: 'Item.bbb', recipeIds: ['r3'] },
      ],
    }),
    [makeRecipe({ id: 'r1' }), makeRecipe({ id: 'r2' }), makeRecipe({ id: 'r3' })],
    [],
    {
      // Echo the key, and the data alongside it, so both the static-literal key and
      // any interpolated value are assertable on the confirmDialog spy.
      localize: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
      getAccessCharacterActors: () => {
        calls.refresh += 1;
        return [];
      },
      getKnowledgeSnapshot: (systemId) => {
        calls.snapshot.push(systemId);
        return snapshot;
      },
      expendRecipeItemUse: async (options) => {
        calls.expend.push(options);
        return { success: true, outcome: 'used', timesUsed: 2, message: 'FABRICATE.Ok' };
      },
      deleteOwnedRecipeItem: async (options) => {
        calls.delete.push(options);
        return { success: true, message: 'FABRICATE.Ok' };
      },
      eraseLearnedRecipe: async (options) => {
        calls.erase.push(options);
        return { success: true, message: 'FABRICATE.Ok' };
      },
      resetActorKnowledge: async (options) => {
        calls.reset.push(options);
        return { success: true, message: 'FABRICATE.Ok' };
      },
      confirmDialog: async (options) => {
        calls.confirm.push(options);
        return confirmResult;
      },
    }
  );
  return { calls, store: createAdminStore(services) };
}

// Settle the store's constructor refresh, then zero the probes.
async function settled(harness) {
  await harness.store.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Prove the "did refresh() run" probe is STILL WIRED before zeroing it. Without
  // this, `refresh()` dropping its `getAccessCharacterActors` call would silently
  // vacate every `assert.equal(harness.calls.refresh, 0)` below into a tautology.
  assert.ok(
    harness.calls.refresh > 0,
    'refresh() must still call getAccessCharacterActors, or the probe proves nothing'
  );
  harness.calls.refresh = 0;
  harness.calls.snapshot.length = 0;
  return harness;
}

function knowledgeOf(store) {
  return get(store.viewState).knowledge;
}

let originalGame;

beforeEach(() => {
  originalGame = globalThis.game;
  globalThis.game = {
    i18n: { localize: (key) => key, format: (key) => key },
    actors: { contents: [] },
  };
});

afterEach(() => {
  globalThis.game = originalGame;
});

describe('adminStore knowledge projection cost', () => {
  it('never reads the seam from a plain refresh()', async () => {
    const harness = await settled(makeHarness());
    await harness.store.refresh();
    assert.equal(harness.calls.snapshot.length, 0, 'the whole-world scan must not join refresh()');
    assert.equal(knowledgeOf(harness.store).active, false);
  });

  it('reads nothing while the surface is closed', async () => {
    const harness = await settled(makeHarness());
    const published = await harness.store.refreshKnowledge({ force: true });
    assert.equal(published, false);
    assert.equal(
      harness.calls.snapshot.length,
      0,
      'knowledgeActive gates the read, not the output'
    );
  });

  it('reads once on entry and serves the cache on an unforced refresh', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    assert.deepEqual(harness.calls.snapshot, ['sys1']);

    await harness.store.refreshKnowledge();
    assert.equal(
      harness.calls.snapshot.length,
      1,
      'the cached snapshot is re-published, not re-read'
    );

    await harness.store.refreshKnowledge({ force: true });
    assert.equal(harness.calls.snapshot.length, 2);
    assert.equal(harness.calls.refresh, 0, 'no knowledge path ever calls refresh()');
  });

  it('drops the cache when the surface closes and when the system changes', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    harness.calls.snapshot.length = 0;

    await harness.store.setKnowledgeActive(false);
    assert.equal(knowledgeOf(harness.store).active, false);
    assert.equal(knowledgeOf(harness.store).characters.length, 0);
    assert.equal(harness.calls.snapshot.length, 0);

    await harness.store.setKnowledgeActive(true);
    assert.equal(harness.calls.snapshot.length, 1, 're-entry re-reads the seam');

    await harness.store.selectSystem('sys2');
    harness.calls.snapshot.length = 0;
    await harness.store.refreshKnowledge();
    assert.equal(harness.calls.snapshot.length, 1, 'selectSystem cleared the cached snapshot');
  });

  it('coalesces a burst of hook-driven refreshes into one scan and ignores them while closed', async () => {
    const harness = await settled(makeHarness());
    harness.store.scheduleKnowledgeRefresh();
    harness.store.scheduleKnowledgeRefresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(harness.calls.snapshot.length, 0, 'zero scans while the surface is closed');

    await harness.store.setKnowledgeActive(true);
    harness.calls.snapshot.length = 0;
    harness.store.scheduleKnowledgeRefresh();
    harness.store.scheduleKnowledgeRefresh();
    harness.store.scheduleKnowledgeRefresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(harness.calls.snapshot.length, 1, 'a burst collapses into exactly one scan');
    assert.equal(harness.calls.refresh, 0);
  });
});

describe('adminStore knowledge publication', () => {
  it('publishes a TOP-LEVEL knowledge key that is a new object every time', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    const first = knowledgeOf(harness.store);
    await harness.store.refreshKnowledge({ force: true });
    const second = knowledgeOf(harness.store);

    assert.notEqual(first, second, 'a shared reference would stop the UI re-propagating');
    const state = get(harness.store.viewState);
    assert.ok(state.knowledge, 'knowledge is a top-level viewState key');
    assert.equal(
      state.selectedSystem?.knowledge,
      undefined,
      'never hung off selectedSystem — a late phase-2 publish would clobber it'
    );
  });

  it('projects rows, roll-ups and the D8 party-pool hazard for the selected character', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    const knowledge = knowledgeOf(harness.store);

    assert.equal(knowledge.characters.length, 2);
    assert.equal(knowledge.selectedActorId, 'a1');
    const character = knowledge.selectedCharacter;
    assert.equal(character.itemCount, 2);
    assert.equal(character.learnedCount, 2);
    assert.equal(character.otherSystemCount, 1);
    assert.equal(character.orphanCount, 2);
    assert.equal(
      character.hasPartyPoolHazard,
      true,
      'a total-scope copy still sources a learned entry'
    );

    const [primer, codex] = character.ownedCopies;
    assert.equal(primer.inert, true);
    assert.equal(primer.spent, false, 'inert is never folded into spent');
    assert.equal(primer.canExpend, true, 'the fifth state is expendable — inert does not gate');
    assert.equal(primer.remaining, 4);
    assert.equal(primer.matchTier, 'identity');
    assert.equal(primer.type, 'Book');
    assert.equal(codex.canExpend, false, 'an uncapped copy disables Expend rather than no-opping');
    assert.equal(codex.remaining, null);
    assert.equal(codex.usesChip, 'unlimited');

    const [owned, dangling] = character.learnedRecipes;
    assert.equal(owned.sourceKind, 'ownedCopy');
    assert.equal(owned.freesNoSlot, false);
    assert.equal(dangling.sourceKind, 'lostCopy');
    assert.equal(
      dangling.sourceName,
      'Primer',
      'the member definition name survives the deleted copy'
    );
    assert.equal(dangling.freesNoSlot, true);
  });

  it('resolves the default tab ONCE per entry from the definition count', async () => {
    const snapshot = rawSnapshot({ definitionCount: 0 });
    const harness = await settled(makeHarness({ snapshot }));
    await harness.store.setKnowledgeActive(true);
    assert.equal(knowledgeOf(harness.store).defaultTab, 'learnedRecipes');

    // A GM authoring the system's first recipe item elsewhere must NOT yank the
    // open tab (and, per the disarm rules, silently disarm an armed row).
    snapshot.definitionCount = 3;
    await harness.store.refreshKnowledge({ force: true });
    assert.equal(knowledgeOf(harness.store).defaultTab, 'learnedRecipes');

    await harness.store.setKnowledgeActive(false);
    await harness.store.setKnowledgeActive(true);
    assert.equal(knowledgeOf(harness.store).defaultTab, 'recipeItems', 're-entry re-resolves it');
  });

  it('selects a roster character without reading the seam again', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    harness.calls.snapshot.length = 0;

    assert.equal(harness.store.selectKnowledgeActor('a2'), true);
    assert.equal(knowledgeOf(harness.store).selectedActorId, 'a2');
    assert.equal(
      knowledgeOf(harness.store).selectedCharacter.tracked,
      false,
      'Nothing tracked row'
    );
    assert.equal(harness.calls.snapshot.length, 0, 'selection is pure re-publication');

    harness.store.selectKnowledgeActor('missing');
    assert.equal(
      knowledgeOf(harness.store).selectedActorId,
      'a1',
      'a vanished selection falls back'
    );
  });
});

describe('adminStore knowledge mutations', () => {
  it('expends against the definition the projected row resolved, then refreshes only knowledge', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    harness.calls.snapshot.length = 0;

    const result = await harness.store.expendRecipeItemUse('a1', 'i1');
    assert.equal(result.success, true);
    assert.deepEqual(harness.calls.expend, [
      { actorId: 'a1', itemId: 'i1', definitionId: 'primer', systemId: 'sys1' },
    ]);
    assert.equal(harness.calls.snapshot.length, 1, 'refreshKnowledge({ force: true })');
    assert.equal(harness.calls.refresh, 0, 'and NEVER refresh()');
  });

  it('deletes a single copy with no confirm and a stacked copy behind one', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);

    await harness.store.deleteOwnedRecipeItem('a1', 'i1');
    assert.equal(harness.calls.confirm.length, 0, 'quantity 1 uses the inline armed affordance');
    assert.deepEqual(harness.calls.delete, [{ actorId: 'a1', itemId: 'i1' }]);

    await harness.store.deleteOwnedRecipeItem('a1', 'i2');
    assert.equal(harness.calls.confirm.length, 1, 'a stacked copy is a heavyweight confirm');
    assert.match(harness.calls.confirm[0].content, /3/, 'the dialog names the quantity');
    assert.equal(harness.calls.delete.length, 2);
    assert.equal(harness.calls.refresh, 0);
  });

  it('performs no delete when the stacked-copy confirm is declined', async () => {
    const harness = await settled(makeHarness({ confirmResult: false }));
    await harness.store.setKnowledgeActive(true);

    const result = await harness.store.deleteOwnedRecipeItem('a1', 'i2');
    assert.equal(result.cancelled, true);
    assert.equal(harness.calls.delete.length, 0);
  });

  it('erases one learned recipe through the seam', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);
    harness.calls.snapshot.length = 0;

    await harness.store.eraseLearnedRecipe('a1', 'r1');
    assert.deepEqual(harness.calls.erase, [{ actorId: 'a1', recipeId: 'r1' }]);
    assert.equal(harness.calls.snapshot.length, 1);
    assert.equal(harness.calls.refresh, 0);
  });

  it('offers both reset grains and discloses the discovery asymmetry in the dialog', async () => {
    const harness = await settled(makeHarness());
    await harness.store.setKnowledgeActive(true);

    await harness.store.resetActorSystemKnowledge('a1');
    await harness.store.resetActorAllKnowledge('a1');

    assert.deepEqual(harness.calls.reset, [
      { actorId: 'a1', systemId: 'sys1' },
      // Only the all-systems grain can clear the orphan learned keys
      // `forgetSystemLearnedRecipes` deliberately leaves in place.
      { actorId: 'a1', systemId: null },
    ]);
    assert.equal(harness.calls.confirm.length, 2);
    for (const options of harness.calls.confirm) {
      assert.match(
        options.content,
        /Knowledge\.ResetDiscoveryNote/,
        'the erase-vs-reset discoveryProgress asymmetry is disclosed where it is actionable'
      );
    }
    assert.equal(harness.calls.refresh, 0);
  });

  it('performs no reset when the confirm is declined', async () => {
    const harness = await settled(makeHarness({ confirmResult: false }));
    await harness.store.setKnowledgeActive(true);

    assert.equal((await harness.store.resetActorSystemKnowledge('a1')).cancelled, true);
    assert.equal((await harness.store.resetActorAllKnowledge('a1')).cancelled, true);
    assert.equal(harness.calls.reset.length, 0);
  });
});
