/**
 * Manages crafting systems and their item libraries
 */
import { getCurrencyPresetsForAdapter } from '../config/currencyPresets.js';
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
import { Tool, TOOL_BREAKAGE_MODES as TOOL_BREAKAGE_MODE_LIST } from '../models/Tool.js';
import { normalizeSelectionIds } from '../utils/bulkSelectionModel.js';
import { normalizeCategoryIconMap } from '../utils/categoryIcons.js';
import { authoredCheckModifierIds } from '../utils/checkModifierPicks.js';
import {
  normalizeComponentCategory,
  normalizeCustomComponentCategories,
} from '../utils/componentCategories.js';
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
  isRollExpression,
  normalizeModifierPolicy,
  resolveActiveCraftingCheckFormula,
  resolveMaxModifierPicks,
  resolveModifierBounds,
} from './checkModifierResolver.js';
import { applyDefinitionChange } from './CraftingDefinitionRepository.js';
import { normalizeCurrencyConfig } from './currencyProfile.js';
import { normalizeGatheringRealmList, normalizeGatheringRealmSettings } from './gatheringRealms.js';
import { normalizePreviewSandbox } from './progressiveCheckSandbox.js';
import { RecipeActivationError } from './RecipeActivationError.js';
import { RecipePersistenceError } from './RecipePersistenceError.js';
import { corpusChanged, REVISION_SCOPES, RevisionRegistry } from './revisionTokens.js';
import { SettingsCraftingDefinitionRepository } from './SettingsCraftingDefinitionRepository.js';
import { SignatureValidator } from './SignatureValidator.js';

// Membership sets derived from the canonical Tool model vocabularies, so the
// system-owned tool normalizer enforces the exact same enumerations as the Tool
// model and the adminStore editor without duplicating the literal lists.
const TOOL_BREAKAGE_MODES = new Set(TOOL_BREAKAGE_MODE_LIST);
const MISSING_SOURCE_FLAG = Symbol('missing-source-flag');

export class CraftingSystemManager {
  /**
   * @param {object} recipeManager
   * @param {object} [seams] - injected Foundry-facing collaborators (issue 800).
   *   Mirrors the `CompendiumImporter` precedent: every default is a safe
   *   pass-through so the ~87 single-argument construction sites (production plus
   *   the whole test suite) keep working unchanged.
   * @param {(raw: string, options?: {relativeTo?: object|null}) => Promise<string>|string}
   *   [seams.enrichToHtml] - RESOLVE a description through Foundry's enricher.
   *   Defaults to a pass-through: `enrichHTML` cannot run under happy-dom (it needs
   *   `CONFIG.ux.TextEditor`, `CONFIG.TextEditor.enrichers`, `game.packs`,
   *   `Roll.defaultImplementation`, `fromUuid`, and `document.createTreeWalker`), so
   *   the pass-through is what keeps the headless suites honest rather than mocked.
   * @param {(rawTexts: Iterable<string>) => Promise<void>} [seams.primeEnricherCache]
   *   - warm the compendium cache once per bulk run.
   * @param {import('./CraftingDefinitionRepository.js').CraftingDefinitionRepository}
   *   [seams.repository] - the persistence seam (issue 1089). Defaults to the
   *   settings-backed adapter, so every existing construction site keeps working;
   *   inject a fake to count reads and writes without patching `game.settings`.
   */
  constructor(recipeManager, seams = {}) {
    this.recipeManager = recipeManager;
    this.systems = new Map();
    this.initialized = false;
    // The revision-token registry this manager mints from (issue 1076). Per manager, never
    // a module singleton.
    this._revisions = new RevisionRegistry();
    // Shares THIS map rather than mirroring it, and hydrates through the manager's own
    // `_normalizeSystem`. That normalizer is a WHITELIST REBUILD — a key it does not
    // emit is dropped from storage on the next save — so the repository must call it
    // rather than carry any approximation of the persisted shape.
    this._repository =
      seams.repository ??
      new SettingsCraftingDefinitionRepository({
        settingKey: SETTING_KEYS.CRAFTING_SYSTEMS,
        corpus: () => this.systems,
        hydrate: (raw) => this._normalizeSystem(raw),
        serialize: (system) => system,
        scopeOf: (system) => system?.id ?? null,
      });
    this._enrichToHtml = seams.enrichToHtml ?? ((text) => text);
    this._primeEnricherCache = seams.primeEnricherCache ?? (async () => {});
    // Active-GM gate for the un-versioned legacy recipe-item backfill run from
    // `initialize()`. Defaults to a globals probe so a real player client is gated
    // without any wiring, while unit fixtures (no `game`) keep migrating: `activeGM`
    // is undefined there, and `undefined === undefined` is true. See
    // `_migrateLegacyRecipeItems` for why persistence — not the in-memory pass — is
    // what must be gated.
    this._isActiveGM =
      seams.isActiveGM ??
      (() => globalThis.game?.users?.activeGM?.id === globalThis.game?.user?.id);
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

  /**
   * Reject a crafting-system id that cannot serve as a durable-flag map key. The
   * component identity flag is `roles.<systemId>.componentId`; a `systemId`
   * containing a `.` is nested by `expandObject` on write and silently missed by the
   * `roles[systemId]` reader, degrading matching to the pre-#556 raw-ref path. Fail
   * LOUDLY at the entry point (creation/import) rather than accepting a booby-trapped
   * id. The id is NEVER rewritten — recipes, tools, and gathering config reference the
   * system by id. `foundry.utils.randomID()` always satisfies the pattern.
   * @private
   */
  _assertValidSystemId(id) {
    if (!isSafeFlagKeySegment(id)) {
      throw new Error(
        `Invalid crafting system id "${id}": a system id must match /^[A-Za-z0-9_-]+$/ (no dots or spaces), because it is used as a durable-flag map key.`
      );
    }
  }

  /**
   * The durable per-system component identity flag key `roles.<systemId>.componentId`,
   * or `null` when `systemId` is not a safe dotted-path segment. A null result means a
   * stamp/clear/repair site must NOT write (it would nest garbage under `roles`); the
   * component still resolves through the raw-reference fall-through. Guards existing
   * worlds that may already carry a dotted id from an earlier import.
   * @private
   */
  _componentRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.componentId` : null;
  }

  /**
   * The durable per-system TOOL identity flag key `roles.<systemId>.toolId` (issue 561),
   * or `null` when `systemId` is not a safe dotted-path segment. An additive SIBLING of
   * `roles.<systemId>.componentId`: a whetstone that is both a component and a tool carries
   * both leaves, and clearing the tool leaf never touches the component leaf. A null result
   * means a stamp/clear/repair site must NOT write; the tool still resolves through the
   * raw-reference fall-through.
   * @private
   */
  _toolRoleFlagKey(systemId) {
    return isSafeFlagKeySegment(systemId) ? `roles.${systemId}.toolId` : null;
  }

  /**
   * The durable per-system RECIPE-ITEM identity flag key `roles.<systemId>.recipeItemDefinitionId`
   * (issue 567), or `null` when `systemId` is not a safe dotted-path segment. The third additive
   * SIBLING under `roles.<systemId>` after `componentId` (#556) and `toolId` (#561): a book
   * registered as a recipe-item definition in two systems carries a per-system leaf in EACH, and
   * clearing one system's leaf never touches another's or the sibling component/tool leaves. A
   * null result means a stamp/clear/repair site must NOT write; the recipe item still resolves
   * through the legacy-scalar + raw-reference fall-through. Retires the #555 single scalar
   * `flags.fabricate.recipeItemDefinitionId` and its cross-system "last writer wins" collision.
   * @private
   */
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
    // Normalize the shared prerequisite library before Tools so every payload path
    // (settings, import, copy, or direct registration) applies the same ID invariant.
    const characterPrerequisites = normalizeCharacterPrerequisiteList(
      system.characterPrerequisites,
      () => foundry.utils.randomID()
    );
    const validToolPrerequisiteIds = new Set(characterPrerequisites.map((entry) => entry.id));
    const essenceIds = new Set(essenceDefinitions.map((def) => def.id));
    // Salvage-normalization context (issue 764), HOISTED above the component map so the
    // Simple-mode group-count clamp in `_normalizeSalvage` sees the owning system's mode
    // and Simple check formula flag. Both derivations are component-independent, so
    // hoisting is safe; the return literal below reuses `salvageResolutionMode`.
    const { salvageResolutionMode, salvageSimpleCheckHasFormula } =
      this._salvageNormalizationContext(system);
    // The ONE system-level modifier library (issue 1117), HOISTED above the three
    // activity checks because each of their selections is validated against it: a default
    // id naming nothing in the library is dropped. It has moved twice —
    // `craftingCheck.checkModifiers` before `1.22.0`, `system.checkModifiers` between
    // `1.22.0` and `1.23.0` — and is NOT read from either old location here. The
    // migrations and the export-payload upcast are the paths a legacy payload arrives
    // through, and a silent read-alias would make the relocation unobservable.
    const modifiers = this._normalizeModifierLibrary(system.modifiers);
    const validCatalogueIds = new Set(modifiers.map((entry) => entry.id));
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

    // First-class Tools (issue 561): a component-linked tool (`componentId` set, no own
    // source refs — e.g. authored by dropping a managed component, or an un-migrated legacy
    // entry) derives its source refs + snapshot from its linked component here so it matches
    // owned items by SOURCE (not just by name), continuous with the 1.15.0 migration and
    // idempotent. Item-sourced tools (`componentId: null`) and already-derived tools are left
    // untouched. Runs after component normalization so `items` is the resolved component set.
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
      const sourceItemUuid = sourceComponentId
        ? sourceComponent?.originItemUuid || sourceComponent?.registeredItemUuid || null
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
        // Legacy mode TOKEN aliases for un-migrated/imported data (the 1.4.0 and
        // 1.9.0 migrations hard-convert persisted data + reconcile routing). These
        // are token renames only — the legacy routing algorithms are gone.
        //  - `mapped` routed by the chosen ingredient set → `routedByIngredients`.
        //  - `tiered` routed by the check outcome → `routedByCheck`.
        //  - bare `routed` predates the split and cannot pick a basis on read; the
        //    1.9.0 migration resolves it by majority provider, so an un-migrated/
        //    imported `routed` token falls back to the optional-check default
        //    `routedByIngredients` (matching the migration's tie/zero-recipe break).
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
      // Which basis resolves recipe-book membership for THIS system (issue 1011,
      // landed with issue 1010). Monotonic: once set it is never cleared, so an empty
      // `recipeIds` means "this book has no members" rather than "this system has not
      // migrated". Backfilled here as a monotone OR over the PERSISTED value — never a
      // bare `some(...)`, which would be the retired per-read inference byte for byte
      // and would flip the basis back on every client the moment `reload()` saw the
      // last array emptied. Normalize-on-read needs no versioned migration, matching
      // `toolBreakage` and `visibilityMode` above; this literal has no `...system`
      // spread, so the field must be listed here or the persisted `true` is destroyed
      // on the next round-trip.
      membershipResolvesByRecipeIds:
        system.membershipResolvesByRecipeIds === true ||
        recipeItemDefinitions.some(
          (def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0
        ),
      // The one named modifier library for the WHOLE system (issue 1117). Crafting,
      // salvage and gathering checks each select over it through their own
      // `{defaultModifierPolicy, defaultModifierIds, maxModifierPicks?}` triple below,
      // and the gathering d100 drop rows, events and stamina costs REFERENCE it too.
      modifiers,
      craftingCheck: this._normalizeCraftingCheck(system.craftingCheck, validCatalogueIds),
      // Canonical salvage mode, derived above with the salvage-normalization context
      // (issue 764) so the component map and this field agree on one value.
      salvageResolutionMode,
      // Tool-breakage authority (issue 419): `toolSpecific` (default, today's
      // behaviour — each Tool's own mode decides, plus the legacy per-crit/per-tier
      // `breakTools` force-break) | `checkDriven` (the active check's `checkBreakage`
      // triggers decide whether ALL required tools break; per-tool modes are ignored
      // except `immune`). Normalized on read (no versioned migration): unknown /
      // missing → `toolSpecific`, mirroring the inline resolutionMode defaulters above.
      toolBreakage: (function _normalizeToolBreakageAuthority(raw) {
        const authority = ['toolSpecific', 'checkDriven'].includes(raw?.authority)
          ? raw.authority
          : 'toolSpecific';
        return { authority };
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

      // Canonical, system-owned COMPONENT category vocabulary (issue 676). A sibling
      // of the recipe `categories` vocabulary below, and deliberately NOT an alias of
      // it: canonical spec forbids merging, aliasing, or cross-populating the two, so
      // a component category is never offered as a recipe category and vice versa.
      // The reserved `general` bucket is implied, never persisted in the array.
      componentCategories: normalizeCustomComponentCategories(system.componentCategories),

      // Per-category icons (issue 689). A parallel name-keyed map, kept separate
      // from the string vocabulary arrays so those stay backwards-compatible.
      // Each map is filtered to the categories that currently exist (plus the
      // reserved `general` bucket), so a removed category drops its icon on the
      // next normalize — updateSystem REPLACES the whole map, no `-=` needed.
      categoryIcons: normalizeCategoryIconMap(system.categoryIcons, [
        'general',
        ...normalizeCustomRecipeCategories(system.categories),
      ]),
      componentCategoryIcons: normalizeCategoryIconMap(system.componentCategoryIcons, [
        'general',
        ...normalizeCustomComponentCategories(system.componentCategories),
      ]),

      // Transitional aliases for existing UI code paths
      categories: normalizeCustomRecipeCategories(system.categories),
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
      // System-owned character prerequisite library (issue 544). Reusable
      // pass/fail conditions (`{ id, name, icon, path, op, value }`) the GM
      // authors in System Settings and attaches to gate learning a recipe from a
      // book/scroll (referenced by id from a recipe item's `caps.learn`).
      // Normalized wholesale from the incoming array; settings replace (not
      // deep-merge), so a removed entry does not resurrect.
      characterPrerequisites,
      // Per-system gathering realm library (geography) + realm behavior
      // settings. Realms ride along with export/import for free because the
      // exporter clones the normalized system and import funnels back through
      // _normalizeSystem, which forces each realm's craftingSystemId to this
      // system id (self-heal on a copy-import that rebinds the system id).
      // Accept the legacy `gatheringRegions`/`gatheringRegionSettings` keys on
      // read (imported or pre-1.1.0-migration payloads) so an old export still
      // loads before the startup migration runs.
      gatheringRealms: normalizeGatheringRealmList(
        system.gatheringRealms ?? system.gatheringRegions,
        {
          craftingSystemId: systemId,
          randomID: () => foundry.utils.randomID(),
        }
      ),
      gatheringRealmSettings: normalizeGatheringRealmSettings(
        system.gatheringRealmSettings ?? system.gatheringRegionSettings
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Library Tool normalization (system-owned canonical shape:
  //   { id, label, enabled, componentId, requirement, breakage, onBreak }).
  // Field coercion mirrors the adminStore tool editor and the Tool model so a
  // tool authored in the Manager, migrated from a catalyst, or hand-edited in
  // settings loads to the same shape regardless of origin.
  // ---------------------------------------------------------------------------

  /**
   * Normalize one system-owned library Tool to its canonical persisted shape:
   * `{ id, label, enabled, componentId, requirement, breakage, onBreak }`.
   *
   * Tools are owned by the crafting system (`system.tools`), not by the gathering
   * config; this normalizer is the single coercion point so a Tool authored in the
   * Manager, migrated from a catalyst (0.6.0), reconciled off the gathering config
   * (0.7.0), or hand-edited in settings all load to the same shape. A missing `id`
   * is assigned a fresh `randomID()`; `enabled` defaults to `true` (only an
   * explicit `false` disables); `componentId` is trimmed to a non-empty string or
   * `null`. The `requirement` / `breakage` / `onBreak` sub-objects are delegated to
   * their dedicated normalizers.
   *
   * @param {object} [tool] Raw tool entry (any origin).
   * @returns {{ id: string, label: string, enabled: boolean, componentId: string|null,
   *   requirement: object|null, breakage: object, onBreak: object }}
   */
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
    // First-class tool source references + `name`/`img` display snapshot (issue 561).
    // Unknown-field stripping means these MUST be retained here (and in the draft-path
    // twin `_normalizeGatheringLibraryTool` in adminStore.js) or they are silently dropped.
    // New-name-first, legacy-name-tolerant (issue 560): accept the renamed
    // `registeredItemUuid`/`originItemUuid`/`aliasItemUuids` and the pre-#560
    // `sourceUuid`/`sourceItemUuid`/`fallbackItemIds`, emitting the new names.
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
      // Salvage is an optional feature, defaulting ON for backward compatibility
      // (existing systems persisted `salvage: true`). When off, the salvage
      // subsystem — its Checks tab, resolution-mode card, component editor,
      // validation, and runtime — is hidden/skipped, but authored component salvage
      // config is preserved (see `_normalizeComponent`) so the toggle is reversible.
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

  /**
   * The FAILURE-RESULT POLICY (issue 1098) — may a failed check produce a result at all.
   *
   * ONE derivation, THREE callers: `_normalizeCraftingCheck`,
   * `_normalizeSalvageCraftingCheck` and `_normalizeGatheringCraftingCheck`. Each of
   * those is a WHITELIST REBUILD, so a key emitted by two of them and not the third is
   * dropped from that one activity the next time a system is saved — silently, and in
   * one direction only. Routing all three through this method is what stops that.
   *
   * A newly-created system defaults to `perRecord` and an absent or unrecognized value
   * normalizes to `perRecord` on read (the `toolBreakage.authority` precedent). An
   * UPGRADED world never sees that default: the `1.25.0` seed migration writes `never`
   * onto every check block already on disk, so no existing world changes behaviour.
   *
   * @param {*} value raw persisted value
   * @returns {'never'|'perRecord'|'always'}
   * @private
   */
  _normalizeFailureResultPolicy(value) {
    return normalizeFailureResultPolicy(value);
  }

  _normalizeCraftingCheck(check = {}, validCatalogueIds = new Set()) {
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
      // `mode` has a single valid value, `passFail`. The former `tiered` / `namedOutcomes`
      // branch (with its `['low', 'high']` default outcomes) referenced the removed tiered
      // concept and was dead: no authoring surface writes those values and no runtime reads
      // `craftingCheck.mode` — crafting resolution is driven entirely by the recipe/step
      // resolution mode and the matching simple/routed/progressive sub-object. Any legacy
      // persisted `tiered` / `namedOutcomes` value collapses to `passFail`.
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
      // Crafting's SELECTION over the system-level library (issues 770, 1055, 1095, 1117).
      // The library itself is `system.modifiers`; what stays
      // here — and, identically, on the salvage and gathering checks — is which entries
      // this activity applies and how they combine. Absent → the `addAll` default with an
      // empty id set, a no-op for a single-formula check (full back-compat).
      ...this._normalizeCheckModifierSelection(check, validCatalogueIds),
    };
  }

  /**
   * Normalize the SYSTEM-LEVEL modifier library (issue 1117): the ONE named library of
   * `{id, label, icon?, expression, isRollExpression, min?, max?}` entries that every
   * activity's check selects over AND that every gathering drop row, event and stamina
   * cost references. Malformed entries are dropped, ids are trimmed and de-duplicated,
   * and a bad expression coerces to an empty string.
   *
   * IT IS ONE LIBRARY, not two. Until issue 1117 a system authored modifiers twice, in
   * two near-identical shapes: the check-modifier catalogue at `system.checkModifiers`
   * and the gathering character-modifier library at
   * `gatheringConfig.systems[systemId].characterModifiers`. The `1.23.0` migration merges
   * them here, and the `checkModifiers`/`characterModifiers` keys are both retired — this
   * normalizer is an ALLOWLIST REBUILD, so an unemitted key is dropped on the next save,
   * which is exactly why the migration must run first (`_runMigrations` in `src/main.js`
   * precedes every manager load).
   *
   * THE SHAPE IS A SUPERSET, and each field is honoured by whichever consumer needs it:
   * `min`/`max` clamp the resolved value of a CHECK modifier, and gathering's own
   * per-reference `min`/`max` clamp a drop contribution independently of them.
   *
   * `icon`, `min` and `max` are all ABSENCE-PRESERVING: each is attached only when
   * authored, so `null`, `undefined`, `''` and junk all normalize to the same shape (key
   * absent) and absence means unbounded. `0` is a real bound and survives, which is why
   * the guard is `Number.isFinite` and not truthiness. An inverted pair (`min > max`) is
   * PRESERVED VERBATIM rather than repaired: it is a blocking readiness issue
   * (`modifierBoundsInverted`) that the GM must fix, and silently swapping the pair would
   * roll a number nobody authored. `clampModifierValue` makes such an entry contribute 0
   * meanwhile — the refuse posture gathering's `INVALID_CHARACTER_MODIFIER_BOUNDS`
   * already takes.
   *
   * `isRollExpression` is DERIVED here and never read off the input, so a persisted or
   * imported flag can never contradict the expression beside it. It is emitted rather
   * than left to each reader because the two readers that need it — the authoring
   * surface's Roll chip and the check-readiness rule that BLOCKS on a roll-shaped
   * expression reaching a check — must classify one entry identically.
   *
   * AN ENTRY WITH NO EXPRESSION IS KEPT, which is a deliberate change from the gathering
   * normalizer this replaces (it dropped one). The library now has an "Add modifier"
   * button, and an entry that vanished on save the moment it was created would make that
   * button appear broken. An unresolvable expression is still a runtime misconfiguration
   * — gathering reports `CHARACTER_MODIFIER_NON_FINITE` for it instead of
   * `MISSING_CHARACTER_MODIFIER` — so nothing silently succeeds.
   *
   * @param {unknown} library Raw `system.modifiers`.
   * @returns {Array<{id: string, label: string, expression: string, isRollExpression: boolean,
   *   icon?: string, min?: number, max?: number}>}
   * @private
   */
  _normalizeModifierLibrary(library) {
    const raw = Array.isArray(library) ? library : [];
    const seenIds = new Set();
    const modifiers = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : null;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const expression = typeof entry.expression === 'string' ? entry.expression.trim() : '';
      const normalized = {
        id,
        label: typeof entry.label === 'string' ? entry.label : '',
        expression,
        isRollExpression: isRollExpression(expression),
      };
      if (typeof entry.icon === 'string' && entry.icon.trim()) normalized.icon = entry.icon.trim();
      // Asked of the RESOLVER rather than re-derived here, so the persisted shape and the
      // clamp the engine applies cannot disagree about what an unbounded form is. That
      // matters more than it looks: `Number(null)`, `Number('')` and `Number([])` are all
      // `0`, and `0` is a REAL bound on this field — so a hand-written `Number.isFinite`
      // guard here would MINT a bound of 0 every time the editor cleared one (it patches
      // `null`), exactly the trap `_normalizeSalvage`'s `dcOverride` guard calls out.
      const { min, max } = resolveModifierBounds(entry);
      if (min !== null) normalized.min = min;
      if (max !== null) normalized.max = max;
      modifiers.push(normalized);
    }
    return modifiers;
  }

  /**
   * Normalize ONE activity check's selection over the system catalogue (issue 1095):
   * `{ defaultModifierPolicy, defaultModifierIds, maxModifierPicks? }`.
   *
   * ONE derivation, three callers — `_normalizeCraftingCheck`,
   * `_normalizeSalvageCraftingCheck` and `_normalizeGatheringCraftingCheck` — so the
   * three cannot drift. Each of these normalizers is an allowlist rebuild, so an
   * unemitted key is dropped on the next save; sharing the emit is what makes "salvage
   * silently loses its rule" unreachable rather than merely unlikely.
   *
   * `defaultModifierPolicy` is the COMBINATION RULE, one of the four
   * {@link MODIFIER_POLICIES} — `addAll`/`highest`/`bySubject`/`playerPicks`, default
   * `addAll`. It is validated through the resolver's own `normalizeModifierPolicy` rather
   * than a literal repeated here, so the authoring surface and the engine can never
   * disagree about which rules exist — and so the pre-1095 `byRecipe` reads as
   * `bySubject` and is never re-emitted.
   *
   * `defaultModifierIds` names the catalogue entries this activity applies by default; an
   * id naming nothing in the SYSTEM catalogue is dropped (order + de-dup preserved).
   *
   * `maxModifierPicks` — the cap on how many modifiers a SELECTING rule (`bySubject`,
   * `playerPicks`) may pick — deliberately **PRESERVES ABSENCE**: only a positive
   * integer is attached, so `null`, `undefined`, `0`, `2.5` and junk all normalize to the
   * SAME shape, key absent. Absence is unlimited, not a defaulting accident: a check that
   * has never been asked the question must not silently acquire a bound that truncates
   * subject picks already on disk ({@link resolveMaxModifierPicks} owns that meaning, and
   * is reused here so the two cannot drift). The cap is stored regardless of the current
   * rule, so flipping between the two selecting rules does not destroy it.
   *
   * @param {object|null|undefined} check The raw activity check block.
   * @param {Set<string>} validIds The ids present in the system-level catalogue.
   * @private
   */
  _normalizeCheckModifierSelection(check, validIds) {
    const seenDefaults = new Set();
    const defaultModifierIds = (
      Array.isArray(check?.defaultModifierIds) ? check.defaultModifierIds : []
    ).filter((id) => {
      if (typeof id !== 'string' || !validIds.has(id) || seenDefaults.has(id)) return false;
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

  // Simple pass/fail crafting check authored in the Checks editor for simple and
  // alchemy resolution modes: a roll formula and a DC (met or exceeded), whose
  // value is polymorphic — either a static default with optional named recipe
  // tiers, or a dynamic value computed by a dropped macro. Both the static and
  // dynamic fields are kept so switching `dcMode` never destroys the other side's
  // configuration. The unified `checkBreakage` trigger list (issue 419) forces
  // outcomes and/or breaks tools; legacy `diceCrits` are migrated into it on read.
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

  // Progressive crafting check (progressive resolution mode): a roll formula whose
  // total is the numeric value progressive result-awarding spends against result
  // difficulties — no DC, no comparison, no recipe tiers. The unified `checkBreakage`
  // trigger list (issue 419) forces award-all/award-none and (under checkDriven) may
  // break tools; legacy `diceCrits` are migrated into it on read. The `awardMode` award
  // setting lives on this same object (read by the ResolutionModeService progressive
  // branch) and is preserved here.
  //
  // This allowlist literal is shared by the crafting, salvage and gathering checks
  // (`_normalizeCraftingCheck`, `_normalizeSalvageCraftingCheck` and
  // `_normalizeGatheringCraftingCheck` all delegate here), so a key omitted here is
  // dropped from all three on every normalize — including on import of a legacy
  // payload. Issue 651 retired the system-level `allowPlayerReorder` this way: the
  // reorder permission now lives on the recipe (`Recipe.allowPlayerResultReorder`) and
  // on salvage (`Component.salvage.allowPlayerResultReorder`).
  _normalizeProgressiveCraftingCheck(progressive = {}) {
    const source = !progressive || typeof progressive !== 'object' ? {} : progressive;
    const rollFormula = typeof source.rollFormula === 'string' ? source.rollFormula : '';
    // The Checks Studio's PREVIEW SANDBOX (issue 1097): the ordered result difficulties a
    // GM types to see what a progressive check would award. It is emitted here because
    // this literal is an allowlist rebuild — an unemitted key is dropped on the next save
    // — and it is ABSENCE-PRESERVING, because an absent experiment is not an empty one.
    //
    // NO RUNTIME PATH READS IT, deliberately: it is scratch state, not configuration, and
    // the engine spends a recipe's own `components[].difficulty` list. Nothing validates
    // it either — a nonsensical experiment is the GM's business.
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

  /**
   * Convert a check's legacy per-die crit list into unified trigger objects (issue
   * 419 recombine). Each legacy crit `{ die, raw, success, breakTools }` becomes a
   * `diceGroup`/`total`/`==` trigger forcing the matching outcome (and optionally
   * breaking tools).
   *
   * A crit is kept only when its (canonicalized) die appears as a plain, unmodified
   * `NdS` group in the formula — mirroring the previous ineligible-crit drop. The
   * trigger's `groupId` is the index of the FIRST {@link parseDiceGroups} term whose
   * `raw` matches that die (the same evaluated-term index the engine reports), so
   * duplicate-die formulas (`1d20 + 1d20`) target the first matching group only
   * (an accepted migration caveat).
   * @private
   */
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

  /**
   * Canonical plain `NdS` form of a stored crit die key, via the shared
   * classifier (bare `dN` ≡ `1dN`). Returns '' when the key is not a plain,
   * unmodified die term (e.g. a modified pool such as `2d20kh1`), so such crits
   * are dropped by {@link _convertDiceCritsToTriggers}.
   * @private
   */
  _canonicalDie(die) {
    const plain = parsePlainDiceGroups(String(die ?? ''));
    return plain.length === 1 ? plain[0].raw : '';
  }

  /**
   * Clamp a critical raw value to the producible total range of an `NdS` die
   * term: minimum `N` (all dice show 1), maximum `N*S` (all dice show their max
   * face). Rationale: the crit fires when the die-term total equals `raw`, so a
   * raw outside `[N, N*S]` can never be rolled and the crit would be inert.
   * Clamping pulls it to the nearest producible boundary so it fires there — an
   * authored "crit on 25" for `1d20` now triggers on a natural 20 instead of never.
   * When the die string does not parse, the value is returned unchanged.
   * @private
   */
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

  // Structured routed-mode crafting check authored in the Checks editor: a check
  // type (relative DC offsets or fixed value ranges), a shared roll expression,
  // and TWO independent outcome-tier lists — one per type — so editing or
  // deleting a tier in one mode never affects the other. Kept alongside the
  // legacy `outcomes` string list rather than replacing it, so the existing
  // routing engine is untouched.
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
      // WHERE THE DC COMES FROM, on the routed slot too (issue 1096). The engine already
      // resolved the routed base DC through `_resolveSimpleCheckDc` — that method is
      // parameterized over the check config precisely so routed takes the same recipe-tier
      // and dynamic path — so the plumbing existed and only the field did not. A routed
      // RELATIVE check is defined as bands offset from a DC (`dc + outcome.dc`), so it has
      // one by construction, and offering the number without its source was incoherent.
      //
      // ABSENCE-PRESERVING: anything that is not exactly `dynamic` reads `static`, so every
      // system authored before this field existed loads as static with no rewrite.
      // `macroUuid` is kept whatever the mode, for the reason the simple slot keeps it —
      // switching modes must never destroy the other side's configuration.
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

  /**
   * Normalize the unified per-check trigger list (issue 419 recombine) carried by
   * each crafting/salvage/gathering check sub-object (simple/routed/progressive).
   * Migrates legacy data on read (no versioned migration): any legacy `diceCrits`
   * are converted to `diceGroup` triggers and, for a routed check, a legacy
   * `natStepping: true` is converted to the tier-stepping trigger pair (issue 975).
   * Both conversions are concatenated ahead of the normalized
   * `checkBreakage.triggers`, in the order `[...crits, ...natStep, ...authored]`.
   * Idempotent — a re-normalized block carries neither `diceCrits` nor
   * `natStepping` and its triggers already hold `outcome`/`breakTools`/`tierStep`,
   * so the second pass converts nothing and re-normalizes the triggers to themselves.
   *
   * @param {string} rollFormula     Formula used to resolve a converted crit's groupId.
   * @param {Array<object>} [diceCrits]   Legacy per-die crit list (pre-recombine).
   * @param {object} [checkBreakage]      Existing `{ triggers }` block.
   * @param {object} [legacyRouted]       Routed-only legacy fields; defaulted so the
   *   simple and progressive call sites (which have neither) need not pass it.
   * @param {boolean} [legacyRouted.natStepping] Legacy natural-stepping boolean.
   * @param {string} [legacyRouted.type]  Normalized routed type (`relative`/`fixed`).
   * @returns {{ triggers: Array<object> }}
   * @private
   */
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

  /**
   * Convert a routed check's legacy `natStepping: true` boolean into the pair of
   * tier-stepping triggers that reproduce it (issue 975): a natural 20 steps the
   * matched tier up one, a natural 1 steps it down one.
   *
   * Emitted only when stepping was actually live at conversion time — the boolean
   * is `true`, the check is not `fixed` (the old runtime was relative-only, so a
   * fixed check's flag was already inert), and the formula carries a d20 group.
   * A formula with no d20 group synthesises nothing for the same reason.
   *
   * Notes on the shape, each of which is load-bearing:
   * - The ids are stable literals rather than `randomID()`, because this conversion
   *   has no source id and would otherwise re-mint ids on every read until a save
   *   drops `natStepping` — and a trigger id reaches chat and captured result data.
   * - `outcome` and `breakTools` are written EXPLICITLY so
   *   {@link _normalizeUnifiedTrigger}'s legacy break-only test cannot mistake a
   *   synthesised trigger for a pre-recombine one and start breaking tools on a
   *   natural 20.
   * - `allDice` rather than `anyDie`/`highestDie`: a non-`total` aggregate with no
   *   per-die faces aggregates to `null` and the condition fails open (no match),
   *   so a headless or stubbed roll cannot fire these triggers.
   * - The {@link parsePlainDiceGroups} filter used by the crit conversion is
   *   deliberately NOT applied: `2d20kh1` was the design target of the old
   *   kept-face rule and must survive here even though it is crit-ineligible.
   * - A duplicate-d20 formula (`1d20 + 1d20`) targets the first group only — the
   *   accepted caveat the crit conversion already carries.
   * @private
   */
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

  /**
   * Normalize the `checkBreakage` block's own trigger list (no crit conversion).
   * Shape: `{ triggers: UnifiedTrigger[] }`. Malformed triggers (unknown condition
   * type, missing operands) are dropped so a bad authoring payload can never throw
   * at runtime.
   *
   * @param {object} [input] Raw `checkBreakage` block.
   * @returns {{ triggers: Array<object> }}
   * @private
   */
  _normalizeCheckBreakage(input) {
    const source = !input || typeof input !== 'object' ? {} : input;
    const rawTriggers = Array.isArray(source.triggers) ? source.triggers : [];
    const triggers = rawTriggers
      .map((trigger) => this._normalizeUnifiedTrigger(trigger))
      .filter(Boolean);
    return { triggers };
  }

  /**
   * Normalize a single unified trigger `{ id, condition, outcome, breakTools,
   * tierStep }`, dropping it (returning null) when its condition shape is malformed.
   *
   * - `outcome` is one of `'success' | 'failure' | 'none'` (default `'none'`);
   *   pinned to `'none'` for an `outcomeTier` condition, whose match is resolved
   *   only after the routed outcome is known (so it can never force one).
   * - `breakTools` defaults to `false`, EXCEPT a legacy break-only trigger (one
   *   carrying neither an `outcome` nor a `breakTools` prop, as authored before the
   *   recombine) is migrated to `breakTools: true` so it keeps breaking tools.
   *   `tierStep` is deliberately absent from that test: adding it would flip every
   *   pre-recombine break-only trigger into a non-breaking one.
   * - `tierStep` is always present (issue 975), defaulting to the inert
   *   `{ mode: 'none', steps: 1, tierId: null }`. Unlike `outcome` it is NOT pinned
   *   to its inert value for an `outcomeTier` condition: that pin is the
   *   circularity fix for FORCING an outcome, whereas a step reads the rolled tier
   *   and produces the final one, so stepping on an `outcomeTier` condition is
   *   deliberately allowed.
   * - The free-text `label` is dropped.
   * @private
   */
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

  /**
   * Normalize a trigger's `tierStep` effect (issue 975) — the third effect a
   * unified trigger carries, alongside `outcome` and `breakTools`.
   *
   * Shape: `{ mode: 'none'|'target'|'up'|'down', steps: number, tierId: string|null }`.
   * Flat rather than a discriminated union so switching mode in the editor never
   * destroys the other mode's operand, mirroring the retention `_normalizeRoutedOutcome`
   * already gives `dc` and `start`/`end` across a `type` switch.
   *
   * - An unknown or absent `mode` collapses to `'none'` (inert).
   * - `steps` is the step MAGNITUDE (never a comparand — `condition.value` owns
   *   that word), clamped to an integer `>= 1`: non-finite, zero, negative and
   *   fractional values all resolve to a usable count.
   * - `tierId` is a trimmed non-empty string or `null`, and is preserved VERBATIM
   *   even when it names no tier: this normalizer cannot see the outcome lists
   *   (simple and progressive checks have none at all), so a dangling id is left
   *   for the editor to display and the runtime to no-op on, the same graceful
   *   treatment `minOutcomeId` already documents.
   * @param {object} [input] Raw `tierStep` sub-record.
   * @returns {{ mode: string, steps: number, tierId: string|null }}
   * @private
   */
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

  _normalizeSalvageCraftingCheck(check = {}, validCatalogueIds = new Set()) {
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
      // The ORTHOGONAL produce/do-not-produce axis (issue 1098), and on salvage it is a
      // NEW CAPABILITY rather than a gate on an existing one: until this issue a failed
      // salvage awarded nothing unconditionally. See `_normalizeSalvage` for the
      // reserved `role: 'failure'` group this policy makes live, and
      // `CraftingEngine._resolveSalvageResultGroups`, which selects it BY ROLE.
      failureResultPolicy: this._normalizeFailureResultPolicy(normalizedCheck.failureResultPolicy),
      // Salvage reuses the crafting check sub-object shapes so the Checks-tab
      // editors are shared. The simple/routed default DC is the sub-object's `dc`;
      // a per-component override lives on `component.salvage.dcOverride`. Tiers and
      // the dynamic-DC macro are stored but hidden by the salvage editors (salvage
      // has no recipes to pick a tier from).
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
  _normalizeGatheringCraftingCheck(check = {}, validCatalogueIds = new Set()) {
    const source = !check || typeof check !== 'object' ? {} : check;
    return {
      enabled: source.enabled === true,
      // The ORTHOGONAL produce/do-not-produce axis (issue 1098). Gathering has no
      // consumption block at all, so this is the ONLY failure axis it carries — and the
      // path it governs ships DORMANT: `_libraryTaskToRuntimeTask` hardcodes
      // `resolutionMode: 'd100'` and `GatheringEconomyView` renders both formula-rolled
      // modes disabled, both pending issue 683. The shape lands now so the capability is
      // complete when 683 flips the switch.
      failureResultPolicy: this._normalizeFailureResultPolicy(source.failureResultPolicy),
      progressive: this._normalizeProgressiveCraftingCheck(source.progressive),
      routed: this._normalizeRoutedCraftingCheck(source.routed),
      // Gathering's OWN selection over the system catalogue (issue 1095). It applies to
      // the FORMULA-ROLLED modes only: `d100` rolls no authored formula, so the catalogue
      // is inert under it with cause `noCheck`. The selection is persisted regardless of
      // the current mode so switching modes never destroys it — and today every
      // formula-rolled gathering mode is disabled pending issue 683 (decision 8), so the
      // whole surface is dormant rather than live.
      ...this._normalizeCheckModifierSelection(source, validCatalogueIds),
    };
  }

  // System-wide recipe visibility STRATEGY only (issue 511). The recipe-item
  // use/learn caps that used to live under `knowledge.item` / `knowledge.learn`
  // are now per-recipe-item (`recipeItemDefinition.caps`, see
  // `_normalizeRecipeItemCaps`); only `mode` and `learn.dragDropEnabled` — the
  // system-level knobs that gate whether the knowledge/learning machinery runs —
  // remain here. Legacy caps in stored data are dropped by this normalizer and
  // carried onto each definition by the 1.11.0 migration.
  // Flat system-level visibility strategy enum (issue 511, PR-B). One knob —
  // `visibilityMode` ∈ {global, restricted, item, knowledge} — gates the whole
  // Crafting authoring surface (see craftingVisibility.js). Unknown/missing →
  // `knowledge` (the default), mirroring the inline resolutionMode defaulter.
  // The legacy `recipeVisibility` block is normalized separately and preserved
  // for its residual `knowledge.learn.dragDropEnabled`.
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
        // Default ON for backward compatibility, mirroring the `features.salvage`
        // convention: recipes authored before this GM toggle existed carry
        // `timeRequirement` / step-duration configs that already run, so an absent
        // flag must keep them applying and their editors available. Only an explicit
        // `false` (a deliberate GM opt-out) disables time requirements. The pre-toggle
        // normalizer coerced an absent flag to a PERSISTED `false`, so upgraded worlds
        // are re-defaulted on once by the 1.19.0 `migrateDefaultOnTimeRequirements`
        // migration (which deletes that stored `false`) — not here on read.
        enabled: time.enabled !== false,
      },
      currency: this._normalizeCurrencyConfig(currency),
    };
  }

  _normalizeCurrencyConfig(currency = {}) {
    const units = Array.isArray(currency?.units) ? currency.units : [];
    const legacyAdapter =
      currency?.provider === 'system' && ['dnd5e', 'pf2e'].includes(currency?.systemAdapter)
        ? currency.systemAdapter
        : '';
    const seededUnits = units.length > 0 ? units : getCurrencyPresetsForAdapter(legacyAdapter);
    // A legacy pf2e system-adapter config seeded fresh pf2e units, which read/spend coins
    // through the actor inventory rather than a flat actor property; carry that intent forward
    // as the actorInventory spend strategy when no explicit strategy was persisted. A legacy
    // dnd5e adapter maps to the default actorProperty strategy.
    const legacyAdapterSpendStrategy = { pf2e: 'actorInventory', dnd5e: 'actorProperty' };
    const spendStrategy =
      currency?.spendStrategy || legacyAdapterSpendStrategy[legacyAdapter] || undefined;
    // `inventoryMode` is no longer part of the currency model. It is forwarded ONLY so
    // normalizeCurrencyConfig's legacy shim can map a stored actorInventory + inventoryMode:
    // 'macro' to the peer `macro` strategy; it is never re-emitted from the normalized output.
    return normalizeCurrencyConfig(
      {
        enabled: currency?.enabled === true,
        spendStrategy,
        inventoryMode: currency?.inventoryMode,
        providerId: currency?.providerId,
        macros: currency?.macros,
        units: seededUnits,
      },
      { randomID: () => foundry.utils.randomID() }
    );
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

  /**
   * The GM-authored per-essence colour (issue 917): a bare `--fab-tag-*` palette key,
   * or null when unauthored. There is deliberately NO `customColor` sibling — the
   * palette is the whole vocabulary, because a free hex cannot be guaranteed legible
   * against all seven themes. Stored bare (the `--fab-tag-` prefix is stripped) so a
   * round-trip through an export cannot accumulate prefixes.
   *
   * The palette itself is not validated here: an unrecognized token renders as the
   * theme accent, which is what an unauthored essence renders as, so a hand-edited or
   * imported value degrades rather than being silently discarded.
   * @private
   */
  _normalizeEssenceColorToken(value) {
    const token = String(value ?? '')
      .trim()
      .replace(/^--fab-tag-/, '');
    return token || null;
  }

  /**
   * The GM-authored per-essence property macro (issue 1036): a macro run against every
   * crafted (and salvaged) result the essence contributes to, before the result's own
   * `propertyMacroUuid`, under `features.propertyMacros` AND `features.essences`.
   *
   * This is a SHAPE check, not a macro check. `_looksLikeDocumentUuid` admits `Item.`,
   * `Actor.` and any `Compendium.` prefix, and it must stay that permissive because
   * `foundry.utils.parseUuid` still re-interprets legacy four-segment compendium uuids —
   * a `/^Macro\./` tightening would reject a resolvable macro. Whether the uuid resolves
   * to a *script* Macro is decided in two other places: the editor's drop handler (which
   * only ever writes a uuid it resolved) and the Validation tab's resolvability check. At
   * craft time an unresolvable value is logged and skipped SILENTLY — see
   * `CraftingEngine._runEssencePropertyMacros`.
   * @private
   */
  _normalizeEssencePropertyMacroUuid(value) {
    return this._looksLikeDocumentUuid(value) ? value : null;
  }

  _normalizeEssenceDefinition(entry, usedIds = new Set()) {
    // BOTH branches below are whitelist REBUILDS that drop any key they do not name,
    // so every persisted field must appear in both or it is silently lost on the next
    // save. `colorToken` (issue 917) and `enabled` / `propertyMacroUuid` (issue 1036)
    // are the newest such fields.
    //
    // `enabled` needs NO migration, and adding one would be wrong: this whitelist has
    // never emitted the key, so no stored definition carries one and `entry.enabled !==
    // false` reads absent as `true`. The in-file precedent is
    // `_normalizeRecipeItemDefinition` (`_normalizeTool` delegates to the `Tool` model,
    // which is where its own default-true lives).
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

  // Per-recipe-item use/learn caps (issue 511). Each recipe item definition owns
  // its own caps rather than sharing one system-wide config, so a cookbook and a
  // scroll can differ. The `item` (craft-charge) and `learn` sub-shapes mirror the
  // legacy system-wide `recipeVisibility.knowledge.item` / `.learn` normalization
  // exactly, so a migrated system round-trips its old values unchanged. `learn`
  // deliberately omits `dragDropEnabled` — that stays a system-level knowledge
  // setting. Absent caps normalize to uncapped (the safe default for new items).
  // Reconcile the legacy boolean `destroyWhenExhausted` with the new enum
  // `whenSpent` ('destroyed' | 'inert'), keeping BOTH persisted and in sync (issue
  // 511, PR-B). The enum wins when authored; otherwise the boolean seeds it; when
  // neither is present a spent charge defaults to 'destroyed'.
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

    // `learnsAllowed` (new) mirrors legacy `maxRecipes` — a finite positive count kept
    // only while the limit is on. The new field wins when authored. When the limit is
    // ON but no positive count is authored, default to 1 (the value the UI stepper
    // displays): a limit of "0/undefined" is meaningless and would wrongly read as
    // "uncapped" downstream, hiding the learn-all CTA (issue 544). Off ⇒ left unset.
    const rawLearns = Object.prototype.hasOwnProperty.call(learn, 'learnsAllowed')
      ? learn.learnsAllowed
      : learn.maxRecipes;
    const learnsAllowed = limitLearning
      ? Number.isFinite(Number(rawLearns)) && Number(rawLearns) > 0
        ? Number(rawLearns)
        : 1
      : undefined;

    // `learnScope` ('perInstance' | 'total') is the canonical cap scope: `perInstance`
    // limits how many recipes may be learned from a SINGLE copy of the item in a
    // character's inventory; `total` limits how many may be learned across EVERY copy
    // of the source recipe item (a shared world pool). Prefer an authored `learnScope`,
    // otherwise derive it from the legacy `learningMode` ('party' → total, else
    // perInstance). `learningMode` is kept as a synced legacy mirror
    // (total → 'party'; perInstance → 'ntimes' when N>1, else 'once').
    const learnScope = ['perInstance', 'total'].includes(learn.learnScope)
      ? learn.learnScope
      : learn.learningMode === 'party'
        ? 'total'
        : 'perInstance';
    const learningMode =
      learnScope === 'total' ? 'party' : Number(learnsAllowed) > 1 ? 'ntimes' : 'once';

    // `prerequisiteIds` (issue 544) — the recipe ids a reader must ALREADY have
    // learned (AND semantics) before learning from this book or scroll. Replaces the
    // legacy single `prerequisite` string, which is folded in here so an un-migrated
    // draft still reads correctly (there is no stored data to migrate — the field
    // defaulted to null/absent). Trims/dedupes with the same shape as
    // `characterPrerequisiteIds` below.
    const rawPrerequisiteIds = Array.isArray(learn.prerequisiteIds)
      ? learn.prerequisiteIds
      : typeof learn.prerequisite === 'string' && learn.prerequisite.trim()
        ? [learn.prerequisite]
        : [];
    const prerequisiteIds = [
      ...new Set(rawPrerequisiteIds.map((value) => String(value ?? '').trim()).filter(Boolean)),
    ];

    // `characterPrerequisiteIds` (issue 544) — the system-owned character
    // prerequisites (`system.characterPrerequisites[].id`) a reader must ALL pass
    // (AND semantics) to learn a recipe from this book. Distinct from
    // `prerequisite` (a recipe the reader must already have learned): this gates
    // on the actor's roll data, that gates on prior knowledge.
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
    // Union source refs, mirroring `_normalizeComponent`: a recipe item claims its
    // registered live document (`registeredItemUuid`), its canonical compendium/source
    // (`originItemUuid`), and any `aliasItemUuids`, so a compendium-imported book
    // resolves for owned copies dragged from EITHER the compendium item or the imported
    // world item (issue 555). Existing definitions carry only `originItemUuid`; it is
    // never recomputed, and `registeredItemUuid` defaults to it, so their matching is unchanged.
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

  /**
   * RESOLVE a source document's description through Foundry's enricher, then
   * normalize the enriched HTML to display-safe plain text.
   *
   * This is the whole point of issue 800: a label-less `@UUID[…]` becomes the
   * referenced document's real NAME rather than raw directive text (or, under the
   * rejected approach, nothing at all). Removing the `await this._enrichToHtml(…)`
   * below reverts the fix, and a test at each composition asserts exactly that.
   *
   * Async because `enrichHTML` is async — hence the ingestion boundaries below are
   * async too and the SYNCHRONOUS normalizers deliberately are not.
   *
   * @param {object|null} source - the resolved source Item document
   * @returns {Promise<string>}
   */
  /**
   * The ordered description fields a Foundry Item may carry, most specific first.
   * Shared by {@link _extractSourceDescription} (which resolves them) and the repair
   * pass's priming sweep (which only needs the RAW text).
   * @private
   */
  _sourceDescriptionCandidates(source = null) {
    if (!source || typeof source !== 'object') return [];
    return [
      source?.system?.description?.value,
      source?.system?.description,
      source?.description?.value,
      source?.description,
    ];
  }

  /**
   * The first non-empty RAW description text on a source document, without
   * resolving anything. Feeds the repair pass's single priming sweep.
   * @private
   */
  _rawSourceDescription(source = null) {
    for (const candidate of this._sourceDescriptionCandidates(source)) {
      const raw = this._descriptionTextCandidate(candidate);
      if (raw) return raw;
    }
    return '';
  }

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

  /**
   * Build a first-class Tool's source snapshot from an Item uuid (issue 561): the same
   * union of source refs a component/recipe-item records, plus the `name` + `img` display
   * snapshot — but NEVER `label` (that is a distinct user-authored override). Mirrors
   * {@link _buildRecipeItemSourceSnapshot}, including the no-auto-refresh description snapshot.
   * @private
   */
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

  /**
   * Normalize a managed component. The salvage context (issue 764) is threaded through an
   * options bag so `_normalizeSalvage` can apply the Simple-mode group-count clamp; callers
   * that hold the owning system pass its resolved salvage mode + Simple-slot formula flag.
   * A bare call (no options) leaves salvage groups untouched.
   *
   * @param {object} [item] - Raw component.
   * @param {object|Set<string>|null} [options] - Options bag (a legacy positional
   *   `validEssenceIds` Set is still accepted for back-compat).
   * @param {Set<string>|null} [options.validEssenceIds] - Essence ids permitted on this system.
   * @param {string} [options.salvageResolutionMode] - Owning system's salvage mode.
   * @param {boolean} [options.salvageSimpleCheckHasFormula] - Simple salvage check formula flag.
   * @returns {object}
   */
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

  /**
   * Derive the salvage-normalization context (issue 764) from an owning crafting system:
   * the canonical salvage resolution mode and whether the Simple salvage check slot has an
   * authored roll formula. `salvageSimpleCheckHasFormula` reads `salvageCraftingCheck.simple.rollFormula`
   * SPECIFICALLY — the only slot the Simple engine consults — never an OR across the
   * simple/routed/progressive slots. Tolerant of a raw (pre-normalized) system.
   *
   * @param {object} [system] - Crafting system (raw or normalized).
   * @returns {{ salvageResolutionMode: string, salvageSimpleCheckHasFormula: boolean }}
   */
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

  /**
   * Normalize a component's salvage config. In Simple salvage mode this enforces the
   * group-count invariant (issue 764) via a SUCCESS-FIRST retain-one clamp: at most one
   * success group (`role !== 'failure'`) at `resultGroups[0]` — the group the engine
   * awards ON SUCCESS via `slice(0, 1)`, no role filter
   * (`CraftingEngine._resolveSalvageResultGroups` under `disposition: 'success'`)
   * — plus at most one reserved `role: 'failure'` group, tolerated ONLY when the Simple
   * salvage check slot has an authored roll formula. A failure-first `[failure, success]`
   * input (which import/copy/migration can carry, though the editor never authors it) is
   * re-ordered so the success group lands at index 0; a failure-only config has NO success
   * group and clamps `enabled` to false.
   *
   * THE RESERVED-FAILURE TOLERANCE IS A LIVE CAPABILITY (issue 1098, decision 5). It was
   * a data-model / validation allowance only, and the claim that salvage Simple never
   * awards or routes to a failure group is RETRACTED: when
   * `salvageCraftingCheck.failureResultPolicy` permits results on failure, the salvage
   * failure branch resolves this group and awards it. Both clamps are UNCHANGED, and the
   * ordering guarantee becomes MORE load-bearing rather than less — the SUCCESS branch
   * still selects `resultGroups[0]` BY INDEX, so the FAILURE branch must select BY ROLE,
   * never by index, or a failed check would award the full success salvage output.
   *
   * The clamp only applies with a Simple salvage-mode context: `salvageResolutionMode`
   * absent (a bare unit fixture or non-system caller) leaves groups untouched and keeps
   * the pre-#764 lower-bound-only `enabled` rule.
   *
   * @param {object} salvage - Raw salvage config.
   * @param {object} [options]
   * @param {string} [options.salvageResolutionMode] - Owning system's salvage mode; when
   *   `'simple'`, the retain-one clamp runs. Absent → no clamp.
   * @param {boolean} [options.salvageSimpleCheckHasFormula] - Whether
   *   `salvageCraftingCheck.simple.rollFormula` is authored (the ONLY slot the Simple
   *   engine reads); gates the reserved failure group's retention.
   * @returns {object}
   */
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

    // Optional per-component salvage DC override: when set it replaces the
    // system-level salvage check default DC at salvage time. null = use the default.
    // Guard null/''/undefined explicitly so re-normalizing a null stays null
    // (Number(null) is 0, which would otherwise become a spurious 0 override).
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

    // Simple-mode SUCCESS-FIRST retain-one clamp (issue 764). Only runs with a Simple
    // salvage-mode context; routed/progressive and the no-context default keep every
    // group and the pre-#764 lower-bound-only `enabled` rule.
    const { salvageResolutionMode, salvageSimpleCheckHasFormula } = options;
    let resultGroups = normalizedGroups;
    let enabled = salvage.enabled === true && normalizedGroups.length > 0;
    if (salvageResolutionMode === 'simple') {
      const successGroup = normalizedGroups.find((g) => g.role !== 'failure');
      const failureGroup = normalizedGroups.find((g) => g.role === 'failure');
      const clamped = [];
      // Success group ALWAYS at index 0 — the engine's SUCCESS award is `slice(0, 1)`
      // with no role filter, so a failure-first input is re-ordered here rather than
      // awarding the failure group on a passed check. Unchanged by issue 1098: the
      // failure award added there selects BY ROLE and never by index, precisely so this
      // ordering guarantee stays the only thing the success branch has to rely on.
      if (successGroup) clamped.push(successGroup);
      // Reserved failure group tolerated ONLY with an authored Simple check formula.
      if (failureGroup && salvageSimpleCheckHasFormula === true) clamped.push(failureGroup);
      resultGroups = clamped;
      // A Simple config with no success group (e.g. a lone `role: 'failure'` group)
      // cannot be enabled — the success branch's `slice(0, 1)` would otherwise award the
      // failure group on a PASSED check. Unchanged by issue 1098, which gives the failure
      // branch its own role-keyed selection rather than relaxing this clamp.
      enabled = salvage.enabled === true && successGroup != null;
    }

    return {
      // Requirement 5 (`data-models` → Component) is ENFORCED HERE, not by any UI
      // control (issue 676, decision 8a). The normalizer is the single chokepoint
      // EVERY writer passes — GM save, import (`CraftingSystemExporter` has no
      // salvage handling at all, so `{enabled: true, resultGroups: []}` would
      // otherwise land verbatim), copy-mode, and migration — so the clamp is what
      // actually makes the forbidden state unreachable. A control that merely
      // refuses to ENABLE a zero-group component cannot stop one BECOMING
      // zero-group while enabled.
      //
      // The clamp only ever turns `enabled` OFF, never on: it therefore cannot
      // contradict the "no migration seeds this field" rule and seeds nothing. In Simple
      // mode `enabled` additionally requires a surviving success group (issue 764).
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
      // This component's own check-modifier pick (issue 1095) — the SALVAGE analogue of
      // `Recipe.craftingModifier.modifierIds`, consulted only under the `bySubject`
      // combination rule. Attached ONLY when authored, keyed on `Array.isArray` AT ENTRY:
      // an authored EMPTY array is a real pick of zero and survives as `[]`, distinct from
      // an absent one which inherits `salvageCraftingCheck.defaultModifierIds`. That is
      // deliberately NOT keyed on the post-filter length, so a pick whose junk members the
      // filter removes stays an authored pick rather than reverting to inherit.
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

  /**
   * Normalize an array of library tool id strings: coerce to trimmed, non-empty,
   * deduped strings. Tolerant of non-array / nullish input (returns []).
   * @param {unknown} toolIds
   * @returns {string[]}
   */
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
    return {
      id: result.id || foundry.utils.randomID(),
      componentId: compId || null,
      systemItemId: compId || null, // transitional alias
      quantity:
        Number.isFinite(Number(result.quantity)) && Number(result.quantity) >= 1
          ? Number(result.quantity)
          : 1,
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
      // Preserve a reserved `role: 'failure'` group (issue 764). The salvage editor
      // never AUTHORS this role, but import/copy-mode/migration can carry one, and the
      // Simple-mode success-first clamp in `_normalizeSalvage` distinguishes success
      // groups (`role !== 'failure'`) from the reserved failure group by it. Mirrors the
      // recipe result-group serialization (`Recipe.toJSON`): only the reserved value is
      // emitted, so a plain success group carries no `role` key.
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
    // System-level alchemy check mode (replaces the retired per-recipe
    // `resultSelection.provider`): `none` (no check, matched brew always
    // succeeds), `simple` (mandatory pass/fail check; pass → success group,
    // fail → the reserved failure group), or `tiered` (mandatory routed check,
    // identical routing to `routedByCheck`). Defaults to `none`.
    const checkMode = ['none', 'simple', 'tiered'].includes(c.checkMode) ? c.checkMode : 'none';
    return {
      checkMode,
      // Defaults ON (issue 966). Alchemy's `global` visibility mode reveals a recipe
      // ONLY from `learnedRecipes`, which only this flag ever writes, so an absent
      // flag left the most permissive-sounding visibility mode revealing nothing to
      // any player, ever — the opposite of what its authoring copy promises. An
      // explicitly stored `false` is still honoured.
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

  /**
   * Persist a crafting-system mutation through the definition repository (issue 1089).
   *
   * `save()` with no argument stays the whole-corpus write, and three callers still
   * need it because they are genuinely multi-system: the legacy recipe-item
   * migration, the definition-description refresh, and the item-sync metadata refresh
   * each iterate every system.
   *
   * Every other mutation site — 21 of them — names the one system it touched with
   * `save({ put: system })`, or the one it removed with `save({ delete: systemId })`.
   * Under the settings adapter all of these write the same bytes, because
   * `game.settings.set` replaces the whole value; the difference is that the record is
   * now carried to the seam instead of being thrown away at the call site.
   *
   * @param {import('./CraftingDefinitionRepository.js').DefinitionChange} [change]
   */
  async save(change = null) {
    // The revision-token advance point for the system domain (issue 1076). `save()` is
    // this manager's single persistence chokepoint — every mutating method ends here, and
    // it is already the seam 30 test files replace — so announcing the change once, here,
    // beats auditing every mutating method for a missing advance. A whole-corpus save
    // (`change === null`, which is what a `persist: false` batch flushes with) advances
    // every system, because it is exactly the case where the manager was not told what
    // moved.
    if (change?.put?.id != null) this._advanceSystemRevision(change.put.id);
    else if (change?.delete != null) this._advanceSystemRevision(change.delete);
    else if (change?.batch) this._advanceSystemRevision(...[...change.batch].map((r) => r?.id));
    else this._advanceSystemRevision(...this.systems.keys());
    await applyDefinitionChange(this._repository, change, this.systems.values());
  }

  /**
   * Re-read the persisted crafting-systems setting into the in-memory map. Unlike
   * `initialize()` (which early-returns once initialized), this is the un-guarded
   * refresh path used when the replicated world setting changes on ANOTHER client —
   * the GM's save updates their own map directly, but a player's in-memory map only
   * catches up here. Does NOT re-run legacy migration and does NOT persist, so it is
   * safe to call from a settings hook without a write loop.
   *
   * @returns {boolean} `true` only when the normalized systems actually changed, so
   *   callers can skip re-emitting a change hook (and avoid a redundant refresh on
   *   the writing client, whose map already holds the saved data).
   */
  reload() {
    // Optional repository capability: `null` means the backend has no synchronous
    // replicated snapshot to read (see `CraftingDefinitionRepository`), so reloading
    // is a no-op rather than a wrong answer.
    const saved = this._repository.readReplicatedSnapshot();
    if (!saved) return false;
    const next = new Map();
    for (const normalized of saved) {
      next.set(normalized.id, normalized);
    }
    // Change detection without serializing the corpus (issue 1076): record by record, with
    // a reference fast path, short-circuiting at the first difference. The systems are
    // already plain normalized objects, so they need no projection. A reload that finds no
    // change advances no revision token.
    const changed = corpusChanged(this.systems.values(), next.values());
    this.systems = next;
    this.initialized = true;
    if (changed) {
      this._advanceSystemRevision(...next.keys());
    }
    return changed;
  }

  /**
   * The current revision token of one scope (issue 1076).
   *
   * The read half of the contract documented in {@link module:revisionTokens}. Consumers
   * hold a token and compare it with `===`; they never advance one.
   *
   * @param {string} [scope] A member of `REVISION_SCOPES`, defaulting to the whole
   *   crafting-system domain.
   * @returns {number}
   */
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
   * The ENABLED-and-disabled recipe set belonging to a system.
   *
   * Half of the `{getSystem, getRecipesForSystem, getComponentsForSystem}` contract
   * {@link SignatureValidator} has always documented but which no runtime object
   * implemented — seven call sites hand-rolled an ad-hoc adapter closure instead, so
   * there was no runtime method a counter could attach to and no single definition of
   * "the recipes of a system" (issue 1072). Several of those adapters are NOT
   * equivalent to this one and deliberately stay: the enable-time gate substitutes the
   * candidate recipe, and the migration/validation paths pass a JSON snapshot rather
   * than the live store. They now differ from a named baseline instead of from each other.
   *
   * Filtering (`enabled`) is the validator's own job — it scopes its scan to enabled
   * recipes itself — so this accessor stays unfiltered and callers do not each re-decide.
   *
   * @param {string} systemId
   * @returns {object[]}
   */
  getRecipesForSystem(systemId) {
    if (!systemId) return [];
    return this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) ?? [];
  }

  /**
   * The managed component library of a system — the other half of the
   * {@link SignatureValidator} contract (issue 1072).
   *
   * Returns the LIVE array rather than a copy, matching every adapter closure this
   * replaces (`system.components || []`). {@link getEssenceDefinitions} above copies,
   * but changing that here would be a silent behaviour change on the signature path
   * and a per-call O(components) allocation on the exact scan this issue exists to
   * bound. Callers must not mutate it.
   *
   * @param {string} systemId
   * @returns {object[]}
   */
  getComponentsForSystem(systemId) {
    const system = this.getSystem(systemId);
    return Array.isArray(system?.components) ? system.components : [];
  }

  getEssenceDefinitions(systemId) {
    const system = this.getSystem(systemId);
    if (!system) return [];
    return Array.isArray(system.essenceDefinitions) ? [...system.essenceDefinitions] : [];
  }

  /**
   * One essence definition by id.
   *
   * Reads the retained `byId` facet of {@link module:definitionIndex} rather than scanning
   * (issue 1076). The facet is built first-insert-wins in array order, so a duplicate id
   * resolves to the same definition the previous `.find()` returned.
   *
   * @param {string} systemId
   * @param {string} essenceId
   * @returns {object|null}
   */
  getEssenceDefinition(systemId, essenceId) {
    const system = this.getSystem(systemId);
    if (!system || !essenceId) return null;
    return findById(getDefinitionIndex(system.essenceDefinitions), essenceId);
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
   * Reconcile a recipe's legacy `recipeItemId` scalar against the many-to-many book
   * membership that superseded it. Runs un-gated on every `initialize()`, so both halves
   * must be idempotent and must converge on the first pass.
   *
   * Two reconciliations, deliberately sharing one walk over systems -> definitions ->
   * recipes (and one `systemsChanged`/`recipesChanged` pair, so one `save()` per setting
   * covers both — adding a second write here is the issue-970 failure mode below):
   *
   * 1. **Mint and stamp** (pre-existing). A recipe retaining a standalone
   *    `linkedRecipeItemUuid` with no valid `recipeItemId` gets a definition minted from
   *    that uuid and the scalar stamped. This is the alchemy formula-item cohort the
   *    1.13.0 migration deliberately preserved.
   * 2. **Clear a leaked scalar** (issue 978). Until that issue, saving a recipe from the
   *    manager persisted `containingDefinitions[0]` — an authoring accident of definition
   *    order — onto the model, because the editor seeds its draft from a whole projected
   *    row and Save posted the whole draft. For a recipe that IS a book member through
   *    `recipeIds[]`, the scalar is pure noise, and four legacy `src/systems` resolvers
   *    read it AHEAD of an authored `recipe.img` (issue 887).
   *
   * Half 2 never fires for the cohort half 1 maintains, and is unreachable in a fully
   * un-migrated system — no definition carries `recipeIds` there, so no recipe is a
   * member and the scalar is still the membership source.
   *
   * @returns {Promise<boolean>} Whether anything was persisted.
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

    // `save()` / `recipeManager.save()` write the `craftingSystems` and `recipes`
    // WORLD settings, which Foundry lets only a GM update. This pass runs from
    // `initialize()` — BEFORE `runStartupMaintenance`'s error isolation and before
    // `ready` is set — so on a player client the rejection escapes `initialize()`,
    // `this.initialized` never flips, and every facade method throws through
    // `_requireReady()` for the rest of that session (the issue-970 failure mode).
    // The versioned `MigrationRunner` is already active-GM gated; this un-versioned
    // sibling was not. The in-memory pass above is deliberately left ungated so a
    // player's loaded systems/recipes stay self-consistent for this session; the
    // GM's write replicates the durable fix to them via the `updateSetting` bridge.
    if (!this._isActiveGM()) return false;
    if (systemsChanged) await this.save();
    if (recipesChanged) await this.recipeManager.save();
    return systemsChanged || recipesChanged;
  }

  async createSystem(data = {}) {
    this._assertGM('create crafting system');
    const system = this._normalizeSystem(data);
    this._assertValidSystemId(system.id);
    this._assertUniqueComponentSourcesForSystem(system);
    this.systems.set(system.id, system);
    await this.save({ put: system });
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

      await this.save({ put: system });
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
    await this.save({ put: system });
    return { item, action: 'added' };
  }

  /**
   * Register a first-class Tool DIRECTLY from an Item uuid (issue 561), with NO component
   * import required. Resolves the source Item, builds the tool source snapshot (own source
   * refs + `name`/`img`), pushes a `componentId: null` first-class tool onto `system.tools`,
   * and stamps the durable `roles[systemId].toolId` on the source Item exactly as
   * {@link addItemFromUuid} / {@link addRecipeItemFromUuid} stamp their kinds. GM-gated,
   * dotted-id-safe (a null flag key skips the write), and save-persisted.
   *
   * @param {string} systemId
   * @param {string} itemUuid
   * @returns {Promise<{ item: object, action: 'added' }>}
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
      await this.save({ put: system });
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

  /**
   * Persist one normalized Tool, optionally registering or relinking its Item source.
   * Source resolution and snapshot construction finish before the system is mutated;
   * a failed settings write restores the prior Tool array and performs no flag writes.
   */
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
    const validPrerequisiteIds = new Set(
      (Array.isArray(system.characterPrerequisites) ? system.characterPrerequisites : []).map(
        (entry) => entry.id
      )
    );
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
      await this.save({ put: system });
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

  /**
   * Remove a Tool from `system.tools` and clear ONLY its durable `roles[systemId].toolId`
   * leaf from the source Item (issue 561, D7). The per-role leaf clear preserves any sibling
   * `roles[systemId].componentId` (the whetstone-coexistence guarantee) — it MUST NOT clear
   * the whole `roles[systemId]` object. GM-gated, save-persisted.
   *
   * @param {string} systemId
   * @param {string} toolId
   * @returns {Promise<{ deleted: boolean }>}
   */
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
      await this.save({ put: system });
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

    await this.save({ put: system });
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

    await this.save({ put: system });
    return { item: { ...definition } };
  }

  /**
   * Coerce a book-membership id list to the canonical persisted shape: trimmed,
   * non-empty, deduped strings. Factored out of `updateRecipeItemDefinition` so every
   * writer of `recipeItemDefinitions[].recipeIds` produces the same shape — the six
   * membership readers all match by exact string equality (five compare
   * `String(id) === rid` directly, and the book-side library enrichment in `adminStore`
   * does the same through a `Map` keyed on the recipe id), so a whitespace-padded id
   * written by a second path would simply stop matching.
   *
   * Deliberately NOT named `…IdList`: the imported `normalizeSelectionIds` coerces a
   * SELECTION of recipe ids, and near-homographs on one class are invisible at a call
   * site.
   *
   * @param {unknown} recipeIds Raw membership ids from a patch.
   * @returns {string[]} Trimmed, deduped, non-empty ids.
   * @private
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
   * Carry a system's legacy scalar membership across onto the canonical
   * `recipeItemDefinitions[].recipeIds` arrays, in memory (issue 1011).
   *
   * Run by the write that FIRST sets `membershipResolvesByRecipeIds`, before the
   * requested change is applied, so switching basis preserves the membership the
   * legacy basis resolved instead of discarding it. A no-op once the marker is set, so
   * a second write never re-seeds and a removal cannot be undone by the next write.
   *
   * This is `migrateInvertRecipeItemLink`'s PUSH half re-run at first-write time,
   * WITHOUT its delete half: it mutates no legacy reference. That is the whole reason
   * this approach was chosen over clearing the reverse refs — `_migrateLegacyRecipeItems`
   * re-stamps `recipe.recipeItemId` from a surviving `linkedRecipeItemUuid` on every
   * `initialize()` on every client, so no clear is durable, and the only clear that
   * would be durable also severs the standalone alchemy formula-item links that the
   * 1.13.0 migration deliberately preserved.
   *
   * Builds the legacy definition index (see
   * {@link CraftingSystemManager#_indexRecipeItemDefinitionsForLegacySeed}), then resolves
   * each recipe against it through the shared membership leaf's
   * `resolveLegacyMembershipDefinition` (issue 1155) — the same legacy resolution order,
   * and the same deliberate refusal to fall through on a dangling `recipeItemId`, that
   * every legacy READER resolves by. It must be the same function, not merely the same
   * shape: a seed that resolved membership differently from the readers would CHANGE
   * resolved membership at the moment the basis switches, which is the one thing this
   * seed exists to prevent.
   *
   * @param {object} system A live normalized system from the in-memory map.
   * @returns {boolean} `true` when at least one definition gained a member.
   * @private
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

  /**
   * Index a system's recipe item definitions for
   * {@link CraftingSystemManager#_seedMembershipFromLegacyScalars}: by the definition's
   * own id (for a recipe's `recipeItemId`) and by `originItemUuid` (for a recipe's
   * `linkedRecipeItemUuid`). Also ensures every definition carries a `recipeIds` array
   * before the caller seeds members into it.
   *
   * @param {object[]} definitions A system's `recipeItemDefinitions`.
   * @returns {{byId: Map<string, object>, bySource: Map<string, object>}} The two
   *   legacy-resolution indexes.
   * @private
   */
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

    // #99 / spec 007 §"Alchemy Uniqueness Revalidation": an edit to an ALREADY-alchemy
    // system (components, essences, recipe items, ...) that introduces an ingredient
    // signature collision must BLOCK the save globally ("Any detected collision blocks
    // saves globally until resolved, including saves from unrelated recipe edits").
    // Validate the PROPOSED merged system BEFORE persisting it, so a rejected update
    // never leaves the colliding state in the in-memory `systems` map or settings —
    // no revert is needed because nothing has been committed yet. A resolution-mode
    // CHANGE into alchemy is intentionally excluded here: that follows migration
    // policy below, which migrates recipes and DISABLES any that collide (gating
    // visibility, per the destructive-changes migration spec), rather than hard-
    // blocking the mode switch.
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
    await this.save({ put: merged });

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
      await this.save({ put: merged });
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
      await this._cleanupCraftingPreferences();
    }
    return merged;
  }

  /**
   * Move the crafting-check config between the shared pass/fail `simple` slot and the
   * tier-routing `routed` slot when a system's resolution mode crosses the
   * `routedByIngredients` boundary, mirroring the one-time 1.10.0 migration
   * ({@link migrateMoveRoutedByIngredientsCheck}) for a live GM mode switch. Mutates
   * `merged.craftingCheck` in place; called after normalization and before the first
   * persist in {@link updateSystem}, keyed on `resolutionModeChanged`.
   *
   *  - INTO `routedByIngredients` (e.g. from `routedByCheck`, whose config lived in
   *    `routed`): copy the shared pass/fail fields `routed → simple` when `simple` is
   *    unauthored, so the simple editor starts from the GM's existing formula/DC.
   *  - OUT of `routedByIngredients` INTO `routedByCheck`: copy the shared pass/fail
   *    fields `simple → routed` when `routed` is unauthored, so the tier editor starts
   *    from the GM's existing formula/DC.
   *
   * Both directions are guarded to fill only an UNAUTHORED destination (an authored
   * destination formula is never clobbered). `→ simple`/`alchemy` targets already read
   * `simple`, and `→ progressive` has no comparable pass/fail fields, so neither needs
   * a move. The `dcMode: 'dynamic'` caveat that used to stand here is GONE: the routed
   * slot carries `dcMode`/`macroUuid` now (issue 1096), so a dynamic simple check crossing
   * into `routedByCheck` keeps its macro instead of silently reverting to a static DC that
   * happened to linger in the simple slot.
   *
   * @param {object} merged The merged (post-change, normalized) system.
   * @param {string} fromMode
   * @param {string} toMode
   * @private
   */
  _reconcileCraftingCheckSlotsForModeChange(merged, fromMode, toMode) {
    const check = merged?.craftingCheck;
    if (!check || typeof check !== 'object') return;

    if (toMode === 'routedByIngredients' && fromMode !== 'routedByIngredients') {
      this._copyPassFailCheckFields(check.routed, check.simple);
    } else if (fromMode === 'routedByIngredients' && toMode === 'routedByCheck') {
      this._copyPassFailCheckFields(check.simple, check.routed);
    }
  }

  /**
   * Copy the shared pass/fail crafting-check fields (`rollFormula`, `dc`,
   * `thresholdMode`, `tiers`, `checkBreakage`) from a source slot to a destination
   * slot, but ONLY when the destination has no authored `rollFormula` and the source
   * does — so an authored destination is never clobbered. `dcMode`/`macroUuid` travel with
   * the rest now that BOTH slots carry them (issue 1096): leaving them behind was the one
   * way this move could silently change what a check rolls against.
   * @param {object} source
   * @param {object} destination
   * @private
   */
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

  /**
   * Migrate every recipe in a system to fit a changed resolution mode. Migratable
   * recipes are updated in place (structural-only persistence, no per-recipe
   * notification or change emission); structurally un-migratable recipes are
   * deleted. Emits one aggregated info notification for migrated recipes, one warn
   * notification listing deleted recipes (only when any were deleted), and a single
   * `recipesChanged` emission.
   *
   * **The deletions are COLLECTED and the set form is called ONCE** (issue 1132). This
   * runs INSIDE {@link CraftingSystemManager#updateSystem}, after that method's own
   * `save()` and before its terminal `_notifySystemsChanged()`, so routing the loop
   * through a cascading singular would give each un-migratable recipe its own
   * `craftingSystems` write, its own O(actors) flag pass and its own systems-changed
   * emission — publishing a half-migrated system N times, which is exactly the fault the
   * batched primitive exists to avoid. Per-recipe notification and emission stay
   * suppressed so this method keeps emitting its one aggregate, and `notifySystems: false`
   * leaves the systems-changed signal to `updateSystem`'s terminal one.
   *
   * It passes the LIVE `merged` system rather than a snapshot: `updateSystem` saves again
   * after this returns, so a prune written against a copy would be clobbered.
   *
   * @param {string} systemId
   * @param {string} fromMode
   * @param {string} toMode
   * @param {object} system The merged (post-change) system, live in `this.systems`.
   * @private
   */
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
   * Block an alchemy-system update that would introduce (or leave unresolved) an
   * ingredient signature collision. Validates the PROPOSED merged system — its
   * components against the system's CURRENT recipes — via the pure
   * {@link SignatureValidator}, and throws an Error naming the conflicting
   * recipes/sets when any collision is detected. No-op for non-alchemy systems.
   *
   * Called BEFORE the merged system is persisted (see {@link updateSystem}) so a
   * rejected update never commits the colliding state. Mirrors the per-recipe block
   * in {@link RecipeManager} so component/system edits and recipe edits enforce the
   * same alchemy uniqueness invariant (spec 007 §"Alchemy Uniqueness Revalidation").
   * @param {object} system The proposed (merged, normalized) crafting system.
   * @private
   */
  _assertNoAlchemySignatureCollisions(system) {
    if (system?.resolutionMode !== 'alchemy') return;
    const systemId = system.id;
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: systemId }) || [];
    const recipeJson = recipes.map((recipe) =>
      typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe
    );
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
   * Delete a crafting system and the recipes that belong to it. GM only. An
   * individual recipe deletion that fails (e.g. a Foundry settings write error
   * or timeout) does not abort the teardown: the failure is logged with its
   * recipe id, the remaining recipes are still deleted, and the system itself
   * is still removed, saved, and cleaned up so no half-deleted system is left
   * stranded in persisted settings. Emits one aggregated info notification on a
   * clean delete, or a warn summary naming how many recipes could not be
   * auto-deleted (and may need manual removal) when any recipe deletion failed.
   * @param {string} systemId
   * @returns {Promise<void>}
   * @throws {Error} When the caller is not a GM, or no system matches `systemId`.
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
    for (const recipe of affected) {
      try {
        await this.recipeManager.deleteRecipe(recipe.id, { notify: false, cleanupFlags: false });
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
    await this.save({ delete: systemId });

    await this._cleanupSystemScopedState(systemId);

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

  /**
   * Cascade cleanup across every persistent store keyed by `systemId`. Each
   * lookup is lazy and skips silently when the service is unavailable, so
   * tests constructing the manager without a `game.fabricate` registry stay
   * green. Recipe-keyed preferences (favourites, recent, discovery progress)
   * are orphaned via the prior recipe deletion and are not re-cleaned here.
   *
   * Learned-recipe flags are bulk-cleaned here in a SINGLE pass across all
   * actors (via `cleanupLearnedRecipes`) rather than once per deleted recipe:
   * `deleteSystem` passes `cleanupFlags: false` to each `deleteRecipe` to
   * suppress the per-recipe `_cleanupFlagsAfterRecipeMutation` fan-out, and
   * this method runs the one bulk pass after the recipes and the system have
   * already been removed, so the derived valid-id set excludes them.
   *
   * @param {string} systemId
   */
  async _cleanupSystemScopedState(systemId) {
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
        const validRecipeIds = new Set(this.recipeManager.getRecipes({}).map((r) => r.id));
        await visibilityService.cleanupLearnedRecipes(validRecipeIds);
      } catch (error) {
        console.error('Fabricate | learned-recipe cleanup failed for system', systemId, error);
      }
    }

    try {
      await this._cleanupCraftingPreferences();
    } catch (error) {
      console.error('Fabricate | preference cleanup failed for system', systemId, error);
    }
  }

  _notifySystemsChanged() {
    globalThis.Hooks?.callAll?.('fabricate.craftingSystemsChanged', this.getSystems());
  }

  async createItem(systemId, data = {}) {
    this._assertGM('create component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const validEssenceIds = new Set((system.essenceDefinitions || []).map((def) => def.id));
    const item = this._normalizeComponent(data, {
      validEssenceIds,
      ...this._salvageNormalizationContext(system),
    });
    this._assertUniqueComponentSources(system, item);
    system.components.push(item);
    advanceDefinitionRevision(system.components);
    await this.save({ put: system });
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
    // sidebar-Duplicate/clone. Its inherited `_stats.compendiumSource` still points at
    // the ORIGINAL's pack, so keying identity on it would (a) de-dup the clone onto the
    // original at find-existing and (b) silently OVERWRITE the original's definition at
    // the `updated` branch (issue 555, flow 4b). So a clone keys purely on its own uuid,
    // excluding the inherited compendium source from BOTH the find-existing references
    // AND the canonical uuid — it becomes a NEW definition/component.
    //
    // This is a REGISTRATION / source-repair rule ONLY. `duplicateSource` means "suspect
    // clone" for a world source being registered, but it means NOTHING for an actor-owned
    // copy: Foundry stamps `duplicateSource` on every non-compendium drag-drop
    // (`client-document.mjs`), while that copy's `compendiumSource` is legitimate
    // provenance. So this clone-gate must never reach the runtime matcher — which is why
    // `matchRecipeItemDefinition` carries no clone-gate and trusts tier-3 compendium.
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
   * Resolve component import source references, falling back when Foundry's
   * recorded canonical source no longer resolves.
   *
   * @param {string} itemUuid
   * @param {Item|object|null} source
   * @returns {Promise<{
   *   currentUuid: string|null,
   *   canonicalUuid: string|null,
   *   references: string[],
   *   aliasItemUuids: string[],
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>
   * }>}
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

  // Forward membership query (issue 511 many-to-many): the definitions of `systemId`
  // that contain `recipeId`. The rule itself — canonical `recipeIds[]`, then the legacy
  // reverse ref while the system's `membershipResolvesByRecipeIds` marker is unset — is
  // `utils/recipeItemMembership.js`, which every other membership reader also asks
  // (issue 1155). `indexedMembershipLookups` keeps the `recipeIds[]` leg on the retained
  // `recipeId -> definitions` index (issue 1076) rather than a per-check linear scan.
  //
  // `{ id: recipeId }` stands in for a recipe the manager cannot resolve, so a stale id
  // still answers from the definitions that list it and simply resolves no legacy scalar
  // — the order the previous inline implementation got by looking the recipe up lazily.
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

  /**
   * Add a crafting-system component from a Foundry item UUID.
   * Returns { item, action } where action is 'added', 'updated', or 'skipped'.
   *
   * Imports preserve both the live document UUID (`registeredItemUuid`) and the canonical
   * compendium/source UUID (`originItemUuid`) when Foundry exposes both.
   *
   * - 'skipped': an existing component already claims the incoming live UUID or canonical
   *              source UUID, and its metadata/source references are already current.
   * - 'updated': an existing component claims that source chain, but its metadata or
   *              stored live/canonical UUIDs need to be refreshed.
   * - 'added':   no component currently claims the incoming source references.
   *
   * @param {string} systemId
   * @param {string} itemUuid
   * @returns {Promise<{
   *   item: object,
   *   action: 'added'|'updated'|'skipped',
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>
   * }>}
   */
  /**
   * Strip a clone's stale `_stats` provenance (`duplicateSource` + inherited
   * `compendiumSource`) from a registered source Item. Kind-agnostic. Only touches a
   * source that is itself a clone (carries `_stats.duplicateSource`); a non-clone's
   * `compendiumSource` is legitimate provenance and is preserved. Returns whether
   * anything was written.
   * @private
   * @returns {Promise<boolean>}
   */
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

  /**
   * Core identity write, KIND-GENERIC over the durable flag key: strip a clone's stale
   * `_stats` provenance and stamp `flags.fabricate.<flagKey>` (overwriting an inherited
   * marker). Writes stay conditional. Assumes the caller has already checked writability
   * (world item, or unlocked pack). Shared by every registered kind — components, recipe
   * items, and any future first-class kind (issue 561) — and by the one-shot auto-stamp.
   *
   * @private
   * @returns {Promise<{stripped: boolean, stamped: boolean}>}
   */
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
   * Persist a transferable durable identity (`flags.fabricate.<flagKey>`) on a
   * registered source WORLD item, so any future inventory copy (drag/duplicate) inherits
   * it and resolves to this registration even when Foundry's transitive
   * `_stats.duplicateSource` points at a template. A clone source is also stripped of its
   * stale `_stats` provenance. KIND-GENERIC — the flag key names the kind. No-op for
   * compendium/locked/non-Item sources (not writable in place; their copies still resolve
   * via source UUIDs). GM context is guaranteed by the callers.
   *
   * The clone-gate (strip `_stats.duplicateSource`) is safe HERE — and only here and in
   * world/pack source repair — because a registered SOURCE item that carries
   * `duplicateSource` is a genuine sidebar-Duplicate whose inherited provenance would
   * otherwise collide it with its original. It must NEVER be applied to actor-owned
   * copies: Foundry stamps `duplicateSource` on every non-compendium drag-drop, so an
   * ordinary owned copy carries it legitimately, and stripping or distrusting it there
   * would break the hand-a-player-a-copy case. See {@link matchRecipeItemDefinition} in
   * `src/utils/sourceUuid.js` for the runtime matcher that deliberately has no gate.
   * @private
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
   * One-shot auto-stamp (issue 555, repurposed by issue 567): backfill the durable per-system
   * recipe-item identity `flags.fabricate.roles[system.id].recipeItemDefinitionId` (and strip a
   * clone's stale `_stats`) on every registered recipe-item definition's writable source Item —
   * world items and unlocked-pack items. A shared source registered as a definition in BOTH
   * system A and system B is stamped once per owning system, so it carries both `roles.A` and
   * `roles.B` leaves (the two-leaf outcome). Dotted (unsafe) system ids and locked packs /
   * unresolvable sources are counted and skipped. Idempotent: a second run finds every source
   * already stamped and performs zero writes. Sources only — owned copies are covered by future
   * drags (the durable flag is inherited) and by the manual repair. The legacy scalar is NOT
   * stripped; it remains the transitional read-only fallback tier for pre-upgrade owned copies.
   * Callers gate this on primary-GM + the one-shot setting version (`RECIPE_ITEM_FLAG_STAMP_TARGET`
   * bumped 1 → 2 so a world stamped at v1 re-runs once to backfill `roles`); it does no gating of
   * its own beyond writability, so it is safe to unit-test directly.
   *
   * @returns {Promise<{scanned:number, stamped:number, stripped:number, skippedLocked:number, skippedMissing:number}>}
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

  /**
   * Issue 556 one-shot auto-stamp: backfill the durable per-system component identity
   * `flags.fabricate.roles[system.id].componentId` (and strip a clone's stale `_stats`)
   * on every registered component's writable source Item — world items and unlocked-pack
   * items. Locked packs and unresolvable sources are counted and skipped. Idempotent: a
   * second run finds every source already stamped and performs zero writes. Sources only
   * — owned copies are covered by future drags (the durable flag is inherited) and by the
   * manual repair. Callers gate this on primary-GM + the one-shot setting version; it does
   * no gating of its own beyond writability, so it is safe to unit-test directly.
   *
   * @returns {Promise<{scanned:number, stamped:number, stripped:number, skippedLocked:number, skippedMissing:number}>}
   */
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

  /**
   * Issue 561 one-shot auto-stamp: backfill the durable per-system TOOL identity
   * `flags.fabricate.roles[system.id].toolId` on every registered tool's writable source
   * Item — a clone of {@link autoStampComponentSources}. Reads each tool's
   * (migration-populated) `originItemUuid`/`registeredItemUuid`; a tool with no source refs (a
   * legacy componentId-only tool whose migration could not resolve refs) is skipped. Dotted
   * (unsafe) system ids and locked/unresolvable sources are skipped. Idempotent, GM-safe.
   * ORDERING: this reads the tool source refs that the `1.15.0` settings-data migration
   * (`migrateToolsToFirstClass`) populates, so it MUST run after that migration persists.
   *
   * @returns {Promise<{scanned:number, stamped:number, stripped:number, skippedLocked:number, skippedMissing:number}>}
   */
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

  /**
   * Resolve the existing definition a registered source maps to. A NON-clone source's
   * durable identity flag is authoritative (it resolves to its definition even if the
   * recorded `originItemUuid` drifted): the per-system `roles[system.id].recipeItemDefinitionId`
   * leaf (issue 567) is read FIRST, then the legacy scalar `recipeItemDefinitionId` as a
   * transitional fallback for a source stamped before the restamp backfilled the map. A
   * CLONE's inherited flag belongs to the ORIGINAL and is ignored (the clone-gate), so a
   * duplicated source becomes its own definition (issue 555, flow 4b). Falls back to the
   * `originItemUuid` lookup, which is already clone-gated via `_resolveImportedSourceData`.
   * @private
   */
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

  /**
   * Write the durable identity onto ONE item given its already-resolved owner
   * definition. Authored once and shared by the world/pack-source and actor-owned
   * passes for both kinds. Strips a lingering `_stats.duplicateSource` when an owner is
   * found (so future copies key on THIS item), stamps the kind's durable flag, and
   * clears a stale flag when the item sources nothing. Writes stay conditional exactly
   * as before (only on an actual change).
   *
   * @private
   */
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

  /**
   * Reconcile ONE actor-owned item for one kind. A flagged owned copy is authoritative
   * and left untouched. Otherwise it resolves through the ordinary runtime matcher and,
   * for recipe items only, may be re-pointed by name: an unflagged copy whose name
   * uniquely matches a DIFFERENT definition than the one its `duplicateSource` names is
   * re-pointed to the name-matched definition (the duplicated-scroll-mislabelled-as-book
   * case). This never triggers a learn — it only writes item identity metadata.
   *
   * @private
   */
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

  /**
   * DEFINITION-DRIVEN description refresh, run as part of {@link repairItemData}.
   *
   * It shares the button, the `_assertGM` gate, and the summary object with the
   * identity repair — but deliberately NOT its traversal, for two reasons:
   *
   * 1. The item-driven walk SKIPS LOCKED PACKS, because identity repair writes flags
   *    INTO pack items. Descriptions only READ through `fromUuid`, which resolves a
   *    locked pack fine — and a locked system pack (dnd5e's `equipment24`, say) is
   *    exactly where the reported raw `@UUID[Compendium.dnd5e.…]` lives. Riding the
   *    item walk would leave the reported bug unfixed.
   * 2. It inverts authority. An actor-owned COPY would become a candidate writer of
   *    the DEFINITION's description, last-writer-wins across every copy in the world.
   *
   * Tools are excluded by design: a tool snapshot is name/img only and carries no
   * description. So the `descriptions` bucket counts components and recipe-item
   * definitions only.
   *
   * Unaffected by `includeCompendiums`, which gates writes into packs.
   *
   * @param {object} summary - the shared repair summary; its `descriptions` bucket is mutated
   * @returns {Promise<boolean>} whether any stored description changed
   * @private
   */
  /**
   * Record one skipped description against BOTH the split reason counter and the flat
   * `skipped` total. The split exists so a GM can tell a broken source link (their
   * problem to fix) from a source that simply has no description (nothing to do).
   * @private
   */
  _countSkippedDescription(summary, reason) {
    summary.descriptions[reason] += 1;
    summary.descriptions.skipped += 1;
  }

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
   * GM maintenance ("Repair Item Data"): reconcile EVERY PROJECTION of a definition's
   * resolved source document — durable identity and derived display snapshots alike.
   *
   * Identity leg (item-driven): every crafting component, tool, AND recipe-item
   * definition's identity is reconciled across world items, writable packs, and
   * actor-owned items so matching is durable. World/pack SOURCE items are
   * strip-and-stamped with a clone-gated identity (a duplicated source becomes its own
   * definition, never overwriting the original). Actor-owned copies are resolved with
   * the ordinary runtime matchers and, for recipe items, a guardrailed name-assisted
   * re-point. Locked packs are counted and skipped. Synthetic/unlinked token actors and
   * compendium-resident actors are not in `game.actors` and are not scanned. Never
   * triggers a learn.
   *
   * Description leg (definition-driven, issue 800): each component and recipe-item
   * definition resolves its OWN source reference — including sources in LOCKED packs —
   * and its stored description is refreshed to the enricher-resolved plain text. See
   * {@link _refreshDefinitionDescriptions} for why this cannot ride the item walk.
   *
   * @param {{ includeCompendiums?: boolean }} [options]
   * @returns {Promise<object>} summary with flat totals plus per-kind buckets, the
   *   `descriptions` bucket, repointed, skippedAmbiguous, skippedLocked, and the
   *   re-point audit log.
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
      await this.save();
      this._notifySystemsChanged();
    }

    return summary;
  }

  /**
   * Import (or refresh) a single component from a source Item UUID.
   *
   * @param {string} systemId
   * @param {string} itemUuid
   * @param {{persist?: boolean}} [options] - Set `persist=false` for batch callers (e.g.
   *   {@link addItemsFromPack}) that mutate the in-memory system per item and then issue a
   *   SINGLE `save()` after the whole batch, collapsing N growing whole-corpus
   *   `craftingSystems` world writes into one. Nothing else is gated by it: the source
   *   resolution, the type guard, the match/overwrite classification, the durable
   *   role-flag stamp on the source document, and the returned `{item, action,
   *   sourceFallbacks}` are identical either way. Default `true` keeps every single-item
   *   caller issuing its one write.
   * @returns {Promise<{item: object, action: 'added'|'updated'|'skipped', sourceFallbacks: Array}>}
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

      if (options.persist !== false) await this.save({ put: system });
      return { item: existing, action: 'updated', sourceFallbacks: nextSnapshot.sourceFallbacks };
    }

    // No match: create new component
    const validEssenceIds = new Set((system.essenceDefinitions || []).map((def) => def.id));
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
    if (options.persist !== false) await this.save({ put: system });
    return { item, action: 'added', sourceFallbacks: nextSnapshot.sourceFallbacks };
  }

  /**
   * Replace a component's source Item link and return fallback metadata when the
   * dropped Item's recorded canonical source is broken.
   *
   * @param {string} systemId
   * @param {string} itemId
   * @param {string} itemUuid
   * @returns {Promise<{
   *   item: object,
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>
   * }>}
   */
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

    const validEssenceIds = new Set((system.essenceDefinitions || []).map((def) => def.id));
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
    await this.save({ put: system });
    return { item: updatedItem, sourceFallbacks: nextSnapshot.sourceFallbacks };
  }

  /**
   * Bulk-import all Item documents from a Foundry compendium pack into a crafting system.
   * Delegates to addItemFromUuid which now returns { item, action }.
   *
   * @param {string} systemId  - The crafting system to add items to
   * @param {string} packId    - The compendium pack identifier (e.g. "dnd5e.items")
   * @returns {Promise<{
   *   added: number,
   *   updated: number,
   *   skipped: number,
   *   total: number,
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>
   * }>}
   */
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
    // Each item mutates the in-memory system only (persist:false); the whole batch is
    // flushed with ONE `save()` below, collapsing N growing whole-corpus `craftingSystems`
    // world writes — each of which is also replicated to every connected client and
    // re-normalized there — into a single write (issue 1086). This is the
    // `CompendiumImporter` recipe-batching pattern (issue 776) applied to component import.
    //
    // `dirty` tracks whether anything actually changed the corpus. A `skipped` item mutates
    // nothing (it only re-stamps the SOURCE document's role flag, which is a per-document
    // write this batching never touched), so an all-skipped re-drop writes nothing at all —
    // exactly as before, when the skipped branch returned ahead of its own `save()`.
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
      // `finally`, not a trailing statement: an item that throws mid-batch (a source that
      // resolves to a non-Item, a duplicate-source collision) must still persist the items
      // already imported. Per-item saves gave that for free; the batched write has to ask
      // for it. The error still propagates — this flushes the partial batch, it does not
      // swallow the failure — which matches `CompendiumImporter`, where a failed record
      // likewise leaves its predecessors in the single post-loop save.
      if (dirty) await this.save();
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
          // A component's `name` is an indexed field of the name fallback, rewritten in
          // place on an element of an otherwise unchanged array (issue 1076).
          advanceDefinitionRevision(components);
        }
      }
    }

    if (updated > 0) {
      await this.save();
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
    const validEssenceIds = new Set((system.essenceDefinitions || []).map((def) => def.id));
    const updatedItem = this._normalizeComponent(
      { ...system.components[idx], ...updates, id: itemId },
      { validEssenceIds, ...this._salvageNormalizationContext(system) }
    );
    if (!this._sameSourceReferenceSet(system.components[idx], updatedItem)) {
      this._assertUniqueComponentSources(system, updatedItem, itemId);
    }
    system.components[idx] = updatedItem;
    advanceDefinitionRevision(system.components);
    await this.save({ put: system });
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
   * Apply a bulk edit — any of category, tag additions, tag removals, essences and
   * progressive DC — to a SET of components in one `save()`.
   *
   * The shared set-apply primitive behind folder-aware import categorization (issue
   * 771) and multi-select bulk edit (issue 772): both need "apply these changes to
   * these components" as a single persist rather than a per-component `updateItem`
   * loop (N saves, N notifications).
   *
   * The axes match `Component`'s own semantics (data-models spec):
   *  - `category` is SINGLE-valued, so a provided category OVERWRITES each component's
   *    current one. Omitting it (or an empty/whitespace string) leaves the category
   *    untouched — a folder that maps to no category still applies its tags.
   *  - `tags` is many-valued and ADDITIVE, so `addTags` is unioned into each
   *    component's existing tags (case-insensitively de-duplicated, stored lowercase
   *    to match the `itemTags` vocabulary) rather than replacing them.
   *  - `removeTags` is a lowercased set DIFFERENCE applied AFTER `addTags`, so a tag
   *    supplied in both is removed. The bulk panel's tri-state chips make that
   *    collision unreachable; the primitive defines it rather than leaving it undefined.
   *  - `essences` REPLACES the whole `{essenceId: quantity}` map when the key is
   *    PRESENT. `_normalizeEssenceQuantities` drops non-positive quantities and ids
   *    outside the system's definitions, so an all-zero map clears essences and a
   *    foreign id cannot be injected.
   *  - `difficulty` is the progressive DC. `_normalizeComponent` keeps `>= 1` and
   *    otherwise stores `undefined`, so `0`, `null`, `''` and `NaN` all CLEAR it.
   *
   * The guard tests a resolved non-empty `category`/`addTags`/`removeTags` and the
   * PRESENCE — never the truthiness — of `essences` and `difficulty`: `{essences: {}}`
   * and `{difficulty: 0}` are both real "clear this" edits, and a removal-only call is a
   * real edit. #771's import caller supplies neither key, so a presence test is false
   * for it and the guard behaves exactly as it did before issue 772.
   *
   * Every changed component is re-normalized under the owning system's essence AND
   * salvage context, exactly as `updateItem` does. That is not inert for salvage: with a
   * Simple-mode context `_normalizeSalvage` runs the success-first retain-one clamp
   * (issue 764), which can re-order or drop result groups on a component whose salvage
   * config predates it. That is correct, pre-existing behaviour shared with the
   * single-component write — the bulk axes themselves never carry salvage.
   *
   * @param {string} systemId
   * @param {Iterable<string>} componentIds ids of the components to mutate.
   * @param {{category?: string, addTags?: string[], removeTags?: string[],
   *   essences?: Record<string, number>, difficulty?: number|null|string}} [edit]
   * @param {{persist?: boolean}} [options] - Set `persist=false` for a batch caller that
   *   issues several set-applies (e.g. the folder-import commit, one per mapped folder) and
   *   then a SINGLE `save()` for the whole run. Only the `craftingSystems` write is gated;
   *   the cohort resolution, mutation, re-normalization and returned counts are identical.
   *   Default `true` keeps the GM browser's one-shot bulk edit writing immediately.
   * @returns {Promise<{updated: number, componentIds: string[]}>} the ids the edit was
   *   APPLIED TO — the resolved cohort, not a diff. `changedIds` is pushed for every id in
   *   the target set that resolves to a component, whether or not any value differs, so a
   *   re-apply of the same category to three components reports "3". The return feeds the
   *   post-apply summary count only, so no caller depends on the stronger reading, and a
   *   diff here would have to reproduce the normalization `_normalizeComponent` performs.
   *   Matches {@link CraftingSystemManager#applyBulkEditToEssences}'s contract exactly.
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

    const validEssenceIds = new Set((system.essenceDefinitions || []).map((def) => def.id));
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

    if (changedIds.length > 0 && options.persist !== false) await this.save({ put: system });
    return { updated: changedIds.length, componentIds: changedIds };
  }

  /**
   * Apply a bulk edit — any of category, status, lock, check tier and recipe-book
   * membership — to a SET of recipes in one `recipes` write and one `craftingSystems`
   * write (issue 1010).
   *
   * The recipe twin of {@link CraftingSystemManager#applyBulkEditToComponents}, mirrored
   * rather than shared because recipes are not stored on the system. It lives HERE and not
   * on `RecipeManager` because the book axis writes `system.recipeItemDefinitions[].recipeIds`
   * and `RecipeManager` has no `save()` for that setting. It never touches `Recipe`
   * internals: every recipe-field write goes through `recipeManager.updateRecipe`, so
   * normalization, persistence validation and the activation gate all stay put.
   *
   * The `edit` contract is `toBulkRecipeEdit`'s six keys, each present IF AND ONLY IF its
   * axis is staged. Three of them are FALSY BUT REAL — `enabled: false`, `locked: false`
   * and `checkTierId: null` (Default DC) — so the staging guard tests `Object.hasOwn` and
   * never truthiness, exactly as the component primitive's `essences`/`difficulty` guard
   * does. A truthiness test would silently drop Disable, Unlock and Default DC.
   *
   * **Write order: books first, then recipes.** The two axes are independent — no book
   * operation touches a `Recipe` field — so at most ONE in-memory map is dirty across any
   * I/O await, and a rejected `save()` cannot leave both mutated against stale world
   * settings. Books rather than recipes first because the membership-basis marker write is
   * what makes every subsequent membership read well-defined: if it fails, nothing else
   * should have happened, whereas recipes-first would leave a window in which recipes are
   * persisted against an unmarked system. `SocketInterface.dispatch` rejects on any server
   * error and that is reachable without a bug — `_assertGM` is `game.user.isGM`
   * (`hasRole(ASSISTANT)`) while `SETTINGS_MODIFY` is revocable from assistants, so in a
   * world that has revoked it the client-side gate passes and the server refuses.
   *
   * **Two `save()` calls, one per world SETTING — not a redundant pair to collapse.**
   * `CraftingSystemManager.save()` writes the `craftingSystems` setting and
   * `RecipeManager.save()` writes the `recipes` setting, and the book axis lives on the
   * system while the recipe axes live on the recipes. The batch's guarantee is therefore
   * at most ONE write of EACH, never one write in total, and each is skipped outright
   * when its own half changed nothing: a recipe-only edit issues no `craftingSystems`
   * write, and a book-only edit issues no `recipes` write.
   *
   * **The activation gate runs INSIDE `updateRecipe`, per recipe, in batch order — not as
   * a batched pre-check.** That is the CORRECT evaluation for a batch rather than a cost
   * this accepts: {@link RecipeManager#_validateSignatures} substitutes the candidate into
   * the LIVE recipe list, so enabling sequentially is what lets the second alchemy
   * candidate see the first one already enabled, and be refused for the collision it
   * really does create. Hoisting the gate into one pre-pass would evaluate every candidate
   * against a world in which none of its peers had been enabled yet, and the batch would
   * persist a signature collision the single-recipe write refuses.
   * {@link RecipeManager#canActivateRecipe} IS that pre-batch evaluation, which is exactly
   * why a pre-flight count derived from it is a LOWER BOUND while this loop's
   * `blockedEnables` is the authority.
   *
   * **This method maintains the membership-basis marker itself.** It mutates definitions
   * directly and therefore BYPASSES the `updateRecipeItemDefinition` choke point, so it runs
   * the same seed-then-set pair that choke point runs (see
   * {@link CraftingSystemManager#_seedMembershipFromLegacyScalars}).
   *
   * @param {string} systemId
   * @param {Iterable<string>} recipeIds ids of the recipes to mutate. A foreign or dangling
   *   id is simply absent from the resolved cohort rather than an error.
   * @param {{category?: string, enabled?: boolean, locked?: boolean, checkTierId?: ?string,
   *   addBookIds?: string[], removeBookIds?: string[]}} [edit]
   * @returns {Promise<{updated: number, recipeIds: string[], blockedEnables: number,
   *   blockedRecipeIds: string[], rejected: number, rejectedRecipeIds: string[],
   *   booksUpdated: number, bookIds: string[], bookAdditions: number, bookRemovals: number}>}
   *   `recipeIds` are the recipes actually changed; `blockedRecipeIds` those whose enable
   *   the activation gate refused (their other staged axes still landed); `rejectedRecipeIds`
   *   those a `RecipePersistenceError` excluded from the batch entirely — a data-integrity
   *   signal, not an expected outcome. `bookIds` are the definitions the requested
   *   add/remove changed, which does NOT include a definition touched only by the
   *   legacy-scalar seed.
   *
   *   `bookAdditions` / `bookRemovals` count membership EDGES — one per (recipe, book) pair
   *   the write created or destroyed — while `booksUpdated` counts DEFINITIONS. Neither
   *   derives from the other (one book over twelve recipes is 1 definition and 12 edges),
   *   and the edge counts are what the post-apply notification reports, because "put these
   *   recipes in that book" is the instruction the GM actually gave.
   * @throws {Error} when the system does not resolve, or when `checkTierId` names a tier
   *   this system's crafting check does not author — both BEFORE any write.
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
      await this.save({ put: system });
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
   * Read the six-key bulk recipe `edit` into a resolved axis descriptor, testing PRESENCE
   * and never truthiness, and resolving the staged check tier against THIS system's
   * authored tiers.
   *
   * The tier resolution throws here — before the caller has mutated anything — because a
   * bulk write's blast radius justifies being stricter than the single-recipe editor write,
   * which tolerates a dangling `checkTierId` and falls back to the default DC at resolution
   * time.
   *
   * @param {object} system a live normalized system.
   * @param {object} edit the `toBulkRecipeEdit` projection.
   * @returns {{staged: boolean, hasCategory: boolean, category: string, hasEnabled: boolean,
   *   enabled: boolean, hasLocked: boolean, locked: boolean, hasCheckTier: boolean,
   *   checkTierId: ?string, addBookIds: Set<string>, removeBookIds: Set<string>}}
   * @private
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
   * Resolve a staged bulk check-tier id against the tiers THIS system's crafting check
   * actually authors, or throw.
   *
   * `null`/empty is the real instruction "Default DC" and resolves to `null`. Anything else
   * must name a tier the panel could have offered, which is exactly
   * `resolveRecipeCheckTierOptions` over the system's active crafting-check SLOT — the same
   * helper the recipe editor's dropdown and the bulk panel's own gate read, so the three
   * cannot disagree about which tiers exist.
   *
   * THE SLOT IS THE RESOLVER'S OWN ANSWER (issue 1096), not a manager-side twin of it. A
   * hand-rolled copy of the mode map stood here and was documented as "kept structurally
   * identical" to `CraftingSystemManagerRoot`'s, which nothing pinned; the moment the root
   * moved onto `resolveActiveCraftingCheckFormula` the two disagreed for alchemy, and the
   * panel listed a routed tier that this method then threw on. One derivation is the only
   * shape in which the offer and the write cannot drift.
   *
   * A `null` slot — alchemy at `checkMode: 'none'`, or a resolution mode outside the
   * canonical set — yields `resolveRecipeCheckTierOptions(check, null) === []`, so a system
   * that rolls no crafting check accepts Default DC and nothing else.
   *
   * @param {object} system
   * @param {?string} rawTierId
   * @returns {?string} the trimmed tier id, or `null` for Default DC.
   * @private
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
   * Apply the book axis by iterating the DEFINITIONS rather than the recipes.
   *
   * `addBookIds` and `removeBookIds` are disjoint, so every touched definition takes exactly
   * ONE operation — a union with the whole selection, or a difference against it — and is
   * written exactly once. A definition named by neither list is left byte-identical (the
   * legacy-scalar seed is the one exception, and it is a basis carry-across rather than a
   * requested edit). A definition named by both would be a contract violation the panel's
   * one-op-per-book staging makes unreachable; the REMOVE wins, mirroring the component
   * primitive's removals-after-the-union rule, so the operation stays single and defined.
   *
   * **The EDGE counts are measured here, against the SEEDED arrays.** The seed runs first
   * and rewrites `recipeIds` from the legacy scalars, so `current` is the book's true
   * membership on either basis by the time the delta is taken — which is what makes an
   * addition count honest on a legacy world, where an unseeded `recipeIds` would be empty
   * and every member would read as newly added. The seed's own writes are deliberately NOT
   * counted: they carry an existing membership across a basis switch rather than adding one,
   * and reporting them would tell the GM they had added members to books they never named.
   *
   * @param {object} system a live normalized system.
   * @param {object[]} cohort the resolved recipes of this system named by the selection.
   * @param {{addBookIds: Set<string>, removeBookIds: Set<string>}} axes
   * @returns {{changed: boolean, bookIds: string[], additions: number, removals: number}}
   *   `changed` is true when this call mutated ANY definition — including one the seed alone
   *   touched, which must be persisted rather than left diverging from the stored setting.
   *   `additions` / `removals` are membership EDGES, not definitions.
   * @private
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
   * **Loop atomicity here is MICROTASK-ONLY, and that differs from the mirrored precedent.**
   * `applyBulkEditToComponents`'s loop is LITERALLY synchronous; this one awaits once per
   * iteration and merely BEHAVES atomically, because `updateRecipe` with `persist: false`
   * performs no real I/O — all three of its validators are synchronous — so the loop drains
   * as microtasks and a socket-delivered `updateSetting` cannot interleave. The moment
   * anything awaiting real I/O enters this loop, `reload()` can replace the recipes map
   * wholesale between iterations and silently discard every staged edit; there is no
   * compare-and-set anywhere in the settings path to catch it.
   *
   * @param {object[]} cohort
   * @param {object} axes
   * @returns {Promise<{recipeIds: string[], blockedRecipeIds: string[],
   *   rejectedRecipeIds: string[]}>}
   * @private
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
   * The MINIMAL patch for one recipe: only the staged fields whose value actually differs.
   * A recipe every staged axis already agrees with contributes no `updateRecipe` call at
   * all, which is what lets a resolved no-op issue zero writes.
   *
   * The category is normalized first because `Recipe` normalizes it on construction, so a
   * raw comparison would report a difference for `'General'` against the stored `'general'`
   * and re-write every recipe in the selection.
   *
   * @param {object} recipe
   * @param {object} axes
   * @returns {{category?: string, enabled?: boolean, locked?: boolean, checkTierId?: ?string}}
   * @private
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
   * Write one recipe's minimal patch, resolving BOTH error branches — which are different
   * failures and are reported separately.
   *
   * `RecipeActivationError` is a refused ENABLE. The id is recorded, `enabled` is dropped
   * and the patch is retried so the ungated axes still land on a recipe that stays off:
   * `updateRecipe` throws at its activation gate strictly BEFORE `this.recipes.set`, so
   * nothing partial was written and the retry is clean. The retry cannot itself throw —
   * persistence was already validated by the first attempt and is independent of `enabled`,
   * and with `enabled` gone the activation gate no longer runs.
   *
   * `RecipePersistenceError` is a recipe that cannot be saved AT ALL: `updateRecipe`
   * validates persistence FIRST, and with `allowIncomplete: true` that still runs
   * `validateStructure()`, which a structurally broken recipe fails. That class is precisely
   * the one this change makes newly visible and selectable, so an uncaught throw would abort
   * the whole batch on the first such recipe — AFTER the books save has already committed —
   * leaving the recipes map partially mutated and never saved. It is logged (the post-apply
   * notification tells the GM to see the console) and the batch continues.
   *
   * @param {string} recipeId
   * @param {object} updates the minimal patch; mutated in place on the blocked retry.
   * @returns {Promise<{updated: boolean, blocked: boolean, rejected: boolean}>}
   * @private
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
   * Delete a SET of recipes and everything that deletion reaches, in at most ONE `recipes`
   * write, at most ONE `craftingSystems` write and ONE actor-flag CLEAN-UP (issue 1132).
   *
   * **It lives here and not on `RecipeManager` because `RecipeManager` READS systems and
   * never WRITES them.** Write ownership of the `craftingSystems` setting, and `save()` on
   * it, exist only here. (`RecipeManager` does hold a `getCraftingSystem` seam and reaches
   * the system manager in roughly fifteen places, so "it has no reference" would be false.)
   *
   * **Every GM-initiated delete routes through the shared body**, exactly as
   * {@link CraftingSystemManager#deleteItem} and
   * {@link CraftingSystemManager#deleteComponents} both route through
   * `_deleteComponentSet`, so the entry points cannot disagree about what deleting a
   * recipe reaches: the studio singular, the studio set, `game.fabricate.deleteRecipe` and
   * {@link CraftingSystemManager#_migrateRecipesForModeChange}. Two paths are deliberately
   * exempt and both are recorded on {@link RecipeManager#deleteRecipe}.
   *
   * @param {string} systemId The system whose recipe items the prune rewrites. An
   *   unresolvable id deletes the recipes and prunes nothing rather than throwing — unlike
   *   components and essences, which LIVE on the system, a recipe lives in its own world
   *   setting, so a recipe whose `craftingSystemId` dangles is a real and deletable object
   *   and is precisely the orphan `game.fabricate.deleteRecipe` most needs to reach.
   * @param {Iterable<string>} recipeIds A stale id is skipped, not thrown.
   * @param {{notify?: boolean, emitChange?: boolean, notifySystems?: boolean}} [options]
   * @returns {Promise<{deleted: number, recipeIds: string[], recipeItemsAffected: number,
   *   recipeItemsRewritten: number, learnersAffected: number}>} BOTH recipe-item numbers,
   *   because they answer different questions and the GM was promised the first one:
   *   `recipeItemsAffected` is the basis-aware count of recipe items that will no longer
   *   contain these recipes — the figure the card states — and `recipeItemsRewritten` counts
   *   the definitions the write actually rewrote, which is zero on a legacy-basis system.
   *   See `utils/recipeDeleteImpact.js` for why those two are different questions rather
   *   than a drift.
   */
  async deleteRecipes(systemId, recipeIds, options = {}) {
    this._assertGM('delete recipes');
    return await this._deleteRecipeSet(this.getSystem(systemId), recipeIds, options);
  }

  /**
   * The shared body of every cascading recipe delete.
   *
   * **Write order: `recipes` setting → `craftingSystems` setting → actor flags.** Two
   * reasons carry it, and `applyBulkEditToRecipes`' docblock already states the permission
   * argument both rest on — `_assertGM` is `game.user.isGM` (`hasRole(ASSISTANT)`) while
   * `SETTINGS_MODIFY` is revocable from assistants, so in a world that has revoked it the
   * client-side gate passes, the server refuses and `SocketInterface.dispatch` rejects.
   *
   *  - **Recipes before books.** If the book write fails after the recipe write, the world
   *    holds dangling book ids — exactly today's steady state, invisible at render and
   *    repaired by the next successful delete. Books first, with the recipe write then
   *    failing, would lose authored membership for recipes that still exist, with nothing
   *    able to reconstruct it. Note that {@link CraftingSystemManager#applyBulkEditToRecipes}
   *    orders the two the OTHER way, for a reason that does not apply here: its book write
   *    SETS the basis marker, so recipes-first would leave a window in which recipes are
   *    persisted against an unmarked system. A delete sets no marker, so that reason is
   *    absent and the dangling-membership one governs.
   *  - **Both settings before actors**, for a caller whose `SETTINGS_MODIFY` has been
   *    explicitly revoked. There is no client-side preflight on the update path, the write
   *    genuinely throws, and it is not swallowed — such a caller must mutate no actor flags.
   *
   * **The `craftingSystems` half takes a restore point, exactly as the `recipes` half does.**
   * The prune mutates the LIVE `entry.definition.recipeIds` in `this.systems` and then
   * saves; a refused second write would otherwise leave this client showing pruned state
   * while every peer still reads the dangling ids, until an unrelated later save happened to
   * persist it. `RecipeManager.deleteRecipes` snapshots and restores its map for the same
   * reason. The exposure is narrow — the ordering above means a revoked `SETTINGS_MODIFY`
   * throws at step 1, before any system is touched — so this covers a transient failure of
   * the second write alone. The snapshot is per-pruned-definition and shallow, which is
   * enough: the mutation is a whole-array replacement of one field.
   *
   * **The `craftingSystems` write must not touch the membership-basis marker.**
   * {@link CraftingSystemManager#updateRecipeItemDefinition} is the single choke point for
   * it (issue 1011) and looping that would be N `craftingSystems` writes AND would flip a
   * legacy system's basis irreversibly and system-wide as a side effect of a delete the GM
   * authored for another reason. So this writes the array directly, reusing
   * {@link CraftingSystemManager#_normalizeMembershipRecipeIds} because the six membership
   * readers match by exact string equality — and it neither sets nor reads the marker.
   * That deliberately departs from `applyBulkEditToRecipes`, which also bypasses the choke
   * point but DOES maintain the marker: correct for an edit, wrong for a delete, because
   * `_seedMembershipFromLegacyScalars` PUSHES onto existing arrays rather than replacing,
   * so seeding on the way to removing an id would materialise legacy membership as
   * authored membership.
   *
   * **Both change hooks, not one.** The batch writes both settings, so it emits both
   * signals, gated per-axis exactly as `applyBulkEditToRecipes` does: on the writing client
   * `reload()` returns `false`, so the `updateSetting` socket bridge re-emits nothing
   * locally and a book change announced only as `recipesChanged` would be invisible to the
   * GM's own other windows. `deleteComponents` and `deleteEssences` both rewrite recipes
   * and emit only `_notifySystemsChanged()` — they are the trap here, not the pattern.
   *
   * @param {object|null} system The LIVE normalized system from `this.systems`, never a
   *   snapshot: the mode-change caller runs inside `updateSystem`, which saves again
   *   afterwards, and a prune written against a copy would be clobbered by those saves.
   * @param {Iterable<string>} recipeIds
   * @param {{notify?: boolean, emitChange?: boolean, notifySystems?: boolean}} [options]
   * @returns {Promise<{deleted: number, recipeIds: string[], recipeItemsAffected: number,
   *   recipeItemsRewritten: number, learnersAffected: number}>}
   * @private
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
        await this.save({ put: system });
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
    await this.recipeManager.cleanupOrphanedRecipeFlags?.();

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
   * Delete a SET of components in ONE `craftingSystems` write and ONE `recipes` write
   * (issue 1129).
   *
   * **The batched recipe cascade is the point of this method existing**, exactly as it is for
   * {@link CraftingSystemManager#deleteEssences}. Looping {@link CraftingSystemManager#deleteItem}
   * would issue one `craftingSystems` write per component AND — because
   * {@link RecipeManager#updateRecipe} ends in its own `save()`, a full replace of the `recipes`
   * world setting — one `recipes` write per rewritten recipe per component, each triggering a
   * serialization diff plus `Hooks.callAll` on EVERY connected client. A recipe referencing
   * two deleted components would be written twice and COUNTED twice. Instead the union rewrite
   * is computed per recipe ONCE and exactly one `recipes` save, one `this.save()`, one
   * `_notifySystemsChanged()`, one summary notification and one
   * `_reconcileAlchemySignaturesAfterDeletion` follow.
   *
   * Because both settings are REPLACED rather than merged, neither needs a `-=` deletion key.
   *
   * In-use components are NOT refused. Deletion is warned, not blocked: the caller states the
   * recipe impact before arming, and the cascade rewrites every referencing recipe.
   *
   * `recipesDisabled` counts recipes this call took from enabled to disabled — a recipe that
   * was already disabled is not counted, because the number exists to warn about craftability
   * the GM is about to lose, not to restate what was already off.
   *
   * @param {string} systemId
   * @param {Iterable<string>} componentIds
   * @returns {Promise<{deleted: number, componentIds: string[], recipesUpdated: number,
   *   recipesDisabled: number}>}
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
   * {@link CraftingSystemManager#deleteComponents}: remove the components, repair every
   * reference to them, and persist once.
   *
   * Both public deletes route through here so they cannot disagree about what deleting a
   * component reaches. It deliberately does NOT assert GM, notify, or reconcile alchemy
   * signatures — each caller owns its own message and the singular form keeps its historical
   * silence on `_notifySystemsChanged`.
   *
   * The recipe rewrites run BEFORE `await this.save()`, as both essence deletes already do.
   * That ordering is only safe because the activation blocker lives in
   * `_validateRecipeForActivation` and NOT in `_validateRecipeForPersistence`: a
   * persistence-level blocker would throw partway through the loop with `components` and
   * `essenceDefinitions` already mutated in memory, some recipes written, and nothing persisted.
   *
   * ── ONE REFERENCE CLASS IS DELIBERATELY LEFT DANGLING ─────────────────────────────
   * A SURVIVING component's `salvage.resultGroups[].results` may name a deleted component,
   * and nothing here repairs it — the shipped `deleteItem` did not either, and this method
   * preserves that behaviour rather than widening the blast radius of a bug fix.
   * `_cleanupSalvageRunsForComponent` covers actor RUN HISTORY only, which is a different
   * store. The consequence is bounded and visible: the impact statement the bulk panel shows
   * claims no salvage coverage, so it does not promise a repair that does not happen. Closing
   * it changes what a delete does to stored components and warrants its own issue.
   *
   * @param {string} systemId
   * @param {Iterable<string>} componentIds
   * @returns {Promise<{deleted: number, componentIds: string[], removedNames: string[],
   *   recipesUpdated: number, recipesDisabled: number, system: object}>}
   * @private
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

    await this.save({ put: system });

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
   * Strip every deleted component from every referencing recipe in ONE `recipes` write.
   *
   * Each recipe is rewritten ONCE for the whole set — a recipe referencing two deleted
   * components must not be written twice, nor counted twice — and the trailing `save()` is the
   * only persist. Only recipes that actually reference a deleted component are touched, so
   * unrelated recipes are not re-saved.
   *
   * The rewrite and the "no longer craftable" decision both live in
   * `src/utils/recipeComponentReferences.js`, which is also what the bulk panel's impact
   * statement counts through, so the stated numbers and the executed write cannot drift.
   *
   * @param {string} systemId
   * @param {Set<string>} removedIdSet
   * @returns {Promise<{recipesUpdated: number, recipesDisabled: number}>}
   * @private
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
      // ONE change signal for the whole batch, restoring what `emitChange: false` suppressed.
      //
      // This is load-bearing rather than tidy. Before the batching, each rewrite left
      // `emitChange` at its default and `updateRecipe` fired `recipesChanged` per recipe on
      // the acting client. `settingChangeBridge` does NOT backfill it: it re-emits only when
      // `recipeManager.reload()` returns truthy, and on the WRITING client the in-memory map
      // already equals the saved setting, so `reload()` returns false. Without this line a
      // GM's own crafting window keeps offering pre-rewrite recipes until an unrelated write.
      // `deleteItem` deliberately does not call `_notifySystemsChanged()`, so it has no other
      // signal at all.
      this.recipeManager.notifyRecipesChanged({ action: 'update' });
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
   * Delete an essence definition and strip it from any recipe ingredient sets that reference it.
   * Only referencing recipes are re-saved, and a single summary notification is emitted (mirrors
   * {@link deleteItem}). Recipes left with no usable ingredient sets or results are disabled.
   * @param {string} systemId
   * @param {string} essenceId
   * @returns {Promise<boolean>} true if an essence definition was removed
   */
  async deleteEssence(systemId, essenceId) {
    this._assertGM('delete essence');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const removed = definitions.find((def) => def.id === essenceId);
    if (!removed) return false;

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

    await this.save({ put: system });
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
   * Apply a bulk edit — any of icon, colour and enabled status — to a SET of essence
   * definitions in ONE `craftingSystems` write (issue 1036).
   *
   * The essence twin of {@link CraftingSystemManager#applyBulkEditToComponents}. It
   * routes through {@link CraftingSystemManager#updateSystem} rather than mutating
   * `system.essenceDefinitions` and calling `save()` directly, because that is where the
   * alchemy guard lives: an essences edit to an ALREADY-alchemy system runs
   * `_assertNoAlchemySignatureCollisions`, which THROWS, so a status flip that would
   * collapse two recipes onto one signature is BLOCKED — per
   * `destructive-changes-and-migrations/spec.md` §Alchemy Uniqueness Revalidation clauses
   * 3 and 5 — instead of silently disabling recipes. `updateSystem` issues exactly one
   * `save()` for an essences-only patch and emits the one systems-changed hook.
   *
   * **Every axis is presence-gated on `Object.hasOwn`, NEVER truthiness.** `enabled:
   * false` (Disable) and `colorToken: null` (Clear colour) are FALSY BUT REAL staged
   * edits, and a truthiness test would silently drop the two most ordinary operations the
   * panel offers. Both shipped precedents — `applyBulkEditToComponents`'s
   * `essences`/`difficulty` guard and `applyBulkEditToRecipes`'s `enabled`/`locked`/
   * `checkTierId` guard — document exactly this trap in their own comments.
   *
   * An empty `edit` (nothing staged) is a no-op returning `{ updated: 0 }` and issues NO
   * write at all, so an accidental Apply cannot re-normalize a whole system's essences.
   *
   * @param {string} systemId
   * @param {Iterable<string>} essenceIds ids of the essences to mutate. A foreign or
   *   dangling id is simply absent from the resolved cohort rather than an error.
   * @param {{icon?: string, colorToken?: ?string, enabled?: boolean}} [edit]
   * @returns {Promise<{updated: number, essenceIds: string[]}>} the ids the edit was
   *   APPLIED TO — the resolved cohort, not a diff. An essence already carrying the staged
   *   value is rewritten to it and still counted, so `updated` is a selection size: a
   *   re-apply of the same colour to three essences reports "3". The return feeds the
   *   post-apply summary count only, so no caller depends on the stronger reading, and a
   *   diff here would have to reproduce the normalization the map below performs (the
   *   `enabled` write alone rewrites a legacy `undefined` to `true`).
   * @throws {Error} when the system does not resolve, or when the resulting system would
   *   carry an alchemy signature collision.
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
   * Delete a SET of essence definitions in ONE `craftingSystems` write and ONE `recipes`
   * write (issue 1036).
   *
   * **The batched recipe cascade is the point of this method existing.**
   * {@link RecipeManager#updateRecipe} ends in its own `save()` — a full replace of the
   * `recipes` world setting — so looping {@link CraftingSystemManager#deleteEssence} would
   * issue one `recipes` write per rewritten recipe, each triggering `reload()` plus a full
   * serialization diff plus `Hooks.callAll` on EVERY connected client, and a recipe
   * referencing two deleted essences would be written twice. Instead the union rewrite is
   * computed per recipe ONCE, each is written with `{ persist: false, emitChange: false }`,
   * and exactly one `recipeManager.save()`, one `this.save()`, one `_notifySystemsChanged()`,
   * one summary notification and one `_reconcileAlchemySignaturesAfterDeletion` follow.
   *
   * Because both settings are REPLACED rather than merged, neither needs a `-=` deletion key.
   *
   * The recipe rewrites deliberately run BEFORE `await this.save()`, exactly as
   * {@link CraftingSystemManager#deleteEssence} does. That ordering is only safe because the
   * disabled-essence activation blocker lives in `_validateRecipeForActivation` and NOT in
   * `_validateRecipeForPersistence`: a persistence-level blocker would throw partway through
   * this loop with `essenceDefinitions` and the component essence maps already mutated in
   * memory, some recipes written, and nothing persisted.
   *
   * In-use essences are NOT refused. Deletion is warned, not blocked:
   * {@link CraftingSystemManager#deleteEssence} strips the essence from every carrying component
   * and the caller deletes every selected id, stating the component and recipe impact first.
   *
   * `recipesDisabled` mirrors {@link CraftingSystemManager#deleteComponents}: it counts recipes
   * this call took from enabled to disabled — a recipe that was already disabled is not
   * counted, because the number exists to warn about craftability the GM is about to lose, not
   * to restate what was already off.
   *
   * @param {string} systemId
   * @param {Iterable<string>} essenceIds
   * @returns {Promise<{deleted: number, essenceIds: string[], recipesUpdated: number,
   *   recipesDisabled: number}>}
   */
  async deleteEssences(systemId, essenceIds) {
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

    await this.save({ put: system });
    this._notifySystemsChanged();

    if (recipesUpdated > 0) {
      ui?.notifications?.info?.(
        `Removed ${removedIds.length} essence(s) and updated ${recipesUpdated} recipe(s).`
      );
    }

    await this._reconcileAlchemySignaturesAfterDeletion(system);

    return { deleted: removedIds.length, essenceIds: removedIds, recipesUpdated, recipesDisabled };
  }

  /**
   * Strip every deleted essence from every referencing recipe in ONE `recipes` write.
   *
   * Each recipe is rewritten ONCE for the whole set — a recipe referencing two deleted
   * essences must not be written twice — and the trailing `save()` is the only persist.
   *
   * @param {string} systemId
   * @param {string[]} removedIds
   * @returns {Promise<{recipesUpdated: number, recipesDisabled: number}>}
   * @private
   */
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

  /**
   * Whether a rewritten recipe has lost its ingredient sets or its results entirely and
   * must therefore be clamped to disabled. Shared by the single and set essence deletes so
   * the two cannot disagree about what "no longer craftable" means.
   *
   * Both callers pass `recipe.toJSON()`, whose result data lives in `resultGroups` alone: the
   * flat top-level `results` alias is no longer emitted (issue 1087) and was a flatten of
   * exactly those groups, so it could never have made this predicate answer differently.
   * @param {object} updated a plain recipe JSON.
   * @returns {boolean}
   * @private
   */
  _recipeLostItsShape(updated) {
    return recipeLostItsShape(updated);
  }

  /**
   * Whether a recipe references the given component in any ingredient set or result.
   * Uses the same field matching as the strip logic the component deletes execute.
   *
   * Delegates to the shared leaf (issue 1129) so this predicate, the strip, and the admin
   * store's recipe-usage projection are one implementation rather than three.
   *
   * @param {object} recipe
   * @param {string} itemId
   * @returns {boolean}
   */
  _recipeReferencesComponent(recipe, itemId) {
    return recipeReferencesComponent(recipe, itemId);
  }

  /**
   * Strip an essence from an ingredient-set array: remove the legacy per-set map key
   * AND any first-class essence OPTION (`match.type === 'essence'`) for that essence
   * from each group (dropping a group left with no options), then drop a set left with
   * no ingredient groups / ingredients / essences.
   *
   * **`ingredients` is RESOLVED, never carried through the spread (issue 1036).** It is
   * the flat legacy mirror `IngredientSet` derives from `ingredientGroups` — the first
   * option of each group — and a payload written before issue 1135 still carries it
   * alongside the groups, so a `...set` spread hands the STALE mirror to both the retention
   * filter below and the `IngredientSet` constructor. Two live defects followed from that:
   *
   *  1. the retention filter reads `set.ingredients?.length`, so a set whose ONLY
   *     requirement was the deleted essence survived the drop while still naming an
   *     essence already removed from `system.essenceDefinitions` in memory.
   *     `_validateEssenceReferences` then raised at PERSISTENCE level, `updateRecipe`
   *     threw, and the cascade aborted with the in-memory system already mutated and
   *     nothing written — the world settings still held the truth, but the next
   *     unrelated `save()` from any other GM action committed the destruction;
   *  2. `IngredientSet`'s constructor rebuilds its groups from `data.ingredients`
   *     whenever `ingredientGroups` is empty (`IngredientSet.js:33-36`), so a stripped
   *     set with a stale mirror RESURRECTED the deleted essence option as a fresh group.
   *
   * **Since issue 1135 the mirror is DROPPED rather than recomputed** for a set authored
   * with groups. `toJSON` no longer emits the flat alias at all, so recomputing it here put
   * the retired alias straight back into the `updateRecipe` payload on every essence-delete
   * cascade — a mixed corpus, which is exactly the resurrection hazard above in its latent
   * form. Dropping it is strictly safer than recomputing it, because `IngredientSet` derives
   * the mirror from the stripped groups on read.
   *
   * Dropping it UNCONDITIONALLY would not be safe: for a set authored in the LEGACY flat
   * shape the array is the set's only ingredient data and the `set.ingredients?.length` leg
   * of the retention filter is what keeps that set alive, so that array is filtered in place
   * and kept.
   *
   * The same reasoning retires `essences: {}`: an emptied legacy map is the value the
   * constructor rebuilds from absence, and the retention filter reads it through
   * `Object.keys(set.essences || {})`.
   *
   * @param {object[]} sets
   * @param {string} essenceId
   * @returns {object[]}
   * @private
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

  /**
   * Whether a recipe references the given essence in any ingredient set.
   *
   * A thin delegator to the shared {@link recipeReferencesEssence} leaf (issue 1036),
   * which the admin store's `recipeUsageCount` projection also reads — the store calls no
   * underscore-private manager method, and two walks would let the row's count disagree
   * with the cascade this manager actually performs. Retained as a method so existing
   * callers and subclasses are unaffected.
   * @param {object} recipe
   * @param {string} essenceId
   * @returns {boolean}
   */
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

  /**
   * Detect components whose surplus Simple-mode salvage success groups were dropped by
   * the `_normalizeSalvage` clamp (issue 764), comparing the incoming (pre-normalization)
   * input against the normalized result. Only meaningful in Simple salvage mode; returns
   * the display names of affected components so `updateSystem` can disclose the deletion.
   * A dropped reserved failure group (no Simple formula) is NOT reported — this counts
   * SUCCESS groups only, matching the ruled invariant.
   *
   * @param {object} inputSystem - The pre-normalization merged input.
   * @param {object} normalizedSystem - The normalized (clamped) system.
   * @returns {string[]} Names of components that lost a success group.
   */
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

  async _cleanupCraftingPreferences() {
    const validSystemIds = new Set(this.getSystems().map((system) => system.id));
    const validRecipeIds = new Set(this.recipeManager.getRecipes({}).map((recipe) => recipe.id));
    await cleanupStalePreferences(validSystemIds, validRecipeIds, getSetting, setSetting, {
      resolveGatheringActor: (actorId) => game.actors?.get?.(actorId) ?? null,
      isSelectableGatheringActor: (actor) => isGatheringActorSelectableByUser(actor, game.user),
    });
  }
}
