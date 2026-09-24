/**
 * The tool-source transaction (issue 1923): `upsertTool` and `deleteTool` save the Tool array,
 * then write the source Item's `roles[systemId].toolId` leaf; a failed flag write restores the
 * array, both source flags and their `_stats` provenance. Collaborators arrive in `io`.
 */
import {
  getFabricateFlag,
  setFabricateFlag,
  FABRICATE_FLAG_NAMESPACE,
} from '../../config/flags.js';
import { Tool } from '../../models/Tool.js';

import { baseCollaborators, TOOL_FACTS } from './collaborators.js';

const MISSING_SOURCE_FLAG = Symbol('missing-source-flag');

/** This cluster's `io` bag: the base thunks plus the manager members these bodies reach. */
export function toolSourcesCollaborators(manager) {
  return {
    ...baseCollaborators(manager),
    toolRoleFlagKey: (systemId) => manager._toolRoleFlagKey(systemId),
    characterLibraryBasis: (system) => manager._characterLibraryBasis(system),
    normalizeTool: (tool, options) => manager._normalizeTool(tool, options),
    buildToolSourceSnapshot: (itemUuid, source) =>
      manager._buildToolSourceSnapshot(itemUuid, source),
    stampSourceIdentity: (source, flagKey, id) => manager._stampSourceIdentity(source, flagKey, id),
  };
}

async function resolveToolSourceItem(itemUuid) {
  let source;
  try {
    source = await fromUuid(itemUuid);
  } catch {
    source = null;
  }
  if (!source || source.documentName !== 'Item') {
    throw new Error(`Cannot register Tool source "${itemUuid}": resolved document is not an Item`);
  }
  return source;
}

function findToolForUpsert(tools, data, snapshot, source, flagKey) {
  const requestedId = typeof data?.id === 'string' ? data.id.trim() : '';
  if (requestedId) {
    const byId = tools.find((entry) => String(entry?.id) === requestedId);
    if (byId) return byId;
  }
  const durableId = flagKey ? getFabricateFlag(source, flagKey, null) : null;
  if (durableId) {
    const byDurableId = tools.find((entry) => String(entry?.id) === String(durableId));
    if (byDurableId) return byDurableId;
  }
  const refs = new Set([snapshot?.registeredItemUuid, snapshot?.originItemUuid].filter(Boolean));
  return (
    tools.find((entry) =>
      [entry?.registeredItemUuid, entry?.originItemUuid].some((ref) => refs.has(ref))
    ) || null
  );
}

function sourceFlagState(source, flagKey) {
  const provenance = {};
  for (const key of ['duplicateSource', 'compendiumSource']) {
    provenance[key] = {
      present: Object.prototype.hasOwnProperty.call(source?._stats ?? {}, key),
      value: source?._stats?.[key],
    };
  }
  return {
    source,
    flagKey,
    value: getFabricateFlag(source, flagKey, MISSING_SOURCE_FLAG),
    provenance,
  };
}

async function resolveStrictSourceFlagState(registeredItemUuid, flagKey) {
  if (!registeredItemUuid) return null;
  const source = await fromUuid(registeredItemUuid);
  if (!source || source.pack || typeof source.unsetFlag !== 'function') return null;
  return sourceFlagState(source, flagKey);
}

async function restoreSourceFlag({ source, flagKey, value }) {
  const current = getFabricateFlag(source, flagKey, MISSING_SOURCE_FLAG);
  if (current === value) return;
  if (value !== MISSING_SOURCE_FLAG) {
    await setFabricateFlag(source, flagKey, value);
    return;
  }
  if (current === MISSING_SOURCE_FLAG || typeof source?.unsetFlag !== 'function') return;
  await source.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${flagKey}`);
}

async function restoreSourceProvenance({ source, provenance }) {
  if (!provenance || typeof source?.update !== 'function') return;
  const patch = {};
  for (const [key, previous] of Object.entries(provenance)) {
    const present = Object.prototype.hasOwnProperty.call(source?._stats ?? {}, key);
    const current = source?._stats?.[key];
    if (previous.present) {
      if (!present || current !== previous.value) patch[`_stats.${key}`] = previous.value;
    } else if (present) {
      // A required nullable UUID field: a forced deletion fails validation, `null` clears it.
      patch[`_stats.${key}`] = null;
    }
  }
  if (Object.keys(patch).length > 0) await source.update(patch);
}

async function rollbackToolTransaction(io, system, previousTools, sourceFlagStates, cause) {
  const errors = [cause];
  system.tools = previousTools;
  for (let index = sourceFlagStates.length - 1; index >= 0; index -= 1) {
    const state = sourceFlagStates[index];
    try {
      await restoreSourceFlag(state);
    } catch (error) {
      errors.push(error);
    }
    try {
      await restoreSourceProvenance(state);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await io.saveSystems({ put: system, domains: TOOL_FACTS });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Tool transaction failed and rollback was incomplete');
  }
  throw cause;
}

async function applyToolSourceFlagChanges(
  io,
  { system, previousTools, source, previousSourceUuid, nextSourceUuid, flagKey, toolId }
) {
  if (!source || !flagKey) return;
  const sourceFlagStates = [];
  try {
    const nextSourceState = sourceFlagState(source, flagKey);
    const previousSourceState =
      previousSourceUuid && previousSourceUuid !== nextSourceUuid
        ? await resolveStrictSourceFlagState(previousSourceUuid, flagKey)
        : null;
    sourceFlagStates.push(nextSourceState);
    await io.stampSourceIdentity(source, flagKey, toolId);
    if (previousSourceState?.value === toolId) {
      sourceFlagStates.push(previousSourceState);
      await previousSourceState.source.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${flagKey}`);
    }
  } catch (error) {
    await rollbackToolTransaction(io, system, previousTools, sourceFlagStates, error);
  }
}

/** Persist one normalized Tool, optionally registering or relinking its Item source. Sources
 * resolve before mutation; a failed write restores the Tool array with no flag writes. */
export async function upsertTool(io, systemId, data = {}, { itemUuid } = {}) {
  io.assertGM('add tool from uuid');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);
  const flagKey = io.toolRoleFlagKey(system.id);
  const hasSourceRequest = typeof itemUuid === 'string' && !!itemUuid.trim();
  const source = hasSourceRequest ? await resolveToolSourceItem(itemUuid.trim()) : null;
  const snapshot = source ? await io.buildToolSourceSnapshot(itemUuid.trim(), source) : null;
  const tools = Array.isArray(system.tools) ? system.tools : [];
  const existing = findToolForUpsert(tools, data, snapshot, source, flagKey);
  // The Valid Id Basis `_normalizeSystem` uses (issue 1308), via the same helper: this site
  // bypasses `_normalizeSystem`, and a real-but-empty Set here would strip every tool's
  // prerequisites in a healthy migrated world.
  const { prerequisiteIds: validPrerequisiteIds } = io.characterLibraryBasis(system);
  const staged = io.normalizeTool(
    {
      ...existing,
      ...(data && typeof data === 'object' ? data : null),
      ...snapshot,
      id: existing?.id || data?.id || foundry.utils.randomID(),
      ...(source && { componentId: null }),
    },
    { validPrerequisiteIds }
  );
  const validation = Tool.fromJSON(staged).validate();
  if (!validation.valid) throw new Error(`Cannot save Tool: ${validation.errors.join('; ')}`);

  const nextTools = existing
    ? tools.map((entry) => (entry === existing ? staged : entry))
    : [...tools, staged];
  const previousTools = system.tools;
  system.tools = nextTools;
  try {
    await io.saveSystems({ put: system, domains: TOOL_FACTS });
  } catch (error) {
    system.tools = previousTools;
    throw error;
  }

  const previousSourceUuid = existing?.registeredItemUuid || existing?.originItemUuid || null;
  await applyToolSourceFlagChanges(io, {
    system,
    previousTools,
    source,
    previousSourceUuid,
    nextSourceUuid: staged.registeredItemUuid,
    flagKey,
    toolId: staged.id,
  });
  return { item: staged, action: existing ? 'updated' : 'added' };
}

/** Remove a Tool and clear only its `roles[systemId].toolId` leaf from the source Item
 * (issue 561), preserving a sibling `componentId` leaf. GM-gated, saved. */
export async function deleteTool(io, systemId, toolId) {
  io.assertGM('delete tool');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);
  const tools = Array.isArray(system.tools) ? system.tools : [];
  const tool = tools.find((entry) => String(entry?.id) === String(toolId)) || null;
  if (!tool) return { deleted: false };

  const previousTools = system.tools;
  system.tools = tools.filter((entry) => String(entry?.id) !== String(toolId));
  try {
    await io.saveSystems({ put: system, domains: TOOL_FACTS });
  } catch (error) {
    system.tools = previousTools;
    throw error;
  }

  const flagKey = io.toolRoleFlagKey(system.id);
  const registeredItemUuid = tool.registeredItemUuid || tool.originItemUuid || null;
  if (flagKey && registeredItemUuid) {
    const sourceFlagStates = [];
    try {
      const state = await resolveStrictSourceFlagState(registeredItemUuid, flagKey);
      if (state?.value === tool.id) {
        sourceFlagStates.push(state);
        await state.source.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${flagKey}`);
      }
    } catch (error) {
      await rollbackToolTransaction(io, system, previousTools, sourceFlagStates, error);
    }
  }
  return { deleted: true };
}
