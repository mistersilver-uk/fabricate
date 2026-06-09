/**
 * Pure drop-classification + spawn-payload shaping for canvas Interactables.
 *
 * This module decides, from a `dropCanvasData` payload, whether a drop is a
 * Fabricate Tool or Gathering Task interactable, and shapes the data the manager
 * needs to spawn it. In the region-first model that shape is a Scene Region + a
 * nested `fabricate.interactable` behaviour + (optionally) a linked marker, built
 * by {@link buildRegionSpawnRequest}. It contains NO Foundry globals: every
 * lookup against the Fabricate libraries is injected, so the routing logic is
 * unit-testable with fakes.
 *
 * Fabricate Tools and Gathering Tasks are NOT Foundry documents — they are
 * library entries keyed by `id` under a crafting system (`systems[systemId].tools`
 * and `gatheringConfig.systems[systemId].tasks`). They therefore have no native
 * document uuid. We mint a stable synthetic identity string of the form:
 *
 *   Fabricate.<systemId>.tool.<toolId>
 *   Fabricate.<systemId>.gatheringTask.<taskId>
 *
 * stored as `flags.fabricate.sourceUuid`, which `parseInteractableSourceUuid`
 * reverses. The Phase-7 browser app emits a drag payload carrying
 * `{ fabricate: { interactableType, systemId, toolId | taskId } }`; this module
 * also accepts a bare/`uuid`-bearing payload for the future case where a dropped
 * world/compendium Item maps to a Fabricate component used by a Tool.
 */

const SOURCE_PREFIX = 'Fabricate';

/**
 * Build the synthetic source-identity string for a library interactable.
 *
 * @param {object} params
 * @param {'tool'|'gatheringTask'} params.interactableType
 * @param {string} params.systemId
 * @param {string} params.referenceId   Tool id or Task id within the system library.
 * @returns {string}
 */
export function buildInteractableSourceUuid({ interactableType, systemId, referenceId } = {}) {
  return `${SOURCE_PREFIX}.${systemId}.${interactableType}.${referenceId}`;
}

/**
 * Reverse {@link buildInteractableSourceUuid}.
 *
 * @param {string} sourceUuid
 * @returns {{ interactableType: 'tool'|'gatheringTask', systemId: string, referenceId: string } | null}
 */
export function parseInteractableSourceUuid(sourceUuid) {
  if (typeof sourceUuid !== 'string') return null;
  const parts = sourceUuid.split('.');
  if (parts.length < 4 || parts[0] !== SOURCE_PREFIX) return null;
  // NOTE: systemId is assumed dot-free — it sits at a fixed index (parts[1]) so
  // the interactableType discriminator can be read at parts[2] and the
  // (possibly dotted) referenceId rejoined from the tail. Crafting-system ids are
  // dot-free slugs by construction, so a dotted systemId is not a real shape; were
  // one ever introduced it would shift the type slot and be rejected by the
  // interactableType guard below (parse returns null), which is the safe outcome.
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
 * Classify a `dropCanvasData` payload into a Fabricate interactable, or `null`
 * when it is not one (so Foundry handles the drop normally).
 *
 * Resolution order:
 *  1. An explicit `data.fabricate` drag payload (the Phase-7 browser shape).
 *  2. A uuid (string `data` or `data.uuid`) resolved via the injected
 *     `resolveItemUuidToTool` adapter (the dropped-Item → Tool case).
 *
 * The injected adapters keep this function free of Foundry/library globals:
 *  - `getTool({ systemId, toolId })`        → library Tool entry or null
 *  - `getTask({ systemId, taskId })`        → library Gathering Task entry or null
 *  - `resolveItemUuidToTool(uuid)`          → { systemId, toolId } | null
 *
 * @param {object|string} data                       The dropCanvasData payload.
 * @param {object} deps
 * @param {(args: {systemId: string, toolId: string}) => object|null} [deps.getTool]
 * @param {(args: {systemId: string, taskId: string}) => object|null} [deps.getTask]
 * @param {(uuid: string) => ({systemId: string, toolId: string}|null)} [deps.resolveItemUuidToTool]
 * @returns {{ interactableType: 'tool'|'gatheringTask', systemId: string,
 *   referenceId: string, sourceUuid: string, entry: object } | null}
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
        sourceUuid: buildInteractableSourceUuid({ interactableType: 'tool', systemId, referenceId: toolId }),
        entry
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
        sourceUuid: buildInteractableSourceUuid({ interactableType: 'gatheringTask', systemId, referenceId: taskId }),
        entry
      };
    }

    return null;
  }

  // Fallback: a dropped Item uuid that maps to a Fabricate component used by a Tool.
  const uuid = typeof data === 'string' ? data : (typeof data?.uuid === 'string' ? data.uuid : '');
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
          sourceUuid: buildInteractableSourceUuid({ interactableType: 'tool', systemId, referenceId: toolId }),
          entry
        };
      }
    }
  }

  return null;
}

/**
 * Build the normalized `activeCanvasTool` payload from a resolved library Tool.
 *
 * This is the session-scoped virtual-present Tool injected into the Fabricate
 * app when a Tool-station region activation is granted (the player walked their
 * token into the region and clicked Interact). The shape is deliberately
 * simple/serializable: `{ componentId, systemId, toolId, label }`.
 * The crafting/gathering prerequisite checks treat `componentId` as present
 * without an owned item and exclude it from breakage/usage.
 *
 * Returns `null` when the tool cannot be resolved to a `componentId` (so the
 * caller can decline to open a tool-scoped session).
 *
 * @param {object} params
 * @param {string} params.systemId   The crafting system id.
 * @param {string} params.toolId     The library Tool id.
 * @param {object|null} params.tool  The resolved library Tool entry
 *   (`{ componentId, label? }`).
 * @returns {{ componentId: string, systemId: string, toolId: string, label: string } | null}
 */
export function buildActiveCanvasTool({ systemId, toolId, tool } = {}) {
  const componentId = typeof tool?.componentId === 'string' ? tool.componentId.trim() : '';
  if (!componentId) return null;
  const label = typeof tool?.label === 'string' && tool.label.trim() ? tool.label.trim() : '';
  return {
    componentId,
    systemId: typeof systemId === 'string' ? systemId : '',
    toolId: typeof toolId === 'string' ? toolId : '',
    label
  };
}

/**
 * Shape the data needed to spawn a region-first interactable from a classified
 * drop. PURE: returns everything the manager needs to create (a) a Scene Region
 * (a small rectangle centered on the drop point), (b) the nested
 * `fabricate.interactable` behaviour `system` (built via the injected
 * `buildBehaviorSystem`, i.e. `buildInteractableBehaviorSystem` from 1a), and
 * (c) the linked Tile data (texture/x/y/width/height). No Foundry globals — the
 * caller resolves the icon `texture`, the grid size, and the behaviour-system
 * builder at the edge and injects them here.
 *
 * Region geometry: a rectangle sized `regionGrid` grid squares per side
 * (default 1), CENTERED on the drop point, then snapped so it tiles cleanly with
 * the scene grid. The linked Tile is sized `width`/`height` (default one grid
 * square) and TOP-LEFT-anchored at the same center, so the visible marker sits
 * inside the region.
 *
 * @param {object} params
 * @param {ReturnType<typeof classifyInteractableDrop>} params.classification
 * @param {{x: number, y: number}} [params.point]   Drop point in scene coordinates.
 * @param {string} [params.environmentId]           Resolved environment (gatheringTask only).
 * @param {string} [params.texture]                 Linked Tile image path (`texture.src`).
 * @param {number} [params.width]                   Linked Tile width (scene units).
 * @param {number} [params.height]                  Linked Tile height (scene units).
 * @param {string} [params.name]                    Display name (defaults to the entry's name/label).
 * @param {object|null} [params.node]               Node-config snapshot (gatheringTask only) or null.
 * @param {number} [params.gridSize]                Scene grid square size (scene units). Default 100.
 * @param {number} [params.regionGrid]              Region size in grid squares per side. Default 1.
 * @param {'marker'|'none'} [params.visualMode]     Linked-visual mode. 'marker' (default)
 *   creates a visible linked Tile; 'none' makes a hidden, region-only interactable
 *   with NO marker (`presentation.hidden=true`, `linkedVisual.mode='none'`,
 *   uuid/documentName null) and `tile: null` (the caller skips Tile creation).
 * @param {(spawn: object) => object} [params.buildBehaviorSystem]  Behaviour-system builder
 *   (`buildInteractableBehaviorSystem`); injected so this stays Foundry-free.
 * @returns {{ region: { name: string, shape: object }, behaviorSystem: object,
 *   tile: ({ texture: { src: string }, x: number, y: number, width: number, height: number } | null),
 *   interactableType: string, sourceUuid: string, name: string,
 *   environmentId: string|null } | null}
 */
export function buildRegionSpawnRequest({
  classification,
  point,
  environmentId,
  texture,
  width,
  height,
  name,
  node,
  gridSize,
  regionGrid = 1,
  visualMode = 'marker',
  buildBehaviorSystem
} = {}) {
  if (!classification) return null;
  if (typeof buildBehaviorSystem !== 'function') {
    throw new Error('buildRegionSpawnRequest requires a buildBehaviorSystem builder');
  }

  // Region-only: a hidden/abstract interactable with NO visible marker. The
  // behaviour carries `presentation.hidden=true` + `linkedVisual.mode='none'`,
  // and the request omits the Tile so the caller never creates one.
  const regionOnly = visualMode === 'none';

  const grid = Number.isFinite(Number(gridSize)) && Number(gridSize) > 0 ? Number(gridSize) : 100;
  const span = Math.max(1, Math.floor(Number(regionGrid) || 1));

  // The displayed name: an explicit name wins, else the entry's name/label.
  const entry = classification.entry ?? null;
  const resolvedName = typeof name === 'string' && name.trim()
    ? name.trim()
    : (typeof entry?.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : (typeof entry?.label === 'string' ? entry.label.trim() : ''));

  const tileWidth = Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : grid;
  const tileHeight = Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : grid;

  const cx = Number(point?.x ?? 0);
  const cy = Number(point?.y ?? 0);

  // Linked Tile: top-left-anchored so its CENTER sits at the drop point.
  const tileX = cx - tileWidth / 2;
  const tileY = cy - tileHeight / 2;

  // Region: a `span`-square rectangle that is CONCENTRIC with the tile (same
  // center), so a player who walks onto the visible marker is inside the region.
  // For the default single-square region the rectangle COINCIDES with the tile
  // exactly (same x/y/width/height). For a multi-square region it stays centered
  // on the tile's center and encloses it. Previously the region top-left was
  // grid-snapped while the tile was raw-anchored, which shifted the interactable
  // area ~half a tile down-right of the visible marker.
  const regionW = grid * span;
  const regionH = grid * span;
  // Concentric: tile center is at (cx, cy); place the region's center there too.
  const regionX = cx - regionW / 2;
  const regionY = cy - regionH / 2;

  const resolvedEnvironmentId = classification.interactableType === 'gatheringTask'
    && typeof environmentId === 'string' && environmentId
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
    node: classification.interactableType === 'gatheringTask' && node ? node : null,
    // Region-only ⇒ hidden + no marker; the builder leaves uuid/documentName null.
    presentation: regionOnly ? { hidden: true } : undefined,
    linkedVisual: regionOnly ? { mode: 'none' } : undefined
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
        height: regionH
      }
    },
    behaviorSystem,
    // Region-only ⇒ no Tile: the caller skips Tile creation entirely.
    tile: regionOnly ? null : {
      texture: { src: typeof texture === 'string' && texture.trim() ? texture.trim() : DEFAULT_REGION_TILE_IMG },
      x: tileX,
      y: tileY,
      width: tileWidth,
      height: tileHeight
    }
  };
}

/** Fallback linked-Tile image when no tool/task icon can be resolved. */
const DEFAULT_REGION_TILE_IMG = 'icons/svg/item-bag.svg';
