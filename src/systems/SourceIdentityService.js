/**
 * Source-identity STAMPING and REPAIR (issue 1699): the durable-flag writes, the three one-shot
 * auto-stamps and the GM "Repair Item Data" pass, extracted from `CraftingSystemManager`. Every
 * collaborator arrives in `io`, which the manager's delegate rebuilds per call, so an instance
 * patch applied after construction is still observed. Nothing here reads a Foundry global — the
 * world item, pack and actor collections and the uuid resolver all arrive as thunks.
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

/** Core identity write, KIND-GENERIC over the durable flag key: strip a clone's stale `_stats`
 * provenance and stamp `flags.fabricate.<flagKey>`, overwriting an inherited marker. Writes
 * stay conditional, and the caller is assumed to have checked writability. Shared by every
 * registered kind (issue 561) and by the one-shot auto-stamp. */
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
 * Persist a transferable durable identity (`flags.fabricate.<flagKey>`) on a registered source
 * WORLD item, so any future inventory copy inherits it and resolves to this registration even
 * when Foundry's transitive `_stats.duplicateSource` points at a template. KIND-GENERIC, and a
 * no-op for compendium, locked or non-Item sources, whose copies still resolve via source UUIDs.
 *
 * The clone-gate is safe HERE, and only here and in world/pack source repair, because a
 * registered SOURCE carrying `duplicateSource` is a genuine sidebar-Duplicate. It must NEVER
 * be applied to actor-owned copies, which carry it legitimately from every non-compendium
 * drag-drop; `matchRecipeItemDefinition` is the runtime matcher that deliberately has no gate.
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

/**
 * Clear a stale `flags.fabricate.<flagKey>` from a world item that no longer sources
 * the given registration (used when a definition/component is re-pointed to a new
 * source). KIND-GENERIC.
 */
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
 * The shared body of the three one-shot auto-stamps. A dotted (unsafe) system id cannot serve as a
 * `roles` map key, so `flagKeyFor` answers null and the whole system is skipped rather than nesting
 * garbage; its entries still resolve via the raw-ref (and, for recipe items, legacy-scalar)
 * fall-through. Locked packs and unresolvable sources are counted and skipped, and a second run
 * performs zero writes. Callers gate this on primary-GM plus the one-shot setting version.
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
 * One-shot auto-stamp (issues 555, 567): backfill the durable per-system
 * `roles[system.id].recipeItemDefinitionId` on every registered recipe-item definition's writable
 * source Item. A shared source registered in BOTH system A and system B is stamped once per owning
 * system, so it carries both leaves. Sources only: owned copies are covered by future drags and by
 * the manual repair, and the legacy scalar is NOT stripped, remaining the transitional fallback for
 * pre-upgrade owned copies. This arm reads `originItemUuid` ALONE — deliberately unlike the other
 * two — so a definition carrying only a registered uuid is never stamped.
 */
export async function autoStampRecipeItemSources(io) {
  return autoStampSources(io, {
    flagKeyFor: (systemId) => io.recipeItemRoleFlagKey(systemId),
    entriesOf: (system) => system.recipeItemDefinitions || [],
    uuidOf: (definition) => definition?.originItemUuid,
  });
}

/** Issue 556 one-shot auto-stamp: backfill the durable per-system
 * `roles[system.id].componentId` on every registered component's writable source Item. Callers
 * gate this on primary-GM plus the one-shot setting version, so it does no gating of its own
 * beyond writability. */
export async function autoStampComponentSources(io) {
  return autoStampSources(io, {
    flagKeyFor: (systemId) => io.componentRoleFlagKey(systemId),
    entriesOf: (system) => system.components || [],
    uuidOf: (component) => component?.originItemUuid || component?.registeredItemUuid,
  });
}

/** Issue 561 one-shot auto-stamp: backfill the durable per-system `roles[system.id].toolId` on
 * every registered tool's writable source Item — a clone of {@link autoStampComponentSources}.
 * A tool with no source refs is skipped. ORDERING: it reads the tool source refs that the `1.15.0`
 * `migrateToolsToFirstClass` migration populates, so it MUST run after that migration persists. */
export async function autoStampToolSources(io) {
  return autoStampSources(io, {
    flagKeyFor: (systemId) => io.toolRoleFlagKey(systemId),
    entriesOf: (system) => system.tools || [],
    uuidOf: (tool) => tool?.originItemUuid || tool?.registeredItemUuid,
  });
}

/** Resolve the existing definition a registered source maps to. A NON-clone source's durable
 * identity flag is authoritative even if the recorded `originItemUuid` drifted: the per-system
 * `roles[system.id].recipeItemDefinitionId` leaf (issue 567) is read FIRST, then the legacy
 * scalar as a transitional fallback. A CLONE's inherited flag belongs to the ORIGINAL and is
 * ignored, so a duplicated source becomes its own definition (issue 555, flow 4b). */
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
  // Union find-existing over the snapshot's full ref set. The snapshot's refs are
  // already clone-gated by `_resolveImportedSourceData` (a clone contributes only its
  // own uuid), so a duplicated source can never collide with the original here — the
  // 4b overwrite stays fixed even with union matching.
  const claimed = new Set(getItemMatchUuids(snapshot));
  if (claimed.size === 0) return null;
  return definitions.find((def) => getItemMatchUuids(def).some((ref) => claimed.has(ref))) || null;
}

// Normalize a name for the name-assisted re-point: trim, collapse internal
// whitespace, and lowercase. Exact (post-normalization) equality only — no fuzzy or
// substring matching. Names are literal snapshot strings captured at registration,
// not localized keys, so a client-language change cannot move the match.
function normalizeMatchName(name) {
  return String(name ?? '')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();
}

// Resolve a definition by exact name, unique WITHIN the per-system definition set passed
// in (recipe-item repair is per-system since issue 567, so the caller only ever hands
// this ONE system's `kind.definitions`). Returns the single match, `'ambiguous'` when two
// or more of that system's definitions share the name, or `null` when none match. A source
// registered in two systems is reconciled independently in each, so name uniqueness is
// scoped to the system being reconciled, never global.
function uniqueDefinitionByName(name, definitions) {
  const normalized = normalizeMatchName(name);
  if (!normalized) return null;
  const matches = definitions.filter((def) => normalizeMatchName(def?.name) === normalized);
  if (matches.length === 0) return null;
  if (matches.length >= 2) return 'ambiguous';
  return matches[0];
}

// Owner resolution for a WORLD / WRITABLE-PACK SOURCE item. Clone-gated: a source
// carrying `_stats.duplicateSource` is a sidebar-Duplicate, so it must NOT be
// identity-matched onto the ORIGINAL through its inherited `compendiumSource` (the
// self-corruption hazard — it would be stamped with the original's id). A clone
// keys on its own uuid only; a non-clone keys on uuid + compendium source.
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

// Owner resolution for an ACTOR-OWNED item, returning `{definition, tier}`. NO
// clone-gate: an owned copy legitimately carries `duplicateSource` (Foundry stamps it
// on drag-drop) and its `compendiumSource` is real provenance, so it resolves through
// the ordinary runtime matchers — the four-tier recipe-item matcher (which surfaces the
// tier), or the component source matcher (`tier: null`).
function resolveOwnedRepairOwner(item, kind) {
  if (kind.bucket === 'recipeItems') {
    return matchRecipeItemDefinition(item, kind.definitions, kind.systemId);
  }
  // A first-class Tool carries its OWN identity, so it MUST resolve through the Tool
  // resolver — routing the tools bucket through the component resolver would mis-resolve
  // it via component legacy-scalar logic (issue 561, D-F(repair) / A9).
  if (kind.bucket === 'tools') {
    const definition = resolveToolForItem(item, kind.definitions, kind.systemId);
    return { definition, tier: null };
  }
  const definition = resolveComponentForItem(item, kind.definitions, kind.systemId);
  return { definition, tier: null };
}

/** Write the durable identity onto ONE item given its already-resolved owner definition, shared
 * by the world/pack-source and actor-owned passes for both kinds. Strips a lingering
 * `_stats.duplicateSource` when an owner is found, stamps the kind's durable flag, and clears a
 * stale flag when the item sources nothing; writes stay conditional. */
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

/** Reconcile ONE actor-owned item for one kind. A flagged owned copy is authoritative and left
 * untouched; otherwise it resolves through the ordinary runtime matcher and, for recipe items
 * only, may be re-pointed by name when an unflagged copy's name uniquely matches a DIFFERENT
 * definition than its `duplicateSource` names. This never triggers a learn. */
async function repairOwnedItem(item, kind, summary, auditLog) {
  if (!item || typeof item.update !== 'function') return;
  // A flagged owned copy already carries its identity-of-record — authoritative,
  // left exactly as-is (no re-point, no strip, no learn).
  if (getFabricateFlag(item, kind.flagKey, null)) return;

  const { definition, tier } = resolveOwnedRepairOwner(item, kind);

  // Components, and recipe items matched by a RELIABLE tier (durable flag / own uuid /
  // compendium source), are stamped directly to the resolved owner.
  if (kind.bucket !== 'recipeItems' || (definition && tier !== 'duplicate')) {
    await repairSourceItem(item, definition, kind, summary);
    return;
  }

  // Recipe item matched ONLY via tier 4 (duplicateSource), or unmatched. Tier 4 is the
  // unreliable signal at the heart of issue 555, so an owned copy here is only stamped
  // when its NAME confirms an identity. Without a duplicateSource there is nothing to
  // re-point against, so stamp whatever (if anything) matched.
  if (!getDuplicateSourceUuid(item)) {
    await repairSourceItem(item, definition, kind, summary);
    return;
  }

  const byName = uniqueDefinitionByName(item?.name, kind.definitions);
  if (byName === 'ambiguous') {
    // A name matching two or more definitions cannot be safely resolved — leave the
    // copy untouched (it stays a tier-4 fallback, which R5 refuses for bulk auto-learn).
    summary.skippedAmbiguous += 1;
    return;
  }
  if (!byName) {
    // No name confirmation for a tier-4-only copy — leave it as-is.
    return;
  }
  // The copy's name uniquely names a definition. When that differs from the one its
  // duplicateSource resolves to, it is a re-point (the duplicated-scroll-mislabelled
  // case); log an auditable, reversible record. When it confirms the same definition,
  // stamp it without counting a re-point.
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

/**
 * The source reference a DEFINITION owns, for resolving its own authoritative
 * document. Prefers the live registered uuid, then the canonical origin uuid, then
 * any recorded alias. Distinct from the item-driven repair walk, which starts from
 * an ITEM and asks which definition claims it.
 */
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

/** Record one skipped description against BOTH the split reason counter and the flat `skipped`
 * total. The split exists so a GM can tell a broken source link, their problem to fix, from a
 * source that simply has no description. */
function countSkippedDescription(summary, reason) {
  summary.descriptions[reason] += 1;
  summary.descriptions.skipped += 1;
}

/**
 * DEFINITION-DRIVEN description refresh, run as part of {@link repairItemData}. It shares the
 * button, the `_assertGM` gate and the summary object with the identity repair, but deliberately
 * NOT its traversal: the item-driven walk SKIPS LOCKED PACKS, because identity repair writes
 * flags into pack items, whereas descriptions only READ through the uuid resolver — and a locked
 * system pack is exactly where the reported raw `@UUID[Compendium.…]` lives. Riding the item walk
 * would also invert authority, making an actor-owned COPY a candidate writer of the DEFINITION's
 * description. Tools are excluded by design, because a tool snapshot carries no description.
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

  // Sweep 1 — resolve each definition's OWN source document and collect its raw
  // description. Doing this up front is what makes priming correct: the enricher
  // cache is warmed ONCE from every reference in the world, instead of core's
  // per-`enrichHTML` priming costing one round-trip per description.
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
      // The item, its pack, or the module that provided it is gone. Distinct from a
      // blank source below, because THIS one is actionable by the GM.
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
    // Never let a source with no description at all WIPE text a definition already
    // carries — that would be data loss dressed up as a repair. Pinned by
    // `tests/repair-item-data.test.js`; deleting this guard must fail that test.
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
 * The per-system repair KINDS. Components, tools, AND recipe items all resolve PER SYSTEM: their
 * definition ids are not globally unique (copy-import preserves component ids; recipe-item ids are
 * generated against a per-system uniqueness set), and each durable identity is a per-system map key
 * `roles.<systemId>.<role>`. A per-system kind means each system's pass reads and writes ONLY its
 * own leaf, so a non-owning system's null-owner pass finds its leaf unset and no-ops — it can never
 * clear another system's identity, regardless of `getSystems()` order (issue 556 Fix 2, extended to
 * recipe items by issue 567).
 */
function buildRepairKinds(io) {
  const kinds = [];
  for (const system of io.getSystems()) {
    // A dotted (unsafe) system id cannot serve as a `roles` map key, so the WHOLE system is
    // skipped — tools and recipe items included, because all three key derivations gate on the
    // same id check. Its definitions still resolve via raw refs. Fresh ids are validated at
    // creation/import.
    const flagKey = io.componentRoleFlagKey(system.id);
    if (!flagKey) continue;
    // DELIBERATELY NOT REPOINTED at issue 1370: the subject of the restamp is the PERSISTED
    // record whose durable identity is being repaired, not a merged read row.
    kinds.push({
      bucket: 'components',
      flagKey,
      systemId: system.id,
      definitions: system.components || [],
      refExtractor: (def) => getItemMatchUuids(def),
    });
    // First-class Tools are ALSO a per-system kind (issue 561): each system's pass reads
    // and writes ONLY its own `roles.<systemId>.toolId` leaf. Item-sourced tools reconcile
    // via their own source references (owned copies through `resolveToolForItem`).
    const toolFlagKey = io.toolRoleFlagKey(system.id);
    if (toolFlagKey) {
      // DELIBERATELY NOT REPOINTED at issue 1370, for the same reason as the component kind
      // above. A tool with no source refs is filtered OUT, unlike the other two kinds.
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
    // Recipe items are ALSO a per-system kind (issue 567), so a shared source registered in
    // two systems keeps a durable claim in each and neither clobbers the other.
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

/** The repair summary before the walk: flat totals kept for back-compat with the
 * component-source repair contract, a per-bucket split, and the issue 800 description bucket. */
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
    // Description refresh outcomes (issue 800), deliberately a bucket of its own so the identity
    // counts above keep their existing meaning. Tools are excluded because first-class Tool source
    // snapshots are captured at registration/relink and deliberately do not auto-refresh.
    // `skipped` is the flat total; `skippedUnresolved` (source item/pack/module gone — actionable)
    // and `skippedEmpty` (source resolved but carries no description) split it by cause.
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
 * GM maintenance ("Repair Item Data"): reconcile EVERY PROJECTION of a definition's resolved
 * source document — durable identity and derived display snapshots alike.
 *
 * The identity leg is item-driven: every component, tool and recipe-item definition's identity
 * is reconciled across world items, writable packs and actor-owned items. World/pack SOURCE
 * items are strip-and-stamped with a clone-gated identity, so a duplicated source becomes its
 * own definition; actor-owned copies resolve through the ordinary runtime matchers and, for
 * recipe items, a guardrailed name-assisted re-point. Locked packs are skipped, synthetic and
 * compendium-resident actors are never scanned, and nothing triggers a learn.
 *
 * The description leg is definition-driven (issue 800): each definition resolves its OWN source
 * reference, including sources in LOCKED packs, and its stored description is refreshed to the
 * enricher-resolved plain text. See {@link refreshDefinitionDescriptions}.
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

  // Actor-owned copies. Guarded exactly like the world-item and pack thunks above, so a world
  // with no `actors` collection (e.g. the pure-logic test harness) is a clean no-op.
  for (const actor of io.actors()) {
    const items = actor?.items ? [...actor.items] : [];
    for (const item of items) {
      summary.scanned += 1;
      for (const kind of kinds) {
        await repairOwnedItem(item, kind, summary, summary.repointLog);
      }
    }
  }

  // Description leg — definition-driven, unaffected by `includeCompendiums` and by
  // `pack.locked` (it reads through the uuid resolver rather than writing into packs).
  const descriptionsChanged = await refreshDefinitionDescriptions(io, summary);
  if (descriptionsChanged) {
    await io.persistItemMetadata();
  }

  return summary;
}
