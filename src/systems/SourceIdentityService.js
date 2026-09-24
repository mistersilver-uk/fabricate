/**
 * Source-identity stamping and repair (issue 1699): the durable-flag writes, the three one-shot
 * auto-stamps and the GM "Repair Item Data" pass. Every collaborator arrives in `io`, rebuilt per
 * call so an instance patch is observed; nothing here reads a Foundry global.
 */
import { FABRICATE_FLAG_NAMESPACE, getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import {
  getDuplicateSourceUuid,
  getItemIdentityReferences,
  getItemMatchUuids,
  matchRecipeItemDefinition,
  resolveComponentForItem,
  resolveToolForItem,
} from '../utils/sourceUuid.js';

/** Strip a clone's stale `_stats` provenance (`duplicateSource` plus the inherited
 * `compendiumSource`) from a registered source Item. Kind-agnostic, and only touches a source
 * that is itself a clone; a non-clone's `compendiumSource` is legitimate provenance. */
async function stripCloneSourceProvenance(source) {
  if (!getDuplicateSourceUuid(source) || typeof source.update !== 'function') return false;
  const patch = {};
  if (source._stats?.duplicateSource || source.system?._stats?.duplicateSource) {
    patch['_stats.duplicateSource'] = null;
  }
  if (source._stats?.compendiumSource || source.system?._stats?.compendiumSource) {
    patch['_stats.compendiumSource'] = null;
  }
  if (Object.keys(patch).length === 0) return false;
  await source.update(patch);
  return true;
}

/** Strip a clone's stale provenance and stamp `flags.fabricate.<flagKey>`, overwriting an
 * inherited marker, for any kind (issue 561). Writes are conditional; the caller checks access. */
async function writeSourceIdentity(source, flagKey, id) {
  const stripped = await stripCloneSourceProvenance(source);
  let stamped = false;
  if (getFabricateFlag(source, flagKey, null) !== id) {
    await setFabricateFlag(source, flagKey, id);
    stamped = true;
  }
  return { stripped, stamped };
}

/**
 * Stamp a durable identity on a registered source world Item, so a future copy inherits it even
 * when Foundry's transitive `_stats.duplicateSource` points at a template; a no-op for a non-Item
 * or any pack source. The clone-gate is safe only on a source, where `duplicateSource` means a
 * sidebar Duplicate, never on an actor-owned copy, which carries it from every non-compendium
 * drop; `matchRecipeItemDefinition` deliberately has no gate.
 */
export async function stampSourceIdentity(source, flagKey, id) {
  if (!id) return;
  if (!source || source.pack || (source.documentName && source.documentName !== 'Item')) return;
  if (typeof source.setFlag !== 'function') return;
  const { stripped } = await writeSourceIdentity(source, flagKey, id);
  if (stripped) {
    console.debug?.('Fabricate | stripped clone provenance from a registered source', source.uuid);
  }
}

/** Clear a stale durable flag from a world item that no longer sources the registration. */
export async function clearSourceFlag(io, registeredItemUuid, flagKey, id) {
  if (!registeredItemUuid || !id) return;
  let doc;
  try {
    doc = await io.resolveUuid(registeredItemUuid);
  } catch {
    doc = null;
  }
  if (!doc || doc.pack || typeof doc.unsetFlag !== 'function') return;
  if (getFabricateFlag(doc, flagKey, null) !== id) return;
  try {
    await doc.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${flagKey}`);
  } catch {
    // Non-fatal.
  }
}

/**
 * The three auto-stamps' shared body. A dotted system id cannot key `roles`, so its system is
 * skipped and resolves through raw refs instead. Locked packs and unresolvable sources are counted
 * and skipped, and a second run writes nothing. Callers gate on the primary GM and the one-shot
 * setting version.
 */
async function autoStampSources(io, { flagKeyFor, entriesOf, uuidOf }) {
  const summary = { scanned: 0, stamped: 0, stripped: 0, skippedLocked: 0, skippedMissing: 0 };
  for (const system of io.getSystems()) {
    const flagKey = flagKeyFor(system.id);
    if (!flagKey) continue;
    for (const entry of entriesOf(system)) {
      const uuid = uuidOf(entry);
      if (!uuid || !entry?.id) continue;
      summary.scanned += 1;
      let source;
      try {
        source = await io.resolveUuid(uuid);
      } catch {
        source = null;
      }
      if (!source || typeof source.setFlag !== 'function') {
        summary.skippedMissing += 1;
        continue;
      }
      if (source.pack) {
        const pack = io.getPack(source.pack);
        if (!pack || pack.locked) {
          summary.skippedLocked += 1;
          continue;
        }
      }
      const { stamped, stripped } = await writeSourceIdentity(source, flagKey, entry.id);
      if (stamped) summary.stamped += 1;
      if (stripped) summary.stripped += 1;
    }
  }
  return summary;
}

/**
 * Backfill `roles[system.id].recipeItemDefinitionId` on each recipe-item source (issues 555, 567),
 * once per owning system. Sources only; the legacy scalar stays as the fallback for older copies.
 * Unlike the other two it reads `originItemUuid` alone, so a registered-uuid-only definition is
 * never stamped.
 */
export async function autoStampRecipeItemSources(io) {
  return autoStampSources(io, {
    flagKeyFor: (systemId) => io.recipeItemRoleFlagKey(systemId),
    entriesOf: (system) => system.recipeItemDefinitions || [],
    uuidOf: (definition) => definition?.originItemUuid,
  });
}

/** Backfill `roles[system.id].componentId` on each component's source (issue 556). */
export async function autoStampComponentSources(io) {
  return autoStampSources(io, {
    flagKeyFor: (systemId) => io.componentRoleFlagKey(systemId),
    entriesOf: (system) => system.components || [],
    uuidOf: (component) => component?.originItemUuid || component?.registeredItemUuid,
  });
}

/** Backfill `roles[system.id].toolId` on each tool's source (issue 561). It reads refs the
 * `1.15.0` `migrateToolsToFirstClass` migration populates, so it must run after that persists. */
export async function autoStampToolSources(io) {
  return autoStampSources(io, {
    flagKeyFor: (systemId) => io.toolRoleFlagKey(systemId),
    entriesOf: (system) => system.tools || [],
    uuidOf: (tool) => tool?.originItemUuid || tool?.registeredItemUuid,
  });
}

/** The definition a registered source maps to. A non-clone's durable flag wins even over a
 * drifted `originItemUuid`, the per-system leaf (issue 567) before the legacy scalar; a clone's
 * inherited flag is ignored, so a duplicate becomes its own definition (issue 555). */
export function findRecipeItemDefinitionForSource(io, system, snapshot, source) {
  const definitions = Array.isArray(system.recipeItemDefinitions)
    ? system.recipeItemDefinitions
    : [];
  if (!getDuplicateSourceUuid(source)) {
    const roleFlagKey = io.recipeItemRoleFlagKey(system.id);
    const roleId = roleFlagKey ? getFabricateFlag(source, roleFlagKey, null) : null;
    if (roleId) {
      const byRole = definitions.find((def) => def.id === roleId);
      if (byRole) return byRole;
    }
    const flagId = getFabricateFlag(source, 'recipeItemDefinitionId', null);
    if (flagId) {
      const byFlag = definitions.find((def) => def.id === flagId);
      if (byFlag) return byFlag;
    }
  }
  // The snapshot's refs are already clone-gated, so a duplicate cannot match the original.
  const claimed = new Set(getItemMatchUuids(snapshot));
  if (claimed.size === 0) return null;
  return definitions.find((def) => getItemMatchUuids(def).some((ref) => claimed.has(ref))) || null;
}

// Trimmed, whitespace-collapsed and lowercased for exact matching; names are registration
// snapshots, not localized keys, so the client language cannot move a match.
function normalizeMatchName(name) {
  return String(name ?? '')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();
}

// The one definition of this system with the name, `'ambiguous'` for two or more, else `null`;
// uniqueness is per system (issue 567), never global.
function uniqueDefinitionByName(name, definitions) {
  const normalized = normalizeMatchName(name);
  if (!normalized) return null;
  const matches = definitions.filter((def) => normalizeMatchName(def?.name) === normalized);
  if (matches.length === 0) return null;
  if (matches.length >= 2) return 'ambiguous';
  return matches[0];
}

// A world or writable-pack source's owner, clone-gated: a clone keys on its own uuid alone, or
// its inherited `compendiumSource` would stamp it with the original's id.
function resolveSourceRepairOwner(item, kind) {
  const isClone = !!getDuplicateSourceUuid(item);
  const refs = new Set(
    isClone
      ? [item?.uuid].filter((ref) => typeof ref === 'string' && ref.trim())
      : getItemIdentityReferences(item)
  );
  if (refs.size === 0) return null;
  return (
    kind.definitions.find((def) => kind.refExtractor(def).some((ref) => refs.has(ref))) || null
  );
}

// An actor-owned item's `{definition, tier}`, with no clone-gate: Foundry stamps
// `duplicateSource` on drag-drop, so the ordinary runtime matchers apply.
function resolveOwnedRepairOwner(item, kind) {
  if (kind.bucket === 'recipeItems') {
    return matchRecipeItemDefinition(item, kind.definitions, kind.systemId);
  }
  // A tool has its own identity; the component resolver would misread it (issue 561).
  if (kind.bucket === 'tools') {
    const definition = resolveToolForItem(item, kind.definitions, kind.systemId);
    return { definition, tier: null };
  }
  const definition = resolveComponentForItem(item, kind.definitions, kind.systemId);
  return { definition, tier: null };
}

/** Stamp one item from its resolved owner, stripping `_stats.duplicateSource`, or clear a stale
 * flag when it sources nothing; writes are conditional. */
async function repairSourceItem(item, owner, kind, summary) {
  if (!item || typeof item.update !== 'function') return;
  const currentFlag = getFabricateFlag(item, kind.flagKey, null);
  const bucket = summary[kind.bucket];

  if (owner) {
    if (item._stats?.duplicateSource) {
      await item.update({ '_stats.duplicateSource': null });
      summary.stripped += 1;
      bucket.stripped += 1;
    }
    if (currentFlag !== owner.id) {
      await setFabricateFlag(item, kind.flagKey, owner.id);
      summary.stamped += 1;
      bucket.stamped += 1;
    }
  } else if (currentFlag && typeof item.unsetFlag === 'function') {
    await item.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${kind.flagKey}`);
    summary.cleared += 1;
    bucket.cleared += 1;
  }
}

/** Reconcile one owned item. A flagged copy is authoritative and untouched; a recipe item matched
 * only by `duplicateSource` is stamped only when its name uniquely confirms a definition, which may
 * re-point it. Never triggers a learn. */
async function repairOwnedItem(item, kind, summary, auditLog) {
  if (!item || typeof item.update !== 'function') return;
  if (getFabricateFlag(item, kind.flagKey, null)) return;

  const { definition, tier } = resolveOwnedRepairOwner(item, kind);

  // Components, and recipe items matched by a reliable tier, are stamped directly.
  if (kind.bucket !== 'recipeItems' || (definition && tier !== 'duplicate')) {
    await repairSourceItem(item, definition, kind, summary);
    return;
  }

  // Tier 4 (`duplicateSource`) is unreliable (issue 555); with no duplicate there is nothing to
  // re-point against.
  if (!getDuplicateSourceUuid(item)) {
    await repairSourceItem(item, definition, kind, summary);
    return;
  }

  const byName = uniqueDefinitionByName(item?.name, kind.definitions);
  if (byName === 'ambiguous') {
    // Left as a tier-4 fallback, which bulk auto-learn refuses.
    summary.skippedAmbiguous += 1;
    return;
  }
  if (!byName) {
    return;
  }
  // A different definition is a re-point, logged as an auditable, reversible record.
  if (!definition || byName.id !== definition.id) {
    auditLog.push({
      itemUuid: item.uuid || null,
      oldDuplicateSourceTarget: getDuplicateSourceUuid(item),
      newlyStampedDefinitionId: byName.id,
    });
    summary.repointed += 1;
  }
  await repairSourceItem(item, byName, kind, summary);
}

/** A definition's own source uuid: registered, then origin, then the first alias. */
function definitionSourceUuid(definition = null) {
  const refs = [
    definition?.registeredItemUuid,
    definition?.originItemUuid,
    ...(Array.isArray(definition?.aliasItemUuids) ? definition.aliasItemUuids : []),
  ];
  for (const ref of refs) {
    const uuid = typeof ref === 'string' ? ref.trim() : '';
    if (uuid) return uuid;
  }
  return '';
}

/** Count a skipped description by reason and in the flat `skipped` total. */
function countSkippedDescription(summary, reason) {
  summary.descriptions[reason] += 1;
  summary.descriptions.skipped += 1;
}

/**
 * The definition-driven description refresh of {@link repairItemData}, not its item walk: the
 * walk skips locked packs, where the raw `@UUID[Compendium.…]` text lives and descriptions are
 * only read, and would let an owned copy write a definition's description. Tools carry none.
 */
async function refreshDefinitionDescriptions(io, summary) {
  const targets = [];
  for (const system of io.getSystems()) {
    for (const bucket of ['components', 'recipeItemDefinitions']) {
      for (const definition of system?.[bucket] || []) {
        if (definition) targets.push(definition);
      }
    }
  }

  // Resolve every source first, so the enricher cache is primed once, not per `enrichHTML`.
  const resolved = [];
  const rawTexts = [];
  for (const definition of targets) {
    const uuid = definitionSourceUuid(definition);
    if (!uuid) {
      countSkippedDescription(summary, 'skippedUnresolved');
      continue;
    }
    let source;
    try {
      source = await io.resolveUuid(uuid);
    } catch {
      source = null;
    }
    if (!source) {
      // A vanished source is the GM's to fix, unlike a blank one below.
      countSkippedDescription(summary, 'skippedUnresolved');
      continue;
    }
    resolved.push({ definition, source });
    const raw = io.rawSourceDescription(source);
    if (raw) rawTexts.push(raw);
  }

  await io.primeEnricherCache(rawTexts);

  // Sweep 2 — resolve, normalize, store.
  let changed = false;
  for (const { definition, source } of resolved) {
    const next = await io.extractSourceDescription(source);
    const current = typeof definition.description === 'string' ? definition.description : '';
    if (next === current) {
      summary.descriptions.unchanged += 1;
      continue;
    }
    // A blank source never wipes a stored description (`tests/repair-item-data.test.js`).
    if (!next) {
      countSkippedDescription(summary, 'skippedEmpty');
      continue;
    }
    definition.description = next;
    summary.descriptions.refreshed += 1;
    changed = true;
  }

  return changed;
}

/**
 * The per-system repair kinds: definition ids are not globally unique and each identity is a
 * `roles.<systemId>.<role>` leaf, so each pass touches only its own leaf and cannot clear another
 * system's, whatever the `getSystems()` order (issues 556, 567).
 */
function buildRepairKinds(io) {
  const kinds = [];
  for (const system of io.getSystems()) {
    // A dotted system id cannot key `roles`, so the whole system is skipped, all three kinds.
    const flagKey = io.componentRoleFlagKey(system.id);
    if (!flagKey) continue;
    // The persisted record, not the read union, is what the restamp repairs (issue 1370).
    kinds.push({
      bucket: 'components',
      flagKey,
      systemId: system.id,
      definitions: system.components || [],
      refExtractor: (def) => getItemMatchUuids(def),
    });
    const toolFlagKey = io.toolRoleFlagKey(system.id);
    if (toolFlagKey) {
      // Persisted too; a tool with no source refs is filtered out.
      kinds.push({
        bucket: 'tools',
        flagKey: toolFlagKey,
        systemId: system.id,
        definitions: (system.tools || []).filter(
          (tool) => tool && (tool.originItemUuid || tool.registeredItemUuid)
        ),
        refExtractor: (def) => getItemMatchUuids(def),
      });
    }
    const recipeFlagKey = io.recipeItemRoleFlagKey(system.id);
    if (recipeFlagKey) {
      kinds.push({
        bucket: 'recipeItems',
        flagKey: recipeFlagKey,
        systemId: system.id,
        definitions: system.recipeItemDefinitions || [],
        refExtractor: (def) => getItemMatchUuids(def),
      });
    }
  }
  return kinds;
}

/** Flat totals for the component-repair contract, a per-bucket split, and descriptions. */
function emptyRepairSummary() {
  return {
    scanned: 0,
    skippedLocked: 0,
    stamped: 0,
    stripped: 0,
    cleared: 0,
    // Name-assisted re-point outcomes.
    repointed: 0,
    skippedAmbiguous: 0,
    components: { stamped: 0, stripped: 0, cleared: 0 },
    tools: { stamped: 0, stripped: 0, cleared: 0 },
    recipeItems: { stamped: 0, stripped: 0, cleared: 0 },
    // Issue 800, apart from the identity counts. `skipped` totals `skippedUnresolved` (the
    // source is gone, actionable) and `skippedEmpty` (it has no description).
    descriptions: {
      refreshed: 0,
      unchanged: 0,
      skipped: 0,
      skippedUnresolved: 0,
      skippedEmpty: 0,
    },
    repointLog: [],
  };
}

/**
 * GM "Repair Item Data": reconcile every projection of each definition's source. Identity is
 * item-driven over world items, writable packs and actor-owned items: sources are clone-gated and
 * stamped, owned copies go through the runtime matchers and the name-assisted re-point. Locked
 * packs are skipped, synthetic and compendium actors never scanned, and nothing triggers a learn.
 * Descriptions are definition-driven, locked packs included (issue 800).
 */
export async function repairItemData(io, { includeCompendiums = true } = {}) {
  const kinds = buildRepairKinds(io);
  const summary = emptyRepairSummary();

  const repairSource = async (item) => {
    for (const kind of kinds) {
      await repairSourceItem(item, resolveSourceRepairOwner(item, kind), kind, summary);
    }
  };

  for (const item of io.worldItems()) {
    summary.scanned += 1;
    await repairSource(item);
  }

  if (includeCompendiums) {
    for (const pack of io.itemPacks()) {
      if (pack?.documentName !== 'Item') continue;
      if (pack.locked) {
        summary.skippedLocked += 1;
        continue;
      }
      let docs;
      try {
        docs = await pack.getDocuments();
      } catch {
        docs = [];
      }
      for (const item of docs) {
        summary.scanned += 1;
        await repairSource(item);
      }
    }
  }

  for (const actor of io.actors()) {
    const items = actor?.items ? [...actor.items] : [];
    for (const item of items) {
      summary.scanned += 1;
      for (const kind of kinds) {
        await repairOwnedItem(item, kind, summary, summary.repointLog);
      }
    }
  }

  // Unaffected by `includeCompendiums` and `pack.locked`: it only reads through the resolver.
  const descriptionsChanged = await refreshDefinitionDescriptions(io, summary);
  if (descriptionsChanged) {
    await io.persistItemMetadata();
  }

  return summary;
}
