/**
 * What the lab's seeded interactables can actually SHOW, measured through the production scan
 * (issue 1520).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLinkedVisual } from '../src/canvas/linkedVisuals/linkedInteractableVisual.js';
import {
  MARKER_STATUS,
  scanSceneInteractables,
} from '../src/canvas/regions/interactableSceneScan.js';
import { resolveInteractableSourceLabel } from '../src/ui/interactableSourceLibrary.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import {
  LAB_INTERACTABLE_SCENE_ID,
  seedLabInteractables,
} from './view-lab/world/labInteractables.js';

/**
 * Seed the lab interactables onto a minimal world and return the rows the manager would list.
 *
 * @returns {object[]} The scan rows, in seed order.
 */
function scanSeededRows() {
  const documents = new Map();
  const world = {
    content: buildLabContent(),
    documents,
    scenes: [
      {
        id: LAB_INTERACTABLE_SCENE_ID,
        uuid: 'Scene.lab-map',
        name: 'The Verdant Reach',
        regions: [
          {
            id: 'deep-gate',
            uuid: 'Scene.lab-map.Region.deep-gate',
            name: 'Deep Gate Approach',
          },
        ],
      },
    ],
  };
  seedLabInteractables(world);

  // The lookups `InteractablesManagerApp` injects, over the lab's own systems and tasks.
  const sourceDeps = {
    getCraftingSystemManager: () => ({
      getSystem: (id) => world.content.systems.find((system) => system.id === id) ?? null,
    }),
    getGatheringConfig: () => world.content.gatheringConfig,
  };

  const previous = globalThis.fromUuidSync;
  globalThis.fromUuidSync = (uuid) => documents.get(uuid) ?? null;
  try {
    const scene = world.scenes[0];
    return scanSceneInteractables(scene, {
      resolveSourceLabel: ({ system }) => resolveInteractableSourceLabel(sourceDeps, system),
      resolveVisualResolved: ({ system }) => resolveLinkedVisual(system, { scene }) !== null,
    });
  } finally {
    globalThis.fromUuidSync = previous;
  }
}

test('the lab world seeds a row for every marker tone the manager list can paint', () => {
  const rows = scanSeededRows();
  const statuses = new Set(rows.map((row) => row.markerStatus));

  // The three tones, by the statuses that select them.
  assert.ok(
    statuses.has(MARKER_STATUS.MISSING),
    "no seeded interactable has a configured-but-unresolvable marker, so `markerTone`'s " +
      '`danger` branch cannot appear in any published frame'
  );
  assert.ok(
    statuses.has(MARKER_STATUS.TILE),
    'no seeded interactable has a RESOLVING marker, so the neutral tone is unphotographed'
  );
  assert.ok(
    statuses.has(MARKER_STATUS.REGION_ONLY),
    'no seeded interactable is region-only, so the muted tone is unphotographed'
  );
});

test('the lab world seeds a row for every state badge the manager list can draw', () => {
  const rows = scanSeededRows();

  // `stateBadges` shows `Disabled`, `Locked` and `Consumed` and falls back to `Enabled`, so the
  // frame covers the fallback only if some row is in none of the three.
  assert.ok(
    rows.some((row) => row.state.enabled === false),
    'no seeded interactable is disabled, so the `Disabled` badge is unphotographed'
  );
  assert.ok(
    rows.some((row) => row.state.locked === true),
    'no seeded interactable is locked, so the `Locked` badge is unphotographed'
  );
  assert.ok(
    rows.some((row) => row.state.enabled && !row.state.locked && !row.state.consumed),
    'every seeded interactable is in a notable state, so the default `Enabled` badge never draws'
  );
  assert.ok(
    rows.every((row) => row.state.consumed === false),
    'a seeded interactable is now consumed — the `Consumed` badge is reachable, so add it to the ' +
      'assertions above and stop recording it as the one badge the lab does not cover'
  );
});

test('the lab world seeds each source chip the manager list can draw', () => {
  const rows = scanSeededRows();

  assert.ok(
    rows.some((row) => row.sourceConfigured && row.sourceResolved && row.sourceLabel),
    'no seeded interactable names its resolved source, so the neutral chip is unphotographed'
  );
  const orphaned = rows.filter((row) => row.sourceConfigured && !row.sourceResolved);
  assert.ok(
    orphaned.length > 0,
    'no seeded interactable is a configured Tool or Task that no longer resolves, so the ' +
      '`Unresolved` chip is unphotographed'
  );
  for (const row of orphaned) {
    assert.ok(row.sourceId, 'an unresolved row offers the id it could not find');
    assert.ok(row.name, 'and keeps a stored name as its title');
  }
  assert.ok(
    rows.some((row) => !row.sourceConfigured && row.sourceId === '' && row.name === ''),
    'no seeded interactable is unconfigured, so `Needs configuration` is unphotographed'
  );
  assert.ok(
    rows.every((row) => !JSON.stringify(row).includes('Fabricate.unconfigured')),
    'a seeded row leaks the unconfigured sentinel'
  );
});
