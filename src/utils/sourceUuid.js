/**
 * @module sourceUuid
 */
import { getFabricateFlag, isSafeFlagKeySegment } from '../config/flags.js';

/**
 * Resolve the compendium source UUID of a Foundry item document.
 *
 * On Foundry v12+, the canonical location is `_stats.compendiumSource`.
 * Older versions (and some migration paths) store it in `flags.core.sourceId`.
 * This helper checks both, preferring the modern field.
 *
 * @param {Item} item - A Foundry item document (or item-like object with flags/_stats)
 * @returns {string|null} The source UUID, or null if neither field is set
 */
export function getCompendiumSourceUuid(item) {
  if (!item) return null;
  // Foundry v12+ canonical field
  const compendiumSource =
    item._stats?.compendiumSource || item.system?._stats?.compendiumSource || null;
  if (compendiumSource) return compendiumSource;
  // Legacy fallback
  if (typeof foundry !== 'undefined' && foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(item, 'flags.core.sourceId') || null;
  }
  return item.flags?.core?.sourceId || null;
}

/**
 * Resolve the world-duplicate source UUID of a Foundry item document.
 *
 * When a world Item is duplicated (for example dragged) into an actor, Foundry
 * records the origin world document UUID in `_stats.duplicateSource` — distinct
 * from the compendium-source chain read by {@link getCompendiumSourceUuid} (in that
 * case `_stats.compendiumSource` is typically `null` and there is no
 * `flags.core.sourceId`). This helper mirrors the dual-location pattern of
 * {@link getCompendiumSourceUuid}, checking `_stats` then `system._stats`.
 *
 * @param {Item|object|null} item - A Foundry item document (or item-like object)
 * @returns {string|null} The world-duplicate source UUID, or null if unset
 */
export function getDuplicateSourceUuid(item) {
  if (!item) return null;
  return item._stats?.duplicateSource || item.system?._stats?.duplicateSource || null;
}

function pushUnique(target, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

/**
 * Collect the UUIDs that may identify a Foundry item instance and its canonical source.
 *
 * Contributes three references: the item's live `uuid`, its compendium-source
 * UUID ({@link getCompendiumSourceUuid}), and its world-duplicate source UUID
 * ({@link getDuplicateSourceUuid}). The duplicate-source reference recognizes
 * items duplicated (for example dragged) from a component's source world item,
 * which carry the link only in `_stats.duplicateSource`.
 *
 * @param {Item|object|null} item - Item-like object that may expose `uuid` and source metadata
 * @returns {string[]} Unique UUID references, ordered as [item.uuid, compendium source UUID, world-duplicate source UUID]
 */
export function getItemSourceReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUnique(refs, item.uuid);
  pushUnique(refs, getCompendiumSourceUuid(item));
  pushUnique(refs, getDuplicateSourceUuid(item));
  return refs;
}

/**
 * Collect the UUIDs that identify a Foundry item instance and its canonical
 * compendium source — but NOT its world-duplicate source.
 *
 * Contributes two references: the item's live `uuid` and its compendium-source
 * UUID ({@link getCompendiumSourceUuid}). Unlike {@link getItemSourceReferences}, this
 * deliberately omits `_stats.duplicateSource`, so a world Item cloned from
 * another world Item is treated as a distinct identity. Use this for component
 * *identity* decisions — import de-duplication and source-metadata propagation —
 * where conflating a clone with its original would wrongly merge two components
 * or rewrite the wrong one. Use {@link getItemSourceReferences} (which keeps the
 * duplicate source) for craft-time inventory matching, where a player's
 * drag/duplicate copy of a component's source world item must still resolve to
 * that component.
 *
 * @param {Item|object|null} item - Item-like object that may expose `uuid` and source metadata
 * @returns {string[]} Unique UUID references, ordered as [item.uuid, compendium source UUID]
 */
export function getItemIdentityReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUnique(refs, item.uuid);
  pushUnique(refs, getCompendiumSourceUuid(item));
  return refs;
}

/**
 * Collect every UUID reference a registered ENTRY can use for runtime matching.
 *
 * The argument is a registered-entry object — a component, a recipe-item
 * definition, or a first-class tool — NOT a live Foundry Item document. All three
 * kinds carry the same source-reference field shape, so the same union serves them
 * all; use {@link getItemSourceReferences} / {@link getItemIdentityReferences} for a
 * live Item document instead.
 *
 * @param {object|null} entry - Registered-entry object with source UUID fields
 * @returns {string[]} Unique UUID references across registeredItemUuid, originItemUuid, and aliasItemUuids
 */
export function getItemMatchUuids(entry) {
  const refs = [];
  if (!entry || typeof entry !== 'object') return refs;
  pushUnique(refs, entry.registeredItemUuid);
  pushUnique(refs, entry.originItemUuid);
  if (Array.isArray(entry.aliasItemUuids)) {
    for (const ref of entry.aliasItemUuids) pushUnique(refs, ref);
  }
  return refs;
}

/**
 * Whether an item's raw source-reference chain intersects a component's — the
 * durable-flag-agnostic tail of component matching. Kept as an INTERNAL helper
 * only: the exported `itemMatchesComponentSource` pairwise matcher was retired in
 * favour of the list-aware, system-scoped {@link resolveComponentForItem}, which
 * owns identity/exclusivity. This helper is the resolver's raw-reference
 * fall-through tier and nothing else.
 *
 * @param {Set<string>} itemRefs - The item's precomputed source-reference set.
 * @param {object|null} component - Component-like object with source UUID fields.
 * @returns {boolean} True when the item's refs overlap the component's source refs.
 */
function itemSourceRefsIntersectComponent(itemRefs, component) {
  return getItemMatchUuids(component).some((ref) => itemRefs.has(ref));
}

// Systems already warned-about, so a per-item resolve loop emits at most one console
// line per offending system id rather than one per candidate item.
const _warnedUnsafeSystemIds = new Set();

function warnUnsafeSystemIdOnce(systemId) {
  const key = String(systemId);
  if (_warnedUnsafeSystemIds.has(key)) return;
  _warnedUnsafeSystemIds.add(key);
  console.warn?.(
    `Fabricate | crafting system id "${key}" is not a valid durable-flag map key (it contains a "." or other unsafe character), so its durable identities (components, tools, and recipe items) resolve only by raw source references, not the per-system \`roles\` identity map. Recreate/re-import the system with a valid id (letters, digits, "_" or "-").`
  );
}

/**
 * Read the per-system durable identity a given ROLE claims for an item via
 * `flags.fabricate.roles[systemId][roleKey]` (`roleKey` is `'componentId'`,
 * `'toolId'`, …), applying the hygiene rule: an absent `roles`, an absent or empty
 * `roles[systemId]`, or a nullish leaf is NO claim (returns null). Tested BEFORE any
 * membership check so `{}` or `{ [roleKey]: null }` (a restamp interrupted midway)
 * can never spuriously match a definition whose id is itself nullish.
 *
 * @param {Item|object|null} item
 * @param {string|null|undefined} systemId
 * @param {string} roleKey - The role leaf under `roles[systemId]` (e.g. `componentId`, `toolId`).
 * @returns {string|null} The claimed id, or null when there is no claim.
 */
function claimedRoleId(item, systemId, roleKey) {
  // A `systemId` that is not a safe single dotted-path segment (absent, or containing
  // a `.` that `expandObject` would have nested on write) can never index the `roles`
  // map correctly, so it yields NO identity and the resolver degrades to raw refs —
  // rather than silently reading past a nested key. See `isSafeFlagKeySegment`.
  if (!isSafeFlagKeySegment(systemId)) return null;
  const roles = getFabricateFlag(item, 'roles', null);
  if (!roles || typeof roles !== 'object') return null;
  const perSystem = roles[systemId];
  if (!perSystem || typeof perSystem !== 'object') return null;
  const claimed = perSystem[roleKey];
  return claimed ?? null;
}

/**
 * The durable-flag tiers of a registered kind's identity, GENERALIZED over the
 * per-system role leaf (`roleKey`) and the optional legacy scalar flag
 * (`legacyScalarKey`), so the flag hygiene and fall-through order live in exactly one
 * place for every kind (components and first-class tools). Evaluated as tiers WITH fall-through (the FIRST tier that names
 * a definition in the set wins; a claimed id naming nothing in this set is irrelevant,
 * so evaluation falls through):
 *
 *   1. identity (roles) — `flags.fabricate.roles[systemId][roleKey]` names a definition
 *      in `candidates` ⇒ that definition, exclusively.
 *   2. identity (legacy) — when `legacyScalarKey != null`, else the legacy scalar
 *      `flags.fabricate.<legacyScalarKey>` names a definition in the set ⇒ that
 *      definition, exclusively (honored until the one-shot restamp backfills the map).
 *      Components pass `legacyScalarKey: 'componentId'`; TOOLS pass `null` — they NEVER
 *      had a legacy scalar flag, and calling `getFabricateFlag(item, null)` would read
 *      the whole `fabricate` namespace as a spurious id (`normalizeFlagKey(null)` returns
 *      `'fabricate'`), so the tier is guarded out entirely for a null key.
 *
 * @param {Item|object|null} item
 * @param {Array<object>} candidates - The candidate definition set of ONE system.
 * @param {string|null|undefined} systemId
 * @param {{ roleKey: string, legacyScalarKey: string|null }} keys
 * @returns {object|null} The durably-claimed definition, or null when no flag names one.
 */
function durableClaimedFromSet(item, candidates, systemId, { roleKey, legacyScalarKey }) {
  // Tier 1: durable per-system identity map.
  const roleId = claimedRoleId(item, systemId, roleKey);
  if (roleId != null) {
    const byRole = candidates.find((def) => def && def.id === roleId);
    if (byRole) return byRole;
  }

  // Tier 2: legacy scalar identity, honored until the restamp backfills the map.
  // Guarded on `legacyScalarKey != null` — a kind with no legacy scalar (tools) must
  // NEVER read `getFabricateFlag(item, null)`.
  if (legacyScalarKey != null) {
    const legacyId = getFabricateFlag(item, legacyScalarKey, null);
    if (legacyId != null) {
      const byLegacy = candidates.find((def) => def && def.id === legacyId);
      if (byLegacy) return byLegacy;
    }
  }

  return null;
}

/**
 * The two durable-flag tiers of COMPONENT identity — `durableClaimedFromSet` with the
 * component role leaf and its legacy scalar. Preserved as a named helper for
 * {@link resolveComponentForItem}.
 *
 * @param {Item|object|null} item
 * @param {Array<object>} candidates - The candidate component set of ONE system.
 * @param {string|null|undefined} systemId
 * @returns {object|null} The durably-claimed component, or null when no flag names one.
 */
function durableClaimedComponent(item, candidates, systemId) {
  return durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'componentId',
    legacyScalarKey: 'componentId',
  });
}

/**
 * Whether an owned item carries ANY durable COMPONENT identity claim — a per-system
 * `flags.fabricate.roles[*].componentId` for some system, OR the legacy flat
 * `flags.fabricate.componentId` scalar. Reads the SAME canonical locations
 * {@link resolveComponentForItem}'s durable tiers trust (the `roles` map that #556/#567
 * canonicalized, then the transitional legacy scalar), so a newly-flagged item and a
 * legacy flat-flag item are both recognized.
 *
 * The gate for suppressing the cross-system NAME fallback (issue 538): a flagged
 * item's identity IS its component id, so it must not loosely name-match a same-named
 * component in a DIFFERENT system — the per-system resolver has already tried the
 * candidate set that could legitimately bear its id, and a name hit in another system
 * only spawns a duplicate inventory row. Unlike {@link claimedRoleId} this is
 * system-agnostic (any system's `componentId` leaf counts) because the name-fallback
 * suppression must fire regardless of which system the item is flagged to.
 *
 * @param {Item|object|null} item
 * @returns {boolean} True when the item bears a component identity flag (roles or legacy scalar).
 */
export function itemHasComponentIdentityFlag(item) {
  if (!item || typeof item !== 'object') return false;
  // Legacy flat scalar — honored until the one-shot restamp backfills the roles map.
  if (getFabricateFlag(item, 'componentId', null) != null) return true;
  // Per-system roles map — a non-nullish `componentId` leaf under ANY system is a claim.
  const roles = getFabricateFlag(item, 'roles', null);
  if (roles && typeof roles === 'object') {
    for (const perSystem of Object.values(roles)) {
      if (perSystem && typeof perSystem === 'object' && perSystem.componentId != null) return true;
    }
  }
  return false;
}

/**
 * Resolve which single component an owned item IS, within ONE crafting system's
 * candidate set, scoped by that system's id. The shared, list-aware, system-scoped
 * component matcher — the component-kind analogue of {@link matchRecipeItemDefinition}.
 * Evaluated as tiers WITH fall-through (the FIRST tier that names a component in the
 * set wins; a claimed id naming nothing in this set is not "foreign", it is
 * irrelevant, so evaluation falls through):
 *
 *   1-2. durable-flag identity ({@link durableClaimedComponent}): the per-system
 *      `roles` map, then the legacy scalar `componentId`.
 *   3. fall-through — else the item's raw source references (`uuid`,
 *      `_stats.compendiumSource`/`flags.core.sourceId`, transitive
 *      `_stats.duplicateSource`) intersect a component's; the first such component,
 *      else null. Load-bearing for un-stamped pre-#555 worlds, stale flags, and
 *      multi-system worlds.
 *
 * `systemId` is threaded, not derivable: component ids are NOT globally unique (a
 * copy-imported system preserves its origin's component ids), so identity is scoped
 * per system. The invariant is only that within a single system's set at most one
 * component bears a given id.
 *
 * There is NO clone-gate here and there must never be one — Foundry stamps
 * `_stats.duplicateSource` on every non-compendium drag-drop, so distrusting it here
 * would break the ordinary hand-a-player-a-copy case (issue 555).
 *
 * @param {Item|object|null} item - Item-like object with `uuid`, source metadata, and `getFlag`.
 * @param {Array<object>|null} components - The candidate component set of ONE system.
 * @param {string|null|undefined} systemId - That system's id.
 * @returns {object|null} The single component the item IS, or null.
 */
export function resolveComponentForItem(item, components, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(components) ? components : [];
  if (candidates.length === 0) return null;

  // An unsafe (e.g. dotted) systemId can never have been written as a `roles` map key —
  // every stamp/repair/restamp site skips it — so there is no identity claim to honour.
  // Treat it as the ordinary UNSTAMPED case: skip tier 1 and fall through to tiers 2/3.
  // Do NOT refuse the resolution; that would strip the load-bearing raw-ref tier from a
  // legacy world (imported with a dotted id before creation-time validation existed) and
  // break its crafting entirely — strictly worse than the pre-#556 mis-attribution it
  // would prevent. `claimedRoleComponentId` already returns null for an unsafe segment;
  // warn once per system so a GM has a breadcrumb rather than a mute degrade.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  // Tiers 1-2: durable-flag identity.
  const durable = durableClaimedComponent(item, candidates, systemId);
  if (durable) return durable;

  // Tier 3: raw source-reference intersection.
  const itemRefs = new Set(getItemSourceReferences(item));
  if (itemRefs.size === 0) return null;
  return (
    candidates.find((component) => itemSourceRefsIntersectComponent(itemRefs, component)) || null
  );
}

// ---------------------------------------------------------------------------
// First-class Tool identity (issue 561). A Tool carries its OWN source references
// (identical field shape to a component), so its matching reuses the kind-agnostic
// `getItemMatchUuids` union directly and a PARALLEL resolver pair that shares the
// generalized `durableClaimedFromSet` primitive with
// `{ roleKey: 'toolId', legacyScalarKey: null }` — tools never had a legacy scalar
// flag. Kept parallel to (not folded into) the component functions precisely because
// of that legacy-scalar asymmetry.
// ---------------------------------------------------------------------------

/**
 * Resolve which single first-class Tool an owned item IS, within ONE crafting system's
 * Tools set, scoped by that system's id — the Tool-kind analogue of
 * {@link resolveComponentForItem}. Evaluated as tiers WITH fall-through:
 *
 *   1. durable identity — `flags.fabricate.roles[systemId].toolId` names a tool in the
 *      set ⇒ that tool, exclusively (tools have NO legacy scalar tier).
 *   3. fall-through — else the item's raw source references (`uuid`, compendium source,
 *      transitive `_stats.duplicateSource`) intersect a tool's; the first such tool.
 *
 * @param {Item|object|null} item
 * @param {Array<object>|null} tools - The candidate Tool set of ONE system.
 * @param {string|null|undefined} systemId
 * @returns {object|null} The single tool the item IS, or null.
 */
export function resolveToolForItem(item, tools, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(tools) ? tools : [];
  if (candidates.length === 0) return null;

  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  const durable = durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'toolId',
    legacyScalarKey: null,
  });
  if (durable) return durable;

  const itemRefs = new Set(getItemSourceReferences(item));
  if (itemRefs.size === 0) return null;
  return (
    candidates.find((tool) => getItemMatchUuids(tool).some((ref) => itemRefs.has(ref))) || null
  );
}

/**
 * Boolean companion to {@link resolveToolForItem}: whether the item resolves, within
 * `tools` scoped by `systemId`, to the specific `tool`.
 *
 * @param {Item|object|null} item
 * @param {object|null} tool
 * @param {Array<object>|null} tools
 * @param {string|null|undefined} systemId
 * @returns {boolean}
 */
export function itemResolvesToTool(item, tool, tools, systemId) {
  if (!tool || tool.id == null) return false;
  const resolved = resolveToolForItem(item, tools, systemId);
  return resolved != null && resolved.id === tool.id;
}

/**
 * Whether an owned item IS the given first-class `tool` by **durable-identity
 * matching** — the NARROW gate for destructive/consumptive tool selection (issue 561,
 * superseding the component-scoped #557 gate). The narrow counterpart of
 * {@link resolveToolForItem}, matching against the tool's OWN identity. Accepts ONLY:
 *
 *   1. the durable-flag identity `flags.fabricate.roles[systemId].toolId`; OR
 *   3. the item's OWN identity references — its live `uuid` or its compendium source
 *      ({@link getItemIdentityReferences}, which EXCLUDES the transitive
 *      `_stats.duplicateSource`) — intersecting a tool's source refs.
 *
 * There is NO name fallback and no legacy scalar tier. Sibling-exclusivity mirrors the
 * resolver. A world-template copy carrying neither a durable flag nor a compendium
 * source (only a transitive `_stats.duplicateSource`) resolves to NO tool here, so it is
 * spared from usage/breakage while still satisfying the wider presence gate elsewhere.
 *
 * @param {Item|object|null} item
 * @param {object|null} tool - The tool to test durable identity against.
 * @param {Array<object>|null} tools - The candidate set the identity is scoped to.
 * @param {string|null|undefined} systemId
 * @returns {boolean}
 */
export function itemIsToolByDurableIdentity(item, tool, tools, systemId) {
  if (!item || typeof item !== 'object') return false;
  if (!tool || tool.id == null) return false;
  const candidates = Array.isArray(tools) ? tools : [];
  if (candidates.length === 0) return false;

  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  const durable = durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'toolId',
    legacyScalarKey: null,
  });
  if (durable) return durable.id === tool.id;

  const itemRefs = new Set(getItemIdentityReferences(item));
  if (itemRefs.size === 0) return false;
  const resolved =
    candidates.find((candidate) => getItemMatchUuids(candidate).some((ref) => itemRefs.has(ref))) ||
    null;
  return resolved != null && resolved.id === tool.id;
}

/**
 * Boolean companion to {@link resolveComponentForItem}: whether the item resolves,
 * within `components` scoped by `systemId`, to the specific `component`.
 *
 * @param {Item|object|null} item
 * @param {object|null} component - The component to test identity against.
 * @param {Array<object>|null} components - The candidate set the identity is scoped to.
 * @param {string|null|undefined} systemId
 * @param {(item: object, components: Array<object>|null, systemId: string|null|undefined) => object|null} [resolveComponent] -
 *   The component resolver. Defaults to {@link resolveComponentForItem} (tiers 1-3),
 *   preserving today's behavior for gathering/inventory/standard-crafting callers.
 *   The alchemy craft path injects {@link resolveAlchemySubmissionComponent} (adding
 *   the bare-`registeredItemUuid` tier) so ingredient matching recognizes the same
 *   component the submission collector bucketed the item to.
 * @returns {boolean}
 */
export function itemResolvesToComponent(
  item,
  component,
  components,
  systemId,
  resolveComponent = resolveComponentForItem
) {
  if (!component || component.id == null) return false;
  const resolved = resolveComponent(item, components, systemId);
  return resolved != null && resolved.id === component.id;
}

/**
 * The tier order for {@link matchRecipeItemDefinition}, most to least durable.
 * @type {['identity','uuid','compendium','duplicate']}
 */
export const RECIPE_ITEM_MATCH_TIERS = ['identity', 'uuid', 'compendium', 'duplicate'];

/**
 * Resolve which recipe-item definition an item IS, and by how durable a link, within ONE
 * crafting system's candidate set scoped by that system's id.
 *
 * This is the single shared matcher for recipe items, mirroring
 * {@link resolveComponentForItem}'s durable-identity-first, list-aware split. It evaluates the
 * `identity` tier first via {@link durableClaimedFromSet} (the per-system `roles` map, then
 * the legacy scalar), and — only when no durable flag names a definition in the set — the
 * source-reference tiers in strict precedence order (the FIRST source tier that yields any
 * matching definition wins):
 *
 *   1. `identity`   — `flags.fabricate.roles[systemId].recipeItemDefinitionId` names a
 *                     definition in the set (durable, transferable identity-of-record, the
 *                     third `roles` sibling after componentId #556 and toolId #561), then
 *                     the legacy scalar `flags.fabricate.recipeItemDefinitionId` names one
 *                     (a transitional read-only fallback honored until the one-shot restamp
 *                     backfills the map). Both are LIST-AWARE: a claim naming nothing in
 *                     THIS set is irrelevant and evaluation falls through.
 *   2. `uuid`       — `item.uuid` is among the definition's union source refs (the item IS
 *                     the source).
 *   3. `compendium` — `getCompendiumSourceUuid(item)` is among them (compendium provenance;
 *                     a pack copy of the registered source).
 *   4. `duplicate`  — `getDuplicateSourceUuid(item)` is among them (a drag/duplicate copy
 *                     of an un-migrated world-template source).
 *
 * `systemId` is threaded, not derivable: recipe-item definition ids are NOT globally
 * unique (they are generated against a per-system uniqueness set), so identity is scoped
 * per system exactly like components. A dotted/unsafe `systemId` yields no roles claim
 * (`claimedRoleId` returns null via `isSafeFlagKeySegment`) and degrades to the legacy
 * scalar + source-uuid tiers, warning once per offending system rather than throwing.
 *
 * There is no clone-gate here, and there must never be one. Foundry stamps
 * `_stats.duplicateSource` on EVERY non-compendium drag-drop, so every legitimate
 * actor-owned copy carries it: a player's copy of a compendium-imported book holds both
 * an inherited `_stats.compendiumSource` (real provenance, tier 3) and a
 * `_stats.duplicateSource` (tier 4). Treating "has a duplicateSource" as "is a suspect
 * clone" here would misclassify every owned copy and refuse to resolve it through its
 * legitimate compendium source, breaking the common hand-a-player-a-copy case. The
 * clone-gate is a REGISTRATION and world/pack source-repair rule ONLY — it decides which
 * refs a duplicated SOURCE item contributes so a registered duplicate becomes its own
 * definition instead of overwriting the original — and it must never reach this matcher
 * or the repair of actor-owned copies. A future reader who "simplifies" the two paths
 * into one gate reintroduces issue 555.
 *
 * @param {Item|object|null} item - Item-like object with `uuid`, source metadata, and `getFlag`
 * @param {Array<object>|null} definitions - Candidate recipe-item definitions (ONE system)
 * @param {string|null|undefined} systemId - That system's id.
 * @returns {{definition: object|null, tier: ('identity'|'uuid'|'compendium'|'duplicate'|null)}}
 */
export function matchRecipeItemDefinition(item, definitions, systemId) {
  const empty = { definition: null, tier: null };
  if (!item || typeof item !== 'object') return empty;
  const defs = Array.isArray(definitions) ? definitions : [];
  if (defs.length === 0) return empty;

  // A dotted/unsafe systemId can never have been written as a `roles` map key, so there is
  // no identity claim to honour; degrade to the legacy scalar + source-uuid tiers and leave
  // a single breadcrumb per offending system rather than a mute degrade or a throw.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  // Tier 1 (identity): the durable per-system `roles` map, then the legacy scalar — both
  // list-aware. Keeps the `identity` tier label so every existing tier consumer (e.g. the
  // repair reliability check `tier !== 'duplicate'`) is unaffected.
  const durable = durableClaimedFromSet(item, defs, systemId, {
    roleKey: 'recipeItemDefinitionId',
    legacyScalarKey: 'recipeItemDefinitionId',
  });
  if (durable) return { definition: durable, tier: 'identity' };

  // Tiers 2/3/4 test membership in the definition's UNION of source refs (its
  // `registeredItemUuid` + `originItemUuid` + aliases), so a compendium-imported book
  // resolves whether the owned copy was dragged from the compendium item or the
  // imported world item. Unchanged from the pre-#567 fall-through.
  const uuid = typeof item.uuid === 'string' ? item.uuid : null;
  const compendium = getCompendiumSourceUuid(item);
  const duplicate = getDuplicateSourceUuid(item);
  const refSets = new Map(defs.map((def) => [def, new Set(getItemMatchUuids(def))]));
  const predicates = {
    uuid: (def) => uuid != null && refSets.get(def).has(uuid),
    compendium: (def) => compendium != null && refSets.get(def).has(compendium),
    duplicate: (def) => duplicate != null && refSets.get(def).has(duplicate),
  };

  for (const tier of RECIPE_ITEM_MATCH_TIERS) {
    if (tier === 'identity') continue;
    const definition = defs.find(predicates[tier]);
    if (definition) return { definition, tier };
  }
  return empty;
}

/**
 * Whether an item matches any of the given recipe-item definitions, by any tier.
 * The boolean companion to {@link matchRecipeItemDefinition}.
 *
 * @param {Item|object|null} item
 * @param {Array<object>|null} definitions
 * @param {string|null|undefined} systemId
 * @returns {boolean}
 */
export function itemMatchesRecipeItemSource(item, definitions, systemId) {
  return matchRecipeItemDefinition(item, definitions, systemId).definition != null;
}

/**
 * Resolve the durable component identity of a gathering-award SOURCE. A Foundry
 * Item source (it exposes `getFlag`) is resolved through the list-aware, system-
 * scoped {@link resolveComponentForItem}; a bare component source IS its own
 * identity. An Item's Foundry document `.id` is NEVER its component identity.
 *
 * @param {object|null} source
 * @param {Array<object>} components - The awarding system's resolved component set.
 * @param {string|null|undefined} systemId
 * @returns {object|null} The component the source IS, or null.
 */
function resolveSourceComponentIdentity(source, components, systemId) {
  if (!source || typeof source !== 'object') return null;
  if (typeof source.getFlag === 'function') {
    return resolveComponentForItem(source, components, systemId);
  }
  // A bare component source's identity is itself.
  return source;
}

/**
 * Find an existing actor item that should stack with a freshly-awarded source —
 * one that shares a source-UUID reference with `source` AND carries a
 * `system.quantity` field (so it can be incremented). Items without a quantity
 * field (unique gear) or with no shared source never match, so they create a new
 * document instead of stacking.
 *
 * Durable-identity guard (issue 556): a candidate that resolves — within the
 * awarding system's `components` scoped by `systemId` — to a DIFFERENT component
 * than the award source is skipped, so an award is never folded into an unrelated
 * owned stack merely because a transitive `_stats.duplicateSource` shares a raw
 * source reference. A candidate is skipped ONLY when BOTH the source and the
 * candidate resolve to components and those components differ; when either does not
 * resolve, stacking falls back to shared raw source references exactly as before.
 *
 * DOCUMENTED DEGRADE: `components`/`systemId` default to absent so a 2-arg call
 * reverts to pure raw-ref matching (the resolver returns null on both sides, so no
 * candidate is ever skipped) — a deliberate, tested fallback.
 *
 * @param {Array<object>} items - The actor's existing items (item-like objects).
 * @param {object} source - The resolved award source (a Foundry item or component).
 * @param {Array<object>} [components] - The awarding system's resolved component set.
 * @param {string} [systemId] - The awarding system's id.
 * @returns {object|null} The stackable match, or null.
 */
export function findStackableMatch(items, source, components = [], systemId) {
  const sourceRefs = new Set(
    [...getItemSourceReferences(source), ...getItemMatchUuids(source)].filter(Boolean)
  );
  if (sourceRefs.size === 0) return null;
  const sourceComponent = resolveSourceComponentIdentity(source, components, systemId);
  for (const item of Array.isArray(items) ? items : []) {
    const quantity = item?.system?.quantity;
    if (quantity === undefined || quantity === null) continue;
    const candidateComponent = resolveComponentForItem(item, components, systemId);
    // Skip ONLY when both identities resolve and name different components.
    if (sourceComponent && candidateComponent && sourceComponent.id !== candidateComponent.id) {
      continue;
    }
    if (getItemSourceReferences(item).some((ref) => sourceRefs.has(ref))) return item;
  }
  return null;
}
