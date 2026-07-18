import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import { itemMatchesRecipeItemSource, matchRecipeItemDefinition } from '../utils/sourceUuid.js';

import { evaluatePrerequisites } from './characterPrerequisites.js';
import { createDefaultPartyLearnPool } from './recipeItemPartyLearnPool.js';
import { computeSystemVisibility } from './systemValidation.js';

const LEARN_RECIPE_MESSAGES = {
  systemNotFound: 'FABRICATE.Knowledge.SystemNotFound',
  learningDisabled: 'FABRICATE.Knowledge.LearningDisabled',
  linkedItemRequired: 'FABRICATE.Knowledge.LinkedItemRequired',
  alreadyLearned: 'FABRICATE.Knowledge.AlreadyLearned',
  noMatchingItem: 'FABRICATE.Knowledge.NoMatchingItem',
  learnBudgetSpent: 'FABRICATE.Knowledge.LearnBudgetSpent',
  prerequisiteNotMet: 'FABRICATE.Knowledge.PrerequisiteNotMet',
  characterPrerequisiteNotMet: 'FABRICATE.Knowledge.CharacterPrerequisiteNotMet',
  learnedRecipe: 'FABRICATE.Knowledge.LearnedRecipe',
  learnedRecipes: 'FABRICATE.Knowledge.LearnedRecipes',
  learnedRecipesPartial: 'FABRICATE.Knowledge.LearnedRecipesPartial',
  noNewRecipesLearned: 'FABRICATE.Knowledge.NoNewRecipesLearned',
};

const VISIBILITY_MODES = ['global', 'restricted', 'item', 'knowledge'];

/**
 * Visibility, knowledge access, and learn-state service.
 */
export class RecipeVisibilityService {
  constructor(
    recipeManager,
    craftingSystemManager,
    partyLearnPool = createDefaultPartyLearnPool()
  ) {
    this.recipeManager = recipeManager;
    this.craftingSystemManager = craftingSystemManager;
    this._partyLearnPool = partyLearnPool;
  }

  _getCraftingSystem(recipe) {
    if (!recipe?.craftingSystemId) return null;
    return this.craftingSystemManager?.getSystem(recipe.craftingSystemId) || null;
  }

  // Resolve the flat system-level visibility mode (issue 511, PR-B). Prefers the new
  // `system.visibilityMode` enum; when absent (legacy world, or a raw fixture) it
  // derives one from the old `recipeVisibility.listMode` + `knowledge.mode`:
  //   global → global · player → restricted · knowledge+item → item ·
  //   knowledge+(learned|itemOrLearned) → knowledge · teaser → teaser (handled
  //   separately) · missing/unknown → global (the legacy default).
  _getVisibilityMode(system) {
    // Legacy teaser is not representable in the flat enum and keeps its own
    // teaserConfig-driven runtime, so a system still flagged `listMode: 'teaser'`
    // resolves to teaser regardless of the (possibly-defaulted) `visibilityMode`.
    // (The migration maps teaser → global for the authoring enum but preserves
    // teaserConfig — teaser retirement is a flagged product decision.)
    if (system?.recipeVisibility?.listMode === 'teaser') return 'teaser';

    const mode = system?.visibilityMode;
    if (VISIBILITY_MODES.includes(mode)) return mode;

    const listMode = system?.recipeVisibility?.listMode;
    if (listMode === 'player') return 'restricted';
    if (listMode === 'knowledge') {
      const knowledgeMode = system?.recipeVisibility?.knowledge?.mode || 'itemOrLearned';
      return knowledgeMode === 'item' ? 'item' : 'knowledge';
    }
    return 'global';
  }

  // Whether the system carries an authored flat `visibilityMode`. When it does, the
  // item/knowledge modes drive the knowledge sub-mode (item → 'item', knowledge →
  // 'itemOrLearned'); when it does not, the legacy `knowledge.mode` is honored as-is
  // so migrated 'learned' systems keep their learned-only semantics.
  _usesFlatVisibilityMode(system) {
    return VISIBILITY_MODES.includes(system?.visibilityMode);
  }

  // Whether a viewer may see a `restricted`-mode recipe. GM always; otherwise the
  // per-recipe `access` grant governs (a player id, or a character the viewer
  // controls). When `access` is absent (legacy recipe) fall back to the old
  // `visibility.restricted` / `allowedUserIds` player-list gate.
  _isRecipeVisibleByAccessGrant(recipe, viewer) {
    if (viewer?.isGM) return true;

    const access = recipe?.access;
    const hasAccess =
      access && (Array.isArray(access.playerIds) || Array.isArray(access.characterIds));
    if (hasAccess) {
      const playerIds = Array.isArray(access.playerIds) ? access.playerIds : [];
      if (playerIds.includes(viewer?.id)) return true;
      const characterIds = Array.isArray(access.characterIds) ? access.characterIds : [];
      return characterIds.some((actorId) => this._viewerControlsCharacter(viewer, actorId));
    }

    const visibility = recipe?.visibility || {};
    if (visibility.restricted !== true) return true;
    return (
      Array.isArray(visibility.allowedUserIds) && visibility.allowedUserIds.includes(viewer?.id)
    );
  }

  // Whether `viewer` controls the actor `actorId` — either it is their assigned
  // character, or they hold OWNER permission on it.
  _viewerControlsCharacter(viewer, actorId) {
    if (!viewer || !actorId) return false;
    if (viewer.character?.id === actorId) return true;
    const actor = globalThis.game?.actors?.get?.(actorId);
    return actor?.testUserPermission?.(viewer, 'OWNER') === true;
  }

  // The book/scroll definitions a recipe belongs to (issue 511 many-to-many). Canonical
  // read is each definition's `recipeIds[]`; a system with no membership authored yet
  // (fully un-migrated) falls back to the recipe's legacy single reverse ref. Returns a
  // SET — a recipe may live in several books, each with its own caps.
  _getRecipeItemDefinitions(recipe) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return [];
    const definitions = system.recipeItemDefinitions || [];
    const rid = String(recipe?.id || '');

    const byMembership = definitions.filter((def) =>
      (Array.isArray(def.recipeIds) ? def.recipeIds : []).some((id) => String(id) === rid)
    );
    if (byMembership.length > 0) return byMembership;

    // Only fall back when NO book in the system carries membership yet.
    const anyMigrated = definitions.some(
      (def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0
    );
    if (anyMigrated) return [];

    const recipeItemId = String(recipe?.recipeItemId || '').trim();
    if (recipeItemId) {
      const def = definitions.find((d) => String(d.id) === recipeItemId);
      return def ? [def] : [];
    }
    const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
    if (legacyUuid) {
      const def = definitions.find((d) => String(d.originItemUuid || '') === legacyUuid);
      return def ? [def] : [];
    }
    return [];
  }

  // A single representative definition (the recipe's first member book) — used for
  // system-wide defaults/previews. Learn/use paths anchor caps on the SELECTED book via
  // `_matchDefinitionForItem`, not this.
  _getRecipeItemDefinition(recipe) {
    return this._getRecipeItemDefinitions(recipe)[0] || null;
  }

  // Every source uuid that identifies one of the recipe's member books.
  _getRecipeItemSourceUuids(recipe) {
    const uuids = new Set();
    for (const def of this._getRecipeItemDefinitions(recipe)) {
      const src = String(def?.originItemUuid || '').trim();
      if (src) uuids.add(src);
    }
    const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
    if (legacyUuid) uuids.add(legacyUuid);
    return uuids;
  }

  _getRecipeItemSourceUuid(recipe) {
    return (
      this._getRecipeItemDefinition(recipe)?.originItemUuid || recipe?.linkedRecipeItemUuid || null
    );
  }

  _hasRecipeItemReference(recipe) {
    return (
      this._getRecipeItemDefinitions(recipe).length > 0 ||
      Boolean(recipe?.recipeItemId) ||
      Boolean(recipe?.linkedRecipeItemUuid)
    );
  }

  // Member book definitions plus a synthetic entry for a recipe's legacy
  // `linkedRecipeItemUuid`, so an un-migrated recipe that carries only the old
  // single reverse ref (no authored definition) still resolves by its source
  // pointer. The synthetic entry has no `id`, so it can only match the source-uuid
  // tiers of the shared matcher, never the durable identity tier.
  _recipeItemMatchDefinitions(recipe) {
    const defs = this._getRecipeItemDefinitions(recipe);
    const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
    if (!legacyUuid) return defs;
    if (defs.some((def) => String(def?.originItemUuid || '').trim() === legacyUuid)) return defs;
    return [...defs, { id: null, originItemUuid: legacyUuid }];
  }

  // Resolve which member book an item IS, AND by which tier, through the one shared,
  // system-scoped matcher (durable per-system `roles` leaf → legacy scalar → own uuid →
  // compendium source → duplicate source). The recipe's `craftingSystemId` scopes the
  // durable-identity tier (issue 567). An id-less legacy synthetic entry still matches only
  // the source-uuid tiers regardless of systemId, so legacy/alchemy links keep resolving.
  _matchRecipeItemForRecipe(recipe, item) {
    return matchRecipeItemDefinition(
      item,
      this._recipeItemMatchDefinitions(recipe),
      recipe?.craftingSystemId
    );
  }

  _isMatchingRecipeItem(recipe, item) {
    if (!item) return false;
    // A recipe matches when the item IS any of its member books, by any tier.
    return itemMatchesRecipeItemSource(
      item,
      this._recipeItemMatchDefinitions(recipe),
      recipe?.craftingSystemId
    );
  }

  // The member book definition that a specific owned item IS, so the learn/use paths
  // read caps from the book actually being read. A SUPPLIED item that matches no
  // member definition resolves to null (uncapped) — only an ABSENT item falls back
  // to the recipe's first member book (issue 555, R6b). `craftingSystemId` scopes the
  // durable-identity tier (issue 567).
  _matchDefinitionForItem(recipe, item) {
    const defs = this._getRecipeItemDefinitions(recipe);
    if (!item) return defs[0] || null;
    return matchRecipeItemDefinition(item, defs, recipe?.craftingSystemId).definition;
  }

  _isActorOwnedItem(ownedItem, actor) {
    if (!ownedItem || !actor) return false;
    return (
      ownedItem.parent === actor ||
      ownedItem.actor === actor ||
      actor.items?.has?.(ownedItem.id) ||
      (Array.isArray(actor.items) && actor.items.includes(ownedItem))
    );
  }

  _getLearnedMap(actor) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', {});
    return learned && typeof learned === 'object' ? learned : {};
  }

  async _setLearnedMap(actor, learned) {
    return await setFabricateFlag(actor, 'learnedRecipes', learned);
  }

  _getRecipeItemUsage(item) {
    const usage = getFabricateFlag(item, 'recipeItemUsage', {});
    return Number(usage?.timesUsed || 0);
  }

  async _setRecipeItemUsage(item, timesUsed) {
    await setFabricateFlag(item, 'recipeItemUsage', {
      timesUsed: Math.max(0, Math.floor(timesUsed)),
    });
  }

  // Mark a spent item-charge document 'inert' (issue 511, PR-B `whenSpent: 'inert'`):
  // keep the item but record its exhaustion so it stops granting craftability. The
  // usage count is written alongside the flag so `_filterNonExhausted` still excludes
  // it via `timesUsed >= maxUses`.
  async _markRecipeItemInert(item, timesUsed) {
    await setFabricateFlag(item, 'recipeItemUsage', {
      timesUsed: Math.max(0, Math.floor(timesUsed)),
      inert: true,
    });
  }

  // The learning-limit SCOPE for a recipe's linked recipe item: 'perInstance' (the
  // cap applies to each physical copy of the item) or 'total' (one shared world pool
  // across every copy of the source item).
  _getRecipeItemLearnScope(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    return this._getRecipeItemCaps(recipe, definition).learn.learnScope || 'perInstance';
  }

  // The recipeIds a reader must already have learned before this recipe (issue 544 —
  // Required Knowledge, AND semantics). Empty when none are required.
  _getRecipeItemPrerequisiteIds(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    const ids = this._getRecipeItemCaps(recipe, definition).learn.prerequisiteIds;
    return Array.isArray(ids) ? ids : [];
  }

  // True when a Required-Knowledge id still resolves to an existing recipe in the
  // world. A dangling id (its recipe was deleted) is treated as removed so the gate
  // fails OPEN, mirroring the character-prerequisite gate (issue 544). Resolves via
  // `getRecipe` when the manager exposes it, else scans `getRecipes()`.
  _recipeExists(id) {
    if (typeof this.recipeManager?.getRecipe === 'function') {
      return this.recipeManager.getRecipe(id) != null;
    }
    const all = this.recipeManager?.getRecipes?.() || [];
    return all.some((candidate) => String(candidate?.id) === String(id));
  }

  // A reader satisfies a recipe's Required Knowledge when Limited learning is OFF (the
  // gate is not enforced then — issue 544), or when the actor has already learned
  // EVERY still-existing required recipe. An empty requirement is always met, and a
  // prerequisite id whose recipe was deleted is skipped (fail-open) rather than
  // permanently bricking the book.
  _isPrerequisiteMet(recipe, actor, definition = this._getRecipeItemDefinition(recipe)) {
    if (this._getRecipeItemCaps(recipe, definition).learn.limitLearning !== true) return true;
    const ids = this._getRecipeItemPrerequisiteIds(recipe, definition);
    if (ids.length === 0) return true;
    const learned = this._getLearnedMap(actor);
    return ids.filter((id) => this._recipeExists(id)).every((id) => !!learned?.[id]);
  }

  // The character-prerequisite ids a reader must ALL pass to learn a recipe from
  // this book (issue 544) — references into `system.characterPrerequisites`. Read
  // straight off the definition's caps (the runtime `_getRecipeItemCaps` reader
  // rebuilds only the legacy cap fields and does not surface this list).
  _getRecipeItemCharacterPrerequisiteIds(
    recipe,
    definition = this._getRecipeItemDefinition(recipe)
  ) {
    const ids = definition?.caps?.learn?.characterPrerequisiteIds;
    return Array.isArray(ids) ? ids : [];
  }

  // Evaluate the recipe's character-prerequisite learning gate against the acting
  // actor's prepared roll data (AND semantics). A prerequisite id that no longer
  // resolves to a system definition is skipped (fail-open — a deleted definition
  // removes its gate). `rollData` is resolved once here when omitted; pass it in
  // to avoid rebuilding it per recipe in a bulk loop.
  _meetsCharacterPrerequisites(
    recipe,
    actor,
    definition = this._getRecipeItemDefinition(recipe),
    rollData
  ) {
    // The learning prerequisites gate only applies when Limited learning is ON
    // (issue 544) — off means learn freely, neither gate enforced.
    if (this._getRecipeItemCaps(recipe, definition).learn.limitLearning !== true) {
      return { met: true, reason: '' };
    }
    const ids = this._getRecipeItemCharacterPrerequisiteIds(recipe, definition);
    if (ids.length === 0) return { met: true, reason: '' };
    const definitions = this._getCraftingSystem(recipe)?.characterPrerequisites;
    const byId = new Map(
      (Array.isArray(definitions) ? definitions : []).map((def) => [def.id, def])
    );
    const selected = ids.map((id) => byId.get(id)).filter(Boolean);
    if (selected.length === 0) return { met: true, reason: '' };
    const data = rollData ?? actor?.getRollData?.() ?? {};
    const { passed, failures } = evaluatePrerequisites(data, selected);
    return {
      met: passed,
      reason: failures
        .map((failure) => failure.name || failure.preview)
        .filter(Boolean)
        .join(', '),
    };
  }

  // The shared-pool key for a `total`-scope recipe item — system + book-definition
  // scoped, so distinct books (and distinct systems) keep independent shared budgets.
  _partyLearnPoolKey(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    const system = this._getCraftingSystem(recipe);
    const itemKey =
      definition?.id || recipe?.recipeItemId || recipe?.linkedRecipeItemUuid || 'unknown';
    return `${system?.id || 'unknown'}::${itemKey}`;
  }

  // Per item-DOCUMENT-instance learn count for the recipe-item learn cap (issue
  // 511). Mirrors `recipeItemUsage.timesUsed` (`_getRecipeItemUsage` /
  // `_setRecipeItemUsage`): the count lives on the physical item document, so a
  // stacked qty>1 document shares one count, the budget accumulates across every
  // actor that holds the document, and it is not reset on transfer/ownership
  // change (the flag travels with the item data).
  _getRecipeItemLearnCount(item) {
    const learning = getFabricateFlag(item, 'recipeItemLearning', {});
    return Number(learning?.learnedCount || 0);
  }

  async _setRecipeItemLearnCount(item, learnedCount) {
    await setFabricateFlag(item, 'recipeItemLearning', {
      learnedCount: Math.max(0, Math.floor(learnedCount)),
    });
  }

  _getKnowledgeConfig(system) {
    return (
      system?.recipeVisibility?.knowledge || {
        mode: 'itemOrLearned',
        learn: { dragDropEnabled: true },
      }
    );
  }

  // Per-recipe-item use/learn caps (issue 511). Caps live on the recipe's linked
  // recipe item definition (`definition.caps`) rather than one system-wide config,
  // so two books in the same system can differ. Resolves via the recipe's
  // `recipeItemId`; a recipe with no resolvable definition FAILS CLOSED to uncapped
  // (the same permissive default `_getKnowledgeConfig` fell back to, and consistent
  // with the invalid-cap → unlimited convention). `mode` and `dragDropEnabled` stay
  // system-wide and are read from `_getKnowledgeConfig`, never from here.
  _getRecipeItemCaps(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    const caps = definition?.caps;
    const item = caps?.item || {};
    const learn = caps?.learn || {};

    // whenSpent (new) — prefer the authored enum; otherwise derive from the legacy
    // `destroyWhenExhausted` boolean (true → 'destroyed', absent/false → 'inert')
    // so an un-migrated raw cap keeps its old runtime behaviour (no delete).
    const whenSpent =
      item.whenSpent === 'destroyed' || item.whenSpent === 'inert'
        ? item.whenSpent
        : item.destroyWhenExhausted === true
          ? 'destroyed'
          : 'inert';

    // limitLearning / learnsAllowed / learningMode / prerequisite (new) — prefer the
    // new fields, else derive from the legacy limitRecipes/maxRecipes pair.
    const limitLearning =
      learn.limitLearning === true ||
      (learn.limitLearning === undefined && learn.limitRecipes === true);
    const rawLearns = learn.learnsAllowed === undefined ? learn.maxRecipes : learn.learnsAllowed;
    const learnsAllowed = Number.isFinite(Number(rawLearns)) ? Number(rawLearns) : undefined;
    // `learnScope` ('perInstance' | 'total') — prefer the new field, else derive from
    // the legacy `learningMode` ('party' → total shared world pool, else per-copy).
    const learnScope = ['perInstance', 'total'].includes(learn.learnScope)
      ? learn.learnScope
      : learn.learningMode === 'party'
        ? 'total'
        : 'perInstance';
    const learningMode =
      learnScope === 'total' ? 'party' : Number(learnsAllowed) > 1 ? 'ntimes' : 'once';
    // `prerequisiteIds` (issue 544) — recipes the reader must already know (AND).
    // Prefer the array; fold the legacy single `prerequisite` string for un-migrated
    // caps. Trim/String/dedupe to a clean id array.
    const rawPrerequisiteIds = Array.isArray(learn.prerequisiteIds)
      ? learn.prerequisiteIds
      : learn.prerequisite
        ? [learn.prerequisite]
        : [];
    const prerequisiteIds = [
      ...new Set(rawPrerequisiteIds.map((value) => String(value ?? '').trim()).filter(Boolean)),
    ];

    return {
      item: {
        limitUses: item.limitUses === true,
        maxUses: item.maxUses,
        destroyWhenExhausted: item.destroyWhenExhausted === true,
        whenSpent,
      },
      learn: {
        consumeOnLearn: learn.consumeOnLearn !== false,
        // Legacy cap fields kept in sync with the new ones so the existing learn-cap
        // helpers (`_getLearnCapForRecipe`, `_isRecipeItemLearnCapped`) transparently
        // honor a book authored with only the new `limitLearning`/`learnsAllowed`.
        limitRecipes: limitLearning,
        maxRecipes: learnsAllowed,
        destroyWhenSpent: learn.destroyWhenSpent === true,
        limitLearning,
        learnsAllowed,
        learnScope,
        learningMode,
        prerequisiteIds,
      },
    };
  }

  _collectCandidateItems(recipe, craftingActor, componentSourceActors = []) {
    const actors = [];
    if (craftingActor) actors.push(craftingActor);
    for (const actor of componentSourceActors || []) {
      if (!actor) continue;
      if (actors.some((a) => a.id === actor.id)) continue;
      actors.push(actor);
    }

    const matched = [];
    for (const [actorIdx, actor] of actors.entries()) {
      const items = [...(actor.items || [])];
      for (const [itemIdx, item] of items.entries()) {
        if (!this._isMatchingRecipeItem(recipe, item)) continue;
        matched.push({
          actor,
          item,
          actorOrder: actorIdx,
          itemOrder: itemIdx,
          timesUsed: this._getRecipeItemUsage(item),
        });
      }
    }
    return matched;
  }

  _filterNonExhausted(matches, knowledgeItemCfg = {}) {
    if (!knowledgeItemCfg?.limitUses) return matches;
    const maxUses = Number(knowledgeItemCfg?.maxUses);
    if (!Number.isFinite(maxUses) || maxUses <= 0) return matches;
    return matches.filter((entry) => Number(entry.timesUsed || 0) < maxUses);
  }

  _selectDeterministic(matches) {
    const sorted = [...matches].sort((a, b) => {
      const byUsage = Number(b.timesUsed || 0) - Number(a.timesUsed || 0);
      if (byUsage !== 0) return byUsage;
      const byActor = Number(a.actorOrder) - Number(b.actorOrder);
      if (byActor !== 0) return byActor;
      return Number(a.itemOrder) - Number(b.itemOrder);
    });
    return sorted[0] || null;
  }

  /**
   * Evaluate whether a viewer has knowledge access to a recipe.
   *
   * GM bypass: a GM is always granted access (`reason: 'gm'`). The returned
   * `hasLearned: true` / `hasMatchedItem: true` flags signal "access is always
   * granted for a GM" — they do NOT represent the GM actor's actual learned
   * state or item ownership, and `matchedItems` is intentionally left empty
   * because no real items are collected on this path. Callers that need the
   * actual set of owned, matching recipe items (e.g. `learnRecipe` selecting an
   * item to consume, or `applyRecipeItemUseOnCraft` deciding whether to track a
   * use) must NOT read `matchedItems` from this result for a GM; they must
   * collect candidate items directly via `_collectCandidateItems` /
   * `_filterNonExhausted` so they react to what the actor really owns.
   */
  evaluateKnowledgeAccess({
    recipe,
    viewer,
    craftingActor,
    componentSourceActors = [],
    knowledgeMode = null,
  }) {
    const system = this._getCraftingSystem(recipe);
    const knowledge = this._getKnowledgeConfig(system);
    if (viewer?.isGM) {
      return {
        granted: true,
        reason: 'gm',
        hasLearned: true,
        hasMatchedItem: true,
        matchedItems: [],
      };
    }

    const caps = this._getRecipeItemCaps(recipe);
    const learnedMap = this._getLearnedMap(craftingActor);
    const hasLearned = !!learnedMap?.[recipe.id];
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const matchedItems = this._filterNonExhausted(allMatches, caps.item);
    const hasMatchedItem = matchedItems.length > 0;

    // A caller may force the knowledge sub-mode (the flat `item`/`knowledge`
    // visibility modes do this); otherwise honor the system's legacy `knowledge.mode`.
    const mode = knowledgeMode || knowledge?.mode || 'itemOrLearned';
    let granted = false;
    if (mode === 'item') granted = hasMatchedItem;
    if (mode === 'learned') granted = hasLearned;
    if (mode === 'itemOrLearned') granted = hasMatchedItem || hasLearned;

    return {
      granted,
      reason: granted ? 'ok' : 'knowledge',
      hasLearned,
      hasMatchedItem,
      matchedItems,
    };
  }

  /**
   * Whether a recipe's item-based knowledge is exhausted for a viewer: the
   * system uses item-limited knowledge (`knowledge.item.limitUses`), the actor
   * (or a component-source actor) DOES own at least one matching recipe item, but
   * every such item has reached its `maxUses` cap. Returns `false` when the
   * system does not limit uses, when no matching item is owned at all (that is an
   * "unknown"/teaser state, not "exhausted"), or when at least one non-exhausted
   * item remains. Read-only; composes the same candidate-collection +
   * non-exhausted filter the learn/use paths rely on, so the player listing's
   * "exhausted" status agrees with what the engine would refuse to consume.
   *
   * @param {object} args
   * @param {object} args.recipe
   * @param {object|null} args.craftingActor
   * @param {object[]} [args.componentSourceActors]
   * @returns {boolean}
   */
  isKnowledgeItemExhausted({ recipe, craftingActor, componentSourceActors = [] }) {
    const caps = this._getRecipeItemCaps(recipe);
    if (!caps.item.limitUses) return false;
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    if (allMatches.length === 0) return false;
    const nonExhausted = this._filterNonExhausted(allMatches, caps.item);
    return nonExhausted.length === 0;
  }

  _getDiscoveryProgress(actor, recipeId) {
    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const entry = all?.[recipeId];
    if (!entry || typeof entry !== 'object') {
      return { progress: 0, fragments: [], discoveredAt: null, manuallySet: false };
    }
    return {
      progress: Number(entry.progress || 0),
      fragments: Array.isArray(entry.fragments) ? entry.fragments : [],
      discoveredAt: entry.discoveredAt || null,
      manuallySet: entry.manuallySet === true,
    };
  }

  _computeEffectiveProgress(actor, recipeId, system) {
    const stored = this._getDiscoveryProgress(actor, recipeId);
    const fragments = system?.teaserConfig?.fragments || [];
    let fragmentProgress = 0;
    for (const frag of fragments) {
      if (!Array.isArray(frag.recipeIds) || !frag.recipeIds.includes(recipeId)) continue;
      if (stored.fragments.includes(frag.id)) {
        fragmentProgress += Number(frag.progressValue || 0);
      }
    }
    return Math.min(100, stored.progress + fragmentProgress);
  }

  _evaluateTeaserAccess({ recipe, viewer, craftingActor, system }) {
    // GM sees everything fully
    if (viewer?.isGM) {
      return { visible: true, craftable: true, reason: 'ok' };
    }

    // Recipe opts out of teaser mode — fully visible
    if (recipe?.teaser?.enabled === false) {
      return { visible: true, craftable: true, reason: 'ok' };
    }

    const progress = this._computeEffectiveProgress(craftingActor, recipe.id, system);
    const threshold = recipe?.teaser?.revealThreshold ?? 100;
    const hiddenFields = recipe?.teaser?.hiddenFields ?? ['ingredients', 'results', 'description'];
    const teaserDescription = recipe?.teaser?.teaserDescription ?? '';

    const stored = this._getDiscoveryProgress(craftingActor, recipe.id);
    const isDiscovered = stored.discoveredAt !== null || progress >= threshold;

    if (isDiscovered) {
      return {
        visible: true,
        craftable: true,
        reason: 'teaser-discovered',
      };
    }

    return {
      visible: true,
      craftable: false,
      reason: 'teaser',
      teaserState: {
        isTeaser: true,
        progress,
        hiddenFields,
        teaserDescription,
      },
    };
  }

  async discoverFragment(actor, fragmentId, system) {
    const fragments = system?.teaserConfig?.fragments || [];
    const fragment = fragments.find((f) => f.id === fragmentId);
    if (!fragment) return;

    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const updated = { ...all };

    for (const recipeId of fragment.recipeIds || []) {
      const entry = updated[recipeId] || {
        progress: 0,
        fragments: [],
        discoveredAt: null,
        manuallySet: false,
      };

      // Idempotent — skip if already discovered this fragment
      if (entry.fragments.includes(fragmentId)) continue;

      const newFragments = [...entry.fragments, fragmentId];
      const newProgress = entry.progress; // manual progress unchanged

      // Compute total including all fragment contributions
      let totalFragmentProgress = 0;
      for (const frag of fragments) {
        if (!frag.recipeIds?.includes(recipeId)) continue;
        if (newFragments.includes(frag.id)) {
          totalFragmentProgress += Number(frag.progressValue || 0);
        }
      }
      const effectiveProgress = Math.min(100, newProgress + totalFragmentProgress);

      // Check if this discovery causes auto-transition
      let discoveredAt = entry.discoveredAt;
      if (!discoveredAt) {
        const recipe = this.recipeManager.getRecipe?.(recipeId);
        const threshold = recipe?.teaser?.revealThreshold ?? 100;
        if (effectiveProgress >= threshold) {
          discoveredAt = Date.now();
        }
      }

      updated[recipeId] = {
        ...entry,
        fragments: newFragments,
        discoveredAt,
      };
    }

    await setFabricateFlag(actor, 'discoveryProgress', updated);
  }

  async setDiscoveryProgress(actor, recipeId, progress) {
    const all = getFabricateFlag(actor, 'discoveryProgress', {});
    const entry = all?.[recipeId] || {
      progress: 0,
      fragments: [],
      discoveredAt: null,
      manuallySet: false,
    };
    const clampedProgress = Math.min(100, Math.max(0, Number(progress) || 0));

    const updated = {
      ...all,
      [recipeId]: {
        ...entry,
        progress: clampedProgress,
        manuallySet: true,
      },
    };

    await setFabricateFlag(actor, 'discoveryProgress', updated);
  }

  getDiscoveryProgressForActor(actor, _systemId) {
    return getFabricateFlag(actor, 'discoveryProgress', {}) || {};
  }

  /**
   * Evaluate visibility + craftability for a single recipe.
   *
   * Non-alchemy modes GATE: `visible` follows the resolved `visibilityMode`
   * (`global` / `restricted` / `item` / `knowledge` / `teaser`), and `craftable`
   * additionally requires knowledge/unlocked/access to pass — `reason` is one of
   * `ok` / `visibility` / `knowledge` / `locked` / `teaser` / `teaser-discovered` /
   * `missing-system`.
   *
   * Alchemy mode is REVEAL-not-gate: `visibilityMode` selects only which source
   * REVEALS a recipe in the player's Known list, and brewing is NEVER gated by
   * visibility, so a non-GM alchemy recipe is ALWAYS `craftable: true` (a matched
   * ingredient signature is the sole brew gate). Reveal governs only `visible`, per
   * mode for a non-GM: `global` reveals brew-discovered (`learnedRecipes`) recipes;
   * `item` reveals a linked book/scroll held on the crafting actor or a component
   * source (computed synchronously from live `actor.items`, so a dropped book
   * un-reveals on the next build with no flag write); `knowledge` reveals a recipe
   * learned via the Inventory learn path; `restricted` (surfaced as "Manual" for
   * alchemy) reveals via the per-recipe access grant. Discovery-by-brew reveal is
   * unioned across ALL modes, and `learnOnCraft` governs ONLY whether a matched
   * brew writes that union — never whether anything is revealed. The alchemy reason
   * taxonomy is `gm`, `alchemy-revealed`, and `alchemy-unrevealed`.
   *
   * @param {object} params
   * @param {object} params.recipe
   * @param {object} params.viewer - The viewing user (`isGM` short-circuits to full access).
   * @param {object} [params.craftingActor]
   * @param {object[]} [params.componentSourceActors]
   * @returns {{ visible: boolean, craftable: boolean, reason: string, knowledge?: object }}
   */
  evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) {
      return { visible: false, craftable: false, reason: 'missing-system' };
    }

    // Alchemy mode: REVEAL-not-gate. `visibilityMode` selects which source(s)
    // REVEAL a recipe in the player's Known list, but brewing is NEVER gated by
    // visibility — a matched ingredient signature is the sole brew gate. So a
    // non-GM alchemy recipe is ALWAYS `craftable: true`; reveal governs only
    // `visible`. This synchronous branch reads live `actor.items` (no fromUuid /
    // async), recomputed per build, so a dropped book un-reveals on the next build
    // with no flag write.
    if (system?.resolutionMode === 'alchemy') {
      if (viewer?.isGM) {
        return { visible: true, craftable: true, reason: 'gm', knowledge: null };
      }
      const alchemyCfg = system?.alchemy || {};
      const mode = this._getVisibilityMode(system);
      const learnedMap = this._getLearnedMap(craftingActor);

      // Discovery-by-brew reveal is unioned across ALL modes: a matched-signature
      // brew writes `learnedRecipes` only when `learnOnCraft` is on, and any such
      // learned recipe is revealed regardless of the mode's own reveal source.
      const brewDiscovered = alchemyCfg.learnOnCraft === true && Boolean(learnedMap?.[recipe.id]);

      let knowledge = null;
      let revealedByMode = false;
      switch (mode) {
        case 'restricted': {
          // Manual (alchemy's display name for `restricted`): a per-recipe access
          // grant reveals the recipe to the granted viewer.
          revealedByMode = this._isRecipeVisibleByAccessGrant(recipe, viewer);
          break;
        }
        case 'item': {
          // A linked book/scroll HELD on the crafting actor or a component source
          // reveals the recipe (ephemeral — follows possession).
          if (this._hasRecipeItemReference(recipe)) {
            knowledge = this.evaluateKnowledgeAccess({
              recipe,
              viewer,
              craftingActor,
              componentSourceActors,
              knowledgeMode: 'item',
            });
            revealedByMode = knowledge.hasMatchedItem;
          }
          break;
        }
        default: {
          // `global` and `knowledge` both reveal from the SAME `learnedRecipes`
          // read (one code path, not two) — they differ only in how it is populated
          // (global: brew-discovery; knowledge: the Inventory learn path). Existing
          // worlds seeded `knowledge` therefore keep their learned-only semantics.
          revealedByMode = Boolean(learnedMap?.[recipe.id]);
        }
      }

      const visible = revealedByMode || brewDiscovered;
      return {
        visible,
        craftable: true,
        reason: visible ? 'alchemy-revealed' : 'alchemy-unrevealed',
        knowledge,
      };
    }

    const mode = this._getVisibilityMode(system);
    let visible;
    let knowledge = null;

    // Teaser mode: handled separately (legacy `recipeVisibility.listMode === 'teaser'`).
    if (mode === 'teaser') {
      return this._evaluateTeaserAccess({ recipe, viewer, craftingActor, system });
    }

    // A GM sees every non-teaser recipe; otherwise gate on the resolved mode.
    if (viewer?.isGM) {
      visible = true;
    } else {
      switch (mode) {
        case 'restricted': {
          visible = this._isRecipeVisibleByAccessGrant(recipe, viewer);
          break;
        }
        case 'item':
        case 'knowledge': {
          // `item` → item-only knowledge access; `knowledge` → item-or-learned.
          // Only force the sub-mode when the flat `visibilityMode` is authored;
          // legacy systems keep their own `knowledge.mode` (so 'learned' stays
          // learned-only).
          const knowledgeMode = this._usesFlatVisibilityMode(system)
            ? mode === 'item'
              ? 'item'
              : 'itemOrLearned'
            : null;
          knowledge = this.evaluateKnowledgeAccess({
            recipe,
            viewer,
            craftingActor,
            componentSourceActors,
            knowledgeMode,
          });
          visible = knowledge.granted || knowledge.hasMatchedItem;
          break;
        }
        default: {
          // `global` (and any unknown mode) → visible to all players.
          visible = true;
        }
      }
    }

    if (!visible) {
      return {
        visible: false,
        craftable: false,
        reason: knowledge ? 'knowledge' : 'visibility',
        knowledge,
      };
    }

    if (!viewer?.isGM && recipe.locked) {
      return { visible: true, craftable: false, reason: 'locked', knowledge };
    }

    if (knowledge && !knowledge.granted) {
      return { visible: true, craftable: false, reason: 'knowledge', knowledge };
    }

    return { visible: true, craftable: true, reason: 'ok', knowledge };
  }

  getVisibleRecipes({ viewer, craftingSystemId, craftingActor, componentSourceActors = [] }) {
    const recipes = this.recipeManager.getRecipes({
      enabled: true,
      craftingSystemId,
    });

    return recipes
      .map((recipe) => ({
        recipe,
        access: this.evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors }),
      }))
      .filter((entry) => entry.access.visible);
  }

  // The System-Validity Gate's two facts for one system (spec §System-Validity
  // Gate), evaluated once per call. Reads the system's recipes/components through the
  // injected recipe manager. Fails open (empty) when the system id is missing so a
  // broken collaborator never blocks a craft outright. Callers own the GM bypass.
  _computeSystemVisibility(system) {
    if (!system?.id) return { blocksSystem: false, hiddenEntityIds: new Set() };
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system.id }) || [];
    return computeSystemVisibility(system, {
      recipes,
      components: system.components || [],
    });
  }

  guardCraftStart({ viewer, recipe, craftingActor, componentSourceActors = [] }) {
    // System-Validity Gate (spec §Crafting Guard Algorithm step 0): reject a non-GM
    // craft up front when the system's validation report blocks the whole system, or
    // when the targeted recipe entity is marked `blocks: 'visibility'`. This is an
    // INDEPENDENT layer from listing filtering — a non-GM must not bypass visibility
    // by targeting a recipe id directly via API/macro. `computeSystemVisibility` is
    // evaluated once here (not per step). GMs bypass so they can still reach a broken
    // system to diagnose it (mirrors `GatheringEngine._isSystemBlockedForGathering`).
    if (viewer?.isGM !== true) {
      const system = this._getCraftingSystem(recipe);
      if (system) {
        const { blocksSystem, hiddenEntityIds } = this._computeSystemVisibility(system);
        if (blocksSystem === true) {
          return { visible: false, craftable: false, reason: 'system-invalid', knowledge: null };
        }
        if (hiddenEntityIds.has(String(recipe?.id))) {
          return { visible: false, craftable: false, reason: 'visibility', knowledge: null };
        }
      }
    }
    return this.evaluateRecipeAccess({ recipe, viewer, craftingActor, componentSourceActors });
  }

  async learnRecipe({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return { success: false, message: LEARN_RECIPE_MESSAGES.systemNotFound };

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['learned', 'itemOrLearned'].includes(mode)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learningDisabled };
    }
    if (!this._hasRecipeItemReference(recipe)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    if (!this._isPrerequisiteMet(recipe, craftingActor)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.prerequisiteNotMet };
    }

    // Learning consumes/anchors a real owned recipe item, so we must evaluate
    // the actor's actual inventory directly rather than trusting
    // `evaluateKnowledgeAccess().matchedItems` — that array is empty on the GM
    // bypass path, which would make a GM who genuinely owns a matching item fail
    // with `noMatchingItem`. Collecting candidates here means a GM (or player)
    // who owns a match can learn, while one who owns none still cannot.
    const caps = this._getRecipeItemCaps(recipe);
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const matchedItems = this._filterNonExhausted(allMatches, caps.item);
    const selected = this._selectDeterministic(matchedItems);
    if (!selected) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }

    // Character-prerequisite gate is per-book — evaluate against the owned book
    // (issue 544), not the recipe's first-member book.
    const characterGate = this._meetsCharacterPrerequisites(
      recipe,
      craftingActor,
      this._matchDefinitionForItem(recipe, selected.item)
    );
    if (!characterGate.met) {
      return {
        success: false,
        message: LEARN_RECIPE_MESSAGES.characterPrerequisiteNotMet,
        messageData: { name: recipe.name, reason: characterGate.reason },
      };
    }

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: selected.item.uuid,
      },
    };
    await this._setLearnedMap(craftingActor, next);

    if (caps.learn.consumeOnLearn === true) {
      await selected.item.delete();
    }

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
    };
  }

  // Whether a recipe's crafting system has an EFFECTIVE learn cap (issue 511):
  // `limitRecipes === true` AND a finite positive `maxRecipes`. A system that
  // toggled `limitRecipes` on but carries an invalid/missing `maxRecipes` is
  // NOT treated as capped — it fails closed to the uncapped/unlimited learn path
  // (mirroring how `_filterNonExhausted` treats an invalid `maxUses` as
  // unlimited) rather than bricking its linked recipes with a zero budget.
  _isRecipeItemLearnCapped(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    return Number.isFinite(this._getLearnCapForRecipe(recipe, definition));
  }

  // The finite positive learn cap for a capped recipe, or undefined.
  _getLearnCapForRecipe(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    const caps = this._getRecipeItemCaps(recipe, definition);
    if (caps.learn.limitRecipes !== true) return;
    const max = Number(caps.learn.maxRecipes);
    return Number.isFinite(max) && max > 0 ? max : undefined;
  }

  // FN1 (issue 511) — capped-system recipes surface the item-sheet picker path
  // ('manual') REGARDLESS of `dragDropEnabled`, and are NEVER auto-learned on
  // drop ('auto'). Uncapped recipes keep the original split: auto-learn when
  // `dragDropEnabled === true`, else the manual sheet path. This lets one dropped
  // book auto-learn its uncapped-system recipes while routing only the
  // capped-system ones to the picker (DN2).
  _isRecipeEligibleForOwnedItemLearning(recipe, mode = 'auto') {
    if (!recipe || recipe.enabled === false) return false;

    const system = this._getCraftingSystem(recipe);
    if (!system) return false;
    // Learning only applies to the knowledge visibility mode (item-only and the
    // non-knowledge modes never learn). Routed through `_getVisibilityMode` so both
    // the flat enum and the legacy `listMode`/`knowledge.mode` pair resolve here.
    if (this._getVisibilityMode(system) !== 'knowledge') return false;

    const knowledge = this._getKnowledgeConfig(system);
    if (!['learned', 'itemOrLearned'].includes(knowledge?.mode || 'itemOrLearned')) return false;

    // Effective cap only — a `limitRecipes` system with an invalid `maxRecipes`
    // behaves as uncapped here (fails closed to the normal learn path).
    const capped = this._isRecipeItemLearnCapped(recipe);
    const dragDropEnabled = knowledge?.learn?.dragDropEnabled !== false;

    if (mode === 'manual') {
      // The picker surfaces capped systems always; uncapped systems only when
      // auto-drop is off.
      return capped || dragDropEnabled === false;
    }
    // Auto-drop learns only uncapped systems that opt into drag-and-drop.
    return capped === false && dragDropEnabled === true;
  }

  _getOwnedItemLearningCandidates({ ownedItem, mode = 'auto' } = {}) {
    if (!ownedItem) return [];
    const recipes = this.recipeManager?.getRecipes?.({ enabled: true }) || [];
    return recipes.filter((recipe) => {
      if (!this._isRecipeEligibleForOwnedItemLearning(recipe, mode)) return false;
      if (!this._hasRecipeItemReference(recipe)) return false;
      const { definition, tier } = this._matchRecipeItemForRecipe(recipe, ownedItem);
      if (!definition) return false;
      // R5 (issue 555): the bulk on-drop auto-learn path (`mode: 'auto'`, the createItem
      // hook) must not silently grant a recipe whose owned item matches its definition
      // ONLY via tier 4 — the un-migrated `_stats.duplicateSource` fallback, which is
      // exactly the duplicated-book ambiguity. A silent bulk knowledge grant is not
      // cheap or reversible, so it demands a higher-confidence match. Explicit learn,
      // the item-sheet picker (`mode: 'manual'`), and every display path still honour
      // tier 4. Paired with the mandatory primary-GM auto-stamp (R3), which flags every
      // registered book so real books resolve at tier 1 and keep auto-learning.
      //
      // The refusal is limited to REGISTERED definitions (`definition.id`). A recipe
      // linked only by the legacy `linkedRecipeItemUuid` — an un-migrated book, or a
      // standalone alchemy formula item — resolves through the synthetic entry built by
      // `_recipeItemMatchDefinitions`, which has `id: null` and therefore no source to
      // stamp. Tier 4 is the only signal such an item can ever produce, so refusing it
      // would disable its on-drop learning permanently rather than until R3 runs.
      if (mode === 'auto' && tier === 'duplicate' && definition.id) return false;
      return true;
    });
  }

  _buildOwnedItemLearningResult({
    actor,
    ownedItem,
    mode,
    matchedRecipes = [],
    learnedRecipes = [],
    alreadyLearnedRecipes = [],
    consumedItem = false,
    silent = false,
  }) {
    let notificationKind = 'silent';
    let message = null;
    const shouldNotify = silent !== true && matchedRecipes.length > 0;

    if (shouldNotify) {
      if (learnedRecipes.length > 0 && alreadyLearnedRecipes.length > 0) {
        notificationKind = 'partial';
        message = LEARN_RECIPE_MESSAGES.learnedRecipesPartial;
      } else if (learnedRecipes.length > 0) {
        notificationKind = 'success';
        message = LEARN_RECIPE_MESSAGES.learnedRecipes;
      } else {
        notificationKind = 'alreadyKnown';
        message = LEARN_RECIPE_MESSAGES.noNewRecipesLearned;
      }
    }

    const recipeNames = learnedRecipes.map((recipe) => recipe.name).filter(Boolean);
    const matchedRecipeNames = matchedRecipes.map((recipe) => recipe.name).filter(Boolean);
    return {
      actor,
      ownedItem,
      mode,
      matchedRecipes,
      learnedRecipes,
      alreadyLearnedRecipes,
      learnableRecipes: learnedRecipes,
      consumedItem,
      shouldNotify,
      notificationKind,
      message,
      messageData: {
        actor: actor?.name || actor?.id || '',
        item: ownedItem?.name || ownedItem?.uuid || '',
        name: recipeNames[0] || matchedRecipeNames[0] || '',
        recipes: recipeNames.join(', '),
        matchedRecipes: matchedRecipeNames.join(', '),
        count: learnedRecipes.length,
        matchedCount: matchedRecipes.length,
      },
    };
  }

  previewOwnedItemLearning({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
    mode = 'auto',
  } = {}) {
    if (!this._isActorOwnedItem(ownedItem, actor)) {
      return this._buildOwnedItemLearningResult({ actor, ownedItem, mode, silent: true });
    }

    // Capped-system recipes are learned one-at-a-time through the item-sheet
    // picker (getLearnableRecipesFromItem / learnOneRecipeFromItem), never in the
    // bulk drop/manual path, so they are suppressed here per matched recipe
    // (DN2). Uncapped matched recipes in the same drop still learn in bulk.
    const matchedRecipes = this._getOwnedItemLearningCandidates({ ownedItem, mode }).filter(
      // Resolve the cap against the SPECIFIC owned book (R6a, issue 555), not the
      // recipe's first member book — a recipe can live in several books with different
      // caps, and the un-resolved default previously read the wrong book's cap.
      (recipe) =>
        !this._isRecipeItemLearnCapped(recipe, this._matchDefinitionForItem(recipe, ownedItem))
    );
    const learnedMap = this._getLearnedMap(actor);
    // Resolve the reader's roll data once for the whole preview (issue 544).
    const rollData = actor?.getRollData?.() ?? {};
    const alreadyLearnedRecipes = [];
    const learnableRecipes = [];

    for (const recipe of matchedRecipes) {
      if (learnedMap?.[recipe.id]) {
        alreadyLearnedRecipes.push(recipe);
        continue;
      }
      // A reader who fails the recipe's Required-Knowledge or character-prerequisite
      // gate cannot bulk-learn it from a dropped book — silently skipped, mirroring
      // how the drop path already suppresses capped recipes.
      const definition = this._matchDefinitionForItem(recipe, ownedItem);
      if (!this._isPrerequisiteMet(recipe, actor, definition)) continue;
      if (!this._meetsCharacterPrerequisites(recipe, actor, definition, rollData).met) continue;
      learnableRecipes.push(recipe);
    }

    // `consumeOnLearn` is ignored for capped books (superseded by
    // `destroyWhenSpent`), but capped recipes are already excluded above, so this
    // only ever sees uncapped recipes (UN4).
    const consumedItem = learnableRecipes.some((recipe) => {
      const system = this._getCraftingSystem(recipe);
      const knowledge = this._getKnowledgeConfig(system);
      return knowledge?.learn?.consumeOnLearn === true;
    });

    return this._buildOwnedItemLearningResult({
      actor,
      ownedItem,
      mode,
      matchedRecipes,
      learnedRecipes: learnableRecipes,
      alreadyLearnedRecipes,
      consumedItem,
    });
  }

  async learnRecipesFromOwnedItem({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
    viewer = null,
    mode = 'auto',
  } = {}) {
    const preview = this.previewOwnedItemLearning({ ownedItem, actor, viewer, mode });
    if (preview.matchedRecipes.length === 0 || preview.learnedRecipes.length === 0) {
      return {
        ...preview,
        learnedRecipes: [],
        consumedItem: false,
        message: preview.message,
        messageData: {
          ...preview.messageData,
          count: 0,
          recipes: '',
        },
      };
    }

    const learnedMap = this._getLearnedMap(actor);
    const learnedAt = Date.now();
    const next = { ...learnedMap };

    for (const recipe of preview.learnedRecipes) {
      next[recipe.id] = {
        learnedAt,
        sourceItemUuid: ownedItem.uuid,
      };
    }

    await this._setLearnedMap(actor, next);

    const confirmedLearnedMap = this._getLearnedMap(actor);
    const writeSucceeded = preview.learnedRecipes.every(
      (recipe) => confirmedLearnedMap?.[recipe.id]?.sourceItemUuid === ownedItem.uuid
    );
    if (!writeSucceeded) {
      return this._buildOwnedItemLearningResult({
        actor,
        ownedItem,
        mode,
        matchedRecipes: preview.matchedRecipes,
        learnedRecipes: [],
        alreadyLearnedRecipes: preview.alreadyLearnedRecipes,
        consumedItem: false,
        silent: true,
      });
    }

    if (preview.consumedItem === true) {
      await ownedItem.delete?.();
    }

    return this._buildOwnedItemLearningResult({
      actor,
      ownedItem,
      mode,
      matchedRecipes: preview.matchedRecipes,
      learnedRecipes: preview.learnedRecipes,
      alreadyLearnedRecipes: preview.alreadyLearnedRecipes,
      consumedItem: preview.consumedItem === true,
    });
  }

  /**
   * Read-only view of the capped recipes a player can still learn from one owned
   * recipe item (issue 511). Returns the item's linked, capped-system recipes the
   * actor has not yet learned, plus the item-document's remaining learn budget
   * (`remainingBudget = maxRecipes − count`). The recipe list is empty and
   * `remainingBudget` is `0` once the budget is spent. Only capped-system recipes
   * participate — uncapped recipes learn in bulk via `learnRecipesFromOwnedItem`.
   *
   * @param {object} args
   * @param {object} args.ownedItem
   * @param {object|null} [args.actor]
   * @returns {{recipes: object[], remainingBudget: number, maxRecipes: number|undefined, count: number}}
   */
  getLearnableRecipesFromItem({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
  } = {}) {
    const empty = { recipes: [], remainingBudget: 0, maxRecipes: undefined, count: 0 };
    if (!ownedItem || !actor) return empty;
    if (!this._isActorOwnedItem(ownedItem, actor)) return empty;

    // Caps are read from THIS owned book (the one being read) per recipe — a recipe may
    // live in several books, and several systems can share one physical item, so each
    // recipe's cap resolves against the book that IS this item (many-to-many).
    const cappedCandidates = this._getOwnedItemLearningCandidates({
      ownedItem,
      mode: 'manual',
    }).filter((recipe) =>
      this._isRecipeItemLearnCapped(recipe, this._matchDefinitionForItem(recipe, ownedItem))
    );
    if (cappedCandidates.length === 0) return empty;

    // When several capped systems link the same physical item, use the most
    // permissive cap; in practice one book links to one system's recipes.
    const caps = cappedCandidates
      .map((recipe) =>
        this._getLearnCapForRecipe(recipe, this._matchDefinitionForItem(recipe, ownedItem))
      )
      .filter((value) => Number.isFinite(value));
    const maxRecipes = caps.length > 0 ? Math.max(...caps) : undefined;
    // The spent count is scope-aware: `perInstance` reads the per-copy document
    // count; `total` reads the shared world pool (which the per-copy count never
    // reflects), so the reader sees the real remaining budget for either scope.
    const primary = cappedCandidates[0];
    const primaryDefinition = this._matchDefinitionForItem(primary, ownedItem);
    const count =
      this._getRecipeItemLearnScope(primary, primaryDefinition) === 'total'
        ? this._partyLearnPool.get(this._partyLearnPoolKey(primary, primaryDefinition))
        : this._getRecipeItemLearnCount(ownedItem);
    const remainingBudget = Number.isFinite(maxRecipes) ? Math.max(0, maxRecipes - count) : 0;

    const learnedMap = this._getLearnedMap(actor);
    // Exclude recipes the reader cannot learn (Required-Knowledge + character-
    // prerequisite gates) — the picker must not offer a recipe that
    // learnOneRecipeFromItem would then refuse (issue 544).
    const rollData = actor?.getRollData?.() ?? {};
    const unlearned = cappedCandidates.filter((recipe) => {
      if (learnedMap?.[recipe.id]) return false;
      const definition = this._matchDefinitionForItem(recipe, ownedItem);
      if (!this._isPrerequisiteMet(recipe, actor, definition)) return false;
      return this._meetsCharacterPrerequisites(recipe, actor, definition, rollData).met;
    });

    return {
      recipes: remainingBudget > 0 ? unlearned : [],
      remainingBudget,
      maxRecipes,
      count,
    };
  }

  /**
   * Learn exactly one capped recipe from an owned recipe item (issue 511),
   * enforcing the per-document learn budget. Validates the link, that the recipe
   * is not already learned, and that `remainingBudget > 0`; writes one
   * `learnedRecipes` entry, increments the item-document learn count, and deletes
   * the item when the count reaches `maxRecipes` iff `destroyWhenSpent`. For
   * capped books `consumeOnLearn` is ignored.
   *
   * @param {object} args
   * @param {object} args.recipe
   * @param {object} args.ownedItem
   * @param {object|null} [args.actor]
   * @returns {Promise<{success: boolean, message: string, messageData?: object, destroyed?: boolean, remainingBudget?: number}>}
   */
  async learnOneRecipeFromItem({
    recipe,
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
  } = {}) {
    if (!recipe || !ownedItem || !actor) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }
    if (
      !this._isActorOwnedItem(ownedItem, actor) ||
      !this._isMatchingRecipeItem(recipe, ownedItem)
    ) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }
    // Caps/scope/prerequisite come from the SPECIFIC owned book being read — a recipe
    // may belong to several books, each with its own economy (many-to-many).
    const definition = this._matchDefinitionForItem(recipe, ownedItem);
    if (!this._isRecipeItemLearnCapped(recipe, definition)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }

    const learnedMap = this._getLearnedMap(actor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    if (!this._isPrerequisiteMet(recipe, actor, definition)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.prerequisiteNotMet };
    }

    const characterGate = this._meetsCharacterPrerequisites(recipe, actor, definition);
    if (!characterGate.met) {
      return {
        success: false,
        message: LEARN_RECIPE_MESSAGES.characterPrerequisiteNotMet,
        messageData: { name: recipe.name, reason: characterGate.reason },
      };
    }

    const maxRecipes = this._getLearnCapForRecipe(recipe, definition);

    // `total` scope draws from ONE shared world pool (across every copy of the source
    // item) instead of the per-copy document count, so every actor spends the same
    // budget.
    if (this._getRecipeItemLearnScope(recipe, definition) === 'total') {
      return this._learnOnePartyRecipe({
        recipe,
        ownedItem,
        actor,
        learnedMap,
        maxRecipes,
        definition,
      });
    }

    const count = this._getRecipeItemLearnCount(ownedItem);
    const remainingBudget = Number.isFinite(maxRecipes) ? maxRecipes - count : 0;
    if (remainingBudget <= 0) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learnBudgetSpent };
    }

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: ownedItem.uuid,
      },
    };
    await this._setLearnedMap(actor, next);

    const nextCount = count + 1;
    await this._setRecipeItemLearnCount(ownedItem, nextCount);

    const caps = this._getRecipeItemCaps(recipe, definition);
    const spent = Number.isFinite(maxRecipes) && nextCount >= maxRecipes;
    let destroyed = false;
    if (spent && caps.learn.destroyWhenSpent === true) {
      await ownedItem.delete?.();
      destroyed = true;
    }

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
      destroyed,
      remainingBudget: Number.isFinite(maxRecipes) ? Math.max(0, maxRecipes - nextCount) : 0,
    };
  }

  // Learn one recipe from a `party`-mode book against the SHARED world pool. The
  // shared slot is reserved via the GM-authoritative pool BEFORE the learn is
  // recorded, so a non-GM (or otherwise failed) increment fails closed — the actor
  // does not learn and the shared budget is not forked.
  async _learnOnePartyRecipe({
    recipe,
    ownedItem,
    actor,
    learnedMap,
    maxRecipes,
    definition = this._matchDefinitionForItem(recipe, ownedItem),
  }) {
    const key = this._partyLearnPoolKey(recipe, definition);
    const count = this._partyLearnPool.get(key);
    const remainingBudget = Number.isFinite(maxRecipes) ? maxRecipes - count : 0;
    if (remainingBudget <= 0) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learnBudgetSpent };
    }

    const reserved = await this._partyLearnPool.increment(key);
    if (!reserved) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learnBudgetSpent };
    }

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: ownedItem?.uuid || null,
      },
    };
    await this._setLearnedMap(actor, next);

    const nextCount = count + 1;
    // Read caps from the SPECIFIC owned book being learned from (per-book), not the
    // recipe's first member book — the destroy-when-spent decision applies to THIS item.
    const caps = this._getRecipeItemCaps(recipe, definition);
    const spent = Number.isFinite(maxRecipes) && nextCount >= maxRecipes;
    let destroyed = false;
    if (spent && caps.learn.destroyWhenSpent === true) {
      await ownedItem?.delete?.();
      destroyed = true;
    }

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
      destroyed,
      remainingBudget: Number.isFinite(maxRecipes) ? Math.max(0, maxRecipes - nextCount) : 0,
    };
  }

  /**
   * Learn exactly one recipe from a book the crafting actor (or a component-source
   * actor) owns, for the player Inventory learn affordance (issue 511). Resolves
   * the owned book document deterministically, then:
   *  - a capped system enforces the per-document learn budget and destroy-when-spent
   *    (delegates to {@link learnOneRecipeFromItem});
   *  - an uncapped system (or a cap toggled on with an invalid `maxRecipes`, which
   *    fails closed to uncapped) writes one `learnedRecipes` entry and NEVER
   *    consumes the book — `consumeOnLearn` is ignored here so learning one recipe
   *    from a multi-recipe book does not strand its remaining recipes.
   *
   * @param {object} args
   * @param {object} args.recipe
   * @param {object|null} args.craftingActor Where the learned recipe is recorded.
   * @param {object[]} [args.componentSourceActors] Additional inventory sources.
   * @returns {Promise<{success: boolean, message: string, messageData?: object, destroyed?: boolean, remainingBudget?: number}>}
   */
  async learnRecipeFromOwnedBook({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return { success: false, message: LEARN_RECIPE_MESSAGES.systemNotFound };

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['learned', 'itemOrLearned'].includes(mode)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learningDisabled };
    }
    if (!this._hasRecipeItemReference(recipe)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.linkedItemRequired };
    }
    if (!craftingActor) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.alreadyLearned };
    }

    if (!this._isPrerequisiteMet(recipe, craftingActor)) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.prerequisiteNotMet };
    }

    // Resolve the owned book document (crafting actor first) the same way the craft
    // and drop paths do — never trust the GM-bypass matchedItems array.
    const matches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const selected = this._selectDeterministic(matches);
    if (!selected) return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };

    // An EFFECTIVE cap (enabled + finite positive max) on the SELECTED book routes
    // through the budget-enforcing capped path; an invalid cap falls through to
    // uncapped.
    const selectedDefinition = this._matchDefinitionForItem(recipe, selected.item);

    // The character-prerequisite gate is per-book, so evaluate it against the book
    // the actor actually owns (issue 544) — a recipe can belong to several books
    // with different prerequisites. (The capped branch re-checks inside
    // learnOneRecipeFromItem against the same selected book.)
    const characterGate = this._meetsCharacterPrerequisites(
      recipe,
      craftingActor,
      selectedDefinition
    );
    if (!characterGate.met) {
      return {
        success: false,
        message: LEARN_RECIPE_MESSAGES.characterPrerequisiteNotMet,
        messageData: { name: recipe.name, reason: characterGate.reason },
      };
    }

    if (
      this._isRecipeItemLearnCapped(recipe, selectedDefinition) &&
      Number.isFinite(this._getLearnCapForRecipe(recipe, selectedDefinition))
    ) {
      return this.learnOneRecipeFromItem({
        recipe,
        ownedItem: selected.item,
        actor: craftingActor,
      });
    }

    const next = {
      ...learnedMap,
      [recipe.id]: { learnedAt: Date.now(), sourceItemUuid: selected.item.uuid },
    };
    await this._setLearnedMap(craftingActor, next);
    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
    };
  }

  async applyRecipeItemUseOnCraft({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return;
    // Use-tracking applies to the item-charge modes only (flat `item`/`knowledge`,
    // or their legacy `listMode: 'knowledge'` equivalents).
    const visibilityMode = this._getVisibilityMode(system);
    if (visibilityMode !== 'item' && visibilityMode !== 'knowledge') return;

    const knowledge = this._getKnowledgeConfig(system);
    const mode = knowledge?.mode || 'itemOrLearned';
    if (!['item', 'itemOrLearned'].includes(mode)) return;
    const caps = this._getRecipeItemCaps(recipe);
    if (!caps.item.limitUses) return;

    const matches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    const nonExhausted = this._filterNonExhausted(matches, caps.item);
    const selected = this._selectDeterministic(nonExhausted);
    if (!selected) return;

    // Re-anchor caps to the SPECIFIC book the selected item is (per-book use caps): a
    // recipe in two item-mode books with differing maxUses/whenSpent must exhaust and
    // spend the actually-consumed item by ITS book's rules, not the first book's.
    const selectedCaps = this._getRecipeItemCaps(
      recipe,
      this._matchDefinitionForItem(recipe, selected.item)
    );
    const nextUses = Number(selected.timesUsed || 0) + 1;
    const maxUses = Number(selectedCaps.item.maxUses);
    const exhausted = Number.isFinite(maxUses) && maxUses > 0 && nextUses >= maxUses;

    // On exhaustion: 'destroyed' deletes the item; 'inert' keeps it but flags it so
    // it no longer grants craftability (it is already excluded by `_filterNonExhausted`
    // once `timesUsed >= maxUses`, so no further gating is needed).
    if (exhausted && selectedCaps.item.whenSpent === 'inert') {
      await this._markRecipeItemInert(selected.item, nextUses);
      return;
    }

    await this._setRecipeItemUsage(selected.item, nextUses);
    if (exhausted && selectedCaps.item.whenSpent === 'destroyed') {
      await selected.item.delete();
    }
  }

  async learnRecipeOnCraft(recipe, craftingActor) {
    const system = this._getCraftingSystem(recipe);
    if (!system || system.resolutionMode !== 'alchemy') return;
    if (system.alchemy?.learnOnCraft !== true) return;
    const learnedMap = this._getLearnedMap(craftingActor);
    if (learnedMap?.[recipe.id]) return;
    // A reader who fails the recipe's Required-Knowledge or character-prerequisite
    // gate does not auto-learn it on craft (issue 544). Silent — craft side effect.
    if (!this._isPrerequisiteMet(recipe, craftingActor)) return;
    if (!this._meetsCharacterPrerequisites(recipe, craftingActor).met) return;
    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: null,
      },
    };
    await this._setLearnedMap(craftingActor, next);
  }

  async cleanupLearnedRecipes(validRecipeIds = new Set()) {
    for (const actor of game.actors || []) {
      const learned = this._getLearnedMap(actor);
      const next = {};
      let changed = false;
      for (const [recipeId, value] of Object.entries(learned || {})) {
        if (!validRecipeIds.has(recipeId)) {
          changed = true;
          continue;
        }
        next[recipeId] = value;
      }

      if (changed) {
        await this._setLearnedMap(actor, next);
      }
    }
  }
}
