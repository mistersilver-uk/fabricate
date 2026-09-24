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
import { Tool } from '../models/Tool.js';
import { normalizeSelectionIds } from '../utils/bulkSelectionModel.js';
import { normalizeCustomComponentCategories } from '../utils/componentCategories.js';
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
} from '../utils/sourceUuid.js';

import { resolveActiveCraftingCheckFormula } from './checkModifierResolver.js';
import {
  craftingDataChange,
  domainsForRecord,
  emitCraftingDataChanged,
} from './craftingDataChange.js';
import { applyDefinitionChange } from './CraftingDefinitionRepository.js';
import { ALL_INVALIDATION_DOMAINS, domainsForSystemFields } from './invalidationDomains.js';
import { migrateRecipeForModeChange } from './migrateRecipeForModeChange.js';
import { runGatedMutationCleanup } from './mutationCleanupComposition.js';
import { normalizeComponent } from './normalize/components.js';
import {
  convertDiceCritsToTriggers,
  convertNatSteppingToTriggers,
  normalizeCheckBreakage,
  normalizeCheckModifierSelection,
  normalizeCraftingCheck,
  normalizeGatheringCraftingCheck,
  normalizeProgressiveCraftingCheck,
  normalizeRoutedCraftingCheck,
  normalizeRoutedOutcome,
  normalizeSalvageCraftingCheck,
  normalizeSimpleCraftingCheck,
  normalizeSimpleTier,
  normalizeTierStep,
  normalizeUnifiedTrigger,
  normalizeUnifiedTriggers,
} from './normalize/craftingCheck.js';
import {
  looksLikeDocumentUuid,
  normalizeEssenceDefinition,
  normalizeEssenceDefinitions,
  normalizeEssenceQuantities,
  toKey,
} from './normalize/essences.js';
import {
  labelFromUuid,
  normalizeRecipeItemCaps,
  normalizeRecipeItemDefinition,
  normalizeRecipeItemDefinitions,
} from './normalize/recipeItems.js';
import {
  normalizeCurrencyRequirement,
  normalizeSalvage,
  normalizeSalvageResult,
  normalizeSalvageResultGroup,
  normalizeTimeRequirement,
  normalizeToolIds,
  salvageNormalizationContext,
} from './normalize/salvage.js';
import { normalizeSystem } from './normalize/system.js';
import {
  normalizeAlchemyConfig,
  normalizeCurrencyConfig,
  normalizeFeatures,
  normalizeRecipeVisibility,
  normalizeRequirements,
  normalizeStringList,
  normalizeTeaserConfig,
  normalizeVisibilityMode,
} from './normalize/systemFields.js';
import {
  normalizeTool,
  normalizeToolBreakage,
  normalizeToolOnBreak,
  normalizeToolPrerequisites,
  normalizeToolRequirement,
} from './normalize/tools.js';
import { RecipeActivationError } from './RecipeActivationError.js';
import { RecipePersistenceError } from './RecipePersistenceError.js';
import { resolvedComponentEssencesById } from './resolvedComponentEssences.js';
import { RevisionBookkeeping } from './revisionBookkeeping.js';
import { corpusDelta, patchCorpusInPlace, REVISION_SCOPES } from './revisionTokens.js';
import { resolveScopedEntityRead } from './scopedEntityReads.js';
import { SettingsCraftingDefinitionRepository } from './SettingsCraftingDefinitionRepository.js';
import { SignatureValidator } from './SignatureValidator.js';
import {
  autoStampComponentSources,
  autoStampRecipeItemSources,
  autoStampToolSources,
  clearSourceFlag,
  findRecipeItemDefinitionForSource,
  repairItemData,
  stampSourceIdentity,
} from './SourceIdentityService.js';
import {
  buildComponentSourceSnapshot,
  buildFallbackSourceReferences,
  buildRecipeItemSourceSnapshot,
  buildToolSourceSnapshot,
  extractSourceDescription,
  rawSourceDescription,
} from './sourceIdentitySnapshots.js';
import { WHOLE_CORPUS_ID_BASIS } from './startupMaintenance.js';
import { hasPendingWorldScopeRekey } from './worldScopeRekeyPending.js';

const MISSING_SOURCE_FLAG = Symbol('missing-source-flag');

// The invalidation-domain attributions every `save()` site names (issue 1078), derived from the
// field map so a local mutation and its replicated copy classify alike.
const COMPONENT_FACTS = domainsForSystemFields(['components']);
const TOOL_FACTS = domainsForSystemFields(['tools']);
const RECIPE_ITEM_FACTS = domainsForSystemFields(['recipeItemDefinitions']);
// A component delete also rewrites the essence definitions that pointed at it, and an essence
// delete strips the essence from every component: one attribution serves both directions.
const ESSENCE_FACTS = domainsForSystemFields(['essenceDefinitions', 'components']);
// `repairItemData` refreshes definition names, images and descriptions for both libraries.
const ITEM_METADATA_FACTS = domainsForSystemFields(['components', 'tools']);

/** Resolve an injected store seam, given as the store or as a lazy getter (the production shape,
 * since `game.fabricate` is unpopulated at construction). A throwing getter answers `null`, an
 * unknown basis, rather than breaking the normalizer (issue 970). */
function _resolveStoreSeam(seam) {
  if (!seam) return null;
  try {
    return typeof seam === 'function' ? (seam() ?? null) : seam;
  } catch {
    return null;
  }
}

/** One scope store's published corpus, or `null` when no world half is readable, catching a
 * throwing `corpus()` too. `## Scoped Entity Definitions` requirement 16: an unreadable world
 * half answers the in-system array itself. */
function _resolveStoreCorpus(seam) {
  try {
    return _resolveStoreSeam(seam)?.corpus?.() ?? null;
  } catch {
    return null;
  }
}

/** The Valid Id Basis for one world-scope entity type (issue 1359): the world roster unioned with
 * the system's in-system array, or `null` when neither can vouch. The world half counts when
 * `isSeeded('entities')`, the legacy half only when non-empty, and membership is not filtered:
 * an absent membership record is a refusal, never a prune. */
function _scopeEntityBasis(store, legacy) {
  const seeded = store?.isSeeded?.('entities') === true;
  const legacyList = Array.isArray(legacy) && legacy.length > 0 ? legacy : null;
  if (!seeded && !legacyList) return null;
  const ids = _idSet(legacyList ?? []);
  if (seeded) for (const id of store.entityIds()) ids.add(id);
  return ids;
}

/** The Valid Id Basis for one category vocabulary: the migration empties
 * `system.componentCategories`, so an ungated prune would delete every authored category icon.
 * It never reads `fabricate.worldVocabulary` (`## World Vocabulary` requirement 6). */
function _vocabularyBasis(vocabulary) {
  return vocabulary.length > 0 ? vocabulary : null;
}

/** The Valid Id Basis for one library: the world list unioned with the system's legacy copy, or
 * `null` when neither can vouch. Per library, and a legacy copy counts only when non-empty,
 * because pre-1308 saves emitted empty arrays that would license a full prune. */
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
  /** `seams` injects the Foundry-facing collaborators (issue 800), each defaulting to a safe
   * pass-through; `enrichToHtml` passes through because `enrichHTML` cannot run under happy-dom. */
  constructor(recipeManager, seams = {}) {
    this.recipeManager = recipeManager;
    this.systems = new Map();
    this.initialized = false;
    this._bookkeeping = new RevisionBookkeeping({
      entityScope: REVISION_SCOPES.systems,
      systemScopeOf: REVISION_SCOPES.system,
      domainsForFields: domainsForSystemFields,
      ownersOf: (systemId) => [systemId],
    });
    // Shares this map and hydrates through `_normalizeSystem`, a whitelist rebuild, so the
    // repository never carries its own approximation of the persisted shape.
    this._repository = seams.repository ?? this._buildDefaultRepository();
    this._enrichToHtml = seams.enrichToHtml ?? ((text) => text);
    this._primeEnricherCache = seams.primeEnricherCache ?? (async () => {});
    // Active-GM gate for the legacy recipe-item backfill; defaults to a globals probe, so a
    // player is gated without wiring while fixtures (no `activeGM`) still migrate.
    this._isActiveGM =
      seams.isActiveGM ??
      (() => globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id);
    // The world character libraries (issue 1308), the source of two pruned id sets. Optional: a
    // fixture injecting none gets an unknown basis and prunes nothing (`_characterLibraryBasis`).
    this._characterLibrariesStore =
      seams.characterLibrariesStore ??
      (() => globalThis.game?.fabricate?.getCharacterLibrariesStore?.() ?? null);
    // The three world-scope entity stores (issue 1359), optional like the above. Each defaults to
    // a lazy getter, and the accessors are not `_requireReady()`-gated, because optional
    // chaining absorbs an absent accessor but not a throw.
    this._componentScopeStore =
      seams.componentScopeStore ??
      (() => globalThis.game?.fabricate?.getComponentScopeStore?.() ?? null);
    this._essenceScopeStore =
      seams.essenceScopeStore ??
      (() => globalThis.game?.fabricate?.getEssenceScopeStore?.() ?? null);
    this._toolScopeStore =
      seams.toolScopeStore ?? (() => globalThis.game?.fabricate?.getToolScopeStore?.() ?? null);
  }

  /** The injected character-libraries store, given as the store or a lazy getter. */
  _resolveCharacterLibrariesStore() {
    return _resolveStoreSeam(this._characterLibrariesStore);
  }

  /** The Valid Id Basis for one system's reference pruning, `null` for each set not known to be
   * complete (`DOMAIN.md` Valid Id Basis). It unions the world library with the legacy copy, the
   * live corpus before the 1.28.0 migration, and is never a `migrationVersion` check. */
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

  /** The Valid Id Basis for one system's world-scope pruning (issue 1359) plus the icon-map
   * vocabularies, `null` for each basis not known complete. No caller may default one to
   * `new Set()`: `validEssenceIds` is `Set|null` and the `instanceof Set` test depends on it. */
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

  /** The read union for one system's components (issue 1359): world components it is a member
   * of, unioned with its in-system array, world winning on id collision (`## CraftingSystem`
   * requirement 36 keeps that array authoritative). Memoized on (world corpus, system array). */
  resolveScopedComponents(system) {
    return this._resolveScopedUnion(system, this._componentScopeStore, 'components');
  }

  /** The read union for one system's essence definitions; see {@link resolveScopedComponents}. */
  resolveScopedEssences(system) {
    return this._resolveScopedUnion(system, this._essenceScopeStore, 'essenceDefinitions');
  }

  /** The read union for one system's tools; see {@link resolveScopedComponents}. */
  resolveScopedTools(system) {
    return this._resolveScopedUnion(system, this._toolScopeStore, 'tools');
  }

  /** The three read unions' shared body, delegating wholly to `scopedEntityReads.js` so both
   * spellings follow the unknown-half rule identically. */
  _resolveScopedUnion(system, seam, field) {
    const record = typeof system === 'string' ? this.getSystem(system) : system;
    return resolveScopedEntityRead(record, _resolveStoreCorpus(seam), field);
  }

  /** The default repository, the one place the crafting-system backend is chosen (issue 1089). */
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
    // `loadAll()` returns already-normalized systems (issue 1089).
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

  /** Reject a system id that cannot key a durable flag map: `roles.<systemId>.componentId` is
   * nested by `expandObject` on a dotted id and missed by the reader. Fails loudly, and the id
   * is never rewritten, because recipes, tools and gathering config reference it. */
  _assertValidSystemId(id) {
    if (!isSafeFlagKeySegment(id)) {
      throw new Error(
        `Invalid crafting system id "${id}": a system id must match /^[A-Za-z0-9_-]+$/ (no dots or spaces), because it is used as a durable-flag map key.`
      );
    }
  }

  /** The component identity flag key `roles.<systemId>.componentId`, or `null` for an unsafe id,
   * in which case no site writes and the component resolves through raw references. */
  _componentRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.componentId` : null;
  }

  /** The tool identity flag key `roles.<systemId>.toolId` (issue 561), or `null` for an unsafe id;
   * a sibling of the component leaf, so clearing one never touches the other. */
  _toolRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.toolId` : null;
  }

  /** The recipe-item identity flag key `roles.<systemId>.recipeItemDefinitionId` (issue 567), or
   * `null` for an unsafe id; the third sibling leaf. */
  _recipeItemRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.recipeItemDefinitionId` : null;
  }

  _normalizeSystem(system = {}) {
    return normalizeSystem(system, {
      characterLibraryBasis: (s) => this._characterLibraryBasis(s),
      scopeBasis: (s) => this._scopeBasis(s),
    });
  }

  _normalizeTool(tool, options) {
    return normalizeTool(tool, options);
  }

  _normalizeToolPrerequisites(input, validIds) {
    return normalizeToolPrerequisites(input, validIds);
  }

  _normalizeToolRequirement(input) {
    return normalizeToolRequirement(input);
  }

  _normalizeToolBreakage(input) {
    return normalizeToolBreakage(input);
  }

  _normalizeToolOnBreak(input) {
    return normalizeToolOnBreak(input);
  }

  _normalizeFeatures(system) {
    return normalizeFeatures(system);
  }

  _normalizeVisibilityMode(value) {
    return normalizeVisibilityMode(value);
  }

  _normalizeRecipeVisibility(recipeVisibility) {
    return normalizeRecipeVisibility(recipeVisibility);
  }

  _normalizeTeaserConfig(config) {
    return normalizeTeaserConfig(config);
  }

  _normalizeRequirements(requirements) {
    return normalizeRequirements(requirements);
  }

  _normalizeCurrencyConfig(currency) {
    return normalizeCurrencyConfig(currency);
  }

  _normalizeStringList(value) {
    return normalizeStringList(value);
  }

  _normalizeAlchemyConfig(config, resolutionMode) {
    return normalizeAlchemyConfig(config, resolutionMode);
  }

  /** The failure-result policy (issue 1098): may a failed check produce a result at all. One
   * derivation for three whitelist rebuilds, so no activity drops the key on save. New systems
   * default to `perRecord`; upgraded worlds get `never` from the `1.25.0` seed migration. */
  _normalizeFailureResultPolicy(value) {
    return normalizeFailureResultPolicy(value);
  }

  _normalizeCraftingCheck(check, validCatalogueIds) {
    return normalizeCraftingCheck(check, validCatalogueIds);
  }

  _normalizeCheckModifierSelection(check, validIds) {
    return normalizeCheckModifierSelection(check, validIds);
  }

  _normalizeSimpleCraftingCheck(simple) {
    return normalizeSimpleCraftingCheck(simple);
  }

  _normalizeProgressiveCraftingCheck(progressive) {
    return normalizeProgressiveCraftingCheck(progressive);
  }

  _normalizeSimpleTier(tier) {
    return normalizeSimpleTier(tier);
  }

  _convertDiceCritsToTriggers(crits, rollFormula) {
    return convertDiceCritsToTriggers(crits, rollFormula);
  }

  _normalizeRoutedCraftingCheck(routed) {
    return normalizeRoutedCraftingCheck(routed);
  }

  _normalizeRoutedOutcome(outcome, kind) {
    return normalizeRoutedOutcome(outcome, kind);
  }

  _normalizeUnifiedTriggers(rollFormula, diceCrits, checkBreakage, legacyRouted) {
    return normalizeUnifiedTriggers(rollFormula, diceCrits, checkBreakage, legacyRouted);
  }

  _convertNatSteppingToTriggers(natStepping, rollFormula, type) {
    return convertNatSteppingToTriggers(natStepping, rollFormula, type);
  }

  _normalizeCheckBreakage(input) {
    return normalizeCheckBreakage(input);
  }

  _normalizeUnifiedTrigger(trigger) {
    return normalizeUnifiedTrigger(trigger);
  }

  _normalizeTierStep(input) {
    return normalizeTierStep(input);
  }

  _normalizeSalvageCraftingCheck(check, validCatalogueIds) {
    return normalizeSalvageCraftingCheck(check, validCatalogueIds);
  }

  _normalizeGatheringCraftingCheck(check, validCatalogueIds) {
    return normalizeGatheringCraftingCheck(check, validCatalogueIds);
  }

  _normalizeEssenceDefinitions(value) {
    return normalizeEssenceDefinitions(value);
  }

  _normalizeEssenceDefinition(entry, usedIds) {
    return normalizeEssenceDefinition(entry, usedIds);
  }

  _looksLikeDocumentUuid(value) {
    return looksLikeDocumentUuid(value);
  }

  _toKey(value) {
    return toKey(value);
  }

  _normalizeEssenceQuantities(essences, validEssenceIds) {
    return normalizeEssenceQuantities(essences, validEssenceIds);
  }

  _normalizeRecipeItemDefinitions(value) {
    return normalizeRecipeItemDefinitions(value);
  }

  _normalizeRecipeItemCaps(caps) {
    return normalizeRecipeItemCaps(caps);
  }

  _normalizeRecipeItemDefinition(entry, usedIds) {
    return normalizeRecipeItemDefinition(entry, usedIds);
  }

  _labelFromUuid(uuid) {
    return labelFromUuid(uuid);
  }

  _normalizeComponentDescription(description) {
    return this._plainTextDescription(description);
  }

  // Thin delegators to the Foundry-free normalizer (`src/utils/plainTextDescription.js`); they
  // never resolve, which is the async `_enrichToHtml` seam at ingestion (issue 800).
  _plainTextDescription(value) {
    return plainTextDescription(value);
  }

  _descriptionTextCandidate(value, seen = new Set()) {
    return descriptionTextCandidate(value, seen);
  }

  /** The snapshot cluster's collaborators (issue 1699), rebuilt per call because suites patch
   * these methods on constructed instances. */
  _sourceSnapshotCollaborators() {
    return {
      enrichToHtml: (raw, options) => this._enrichToHtml(raw, options),
      resolveImportedComponentSourceData: (itemUuid, source) =>
        this._resolveImportedComponentSourceData(itemUuid, source),
      plainTextDescription: (value) => this._plainTextDescription(value),
      descriptionTextCandidate: (value, seen) => this._descriptionTextCandidate(value, seen),
      normalizeComponentDescription: (description) =>
        this._normalizeComponentDescription(description),
      extractSourceDescription: (source) => this._extractSourceDescription(source),
    };
  }

  async _extractSourceDescription(source = null) {
    return extractSourceDescription(this._sourceSnapshotCollaborators(), source);
  }

  async _buildComponentSourceSnapshot(
    itemUuid,
    source = null,
    fallbackItem = null,
    sourceData = null
  ) {
    return buildComponentSourceSnapshot(
      this._sourceSnapshotCollaborators(),
      itemUuid,
      source,
      fallbackItem,
      sourceData
    );
  }

  async _buildRecipeItemSourceSnapshot(itemUuid, source = null, fallbackDefinition = null) {
    return buildRecipeItemSourceSnapshot(
      this._sourceSnapshotCollaborators(),
      itemUuid,
      source,
      fallbackDefinition
    );
  }

  async _buildToolSourceSnapshot(itemUuid, source = null) {
    return buildToolSourceSnapshot(this._sourceSnapshotCollaborators(), itemUuid, source);
  }

  _buildFallbackSourceReferences(
    item,
    nextSourceUuid,
    nextSourceItemUuid,
    additionalFallbacks = []
  ) {
    return buildFallbackSourceReferences(
      item,
      nextSourceUuid,
      nextSourceItemUuid,
      additionalFallbacks
    );
  }

  _normalizeComponent(item, options) {
    return normalizeComponent(item, options);
  }

  _salvageNormalizationContext(system) {
    return salvageNormalizationContext(system);
  }

  _normalizeSalvage(salvage = {}, options = {}) {
    return normalizeSalvage(salvage, options);
  }

  _normalizeToolIds(toolIds) {
    return normalizeToolIds(toolIds);
  }

  _normalizeSalvageResult(result) {
    return normalizeSalvageResult(result);
  }

  _normalizeSalvageResultGroup(group) {
    return normalizeSalvageResultGroup(group);
  }

  _normalizeTimeRequirement(time) {
    return normalizeTimeRequirement(time);
  }

  _normalizeCurrencyRequirement(currency) {
    return normalizeCurrencyRequirement(currency);
  }

  /** Persist a crafting-system mutation through the repository (issue 1089). Argument-less
   * `save()` is the whole-corpus write; other sites name what they touched, scoping the revision
   * advance (issue 1078). No `domains` means every domain; a `batch` may key them per record. */
  async save(change = null) {
    // The systems-scope revision advance (issue 1076), announced once at this chokepoint; a
    // whole-corpus save advances every system.
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

  _advanceFactScopes(domains, ...systemIds) {
    this._bookkeeping.advanceFactScopes(domains, ...systemIds);
  }

  _attributeChange(domains, ...systemIds) {
    this._bookkeeping.attributeChange(domains, ...systemIds);
  }

  /** `updateSystem` takes an arbitrary patch, so it derives domains from the moved fields. */
  _domainsForSystemEdit(previous, next) {
    return this._bookkeeping.domainsForEdit(previous, next);
  }

  /** Re-read the persisted setting into the map: the non-persisting refresh for a change
   * replicated from another client. {@link corpusDelta} (issues 1076, 1078) advances only changed
   * systems and preserves container identity for the retained indexes; a reordering replaces the
   * map and advances every system. */
  reload() {
    // `null` means the backend has no synchronous replicated snapshot, so reload is a no-op.
    const saved = this._repository.readReplicatedSnapshot();
    this._bookkeeping.holdReloadDelta(null);
    if (!saved) return false;
    const next = new Map();
    for (const normalized of saved) {
      next.set(normalized.id, normalized);
    }
    const delta = corpusDelta(this.systems.values(), next.values());
    this._bookkeeping.holdReloadDelta(delta);
    this.initialized = true;
    if (!delta.changed) return false;

    if (delta.reordered) {
      this.systems = next;
      this._advanceSystemRevision(...next.keys());
      // Attributable to no record, so to no fact class (issue 1078).
      this._advanceFactScopes([], ...next.keys());
      return true;
    }

    patchCorpusInPlace(this.systems, next, delta);
    this._advanceSystemRevision(...delta.perRecord.keys());
    this._bookkeeping.advanceChangedRecords(delta);
    return true;
  }

  consumeReloadDelta() {
    return this._bookkeeping.consumeReloadDelta();
  }

  /** A system is its own scope owner; consumed by `settingChangeBridge.js` on every client. */
  consumeReplicatedChangeScopes() {
    return this._bookkeeping.consumeReplicatedChangeScopes();
  }

  /** The read half of the contract in {@link module:revisionTokens}. */
  revision(scope = REVISION_SCOPES.systems) {
    return this._bookkeeping.read(scope);
  }

  _advanceSystemRevision(...systemIds) {
    this._bookkeeping.advanceEntityScopes(...systemIds);
  }

  getSystems() {
    return [...this.systems.values()];
  }

  getSystem(systemId) {
    return this.systems.get(systemId) || null;
  }

  /**
   * A system's recipes, enabled and disabled: half of the `{getSystem, getRecipesForSystem,
   * getComponentsForSystem}` contract {@link SignatureValidator} expects (issue 1072). Unfiltered,
   * since filtering on `enabled` is the validator's job.
   */
  getRecipesForSystem(systemId) {
    if (!systemId) return [];
    return this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) ?? [];
  }

  /**
   * A system's managed components, the other half of the {@link SignatureValidator} contract
   * (issue 1072). Returns the live array, so callers must not mutate it. Answers through the read
   * union (issue 1370): an absent, unloaded, empty or unreadable world half returns
   * `system.components` itself, a present one a memoized union with stable identity.
   */
  getComponentsForSystem(systemId) {
    return this.resolveScopedComponents(this.getSystem(systemId));
  }

  /** A system's essence definitions, as a defensive copy (issue 1370): the copy is a shipped
   * contract, so callers may sort or splice the answer. */
  getEssenceDefinitions(systemId) {
    return [...this.resolveScopedEssences(this.getSystem(systemId))];
  }

  /** A system's tool library, the twin of {@link getComponentsForSystem} (issue 1370), returning
   * the live array when there is no world half. */
  getToolsForSystem(systemId) {
    return this.resolveScopedTools(this.getSystem(systemId));
  }

  /** One essence definition by id from the retained `byId` facet of {@link module:definitionIndex}
   * (issue 1076); first insert wins, so a duplicate id resolves to the first definition. */
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

  /** One recipe-item definition by id, indexed like
   * {@link CraftingSystemManager#getEssenceDefinition}. */
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

  /** The authoring and browse accessor for a system's managed items, deliberately on the
   * persisted record (issue 1370): a merged read row would offer edits no writer can save.
   * {@link getComponentsForSystem} is the read accessor. */
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
   * Reconcile recipes' legacy `recipeItemId` scalar with book membership. Runs ungated on every
   * `initialize()`, so both halves are idempotent and share one walk and one save per setting.
   * It mints a definition and stamps the scalar for a recipe keeping a standalone
   * `linkedRecipeItemUuid`, and clears a leaked scalar (issue 978) on a book member, since
   * legacy resolvers read it ahead of `recipe.img` (issue 887). The cohorts never overlap.
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
        // Half 2 (issue 978) first, so a cleared recipe (no `linkedRecipeItemUuid`) is no
        // re-stamp candidate and the repair converges in one pass.
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

    // The saves write GM-only world settings, and this runs from `initialize()` before
    // `runStartupMaintenance`'s isolation: on a player the rejection would leave `initialized`
    // false and break the facade for the session (issue 970). The in-memory pass stays ungated.
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

    // The recipe-item identity leaf (issue 567); an unsafe id yields null, so no stamp or clear
    // runs and the item resolves through the legacy scalar and raw references.
    const roleFlagKey = this._recipeItemRoleFlagKey(system.id);

    const snapshot = await this._buildRecipeItemSourceSnapshot(itemUuid, source);
    const existing = this._findRecipeItemDefinitionForSource(system, snapshot, source);
    if (existing) {
      const unchanged =
        existing.name === snapshot.name &&
        existing.img === snapshot.img &&
        existing.description === snapshot.description &&
        existing.originItemUuid === snapshot.originItemUuid;

      // Stamp the identity leaf (and strip a clone's stale `_stats`) on both branches, so
      // re-registering an unchanged definition recovers a source predating the flag (issue 555).
      const previousSourceUuid = existing.originItemUuid;
      if (roleFlagKey) await this._stampSourceIdentity(source, roleFlagKey, existing.id);

      if (unchanged) {
        return { item: existing, action: 'skipped' };
      }

      existing.name = snapshot.name;
      existing.img = snapshot.img;
      existing.description = snapshot.description;
      existing.originItemUuid = snapshot.originItemUuid;
      // Indexed fields changed at constant length, invisible to the `definitionIndex` rule.
      advanceDefinitionRevision(system.recipeItemDefinitions);

      await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
      // A re-point clears only this system's leaf off the old source, never the whole `roles`
      // flag or `roles[systemId]`, which would destroy sibling componentId/toolId.
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
   * Register a first-class Tool directly from an Item uuid (issue 561), with no component import:
   * resolve the Item, build its source snapshot, push a `componentId: null` tool and stamp
   * `roles[systemId].toolId` like the sibling `*FromUuid` methods. GM-gated, skips the flag write
   * for an unsafe id, and saves.
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
        // A required nullable UUID field: a forced deletion fails validation, `null` clears it.
        patch[`_stats.${key}`] = null;
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

  /** Persist one normalized Tool, optionally registering or relinking its Item source. Sources
   * resolve before mutation; a failed write restores the Tool array with no flag writes. */
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
    // The Valid Id Basis `_normalizeSystem` uses (issue 1308), via the same helper: this site
    // bypasses `_normalizeSystem`, and a real-but-empty Set here would strip every tool's
    // prerequisites in a healthy migrated world.
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

  /** Remove a Tool and clear only its `roles[systemId].toolId` leaf from the source Item
   * (issue 561), preserving a sibling `componentId` leaf. GM-gated, saved. */
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

  // Update a recipe item definition's caps and enable state (issue 511); identity is owned by
  // the linking flow. `item`/`learn` partials merge over the current caps and the block is
  // re-normalized by `_normalizeRecipeItemCaps`.
  async updateRecipeItemDefinition(systemId, recipeItemId, patch = {}) {
    this._assertGM('update recipe item');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definition = this.getRecipeItemDefinition(systemId, recipeItemId);
    if (!definition) throw new Error(`Recipe item definition not found: ${recipeItemId}`);

    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      definition.enabled = patch.enabled !== false;
    }

    // Book membership (issue 511): replace the contained-recipe id set. This is the single choke
    // point for the membership-basis marker (issue 1011); the Contents tab, `adminStore` and the
    // bulk book axis land here without re-running `_normalizeSystem`, so a marker set elsewhere
    // would leave the writer and its peers disagreeing.
    if (Object.prototype.hasOwnProperty.call(patch, 'recipeIds')) {
      // Seed before the marker flips and the array is replaced, while the legacy resolution is
      // still live; otherwise every other book's scalar-only members are orphaned permanently.
      this._seedMembershipFromLegacyScalars(system);
      definition.recipeIds = this._normalizeMembershipRecipeIds(patch.recipeIds);
      system.membershipResolvesByRecipeIds = true;
      // `recipeIds` backs the reverse index and was rewritten in place (issue 1076).
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
   * Coerce a membership id list to the persisted shape: trimmed, non-empty, deduped strings, as
   * every `recipeIds` writer produces, since membership readers match by exact equality. Not
   * named `…IdList`, to stay distinct from the imported `normalizeSelectionIds`.
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
   * Carry a system's legacy scalar membership onto `recipeItemDefinitions[].recipeIds` in memory
   * (issue 1011), run by the write that first sets `membershipResolvesByRecipeIds`; a no-op after.
   * It is `migrateInvertRecipeItemLink`'s push half without its delete half, resolving through
   * `resolveLegacyMembershipDefinition` (issue 1155) like every legacy reader, so membership does
   * not change as the basis switches.
   */
  _seedMembershipFromLegacyScalars(system) {
    if (!system || system.membershipResolvesByRecipeIds === true) return false;
    const definitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    if (definitions.length === 0) return false;

    const { byId, bySource } = this._indexRecipeItemDefinitionsForLegacySeed(definitions);
    // The seed's own indexes as data access; the rule stays one implementation.
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
    // Seeded in place, so the reverse index rebuilds on the next read (issue 1076).
    if (seeded) advanceDefinitionRevision(definitions);
    return seeded;
  }

  /** Index definitions by id and by `originItemUuid`, ensuring each has `recipeIds`, for
   * {@link CraftingSystemManager#_seedMembershipFromLegacyScalars}. */
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

  // Merge a caps patch keeping legacy/new mirror pairs consistent (issue 511): a patch setting one
  // member drops the stale sibling, which would otherwise win in the normalizer, so
  // `_normalizeRecipeItemCaps` re-derives it.
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

    // Spec 007 "Alchemy Uniqueness Revalidation": an edit to an already-alchemy system that
    // introduces a signature collision blocks the save, validated on the proposed system before
    // persisting. A mode change into alchemy instead disables colliding recipes below.
    if (toMode === 'alchemy' && !resolutionModeChanged) {
      this._assertNoAlchemySignatureCollisions(merged);
    }

    // Move the check config between the `simple` and `routed` slots when the mode crosses the
    // `routedByIngredients` boundary, before the first persist; fills only an unauthored slot.
    if (resolutionModeChanged) {
      this._reconcileCraftingCheckSlotsForModeChange(merged, fromMode, toMode);
    }

    // Persist first so recipe migration and validation read the new mode.
    this.systems.set(systemId, merged);
    await this.save({ put: merged, domains: this._domainsForSystemEdit(current, merged) });

    // Migration-first mode change: delete only recipes a per-recipe structural constraint of the
    // new mode rules out; system-level gaps gate visibility through validation instead.
    if (resolutionModeChanged) {
      await this._migrateRecipesForModeChange(systemId, fromMode, toMode, merged);
    }

    // Mode change: disable invalid salvage configs (routing gaps, missing progressive check) and
    // persist again if anything changed. Simple-mode group counts are clamped, not disabled
    // (issue 764).
    const oldMode = current.salvageResolutionMode || 'simple';
    const disabledComponents = this._disableInvalidSalvageConfigs(merged, oldMode);
    if (disabledComponents.length > 0) {
      await this.save({ put: merged, domains: COMPONENT_FACTS });
      const names = disabledComponents.join(', ');
      ui?.notifications?.warn?.(
        `Fabricate | Salvage disabled for ${disabledComponents.length} component(s) incompatible with new mode: ${names}`
      );
    }

    // Disclose by name the components whose surplus Simple-mode groups the clamp dropped
    // (issue 764), since the clamp itself is silent.
    const droppedSalvageComponents = this._detectDroppedSimpleSalvageGroups(mergedInput, merged);
    if (droppedSalvageComponents.length > 0) {
      const names = droppedSalvageComponents.join(', ');
      ui?.notifications?.warn?.(
        `Fabricate | Simple salvage keeps a single result group — dropped surplus groups on ${droppedSalvageComponents.length} component(s): ${names}`
      );
    }

    // Salvage feature disabled: clean up salvage run history.
    const oldSalvageEnabled = current.features?.salvage === true;
    const newSalvageEnabled = merged.features?.salvage === true;
    if (oldSalvageEnabled && !newSalvageEnabled) {
      await this._cleanupSalvageRunsForSystem(systemId);
    }

    // Only a mode change into alchemy disables colliding recipes; a collision from any other edit
    // was blocked above. The helper self-guards non-alchemy systems.
    if (toMode === 'alchemy' && resolutionModeChanged) {
      await this._reconcileAlchemySignaturesAfterDeletion(merged);
    }

    this._notifySystemsChanged();
    if (resolutionModeChanged) {
      await this._cleanupCraftingPreferences({ subject: 'a resolution-mode change' });
    }
    return merged;
  }

  /** Move the check config between the `simple` and `routed` slots when a mode crosses the
   * `routedByIngredients` boundary, like the 1.10.0 migration; only an unauthored destination is
   * filled. `dcMode`/`macroUuid` travel too (issue 1096). */
  _reconcileCraftingCheckSlotsForModeChange(merged, fromMode, toMode) {
    const check = merged?.craftingCheck;
    if (!check || typeof check !== 'object') return;

    if (toMode === 'routedByIngredients' && fromMode !== 'routedByIngredients') {
      this._copyPassFailCheckFields(check.routed, check.simple);
    } else if (fromMode === 'routedByIngredients' && toMode === 'routedByCheck') {
      this._copyPassFailCheckFields(check.simple, check.routed);
    }
  }

  /** Copy the pass/fail check fields to a destination only when it has no `rollFormula` and the
   * source does, including `dcMode`/`macroUuid` (issue 1096). */
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

  /** Migrate a system's recipes to a changed mode: migratable ones in place, the rest deleted, one
   * notification per outcome. Deletions are collected and deleted as one set (issue 1132), and
   * the live `merged` system is passed because `updateSystem` saves again after. */
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
   * Block an alchemy-system update that would introduce or leave a signature collision,
   * validating the proposed components against current recipes via {@link SignatureValidator}
   * before persisting and throwing with the conflicting recipes (spec 007 "Alchemy Uniqueness
   * Revalidation"). No-op for non-alchemy systems.
   */
  _assertNoAlchemySignatureCollisions(system) {
    if (system?.resolutionMode !== 'alchemy') return;
    const systemId = system.id;
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) || [];
    const recipeJson = recipes.map((recipe) =>
      typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe
    );
    // Not repointed at the read union (issue 1370): this validates the proposed, unsaved record.
    // `CraftingEngine` checks the union at craft time; both agree while `## CraftingSystem`
    // requirement 36 keeps the union's row set equal to the in-system array's.
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
   * Delete a crafting system and its recipes (GM only). A failed recipe delete is logged and the
   * rest continue, and the system is still removed and saved, so no half-deleted system persists.
   * Emits one aggregated notification, or a warning with the undeleted count.
   */
  async deleteSystem(systemId) {
    this._assertGM('delete crafting system');
    const system = this.systems.get(systemId);
    if (!system) {
      throw new Error(`Crafting system not found: ${systemId}`);
    }

    const affected = this.recipeManager.getRecipes({ craftingSystemId: systemId });
    const failedRecipeIds = [];
    // Ids actually removed, which the mutation-time Valid Id Basis gate prunes when the corpus
    // cannot be attested complete (issue 1226); a failed delete's recipe still exists.
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

  /** Cascade cleanup across every store keyed by `systemId`, skipping unavailable services.
   * Learned-recipe flags are cleaned once after recipes and the system are gone. Only the
   * learned-recipe and preference sweeps are corpus-derived and gated on a Valid Id Basis (issue
   * 1226); the rest name the deleted system. */
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

  /** Announce a crafting-system change: the published legacy hook, then the scoped signal with
   * everything attributed since; draining here keeps save-without-announce paths silent. */
  _notifySystemsChanged() {
    globalThis.Hooks?.callAll?.('fabricate.craftingSystemsChanged', this.getSystems());
    emitCraftingDataChanged(
      craftingDataChange({ source: 'systems', scopes: this._bookkeeping.drainAttribution() })
    );
  }

  async createItem(systemId, data = {}) {
    this._assertGM('create component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    // The Valid Id Basis `_normalizeSystem` uses (issue 1359); this site bypasses it, and a
    // real-but-empty Set on an unreplicated client cannot be refused downstream. `Set|null`.
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
   * @returns {{ currentUuid: string|null, canonicalUuid: string|null, references: string[] }}
   */
  _resolveImportedSourceData(itemUuid, source = null) {
    const references = [];
    if (typeof itemUuid === 'string' && itemUuid.trim()) {
      references.push(itemUuid.trim());
    }
    // A world source with `_stats.duplicateSource` is a clone whose inherited `compendiumSource`
    // names the original's pack, so it keys on its own uuid or it would overwrite the original's
    // definition (issue 555). Registration only: Foundry stamps `duplicateSource` on every
    // non-compendium drag-drop, so `matchRecipeItemDefinition` has no clone gate.
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
   * Component import source references, falling back when the recorded canonical source no
   * longer resolves.
   * @returns {Promise<{currentUuid: string|null, canonicalUuid: string|null, references: string[],
   *   aliasItemUuids: string[],
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>}
   */
  async _resolveImportedComponentSourceData(itemUuid, source = null) {
    const sourceData = this._resolveImportedSourceData(itemUuid, source);
    const sourceFallbacks = [];
    const aliasItemUuids = [];
    // A clone's inherited compendium source was already stripped; never resurrect it here.
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

  /** An existing component claiming any given source reference, ignoring `excludeItemId`. */
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

  // The recipes a book contains: its `recipeIds[]` (issue 511), falling back to the legacy
  // reverse ref only while `membershipResolvesByRecipeIds` is unset.
  _getRecipeObjectsReferencingRecipeItemDefinition(systemId, definition) {
    if (!definition || !this.recipeManager?.getRecipes) return [];
    const recipes = this.recipeManager.getRecipes({ craftingSystemId: systemId });

    const recipeIds = Array.isArray(definition.recipeIds) ? definition.recipeIds : [];
    if (recipeIds.length > 0) {
      const idSet = new Set(recipeIds.map(String));
      return recipes.filter((recipe) => idSet.has(String(recipe?.id)));
    }

    // Once the marker is set an empty `recipeIds` is an empty book, and stale reverse refs must
    // not resurrect membership. The marker is read, never inferred from the arrays (issue 1011).
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

  // The definitions of `systemId` containing `recipeId` (issue 511), by the shared rule in
  // `utils/recipeItemMembership.js` (issue 1155). `{ id: recipeId }` stands in for an unresolvable
  // recipe, so a stale id still answers from the definitions listing it.
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

  /** The stamping and repair cluster's collaborators (issue 1699), rebuilt per call because suites
   * patch them after construction; world collections arrive as thunks, keeping the service free of
   * Foundry globals. */
  _sourceIdentityCollaborators() {
    return {
      getSystems: () => this.getSystems(),
      componentRoleFlagKey: (systemId) => this._componentRoleFlagKey(systemId),
      toolRoleFlagKey: (systemId) => this._toolRoleFlagKey(systemId),
      recipeItemRoleFlagKey: (systemId) => this._recipeItemRoleFlagKey(systemId),
      resolveUuid: (uuid) => (typeof fromUuid === 'function' ? fromUuid(uuid) : null),
      getPack: (packId) => globalThis.game?.packs?.get?.(packId),
      worldItems: () => (globalThis.game?.items ? [...globalThis.game.items] : []),
      itemPacks: () => (globalThis.game?.packs ? [...globalThis.game.packs] : []),
      actors: () => (globalThis.game?.actors ? [...globalThis.game.actors] : []),
      rawSourceDescription: (source) =>
        rawSourceDescription(this._sourceSnapshotCollaborators(), source),
      extractSourceDescription: (source) => this._extractSourceDescription(source),
      primeEnricherCache: (rawTexts) => this._primeEnricherCache(rawTexts),
      persistItemMetadata: async () => {
        await this.save({ domains: ITEM_METADATA_FACTS });
        this._notifySystemsChanged();
      },
    };
  }

  async _stampSourceIdentity(source, flagKey, id) {
    return stampSourceIdentity(source, flagKey, id);
  }

  async _clearSourceFlag(registeredItemUuid, flagKey, id) {
    return clearSourceFlag(this._sourceIdentityCollaborators(), registeredItemUuid, flagKey, id);
  }

  async autoStampRecipeItemSources() {
    return autoStampRecipeItemSources(this._sourceIdentityCollaborators());
  }

  async autoStampComponentSources() {
    return autoStampComponentSources(this._sourceIdentityCollaborators());
  }

  async autoStampToolSources() {
    return autoStampToolSources(this._sourceIdentityCollaborators());
  }

  _findRecipeItemDefinitionForSource(system, snapshot, source) {
    return findRecipeItemDefinitionForSource(
      this._sourceIdentityCollaborators(),
      system,
      snapshot,
      source
    );
  }

  /** GM maintenance ("Repair Item Data"); the GM gate stays here so the permission failure is the
   * manager's. */
  async repairItemData({ includeCompendiums = true } = {}) {
    this._assertGM('repair item data');
    return repairItemData(this._sourceIdentityCollaborators(), { includeCompendiums });
  }

  /**
   * Import (or refresh) a single component from a source Item UUID.
   *
   * @param {{persist?: boolean}} [options] `persist: false` lets a batch caller such as
   *   {@link addItemsFromPack} issue one `save()` for many items; nothing else changes.
   */
  async addItemFromUuid(systemId, itemUuid, options = {}) {
    this._assertGM('add component from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    let source;
    try {
      source = await fromUuid(itemUuid);
    } catch {
      source = null;
    }

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

      // Stamp the source on both branches so one predating the flag, or re-imported, carries the
      // component id; skipped for an unsafe system id.
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
      // Indexed fields rewritten in place (issue 1076).
      advanceDefinitionRevision(system.components);

      if (options.persist !== false) await this.save({ put: system, domains: COMPONENT_FACTS });
      return { item: existing, action: 'updated', sourceFallbacks: nextSnapshot.sourceFallbacks };
    }

    // No match: create a new component. A `_normalizeSystem` bypass site (issue 1359): same basis,
    // same helper, `Set|null`; see `_scopeBasis`.
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

    // A `_normalizeSystem` bypass site (issue 1359): same basis, `Set|null`; see `_scopeBasis`.
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
    // Re-point the flag: clear the old source if it points here and stamp the new one.
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

    // No `_primeEnricherCache` here (issue 800): `getDocuments()` already cached this pack, and
    // intra-pack references are the common case, so per-item priming mostly hits the cache.
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const sourceFallbacks = [];
    // Items mutate memory only (`persist: false`) and the batch is flushed by one `save()` below
    // (issue 1086); `dirty` keeps an all-skipped re-drop from writing.
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
      // In `finally`, so items imported before a throw still persist; named, because every item
      // went into this one system (issue 1078).
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

    // Identity references only: a clone's duplicateSource names its original, which must not
    // receive this edit.
    const itemRefs = new Set(getItemIdentityReferences(item));
    if (itemRefs.size === 0) return { updated: 0 };

    const nextName = refreshName ? item?.name || changes.name || 'Unnamed Item' : null;
    const nextImg = refreshImg ? item?.img || changes.img || 'icons/svg/item-bag.svg' : null;
    // Item sync resolves too (issue 800), or an edited source would re-propagate raw directive
    // text over a repaired description.
    const nextDescription = refreshDescription ? await this._extractSourceDescription(item) : null;
    let updated = 0;
    // The systems this walk rewrote (issue 1078). It walks every system, but a bare `save()` would
    // advance every system's token on each GM item edit via the `updateItem` hook.
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
          // `name` is indexed by the name fallback and rewritten in place (issue 1076).
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
    // A `_normalizeSystem` bypass site (issue 1359): same basis, `Set|null`; see `_scopeBasis`.
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

  /** Lowercase, trim and drop empty tags, preserving order; de-duplication is the caller's job. */
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
   * Apply a bulk edit (category, tag additions and removals, essences, progressive DC) to a set of
   * components in one `save()`, for folder-aware import (issue 771) and bulk edit (issue 772).
   *
   * Axes follow `Component` semantics: `category` overwrites; `addTags` unions case-insensitively,
   * stored lowercase; `removeTags` applies after `addTags`; `essences` replaces the map when
   * present; `difficulty` is cleared by `0`/`null`/`''`. `essences` and `difficulty` test
   * presence, not truthiness. Changed components re-normalize under the system's essence and
   * salvage context, so Simple mode runs the retain-one clamp (issue 764).
   *
   * @returns {Promise<{updated: number, componentIds: string[]}>} the cohort the edit was applied
   *   to, not a diff, as in {@link CraftingSystemManager#applyBulkEditToEssences}.
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

    // A `_normalizeSystem` bypass site (issue 1359): same basis, `Set|null`; see `_scopeBasis`.
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
   * Apply a bulk edit (category, status, lock, check tier, book membership) to a set of recipes in
   * one `recipes` write and one `craftingSystems` write (issue 1010). Lives here because the book
   * axis writes `recipeItemDefinitions[].recipeIds`; recipe fields go through `updateRecipe`.
   *
   * `edit` carries `toBulkRecipeEdit`'s six keys only when staged; `enabled: false`,
   * `locked: false` and `checkTierId: null` are real, so presence is tested with `Object.hasOwn`.
   *
   * Books are written first, because the membership-basis marker makes later membership reads
   * well-defined; each setting's save is skipped when its half changed nothing. The activation
   * gate runs per recipe in batch order inside `updateRecipe`, so a second alchemy candidate sees
   * the first enabled; {@link RecipeManager#canActivateRecipe} is only a lower bound. It maintains
   * the marker itself, since it bypasses `updateRecipeItemDefinition`.
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

    // Resolves, and rejects, the staged check tier before anything is mutated.
    const axes = this._resolveBulkRecipeAxes(system, edit);
    if (!axes.staged) return result;

    const targetIds = new Set(normalizeSelectionIds(recipeIds));
    if (targetIds.size === 0) return result;

    const cohort = (this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) ?? []).filter(
      (recipe) => targetIds.has(String(recipe?.id ?? ''))
    );

    const books = this._applyBulkRecipeBookMembership(system, cohort, axes);
    result.bookIds = books.bookIds;
    result.booksUpdated = books.bookIds.length;
    result.bookAdditions = books.additions;
    result.bookRemovals = books.removals;
    if (books.changed) {
      system.membershipResolvesByRecipeIds = true;
      await this.save({ put: system, domains: RECIPE_ITEM_FACTS });
    }

    const outcome = await this._applyBulkRecipePatches(cohort, axes);
    result.recipeIds = outcome.recipeIds;
    result.updated = outcome.recipeIds.length;
    result.blockedRecipeIds = outcome.blockedRecipeIds;
    result.blockedEnables = outcome.blockedRecipeIds.length;
    result.rejectedRecipeIds = outcome.rejectedRecipeIds;
    result.rejected = outcome.rejectedRecipeIds.length;

    if (result.updated > 0) await this.recipeManager.save();

    // At most one of each change hook. On the writing client `reload()` returns `false` and the
    // socket bridge re-emits nothing, so a book change needs its own signal for the GM's windows.
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
   * Read the six-key `edit` into an axis descriptor by presence, resolving the check tier against
   * this system's tiers. The tier throws here, before any mutation: a bulk write is stricter than
   * the single-recipe editor, which tolerates a dangling `checkTierId`.
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
      // A staged book set is a selection, so it takes `normalizeSelectionIds`.
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
   * Resolve a staged check-tier id against the tiers this system's crafting check authors, or
   * throw. `null`/empty means Default DC; anything else must be an option from
   * `resolveRecipeCheckTierOptions` over the active check slot, which the editor dropdown and the
   * bulk panel also read. The slot comes from the resolver itself (issue 1096); a `null` slot
   * accepts only Default DC.
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
   * Apply the book axis per definition: `addBookIds` and `removeBookIds` are disjoint, so each
   * touched definition takes one operation and is written once (a definition named by both loses
   * to remove). Edge counts are taken against the seeded arrays and exclude the seed's own
   * writes; `changed` is true when any definition was mutated, seed included.
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

    // Seed before any array is replaced, while the legacy resolution is live, or the marker set
    // below would orphan every other book's scalar-only members.
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
      // One operation per definition, so the delta is the edge count.
      if (remove) removals += current.length - next.length;
      else additions += next.length - current.length;
    }
    // Membership rewritten in place on elements (issue 1076).
    if (bookIds.length > 0) advanceDefinitionRevision(system.recipeItemDefinitions);

    return { changed: seeded || bookIds.length > 0, bookIds, additions, removals };
  }

  /**
   * The per-recipe half of the batch. Its atomicity is microtask-only: `updateRecipe` with
   * `persist: false` does no real I/O, but anything awaiting real I/O here would let `reload()`
   * replace the recipes map between iterations and discard staged edits, with no compare-and-set
   * to catch it.
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
   * The minimal patch for one recipe: only staged fields that differ, so an agreeing recipe gets
   * no `updateRecipe` call. The category is normalized first, as `Recipe` does, or `'General'`
   * would differ from a stored `'general'`.
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
   * Write one recipe's minimal patch. A `RecipeActivationError` (refused enable) records the id and
   * retries without `enabled`, which is clean because `updateRecipe` throws before
   * `this.recipes.set`. A `RecipePersistenceError` (unsaveable even under `allowIncomplete`) is
   * logged and the batch continues, since the books save has already committed.
   */
  async _writeBulkRecipePatch(recipeId, updates) {
    // `persist: false` mutates memory per recipe for one trailing `save()`; `allowIncomplete` keeps
    // an authoring shell editable.
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
   * Delete a set of recipes and everything the deletion reaches in at most one `recipes` write, one
   * `craftingSystems` write and one actor-flag clean-up (issue 1132). It lives here because only
   * this manager owns `craftingSystems`; every GM-initiated delete routes through the shared body,
   * as component deletes route through `_deleteComponentSet`.
   *
   * @param {string} systemId An unresolvable id deletes the recipes and prunes nothing, since a
   *   recipe with a dangling `craftingSystemId` is a real orphan.
   * @returns {Promise<{deleted: number, recipeIds: string[], recipeItemsAffected: number,
   *   recipeItemsRewritten: number, learnersAffected: number}>} `recipeItemsAffected` is the
   *   basis-aware count the card states, `recipeItemsRewritten` the definitions actually rewritten
   *   (zero on a legacy-basis system); see `utils/recipeDeleteImpact.js`.
   */
  async deleteRecipes(systemId, recipeIds, options = {}) {
    this._assertGM('delete recipes');
    return await this._deleteRecipeSet(this.getSystem(systemId), recipeIds, options);
  }

  /**
   * The shared body of every cascading recipe delete.
   *
   * Write order is `recipes`, then `craftingSystems`, then actor flags: a failed book write after
   * the recipe write leaves dangling book ids, repaired by the next delete, whereas books first
   * could lose membership of surviving recipes. (`applyBulkEditToRecipes` orders them the other
   * way because its book write sets the basis marker.) Settings go before actors so a caller
   * whose `SETTINGS_MODIFY` is revoked mutates no actor flags.
   *
   * The `craftingSystems` half takes a restore point, since the prune mutates live `recipeIds`
   * before saving. It writes the arrays directly via
   * {@link CraftingSystemManager#_normalizeMembershipRecipeIds} and never sets, reads or seeds
   * the membership-basis marker (issue 1011): seeding would turn legacy membership into authored
   * membership. Both change hooks fire, gated per axis, for the reason in `applyBulkEditToRecipes`.
   *
   * @param {object|null} system The live normalized system, never a snapshot: the mode-change
   *   caller runs inside `updateSystem`, which saves again afterwards.
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

    // Counted before the flag pass clears these entries, through the cascade's actor selector.
    const learnerIds = selectLearnerActorIds(
      buildLearnedRecipeActorIndex(globalThis.game?.actors),
      doomedIds
    );

    // Planned before the recipes leave the map: legacy membership resolves through the recipe.
    const plan = planRecipeItemMembershipPrune(
      system?.recipeItemDefinitions,
      recipes,
      system?.membershipResolvesByRecipeIds === true
    );

    const outcome = await this.recipeManager.deleteRecipes(doomedIds, {
      notify: options.notify,
      emitChange: false,
      cleanupFlags: false,
    });

    // Skipped when this half changed nothing, which is always on a legacy-basis system (see
    // `planRecipeItemMembershipPrune`).
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
        // Restore the live definitions before rethrowing, so this client never shows a prune the
        // world did not receive.
        for (const [definition, recipeIds] of membershipRestore) definition.recipeIds = recipeIds;
        throw error;
      }
    }

    // One clean-up per set, which is two actor walks: `CraftingRunManager.cleanupInvalidRuns` and
    // `RecipeVisibilityService.cleanupLearnedRecipes`.
    await this.recipeManager.cleanupOrphanedRecipeFlags?.({ removedRecipeIds: outcome.recipeIds });

    if (recipeItemsRewritten > 0 && options.notifySystems !== false) this._notifySystemsChanged();
    if (options.emitChange !== false) {
      // The singular `{recipeId}` payload widened to the id set; the singular key is also emitted
      // for a one-id set, so the payload shape matches `RecipeManager.deleteRecipe`'s.
      const details = { action: 'delete', recipeIds: outcome.recipeIds };
      if (outcome.recipeIds.length === 1) details.recipeId = outcome.recipeIds[0];
      this.recipeManager.notifyRecipesChanged?.(details);
    }

    return {
      deleted: outcome.deleted,
      recipeIds: outcome.recipeIds,
      // Both numbers: `plan.affectedIds` is what the confirmation card promised the GM.
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
   * Delete a set of components in one `craftingSystems` write and one `recipes` write (issue 1129).
   * Looping {@link CraftingSystemManager#deleteItem} would write both settings per component, each
   * write diffed and hooked on every client, and double-count a recipe referencing two deleted
   * components; the union rewrite instead runs once per recipe. Both settings are replaced, so no
   * `-=` key is needed. In-use components are warned about, not refused; `recipesDisabled` counts
   * recipes this call took from enabled to disabled.
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
   * {@link CraftingSystemManager#deleteComponents}: remove the components, repair references and
   * persist once. It does not assert GM, notify or reconcile alchemy signatures.
   *
   * The recipe rewrites run before `save()`, which is safe only because the activation blocker
   * lives in `_validateRecipeForActivation`, not `_validateRecipeForPersistence`. A surviving
   * component's `salvage.resultGroups[].results` naming a deleted component is deliberately left
   * dangling; the bulk panel's impact statement claims no salvage coverage.
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
   * Strip the deleted components from referencing recipes in one `recipes` write, each recipe
   * rewritten once. The rewrite and the "no longer craftable" decision live in
   * `src/utils/recipeComponentReferences.js`, which the bulk panel's impact statement counts
   * through too.
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
      // One change signal for the batch, restoring what `emitChange: false` suppressed:
      // `settingChangeBridge` re-emits only when `reload()` returns truthy, which it does not on
      // the writing client. The component-side attribution travels with it (issue 1078).
      this.recipeManager.notifyRecipesChanged({
        action: 'update',
        domains: ESSENCE_FACTS,
        systemIds: [systemId],
      });
    }
    return { recipesUpdated: recipes.length, recipesDisabled };
  }

  /** After a deletion in an alchemy system, disable every recipe now in a signature conflict and
   * notify the GM of their names; no-op otherwise. */
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
   * Make the essence delete an override before it strips (issue 1371). Since the `1.32.0` election
   * a component's `essences` are a world section a system inherits unless it overrides, so
   * stripping the in-system row alone changes nothing resolved. A system-scope essence write is an
   * override, so each affected inheriting pair is flipped first, seeded from the map it resolved
   * (read before the flip, or other essences would be lost); the world map and other systems are
   * untouched. `componentEssenceOverride` decides which pairs are shadowed. No seam means no flip;
   * a refused flag write is logged and returned as `unreachable`, never thrown.
   */
  async _overrideInheritedEssencesBeforeStrip(system, essenceIds, overrideInheritedEssences) {
    if (typeof overrideInheritedEssences !== 'function') {
      return { overridden: [], unreachable: [] };
    }
    const deleted = new Set(essenceIds.map(String));
    const resolved = resolvedComponentEssencesById(this, system.id);
    if (!resolved) return { overridden: [], unreachable: [] };

    // One pass holding each affected row beside its resolved map;
    // `tests/world-scope-reader-ledger.test.js` counts every raw `system.components` read.
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
   * Delete an essence definition and strip it from referencing ingredient sets, re-saving only
   * those recipes, emitting one summary and disabling recipes left without sets or results.
   * `overrideInheritedEssences` is caller-supplied because the flag it writes is a world-scope
   * setting this manager cannot write; see {@link _overrideInheritedEssencesBeforeStrip}.
   */
  async deleteEssence(systemId, essenceId, { overrideInheritedEssences } = {}) {
    this._assertGM('delete essence');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const removed = definitions.find((def) => def.id === essenceId);
    if (!removed) return false;

    // Before the definitions move: the seam reads what the pair resolves.
    await this._overrideInheritedEssencesBeforeStrip(
      system,
      [essenceId],
      overrideInheritedEssences
    );

    system.essenceDefinitions = definitions.filter((def) => def.id !== essenceId);
    system.essences = system.essenceDefinitions.map((def) => def.id);

    // Strip the essence from components still carrying it, so references do not dangle.
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
   * Apply a bulk edit (icon, colour, enabled) to a set of essence definitions in one
   * `craftingSystems` write (issue 1036), through {@link CraftingSystemManager#updateSystem} so
   * the alchemy guard runs: a status flip collapsing two recipes onto one signature throws
   * (`destructive-changes-and-migrations/spec.md` Alchemy Uniqueness Revalidation, clauses 3 and
   * 5). Every axis is presence-gated with `Object.hasOwn`, since `enabled: false` and
   * `colorToken: null` are real edits; an empty `edit` writes nothing.
   *
   * @returns {Promise<{updated: number, essenceIds: string[]}>} the cohort the edit was applied to.
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
   * Delete essence definitions in one `craftingSystems` and one `recipes` write (issue 1036).
   * Looping {@link CraftingSystemManager#deleteEssence} would write `recipes` per recipe, each
   * write a `reload()`, serialization diff and `Hooks.callAll` on every connected client, and
   * twice for a recipe naming two deleted essences. Both settings are replaced, so no `-=` key.
   * Recipe rewrites precede `save()`, safe only as the disabled-essence blocker gates activation.
   * In-use essences are warned, not refused; `recipesDisabled` counts recipes newly disabled.
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

    // One cohort for the whole set, before the definitions move, so a component carrying two
    // deleted essences is flipped once.
    await this._overrideInheritedEssencesBeforeStrip(system, removedIds, overrideInheritedEssences);

    system.essenceDefinitions = definitions.filter(
      (def) => !removedIdSet.has(String(def?.id ?? ''))
    );
    system.essences = system.essenceDefinitions.map((def) => def.id);

    // Strip every deleted essence from components still carrying it.
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

  /** Strip the deleted essences from referencing recipes in one `recipes` write, each recipe
   * rewritten once; the trailing `save()` is the only persist. */
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

  /** Whether a rewritten recipe lost all ingredient sets or results and must be disabled; shared
   * by both essence deletes. Callers pass `recipe.toJSON()`, whose results live in `resultGroups`
   * alone (issue 1087). */
  _recipeLostItsShape(updated) {
    return recipeLostItsShape(updated);
  }

  /** Whether a recipe references the component in any ingredient set or result, via the shared
   * leaf (issue 1129) the strip and the admin store's usage projection also use. */
  _recipeReferencesComponent(recipe, itemId) {
    return recipeReferencesComponent(recipe, itemId);
  }

  /**
   * Strip an essence from ingredient sets: remove the legacy per-set map key and any essence option
   * from each group, drop groups left with no options, then sets left with nothing.
   *
   * `ingredients` is resolved, never spread through (issue 1036): pre-1135 payloads carry a stale
   * flat mirror beside the groups, which would let a set whose only requirement was the deleted
   * essence survive and fail persistence mid-cascade, and let `IngredientSet` resurrect the
   * option. A group-authored set drops the mirror (issue 1135); a legacy flat-shape set keeps it,
   * filtered, as its only ingredient data. `essences: {}` retires on the same reasoning.
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

  /** Whether a recipe references the essence in any ingredient set, via the shared leaf
   * {@link recipeReferencesEssence} (issue 1036) the admin store's `recipeUsageCount` reads. */
  _recipeReferencesEssence(recipe, essenceId) {
    return recipeReferencesEssence(recipe, essenceId);
  }

  /** The ResolutionModeService from `game.fabricate`, or null. */
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

  /** Validate each salvage-enabled component against the new mode, disable the invalid ones in
   * place and return their names. */
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

  /** Components whose surplus Simple-mode salvage success groups the `_normalizeSalvage` clamp
   * dropped (issue 764), for `updateSystem` to disclose; a dropped failure group is not counted. */
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

  /** Remove a system's salvage run history from every actor, when `features.salvage` turns off. */
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

  /** Remove salvage run history referencing a deleted component from every actor. */
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
   * Reconcile the GM's crafting preferences against the live corpus, gated on the Valid Id Basis
   * (issue 1226): a corpus-derived whole-value replacement, and `progressiveResultOrder` is a
   * replicated `user`-scope write. `targeted: null` is the preference exemption named by
   * `data-models/spec.md`: a stale preference is bounded and self-healing, so no targeted prune
   * writes here. Component ids are passed, or every `salvage:<componentId>` key would be dropped;
   * `MUTATION_CLEANUP_ENTITY_KINDS` declares the union because one map holds both key scopes.
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
      // The one mutation-time pass pruning against component ids (issue 1363); the startup door
      // asks the same in `composeStartupPassList`, through the same collaborator.
      basis: {
        ...WHOLE_CORPUS_ID_BASIS,
        componentIdentityRemap: !hasPendingWorldScopeRekey(getSetting),
      },
    });
  }
}
