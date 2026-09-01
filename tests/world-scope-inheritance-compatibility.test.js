/**
 * WHAT `INHERITING` MEANS FOR A WORLD THAT ALREADY EXISTS (issue 1372, epic 1357).
 *
 * Issue 1372 retires `## CraftingSystem` requirement 36's blanket claim and makes an INHERITING
 * section resolve to its world default. That is a change to what every non-UI reader answers, so
 * the question that decides whether it may ship is not "does the switch work" - its neighbour
 * `tests/world-scope-inherited-section-resolution.test.js` pins that - but "does any world that
 * exists today move". THE ANSWER IS NO, and this file is the proof, stated over the three states a
 * real world can actually be in.
 *
 * 1. **NEVER WRITTEN.** A world that predates the world-scope corpus has no `fabricate.*Scope`
 *    setting at all. Foundry synthesizes the registered default for an unwritten world setting, so
 *    the store reads `{}` - which is why `isSeeded()` is taken from the RAW payload's key presence
 *    and not from the normalized corpus. With no world half the read seam answers the in-system
 *    array ITSELF, by reference, so there is no section for a switch to decide.
 * 2. **MIGRATED.** `buildMembershipRecord` writes `OVERRIDING_INHERIT` - every section `false` -
 *    for every `(entity, system)` pair the `1.30.0` migration creates. Every section is therefore
 *    OVERRIDING on a migrated world, so every row still answers from the in-system record.
 * 3. **OPTED IN.** A GM flips one section's switch to inheriting. That row, and only that row,
 *    follows the world default. This is the opt-in, and it is the whole point.
 *
 * ── IT RUNS ON REAL PERSISTED DATA, THROUGH A REAL `load()` ──────────────────────────────────
 * The payloads are produced by the REAL `migrateWorldScopeEntities` over the shared adversarial
 * corpus, put into a `Map`-backed settings seam, and read back through the REAL
 * `createEssenceScopeStore().load()`. A hand-written corpus literal would test this file's beliefs
 * about the persisted shape rather than the shape the migration writes, and a store built around a
 * literal would skip `load()`'s raw-key-presence reading - the one thing that distinguishes "never
 * written" from "written empty", which is state 1's whole basis.
 *
 * The BROADEST form of this proof already exists and is not duplicated here:
 * `tests/world-scope-migration-differential.test.js` projects every entity of every scenario
 * BEFORE the migration without the world half and AFTER it THROUGH the read union, and permits
 * only the identity renames the report names. That file is the one that would redden if this
 * change moved a migrated world's behaviour anywhere. What this file adds is the three states
 * NAMED, so a later reader can see which one they are reasoning about.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';

import { installFoundryStubs, scenarioSpecs } from './helpers/worldScopeCorpus.js';

installFoundryStubs();
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { SETTING_KEYS } = await import('../src/config/settings.js');
const { createEssenceScopeStore } = await import('../src/systems/worldScopeStores.js');
const { resolvedEssencesFor } = await import('../src/systems/scopedEntityReads.js');

/** A `Map`-backed settings seam, which is what a world setting behaves like: absence is a value. */
function settingsSeam(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
      return value;
    },
  };
}

/** Run the REAL migration over one scenario and hand back its three persisted scope payloads. */
function migrate(raw) {
  return migrateWorldScopeEntities({
    recipes: raw.recipes,
    systems: raw.systems,
    gatheringConfig: raw.gatheringConfig,
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
}

/** A REAL essence scope store over a REAL persisted value, loaded through `load()`. */
function loadedEssenceStore(persisted) {
  const seam = settingsSeam(persisted === undefined ? {} : { [SETTING_KEYS.ESSENCE_SCOPE]: persisted });
  const store = createEssenceScopeStore(seam);
  store.load();
  return { store, seam };
}

/** The first scenario that actually carries essence definitions in more than one system. */
function essenceScenario() {
  for (const spec of scenarioSpecs()) {
    const withEssences = (spec.raw.systems ?? []).filter(
      (system) => (system.essenceDefinitions ?? []).length > 0
    );
    if (withEssences.length > 0) return { spec, system: withEssences[0] };
  }
  throw new Error('no scenario carries an essence definition');
}

describe('state 1 — a world that never wrote the setting', () => {
  it('reads as UNSEEDED, so the read seam answers the in-system array BY REFERENCE', () => {
    const { store } = loadedEssenceStore(undefined);
    assert.equal(
      store.isSeeded('entities'),
      false,
      'Foundry answers the REGISTERED DEFAULT for an unwritten world setting, and the raw key ' +
        'presence is the only thing that tells that apart from a GM who emptied the roster'
    );
    const essenceDefinitions = [
      { id: 'fire', name: 'Fire', propertyMacroUuid: 'Macro.system', enabled: false },
    ];
    const system = { id: 'sys-a', essenceDefinitions };
    assert.equal(
      resolvedEssencesFor(system, store.corpus()),
      essenceDefinitions,
      'the SAME object: no membership record exists, so no section exists for a switch to decide'
    );
  });

  it('and an EMPTY roster is treated the same way, which is what keeps the answer cheap', () => {
    const { store } = loadedEssenceStore({ entities: [], defaults: {}, membership: {} });
    const essenceDefinitions = [{ id: 'fire', name: 'Fire' }];
    assert.equal(resolvedEssencesFor({ id: 'sys-a', essenceDefinitions }, store.corpus()), essenceDefinitions);
  });
});

describe('state 2 — a MIGRATED world resolves exactly as it did before', () => {
  it('every membership record the real migration persists is OVERRIDING in every section', () => {
    // The mechanism, asserted over the whole adversarial corpus rather than one fixture: if any
    // pair the migration writes were INHERITING, that pair's behaviour would move at upgrade.
    let examined = 0;
    for (const { name, raw } of scenarioSpecs()) {
      const result = migrate(raw);
      const { store } = loadedEssenceStore(result.essenceScope);
      for (const record of store.corpus().membership) {
        examined += 1;
        assert.deepEqual(
          record.inherit,
          { effectSource: false, macro: false },
          `${name}: ${record.entityId}|${record.systemId} must be OVERRIDING in every section`
        );
      }
    }
    // NON-VACUITY. Not every scenario declares an essence, so a per-scenario floor would fail on
    // a corpus that is legitimately essence-free; a corpus-wide floor is what stops the loop
    // passing over nothing.
    assert.ok(examined >= 4, `too few membership records examined: ${examined}`);
  });

  it('so every essence row answers the in-system macro and source, through the read seam', () => {
    const { spec, system } = essenceScenario();
    const result = migrate(spec.raw);
    const { store } = loadedEssenceStore(result.essenceScope);
    const migratedSystem = result.systems.find((entry) => entry.id === system.id);
    const rows = resolvedEssencesFor(migratedSystem, store.corpus());

    assert.ok(rows.length > 0, 'the scenario must produce essence rows');
    for (const row of rows) {
      const stored = migratedSystem.essenceDefinitions.find((entry) => entry.id === row.id);
      assert.equal(row.propertyMacroUuid, stored.propertyMacroUuid);
      assert.equal(row.sourceComponentId, stored.sourceComponentId);
      assert.equal(row.enabled, stored.enabled !== false);
    }
  });
});

describe('state 3 — the GM opts one section in, and only that section moves', () => {
  it('flipping ONE section to inheriting makes that row follow the world default', async () => {
    const { spec, system } = essenceScenario();
    const result = migrate(spec.raw);
    const { store } = loadedEssenceStore(result.essenceScope);
    const migratedSystem = result.systems.find((entry) => entry.id === system.id);
    const target = migratedSystem.essenceDefinitions[0];

    // A GM edit through the persisted shape, saved and re-published exactly as
    // `worldScopeActions` does it: the world default is authored, then one switch is flipped.
    const payload = store.get();
    payload.defaults[target.id] = { ...(payload.defaults[target.id] ?? {}), id: target.id, macro: 'Macro.world-authored' };
    payload.membership[`${target.id}|${migratedSystem.id}`].inherit.macro = true;
    await store.save(payload);

    const rows = resolvedEssencesFor(migratedSystem, store.corpus());
    const moved = rows.find((row) => row.id === target.id);
    assert.equal(moved.propertyMacroUuid, 'Macro.world-authored', 'the opted-in section follows');
    assert.equal(
      moved.sourceComponentId,
      target.sourceComponentId,
      'and the section BESIDE it, still overriding, does not'
    );
    for (const row of rows) {
      if (row.id === target.id) continue;
      const stored = migratedSystem.essenceDefinitions.find((entry) => entry.id === row.id);
      assert.equal(row.propertyMacroUuid, stored.propertyMacroUuid, 'no other row moved');
    }
  });
});
