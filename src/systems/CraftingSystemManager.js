/**
 * Manages crafting systems and their item libraries
 */
import { getCurrencyPresetsForAdapter } from '../config/currencyPresets.js';
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import {
  cleanupStalePreferences,
  isGatheringActorSelectableByUser,
} from '../config/preferencesCleanup.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import {
  TOOL_BREAKAGE_MODES as TOOL_BREAKAGE_MODE_LIST,
  TOOL_ON_BREAK_MODES as TOOL_ON_BREAK_MODE_LIST,
} from '../models/Tool.js';
import { normalizeCustomRecipeCategories } from '../utils/recipeCategories.js';
import {
  getSourceUuid,
  getComponentSourceReferences,
  getItemSourceReferences,
} from '../utils/sourceUuid.js';

import { normalizeCurrencyConfig } from './currencyProfile.js';
import { normalizeGatheringRealmList, normalizeGatheringRealmSettings } from './gatheringRealms.js';

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
    const rawManagedItems = Array.isArray(system.components)
      ? system.components
      : Array.isArray(system.managedItems)
        ? system.managedItems
        : system.items;
    const items = Array.isArray(rawManagedItems)
      ? rawManagedItems.map((i) => this._normalizeComponent(i, essenceIds, features.salvage))
      : [];
    const itemIds = new Set(items.map((i) => i.id));
    const itemById = new Map(items.map((i) => [i.id, i]));

    const resolvedEssenceDefinitions = essenceDefinitions.map((def) => {
      const sourceComponentId =
        def.sourceComponentId ||
        def.associatedSystemItemId ||
        (itemIds.has(def.sourceItemUuid) ? def.sourceItemUuid : null);
      const sourceComponent = sourceComponentId ? itemById.get(sourceComponentId) || null : null;
      const sourceItemUuid = sourceComponentId
        ? sourceComponent?.sourceItemUuid || sourceComponent?.sourceUuid || null
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
        return ['simple', 'mapped', 'tiered', 'routed', 'progressive', 'alchemy'].includes(raw)
          ? raw
          : 'simple';
      })(system.resolutionMode),
      // New spec-first shape
      features,
      itemTags: this._normalizeStringList(system.itemTags ?? system.tags),
      recipeVisibility: this._normalizeRecipeVisibility(system.recipeVisibility),
      requirements: this._normalizeRequirements(system.requirements),
      essenceDefinitions: resolvedEssenceDefinitions,
      recipeItemDefinitions,
      craftingCheck: this._normalizeCraftingCheck(system.craftingCheck),
      salvageResolutionMode: (function _normalizeSalvageResolutionMode(raw) {
        if (raw === 'tiered') return 'routed'; // legacy alias
        return ['simple', 'routed', 'progressive'].includes(raw) ? raw : 'simple';
      })(system.salvageResolutionMode),
      salvageCraftingCheck: this._normalizeSalvageCraftingCheck(system.salvageCraftingCheck),
      alchemy: this._normalizeAlchemyConfig(
        system.alchemy ?? system.cauldron,
        system.resolutionMode
      ),
      teaserConfig: this._normalizeTeaserConfig(system.teaserConfig),

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
      tools: Array.isArray(system.tools) ? system.tools.map((t) => this._normalizeTool(t)) : [],
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
    const label = typeof normalizedTool.label === 'string' ? normalizedTool.label.trim() : '';
    const componentId =
      typeof normalizedTool.componentId === 'string' && normalizedTool.componentId.trim()
        ? normalizedTool.componentId.trim()
        : null;
    return {
      id,
      label,
      enabled: normalizedTool.enabled !== false,
      componentId,
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
      salvage: has('salvage') ? features.salvage === true : false,
      chatOutput: has('chatOutput') ? features.chatOutput === true : true,
      itemPiles: has('itemPiles') ? features.itemPiles === true : false,
    };
  }

  _normalizeCraftingCheck(check = {}) {
    const mode =
      check?.mode === 'tiered' || check?.mode === 'namedOutcomes' ? 'namedOutcomes' : 'passFail';
    const outcomes = Array.isArray(check?.outcomes) ? check.outcomes : [];
    const normalizedOutcomes = outcomes
      .map((o) =>
        String(o || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    const checkSource = check?.checkSource === 'builtIn' ? 'builtIn' : 'macro';
    const builtIn = this._normalizeBuiltInCheck(check?.builtIn);

    return {
      enabled: check?.enabled === true || !!check?.macroUuid || checkSource === 'builtIn',
      mode,
      macroUuid: check?.macroUuid || null,
      successMacroUuid: check?.successMacroUuid || null,
      failureMacroUuid: check?.failureMacroUuid || null,
      checkSource,
      builtIn,
      consumption: {
        consumeIngredientsOnFail: check?.consumption?.consumeIngredientsOnFail !== false,
        consumeCatalystsOnFail: check?.consumption?.consumeCatalystsOnFail === true,
      },
      progressive: {
        awardMode: ['partial', 'equal', 'exceed'].includes(check?.progressive?.awardMode)
          ? check.progressive.awardMode
          : 'equal',
        allowPlayerReorder: check?.progressive?.allowPlayerReorder === true,
      },
      outcomes:
        normalizedOutcomes.length > 0
          ? [...new Set(normalizedOutcomes)]
          : mode === 'namedOutcomes'
            ? ['low', 'high']
            : ['fail', 'pass'],
    };
  }

  _normalizeBuiltInCheck(config = {}) {
    const dc = Number(config?.dc);
    return {
      ability: String(config?.ability || '')
        .trim()
        .toLowerCase(),
      skill: String(config?.skill || '')
        .trim()
        .toLowerCase(),
      dc: Number.isFinite(dc) && dc >= 1 ? Math.floor(dc) : 15,
      advantage: ['advantage', 'disadvantage', 'normal'].includes(config?.advantage)
        ? config.advantage
        : 'normal',
    };
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
      enabled: normalizedCheck.enabled === true || !!normalizedCheck.macroUuid,
      macroUuid: normalizedCheck.macroUuid || null,
      successMacroUuid: normalizedCheck.successMacroUuid || null,
      failureMacroUuid: normalizedCheck.failureMacroUuid || null,
      consumption: {
        consumeComponentOnFail: normalizedCheck.consumption?.consumeComponentOnFail !== false,
        consumeCatalystsOnFail: normalizedCheck.consumption?.consumeCatalystsOnFail === true,
      },
      progressive: {
        awardMode: ['partial', 'equal', 'exceed'].includes(normalizedCheck.progressive?.awardMode)
          ? normalizedCheck.progressive.awardMode
          : 'equal',
        allowPlayerReorder: normalizedCheck.progressive?.allowPlayerReorder === true,
      },
      outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
    };
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
        item: {
          limitUses: knowledge?.item?.limitUses === true,
          maxUses: Number.isFinite(Number(knowledge?.item?.maxUses))
            ? Number(knowledge.item.maxUses)
            : undefined,
          destroyWhenExhausted: knowledge?.item?.destroyWhenExhausted === true,
        },
        learn: {
          consumeOnLearn: knowledge?.learn?.consumeOnLearn !== false,
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
        enabled: time.enabled === true,
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
    const spendStrategy =
      currency?.spendStrategy ||
      (legacyAdapter === 'pf2e'
        ? 'actorInventory'
        : legacyAdapter === 'dnd5e'
          ? 'actorProperty'
          : undefined);
    return normalizeCurrencyConfig(
      {
        enabled: currency?.enabled === true,
        spendStrategy,
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

  _normalizeRecipeItemDefinition(entry, usedIds = new Set()) {
    if (!entry || typeof entry !== 'object') return null;

    let id = String(entry.id || '').trim();
    if (!id) id = foundry.utils.randomID();
    while (usedIds.has(id)) {
      id = foundry.utils.randomID();
    }

    const sourceItemUuid = String(entry.sourceItemUuid || '').trim() || null;
    return {
      id,
      name: String(entry.name || '').trim() || this._labelFromUuid(sourceItemUuid) || 'Recipe Item',
      description: this._normalizeComponentDescription(entry.description),
      img: String(entry.img || '').trim() || 'icons/svg/item-bag.svg',
      sourceItemUuid,
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
      sourceUuid: resolvedSourceData.currentUuid,
      sourceItemUuid: resolvedSourceData.canonicalUuid,
      fallbackItemIds: resolvedSourceData.fallbackItemIds,
      sourceFallbacks: resolvedSourceData.sourceFallbacks,
      references: resolvedSourceData.references,
    };
  }

  _buildRecipeItemSourceSnapshot(itemUuid, source = null, fallbackDefinition = null) {
    const sourceData = this._resolveImportedSourceData(itemUuid, source);
    const fallbackName = fallbackDefinition?.name || itemUuid?.split('.')?.pop() || 'Recipe Item';
    const fallbackImg = fallbackDefinition?.img || 'icons/svg/item-bag.svg';

    return {
      name: source?.name || fallbackName,
      img: source?.img || fallbackImg,
      description: source
        ? this._extractSourceDescription(source)
        : this._normalizeComponentDescription(fallbackDefinition?.description),
      sourceItemUuid: sourceData.canonicalUuid,
    };
  }

  _buildFallbackSourceReferences(
    item,
    nextSourceUuid,
    nextSourceItemUuid,
    additionalFallbacks = []
  ) {
    const fallbackSet = new Set(Array.isArray(item?.fallbackItemIds) ? item.fallbackItemIds : []);
    for (const ref of [item?.sourceUuid, item?.sourceItemUuid]) {
      if (ref) fallbackSet.add(ref);
    }
    for (const ref of Array.isArray(additionalFallbacks) ? additionalFallbacks : []) {
      if (ref) fallbackSet.add(ref);
    }
    fallbackSet.delete(nextSourceUuid);
    fallbackSet.delete(nextSourceItemUuid);
    return [...fallbackSet];
  }

  _normalizeComponent(item = {}, validEssenceIds = null, salvageEnabled = false) {
    const difficulty = Number(item.difficulty);
    const sourceItemUuid = item.sourceItemUuid || item.sourceUuid || null;
    const sourceUuid = item.sourceUuid || item.sourceItemUuid || null;
    const primaryRefs = new Set(
      [sourceUuid, sourceItemUuid].filter((ref) => typeof ref === 'string' && ref.trim())
    );
    const fallbackItemIds = Array.isArray(item.fallbackItemIds)
      ? [
          ...new Set(
            item.fallbackItemIds
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
      sourceItemUuid,
      // Transitional alias for current UI/engine references.
      sourceUuid,
      fallbackItemIds,
      tier: item.tier || null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      essences: this._normalizeEssenceQuantities(item.essences, validEssenceIds),
      difficulty:
        Number.isFinite(difficulty) && difficulty >= 1 ? Math.floor(difficulty) : undefined,
      ...(salvageEnabled ? { salvage: this._normalizeSalvage(item.salvage) } : {}),
    };
  }

  _normalizeSalvage(salvage = {}) {
    if (!salvage || typeof salvage !== 'object') {
      return {
        enabled: false,
        ingredientQuantity: 1,
        toolIds: [],
        resultGroups: [],
      };
    }

    const rawQty = Number(salvage.ingredientQuantity);
    const ingredientQuantity = Number.isFinite(rawQty) && rawQty >= 1 ? Math.floor(rawQty) : 1;

    return {
      enabled: salvage.enabled === true,
      ingredientQuantity,
      // Preserve migrated salvage tool references so they are not orphaned on the
      // next system save. Coerced to trimmed, non-empty, deduped id strings.
      toolIds: this._normalizeToolIds(salvage.toolIds),
      resultGroups: Array.isArray(salvage.resultGroups)
        ? salvage.resultGroups.map((g) => this._normalizeSalvageResultGroup(g)).filter(Boolean)
        : [],
      ...(salvage.outcomeRouting && typeof salvage.outcomeRouting === 'object'
        ? { outcomeRouting: { ...salvage.outcomeRouting } }
        : {}),
      ...(salvage.timeRequirement && typeof salvage.timeRequirement === 'object'
        ? { timeRequirement: this._normalizeTimeRequirement(salvage.timeRequirement) }
        : {}),
      ...(salvage.currencyRequirement && typeof salvage.currencyRequirement === 'object'
        ? { currencyRequirement: this._normalizeCurrencyRequirement(salvage.currencyRequirement) }
        : {}),
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
    return {
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
      const sourceUuid = item.sourceItemUuid || item.sourceUuid || '';
      const sourceOrigin = sourceUuid.startsWith('Compendium.')
        ? 'compendium'
        : sourceUuid.startsWith('Item.')
          ? 'items directory'
          : sourceUuid
            ? 'unknown'
            : '';
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.sourceUuid || '').toLowerCase().includes(q) ||
        (item.sourceItemUuid || '').toLowerCase().includes(q) ||
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
        definitions.filter((def) => def.sourceItemUuid).map((def) => [def.sourceItemUuid, def])
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
            this._buildRecipeItemSourceSnapshot(legacyUuid, source, {
              name: recipe?.name || 'Recipe Item',
              img: recipe?.img || 'icons/svg/item-bag.svg',
              description: recipe?.description || '',
            }),
            usedIds
          );
          if (!definition) continue;

          usedIds.add(definition.id);
          definitions.push(definition);
          if (definition.sourceItemUuid) {
            bySource.set(definition.sourceItemUuid, definition);
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

    const snapshot = this._buildRecipeItemSourceSnapshot(itemUuid, source);
    const existing = this._findRecipeItemDefinitionBySourceUuid(system, snapshot.sourceItemUuid);
    if (existing) {
      const unchanged =
        existing.name === snapshot.name &&
        existing.img === snapshot.img &&
        existing.description === snapshot.description &&
        existing.sourceItemUuid === snapshot.sourceItemUuid;

      if (unchanged) {
        return { item: existing, action: 'skipped' };
      }

      existing.name = snapshot.name;
      existing.img = snapshot.img;
      existing.description = snapshot.description;
      existing.sourceItemUuid = snapshot.sourceItemUuid;

      await this.save();
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

    await this.save();
    return { item, action: 'added' };
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
    const resolutionModeChanged = current.resolutionMode !== merged.resolutionMode;

    if (resolutionModeChanged) {
      const affectedRecipes = this.recipeManager.getRecipes({ craftingSystemId: systemId });
      for (const recipe of affectedRecipes) {
        await this.recipeManager.deleteRecipe(recipe.id);
      }
    }

    // Path 1: Mode change -- disable invalid salvage configs
    const oldMode = current.salvageResolutionMode || 'simple';
    const disabledComponents = this._disableInvalidSalvageConfigs(merged, oldMode);
    if (disabledComponents.length > 0) {
      const names = disabledComponents.join(', ');
      ui?.notifications?.warn?.(
        `Fabricate | Salvage disabled for ${disabledComponents.length} component(s) incompatible with new mode: ${names}`
      );
    }

    // Path 2: Feature disable -- clean up salvage run history
    const oldSalvageEnabled = current.features?.salvage === true;
    const newSalvageEnabled = merged.features?.salvage === true;
    if (oldSalvageEnabled && !newSalvageEnabled) {
      await this._cleanupSalvageRunsForSystem(systemId);
    }

    this.systems.set(systemId, merged);
    await this.save();
    this._notifySystemsChanged();
    if (resolutionModeChanged) {
      await this._cleanupCraftingPreferences();
    }
    return merged;
  }

  async deleteSystem(systemId) {
    this._assertGM('delete crafting system');
    const system = this.systems.get(systemId);
    if (!system) {
      throw new Error(`Crafting system not found: ${systemId}`);
    }

    // Delete recipes that belong to this crafting system.
    const affected = this.recipeManager.getRecipes({ craftingSystemId: systemId });
    for (const recipe of affected) {
      await this.recipeManager.deleteRecipe(recipe.id, { notify: false });
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
    ui?.notifications?.info?.(
      `Deleted crafting system "${system.name || systemId}" and ${relatedCount} related ${entityLabel}.`
    );
  }

  /**
   * Cascade cleanup across every persistent store keyed by `systemId`. Each
   * lookup is lazy and skips silently when the service is unavailable, so
   * tests constructing the manager without a `game.fabricate` registry stay
   * green. Recipe-keyed preferences (favourites, recent, discovery progress)
   * are orphaned via the prior recipe deletion and are not re-cleaned here.
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
    const item = this._normalizeComponent(data, validEssenceIds, system.features?.salvage === true);
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
    for (const ref of getItemSourceReferences(source)) {
      if (!references.includes(ref)) references.push(ref);
    }
    const currentUuid = references[0] || null;
    const canonicalUuid = getSourceUuid(source) || currentUuid;
    return { currentUuid, canonicalUuid, references };
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
   *   fallbackItemIds: string[],
   *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>
   * }>}
   */
  async _resolveImportedComponentSourceData(itemUuid, source = null) {
    const sourceData = this._resolveImportedSourceData(itemUuid, source);
    const sourceFallbacks = [];
    const fallbackItemIds = [];
    const recordedCanonicalUuid = getSourceUuid(source);
    const currentUuid = sourceData.currentUuid;
    if (!recordedCanonicalUuid || !currentUuid || recordedCanonicalUuid === currentUuid) {
      return { ...sourceData, fallbackItemIds, sourceFallbacks };
    }

    let canonicalSource;
    try {
      canonicalSource =
        typeof fromUuid === 'function' ? await fromUuid(recordedCanonicalUuid) : null;
    } catch {
      canonicalSource = null;
    }

    if (canonicalSource) {
      return { ...sourceData, fallbackItemIds, sourceFallbacks };
    }

    if (!sourceData.references.includes(recordedCanonicalUuid)) {
      sourceData.references.push(recordedCanonicalUuid);
    }
    fallbackItemIds.push(recordedCanonicalUuid);
    sourceFallbacks.push({
      itemName: source?.name || itemUuid?.split('.')?.pop() || 'Imported Item',
      brokenUuid: recordedCanonicalUuid,
      fallbackUuid: currentUuid,
    });
    return {
      ...sourceData,
      canonicalUuid: currentUuid,
      fallbackItemIds,
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
        return getComponentSourceReferences(item).some((ref) => claimedRefs.has(ref));
      }) || null
    );
  }

  _findRecipeItemDefinitionBySourceUuid(system, sourceItemUuid, excludeRecipeItemId = null) {
    if (!sourceItemUuid) return null;
    return (
      (system.recipeItemDefinitions || []).find((def) => {
        if (excludeRecipeItemId && def.id === excludeRecipeItemId) return false;
        return def.sourceItemUuid === sourceItemUuid;
      }) || null
    );
  }

  _getRecipeObjectsReferencingRecipeItemDefinition(systemId, definition) {
    if (!definition || !this.recipeManager?.getRecipes) return [];
    const definitionId = String(definition.id || '').trim();
    const sourceItemUuid = String(definition.sourceItemUuid || '').trim();

    return this.recipeManager.getRecipes({ craftingSystemId: systemId }).filter((recipe) => {
      const recipeItemId = String(recipe?.recipeItemId || '').trim();
      const linkedRecipeItemUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
      return (
        recipeItemId === definitionId ||
        (!recipeItemId && !!sourceItemUuid && linkedRecipeItemUuid === sourceItemUuid)
      );
    });
  }

  _assertUniqueComponentSources(system, item, excludeItemId = null) {
    const claimedRefs = getComponentSourceReferences(item);
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
      for (const ref of getComponentSourceReferences(component)) {
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
    const leftRefs = getComponentSourceReferences(left);
    const rightRefs = getComponentSourceReferences(right);
    return leftRefs.length === rightRefs.length && leftRefs.every((ref) => rightRefs.includes(ref));
  }

  /**
   * Add a crafting-system component from a Foundry item UUID.
   * Returns { item, action } where action is 'added', 'updated', or 'skipped'.
   *
   * Imports preserve both the live document UUID (`sourceUuid`) and the canonical
   * compendium/source UUID (`sourceItemUuid`) when Foundry exposes both.
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
        nextSnapshot.sourceUuid,
        nextSnapshot.sourceItemUuid,
        nextSnapshot.fallbackItemIds
      );
      const unchanged =
        existing.sourceUuid === nextSnapshot.sourceUuid &&
        existing.sourceItemUuid === nextSnapshot.sourceItemUuid &&
        existing.name === nextSnapshot.name &&
        existing.img === nextSnapshot.img &&
        existing.description === nextSnapshot.description &&
        nextFallbacks.length === (existing.fallbackItemIds || []).length &&
        nextFallbacks.every((ref) => (existing.fallbackItemIds || []).includes(ref));

      if (unchanged) {
        return { item: existing, action: 'skipped', sourceFallbacks: nextSnapshot.sourceFallbacks };
      }

      existing.name = nextSnapshot.name;
      existing.img = nextSnapshot.img;
      existing.description = nextSnapshot.description;
      existing.sourceUuid = nextSnapshot.sourceUuid;
      existing.sourceItemUuid = nextSnapshot.sourceItemUuid;
      existing.fallbackItemIds = nextFallbacks;

      await this.save();
      return { item: existing, action: 'updated', sourceFallbacks: nextSnapshot.sourceFallbacks };
    }

    // No match: create new component
    const validEssenceIds = new Set((system.essenceDefinitions || []).map((def) => def.id));
    const item = this._normalizeComponent(
      {
        ...nextSnapshot,
      },
      validEssenceIds,
      system.features?.salvage === true
    );

    this._assertUniqueComponentSources(system, item);
    system.components.push(item);
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
        fallbackItemIds: this._buildFallbackSourceReferences(
          existing,
          nextSnapshot.sourceUuid,
          nextSnapshot.sourceItemUuid,
          nextSnapshot.fallbackItemIds
        ),
        id: itemId,
      },
      validEssenceIds,
      system.features?.salvage === true
    );

    system.components[idx] = updatedItem;
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

    const itemRefs = new Set(getItemSourceReferences(item));
    if (itemRefs.size === 0) return { updated: 0 };

    const nextName = refreshName ? item?.name || changes.name || 'Unnamed Item' : null;
    const nextImg = refreshImg ? item?.img || changes.img || 'icons/svg/item-bag.svg' : null;
    const nextDescription = refreshDescription ? this._extractSourceDescription(item) : null;
    let updated = 0;

    for (const system of this.systems.values()) {
      const components = Array.isArray(system.components) ? system.components : [];
      for (const component of components) {
        const matches = getComponentSourceReferences(component).some((ref) => itemRefs.has(ref));
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
      validEssenceIds,
      system.features?.salvage === true
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
    const before = system.components.length;
    const filteredItems = system.components.filter((i) => i.id !== itemId);
    if (filteredItems.length === before) return false;
    system.components = filteredItems;

    // Clear essence source-item links that pointed to the deleted component.
    const essenceDefinitions = (system.essenceDefinitions || []).map((def) => ({
      ...def,
      sourceItemUuid: def.sourceItemUuid === itemId ? null : def.sourceItemUuid,
      associatedSystemItemId:
        def.associatedSystemItemId === itemId ? null : def.associatedSystemItemId,
    }));
    system.essenceDefinitions = essenceDefinitions;
    system.essences = essenceDefinitions.map((def) => def.id);

    // Remove item references from recipes in this system and clean up empty groups.
    const recipes = this.recipeManager
      .getRecipes({})
      .filter((r) => r.craftingSystemId === systemId);
    for (const recipe of recipes) {
      const updated = recipe.toJSON();
      updated.ingredientSets = (updated.ingredientSets || [])
        .map((set) => ({
          ...set,
          ingredientGroups: (set.ingredientGroups || [])
            .map((group) => ({
              ...group,
              options: (group.options || []).filter(
                (ing) =>
                  (ing.match?.type === 'component' || ing.match?.type === 'systemItem'
                    ? ing.match.componentId || ing.match.systemItemId
                    : ing.componentId || ing.systemItemId) !== itemId
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

      await this.recipeManager.updateRecipe(recipe.id, updated);
    }

    // Clean up salvage runs referencing the deleted component
    await this._cleanupSalvageRunsForComponent(itemId, systemId);

    await this.save();
    return true;
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
