import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import {
  runContainerDiffPaths,
  runContainersChanged,
} from '../src/systems/runFlagInvalidation.js';
import {
  FakeActor as SharedActor,
  setupRunManagerGlobals as setupGlobals,
} from './helpers/run-manager-fakes.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Issue 739 (read side): the run managers cache an actor's runs in memory and never
// learn about a write another client (or the primary-GM world-time resume) makes to the
// actor's run flags. `invalidateCache(actorId)` — wired to the `updateActor` hook in
// main.js — drops the stale cache so the next read reflects the synced document.

function stepRecipe(id) {
  return {
    id,
    craftingSystemId: 'system-1',
    getExecutionSteps: () => [{ id: `${id}-s1`, name: 'One' }],
  };
}

// Simulate a remote (player) client's replicated write landing on the GM's client:
// Foundry replaces the actor's flag with a FRESH merged object on sync, so deep-clone
// the stored container into a NEW object and add the player's run WITHOUT going through
// the GM manager's in-memory cache.
function remoteWriteActiveCraftingRun(actor, run) {
  const prev = actor._flags?.fabricate?.['fabricate.craftingRuns'] ?? { active: {}, history: [] };
  actor._flags.fabricate = actor._flags.fabricate || {};
  actor._flags.fabricate['fabricate.craftingRuns'] = {
    active: { ...(prev.active || {}), [run.id]: run },
    history: [...(prev.history || [])],
  };
}

test('CraftingRunManager: invalidateCache lets a GM see a run another client replicated in', async () => {
  setupGlobals();
  const actor = new SharedActor();
  const gmManager = new CraftingRunManager();

  // The GM persists something to this actor (seeding + freezing its cache).
  await gmManager.createRun(actor, stepRecipe('recipe-1'), [actor], 'gm-1');
  assert.equal(gmManager.getActiveRuns(actor).length, 1, 'GM sees the run it just persisted');

  // A player starts a run on the same actor; it replicates into the synced document.
  remoteWriteActiveCraftingRun(actor, {
    id: 'R2',
    actorUuid: actor.uuid,
    userId: 'player-9',
    craftingSystemId: 'system-1',
    recipeId: 'recipe-2',
    status: 'inProgress',
    currentStepIndex: 0,
    steps: [{ stepId: 'r2-s1', stepName: 'One', status: 'inProgress' }],
  });

  // A fresh manager proves the synced flag genuinely holds BOTH runs.
  const freshIds = new CraftingRunManager()
    .getActiveRuns(actor)
    .map((r) => r.id)
    .sort();
  assert.deepEqual(freshIds, ['R2', 'rid-1'], 'the synced flag holds both runs');

  // Before invalidation the GM's frozen cache still hides the player's run (the bug).
  assert.deepEqual(
    gmManager.getActiveRuns(actor).map((r) => r.id),
    ['rid-1'],
    'stale cache hides the replicated run until invalidated'
  );

  // The updateActor hook invalidates the cache; the next read re-reads the document.
  gmManager.invalidateCache(actor.id);
  assert.deepEqual(
    gmManager
      .getActiveRuns(actor)
      .map((r) => r.id)
      .sort(),
    ['R2', 'rid-1'],
    'after invalidateCache the GM sees the replicated run too'
  );
});

test('SalvageRunManager: invalidateCache lets a GM see a run another client replicated in', async () => {
  setupGlobals();
  const actor = new SharedActor('Salvager');
  const gmManager = new SalvageRunManager();

  const seed = await gmManager.createRun(actor, {
    craftingSystemId: 'system-1',
    componentId: 'component-1',
    status: 'inProgress',
  });
  assert.equal(gmManager.getActiveRuns(actor).length, 1);

  // Remote replicated salvage run (doubly-nested salvageRuns flag path).
  const prev = actor._flags.fabricate['fabricate.salvageRuns'];
  actor._flags.fabricate['fabricate.salvageRuns'] = {
    active: {
      ...(prev.active || {}),
      S2: {
        id: 'S2',
        actorUuid: actor.uuid,
        userId: 'player-9',
        craftingSystemId: 'system-1',
        componentId: 'component-2',
        status: 'inProgress',
      },
    },
    history: [...(prev.history || [])],
  };

  assert.deepEqual(
    gmManager.getActiveRuns(actor).map((r) => r.id),
    [seed.id],
    'stale cache hides the replicated salvage run until invalidated'
  );

  gmManager.invalidateCache(actor.id);
  assert.deepEqual(
    gmManager
      .getActiveRuns(actor)
      .map((r) => r.id)
      .sort(),
    ['S2', seed.id].sort(),
    'after invalidateCache the GM sees the replicated salvage run'
  );
});

test('runContainersChanged: matches the doubly-nested crafting/salvage and single-scope gathering flag paths', () => {
  const has = (object, path) =>
    String(path)
      .split('.')
      .every((seg) => {
        if (object == null || typeof object !== 'object' || !(seg in object)) return false;
        object = object[seg];
        return true;
      });

  const crafting = { flags: { fabricate: { fabricate: { craftingRuns: { active: {} } } } } };
  assert.deepEqual(runContainersChanged(crafting, has), ['crafting']);

  const salvage = { flags: { fabricate: { fabricate: { salvageRuns: { history: [] } } } } };
  assert.deepEqual(runContainersChanged(salvage, has), ['salvage']);

  const gathering = { flags: { fabricate: { gatheringRuns: { active: {} } } } };
  assert.deepEqual(runContainersChanged(gathering, has), ['gathering']);

  // The single-scope crafting path must NOT match (would silently never fire).
  const wrongDepth = { flags: { fabricate: { craftingRuns: { active: {} } } } };
  assert.deepEqual(runContainersChanged(wrongDepth, has), []);

  // A noisy HP-tick diff touches no run flag.
  const hpTick = { system: { attributes: { hp: { value: 3 } } } };
  assert.deepEqual(runContainersChanged(hpTick, has), []);
});

// ---------------------------------------------------------------------------
// UPDATE-OPERATOR SPELLINGS (issue 1654)
//
// An update operator is part of the LAST path segment, so a write that uses one reaches
// the change diff under a different key. The `1.34.0` essence-merge remap forced-replaces
// each run container (`==<container>`) because it rewrites a map's KEY SET and a merge
// write cannot remove a key, and `-=` has been reachable all along through
// `deleteRemovedActiveRunFlags`. A probe for the bare spelling alone matches neither —
// `runContainersChanged` answers `[]`, no manager drops its cache, and every other client
// goes on serving runs it has already been told are stale. That is the module header's own
// "matching the wrong depth means the hook silently never fires", one prefix over.
// ---------------------------------------------------------------------------

/** The segment-walking probe `foundry.utils.hasProperty` implements at runtime. */
function hasSegmentPath(object, path) {
  let node = object;
  for (const segment of String(path).split('.')) {
    if (node == null || typeof node !== 'object' || !(segment in node)) return false;
    node = node[segment];
  }
  return true;
}

/** The expanded diff Foundry hands `updateActor` for one flattened update key. */
function expandedDiff(updateKey) {
  const segments = updateKey.split('.');
  const diff = {};
  let node = diff;
  for (const segment of segments.slice(0, -1)) {
    node[segment] = {};
    node = node[segment];
  }
  node[segments.at(-1)] = { active: {}, history: [] };
  return diff;
}

for (const [operator, why] of [
  ['==', 'the forced replacement the 1.34.0 essence remap writes'],
  ['-=', 'the deletion `deleteRemovedActiveRunFlags` has always been able to write'],
]) {
  test(`runContainersChanged matches a \`${operator}\` diff at BOTH flag depths (${why})`, () => {
    // BOTH DEPTHS IN ONE TEST, because the asymmetry is the trap: crafting and salvage are
    // DOUBLY nested and gathering is SINGLE-scope, so a fix that hard-coded one parent path
    // would leave the other silently unmatched exactly as the bare spelling did.
    assert.deepEqual(
      runContainersChanged(
        expandedDiff(`flags.fabricate.fabricate.${operator}craftingRuns`),
        hasSegmentPath
      ),
      ['crafting']
    );
    assert.deepEqual(
      runContainersChanged(
        expandedDiff(`flags.fabricate.fabricate.${operator}salvageRuns`),
        hasSegmentPath
      ),
      ['salvage']
    );
    assert.deepEqual(
      runContainersChanged(expandedDiff(`flags.fabricate.${operator}gatheringRuns`), hasSegmentPath),
      ['gathering'],
      'the SINGLE-scope depth, derived from the descriptor rather than written out'
    );
  });
}

test('the operator match is NOT a widening: an unrelated container still returns []', () => {
  // The risk in teaching a matcher a new spelling is that it starts matching everything.
  // Each container is probed under its OWN last segment only.
  const unrelated = [
    'flags.fabricate.fabricate.==learnedRecipes',
    'flags.fabricate.fabricate.-=alchemyDeadEnds',
    'flags.fabricate.==someOtherModuleFlag',
    'flags.other-module.==craftingRuns',
  ];
  for (const updateKey of unrelated) {
    assert.deepEqual(
      runContainersChanged(expandedDiff(updateKey), hasSegmentPath),
      [],
      `${updateKey} touches no Fabricate run container`
    );
  }
  // The WRONG DEPTH stays wrong under an operator too: a single-scope crafting write is
  // not a thing Fabricate does, and matching it would fire the hook on a flag nobody reads.
  assert.deepEqual(
    runContainersChanged(expandedDiff('flags.fabricate.==craftingRuns'), hasSegmentPath),
    []
  );
  // A noisy HP tick is still the common case and must stay free.
  assert.deepEqual(
    runContainersChanged({ system: { attributes: { hp: { value: 3 } } } }, hasSegmentPath),
    []
  );
});

test('the prefix goes on the LAST segment only, never an interior one', () => {
  // `flags.fabricate.==fabricate.craftingRuns` is a DIFFERENT write — it force-replaces the
  // whole `fabricate` scope object — and a matcher that prefixed interior segments would
  // claim it as a `craftingRuns` touch.
  assert.deepEqual(runContainerDiffPaths('flags.fabricate.fabricate.craftingRuns'), [
    'flags.fabricate.fabricate.craftingRuns',
    'flags.fabricate.fabricate.-=craftingRuns',
    'flags.fabricate.fabricate.==craftingRuns',
  ]);
  assert.deepEqual(runContainerDiffPaths('flags.fabricate.gatheringRuns'), [
    'flags.fabricate.gatheringRuns',
    'flags.fabricate.-=gatheringRuns',
    'flags.fabricate.==gatheringRuns',
  ]);
  assert.deepEqual(runContainerDiffPaths('bare'), ['bare', '-=bare', '==bare'], 'no leading dot');
  assert.deepEqual(runContainerDiffPaths(''), []);
});

test('the default probe matches the injected one, so both seams see the operator spellings', () => {
  // The probe is injectable — `foundry.utils.hasProperty` at runtime, `hasByPath` by
  // default — and a fix that worked under only one of them would pass every test in this
  // file while failing in Foundry, or the reverse.
  const diff = expandedDiff('flags.fabricate.fabricate.==craftingRuns');
  assert.deepEqual(runContainersChanged(diff), ['crafting'], 'the hasByPath default');
  assert.deepEqual(runContainersChanged(diff, hasSegmentPath), ['crafting'], 'and the injected one');
  assert.deepEqual(runContainersChanged(diff, 'not a function'), ['crafting'], 'and the fallback');
});

test('src/main.js still routes the hook through the matcher it is filtered by', () => {
  // The filter is load-bearing: `updateActor` fires on every HP tick. An unfiltered hook
  // would be a performance defect, and a filter that never matches is this whole bug.
  const source = readFileSync(resolve(HERE, '..', 'src', 'main.js'), 'utf8');
  assert.match(source, /const changed = runContainersChanged\(changes, foundry\.utils\.hasProperty\);/);
});
