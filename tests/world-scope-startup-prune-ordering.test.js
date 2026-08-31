/**
 * THE STARTUP PRUNE ORDERING (issue 1363).
 *
 * A shipped startup maintenance pass destroys exactly the data the `1.30.0` identity-flag
 * remap exists to repair, on the SAME BOOT, BEFORE the remap runs.
 *
 * The sequence, all inside one `ready` tick:
 *
 *   `Fabricate#initialize()`
 *     -> `_runMigrations()`                    re-keys component ids in `craftingSystems`
 *     -> `craftingSystemManager.initialize()`  hydrates the NEW ids
 *     -> `runStartupMaintenance(composeStartupPassList({...}))`
 *   `runWorldScopeIdentityFlagRemap()`         <- too late
 *
 * `composeStartupPassList` derives `validSalvageComponentsBySystem` from the POST-migration
 * systems and schedules `salvageRunManager.cleanupInvalidRuns`, which deletes any active run
 * whose `componentId` is not in that set — and an in-flight salvage run still carries the OLD
 * id. `cleanupStalePreferences` drops every `salvage:<oldComponentId>` progressive-order key
 * for the same reason.
 *
 * **NO EXISTING GATE CAN WITHHOLD IT.** `WHOLE_CORPUS_ID_BASIS` is a frozen literal of three
 * `true`s, so the Valid Id Basis machinery that protects everything else in this epic is
 * structurally unable to see a corpus that is complete but whose IDS HAVE JUST MOVED.
 *
 * **THE TEAR PATH IS SAFER THAN THE HAPPY PATH.** A tear before the `craftingSystems` leg
 * leaves the corpus un-re-keyed, maintenance sees consistent old ids, and nothing is pruned.
 * It is the SUCCESSFUL migration that loses data.
 *
 * **AND IT REACHES PLAYERS.** `cleanupInvalidRuns` is scoped to `selectWritableActors`, so a
 * player client booting after the GM's writeback prunes its OWN actors' runs — and players
 * never run the remap at all. A fix that only reorders the GM's `ready` body leaves that open.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { getFabricateFlag, setFabricateFlag } from '../src/config/flags.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import { migrateWorldScopeEntities } from '../src/migration/migrateWorldScopeEntities.js';
import { remapWorldScopeIdentityFlags } from '../src/migration/remapWorldScopeIdentityFlags.js';
import { runStartupMaintenance } from '../src/systems/startupMaintenance.js';
import { composeStartupPassList } from '../src/systems/startupPassComposition.js';
import {
  hasPendingWorldScopeRekey,
  WORLD_SCOPE_REKEY_MAP_SETTING_KEY,
} from '../src/systems/worldScopeRekeyPending.js';

import { installFoundryStubs } from './helpers/worldScopeCorpus.js';

installFoundryStubs();
const { SalvageRunManager } = await import('../src/systems/SalvageRunManager.js');

const EVERY_PASS = Object.freeze([
  'crafting runs',
  'phantom crafting runs',
  'salvage runs',
  'learned recipes',
  'stale preferences',
]);

/**
 * An actor whose `getFlag` walks a DOTTED key exactly as Foundry's does and whose `update`
 * applies flattened paths, including Foundry's `-=` deletion syntax.
 *
 * @param {string} id
 * @param {object} flags
 * @returns {object}
 */
function makeActor(id, flags = {}) {
  const actor = {
    id,
    uuid: `Actor.${id}`,
    isOwner: true,
    flags,
    getFlag(scope, key) {
      let node = actor.flags?.[scope];
      for (const segment of String(key).split('.')) {
        if (node === null || typeof node !== 'object') return undefined;
        node = node[segment];
      }
      // Foundry returns a DEEP CLONE, so a caller that mutates what it read cannot reach the
      // stored document. Modelling that is load-bearing: a shallower double would let a
      // read-mutate-write pass appear to work without ever persisting.
      return node === undefined ? undefined : JSON.parse(JSON.stringify(node));
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const segments = path.split('.').filter((segment) => segment !== 'flags');
        const leaf = segments.pop();
        let node = actor.flags;
        for (const segment of segments) {
          node[segment] ??= {};
          node = node[segment];
        }
        if (leaf.startsWith('-=')) delete node[leaf.slice(2)];
        else node[leaf] = JSON.parse(JSON.stringify(value));
      }
      return actor;
    },
    updateSource() {},
  };
  return actor;
}

/** One component, shaped as `_normalizeComponent` emits it. */
function component(id) {
  return {
    id,
    name: 'Ash Salt',
    img: 'a.png',
    description: 'A',
    originItemUuid: 'Item.shared',
    registeredItemUuid: 'Item.shared',
    aliasItemUuids: [],
    salvage: { enabled: true, toolIds: [], resultGroups: [] },
  };
}

/**
 * A world whose OLDER system wins the shared source item, so the younger system's component is
 * re-keyed — and an in-flight salvage run in that younger system still names the old id.
 */
function worldWithAnInFlightSalvageRun() {
  return [
    {
      id: 'sys-a',
      name: 'Alpha',
      components: [component('comp-new')],
      essenceDefinitions: [],
      tools: [],
    },
    {
      id: 'sys-b',
      name: 'Beta',
      components: [component('comp-old')],
      essenceDefinitions: [],
      tools: [],
    },
  ];
}

const RUN = Object.freeze({
  id: 'run-1',
  actorUuid: 'Actor.hero',
  craftingSystemId: 'sys-b',
  componentId: 'comp-old',
  status: 'inProgress',
});

/** The collaborators `composeStartupPassList` needs, with only the salvage half real. */
function collaborators({
  systems = [],
  salvageRunManager = { cleanupInvalidRuns: async () => {} },
} = {}) {
  return {
    recipeManager: { getRecipes: () => [], getRecipe: () => null },
    craftingSystemManager: { getSystems: () => systems },
    craftingRunManager: {
      cleanupInvalidRuns: async () => {},
      pruneInstantaneousActiveRuns: async () => {},
    },
    salvageRunManager,
    recipeVisibilityService: { cleanupLearnedRecipes: async () => {} },
    resolveGatheringActor: () => null,
    isSelectableGatheringActor: () => false,
  };
}

/**
 * Drive the REAL startup sequence: migrate, compose and run the maintenance passes exactly as
 * `Fabricate#initialize` does, then run the `ready`-body remap.
 */
async function bootThroughStartup() {
  const migrated = migrateWorldScopeEntities({
    recipes: [],
    systems: worldWithAnInFlightSalvageRun(),
    gatheringConfig: {},
    componentScope: {},
    essenceScope: {},
    toolScope: {},
    worldScopeRekeyMap: {},
  });
  assert.equal(
    migrated.worldScopeRekeyMap['sys-b'].components['comp-old'],
    'comp-new',
    'the premise: this corpus really does re-key the component the in-flight run names'
  );

  const settings = new Map([['worldScopeRekeyMap', migrated.worldScopeRekeyMap]]);
  const actor = makeActor('hero', {
    fabricate: { fabricate: { salvageRuns: { active: { [RUN.id]: { ...RUN } }, history: [] } } },
  });
  globalThis.game = { ...globalThis.game, actors: [actor], users: {}, user: {} };

  const warnings = [];
  const passes = composeStartupPassList({
    ...collaborators({ systems: migrated.systems, salvageRunManager: new SalvageRunManager() }),
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => settings.set(key, value),
    warn: (message, detail) => warnings.push({ message, detail }),
  });
  await runStartupMaintenance(passes);

  await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: settings.get('worldScopeRekeyMap'),
    readFlag: (document, key, fallback = null, options = {}) =>
      (options.bare
        ? document?.getFlag?.('fabricate', key)
        : getFabricateFlag(document, key, fallback)) ?? fallback,
    writeFabricateFlag: (document, key, value) => setFabricateFlag(document, key, value),
    writeBareFlag: (document, key, value) => document?.setFlag?.('fabricate', key, value),
  });

  return { actor, passes, warnings };
}

test('an in-flight salvage run SURVIVES the boot that re-keys its component, and ends with the NEW id', async () => {
  const { actor } = await bootThroughStartup();
  const container = getFabricateFlag(actor, 'salvageRuns', null);
  assert.ok(
    container?.active?.[RUN.id],
    'the startup salvage prune must not delete a run whose component id has just MOVED — ' +
      'the run is valid, its reference is stale, and the remap that fixes it has not run yet'
  );
  assert.equal(
    container.active[RUN.id].componentId,
    'comp-new',
    'and the remap must then leave it naming the NEW id'
  );
});

test('the salvage and stale-preference passes are WITHHELD while a re-key map is pending', async () => {
  const { passes, warnings } = await bootThroughStartup();
  assert.deepEqual(
    passes.map(([label]) => label),
    ['crafting runs', 'phantom crafting runs', 'learned recipes'],
    'only the two passes that prune against COMPONENT ids are withheld; the rest still run, ' +
      'because crafting runs key on recipe and system ids and neither is ever re-keyed'
  );
  // The omission must be VISIBLE. `runStartupMaintenance` reports only failures and the caller
  // discards them, so a gate that silently omitted every pass would read as a clean boot.
  assert.equal(warnings.length, 1, 'the omission is warned about, once');
  assert.deepEqual(warnings[0].detail.omitted.map((omission) => omission.label).sort(), [
    'salvage runs',
    'stale preferences',
  ]);
  assert.deepEqual(warnings[0].detail.omitted[0].incompleteKinds, ['componentIdentityRemap']);
});

test('a PLAYER client withholds too, because it never runs the remap at all', () => {
  // The remap is active-GM gated, so a player booting after the GM's writeback would prune its
  // OWN actors' runs and nothing would ever repair them. The withholding predicate is
  // corpus-derived, so every client evaluates it independently and reaches the same answer.
  const settings = new Map([
    ['worldScopeRekeyMap', { 'sys-b': { components: { 'comp-old': 'comp-new' } } }],
  ]);
  const passes = composeStartupPassList({
    ...collaborators(),
    getSetting: (key) => settings.get(key),
    setSetting: async () => {},
    warn: () => {},
  });
  assert.ok(!passes.some(([label]) => label === 'salvage runs'));
  assert.ok(!passes.some(([label]) => label === 'stale preferences'));
});

test('once the map is CLEARED, both passes run again — the withholding is not permanent', () => {
  for (const map of [undefined, null, {}, 'nonsense', []]) {
    const settings = new Map([['worldScopeRekeyMap', map]]);
    const passes = composeStartupPassList({
      ...collaborators(),
      getSetting: (key) => settings.get(key),
      setSetting: async () => {},
      warn: () => {},
    });
    assert.deepEqual(
      passes.map(([label]) => label),
      EVERY_PASS,
      `a ${JSON.stringify(map) ?? 'undefined'} map is not a pending re-key and must withhold nothing`
    );
  }
});

test('a getSetting that THROWS withholds rather than assuming the map is empty', () => {
  // Fail CLOSED. These passes are housekeeping; what they delete is not recoverable.
  const passes = composeStartupPassList({
    ...collaborators(),
    getSetting: () => {
      throw new Error('unreadable');
    },
    setSetting: async () => {},
    warn: () => {},
  });
  assert.ok(!passes.some(([label]) => label === 'salvage runs'));
  assert.ok(!passes.some(([label]) => label === 'stale preferences'));
});

test('the setting-key mirror is PINNED against SETTING_KEYS', () => {
  // `worldScopeRekeyPending.js` spells the key itself rather than importing `SETTING_KEYS`,
  // because `startupPassComposition.js` is documented as reading no globals and importing
  // `src/config/settings.js` there would drag `src/ui/theme.js` into that seam's closure. A
  // hand-maintained mirror needs a guard, so this is it.
  assert.equal(WORLD_SCOPE_REKEY_MAP_SETTING_KEY, SETTING_KEYS.WORLD_SCOPE_REKEY_MAP);
});

test('the pending predicate reads a MAP and nothing else, and fails closed', () => {
  assert.equal(
    hasPendingWorldScopeRekey(() => ({ 'sys-a': { components: { a: 'b' } } })),
    true
  );
  assert.equal(
    hasPendingWorldScopeRekey(() => ({})),
    false
  );
  assert.equal(
    hasPendingWorldScopeRekey(() => null),
    false
  );
  assert.equal(
    hasPendingWorldScopeRekey(() => []),
    false,
    'an array is not a map this pass wrote'
  );
  assert.equal(
    hasPendingWorldScopeRekey(() => 'nonsense'),
    false
  );
  assert.equal(
    hasPendingWorldScopeRekey(undefined),
    true,
    'no accessor at all is unreadable, and unreadable fails CLOSED'
  );
});

// ---------------------------------------------------------------------------
// The MUTATION-TIME door, end to end through the real manager
// ---------------------------------------------------------------------------

test('_cleanupCraftingPreferences WITHHOLDS its sweep while a re-key map is pending', async () => {
  // THE OTHER DOOR, and it needs its own end-to-end arm. The startup half is proven through the
  // real `SalvageRunManager`; this half was asserted only at the pure `buildStartupPassList`
  // seam, which cannot see a WRONG SETTING KEY at the composition site: `getSetting` would then
  // answer `undefined`, the pending predicate would answer `false`, and the gate would resolve
  // TRUE on every boot — invisible to every seam-level arm.
  const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
  const { SETTING_KEYS } = await import('../src/config/settings.js');

  const run = async (rekeyMap) => {
    const stored = new Map([
      [SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, rekeyMap],
      // One live key and one stale key, so a sweep that runs is visible by what it removes.
      [SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, { 'salvage:comp-live': [], 'salvage:comp-gone': [] }],
    ]);
    const previous = globalThis.game;
    globalThis.game = {
      ...previous,
      user: {},
      users: {},
      actors: [],
      settings: {
        get: (namespace, key) => stored.get(key),
        set: async (namespace, key, value) => stored.set(key, value),
      },
    };
    try {
      const manager = new CraftingSystemManager({ getRecipes: () => [] });
      manager.systems = new Map([['sys-a', { id: 'sys-a', components: [{ id: 'comp-live' }] }]]);
      manager.recipeManager = { getRecipes: () => [] };
      await manager._cleanupCraftingPreferences({ subject: 'a test' });
      return Object.keys(stored.get(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER) ?? {}).sort();
    } finally {
      globalThis.game = previous;
    }
  };

  assert.deepEqual(
    await run({ 'sys-a': { components: { 'comp-old': 'comp-live' } } }),
    ['salvage:comp-gone', 'salvage:comp-live'],
    'with a re-key PENDING the sweep is withheld and the stale key survives untouched'
  );
  assert.deepEqual(
    await run({}),
    ['salvage:comp-live'],
    'and with no re-key pending the sweep runs exactly as it always did'
  );
});
