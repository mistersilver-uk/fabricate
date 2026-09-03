/**
 * REMOVING AN ESSENCE FROM A SYSTEM PRESERVES ITS COMPONENT QUANTITIES (issue 1372, epic 1357).
 *
 * The world essence entry's per-system row offers `Remove`, and the reference's copy for it says
 * removal takes this system's rules: "Components here keep the values, but nothing resolves on
 * craft until the essence is added back."
 *
 * BOTH CLAUSES WERE FALSE AT ONCE, in opposite directions. `removeFromSystem` deleted the
 * membership record and left the in-system `essenceDefinitions` row standing, so the essence went
 * on resolving on every craft - the second clause. And deleting that row was refused, on the
 * belief that `_normalizeEssenceQuantities` would then run against a valid-id set without the
 * essence and STRIP its stored quantity from every component carrying it - the first clause,
 * pre-emptively.
 *
 * THE RULING IS THAT REMOVAL TAKES BOTH HALVES AND THE QUANTITIES SURVIVE. This file is the proof
 * of the half that was only ever asserted: the strip does not happen, and the reason is the Valid
 * Id Basis itself rather than a new special case. `CraftingSystemManager#_scopeBasis` builds the
 * essence basis as the UNION of the WORLD ROSTER and the system's surviving in-system array, so an
 * essence that is still a world entity is still in the basis after its in-system row is gone.
 *
 * ── THE NEGATIVE CONTROL IS THE POINT OF THE FILE ───────────────────────────────────────────
 * With NO world half the basis IS the in-system array alone and the strip is REAL. That arm is
 * asserted rather than omitted, because it is what makes the passing arm mean something: the
 * quantities are preserved BY the world roster, not by the normalizer being harmless. It is also
 * why `Remove from this system` may only ever be reached from a world-scope screen.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

globalThis.foundry = { utils: { randomID: () => 'rnd', getProperty: () => undefined } };
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { createEssenceScopeStore } = await import('../src/systems/worldScopeStores.js');
const { SETTING_KEYS } = await import('../src/config/settings.js');
const { resolvedEssencesFor } = await import('../src/systems/scopedEntityReads.js');

const SYSTEM_ID = 'sys-a';

/** A `Map`-backed settings seam. */
function seam(initial) {
  const values = new Map(Object.entries(initial));
  return {
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
      return value;
    },
  };
}

/** A REAL essence scope store holding two world essences, both members of `sys-a`. */
function loadedStore() {
  const store = createEssenceScopeStore(
    seam({
      [SETTING_KEYS.ESSENCE_SCOPE]: {
        entities: [
          { id: 'fire', name: 'Fire' },
          { id: 'ice', name: 'Ice' },
        ],
        defaults: {},
        membership: {
          [`fire|${SYSTEM_ID}`]: {
            entityId: 'fire',
            systemId: SYSTEM_ID,
            inherit: { effectSource: false, macro: false },
            enabled: true,
          },
          [`ice|${SYSTEM_ID}`]: {
            entityId: 'ice',
            systemId: SYSTEM_ID,
            inherit: { effectSource: false, macro: false },
            enabled: true,
          },
        },
      },
    })
  );
  store.load();
  return store;
}

/** The system, with one component carrying a quantity of BOTH essences. */
function systemWith(essenceIds) {
  return {
    id: SYSTEM_ID,
    name: 'System A',
    features: { essences: true },
    essenceDefinitions: essenceIds.map((id) => ({ id, name: id })),
    components: [{ id: 'ash', name: 'Ash', essences: { fire: 3, ice: 1 } }],
  };
}

/** The persisted membership payload with one pair removed, as `removeFromSystem` writes it. */
function withoutMembership(store, entityId) {
  const payload = store.get();
  delete payload.membership[`${entityId}|${SYSTEM_ID}`];
  return payload;
}

describe('removal takes the membership and the rules record, and the quantities survive', () => {
  it('the component still carries the removed essence’s quantity after a full normalize', async () => {
    const store = loadedStore();
    const manager = new CraftingSystemManager({ getRecipes: () => [] }, { essenceScopeStore: store });

    // NEGATIVE CONTROL FIRST: the quantity is there to lose.
    assert.deepEqual(manager._normalizeSystem(systemWith(['fire', 'ice'])).components[0].essences, {
      fire: 3,
      ice: 1,
    });

    // REMOVAL, both halves: the membership record goes, and so does this system's rules record.
    await store.save(withoutMembership(store, 'fire'));
    const parted = manager._normalizeSystem(systemWith(['ice']));

    assert.deepEqual(
      parted.essenceDefinitions.map((def) => def.id),
      ['ice'],
      'the in-system rules record is gone, so nothing resolves on craft'
    );
    assert.deepEqual(
      parted.components[0].essences,
      { fire: 3, ice: 1 },
      'and the stored quantity survives, because the world roster still vouches for the id'
    );
    assert.deepEqual(
      resolvedEssencesFor(parted, store.corpus()).map((row) => row.id),
      ['ice'],
      'the read union answers the surviving row set, which is the in-system array’s'
    );
  });

  it('re-adding restores the row, and the essence resolves over a quantity it never lost', async () => {
    const store = loadedStore();
    const manager = new CraftingSystemManager({ getRecipes: () => [] }, { essenceScopeStore: store });

    await store.save(withoutMembership(store, 'fire'));
    const parted = manager._normalizeSystem(systemWith(['ice']));
    assert.deepEqual(parted.components[0].essences, { fire: 3, ice: 1 });

    // RE-ADD, both halves again: the membership record comes back, and the in-system row is
    // seeded from the world entity, which is what `joinEssenceToSystem` does.
    const payload = store.get();
    payload.membership[`fire|${SYSTEM_ID}`] = {
      entityId: 'fire',
      systemId: SYSTEM_ID,
      inherit: {},
      enabled: true,
    };
    await store.save(payload);
    const rejoined = manager._normalizeSystem({
      ...parted,
      essenceDefinitions: [...parted.essenceDefinitions, { id: 'fire', name: 'Fire' }],
    });

    const rows = resolvedEssencesFor(rejoined, store.corpus());
    const fire = rows.find((row) => row.id === 'fire');
    assert.ok(fire, 'the essence is a member of the system again');
    assert.equal(fire.member, true);
    assert.equal(fire.enabled, true, 'so its behaviour resolves on craft');
    assert.deepEqual(
      rejoined.components[0].essences,
      { fire: 3, ice: 1 },
      'over the SAME quantity, never re-authored: nothing was lost to be restored'
    );
  });

  it('NEGATIVE CONTROL: with NO world half the same delete DOES strip the quantity', async () => {
    // This is what the raised concern described, and it is exactly right for a world that has no
    // world-scope corpus - which is also a world on which `Remove from this system` cannot be
    // reached, because the screen that offers it is the world essence entry.
    const unwired = new CraftingSystemManager({ getRecipes: () => [] }, { essenceScopeStore: null });
    assert.deepEqual(unwired._normalizeSystem(systemWith(['fire', 'ice'])).components[0].essences, {
      fire: 3,
      ice: 1,
    });
    assert.deepEqual(
      unwired._normalizeSystem(systemWith(['ice'])).components[0].essences,
      { ice: 1 },
      'the basis is the in-system array alone, so the prune is decidable and it fires'
    );
  });

  it('and deleting the WORLD ENTITY does strip it, which is the distinction Remove rests on', async () => {
    // `Delete this essence` removes the world entity, its defaults and every membership record.
    // The id then leaves the basis, and the prune that follows is correct rather than a defect.
    const store = loadedStore();
    const manager = new CraftingSystemManager({ getRecipes: () => [] }, { essenceScopeStore: store });
    const payload = store.get();
    payload.entities = payload.entities.filter((entity) => entity.id !== 'fire');
    delete payload.membership[`fire|${SYSTEM_ID}`];
    await store.save(payload);

    assert.deepEqual(manager._normalizeSystem(systemWith(['ice'])).components[0].essences, {
      ice: 1,
    });
  });
});
