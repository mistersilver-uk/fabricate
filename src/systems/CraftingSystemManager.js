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
import { getIngredientComponentId } from '../models/match/matchTypes.js';
import {
  TOOL_BREAKAGE_MODES as TOOL_BREAKAGE_MODE_LIST,
  TOOL_ON_BREAK_MODES as TOOL_ON_BREAK_MODE_LIST,
} from '../models/Tool.js';
import { normalizeCategoryIconMap } from '../utils/categoryIcons.js';
import {
  normalizeComponentCategory,
  normalizeCustomComponentCategories,
} from '../utils/componentCategories.js';
import { parsePlainDiceGroups, parseDiceGroups } from '../utils/craftingCheckExpression.js';
import { normalizeCustomRecipeCategories } from '../utils/recipeCategories.js';
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
import { normalizeCurrencyConfig } from './currencyProfile.js';
import { normalizeGatheringRealmList, normalizeGatheringRealmSettings } from './gatheringRealms.js';
import { SignatureValidator } from './SignatureValidator.js';

// Membership sets derived from the canonical Tool model vocabularies, so the
// system-owned tool normalizer enforces the exact same enumerations as the Tool
// model and the adminStore editor without duplicating the literal lists.
const TOOL_BREAKAGE_MODES = new Set(TOOL_BREAKAGE_MODE_LIST);
const TOOL_ON_BREAK_MODES = new Set(TOOL_ON_BREAK_MODE_LIST);

export class CraftingSystemManager {
  constructor(recipeManager) {
    this.recipeManager = recipeManager;
    this.systems = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const saved = getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) || [];
    for (const system of saved) {
      const normalized = this._normalizeSystem(system);
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
    const essenceIds = new Set(essenceDefinitions.map((def) => def.id));
    // Salvage-normalization context (issue 764), HOISTED above the component map so the
    // Simple-mode group-count clamp in `_normalizeSalvage` sees the owning system's mode
    // and Simple check formula flag. Both derivations are component-independent, so
    // hoisting is safe; the return literal below reuses `salvageResolutionMode`.
    const { salvageResolutionMode, salvageSimpleCheckHasFormula } =
      this._salvageNormalizationContext(system);
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
      ? system.tools.map((t) => this._normalizeTool(t))
      : [];
    for (const normalizedTool of normalizedTools) {
      deriveToolSourceFromComponents(normalizedTool, items);
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
      craftingCheck: this._normalizeCraftingCheck(system.craftingCheck),
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
      salvageCraftingCheck: this._normalizeSalvageCraftingCheck(system.salvageCraftingCheck),
      gatheringCraftingCheck: this._normalizeGatheringCraftingCheck(system.gatheringCraftingCheck),
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
      characterPrerequisites: normalizeCharacterPrerequisiteList(
        system.characterPrerequisites,
        () => foundry.utils.randomID()
      ),
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
  _normalizeTool(tool = {}) {
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
    return {
      id,
      label,
      enabled: normalizedTool.enabled !== false,
      componentId,
      name:
        typeof normalizedTool.name === 'string' && normalizedTool.name ? normalizedTool.name : null,
      img: typeof normalizedTool.img === 'string' && normalizedTool.img ? normalizedTool.img : null,
      registeredItemUuid,
      originItemUuid,
      aliasItemUuids,
      requirement: this._normalizeToolRequirement(normalizedTool.requirement),
      breakage: this._normalizeToolBreakage(normalizedTool.breakage),
      onBreak: this._normalizeToolOnBreak(normalizedTool.onBreak),
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
    if (mode === 'immune') {
      // An immune tool carries no breakage fields and never breaks.
      return { mode };
    }
    const threshold = Number(input?.threshold);
    return {
      mode,
      formula: typeof input?.formula === 'string' ? input.formula : '',
      threshold: Number.isFinite(threshold) ? threshold : 0,
    };
  }

  _normalizeToolOnBreak(input) {
    const mode = TOOL_ON_BREAK_MODES.has(input?.mode) ? input.mode : 'destroy';
    if (mode === 'replaceWith') {
      return {
        mode,
        replacementComponentId:
          typeof input?.replacementComponentId === 'string' ? input.replacementComponentId : null,
      };
    }
    return { mode };
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
    };
  }

  _normalizeCraftingCheck(check = {}) {
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
      progressive: this._normalizeProgressiveCraftingCheck(check?.progressive),
      outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
      routed: this._normalizeRoutedCraftingCheck(check?.routed),
      simple: this._normalizeSimpleCraftingCheck(check?.simple),
    };
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
    return {
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
    return {
      type: source.type === 'fixed' ? 'fixed' : 'relative',
      rollFormula,
      dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
      thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      tiers: tiers.map((tier) => this._normalizeSimpleTier(tier)).filter(Boolean),
      relativeOutcomes: relative
        .map((outcome) => this._normalizeRoutedOutcome(outcome, 'relative'))
        .filter(Boolean),
      fixedOutcomes: fixed
        .map((outcome) => this._normalizeRoutedOutcome(outcome, 'fixed'))
        .filter(Boolean),
      checkBreakage: this._normalizeUnifiedTriggers(
        rollFormula,
        source.diceCrits,
        source.checkBreakage
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
   * are converted to `diceGroup` triggers and concatenated ahead of the normalized
   * `checkBreakage.triggers`. Idempotent — a re-normalized block carries no
   * `diceCrits` and its triggers already hold `outcome`/`breakTools`, so the second
   * pass converts nothing and re-normalizes the triggers to themselves.
   *
   * @param {string} rollFormula     Formula used to resolve a converted crit's groupId.
   * @param {Array<object>} [diceCrits]   Legacy per-die crit list (pre-recombine).
   * @param {object} [checkBreakage]      Existing `{ triggers }` block.
   * @returns {{ triggers: Array<object> }}
   * @private
   */
  _normalizeUnifiedTriggers(rollFormula, diceCrits, checkBreakage) {
    const converted = this._convertDiceCritsToTriggers(diceCrits, rollFormula);
    const { triggers } = this._normalizeCheckBreakage(checkBreakage);
    return { triggers: [...converted, ...triggers] };
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
   * Normalize a single unified trigger `{ id, condition, outcome, breakTools }`,
   * dropping it (returning null) when its condition shape is malformed.
   *
   * - `outcome` is one of `'success' | 'failure' | 'none'` (default `'none'`);
   *   pinned to `'none'` for an `outcomeTier` condition, whose match is resolved
   *   only after the routed outcome is known (so it can never force one).
   * - `breakTools` defaults to `false`, EXCEPT a legacy break-only trigger (one
   *   carrying neither an `outcome` nor a `breakTools` prop, as authored before the
   *   recombine) is migrated to `breakTools: true` so it keeps breaking tools.
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

  _normalizeSalvageCraftingCheck(check = {}) {
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
      // Salvage reuses the crafting check sub-object shapes so the Checks-tab
      // editors are shared. The simple/routed default DC is the sub-object's `dc`;
      // a per-component override lives on `component.salvage.dcOverride`. Tiers and
      // the dynamic-DC macro are stored but hidden by the salvage editors (salvage
      // has no recipes to pick a tier from).
      simple: this._normalizeSimpleCraftingCheck(normalizedCheck.simple),
      routed: this._normalizeRoutedCraftingCheck(normalizedCheck.routed),
      progressive: this._normalizeProgressiveCraftingCheck(normalizedCheck.progressive),
      outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
    };
  }

  // System-level gathering check (gathering resolution modes d100/progressive/
  // routed). d100 needs no editable config (the fixed d100 roll), so only the
  // progressive and routed sub-objects are authored, reusing the crafting shapes.
  // A per-task DC override lives on the gathering task (`task.dcOverride`).
  _normalizeGatheringCraftingCheck(check = {}) {
    const source = !check || typeof check !== 'object' ? {} : check;
    return {
      enabled: source.enabled === true,
      progressive: this._normalizeProgressiveCraftingCheck(source.progressive),
      routed: this._normalizeRoutedCraftingCheck(source.routed),
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

  _normalizeEssenceDefinition(entry, usedIds = new Set()) {
    if (typeof entry === 'string') {
      const base = entry.trim();
      if (!base) return null;
      return {
        id: this._uniqueKey(base, usedIds),
        name: base,
        description: '',
        icon: 'fas fa-mortar-pestle',
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

  _plainTextDescription(value) {
    const raw = this._descriptionTextCandidate(value);
    if (!raw) return '';

    if (globalThis.document?.createElement) {
      const template = globalThis.document.createElement('template');
      template.innerHTML = raw;
      return String(template.content?.textContent || '')
        .replaceAll(/\s+/g, ' ')
        .replaceAll(/ ([,.;:!?])/g, '$1')
        .trim();
    }

    return raw
      .replaceAll(/<br\s*\/?>/gi, ' ')
      .replaceAll(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, ' ')
      .replaceAll(/<[^>]{1,2048}>/g, ' ')
      .replaceAll(/&nbsp;/gi, ' ')
      .replaceAll(/&amp;/gi, '&')
      .replaceAll(/&lt;/gi, '<')
      .replaceAll(/&gt;/gi, '>')
      .replaceAll(/&quot;/gi, '"')
      .replaceAll(/&#39;|&apos;/gi, "'")
      .replaceAll(/\s+/g, ' ')
      .replaceAll(/ ([,.;:!?])/g, '$1')
      .trim();
  }

  _descriptionTextCandidate(value, seen = new Set()) {
    if (value == null) return '';

    const valueType = typeof value;
    if (valueType === 'string') return value.trim();
    if (['number', 'boolean', 'bigint'].includes(valueType)) {
      return String(value).trim();
    }
    if (Array.isArray(value)) {
      return value
        .map((entry) => this._descriptionTextCandidate(entry, seen))
        .filter(Boolean)
        .join(' ')
        .trim();
    }
    if (valueType !== 'object') return '';
    if (seen.has(value)) return '';
    seen.add(value);

    for (const key of [
      'value',
      'enriched',
      'html',
      'text',
      'content',
      'short',
      'long',
      'unidentified',
      'chat',
    ]) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const candidate = this._descriptionTextCandidate(value[key], seen);
      if (candidate) return candidate;
    }

    return '';
  }

  _extractSourceDescription(source = null) {
    if (!source || typeof source !== 'object') return '';

    const candidates = [
      source?.system?.description?.value,
      source?.system?.description,
      source?.description?.value,
      source?.description,
    ];

    for (const candidate of candidates) {
      const plainText = this._plainTextDescription(candidate);
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
        ? this._extractSourceDescription(source)
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
        ? this._extractSourceDescription(source)
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
   * {@link _buildRecipeItemSourceSnapshot}; the description is intentionally omitted (a tool
   * snapshot is name/img only).
   * @private
   */
  async _buildToolSourceSnapshot(itemUuid, source = null) {
    const sourceData = await this._resolveImportedComponentSourceData(itemUuid, source);
    const fallbackName = itemUuid?.split('.')?.pop() || 'Imported Tool';
    return {
      name: source?.name || fallbackName,
      img: source?.img || 'icons/svg/item-bag.svg',
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
   * awards via `slice(0, 1)`, no role filter (`CraftingEngine._resolveSalvageResultGroups`)
   * — plus at most one reserved `role: 'failure'` group, tolerated ONLY when the Simple
   * salvage check slot has an authored roll formula. A failure-first `[failure, success]`
   * input (which import/copy/migration can carry, though the editor never authors it) is
   * re-ordered so the success group lands at index 0; a failure-only config has NO success
   * group and clamps `enabled` to false. The reserved-failure tolerance is a DATA-MODEL /
   * VALIDATION ALLOWANCE ONLY — salvage Simple never awards or routes to a failure group.
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
      // Success group ALWAYS at index 0 — the engine awards `slice(0, 1)` with no role
      // filter, so a failure-first input is re-ordered here rather than awarding failure.
      if (successGroup) clamped.push(successGroup);
      // Reserved failure group tolerated ONLY with an authored Simple check formula.
      if (failureGroup && salvageSimpleCheckHasFormula === true) clamped.push(failureGroup);
      resultGroups = clamped;
      // A Simple config with no success group (e.g. a lone `role: 'failure'` group)
      // cannot be enabled — `slice(0, 1)` would otherwise award the failure group.
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
      learnOnCraft: c.learnOnCraft === true,
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

  async save() {
    const payload = [...this.systems.values()];
    await setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, payload);
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
    const before = JSON.stringify([...this.systems.values()]);
    const saved = getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) || [];
    const next = new Map();
    for (const system of saved) {
      const normalized = this._normalizeSystem(system);
      next.set(normalized.id, normalized);
    }
    this.systems = next;
    this.initialized = true;
    return before !== JSON.stringify([...this.systems.values()]);
  }

  getSystems() {
    return [...this.systems.values()];
  }

  getSystem(systemId) {
    return this.systems.get(systemId) || null;
  }

  getEssenceDefinitions(systemId) {
    const system = this.getSystem(systemId);
    if (!system) return [];
    return Array.isArray(system.essenceDefinitions) ? [...system.essenceDefinitions] : [];
  }

  getEssenceDefinition(systemId, essenceId) {
    const system = this.getSystem(systemId);
    if (!system || !essenceId) return null;
    return (system.essenceDefinitions || []).find((def) => def.id === essenceId) || null;
  }

  getRecipeItemDefinitions(systemId) {
    const system = this.getSystem(systemId);
    if (!system) return [];
    return Array.isArray(system.recipeItemDefinitions) ? [...system.recipeItemDefinitions] : [];
  }

  getRecipeItemDefinition(systemId, recipeItemId) {
    const system = this.getSystem(systemId);
    if (!system || !recipeItemId) return null;
    return (system.recipeItemDefinitions || []).find((def) => def.id === recipeItemId) || null;
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
    await this.save();
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

      await this.save();
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
    system.recipeItemDefinitions = recipeItemDefinitions;

    if (roleFlagKey) await this._stampSourceIdentity(source, roleFlagKey, item.id);
    await this.save();
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
    this._assertGM('add tool from uuid');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);

    let source;
    try {
      source = await fromUuid(itemUuid);
    } catch {
      source = null;
    }

    if (source && source.documentName && source.documentName !== 'Item') {
      throw new Error(`Cannot add non-Item document (${source.documentName}) as a tool`);
    }

    const snapshot = await this._buildToolSourceSnapshot(itemUuid, source);
    const tool = this._normalizeTool({ ...snapshot, componentId: null });
    if (!Array.isArray(system.tools)) system.tools = [];
    system.tools.push(tool);

    const flagKey = this._toolRoleFlagKey(system.id);
    if (flagKey) await this._stampSourceIdentity(source, flagKey, tool.id);
    await this.save();
    return { item: tool, action: 'added' };
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

    system.tools = tools.filter((entry) => String(entry?.id) !== String(toolId));
    const flagKey = this._toolRoleFlagKey(system.id);
    const registeredItemUuid = tool.originItemUuid || tool.registeredItemUuid || null;
    if (flagKey && registeredItemUuid) {
      await this._clearSourceFlag(registeredItemUuid, flagKey, tool.id);
    }
    await this.save();
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

    await this.save();
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
    if (Object.prototype.hasOwnProperty.call(patch, 'recipeIds')) {
      definition.recipeIds = [
        ...new Set(
          (Array.isArray(patch.recipeIds) ? patch.recipeIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        ),
      ];
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

    await this.save();
    return { item: { ...definition } };
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
    await this.save();

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
      await this.save();
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
   * a move. Caveat: a `dcMode: 'dynamic'` simple check copied into `routedByCheck`
   * loses its dynamic DC (the routed slot has no `dcMode`); the resulting static
   * `routed.dc` is whatever value lingered in the simple slot, so the GM should
   * re-author the DC after switching into `routedByCheck`.
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
   * does — so an authored destination is never clobbered. `dcMode`/`macroUuid` are not
   * copied (the routed slot has neither; the read-time normalizer defaults them).
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
   * @param {string} systemId
   * @param {string} fromMode
   * @param {string} toMode
   * @param {object} system The merged (post-change) system.
   * @private
   */
  async _migrateRecipesForModeChange(systemId, fromMode, toMode, system) {
    const affectedRecipes = this.recipeManager.getRecipes({ craftingSystemId: systemId });
    let migratedCount = 0;
    const deletedNames = [];

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
        await this.recipeManager.deleteRecipe(recipe.id, { notify: false, emitChange: false });
        continue;
      }

      await this.recipeManager.updateRecipe(recipe.id, next, {
        notify: false,
        allowIncomplete: true,
        emitChange: false,
      });
      migratedCount += 1;
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
    await this.save();

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
    await this.save();
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
  // (`recipe.recipeItemId`, or `linkedRecipeItemUuid → originItemUuid`) only for
  // un-migrated definitions that carry no `recipeIds` yet.
  _getRecipeObjectsReferencingRecipeItemDefinition(systemId, definition) {
    if (!definition || !this.recipeManager?.getRecipes) return [];
    const recipes = this.recipeManager.getRecipes({ craftingSystemId: systemId });

    const recipeIds = Array.isArray(definition.recipeIds) ? definition.recipeIds : [];
    if (recipeIds.length > 0) {
      const idSet = new Set(recipeIds.map(String));
      return recipes.filter((recipe) => idSet.has(String(recipe?.id)));
    }

    // This definition carries no membership. Only reach for the legacy reverse ref when
    // the WHOLE system is un-migrated; in a migrated system an empty `recipeIds` means an
    // empty book, and a recipe's stale `recipeItemId`/`linkedRecipeItemUuid` must not
    // resurrect a phantom membership (mirrors getRecipeItemDefinitionsContaining).
    const definitions = Array.isArray(this.getSystem(systemId)?.recipeItemDefinitions)
      ? this.getSystem(systemId).recipeItemDefinitions
      : [];
    const anyMigrated = definitions.some(
      (def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0
    );
    if (anyMigrated) return [];

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
  // that contain `recipeId`. Canonical read is each definition's `recipeIds[]`; when a
  // system carries no membership yet (fully un-migrated) it falls back to resolving the
  // recipe's legacy reverse ref (`recipeItemId` / `linkedRecipeItemUuid`) to its book.
  getRecipeItemDefinitionsContaining(systemId, recipeId) {
    const system = this.getSystem(systemId);
    if (!system || !recipeId) return [];
    const rid = String(recipeId);
    const definitions = Array.isArray(system.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];

    const byMembership = definitions.filter((def) =>
      (Array.isArray(def.recipeIds) ? def.recipeIds : []).some((id) => String(id) === rid)
    );
    if (byMembership.length > 0) return byMembership;

    // Only fall back for a system that has no membership authored anywhere.
    const anyMigrated = definitions.some(
      (def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0
    );
    if (anyMigrated) return [];

    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) return [];
    const recipeItemId = String(recipe.recipeItemId || '').trim();
    const legacyUuid = String(recipe.linkedRecipeItemUuid || '').trim();
    return definitions.filter((def) => {
      if (recipeItemId) return String(def.id) === recipeItemId;
      return !!legacyUuid && String(def.originItemUuid || '') === legacyUuid;
    });
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
   * GM maintenance ("Repair item data"): reconcile every crafting component AND recipe-item
   * definition's identity across world items, writable packs, and actor-owned items so
   * matching is durable. World/pack SOURCE items are strip-and-stamped with a clone-gated
   * identity (a duplicated source becomes its own definition, never overwriting the
   * original). Actor-owned copies are resolved with the ordinary runtime matchers and,
   * for recipe items, a guardrailed name-assisted re-point. Locked packs are counted and
   * skipped. Synthetic/unlinked token actors and compendium-resident actors are not in
   * `game.actors` and are not scanned. Never triggers a learn.
   *
   * @param {{ includeCompendiums?: boolean }} [options]
   * @returns {Promise<object>} summary with flat totals plus per-kind buckets, repointed,
   *   skippedAmbiguous, skippedLocked, and the re-point audit log.
   */
  async repairComponentSourceFlags({ includeCompendiums = true } = {}) {
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

    return summary;
  }

  async addItemFromUuid(systemId, itemUuid) {
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

      await this.save();
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
    const addedRoleKey = this._componentRoleFlagKey(system.id);
    if (addedRoleKey) await this._stampSourceIdentity(source, addedRoleKey, item.id);
    await this.save();
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
    // Re-point the transferable flag: clear the old source (if it still points here)
    // and stamp the new source, so copies match the current source, not the old one.
    const replaceRoleKey = this._componentRoleFlagKey(system.id);
    if (replaceRoleKey) {
      if (previousSourceUuid && previousSourceUuid !== itemUuid) {
        await this._clearSourceFlag(previousSourceUuid, replaceRoleKey, itemId);
      }
      await this._stampSourceIdentity(source, replaceRoleKey, itemId);
    }
    await this.save();
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

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const sourceFallbacks = [];
    for (const item of items) {
      const uuid = `Compendium.${packId}.${item.id}`;
      const result = await this.addItemFromUuid(systemId, uuid);
      if (result.action === 'added') added++;
      else if (result.action === 'updated') updated++;
      else skipped++;
      if (Array.isArray(result.sourceFallbacks)) sourceFallbacks.push(...result.sourceFallbacks);
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
    const nextDescription = refreshDescription ? this._extractSourceDescription(item) : null;
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
        if (changed) updated++;
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
    await this.save();
    return system.components[idx];
  }

  async deleteItem(systemId, itemId) {
    this._assertGM('delete component');
    const system = this.getSystem(systemId);
    if (!system) throw new Error(`Crafting system not found: ${systemId}`);
    const removed = system.components.find((i) => i.id === itemId);
    const before = system.components.length;
    const filteredItems = system.components.filter((i) => i.id !== itemId);
    if (filteredItems.length === before) return false;
    system.components = filteredItems;

    // Clear essence source-item links that pointed to the deleted component.
    const essenceDefinitions = (system.essenceDefinitions || []).map((def) => ({
      ...def,
      originItemUuid: def.originItemUuid === itemId ? null : def.originItemUuid,
      associatedSystemItemId:
        def.associatedSystemItemId === itemId ? null : def.associatedSystemItemId,
    }));
    system.essenceDefinitions = essenceDefinitions;
    system.essences = essenceDefinitions.map((def) => def.id);

    // Remove item references from recipes in this system and clean up empty groups.
    // Only recipes that actually reference the deleted component are touched, so unrelated
    // recipes are not re-saved (and do not trigger notifications).
    const recipes = this.recipeManager
      .getRecipes({})
      .filter((r) => r.craftingSystemId === systemId && this._recipeReferencesComponent(r, itemId));
    let updatedRecipeCount = 0;
    for (const recipe of recipes) {
      const updated = recipe.toJSON();
      updated.ingredientSets = (updated.ingredientSets || [])
        .map((set) => ({
          ...set,
          ingredientGroups: (set.ingredientGroups || [])
            .map((group) => ({
              ...group,
              options: (group.options || []).filter(
                (ing) => getIngredientComponentId(ing) !== itemId
              ),
            }))
            .filter((group) => (group.options || []).length > 0),
          ingredients: (set.ingredients || []).filter(
            (ing) => (ing.componentId || ing.systemItemId) !== itemId
          ),
        }))
        .map((set) => ({
          ...set,
          ingredients: (set.ingredientGroups || [])
            .map((group) => group.options?.[0] || null)
            .filter(Boolean),
        }))
        .filter(
          (set) =>
            (set.ingredientGroups?.length || set.ingredients?.length || 0) > 0 ||
            Object.keys(set.essences || {}).length > 0
        );

      updated.resultGroups = (updated.resultGroups || [])
        .map((group) => ({
          ...group,
          results: (group.results || []).filter(
            (res) => (res.componentId || res.systemItemId) !== itemId
          ),
        }))
        .filter((group) => (group.results || []).length > 0);
      updated.results = (updated.results || []).filter(
        (res) => (res.componentId || res.systemItemId) !== itemId
      );

      const hasResults =
        (updated.resultGroups?.length || 0) > 0 || (updated.results?.length || 0) > 0;
      if (updated.ingredientSets.length === 0 || !hasResults) {
        updated.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, updated, {
        notify: false,
        allowIncomplete: true,
      });
      updatedRecipeCount += 1;
    }

    // Clean up salvage runs referencing the deleted component
    await this._cleanupSalvageRunsForComponent(itemId, systemId);

    await this.save();

    if (updatedRecipeCount > 0) {
      ui?.notifications?.info?.(
        `Removed "${removed?.name ?? 'component'}" and updated ${updatedRecipeCount} recipe(s).`
      );
    }

    await this._reconcileAlchemySignaturesAfterDeletion(system);

    return true;
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

    // Defensively strip the essence from any component that still carries it. The UI blocks
    // deleting an in-use essence, but the manager must not leave dangling component references.
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

      const hasResults =
        (updated.resultGroups?.length || 0) > 0 ||
        (updated.results?.length || 0) > 0 ||
        (updated.steps || []).some((step) => (step.resultGroups?.length || 0) > 0);
      const hasIngredientSets =
        (updated.ingredientSets?.length || 0) > 0 ||
        (updated.steps || []).some((step) => (step.ingredientSets?.length || 0) > 0);
      if (!hasIngredientSets || !hasResults) {
        updated.enabled = false;
      }

      await this.recipeManager.updateRecipe(recipe.id, updated, {
        notify: false,
        allowIncomplete: true,
      });
      updatedRecipeCount += 1;
    }

    await this.save();
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
   * Whether a recipe references the given component in any ingredient set or result.
   * Uses the same field matching as the strip logic in {@link deleteItem}.
   * @param {object} recipe
   * @param {string} itemId
   * @returns {boolean}
   */
  _recipeReferencesComponent(recipe, itemId) {
    const data = typeof recipe.toJSON === 'function' ? recipe.toJSON() : recipe;
    const matchesId = (ref) => getIngredientComponentId(ref) === itemId;

    for (const set of data.ingredientSets || []) {
      for (const group of set.ingredientGroups || []) {
        if ((group.options || []).some(matchesId)) return true;
      }
      if ((set.ingredients || []).some(matchesId)) return true;
    }
    for (const group of data.resultGroups || []) {
      if ((group.results || []).some(matchesId)) return true;
    }
    return (data.results || []).some(matchesId);
  }

  /**
   * Strip an essence from an ingredient-set array: remove the legacy per-set map key
   * AND any first-class essence OPTION (`match.type === 'essence'`) for that essence
   * from each group (dropping a group left with no options), then drop a set left with
   * no ingredient groups / ingredients / essences.
   * @param {object[]} sets
   * @param {string} essenceId
   * @returns {object[]}
   * @private
   */
  _stripEssenceFromSets(sets, essenceId) {
    return (sets || [])
      .map((set) => {
        const essences = { ...set.essences };
        delete essences[essenceId];
        const ingredientGroups = (set.ingredientGroups || [])
          .map((group) => ({
            ...group,
            options: (group.options || []).filter(
              (option) =>
                !(option?.match?.type === 'essence' && option.match.essenceId === essenceId)
            ),
          }))
          .filter((group) => (group.options?.length || 0) > 0);
        return { ...set, essences, ingredientGroups };
      })
      .filter(
        (set) =>
          (set.ingredientGroups?.length || set.ingredients?.length || 0) > 0 ||
          Object.keys(set.essences || {}).length > 0
      );
  }

  /**
   * Whether a recipe references the given essence in any ingredient set — via EITHER
   * the legacy per-set `essences` map (back-compat read) OR a first-class essence
   * ingredient OPTION (`match.type === 'essence'`) inside an ingredient group. Walks
   * both recipe-level and step-level ingredient sets.
   * @param {object} recipe
   * @param {string} essenceId
   * @returns {boolean}
   */
  _recipeReferencesEssence(recipe, essenceId) {
    const data = typeof recipe.toJSON === 'function' ? recipe.toJSON() : recipe;
    const sets = [
      ...(data.ingredientSets || []),
      ...(data.steps || []).flatMap((step) => step.ingredientSets || []),
    ];
    return sets.some((set) => {
      if (set.essences && essenceId in set.essences) return true;
      return (set.ingredientGroups || []).some((group) =>
        (group.options || []).some(
          (option) => option?.match?.type === 'essence' && option.match.essenceId === essenceId
        )
      );
    });
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
