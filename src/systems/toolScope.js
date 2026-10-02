import {
  applyWorldEnabledVeto,
  defineScope,
  isWorldEnabled,
  normalizeMemberships,
  normalizeWorldDefaults,
  resolveScopedDefinition,
} from './scopedDefinitions.js';
import { unionScopedDefinitions } from './scopedDefinitionStore.js';

/**
 * The tool half of Scoped Entity Definitions (issue 1358): four inherited sections, plus
 * `repairRequirements`, a seed copied on adoption because a repair's cost is per system. `1.31.0`
 * writes no world `prerequisites` or `bonus`, as `Tool#toJSON` mints both (issue 1373). A disabled
 * tool is a hard `TOOL_BLOCKED`, unlike the essence soft disable, and only tools carry a world
 * master switch. Scope decides where the break mode is authored; authority still decides whether.
 * Contract: `data-models/spec.md` § Scoped Entity Definitions, Tool scope.
 */

/** The tool sections, and the only keys an `inherit` map may carry. */
export const TOOL_SECTIONS = Object.freeze(['breakage', 'onBreak', 'prerequisites', 'bonus']);

/** The world-default section seeded onto a membership record rather than inherited. */
export const TOOL_SEEDED_SECTIONS = Object.freeze(['repairRequirements']);

/** The two shipped authority tokens; `immune` is a retired name. */
export const TOOL_BREAKAGE_AUTHORITIES = Object.freeze(['toolSpecific', 'checkDriven']);

/** The authority when neither the system nor the world authored one. */
export const DEFAULT_TOOL_BREAKAGE_AUTHORITY = 'toolSpecific';

/**
 * The block reason for an absent or disabled tool. Copies of the literal in `GatheringEngine.js`,
 * `gatheringBlockedReasons.js` and `GatheringTaskRequirements.svelte` stay unimported to keep this
 * a leaf; `tests/entity-scope-resolvers.test.js` guards the first two against drift.
 */
export const TOOL_BLOCKED = 'TOOL_BLOCKED';

/** The seeded list, by reference and never walked, only when authored. */
function attachRepairRequirements(entry) {
  return Array.isArray(entry.repairRequirements)
    ? { repairRequirements: entry.repairRequirements }
    : {};
}

export const TOOL_SCOPE = defineScope({
  sections: TOOL_SECTIONS,
  enableable: true,
  worldEnableable: true,
  worldExtras: attachRepairRequirements,
  membershipExtras: attachRepairRequirements,
});

/** Whether a tool's world record leaves it enabled. */
export function isToolEnabledInWorld(worldDefault) {
  return isWorldEnabled(worldDefault);
}

export function normalizeToolWorldDefaults(raw) {
  return normalizeWorldDefaults(raw, TOOL_SCOPE);
}

export function normalizeToolMemberships(raw) {
  return normalizeMemberships(raw, TOOL_SCOPE);
}

/**
 * Seed a new membership's `repairRequirements` once, on adoption, as a copy so neither side reaches
 * the other; an uncloneable list is kept shallow rather than dropped.
 */
export function seedToolRepairRequirements(worldDefault) {
  const world = worldDefault && typeof worldDefault === 'object' ? worldDefault : {};
  if (!Array.isArray(world.repairRequirements)) return [];
  try {
    return structuredClone(world.repairRequirements);
  } catch {
    return [...world.repairRequirements];
  }
}

function isAuthorityToken(value) {
  return typeof value === 'string' && TOOL_BREAKAGE_AUTHORITIES.includes(value);
}

/**
 * The world tool-breakage authority as a partial object to spread (issue 1359). An unauthored or
 * unknown value answers `{}`, never a minted `toolSpecific`.
 */
export function normalizeWorldToolBreakage(raw) {
  const authority = raw && typeof raw === 'object' ? raw.authority : undefined;
  return isAuthorityToken(authority) ? { toolBreakage: { authority } } : {};
}

/**
 * One system's effective authority: its own recognised token, else the world's, else
 * `toolSpecific` (`## CraftingSystem` requirement 21).
 */
export function resolveToolBreakageAuthority(worldToolBreakage, systemToolBreakage) {
  const system = systemToolBreakage?.authority;
  if (isAuthorityToken(system)) return system;
  const world = worldToolBreakage?.authority;
  if (isAuthorityToken(world)) return world;
  return DEFAULT_TOOL_BREAKAGE_AUTHORITY;
}

/**
 * Resolve one `(tool, system)` pair: the authored sections, `member`, `inherited`, `enabled`, and
 * `repairRequirements` from the membership record alone, never the world defaults.
 */
export function resolveTool(worldDefault, membership) {
  const record = membership && typeof membership === 'object' ? membership : null;
  const resolved = resolveScopedDefinition(worldDefault, record, TOOL_SCOPE);
  if (Array.isArray(record?.repairRequirements)) {
    resolved.repairRequirements = record.repairRequirements;
  }
  return resolved;
}

/** A non-member and a disabled tool block identically (`## Tool` requirement 3). */
export function toolAttemptBlockReason(resolved) {
  if (!resolved?.member || resolved.enabled !== true) return TOOL_BLOCKED;
  return null;
}

/**
 * The read union for tools; see `unionScopedDefinitions`. The in-system record still supplies
 * `componentId`, `label`, `requirement`, `checkBreakable`, and `prerequisites` and `bonus` unless
 * inheriting, so a world-scope writer must not assume world-wins.
 */
export function resolveToolScope(worldCorpus, systemId, systemTools) {
  // The in-system re-spread would let a tool's own `enabled` outvote a world-off veto.
  return applyWorldEnabledVeto(
    unionScopedDefinitions({
      corpus: worldCorpus,
      systemId,
      systemDefinitions: systemTools,
      resolve: resolveTool,
      entityType: 'tools',
    }),
    worldCorpus?.defaults
  );
}
