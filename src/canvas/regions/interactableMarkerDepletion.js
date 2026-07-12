/**
 * Active-GM marker reconcile for `fabricate.interactable` linked Tile markers.
 *
 * Two reconciles run in one pass over every `fabricate.interactable` behaviour
 * with a linked Tile:
 *
 *  - VISIBILITY (ALL interactables — tool AND gatheringTask): the marker tile's
 *    `hidden` is set to {@link resolveMarkerHidden} — true when the interactable
 *    is DISABLED or explicitly HIDDEN (so only the GM sees the marker), false
 *    otherwise (a LOCKED interactable stays visible to players). This runs on
 *    `canvasReady` too, so a disabled/hidden interactable loads hidden for players.
 *  - IMAGE-SWAP (gatheringTask only): the env-node depletion image swap below.
 *
 * The image-swap feature: when a gathering task's node is depleted (`current <=
 * 0`) AND it configures a `depletedBehavior.swapImage`, the linked Tile marker
 * shows the swap image; when the node recharges (respawns above 0) it flips back
 * to the available image. The depleted state is read from whichever pool the
 * interactable uses: the SHARED environment node (default,
 * `environment.nodeRuntime[taskId]`) OR — when `taskNodeLink === 'unlinked'`
 * (issue 302) — the behaviour's OWN scoped `system.node` (read independently, no
 * env/task resolution needed). The active GM applies the tile writes and every
 * client sees them via Foundry document sync.
 *
 * The DECISION (`resolveMarkerImage`) is PURE + unit-tested. The EDGE
 * (`syncInteractableMarkers`) iterates scenes/regions/behaviours and performs the
 * tile writes through injected seams; it is active-GM-gated, no-throw, and
 * idempotent.
 */

import { numberOrNull } from './coercion.js';
import { resolveMarkerHidden } from './interactableRegionActivation.js';
import { readInteractableBehaviorSystem, isInteractableVisual } from './interactableRegionFlags.js';

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

  const available =
    typeof availableImg === 'string' && availableImg.trim() ? availableImg.trim() : '';

  // Interactable-SCOPED node (issue 302): depletion + swap image come from the
  // behaviour's OWN node pool, never the environment runtime. Independent of any
  // resolved env/task.
  if (system.taskNodeLink === 'unlinked' && system.node) {
    const swapImage =
      typeof system.node.depletedBehavior?.swapImage === 'string'
        ? system.node.depletedBehavior.swapImage.trim()
        : '';
    if (!swapImage) return { desiredImg: available, depleted: false };
    const depleted = Number(system.node.current || 0) <= 0;
    return { desiredImg: depleted ? swapImage : available, depleted };
  }

  // Environment-scoped node (default, unchanged): depletion + swap image come from
  // the resolved env runtime + library task.
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
 * Sync EVERY `fabricate.interactable` Tile marker to its current state. EDGE:
 * active-GM-only (else no-op). Iterates `scenes` → `scene.regions` →
 * `region.behaviors`, filtering to `fabricate.interactable` behaviours that link a
 * Tile visual. For each it reconciles the tile's `hidden` from
 * {@link resolveMarkerHidden} (ALL interactables) and, for a gatheringTask, swaps
 * the texture from {@link resolveMarkerImage} against the resolved environment +
 * task — writing only the fields that changed.
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
    // Marker reconcile applies to EVERY linked-Tile interactable (BOTH tool and
    // gatheringTask). The image-swap below is gathering-only; the hidden-reconcile
    // is universal.
    if (system.linkedVisual?.documentName !== 'Tile' || !system.linkedVisual?.uuid) return;

    const tile = resolveTile(system.linkedVisual.uuid, scene);
    if (!tile) return;

    // Ownership guard: the resolved tile must be a Fabricate interactable visual
    // (carries `flags.fabricate.isInteractableVisual`). Without this, a behaviour
    // whose `linkedVisual.uuid` was relinked to — or drifted onto — a foreign tile
    // would have its `hidden`/`texture.src`/`markerAvailableImg` silently rewritten
    // on every scene load. This is the only mutation edge that fires with no user
    // action, so refuse (and log) before touching a tile that isn't ours.
    if (!isInteractableVisual(tile)) {
      console.warn(
        'Fabricate | Skipped marker sync: the linked tile is not a Fabricate interactable visual',
        { uuid: system.linkedVisual.uuid }
      );
      return;
    }

    const update = {};

    // Visibility reconcile (ALL interactables): a disabled or explicitly-hidden
    // interactable's marker is hidden from players (`tile.hidden = true`); a locked
    // (or otherwise concealed-but-visible) interactable's marker stays visible.
    const desiredHidden = resolveMarkerHidden(system);
    if ((tile?.hidden === true) !== desiredHidden) {
      update.hidden = desiredHidden;
    }

    // Image-swap reconcile (gatheringTask only): node depletion drives the marker
    // texture between the available and `depletedBehavior.swapImage`. For an
    // interactable-SCOPED node (issue 302) the depletion + swap image come from the
    // behaviour's own pool and need no env/task resolution; the default
    // environment-scoped path still resolves the env runtime + library task.
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
        // Prefer a previously-stashed available image; else the current tile texture
        // (when available) so a non-depleted tile's restore target is the GM's actual
        // marker; finally the task img.
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
          // Stash the available image on the FIRST depletion swap so a later restore
          // targets the GM's actual marker texture (only when not already stashed).
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
