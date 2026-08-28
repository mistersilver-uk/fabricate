import {
  defineScope,
  normalizeMemberships,
  normalizeWorldDefaults,
  resolveScopedDefinition,
} from './scopedDefinitions.js';
import { unionScopedDefinitions } from './scopedDefinitionStore.js';

/**
 * The tool half of Scoped Entity Definitions (issue 1358, part of epic 1357).
 *
 * `## Tool` describes the shipped per-system shape and stays authoritative until the CONSUMER
 * SWEEP (epic 1357, PR 8a - the READ repointing half) repoints the readers. The `1.30.0` world-scope migration (PR 3) is what
 * makes THIS module live: `resolveToolBreakageAuthority` below is reached by the four non-UI
 * effective-authority readers from that release onward, because the crafting-system normalizer
 * became absence-preserving in the same change.
 *
 * THREE WORLD-DEFAULT SECTIONS, TWO OF THEM INHERITED. `breakage` and `onBreak` are ordinary
 * sections with their own inherit switches. `repairRequirements` is the third, and it is a SEED
 * rather than a live parent: it is copied out of the world defaults when a tool is added to a
 * system and then diverges freely, so `seedToolRepairRequirements` is a function the membership
 * action calls once and NOT a section the resolver reads through. Modelling it as a section with a
 * permanently-false inherit switch would be a lie the UI would then have to hide, and it would be
 * untrue on its own terms: a repair recipe names ingredient groups over the OWNING SYSTEM's
 * components, which the world scope cannot address.
 *
 * `enabled` KEEPS ITS SHIPPED MEANING VERBATIM. A reference to a tool that does not resolve, or
 * that resolves to a disabled tool, BLOCKS the attempt with `TOOL_BLOCKED` (`## Tool`
 * requirement 3). That is a hard block, not the essence's soft disable, and the two are
 * deliberately different meanings of one field name.
 *
 * THE BREAK MODE IS NOT A NEW FIELD, AND IT IS LIVE FROM `1.30.0`.
 * `resolveToolBreakageAuthority` resolves the SHIPPED
 * `CraftingSystem.toolBreakage.authority` (`## CraftingSystem` requirement 21) over a world value
 * and a per-system override, carrying the same two tokens; the per-tool control under `checkDriven`
 * stays `checkBreakable`. The governing rule is unchanged and gains exactly one clause: SCOPE
 * decides where authority is authored; AUTHORITY still decides WHETHER.
 */

/**
 * The tool sections resolution reads through, and the only keys a tool membership record's
 * `inherit` map may carry.
 *
 * @type {readonly string[]}
 */
export const TOOL_SECTIONS = Object.freeze(['breakage', 'onBreak']);

/**
 * The world-default section that is SEEDED onto a membership record rather than inherited.
 *
 * @type {readonly string[]}
 */
export const TOOL_SEEDED_SECTIONS = Object.freeze(['repairRequirements']);

/**
 * The two tool-breakage authority tokens. Already shipped; the prototype's `tool` / `check` are
 * deliberately not introduced, and `immune` is a retired name.
 *
 * @type {readonly string[]}
 */
export const TOOL_BREAKAGE_AUTHORITIES = Object.freeze(['toolSpecific', 'checkDriven']);

/**
 * The authority a system with no authored value, and no world value to inherit, reads as.
 *
 * @type {string}
 */
export const DEFAULT_TOOL_BREAKAGE_AUTHORITY = 'toolSpecific';

/**
 * The block reason a reference to an absent or disabled tool raises.
 *
 * THIS TOKEN IS ALREADY SHIPPED, as a bare literal, in THREE files this module deliberately does
 * not import: `GatheringEngine.js` (its private `DEFAULT_BLOCKED_REASON_KEYS` map plus four
 * `_blockedReason` call sites), the player app's `gatheringBlockedReasons.js` label and callout
 * maps, and `GatheringTaskRequirements.svelte`, which filters the token out of the requirement
 * callouts. Importing this module into any of them would drag a Foundry consumer, or a UI leaf,
 * into a module whose whole point is that nothing depends on it yet, so the shipped copies are
 * held together by a drift guard in `tests/entity-scope-resolvers.test.js` that fails if the
 * literal stops matching this constant. That guard scrapes the first two files only; the Svelte
 * leaf is named here so epic 1357's consumer sweep (PR 8a), which is what converges all three
 * onto this one export, does not work from an undercount.
 *
 * @type {string}
 */
export const TOOL_BLOCKED = 'TOOL_BLOCKED';

/**
 * Attach the seeded `repairRequirements` list only when it was authored.
 *
 * The list itself is OPAQUE - its members are ingredient groups this module has no business
 * inspecting - so it is preserved by reference and never walked.
 *
 * @param {object} entry
 * @returns {object}
 */
function attachRepairRequirements(entry) {
  return Array.isArray(entry.repairRequirements)
    ? { repairRequirements: entry.repairRequirements }
    : {};
}

/**
 * The tool scope descriptor.
 *
 * @type {Readonly<object>}
 */
export const TOOL_SCOPE = defineScope({
  sections: TOOL_SECTIONS,
  enableable: true,
  worldExtras: attachRepairRequirements,
  membershipExtras: attachRepairRequirements,
});

/**
 * Normalize the world tool defaults.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeToolWorldDefaults(raw) {
  return normalizeWorldDefaults(raw, TOOL_SCOPE);
}

/**
 * Normalize the tool system membership records.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeToolMemberships(raw) {
  return normalizeMemberships(raw, TOOL_SCOPE);
}

/**
 * Seed a new membership record's `repairRequirements` from the world defaults.
 *
 * Called ONCE, when a tool is added to a system. The seed is a COPY rather than the world list
 * itself, so a later world edit cannot reach through into a system that has already diverged, and
 * a later system edit cannot reach back into the world. A value that cannot be cloned is preserved
 * verbatim rather than dropped: a seed that silently lost a repair recipe would be worse than one
 * that shares a reference nobody can mutate structurally.
 *
 * @param {object|null} worldDefault
 * @returns {Array<object>}
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

/**
 * Whether a value is one of the two shipped authority tokens.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isAuthorityToken(value) {
  return typeof value === 'string' && TOOL_BREAKAGE_AUTHORITIES.includes(value);
}

/**
 * Normalize the WORLD tool-breakage authority for persistence (issue 1359).
 *
 * ABSENCE-PRESERVING. An unauthored or unrecognized value answers `{}` — no `toolBreakage` key at
 * all — rather than minting `toolSpecific`, because a minted default at world scope is
 * indistinguishable from a GM's deliberate choice and would silently become the value every
 * absent-preserving system inherits once the normalizer flip lands.
 *
 * Answers a PARTIAL OBJECT rather than the block itself, so `createToolScopeStore` can spread it
 * over the three sub-keys without a presence test of its own.
 *
 * @param {unknown} raw The raw `toolBreakage` block from the persisted scope value.
 * @returns {{toolBreakage?: {authority: string}}}
 */
export function normalizeWorldToolBreakage(raw) {
  const authority = raw && typeof raw === 'object' ? raw.authority : undefined;
  return isAuthorityToken(authority) ? { toolBreakage: { authority } } : {};
}

/**
 * Resolve the effective tool-breakage authority for one crafting system.
 *
 * ABSENT-PRESERVING ON THE SYSTEM SIDE: a system that authored nothing INHERITS the world value
 * rather than re-defaulting to `toolSpecific`, which is the whole point of lifting the switch. An
 * unrecognized system token is treated as absent for the same reason. Only when neither scope
 * authors a recognized token does the answer fall to `toolSpecific`, preserving `## CraftingSystem`
 * requirement 21 for a world that has authored no world value at all.
 *
 * @param {object|null} worldToolBreakage The world `toolBreakage` block.
 * @param {object|null} systemToolBreakage The crafting system's own `toolBreakage` block.
 * @returns {string} `"toolSpecific"` or `"checkDriven"`.
 */
export function resolveToolBreakageAuthority(worldToolBreakage, systemToolBreakage) {
  const system = systemToolBreakage?.authority;
  if (isAuthorityToken(system)) return system;
  const world = worldToolBreakage?.authority;
  if (isAuthorityToken(world)) return world;
  return DEFAULT_TOOL_BREAKAGE_AUTHORITY;
}

/**
 * Resolve one `(tool, system)` pair.
 *
 * The answer carries `breakage` and `onBreak` (each when authored at the winning scope),
 * `repairRequirements` when the membership record authored some, `member`, the per-section
 * `inherited` map, and `enabled`.
 *
 * `repairRequirements` is answered from the MEMBERSHIP RECORD ALONE and is never read back out of
 * the world defaults - a seeded value that a system has since edited is the only truth about that
 * system's repair recipe.
 *
 * @param {object|null} worldDefault
 * @param {object|null} membership
 * @returns {{breakage?: unknown, onBreak?: unknown, repairRequirements?: Array<object>,
 *   member: boolean, enabled: boolean, inherited: {[section: string]: boolean}}}
 */
export function resolveTool(worldDefault, membership) {
  const record = membership && typeof membership === 'object' ? membership : null;
  const resolved = resolveScopedDefinition(worldDefault, record, TOOL_SCOPE);
  if (Array.isArray(record?.repairRequirements)) {
    resolved.repairRequirements = record.repairRequirements;
  }
  return resolved;
}

/**
 * Why a reference to this tool blocks the attempt, or `null` when it does not.
 *
 * A tool that does not exist in the system and a tool that exists but is disabled block
 * IDENTICALLY, because `## Tool` requirement 3 makes an unresolvable reference and a disabled one
 * the same refusal. This is a HARD block: unlike the essence soft disable, nothing downstream runs.
 *
 * @param {{member?: boolean, enabled?: boolean}|null} resolved
 * @returns {string|null}
 */
export function toolAttemptBlockReason(resolved) {
  if (!resolved?.member || resolved.enabled !== true) return TOOL_BLOCKED;
  return null;
}

/**
 * THE READ UNION for a tool: what a crafting system's tools list IS (issue 1359).
 *
 * The world tools whose membership record for this system is PRESENT, each RESOLVED through the
 * three-layer resolver above, unioned with the system's surviving in-system array, WORLD WINNING
 * FIELD BY FIELD on an id collision (issue 1363) rather than replacing the in-system record: the
 * surviving record supplies every field no world layer owns — `componentId`, `label`, `requirement`, `prerequisites`, `bonus` and `checkBreakable` — and the world layer
 * still wins every field it authors.
 *
 * IT IS MEMBERSHIP-FILTERED AND RESOLVED, and the BASIS union
 * (`CraftingSystemManager#_scopeBasis`) is neither. That difference is the point: an absent
 * membership record is a REFUSAL, never a PRUNE, so a reference to a world tool this system is
 * not a member of must be ABSENT from this answer and PRESENT in the basis. Filtering the basis by
 * membership would convert that refusal into a silent, persisted deletion on the first normalize.
 *
 * @param {{entities: Array<object>, defaults: Array<object>, membership: Array<object>}|null}
 *   worldCorpus The world scope store's published corpus.
 * @param {string} systemId
 * @param {unknown} systemTools The system's surviving in-system array.
 * @returns {Array<object>}
 */
export function resolveToolScope(worldCorpus, systemId, systemTools) {
  return unionScopedDefinitions({
    corpus: worldCorpus,
    systemId,
    systemDefinitions: systemTools,
    resolve: resolveTool,
  });
}
