/**
 * What the lab's seeded interactables can actually SHOW, measured through the production scan.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
 * The Manage Interactables list draws one marker chip per row, and `markerTone` gives `missing`
 * the `danger` tone — the only alarm colour the row can paint, against `muted` for `region-only`
 * and `neutral` for everything else. Until issue 1520's review the lab seeded no behaviour that
 * could produce it: `classifyMarkerStatus` returns `missing` only for a marker that is CONFIGURED
 * and does not RESOLVE, so no amount of leaving a field out reaches it, and the one tone a
 * reviewer most needed to see was the one no frame could show.
 *
 * The registry's `interactables-manager-list` case now gates its own frame on that chip, which is
 * the assertion that makes the FRAME prove it. This file is the half that runs in `npm test`: a
 * capture needs harvested Foundry chrome, so it does not run on a fork PR and is not part of the
 * unit gate, and between a fixture regression and the next successful capture the tone would go
 * quietly unphotographed again.
 *
 * ── WHY IT SCANS RATHER THAN READS ────────────────────────────────────────────────────────────
 * The claim is about what the WINDOW receives, so it is measured by running the production
 * `scanSceneInteractables` over the seeded scene with the same visual resolver
 * `InteractablesManagerApp` wires — `resolveLinkedVisual(system, { scene })`, over a
 * `fromUuidSync` backed by the world's own document index. Asserting the fixture's uuid literal
 * instead would pass on a uuid that had quietly become resolvable, which is precisely the
 * regression worth catching.
 *
 * The scene skeleton below is the two identifiers `labWorld.js` declares, and it is not an
 * unguarded mirror: `seedLabInteractables` THROWS when the scene or region id it looks for is
 * absent, so renaming either there reds this file loudly rather than silently seeding nothing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLinkedVisual } from '../src/canvas/linkedVisuals/linkedInteractableVisual.js';
import {
  MARKER_STATUS,
  scanSceneInteractables,
} from '../src/canvas/regions/interactableSceneScan.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import {
  LAB_INTERACTABLE_SCENE_ID,
  seedLabInteractables,
} from './view-lab/world/labInteractables.js';

/**
 * Seed the lab interactables onto a minimal world and return the rows the manager would list.
 *
 * `globalThis.fromUuidSync` is installed for the duration because that is the PRIMARY path
 * `resolveLinkedVisual` takes and the one the seeder registers its marker Tile for; the
 * scene-embedded fallback would resolve the same Tile and hide a break in the index.
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

  const previous = globalThis.fromUuidSync;
  globalThis.fromUuidSync = (uuid) => documents.get(uuid) ?? null;
  try {
    const scene = world.scenes[0];
    return scanSceneInteractables(scene, {
      resolveVisualResolved: ({ system }) => resolveLinkedVisual(system, { scene }) !== null,
    });
  } finally {
    globalThis.fromUuidSync = previous;
  }
}

test('the lab world seeds a row for every marker tone the manager list can paint', () => {
  const rows = scanSeededRows();
  const statuses = new Set(rows.map((row) => row.markerStatus));

  // The three tones, by the statuses that select them. `danger` is the one this file was written
  // for; the other two are read with it so a fixture edit that traded one tone for another fails
  // here rather than silently narrowing the frame's coverage.
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
  // frame covers the fallback only if some row is in none of the three. `Consumed` is deliberately
  // absent from the set below: no seeded behaviour is consumed, and that gap is recorded here
  // rather than in a comment nobody runs.
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
