/**
 * One active-GM pass reconciling every linked Tile marker: `hidden` for all interactables, plus a
 * gatheringTask's depletion image swap (`data-models/spec.md` § Linked Visual reverse flags,
 * requirement 2, which owns both rules and the `markerAvailableImg` stash).
 * `resolveMarkerImage` is pure; `syncInteractableMarkers` is the no-throw, idempotent edge.
 */

import { numberOrNull } from './coercion.js';
import { resolveMarkerHidden } from './interactableRegionActivation.js';
import { readInteractableBehaviorSystem, isInteractableVisual } from './interactableRegionFlags.js';

/** Depleted at `current <= 0`; with no runtime entry, fall back to the task's own node count. */
function isNodeDepleted(environment, task, taskId) {
  const runtime = environment?.nodeRuntime;
  const runtimeNode = runtime && typeof runtime === 'object' ? runtime[taskId] : null;
  let current = numberOrNull(runtimeNode?.current);
  if (current === null) {
    current = numberOrNull(task?.nodes?.current ?? task?.nodes?.max);
  }
  return (current ?? 0) <= 0;
}

/**
 * PURE. `{ desiredImg, depleted }`, or null when there is no decision — not a gatheringTask, no
 * linked visual, or an unresolved env/task. `depleted` needs BOTH an exhausted pool and a swap image.
 */
export function resolveMarkerImage({ behaviorSystem, environment, task, availableImg } = {}) {
  const system = normalizeSystem(behaviorSystem);
  if (!system || system.interactableType !== 'gatheringTask') return null;

  // No linked visual to drive: nothing to swap.
  const linked = system.linkedVisual;
  if (!linked || linked.documentName !== 'Tile' || !linked.uuid) return null;

  const available =
    typeof availableImg === 'string' && availableImg.trim() ? availableImg.trim() : '';

  // A SCOPED node reads depletion and swap image off the behaviour's own pool, independent of any
  // resolved env or task (issue 302).
  if (system.taskNodeLink === 'unlinked' && system.node) {
    const swapImage =
      typeof system.node.depletedBehavior?.swapImage === 'string'
        ? system.node.depletedBehavior.swapImage.trim()
        : '';
    if (!swapImage) return { desiredImg: available, depleted: false };
    const depleted = Number(system.node.current || 0) <= 0;
    return { desiredImg: depleted ? swapImage : available, depleted };
  }

  const taskId = system.taskId;
  if (!taskId || !environment || !task) return null;

  const swapImage =
    typeof task?.nodes?.depletedBehavior?.swapImage === 'string'
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
 * EDGE. Active-GM only. Walks scenes to behaviours, writing each marker's `hidden` and texture
 * only where they changed. The first swap stashes the tile's CURRENT texture, so the restore
 * targets the GM's actual marker rather than the spawn or task image. No-throw and idempotent.
 */
export async function syncInteractableMarkers({
  scenes,
  resolveEnvironment,
  resolveTask,
  isActiveGM,
  applyTileImage,
} = {}) {
  try {
    if (typeof isActiveGM !== 'function' || isActiveGM() !== true) return;
    if (!scenes || typeof applyTileImage !== 'function') return;

    for (const scene of iterate(scenes)) {
      for (const region of iterate(scene?.regions)) {
        for (const behavior of iterate(region?.behaviors)) {
          await syncOneBehavior(behavior, scene, {
            resolveEnvironment,
            resolveTask,
            applyTileImage,
          });
        }
      }
    }
  } catch {
    // Defensive: a marker sync must never throw into the caller's hook body.
  }
}

async function syncOneBehavior(
  behavior,
  scene,
  { resolveEnvironment, resolveTask, applyTileImage }
) {
  try {
    const system = readInteractableBehaviorSystem(behavior);
    if (!system) return;
    if (system.linkedVisual?.documentName !== 'Tile' || !system.linkedVisual?.uuid) return;

    const tile = resolveTile(system.linkedVisual.uuid, scene);
    if (!tile) return;

    // Ownership guard. This is the only mutation edge firing with NO user action, so a behaviour
    // whose `linkedVisual.uuid` drifted onto a foreign tile would rewrite it on every scene load.
    if (!isInteractableVisual(tile)) {
      console.warn(
        'Fabricate | Skipped marker sync: the linked tile is not a Fabricate interactable visual',
        { uuid: system.linkedVisual.uuid }
      );
      return;
    }

    const update = {};

    const desiredHidden = resolveMarkerHidden(system);
    if ((tile?.hidden === true) !== desiredHidden) {
      update.hidden = desiredHidden;
    }

    if (system.interactableType === 'gatheringTask') {
      const scoped = system.taskNodeLink === 'unlinked' && system.node;
      const environment =
        !scoped && system.environmentId
          ? (resolveEnvironment?.(system.environmentId) ?? null)
          : null;
      const task =
        !scoped && system.systemId && system.taskId
          ? (resolveTask?.(system.systemId, system.taskId) ?? null)
          : null;
      if (scoped || (environment && task)) {
        // Prefer a stashed available image, else the current tile texture, else the task img.
        const stashed = tile?.flags?.fabricate?.markerAvailableImg;
        const currentSrc = tile?.texture?.src ?? null;
        const availableImg =
          typeof stashed === 'string' && stashed.trim()
            ? stashed.trim()
            : typeof currentSrc === 'string' && currentSrc.trim()
              ? currentSrc.trim()
              : (task?.img ?? '');

        const decision = resolveMarkerImage({
          behaviorSystem: system,
          environment,
          task,
          availableImg,
        });
        if (decision) {
          if (decision.desiredImg && decision.desiredImg !== currentSrc) {
            update.texture = { src: decision.desiredImg };
          }
          // Stash on the FIRST swap only, so a later restore targets the GM's actual marker.
          if (
            decision.depleted &&
            !(typeof stashed === 'string' && stashed.trim()) &&
            availableImg
          ) {
            update.flags = { fabricate: { markerAvailableImg: availableImg } };
          }
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await applyTileImage(tile, update);
    }
  } catch {
    // Defensive: one bad behaviour must not abort the whole scan.
  }
}

function resolveTile(uuid, scene) {
  let doc;
  try {
    doc = globalThis.fromUuidSync?.(uuid) ?? null;
  } catch {
    doc = null;
  }
  if (!doc && scene) {
    const id = uuid.includes('.') ? uuid.split('.').pop() : uuid;
    try {
      doc = scene.tiles?.get?.(id) ?? null;
    } catch {
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
