/** Manages crafting systems and their item libraries */
import {
  getFabricateFlag,
  setFabricateFlag,
  FABRICATE_FLAG_NAMESPACE,
  isSafeFlagKeySegment,
} from '../config/flags.js';
import {
  cleanupStalePreferences,
  isGatheringActorSelectableByUser,
} from '../config/preferencesCleanup.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { migrateRecipeForModeChange } from '../migration/migrateRecipeForModeChange.js';
import { deriveToolSourceFromComponents } from '../migration/migrateToolsToFirstClass.js';
import { normalizeQuantityFormula } from '../models/Result.js';
import { Tool, TOOL_BREAKAGE_MODES as TOOL_BREAKAGE_MODE_LIST } from '../models/Tool.js';
import { normalizeSelectionIds } from '../utils/bulkSelectionModel.js';
import { normalizeCategoryIconMap } from '../utils/categoryIcons.js';
import { authoredCheckModifierIds } from '../utils/checkModifierPicks.js';
import {
  normalizeComponentCategory,
  normalizeCustomComponentCategories,
} from '../utils/componentCategories.js';
import { authoredComplications } from '../utils/componentComplications.js';
import { parsePlainDiceGroups, parseDiceGroups } from '../utils/craftingCheckExpression.js';
import {
  advanceDefinitionRevision,
  findById,
  getDefinitionIndex,
  indexedMembershipLookups,
} from '../utils/definitionIndex.js';
import { normalizeFailureResultPolicy } from '../utils/failureResultPolicy.js';
import { plainTextDescription, descriptionTextCandidate } from '../utils/plainTextDescription.js';
import {
  normalizeCustomRecipeCategories,
  normalizeRecipeCategory,
} from '../utils/recipeCategories.js';
import {
  recipeLostItsShape,
  recipeReferencesAnyComponent,
  recipeReferencesComponent,
  stripComponentsFromRecipeJson,
} from '../utils/recipeComponentReferences.js';
import {
  buildLearnedRecipeActorIndex,
  planRecipeItemMembershipPrune,
  selectLearnerActorIds,
} from '../utils/recipeDeleteImpact.js';
import { recipeReferencesEssence } from '../utils/recipeEssenceReferences.js';
import {
  recipeItemDefinitionsContaining,
  resolveLegacyMembershipDefinition,
} from '../utils/recipeItemMembership.js';
import { resolveRecipeCheckTierOptions } from '../utils/routedOutcomeKeywords.js';
import {
  getCompendiumSourceUuid,
  getDuplicateSourceUuid,
  getItemMatchUuids,
  getItemIdentityReferences,
  resolveComponentForItem,
  resolveToolForItem,
  matchRecipeItemDefinition,
} from '../utils/sourceUuid.js';

import { normalizeCharacterPrerequisiteList } from './characterPrerequisites.js';
import {
  normalizeModifierPolicy,
  resolveActiveCraftingCheckFormula,
  resolveMaxModifierPicks,
} from './checkModifierResolver.js';
import {
  craftingDataChange,
  domainsForRecord,
  emitCraftingDataChanged,
  PendingChangeDomains,
} from './craftingDataChange.js';
import { applyDefinitionChange } from './CraftingDefinitionRepository.js';
import { normalizeGatheringRealmSettings } from './gatheringRealms.js';
import { ALL_INVALIDATION_DOMAINS, domainsForSystemFields } from './invalidationDomains.js';
import { normalizeModifierLibrary } from './modifierLibrary.js';
import { runGatedMutationCleanup } from './mutationCleanupComposition.js';
import { normalizePreviewSandbox } from './progressiveCheckSandbox.js';
import { RecipeActivationError } from './RecipeActivationError.js';
import { RecipePersistenceError } from './RecipePersistenceError.js';
import { resolvedComponentEssencesById } from './resolvedComponentEssences.js';
import {
  corpusDelta,
  patchCorpusInPlace,
  REVISION_SCOPES,
  RevisionRegistry,
} from './revisionTokens.js';
import { resolveScopedEntityRead } from './scopedEntityReads.js';
import { SettingsCraftingDefinitionRepository } from './SettingsCraftingDefinitionRepository.js';
import { SignatureValidator } from './SignatureValidator.js';
import { WHOLE_CORPUS_ID_BASIS } from './startupMaintenance.js';
import { hasPendingWorldScopeRekey } from './worldScopeRekeyPending.js';

// Membership sets derived from the canonical Tool model vocabularies, so the
// system-owned tool normalizer enforces the exact same enumerations as the Tool
// model and the adminStore editor without duplicating the literal lists.
const TOOL_BREAKAGE_MODES = new Set(TOOL_BREAKAGE_MODE_LIST);
const MISSING_SOURCE_FLAG = Symbol('missing-source-flag');

// The invalidation-domain attributions every `save()` site names (issue 1078 part B1). Derived
// from the FIELD map rather than by listing domains, so a local mutation and its replicated copy
// cannot be classified differently, and hoisted because a per-call-site derivation is both
// allocation on a write path and repeated code the duplication gate counts.
const COMPONENT_FACTS = domainsForSystemFields(['components']);
const TOOL_FACTS = domainsForSystemFields(['tools']);
const RECIPE_ITEM_FACTS = domainsForSystemFields(['recipeItemDefinitions']);
// A component delete also rewrites the essence definitions that pointed at it, and an essence
// delete strips the essence from every component: one attribution serves both directions.
const ESSENCE_FACTS = domainsForSystemFields(['essenceDefinitions', 'components']);
// `repairItemData` refreshes definition names, images and descriptions for BOTH libraries.
const ITEM_METADATA_FACTS = domainsForSystemFields(['components', 'tools']);

/** Resolve an injected store seam, whether supplied as the store itself or as a lazy getter.
 * Lazy is the production shape, because `game.fabricate` is unpopulated at construction. TOTAL:
 * a getter that throws answers `null`, an UNKNOWN basis, rather than taking the normalizer down
 * (the issue-970 failure mode). */
function _resolveStoreSeam(seam) {
  if (!seam) return null;
  try {
    return typeof seam === 'function' ? (seam() ?? null) : seam;
  } catch {
    return null;
  }
}

/** One scope store's published corpus, or `null` when there is no readable world half.
 * `_resolveStoreSeam` catches a throwing GETTER; this also catches a throwing `corpus()`, so the
 * manager spelling degrades exactly as the module spelling does. `## Scoped Entity Definitions`
 * requirement 16: an UNREADABLE world half must answer the in-system array ITSELF. */
function _resolveStoreCorpus(seam) {
  try {
    return _resolveStoreSeam(seam)?.corpus?.() ?? null;
  } catch {
    return null;
  }
}

/** The Valid Id Basis for ONE world-scope entity type (issue 1359): the union of the world roster
 * and the system's surviving in-system array, or `null` when neither can vouch for an id. The
 * world half counts when `isSeeded('entities')`, the legacy half only when NON-EMPTY, and it is
 * NOT MEMBERSHIP-FILTERED, because an absent membership record is a REFUSAL, never a PRUNE. */
function _scopeEntityBasis(store, legacy) {
  const seeded = store?.isSeeded?.('entities') === true;
  const legacyList = Array.isArray(legacy) && legacy.length > 0 ? legacy : null;
  if (!seeded && !legacyList) return null;
  const ids = _idSet(legacyList ?? []);
  if (seeded) for (const id of store.entityIds()) ids.add(id);
  return ids;
}

/** The Valid Id Basis for ONE CATEGORY VOCABULARY, and the sharpest of the seven prune sites: the
 * migration empties `system.componentCategories`, so an ungated prune deletes EVERY authored
 * category icon permanently. It DELIBERATELY DOES NOT READ `fabricate.worldVocabulary`, because
 * nothing keys an icon map on a world category (`## World Vocabulary` requirement 6). */
function _vocabularyBasis(vocabulary) {
  return vocabulary.length > 0 ? vocabulary : null;
}

/** The names an icon map's entries may carry, given its vocabulary basis. With a KNOWN basis this
 * is the reserved `general` bucket plus the vocabulary; with an UNKNOWN one it is the map's OWN
 * keys, so `normalizeCategoryIconMap` still lower-cases every key and sanitizes every icon value
 * while PRUNING NOTHING. */
function _iconAllowance(icons, vocabulary) {
  if (vocabulary !== null) return ['general', ...vocabulary];
  return icons && typeof icons === 'object' && !Array.isArray(icons) ? Object.keys(icons) : [];
}

/** The Valid Id Basis for ONE library: the union of the world list and the system's surviving
 * legacy copy, or `null` when neither can vouch for an id. PER LIBRARY, because the two are
 * independent, and a legacy copy counts only when NON-EMPTY, because every pre-1308 save emitted
 * an empty array that vouches for nothing while licensing a full prune. */
function _libraryBasis(store, key, readWorld, legacy) {
  const seeded = store?.isSeeded?.(key) === true;
  const legacyList = Array.isArray(legacy) && legacy.length > 0 ? legacy : null;
  if (!seeded && !legacyList) return null;
  return _idSet(seeded ? readWorld() : [], legacyList ?? []);
}

/** The trimmed ids of every entry across the given lists, as one Set. */
function _idSet(...lists) {
  const ids = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (id) ids.add(id);
    }
  }
  return ids;
}

export class CraftingSystemManager {
  /** `seams` injects the Foundry-facing collaborators (issue 800); every default is a safe
   * pass-through, so the ~87 single-argument construction sites keep working. `enrichToHtml`
   * defaults to a pass-through because `enrichHTML` cannot run under happy-dom, which is what
   * keeps the headless suites honest rather than mocked. */
  constructor(recipeManager, seams = {}) {
    this.recipeManager = recipeManager;
    this.systems = new Map();
    this.initialized = false;
    // The revision-token registry this manager mints from (issue 1076). Per manager, never
    // a module singleton.
    this._revisions = new RevisionRegistry();
    // The unconsumed delta from the most recent `reload()` (issue 1078), read once through
    // `consumeReloadDelta()`.
    /** @type {import('./revisionTokens.js').CorpusDelta|null} */
    this._reloadDelta = null;
    // The invalidation domains attributed since the last announcement (issue 1078 part B1).
    // Recorded by `save({domains})`, drained by `_notifySystemsChanged`.
    this._pendingDomains = new PendingChangeDomains();
    // Shares THIS map rather than mirroring it, hydrating through `_normalizeSystem`. That
    // normalizer is a WHITELIST REBUILD, so the repository must call it rather than carry any
    // approximation of the persisted shape.
    this._repository = seams.repository ?? this._buildDefaultRepository();
    this._enrichToHtml = seams.enrichToHtml ?? ((text) => text);
    this._primeEnricherCache = seams.primeEnricherCache ?? (async () => {});
    // Active-GM gate for the un-versioned legacy recipe-item backfill. Defaults to a globals
    // probe so a real player client is gated without wiring, while unit fixtures keep migrating
    // because `activeGM` is undefined there.
    this._isActiveGM =
      seams.isActiveGM ??
      (() => globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id);
    // Issue 1308: the WORLD character libraries, which since the move are the source of the two
    // id sets this manager prunes references against. Optional by design — a fixture that
    // injects none gets an UNKNOWN basis and prunes nothing, which is the safe direction. See
    // `_characterLibraryBasis`.
    this._characterLibrariesStore =
      seams.characterLibrariesStore ??
      (() => globalThis.game?.fabricate?.getCharacterLibrariesStore?.() ?? null);
    // The three WORLD-SCOPE entity stores (issue 1359), optional by design: a fixture injecting
    // none gets an UNKNOWN basis and prunes nothing. Each defaults to a LAZY getter, and the
    // accessors are deliberately NOT `_requireReady()`-gated, because optional chaining absorbs
    // an absent accessor but not a throw.
    this._componentScopeStore =
      seams.componentScopeStore ??
      (() => globalThis.game?.fabricate?.getComponentScopeStore?.() ?? null);
    this._essenceScopeStore =
      seams.essenceScopeStore ??
      (() => globalThis.game?.fabricate?.getEssenceScopeStore?.() ?? null);
    this._toolScopeStore =
      seams.toolScopeStore ?? (() => globalThis.game?.fabricate?.getToolScopeStore?.() ?? null);
  }

  /** Resolve the injected character-libraries store, supplied either as the store or as a lazy
   * getter — lazy being the production shape, because `game.fabricate` is unpopulated here. */
  _resolveCharacterLibrariesStore() {
    return _resolveStoreSeam(this._characterLibrariesStore);
  }

  /** Build the VALID ID BASIS for one system's reference pruning, RETURNING `null` for each set
   * it cannot know to be complete, per `DOMAIN.md`'s Valid Id Basis rule. The basis is a UNION of
   * the world library and the surviving legacy copy, which before the 1.28.0 migration IS the
   * live corpus; it is NOT a `migrationVersion` check, which `DOMAIN.md` forbids. An empty world
   * library is not enough to prune on, so the store keeps raw key presence. */
  _characterLibraryBasis(system) {
    const store = this._resolveCharacterLibrariesStore();
    return {
      prerequisiteIds: _libraryBasis(
        store,
        'characterPrerequisites',
        () => store.listCharacterPrerequisites(),
        system?.characterPrerequisites
      ),
      modifierIds: _libraryBasis(
        store,
        'modifiers',
        () => store.listModifiers(),
        system?.modifiers
      ),
    };
  }

  /** Build the VALID ID BASIS for one system's WORLD-SCOPE reference pruning (issue 1359), plus
   * the two vocabularies the icon maps are pruned against, RETURNING `null` for each basis it
   * cannot know complete. NO CALL SITE MAY DEFAULT ONE TO `new Set()`, so `validEssenceIds` is
   * `Set|null` and the `instanceof Set` test downstream is LOAD-BEARING. */
  _scopeBasis(system) {
    return {
      componentIds: _scopeEntityBasis(
        _resolveStoreSeam(this._componentScopeStore),
        system?.components ?? system?.managedItems ?? system?.items
      ),
      essenceIds: _scopeEntityBasis(
        _resolveStoreSeam(this._essenceScopeStore),
        system?.essenceDefinitions ?? system?.essences
      ),
      toolIds: _scopeEntityBasis(_resolveStoreSeam(this._toolScopeStore), system?.tools),
      componentCategories: _vocabularyBasis(
        normalizeCustomComponentCategories(system?.componentCategories)
      ),
      recipeCategories: _vocabularyBasis(normalizeCustomRecipeCategories(system?.categories)),
    };
  }

  /** THE READ UNION for one system's components (issue 1359): the world components it is a MEMBER
   * of, unioned with its surviving in-system array, world winning on an id collision.
   * `_normalizeSystem` still emits `components` and `## CraftingSystem` requirement 36 keeps that
   * array authoritative. MEMOIZED on `(world corpus, system array)`, never on a system id. */
  resolveScopedComponents(system) {
    return this._resolveScopedUnion(system, this._componentScopeStore, 'components');
  }

  /** THE READ UNION for one system's essence definitions. See {@link resolveScopedComponents}. */
  resolveScopedEssences(system) {
    return this._resolveScopedUnion(system, this._essenceScopeStore, 'essenceDefinitions');
  }

  /** THE READ UNION for one system's tools. See {@link resolveScopedComponents}. */
  resolveScopedTools(system) {
    return this._resolveScopedUnion(system, this._toolScopeStore, 'tools');
  }

  /** The shared body of the three read unions, delegating to the ONE implementation in
   * `scopedEntityReads.js` rather than mirroring it: delegating only the BUILD would leave the
   * manager spelling reallocating and blanking an id-less record while the module spelling passed
   * every arm of the unknown-half rule. */
  _resolveScopedUnion(system, seam, field) {
    const record = typeof system === 'string' ? this.getSystem(system) : system;
    return resolveScopedEntityRead(record, _resolveStoreCorpus(seam), field);
  }

  /** The repository this manager builds when the caller injects none — the ONE place the
   * crafting-system backend is chosen (issue 1089). */
  _buildDefaultRepository() {
    return new SettingsCraftingDefinitionRepository({
      settingKey: SETTING_KEYS.CRAFTING_SYSTEMS,
      corpus: () => this.systems,
      hydrate: (raw) => this._normalizeSystem(raw),
      serialize: (system) => system,
    });
  }

  async initialize() {
    if (this.initialized) return;
    // Hydration runs inside the repository (issue 1089), so `loadAll()` returns
    // already-normalized systems.
    for (const normalized of await this._repository.loadAll()) {
      this.systems.set(normalized.id, normalized);
    }
    await this._migrateLegacyRecipeItems();
    this.initialized = true;
  }

  _assertGM(action) {
    if (!game.user?.isGM) {
      throw new Error(`GM permissions required: ${action}`);
    }
  }

  /** Reject a crafting-system id that cannot serve as a durable-flag map key: the identity flag is
   * `roles.<systemId>.componentId`, so a dotted id is nested by `expandObject` on write and
   * silently missed by the reader. Fails LOUDLY at the entry point, and the id is NEVER rewritten,
   * because recipes, tools and gathering config all reference the system by it. */
  _assertValidSystemId(id) {
    if (!isSafeFlagKeySegment(id)) {
      throw new Error(
        `Invalid crafting system id "${id}": a system id must match /^[A-Za-z0-9_-]+$/ (no dots or spaces), because it is used as a durable-flag map key.`
      );
    }
  }

  /** The durable per-system component identity flag key `roles.<systemId>.componentId`, or `null`
   * when `systemId` is not a safe dotted-path segment. A null result means a stamp/clear/repair
   * site must NOT write; the component still resolves through the raw-reference fall-through. */
  _componentRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.componentId` : null;
  }

  /** The durable per-system TOOL identity flag key `roles.<systemId>.toolId` (issue 561), or
   * `null` for an unsafe id. An additive SIBLING of the component leaf, so a whetstone that is
   * both carries both and clearing one never touches the other. */
  _toolRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.toolId` : null;
  }

  /** The durable per-system RECIPE-ITEM identity flag key
   * `roles.<systemId>.recipeItemDefinitionId` (issue 567), or `null` for an unsafe id — the third
   * additive SIBLING, so clearing one system's leaf never touches another's. */
  _recipeItemRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.recipeItemDefinitionId` : null;
  }

  _normalizeSystem(system = {}) {
    const systemId = system.id || foundry.utils.randomID();
    const features = this._normalizeFeatures(system);
    const essenceDefinitions = this._normalizeEssenceDefinitions(
      system.essenceDefinitions ?? system.essences
    );
    const recipeItemDefinitions = this._normalizeRecipeItemDefinitions(
      system.recipeItemDefinitions ?? system.recipeItems
    );
    // Normalize the shared prerequisite library before Tools so every payload path applies the
    // same ID invariant. Both libraries are WORLD scope (issue 1308), so the basis comes from
    // `_characterLibraryBasis` and either half may be `null`; deriving it from
    // `system.characterPrerequisites` alone would strip every tool prerequisite on an unmigrated world.
    const { prerequisiteIds: validToolPrerequisiteIds, modifierIds: validCatalogueIds } =
      this._characterLibraryBasis(system);
    const _legacyModifiers = normalizeModifierLibrary(system.modifiers);
    const _legacyCharacterPrerequisites = normalizeCharacterPrerequisiteList(
      system.characterPrerequisites,
      () => foundry.utils.randomID()
    );
    // Issue 1359: the WORLD-SCOPE Valid Id Basis, derived from the RAW system so the legacy half
    // is judged on what was actually stored. `essenceIds` is `Set|null` from here on and MUST NOT
    // be defaulted to an empty Set. The essence half is derived from the ALREADY-NORMALIZED
    // definitions, because that is precisely the set this pass used to prune against.
    const scopeBasis = this._scopeBasis({ ...system, essenceDefinitions });
    const essenceIds = scopeBasis.essenceIds;
    // Salvage-normalization context (issue 764), HOISTED above the component map so the
    // Simple-mode group-count clamp in `_normalizeSalvage` sees the owning system's mode
    // and Simple check formula flag. Both derivations are component-independent, so
    // hoisting is safe; the return literal below reuses `salvageResolutionMode`.
    const { salvageResolutionMode, salvageSimpleCheckHasFormula } =
      this._salvageNormalizationContext(system);
    // The ONE system-level modifier library (issue 1117), HOISTED above the three activity checks
    // because each of their selections is validated against it. It has moved twice and is NOT read
    // from either old location here: the migrations and the export-payload upcast are the paths a
    // legacy payload arrives through, and a silent read-alias would make the relocation unobservable.

    const rawManagedItems = Array.isArray(system.components)
      ? system.components
      : Array.isArray(system.managedItems)
        ? system.managedItems
        : system.items;
    const items = Array.isArray(rawManagedItems)
      ? rawManagedItems.map((i) =>
          this._normalizeComponent(i, {
            validEssenceIds: essenceIds,
            salvageResolutionMode,
            salvageSimpleCheckHasFormula,
          })
        )
      : [];
    const itemIds = new Set(items.map((i) => i.id));
    const itemById = new Map(items.map((i) => [i.id, i]));

    // First-class Tools (issue 561): a component-linked tool derives its source refs and snapshot
    // from its linked component here, so it matches owned items by SOURCE and not just by name.
    // Item-sourced and already-derived tools are left untouched, and it runs after component
    // normalization so `items` is the resolved set.
    const normalizedTools = Array.isArray(system.tools)
      ? system.tools.map((t) =>
          this._normalizeTool(t, { validPrerequisiteIds: validToolPrerequisiteIds })
        )
      : [];
    for (const normalizedTool of normalizedTools) {
      if (deriveToolSourceFromComponents(normalizedTool, items) && !normalizedTool.description) {
        normalizedTool.description = itemById.get(normalizedTool.componentId)?.description || '';
      }
    }

    const resolvedEssenceDefinitions = essenceDefinitions.map((def) => {
      const sourceComponentId =
        def.sourceComponentId ||
        def.associatedSystemItemId ||
        (itemIds.has(def.sourceItemUuid) ? def.sourceItemUuid : null);
      const sourceComponent = sourceComponentId ? itemById.get(sourceComponentId) || null : null;
      // A source component not in `items` used to answer `null` unconditionally, which is only
      // sound when the component basis is KNOWN: otherwise the id may name a component this
      // client cannot see, and nulling the authored uuid is a silent, persisted deletion. An
      // unknown basis is a licence to keep, never a licence to emit junk.
      const sourceItemUuid = sourceComponentId
        ? sourceComponent?.originItemUuid ||
          sourceComponent?.registeredItemUuid ||
          (scopeBasis.componentIds === null && this._looksLikeDocumentUuid(def.sourceItemUuid)
            ? def.sourceItemUuid
            : null)
        : this._looksLikeDocumentUuid(def.sourceItemUuid)
          ? def.sourceItemUuid
          : null;
      return {
        ...def,
        sourceComponentId,
        sourceItemUuid,
        associatedSystemItemId: sourceComponentId, // transitional alias kept in sync
      };
    });

    return {
      id: systemId,
      name: system.name || 'New Crafting System',
      description: system.description || '',
      enabled: system.enabled !== false,
      resolutionMode: (function _normalizeResolutionMode(raw) {
        if (raw === 'cauldron') return 'alchemy'; // T-189: legacy alias
        // Legacy mode TOKEN aliases for un-migrated or imported data — token renames only, since
        // the legacy routing algorithms are gone. `mapped` → `routedByIngredients`, `tiered` →
        // `routedByCheck`, and a bare `routed` predates the split and cannot pick a basis on read,
        // so it falls back to `routedByIngredients`, matching the 1.9.0 migration's tie-break.
        if (raw === 'mapped' || raw === 'routed') return 'routedByIngredients';
        if (raw === 'tiered') return 'routedByCheck';
        return [
          'simple',
          'routedByIngredients',
          'routedByCheck',
          'progressive',
          'alchemy',
        ].includes(raw)
          ? raw
          : 'simple';
      })(system.resolutionMode),
      // New spec-first shape
      features,
      itemTags: this._normalizeStringList(system.itemTags ?? system.tags),
      // Flat system-level visibility strategy (issue 511, PR-B): the single enum
      // that gates the whole Crafting authoring surface. `recipeVisibility` is
      // kept alongside it for its residual `knowledge.learn.dragDropEnabled`.
      visibilityMode: this._normalizeVisibilityMode(system.visibilityMode),
      recipeVisibility: this._normalizeRecipeVisibility(system.recipeVisibility),
      requirements: this._normalizeRequirements(system.requirements),
      essenceDefinitions: resolvedEssenceDefinitions,
      recipeItemDefinitions,
      // Which basis resolves recipe-book membership for THIS system (issue 1011). Monotonic, and
      // backfilled as a monotone OR over the PERSISTED value, because a bare `some(...)` would
      // flip the basis back the moment `reload()` saw the last array emptied.
      membershipResolvesByRecipeIds:
        system.membershipResolvesByRecipeIds === true ||
        recipeItemDefinitions.some(
          (def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0
        ),
      // A SURVIVING LEGACY COPY IS CARRIED THROUGH; THE MIGRATION IS THE ONLY THING THAT REMOVES
      // IT (issue 1308). Migrations run on the ACTIVE GM alone, so every player hydrates through
      // this normalizer while the world setting is unwritten, and `upsertTool` derives its own
      // Valid Id Basis from the NORMALIZED record.
      ...(_legacyModifiers.length > 0 && { modifiers: _legacyModifiers }),
      craftingCheck: this._normalizeCraftingCheck(system.craftingCheck, validCatalogueIds),
      // Canonical salvage mode, derived above with the salvage-normalization context
      // (issue 764) so the component map and this field agree on one value.
      salvageResolutionMode,
      // Tool-breakage authority (issue 419), ABSENCE-PRESERVING SINCE 1.30.0 (issue 1363):
      // substituting `toolSpecific` for anything missing made the WORLD half of
      // `resolveToolBreakageAuthority` unreachable. Every value already on disk is treated as
      // AUTHORED (`## Scoped Entity Definitions` `### Tool scope` requirement 5).
      ...(function _normalizeToolBreakageAuthority(raw) {
        return ['toolSpecific', 'checkDriven'].includes(raw?.authority)
          ? { toolBreakage: { authority: raw.authority } }
          : {};
      })(system.toolBreakage),
      salvageCraftingCheck: this._normalizeSalvageCraftingCheck(
        system.salvageCraftingCheck,
        validCatalogueIds
      ),
      gatheringCraftingCheck: this._normalizeGatheringCraftingCheck(
        system.gatheringCraftingCheck,
        validCatalogueIds
      ),
      alchemy: this._normalizeAlchemyConfig(
        system.alchemy ?? system.cauldron,
        system.resolutionMode
      ),
      teaserConfig: this._normalizeTeaserConfig(system.teaserConfig),

      // Canonical, system-owned COMPONENT category vocabulary (issue 676), a sibling of the recipe
      // `categories` vocabulary and deliberately NOT an alias: canonical spec forbids merging,
      // aliasing or cross-populating the two. The reserved `general` bucket is implied, never
      // persisted. This is the SAME normalized list the vocabulary basis was derived from.
      componentCategories: scopeBasis.componentCategories ?? [],

      // Per-category icons (issue 689). Each map is pruned against its OWN vocabulary, which
      // `## CraftingSystem` requirement 6b forbids merging, and GATED ON THE VOCABULARY BASIS
      // (issue 1359), because this rebuild is a whitelist and an ungated prune would delete every
      // authored icon PERMANENTLY.
      categoryIcons: normalizeCategoryIconMap(
        system.categoryIcons,
        _iconAllowance(system.categoryIcons, scopeBasis.recipeCategories)
      ),
      componentCategoryIcons: normalizeCategoryIconMap(
        system.componentCategoryIcons,
        _iconAllowance(system.componentCategoryIcons, scopeBasis.componentCategories)
      ),

      // Transitional aliases for existing UI code paths
      categories: scopeBasis.recipeCategories ?? [],
      tags: this._normalizeStringList(system.tags ?? system.itemTags),
      essences: resolvedEssenceDefinitions.map((def) => def.id),
      enableTags: true,
      enableEssences: features.essences === true,
      enableCategories: true,
      enableMultiStepRecipes: features.multiStepRecipes === true,
      components: items,
      // Canonical, system-owned library Tools. Populated here so every consumer
      // (`getSystem(id).tools`) — the recipe tool gate, salvage, the canvas
      // interactable browser, item-drop resolution, and gathering composition —
      // reads a single source of truth. Mirrors how `components` is normalized.
      tools: normalizedTools,
      // Carried through on the same rule as the modifier library above, and removed by the same
      // migration.
      ...(_legacyCharacterPrerequisites.length > 0 && {
        characterPrerequisites: _legacyCharacterPrerequisites,
      }),
      // PARTICIPATION ONLY (issue 1282): the realm library is world scope, so it lives in the
      // `travelConfig` setting and this rebuild stops emitting `gatheringRealms`. The omission is
      // destructive by design, because the allowlist rebuild is what removes the stale per-system
      // copy — which is why the 1.27.0 migration must run before any system save.
      gatheringRealmSettings: normalizeGatheringRealmSettings(
        system.gatheringRealmSettings ?? system.gatheringRegionSettings
      ),
    };
  }

  /** Normalize one system-owned library Tool to its canonical persisted shape — the single
   * coercion point, so a Tool from any origin loads the same. A missing `id` gets a fresh
   * `randomID()` and `enabled` defaults to `true`. */
  _normalizeTool(tool = {}, { validPrerequisiteIds = null } = {}) {
    const normalizedTool = !tool || typeof tool !== 'object' ? {} : tool;
    const id = String(normalizedTool.id || foundry.utils.randomID());
    // `label` is the PRE-EXISTING, user-authored display override — distinct from the
    // `name`/`img` display snapshot below and NEVER written by snapshot capture,
    // migration, or refresh (issue 561, R2-2). Preserved untouched here.
    const label = typeof normalizedTool.label === 'string' ? normalizedTool.label.trim() : '';
    const componentId =
      typeof normalizedTool.componentId === 'string' && normalizedTool.componentId.trim()
        ? normalizedTool.componentId.trim()
        : null;
    // First-class tool source refs plus the `name`/`img` display snapshot (issue 561). Unknown-
    // field stripping means these MUST be retained here and in the draft-path twin, or they are
    // silently dropped. New-name-first, legacy-name-tolerant (issue 560).
    const originItemUuid =
      normalizedTool.originItemUuid ||
      normalizedTool.registeredItemUuid ||
      normalizedTool.sourceItemUuid ||
      normalizedTool.sourceUuid ||
      null;
    const registeredItemUuid =
      normalizedTool.registeredItemUuid ||
      normalizedTool.originItemUuid ||
      normalizedTool.sourceUuid ||
      normalizedTool.sourceItemUuid ||
      null;
    const primaryRefs = new Set(
      [registeredItemUuid, originItemUuid].filter((ref) => typeof ref === 'string' && ref.trim())
    );
    const rawAliasItemUuids = Array.isArray(normalizedTool.aliasItemUuids)
      ? normalizedTool.aliasItemUuids
      : Array.isArray(normalizedTool.fallbackItemIds)
        ? normalizedTool.fallbackItemIds
        : null;
    const aliasItemUuids = Array.isArray(rawAliasItemUuids)
      ? [
          ...new Set(
            rawAliasItemUuids
              .filter((ref) => typeof ref === 'string')
              .map((ref) => ref.trim())
              .filter((ref) => ref && !primaryRefs.has(ref))
          ),
        ]
      : [];
    const model = new Tool({
      ...normalizedTool,
      id,
      label,
      componentId,
      registeredItemUuid,
      originItemUuid,
      aliasItemUuids,
      prerequisites: this._normalizeToolPrerequisites(
        normalizedTool.prerequisites,
        validPrerequisiteIds
      ),
    });
    return model.toJSON();
  }

  _normalizeToolPrerequisites(input, validIds = null) {
    const source = input && typeof input === 'object' ? input : {};
    const ids = [
      ...new Set(
        (Array.isArray(source.ids) ? source.ids : [])
          .filter((id) => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => id && (!(validIds instanceof Set) || validIds.has(id)))
      ),
    ];
    return {
      enabled: source.enabled === true && ids.length > 0,
      ids,
      gateMode: source.gateMode === 'bonus' ? 'bonus' : 'usability',
    };
  }

  _normalizeToolRequirement(input) {
    if (input === null || input === undefined) return null;
    if (typeof input !== 'object') return null;
    return {
      formula: typeof input.formula === 'string' ? input.formula : '',
    };
  }

  _normalizeToolBreakage(input) {
    if (input?.mode === 'immune') return { mode: 'limitedUses', maxUses: null };
    const mode = TOOL_BREAKAGE_MODES.has(input?.mode) ? input.mode : 'limitedUses';
    if (mode === 'limitedUses') {
      const raw = input?.maxUses;
      let maxUses = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const numeric = Number(raw);
        maxUses = Number.isFinite(numeric) ? numeric : null;
      }
      return { mode, maxUses };
    }
    if (mode === 'breakageChance') {
      const raw = Number(input?.breakageChance);
      return { mode, breakageChance: Number.isFinite(raw) ? raw : 0 };
    }
    const threshold = Number(input?.threshold);
    return {
      mode,
      formula: typeof input?.formula === 'string' ? input.formula : '',
      threshold: Number.isFinite(threshold) ? threshold : 0,
    };
  }

  _normalizeToolOnBreak(input) {
    return new Tool({ componentId: '_normalizer_', onBreak: input }).onBreak;
  }

  _normalizeFeatures(system = {}) {
    const features = system.features || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(features, k);
    // `complexRecipes` was removed as a feature (#102): recipe-control visibility
    // derives from resolution mode, not a persistent flag. It survives ONLY as a
    // legacy compatibility INPUT that seeds `multiStepRecipes` for old systems
    // saved before the rename; it is no longer emitted as a normalized feature.
    const multiStepEnabled = has('multiStepRecipes')
      ? features.multiStepRecipes === true
      : has('complexRecipes')
        ? features.complexRecipes === true
        : false;
    return {
      recipeCategories: true,
      // Transitional alias
      categories: true,
      itemTags: true,
      essences: has('essences') ? features.essences === true : system.enableEssences === true,
      multiStepRecipes: multiStepEnabled,
      propertyMacros: has('propertyMacros') ? features.propertyMacros === true : false,
      craftingChecks: has('craftingChecks') ? features.craftingChecks === true : false,
      outcomeRouting: has('outcomeRouting') ? features.outcomeRouting === true : false,
      effectTransfer: has('effectTransfer') ? features.effectTransfer === true : false,
      gathering: has('gathering') ? features.gathering === true : false,
      // Salvage is optional, defaulting ON for backward compatibility. When off the subsystem is
      // hidden and skipped, but authored component salvage config is preserved so the toggle is
      // reversible.
      salvage: has('salvage') ? features.salvage === true : true,
      chatOutput: has('chatOutput') ? features.chatOutput === true : true,
      itemPiles: has('itemPiles') ? features.itemPiles === true : false,
      // Whether a player self-cancelling an in-progress craft gets their consumed
      // ingredients + spent currency back (issue 848). Default ON for a forgiving
      // experience, but a GM may forfeit inputs on cancel by setting it false — an
      // explicit false is honoured, mirroring the `features.salvage` default-on toggle.
      refundOnPlayerCancel: has('refundOnPlayerCancel')
        ? features.refundOnPlayerCancel === true
        : true,
    };
  }

  /** The FAILURE-RESULT POLICY (issue 1098) — may a failed check produce a result at all. ONE
   * derivation, THREE callers, each a WHITELIST REBUILD, so a key emitted by two and not the third
   * is dropped from that one activity on the next save. A new system defaults to `perRecord`; an
   * UPGRADED world never sees that default, because the `1.25.0` seed migration writes `never`. */
  _normalizeFailureResultPolicy(value) {
    return normalizeFailureResultPolicy(value);
  }

  _normalizeCraftingCheck(check = {}, validCatalogueIds = null) {
    const outcomes = Array.isArray(check?.outcomes) ? check.outcomes : [];
    const normalizedOutcomes = outcomes
      .map((o) =>
        String(o || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    return {
      enabled: check?.enabled === true,
      // `mode` has a single valid value, `passFail`. The former `tiered`/`namedOutcomes` branch
      // referenced the removed tiered concept and was dead — no authoring surface writes it and
      // no runtime reads `craftingCheck.mode` — so any legacy value collapses to `passFail`.
      mode: 'passFail',
      consumption: {
        consumeIngredientsOnFail: check?.consumption?.consumeIngredientsOnFail !== false,
        // Canonical key is `breakToolsOnFail` (1.7.0 rename of the legacy
        // `consumeCatalystsOnFail`). Read new-then-legacy so pre-migration imports/exports
        // still load; the 1.7.0 migration rewrites persisted worlds to the new key.
        breakToolsOnFail:
          (check?.consumption?.breakToolsOnFail ?? check?.consumption?.consumeCatalystsOnFail) ===
          true,
      },
      // The ORTHOGONAL produce/do-not-produce axis (issue 1098). A sibling of
      // `consumption`, not a member of it: consumption answers what a failed check
      // COSTS, this answers what it PRODUCES.
      failureResultPolicy: this._normalizeFailureResultPolicy(check?.failureResultPolicy),
      progressive: this._normalizeProgressiveCraftingCheck(check?.progressive),
      outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
      routed: this._normalizeRoutedCraftingCheck(check?.routed),
      simple: this._normalizeSimpleCraftingCheck(check?.simple),
      // Crafting's SELECTION over the system-level library (issues 770, 1055, 1095, 1117): the
      // library itself is `system.modifiers`, and what stays here is which entries this activity
      // applies and how they combine. Absent → the `addAll` default with an empty id set.
      ...this._normalizeCheckModifierSelection(check, validCatalogueIds),
    };
  }

  /** Normalize ONE activity check's selection over the system catalogue (issue 1095). ONE
   * derivation, three callers, each an allowlist rebuild. `defaultModifierPolicy` is validated
   * through the resolver's own `normalizeModifierPolicy` so the authoring surface and the engine
   * cannot disagree, and `maxModifierPicks` PRESERVES ABSENCE, so a check never asked the
   * question cannot silently acquire a bound that truncates stored picks. */
  _normalizeCheckModifierSelection(check, validIds) {
    const seenDefaults = new Set();
    const defaultModifierIds = (
      Array.isArray(check?.defaultModifierIds) ? check.defaultModifierIds : []
    ).filter((id) => {
      // `!(validIds instanceof Set)` is the UNKNOWN-basis sentinel (issue 1308): a caller that
      // cannot vouch for the modifier library passes `null` and nothing is pruned. The old
      // `new Set()` default was the omitted-argument form of the Valid Id Basis failure.
      if (typeof id !== 'string' || seenDefaults.has(id)) return false;
      if (validIds instanceof Set && !validIds.has(id)) return false;
      seenDefaults.add(id);
      return true;
    });
    const defaultModifierPolicy = normalizeModifierPolicy(check?.defaultModifierPolicy) ?? 'addAll';
    const normalized = { defaultModifierPolicy, defaultModifierIds };
    // Absence-preserving: `resolveMaxModifierPicks` reports every unbounded form —
    // absent, `null`, non-integer, non-positive — as `Infinity`, so only a real positive
    // integer cap survives as a key and unlimited stays unlimited.
    const maxModifierPicks = resolveMaxModifierPicks(check);
    if (Number.isFinite(maxModifierPicks)) normalized.maxModifierPicks = maxModifierPicks;
    return normalized;
  }

  // Simple pass/fail crafting check for the simple and alchemy modes: a roll formula and a DC
  // whose value is polymorphic — a static default with optional named recipe tiers, or a dynamic
  // value from a dropped macro. Both field sets are kept so switching `dcMode` never destroys the
  // other side's configuration.
  _normalizeSimpleCraftingCheck(simple = {}) {
    const source = !simple || typeof simple !== 'object' ? {} : simple;
    const dc = Number(source.dc);
    const tiers = Array.isArray(source.tiers) ? source.tiers : [];
    const rollFormula = typeof source.rollFormula === 'string' ? source.rollFormula : '';
    return {
      rollFormula,
      dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
      thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      dcMode: source.dcMode === 'dynamic' ? 'dynamic' : 'static',
      tiers: tiers.map((tier) => this._normalizeSimpleTier(tier)).filter(Boolean),
      macroUuid: source.macroUuid || null,
      checkBreakage: this._normalizeUnifiedTriggers(
        rollFormula,
        source.diceCrits,
        source.checkBreakage
      ),
    };
  }

  // Progressive crafting check: a roll formula whose total is the value progressive awarding
  // spends against result difficulties — no DC, no comparison, no recipe tiers. This allowlist
  // literal is SHARED by the crafting, salvage and gathering checks, so a key omitted here is
  // dropped from all three on every normalize.
  _normalizeProgressiveCraftingCheck(progressive = {}) {
    const source = !progressive || typeof progressive !== 'object' ? {} : progressive;
    const rollFormula = typeof source.rollFormula === 'string' ? source.rollFormula : '';
    // The Checks Studio's PREVIEW SANDBOX (issue 1097). Emitted here because this literal is an
    // allowlist rebuild, and ABSENCE-PRESERVING, because an absent experiment is not an empty one.
    // NO RUNTIME PATH READS IT, deliberately: it is scratch state rather than configuration, and
    // nothing validates it either.
    const preview = normalizePreviewSandbox(source.preview);
    const normalized = {
      awardMode: ['partial', 'equal', 'exceed'].includes(source.awardMode)
        ? source.awardMode
        : 'equal',
      rollFormula,
      checkBreakage: this._normalizeUnifiedTriggers(
        rollFormula,
        source.diceCrits,
        source.checkBreakage
      ),
    };
    // Attached rather than spread, the same way `_normalizeCheckModifierCatalogue` attaches
    // its optional bounds: the key is ABSENT when no experiment has been run.
    if (preview) normalized.preview = preview;
    return normalized;
  }

  _normalizeSimpleTier(tier) {
    if (!tier || typeof tier !== 'object') return null;
    const dc = Number(tier.dc);
    return {
      id: tier.id || foundry.utils.randomID(),
      name: String(tier.name || '').trim(),
      dc: Number.isFinite(dc) ? Math.trunc(dc) : 0,
    };
  }

  /** Convert a check's legacy per-die crit list into unified trigger objects (issue 419). A crit
   * is kept only when its canonicalized die appears as a plain, unmodified `NdS` group in the
   * formula, and the trigger's `groupId` is the index of the FIRST matching term, so a
   * duplicate-die formula targets the first group only. */
  _convertDiceCritsToTriggers(crits, rollFormula) {
    const list = Array.isArray(crits) ? crits : [];
    if (list.length === 0) return [];
    const groups = parseDiceGroups(rollFormula);
    const plainDice = new Set(parsePlainDiceGroups(rollFormula).map((group) => group.raw));
    return list
      .map((crit) => {
        if (!crit || typeof crit !== 'object') return null;
        // Canonicalize the die key (bare `dN` ≡ `1dN`) and drop crits keyed to a die
        // that is not a plain `NdS` group in the formula (modified pools / orphans).
        const die = this._canonicalDie(crit.die);
        if (!die || !plainDice.has(die)) return null;
        const groupId = groups.findIndex((group) => group.raw === die);
        if (groupId === -1) return null;
        const raw = Number.isFinite(Number(crit.raw)) ? Math.trunc(Number(crit.raw)) : 0;
        return {
          id: String(crit.id || foundry.utils.randomID()),
          condition: {
            type: 'diceGroup',
            groupId,
            aggregate: 'total',
            operator: '==',
            // Clamp `raw` to the die's producible total range [N, N*S]; the legacy
            // crit matched the die-term total, so an out-of-range raw could never
            // fire (see {@link _clampCritRaw}).
            value: this._clampCritRaw(die, raw),
          },
          // Legacy `success:false` always meant force-failure (there was no off
          // state), so the disposition maps directly.
          outcome: crit.success === true ? 'success' : 'failure',
          breakTools: crit.breakTools === true,
          // A legacy crit had no stepping effect, but the key must be present so a
          // converted trigger re-normalizes to itself (issue 975).
          tierStep: this._normalizeTierStep(),
        };
      })
      .filter(Boolean);
  }

  /** Canonical plain `NdS` form of a stored crit die key (bare `dN` ≡ `1dN`), or '' when the key
   * is not a plain unmodified die term, so such crits are dropped by the conversion above. */
  _canonicalDie(die) {
    const plain = parsePlainDiceGroups(String(die ?? ''));
    return plain.length === 1 ? plain[0].raw : '';
  }

  /** Clamp a critical raw value to the producible total range of an `NdS` term, `[N, N*S]`: an
   * out-of-range raw could never be rolled and the crit would be inert, so an authored "crit on
   * 25" for `1d20` triggers on a natural 20 instead of never. */
  _clampCritRaw(die, raw) {
    const match = /^(\d+)d(\d+)$/i.exec(String(die).trim());
    if (!match) return raw;
    const count = Number(match[1]);
    const faces = Number(match[2]);
    if (!Number.isFinite(count) || !Number.isFinite(faces) || count < 1 || faces < 1) return raw;
    const min = count;
    const max = count * faces;
    return Math.min(Math.max(raw, min), max);
  }

  // Structured routed-mode crafting check: a check type (relative DC offsets or fixed value
  // ranges), a shared roll expression, and TWO independent outcome-tier lists — one per type — so
  // editing a tier in one mode never affects the other. Kept alongside the legacy `outcomes`
  // string list rather than replacing it.
  _normalizeRoutedCraftingCheck(routed = {}) {
    const source = !routed || typeof routed !== 'object' ? {} : routed;
    const relative = Array.isArray(source.relativeOutcomes) ? source.relativeOutcomes : [];
    const fixed = Array.isArray(source.fixedOutcomes) ? source.fixedOutcomes : [];
    const tiers = Array.isArray(source.tiers) ? source.tiers : [];
    const dc = Number(source.dc);
    // The roll formula, default DC, comparison, per-die crits, and recipe tiers
    // mirror the simple check (so the editors share components). `rollExpression`
    // is the legacy field name, read for back-compat.
    let rollFormula = '';
    if (typeof source.rollFormula === 'string') {
      rollFormula = source.rollFormula;
    } else if (typeof source.rollExpression === 'string') {
      rollFormula = source.rollExpression;
    }
    const type = source.type === 'fixed' ? 'fixed' : 'relative';
    return {
      type,
      rollFormula,
      dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
      thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      // WHERE THE DC COMES FROM, on the routed slot too (issue 1096): a routed RELATIVE check is
      // bands offset from a DC, so it has one by construction. ABSENCE-PRESERVING — anything not
      // exactly `dynamic` reads `static`, and `macroUuid` is kept whatever the mode.
      dcMode: source.dcMode === 'dynamic' ? 'dynamic' : 'static',
      macroUuid: source.macroUuid || null,
      tiers: tiers.map((tier) => this._normalizeSimpleTier(tier)).filter(Boolean),
      relativeOutcomes: relative
        .map((outcome) => this._normalizeRoutedOutcome(outcome, 'relative'))
        .filter(Boolean),
      fixedOutcomes: fixed
        .map((outcome) => this._normalizeRoutedOutcome(outcome, 'fixed'))
        .filter(Boolean),
      // The legacy `natStepping` boolean (issue 975) converts to a pair of
      // tier-stepping triggers on read and is dropped from the output, so the
      // conversion runs once and the key never round-trips.
      checkBreakage: this._normalizeUnifiedTriggers(
        rollFormula,
        source.diceCrits,
        source.checkBreakage,
        { natStepping: source.natStepping, type }
      ),
    };
  }

  _normalizeRoutedOutcome(outcome, kind) {
    if (!outcome || typeof outcome !== 'object') return null;
    const base = {
      id: outcome.id || foundry.utils.randomID(),
      name: String(outcome.name || '').trim(),
      success: outcome.success === true,
      breakTools: outcome.breakTools === true,
    };
    if (kind === 'fixed') {
      const start = Number(outcome.start);
      const end = Number(outcome.end);
      return {
        ...base,
        start: Number.isFinite(start) ? Math.trunc(start) : 0,
        end: Number.isFinite(end) ? Math.trunc(end) : 0,
      };
    }
    const dc = Number(outcome.dc);
    return { ...base, dc: Number.isFinite(dc) ? Math.trunc(dc) : 0 };
  }

  /** Normalize the unified per-check trigger list (issue 419), migrating legacy data on read:
   * `diceCrits` become `diceGroup` triggers and a routed `natStepping` becomes the tier-stepping
   * pair, concatenated as `[...crits, ...natStep, ...authored]`. Idempotent. */
  _normalizeUnifiedTriggers(rollFormula, diceCrits, checkBreakage, legacyRouted = {}) {
    const converted = this._convertDiceCritsToTriggers(diceCrits, rollFormula);
    const convertedNatStep = this._convertNatSteppingToTriggers(
      legacyRouted?.natStepping,
      rollFormula,
      legacyRouted?.type
    );
    const { triggers } = this._normalizeCheckBreakage(checkBreakage);
    return { triggers: [...converted, ...convertedNatStep, ...triggers] };
  }

  /** Convert a routed check's legacy `natStepping: true` into the tier-stepping trigger pair
   * (issue 975), emitted only when stepping was live. The shape is load-bearing: stable literal
   * ids (a re-mint on every read would reach chat), EXPLICIT `outcome`/`breakTools` so the legacy
   * break-only test cannot misread it, and `allDice` so a headless roll fails open. */
  _convertNatSteppingToTriggers(natStepping, rollFormula, type) {
    if (natStepping !== true || type === 'fixed') return [];
    const d20GroupId = parseDiceGroups(rollFormula).findIndex((group) => group.sides === 20);
    // -1 → natStepping was already inert; synthesise nothing.
    if (d20GroupId === -1) return [];
    const natStepTrigger = (id, face, mode) => ({
      id,
      condition: {
        type: 'diceGroup',
        groupId: d20GroupId,
        aggregate: 'allDice',
        operator: '==',
        value: face,
      },
      outcome: 'none',
      breakTools: false,
      tierStep: { mode, steps: 1, tierId: null },
    });
    return [natStepTrigger('natstep-up', 20, 'up'), natStepTrigger('natstep-down', 1, 'down')];
  }

  /** Normalize the `checkBreakage` block's own trigger list. Malformed triggers are dropped, so a
   * bad authoring payload can never throw at runtime. */
  _normalizeCheckBreakage(input) {
    const source = !input || typeof input !== 'object' ? {} : input;
    const rawTriggers = Array.isArray(source.triggers) ? source.triggers : [];
    const triggers = rawTriggers
      .map((trigger) => this._normalizeUnifiedTrigger(trigger))
      .filter(Boolean);
    return { triggers };
  }

  /** Normalize a single unified trigger, returning null when its condition is malformed. `outcome`
   * is PINNED to `'none'` for an `outcomeTier` condition; a legacy break-only trigger migrates to
   * `breakTools: true`, and `tierStep` is deliberately absent from that test. */
  _normalizeUnifiedTrigger(trigger) {
    if (!trigger || typeof trigger !== 'object') return null;
    const condition = this._normalizeCheckBreakageCondition(trigger.condition);
    if (!condition) return null;
    const isLegacyBreakOnly = trigger.outcome === undefined && trigger.breakTools === undefined;
    let outcome = ['success', 'failure', 'none'].includes(trigger.outcome)
      ? trigger.outcome
      : 'none';
    if (condition.type === 'outcomeTier') outcome = 'none';
    return {
      id: String(trigger.id || foundry.utils.randomID()),
      condition,
      outcome,
      breakTools: isLegacyBreakOnly ? true : trigger.breakTools === true,
      tierStep: this._normalizeTierStep(trigger.tierStep),
    };
  }

  /** Normalize a trigger's `tierStep` effect (issue 975), flat rather than a discriminated union
   * so switching mode never destroys the other mode's operand. `steps` is the step MAGNITUDE,
   * clamped to an integer `>= 1`, and `tierId` is preserved VERBATIM even when it names no tier. */
  _normalizeTierStep(input) {
    const source = !input || typeof input !== 'object' ? {} : input;
    const steps = Number(source.steps);
    const tierId = typeof source.tierId === 'string' ? source.tierId.trim() : '';
    return {
      mode: ['none', 'target', 'up', 'down'].includes(source.mode) ? source.mode : 'none',
      steps: Number.isFinite(steps) ? Math.max(1, Math.trunc(steps)) : 1,
      tierId: tierId || null,
    };
  }

  /** @private */
  _normalizeCheckBreakageCondition(condition) {
    if (!condition || typeof condition !== 'object') return null;
    const OPERATORS = new Set(['==', '<=', '>=', '<', '>']);
    const type = condition.type;
    if (type === 'rollTotal' || type === 'progressiveValue') {
      if (!OPERATORS.has(condition.operator)) return null;
      const value = Number(condition.value);
      if (!Number.isFinite(value)) return null;
      return { type, operator: condition.operator, value };
    }
    if (type === 'outcomeTier') {
      const tierIds = Array.isArray(condition.tierIds)
        ? condition.tierIds.map(String).filter(Boolean)
        : [];
      const outcomeKeys = Array.isArray(condition.outcomeKeys)
        ? condition.outcomeKeys.map((key) => String(key).trim().toLowerCase()).filter(Boolean)
        : [];
      if (tierIds.length === 0 && outcomeKeys.length === 0) return null;
      return { type, tierIds, outcomeKeys };
    }
    if (type === 'diceGroup') {
      const AGGREGATES = new Set(['total', 'anyDie', 'allDice', 'lowestDie', 'highestDie']);
      if (!AGGREGATES.has(condition.aggregate)) return null;
      if (!OPERATORS.has(condition.operator)) return null;
      const groupId = Number(condition.groupId);
      const value = Number(condition.value);
      if (!Number.isInteger(groupId) || groupId < 0) return null;
      if (!Number.isFinite(value)) return null;
      return {
        type,
        groupId,
        aggregate: condition.aggregate,
        operator: condition.operator,
        value,
      };
    }
    return null;
  }

  _normalizeSalvageCraftingCheck(check = {}, validCatalogueIds = null) {
    const normalizedCheck = !check || typeof check !== 'object' ? {} : check;
    const outcomes = Array.isArray(normalizedCheck.outcomes) ? normalizedCheck.outcomes : [];
    const normalizedOutcomes = outcomes
      .map((o) =>
        String(o || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    return {
      enabled: normalizedCheck.enabled === true,
      consumption: {
        consumeComponentOnFail: normalizedCheck.consumption?.consumeComponentOnFail !== false,
        // Canonical key is `breakToolsOnFail` (1.7.0 rename); read new-then-legacy so
        // pre-migration salvage configs still load.
        breakToolsOnFail:
          (normalizedCheck.consumption?.breakToolsOnFail ??
            normalizedCheck.consumption?.consumeCatalystsOnFail) === true,
      },
      // The ORTHOGONAL produce/do-not-produce axis (issue 1098), a NEW CAPABILITY on salvage
      // rather than a gate on an existing one. See `_normalizeSalvage` for the reserved
      // `role: 'failure'` group it makes live, which the engine selects BY ROLE.
      failureResultPolicy: this._normalizeFailureResultPolicy(normalizedCheck.failureResultPolicy),
      // Salvage reuses the crafting check sub-object shapes so the Checks-tab editors are shared.
      // The default DC is the sub-object's `dc`; a per-component override lives on
      // `component.salvage.dcOverride`.
      simple: this._normalizeSimpleCraftingCheck(normalizedCheck.simple),
      routed: this._normalizeRoutedCraftingCheck(normalizedCheck.routed),
      progressive: this._normalizeProgressiveCraftingCheck(normalizedCheck.progressive),
      outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
      // Salvage's OWN selection over the system catalogue (issue 1095). New here: before
      // this change salvage had no modifier seam at all and the engine passed no context.
      // Shares one derivation with crafting and gathering, so the three cannot drift.
      ...this._normalizeCheckModifierSelection(normalizedCheck, validCatalogueIds),
    };
  }

  // System-level gathering check (gathering resolution modes d100/progressive/
  // routed). d100 needs no editable config (the fixed d100 roll), so only the
  // progressive and routed sub-objects are authored, reusing the crafting shapes.
  // A per-task DC override lives on the gathering task (`task.dcOverride`).
  _normalizeGatheringCraftingCheck(check = {}, validCatalogueIds = null) {
    const source = !check || typeof check !== 'object' ? {} : check;
    return {
      enabled: source.enabled === true,
      // The ORTHOGONAL produce/do-not-produce axis (issue 1098). Gathering has no consumption
      // block, so this is its ONLY failure axis — and the path it governs ships DORMANT pending
      // issue 683, with the shape landing now so the capability is complete when 683 flips it.
      failureResultPolicy: this._normalizeFailureResultPolicy(source.failureResultPolicy),
      progressive: this._normalizeProgressiveCraftingCheck(source.progressive),
      routed: this._normalizeRoutedCraftingCheck(source.routed),
      // Gathering's OWN selection over the system catalogue (issue 1095), applying to the
      // FORMULA-ROLLED modes only: `d100` rolls no authored formula. The selection is persisted
      // regardless of the current mode so switching never destroys it.
      ...this._normalizeCheckModifierSelection(source, validCatalogueIds),
    };
  }

  // Flat system-level visibility STRATEGY enum (issue 511): `visibilityMode` ∈ {global,
  // restricted, item, knowledge} gates the whole Crafting authoring surface, with unknown or
  // missing reading as `knowledge`.
  _normalizeVisibilityMode(value) {
    return ['global', 'restricted', 'item', 'knowledge'].includes(value) ? value : 'knowledge';
  }

  _normalizeRecipeVisibility(recipeVisibility = {}) {
    const listMode = ['global', 'player', 'knowledge', 'teaser'].includes(
      recipeVisibility?.listMode
    )
      ? recipeVisibility.listMode
      : 'global';
    const knowledge = recipeVisibility?.knowledge || {};
    return {
      listMode,
      knowledge: {
        mode: ['item', 'learned', 'itemOrLearned'].includes(knowledge?.mode)
          ? knowledge.mode
          : 'itemOrLearned',
        learn: {
          dragDropEnabled: knowledge?.learn?.dragDropEnabled !== false,
        },
      },
    };
  }

  _normalizeTeaserConfig(config = {}) {
    if (!config || typeof config !== 'object') {
      return { enabled: false, discoveryMode: 'threshold', fragments: [] };
    }
    return {
      enabled: config.enabled === true,
      discoveryMode: ['threshold', 'fragments', 'both'].includes(config.discoveryMode)
        ? config.discoveryMode
        : 'threshold',
      fragments: Array.isArray(config.fragments)
        ? config.fragments.map((f) => this._normalizeTeaserFragment(f)).filter(Boolean)
        : [],
    };
  }

  _normalizeTeaserFragment(fragment = {}) {
    if (!fragment || typeof fragment !== 'object') return null;
    const id = String(fragment.id || '').trim();
    if (!id) return null;
    return {
      id,
      name: String(fragment.name || '').trim() || 'Fragment',
      linkedItemUuid: fragment.linkedItemUuid || null,
      recipeIds: Array.isArray(fragment.recipeIds)
        ? fragment.recipeIds.filter((id) => typeof id === 'string')
        : [],
      progressValue: Math.min(100, Math.max(0, Number(fragment.progressValue) || 0)),
    };
  }

  _normalizeRequirements(requirements = {}) {
    const time = requirements?.time || {};
    const currency = requirements?.currency || {};
    return {
      time: {
        // Default ON for backward compatibility, mirroring the `features.salvage` convention:
        // recipes authored before this toggle carry configs that already run, so only an explicit
        // `false` disables them. Upgraded worlds are re-defaulted on once by the 1.19.0
        // `migrateDefaultOnTimeRequirements` migration, not here on read.
        enabled: time.enabled !== false,
      },
      currency: this._normalizeCurrencyConfig(currency),
    };
  }

  /** Normalize the per-system currency block, which since issue 1278 is ONLY the participation
   * flag, because a world runs one Foundry game system and so has one way actors store coins.
   * This whitelist rebuild sheds the pre-1278 sibling keys, which the 1.26.0 migration lifts into
   * the world config before any system write. */
  _normalizeCurrencyConfig(currency = {}) {
    return { enabled: currency?.enabled === true };
  }

  _normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
  }

  _normalizeEssenceDefinitions(value) {
    if (!Array.isArray(value)) return [];

    const used = new Set();
    const normalized = [];
    for (const entry of value) {
      const def = this._normalizeEssenceDefinition(entry, used);
      if (!def) continue;
      used.add(def.id);
      normalized.push(def);
    }
    return normalized;
  }

  /** The GM-authored per-essence colour (issue 917): a bare `--fab-tag-*` palette key, or null.
   * There is deliberately NO `customColor` sibling, because a free hex cannot be guaranteed
   * legible against all seven themes. An unrecognized token renders as the theme accent. */
  _normalizeEssenceColorToken(value) {
    const token = String(value ?? '')
      .trim()
      .replace(/^--fab-tag-/, '');
    return token || null;
  }

  /** The GM-authored per-essence property macro (issue 1036). A SHAPE check, not a macro check:
   * `_looksLikeDocumentUuid` must stay permissive because `parseUuid` still re-interprets legacy
   * four-segment compendium uuids, so a `/^Macro\./` tightening would reject a resolvable macro. */
  _normalizeEssencePropertyMacroUuid(value) {
    return this._looksLikeDocumentUuid(value) ? value : null;
  }

  _normalizeEssenceDefinition(entry, usedIds = new Set()) {
    // BOTH branches below are whitelist REBUILDS that drop any key they do not name, so every
    // persisted field must appear in both or it is silently lost on the next save. `enabled` needs
    // NO migration, and adding one would be wrong: this whitelist has never emitted the key, so no
    // stored definition carries one and `entry.enabled !== false` reads absent as `true`.
    if (typeof entry === 'string') {
      const base = entry.trim();
      if (!base) return null;
      return {
        id: this._uniqueKey(base, usedIds),
        name: base,
        description: '',
        icon: 'fas fa-mortar-pestle',
        colorToken: null,
        enabled: true,
        propertyMacroUuid: null,
        sourceComponentId: null,
        sourceItemUuid: null,
        associatedSystemItemId: null, // transitional alias
      };
    }

    if (!entry || typeof entry !== 'object') return null;

    const rawName = String(entry.name || '').trim();
    const rawId = String(entry.id || '')
      .trim()
      .toLowerCase();
    const seed = rawId || rawName;
    if (!seed) return null;

    const id = this._uniqueKey(seed, usedIds);
    const sourceComponentId = entry.sourceComponentId || entry.associatedSystemItemId || null;
    const sourceItemUuid = entry.sourceItemUuid || null;
    return {
      id,
      name: rawName || id,
      description: String(entry.description || '').trim(),
      icon: String(entry.icon || '').trim() || 'fas fa-mortar-pestle',
      colorToken: this._normalizeEssenceColorToken(entry.colorToken),
      enabled: entry.enabled !== false,
      propertyMacroUuid: this._normalizeEssencePropertyMacroUuid(entry.propertyMacroUuid),
      sourceComponentId,
      sourceItemUuid,
      associatedSystemItemId: sourceComponentId, // transitional alias
    };
  }

  _looksLikeDocumentUuid(value) {
    if (!value || typeof value !== 'string') return false;
    return /^(Actor|Item|Scene|JournalEntry|Macro|RollTable|Compendium)\./.test(value);
  }

  _normalizeRecipeItemDefinitions(value) {
    if (!Array.isArray(value)) return [];

    const usedIds = new Set();
    const normalized = [];
    for (const entry of value) {
      const def = this._normalizeRecipeItemDefinition(entry, usedIds);
      if (!def) continue;
      usedIds.add(def.id);
      normalized.push(def);
    }
    return normalized;
  }

  // Per-recipe-item use/learn caps (issue 511): each definition owns its own caps rather than
  // sharing one system-wide config. The legacy boolean `destroyWhenExhausted` is reconciled with
  // the enum `whenSpent`, keeping BOTH persisted — the enum wins when authored.
  _reconcileWhenSpent(item = {}) {
    const authored = item.whenSpent === 'destroyed' || item.whenSpent === 'inert';
    if (authored) {
      return { whenSpent: item.whenSpent, destroyWhenExhausted: item.whenSpent === 'destroyed' };
    }
    if (Object.prototype.hasOwnProperty.call(item, 'destroyWhenExhausted')) {
      const destroyWhenExhausted = item.destroyWhenExhausted === true;
      return { whenSpent: destroyWhenExhausted ? 'destroyed' : 'inert', destroyWhenExhausted };
    }
    return { whenSpent: 'destroyed', destroyWhenExhausted: true };
  }

  _normalizeRecipeItemCaps(caps = {}) {
    const item = caps?.item || {};
    const learn = caps?.learn || {};

    const { whenSpent, destroyWhenExhausted } = this._reconcileWhenSpent(item);

    // `limitLearning` (new) mirrors legacy `limitRecipes`; the new field wins when
    // authored, otherwise the legacy boolean seeds it. Both are always persisted.
    const limitLearning = Object.prototype.hasOwnProperty.call(learn, 'limitLearning')
      ? learn.limitLearning === true
      : learn.limitRecipes === true;

    // `learnsAllowed` mirrors legacy `maxRecipes` and wins when authored. With the limit ON but no
    // positive count, it defaults to 1: a limit of "0/undefined" would wrongly read as uncapped
    // downstream and hide the learn-all CTA (issue 544).
    const rawLearns = Object.prototype.hasOwnProperty.call(learn, 'learnsAllowed')
      ? learn.learnsAllowed
      : learn.maxRecipes;
    const learnsAllowed = limitLearning
      ? Number.isFinite(Number(rawLearns)) && Number(rawLearns) > 0
        ? Number(rawLearns)
        : 1
      : undefined;

    // `learnScope` ('perInstance' | 'total') is the canonical cap scope: `perInstance` limits
    // learning from a SINGLE copy, `total` across EVERY copy of the source recipe item. An
    // authored value wins, else it derives from the legacy `learningMode`, which is kept as a
    // synced legacy mirror.
    const learnScope = ['perInstance', 'total'].includes(learn.learnScope)
      ? learn.learnScope
      : learn.learningMode === 'party'
        ? 'total'
        : 'perInstance';
    const learningMode =
      learnScope === 'total' ? 'party' : Number(learnsAllowed) > 1 ? 'ntimes' : 'once';

    // `prerequisiteIds` (issue 544) — the recipe ids a reader must ALREADY have learned (AND
    // semantics) before learning from this book. Replaces the legacy single `prerequisite`
    // string, which is folded in here so an un-migrated draft still reads correctly.
    const rawPrerequisiteIds = Array.isArray(learn.prerequisiteIds)
      ? learn.prerequisiteIds
      : typeof learn.prerequisite === 'string' && learn.prerequisite.trim()
        ? [learn.prerequisite]
        : [];
    const prerequisiteIds = [
      ...new Set(rawPrerequisiteIds.map((value) => String(value ?? '').trim()).filter(Boolean)),
    ];

    // `characterPrerequisiteIds` (issue 544) — the system-owned character prerequisites a reader
    // must ALL pass to learn from this book. Distinct from `prerequisite`: this gates on the
    // actor's roll data, that on prior knowledge.
    const characterPrerequisiteIds = Array.isArray(learn.characterPrerequisiteIds)
      ? [
          ...new Set(
            learn.characterPrerequisiteIds
              .map((value) => String(value ?? '').trim())
              .filter(Boolean)
          ),
        ]
      : [];

    return {
      item: {
        limitUses: item.limitUses === true,
        maxUses: Number.isFinite(Number(item.maxUses)) ? Number(item.maxUses) : undefined,
        destroyWhenExhausted,
        whenSpent,
      },
      learn: {
        consumeOnLearn: learn.consumeOnLearn !== false,
        // `destroyWhenSpent` (learn) is deliberately named distinctly from
        // `destroyWhenExhausted` (item/craft-charges) — do not normalize to one name.
        limitRecipes: limitLearning,
        limitLearning,
        maxRecipes: learnsAllowed,
        learnsAllowed,
        learnScope,
        learningMode,
        prerequisiteIds,
        characterPrerequisiteIds,
        destroyWhenSpent: learn.destroyWhenSpent === true,
      },
    };
  }

  _normalizeRecipeItemDefinition(entry, usedIds = new Set()) {
    if (!entry || typeof entry !== 'object') return null;

    let id = String(entry.id || '').trim();
    if (!id) id = foundry.utils.randomID();
    while (usedIds.has(id)) {
      id = foundry.utils.randomID();
    }

    // New-name-first, legacy-name-tolerant (issue 560): accept the renamed
    // `registeredItemUuid`/`originItemUuid`/`aliasItemUuids` and the pre-#560
    // `sourceUuid`/`sourceItemUuid`/`fallbackItemIds`, emitting the new names, so a
    // not-yet-1.16.0-migrated entry is never stripped on save.
    const originItemUuid =
      String(
        entry.originItemUuid ||
          entry.registeredItemUuid ||
          entry.sourceItemUuid ||
          entry.sourceUuid ||
          ''
      ).trim() || null;
    // Union source refs, mirroring `_normalizeComponent`, so a compendium-imported book resolves
    // for owned copies dragged from EITHER the compendium item or the imported world item (issue
    // 555). `originItemUuid` is never recomputed and `registeredItemUuid` defaults to it, so
    // existing definitions match unchanged.
    const registeredItemUuid =
      String(
        entry.registeredItemUuid ||
          entry.originItemUuid ||
          entry.sourceUuid ||
          entry.sourceItemUuid ||
          ''
      ).trim() || null;
    const primaryRefs = new Set([registeredItemUuid, originItemUuid].filter(Boolean));
    const rawAliasItemUuids = Array.isArray(entry.aliasItemUuids)
      ? entry.aliasItemUuids
      : Array.isArray(entry.fallbackItemIds)
        ? entry.fallbackItemIds
        : null;
    const aliasItemUuids = Array.isArray(rawAliasItemUuids)
      ? [
          ...new Set(
            rawAliasItemUuids
              .filter((id) => typeof id === 'string')
              .map((id) => id.trim())
              .filter((id) => id && !primaryRefs.has(id))
          ),
        ]
      : [];
    return {
      id,
      name: String(entry.name || '').trim() || this._labelFromUuid(originItemUuid) || 'Recipe Item',
      description: this._normalizeComponentDescription(entry.description),
      img: String(entry.img || '').trim() || 'icons/svg/item-bag.svg',
      originItemUuid,
      registeredItemUuid,
      aliasItemUuids,
      // Per-recipe-item enable toggle (issue 511, PR-B). Defaults on; a disabled
      // definition still round-trips but the library UI can hide/skip it.
      enabled: entry.enabled !== false,
      // Book membership (issue 511): the recipe ids this book/scroll contains — the
      // canonical, many-to-many link (a recipe may belong to several books). Distinct
      // from the visibility-teaser `recipeIds` fragment elsewhere. Deduped id list.
      recipeIds: [
        ...new Set(
          (Array.isArray(entry.recipeIds) ? entry.recipeIds : [])
            .map((rid) => String(rid || '').trim())
            .filter(Boolean)
        ),
      ],
      caps: this._normalizeRecipeItemCaps(entry.caps),
    };
  }

  _uniqueKey(seed, usedIds) {
    const cleaned = this._toKey(seed);
    let key = cleaned || 'essence';
    let i = 2;
    while (usedIds.has(key)) {
      key = `${cleaned || 'essence'}-${i++}`;
    }
    return key;
  }

  _toKey(value) {
    // Split/filter/join trims leading & trailing separators without the
    // backtracking-prone `/^-+|-+$/` anchored regex (already-collapsed single
    // dashes mean this yields the same slug).
    return String(value || '')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .split('-')
      .filter(Boolean)
      .join('-');
  }

  _labelFromUuid(uuid) {
    if (!uuid) return '';
    const parts = String(uuid).split('.');
    return parts.at(-1) || '';
  }

  _normalizeComponentDescription(description) {
    return this._plainTextDescription(description);
  }

  // Thin delegators to the shared Foundry-free NORMALIZER (src/utils/
  // plainTextDescription.js). These normalize already-resolved text for display;
  // they never RESOLVE — resolution is the async `_enrichToHtml` seam, applied at
  // the ingestion boundaries only (issue 800).
  _plainTextDescription(value) {
    return plainTextDescription(value);
  }

  _descriptionTextCandidate(value, seen = new Set()) {
    return descriptionTextCandidate(value, seen);
  }

  /** The ordered description fields a Foundry Item may carry, most specific first. Shared by
   * {@link _extractSourceDescription} and the repair pass's priming sweep, which needs the RAW
   * text only. */
  _sourceDescriptionCandidates(source = null) {
    if (!source || typeof source !== 'object') return [];
    return [
      source?.system?.description?.value,
      source?.system?.description,
      source?.description?.value,
      source?.description,
    ];
  }

  /** The first non-empty RAW description text on a source document, without resolving anything;
   * feeds the repair pass's single priming sweep. */
  _rawSourceDescription(source = null) {
    for (const candidate of this._sourceDescriptionCandidates(source)) {
      const raw = this._descriptionTextCandidate(candidate);
      if (raw) return raw;
    }
    return '';
  }

  /** RESOLVE a source document's description through Foundry's enricher, then normalize the
   * enriched HTML to display-safe plain text — the whole point of issue 800, so a label-less
   * `@UUID[…]` becomes the referenced document's real NAME. Async because `enrichHTML` is. */
  async _extractSourceDescription(source = null) {
    if (!source || typeof source !== 'object') return '';

    const candidates = this._sourceDescriptionCandidates(source);

    for (const candidate of candidates) {
      const raw = this._descriptionTextCandidate(candidate);
      if (!raw) continue;
      const enriched = await this._enrichToHtml(raw, { relativeTo: source });
      const plainText = this._plainTextDescription(enriched);
      if (plainText) return plainText;
    }

    return '';
  }

  async _buildComponentSourceSnapshot(
    itemUuid,
    source = null,
    fallbackItem = null,
    sourceData = null
  ) {
    const resolvedSourceData =
      sourceData ?? (await this._resolveImportedComponentSourceData(itemUuid, source));
    const sourceResolved = !!source;
    const fallbackName = fallbackItem?.name || itemUuid?.split('.')?.pop() || 'Imported Item';
    const fallbackImg = fallbackItem?.img || 'icons/svg/item-bag.svg';

    return {
      name: sourceResolved ? source?.name || fallbackName : fallbackName,
      img: sourceResolved ? source?.img || fallbackImg : fallbackImg,
      description: sourceResolved
        ? await this._extractSourceDescription(source)
        : this._normalizeComponentDescription(fallbackItem?.description),
      registeredItemUuid: resolvedSourceData.currentUuid,
      originItemUuid: resolvedSourceData.canonicalUuid,
      aliasItemUuids: resolvedSourceData.aliasItemUuids,
      sourceFallbacks: resolvedSourceData.sourceFallbacks,
      references: resolvedSourceData.references,
    };
  }

  async _buildRecipeItemSourceSnapshot(itemUuid, source = null, fallbackDefinition = null) {
    // Resolve the same union of source refs a component records (live document uuid +
    // canonical compendium uuid + broken-source fallbacks), so a recipe item claims the
    // full breadth for matching (issue 555). Clone-gated identity is applied inside
    // `_resolveImportedSourceData`, so a duplicated source keys on its own uuid.
    const sourceData = await this._resolveImportedComponentSourceData(itemUuid, source);
    const fallbackName = fallbackDefinition?.name || itemUuid?.split('.')?.pop() || 'Recipe Item';
    const fallbackImg = fallbackDefinition?.img || 'icons/svg/item-bag.svg';

    return {
      name: source?.name || fallbackName,
      img: source?.img || fallbackImg,
      description: source
        ? await this._extractSourceDescription(source)
        : this._normalizeComponentDescription(fallbackDefinition?.description),
      registeredItemUuid: sourceData.currentUuid,
      originItemUuid: sourceData.canonicalUuid,
      aliasItemUuids: sourceData.aliasItemUuids,
    };
  }

  /** Build a first-class Tool's source snapshot from an Item uuid (issue 561): the same union of
   * source refs a component records, plus the `name` and `img` display snapshot — but NEVER
   * `label`, which is a distinct user-authored override. */
  async _buildToolSourceSnapshot(itemUuid, source = null) {
    const sourceData = await this._resolveImportedComponentSourceData(itemUuid, source);
    const fallbackName = itemUuid?.split('.')?.pop() || 'Imported Tool';
    return {
      name: source?.name || fallbackName,
      img: source?.img || 'icons/svg/item-bag.svg',
      description: source ? await this._extractSourceDescription(source) : '',
      registeredItemUuid: sourceData.currentUuid,
      originItemUuid: sourceData.canonicalUuid,
      aliasItemUuids: sourceData.aliasItemUuids,
    };
  }

  _buildFallbackSourceReferences(
    item,
    nextSourceUuid,
    nextSourceItemUuid,
    additionalFallbacks = []
  ) {
    const fallbackSet = new Set(Array.isArray(item?.aliasItemUuids) ? item.aliasItemUuids : []);
    for (const ref of [item?.registeredItemUuid, item?.originItemUuid]) {
      if (ref) fallbackSet.add(ref);
    }
    for (const ref of Array.isArray(additionalFallbacks) ? additionalFallbacks : []) {
      if (ref) fallbackSet.add(ref);
    }
    fallbackSet.delete(nextSourceUuid);
    fallbackSet.delete(nextSourceItemUuid);
    return [...fallbackSet];
  }

  /** Normalize a managed component. The salvage context (issue 764) is threaded through an options
   * bag so `_normalizeSalvage` can apply the Simple-mode group-count clamp; a bare call leaves
   * salvage groups untouched. A legacy positional `validEssenceIds` Set is still accepted. */
  _normalizeComponent(item = {}, options = {}) {
    // Back-compat: a few call paths and tests still pass a bare `validEssenceIds` Set as
    // the second positional argument. A Set is never a valid options bag, so treat it as
    // the essence-ids and run with no salvage context (no clamp).
    const opts = options instanceof Set ? { validEssenceIds: options } : options || {};
    const { validEssenceIds = null, salvageResolutionMode, salvageSimpleCheckHasFormula } = opts;
    const difficulty = Number(item.difficulty);
    // New-name-first, legacy-name-tolerant (issue 560): the pre-#560 shape used
    // `sourceUuid`/`sourceItemUuid`/`fallbackItemIds`; accept both and emit the new names
    // so a not-yet-1.16.0-migrated component is never stripped on save.
    const originItemUuid =
      item.originItemUuid ||
      item.registeredItemUuid ||
      item.sourceItemUuid ||
      item.sourceUuid ||
      null;
    const registeredItemUuid =
      item.registeredItemUuid ||
      item.originItemUuid ||
      item.sourceUuid ||
      item.sourceItemUuid ||
      null;
    const primaryRefs = new Set(
      [registeredItemUuid, originItemUuid].filter((ref) => typeof ref === 'string' && ref.trim())
    );
    const rawAliasItemUuids = Array.isArray(item.aliasItemUuids)
      ? item.aliasItemUuids
      : Array.isArray(item.fallbackItemIds)
        ? item.fallbackItemIds
        : null;
    const aliasItemUuids = Array.isArray(rawAliasItemUuids)
      ? [
          ...new Set(
            rawAliasItemUuids
              .filter((id) => typeof id === 'string')
              .map((id) => id.trim())
              .filter((id) => id && !primaryRefs.has(id))
          ),
        ]
      : [];
    return {
      id: item.id || foundry.utils.randomID(),
      name: item.name || 'Unnamed Item',
      img: item.img || 'icons/svg/item-bag.svg',
      description: this._normalizeComponentDescription(item.description),
      originItemUuid,
      // Transitional alias for current UI/engine references.
      registeredItemUuid,
      aliasItemUuids,
      tier: item.tier || null,
      // Single-valued grouping axis (issue 676). Defaults to the reserved `general`
      // bucket — there is no "uncategorized" state — which is how every EXISTING
      // component acquires a category with no migration. Distinct from `tags`, which
      // is many-valued and does a different job.
      category: normalizeComponentCategory(item.category),
      tags: Array.isArray(item.tags) ? item.tags : [],
      essences: this._normalizeEssenceQuantities(item.essences, validEssenceIds),
      difficulty:
        Number.isFinite(difficulty) && difficulty >= 1 ? Math.floor(difficulty) : undefined,
      // Progressive component complications (issue 1286) sit TOP-LEVEL and deliberately NOT under
      // `salvage`: a complication fires for a component's part in progressive crafting, salvage OR
      // gathering, while `salvage` is only valid when `features.salvage` is true. The attach is
      // absence-preserving, so a component that authored none needs no migration.
      ...authoredComplications(item.complications),
      // Salvage config is always normalized and preserved on the component so the
      // `features.salvage` toggle is non-destructive: turning salvage off hides and
      // skips it (UI/validation/runtime gate on the flag) but never deletes authored
      // salvage; toggling back on restores it.
      salvage: this._normalizeSalvage(item.salvage, {
        salvageResolutionMode,
        salvageSimpleCheckHasFormula,
      }),
    };
  }

  /** Derive the salvage-normalization context (issue 764) from an owning crafting system.
   * `salvageSimpleCheckHasFormula` reads `salvageCraftingCheck.simple.rollFormula` SPECIFICALLY —
   * the only slot the Simple engine consults — never an OR across the three slots. Tolerant of a
   * raw, pre-normalized system. */
  _salvageNormalizationContext(system = {}) {
    const raw = system?.salvageResolutionMode;
    const token = raw === 'tiered' ? 'routed' : raw; // legacy alias
    const salvageResolutionMode = ['simple', 'routed', 'progressive'].includes(token)
      ? token
      : 'simple';
    const formula = system?.salvageCraftingCheck?.simple?.rollFormula;
    const salvageSimpleCheckHasFormula = typeof formula === 'string' && formula.trim() !== '';
    return { salvageResolutionMode, salvageSimpleCheckHasFormula };
  }

  /** Normalize a component's salvage config. In Simple salvage mode this enforces the group-count
   * invariant (issue 764) via a SUCCESS-FIRST retain-one clamp: one success group at
   * `resultGroups[0]`, which the engine awards ON SUCCESS via `slice(0, 1)` with no role filter,
   * plus at most one reserved `role: 'failure'` group. The ordering is load-bearing, because the
   * FAILURE branch must select BY ROLE or a failed check would award the success output. */
  _normalizeSalvage(salvage = {}, options = {}) {
    if (!salvage || typeof salvage !== 'object') {
      return {
        enabled: false,
        // Default TRUE (issue 651), matching the `Recipe.allowPlayerResultReorder`
        // default. This non-object path returns its own literal, so the default has to
        // be stated on BOTH return paths or a component with no salvage config renders
        // the GM toggle off against a default-on spec.
        allowPlayerResultReorder: true,
        ingredientQuantity: 1,
        toolIds: [],
        resultGroups: [],
        dcOverride: null,
        // `checkModifierIds` is deliberately ABSENT from this literal, not `[]`: an empty
        // array is an AUTHORED pick of zero, and a component with no salvage config at all
        // has authored nothing. Seeding one here would silently give every such component a
        // pick of zero modifiers under `bySubject`. See the attach in the main return.
      };
    }

    const rawQty = Number(salvage.ingredientQuantity);
    const ingredientQuantity = Number.isFinite(rawQty) && rawQty >= 1 ? Math.floor(rawQty) : 1;

    // A set override replaces the system-level salvage default DC; null uses it. null/''/undefined
    // are guarded explicitly so re-normalizing a null stays null (`Number(null)` is a spurious 0).
    const dcOverride = (() => {
      const raw = salvage.dcOverride;
      if ([null, undefined, ''].includes(raw)) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    })();

    // HOISTED DELIBERATELY (issue 676). `enabled` is the first key of the literal
    // below and `resultGroups` used to be computed ~10 lines later, so clamping
    // `enabled` in place against the groups would read an uninitialized local.
    const normalizedGroups = Array.isArray(salvage.resultGroups)
      ? salvage.resultGroups.map((g) => this._normalizeSalvageResultGroup(g)).filter(Boolean)
      : [];

    // Simple-mode SUCCESS-FIRST retain-one clamp (issue 764). Routed, progressive and the
    // no-context default keep every group and the lower-bound-only `enabled` rule.
    const { salvageResolutionMode, salvageSimpleCheckHasFormula } = options;
    let resultGroups = normalizedGroups;
    let enabled = salvage.enabled === true && normalizedGroups.length > 0;
    if (salvageResolutionMode === 'simple') {
      const successGroup = normalizedGroups.find((g) => g.role !== 'failure');
      const failureGroup = normalizedGroups.find((g) => g.role === 'failure');
      const clamped = [];
      // Success group ALWAYS at index 0 — the engine's SUCCESS award is `slice(0, 1)` with no role
      // filter, so a failure-first input is re-ordered here. Unchanged by issue 1098, whose
      // failure award selects BY ROLE precisely so this guarantee stays the only thing relied on.
      if (successGroup) clamped.push(successGroup);
      // Reserved failure group tolerated ONLY with an authored Simple check formula.
      if (failureGroup && salvageSimpleCheckHasFormula === true) clamped.push(failureGroup);
      resultGroups = clamped;
      // A Simple config with no success group cannot be enabled: the success branch's
      // `slice(0, 1)` would otherwise award a lone `role: 'failure'` group on a PASSED check.
      enabled = salvage.enabled === true && successGroup != null;
    }

    return {
      // Requirement 5 (`data-models` → Component) is ENFORCED HERE, not by any UI control (issue
      // 676): the normalizer is the single chokepoint EVERY writer passes, and a control that
      // merely refuses to ENABLE a zero-group component cannot stop one BECOMING zero-group.
      enabled,
      // GM-authored policy: may a player reorder this salvage's progressive result
      // stages? Default TRUE (issue 651) — an absent key reads as `true`, which is why
      // the 1.17.0 migration does not seed it.
      allowPlayerResultReorder: salvage.allowPlayerResultReorder !== false,
      ingredientQuantity,
      dcOverride,
      // Preserve migrated salvage tool references so they are not orphaned on the
      // next system save. Coerced to trimmed, non-empty, deduped id strings.
      toolIds: this._normalizeToolIds(salvage.toolIds),
      resultGroups,
      // This component's own check-modifier pick (issue 1095), consulted only under `bySubject`.
      // Attached ONLY when authored, keyed on `Array.isArray` AT ENTRY: an authored EMPTY array is
      // a real pick of zero, distinct from an absent one which inherits the check default. It is
      // deliberately NOT keyed on the post-filter length.
      ...authoredCheckModifierIds(salvage.checkModifierIds),
      ...(salvage.outcomeRouting &&
        typeof salvage.outcomeRouting === 'object' && {
          outcomeRouting: { ...salvage.outcomeRouting },
        }),
      ...(salvage.timeRequirement &&
        typeof salvage.timeRequirement === 'object' && {
          timeRequirement: this._normalizeTimeRequirement(salvage.timeRequirement),
        }),
      ...(salvage.currencyRequirement &&
        typeof salvage.currencyRequirement === 'object' && {
          currencyRequirement: this._normalizeCurrencyRequirement(salvage.currencyRequirement),
        }),
    };
  }

  /** Normalize an array of library tool id strings to trimmed, non-empty, deduped strings,
   * tolerating non-array or nullish input. */
  _normalizeToolIds(toolIds) {
    if (!Array.isArray(toolIds)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of toolIds) {
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  _normalizeSalvageResult(result) {
    if (!result || typeof result !== 'object') return null;
    const compId = result.componentId || result.systemItemId;
    const quantityFormula = normalizeQuantityFormula(result.quantityFormula);
    return {
      id: result.id || foundry.utils.randomID(),
      componentId: compId || null,
      systemItemId: compId || null, // transitional alias
      quantity:
        Number.isFinite(Number(result.quantity)) && Number(result.quantity) >= 1
          ? Number(result.quantity)
          : 1,
      // Absence is the fixed-amount state, so `''` and whitespace collapse to it (issue 1645).
      ...(quantityFormula && { quantityFormula }),
      propertyMacroUuid: result.propertyMacroUuid || null,
    };
  }

  _normalizeSalvageResultGroup(group) {
    if (!group || typeof group !== 'object') return null;
    const results = Array.isArray(group.results)
      ? group.results.map((r) => this._normalizeSalvageResult(r)).filter(Boolean)
      : [];
    return {
      id: group.id || foundry.utils.randomID(),
      name: String(group.name || '').trim() || 'Result Group',
      // Preserve a reserved `role: 'failure'` group (issue 764). The editor never AUTHORS this
      // role, but import, copy-mode and migration can carry one, and the Simple-mode clamp
      // distinguishes success groups by it. Only the reserved value is emitted.
      ...(group.role === 'failure' && { role: 'failure' }),
      results,
    };
  }

  _normalizeTimeRequirement(time) {
    if (!time || typeof time !== 'object') return {};
    const result = {};
    for (const key of ['minutes', 'hours', 'days', 'months', 'years']) {
      const val = Number(time[key]);
      if (Number.isFinite(val) && val > 0) {
        result[key] = val;
      }
    }
    return result;
  }

  _normalizeCurrencyRequirement(currency) {
    if (!currency || typeof currency !== 'object') return {};
    const amount = Number(currency.amount);
    return {
      unit: String(currency.unit || '').trim() || 'gp',
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    };
  }

  // Normalise the alchemy sub-config for alchemy-mode systems.
  // Accepts both 'alchemy' (canonical) and 'cauldron' (T-189 legacy alias) so that persisted
  // data written before the rename continues to produce a valid config object on load.
  _normalizeAlchemyConfig(config, resolutionMode) {
    if (resolutionMode !== 'alchemy' && resolutionMode !== 'cauldron') return null; // T-189: accept both
    const c = config && typeof config === 'object' ? config : {};
    // System-level alchemy check mode, replacing the retired per-recipe `resultSelection.provider`:
    // `none` (a matched brew always succeeds), `simple` (mandatory pass/fail) or `tiered`
    // (mandatory routed check, identical routing to `routedByCheck`). Defaults to `none`.
    const checkMode = ['none', 'simple', 'tiered'].includes(c.checkMode) ? c.checkMode : 'none';
    return {
      checkMode,
      // Defaults ON (issue 966). Alchemy's `global` visibility mode reveals a recipe ONLY from
      // `learnedRecipes`, which only this flag ever writes, so an absent flag left the most
      // permissive-sounding mode revealing nothing. An explicitly stored `false` is honoured.
      learnOnCraft: c.learnOnCraft !== false,
      consumeOnFail: c.consumeOnFail !== false,
      showAttemptHistoryToPlayers: c.showAttemptHistoryToPlayers !== false,
    };
  }

  _normalizeEssenceQuantities(essences = {}, validEssenceIds = null) {
    const output = {};
    if (!essences || typeof essences !== 'object') return output;
    const validIds = validEssenceIds instanceof Set ? validEssenceIds : null;

    for (const [rawKey, rawValue] of Object.entries(essences)) {
      const key = String(rawKey || '').trim();
      if (!key) continue;
      if (validIds && !validIds.has(key)) continue;

      const qty = Number(rawValue);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      output[key] = qty;
    }
    return output;
  }

  /** Persist a crafting-system mutation through the definition repository (issue 1089).
   * Argument-less `save()` stays the whole-corpus write, which two unbounded callers still need;
   * every other site names what it touched, scoping the revision advance to it (issue 1078). A
   * named save also says WHICH CLASSES OF FACT it moved, and omitting `domains` means "every
   * domain". For a `batch`, `domains` may be PER RECORD, keyed by record id. */
  async save(change = null) {
    // The revision-token advance point for the systems entity scope (issue 1076). `save()` is this
    // manager's single persistence chokepoint, so announcing the change once here beats auditing
    // every mutating method for a missing advance. A whole-corpus save advances every system,
    // because it is exactly the case where the manager was not told what moved.
    const touched = this._savedSystemIds(change);
    this._advanceSystemRevision(...touched);
    for (const systemId of touched) {
      this._attributeChange(domainsForRecord(change, systemId), systemId);
    }
    await applyDefinitionChange(this._repository, change, this.systems.values());
  }

  /** The system ids one {@link save} touched. */
  _savedSystemIds(change) {
    if (change?.put?.id != null) return [change.put.id];
    if (change?.delete != null) return [change.delete];
    if (change?.batch) return [...change.batch].map((record) => record?.id);
    return [...this.systems.keys()];
  }

  /** Advance the `facts:<domain>:<systemId>` token of every named pair (issue 1078 part B1). An
   * omitted `domains` set means every domain and an EXPLICIT empty one means unattributable;
   * both advance every fact scope, because in neither case can a fact class be ruled out. */
  _advanceFactScopes(domains, ...systemIds) {
    const advanced =
      Array.isArray(domains) && domains.length > 0 ? domains : ALL_INVALIDATION_DOMAINS;
    for (const systemId of systemIds) {
      if (systemId == null) continue;
      this._revisions.advance(...advanced.map((domain) => REVISION_SCOPES.facts(domain, systemId)));
    }
  }

  /** Attribute a LOCAL mutation: advance its fact scopes and record it for
   * {@link _notifySystemsChanged} to drain into the change signal. */
  _attributeChange(domains, ...systemIds) {
    this._advanceFactScopes(domains, ...systemIds);
    this._pendingDomains.record(domains, ...systemIds);
  }

  /** The domains a REPLACEMENT of one stored system belongs to, read off the fields that moved.
   * `updateSystem` is the one site whose attribution cannot be a constant — it accepts an
   * arbitrary patch — so it derives one through the same {@link corpusDelta} the replication
   * path uses. */
  _domainsForSystemEdit(previous, next) {
    if (!previous || !next) return [...ALL_INVALIDATION_DOMAINS];
    const delta = corpusDelta([previous], [next]);
    if (delta.reordered) return [...ALL_INVALIDATION_DOMAINS];
    const entry = [...delta.perRecord.values()][0];
    return entry ? domainsForSystemFields(entry.fields) : [];
  }

  /** Re-read the persisted crafting-systems setting into the in-memory map — the un-guarded,
   * non-persisting refresh path for a replicated change on ANOTHER client. {@link corpusDelta}
   * (issues 1076, 1078) advances only the systems that changed and PRESERVES CONTAINER IDENTITY,
   * so an unchanged system keeps the array references the retained indexes are keyed on. A
   * reordering replaces the map, preserves no identity and advances every system. */
  reload() {
    // Optional repository capability: `null` means the backend has no synchronous
    // replicated snapshot to read (see `CraftingDefinitionRepository`), so reloading
    // is a no-op rather than a wrong answer.
    const saved = this._repository.readReplicatedSnapshot();
    // Every reload replaces the pending delta, including a reload that reads nothing, so a
    // stale delta can never be consumed after a later one.
    this._reloadDelta = null;
    if (!saved) return false;
    const next = new Map();
    for (const normalized of saved) {
      next.set(normalized.id, normalized);
    }
    const delta = corpusDelta(this.systems.values(), next.values());
    this._reloadDelta = delta;
    this.initialized = true;
    if (!delta.changed) return false;

    if (delta.reordered) {
      this.systems = next;
      this._advanceSystemRevision(...next.keys());
      // Attributable to no record, so to no fact class either (issue 1078 part B1).
      this._advanceFactScopes([], ...next.keys());
      return true;
    }

    patchCorpusInPlace(this.systems, next, delta);
    this._advanceSystemRevision(...delta.perRecord.keys());
    for (const [systemId, entry] of delta.perRecord) {
      this._advanceFactScopes(domainsForSystemFields(entry.fields), systemId);
    }
    return true;
  }

  /** The delta from the most recent {@link reload}, cleared by this read (issue 1078). One-shot on
   * purpose: a consumer re-reading a retained delta would invalidate work twice for one change,
   * and the NEXT reload clears it too, so no stale delta is ever readable. */
  consumeReloadDelta() {
    const delta = this._reloadDelta;
    this._reloadDelta = null;
    return delta;
  }

  /** The invalidation scopes of the most recent REPLICATED change, consumed from its delta (issue
   * 1078 part B1) — the systems-side sibling of
   * {@link RecipeManager#consumeReplicatedChangeScopes}. A crafting system IS the record, so its
   * id is the scope owner directly; a `reordered` delta yields NO scopes and routes broadly. */
  consumeReplicatedChangeScopes() {
    const delta = this.consumeReloadDelta();
    if (!delta?.changed || delta.reordered) return [];
    return [...delta.perRecord].map(([systemId, entry]) => ({
      systemId,
      domains: domainsForSystemFields(entry.fields),
    }));
  }

  /** The current revision token of one scope (issue 1076) — the read half of the contract in
   * {@link module:revisionTokens}. Consumers hold a token and compare it with `===`; they never
   * advance one. */
  revision(scope = REVISION_SCOPES.systems) {
    return this._revisions.read(scope);
  }

  /**
   * Advance the crafting-system revision tokens after a mutation.
   *
   * @param {...(string|null|undefined)} systemIds The systems this mutation touched.
   * @returns {void}
   * @private
   */
  _advanceSystemRevision(...systemIds) {
    const scopes = systemIds
      .filter((systemId) => systemId != null)
      .map((systemId) => REVISION_SCOPES.system(systemId));
    this._revisions.advance(REVISION_SCOPES.systems, ...scopes);
  }

  getSystems() {
    return [...this.systems.values()];
  }

  getSystem(systemId) {
    return this.systems.get(systemId) || null;
  }

  /**
   * The ENABLED-and-disabled recipe set belonging to a system — half of the
   * `{getSystem, getRecipesForSystem, getComponentsForSystem}` contract {@link SignatureValidator}
   * documented but which no runtime object implemented, so seven call sites hand-rolled an ad-hoc
   * adapter closure (issue 1072). Several of those deliberately stay and now differ from a named
   * baseline instead of from each other. Filtering on `enabled` is the validator's own job, so
   * this accessor stays unfiltered.
   */
  getRecipesForSystem(systemId) {
    if (!systemId) return [];
    return this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) ?? [];
  }

  /**
   * The managed component library of a system — the other half of the
   * {@link SignatureValidator} contract (issue 1072). Returns the LIVE array rather than a copy,
   * matching every adapter closure it replaces; copying would be a silent behaviour change on the
   * signature path and a per-call O(components) allocation on the exact scan this bounds, so
   * callers must not mutate it. ANSWERS THROUGH THE READ UNION since issue 1370, and the live-array
   * contract survives: an absent, unloaded, empty or unreadable world half returns
   * `system.components` ITSELF, and a present one a memoized union with stable identity.
   */
  getComponentsForSystem(systemId) {
    return this.resolveScopedComponents(this.getSystem(systemId));
  }

  /** The essence definitions of a system. KEEPS ITS DEFENSIVE COPY (issue 1370): the read union's
   * unknown-half passthrough answers the in-system array itself, which this spread discards
   * deliberately, because the copy is a shipped contract of this accessor and removing it would
   * silently change every caller that sorts or splices the answer. */
  getEssenceDefinitions(systemId) {
    return [...this.resolveScopedEssences(this.getSystem(systemId))];
  }

  /** The first-class tool library of a system, the tool-side twin of
   * {@link getComponentsForSystem} (issue 1370). NEW with the consumer sweep — every tool reader
   * previously indexed `system.tools` directly — and like the component accessor it returns the
   * LIVE array when there is no world half. */
  getToolsForSystem(systemId) {
    return this.resolveScopedTools(this.getSystem(systemId));
  }

  /** One essence definition by id, read off the retained `byId` facet of
   * {@link module:definitionIndex} rather than by scanning (issue 1076). The facet is built
   * first-insert-wins in array order, so a duplicate id resolves to the same definition the
   * previous `.find()` returned. */
  getEssenceDefinition(systemId, essenceId) {
    const system = this.getSystem(systemId);
    if (!system || !essenceId) return null;
    return findById(getDefinitionIndex(this.resolveScopedEssences(system)), essenceId);
  }

  getRecipeItemDefinitions(systemId) {
    const system = this.getSystem(systemId);
    if (!system) return [];
    return Array.isArray(system.recipeItemDefinitions) ? [...system.recipeItemDefinitions] : [];
  }

  /**
   * One recipe-item (book/scroll) definition by id — indexed exactly as
   * {@link CraftingSystemManager#getEssenceDefinition} is (issue 1076).
   *
   * @param {string} systemId
   * @param {string} recipeItemId
   * @returns {object|null}
   */
  getRecipeItemDefinition(systemId, recipeItemId) {
    const system = this.getSystem(systemId);
    if (!system || !recipeItemId) return null;
    return findById(getDefinitionIndex(system.recipeItemDefinitions), recipeItemId);
  }

  getRecipesUsingRecipeItemDefinition(systemId, recipeItemId) {
    const definition = this.getRecipeItemDefinition(systemId, recipeItemId);
    if (!definition || !this.recipeManager?.getRecipes) return [];

    return this._getRecipeObjectsReferencingRecipeItemDefinition(systemId, definition).map(
      (recipe) => ({
        id: recipe.id,
        name: recipe.name || 'Unnamed Recipe',
      })
    );
  }

  /** The authoring and browse accessor for a system's managed items, DELIBERATELY NOT REPOINTED at
   * issue 1370: this is the surface the GM authors against, so it answers the PERSISTED record
   * rather than a merged read row, which would offer a row for editing that no writer can save
   * back. {@link getComponentsForSystem} is the repointed read accessor. */
  getItems(systemId, search = '') {
    const system = this.getSystem(systemId);
    if (!system) return [];
    const managedItems = system.components || [];
    if (!search) return [...managedItems];
    const q = search.toLowerCase();
    return managedItems.filter((item) => {
      const registeredItemUuid = item.originItemUuid || item.registeredItemUuid || '';
      const sourceOrigin = registeredItemUuid.startsWith('Compendium.')
        ? 'compendium'
        : registeredItemUuid.startsWith('Item.')
          ? 'items directory'
          : registeredItemUuid
            ? 'unknown'
            : '';
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.registeredItemUuid || '').toLowerCase().includes(q) ||
        (item.originItemUuid || '').toLowerCase().includes(q) ||
        (Array.isArray(item.tags) &&
          item.tags.some((tag) =>
            String(tag || '')
              .toLowerCase()
              .includes(q)
          )) ||
        sourceOrigin.includes(q)
      );
    });
  }

  /**
   * Reconcile a recipe's legacy `recipeItemId` scalar against the many-to-many book membership
   * that superseded it. Runs un-gated on every `initialize()`, so both halves are idempotent and
   * converge on the first pass, sharing ONE walk and one save per setting — a second write here
   * is the issue-970 failure mode below. It mints a definition and stamps the scalar for a recipe
   * retaining a standalone `linkedRecipeItemUuid`, and clears a leaked scalar (issue 978) for a
   * recipe that IS a book member, where four legacy resolvers read it ahead of an authored
   * `recipe.img` (issue 887). The two cohorts never overlap.
   */
  async _migrateLegacyRecipeItems() {
    if (!this.recipeManager?.getRecipes || !this.recipeManager?.save) return false;

    let systemsChanged = false;
    let recipesChanged = false;

    for (const system of this.getSystems()) {
      if (!Array.isArray(system.recipeItemDefinitions)) {
        system.recipeItemDefinitions = [];
      }

      const definitions = system.recipeItemDefinitions;
      const usedIds = new Set(definitions.map((def) => def.id));
      const bySource = new Map(
        definitions.filter((def) => def.originItemUuid).map((def) => [def.originItemUuid, def])
      );

      const recipes = this.recipeManager.getRecipes({ craftingSystemId: system.id });

      for (const recipe of recipes) {
        // Half 2 (issue 978), before the mint-and-stamp read below so a cleared recipe
        // falls straight through: it has no `linkedRecipeItemUuid`, so it is not a
        // re-stamp candidate and the repair converges on this pass.
        if (
          recipe?.recipeItemId &&
          !String(recipe?.linkedRecipeItemUuid || '').trim() &&
          definitions.some((def) =>
            (Array.isArray(def.recipeIds) ? def.recipeIds : []).some(
              (id) => String(id) === String(recipe.id)
            )
          )
        ) {
          recipe.recipeItemId = null;
          recipesChanged = true;
        }

        const hasValidRecipeItemId =
          recipe?.recipeItemId && definitions.some((def) => def.id === recipe.recipeItemId);
        if (hasValidRecipeItemId) continue;

        const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
        if (!legacyUuid) continue;

        let definition = bySource.get(legacyUuid);
        if (!definition) {
          let source;
          try {
            source = typeof fromUuidSync === 'function' ? fromUuidSync(legacyUuid) : null;
          } catch {
            source = null;
          }

          definition = this._normalizeRecipeItemDefinition(
            await this._buildRecipeItemSourceSnapshot(legacyUuid, source, {
              name: recipe?.name || 'Recipe Item',
              img: recipe?.img || 'icons/svg/item-bag.svg',
              description: recipe?.description || '',
            }),
            usedIds
          );
          if (!definition) continue;

          usedIds.add(definition.id);
          definitions.push(definition);
          if (definition.originItemUuid) {
            bySource.set(definition.originItemUuid, definition);
          }
          systemsChanged = true;
        }

        if (recipe.recipeItemId !== definition.id) {
          recipe.recipeItemId = definition.id;
          recipesChanged = true;
        }
      }
    }

    // `save()` / `recipeManager.save()` write WORLD settings only a GM may update, and this pass
    // runs from `initialize()` — BEFORE `runStartupMaintenance`'s error isolation — so on a player
    // client the rejection escapes, `this.initialized` never flips, and every facade method throws
    // for the rest of the session (the issue-970 failure mode). The in-memory pass above stays
    // ungated so a player's loaded systems/recipes remain self-consistent for this session.
    if (!this._isActiveGM()) return false;
    if (systemsChanged) await this.save({ domains: RECIPE_ITEM_FACTS });
    if (recipesChanged) await this.recipeManager.save();
    return systemsChanged || recipesChanged;
  }

  async createSystem(data = {}) {
    this._assertGM('create crafting system');
    const system = this._normalizeSystem(data);
    this._assertValidSystemId(system.id);
    this._assertUniqueComponentSourcesForSystem(system);
    this.systems.set(system.id, system);
    await this.save({ put: system, domains: ALL_INVALIDATION_DOMAINS });
    this._notifySystemsChanged();
    return system;
  }

  async addRecipeItemFromUuid(systemId, itemUuid) {
    this._assertGM('add recipe item from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    let source;
    try {
      source = await fromUuid(itemUuid);
    } catch {
      source = null;
    }

    if (source && source.documentName && source.documentName !== 'Item') {
      throw new Error(`Cannot add non-Item document (${source.documentName}) as a recipe item`);
    }

    // The durable per-system recipe-item identity leaf `roles.<system.id>.recipeItemDefinitionId`
    // (issue 567). A dotted/unsafe id yields null, so every stamp/clear below is skipped and the
    // recipe item resolves through the legacy-scalar + raw-reference fall-through, exactly like a
    // component under an unsafe id.
    const roleFlagKey = this._recipeItemRoleFlagKey(system.id);

    const snapshot = await this._buildRecipeItemSourceSnapshot(itemUuid, source);
    const existing = this._findRecipeItemDefinitionForSource(system, snapshot, source);
    if (existing) {
      const unchanged =
        existing.name === snapshot.name &&
        existing.img === snapshot.img &&
        existing.description === snapshot.description &&
        existing.originItemUuid === snapshot.originItemUuid;

      // Stamp the durable identity leaf (and strip a clone's stale `_stats`) on BOTH
      // the skipped and updated branches. This makes `skipped` a user-accessible
      // recovery path: re-registering an unchanged definition whose source predates
      // the flag still stamps and strips it (issue 555).
      const previousSourceUuid = existing.originItemUuid;
      if (roleFlagKey) await this._stampSourceIdentity(source, roleFlagKey, existing.id);

      if (unchanged) {
        return { item: existing, action: 'skipped' };
      }

      existing.name = snapshot.name;
      existing.img = snapshot.img;
      existing.description = snapshot.description;
      existing.originItemUuid = snapshot.originItemUuid;
      // An element's indexed fields (`name`, source refs) changed at constant array
      // length, which neither the array-identity nor the length clause of the
      // `definitionIndex` invalidation rule can see. Advance explicitly.
      advanceDefinitionRevision(system.recipeItemDefinitions);

      await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
      // A source-uuid change is a re-point: clear ONLY the durable per-system leaf off the old
      // source document so it no longer claims this definition — never the whole `roles` flag
      // nor the whole `roles[systemId]` object (that would destroy sibling componentId/toolId).
      if (roleFlagKey && previousSourceUuid && previousSourceUuid !== snapshot.originItemUuid) {
        await this._clearSourceFlag(previousSourceUuid, roleFlagKey, existing.id);
      }
      return { item: existing, action: 'updated' };
    }

    const recipeItemDefinitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    const item = this._normalizeRecipeItemDefinition(
      snapshot,
      new Set(recipeItemDefinitions.map((def) => def.id))
    );
    recipeItemDefinitions.push(item);
    advanceDefinitionRevision(recipeItemDefinitions);
    system.recipeItemDefinitions = recipeItemDefinitions;

    if (roleFlagKey) await this._stampSourceIdentity(source, roleFlagKey, item.id);
    await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
    return { item, action: 'added' };
  }

  /**
   * Register a first-class Tool DIRECTLY from an Item uuid (issue 561), with NO component import
   * required: resolve the source Item, build the tool source snapshot, push a `componentId: null`
   * first-class tool onto `system.tools`, and stamp the durable `roles[systemId].toolId` exactly
   * as the sibling `*FromUuid` methods stamp their kinds. GM-gated, dotted-id-safe (a null flag
   * key skips the write), and save-persisted.
   */
  async addToolFromUuid(systemId, itemUuid) {
    return this.upsertTool(systemId, {}, { itemUuid });
  }

  async _resolveToolSourceItem(itemUuid) {
    let source;
    try {
      source = await fromUuid(itemUuid);
    } catch {
      source = null;
    }
    if (!source || source.documentName !== 'Item') {
      throw new Error(
        `Cannot register Tool source "${itemUuid}": resolved document is not an Item`
      );
    }
    return source;
  }

  _findToolForUpsert(tools, data, snapshot, source, flagKey) {
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

  _sourceFlagState(source, flagKey) {
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

  async _resolveStrictSourceFlagState(registeredItemUuid, flagKey) {
    if (!registeredItemUuid) return null;
    const source = await fromUuid(registeredItemUuid);
    if (!source || source.pack || typeof source.unsetFlag !== 'function') return null;
    return this._sourceFlagState(source, flagKey);
  }

  async _restoreSourceFlag({ source, flagKey, value }) {
    const current = getFabricateFlag(source, flagKey, MISSING_SOURCE_FLAG);
    if (current === value) return;
    if (value !== MISSING_SOURCE_FLAG) {
      await setFabricateFlag(source, flagKey, value);
      return;
    }
    if (current === MISSING_SOURCE_FLAG || typeof source?.unsetFlag !== 'function') return;
    await source.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${flagKey}`);
  }

  async _restoreSourceProvenance({ source, provenance }) {
    if (!provenance || typeof source?.update !== 'function') return;
    const patch = {};
    for (const [key, previous] of Object.entries(provenance)) {
      const present = Object.prototype.hasOwnProperty.call(source?._stats ?? {}, key);
      const current = source?._stats?.[key];
      if (previous.present) {
        if (!present || current !== previous.value) patch[`_stats.${key}`] = previous.value;
      } else if (present) {
        patch[`_stats.-=${key}`] = null;
      }
    }
    if (Object.keys(patch).length > 0) await source.update(patch);
  }

  async _rollbackToolTransaction(system, previousTools, sourceFlagStates, cause) {
    const errors = [cause];
    system.tools = previousTools;
    for (let index = sourceFlagStates.length - 1; index >= 0; index -= 1) {
      const state = sourceFlagStates[index];
      try {
        await this._restoreSourceFlag(state);
      } catch (error) {
        errors.push(error);
      }
      try {
        await this._restoreSourceProvenance(state);
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await this.save({ put: system, domains: TOOL_FACTS });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Tool transaction failed and rollback was incomplete');
    }
    throw cause;
  }

  async _applyToolSourceFlagChanges({
    system,
    previousTools,
    source,
    previousSourceUuid,
    nextSourceUuid,
    flagKey,
    toolId,
  }) {
    if (!source || !flagKey) return;
    const sourceFlagStates = [];
    try {
      const nextSourceState = this._sourceFlagState(source, flagKey);
      const previousSourceState =
        previousSourceUuid && previousSourceUuid !== nextSourceUuid
          ? await this._resolveStrictSourceFlagState(previousSourceUuid, flagKey)
          : null;
      sourceFlagStates.push(nextSourceState);
      await this._stampSourceIdentity(source, flagKey, toolId);
      if (previousSourceState?.value === toolId) {
        sourceFlagStates.push(previousSourceState);
        await previousSourceState.source.unsetFlag(
          FABRICATE_FLAG_NAMESPACE,
          `fabricate.${flagKey}`
        );
      }
    } catch (error) {
      await this._rollbackToolTransaction(system, previousTools, sourceFlagStates, error);
    }
  }

  /** Persist one normalized Tool, optionally registering or relinking its Item source.
   * Source resolution and snapshot construction finish before the system is mutated;
   * a failed settings write restores the prior Tool array and performs no flag writes. */
  async upsertTool(systemId, data = {}, { itemUuid } = {}) {
    this._assertGM('add tool from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const flagKey = this._toolRoleFlagKey(system.id);
    const hasSourceRequest = typeof itemUuid === 'string' && !!itemUuid.trim();
    const source = hasSourceRequest ? await this._resolveToolSourceItem(itemUuid.trim()) : null;
    const snapshot = source ? await this._buildToolSourceSnapshot(itemUuid.trim(), source) : null;
    const tools = Array.isArray(system.tools) ? system.tools : [];
    const existing = this._findToolForUpsert(tools, data, snapshot, source, flagKey);
    // Issue 1308: the SAME Valid Id Basis `_normalizeSystem` uses, and derived through the same
    // helper rather than rebuilt here. This site is easy to miss and expensive to get wrong: it
    // does not go through `_normalizeSystem`, so before the fix it read the world-scoped library
    // off `system.characterPrerequisites`, found nothing, and handed `_normalizeToolPrerequisites`
    // a real-but-empty Set — which its own unknown-basis sentinel cannot refuse. Every Tool save
    // would then strip that tool's prerequisite ids and flip its gate off, in a fully migrated,
    // otherwise healthy world.
    const { prerequisiteIds: validPrerequisiteIds } = this._characterLibraryBasis(system);
    const staged = this._normalizeTool(
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
      await this.save({ put: system, domains: TOOL_FACTS });
    } catch (error) {
      system.tools = previousTools;
      throw error;
    }

    const previousSourceUuid = existing?.registeredItemUuid || existing?.originItemUuid || null;
    await this._applyToolSourceFlagChanges({
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

  /** Remove a Tool from `system.tools` and clear ONLY its durable `roles[systemId].toolId` leaf
   * from the source Item (issue 561, D7). The per-role leaf clear preserves any sibling
   * `roles[systemId].componentId` — the whetstone-coexistence guarantee — so it MUST NOT clear
   * the whole `roles[systemId]` object. GM-gated, save-persisted. */
  async deleteTool(systemId, toolId) {
    this._assertGM('delete tool');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const tools = Array.isArray(system.tools) ? system.tools : [];
    const tool = tools.find((entry) => String(entry?.id) === String(toolId)) || null;
    if (!tool) return { deleted: false };

    const previousTools = system.tools;
    system.tools = tools.filter((entry) => String(entry?.id) !== String(toolId));
    try {
      await this.save({ put: system, domains: TOOL_FACTS });
    } catch (error) {
      system.tools = previousTools;
      throw error;
    }

    const flagKey = this._toolRoleFlagKey(system.id);
    const registeredItemUuid = tool.registeredItemUuid || tool.originItemUuid || null;
    if (flagKey && registeredItemUuid) {
      const sourceFlagStates = [];
      try {
        const state = await this._resolveStrictSourceFlagState(registeredItemUuid, flagKey);
        if (state?.value === tool.id) {
          sourceFlagStates.push(state);
          await state.source.unsetFlag(FABRICATE_FLAG_NAMESPACE, `fabricate.${flagKey}`);
        }
      } catch (error) {
        await this._rollbackToolTransaction(system, previousTools, sourceFlagStates, error);
      }
    }
    return { deleted: true };
  }

  async deleteRecipeItemDefinition(systemId, recipeItemId) {
    this._assertGM('delete recipe item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definition = this.getRecipeItemDefinition(systemId, recipeItemId);
    if (!definition) {
      return {
        deleted: false,
        affectedRecipes: [],
      };
    }

    const affectedRecipeObjects = this._getRecipeObjectsReferencingRecipeItemDefinition(
      systemId,
      definition
    );
    const affectedRecipes = affectedRecipeObjects.map((recipe) => ({
      id: recipe.id,
      name: recipe.name || 'Unnamed Recipe',
    }));

    system.recipeItemDefinitions = (system.recipeItemDefinitions || []).filter(
      (item) => item.id !== recipeItemId
    );

    for (const recipe of affectedRecipeObjects) {
      recipe.recipeItemId = null;
      recipe.linkedRecipeItemUuid = null;
    }

    await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
    if (affectedRecipeObjects.length > 0 && this.recipeManager?.save) {
      await this.recipeManager.save();
    }

    return {
      deleted: true,
      definition: { ...definition },
      affectedRecipes,
    };
  }

  // Update a recipe item definition's per-item caps and enable state (issue 511).
  // A definition's identity (name/img/originItemUuid) is managed by the recipe-item
  // linking flow and is not editable here. The patch's `item`/`learn` partials merge
  // over the current caps, then the whole block is re-normalized (uncapped defaults,
  // finite/positive clamps, legacy/new field sync) via `_normalizeRecipeItemCaps`.
  // An `enabled` patch toggles the definition's enable flag.
  async updateRecipeItemDefinition(systemId, recipeItemId, patch = {}) {
    this._assertGM('update recipe item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definition = this.getRecipeItemDefinition(systemId, recipeItemId);
    if (!definition) throw new Error(`Recipe item definition not found: ${recipeItemId}`);

    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      definition.enabled = patch.enabled !== false;
    }

    // Book membership (issue 511 many-to-many): replace the contained-recipe id set.
    //
    // This is the SINGLE choke point for the membership-basis marker (issue 1011): the
    // Contents tab (`CraftingSystemManagerRoot` → `adminStore.saveRecipeItem`),
    // `adminStore.setRecipeBookMembership` and the recipe browser's bulk book axis all
    // land here, and none of them re-runs `_normalizeSystem` — so setting the marker at
    // a store instead would leave the writing client reading `false` against a
    // non-empty array while every peer, catching up through `reload()`, read `true`.
    if (Object.prototype.hasOwnProperty.call(patch, 'recipeIds')) {
      // Seed BEFORE the marker flips and before this definition's array is replaced, so
      // the legacy resolution is still the live basis while it is being read across.
      // Without it the marker would close the revert direction but make the ORPHANING
      // direction permanent: every OTHER definition's scalar-only members would be
      // stranded by this one write, recoverable only by re-authoring each book by hand.
      this._seedMembershipFromLegacyScalars(system);
      definition.recipeIds = this._normalizeMembershipRecipeIds(patch.recipeIds);
      system.membershipResolvesByRecipeIds = true;
      // `recipeIds` backs the reverse membership index, and it was rewritten in place on
      // an element of an array whose identity and length are unchanged (issue 1076).
      advanceDefinitionRevision(system.recipeItemDefinitions);
    }

    const capsPatch = patch?.caps || {};
    definition.caps = this._normalizeRecipeItemCaps({
      item: this._mergeCapsSection(definition.caps?.item, capsPatch.item, [
        ['whenSpent', 'destroyWhenExhausted'],
      ]),
      learn: this._mergeCapsSection(definition.caps?.learn, capsPatch.learn, [
        ['limitLearning', 'limitRecipes'],
        ['learnsAllowed', 'maxRecipes'],
      ]),
    });

    await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
    return { item: { ...definition } };
  }

  /**
   * Coerce a book-membership id list to the canonical persisted shape: trimmed, non-empty, deduped
   * strings. Every writer of `recipeItemDefinitions[].recipeIds` produces the same shape, because
   * the six membership readers all match by exact string equality, so a whitespace-padded id
   * written by a second path would simply stop matching. Deliberately NOT named `…IdList`: the
   * imported `normalizeSelectionIds` coerces a SELECTION of recipe ids, and near-homographs on one
   * class are invisible at a call site.
   */
  _normalizeMembershipRecipeIds(recipeIds) {
    return [
      ...new Set(
        (Array.isArray(recipeIds) ? recipeIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      ),
    ];
  }

  /**
   * Carry a system's legacy scalar membership onto the canonical
   * `recipeItemDefinitions[].recipeIds` arrays, in memory (issue 1011). Run by the write that
   * FIRST sets `membershipResolvesByRecipeIds`, before the requested change is applied, and a
   * no-op once the marker is set. This is `migrateInvertRecipeItemLink`'s PUSH half re-run at
   * first-write time, WITHOUT its delete half, because `_migrateLegacyRecipeItems` re-stamps the
   * scalar on every client so no clear is durable. It resolves through the shared
   * `resolveLegacyMembershipDefinition` (issue 1155) — the same function every legacy READER
   * uses, because a seed resolving differently would CHANGE membership as the basis switches.
   */
  _seedMembershipFromLegacyScalars(system) {
    if (!system || system.membershipResolvesByRecipeIds === true) return false;
    const definitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    if (definitions.length === 0) return false;

    const { byId, bySource } = this._indexRecipeItemDefinitionsForLegacySeed(definitions);
    // The seed's own indexes, handed to the shared rule as DATA ACCESS. The rule stays one
    // implementation; only the way a definition is found differs, because this path
    // resolves every recipe in the system in one pass rather than one recipe per read.
    const legacyLookups = {
      byDefinitionId: (_definitions, definitionId) => byId.get(definitionId) ?? null,
      byOriginItemUuid: (_definitions, originItemUuid) => bySource.get(originItemUuid) ?? null,
    };

    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system.id }) ?? [];
    let seeded = false;
    for (const recipe of Array.isArray(recipes) ? recipes : []) {
      const recipeId = String(recipe?.id || '').trim();
      if (!recipeId) continue;

      const definition = resolveLegacyMembershipDefinition(definitions, recipe, legacyLookups);
      if (!definition || definition.recipeIds.includes(recipeId)) continue;

      definition.recipeIds.push(recipeId);
      seeded = true;
    }
    // Membership was seeded into elements in place, so the reverse membership index must
    // be rebuilt on the next read (issue 1076).
    if (seeded) advanceDefinitionRevision(definitions);
    return seeded;
  }

  /** Index a system's recipe item definitions for
   * {@link CraftingSystemManager#_seedMembershipFromLegacyScalars}: by the definition's own id
   * (for a recipe's `recipeItemId`) and by `originItemUuid` (for a `linkedRecipeItemUuid`). Also
   * ensures every definition carries a `recipeIds` array before the caller seeds into it. */
  _indexRecipeItemDefinitionsForLegacySeed(definitions) {
    const byId = new Map();
    const bySource = new Map();
    for (const def of definitions) {
      if (!def || typeof def !== 'object') continue;
      if (!Array.isArray(def.recipeIds)) def.recipeIds = [];
      const id = String(def.id || '').trim();
      if (id && !byId.has(id)) byId.set(id, def);
      const source = String(def.originItemUuid || '').trim();
      if (source && !bySource.has(source)) bySource.set(source, def);
    }
    return { byId, bySource };
  }

  // Merge a caps patch over the stored caps sub-block while keeping the legacy/new
  // mirror pairs consistent (issue 511, PR-B). When a patch sets ONE member of a
  // mirror pair (e.g. legacy `limitRecipes` from the old UI, or new `limitLearning`
  // from the redesigned UI), the stored sibling would otherwise win in the
  // normalizer and revert the change, so drop the un-patched sibling here and let
  // `_normalizeRecipeItemCaps` re-derive it from the patched value.
  _mergeCapsSection(base = {}, patch = {}, mirrorPairs = []) {
    const merged = { ...base, ...patch };
    for (const pair of mirrorPairs) {
      const patchedMembers = pair.filter((field) =>
        Object.prototype.hasOwnProperty.call(patch, field)
      );
      if (patchedMembers.length === 0) continue;
      for (const field of pair) {
        if (!patchedMembers.includes(field)) delete merged[field];
      }
    }
    return merged;
  }

  async updateSystem(systemId, updates = {}) {
    this._assertGM('update crafting system');
    const current = this.getSystem(systemId);
    if (!current) throw new Error(`Crafting system not found: ${systemId}`);

    const mergedFeatures = {
      ...current.features,
      ...updates.features,
      recipeCategories: true,
      categories: true,
      itemTags: true,
    };
    if (Object.prototype.hasOwnProperty.call(updates, 'enableEssences')) {
      mergedFeatures.essences = updates.enableEssences === true;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'enableMultiStepRecipes')) {
      mergedFeatures.multiStepRecipes = updates.enableMultiStepRecipes === true;
    }

    const mergedInput = {
      ...current,
      ...updates,
      id: systemId,
      features: mergedFeatures,
      itemTags: Object.prototype.hasOwnProperty.call(updates, 'itemTags')
        ? updates.itemTags
        : Object.prototype.hasOwnProperty.call(updates, 'tags')
          ? updates.tags
          : current.itemTags,
      essenceDefinitions: Object.prototype.hasOwnProperty.call(updates, 'essenceDefinitions')
        ? updates.essenceDefinitions
        : Object.prototype.hasOwnProperty.call(updates, 'essences')
          ? updates.essences
          : current.essenceDefinitions,
      recipeItemDefinitions: Object.prototype.hasOwnProperty.call(updates, 'recipeItemDefinitions')
        ? updates.recipeItemDefinitions
        : Object.prototype.hasOwnProperty.call(updates, 'recipeItems')
          ? updates.recipeItems
          : current.recipeItemDefinitions,
    };

    const merged = this._normalizeSystem(mergedInput);
    this._assertUniqueComponentSourcesForSystem(merged);
    const fromMode = current.resolutionMode || 'simple';
    const toMode = merged.resolutionMode || 'simple';
    const resolutionModeChanged = fromMode !== toMode;

    // #99 / spec 007 §"Alchemy Uniqueness Revalidation": an edit to an ALREADY-alchemy system that
    // introduces an ingredient signature collision must BLOCK the save globally, including saves
    // from unrelated recipe edits. The PROPOSED merged system is validated BEFORE persisting, so a
    // rejected update never leaves the colliding state anywhere. A resolution-mode CHANGE into
    // alchemy is excluded: that follows migration policy below, which migrates recipes and
    // DISABLES any that collide rather than hard-blocking the mode switch.
    if (toMode === 'alchemy' && !resolutionModeChanged) {
      this._assertNoAlchemySignatureCollisions(merged);
    }

    // Move the crafting-check config between the shared `simple` and tier-routing
    // `routed` slots when the mode crosses the `routedByIngredients` boundary, BEFORE
    // the first persist — `routedByIngredients` reads `craftingCheck.simple`, the other
    // routed mode (`routedByCheck`) reads `craftingCheck.routed`. Mutates `merged` in
    // place, guarded to fill only an unauthored destination.
    if (resolutionModeChanged) {
      this._reconcileCraftingCheckSlotsForModeChange(merged, fromMode, toMode);
    }

    // Persist the merged system FIRST so recipe migration/validation reads the NEW
    // mode through the in-memory `systems` map (e.g. `RecipeManager` activation and
    // routed-provider validation consult the current system).
    this.systems.set(systemId, merged);
    await this.save({ put: merged, domains: this._domainsForSystemEdit(current, merged) });

    // Migration-first mode change: migrate recipes to fit the new mode wherever
    // possible and delete ONLY those a per-recipe structural constraint of the new
    // mode rules out. System-level gaps (no progressive/routed check, alchemy
    // signature collisions, ...) never delete here — the system-validation
    // aggregator surfaces them and they gate visibility, not deletion.
    if (resolutionModeChanged) {
      await this._migrateRecipesForModeChange(systemId, fromMode, toMode, merged);
    }

    // Path 1: Mode change -- disable invalid salvage configs. This mutates `merged`
    // in place AFTER the early save above, so persist again when anything changed.
    // Simple-mode components are NOT disabled here on group count anymore (issue 764):
    // the `_normalizeSalvage` clamp above already made them valid, so this pass keeps
    // only its non-count reasons (routed routing gaps, missing progressive check). The
    // group-drop disclosure it used to provide is the warn below.
    const oldMode = current.salvageResolutionMode || 'simple';
    const disabledComponents = this._disableInvalidSalvageConfigs(merged, oldMode);
    if (disabledComponents.length > 0) {
      await this.save({ put: merged, domains: COMPONENT_FACTS });
      const names = disabledComponents.join(', ');
      ui?.notifications?.warn?.(
        `Fabricate | Salvage disabled for ${disabledComponents.length} component(s) incompatible with new mode: ${names}`
      );
    }

    // Issue 764: disclose the Simple-mode success-first clamp when it DROPPED surplus
    // result groups. The clamp runs silently inside `_normalizeSystem`, so — as the
    // maintainer required — a switch into (or a save in) Simple mode that discards a
    // component's extra groups must still cue the GM by name, the same disclosure the
    // disable-pass used to provide before the clamp made those configs valid.
    const droppedSalvageComponents = this._detectDroppedSimpleSalvageGroups(mergedInput, merged);
    if (droppedSalvageComponents.length > 0) {
      const names = droppedSalvageComponents.join(', ');
      ui?.notifications?.warn?.(
        `Fabricate | Simple salvage keeps a single result group — dropped surplus groups on ${droppedSalvageComponents.length} component(s): ${names}`
      );
    }

    // Path 2: Feature disable -- clean up salvage run history
    const oldSalvageEnabled = current.features?.salvage === true;
    const newSalvageEnabled = merged.features?.salvage === true;
    if (oldSalvageEnabled && !newSalvageEnabled) {
      await this._cleanupSalvageRunsForSystem(systemId);
    }

    // Re-run alchemy signature reconciliation only when the mode just CHANGED to
    // alchemy: migration policy disables colliding recipes to gate visibility (it
    // must not delete or hard-block on the switch). A no-mode-change component/recipe
    // edit that would introduce a collision is BLOCKED above before persisting, so it
    // never reaches this disable path. The helper self-guards non-alchemy systems.
    if (toMode === 'alchemy' && resolutionModeChanged) {
      await this._reconcileAlchemySignaturesAfterDeletion(merged);
    }

    this._notifySystemsChanged();
    if (resolutionModeChanged) {
      await this._cleanupCraftingPreferences({ subject: 'a resolution-mode change' });
    }
    return merged;
  }

  /** Move the crafting-check config between the shared pass/fail `simple` slot and the
   * tier-routing `routed` slot when a resolution mode crosses the `routedByIngredients` boundary,
   * mirroring the one-time 1.10.0 migration for a live GM mode switch. Both directions fill only
   * an UNAUTHORED destination, so an authored formula is never clobbered. The routed slot carries
   * `dcMode`/`macroUuid` now (issue 1096), so a dynamic simple check crossing into `routedByCheck`
   * keeps its macro instead of reverting to a static DC. */
  _reconcileCraftingCheckSlotsForModeChange(merged, fromMode, toMode) {
    const check = merged?.craftingCheck;
    if (!check || typeof check !== 'object') return;

    if (toMode === 'routedByIngredients' && fromMode !== 'routedByIngredients') {
      this._copyPassFailCheckFields(check.routed, check.simple);
    } else if (fromMode === 'routedByIngredients' && toMode === 'routedByCheck') {
      this._copyPassFailCheckFields(check.simple, check.routed);
    }
  }

  /** Copy the shared pass/fail crafting-check fields from a source slot to a destination slot, but
   * ONLY when the destination has no authored `rollFormula` and the source does, so an authored
   * destination is never clobbered. `dcMode`/`macroUuid` travel with the rest now that BOTH slots
   * carry them (issue 1096): leaving them behind was the one way this move could silently change
   * what a check rolls against. */
  _copyPassFailCheckFields(source, destination) {
    if (!source || typeof source !== 'object' || !destination || typeof destination !== 'object') {
      return;
    }
    const sourceFormula = typeof source.rollFormula === 'string' ? source.rollFormula.trim() : '';
    if (sourceFormula.length === 0) return;
    const destFormula =
      typeof destination.rollFormula === 'string' ? destination.rollFormula.trim() : '';
    if (destFormula.length > 0) return;

    destination.rollFormula = source.rollFormula;
    if ('dc' in source) destination.dc = source.dc;
    if ('thresholdMode' in source) destination.thresholdMode = source.thresholdMode;
    if ('tiers' in source) {
      destination.tiers = Array.isArray(source.tiers)
        ? source.tiers.map((tier) => ({ ...tier }))
        : source.tiers;
    }
    if ('dcMode' in source) destination.dcMode = source.dcMode;
    if ('macroUuid' in source) destination.macroUuid = source.macroUuid;
    if ('checkBreakage' in source) {
      destination.checkBreakage =
        source.checkBreakage && typeof source.checkBreakage === 'object'
          ? structuredClone(source.checkBreakage)
          : source.checkBreakage;
    }
  }

  /** Migrate every recipe in a system to fit a changed resolution mode: migratable recipes are
   * updated in place, un-migratable ones deleted, one aggregated notification per outcome. The
   * deletions are COLLECTED and the set form called ONCE (issue 1132), because routing the loop
   * through a cascading singular would give each recipe its own `craftingSystems` write and
   * O(actors) flag pass, publishing a half-migrated system N times. It passes the LIVE `merged`
   * system, because `updateSystem` saves again after this returns. */
  async _migrateRecipesForModeChange(systemId, fromMode, toMode, system) {
    const affectedRecipes = this.recipeManager.getRecipes({ craftingSystemId: systemId });
    let migratedCount = 0;
    const deletedNames = [];
    const deletedIds = [];

    for (const recipe of affectedRecipes) {
      const recipeJSON = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
      const { outcome, recipe: next } = migrateRecipeForModeChange(
        recipeJSON,
        fromMode,
        toMode,
        system
      );

      if (outcome === 'delete') {
        deletedNames.push(recipe.name || recipe.id);
        deletedIds.push(recipe.id);
        continue;
      }

      await this.recipeManager.updateRecipe(recipe.id, next, {
        notify: false,
        allowIncomplete: true,
        emitChange: false,
      });
      migratedCount += 1;
    }

    if (deletedIds.length > 0) {
      await this._deleteRecipeSet(system, deletedIds, {
        notify: false,
        emitChange: false,
        notifySystems: false,
      });
    }

    if (migratedCount > 0) {
      ui?.notifications?.info?.(`Migrated ${migratedCount} recipe(s) to the new resolution mode.`);
    }
    if (deletedNames.length > 0) {
      ui?.notifications?.warn?.(
        `Deleted ${deletedNames.length} recipe(s) that could not be migrated: ${deletedNames.join(', ')}`
      );
    }
    if (migratedCount > 0 || deletedNames.length > 0) {
      this.recipeManager._notifyRecipesChanged?.('mode-change', { systemId });
    }
  }

  /**
   * Block an alchemy-system update that would introduce, or leave unresolved, an ingredient
   * signature collision. Validates the PROPOSED merged system — its components against the
   * system's CURRENT recipes — via the pure {@link SignatureValidator}, and throws naming the
   * conflicting recipes/sets. Called BEFORE the merged system is persisted, so a rejected update
   * never commits the colliding state, and it mirrors the per-recipe block in {@link RecipeManager}
   * (spec 007 §"Alchemy Uniqueness Revalidation"). No-op for non-alchemy systems.
   */
  _assertNoAlchemySignatureCollisions(system) {
    if (system?.resolutionMode !== 'alchemy') return;
    const systemId = system.id;
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) || [];
    const recipeJson = recipes.map((recipe) =>
      typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe
    );
    // DELIBERATELY NOT REPOINTED at issue 1370, and the consequence is stated rather than left to
    // be discovered. This runs PRE-PERSIST, against the PROPOSED merged record: validating a
    // not-yet-saved system against a union that does not yet contain it would validate the wrong
    // subject. The engine-side twin in `CraftingEngine` IS repointed, so after the sweep the same
    // alchemy uniqueness invariant is evaluated against the union at craft time and against the
    // raw proposed array at authoring time. The read union's ROW SET is the in-system array's row
    // set while `## CraftingSystem` requirement 36 holds, which is what keeps the two answers in
    // agreement; a union that could resurrect a deleted row would make the divergence reachable.
    const components = Array.isArray(system.components) ? system.components : [];
    const validator = new SignatureValidator({
      getSystem: (id) => (id === systemId ? system : null),
      getRecipesForSystem: (id) => (id === systemId ? recipeJson : []),
      getComponentsForSystem: (id) => (id === systemId ? components : []),
    });
    const { conflicts } = validator.validateSystem(systemId);
    if (conflicts.length === 0) return;
    const details = conflicts.map((conflict) => conflict.message).join('; ');
    throw new Error(
      `Cannot update crafting system "${system.name || systemId}": the change would introduce ` +
        `${conflicts.length} alchemy ingredient signature collision(s). ` +
        `Resolve the conflicting recipes before saving. ${details}`
    );
  }

  /**
   * Delete a crafting system and the recipes that belong to it. GM only. An individual recipe
   * deletion that fails does not abort the teardown: the failure is logged with its recipe id, the
   * remaining recipes are still deleted, and the system is still removed and saved, so no
   * half-deleted system is stranded in persisted settings. Emits one aggregated notification, or a
   * warn summary naming how many recipes could not be auto-deleted.
   */
  async deleteSystem(systemId) {
    this._assertGM('delete crafting system');
    const system = this.systems.get(systemId);
    if (!system) {
      throw new Error(`Crafting system not found: ${systemId}`);
    }

    // Delete recipes that belong to this crafting system. A single failed
    // recipe deletion (e.g. a Foundry settings write error or timeout) must not
    // abort the teardown: collect the failures, keep deleting the rest, and
    // still remove the system itself below so we never leave a half-deleted
    // system stranded in persisted settings.
    const affected = this.recipeManager.getRecipes({ craftingSystemId: systemId });
    const failedRecipeIds = [];
    // The ids this deletion actually removed, which is what the mutation-time Valid Id
    // Basis gate falls back to pruning when the corpus cannot be attested complete
    // (issue 1226). A recipe whose own delete FAILED is not in here: its flags are not
    // orphaned, because the recipe is still there.
    const deletedRecipeIds = [];
    for (const recipe of affected) {
      try {
        await this.recipeManager.deleteRecipe(recipe.id, { notify: false, cleanupFlags: false });
        deletedRecipeIds.push(recipe.id);
      } catch (error) {
        failedRecipeIds.push(recipe.id);
        console.error(
          'Fabricate | failed to delete recipe while deleting crafting system; remove its orphaned data manually',
          recipe.id,
          error
        );
      }
    }

    this.systems.delete(systemId);
    await this.save({ delete: systemId, domains: ALL_INVALIDATION_DOMAINS });

    await this._cleanupSystemScopedState(systemId, { removedRecipeIds: deletedRecipeIds });

    this._notifySystemsChanged();

    const componentCount = Array.isArray(system.components)
      ? system.components.length
      : Array.isArray(system.items)
        ? system.items.length
        : 0;
    const essenceCount = Array.isArray(system.essenceDefinitions)
      ? system.essenceDefinitions.length
      : 0;
    const recipeItemCount = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions.length
      : 0;
    const relatedCount = affected.length + componentCount + essenceCount + recipeItemCount;
    const entityLabel = relatedCount === 1 ? 'entity' : 'entities';
    const summary = `Deleted crafting system "${system.name || systemId}" and ${relatedCount} related ${entityLabel}.`;
    if (failedRecipeIds.length > 0) {
      const recipeLabel = failedRecipeIds.length === 1 ? 'recipe' : 'recipes';
      ui?.notifications?.warn?.(
        `${summary} ${failedRecipeIds.length} ${recipeLabel} could not be auto-deleted and may need manual removal (see the console for ids).`
      );
    } else {
      ui?.notifications?.info?.(summary);
    }
  }

  /** Cascade cleanup across every persistent store keyed by `systemId`, each lookup lazy and
   * silently skipped when the service is unavailable. Learned-recipe flags are bulk-cleaned in a
   * SINGLE pass after the recipes and the system have been removed, so the derived valid-id set
   * excludes them. WHICH PRUNES NEED A VALID ID BASIS (issue 1226): everything above the
   * learned-recipe block is SUBJECT-TARGETED and names the deleted system, so only the
   * learned-recipe and preference sweeps are corpus-derived, and only those two are gated. */
  async _cleanupSystemScopedState(systemId, { removedRecipeIds = [] } = {}) {
    const environmentStore = this._getGatheringEnvironmentStore();
    if (environmentStore?.cleanupByCraftingSystem) {
      try {
        await environmentStore.cleanupByCraftingSystem(systemId);
      } catch (error) {
        console.error('Fabricate | environment cleanup failed for system', systemId, error);
      }
    }

    const gatheringRunManager = this._getGatheringRunManager();
    if (gatheringRunManager?.removeRunsForSystem) {
      try {
        await gatheringRunManager.removeRunsForSystem(systemId);
      } catch (error) {
        console.error('Fabricate | gathering-run cleanup failed for system', systemId, error);
      }
    }

    const salvageRunManager = this._getSalvageRunManager();
    if (salvageRunManager?.removeRunsForSystem) {
      try {
        await salvageRunManager.removeRunsForSystem(systemId, {
          cancelActive: false,
          removeHistory: true,
        });
      } catch (error) {
        console.error('Fabricate | salvage-run cleanup failed for system', systemId, error);
      }
    }

    const craftingRunManager = this._getCraftingRunManager();
    if (craftingRunManager?.removeRunsForSystem) {
      try {
        await craftingRunManager.removeRunsForSystem(systemId);
      } catch (error) {
        console.error('Fabricate | crafting-run cleanup failed for system', systemId, error);
      }
    }

    const richStateService = this._getGatheringRichStateService();
    if (richStateService?.removeSystem) {
      try {
        await richStateService.removeSystem(systemId);
      } catch (error) {
        console.error('Fabricate | gathering-config cleanup failed for system', systemId, error);
      }
    }

    const visibilityService = this._getRecipeVisibilityService();
    if (visibilityService?.cleanupLearnedRecipes) {
      try {
        const removed = [...(removedRecipeIds || [])]
          .map((id) => String(id ?? '').trim())
          .filter(Boolean);
        const validRecipeIds = new Set(this.recipeManager.getRecipes({}).map((r) => r.id));
        await runGatedMutationCleanup({
          passes: [
            {
              label: 'orphaned learned recipes',
              sweep: () => visibilityService.cleanupLearnedRecipes(validRecipeIds),
              targeted:
                removed.length > 0 ? () => visibilityService.forgetDeletedRecipes?.(removed) : null,
            },
          ],
          subject: 'a crafting-system deletion',
        });
      } catch (error) {
        console.error('Fabricate | learned-recipe cleanup failed for system', systemId, error);
      }
    }

    try {
      await this._cleanupCraftingPreferences({ subject: 'a crafting-system deletion' });
    } catch (error) {
      console.error('Fabricate | preference cleanup failed for system', systemId, error);
    }
  }

  /** Announce a crafting-system change: the PUBLISHED legacy hook with its unchanged payload, then
   * the unpublished scoped signal carrying everything attributed since the last announcement.
   * Draining HERE rather than in `save()` is what keeps the paths that deliberately save without
   * announcing silent. */
  _notifySystemsChanged() {
    globalThis.Hooks?.callAll?.('fabricate.craftingSystemsChanged', this.getSystems());
    emitCraftingDataChanged(
      craftingDataChange({ source: 'systems', scopes: this._pendingDomains.drain() })
    );
  }

  async createItem(systemId, data = {}) {
    this._assertGM('create component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    // Issue 1359: the SAME Valid Id Basis `_normalizeSystem` uses, derived through the same
    // helper rather than rebuilt here. This site BYPASSES `_normalizeSystem`, so before this it
    // read the in-system array directly and handed `_normalizeComponent` a real-but-empty Set on
    // any client whose world corpus had not replicated — which `_normalizeEssenceQuantities`
    // cannot refuse. `Set|null`, and NEVER defaulted to an empty Set.
    const { essenceIds: validEssenceIds } = this._scopeBasis(system);
    const item = this._normalizeComponent(data, {
      validEssenceIds,
      ...this._salvageNormalizationContext(system),
    });
    this._assertUniqueComponentSources(system, item);
    system.components.push(item);
    advanceDefinitionRevision(system.components);
    await this.save({ put: system, domains: COMPONENT_FACTS });
    return item;
  }

  /**
   * Resolve the live and canonical source references for an imported item UUID.
   *
   * @param {string} itemUuid
   * @param {Item|object|null} source
   * @returns {{ currentUuid: string|null, canonicalUuid: string|null, references: string[] }}
   */
  _resolveImportedSourceData(itemUuid, source = null) {
    const references = [];
    if (typeof itemUuid === 'string' && itemUuid.trim()) {
      references.push(itemUuid.trim());
    }
    // A WORLD SOURCE ITEM being registered that carries `_stats.duplicateSource` is a
    // sidebar-Duplicate/clone, and its inherited `_stats.compendiumSource` still points at the
    // ORIGINAL's pack, so keying identity on it would de-dup the clone onto the original and
    // silently OVERWRITE the original's definition (issue 555). A clone therefore keys purely on
    // its own uuid. This is a REGISTRATION rule ONLY: Foundry stamps `duplicateSource` on every
    // non-compendium drag-drop, so an actor-owned copy's `compendiumSource` is legitimate
    // provenance and `matchRecipeItemDefinition` deliberately carries no clone-gate.
    const isClone = !!getDuplicateSourceUuid(source);
    const identityRefs = isClone
      ? [source?.uuid].filter((ref) => typeof ref === 'string' && ref.trim())
      : getItemIdentityReferences(source);
    for (const ref of identityRefs) {
      if (!references.includes(ref)) references.push(ref);
    }
    const currentUuid = references[0] || null;
    const canonicalUuid = (isClone ? null : getCompendiumSourceUuid(source)) || currentUuid;
    return { currentUuid, canonicalUuid, references, isClone };
  }

  /**
   * Resolve component import source references, falling back when Foundry's recorded canonical
   * source no longer resolves.
   * @returns {Promise<{currentUuid: string|null, canonicalUuid: string|null, references: string[],
   *   aliasItemUuids: string[],
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>}
   */
  async _resolveImportedComponentSourceData(itemUuid, source = null) {
    const sourceData = this._resolveImportedSourceData(itemUuid, source);
    const sourceFallbacks = [];
    const aliasItemUuids = [];
    // A clone was already stripped of its inherited compendium source by
    // `_resolveImportedSourceData`; never resurrect it through the broken-source
    // fallback below (which reads the raw `getCompendiumSourceUuid`).
    if (sourceData.isClone) {
      return { ...sourceData, aliasItemUuids, sourceFallbacks };
    }
    const recordedCanonicalUuid = getCompendiumSourceUuid(source);
    const currentUuid = sourceData.currentUuid;
    if (!recordedCanonicalUuid || !currentUuid || recordedCanonicalUuid === currentUuid) {
      return { ...sourceData, aliasItemUuids, sourceFallbacks };
    }

    let canonicalSource;
    try {
      canonicalSource =
        typeof fromUuid === 'function' ? await fromUuid(recordedCanonicalUuid) : null;
    } catch {
      canonicalSource = null;
    }

    if (canonicalSource) {
      return { ...sourceData, aliasItemUuids, sourceFallbacks };
    }

    if (!sourceData.references.includes(recordedCanonicalUuid)) {
      sourceData.references.push(recordedCanonicalUuid);
    }
    aliasItemUuids.push(recordedCanonicalUuid);
    sourceFallbacks.push({
      itemName: source?.name || itemUuid?.split('.')?.pop() || 'Imported Item',
      brokenUuid: recordedCanonicalUuid,
      fallbackUuid: currentUuid,
    });
    return {
      ...sourceData,
      canonicalUuid: currentUuid,
      aliasItemUuids,
      sourceFallbacks,
    };
  }

  /**
   * Find an existing component in the system that already claims any of the given source references.
   *
   * @param {object} system - Normalized system object
   * @param {string[]} references - Candidate source references
   * @param {string|null} [excludeItemId=null] - Optional component to ignore
   * @returns {object|null}
   */
  _findComponentBySourceReferences(system, references, excludeItemId = null) {
    const claimedRefs = new Set((references || []).filter(Boolean));
    if (claimedRefs.size === 0) return null;
    return (
      (system.components || []).find((item) => {
        if (excludeItemId && item.id === excludeItemId) return false;
        return getItemMatchUuids(item).some((ref) => claimedRefs.has(ref));
      }) || null
    );
  }

  // The recipes a book/scroll contains. Canonical source is the definition's
  // `recipeIds[]` (issue 511 many-to-many). Falls back to the legacy reverse ref
  // (`recipe.recipeItemId`, or `linkedRecipeItemUuid → originItemUuid`) only while the
  // system's `membershipResolvesByRecipeIds` marker is unset.
  _getRecipeObjectsReferencingRecipeItemDefinition(systemId, definition) {
    if (!definition || !this.recipeManager?.getRecipes) return [];
    const recipes = this.recipeManager.getRecipes({ craftingSystemId: systemId });

    const recipeIds = Array.isArray(definition.recipeIds) ? definition.recipeIds : [];
    if (recipeIds.length > 0) {
      const idSet = new Set(recipeIds.map(String));
      return recipes.filter((recipe) => idSet.has(String(recipe?.id)));
    }

    // This definition carries no membership. Only reach for the legacy reverse ref while
    // the system has not resolved by `recipeIds`; once the marker is set an empty
    // `recipeIds` means an empty book, and a recipe's stale `recipeItemId`/
    // `linkedRecipeItemUuid` must not resurrect a phantom membership. The marker is
    // read, never re-derived from the arrays (issue 1011): that inference flipped in
    // BOTH directions, so emptying the last array reverted the whole system.
    if (this.getSystem(systemId)?.membershipResolvesByRecipeIds === true) return [];

    const definitionId = String(definition.id || '').trim();
    const originItemUuid = String(definition.originItemUuid || '').trim();
    return recipes.filter((recipe) => {
      const recipeItemId = String(recipe?.recipeItemId || '').trim();
      const linkedRecipeItemUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
      return (
        recipeItemId === definitionId ||
        (!recipeItemId && !!originItemUuid && linkedRecipeItemUuid === originItemUuid)
      );
    });
  }

  // Forward membership query (issue 511 many-to-many): the definitions of `systemId` that contain
  // `recipeId`. The rule — canonical `recipeIds[]`, then the legacy reverse ref while the system's
  // `membershipResolvesByRecipeIds` marker is unset — lives in `utils/recipeItemMembership.js`,
  // which every other membership reader asks (issue 1155). `{ id: recipeId }` stands in for a
  // recipe the manager cannot resolve, so a stale id still answers from the definitions listing it.
  getRecipeItemDefinitionsContaining(systemId, recipeId) {
    const system = this.getSystem(systemId);
    if (!system || !recipeId) return [];
    const definitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];

    const recipe = this.recipeManager?.getRecipe?.(recipeId) ?? { id: recipeId };
    return recipeItemDefinitionsContaining(
      definitions,
      recipe,
      system.membershipResolvesByRecipeIds,
      indexedMembershipLookups
    );
  }

  _assertUniqueComponentSources(system, item, excludeItemId = null) {
    const claimedRefs = getItemMatchUuids(item);
    if (claimedRefs.length === 0) return;
    const conflict = this._findComponentBySourceReferences(system, claimedRefs, excludeItemId);
    if (!conflict) return;
    throw new Error(
      `Component source reference already belongs to "${conflict.name || conflict.id}" (${conflict.id})`
    );
  }

  _assertUniqueComponentSourcesForSystem(system) {
    const claims = new Map();
    for (const component of system.components || []) {
      for (const ref of getItemMatchUuids(component)) {
        const existing = claims.get(ref);
        if (existing && existing.id !== component.id) {
          throw new Error(
            `Component source reference "${ref}" is claimed by both "${existing.name || existing.id}" (${existing.id}) and "${component.name || component.id}" (${component.id})`
          );
        }
        claims.set(ref, component);
      }
    }
  }

  _sameSourceReferenceSet(left, right) {
    const leftRefs = getItemMatchUuids(left);
    const rightRefs = getItemMatchUuids(right);
    return leftRefs.length === rightRefs.length && leftRefs.every((ref) => rightRefs.includes(ref));
  }

  /** Strip a clone's stale `_stats` provenance (`duplicateSource` plus the inherited
   * `compendiumSource`) from a registered source Item. Kind-agnostic, and only touches a source
   * that is itself a clone; a non-clone's `compendiumSource` is legitimate provenance. */
  async _stripCloneSourceProvenance(source) {
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
  async _writeSourceIdentity(source, flagKey, id) {
    const stripped = await this._stripCloneSourceProvenance(source);
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
   * drag-drop; {@link matchRecipeItemDefinition} is the runtime matcher that deliberately has no
   * gate.
   */
  async _stampSourceIdentity(source, flagKey, id) {
    if (!id) return;
    if (!source || source.pack || (source.documentName && source.documentName !== 'Item')) return;
    if (typeof source.setFlag !== 'function') return;
    const { stripped } = await this._writeSourceIdentity(source, flagKey, id);
    if (stripped) {
      console.debug?.(
        'Fabricate | stripped clone provenance from a registered source',
        source.uuid
      );
    }
  }

  /**
   * Clear a stale `flags.fabricate.<flagKey>` from a world item that no longer sources
   * the given registration (used when a definition/component is re-pointed to a new
   * source). KIND-GENERIC.
   * @private
   */
  async _clearSourceFlag(registeredItemUuid, flagKey, id) {
    if (!registeredItemUuid || !id) return;
    let doc;
    try {
      doc = await fromUuid(registeredItemUuid);
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
   * One-shot auto-stamp (issues 555, 567): backfill the durable per-system
   * `roles[system.id].recipeItemDefinitionId` on every registered recipe-item definition's
   * writable source Item. A shared source registered in BOTH system A and system B is stamped
   * once per owning system, so it carries both leaves. Dotted system ids, locked packs and
   * unresolvable sources are counted and skipped, and a second run performs zero writes. Sources
   * only: owned copies are covered by future drags and by the manual repair, and the legacy
   * scalar is NOT stripped, remaining the transitional fallback for pre-upgrade owned copies.
   * Callers gate this on primary-GM plus the one-shot setting version.
   */
  async autoStampRecipeItemSources() {
    const summary = { scanned: 0, stamped: 0, stripped: 0, skippedLocked: 0, skippedMissing: 0 };
    for (const system of this.getSystems()) {
      // A dotted (unsafe) system id cannot serve as a `roles` map key; skip it rather than
      // nesting garbage. Its recipe items still resolve via the legacy-scalar + raw-ref path.
      const flagKey = this._recipeItemRoleFlagKey(system.id);
      if (!flagKey) continue;
      for (const def of system.recipeItemDefinitions || []) {
        const uuid = def?.originItemUuid;
        if (!uuid || !def?.id) continue;
        summary.scanned += 1;
        let source;
        try {
          source = typeof fromUuid === 'function' ? await fromUuid(uuid) : null;
        } catch {
          source = null;
        }
        if (!source || typeof source.setFlag !== 'function') {
          summary.skippedMissing += 1;
          continue;
        }
        if (source.pack) {
          const pack = globalThis.game?.packs?.get?.(source.pack);
          if (!pack || pack.locked) {
            summary.skippedLocked += 1;
            continue;
          }
        }
        const { stamped, stripped } = await this._writeSourceIdentity(source, flagKey, def.id);
        if (stamped) summary.stamped += 1;
        if (stripped) summary.stripped += 1;
      }
    }
    return summary;
  }

  /** Issue 556 one-shot auto-stamp: backfill the durable per-system
   * `roles[system.id].componentId` on every registered component's writable source Item. Locked
   * packs and unresolvable sources are counted and skipped, and a second run performs zero
   * writes. Sources only — owned copies are covered by future drags and by the manual repair.
   * Callers gate this on primary-GM plus the one-shot setting version, so it does no gating of
   * its own beyond writability. */
  async autoStampComponentSources() {
    const summary = { scanned: 0, stamped: 0, stripped: 0, skippedLocked: 0, skippedMissing: 0 };
    for (const system of this.getSystems()) {
      // A dotted (unsafe) system id cannot serve as a `roles` map key; skip it rather
      // than nesting garbage. Its components still resolve via the raw-ref fall-through.
      const flagKey = this._componentRoleFlagKey(system.id);
      if (!flagKey) continue;
      for (const component of system.components || []) {
        const uuid = component?.originItemUuid || component?.registeredItemUuid;
        if (!uuid || !component?.id) continue;
        summary.scanned += 1;
        let source;
        try {
          source = typeof fromUuid === 'function' ? await fromUuid(uuid) : null;
        } catch {
          source = null;
        }
        if (!source || typeof source.setFlag !== 'function') {
          summary.skippedMissing += 1;
          continue;
        }
        if (source.pack) {
          const pack = globalThis.game?.packs?.get?.(source.pack);
          if (!pack || pack.locked) {
            summary.skippedLocked += 1;
            continue;
          }
        }
        const { stamped, stripped } = await this._writeSourceIdentity(
          source,
          flagKey,
          component.id
        );
        if (stamped) summary.stamped += 1;
        if (stripped) summary.stripped += 1;
      }
    }
    return summary;
  }

  /** Issue 561 one-shot auto-stamp: backfill the durable per-system `roles[system.id].toolId` on
   * every registered tool's writable source Item — a clone of {@link autoStampComponentSources}.
   * A tool with no source refs is skipped, as are dotted system ids and locked or unresolvable
   * sources. ORDERING: it reads the tool source refs that the `1.15.0` `migrateToolsToFirstClass`
   * migration populates, so it MUST run after that migration persists. */
  async autoStampToolSources() {
    const summary = { scanned: 0, stamped: 0, stripped: 0, skippedLocked: 0, skippedMissing: 0 };
    for (const system of this.getSystems()) {
      const flagKey = this._toolRoleFlagKey(system.id);
      if (!flagKey) continue;
      for (const tool of system.tools || []) {
        const uuid = tool?.originItemUuid || tool?.registeredItemUuid;
        if (!uuid || !tool?.id) continue;
        summary.scanned += 1;
        let source;
        try {
          source = typeof fromUuid === 'function' ? await fromUuid(uuid) : null;
        } catch {
          source = null;
        }
        if (!source || typeof source.setFlag !== 'function') {
          summary.skippedMissing += 1;
          continue;
        }
        if (source.pack) {
          const pack = globalThis.game?.packs?.get?.(source.pack);
          if (!pack || pack.locked) {
            summary.skippedLocked += 1;
            continue;
          }
        }
        const { stamped, stripped } = await this._writeSourceIdentity(source, flagKey, tool.id);
        if (stamped) summary.stamped += 1;
        if (stripped) summary.stripped += 1;
      }
    }
    return summary;
  }

  /** Resolve the existing definition a registered source maps to. A NON-clone source's durable
   * identity flag is authoritative even if the recorded `originItemUuid` drifted: the per-system
   * `roles[system.id].recipeItemDefinitionId` leaf (issue 567) is read FIRST, then the legacy
   * scalar as a transitional fallback. A CLONE's inherited flag belongs to the ORIGINAL and is
   * ignored, so a duplicated source becomes its own definition (issue 555, flow 4b). */
  _findRecipeItemDefinitionForSource(system, snapshot, source) {
    const definitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    if (!getDuplicateSourceUuid(source)) {
      const roleFlagKey = this._recipeItemRoleFlagKey(system.id);
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
    return (
      definitions.find((def) => getItemMatchUuids(def).some((ref) => claimed.has(ref))) || null
    );
  }

  // Normalize a name for the name-assisted re-point: trim, collapse internal
  // whitespace, and lowercase. Exact (post-normalization) equality only — no fuzzy or
  // substring matching. Names are literal snapshot strings captured at registration,
  // not localized keys, so a client-language change cannot move the match.
  _normalizeMatchName(name) {
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
  _uniqueDefinitionByName(name, definitions) {
    const normalized = this._normalizeMatchName(name);
    if (!normalized) return null;
    const matches = definitions.filter((def) => this._normalizeMatchName(def?.name) === normalized);
    if (matches.length === 0) return null;
    if (matches.length >= 2) return 'ambiguous';
    return matches[0];
  }

  // Owner resolution for a WORLD / WRITABLE-PACK SOURCE item. Clone-gated: a source
  // carrying `_stats.duplicateSource` is a sidebar-Duplicate, so it must NOT be
  // identity-matched onto the ORIGINAL through its inherited `compendiumSource` (the
  // self-corruption hazard — it would be stamped with the original's id). A clone
  // keys on its own uuid only; a non-clone keys on uuid + compendium source.
  _resolveSourceRepairOwner(item, kind) {
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
  _resolveOwnedRepairOwner(item, kind) {
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
  async _repairSourceItem(item, owner, kind, summary) {
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
  async _repairOwnedItem(item, kind, summary, auditLog) {
    if (!item || typeof item.update !== 'function') return;
    // A flagged owned copy already carries its identity-of-record — authoritative,
    // left exactly as-is (no re-point, no strip, no learn).
    if (getFabricateFlag(item, kind.flagKey, null)) return;

    const { definition, tier } = this._resolveOwnedRepairOwner(item, kind);

    // Components, and recipe items matched by a RELIABLE tier (durable flag / own uuid /
    // compendium source), are stamped directly to the resolved owner.
    if (kind.bucket !== 'recipeItems' || (definition && tier !== 'duplicate')) {
      await this._repairSourceItem(item, definition, kind, summary);
      return;
    }

    // Recipe item matched ONLY via tier 4 (duplicateSource), or unmatched. Tier 4 is the
    // unreliable signal at the heart of issue 555, so an owned copy here is only stamped
    // when its NAME confirms an identity. Without a duplicateSource there is nothing to
    // re-point against, so stamp whatever (if anything) matched.
    if (!getDuplicateSourceUuid(item)) {
      await this._repairSourceItem(item, definition, kind, summary);
      return;
    }

    const byName = this._uniqueDefinitionByName(item?.name, kind.definitions);
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
    await this._repairSourceItem(item, byName, kind, summary);
  }

  /**
   * The source reference a DEFINITION owns, for resolving its own authoritative
   * document. Prefers the live registered uuid, then the canonical origin uuid, then
   * any recorded alias. Distinct from the item-driven repair walk, which starts from
   * an ITEM and asks which definition claims it.
   * @private
   */
  _definitionSourceUuid(definition = null) {
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
  _countSkippedDescription(summary, reason) {
    summary.descriptions[reason] += 1;
    summary.descriptions.skipped += 1;
  }

  /**
   * DEFINITION-DRIVEN description refresh, run as part of {@link repairItemData}. It shares the
   * button, the `_assertGM` gate and the summary object with the identity repair, but deliberately
   * NOT its traversal: the item-driven walk SKIPS LOCKED PACKS, because identity repair writes
   * flags into pack items, whereas descriptions only READ through `fromUuid` — and a locked system
   * pack is exactly where the reported raw `@UUID[Compendium.…]` lives. Riding the item walk would
   * also invert authority, making an actor-owned COPY a candidate writer of the DEFINITION's
   * description. Tools are excluded by design, because a tool snapshot carries no description.
   */
  async _refreshDefinitionDescriptions(summary) {
    const targets = [];
    for (const system of this.getSystems()) {
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
      const uuid = this._definitionSourceUuid(definition);
      if (!uuid) {
        this._countSkippedDescription(summary, 'skippedUnresolved');
        continue;
      }
      let source;
      try {
        source = await fromUuid(uuid);
      } catch {
        source = null;
      }
      if (!source) {
        // The item, its pack, or the module that provided it is gone. Distinct from a
        // blank source below, because THIS one is actionable by the GM.
        this._countSkippedDescription(summary, 'skippedUnresolved');
        continue;
      }
      resolved.push({ definition, source });
      const raw = this._rawSourceDescription(source);
      if (raw) rawTexts.push(raw);
    }

    await this._primeEnricherCache(rawTexts);

    // Sweep 2 — resolve, normalize, store.
    let changed = false;
    for (const { definition, source } of resolved) {
      const next = await this._extractSourceDescription(source);
      const current = typeof definition.description === 'string' ? definition.description : '';
      if (next === current) {
        summary.descriptions.unchanged += 1;
        continue;
      }
      // Never let a source with no description at all WIPE text a definition already
      // carries — that would be data loss dressed up as a repair. Pinned by
      // `tests/repair-item-data.test.js`; deleting this guard must fail that test.
      if (!next) {
        this._countSkippedDescription(summary, 'skippedEmpty');
        continue;
      }
      definition.description = next;
      summary.descriptions.refreshed += 1;
      changed = true;
    }

    return changed;
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
   * enricher-resolved plain text. See {@link _refreshDefinitionDescriptions}.
   */
  async repairItemData({ includeCompendiums = true } = {}) {
    this._assertGM('repair item data');

    // Components, tools, AND recipe items all resolve PER SYSTEM. Their definition ids are
    // not globally unique (copy-import preserves component ids; recipe-item ids are generated
    // against a per-system uniqueness set), and each durable identity is a per-system map key
    // `roles.<systemId>.<role>`. A per-system kind means each system's pass reads and writes
    // ONLY its own leaf, so a non-owning system's null-owner pass finds its leaf unset and
    // no-ops — it can never clear another system's identity, regardless of getSystems() order
    // (issue 556 Fix 2, extended to recipe items by issue 567).
    const kinds = [];
    for (const system of this.getSystems()) {
      // A dotted (unsafe) system id cannot serve as a `roles` map key; skip its
      // component repair so nothing is nested under a broken key (the components still
      // resolve via raw refs). Fresh ids are validated at creation/import.
      const flagKey = this._componentRoleFlagKey(system.id);
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
      const toolFlagKey = this._toolRoleFlagKey(system.id);
      if (toolFlagKey) {
        // DELIBERATELY NOT REPOINTED at issue 1370, for the same reason as the component kind
        // above.
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
      // Recipe items are ALSO a per-system kind (issue 567): each system's pass reads and
      // writes ONLY its own `roles.<systemId>.recipeItemDefinitionId` leaf, so a shared
      // source registered in two systems keeps a durable claim in each and neither clobbers
      // the other. A dotted/unsafe system id is skipped (its recipe items resolve via the
      // legacy-scalar + raw-reference fall-through).
      const recipeFlagKey = this._recipeItemRoleFlagKey(system.id);
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

    const summary = {
      scanned: 0,
      skippedLocked: 0,
      // Flat totals (kept for back-compat with the component-source repair contract).
      stamped: 0,
      stripped: 0,
      cleared: 0,
      // Name-assisted re-point outcomes.
      repointed: 0,
      skippedAmbiguous: 0,
      components: { stamped: 0, stripped: 0, cleared: 0 },
      tools: { stamped: 0, stripped: 0, cleared: 0 },
      recipeItems: { stamped: 0, stripped: 0, cleared: 0 },
      // Description refresh outcomes (issue 800), deliberately a bucket of its own so
      // the identity counts above keep their existing meaning. Repair-time component
      // description refresh excludes Tools because first-class Tool source snapshots
      // (name, image, and description) are captured at registration/relink and
      // deliberately do not auto-refresh.
      // `skipped` is the flat total; `skippedUnresolved` (source item/pack/module gone
      // — actionable) and `skippedEmpty` (source resolved but carries no description —
      // nothing to do) split it by cause so the GM notice can name one.
      descriptions: {
        refreshed: 0,
        unchanged: 0,
        skipped: 0,
        skippedUnresolved: 0,
        skippedEmpty: 0,
      },
      repointLog: [],
    };

    const repairSource = async (item) => {
      for (const kind of kinds) {
        await this._repairSourceItem(
          item,
          this._resolveSourceRepairOwner(item, kind),
          kind,
          summary
        );
      }
    };

    const worldItems = globalThis.game?.items ? [...globalThis.game.items] : [];
    for (const item of worldItems) {
      summary.scanned += 1;
      await repairSource(item);
    }

    if (includeCompendiums) {
      const packs = globalThis.game?.packs ? [...globalThis.game.packs] : [];
      for (const pack of packs) {
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

    // Actor-owned copies. Guarded exactly like `game?.items` / `game?.packs` above so a
    // world with no `game.actors` (e.g. the pure-logic test harness) is a clean no-op.
    const actors = globalThis.game?.actors ? [...globalThis.game.actors] : [];
    for (const actor of actors) {
      const items = actor?.items ? [...actor.items] : [];
      for (const item of items) {
        summary.scanned += 1;
        for (const kind of kinds) {
          await this._repairOwnedItem(item, kind, summary, summary.repointLog);
        }
      }
    }

    // Description leg — definition-driven, unaffected by `includeCompendiums` and by
    // `pack.locked` (it reads through `fromUuid` rather than writing into packs).
    const descriptionsChanged = await this._refreshDefinitionDescriptions(summary);
    if (descriptionsChanged) {
      await this.save({ domains: ITEM_METADATA_FACTS });
      this._notifySystemsChanged();
    }

    return summary;
  }

  /**
   * Import (or refresh) a single component from a source Item UUID.
   *
   * @param {{persist?: boolean}} [options] - Set `persist=false` for a batch caller (e.g.
   *   {@link addItemsFromPack}) that mutates the in-memory system per item and then issues a
   *   SINGLE `save()`, collapsing N whole-corpus `craftingSystems` writes into one. Nothing else
   *   is gated by it, so the classification, the role-flag stamp and the return are identical.
   */
  async addItemFromUuid(systemId, itemUuid, options = {}) {
    this._assertGM('add component from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    // Resolve the source document (needed for type guard and metadata refresh in all paths)
    let source;
    try {
      source = await fromUuid(itemUuid);
    } catch {
      source = null;
    }

    // Document type guard: reject non-Item documents
    if (source && source.documentName && source.documentName !== 'Item') {
      throw new Error(
        `Cannot add non-Item document (${source.documentName}) as a crafting component`
      );
    }

    const nextSourceData = await this._resolveImportedComponentSourceData(itemUuid, source);
    const existing = this._findComponentBySourceReferences(system, nextSourceData.references);
    const nextSnapshot = await this._buildComponentSourceSnapshot(
      itemUuid,
      source,
      existing,
      nextSourceData
    );
    if (existing) {
      const nextFallbacks = this._buildFallbackSourceReferences(
        existing,
        nextSnapshot.registeredItemUuid,
        nextSnapshot.originItemUuid,
        nextSnapshot.aliasItemUuids
      );
      const unchanged =
        existing.registeredItemUuid === nextSnapshot.registeredItemUuid &&
        existing.originItemUuid === nextSnapshot.originItemUuid &&
        existing.name === nextSnapshot.name &&
        existing.img === nextSnapshot.img &&
        existing.description === nextSnapshot.description &&
        nextFallbacks.length === (existing.aliasItemUuids || []).length &&
        nextFallbacks.every((ref) => (existing.aliasItemUuids || []).includes(ref));

      // Stamp the source (both skipped + updated) so a source that predates this
      // flag — or was re-imported — always carries the per-system durable component id.
      // Skipped for a dotted (unsafe) system id, which cannot serve as a map key.
      const existingRoleKey = this._componentRoleFlagKey(system.id);
      if (existingRoleKey) await this._stampSourceIdentity(source, existingRoleKey, existing.id);

      if (unchanged) {
        return { item: existing, action: 'skipped', sourceFallbacks: nextSnapshot.sourceFallbacks };
      }

      existing.name = nextSnapshot.name;
      existing.img = nextSnapshot.img;
      existing.description = nextSnapshot.description;
      existing.registeredItemUuid = nextSnapshot.registeredItemUuid;
      existing.originItemUuid = nextSnapshot.originItemUuid;
      existing.aliasItemUuids = nextFallbacks;
      // Indexed fields (`name`, the source-reference union) rewritten in place on an
      // element (issue 1076).
      advanceDefinitionRevision(system.components);

      if (options.persist !== false) await this.save({ put: system, domains: COMPONENT_FACTS });
      return { item: existing, action: 'updated', sourceFallbacks: nextSnapshot.sourceFallbacks };
    }

    // No match: create new component
    // One of the five mutation-time sites that BYPASS `_normalizeSystem` (issue 1359). Same
    // basis, same helper; `Set|null`, never defaulted to an empty Set. See `_scopeBasis`.
    const { essenceIds: validEssenceIds } = this._scopeBasis(system);
    const item = this._normalizeComponent(
      {
        ...nextSnapshot,
      },
      { validEssenceIds, ...this._salvageNormalizationContext(system) }
    );

    this._assertUniqueComponentSources(system, item);
    system.components.push(item);
    advanceDefinitionRevision(system.components);
    const addedRoleKey = this._componentRoleFlagKey(system.id);
    if (addedRoleKey) await this._stampSourceIdentity(source, addedRoleKey, item.id);
    if (options.persist !== false) await this.save({ put: system, domains: COMPONENT_FACTS });
    return { item, action: 'added', sourceFallbacks: nextSnapshot.sourceFallbacks };
  }

  /** Replace a component's source Item link and return fallback metadata when the dropped Item's
   * recorded canonical source is broken.
   * @returns {Promise<{item: object,
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>} */
  async replaceItemSource(systemId, itemId, itemUuid) {
    this._assertGM('replace component source');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const idx = system.components.findIndex((i) => i.id === itemId);
    if (idx === -1) throw new Error(`Component not found: ${itemId}`);

    let source;
    try {
      source = await fromUuid(itemUuid);
    } catch {
      source = null;
    }

    if (source && source.documentName && source.documentName !== 'Item') {
      throw new Error(
        `Cannot use non-Item document (${source.documentName}) as a component source`
      );
    }

    const existing = system.components[idx];
    const previousSourceUuid = existing.originItemUuid || existing.registeredItemUuid || null;
    const nextSnapshot = await this._buildComponentSourceSnapshot(itemUuid, source, existing);
    const conflict = this._findComponentBySourceReferences(system, nextSnapshot.references, itemId);
    if (conflict) {
      throw new Error(
        `Component source reference already belongs to "${conflict.name || conflict.id}" (${conflict.id})`
      );
    }

    // One of the five mutation-time sites that BYPASS `_normalizeSystem` (issue 1359). Same
    // basis, same helper; `Set|null`, never defaulted to an empty Set. See `_scopeBasis`.
    const { essenceIds: validEssenceIds } = this._scopeBasis(system);
    const updatedItem = this._normalizeComponent(
      {
        ...existing,
        ...nextSnapshot,
        aliasItemUuids: this._buildFallbackSourceReferences(
          existing,
          nextSnapshot.registeredItemUuid,
          nextSnapshot.originItemUuid,
          nextSnapshot.aliasItemUuids
        ),
        id: itemId,
      },
      { validEssenceIds, ...this._salvageNormalizationContext(system) }
    );

    system.components[idx] = updatedItem;
    advanceDefinitionRevision(system.components);
    // Re-point the transferable flag: clear the old source (if it still points here)
    // and stamp the new source, so copies match the current source, not the old one.
    const replaceRoleKey = this._componentRoleFlagKey(system.id);
    if (replaceRoleKey) {
      if (previousSourceUuid && previousSourceUuid !== itemUuid) {
        await this._clearSourceFlag(previousSourceUuid, replaceRoleKey, itemId);
      }
      await this._stampSourceIdentity(source, replaceRoleKey, itemId);
    }
    await this.save({ put: system, domains: COMPONENT_FACTS });
    return { item: updatedItem, sourceFallbacks: nextSnapshot.sourceFallbacks };
  }

  /** Bulk-import all Item documents from a Foundry compendium pack into a crafting system,
   * delegating to {@link addItemFromUuid}.
   * @returns {Promise<{added: number, updated: number, skipped: number, total: number,
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>} */
  async addItemsFromPack(systemId, packId) {
    this._assertGM('bulk import from compendium');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const pack = game.packs.get(packId);
    if (!pack) throw new Error(`Compendium pack not found: ${packId}`);

    const documents = await pack.getDocuments();
    const items = documents.filter((d) => d.documentName === 'Item');

    // DECISION (issue 800): no `_primeEnricherCache` call here, deliberately.
    // This loops `addItemFromUuid`, so each item pays core's own per-`enrichHTML`
    // priming — but the `getDocuments()` above has already loaded THIS pack into the
    // document cache, and an intra-pack reference is the common case, so those primes
    // are cache hits. The batched prime exists for the repair, which sweeps every
    // definition in the world across arbitrarily many packs; here the same call would
    // add a full extra pass over N descriptions to save round-trips that mostly are not
    // happening. Revisit if a cross-pack-heavy import ever measures slow.
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const sourceFallbacks = [];
    // Each item mutates the in-memory system only (persist:false); the whole batch is flushed with
    // ONE `save()` below, collapsing N whole-corpus `craftingSystems` writes — each replicated to
    // every connected client and re-normalized there — into a single write (issue 1086).
    // `dirty` tracks whether anything actually changed the corpus, so an all-skipped re-drop
    // writes nothing at all.
    let dirty = false;
    try {
      for (const item of items) {
        const uuid = `Compendium.${packId}.${item.id}`;
        const result = await this.addItemFromUuid(systemId, uuid, { persist: false });
        if (result.action === 'added') {
          added++;
          dirty = true;
        } else if (result.action === 'updated') {
          updated++;
          dirty = true;
        } else skipped++;
        if (Array.isArray(result.sourceFallbacks)) sourceFallbacks.push(...result.sourceFallbacks);
      }
    } finally {
      // `finally`, not a trailing statement: an item that throws mid-batch must still persist the
      // items already imported, which per-item saves gave for free. The error still propagates.
      // Named rather than bare (issue 1078): every item went into THIS system and
      // `addItemFromUuid` mutates that record in place, so the flush knows exactly which one
      // moved, where a bare `save()` advanced every system's token for an import into one.
      if (dirty) await this.save({ put: system, domains: COMPONENT_FACTS });
    }

    return { added, updated, skipped, total: items.length, sourceFallbacks };
  }

  _hasChangedPath(changes = {}, path = []) {
    if (!changes || typeof changes !== 'object' || path.length === 0) return false;

    const dotted = path.join('.');
    if (Object.prototype.hasOwnProperty.call(changes, dotted)) return true;
    if (Object.keys(changes).some((key) => key.startsWith(`${dotted}.`))) return true;

    let cursor = changes;
    for (const segment of path) {
      if (
        !cursor ||
        typeof cursor !== 'object' ||
        !Object.prototype.hasOwnProperty.call(cursor, segment)
      ) {
        return false;
      }
      cursor = cursor[segment];
    }

    return true;
  }

  _hasUpdatedItemDescription(changes = {}) {
    return (
      this._hasChangedPath(changes, ['system', 'description']) ||
      this._hasChangedPath(changes, ['description'])
    );
  }

  async refreshComponentMetadataForUpdatedItem(item, changes = {}) {
    if (!game.user?.isGM) return { updated: 0 };

    const refreshName = this._hasChangedPath(changes, ['name']);
    const refreshImg = !!changes && Object.prototype.hasOwnProperty.call(changes, 'img');
    const refreshDescription = this._hasUpdatedItemDescription(changes);
    if (!refreshName && !refreshImg && !refreshDescription) return { updated: 0 };

    // Identity references only: a clone carries duplicateSource → its original,
    // so matching on the duplicate source would propagate this edit onto the
    // original item's component as well.
    const itemRefs = new Set(getItemIdentityReferences(item));
    if (itemRefs.size === 0) return { updated: 0 };

    const nextName = refreshName ? item?.name || changes.name || 'Unnamed Item' : null;
    const nextImg = refreshImg ? item?.img || changes.img || 'icons/svg/item-bag.svg' : null;
    // Item-sync RESOLVES too (issue 800). Without the await here an edited source
    // item would re-propagate raw directive text over a description the GM had
    // already repaired, silently undoing the backfill one edit at a time.
    const nextDescription = refreshDescription ? await this._extractSourceDescription(item) : null;
    let updated = 0;
    // The systems this walk actually rewrote a component in (issue 1078). It walks EVERY
    // system by necessity — an item's identity references can name a component in any of
    // them — but almost never touches more than one, and a bare `save()` here took the
    // whole-corpus branch and advanced every system's token. On the `updateItem` hook
    // `main.js` binds this to, that made every GM rename, image or description edit
    // invalidate every token-keyed retained guard for every system, on every client.
    /** @type {Set<object>} */
    const touched = new Set();

    for (const system of this.systems.values()) {
      const components = Array.isArray(system.components) ? system.components : [];
      for (const component of components) {
        const matches = getItemMatchUuids(component).some((ref) => itemRefs.has(ref));
        if (!matches) continue;

        let changed = false;
        if (refreshName && component.name !== nextName) {
          component.name = nextName;
          changed = true;
        }
        if (refreshImg && component.img !== nextImg) {
          component.img = nextImg;
          changed = true;
        }
        if (refreshDescription && component.description !== nextDescription) {
          component.description = nextDescription;
          changed = true;
        }
        if (changed) {
          updated++;
          touched.add(system);
          // A component's `name` is an indexed field of the name fallback, rewritten in
          // place on an element of an otherwise unchanged array (issue 1076).
          advanceDefinitionRevision(components);
        }
      }
    }

    if (updated > 0) {
      await this.save({ batch: touched, domains: COMPONENT_FACTS });
      this._notifySystemsChanged();
    }

    return { updated };
  }

  async updateItem(systemId, itemId, updates = {}) {
    this._assertGM('update component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const idx = system.components.findIndex((i) => i.id === itemId);
    if (idx === -1) throw new Error(`Component not found: ${itemId}`);
    // One of the five mutation-time sites that BYPASS `_normalizeSystem` (issue 1359). Same
    // basis, same helper; `Set|null`, never defaulted to an empty Set. See `_scopeBasis`.
    const { essenceIds: validEssenceIds } = this._scopeBasis(system);
    const updatedItem = this._normalizeComponent(
      { ...system.components[idx], ...updates, id: itemId },
      { validEssenceIds, ...this._salvageNormalizationContext(system) }
    );
    if (!this._sameSourceReferenceSet(system.components[idx], updatedItem)) {
      this._assertUniqueComponentSources(system, updatedItem, itemId);
    }
    system.components[idx] = updatedItem;
    advanceDefinitionRevision(system.components);
    await this.save({ put: system, domains: COMPONENT_FACTS });
    return system.components[idx];
  }

  /**
   * Lowercase, trim and drop the empties from a caller-supplied tag list, matching the
   * lowercase `itemTags` vocabulary. Order is preserved; de-duplication is the caller's
   * job (the union path needs the incoming order, the removal path only needs the set).
   *
   * @param {unknown} tags
   * @returns {string[]}
   */
  _normalizeBulkTagList(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
      .map((tag) =>
        String(tag || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
  }

  /**
   * Apply a bulk edit — any of category, tag additions, tag removals, essences and progressive DC
   * — to a SET of components in one `save()`; the shared set-apply primitive behind folder-aware
   * import categorization (issue 771) and multi-select bulk edit (issue 772).
   *
   * The axes match `Component`'s own semantics (data-models spec): `category` is SINGLE-valued
   * and OVERWRITES; `addTags` is ADDITIVE, unioned case-insensitively and stored lowercase;
   * `removeTags` is a set DIFFERENCE applied AFTER `addTags`; `essences` REPLACES the whole map
   * when the key is PRESENT; and `difficulty` is the progressive DC, cleared by `0`/`null`/`''`.
   * The guard tests PRESENCE, never truthiness, for `essences` and `difficulty`, because
   * `{essences: {}}` and `{difficulty: 0}` are real "clear this" edits. Every changed component
   * is re-normalized under the owning system's essence AND salvage context, so a Simple-mode
   * context runs the retain-one clamp (issue 764).
   *
   * @returns {Promise<{updated: number, componentIds: string[]}>} the resolved cohort the edit
   *   was APPLIED TO, not a diff, matching
   *   {@link CraftingSystemManager#applyBulkEditToEssences}'s contract exactly.
   */
  async applyBulkEditToComponents(systemId, componentIds, edit = {}, options = {}) {
    this._assertGM('apply a bulk edit to components');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const targetIds = new Set(Array.from(componentIds || [], String));
    if (targetIds.size === 0) return { updated: 0, componentIds: [] };

    const bulkEdit = edit && typeof edit === 'object' ? edit : {};
    const rawCategory = typeof bulkEdit.category === 'string' ? bulkEdit.category.trim() : '';
    const hasCategory = rawCategory !== '';
    const addTags = this._normalizeBulkTagList(bulkEdit.addTags);
    const removeTags = new Set(this._normalizeBulkTagList(bulkEdit.removeTags));
    const hasEssences = Object.hasOwn(bulkEdit, 'essences');
    const hasDifficulty = Object.hasOwn(bulkEdit, 'difficulty');
    const staged =
      hasCategory || addTags.length > 0 || removeTags.size > 0 || hasEssences || hasDifficulty;
    if (!staged) return { updated: 0, componentIds: [] };

    // One of the five mutation-time sites that BYPASS `_normalizeSystem` (issue 1359). Same
    // basis, same helper; `Set|null`, never defaulted to an empty Set. See `_scopeBasis`.
    const { essenceIds: validEssenceIds } = this._scopeBasis(system);
    const salvageContext = this._salvageNormalizationContext(system);
    const changedIds = [];
    for (let idx = 0; idx < system.components.length; idx += 1) {
      const component = system.components[idx];
      if (!targetIds.has(String(component.id))) continue;

      const currentTags = Array.isArray(component.tags) ? component.tags : [];
      let nextTags = currentTags;
      if (addTags.length > 0) {
        const seen = new Set(currentTags.map((tag) => String(tag).toLowerCase()));
        nextTags = [...currentTags];
        for (const tag of addTags) {
          if (seen.has(tag)) continue;
          seen.add(tag);
          nextTags.push(tag);
        }
      }
      // AFTER the union, so a tag in both lists loses.
      if (removeTags.size > 0) {
        nextTags = nextTags.filter((tag) => !removeTags.has(String(tag).toLowerCase()));
      }

      system.components[idx] = this._normalizeComponent(
        {
          ...component,
          category: hasCategory ? rawCategory : component.category,
          tags: nextTags,
          essences: hasEssences ? bulkEdit.essences : component.essences,
          difficulty: hasDifficulty ? bulkEdit.difficulty : component.difficulty,
          id: component.id,
        },
        { validEssenceIds, ...salvageContext }
      );
      changedIds.push(String(component.id));
    }
    if (changedIds.length > 0) advanceDefinitionRevision(system.components);

    if (changedIds.length > 0 && options.persist !== false)
      await this.save({ put: system, domains: COMPONENT_FACTS });
    return { updated: changedIds.length, componentIds: changedIds };
  }

  /**
   * Apply a bulk edit — any of category, status, lock, check tier and recipe-book membership — to
   * a SET of recipes in one `recipes` write and one `craftingSystems` write (issue 1010). The
   * recipe twin of {@link CraftingSystemManager#applyBulkEditToComponents}, living HERE because
   * the book axis writes `system.recipeItemDefinitions[].recipeIds` and `RecipeManager` has no
   * `save()` for that setting; every recipe-field write still goes through
   * `recipeManager.updateRecipe`.
   *
   * The `edit` contract is `toBulkRecipeEdit`'s six keys, present IF AND ONLY IF staged. Three
   * are FALSY BUT REAL — `enabled: false`, `locked: false`, `checkTierId: null` — so the guard
   * tests `Object.hasOwn` and never truthiness, which would drop Disable, Unlock and Default DC.
   *
   * WRITE ORDER: BOOKS FIRST, THEN RECIPES. The axes are independent, so at most ONE in-memory
   * map is dirty across any await; books first because the membership-basis marker write is what
   * makes every subsequent membership read well-defined. The two `save()` calls are one per world
   * SETTING, each skipped when its own half changed nothing — not a redundant pair to collapse.
   *
   * THE ACTIVATION GATE RUNS INSIDE `updateRecipe`, PER RECIPE, IN BATCH ORDER, which is the
   * correct evaluation rather than a cost: {@link RecipeManager#_validateSignatures} substitutes
   * the candidate into the LIVE recipe list, so enabling sequentially lets the second alchemy
   * candidate see the first already enabled. {@link RecipeManager#canActivateRecipe} is the
   * pre-batch evaluation, a LOWER BOUND; this loop's `blockedEnables` is the authority.
   *
   * It maintains the membership-basis marker itself, because mutating definitions directly
   * BYPASSES the `updateRecipeItemDefinition` choke point.
   */
  async applyBulkEditToRecipes(systemId, recipeIds, edit = {}) {
    this._assertGM('apply a bulk edit to recipes');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const result = {
      updated: 0,
      recipeIds: [],
      blockedEnables: 0,
      blockedRecipeIds: [],
      rejected: 0,
      rejectedRecipeIds: [],
      booksUpdated: 0,
      bookIds: [],
      bookAdditions: 0,
      bookRemovals: 0,
    };

    // Resolves — and REJECTS — the staged check tier before anything is mutated.
    const axes = this._resolveBulkRecipeAxes(system, edit);
    if (!axes.staged) return result;

    const targetIds = new Set(normalizeSelectionIds(recipeIds));
    if (targetIds.size === 0) return result;

    const cohort = (this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) ?? []).filter(
      (recipe) => targetIds.has(String(recipe?.id ?? ''))
    );

    // ---- Books first -------------------------------------------------------
    const books = this._applyBulkRecipeBookMembership(system, cohort, axes);
    result.bookIds = books.bookIds;
    result.booksUpdated = books.bookIds.length;
    result.bookAdditions = books.additions;
    result.bookRemovals = books.removals;
    if (books.changed) {
      system.membershipResolvesByRecipeIds = true;
      await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
    }

    // ---- Then recipes ------------------------------------------------------
    const outcome = await this._applyBulkRecipePatches(cohort, axes);
    result.recipeIds = outcome.recipeIds;
    result.updated = outcome.recipeIds.length;
    result.blockedRecipeIds = outcome.blockedRecipeIds;
    result.blockedEnables = outcome.blockedRecipeIds.length;
    result.rejectedRecipeIds = outcome.rejectedRecipeIds;
    result.rejected = outcome.rejectedRecipeIds.length;

    if (result.updated > 0) await this.recipeManager.save();

    // At most one of EACH change hook, matching the at-most-one-save-of-each guarantee,
    // and both are needed. On the writing client `reload()` returns `false`, so the
    // `updateSetting` socket bridge deliberately re-emits nothing locally — a book change
    // announced only as `recipesChanged` would be invisible to the GM's own other windows.
    if (books.changed) this._notifySystemsChanged();
    if (result.updated > 0) {
      this.recipeManager.notifyRecipesChanged?.({
        action: 'bulkEdit',
        recipeIds: result.recipeIds,
      });
    }

    return result;
  }

  /**
   * Read the six-key bulk recipe `edit` into a resolved axis descriptor, testing PRESENCE and
   * never truthiness, and resolving the staged check tier against THIS system's authored tiers.
   * The tier resolution throws here — before the caller has mutated anything — because a bulk
   * write's blast radius justifies being stricter than the single-recipe editor write, which
   * tolerates a dangling `checkTierId` and falls back to the default DC at resolution time.
   */
  _resolveBulkRecipeAxes(system, edit) {
    const bulkEdit = edit && typeof edit === 'object' ? edit : {};
    const axes = {
      hasCategory: Object.hasOwn(bulkEdit, 'category'),
      category: bulkEdit.category,
      hasEnabled: Object.hasOwn(bulkEdit, 'enabled'),
      enabled: bulkEdit.enabled === true,
      hasLocked: Object.hasOwn(bulkEdit, 'locked'),
      locked: bulkEdit.locked === true,
      hasCheckTier: Object.hasOwn(bulkEdit, 'checkTierId'),
      checkTierId: null,
      // The book axis's two disjoint id lists. `normalizeSelectionIds` is the same coercion
      // the selection itself goes through — a staged book set IS a selection of books.
      addBookIds: new Set(normalizeSelectionIds(bulkEdit.addBookIds)),
      removeBookIds: new Set(normalizeSelectionIds(bulkEdit.removeBookIds)),
    };
    axes.staged =
      axes.hasCategory ||
      axes.hasEnabled ||
      axes.hasLocked ||
      axes.hasCheckTier ||
      Object.hasOwn(bulkEdit, 'addBookIds') ||
      Object.hasOwn(bulkEdit, 'removeBookIds');
    if (axes.hasCheckTier)
      axes.checkTierId = this._resolveBulkCheckTierId(system, bulkEdit.checkTierId);
    return axes;
  }

  /**
   * Resolve a staged bulk check-tier id against the tiers THIS system's crafting check actually
   * authors, or throw. `null`/empty is the real instruction "Default DC"; anything else must name
   * a tier the panel could have offered, which is exactly `resolveRecipeCheckTierOptions` over
   * the system's active crafting-check SLOT — the same helper the recipe editor's dropdown and
   * the bulk panel's gate read, so the three cannot disagree.
   *
   * THE SLOT IS THE RESOLVER'S OWN ANSWER (issue 1096), not a manager-side twin. A hand-rolled
   * copy of the mode map stood here, documented as "kept structurally identical" to the root's,
   * which nothing pinned; the moment the root moved onto `resolveActiveCraftingCheckFormula` the
   * two disagreed for alchemy and the panel listed a tier this method threw on. A `null` slot
   * yields no options, so a system that rolls no crafting check accepts Default DC and nothing else.
   */
  _resolveBulkCheckTierId(system, rawTierId) {
    const tierId = typeof rawTierId === 'string' ? rawTierId.trim() : '';
    if (!tierId) return null;

    const options = resolveRecipeCheckTierOptions(
      system?.craftingCheck,
      resolveActiveCraftingCheckFormula(system).slot
    );
    const known = options.some((tier) => String(tier?.id ?? '') === tierId);
    if (!known) {
      throw new Error(`Check tier not authored by crafting system ${system?.id}: ${tierId}`);
    }
    return tierId;
  }

  /**
   * Apply the book axis by iterating the DEFINITIONS rather than the recipes. `addBookIds` and
   * `removeBookIds` are disjoint, so every touched definition takes exactly ONE operation and is
   * written exactly once, and a definition named by neither is left byte-identical. A definition
   * named by both would be a contract violation the panel's staging makes unreachable; the REMOVE
   * wins, mirroring the component primitive's removals-after-the-union rule.
   *
   * The EDGE counts are measured here, against the SEEDED arrays: the seed runs first and
   * rewrites `recipeIds` from the legacy scalars, so `current` is the book's true membership on
   * either basis by the time the delta is taken. The seed's own writes are deliberately NOT
   * counted, because they carry an existing membership across a basis switch rather than adding
   * one. `changed` is true when ANY definition was mutated, including one only the seed touched.
   */
  _applyBulkRecipeBookMembership(system, cohort, axes) {
    const bookIds = [];
    let additions = 0;
    let removals = 0;
    const touched = axes.addBookIds.size > 0 || axes.removeBookIds.size > 0;
    const selectedIds = cohort.map((recipe) => String(recipe?.id ?? '')).filter(Boolean);
    if (!touched || selectedIds.length === 0) {
      return { changed: false, bookIds, additions, removals };
    }

    // Seed BEFORE any array is replaced, while the legacy resolution is still the live
    // basis. Without it the marker set below would close the revert direction but make the
    // ORPHANING direction permanent: every OTHER definition's scalar-only members would be
    // stranded by this one write.
    const seeded = this._seedMembershipFromLegacyScalars(system);
    const selected = new Set(selectedIds);

    for (const definition of system.recipeItemDefinitions || []) {
      const definitionId = String(definition?.id ?? '');
      const remove = axes.removeBookIds.has(definitionId);
      const add = !remove && axes.addBookIds.has(definitionId);
      if (!add && !remove) continue;

      const current = this._normalizeMembershipRecipeIds(definition.recipeIds);
      const next = remove
        ? current.filter((id) => !selected.has(id))
        : this._normalizeMembershipRecipeIds([...current, ...selectedIds]);
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        continue;
      }

      definition.recipeIds = next;
      bookIds.push(definitionId);
      // One operation per definition, so exactly one of these can be non-zero per book and
      // the delta IS the edge count: a union only grows, a difference only shrinks.
      if (remove) removals += current.length - next.length;
      else additions += next.length - current.length;
    }
    // Membership rewritten in place on elements (issue 1076).
    if (bookIds.length > 0) advanceDefinitionRevision(system.recipeItemDefinitions);

    return { changed: seeded || bookIds.length > 0, bookIds, additions, removals };
  }

  /**
   * Run the per-recipe half of the batch.
   *
   * LOOP ATOMICITY HERE IS MICROTASK-ONLY, which differs from the mirrored precedent:
   * `applyBulkEditToComponents`'s loop is LITERALLY synchronous, while this one awaits once per
   * iteration and merely BEHAVES atomically, because `updateRecipe` with `persist: false`
   * performs no real I/O. The moment anything awaiting real I/O enters this loop, `reload()` can
   * replace the recipes map between iterations and silently discard every staged edit; there is
   * no compare-and-set anywhere in the settings path to catch it.
   */
  async _applyBulkRecipePatches(cohort, axes) {
    const recipeIds = [];
    const blockedRecipeIds = [];
    const rejectedRecipeIds = [];

    for (const recipe of cohort) {
      const updates = this._buildBulkRecipePatch(recipe, axes);
      if (Object.keys(updates).length === 0) continue;

      const recipeId = String(recipe.id);
      const outcome = await this._writeBulkRecipePatch(recipeId, updates);
      if (outcome.updated) recipeIds.push(recipeId);
      if (outcome.blocked) blockedRecipeIds.push(recipeId);
      if (outcome.rejected) rejectedRecipeIds.push(recipeId);
    }

    return { recipeIds, blockedRecipeIds, rejectedRecipeIds };
  }

  /**
   * The MINIMAL patch for one recipe: only the staged fields whose value actually differs, so a
   * recipe every staged axis already agrees with issues no `updateRecipe` call at all. The
   * category is normalized first because `Recipe` normalizes it on construction, so a raw
   * comparison would report `'General'` as differing from the stored `'general'` and re-write
   * every recipe in the selection.
   */
  _buildBulkRecipePatch(recipe, axes) {
    const updates = {};
    if (axes.hasCategory) {
      const category = normalizeRecipeCategory(axes.category);
      if (category !== recipe.category) updates.category = category;
    }
    if (axes.hasEnabled && (recipe.enabled === true) !== axes.enabled) {
      updates.enabled = axes.enabled;
    }
    if (axes.hasLocked && (recipe.locked === true) !== axes.locked) {
      updates.locked = axes.locked;
    }
    if (axes.hasCheckTier && (recipe.checkTierId ?? null) !== axes.checkTierId) {
      updates.checkTierId = axes.checkTierId;
    }
    return updates;
  }

  /**
   * Write one recipe's minimal patch, resolving BOTH error branches, which are different failures
   * and are reported separately.
   *
   * `RecipeActivationError` is a refused ENABLE: the id is recorded, `enabled` is dropped and the
   * patch retried so the ungated axes still land on a recipe that stays off. That is clean
   * because `updateRecipe` throws at its activation gate strictly BEFORE `this.recipes.set`, and
   * the retry cannot itself throw. `RecipePersistenceError` is a recipe that cannot be saved AT
   * ALL — `validateStructure()` still runs under `allowIncomplete` — and is precisely the class
   * this change makes newly selectable, so an uncaught throw would abort the batch AFTER the
   * books save had committed. It is logged and the batch continues.
   */
  async _writeBulkRecipePatch(recipeId, updates) {
    // `persist: false` is the compendium-importer batch idiom: mutate the in-memory map per
    // recipe, then issue ONE trailing `save()`. `allowIncomplete` keeps an authoring shell
    // editable, matching the single-recipe browser writes.
    const options = { persist: false, notify: false, emitChange: false, allowIncomplete: true };
    try {
      await this.recipeManager.updateRecipe(recipeId, updates, options);
      return { updated: true, blocked: false, rejected: false };
    } catch (error) {
      if (error instanceof RecipePersistenceError) {
        console.warn(
          `Fabricate | bulk recipe edit could not save recipe ${recipeId}: ${error.message}`
        );
        return { updated: false, blocked: false, rejected: true };
      }
      if (!(error instanceof RecipeActivationError)) throw error;

      delete updates.enabled;
      if (Object.keys(updates).length === 0) {
        return { updated: false, blocked: true, rejected: false };
      }
      await this.recipeManager.updateRecipe(recipeId, updates, options);
      return { updated: true, blocked: true, rejected: false };
    }
  }

  /**
   * Delete a SET of recipes and everything that deletion reaches, in at most ONE `recipes` write,
   * at most ONE `craftingSystems` write and ONE actor-flag CLEAN-UP (issue 1132).
   *
   * It lives here and not on `RecipeManager` because write ownership of the `craftingSystems`
   * setting, and `save()` on it, exist only here. Every GM-initiated delete routes through the
   * shared body, exactly as {@link CraftingSystemManager#deleteItem} and
   * {@link CraftingSystemManager#deleteComponents} route through `_deleteComponentSet`, so the
   * entry points cannot disagree about what deleting a recipe reaches; the two exempt paths are
   * recorded on {@link RecipeManager#deleteRecipe}.
   *
   * @param {string} systemId An unresolvable id deletes the recipes and prunes nothing rather
   *   than throwing: a recipe lives in its own world setting, so one whose `craftingSystemId`
   *   dangles is a real, deletable orphan.
   * @returns {Promise<{deleted: number, recipeIds: string[], recipeItemsAffected: number,
   *   recipeItemsRewritten: number, learnersAffected: number}>} BOTH recipe-item numbers, because
   *   they answer different questions: `recipeItemsAffected` is the basis-aware count the card
   *   states, `recipeItemsRewritten` counts the definitions the write actually rewrote, which is
   *   zero on a legacy-basis system. See `utils/recipeDeleteImpact.js`.
   */
  async deleteRecipes(systemId, recipeIds, options = {}) {
    this._assertGM('delete recipes');
    return await this._deleteRecipeSet(this.getSystem(systemId), recipeIds, options);
  }

  /**
   * The shared body of every cascading recipe delete.
   *
   * WRITE ORDER: `recipes` setting → `craftingSystems` setting → actor flags. Recipes before
   * books, because a failed book write after the recipe write leaves dangling book ids — today's
   * steady state, invisible at render and repaired by the next successful delete — whereas books
   * first would lose authored membership for recipes that still exist, with nothing able to
   * reconstruct it. {@link CraftingSystemManager#applyBulkEditToRecipes} orders the two the OTHER
   * way for a reason absent here: its book write SETS the basis marker. Both settings go before
   * actors, because a caller whose `SETTINGS_MODIFY` has been revoked genuinely throws on the
   * setting write and must mutate no actor flags.
   *
   * THE `craftingSystems` HALF TAKES A RESTORE POINT, exactly as the `recipes` half does: the
   * prune mutates the LIVE `entry.definition.recipeIds` and then saves, so a refused second write
   * would leave this client showing pruned state while every peer still reads the dangling ids.
   * The snapshot is per-pruned-definition and shallow, which is enough for a whole-array
   * replacement of one field.
   *
   * THE `craftingSystems` WRITE MUST NOT TOUCH THE MEMBERSHIP-BASIS MARKER.
   * {@link CraftingSystemManager#updateRecipeItemDefinition} is its single choke point (issue
   * 1011), and looping that would be N writes AND would flip a legacy system's basis irreversibly
   * as a side effect of a delete authored for another reason. So this writes the array directly,
   * reusing {@link CraftingSystemManager#_normalizeMembershipRecipeIds}, and neither sets nor
   * reads the marker — deliberately departing from `applyBulkEditToRecipes`, because
   * `_seedMembershipFromLegacyScalars` PUSHES onto existing arrays, so seeding on the way to
   * removing an id would materialise legacy membership as authored membership.
   *
   * BOTH CHANGE HOOKS, NOT ONE: the batch writes both settings, so it emits both signals, gated
   * per-axis. On the writing client `reload()` returns `false`, so the socket bridge re-emits
   * nothing and a book change announced only as `recipesChanged` would be invisible to the GM's
   * own other windows.
   *
   * @param {object|null} system The LIVE normalized system from `this.systems`, never a snapshot:
   *   the mode-change caller runs inside `updateSystem`, which saves again afterwards.
   */
  async _deleteRecipeSet(system, recipeIds, options = {}) {
    const requested = normalizeSelectionIds(recipeIds);
    const recipes = requested
      .map((recipeId) => this.recipeManager?.getRecipe?.(recipeId))
      .filter(Boolean);
    if (recipes.length === 0) {
      return {
        deleted: 0,
        recipeIds: [],
        recipeItemsAffected: 0,
        recipeItemsRewritten: 0,
        learnersAffected: 0,
      };
    }
    const doomedIds = recipes.map((recipe) => String(recipe.id));

    // Counted BEFORE the flag pass below clears the very entries it counts, and through the
    // same writable-actor selector the cascade walks.
    const learnerIds = selectLearnerActorIds(
      buildLearnedRecipeActorIndex(globalThis.game?.actors),
      doomedIds
    );

    // Planned BEFORE the recipes leave the map: under the legacy basis membership resolves
    // through the RECIPE's own scalar, which is unreadable once the recipe is gone.
    const plan = planRecipeItemMembershipPrune(
      system?.recipeItemDefinitions,
      recipes,
      system?.membershipResolvesByRecipeIds === true
    );

    // ---- 1. the `recipes` setting -----------------------------------------------------
    const outcome = await this.recipeManager.deleteRecipes(doomedIds, {
      notify: options.notify,
      emitChange: false,
      cleanupFlags: false,
    });

    // ---- 2. the `craftingSystems` setting ---------------------------------------------
    // Skipped outright when this half changed nothing, as `applyBulkEditToRecipes` skips
    // each of its two writes: the guarantee is at most ONE write of each, not one write
    // unconditionally. On a legacy-basis system that is every time, and it is a theorem
    // rather than a basis check — see `planRecipeItemMembershipPrune`.
    const membershipRestore = plan.prunes.map((entry) => [
      entry.definition,
      entry.definition.recipeIds,
    ]);
    for (const entry of plan.prunes) {
      entry.definition.recipeIds = this._normalizeMembershipRecipeIds(entry.recipeIds);
    }
    const recipeItemsRewritten = plan.prunes.length;
    if (recipeItemsRewritten > 0) {
      try {
        await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
      } catch (error) {
        // Put the live definitions back before rethrowing: this client must not go on
        // rendering a prune the world never received.
        for (const [definition, recipeIds] of membershipRestore) definition.recipeIds = recipeIds;
        throw error;
      }
    }

    // ---- 3. actor flags ---------------------------------------------------------------
    // ONE clean-up, which is TWO writable-actor walks: `CraftingRunManager.cleanupInvalidRuns`
    // and then `RecipeVisibilityService.cleanupLearnedRecipes`. Pre-existing and correct —
    // they clear different stores — but it is one clean-up per SET rather than per recipe,
    // which is the batching claim, and "a single actor-flag pass" was never true of it.
    await this.recipeManager.cleanupOrphanedRecipeFlags?.({ removedRecipeIds: outcome.recipeIds });

    // ---- 4. both change hooks ---------------------------------------------------------
    if (recipeItemsRewritten > 0 && options.notifySystems !== false) this._notifySystemsChanged();
    if (options.emitChange !== false) {
      // The payload shape is the singular `{recipeId}` widened to the id SET. Confirmed
      // safe: `_notifyRecipesChanged` spreads `details`, a plural `recipeIds` payload
      // already exists on the bulk edit above, and every in-repo listener is arity-0.
      //
      // The SINGULAR key is emitted too when the set holds exactly one id, so the payload
      // does not become path-dependent: `RecipeManager.deleteRecipe` is still live for
      // `deleteSystem` and the importer and emits `{…, recipeId}`, and "every listener is
      // arity-0" is a fact about THIS repo, not about a third-party module reading the hook.
      const details = { action: 'delete', recipeIds: outcome.recipeIds };
      if (outcome.recipeIds.length === 1) details.recipeId = outcome.recipeIds[0];
      this.recipeManager.notifyRecipesChanged?.(details);
    }

    return {
      deleted: outcome.deleted,
      recipeIds: outcome.recipeIds,
      // BOTH numbers. `plan.affectedIds` is what the card promised the GM and was being
      // computed and discarded, so the toast reported the implementation figure instead:
      // on a legacy-basis system the card read "Will be removed from 1 book or scroll" and
      // the toast then omitted the clause entirely, making the operation look as though it
      // had done less than it said it would.
      recipeItemsAffected: plan.affectedIds.length,
      recipeItemsRewritten,
      learnersAffected: learnerIds.length,
    };
  }

  async deleteItem(systemId, itemId) {
    this._assertGM('delete component');
    const outcome = await this._deleteComponentSet(systemId, [itemId]);
    if (outcome.deleted === 0) return false;

    if (outcome.recipesUpdated > 0) {
      ui?.notifications?.info?.(
        `Removed "${outcome.removedNames[0] || 'component'}" and updated ${outcome.recipesUpdated} recipe(s).`
      );
    }

    await this._reconcileAlchemySignaturesAfterDeletion(outcome.system);

    return true;
  }

  /**
   * Delete a SET of components in ONE `craftingSystems` write and ONE `recipes` write (issue 1129).
   *
   * THE BATCHED RECIPE CASCADE IS THE POINT OF THIS METHOD EXISTING, exactly as it is for
   * {@link CraftingSystemManager#deleteEssences}. Looping
   * {@link CraftingSystemManager#deleteItem} would issue one `craftingSystems` write per
   * component AND, because {@link RecipeManager#updateRecipe} ends in its own full-replace
   * `save()`, one `recipes` write per rewritten recipe per component, each triggering a
   * serialization diff plus `Hooks.callAll` on EVERY connected client — and a recipe referencing
   * two deleted components would be written and COUNTED twice. Instead the union rewrite is
   * computed per recipe ONCE and exactly one save of each follows. Because both settings are
   * REPLACED rather than merged, neither needs a `-=` deletion key.
   *
   * In-use components are NOT refused: deletion is warned, not blocked. `recipesDisabled` counts
   * recipes this call took from enabled to disabled, because the number exists to warn about
   * craftability the GM is about to lose, not to restate what was already off.
   */
  async deleteComponents(systemId, componentIds) {
    this._assertGM('delete components');
    const outcome = await this._deleteComponentSet(systemId, componentIds);
    if (outcome.deleted === 0) {
      return { deleted: 0, componentIds: [], recipesUpdated: 0, recipesDisabled: 0 };
    }

    this._notifySystemsChanged();

    if (outcome.recipesUpdated > 0) {
      ui?.notifications?.info?.(
        `Removed ${outcome.deleted} component(s) and updated ${outcome.recipesUpdated} recipe(s).`
      );
    }

    await this._reconcileAlchemySignaturesAfterDeletion(outcome.system);

    return {
      deleted: outcome.deleted,
      componentIds: outcome.componentIds,
      recipesUpdated: outcome.recipesUpdated,
      recipesDisabled: outcome.recipesDisabled,
    };
  }

  /**
   * The shared body of {@link CraftingSystemManager#deleteItem} and
   * {@link CraftingSystemManager#deleteComponents}: remove the components, repair every reference
   * to them, and persist once. Both route through here so they cannot disagree about what
   * deleting a component reaches. It deliberately does NOT assert GM, notify, or reconcile alchemy
   * signatures — each caller owns its own message.
   *
   * The recipe rewrites run BEFORE `await this.save()`, as both essence deletes already do. That
   * ordering is only safe because the activation blocker lives in `_validateRecipeForActivation`
   * and NOT in `_validateRecipeForPersistence`: a persistence-level blocker would throw partway
   * through the loop with the system already mutated in memory and nothing persisted.
   *
   * ONE REFERENCE CLASS IS DELIBERATELY LEFT DANGLING: a SURVIVING component's
   * `salvage.resultGroups[].results` may name a deleted component, and nothing here repairs it,
   * exactly as the shipped `deleteItem` did not. The consequence is bounded and visible, because
   * the bulk panel's impact statement claims no salvage coverage.
   */
  async _deleteComponentSet(systemId, componentIds) {
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const components = Array.isArray(system.components) ? system.components : [];
    const requested = new Set(normalizeSelectionIds(componentIds));
    const removed = components.filter((component) => requested.has(String(component?.id ?? '')));
    if (removed.length === 0) {
      return {
        deleted: 0,
        componentIds: [],
        removedNames: [],
        recipesUpdated: 0,
        recipesDisabled: 0,
        system,
      };
    }

    const removedIds = removed.map((component) => String(component.id));
    const removedIdSet = new Set(removedIds);
    system.components = components.filter(
      (component) => !removedIdSet.has(String(component?.id ?? ''))
    );

    // Clear essence source-item links that pointed to any deleted component.
    const essenceDefinitions = (system.essenceDefinitions || []).map((def) => ({
      ...def,
      originItemUuid: removedIdSet.has(def.originItemUuid) ? null : def.originItemUuid,
      associatedSystemItemId: removedIdSet.has(def.associatedSystemItemId)
        ? null
        : def.associatedSystemItemId,
    }));
    system.essenceDefinitions = essenceDefinitions;
    system.essences = essenceDefinitions.map((def) => def.id);

    const { recipesUpdated, recipesDisabled } = await this._stripComponentsFromRecipes(
      systemId,
      removedIdSet
    );

    // Clean up salvage runs referencing each deleted component.
    for (const componentId of removedIds) {
      await this._cleanupSalvageRunsForComponent(componentId, systemId);
    }

    await this.save({ put: system, domains: ESSENCE_FACTS });

    return {
      deleted: removedIds.length,
      componentIds: removedIds,
      removedNames: removed.map((component) => String(component?.name ?? '')),
      recipesUpdated,
      recipesDisabled,
      system,
    };
  }

  /**
   * Strip every deleted component from every referencing recipe in ONE `recipes` write. Each
   * recipe is rewritten ONCE for the whole set — a recipe referencing two deleted components must
   * not be written or counted twice — and only recipes that actually reference one are touched.
   * The rewrite and the "no longer craftable" decision both live in
   * `src/utils/recipeComponentReferences.js`, which the bulk panel's impact statement also counts
   * through, so the stated numbers and the executed write cannot drift.
   */
  async _stripComponentsFromRecipes(systemId, removedIdSet) {
    const recipes = this.recipeManager
      .getRecipes({})
      .filter(
        (recipe) =>
          recipe.craftingSystemId === systemId && recipeReferencesAnyComponent(recipe, removedIdSet)
      );

    let recipesDisabled = 0;
    for (const recipe of recipes) {
      const { json } = stripComponentsFromRecipeJson(recipe, removedIdSet);
      if (recipeLostItsShape(json)) {
        if (json.enabled !== false) recipesDisabled += 1;
        json.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, json, {
        persist: false,
        notify: false,
        emitChange: false,
        allowIncomplete: true,
      });
    }

    if (recipes.length > 0) {
      await this.recipeManager.save();
      // ONE change signal for the whole batch, restoring what `emitChange: false` suppressed, and
      // load-bearing rather than tidy: `settingChangeBridge` re-emits only when
      // `recipeManager.reload()` returns truthy, and on the WRITING client the in-memory map
      // already equals the saved setting, so without this a GM's own crafting window keeps
      // offering pre-rewrite recipes. The COMPONENT-side attribution travels with it (issue 1078
      // part B1), because the singular delete drains no system-side attribution of its own.
      this.recipeManager.notifyRecipesChanged({
        action: 'update',
        domains: ESSENCE_FACTS,
        systemIds: [systemId],
      });
    }
    return { recipesUpdated: recipes.length, recipesDisabled };
  }

  /**
   * After an essence/component deletion in an alchemy system, re-run the signature uniqueness check
   * and disable every recipe that now participates in a conflict, notifying the GM of their names.
   * No-op for non-alchemy systems.
   * @param {object} system
   * @private
   */
  async _reconcileAlchemySignaturesAfterDeletion(system) {
    if (system?.resolutionMode !== 'alchemy') return;
    const disabled = await this.recipeManager.disableSignatureConflicts(system.id);
    if (disabled.length > 0) {
      const names = disabled.map((d) => d.name).join(', ');
      ui?.notifications?.info?.(
        `Disabled ${disabled.length} recipe(s) with conflicting signatures: ${names}`
      );
    }
  }

  /**
   * MAKE THE ESSENCE DELETE AN OVERRIDE before it strips (issue 1371).
   *
   * THE DEFECT THIS CLOSES: the cascade strips the essence from `system.components`, the
   * PERSISTED in-system rows, but since the `1.32.0` election a component's `essences` are a
   * WORLD SECTION every system INHERITS unless it overrides, and `unionScopedDefinitions`
   * overwrites an inheriting row's map wholesale with the world one. So on a post-upgrade world
   * the strip changed nothing anybody resolves.
   *
   * THE ANSWER IS THIS REVISION'S OWN RULE: a system-scope essence write is an OVERRIDE, and a
   * delete is a write, so each affected pair that INHERITS is flipped to override FIRST and the
   * strip lands on the row that system now resolves. The world map is untouched, so every OTHER
   * system keeps the essence. WHICH PAIRS ARE SHADOWED IS NOT DECIDED HERE: this method knows the
   * cascade's REACH and hands it to the seam, which is `componentEssenceOverride`'s cohort unit.
   *
   * AND THE ROW IS SEEDED FROM WHAT THE PAIR RESOLVED, because flipping alone would be a second
   * data loss: an inheriting pair's own row is DORMANT, so overriding onto it would silently drop
   * every OTHER essence the GM can see. The resolved map is read BEFORE the flip, because the
   * flip changes what the pair resolves. NO SEAM MEANS NO FLIP, the honest degradation. A pair
   * whose flag write is REFUSED still inherits, which is logged rather than thrown and returned
   * as `unreachable`, because blocking would leave a definition the GM asked to remove in place.
   */
  async _overrideInheritedEssencesBeforeStrip(system, essenceIds, overrideInheritedEssences) {
    if (typeof overrideInheritedEssences !== 'function') {
      return { overridden: [], unreachable: [] };
    }
    const deleted = new Set(essenceIds.map(String));
    const resolved = resolvedComponentEssencesById(this, system.id);
    if (!resolved) return { overridden: [], unreachable: [] };

    // ONE pass over the rows, holding each affected row BESIDE the map it resolved: the second
    // walk this used to make was a second raw read of `system.components` for no new information,
    // and `tests/world-scope-reader-ledger.test.js` counts every one of those.
    const affected = new Map();
    for (const component of system.components || []) {
      const id = String(component?.id ?? '');
      const map = resolved.get(id);
      if (!map || typeof map !== 'object') continue;
      if (Object.keys(map).every((essenceId) => !deleted.has(essenceId))) continue;
      affected.set(id, { component, map });
    }
    if (affected.size === 0) return { overridden: [], unreachable: [] };

    const writable = new Set(await overrideInheritedEssences(system.id, [...affected.keys()]));
    const overridden = [];
    for (const [id, { component, map }] of affected) {
      if (!writable.has(id)) continue;
      component.essences = { ...map };
      overridden.push(id);
    }
    const unreachable = [...affected.keys()].filter((id) => !writable.has(id));
    if (unreachable.length > 0) {
      console.error(
        'Fabricate | component essence override refused, so the essence delete cannot reach',
        unreachable,
        'in system',
        system.id
      );
    }
    return { overridden, unreachable };
  }

  /**
   * Delete an essence definition and strip it from any recipe ingredient sets that reference it.
   * Only referencing recipes are re-saved, one summary notification is emitted, and recipes left
   * with no usable ingredient sets or results are disabled.
   *
   * `overrideInheritedEssences` is how the component half of the cascade reaches a pair that
   * INHERITS its essence map from the world record — see
   * {@link _overrideInheritedEssencesBeforeStrip}. It is supplied by the caller, because the flag
   * it writes is a world-scope setting and this manager holds no write path to one.
   */
  async deleteEssence(systemId, essenceId, { overrideInheritedEssences } = {}) {
    this._assertGM('delete essence');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const removed = definitions.find((def) => def.id === essenceId);
    if (!removed) return false;

    // BEFORE the definitions move, because the seam reads what the pair RESOLVES and the read
    // union is derived from this system's record.
    await this._overrideInheritedEssencesBeforeStrip(
      system,
      [essenceId],
      overrideInheritedEssences
    );

    system.essenceDefinitions = definitions.filter((def) => def.id !== essenceId);
    system.essences = system.essenceDefinitions.map((def) => def.id);

    // Strip the essence from any component that still carries it. Deletion is warned, not
    // blocked, so this cascade is what keeps component references from dangling after a delete.
    for (const component of system.components || []) {
      if (component.essences && essenceId in component.essences) {
        delete component.essences[essenceId];
      }
    }

    // Strip the essence from recipe ingredient sets, touching only referencing recipes.
    const recipes = this.recipeManager
      .getRecipes({})
      .filter(
        (r) => r.craftingSystemId === systemId && this._recipeReferencesEssence(r, essenceId)
      );
    let updatedRecipeCount = 0;
    for (const recipe of recipes) {
      const updated = recipe.toJSON();
      updated.ingredientSets = this._stripEssenceFromSets(updated.ingredientSets, essenceId);
      updated.steps = (updated.steps || []).map((step) => ({
        ...step,
        ingredientSets: this._stripEssenceFromSets(step.ingredientSets, essenceId),
      }));

      if (this._recipeLostItsShape(updated)) updated.enabled = false;

      await this.recipeManager.updateRecipe(recipe.id, updated, {
        notify: false,
        allowIncomplete: true,
      });
      updatedRecipeCount += 1;
    }

    await this.save({ put: system, domains: ESSENCE_FACTS });
    this._notifySystemsChanged();

    if (updatedRecipeCount > 0) {
      ui?.notifications?.info?.(
        `Removed essence "${removed.name ?? 'essence'}" and updated ${updatedRecipeCount} recipe(s).`
      );
    }

    await this._reconcileAlchemySignaturesAfterDeletion(system);

    return true;
  }

  /**
   * Apply a bulk edit — any of icon, colour and enabled status — to a SET of essence definitions
   * in ONE `craftingSystems` write (issue 1036). The essence twin of
   * {@link CraftingSystemManager#applyBulkEditToComponents}, routed through
   * {@link CraftingSystemManager#updateSystem} rather than mutating `system.essenceDefinitions`
   * directly, because that is where the alchemy guard lives: an essences edit to an
   * ALREADY-alchemy system runs `_assertNoAlchemySignatureCollisions`, which THROWS, so a status
   * flip that would collapse two recipes onto one signature is BLOCKED per
   * `destructive-changes-and-migrations/spec.md` §Alchemy Uniqueness Revalidation clauses 3 and 5.
   *
   * EVERY AXIS IS PRESENCE-GATED ON `Object.hasOwn`, NEVER TRUTHINESS: `enabled: false` and
   * `colorToken: null` are FALSY BUT REAL staged edits, and a truthiness test would drop the two
   * most ordinary operations the panel offers. An empty `edit` is a no-op issuing NO write.
   *
   * @returns {Promise<{updated: number, essenceIds: string[]}>} the resolved cohort the edit was
   *   APPLIED TO, not a diff, so `updated` is a selection size.
   * @throws {Error} when the system does not resolve, or the result would carry a collision.
   */
  async applyBulkEditToEssences(systemId, essenceIds, edit = {}) {
    this._assertGM('apply a bulk edit to essences');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const targetIds = new Set(normalizeSelectionIds(essenceIds));
    if (targetIds.size === 0) return { updated: 0, essenceIds: [] };

    const bulkEdit = edit && typeof edit === 'object' ? edit : {};
    const hasIcon = Object.hasOwn(bulkEdit, 'icon') && String(bulkEdit.icon || '').trim() !== '';
    const hasColorToken = Object.hasOwn(bulkEdit, 'colorToken');
    const hasEnabled = Object.hasOwn(bulkEdit, 'enabled');
    if (!hasIcon && !hasColorToken && !hasEnabled) return { updated: 0, essenceIds: [] };

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const changedIds = [];
    const next = definitions.map((definition) => {
      if (!targetIds.has(String(definition?.id ?? ''))) return definition;
      changedIds.push(String(definition.id));
      return {
        ...definition,
        icon: hasIcon ? String(bulkEdit.icon).trim() : definition.icon,
        colorToken: hasColorToken ? bulkEdit.colorToken : definition.colorToken,
        enabled: hasEnabled ? bulkEdit.enabled === true : definition.enabled !== false,
      };
    });
    if (changedIds.length === 0) return { updated: 0, essenceIds: [] };

    await this.updateSystem(systemId, { essenceDefinitions: next });
    return { updated: changedIds.length, essenceIds: changedIds };
  }

  /**
   * Delete a SET of essence definitions in ONE `craftingSystems` write and ONE `recipes` write
   * (issue 1036).
   *
   * THE BATCHED RECIPE CASCADE IS THE POINT OF THIS METHOD EXISTING:
   * {@link RecipeManager#updateRecipe} ends in its own full-replace `save()`, so looping
   * {@link CraftingSystemManager#deleteEssence} would issue one `recipes` write per rewritten
   * recipe, each triggering `reload()` plus a serialization diff plus `Hooks.callAll` on EVERY
   * connected client, and a recipe referencing two deleted essences would be written twice.
   * Instead the union rewrite is computed per recipe ONCE and exactly one save of each follows.
   * Because both settings are REPLACED rather than merged, neither needs a `-=` deletion key.
   *
   * The recipe rewrites deliberately run BEFORE `await this.save()`, which is only safe because
   * the disabled-essence activation blocker lives in `_validateRecipeForActivation` and NOT in
   * `_validateRecipeForPersistence`. In-use essences are NOT refused: deletion is warned, not
   * blocked. `recipesDisabled` counts recipes this call took from enabled to disabled, because
   * the number warns about craftability the GM is about to lose.
   */
  async deleteEssences(systemId, essenceIds, { overrideInheritedEssences } = {}) {
    this._assertGM('delete essences');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const requested = new Set(normalizeSelectionIds(essenceIds));
    const removed = definitions.filter((def) => requested.has(String(def?.id ?? '')));
    if (removed.length === 0) {
      return { deleted: 0, essenceIds: [], recipesUpdated: 0, recipesDisabled: 0 };
    }

    const removedIds = removed.map((def) => String(def.id));
    const removedIdSet = new Set(removedIds);

    // ONE cohort for the whole set, before the definitions move — the singular's reason, and the
    // batching reason this method exists for: a component carrying two deleted essences must not
    // be flipped twice.
    await this._overrideInheritedEssencesBeforeStrip(system, removedIds, overrideInheritedEssences);

    system.essenceDefinitions = definitions.filter(
      (def) => !removedIdSet.has(String(def?.id ?? ''))
    );
    system.essences = system.essenceDefinitions.map((def) => def.id);

    // Defensively strip every deleted essence from any component that still carries it.
    for (const component of system.components || []) {
      if (!component.essences) continue;
      for (const essenceId of removedIds) {
        if (essenceId in component.essences) delete component.essences[essenceId];
      }
    }

    const { recipesUpdated, recipesDisabled } = await this._stripEssencesFromRecipes(
      systemId,
      removedIds
    );

    await this.save({ put: system, domains: ESSENCE_FACTS });
    this._notifySystemsChanged();

    if (recipesUpdated > 0) {
      ui?.notifications?.info?.(
        `Removed ${removedIds.length} essence(s) and updated ${recipesUpdated} recipe(s).`
      );
    }

    await this._reconcileAlchemySignaturesAfterDeletion(system);

    return { deleted: removedIds.length, essenceIds: removedIds, recipesUpdated, recipesDisabled };
  }

  /** Strip every deleted essence from every referencing recipe in ONE `recipes` write. Each recipe
   * is rewritten ONCE for the whole set — a recipe referencing two deleted essences must not be
   * written twice — and the trailing `save()` is the only persist. */
  async _stripEssencesFromRecipes(systemId, removedIds) {
    const recipes = this.recipeManager
      .getRecipes({})
      .filter(
        (recipe) =>
          recipe.craftingSystemId === systemId &&
          removedIds.some((essenceId) => recipeReferencesEssence(recipe, essenceId))
      );

    let recipesDisabled = 0;
    for (const recipe of recipes) {
      const updated = recipe.toJSON();
      for (const essenceId of removedIds) {
        updated.ingredientSets = this._stripEssenceFromSets(updated.ingredientSets, essenceId);
        updated.steps = (updated.steps || []).map((step) => ({
          ...step,
          ingredientSets: this._stripEssenceFromSets(step.ingredientSets, essenceId),
        }));
      }
      if (this._recipeLostItsShape(updated)) {
        if (updated.enabled !== false) recipesDisabled += 1;
        updated.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, updated, {
        persist: false,
        notify: false,
        emitChange: false,
        allowIncomplete: true,
      });
    }

    if (recipes.length > 0) await this.recipeManager.save();
    return { recipesUpdated: recipes.length, recipesDisabled };
  }

  /** Whether a rewritten recipe has lost its ingredient sets or its results entirely and must
   * therefore be clamped to disabled. Shared by the single and set essence deletes so the two
   * cannot disagree about what "no longer craftable" means. Both callers pass `recipe.toJSON()`,
   * whose result data lives in `resultGroups` alone since the flat `results` alias was retired
   * (issue 1087). */
  _recipeLostItsShape(updated) {
    return recipeLostItsShape(updated);
  }

  /** Whether a recipe references the given component in any ingredient set or result, using the
   * same field matching as the strip logic the component deletes execute. Delegates to the shared
   * leaf (issue 1129) so this predicate, the strip and the admin store's recipe-usage projection
   * are one implementation rather than three. */
  _recipeReferencesComponent(recipe, itemId) {
    return recipeReferencesComponent(recipe, itemId);
  }

  /**
   * Strip an essence from an ingredient-set array: remove the legacy per-set map key AND any
   * first-class essence OPTION for that essence from each group, dropping a group left with no
   * options, then drop a set left with no groups, ingredients or essences.
   *
   * `ingredients` IS RESOLVED, NEVER CARRIED THROUGH THE SPREAD (issue 1036). It is the flat
   * legacy mirror `IngredientSet` derives from `ingredientGroups`, and a payload written before
   * issue 1135 still carries it alongside the groups, so a `...set` spread hands the STALE mirror
   * to both the retention filter and the `IngredientSet` constructor. Two live defects followed:
   * the retention filter reads `set.ingredients?.length`, so a set whose ONLY requirement was the
   * deleted essence survived the drop and then raised at PERSISTENCE level, aborting the cascade
   * with the system mutated in memory and nothing written; and `IngredientSet`'s constructor
   * rebuilds groups from `data.ingredients` when `ingredientGroups` is empty, RESURRECTING the
   * deleted essence option.
   *
   * Since issue 1135 the mirror is DROPPED rather than recomputed for a set authored with groups,
   * so the patch carries ONE ingredient authority and no consumer can read a mirror that disagrees
   * with the groups beside it. Dropping it UNCONDITIONALLY would not be safe: for a set authored
   * in the LEGACY flat shape that array is the only ingredient data, so it is filtered in place
   * and kept. The same reasoning retires `essences: {}`.
   */
  _stripEssenceFromSets(sets, essenceId) {
    const isDeletedEssence = (ref) =>
      ref?.match?.type === 'essence' && ref.match.essenceId === essenceId;
    return (sets || [])
      .map((set) => {
        const essences = { ...set.essences };
        delete essences[essenceId];
        const ingredientGroups = (set.ingredientGroups || [])
          .map((group) => ({
            ...group,
            options: (group.options || []).filter((option) => !isDeletedEssence(option)),
          }))
          .filter((group) => (group.options?.length || 0) > 0);
        const next = { ...set, essences, ingredientGroups };
        if (Object.keys(essences).length === 0) delete next.essences;
        const surviving =
          (set.ingredientGroups?.length || 0) > 0
            ? []
            : (set.ingredients || []).filter((ingredient) => !isDeletedEssence(ingredient));
        if (surviving.length > 0) next.ingredients = surviving;
        else delete next.ingredients;
        return next;
      })
      .filter(
        (set) =>
          (set.ingredientGroups?.length || set.ingredients?.length || 0) > 0 ||
          Object.keys(set.essences || {}).length > 0
      );
  }

  /** Whether a recipe references the given essence in any ingredient set — a thin delegator to the
   * shared {@link recipeReferencesEssence} leaf (issue 1036), which the admin store's
   * `recipeUsageCount` projection also reads, so the row's count cannot disagree with the cascade
   * this manager performs. Retained as a method so existing callers are unaffected. */
  _recipeReferencesEssence(recipe, essenceId) {
    return recipeReferencesEssence(recipe, essenceId);
  }

  /**
   * Returns the ResolutionModeService instance from game.fabricate, or null.
   * @returns {object|null}
   */
  _getResolutionModeService() {
    return game.fabricate?.getResolutionModeService?.() || null;
  }

  _getSalvageRunManager() {
    return game.fabricate?.getSalvageRunManager?.() || null;
  }

  _getCraftingRunManager() {
    return game.fabricate?.getCraftingRunManager?.() || null;
  }

  _getGatheringRunManager() {
    return game.fabricate?.getGatheringRunManager?.() || null;
  }

  _getGatheringEnvironmentStore() {
    return game.fabricate?.getGatheringEnvironmentStore?.() || null;
  }

  _getGatheringRichStateService() {
    return game.fabricate?.getGatheringRichStateService?.() || null;
  }

  _getRecipeVisibilityService() {
    return game.fabricate?.getRecipeVisibilityService?.() || null;
  }

  /**
   * For each component with salvage.enabled=true, validate it against the new mode
   * using ResolutionModeService. Disable any that are invalid and return their names.
   * Mutates system.components in-place.
   * @param {object} system - Normalised system object (post-update)
   * @param {string} oldMode - The previous salvageResolutionMode
   * @returns {string[]} Names of disabled components
   */
  _disableInvalidSalvageConfigs(system, oldMode) {
    if (!system.features?.salvage) return [];
    if (system.salvageResolutionMode === oldMode) return [];

    const resolutionService = this._getResolutionModeService();
    if (!resolutionService) return [];

    const disabled = [];
    const items = Array.isArray(system.components) ? system.components : [];
    for (const item of items) {
      if (!item.salvage?.enabled) continue;
      const validation = resolutionService.validateSalvage(item, system);
      if (!validation.valid) {
        item.salvage.enabled = false;
        disabled.push(item.name || item.id);
      }
    }
    return disabled;
  }

  /** Detect components whose surplus Simple-mode salvage success groups were dropped by the
   * `_normalizeSalvage` clamp (issue 764), comparing the pre-normalization input against the
   * normalized result, so `updateSystem` can disclose the deletion. A dropped reserved failure
   * group is NOT reported — this counts SUCCESS groups only, matching the ruled invariant. */
  _detectDroppedSimpleSalvageGroups(inputSystem, normalizedSystem) {
    if (normalizedSystem?.salvageResolutionMode !== 'simple') return [];
    const rawItems = Array.isArray(inputSystem?.components)
      ? inputSystem.components
      : Array.isArray(inputSystem?.managedItems)
        ? inputSystem.managedItems
        : Array.isArray(inputSystem?.items)
          ? inputSystem.items
          : [];
    const normalizedById = new Map(
      (Array.isArray(normalizedSystem?.components) ? normalizedSystem.components : []).map(
        (component) => [component.id, component]
      )
    );
    const countSuccessGroups = (salvage) =>
      (Array.isArray(salvage?.resultGroups) ? salvage.resultGroups : []).filter(
        (group) => group?.role !== 'failure'
      ).length;
    const dropped = [];
    for (const rawItem of rawItems) {
      const rawSuccess = countSuccessGroups(rawItem?.salvage);
      const normalized = normalizedById.get(rawItem?.id) || null;
      const normalizedSuccess = countSuccessGroups(normalized?.salvage);
      if (rawSuccess > normalizedSuccess) {
        dropped.push(normalized?.name || rawItem?.name || rawItem?.id || 'component');
      }
    }
    return dropped;
  }

  /**
   * Remove salvage run history entries for a given system from all actors' flags.
   * Called when features.salvage is set to false.
   * @param {string} systemId
   */
  async _cleanupSalvageRunsForSystem(systemId) {
    const salvageRunManager = this._getSalvageRunManager();
    if (salvageRunManager) {
      await salvageRunManager.removeRunsForSystem(systemId, {
        cancelActive: true,
        removeHistory: true,
        cancellationReason: 'Salvage system disabled',
      });
      return;
    }

    for (const actor of game.actors || []) {
      const existing = getFabricateFlag(actor, 'salvageRuns', null);
      if (!existing) continue;
      const history = Array.isArray(existing.history) ? existing.history : [];
      const filtered = history.filter((r) => r.craftingSystemId !== systemId);
      if (filtered.length !== history.length) {
        await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
      }
    }
  }

  /**
   * Remove salvage run history entries referencing a deleted component from all actors' flags.
   * Called when a component is deleted.
   * @param {string} componentId
   */
  async _cleanupSalvageRunsForComponent(componentId, systemId = null) {
    const salvageRunManager = this._getSalvageRunManager();
    if (salvageRunManager) {
      await salvageRunManager.removeRunsForComponent(componentId, {
        systemId,
        cancelActive: true,
        removeHistory: true,
        cancellationReason: 'Salvage component removed',
      });
      return;
    }

    for (const actor of game.actors || []) {
      const existing = getFabricateFlag(actor, 'salvageRuns', null);
      if (!existing) continue;
      const history = Array.isArray(existing.history) ? existing.history : [];
      const filtered = history.filter(
        (r) => r.componentId !== componentId || (systemId && r.craftingSystemId !== systemId)
      );
      if (filtered.length !== history.length) {
        await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
      }
    }
  }

  /**
   * Reconcile the GM's crafting preferences against the live corpus, gated on the VALID ID BASIS
   * (issue 1226). Entirely CORPUS-DERIVED and entirely a whole-value replacement, and under
   * `user` scope `progressiveResultOrder` is a REPLICATED document write, destructive across
   * every device the player uses, so a partial corpus here is not a cosmetic loss.
   *
   * `targeted: null` IS THE PREFERENCE EXEMPTION, not "nothing names a subject" — the deletion
   * entrance holds both the removed system id and the removed recipe ids. The reason is the one
   * `data-models/spec.md` names: a stale PREFERENCE is bounded and self-healing where a stale
   * ACTOR FLAG is not, and a targeted prune here would add a fresh write to a replicated
   * `user`-scoped document on a path whose defining condition is that this client cannot describe
   * the world it is writing to.
   *
   * THE COMPONENT IDS ARE PASSED (issue 1226). They never were, so `validComponentIds` took its
   * empty-set default and every `salvage:<componentId>` key was dropped on every mode change and
   * system deletion — this gate's own failure mode, reached without any conversion at all. The
   * union declaration in `MUTATION_CLEANUP_ENTITY_KINDS` keeps the halves honest, because this
   * pass rewrites ONE map holding both key scopes.
   */
  async _cleanupCraftingPreferences({ subject = 'a crafting-system change' } = {}) {
    const systems = this.getSystems();
    const validSystemIds = new Set(systems.map((system) => system.id));
    const validRecipeIds = new Set(this.recipeManager.getRecipes({}).map((recipe) => recipe.id));
    const validComponentIds = new Set(
      systems.flatMap((system) => (system.components || []).map((component) => component.id))
    );
    await runGatedMutationCleanup({
      passes: [
        {
          label: 'orphaned crafting preferences',
          sweep: () =>
            cleanupStalePreferences(validSystemIds, validRecipeIds, getSetting, setSetting, {
              resolveGatheringActor: (actorId) => game.actors?.get?.(actorId) ?? null,
              isSelectableGatheringActor: (actor) =>
                isGatheringActorSelectableByUser(actor, game.user),
              validComponentIds,
            }),
          targeted: null,
        },
      ],
      subject,
      // The ONE mutation-time pass that prunes against COMPONENT ids, so the ONE that has to
      // answer whether those ids are still current (issue 1363). The startup door asks the
      // same question at `composeStartupPassList`; the two doors call the same collaborator
      // and a kind declared on one and not the other is a gate that disagrees with itself.
      basis: {
        ...WHOLE_CORPUS_ID_BASIS,
        componentIdentityRemap: !hasPendingWorldScopeRekey(getSetting),
      },
    });
  }
}
