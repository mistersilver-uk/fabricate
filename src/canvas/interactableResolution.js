/**
 * Pure drop-classification + spawn-payload shaping for canvas Interactables.
 *
 * This module decides, from a `dropCanvasData` payload, whether a drop is a
 * Fabricate Tool or Gathering Task interactable, and shapes the data needed to
 * spawn its tile. It contains NO Foundry globals: every lookup against the
 * Fabricate libraries is injected, so the routing logic is unit-testable with
 * fakes.
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
 * app when a player double-clicks a Tool station tile (Phase 4). The shape is
 * deliberately simple/serializable: `{ componentId, systemId, toolId, label }`.
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
 * Shape the data needed to spawn an interactable TILE from a classified drop.
 * Pure: returns the flag-build args plus the placement geometry; the caller wires
 * the actual TileDocument creation (and resolves the icon `texture`/grid `width`/
 * `height` at the Foundry edge, passing them in here).
 *
 * The request carries:
 *  - `name`: the tool's label or the task's name, stored in the tile flag for the
 *    hover tooltip (tiles have no nameplate) and resolution.
 *  - `texture`: the icon path for the tile image (`texture.src`), resolved by the
 *    caller from the tool's component img / the task img with a sensible default.
 *  - `width`/`height`: the tile dimensions (default one grid square), resolved by
 *    the caller from the scene grid.
 *  - `node` (gatheringTask only): a SNAPSHOT of the task's node CONFIG (built via
 *    `buildNode`), carrying both config and runtime, or `null` for an unlimited
 *    (never-depleting) node. Tool requirements are NOT snapshotted — they resolve
 *    live from `task.toolIds`.
 *  - `environmentId` (gatheringTask only): the resolved drop environment.
 *
 * @param {object} params
 * @param {ReturnType<typeof classifyInteractableDrop>} params.classification
 * @param {{x: number, y: number}} [params.point]   Drop point in scene coordinates.
 * @param {string} [params.environmentId]           Resolved environment (gatheringTask only).
 * @param {string} [params.texture]                 Tile image path (`texture.src`).
 * @param {number} [params.width]                   Tile width (scene units).
 * @param {number} [params.height]                  Tile height (scene units).
 * @param {(task: object) => (object|null)} [params.buildNode] Node-snapshot builder
 *   applied to the classified task entry (gatheringTask only).
 * @returns {{ interactableType: string, sourceUuid: string, environmentId?: string,
 *   name?: string, texture?: string, width?: number, height?: number,
 *   node?: object, x: number, y: number } | null}
 */
export function buildSpawnRequest({ classification, point, environmentId, texture, width, height, buildNode } = {}) {
  if (!classification) return null;
  const request = {
    interactableType: classification.interactableType,
    sourceUuid: classification.sourceUuid,
    x: Number(point?.x ?? 0),
    y: Number(point?.y ?? 0)
  };

  // The hover-tooltip name comes from the task name or the tool label/name.
  const entry = classification.entry ?? null;
  const name = typeof entry?.name === 'string' && entry.name.trim()
    ? entry.name.trim()
    : (typeof entry?.label === 'string' ? entry.label.trim() : '');
  if (name) request.name = name;

  if (typeof texture === 'string' && texture.trim()) request.texture = texture.trim();
  if (Number.isFinite(Number(width)) && Number(width) > 0) request.width = Number(width);
  if (Number.isFinite(Number(height)) && Number(height) > 0) request.height = Number(height);

  if (classification.interactableType === 'gatheringTask') {
    if (typeof environmentId === 'string' && environmentId) {
      request.environmentId = environmentId;
    }
    if (typeof buildNode === 'function') {
      const node = buildNode(entry);
      if (node) request.node = node;
    }
  }
  return request;
}
