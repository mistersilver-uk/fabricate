import {
  FABRICATE_FLAG_NAMESPACE,
  LEARNED_RECIPES_FLAG_KEY,
  forcedDeletionEntry,
  getFabricateFlag,
  setFabricateFlag,
} from '../config/flags.js';
import { indexedMembershipLookups, readDefinitionRevision } from '../utils/definitionIndex.js';
import { recipeItemDefinitionsContaining } from '../utils/recipeItemMembership.js';
import { itemMatchesRecipeItemSource, matchRecipeItemDefinition } from '../utils/sourceUuid.js';

import { resolveCharacterPrerequisiteLibrary } from './characterLibraries.js';
import { evaluatePrerequisites } from './characterPrerequisites.js';
import { buildPassInventorySnapshot } from './passInventorySnapshot.js';
import { createDefaultPartyLearnPool } from './recipeItemPartyLearnPool.js';
import {
  buildFlagMapFromEntries,
  isDirectlyDeletableId,
  readDiscoveryProgressEntries,
  readLearnedRecipeEntries,
} from './recipeKeyedFlagEntries.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';
import { computeSystemVisibility } from './systemValidation.js';
import { selectWritableActors } from './writableActors.js';

const LEARN_RECIPE_MESSAGES = {
  systemNotFound: 'FABRICATE.Knowledge.SystemNotFound',
  learningDisabled: 'FABRICATE.Knowledge.LearningDisabled',
  linkedItemRequired: 'FABRICATE.Knowledge.LinkedItemRequired',
  alreadyLearned: 'FABRICATE.Knowledge.AlreadyLearned',
  noMatchingItem: 'FABRICATE.Knowledge.NoMatchingItem',
  learnBudgetSpent: 'FABRICATE.Knowledge.LearnBudgetSpent',
  learnRequiresGm: 'FABRICATE.Knowledge.LearnRequiresGm',
  prerequisiteNotMet: 'FABRICATE.Knowledge.PrerequisiteNotMet',
  characterPrerequisiteNotMet: 'FABRICATE.Knowledge.CharacterPrerequisiteNotMet',
  learnedRecipe: 'FABRICATE.Knowledge.LearnedRecipe',
  learnedRecipes: 'FABRICATE.Knowledge.LearnedRecipes',
  learnedRecipesPartial: 'FABRICATE.Knowledge.LearnedRecipesPartial',
  noNewRecipesLearned: 'FABRICATE.Knowledge.NoNewRecipesLearned',
};

// Result messages for the GM-driven knowledge-management operations (issue 785).
// Every key is a STATIC literal at its call site so the localization guards can see it.
const MANAGE_KNOWLEDGE_MESSAGES = {
  noItem: 'FABRICATE.Knowledge.Manage.NoItem',
  noLimitedUses: 'FABRICATE.Knowledge.Manage.NoLimitedUses',
  alreadySpent: 'FABRICATE.Knowledge.Manage.AlreadySpent',
  useExpended: 'FABRICATE.Knowledge.Manage.UseExpended',
};

// The three outcomes of `_applyRecipeItemUse`: "uncapped, nothing to spend" and "already
// spent" must stay distinguishable because the GM path reports them differently.
const APPLY_USE_OUTCOME = Object.freeze({
  applied: 'applied',
  uncapped: 'uncapped',
  spent: 'spent',
});

const VISIBILITY_MODES = ['global', 'restricted', 'item', 'knowledge'];

/**
 * Visibility-phase counters (issue 1228). `candidateItemOffers` counts held documents offered to
 * the per-recipe recipe-item matcher, which an inventory-read counter cannot see once a snapshot
 * falls back to the memoised `heldItems()`; `candidateWalks` tells a smaller corpus from a real
 * saving. Process-global, like `SignatureValidator`'s counters, because the service is built in
 * places a probe cannot reach.
 */
const _counters = {
  candidateItemOffers: 0,
  candidateWalks: 0,
};

/** A snapshot of the visibility counters. */
export function readVisibilityCounters() {
  return { ..._counters };
}

/** Zero the process-global, monotonic visibility counters before a measured region. */
export function resetVisibilityCounters() {
  _counters.candidateItemOffers = 0;
  _counters.candidateWalks = 0;
}

/** Visibility, knowledge access, and learn-state service. */
export class RecipeVisibilityService {
  /**
   * @param {((item: object, components: object[], systemId: string) => (object|null))|null}
   *   [resolveComponentForItem] Never called here: it completes the per-pass inventory snapshot
   *   this service hands down, so it matches `CraftingListingBuilder`'s (issue 1228).
   */
  constructor(
    recipeManager,
    craftingSystemManager,
    partyLearnPool = createDefaultPartyLearnPool(),
    resolveComponentForItem = null
  ) {
    this.recipeManager = recipeManager;
    this.craftingSystemManager = craftingSystemManager;
    this._partyLearnPool = partyLearnPool;
    this._resolveComponentForItem =
      typeof resolveComponentForItem === 'function' ? resolveComponentForItem : null;
    // Retained recipe -> member-book lookups (issue 1077). Null until first use; validity is
    // the source array's identity + length + `definitionIndex` revision, so nothing here has
    // to be cleared by a mutator. See `_memoRecipeItemDefinitions`.
    this._recipeItemDefinitionMemo = null;
    this._legacyMatchMemo = null;
  }

  _getCraftingSystem(recipe) {
    if (!recipe?.craftingSystemId) return null;
    return this.craftingSystemManager?.getSystem(recipe.craftingSystemId) || null;
  }

  // The flat system visibility mode (issue 511). A legacy system without `visibilityMode`
  // derives one from `recipeVisibility.listMode` + `knowledge.mode`: global → global, player →
  // restricted, knowledge+item → item, knowledge+(learned|itemOrLearned) → knowledge, teaser →
  // teaser, anything else → global.
  _getVisibilityMode(system) {
    // Legacy teaser has no flat-enum value and keeps its own teaserConfig runtime, so
    // `listMode: 'teaser'` wins over a possibly-defaulted `visibilityMode`.
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

  // Whether the system authored a flat `visibilityMode`. If so, item → 'item' and knowledge →
  // 'itemOrLearned' drive the knowledge sub-mode; if not, legacy `knowledge.mode` is honoured
  // as-is so migrated 'learned' systems stay learned-only.
  _usesFlatVisibilityMode(system) {
    return VISIBILITY_MODES.includes(system?.visibilityMode);
  }

  // Whether a viewer may see a `restricted` recipe: GM always, else the per-recipe `access`
  // grant (a player id, or a character the viewer controls). A recipe without `access` falls
  // back to the legacy `visibility.restricted` / `allowedUserIds` list.
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

  /**
   * The member-book definitions of a recipe, retained so the array is stable across calls
   * (issue 1077): `definitionIndex` keys on the candidate array object, and
   * `recipeItemDefinitionsContaining` returns a fresh array each time. Validity is the source
   * array's identity and length plus `definitionIndex`'s revision, which catches
   * `CraftingSystemManager` rewriting `recipeIds` in place
   * (`tests/recipe-book-membership-basis.test.js`).
   */
  _memoRecipeItemDefinitions(system, recipe, compute) {
    const definitions = system.recipeItemDefinitions || [];
    const revision = readDefinitionRevision(definitions);
    const cached = this._recipeItemDefinitionMemo;
    const warm =
      cached &&
      cached.definitions === definitions &&
      cached.length === definitions.length &&
      cached.revision === revision;
    const byRecipeId = warm ? cached.byRecipeId : new Map();
    if (!warm) {
      this._recipeItemDefinitionMemo = {
        definitions,
        length: definitions.length,
        revision,
        byRecipeId,
      };
    }
    const key = String(recipe?.id || '');
    const hit = byRecipeId.get(key);
    if (hit) return hit;
    const computed = compute(definitions, key);
    byRecipeId.set(key, computed);
    return computed;
  }

  // The member-book definitions of a recipe (issue 511 many-to-many); a recipe may live in
  // several books, each with its own caps. The rule is `utils/recipeItemMembership.js`
  // (issue 1155), and the basis is read from the system's `membershipResolvesByRecipeIds`
  // marker, never re-derived from the arrays (issue 1011). The `recipeIds[]` leg uses the
  // retained index (issue 1076); the memo keeps the result stable for it (issue 1077).
  _getRecipeItemDefinitions(recipe) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return [];
    return this._memoRecipeItemDefinitions(system, recipe, (definitions) =>
      recipeItemDefinitionsContaining(
        definitions,
        recipe,
        system.membershipResolvesByRecipeIds,
        indexedMembershipLookups
      )
    );
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

  // Member book definitions plus a synthetic id-less entry for a legacy `linkedRecipeItemUuid`,
  // so an un-migrated recipe still resolves by source pointer. Having no `id`, the entry
  // matches only the source-uuid tiers, never the durable identity tier.
  _recipeItemMatchDefinitions(recipe) {
    const defs = this._getRecipeItemDefinitions(recipe);
    const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
    if (!legacyUuid) return defs;
    if (defs.some((def) => String(def?.originItemUuid || '').trim() === legacyUuid)) return defs;
    // Retained like the member list: `matchRecipeItemDefinition` indexes this array by
    // identity, so rebuilding it per item rebuilt the index per item (issue 1077).
    const system = this._getCraftingSystem(recipe);
    if (!system) return [...defs, { id: null, originItemUuid: legacyUuid }];
    return this._memoLegacyMatchDefinitions(system, recipe, defs, legacyUuid);
  }

  // The retained `[...memberBooks, syntheticLegacyEntry]` array for one legacy recipe; it
  // shares `_memoRecipeItemDefinitions`' validity rule under its own key.
  _memoLegacyMatchDefinitions(system, recipe, defs, legacyUuid) {
    const definitions = system.recipeItemDefinitions || [];
    const revision = readDefinitionRevision(definitions);
    const cached = this._legacyMatchMemo;
    const warm =
      cached &&
      cached.definitions === definitions &&
      cached.length === definitions.length &&
      cached.revision === revision;
    const byRecipeId = warm ? cached.byRecipeId : new Map();
    if (!warm) {
      this._legacyMatchMemo = {
        definitions,
        length: definitions.length,
        revision,
        byRecipeId,
      };
    }
    const key = String(recipe?.id || '');
    const hit = byRecipeId.get(key);
    // `defs` is itself memo-stable, so an identity check is enough to notice the member list
    // being recomputed under us rather than trusting the revision alone.
    if (hit && hit.defs === defs) return hit.matchDefinitions;
    const matchDefinitions = [...defs, { id: null, originItemUuid: legacyUuid }];
    byRecipeId.set(key, { defs, matchDefinitions });
    return matchDefinitions;
  }

  // Which member book an item is, and by which tier, via the shared system-scoped matcher
  // (roles leaf → legacy scalar → own uuid → compendium source → duplicate source). The
  // id-less legacy synthetic entry matches only the source-uuid tiers (issue 567).
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

  // The member book definition a specific owned item is, so learn/use read that book's caps.
  // A supplied item matching no member resolves to null (uncapped); only an absent item falls
  // back to the first member book (issue 555).
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

  // Both accessors key on the shared `LEARNED_RECIPES_FLAG_KEY`: the companion knowledge grant
  // writes the same flag (issue 1289), so a second spelling would read back empty.
  _getLearnedMap(actor) {
    const learned = getFabricateFlag(actor, LEARNED_RECIPES_FLAG_KEY, {});
    return learned && typeof learned === 'object' ? learned : {};
  }

  async _setLearnedMap(actor, learned) {
    return await setFabricateFlag(actor, LEARNED_RECIPES_FLAG_KEY, learned);
  }

  _getDiscoveryProgressMap(actor) {
    const map = getFabricateFlag(actor, 'discoveryProgress', {});
    return map && typeof map === 'object' ? map : {};
  }

  async _setDiscoveryMap(actor, discovery) {
    return await setFabricateFlag(actor, 'discoveryProgress', discovery);
  }

  // A recipe by id via `getRecipe`, else a `getRecipes()` scan; null for an orphan id, so
  // per-system scoping and budget-freeing can skip it.
  _getRecipeById(id) {
    if (typeof this.recipeManager?.getRecipe === 'function') {
      return this.recipeManager.getRecipe(id) || null;
    }
    const all = this.recipeManager?.getRecipes?.() || [];
    return all.find((recipe) => String(recipe?.id) === String(id)) || null;
  }

  // The persisted use count of one copy. The trailing `|| 0` is load-bearing: a truthy
  // non-numeric `timesUsed` would otherwise yield NaN, write null and leave `exhausted` false,
  // so no `whenSpent` disposal could run.
  _getRecipeItemUsage(item) {
    const usage = getFabricateFlag(item, 'recipeItemUsage', {});
    return Number(usage?.timesUsed || 0) || 0;
  }

  async _setRecipeItemUsage(item, timesUsed) {
    await setFabricateFlag(item, 'recipeItemUsage', {
      timesUsed: Math.max(0, Math.floor(timesUsed)),
    });
  }

  // Mark a spent copy inert (`whenSpent: 'inert'`, issue 511): the item stays but stops
  // granting; `timesUsed` is written too so `_filterNonExhausted` excludes it.
  async _markRecipeItemInert(item, timesUsed) {
    await setFabricateFlag(item, 'recipeItemUsage', {
      timesUsed: Math.max(0, Math.floor(timesUsed)),
      inert: true,
    });
  }

  // The learn-cap scope of a recipe's book: 'perInstance' (each physical copy) or 'total' (one
  // shared world pool across every copy of the source item).
  _getRecipeItemLearnScope(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    return this._getRecipeItemCaps(recipe, definition).learn.learnScope || 'perInstance';
  }

  // The recipeIds a reader must already have learned before this recipe (issue 544 —
  // Required Knowledge, AND semantics). Empty when none are required.
  _getRecipeItemPrerequisiteIds(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    const ids = this._getRecipeItemCaps(recipe, definition).learn.prerequisiteIds;
    return Array.isArray(ids) ? ids : [];
  }

  // Whether a Required-Knowledge id still names a recipe; a dangling id is treated as removed,
  // so the gate fails open like the character-prerequisite gate (issue 544).
  _recipeExists(id) {
    if (typeof this.recipeManager?.getRecipe === 'function') {
      return this.recipeManager.getRecipe(id) != null;
    }
    const all = this.recipeManager?.getRecipes?.() || [];
    return all.some((candidate) => String(candidate?.id) === String(id));
  }

  // Required Knowledge is met when Limited learning is off (issue 544) or the actor has learned
  // every still-existing required recipe. An empty requirement is met; a deleted prerequisite
  // is skipped (fail-open).
  _isPrerequisiteMet(recipe, actor, definition = this._getRecipeItemDefinition(recipe)) {
    if (this._getRecipeItemCaps(recipe, definition).learn.limitLearning !== true) return true;
    const ids = this._getRecipeItemPrerequisiteIds(recipe, definition);
    if (ids.length === 0) return true;
    const learned = this._getLearnedMap(actor);
    return ids.filter((id) => this._recipeExists(id)).every((id) => !!learned?.[id]);
  }

  // The character-prerequisite ids a reader must all pass to learn from this book (issue 544),
  // read off the definition's caps because `_getRecipeItemCaps` does not surface them.
  _getRecipeItemCharacterPrerequisiteIds(
    recipe,
    definition = this._getRecipeItemDefinition(recipe)
  ) {
    const ids = definition?.caps?.learn?.characterPrerequisiteIds;
    return Array.isArray(ids) ? ids : [];
  }

  // The character-prerequisite learning gate against the actor's roll data (AND semantics). An
  // id with no system definition is skipped (fail-open). Pass `rollData` in a bulk loop so it
  // is resolved once.
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
    const definitions = resolveCharacterPrerequisiteLibrary(this._getCraftingSystem(recipe));
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

  // The per-document learn count for the learn cap (issue 511), like `recipeItemUsage.timesUsed`:
  // it lives on the item document, so a stacked copy shares one count, it accumulates across
  // holders, and it survives transfer because the flag travels with the item.
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

  // Whether a system permits learning at all (spec §Learning Recipes → Preconditions).
  // The flat `visibilityMode` is canonical when authored, so learning requires the
  // resolved mode to be `'knowledge'` — a flat `item`/`global`/`restricted` system is
  // rejected even though it retains the normalizer's residual `knowledge.mode` default
  // of `itemOrLearned`. A legacy system with no authored flat mode still honours its
  // `learned`/`itemOrLearned` sub-mode. Shared by `learnRecipe`,
  // `learnRecipeFromOwnedBook`, and `_isRecipeEligibleForOwnedItemLearning` so the gate
  // cannot drift between the explicit-learn and drop/picker paths.
  _isLearnModeEnabled(system) {
    if (this._getVisibilityMode(system) !== 'knowledge') return false;
    const knowledge = this._getKnowledgeConfig(system);
    return ['learned', 'itemOrLearned'].includes(knowledge?.mode || 'itemOrLearned');
  }

  /**
   * Whether any reveal path on this system reads `learnedRecipes`, i.e. whether a learned entry
   * written for a character can become visible to them (issue 1289). A sibling of
   * `_isLearnModeEnabled`, never built on it: flat `knowledge` over a residual `item` sub-mode
   * (as `migrateVisibilityModeEnum` leaves it) is observable but not learnable, and alchemy
   * `item`/`restricted` without `learnOnCraft` is not observable, so "learn mode or alchemy"
   * would over-report. Mirrors `evaluateRecipeAccess`'s reveal switch arm by arm; change both.
   */
  isLearnedKnowledgeObservable(system) {
    if (system?.resolutionMode === 'alchemy') {
      // The brew-discovery union reveals a learned entry under EVERY mode.
      if (system?.alchemy?.learnOnCraft === true) return true;
      // Otherwise only the switch's `default:` arm reads the learned map; `restricted` and
      // `item` never do, and legacy `teaser` falls to `default:` too.
      const mode = this._getVisibilityMode(system);
      return mode !== 'restricted' && mode !== 'item';
    }
    // Non-alchemy: `item` forces `knowledgeMode: 'item'` and `restricted`/`global`/`teaser`
    // never reach `evaluateKnowledgeAccess`, so only `knowledge` lets `hasLearned` grant. Legacy
    // systems agree: `listMode: 'knowledge'` resolves to it only for the learned sub-modes.
    return this._getVisibilityMode(system) === 'knowledge';
  }

  // Per-recipe-item use/learn caps (issue 511), read from the recipe's book definition
  // (`definition.caps`) so two books in one system can differ. No resolvable definition means
  // uncapped. `mode` and `dragDropEnabled` stay system-wide in `_getKnowledgeConfig`.
  _getRecipeItemCaps(recipe, definition = this._getRecipeItemDefinition(recipe)) {
    const caps = definition?.caps;
    const item = caps?.item || {};
    const learn = caps?.learn || {};

    // Prefer the authored `whenSpent`; otherwise derive it from legacy `destroyWhenExhausted`
    // (true → 'destroyed', else 'inert') so an un-migrated cap never deletes.
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
    // `prerequisiteIds` (issue 544), AND semantics: prefer the array, else fold the legacy
    // single `prerequisite` string; trimmed, stringified and de-duplicated.
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
        // Legacy cap fields mirror the new ones so `_getLearnCapForRecipe` and
        // `_isRecipeItemLearnCapped` honour a book authored only with the new fields.
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

  // Caps from a book definition alone (issue 785), for the GM Knowledge surface, which names
  // no recipe. Routes through `_getRecipeItemCaps` so the legacy-field derivations still
  // apply; a missing definition resolves to uncapped.
  _capsForDefinition(definition) {
    return this._getRecipeItemCaps(null, definition || null);
  }

  /**
   * The owned documents that are one of `recipe`'s member books, in the deterministic
   * (actor, item) order the learn/use paths select on. `snapshot` (built from these actors) is
   * a read optimisation only (issue 1077): its per-system book candidates are a superset every
   * matcher can accept, and the per-recipe matcher still decides every entry, so both paths
   * return the identical array.
   *
   * @returns {Array<{actor: object, item: object, actorOrder: number, itemOrder: number,
   *   timesUsed: number}>}
   */
  _collectCandidateItems(recipe, craftingActor, componentSourceActors = [], snapshot = null) {
    // A recipe in no book has an empty match-definition set, so the walk could only return
    // `[]`; answer without scanning inventory, the common configuration (issue 1077).
    if (!this._hasRecipeItemReference(recipe)) return [];

    const offered = this._candidateItemEntries(
      craftingActor,
      componentSourceActors,
      snapshot,
      recipe
    );
    // Counted here, not in `_candidateItemEntries`: what matters is how many documents the
    // matcher is handed, not how many the snapshot holds (see `_counters`).
    _counters.candidateWalks += 1;
    _counters.candidateItemOffers += offered.length;

    const matched = [];
    for (const entry of offered) {
      if (!this._isMatchingRecipeItem(recipe, entry.item)) continue;
      matched.push({ ...entry, timesUsed: this._getRecipeItemUsage(entry.item) });
    }
    return matched;
  }

  // The `{actor, item, actorOrder, itemOrder}` records the walk considers: the snapshot's
  // prefiltered set when supplied, otherwise every held document.
  _candidateItemEntries(craftingActor, componentSourceActors, snapshot, recipe) {
    if (snapshot) {
      const system = this._getCraftingSystem(recipe);
      if (system) return snapshot.recipeItemCandidates(system);
    }

    const actors = [];
    if (craftingActor) actors.push(craftingActor);
    for (const actor of componentSourceActors || []) {
      if (!actor) continue;
      if (actors.some((a) => a.id === actor.id)) continue;
      actors.push(actor);
    }

    const entries = [];
    for (const [actorOrder, actor] of actors.entries()) {
      const items = [...(actor.items || [])];
      for (const [itemOrder, item] of items.entries()) {
        entries.push({ actor, item, actorOrder, itemOrder });
      }
    }
    return entries;
  }

  // Drop candidates that reached their own book's use cap (issue 511): with many-to-many
  // membership each is judged against the book it is (`_matchDefinitionForItem`). A book that
  // does not limit uses, or has an invalid `maxUses`, keeps the item (fail-open).
  _filterNonExhausted(recipe, matches) {
    return matches.filter((entry) => {
      const cfg = this._getRecipeItemCaps(
        recipe,
        this._matchDefinitionForItem(recipe, entry.item)
      ).item;
      if (!cfg.limitUses) return true;
      const maxUses = Number(cfg.maxUses);
      if (!Number.isFinite(maxUses) || maxUses <= 0) return true;
      return Number(entry.timesUsed || 0) < maxUses;
    });
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
   * Whether a viewer has knowledge access to a recipe. A GM is always granted (`reason: 'gm'`);
   * its `hasLearned`/`hasMatchedItem: true` describe that bypass, not real state, and
   * `matchedItems` stays empty. Callers needing the actor's real matching items (`learnRecipe`,
   * `applyRecipeItemUseOnCraft`) collect them via `_collectCandidateItems` /
   * `_filterNonExhausted` instead.
   */
  evaluateKnowledgeAccess({
    recipe,
    viewer,
    craftingActor,
    componentSourceActors = [],
    knowledgeMode = null,
    snapshot = null,
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
        // A GM collects no items, so it has no exhaustion evidence: `null`, never `0`, keeps
        // that distinct from "owns nothing" (see `isKnowledgeItemExhausted`).
        candidateItemCount: null,
      };
    }

    const learnedMap = this._getLearnedMap(craftingActor);
    const hasLearned = !!learnedMap?.[recipe.id];
    const allMatches = this._collectCandidateItems(
      recipe,
      craftingActor,
      componentSourceActors,
      snapshot
    );
    // Each candidate is judged against its OWN book's use caps (per-book, issue 511).
    const matchedItems = this._filterNonExhausted(recipe, allMatches);
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
      // Owned copies before per-book filtering, so a caller can answer "exhausted?" as
      // `candidateItemCount > 0 && matchedItems.length === 0` without rescanning (issue 1077).
      candidateItemCount: allMatches.length,
    };
  }

  /**
   * Whether a recipe's item knowledge is exhausted for a viewer: at least one matching copy is
   * owned and every one has reached its own book's `maxUses` (issue 511). Owning none is an
   * unknown/teaser state, not exhausted. It uses the learn/use paths' candidate filter, so the
   * listing's "exhausted" agrees with what the engine refuses to consume.
   *
   * @param {object|null} [args.knowledge] An {@link evaluateKnowledgeAccess} result for this
   *   recipe and actor set; when it carries `candidateItemCount` the answer is read from it with
   *   no rescan (issue 1077).
   * @param {object|null} [args.snapshot] The per-pass inventory snapshot for the rescan branch
   *   (issue 1228), which `global`/`restricted` systems with book definitions reach per row.
   */
  isKnowledgeItemExhausted({
    recipe,
    craftingActor,
    componentSourceActors = [],
    knowledge = null,
    snapshot = null,
  }) {
    const owned = knowledge?.candidateItemCount;
    if (typeof owned === 'number') {
      // Owning nothing is an "unknown"/teaser state, not an exhausted one — the same
      // reading the rescan below applies.
      return owned > 0 && (knowledge.matchedItems?.length ?? 0) === 0;
    }
    const allMatches = this._collectCandidateItems(
      recipe,
      craftingActor,
      componentSourceActors,
      snapshot
    );
    if (allMatches.length === 0) return false;
    const nonExhausted = this._filterNonExhausted(recipe, allMatches);
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
    if (viewer?.isGM) {
      return { visible: true, craftable: true, reason: 'ok' };
    }

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

      if (entry.fragments.includes(fragmentId)) continue;

      const newFragments = [...entry.fragments, fragmentId];
      const newProgress = entry.progress; // manual progress unchanged

      let totalFragmentProgress = 0;
      for (const frag of fragments) {
        if (!frag.recipeIds?.includes(recipeId)) continue;
        if (newFragments.includes(frag.id)) {
          totalFragmentProgress += Number(frag.progressValue || 0);
        }
      }
      const effectiveProgress = Math.min(100, newProgress + totalFragmentProgress);

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
   * Visibility and craftability for one recipe.
   *
   * Non-alchemy modes gate: `visible` follows the resolved `visibilityMode`, and `craftable`
   * also needs knowledge, unlock and access; `reason` is `ok`, `visibility`, `knowledge`,
   * `locked`, `teaser`, `teaser-discovered` or `missing-system`.
   *
   * Alchemy reveals rather than gates: a non-GM alchemy recipe is always `craftable` (a matched
   * signature is the only brew gate), and the mode picks what reveals it: `global` brew
   * discovery, `item` a held book (live `actor.items`, so dropping it un-reveals), `knowledge`
   * the Inventory learn path, `restricted` ("Manual") the access grant. Brew discovery reveals
   * under every mode; `learnOnCraft` only decides whether a brew writes it. Reasons are `gm`,
   * `alchemy-revealed` and `alchemy-unrevealed`.
   *
   * @param {object|null} [params.snapshot] An {@link buildInventorySnapshot} result built from
   *   these actors; a pure read optimisation (see `_collectCandidateItems`).
   * @returns {{ visible: boolean, craftable: boolean, reason: string, knowledge?: object }}
   */
  evaluateRecipeAccess({
    recipe,
    viewer,
    craftingActor,
    componentSourceActors = [],
    snapshot = null,
  }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) {
      return { visible: false, craftable: false, reason: 'missing-system' };
    }

    // Alchemy reveals rather than gates (see the docblock): always craftable for a non-GM, with
    // reveal recomputed synchronously from live `actor.items` on each build.
    if (system?.resolutionMode === 'alchemy') {
      if (viewer?.isGM) {
        return { visible: true, craftable: true, reason: 'gm', knowledge: null };
      }
      const alchemyCfg = system?.alchemy || {};
      const mode = this._getVisibilityMode(system);
      const learnedMap = this._getLearnedMap(craftingActor);

      // Brew discovery reveals under every mode; a matched brew writes `learnedRecipes` only
      // when `learnOnCraft` is on.
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
              snapshot,
            });
            revealedByMode = knowledge.hasMatchedItem;
          }
          break;
        }
        default: {
          // `global` and `knowledge` reveal from the same `learnedRecipes` read and differ
          // only in its writer (brew discovery vs the Inventory learn path).
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
          // `item` forces item-only access and `knowledge` item-or-learned, but only for an
          // authored flat mode; legacy systems keep `knowledge.mode` ('learned' stays learned).
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
            snapshot,
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

  /**
   * The corpus-wide visibility pass: every enabled recipe a viewer may see, with its access.
   * One inventory snapshot is built per pass and threaded down (issue 1077), so the per-recipe
   * cost follows the books held rather than the whole inventory. It is a per-pass value, never
   * a cache, so it cannot go stale.
   *
   * @param {string} [params.craftingSystemId] Restrict to one system.
   * @returns {Array<{recipe: object, access: object}>}
   */
  getVisibleRecipes({ viewer, craftingSystemId, craftingActor, componentSourceActors = [] }) {
    const recipes = this.recipeManager.getRecipes({
      enabled: true,
      craftingSystemId,
    });

    const snapshot = this._passSnapshot(recipes, craftingActor, componentSourceActors);

    return recipes
      .map((recipe) => ({
        recipe,
        access: this.evaluateRecipeAccess({
          recipe,
          viewer,
          craftingActor,
          componentSourceActors,
          snapshot,
        }),
      }))
      .filter((entry) => entry.access.visible);
  }

  // The per-pass inventory snapshot, via the shared `buildPassInventorySnapshot`, which owns
  // the legacy-uuid collection and the matcher so no caller builds a partial one (issue 1228).
  _passSnapshot(recipes, craftingActor, componentSourceActors) {
    return buildPassInventorySnapshot({
      craftingActor,
      componentSourceActors,
      recipes,
      resolveComponent: this._resolveComponentForItem,
    });
  }

  // The System-Validity Gate's two facts for one system (spec §System-Validity Gate). Fails
  // open (empty) when the system id is missing, so a broken collaborator never blocks a
  // craft. Callers own the GM bypass.
  _computeSystemVisibility(system) {
    if (!system?.id) return { blocksSystem: false, hiddenEntityIds: new Set() };
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: system.id }) || [];
    return computeSystemVisibility(system, {
      recipes,
      components: resolvedComponentsFor(system),
    });
  }

  guardCraftStart({ viewer, recipe, craftingActor, componentSourceActors = [] }) {
    // System-Validity Gate (spec §Crafting Guard Algorithm step 0): reject a non-GM craft when
    // the system is blocked or the recipe is `blocks: 'visibility'`, independently of listing,
    // so an API or macro call cannot bypass it. GMs bypass to diagnose a broken system, as in
    // `GatheringEngine._isSystemBlockedForGathering`.
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

    // Preconditions gate (spec §Learning Recipes → Preconditions): an authored flat mode wins
    // over the residual `knowledge.mode` default.
    if (!this._isLearnModeEnabled(system)) {
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

    // Collect the actor's real candidates rather than trusting `matchedItems`, which is empty
    // on the GM bypass: a GM who owns a matching item can learn, and one who owns none still
    // cannot.
    const allMatches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    // Candidate exhaustion is judged per candidate's OWN book (per-book caps, issue 511).
    const matchedItems = this._filterNonExhausted(recipe, allMatches);
    const selected = this._selectDeterministic(matchedItems);
    if (!selected) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.noMatchingItem };
    }

    // Resolve the selected book once: the character-prerequisite gate (issue 544) and the
    // `consumeOnLearn` deletion anchor on the owned book, not the first member book.
    const selectedDefinition = this._matchDefinitionForItem(recipe, selected.item);
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

    const next = {
      ...learnedMap,
      [recipe.id]: {
        learnedAt: Date.now(),
        sourceItemUuid: selected.item.uuid,
      },
    };
    await this._setLearnedMap(craftingActor, next);

    if (this._getRecipeItemCaps(recipe, selectedDefinition).learn.consumeOnLearn === true) {
      await selected.item.delete();
    }

    return {
      success: true,
      message: LEARN_RECIPE_MESSAGES.learnedRecipe,
      messageData: { name: recipe.name },
    };
  }

  // Whether the recipe's book has an effective learn cap (issue 511): `limitRecipes` and a
  // finite positive `maxRecipes`. An invalid `maxRecipes` is treated as uncapped, like an
  // invalid `maxUses` in `_filterNonExhausted`, rather than as a zero budget.
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

  // Capped recipes always take the item-sheet picker ('manual') and are never auto-learned on
  // drop ('auto'); uncapped ones auto-learn when `dragDropEnabled === true`, else take the
  // picker (issue 511), so one dropped book can auto-learn some recipes and route the rest.
  _isRecipeEligibleForOwnedItemLearning(recipe, mode = 'auto') {
    if (!recipe || recipe.enabled === false) return false;

    const system = this._getCraftingSystem(recipe);
    if (!system) return false;
    // Only the knowledge mode learns; shared with the learn entry points via
    // `_isLearnModeEnabled` so flat/legacy resolution cannot drift.
    if (!this._isLearnModeEnabled(system)) return false;

    const knowledge = this._getKnowledgeConfig(system);
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
      // The bulk on-drop path (`mode: 'auto'`) refuses a registered definition matched only
      // by tier 4 (`_stats.duplicateSource`), the duplicated-book ambiguity, because a silent
      // bulk grant is not reversible (issue 555). Explicit learn, the picker and display paths
      // still honour tier 4. An id-less legacy synthetic entry can only ever match at tier 4,
      // so it is exempt, or its on-drop learning would be disabled for good.
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

    // Capped recipes learn one at a time through the item-sheet picker, never in bulk, so
    // they are suppressed here per recipe; uncapped recipes in the same drop still learn.
    const matchedRecipes = this._getOwnedItemLearningCandidates({ ownedItem, mode }).filter(
      // Resolve the cap against this owned book (issue 555), not the recipe's first member
      // book: a recipe can live in several books with different caps.
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
      // A reader failing Required Knowledge or a character prerequisite is skipped silently,
      // as capped recipes are.
      const definition = this._matchDefinitionForItem(recipe, ownedItem);
      if (!this._isPrerequisiteMet(recipe, actor, definition)) continue;
      if (!this._meetsCharacterPrerequisites(recipe, actor, definition, rollData).met) continue;
      learnableRecipes.push(recipe);
    }

    // `consumeOnLearn` comes from this owned book's caps (issue 511), never the legacy
    // system-wide `knowledge.learn.consumeOnLearn`, which the normalizer rebuilds away and the
    // 1.11.0 migration strips. An unresolved definition consumes. Capped books ignore it, but
    // they are already excluded above.
    const consumedItem = learnableRecipes.some(
      (recipe) =>
        this._getRecipeItemCaps(recipe, this._matchDefinitionForItem(recipe, ownedItem)).learn
          .consumeOnLearn === true
    );

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

    let writeSucceeded;
    try {
      await this._setLearnedMap(actor, next);
      const confirmedLearnedMap = this._getLearnedMap(actor);
      writeSucceeded = preview.learnedRecipes.every(
        (recipe) => confirmedLearnedMap?.[recipe.id]?.sourceItemUuid === ownedItem.uuid
      );
    } catch {
      writeSucceeded = false;
    }
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
   * The capped recipes an actor can still learn from one owned book (issue 511), with its
   * remaining learn budget (`maxRecipes − count`, 0 once spent). Uncapped recipes learn in
   * bulk via `learnRecipesFromOwnedItem` instead.
   *
   * @returns {{recipes: object[], remainingBudget: number, maxRecipes: number|undefined, count: number}}
   */
  getLearnableRecipesFromItem({
    ownedItem,
    actor = ownedItem?.parent || ownedItem?.actor || null,
  } = {}) {
    const empty = { recipes: [], remainingBudget: 0, maxRecipes: undefined, count: 0 };
    if (!ownedItem || !actor) return empty;
    if (!this._isActorOwnedItem(ownedItem, actor)) return empty;

    // Caps resolve per recipe against the book this item is: a recipe may live in several
    // books, and several systems can share one physical item.
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
    // Scope-aware spent count: `perInstance` reads the copy's count and `total` the shared
    // world pool, which the per-copy count never reflects.
    const primary = cappedCandidates[0];
    const primaryDefinition = this._matchDefinitionForItem(primary, ownedItem);
    const count =
      this._getRecipeItemLearnScope(primary, primaryDefinition) === 'total'
        ? this._partyLearnPool.get(this._partyLearnPoolKey(primary, primaryDefinition))
        : this._getRecipeItemLearnCount(ownedItem);
    const remainingBudget = Number.isFinite(maxRecipes) ? Math.max(0, maxRecipes - count) : 0;

    const learnedMap = this._getLearnedMap(actor);
    // Exclude recipes failing Required Knowledge or a character prerequisite, which
    // `learnOneRecipeFromItem` would refuse (issue 544).
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
   * Learn one capped recipe from an owned book (issue 511) within its per-document budget:
   * writes one `learnedRecipes` entry, increments the document's learn count, and deletes the
   * book when the count reaches `maxRecipes` iff `destroyWhenSpent`. `consumeOnLearn` is
   * ignored for capped books.
   *
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

    // `total` scope draws on one shared world pool across every copy of the source item
    // instead of the per-copy count.
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

  // Learn one recipe from a `party`-mode book against the shared world pool. The slot is
  // reserved through the GM-authoritative pool before the learn is recorded, so a failed
  // increment fails closed: no learn, and the shared budget is not forked.
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

    // A `total` budget lives in a world setting, so only a GM can reserve a slot; a player's
    // refused increment gets its own reason, not "no uses left" for an untouched budget.
    // `writable` is optional so stores that cannot refuse behave as before.
    if (
      typeof this._partyLearnPool.writable === 'function' &&
      this._partyLearnPool.writable() !== true
    ) {
      return { success: false, message: LEARN_RECIPE_MESSAGES.learnRequiresGm };
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
   * Learn one recipe from a book the crafting actor or a component-source actor owns, for the
   * Inventory learn affordance (issue 511). A capped book delegates to
   * {@link learnOneRecipeFromItem}; an uncapped one (including an invalid `maxRecipes`) writes
   * one `learnedRecipes` entry and never consumes the book, so a multi-recipe book is not
   * stranded.
   *
   * @param {object|null} args.craftingActor Where the learned recipe is recorded.
   * @returns {Promise<{success: boolean, message: string, messageData?: object, destroyed?: boolean, remainingBudget?: number}>}
   */
  async learnRecipeFromOwnedBook({ recipe, craftingActor, componentSourceActors = [] }) {
    const system = this._getCraftingSystem(recipe);
    if (!system) return { success: false, message: LEARN_RECIPE_MESSAGES.systemNotFound };

    // Preconditions gate (spec §Learning Recipes → Preconditions): shared with
    // `learnRecipe` so the flat-mode requirement cannot drift between entry points.
    if (!this._isLearnModeEnabled(system)) {
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

    // An effective cap on the selected book takes the budget-enforcing capped path; an
    // invalid cap falls through to uncapped.
    const selectedDefinition = this._matchDefinitionForItem(recipe, selected.item);

    // The character-prerequisite gate is per book, so check the owned one (issue 544); the
    // capped branch re-checks the same book inside `learnOneRecipeFromItem`.
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

    const matches = this._collectCandidateItems(recipe, craftingActor, componentSourceActors);
    // Filter and select per candidate's own book caps (issue 511): a first member book that
    // does not limit uses must not skip tracking when another member book does.
    const nonExhausted = this._filterNonExhausted(recipe, matches);
    const selected = this._selectDeterministic(nonExhausted);
    if (!selected) return;

    // Anchor caps to the selected item's own book, so it exhausts and is spent by its book's
    // `maxUses`/`whenSpent`, not the first book's.
    const selectedCaps = this._getRecipeItemCaps(
      recipe,
      this._matchDefinitionForItem(recipe, selected.item)
    );
    await this._applyRecipeItemUse(selected.item, selectedCaps.item);
  }

  /**
   * Spend one use of one recipe item copy (issue 785): the single decision point for the
   * increment, the exhaustion test and the `whenSpent` disposal, shared by
   * `applyRecipeItemUseOnCraft` and the GM's `expendRecipeItemUse`.
   *
   * An uncapped book and an already-spent copy perform no write. The spent guard is the exact
   * complement of `_filterNonExhausted`, so the craft path is unchanged, and it stops a stale
   * GM row from deleting a copy under `whenSpent: 'destroyed'`. The count is re-read from the
   * document rather than a caller's snapshot, so no `await` between collection and write can
   * make it stale.
   *
   * @param {object} itemCaps the resolved `caps.item` block from `_getRecipeItemCaps`
   * @returns {Promise<'applied'|'uncapped'|'spent'>}
   */
  async _applyRecipeItemUse(item, itemCaps) {
    if (!item || itemCaps?.limitUses !== true) return APPLY_USE_OUTCOME.uncapped;

    const timesUsed = this._getRecipeItemUsage(item);
    const maxUses = Number(itemCaps.maxUses);
    // A non-finite or non-positive `maxUses` is unlimited (fail-open), as in
    // `_filterNonExhausted`, so the two agree on whether a copy has charges.
    const capped = Number.isFinite(maxUses) && maxUses > 0;
    if (capped && timesUsed >= maxUses) return APPLY_USE_OUTCOME.spent;

    const nextUses = timesUsed + 1;
    const exhausted = capped && nextUses >= maxUses;

    // On exhaustion 'destroyed' deletes the copy and 'inert' records it; `_filterNonExhausted`
    // already excludes it once `timesUsed >= maxUses`.
    if (exhausted && itemCaps.whenSpent === 'inert') {
      await this._markRecipeItemInert(item, nextUses);
      return APPLY_USE_OUTCOME.applied;
    }

    await this._setRecipeItemUsage(item, nextUses);
    if (exhausted && itemCaps.whenSpent === 'destroyed') {
      await item.delete();
    }
    return APPLY_USE_OUTCOME.applied;
  }

  // One owned copy by document id, never a uuid, via `EmbeddedCollection#get` or a
  // plain-array scan; null when the actor, collection or copy is gone.
  _getActorOwnedItemById(actor, itemId) {
    if (!actor || !itemId) return null;
    const fromCollection = actor.items?.get?.(String(itemId));
    if (fromCollection) return fromCollection;
    return [...(actor.items || [])].find((item) => String(item?.id) === String(itemId)) || null;
  }

  /**
   * Spend one use of a GM-nominated owned copy (issue 785, the Knowledge surface's Expend). No
   * visibility or knowledge gate applies, and GM authorization belongs at the manager service
   * seam. A vanished copy yields a result, never a throw; a spent or uncapped copy writes
   * nothing and returns a failure.
   *
   * @param {object} definition the recipe item definition the copy matched
   * @returns {Promise<{ success: boolean, message: string, messageData?: object }>}
   */
  async expendRecipeItemUse(actor, itemId, definition) {
    const item = this._getActorOwnedItemById(actor, itemId);
    if (!item) {
      return { success: false, message: MANAGE_KNOWLEDGE_MESSAGES.noItem };
    }

    const outcome = await this._applyRecipeItemUse(item, this._capsForDefinition(definition).item);
    if (outcome === APPLY_USE_OUTCOME.spent) {
      return { success: false, message: MANAGE_KNOWLEDGE_MESSAGES.alreadySpent };
    }
    if (outcome !== APPLY_USE_OUTCOME.applied) {
      return { success: false, message: MANAGE_KNOWLEDGE_MESSAGES.noLimitedUses };
    }
    return {
      success: true,
      message: MANAGE_KNOWLEDGE_MESSAGES.useExpended,
      messageData: { name: item.name },
    };
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

  /**
   * Forget every learned entry `isStale` rejects, on the actors this client may write
   * (issue 970): `cleanupLearnedRecipes` runs on every client with no GM relay. Ids come from
   * the entry-boundary reader, never `Object.keys` (issue 1143): `Document#update` nests a
   * dotted id, so a top-level key is only its first segment, and deleting it removes every
   * sibling. See `recipeKeyedFlagEntries.js`.
   */
  async _forgetLearnedRecipesWhere(isStale) {
    for (const actor of selectWritableActors(game.actors)) {
      const learned = this._getLearnedMap(actor);
      const staleIds = [...readLearnedRecipeEntries(learned).keys()].filter(isStale);
      if (staleIds.length === 0) continue;
      // The shared deletion primitive uses forced deletions, since a map rebuilt through
      // `setFlag` merges and never deletes. `freeLearnBudget: false`: recipe deletion is
      // content management, not an in-fiction un-learn.
      await this.forgetLearnedRecipes(actor, staleIds, { freeLearnBudget: false });
    }
  }

  /**
   * The corpus-derived prune: drop learned entries naming a recipe absent from the corpus. It
   * infers deletion from absence, so it is only safe against a complete **Valid Id Basis**
   * (`data-models/spec.md` § Valid Id Basis); `startupPassComposition.js` and
   * `mutationCleanupComposition.js` gate it.
   */
  async cleanupLearnedRecipes(validRecipeIds = new Set()) {
    await this._forgetLearnedRecipesWhere((id) => !validRecipeIds.has(id));
  }

  /**
   * The subject-targeted prune (issue 1226): drop learned entries naming recipes the caller
   * just deleted. The mutation-time fallback for {@link cleanupLearnedRecipes} when the corpus
   * cannot be attested complete; it needs no Valid Id Basis, and an entry for a never-read
   * recipe survives.
   */
  async forgetDeletedRecipes(recipeIds) {
    const targets = new Set(
      [...(recipeIds || [])].map((id) => String(id ?? '').trim()).filter(Boolean)
    );
    if (targets.size === 0) return;
    await this._forgetLearnedRecipesWhere((id) => targets.has(id));
  }

  /**
   * The shared crafting-knowledge deletion primitive (issue 773) behind erase-one and the
   * reset grains. Removes each id from `flags.fabricate.fabricate.learnedRecipes` (and
   * `discoveryProgress` when `clearDiscovery`) with forced deletions built by
   * `forcedDeletionEntry`, batched into one `Actor#update`. Never a rebuilt map through
   * `setFlag` alone: that merge keeps keys, so the entry resurrects on reload.
   *
   * Both stores are read through the entry-boundary reader (issue 1143), since a dotted id is
   * persisted as a subtree. An id a batched deletion cannot remove exactly (an unsafe segment,
   * another entry nested inside it, or `__proto__`/`constructor`/`prototype`) routes the store
   * to a delete-then-write fallback: two sequential awaited operations, never one update, which
   * `mergeObject` may apply delete-after-insert and wipe the map.
   *
   * `freeLearnBudget` (default true, so a reset actor can re-learn) frees one slot per cleared
   * entry against a still-held source copy at its current `learnScope`. Orphans (no
   * `sourceItemUuid`, an unheld source, an unresolvable recipe) free nothing, since a `total`
   * pool key cannot be rebuilt once the recipe is gone.
   *
   * @param {boolean} [options.clearDiscovery=false] Also clear each id's `discoveryProgress`
   *   entry (the reset grains pass true).
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  async forgetLearnedRecipes(
    actor,
    recipeIds,
    { freeLearnBudget = true, clearDiscovery = false } = {}
  ) {
    if (!actor || typeof actor.update !== 'function') {
      return { success: false, count: 0 };
    }

    const requested = [...new Set((recipeIds || []).map(String))];

    // One plan per recipe-id-keyed store, so the learned and discovery halves share one
    // algorithm rather than two copies.
    const plans = [this._planLearnedClear(actor, requested)];
    if (clearDiscovery) plans.push(this._planDiscoveryClear(actor, requested));

    const learnedPlan = plans[0];
    if (plans.every((plan) => plan.ids.length === 0)) {
      return { success: true, count: 0 };
    }

    // Capture budget context BEFORE any deletion (the entry's `sourceItemUuid` is
    // needed to resolve the held copy) — budget only exists for LEARNED entries.
    const budgetEntries = freeLearnBudget
      ? learnedPlan.ids.map((id) => ({ recipeId: id, entry: learnedPlan.entries.get(id) }))
      : [];

    // Batch every in-place deletion, across both stores, into one update; a store holding an
    // id that cannot be deleted in place takes the fallback below instead.
    const updates = Object.assign({}, ...plans.map((plan) => this._inPlaceDeletions(plan)));
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }

    // The two-step fallback, learned store first, preserving the original order.
    for (const plan of plans) {
      if (plan.needsRebuild) await this._rebuildStoreWithoutIds(actor, plan);
    }

    for (const { recipeId, entry } of budgetEntries) {
      await this._freeLearnBudgetForEntry(actor, recipeId, entry);
    }

    return { success: true, count: learnedPlan.ids.length };
  }

  // The doubly-nested flag container both recipe-id-keyed stores live under.
  // `normalizeFlagKey` prefixes `fabricate.` and the flattened update path nests that
  // under the `fabricate` scope, so the real path carries the namespace twice.
  get _nestedFlagPath() {
    return `flags.${FABRICATE_FLAG_NAMESPACE}.${FABRICATE_FLAG_NAMESPACE}`;
  }

  /**
   * How one recipe-id-keyed store must be cleared (issue 1143). `entries` is the entry-boundary
   * view, not the raw map. `needsRebuild` is true when any requested id cannot be removed by a
   * batched per-id deletion without destroying something else ({@link isDirectlyDeletableId});
   * it is per store because the fallback rewrites the whole map.
   */
  _planStoreClear(flagKey, entries, requested, write) {
    const ids = requested.filter((id) => entries.has(id));
    return {
      flagKey,
      entries,
      ids,
      write,
      needsRebuild: ids.some((id) => !isDirectlyDeletableId(entries, id)),
    };
  }

  _planLearnedClear(actor, requested) {
    return this._planStoreClear(
      'learnedRecipes',
      readLearnedRecipeEntries(this._getLearnedMap(actor)),
      requested,
      (target, map) => this._setLearnedMap(target, map)
    );
  }

  // The discovery store has its OWN entry shape, which is why the reader is
  // parameterised on marker fields rather than hard-coding the learned map's.
  _planDiscoveryClear(actor, requested) {
    return this._planStoreClear(
      'discoveryProgress',
      readDiscoveryProgressEntries(this._getDiscoveryProgressMap(actor)),
      requested,
      (target, map) => this._setDiscoveryMap(target, map)
    );
  }

  // One plan's in-place deletion entries, or nothing when the store must be rebuilt; merged
  // so every store deletes in one `Actor#update`. An id the helper refuses sets
  // `needsRebuild`, so this must run before the two-step loop reads it.
  _inPlaceDeletions(plan) {
    if (plan.needsRebuild) return {};
    const parentPath = `${this._nestedFlagPath}.${plan.flagKey}`;
    const entries = plan.ids.map((id) => forcedDeletionEntry(parentPath, id));
    if (entries.some((entry) => !entry)) {
      plan.needsRebuild = true;
      return {};
    }
    return Object.fromEntries(entries);
  }

  /**
   * The delete-then-write fallback: drop the parent key first, then re-write the retained map
   * so the merge lands on an absent key. Two sequential awaited operations, never one update,
   * which `mergeObject` may apply delete-after-insert. The retained map is rebuilt from the
   * entry view, not the raw top level (issue 1143), or the just-deleted entry is written back.
   * A retained dotted id re-splits on this write, the documented fidelity limit; no surviving
   * entry is destroyed.
   */
  async _rebuildStoreWithoutIds(actor, plan) {
    const [path, deletion] = forcedDeletionEntry(this._nestedFlagPath, plan.flagKey);
    await actor.update({ [path]: deletion });
    const cleared = new Set(plan.ids);
    const retained = buildFlagMapFromEntries([...plan.entries].filter(([id]) => !cleared.has(id)));
    await plan.write(actor, retained);
  }

  // Free one learn slot for a cleared entry against the current scope of a still-held source
  // copy. Frees nothing for an auto-learn entry (no `sourceItemUuid`), an unheld book, or an
  // orphan recipe id, whose `total` pool key cannot be rebuilt.
  async _freeLearnBudgetForEntry(actor, recipeId, entry) {
    const sourceItemUuid = entry?.sourceItemUuid;
    if (!sourceItemUuid) return;
    const heldItem = [...(actor.items || [])].find((item) => item?.uuid === sourceItemUuid);
    if (!heldItem) return;
    const recipe = this._getRecipeById(recipeId);
    if (!recipe) return;
    const definition = this._matchDefinitionForItem(recipe, heldItem);
    if (this._getRecipeItemLearnScope(recipe, definition) === 'total') {
      await this._partyLearnPool.decrement(this._partyLearnPoolKey(recipe, definition));
      return;
    }
    const current = this._getRecipeItemLearnCount(heldItem);
    await this._setRecipeItemLearnCount(heldItem, current - 1);
  }

  /**
   * Reset one system's learned knowledge for one actor (issue 773): every learned entry whose
   * recipe belongs to `systemId`, plus its `discoveryProgress`. Orphan keys whose recipe no
   * longer resolves stay, since they cannot be attributed to a system.
   *
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  async forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget = true } = {}) {
    if (!actor || typeof actor.update !== 'function') {
      return { success: false, count: 0 };
    }
    // Entry-boundary ids, not `Object.keys` (issue 1143): a dotted id's first segment
    // resolves to no recipe, so the reset would skip it.
    const ids = [...readLearnedRecipeEntries(this._getLearnedMap(actor)).keys()].filter(
      (id) => this._getRecipeById(id)?.craftingSystemId === systemId
    );
    return this.forgetLearnedRecipes(actor, ids, { freeLearnBudget, clearDiscovery: true });
  }

  /**
   * Reset all learned knowledge for one actor across every system (issue 773): every learned
   * key including orphans, plus every `discoveryProgress` entry.
   *
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  async forgetAllLearnedRecipes(actor, { freeLearnBudget = true } = {}) {
    if (!actor || typeof actor.update !== 'function') {
      return { success: false, count: 0 };
    }
    // Entry-boundary ids for both stores (issue 1143): `Object.keys` yields a dotted id's
    // first segment, whose deletion takes every sibling with it.
    const ids = [
      ...new Set([
        ...readLearnedRecipeEntries(this._getLearnedMap(actor)).keys(),
        ...readDiscoveryProgressEntries(this._getDiscoveryProgressMap(actor)).keys(),
      ]),
    ];
    return this.forgetLearnedRecipes(actor, ids, { freeLearnBudget, clearDiscovery: true });
  }
}
