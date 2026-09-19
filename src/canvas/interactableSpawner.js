/**
 * Environment precedence for a dropped gathering task, the spawn request, and the transaction-like
 * Region plus linked Tile write. Every collaborator is injected as a call-time function, and
 * `scene()` is re-read per site because the GM can change scene while the dialog is open.
 */

import { resolveDropEnvironment } from './environmentResolution.js';
import {
  DEFAULT_INTERACTABLE_IMG,
  firstInteractableBehavior,
  regionRectangleFor,
} from './interactablePredicates.js';
import { buildRegionSpawnRequest as shapeSpawnRequest } from './interactableResolution.js';
import { buildInteractableRegionFlags } from './regions/interactableDeletion.js';
import {
  buildInteractableBehaviorSystem,
  buildLinkedVisualFlags,
} from './regions/interactableRegionFlags.js';

/** The spawn request from a classified drop, with the icon texture and grid size read at the edge. */
export function buildRegionSpawnRequest(
  { classification, point, environmentId, visualMode = 'marker' } = {},
  deps
) {
  const gridSize = deps.gridSize();
  return shapeSpawnRequest({
    classification,
    point,
    environmentId: environmentId ?? undefined,
    texture: deps.iconTexture(classification),
    width: gridSize,
    height: gridSize,
    gridSize,
    visualMode,
    buildBehaviorSystem: (spawn) => buildInteractableBehaviorSystem(spawn),
  });
}

/** Resolve a dropped task's environment by precedence and spawn it; a cancelled dialog aborts. */
export async function spawnGatheringTask(
  { classification, point, forceDialog, visualMode = 'marker' },
  deps
) {
  const task = deps.resolutionDeps().getTask({
    systemId: classification.systemId,
    taskId: classification.referenceId,
  });
  const environments = deps.listEnvironments(classification.systemId);

  const resolution = resolveDropEnvironment({
    regionEnvironmentIds: deps.regionEnvironmentIdsAtPoint({ scene: deps.scene(), point }),
    defaultEnvironmentId: task?.defaultEnvironmentId ?? null,
    forceDialog,
    environmentExists: (id) => environments.some((env) => String(env.id) === String(id)),
  });

  let environmentId = resolution.environmentId;
  if (resolution.needsDialog) {
    environmentId = await deps.promptDropEnvironment({
      environments,
      defaultEnvironmentId: task?.defaultEnvironmentId ?? '',
      localize: (key, fallback) => deps.localize(key) ?? fallback,
    });
    if (!environmentId) return null; // cancel ⇒ abort.
  }

  if (resolution.notify && environmentId) {
    notifyAutoResolved(environments, environmentId, deps);
  }

  return deps.spawnInteractableRegion(
    deps.buildRegionSpawnRequest({ classification, point, environmentId, visualMode })
  );
}

function notifyAutoResolved(environments, environmentId, deps) {
  const environment = environments.find(
    (candidate) => String(candidate.id) === String(environmentId)
  );
  const name = environment?.name || environmentId;
  deps.notifyInfo(
    deps.formatMessage('FABRICATE.Canvas.Interactable.EnvironmentAutoResolved', {
      environment: name,
    }) ?? `Resource node placed in environment "${name}".`
  );
}

/**
 * Create the Region and its linked Tile, transaction-like: an orphan of either is deleted when its
 * partner fails, and once both exist the `linkedVisual` ref is written back so relink, recreate and
 * missing-policy can resolve it. No-throw; GM-notify on failure.
 */
export async function spawnInteractableRegion(spawnRequest, deps) {
  if (!spawnRequest) return null;
  const scene = deps.scene();
  if (!scene?.createEmbeddedDocuments) return null;

  const { region, behaviorSystem, tile } = spawnRequest;
  const regionDoc = await createRegionDocument({ scene, region, behaviorSystem, tile }, deps);
  if (!regionDoc) {
    deps.notifySpawnFailure();
    return null;
  }

  const behavior = firstInteractableBehavior(regionDoc);
  // Region-only: no Tile, so no orphan and no ref to write back.
  if (!tile) return regionDoc;

  const tileDoc = await createLinkedTile({ scene, tile, regionDoc, behavior }, deps);
  if (!tileDoc) {
    // Roll back the orphan Region so the failed spawn leaves no trace.
    try {
      await deps.deleteRegion(regionDoc);
    } catch {
      /* tolerate. */
    }
    deps.notifySpawnFailure();
    return null;
  }

  await writeLinkedVisualBack(behavior, tileDoc, deps);
  return regionDoc;
}

async function createRegionDocument({ scene, region, behaviorSystem, tile }, deps) {
  const { x, y, width, height } = regionRectangleFor({ tile, region, gridSize: deps.gridSize() });
  try {
    const [created] = await deps.createRegion(scene, {
      name: region.name,
      shapes: [{ type: 'rectangle', x, y, width, height }],
      behaviors: [{ type: 'fabricate.interactable', system: behaviorSystem }],
      // Fabricate created this region, so its delete may take the whole one; a promoted one's
      // delete may not (issue 533).
      flags: buildInteractableRegionFlags(),
    });
    return created ?? null;
  } catch {
    return null;
  }
}

/** The linked Tile carrying the reverse flags, or null when either id or the write is missing. */
async function createLinkedTile({ scene, tile, regionDoc, behavior }, deps) {
  const regionUuid = typeof regionDoc?.uuid === 'string' ? regionDoc.uuid : null;
  const behaviorId = behavior?.id ?? behavior?._id ?? null;
  if (!regionUuid || !behaviorId) return null;
  const gridSize = deps.gridSize();
  try {
    const { fabricate } = buildLinkedVisualFlags({ regionUuid, behaviorId });
    return await deps.createTile(scene, {
      texture: { src: tile?.texture?.src || DEFAULT_INTERACTABLE_IMG },
      x: Number(tile?.x ?? 0),
      y: Number(tile?.y ?? 0),
      width: Number(tile?.width ?? gridSize),
      height: Number(tile?.height ?? gridSize),
      flags: { fabricate },
    });
  } catch {
    return null;
  }
}

/** A failed write-back keeps the orphan Tile: it points back, and region-only still works. */
async function writeLinkedVisualBack(behavior, tileDoc, deps) {
  const tileUuid = typeof tileDoc?.uuid === 'string' ? tileDoc.uuid : null;
  if (!behavior?.update || !tileUuid) return;
  try {
    await deps.updateBehavior(behavior, {
      system: { linkedVisual: { uuid: tileUuid, documentName: 'Tile' } },
    });
  } catch {
    // Defensive: a working region-only interactable is acceptable.
  }
}
