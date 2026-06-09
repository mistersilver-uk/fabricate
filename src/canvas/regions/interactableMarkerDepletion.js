/**
 * Environment-node-driven marker image swap for `fabricate.interactable`
 * gathering-task markers.
 *
 * The feature: when an environment's node for a task is depleted
 * (`environment.nodeRuntime[taskId].current <= 0`) AND the task configures a
 * `depletedBehavior.swapImage`, EVERY linked Tile marker for that
 * `(environment, task)` shows the swap image; when the node recharges (respawns
 * above 0) all markers flip back to the available image. Markers reflect the
 * SHARED environment node — there is no per-marker pool. The active GM applies the
 * tile writes and every client sees them via Foundry document sync.
 *
 * The DECISION (`resolveMarkerImage`) is PURE + unit-tested. The EDGE
 * (`syncInteractableMarkers`) iterates scenes/regions/behaviours and performs the
 * tile writes through injected seams; it is active-GM-gated, no-throw, and
 * idempotent.
 */

import { readInteractableBehaviorSystem } from './interactableRegionFlags.js';

/**
 * Read the depleted state for an environment's node for a task.
 *
 * Depleted = `environment.nodeRuntime[taskId].current <= 0`. When the environment
 * has no runtime entry yet (e.g. the node was never materialized), fall back to
 * the task's own node `current`/`max` so a freshly-configured node with a positive
 * count reads as available rather than depleted.
 *
 * @param {object} environment
 * @param {object} task
 * @param {string} taskId
 * @returns {boolean}
 */
function isNodeDepleted(environment, task, taskId) {
  const runtime = environment?.nodeRuntime;
  const runtimeNode = runtime && typeof runtime === 'object' ? runtime[taskId] : null;
  let current = numberOrNull(runtimeNode?.current);
  if (current === null) {
    // No environment runtime for this task — fall back to the task's own node
    // count so a positive configured count is treated as available.
    current = numberOrNull(task?.nodes?.current ?? task?.nodes?.max);
  }
  return (current ?? 0) <= 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Decide the desired marker image for a gathering-task interactable, given its
 * behaviour system, the resolved environment + task, and the marker's available
 * (non-depleted) image. PURE.
 *
 * Returns `null` when this is not a gathering-task interactable, or there is no
 * linked visual to drive, or the env/task could not be resolved — i.e. there is
 * no decision to make (leave the marker untouched).
 *
 * Otherwise returns `{ desiredImg, depleted }`:
 *   - `depleted` is true when the environment node is depleted (`current <= 0`)
 *     AND the task configures a `depletedBehavior.swapImage`.
 *   - `desiredImg` is the `swapImage` when depleted, else the `availableImg`.
 *
 * @param {object} params
 * @param {object} params.behaviorSystem  A behaviour system (raw or normalized view).
 * @param {object|null} params.environment  The resolved gathering environment.
 * @param {object|null} params.task  The resolved library task.
 * @param {string} [params.availableImg]  The marker's available (non-depleted) image.
 * @returns {{ desiredImg: string, depleted: boolean } | null}
 */
export function resolveMarkerImage({ behaviorSystem, environment, task, availableImg } = {}) {
  const system = normalizeSystem(behaviorSystem);
  if (!system || system.interactableType !== 'gatheringTask') return null;

  // No linked visual to drive: nothing to swap.
  const linked = system.linkedVisual;
  if (!linked || linked.documentName !== 'Tile' || !linked.uuid) return null;

  const taskId = system.taskId;
  if (!taskId || !environment || !task) return null;

  const available = typeof availableImg === 'string' && availableImg.trim() ? availableImg.trim() : '';
  const swapImage = typeof task?.nodes?.depletedBehavior?.swapImage === 'string'
    ? task.nodes.depletedBehavior.swapImage.trim()
    : '';

  // Without a configured swap image there is no depleted look — never swap.
  if (!swapImage) {
    return { desiredImg: available, depleted: false };
  }

  const depleted = isNodeDepleted(environment, task, taskId);
  return { desiredImg: depleted ? swapImage : available, depleted };
}

function normalizeSystem(behaviorSystem) {
  if (!behaviorSystem || typeof behaviorSystem !== 'object') return null;
  // Tolerate both a normalized view and a raw behaviour system shape.
  if (behaviorSystem.linkedVisual && behaviorSystem.interactableType) return behaviorSystem;
  return readInteractableBehaviorSystem(behaviorSystem) ?? behaviorSystem;
}

/**
 * Sync EVERY gathering-task Tile marker's image to its environment node state.
 * EDGE: active-GM-only (else no-op). Iterates `scenes` → `scene.regions` →
 * `region.behaviors`, filtering to `fabricate.interactable` gatheringTask
 * behaviours that link a Tile visual. For each, resolves the live tile, the
 * environment, and the task, computes {@link resolveMarkerImage}, and — when the
 * tile's current texture differs from the desired image — writes the new texture.
 *
 * On the FIRST depletion swap the tile's current texture src is stashed at
 * `flags.fabricate.markerAvailableImg` so the available state is restored to the
 * GM's actual marker texture (preferred over the behaviour's spawn image / task
 * img). The stash is used as `availableImg` when present.
 *
 * No-throw; idempotent (safe to run repeatedly — a tile already at the desired
 * image is skipped).
 *
 * @param {object} deps
 * @param {Iterable<object>} deps.scenes  The scenes to scan (e.g. `game.scenes`).
 * @param {(environmentId: string) => (object|null)} deps.resolveEnvironment
 * @param {(systemId: string, taskId: string) => (object|null)} deps.resolveTask
 * @param {() => boolean} deps.isActiveGM
 * @param {(tile: object, update: object) => (void|Promise<void>)} deps.applyTileImage
 *   Write a tile texture/flag update (active-GM routed).
 * @returns {Promise<void>}
 */
export async function syncInteractableMarkers({ scenes, resolveEnvironment, resolveTask, isActiveGM, applyTileImage } = {}) {
  try {
    if (typeof isActiveGM !== 'function' || isActiveGM() !== true) return;
    if (!scenes || typeof applyTileImage !== 'function') return;

    for (const scene of iterate(scenes)) {
      for (const region of iterate(scene?.regions)) {
        for (const behavior of iterate(region?.behaviors)) {
          await syncOneBehavior(behavior, scene, { resolveEnvironment, resolveTask, applyTileImage });
        }
      }
    }
  } catch (_error) {
    // Defensive: a marker sync must never throw into the caller's hook body.
  }
}

async function syncOneBehavior(behavior, scene, { resolveEnvironment, resolveTask, applyTileImage }) {
  try {
    const system = readInteractableBehaviorSystem(behavior);
    if (!system || system.interactableType !== 'gatheringTask') return;
    if (system.linkedVisual?.documentName !== 'Tile' || !system.linkedVisual?.uuid) return;

    const tile = resolveTile(system.linkedVisual.uuid, scene);
    if (!tile) return;

    const environment = system.environmentId ? resolveEnvironment?.(system.environmentId) ?? null : null;
    const task = system.systemId && system.taskId ? resolveTask?.(system.systemId, system.taskId) ?? null : null;
    if (!environment || !task) return;

    // Prefer a previously-stashed available image; else the current tile texture
    // (when available) so a non-depleted tile's restore target is the GM's actual
    // marker; finally the task img.
    const stashed = tile?.flags?.fabricate?.markerAvailableImg;
    const currentSrc = tile?.texture?.src ?? null;
    const availableImg = (typeof stashed === 'string' && stashed.trim())
      ? stashed.trim()
      : (typeof currentSrc === 'string' && currentSrc.trim() ? currentSrc.trim() : (task?.img ?? ''));

    const decision = resolveMarkerImage({ behaviorSystem: system, environment, task, availableImg });
    if (!decision) return;

    const update = {};
    if (decision.desiredImg && decision.desiredImg !== currentSrc) {
      update.texture = { src: decision.desiredImg };
    }
    // Stash the available image on the FIRST depletion swap so a later restore
    // targets the GM's actual marker texture (only when not already stashed).
    if (decision.depleted && !(typeof stashed === 'string' && stashed.trim()) && availableImg) {
      update.flags = { fabricate: { markerAvailableImg: availableImg } };
    }

    if (Object.keys(update).length > 0) {
      await applyTileImage(tile, update);
    }
  } catch (_error) {
    // Defensive: one bad behaviour must not abort the whole scan.
  }
}

function resolveTile(uuid, scene) {
  let doc = null;
  try {
    doc = globalThis.fromUuidSync?.(uuid) ?? null;
  } catch (_error) {
    doc = null;
  }
  if (!doc && scene) {
    const id = uuid.includes('.') ? uuid.split('.').pop() : uuid;
    try {
      doc = scene.tiles?.get?.(id) ?? null;
    } catch (_error) {
      doc = null;
    }
  }
  return doc;
}

function iterate(collection) {
  if (!collection) return [];
  if (typeof collection[Symbol.iterator] === 'function') return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (typeof collection?.values === 'function') return collection.values();
  return [];
}
