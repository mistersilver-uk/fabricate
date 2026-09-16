/**
 * PURE drop classification and spawn-payload shaping for canvas interactables; every library
 * lookup is injected, so no Foundry global is reachable.
 * Tools and Gathering Tasks are library entries, not documents, so they have no native uuid: a
 * synthetic `Fabricate.<systemId>.<tool|gatheringTask>.<id>` is minted into `sourceUuid`.
 */

const SOURCE_PREFIX = 'Fabricate';

/** The synthetic source-identity string for a library interactable. */
export function buildInteractableSourceUuid({ interactableType, systemId, referenceId } = {}) {
  return `${SOURCE_PREFIX}.${systemId}.${interactableType}.${referenceId}`;
}

/** Reverse {@link buildInteractableSourceUuid}. */
export function parseInteractableSourceUuid(sourceUuid) {
  if (typeof sourceUuid !== 'string') return null;
  const parts = sourceUuid.split('.');
  if (parts.length < 4 || parts[0] !== SOURCE_PREFIX) return null;
  // `systemId` sits at a fixed index so the type discriminator can be read at `parts[2]` and a
  // dotted referenceId rejoined from the tail. System ids are dot-free slugs by construction, and
  // a dotted one would shift the type slot and be rejected below — the safe outcome.
  const interactableType = parts[2];
  if (interactableType !== 'tool' && interactableType !== 'gatheringTask') return null;
  const systemId = parts[1];
  // referenceId may itself contain dots (defensive); rejoin the tail.
  const referenceId = parts.slice(3).join('.');
  if (!systemId || !referenceId) return null;
  return { interactableType, systemId, referenceId };
}

function readFabricatePayload(data) {
  const payload = data?.fabricate;
  return payload && typeof payload === 'object' ? payload : null;
}

/**
 * Classify a `dropCanvasData` payload, or null so Foundry handles the drop. An explicit
 * `data.fabricate` payload wins; otherwise a uuid resolves through `resolveItemUuidToTool`.
 */
export function classifyInteractableDrop(data, { getTool, getTask, resolveItemUuidToTool } = {}) {
  const payload = readFabricatePayload(data);

  if (payload) {
    const interactableType = payload.interactableType;
    const systemId = typeof payload.systemId === 'string' ? payload.systemId : '';

    if (interactableType === 'tool') {
      const toolId = typeof payload.toolId === 'string' ? payload.toolId : '';
      if (!systemId || !toolId) return null;
      const entry = getTool?.({ systemId, toolId }) ?? null;
      if (!entry) return null;
      return {
        interactableType: 'tool',
        systemId,
        referenceId: toolId,
        sourceUuid: buildInteractableSourceUuid({
          interactableType: 'tool',
          systemId,
          referenceId: toolId,
        }),
        entry,
      };
    }

    if (interactableType === 'gatheringTask') {
      const taskId = typeof payload.taskId === 'string' ? payload.taskId : '';
      if (!systemId || !taskId) return null;
      const entry = getTask?.({ systemId, taskId }) ?? null;
      if (!entry) return null;
      return {
        interactableType: 'gatheringTask',
        systemId,
        referenceId: taskId,
        sourceUuid: buildInteractableSourceUuid({
          interactableType: 'gatheringTask',
          systemId,
          referenceId: taskId,
        }),
        entry,
      };
    }

    return null;
  }

  // Fallback: a dropped Item uuid that maps to a Fabricate component used by a Tool.
  const uuid = typeof data === 'string' ? data : typeof data?.uuid === 'string' ? data.uuid : '';
  if (uuid && typeof resolveItemUuidToTool === 'function') {
    const match = resolveItemUuidToTool(uuid);
    const systemId = typeof match?.systemId === 'string' ? match.systemId : '';
    const toolId = typeof match?.toolId === 'string' ? match.toolId : '';
    if (systemId && toolId) {
      const entry = getTool?.({ systemId, toolId }) ?? null;
      if (entry) {
        return {
          interactableType: 'tool',
          systemId,
          referenceId: toolId,
          sourceUuid: buildInteractableSourceUuid({
            interactableType: 'tool',
            systemId,
            referenceId: toolId,
          }),
          entry,
        };
      }
    }
  }

  return null;
}

/**
 * The session-scoped virtual-present tool injected on a granted station activation: prerequisite
 * checks treat it as present without an owned item and exclude it from breakage and usage.
 */
export function buildActiveCanvasTool({ systemId, toolId, tool } = {}) {
  const componentId = typeof tool?.componentId === 'string' ? tool.componentId.trim() : '';
  const resolvedToolId = typeof toolId === 'string' ? toolId.trim() : '';
  // The station's identity is its LIBRARY TOOL ID (issue 1119). Requiring a componentId here
  // returned null for every item-sourced Tool, which the caller answered with a silent denial.
  // One is still carried when present, so a migrated component-linked station keeps working.
  if (!resolvedToolId && !componentId) return null;
  const label = typeof tool?.label === 'string' && tool.label.trim() ? tool.label.trim() : '';
  return {
    componentId,
    systemId: typeof systemId === 'string' ? systemId : '',
    toolId: resolvedToolId,
    label,
  };
}

/**
 * PURE. The Region rectangle, the behaviour `system` (through the injected builder) and the Tile
 * data — or `tile: null` under `visualMode: 'none'`, a hidden region-only interactable.
 */
export function buildRegionSpawnRequest({
  classification,
  point,
  environmentId,
  texture,
  width,
  height,
  name,
  gridSize,
  regionGrid = 1,
  visualMode = 'marker',
  buildBehaviorSystem,
} = {}) {
  if (!classification) return null;
  if (typeof buildBehaviorSystem !== 'function') {
    throw new TypeError('buildRegionSpawnRequest requires a buildBehaviorSystem builder');
  }

  // Region-only: the behaviour carries `presentation.hidden=true` and `linkedVisual.mode='none'`,
  // and the request omits the Tile so the caller never creates one.
  const regionOnly = visualMode === 'none';

  const grid = Number.isFinite(Number(gridSize)) && Number(gridSize) > 0 ? Number(gridSize) : 100;
  const span = Math.max(1, Math.floor(Number(regionGrid) || 1));

  // The displayed name: an explicit name wins, else the entry's name or label.
  const entry = classification.entry ?? null;
  const resolvedName =
    typeof name === 'string' && name.trim()
      ? name.trim()
      : typeof entry?.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : typeof entry?.label === 'string'
          ? entry.label.trim()
          : '';

  const tileWidth = Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : grid;
  const tileHeight = Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : grid;

  const cx = Number(point?.x ?? 0);
  const cy = Number(point?.y ?? 0);

  // A Tile renders CENTRED on its stored `x/y` (confirmed against live V13 bounds:
  // `tile.object.bounds.x === doc.x - width/2`), so the drop point IS the tile's `x/y` — NOT
  // `cx - width/2`, which renders the marker half a tile down-right of the drop.
  const tileX = cx;
  const tileY = cy;

  // A Region rectangle, unlike a Tile, renders TOP-LEFT at its stored `x/y` (also confirmed live),
  // so centring anchors the top-left at `(cx - w/2, cy - h/2)`: tile centre == region centre ==
  // drop point. The manager re-derives the rect from the tile footprint when one exists.
  const regionW = grid * span;
  const regionH = grid * span;
  const regionX = cx - regionW / 2;
  const regionY = cy - regionH / 2;

  const resolvedEnvironmentId =
    classification.interactableType === 'gatheringTask' &&
    typeof environmentId === 'string' &&
    environmentId
      ? environmentId
      : null;

  const behaviorSystem = buildBehaviorSystem({
    interactableType: classification.interactableType,
    sourceUuid: classification.sourceUuid,
    systemId: classification.systemId,
    toolId: classification.interactableType === 'tool' ? classification.referenceId : null,
    taskId: classification.interactableType === 'gatheringTask' ? classification.referenceId : null,
    environmentId: resolvedEnvironmentId ?? undefined,
    name: resolvedName,
    // Region-only ⇒ hidden and no marker; the builder leaves uuid/documentName null.
    presentation: regionOnly ? { hidden: true } : undefined,
    linkedVisual: regionOnly ? { mode: 'none' } : undefined,
  });

  return {
    interactableType: classification.interactableType,
    sourceUuid: classification.sourceUuid,
    name: resolvedName,
    environmentId: resolvedEnvironmentId,
    region: {
      name: resolvedName || classification.sourceUuid,
      shape: {
        type: 'rectangle',
        x: regionX,
        y: regionY,
        width: regionW,
        height: regionH,
      },
    },
    behaviorSystem,
    // Region-only ⇒ no Tile: the caller skips Tile creation entirely.
    tile: regionOnly
      ? null
      : {
          texture: {
            src:
              typeof texture === 'string' && texture.trim()
                ? texture.trim()
                : DEFAULT_REGION_TILE_IMG,
          },
          x: tileX,
          y: tileY,
          width: tileWidth,
          height: tileHeight,
        },
  };
}

/** Fallback linked-Tile image when no tool/task icon can be resolved. */
const DEFAULT_REGION_TILE_IMG = 'icons/svg/item-bag.svg';
