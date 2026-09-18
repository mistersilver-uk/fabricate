import { getFabricateFlag, isSafeFlagKeySegment } from '../config/flags.js';
import { SETTING_KEYS } from '../config/settings.js';
import { matchGatheringTools, classifyGatheringToolStates } from '../gatheringToolRuntime.js';
import { getIngredientComponentId, getMatchHandler } from '../models/match/matchTypes.js';
import { DEFAULT_RECIPE_IMAGE, Recipe } from '../models/Recipe.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import {
  accumulateItemEssences,
  findMatchingComponent,
  resolveItemEssences,
} from '../utils/essenceResolver.js';
import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';
import { diceEngine } from '../utils/rollFormulaRollability.js';
import {
  itemResolvesToComponent,
  itemResolvesToTool,
  itemIsToolByDurableIdentity,
} from '../utils/sourceUuid.js';

import { resolveCharacterPrerequisiteLibrary } from './characterLibraries.js';
import { evaluatePrerequisite } from './characterPrerequisites.js';
import {
  craftingDataChange,
  emitCraftingDataChanged,
  PendingChangeDomains,
} from './craftingDataChange.js';
import { applyDefinitionChange } from './CraftingDefinitionRepository.js';
import {
  buildCurrencyAffordProbe,
  getCurrencyRequirementConfig,
  resolveCurrencyContext,
} from './currencyAffordance.js';
import { formatCurrencyRequirement, normalizeCurrencyUnit } from './currencyProfile.js';
import { ALL_INVALIDATION_DOMAINS, domainsForRecipeFields } from './invalidationDomains.js';
import { readStackQuantity } from './itemStackQuantity.js';
import { runGatedMutationCleanup } from './mutationCleanupComposition.js';
import { RecipeActivationError } from './RecipeActivationError.js';
import { RecipePersistenceError } from './RecipePersistenceError.js';
import {
  corpusDelta,
  patchCorpusInPlace,
  REVISION_SCOPES,
  RevisionRegistry,
} from './revisionTokens.js';
import {
  resolvedComponentsFor,
  resolvedEssencesFor,
  resolvedToolsFor,
} from './scopedEntityReads.js';
import { SettingsCraftingDefinitionRepository } from './SettingsCraftingDefinitionRepository.js';
import { SignatureValidator } from './SignatureValidator.js';
import { selectedIngredientItems } from './stageReadiness.js';
import { computeSystemVisibility } from './systemValidation.js';
import { ingredientSetToolsAreActive, resolveToolPrerequisites } from './toolCheckBonus.js';

const DEFAULT_RECIPE_IMG = DEFAULT_RECIPE_IMAGE;
const FALLBACK_RECIPE_IMG = 'icons/sundries/documents/document-bound-white-tan.webp';
const FALLBACK_COMPONENT_IMG = 'icons/svg/item-bag.svg';
// Foundry's generic default Item image. On a MATERIAL tile it is a sentinel meaning "no image"
// (issue 917), so a tile resolving to it draws its glyph instead.
const GENERIC_ITEM_IMG = 'icons/svg/item-bag.svg';
// A currency match never resolves to an inventory item, so it always shows a coin icon.
const FALLBACK_CURRENCY_IMG = 'icons/svg/coins.svg';

/** Whether a retained alchemy signature report's guard still describes the world (issue 1074). */
function signatureGuardsMatch(previous, next) {
  return (
    previous.recipesToken === next.recipesToken &&
    previous.systemToken === next.systemToken &&
    previous.recipeMap === next.recipeMap &&
    previous.recipeCount === next.recipeCount &&
    previous.components === next.components &&
    previous.componentCount === next.componentCount &&
    previous.members === next.members
  );
}

/** A recipe in its comparable, persisted form; a plain fixture object stands in for its own. */
function projectRecipe(recipe) {
  return typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
}

/** Why an import skipped a recipe: `invalid`, or `signature-conflict` when EVERY issue is an
 * alchemy signature collision (issue 1167). */
function importConflictReason(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const collisionOnly =
    list.length > 0 && list.every((issue) => issue?.code === 'signatureCollision');
  return collisionOnly ? 'signature-conflict' : 'invalid';
}

/** The repository the manager builds when the caller injects none. The adapter takes a `corpus`
 * thunk because `game.settings.set` has no addressable element (issue 1089). */
function buildDefaultRecipeRepository({ corpus }) {
  return new SettingsCraftingDefinitionRepository({
    settingKey: SETTING_KEYS.RECIPES,
    corpus,
    hydrate: (raw) => Recipe.fromJSON(raw),
    serialize: (recipe) => recipe.toJSON(),
    scopeOf: (recipe) => recipe?.craftingSystemId ?? null,
  });
}

/** Manages recipe storage, retrieval, and CRUD operations */
export class RecipeManager {
  /** Every `deps` entry defaults to the `game.fabricate` globals or the settings-backed adapter
   * (issues 1072, 1089), so existing constructions are unaffected. */
  constructor({
    getCraftingSystem = null,
    getCraftingSystemManager = null,
    repository = null,
    // The world currency configuration (issue 1278); absent, the affordance resolver falls back.
    currencyConfigStore = null,
    characterLibrariesStore = null,
  } = {}) {
    this.currencyConfigStore = currencyConfigStore;
    // The world character libraries (issue 1308); absent, the module registry is the fallback.
    this._characterLibrariesStore = characterLibrariesStore;
    this.recipes = new Map();
    this.initialized = false;
    // The revision-token registry this manager mints from (issue 1076). Per manager, never a
    // module singleton: two managers in one test process must not share counters.
    this._revisions = new RevisionRegistry();
    // The retained cohort, rebuilt lazily. Holds IDS, so only an add/remove/move invalidates it.
    this._cohortCache = null;
    // The retained per-system alchemy signature reports (issue 1074), each with its guard.
    /** @type {Map<string, {guard: object, report: object}>} */
    this._signatureReports = new Map();
    // The unconsumed delta from the most recent `reload()` (issue 1078).
    /** @type {import('./revisionTokens.js').CorpusDelta|null} */
    this._reloadDelta = null;
    // The invalidation domains attributed since the last announcement (issue 1078 part B1).
    this._pendingDomains = new PendingChangeDomains();
    this.getCraftingSystem = typeof getCraftingSystem === 'function' ? getCraftingSystem : null;
    this._getCraftingSystemManager =
      typeof getCraftingSystemManager === 'function' ? getCraftingSystemManager : null;
    // The SETTINGS adapter shares THIS map rather than mirroring it — a second ordered map would
    // silently corrupt the persisted array's order — but the manager owns every in-memory write.
    this._repository = repository ?? buildDefaultRecipeRepository({ corpus: () => this.recipes });
  }

  /** The crafting-system manager collaborator (issue 1072), resolved per call and never cached:
   * `game.fabricate` is assembled during `ready`, after the managers are constructed. */
  _systemManager() {
    if (this._getCraftingSystemManager) return this._getCraftingSystemManager() ?? null;
    return game.fabricate?.getCraftingSystemManager?.() ?? null;
  }

  /** The seam bag handed to the currency affordance layer, so the per-recipe probe reaches the
   * injected collaborator rather than the `game.fabricate` global (issue 1072). */
  _currencySeams() {
    return {
      getCraftingSystemManager: () => this._systemManager(),
      getCurrencyConfig: () => this.currencyConfigStore?.get(),
    };
  }

  /** A {@link SignatureValidator} source shared by the enable-time gate and the post-mutation
   * reconciliation (issue 1072); the gate supplies its own `getRecipesForSystem`, because it
   * substitutes the candidate for its still-disabled stored copy. */
  _signatureSource(systemManager, getRecipesForSystem) {
    return {
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem,
      getComponentsForSystem: (id) =>
        typeof systemManager.getComponentsForSystem === 'function'
          ? systemManager.getComponentsForSystem(id)
          : resolvedComponentsFor(systemManager.getSystem(id)),
    };
  }

  /** Ensure only GMs can mutate recipe state. */
  _assertGM(action) {
    if (!game.user?.isGM) {
      throw new Error(`GM permissions required: ${action}`);
    }
  }

  /** Reject a recipe id that cannot serve as a durable-flag MAP KEY (issue 1143):
   * `Document#update` dot-expands an `ObjectField`, so a dotted id becomes a SUBTREE. */
  _assertValidRecipeId(id) {
    if (!isSafeFlagKeySegment(id)) {
      throw new Error(
        `Invalid recipe id "${id}": a recipe id must match /^[A-Za-z0-9_-]+$/ (no dots or spaces), because it is used as a durable-flag map key in learnedRecipes and discoveryProgress.`
      );
    }
  }

  /** Initialize the recipe manager and load saved recipes */
  async initialize() {
    if (this.initialized) return;

    // Load recipes through the definition repository (issue 1089)
    for (const recipe of await this._repository.loadAll()) {
      this.recipes.set(recipe.id, recipe);
    }
    this._advanceRecipeRevision();

    this.initialized = true;
    console.log(`Fabricate | Loaded ${this.recipes.size} recipes`);
  }

  /**
   * Persist a recipe mutation through the definition repository (issue 1089). Argument-less
   * `save()` is the whole-corpus write; `save({put|delete|batch})` names the records touched.
   *
   * > A named `save({put|delete|batch})` may only be issued for records the SAME operation
   * > created, replaced or removed; a site mutating a stored recipe IN PLACE must flush
   * > through the argument-less whole-corpus `save()`.
   */
  async save(change = null) {
    await applyDefinitionChange(this._repository, change, this.recipes.values());
  }

  /** Re-read the persisted recipes setting into the in-memory map — the un-guarded,
   * non-persisting refresh path for a replicated change on ANOTHER client. {@link corpusDelta}
   * advances only the systems that moved and preserves container identity (issue 1078). */
  reload() {
    // Optional repository capability: `null` means the backend has no synchronous replicated
    // snapshot, so reloading is a no-op rather than a wrong answer.
    const savedRecipes = this._repository.readReplicatedSnapshot();
    // Every reload replaces the pending delta, including a reload that reads nothing, so a
    // stale delta can never be consumed after a later one.
    this._reloadDelta = null;
    if (!savedRecipes) return false;
    return this._adoptCorpus(savedRecipes);
  }

  /** Replace the in-memory corpus with a freshly read one, preserving as much identity as the
   * delta licenses. Extracted from {@link RecipeManager#reload} for an async `loadAll()` (1232). */
  _adoptCorpus(savedRecipes) {
    const next = new Map();
    for (const recipe of savedRecipes) {
      next.set(recipe.id, recipe);
    }
    const delta = corpusDelta(this.recipes.values(), next.values(), { project: projectRecipe });
    this._reloadDelta = delta;
    this.initialized = true;
    if (!delta.changed) return false;

    if (delta.reordered) {
      this.recipes = next;
      const touched = new Set();
      for (const recipe of next.values()) touched.add(recipe?.craftingSystemId);
      // Also drops the cohort index, keyed on the map object. A reordering is attributable to no
      // record, so no fact class can be ruled out and the delta routes BROADLY (issue 1078).
      this._advanceRecipeRevision(...touched);
      this._advanceFactScopes([], ...touched);
      return true;
    }

    const touched = new Set();
    for (const entry of delta.perRecord.values()) {
      // A recipe MOVED between systems names both, exactly as `updateRecipe` does.
      const owners = [entry.before?.craftingSystemId, entry.after?.craftingSystemId].filter(
        (systemId) => systemId != null
      );
      for (const systemId of owners) touched.add(systemId);
      // The replicated half of the attribution: the delta already names the top-level keys
      // that moved, so a remote client narrows on exactly what the writer narrowed on.
      this._advanceFactScopes(domainsForRecipeFields(entry.fields), ...owners);
    }
    patchCorpusInPlace(this.recipes, next, delta);
    // Also drops the cohort index, whose token clause this advance would fail anyway.
    this._advanceRecipeRevision(...touched);
    return true;
  }

  /** The invalidation scopes of the most recent REPLICATED change (issue 1078 part B1). A
   * `reordered` delta yields NO scopes, which every consumer routes broadly. */
  consumeReplicatedChangeScopes() {
    const delta = this.consumeReloadDelta();
    if (!delta?.changed || delta.reordered) return [];
    const scopes = [];
    for (const entry of delta.perRecord.values()) {
      const domains = domainsForRecipeFields(entry.fields);
      const owners = new Set(
        [entry.before?.craftingSystemId, entry.after?.craftingSystemId].filter(
          (systemId) => systemId != null
        )
      );
      if (owners.size === 0) owners.add(null);
      for (const systemId of owners) scopes.push({ systemId, domains });
    }
    return scopes;
  }

  /** The delta from the most recent {@link reload}, cleared by this read (issue 1078). One-shot:
   * re-reading a retained delta would invalidate work twice for one change. */
  consumeReloadDelta() {
    const delta = this._reloadDelta;
    this._reloadDelta = null;
    return delta;
  }

  /** Announce a recipe change: the PUBLISHED legacy hook, then the scoped signal carrying
   * everything attributed since the last announcement, both from one place so a mutation path
   * cannot acquire one without the other. */
  _notifyRecipesChanged(action, details = {}) {
    globalThis.Hooks?.callAll?.('fabricate.recipesChanged', {
      action,
      recipes: this.getRecipes(),
      ...details,
    });
    emitCraftingDataChanged(
      craftingDataChange({ source: 'recipes', scopes: this._pendingDomains.drain() })
    );
  }

  /** The public announcement seam, for a batch caller that suppressed the per-record hooks, so a
   * caller that mutated something OUTSIDE this manager can still have the signal name it. */
  notifyRecipesChanged({ domains = null, systemIds = [], ...details } = {}) {
    if (domains) this._attributeChange(domains, ...systemIds);
    this._notifyRecipesChanged(details.action || 'external', details);
  }

  /** Create a new recipe. `notify=false` suppresses the per-record hook, `allowIncomplete=true`
   * persists a non-craftable authoring shell, `persist=false` skips the whole-array world write. */
  async createRecipe(recipeData, options = {}) {
    this._assertGM('create recipe');

    const recipe = new Recipe(recipeData);
    this._assertValidRecipeId(recipe.id);
    const validation = this._validateRecipeForPersistence(recipe, {
      requireComplete: !options.allowIncomplete,
    });

    if (!validation.valid) {
      // A structural/reference save failure carries coded, id-free issues the UI can localize
      // (issue 595); `.message` keeps the headless English aggregate.
      throw new RecipePersistenceError('create', recipe.name, validation.issues);
    }

    // A recipe may only be created active when fully valid: a drafting create is not an enable
    // action, so an invalid draft is born disabled, and a strict active create is rejected.
    if (recipe.enabled === true) {
      const activation = this._validateRecipeForActivation(recipe);
      if (!activation.valid) {
        if (options.allowIncomplete) {
          recipe.enabled = false;
        } else {
          throw new RecipeActivationError(recipe.name, activation.issues);
        }
      }
    }

    this.recipes.set(recipe.id, recipe);
    // A whole record arrived, so every fact class it can express is new.
    this._recordChange(ALL_INVALIDATION_DOMAINS, recipe.craftingSystemId);
    if (options.persist !== false) {
      await this.save({ put: recipe });
    }
    console.debug(`Fabricate | Created recipe "${recipe.name}" (${recipe.id})`);

    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${recipe.name}" created`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('create', { recipeId: recipe.id });
    }
    return recipe;
  }

  /** Update an existing recipe. Same `notify` / `allowIncomplete` / `persist` option gates as
   * {@link RecipeManager#createRecipe}. */
  async updateRecipe(recipeId, updates, options = {}) {
    this._assertGM('update recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    const merged = {
      ...recipe.toJSON(),
      ...updates,
      id: recipeId,
    };
    const updatedRecipe = Recipe.fromJSON(merged);
    const validation = this._validateRecipeForPersistence(updatedRecipe, {
      requireComplete: !options.allowIncomplete,
    });

    if (!validation.valid) {
      // See createRecipe: a coded, id-free persistence error the UI can localize (issue 595), so
      // an ordinary save no longer leaks a set/group id into the toast.
      throw new RecipePersistenceError('update', updatedRecipe.name, validation.issues);
    }

    // Only an explicit transition INTO the enabled state requires full validity. Edits to an
    // already-enabled recipe, and any disable, persist on structural validity alone.
    if (updatedRecipe.enabled === true && recipe.enabled !== true) {
      const activation = this._validateRecipeForActivation(updatedRecipe);
      if (!activation.valid) {
        throw new RecipeActivationError(updatedRecipe.name, activation.issues);
      }
    }

    // Attributed BEFORE the map write, while `recipe` is still the stored copy, so the domains
    // come from the fields that actually moved (issue 1078 acceptance criterion 3).
    const editedDomains = this._domainsForRecipeEdit(recipe, updatedRecipe);
    this.recipes.set(recipeId, updatedRecipe);
    // Both systems, because an edit that MOVES a recipe must also invalidate a consumer
    // watching the system it left (issue 1076).
    this._recordChange(editedDomains, recipe.craftingSystemId, updatedRecipe.craftingSystemId);
    if (options.persist !== false) {
      await this.save({ put: updatedRecipe });
    }
    console.debug(`Fabricate | Updated recipe "${updatedRecipe.name}" (${updatedRecipe.id})`);
    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${updatedRecipe.name}" updated`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('update', { recipeId });
    }
    return updatedRecipe;
  }

  /** Whether the activation gate would ACCEPT this recipe — the ONE predicate behind the pill,
   * the pre-flight count and the bulk write's gate (issue 1010). It evaluates a CLONE with
   * `enabled: true`, because the validator scans only enabled recipes and would filter the
   * candidate out of its OWN scan; a LOWER BOUND for collisions a BATCH itself creates. */
  canActivateRecipe(recipeOrId) {
    const stored = typeof recipeOrId === 'string' ? this.recipes.get(recipeOrId) : recipeOrId;
    if (!stored) {
      // Id-free (issue 595): a stale id names nothing a GM could act on anyway.
      const message = 'Recipe not found';
      return { valid: false, errors: [message], issues: [{ code: null, params: {}, message }] };
    }

    const source = typeof stored.toJSON === 'function' ? stored.toJSON() : stored;
    return this._validateRecipeForActivation(Recipe.fromJSON({ ...source, enabled: true }));
  }

  /** Delete a recipe. This is the LEAF, and it does NOT cascade the recipe-item membership prune
   * (issue 1132): {@link CraftingSystemManager#deleteRecipes} is the entry point that does, and
   * every GM-initiated delete routes through it bar `deleteSystem` and the importer's orphan
   * prune. `cleanupFlags=false` and `persist=false` let a batch caller run ONE flag pass and ONE
   * `save()` for the whole batch. */
  async deleteRecipe(recipeId, options = {}) {
    this._assertGM('delete recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    this.recipes.delete(recipeId);
    // A whole record left, so every fact class it expressed is gone with it.
    this._recordChange(ALL_INVALIDATION_DOMAINS, recipe.craftingSystemId);
    if (options.persist !== false) {
      await this.save({ delete: recipeId });
    }
    if (options.cleanupFlags !== false) {
      await this._cleanupFlagsAfterRecipeMutation({ removedRecipeIds: [recipeId] });
    }
    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${recipe.name}" deleted`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('delete', { recipeId });
    }
  }

  /** Delete a SET of recipes in ONE `recipes` world write, guarding the in-memory map against a
   * refused write (issue 1132): the singular form deletes before it persists. */
  async deleteRecipes(recipeIds, options = {}) {
    this._assertGM('delete recipes');

    const requested = [
      ...new Set([...(recipeIds || [])].map((id) => String(id ?? '').trim()).filter(Boolean)),
    ];
    const removed = requested.map((id) => this.recipes.get(id)).filter(Boolean);
    if (removed.length === 0) return { deleted: 0, recipeIds: [], recipes: [] };

    const removedIds = removed.map((recipe) => String(recipe.id));
    const restorePoint = new Map(this.recipes);
    for (const id of removedIds) this.recipes.delete(id);
    // Whole records left, so every fact class they expressed is gone. Also the only
    // entity-revision advance on this path, which before issue 1078 left every token stale.
    this._recordChange(
      ALL_INVALIDATION_DOMAINS,
      ...new Set(removed.map((recipe) => recipe.craftingSystemId))
    );

    try {
      await this.save();
    } catch (error) {
      this.recipes = restorePoint;
      throw error;
    }

    if (options.cleanupFlags !== false) {
      await this._cleanupFlagsAfterRecipeMutation({ removedRecipeIds: removedIds });
    }
    if (options.notify !== false) {
      ui.notifications.info(
        removed.length === 1
          ? `Recipe "${removed[0].name}" deleted`
          : `Deleted ${removed.length} recipes`
      );
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('delete', { recipeIds: removedIds });
    }

    return { deleted: removed.length, recipeIds: removedIds, recipes: removed };
  }

  /** Run ONE bulk actor-flag cleanup pass after a batch of deletions. A batch caller MUST name
   * what it removed (issue 1226): `removedRecipeIds` is the gated sweep's fallback. */
  async cleanupOrphanedRecipeFlags({ removedRecipeIds = [] } = {}) {
    await this._cleanupFlagsAfterRecipeMutation({ removedRecipeIds });
  }

  /** Get a recipe by id, or `null`. */
  getRecipe(recipeId) {
    return this.recipes.get(recipeId) || null;
  }

  /** The current revision token of one scope (issue 1076), per {@link module:revisionTokens}.
   * Consumers compare with `===` and never advance one. */
  revision(scope = REVISION_SCOPES.recipes) {
    return this._revisions.read(scope);
  }

  /** Advance the recipe revision tokens and drop the cohort index. A move between systems names
   * BOTH, because a consumer watching the system the recipe LEFT must also stop trusting it. */
  _advanceRecipeRevision(...systemIds) {
    this._cohortCache = null;
    const scopes = systemIds
      .filter((systemId) => systemId != null)
      .map((systemId) => REVISION_SCOPES.recipesOfSystem(systemId));
    this._revisions.advance(REVISION_SCOPES.recipes, ...scopes);
  }

  /** Advance the `facts:<domain>:<systemId>` token of every named pair (issue 1078 part B1). An
   * omitted or EXPLICITLY empty `domains` set advances EVERY fact scope of every named system. */
  _advanceFactScopes(domains, ...systemIds) {
    const advanced =
      Array.isArray(domains) && domains.length > 0 ? domains : ALL_INVALIDATION_DOMAINS;
    for (const systemId of systemIds) {
      if (systemId == null) continue;
      this._revisions.advance(...advanced.map((domain) => REVISION_SCOPES.facts(domain, systemId)));
    }
  }

  /** Attribute a LOCAL mutation. Replicated changes are announced by `settingChangeBridge.js`
   * from the reload delta instead, so recording them here would widen the next announcement. */
  _attributeChange(domains, ...systemIds) {
    this._advanceFactScopes(domains, ...systemIds);
    this._pendingDomains.record(domains, ...systemIds);
  }

  /** The ONE mutation-site call: advance the entity revisions AND attribute the change.
   * `tests/invalidation-domain-attribution.test.js` counts the two direct callers. */
  _recordChange(domains, ...systemIds) {
    this._advanceRecipeRevision(...systemIds);
    this._attributeChange(domains, ...systemIds);
  }

  /** The domains a REPLACEMENT of one stored recipe belongs to. Uses {@link corpusDelta}, the same
   * comparison `reload()` runs, so a local edit and its replicated copy agree. */
  _domainsForRecipeEdit(previous, next) {
    if (!previous || !next) return [...ALL_INVALIDATION_DOMAINS];
    const delta = corpusDelta([previous], [next], { project: projectRecipe });
    if (delta.reordered) return [...ALL_INVALIDATION_DOMAINS];
    const entry = [...delta.perRecord.values()][0];
    return entry ? domainsForRecipeFields(entry.fields) : [];
  }

  /** The retained `craftingSystemId -> recipe id[]` cohort index (issue 1076). It stores IDS, so
   * only an add, delete or move can invalidate it. */
  _recipeCohorts() {
    const token = this._revisions.read(REVISION_SCOPES.recipes);
    const cached = this._cohortCache;
    const warm =
      cached &&
      cached.map === this.recipes &&
      cached.size === this.recipes.size &&
      cached.token === token;
    if (warm) return cached.cohorts;
    const cohorts = new Map();
    for (const [recipeId, recipe] of this.recipes) {
      const key = recipe?.craftingSystemId;
      const bucket = cohorts.get(key);
      if (bucket) bucket.push(recipeId);
      else cohorts.set(key, [recipeId]);
    }
    this._cohortCache = { map: this.recipes, size: this.recipes.size, token, cohorts };
    return cohorts;
  }

  /** The retained alchemy signature report for one system (issue 1074), reusable only when ALL
   * THREE guard clauses hold — TOKENS, CONTAINERS, and the in-place MEMBERS clause. */
  _alchemySignatureReport(systemId, systemManager) {
    const cached = this._signatureReports.get(systemId);
    const guard = this._captureSignatureReportGuard(systemId, systemManager, cached?.guard);
    if (cached && signatureGuardsMatch(cached.guard, guard)) return cached.report;

    const validator = new SignatureValidator(
      this._signatureSource(systemManager, (id) => this.getRecipes({ craftingSystemId: id }))
    );
    const report = validator.compileReport(systemId);
    if (!report) {
      this._signatureReports.delete(systemId);
      return null;
    }
    this._signatureReports.set(systemId, { guard, report });
    return report;
  }

  /** Read the three-clause guard for a system's signature report. With `previousGuard`, clause 3
   * returns that SAME member array on a match, so a warm read allocates nothing. */
  _captureSignatureReportGuard(systemId, systemManager, previousGuard = null) {
    const system = systemManager.getSystem?.(systemId) ?? null;
    const components =
      typeof systemManager.getComponentsForSystem === 'function'
        ? systemManager.getComponentsForSystem(systemId)
        : resolvedComponentsFor(system);
    return {
      recipesToken: this._revisions.read(REVISION_SCOPES.recipesOfSystem(systemId)),
      systemToken:
        typeof systemManager.revision === 'function'
          ? systemManager.revision(REVISION_SCOPES.system(systemId))
          : null,
      recipeMap: this.recipes,
      recipeCount: this.recipes.size,
      components,
      componentCount: Array.isArray(components) ? components.length : -1,
      members: this._enabledCohortMembers(systemId, previousGuard?.members),
    };
  }

  /** The enabled recipes of a system, in cohort order — clause 3 of the signature guard. Returns
   * `previous` UNCHANGED when the cohort still holds exactly those objects. */
  _enabledCohortMembers(systemId, previous) {
    const cohort = this._recipeCohorts().get(systemId) ?? [];
    if (previous) {
      let matched = 0;
      let intact = true;
      for (const recipeId of cohort) {
        const recipe = this.recipes.get(recipeId);
        // The truthy `enabled` test mirrors `SignatureValidator`'s own scan scope exactly (issue
        // 1134): the guard must track the set the audit compiles, not the model's default.
        if (!recipe?.enabled) continue;
        if (previous[matched] !== recipe) {
          intact = false;
          break;
        }
        matched += 1;
      }
      if (intact && matched === previous.length) return previous;
    }

    const members = [];
    for (const recipeId of cohort) {
      const recipe = this.recipes.get(recipeId);
      if (recipe?.enabled) members.push(recipe);
    }
    return members;
  }

  /** Get all recipes, optionally filtered. */
  getRecipes(filters = {}) {
    let recipes;
    // Start from the smallest indexed cohort rather than copying the whole corpus and filtering
    // it down (issue 1076). Order is the map's insertion order in both branches.
    if (filters.craftingSystemId === undefined) {
      recipes = [...this.recipes.values()];
    } else {
      recipes = [];
      for (const recipeId of this._recipeCohorts().get(filters.craftingSystemId) ?? []) {
        const recipe = this.recipes.get(recipeId);
        if (recipe) recipes.push(recipe);
      }
    }

    // Filter by category
    if (filters.category) {
      recipes = recipes.filter((r) => r.category === filters.category);
    }

    // Filter by system
    if (filters.system) {
      recipes = recipes.filter((r) => (r.system || 'all') === 'all' || r.system === filters.system);
    }

    // Filter by enabled status
    if (filters.enabled !== undefined) {
      recipes = recipes.filter((r) => r.enabled === filters.enabled);
    }

    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      recipes = recipes.filter((r) => filters.tags.some((tag) => (r.tags || []).includes(tag)));
    }

    // Search by name
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      recipes = recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.description.toLowerCase().includes(searchLower)
      );
    }

    return recipes;
  }

  /** Find recipes craftable with the given component source actors. */
  getAvailableRecipes(componentSourceActors) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const recipes = this.getRecipes({ enabled: true });
    const available = [];

    // System-validity gate: a system with a `blocks: 'system'` issue exposes NO recipes to non-GM
    // users, while GMs bypass it so they can still reach a broken system to fix it.
    const isGM = game.user?.isGM === true;
    const blockedSystemCache = new Map();

    for (const recipe of recipes) {
      if (!isGM && this._isSystemBlockedForRecipes(recipe.craftingSystemId, blockedSystemCache)) {
        continue;
      }
      if (this.canCraft(sourceActors, recipe).canCraft) {
        available.push(recipe);
      }
    }

    return available;
  }

  /** Whether a system is hidden by a `blocks: 'system'` validation issue, cached per listing call.
   * Fail-open, so a missing manager never blanks a player's recipe list. */
  _isSystemBlockedForRecipes(systemId, cache) {
    if (!systemId) return false;
    if (cache.has(systemId)) return cache.get(systemId);

    const systemManager = this._systemManager();
    const system = systemManager?.getSystem?.(systemId);
    if (!system) {
      cache.set(systemId, false);
      return false;
    }

    const { blocksSystem } = computeSystemVisibility(system, {
      recipes: this.getRecipes({ craftingSystemId: systemId }),
      components: resolvedComponentsFor(system),
    });
    cache.set(systemId, blocksSystem === true);
    return blocksSystem === true;
  }

  /**
   * Evaluate whether a recipe can be crafted, returning one unified result that is the sole
   * source of truth for both the craftability boolean and the display states (T-082).
   * `options.presentTools` is a canvas Tool station's virtual-present payload, satisfied only
   * when the recipe's system matches its `systemId`; `optionOverrides` threads the player's
   * per-group choice so display and consumption resolve the SAME option.
   */
  evaluateCraftability(
    componentSourceActors,
    recipe,
    {
      presentTools = null,
      craftingActor = null,
      resolveComponent,
      optionOverrides = null,
      essenceAllocation = null,
    } = {}
  ) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const emptyResult = {
      canCraft: false,
      satisfiableSet: null,
      missing: { ingredients: [], essences: [], tools: [] },
      ingredientStates: [],
      essenceStates: [],
      essencePool: null,
      toolStates: [],
    };

    if (sourceActors.length === 0) {
      return emptyResult;
    }

    // Guard against multi-step recipes where ingredientSets is empty.
    if (recipe.ingredientSets.length === 0) {
      return emptyResult;
    }

    // Aggregate all items from component source actors once.
    const availableItems = sourceActors.flatMap((actor) => [...actor.items]);

    const features = this._getSystemFeatures(recipe);

    // Bind the currency affordability probe to the crafting actor so a currency alternative is
    // selectable in the display exactly when the engine could spend it.
    const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe, this._currencySeams());

    // Resolve the recipe's currency units once so a cost row renders a human label. Normalizing
    // applies the abbreviation self-heal and works even when currency is disabled or invalid.
    const currencyUnits = this._resolveNormalizedCurrencyUnits(recipe);

    // …and the reason the world's currency cannot be resolved, so a requirement refused for a
    // CONFIGURATION reason can say so rather than reading as a shortfall (issue 1493).
    const currencyIssue = this._resolveCurrencyIssue(recipe);

    // Bind the component-aware essence resolver so an essence GROUP option can draw down items
    // carrying that essence (issue 649).
    const resolveItemEssencesForSet = this._buildEssenceOptionResolver(recipe, resolveComponent);

    // Attempt to find a satisfiable ingredient set, capturing both it and the first-set result
    // for the fallback display path.
    let satisfiableSet = null;
    let satisfiableSetSelection = null;
    let satisfiableToolStates = null;
    let ingredientSatisfiableSet = null;
    let ingredientSatisfiableSelection = null;
    let ingredientSatisfiableToolStates = null;

    // Also keep the first-set selection for the "unsatisfied" display fallback.
    let firstSetSelection = null;
    const firstSet = recipe.ingredientSets[0];

    for (const ingredientSet of recipe.ingredientSets) {
      const selection =
        typeof ingredientSet.resolveIngredientSelection === 'function'
          ? ingredientSet.resolveIngredientSelection(
              availableItems,
              (ingredient, item) =>
                this.ingredientMatchesItem(recipe, ingredient, item, resolveComponent),
              {
                affordCurrency,
                optionOverrides,
                essenceAllocation,
                resolveItemEssences: resolveItemEssencesForSet,
              }
            )
          : {
              success: true,
              missingGroups: [],
              selectedIngredients: [],
              plan: [],
              currencySpends: [],
            };

      // Track the first set's selection for the unsatisfied fallback display.
      if (firstSetSelection === null) {
        firstSetSelection = selection;
      }

      // Check essences for this set.
      let essencesMet = true;
      if (features.enableEssences && Object.keys(ingredientSet.essences || {}).length > 0) {
        const accumulatedEssences = this._accumulateEssences(
          availableItems,
          recipe,
          resolveComponent
        );
        for (const [essenceType, requiredQty] of Object.entries(ingredientSet.essences)) {
          if ((accumulatedEssences[essenceType] || 0) < requiredQty) {
            essencesMet = false;
            break;
          }
        }
      }

      if (selection.success && essencesMet) {
        const candidateTools = this.getToolsForSet(recipe, ingredientSet);
        const candidateToolStates = this.resolveToolStates(recipe, candidateTools, sourceActors, {
          presentTools,
          primaryActor: craftingActor,
          excludedItems: selectedIngredientItems(selection),
        });

        if (ingredientSatisfiableSet === null) {
          ingredientSatisfiableSet = ingredientSet;
          ingredientSatisfiableSelection = selection;
          ingredientSatisfiableToolStates = candidateToolStates;
        }

        if (candidateToolStates.every((state) => state?.available === true)) {
          satisfiableSet = ingredientSet;
          satisfiableSetSelection = selection;
          satisfiableToolStates = candidateToolStates;
          break;
        }
      }
    }

    // Build tool states from the satisfiable set, or the first set as fallback, reusing the
    // gathering tool matcher so the presence check agrees with attempt validation.
    const displaySet = satisfiableSet || ingredientSatisfiableSet || firstSet;
    const displaySelection =
      satisfiableSetSelection || ingredientSatisfiableSelection || firstSetSelection;
    const toolsForSet = this.getToolsForSet(recipe, displaySet);
    const toolStates =
      satisfiableToolStates ||
      ingredientSatisfiableToolStates ||
      this.resolveToolStates(recipe, toolsForSet, sourceActors, {
        presentTools,
        primaryActor: craftingActor,
        excludedItems: selectedIngredientItems(displaySelection),
      });
    const missingTools = toolsForSet.filter((_tool, idx) => !toolStates[idx].available);

    // Final craftability: ingredients satisfied AND tools present.
    const canCraft = satisfiableSet !== null;

    // Ingredient display states come from the SAME selection the craftability decision used:
    // `satisfiableSetSelection` when craftable, else `firstSetSelection` to show what is missing.
    const displayIngredientSet = displaySet;

    const ingredientStates = this._buildIngredientStates(
      recipe,
      displayIngredientSet,
      displaySelection,
      availableItems,
      currencyIssue
    );

    // Per-group player-facing option/stack choices (issue 552). Empty unless a group offers a real
    // choice, so the common single-option case renders no selector.
    const ingredientChoices = this._buildIngredientChoices(
      recipe,
      displayIngredientSet,
      displaySelection,
      availableItems,
      optionOverrides,
      affordCurrency,
      currencyUnits
    );
    // Tag each ingredient state with whether its group has a choice + how many
    // alternatives, so the tile can show a discoverability badge next to it.
    const choiceCountByGroup = new Map();
    for (const choice of ingredientChoices) {
      const count = choice.kind === 'option' ? choice.options.length : choice.stacks.length;
      choiceCountByGroup.set(
        choice.groupId,
        Math.max(choiceCountByGroup.get(choice.groupId) ?? 0, count)
      );
    }
    for (const state of ingredientStates) {
      state.hasChoice = choiceCountByGroup.has(state.groupId);
      state.choiceCount = choiceCountByGroup.get(state.groupId) ?? 0;
    }

    // Display-only, and intentionally NOT threaded with the alchemy tier-4 resolver (issue 578):
    // `missing.essences` is forced empty whenever canCraft is true.
    const essenceStates = this._buildEssenceStates(
      recipe,
      displayIngredientSet,
      availableItems,
      features
    );

    // The set's shared essence funding (issue 917). Null when the system has essences disabled or
    // the set authors no essence requirement.
    const essencePool = this._buildEssencePool(
      recipe,
      displayIngredientSet,
      displaySelection,
      features
    );

    // Build the missing object (for backward compatibility with canCraft() callers).
    const missingIngredients = [];
    for (const groupMissing of displaySelection?.missingGroups || []) {
      const ingredient = groupMissing?.ingredient || groupMissing?.group?.options?.[0] || null;
      if (!ingredient) continue;
      missingIngredients.push({
        ingredient,
        have: Number(groupMissing.have || 0),
        need: Number(groupMissing.need || ingredient.quantity || 1),
      });
    }
    const missingEssences = essenceStates
      .filter((s) => !s.satisfied)
      .map((s) => ({
        type: s.type,
        have: s.have,
        need: s.need,
      }));

    return {
      canCraft,
      satisfiableSet: canCraft ? satisfiableSet : null,
      missing: {
        ingredients: canCraft ? [] : missingIngredients,
        essences: canCraft ? [] : missingEssences,
        tools: missingTools,
      },
      ingredientStates,
      ingredientChoices,
      essenceStates,
      essencePool,
      toolStates,
    };
  }

  /** The material requirement to craft a recipe ONCE via ANY ingredient set, for the shopping
   * list: unlike {@link evaluateCraftability} it unions every set, taking the MAXIMUM `need`. */
  evaluateShoppingRequirement(componentSourceActors, recipe, { craftingActor = null } = {}) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const empty = { ingredientStates: [], essenceStates: [], toolStates: [] };
    if (sourceActors.length === 0 || !Array.isArray(recipe?.ingredientSets)) return empty;
    if (recipe.ingredientSets.length === 0) return empty;

    const availableItems = sourceActors.flatMap((actor) => [...actor.items]);
    const features = this._getSystemFeatures(recipe);
    const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe, this._currencySeams());
    // Once per evaluation, shared by every set below (issue 1493) — the reason is a
    // property of the WORLD's currency configuration, not of a set or a group.
    const currencyIssue = this._resolveCurrencyIssue(recipe);
    const resolveItemEssencesForSet = this._buildEssenceOptionResolver(recipe);

    const ingredientByKey = new Map();
    const essenceByType = new Map();
    const toolByKey = new Map();

    for (const set of recipe.ingredientSets) {
      const selection =
        typeof set.resolveIngredientSelection === 'function'
          ? set.resolveIngredientSelection(
              availableItems,
              (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item),
              { affordCurrency, resolveItemEssences: resolveItemEssencesForSet }
            )
          : {
              success: true,
              missingGroups: [],
              selectedIngredients: [],
              plan: [],
              currencySpends: [],
            };

      // Keep the highest-need state per component (need = worst-case single set).
      for (const state of this._buildIngredientStates(
        recipe,
        set,
        selection,
        availableItems,
        currencyIssue
      )) {
        const key = this._shoppingIngredientKey(state);
        const existing = ingredientByKey.get(key);
        if (!existing || (state.need ?? 0) > (existing.need ?? 0)) {
          ingredientByKey.set(key, { ...state });
        }
      }

      for (const essence of this._buildEssenceStates(recipe, set, availableItems, features)) {
        const existing = essenceByType.get(essence.type);
        if (!existing || (essence.need ?? 0) > (existing.need ?? 0)) {
          essenceByType.set(essence.type, { ...essence });
        }
      }

      // A tool is needed if ANY set requires it; prefer an unavailable/repair reading.
      const toolStates = this.resolveToolStates(
        recipe,
        this.getToolsForSet(recipe, set),
        sourceActors,
        {
          primaryActor: craftingActor,
          excludedItems: selectedIngredientItems(selection),
        }
      );
      for (const tool of toolStates) {
        const key = tool.componentId ?? tool.name;
        const existing = toolByKey.get(key);
        if (!existing || (existing.available === true && tool.available !== true)) {
          toolByKey.set(key, tool);
        }
      }
    }

    // Re-derive satisfaction against the merged max need, restating an essence requirement's
    // uncapped `owned`. CURRENCY is exempt (issue 1493): its verdict is the RESOLVER's.
    const ingredientStates = [...ingredientByKey.values()].map((state) => {
      if (state.isCurrency === true) return { ...state };
      const held = state.isEssence === true ? (state.owned ?? 0) : (state.have ?? 0);
      return { ...state, have: held, satisfied: held >= (state.need ?? 0) };
    });
    const essenceStates = [...essenceByType.values()].map((essence) => ({
      ...essence,
      satisfied: (essence.have ?? 0) >= (essence.need ?? 0),
    }));

    return { ingredientStates, essenceStates, toolStates: [...toolByKey.values()] };
  }

  /** The dedup key one ingredient state merges under. Kind-qualified, because a component's
   * `need` is a quantity and a currency option's is a PRICE, and the merge keeps the HIGHER. */
  _shoppingIngredientKey(state) {
    if (state.componentId) return `cid:${state.componentId}`;
    const label = state.description ?? state.name ?? '';
    if (state.isCurrency === true) return `currency:${label}`;
    if (state.isEssence === true) return `essence:${label}`;
    return `desc:${label}`;
  }

  /** Build per-tool `{ name, available }` display states for a recipe's resolved library Tools,
   * using the same matcher attempt validation uses. */
  resolveToolStates(
    recipe,
    tools,
    sourceActors,
    { presentTools = null, primaryActor = null, excludedItems = null } = {}
  ) {
    const actors = Array.isArray(sourceActors) ? sourceActors : sourceActors ? [sourceActors] : [];
    const excluded = excludedItems instanceof Set ? excludedItems : new Set(excludedItems);
    const availableItems = actors
      .flatMap((actor) => [...(actor?.items ?? [])])
      .filter((item) => !excluded.has(item));
    return this._buildToolStates(recipe, tools, availableItems, presentTools, {
      sourceActors: actors,
      primaryActor,
    });
  }

  _buildToolStates(
    recipe,
    tools,
    availableItems,
    presentTools = null,
    { sourceActors = [], primaryActor = null } = {}
  ) {
    if (!Array.isArray(tools) || tools.length === 0) return [];
    // `matchGatheringTools` scopes the virtual-present set to the system passed here, so a present
    // tool from a different system never satisfies this recipe's tool prerequisites.
    const matchArgs = {
      actor: { items: availableItems },
      system: { id: recipe?.craftingSystemId ?? null },
      task: { id: recipe?.id ?? null, craftingSystemId: recipe?.craftingSystemId ?? null },
      tools,
      craftingSystemManager: { recipeManager: this },
      presentTools,
    };
    const matched = matchGatheringTools(matchArgs);
    // The same matcher, split into present/damaged/missing so the UI can show "Repair" versus
    // "Acquire" — `matched` alone collapses both into unavailable.
    const stateByTool = new Map(
      classifyGatheringToolStates(matchArgs).map((entry) => [entry.tool, entry.state])
    );
    // Index by tool so the per-tool state can carry the virtual flag: a virtual-present match has
    // no owned item and must be excluded from breakage/usage by the caller.
    const matchedByTool = new Map(matched.items.map((entry) => [entry.tool, entry]));
    const prerequisiteDefinitions = this._getToolPrerequisiteDefinitions(recipe);
    return tools.map((tool) => {
      const entry = matchedByTool.get(tool) ?? null;
      const componentId = tool?.componentId;
      const toolDisplayName = String(tool?.label || tool?.name || '').trim();
      const actor =
        entry?.virtual === true
          ? primaryActor
          : this._resolveToolItemActor(entry?.item, sourceActors);
      const gate = this._evaluateToolPrerequisiteGate(tool, actor, prerequisiteDefinitions);
      const state = {
        name:
          toolDisplayName ||
          (componentId ? this.resolveComponentName(recipe, componentId) : String(tool?.id || '')),
        img:
          tool?.img ||
          (componentId ? this.resolveComponentImg(recipe, componentId) : FALLBACK_COMPONENT_IMG),
        available: tool?.enabled !== false && entry !== null && gate.usable,
        needsRepair: stateByTool.get(tool) === 'damaged',
        actor,
        bonusEligible: gate.bonusEligible,
        bonusValue: gate.bonusEligible ? null : 0,
        contributionInput: {
          tool,
          matchedItem: entry?.item ?? null,
          primaryActor: actor,
          prerequisiteDefinitions,
        },
      };
      if (entry?.virtual === true) state.virtual = true;
      return state;
    });
  }

  _getToolPrerequisiteDefinitions(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !this.getCraftingSystem) return [];
    const system = this.getCraftingSystem(systemId);
    return resolveCharacterPrerequisiteLibrary(system, this._characterLibrariesStore);
  }

  _resolveCraftingSystem(systemId) {
    if (!systemId) return null;
    if (this.getCraftingSystem) return this.getCraftingSystem(systemId) ?? null;
    return this._systemManager()?.getSystem?.(systemId) ?? null;
  }

  _resolveToolItemActor(item, sourceActors) {
    if (!item) return null;
    if (item.parent) return item.parent;
    return sourceActors.find((actor) => [...(actor?.items ?? [])].includes(item)) || null;
  }

  _evaluateToolPrerequisiteGate(tool, actor, prerequisiteDefinitions) {
    const settings = tool?.prerequisites || {};
    if (settings.enabled !== true) return { usable: true, bonusEligible: true };

    const { resolved, unresolvedIds } = resolveToolPrerequisites({
      prerequisiteIds: settings.ids,
      definitions: prerequisiteDefinitions,
    });
    const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
    const passed =
      resolved.length > 0 &&
      unresolvedIds.length === 0 &&
      resolved.every((prerequisite) => evaluatePrerequisite(rollData, prerequisite));
    const usabilityGate = settings.gateMode === 'usability';
    return {
      usable: !usabilityGate || passed,
      bonusEligible: passed,
    };
  }

  /** Derive per-group ingredient display states from the SAME selection that determined
   * craftability. `currencyIssue` is resolved ONCE per evaluation by the caller. */
  _buildIngredientStates(recipe, ingredientSet, selection, availableItems, currencyIssue = '') {
    if (!ingredientSet) return [];

    const context = {
      availableItems,
      selection,
      currencyIssue,
      missingByGroup: this._missingEntriesByGroupId(selection),
      // The option the engine chose per group (issue 553), so the tile always mirrors
      // the option/stack the craft consumes.
      chosenByGroup: this._chosenOptionByGroup(ingredientSet, selection),
      // Every essence requirement's attributed share of the block, keyed by group id (issue 917) —
      // the SOLE source of an essence tile's reported quantity, satisfied or missing.
      essenceByGroup: this._essenceRequirementsByGroupId(selection),
    };

    return this._displayGroups(ingredientSet).map((group) =>
      this._buildIngredientState(recipe, group, context)
    );
  }

  /** The groups a display state is built for: the authored ingredient groups, or a synthetic
   * one-option group per legacy flat ingredient. */
  _displayGroups(ingredientSet) {
    const groups = ingredientSet.ingredientGroups;
    if (Array.isArray(groups) && groups.length > 0) return groups;
    return (ingredientSet.ingredients || []).map((ingredient) => ({ options: [ingredient] }));
  }

  /** Missing-group entries keyed by group id, for O(1) lookup. @private */
  _missingEntriesByGroupId(selection) {
    const byGroupId = new Map();
    for (const entry of selection?.missingGroups || []) {
      const groupId = entry?.group?.id;
      if (groupId && !byGroupId.has(groupId)) byGroupId.set(groupId, entry);
    }
    return byGroupId;
  }

  /** Essence-block requirement states keyed by group id. @private */
  _essenceRequirementsByGroupId(selection) {
    return new Map(
      (selection?.essencePool?.requirements || []).map((requirement) => [
        requirement.groupId,
        requirement,
      ])
    );
  }

  /** The display state for ONE ingredient group, dispatched on the chosen option's kind: an
   * essence share, a short group's missing entry, or a satisfied group's held quantity. */
  _buildIngredientState(recipe, group, context) {
    const options = group.options || [];
    const chosenOption = context.chosenByGroup.get(group?.id) ?? options[0] ?? null;
    const base = {
      groupId: group?.id ?? null,
      description: this._resolveGroupDescription(recipe, chosenOption, options),
    };
    const missingEntry = context.missingByGroup.get(group?.id) ?? null;

    if (chosenOption?.match?.type === 'essence') {
      return this._buildEssenceIngredientState(recipe, group, chosenOption, context.selection, {
        ...base,
        requirement: context.essenceByGroup.get(group?.id ?? null) ?? null,
        isMissing: Boolean(missingEntry),
        missingEntry,
        availableItems: context.availableItems,
      });
    }

    if (chosenOption?.match?.type === 'currency') {
      return this._buildCurrencyIngredientState(recipe, chosenOption, context, {
        ...base,
        isMissing: Boolean(missingEntry),
      });
    }

    if (missingEntry) {
      return {
        ...this._resolveIngredientVisual(recipe, chosenOption, context.availableItems),
        ...base,
        need: Number(missingEntry.need || chosenOption?.quantity || 1),
        have: Number(missingEntry.have || 0),
        satisfied: false,
      };
    }

    // The specific item the engine will consume for this option, so a shared tag/component tile
    // shows the CONSUMED item rather than the first matching one (issue 553).
    const consumedItem = this._consumedItemForGroup(context.selection, group, chosenOption);
    const matching = context.availableItems.filter((item) =>
      this.ingredientMatchesItem(recipe, chosenOption, item)
    );
    return {
      ...this._resolveIngredientVisual(recipe, chosenOption, context.availableItems, consumedItem),
      ...base,
      need: Number(chosenOption?.quantity || 1),
      have: matching.reduce((sum, item) => sum + readStackQuantity(item), 0),
      satisfied: true,
    };
  }

  /** The display state for a group whose chosen option is a CURRENCY cost (issue 1493). Neither
   * number is REPORTED — an occurrence count is not a price — and `affordable` is the
   * RESOLVER's own verdict, never re-derived. */
  _buildCurrencyIngredientState(recipe, option, context, { isMissing, ...base }) {
    const handler = getMatchHandler(option.match);
    const spend = handler.isComplete(option.match) ? handler.getCurrencySpend(option.match) : null;
    const affordable = !isMissing;
    return {
      ...this._resolveIngredientVisual(recipe, option, context.availableItems),
      ...base,
      need: spend?.amount ?? 0,
      have: 0,
      satisfied: affordable,
      isCurrency: true,
      affordable,
      // The world-scoped reason the option could not be resolved at all: a configuration refusal
      // must not present as an affordability shortfall.
      issue: context.currencyIssue || '',
    };
  }

  /** A group's tile caption: ONLY the chosen option's description (issue 552), with the OR-join
   * of every option name retained as the fallback when it describes to nothing. */
  _resolveGroupDescription(recipe, chosenOption, options) {
    const chosen = this._resolveIngredientDescription(recipe, chosenOption);
    if (chosen) return chosen;
    return options.map((o) => this._resolveIngredientDescription(recipe, o) || '').join(' OR ');
  }

  /** The display state for one ESSENCE requirement, which is amount-based: it reports
   * `delivered` beside `owned`, never the component/tag `have`, which is not net of plan (917). */
  _buildEssenceIngredientState(recipe, group, option, selection, context) {
    const { requirement, isMissing, missingEntry, availableItems, ...base } = context;
    const consumedItem = this._consumedItemForGroup(selection, group, option);
    const need = Math.max(0, Number(option?.match?.amount) || 0);
    // A selection with no pool at all (a duck-typed set that never resolved one) falls
    // back to the missing-group verdict rather than silently reading satisfied.
    const delivered = requirement
      ? requirement.delivered
      : Number(missingEntry?.have) || (isMissing ? 0 : need);
    return {
      ...this._resolveIngredientVisual(recipe, option, availableItems, consumedItem),
      ...base,
      need,
      delivered: Number(delivered) || 0,
      owned: Number(requirement?.owned ?? delivered) || 0,
      satisfied: requirement ? requirement.satisfied === true : !isMissing,
    };
  }

  /** The inventory item the consumption plan spends for a group. An essence requirement resolves
   * through `essenceGroupIds` FIRST, because the block emits one entry per item key. */
  _consumedItemForGroup(selection, group, chosenOption) {
    const entries = selection?.plan || [];
    const groupId = group?.id ?? null;
    if (groupId) {
      const byGroup = entries.find((entry) => entry?.essenceGroupIds?.includes(groupId));
      if (byGroup) return byGroup.item ?? null;
    }
    return entries.find((entry) => entry.ingredient === chosenOption)?.item || null;
  }

  /** Map each group id to the option the resolver chose. `resolveIngredientSelection` appends
   * exactly ONE entry per NON-missing group in group order, so satisfied groups read by index. */
  _chosenOptionByGroup(ingredientSet, selection) {
    const map = new Map();
    const groups = Array.isArray(ingredientSet?.ingredientGroups)
      ? ingredientSet.ingredientGroups
      : [];
    const missingIds = new Set(
      (selection?.missingGroups || []).map((mg) => mg?.group?.id).filter(Boolean)
    );
    let satisfiedIndex = 0;
    for (const group of groups) {
      if (missingIds.has(group?.id)) {
        const entry = (selection?.missingGroups || []).find((mg) => mg?.group?.id === group?.id);
        map.set(group?.id, entry?.ingredient ?? group?.options?.[0] ?? null);
      } else {
        map.set(
          group?.id,
          selection?.selectedIngredients?.[satisfiedIndex] ?? group?.options?.[0] ?? null
        );
        satisfiedIndex += 1;
      }
    }
    return map;
  }

  /** Resolve the recipe's configured currency units into normalized units, applying the
   * abbreviation self-heal so a legacy unit still resolves to its label. */
  _resolveNormalizedCurrencyUnits(recipe) {
    const units = getCurrencyRequirementConfig(recipe, this._currencySeams())?.units || [];
    return units.map((unit) => normalizeCurrencyUnit(unit)).filter(Boolean);
  }

  /** The WORLD-scoped reason this recipe's currency cannot be resolved, or `''`. Without it a
   * refusal for an unauthored ladder is indistinguishable from an unaffordable cost (issue 1493). */
  _resolveCurrencyIssue(recipe) {
    const context = resolveCurrencyContext(recipe, this._currencySeams());
    if (!context?.enabled) return '';
    // `spenderUnavailableReason` is the no-usable-spender half of the same fact; reading both
    // covers a refusal from profile validation and from spender resolution alike.
    const reason = context.error || context.spenderUnavailableReason;
    return typeof reason === 'string' ? reason : '';
  }

  /** Build the player-facing per-group option/stack choices (issue 552). An insufficient option
   * is included — selectable but `satisfied: false` — matching the resolver. */
  _buildIngredientChoices(
    recipe,
    ingredientSet,
    selection,
    availableItems,
    optionOverrides,
    affordCurrency,
    currencyUnits = []
  ) {
    const groups = Array.isArray(ingredientSet?.ingredientGroups)
      ? ingredientSet.ingredientGroups
      : [];
    if (groups.length === 0) return [];

    const chosenByGroup = this._chosenOptionByGroup(ingredientSet, selection);
    const choices = [];

    for (const group of groups) {
      const options = group.options || [];
      if (options.length === 0) continue;
      const groupName =
        (typeof group.name === 'string' && group.name.trim()) ||
        this._defaultGroupName(recipe, options);
      const chosenOption = chosenByGroup.get(group?.id) ?? options[0] ?? null;
      let selectedOptionIndex = options.indexOf(chosenOption);
      if (selectedOptionIndex < 0) selectedOptionIndex = 0;

      if (options.length > 1) {
        choices.push({
          kind: 'option',
          groupId: group?.id ?? null,
          groupName,
          selectedOptionIndex,
          options: options.map((option, idx) =>
            this._buildOptionChoice(
              recipe,
              option,
              idx,
              availableItems,
              affordCurrency,
              currencyUnits
            )
          ),
        });
      }

      // Tag-stack sub-choice for the currently-selected option only.
      const selectedOption = options[selectedOptionIndex] ?? null;
      const stacks = this._heldStacksForTagOption(recipe, selectedOption, availableItems);
      if (stacks.length > 1) {
        const consumedItem =
          (selection?.plan || []).find((entry) => entry.ingredient === selectedOption)?.item ||
          null;
        const overrideHeldId = optionOverrides?.[group?.id]?.heldItemId ?? null;
        const selectedHeldItemId =
          overrideHeldId ?? (consumedItem?.uuid || consumedItem?.id) ?? stacks[0].itemId;
        choices.push({
          kind: 'stack',
          groupId: group?.id ?? null,
          groupName,
          optionIndex: selectedOptionIndex,
          selectedHeldItemId,
          stacks,
        });
      }
    }

    return choices;
  }

  /** Fallback group label when a group has no authored name. @private */
  _defaultGroupName(recipe, options) {
    const first = options?.[0] ?? null;
    return this._resolveIngredientDescription(recipe, first) || 'Alternatives';
  }

  /** Build one option descriptor for the choices model. `have` is the raw total held quantity
   * matching the option, an isolated indicator independent of the shared remaining pool. */
  _buildOptionChoice(
    recipe,
    option,
    optionIndex,
    availableItems,
    affordCurrency,
    currencyUnits = []
  ) {
    const visual = this._resolveIngredientVisual(recipe, option, availableItems);
    const isCurrency = option?.match?.type === 'currency';
    if (isCurrency) {
      const handler = getMatchHandler(option.match);
      const spend = handler.isComplete(option.match)
        ? handler.getCurrencySpend(option.match)
        : null;
      const affordable = handler.affords(option.match, { affordCurrency });
      return {
        optionIndex,
        name: visual.name || this._resolveIngredientDescription(recipe, option),
        img: visual.img,
        need: spend?.amount ?? 0,
        have: 0,
        satisfied: affordable,
        isCurrency: true,
        costLabel: spend ? formatCurrencyRequirement(spend, currencyUnits) : '',
        affordable,
      };
    }
    const matchingItems = availableItems.filter((item) =>
      this.ingredientMatchesItem(recipe, option, item)
    );
    const have = matchingItems.reduce((sum, item) => sum + readStackQuantity(item), 0);
    const need = Number(option?.quantity || 1);
    const choice = {
      optionIndex,
      name: visual.name || this._resolveIngredientDescription(recipe, option),
      img: visual.img,
      need,
      have,
      satisfied: have >= need,
      isCurrency: false,
      costLabel: '',
      affordable: true,
    };
    if (visual.isEssence === true) {
      choice.isEssence = true;
      choice.icon = visual.icon ?? null;
      choice.colorToken = visual.colorToken ?? null;
    }
    return choice;
  }

  /** The distinct held stacks a tag option matches, or `[]` when the option is not a tag option
   * (component/currency/exact-item options resolve to a single item and offer no stack choice). */
  _heldStacksForTagOption(recipe, option, availableItems) {
    if (option?.match?.type !== 'tags') return [];
    return (availableItems || [])
      .filter((item) => this.ingredientMatchesItem(recipe, option, item))
      .map((item) => ({
        itemId: item.uuid || item.id,
        name: item.name ?? '',
        img: item.img ?? null,
        have: readStackQuantity(item),
      }));
  }

  /** Resolve a human-readable description for an ingredient, using the resolved component name
   * instead of generic "component" text. */
  _resolveIngredientDescription(recipe, ingredient) {
    if (!ingredient) return '';
    const match = ingredient.match || null;
    if (match?.type === 'component' && match.componentId) {
      const name = this.resolveComponentName(recipe, match.componentId);
      return `${ingredient.quantity || 1}x ${name}`;
    }
    // Resolve the essence NAME, not the raw generated essenceId, so a tile reads "3x Fire essence"
    // (the issue-595 opaque-id class). The pure handler's describe stays generic.
    if (match?.type === 'essence' && match.essenceId) {
      const name = this._resolveEssenceName(recipe, match.essenceId);
      const amount = Math.max(0, Number(match.amount) || 0);
      return `${amount}x ${name} essence`;
    }
    // Currency is the SAME opaque-id class (issue 1410): both describers print the generated
    // `match.unit`, so `formatCurrencyRequirement`, the renderer `costLabel` uses, resolves it.
    if (match?.type === 'currency' && getMatchHandler(match).isComplete(match)) {
      return formatCurrencyRequirement(match, this._resolveNormalizedCurrencyUnits(recipe));
    }
    return ingredient.getDescription?.() || '';
  }

  /** Resolve the tile presentation for an ingredient. A tag tile shows the img of `consumedItem`,
   * the item the engine will spend (issue 553), else of any held item matching the tag (551). */
  _resolveIngredientVisual(recipe, ingredient, availableItems = [], consumedItem = null) {
    const match = ingredient?.match || null;
    if (match?.type === 'component' && match.componentId) {
      return {
        componentId: match.componentId,
        name: this.resolveComponentName(recipe, match.componentId),
        img: this._materialImg(this.resolveComponentImg(recipe, match.componentId)),
      };
    }

    // An essence tile resolves its NAME and authored icon from the definition, never the raw
    // essenceId, and carries the GM-authored colour token that tints the glyph (issue 917).
    if (match?.type === 'essence') {
      const definition = this._resolveEssenceDefinition(recipe, match.essenceId);
      const essenceName = this._resolveIngredientDescription(recipe, ingredient);
      const icon =
        typeof definition?.icon === 'string' && definition.icon.trim() ? definition.icon : null;
      return {
        componentId: null,
        name: essenceName,
        img: null,
        isEssence: true,
        icon,
        colorToken: this._essenceColorToken(definition),
      };
    }

    const name = ingredient?.getDescription?.() || '';

    if (match?.type === 'tags') {
      const matchingItem =
        consumedItem ||
        (availableItems || []).find((item) => this.ingredientMatchesItem(recipe, ingredient, item));
      return { componentId: null, name, img: this._materialImg(matchingItem?.img) };
    }

    if (match?.type === 'currency') {
      // Resolve the unit through the recipe's units rather than `getDescription()` (issue 1410):
      // this name WINS at the option-choice site, so the raw-id sentence would surface there.
      return {
        componentId: null,
        name: this._resolveIngredientDescription(recipe, ingredient) || name,
        img: FALLBACK_CURRENCY_IMG,
      };
    }

    return { componentId: null, name, img: null };
  }

  /** A MATERIAL tile's image, or null: the generic item-bag literal is the "no image" sentinel
   * (issue 917), so the tile falls back to its glyph, never to the recipe blueprint. */
  _materialImg(img) {
    const resolved = typeof img === 'string' ? img.trim() : '';
    return !resolved || resolved === GENERIC_ITEM_IMG ? null : resolved;
  }

  /** The GM-authored `--fab-tag-*` colour token for an essence definition, or null when
   * unauthored, which every surface renders as the theme accent. */
  _essenceColorToken(definition) {
    const token = typeof definition?.colorToken === 'string' ? definition.colorToken.trim() : '';
    return token || null;
  }

  /** Build essence display states for the given ingredient set: one
   * `{ type, name, icon, isEssence, need, have, satisfied }` row per requirement. */
  _buildEssenceStates(recipe, ingredientSet, availableItems, features) {
    if (!ingredientSet || !features.enableEssences) return [];
    const essences = ingredientSet.essences || {};
    if (Object.keys(essences).length === 0) return [];

    const accumulatedEssences = this._accumulateEssences(availableItems, recipe);
    return Object.entries(essences).map(([type, need]) => {
      const have = accumulatedEssences[type] || 0;
      const definition = this._resolveEssenceDefinition(recipe, type);
      const name = definition?.name;
      const icon = definition?.icon;
      return {
        type,
        name: typeof name === 'string' && name.trim() ? name : String(type ?? ''),
        icon: typeof icon === 'string' && icon.trim() ? icon : null,
        colorToken: this._essenceColorToken(definition),
        isEssence: true,
        need,
        have,
        satisfied: have >= need,
      };
    });
  }

  /** The shared essence-funding model for one ingredient set (issue 917), `null` when essences
   * are disabled. Every quantity comes from the RESOLVER's ledger, never the raw stack. */
  _buildEssencePool(recipe, ingredientSet, selection, features) {
    const pool = selection?.essencePool ?? null;
    if (!pool || !features?.enableEssences) return null;

    const components = this._getSystemComponents(recipe);
    const systemId = recipe?.craftingSystemId;

    return {
      scopeKey: ingredientSet?.id ?? null,
      requirements: pool.requirements.map((requirement) => {
        const definition = this._resolveEssenceDefinition(recipe, requirement.essenceId);
        const name = definition?.name;
        const icon = definition?.icon;
        return {
          groupId: requirement.groupId,
          essenceId: requirement.essenceId,
          name:
            typeof name === 'string' && name.trim() ? name : String(requirement.essenceId ?? ''),
          icon: typeof icon === 'string' && icon.trim() ? icon : null,
          colorToken: this._essenceColorToken(definition),
          need: requirement.need,
          delivered: requirement.delivered,
          owned: requirement.owned,
          satisfied: requirement.satisfied,
        };
      }),
      carriers: pool.carriers.map((carrier) => {
        const component = findMatchingComponent(carrier.item, components, systemId);
        return {
          itemKey: carrier.itemKey,
          componentId: component?.id ?? null,
          name: carrier.item?.name ?? '',
          img: this._materialImg(carrier.item?.img),
          ownedUnits: carrier.ownedUnits,
          allocatedUnits: carrier.allocatedUnits,
          perUnit: { ...carrier.perUnit },
        };
      }),
      allocation: { ...pool.allocation },
      totals: { ...pool.totals },
      suggested: { ...pool.suggested },
    };
  }

  /** Resolve an essence's definition from its system's essence library, or null when none
   * matches. */
  _resolveEssenceDefinition(recipe, type) {
    const systemId = recipe?.craftingSystemId;
    const system = systemId ? this._systemManager()?.getSystem(systemId) : null;
    const definitions = resolvedEssencesFor(system);
    return definitions.find((def) => def?.id === type) ?? null;
  }

  /** Resolve an essence's display label from the system's definitions, falling back to the raw
   * type id. */
  _resolveEssenceName(recipe, type) {
    const name = this._resolveEssenceDefinition(recipe, type)?.name;
    return typeof name === 'string' && name.trim() ? name : String(type ?? '');
  }

  /** Check if a recipe can be crafted from the given component source actors — a thin wrapper
   * around {@link evaluateCraftability} returning only `{ canCraft, satisfiableSet, missing }`. */
  canCraft(
    componentSourceActors,
    recipe,
    { presentTools = null, craftingActor = null, resolveComponent, optionOverrides = null } = {}
  ) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    if (sourceActors.length === 0) {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], tools: [] },
      };
    }

    const { canCraft, satisfiableSet, missing } = this.evaluateCraftability(sourceActors, recipe, {
      presentTools,
      craftingActor,
      resolveComponent,
      optionOverrides,
    });
    return { canCraft, satisfiableSet, missing };
  }

  /** Check if an ingredient set can be satisfied with available items. Deliberately
   * currency-BLIND, because it does not feed the actor-bound craftability decision. */
  _checkIngredientSet(recipe, ingredientSet, availableItems) {
    const missing = {
      ingredients: [],
      essences: [],
    };
    const features = this._getSystemFeatures(recipe);
    const selection =
      typeof ingredientSet.resolveIngredientSelection === 'function'
        ? ingredientSet.resolveIngredientSelection(
            availableItems,
            (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item),
            { resolveItemEssences: this._buildEssenceOptionResolver(recipe) }
          )
        : { success: true, missingGroups: [] };

    if (!selection.success) {
      for (const groupMissing of selection.missingGroups || []) {
        const ingredient = groupMissing?.ingredient || groupMissing?.group?.options?.[0] || null;
        if (!ingredient) continue;
        missing.ingredients.push({
          ingredient,
          have: Number(groupMissing.have || 0),
          need: Number(groupMissing.need || ingredient.quantity || 1),
        });
      }
    }

    // Check essences
    if (features.enableEssences && Object.keys(ingredientSet.essences || {}).length > 0) {
      const accumulatedEssences = this._accumulateEssences(availableItems, recipe);

      for (const [essenceType, requiredQty] of Object.entries(ingredientSet.essences)) {
        const availableQty = accumulatedEssences[essenceType] || 0;
        if (availableQty < requiredQty) {
          missing.essences.push({
            type: essenceType,
            have: availableQty,
            need: requiredQty,
          });
        }
      }
    }

    return missing;
  }

  /** Resolve recipe-wide Tool ids plus any active ingredient-set Tool ids to library Tool objects.
   * Set ids are active only for a named set in routed-by-ingredients mode. */
  getToolsForSet(recipe, ingredientSet) {
    const system = this._resolveCraftingSystem(recipe?.craftingSystemId);
    if (!system) return [];
    const ingredientSetToolIds = ingredientSetToolsAreActive(system, ingredientSet)
      ? ingredientSet?.toolIds
      : [];
    const ids = [
      ...(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []),
      ...(Array.isArray(ingredientSetToolIds) ? ingredientSetToolIds : []),
    ];
    const seen = new Set();
    const tools = [];
    for (const rawId of ids) {
      const id = String(rawId ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tool = resolvedToolsFor(system).find((entry) => entry?.id === id) || null;
      if (tool) tools.push(tool);
    }
    return tools;
  }

  /** Resolve a single library Tool by id from the recipe's crafting system. */
  _getTool(recipe, toolId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !toolId) return null;
    const system = this._resolveCraftingSystem(systemId);
    if (!system) return null;
    return resolvedToolsFor(system).find((tool) => tool?.id === toolId) || null;
  }

  /** Check whether a concrete item satisfies a recipe ingredient. `resolveComponent` is the
   * alchemy-path resolver (issue 578), defaulting to {@link resolveComponentForItem}. */
  ingredientMatchesItem(recipe, ingredient, item, resolveComponent) {
    const features = this._getSystemFeatures(recipe);
    // A component (or legacy systemItem) match resolves its id via the handler; tags/currency/no
    // match return null and fall to the bare-field fallback, then to `_matchesIngredient`.
    const componentId = getIngredientComponentId(ingredient);

    if (componentId) {
      const managedItem = this._getComponent(recipe, componentId);
      if (!managedItem) return false;

      if (
        itemResolvesToComponent(
          item,
          managedItem,
          this._getSystemComponents(recipe),
          recipe?.craftingSystemId,
          resolveComponent
        )
      )
        return true;

      // Source-UUID matching failed — fall back to an exact case-insensitive name match, because
      // `_stats.duplicateSource` points at the ORIGINAL template, so a template copy has no ref
      // back (issue 540).
      const byName = matchComponentByName(item, managedItem, {
        caseSensitive: false,
        systemId: recipe?.craftingSystemId,
      });
      if (!byName) return false;
    } else if (getMatchHandler(ingredient?.match).type === 'tags') {
      // A by-TAG ingredient's authored tags live on the managed COMPONENT definition rather than
      // the item's flags, so the item's component is resolved here (issue 857).
      if (!this._matchesTagIngredient(recipe, ingredient, item, features, resolveComponent)) {
        return false;
      }
    } else if (!this._matchesIngredient(ingredient, item, features)) {
      return false;
    }

    return true;
  }

  /** Whether an owned item satisfies a by-TAG ingredient. Fabricate never stamps
   * `flags.fabricate.tags` onto items (issue 857), so the rule is evaluated against the UNION of
   * the resolved component's tags and any item-level flag. */
  _matchesTagIngredient(recipe, ingredient, item, features, resolveComponent) {
    if (!features.enableTags) return false;
    const handler = getMatchHandler(ingredient?.match);
    const resolve =
      typeof resolveComponent === 'function' ? resolveComponent : findMatchingComponent;
    const component = resolve(item, this._getSystemComponents(recipe), recipe?.craftingSystemId);
    const componentTags = Array.isArray(component?.tags) ? component.tags : [];
    const flagTags = getFabricateFlag(item, 'tags', []);
    const itemTags = [...new Set([...(Array.isArray(flagTags) ? flagTags : []), ...componentTags])];
    return handler.matchesItem(ingredient.match, item, { features, itemTags });
  }

  /** Check whether a concrete item satisfies a Tool's PRESENCE requirement — the wide,
   * non-destructive gate (issue 561), resolved against the Tools library directly. */
  toolMatchesItem(recipe, tool, item) {
    if (!tool) return false;
    const tools = this._getSystemTools(recipe);
    if (itemResolvesToTool(item, tool, tools, recipe?.craftingSystemId)) return true;
    // Snapshot-name fallback (presence only, never destructive): the item-sourced tool's own
    // snapshot name, or the linked component's name for a migrated componentId-tool (issue 540).
    const fallbackName = tool.name || this._getComponent(recipe, tool.componentId)?.name || '';
    if (!fallbackName) return false;
    return matchComponentByName(
      item,
      { name: fallbackName, id: tool.id },
      { caseSensitive: false, systemId: recipe?.craftingSystemId }
    );
  }

  /** Whether an owned item may be selected for a Tool's usage or breakage — the narrow
   * durable-identity gate (issue 561), the destructive counterpart to {@link toolMatchesItem}. */
  toolMatchesItemByIdentity(recipe, tool, item) {
    if (!tool || tool.id == null) return false;
    return itemIsToolByDurableIdentity(
      item,
      tool,
      this._getSystemTools(recipe),
      recipe?.craftingSystemId
    );
  }

  _matchesIngredient(ingredient, item, features) {
    if (ingredient.itemUuid && item.uuid === ingredient.itemUuid) return true;

    // Dispatch ONLY for terminal match types. A `component`/null/unknown match falls through to
    // the legacy bare-field `ingredient.tag` block and the `alternatives` recursion below.
    const handler = getMatchHandler(ingredient.match);
    if (handler.isTerminalInventoryMatch) {
      return handler.matchesItem(ingredient.match, item, { features });
    }

    if (ingredient.tag) {
      if (!features.enableTags) return false;
      const itemTags = getFabricateFlag(item, 'tags', []);
      if (!itemTags.includes(ingredient.tag)) return false;
      return true;
    }

    if (Array.isArray(ingredient.alternatives) && ingredient.alternatives.length > 0) {
      return ingredient.alternatives.some((alt) => this._matchesIngredient(alt, item, features));
    }

    return false;
  }

  _getSystemFeatures(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { enableTags: false, enableEssences: false };
    }
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    const features = system?.features || {};
    return {
      enableTags: !!system,
      enableEssences: features.essences === true,
    };
  }

  /** Resolve a component by id for the given recipe. */
  _getComponent(recipe, componentId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !componentId) return null;
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;
    return findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
  }

  /** Resolve the display name for a managed component from `component.name`, falling back to the
   * localized "Unknown Component" when it is not found. */
  resolveComponentName(recipe, componentId) {
    if (!componentId)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    const component = this._getComponent(recipe, componentId);
    if (!component)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    return (
      component.name ||
      game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') ||
      'Unknown Component'
    );
  }

  /** Resolve the display name for a managed component, resolving `registeredItemUuid` via
   * `fromUuid()` when it has one and falling back gracefully on broken references. */
  async resolveComponentNameAsync(recipe, componentId) {
    if (!componentId)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    const component = this._getComponent(recipe, componentId);
    if (!component)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    if (component.registeredItemUuid && typeof fromUuid === 'function') {
      try {
        const item = await fromUuid(component.registeredItemUuid);
        if (item?.name) return item.name;
      } catch {
        // Broken reference — fall through to component.name
      }
    }
    return (
      component.name ||
      game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') ||
      'Unknown Component'
    );
  }

  /** Resolve the icon image for a managed component: `component.img` when available, else
   * `FALLBACK_COMPONENT_IMG`. */
  resolveComponentImg(recipe, componentId) {
    if (!componentId) return FALLBACK_COMPONENT_IMG;
    const component = this._getComponent(recipe, componentId);
    if (!component) return FALLBACK_COMPONENT_IMG;
    return component.img || FALLBACK_COMPONENT_IMG;
  }

  /** Resolve a result description. `quantityFormula` wins: a rolled amount states its expression. */
  resolveResultDescription(recipe, componentId, quantity = 1, quantityFormula = null) {
    const name = this.resolveComponentName(recipe, componentId);
    return `${quantityFormula ?? quantity}x ${name}`;
  }

  /** Resolve the icon for a recipe (synchronous): the recipe's own img, which may be the default
   * bag icon. For the full fallback chain use {@link resolveRecipeIconAsync}. */
  resolveRecipeIcon(recipe) {
    const img = recipe?.img || DEFAULT_RECIPE_IMG;
    if (img && img !== DEFAULT_RECIPE_IMG) return img;
    // Synchronous path cannot reliably resolve recipe-item definitions — return the
    // fallback marker if async resolution may still produce a better icon.
    return img === DEFAULT_RECIPE_IMG ? FALLBACK_RECIPE_IMG : img;
  }

  /** Resolve a recipe icon with the full async fallback chain: `recipe.img` when set and not the
   * default bag, else the definition's `item.img`, else the legacy uuid's, else the fallback. */
  async resolveRecipeIconAsync(recipe) {
    const img = recipe?.img || DEFAULT_RECIPE_IMG;
    if (img && img !== DEFAULT_RECIPE_IMG) return img;

    const systemManager = game?.fabricate?.getCraftingSystemManager?.();
    const recipeItemUuid = recipe?.recipeItemId
      ? systemManager?.getRecipeItemDefinition?.(recipe.craftingSystemId, recipe.recipeItemId)
          ?.originItemUuid
      : null;
    const fallbackUuid = recipeItemUuid || recipe?.linkedRecipeItemUuid;

    if (fallbackUuid && typeof fromUuid === 'function') {
      try {
        const item = await fromUuid(fallbackUuid);
        if (item?.img) return item.img;
      } catch {
        // Broken reference — fall through
      }
    }

    return FALLBACK_RECIPE_IMG;
  }

  /** Accumulate essences from all available items. `resolveComponent` is the alchemy-path resolver
   * (issue 578), defaulting to {@link findMatchingComponent}. */
  _accumulateEssences(items, recipe = null, resolveComponent = findMatchingComponent) {
    return accumulateItemEssences(items, {
      components: this._getSystemComponents(recipe),
      systemId: recipe?.craftingSystemId,
      multiplyByQuantity: true,
      resolveComponent,
    });
  }

  /** A per-item essence resolver bound to a recipe's system, for threading into
   * `resolveIngredientSelection` so an essence GROUP option draws down carriers (issue 649). */
  _buildEssenceOptionResolver(recipe, resolveComponent = findMatchingComponent) {
    const components = this._getSystemComponents(recipe);
    const systemId = recipe?.craftingSystemId;
    return (item) => resolveItemEssences(item, components, systemId, resolveComponent);
  }

  _getSystemComponents(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    return resolvedComponentsFor(system);
  }

  /** Resolve the first-class Tools library for a recipe's crafting system (issue 561) — the single
   * source of truth the tool matchers resolve owned items against. */
  _getSystemTools(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    return resolvedToolsFor(system);
  }

  /** Import recipes from JSON. A recipe that cannot be imported is SKIPPED AND REPORTED, never
   * thrown, and the skips are surfaced in ONE aggregated conflict-report notification. */
  async importRecipes(recipesData, overwrite = false) {
    this._assertGM('import recipes');

    let imported = 0;
    let skipped = 0;
    // Per-recipe conflict reasons, aggregated into ONE report at completion rather than a mid-loop
    // warn or a silent skip, and distinct from the terminal counts notification.
    const conflicts = [];

    for (const recipeData of recipesData) {
      const recipe = Recipe.fromJSON(recipeData);
      const validation = this._validateRecipeForActivation(recipe);

      if (!validation.valid) {
        conflicts.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          reason: importConflictReason(validation.issues),
          errors: validation.errors,
        });
        skipped++;
        continue;
      }

      if (this.recipes.has(recipe.id) && !overwrite) {
        conflicts.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          reason: 'duplicate-id',
        });
        skipped++;
        continue;
      }

      this.recipes.set(recipe.id, recipe);
      // An imported recipe is a whole record, exactly as a create is.
      this._recordChange(ALL_INVALIDATION_DOMAINS, recipe.craftingSystemId);
      imported++;
    }

    await this.save();
    // No `removedRecipeIds`: an import only ADDS or REPLACES, so nothing was orphaned and the
    // gate has nothing to fall back to (issue 1226). The sweep is a pure orphan hunt.
    await this._cleanupFlagsAfterRecipeMutation();
    // Spec item 3: one aggregated conflict report naming each skipped recipe and its
    // reason (duplicate-id skips are no longer silent).
    if (conflicts.length > 0) {
      ui.notifications.warn(this._formatImportConflictReport(conflicts));
    }
    // Spec item 4: the terminal counts notification, kept distinct from the report.
    ui.notifications.info(`Imported ${imported} recipes (${skipped} skipped)`);
    this._notifyRecipesChanged('import', {
      imported,
      skipped,
      total: recipesData.length,
      conflicts,
    });
    return { imported, skipped, total: recipesData.length, conflicts };
  }

  /** Build the aggregated import-conflict report string, naming each skipped recipe and its
   * machine-readable reason. Emitted once at import completion. */
  _formatImportConflictReport(conflicts) {
    const reasonLabels = {
      'duplicate-id': 'duplicate id',
      invalid: 'invalid',
      'signature-conflict': 'signature conflict',
    };
    const details = conflicts
      .map((c) => `"${c.recipeName || c.recipeId}" (${reasonLabels[c.reason] || c.reason})`)
      .join(', ');
    return `${conflicts.length} recipe(s) could not be imported: ${details}`;
  }

  /** Export recipes to JSON; `recipeIds` selects a subset, else every recipe. */
  exportRecipes(recipeIds = null) {
    this._assertGM('export recipes');

    const recipes = recipeIds
      ? recipeIds.map((id) => this.recipes.get(id)).filter(Boolean)
      : [...this.recipes.values()];

    return recipes.map((r) => r.toJSON());
  }

  /** Validation required to *persist* a recipe: structural and completeness integrity plus
   * essence, tag-placeholder and resolution-mode checks. Signature uniqueness is excluded — a
   * conflict never blocks persistence, only activation. `Roll` reaches `Result.validate` from
   * here, so a rolled amount that can never award anything is refused at the write. */
  _validateRecipeForPersistence(recipe, { requireComplete = true } = {}) {
    const injected = { Roll: diceEngine() };
    const baseValidation = requireComplete
      ? recipe.validate(injected)
      : recipe.validateStructure(injected);
    // Structured issues in the same order as the raw error strings, carrying a stable `code` plus
    // id-free params so the UI can localize them; a string-only validator rides UNCODED (issue 595).
    const issues = [];
    const pushPlain = (list) => {
      for (const message of list || []) issues.push({ code: null, params: {}, message });
    };
    const pushValidation = (validation) => {
      if (Array.isArray(validation?.issues)) issues.push(...validation.issues);
      else pushPlain(validation?.errors);
    };
    pushValidation(baseValidation);
    pushValidation(this._validateEssenceReferences(recipe));
    pushValidation(this._validateTagPlaceholders(recipe));
    pushValidation(this._validateResolutionMode(recipe, { requireComplete }));

    const errors = issues.map((issue) => issue.message);
    return {
      valid: errors.length === 0,
      errors,
      issues,
    };
  }

  /** Full validity required to *activate* a recipe: completeness, every persistence check and
   * signature uniqueness. `issues` mirrors `errors` with a stable `code` (issue 550). */
  _validateRecipeForActivation(recipe) {
    const persistence = this._validateRecipeForPersistence(recipe, { requireComplete: true });
    const errors = [...persistence.errors];
    // Coded issues run in parallel with the raw strings so a UI caller can localize them (550).
    const issues = [...persistence.issues];
    const signatureValidation = this._validateSignatures(recipe);
    errors.push(...signatureValidation.errors);
    issues.push(...(signatureValidation.issues || []));
    // A DISABLED essence blocks activation only (issue 1036) — never persistence.
    const disabledEssenceValidation = this._validateEnabledEssenceReferences(recipe);
    errors.push(...disabledEssenceValidation.errors);
    issues.push(...disabledEssenceValidation.issues);

    return {
      valid: errors.length === 0,
      errors,
      issues,
    };
  }

  /** The ingredient-signature conflicts a candidate would participate in, as coded, id-free issues
   * (issue 550), evaluated as though already stored and enabled so an unpersisted recipe is gated
   * exactly like a stored one (issue 1167). Public because the editor asks this of a LIVE DRAFT on
   * every keystroke (issue 1201); `systemId` is separable because a draft need not carry
   * `craftingSystemId`. A conflict's `params` may be the SAME object the retained report holds —
   * treat it as read-only. */
  getSignatureConflicts(recipe, { systemId = recipe?.craftingSystemId } = {}) {
    if (!systemId) return [];

    const systemManager = this._systemManager();
    if (!systemManager) return [];

    // Signature uniqueness only matters when the engine INFERS the recipe from the submitted
    // ingredients — alchemy mode. Elsewhere the player picks explicitly, so enforcing overlap
    // would reject perfectly valid recipes.
    const system = systemManager.getSystem(systemId);
    if (system?.resolutionMode !== 'alchemy') return [];

    // The validator is enabled-scoped (issue 649), but the store copy is still disabled at the
    // enable transition, so the scan must evaluate the candidate in its place or miss the
    // conflict. `candidateConflicts` substitutes it against the retained report's compiled entries
    // (issue 1074) instead of re-auditing the system, which made preparing N GM rows O(N^3).
    const report = this._alchemySignatureReport(systemId, systemManager);
    if (!report) return [];

    return report.candidateConflicts(recipe).map((conflict) => ({
      code: conflict.code,
      params: conflict.params,
      message: conflict.message,
    }));
  }

  /** Validate that this recipe's ingredient signatures do not overlap with others in the same
   * system — the enable gate's projection of {@link getSignatureConflicts}, so the editor's
   * prediction and the refusal it predicts can never disagree. */
  _validateSignatures(recipe) {
    const issues = this.getSignatureConflicts(recipe);
    return { valid: issues.length === 0, errors: issues.map((issue) => issue.message), issues };
  }

  /** In an alchemy system, disable every enabled recipe participating in an ingredient signature
   * conflict, to reconcile after an essence/component deletion changes signatures. No-op for
   * non-alchemy systems. The validator is enabled-scoped (issue 649), so a recipe whose sole
   * partner is already disabled STAYS enabled: the enabled residual is the collision-free set. */
  async disableSignatureConflicts(systemId) {
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    if (system?.resolutionMode !== 'alchemy') return [];

    // No candidate substitution here — this runs AFTER the mutation is stored — so the
    // whole-system report answers it directly (issues 1072, 1074).
    const report = this._alchemySignatureReport(systemId, systemManager);
    if (!report) return [];

    const disabled = [];
    for (const id of report.blockedRecipeIds) {
      const recipe = this.recipes.get(id);
      if (recipe?.enabled === true) {
        recipe.enabled = false;
        disabled.push({ id, name: recipe.name });
      }
    }

    if (disabled.length > 0) {
      // The ONE write path in this manager that mutates a STORED recipe in place, so nothing else
      // would advance the token and every revision-keyed consumer would serve an answer computed
      // against recipes that are no longer enabled.
      this._recordChange(domainsForRecipeFields(['enabled']), systemId);
      // The repository's bulk boundary on a real multi-record mutation: each disabled recipe
      // announces itself and the batch coalesces into exactly one write, so a record-addressing
      // backend could write only these N without any caller changing.
      await this.save({ batch: disabled.map(({ id }) => this.recipes.get(id)) });
      this._notifyRecipesChanged('update', {
        disabledForSignatureConflict: disabled.map((d) => d.id),
      });
    }

    return disabled;
  }

  /** The crafting system whose essence definitions a recipe's references are validated against, or
   * `null` when essences do not apply. Shared by the persistence and activation validators so
   * the two cannot disagree about when `features.essences` takes them out of play. */
  _resolveEssenceValidationSystem(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return null;

    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;

    const features = system.features || {};
    const essencesEnabled = features.essences === true || system.enableEssences === true;
    return essencesEnabled ? system : null;
  }

  /** Every essence reference a recipe makes, in validation order: recipe- and step-level sets,
   * and within each set both the legacy per-set `essences` map and first-class essence group
   * OPTIONS (issue 649). One walk serves both essence validators. */
  _collectEssenceReferences(recipe) {
    const allSets = [
      ...(recipe?.ingredientSets || []),
      ...(recipe?.steps || []).flatMap((step) => step?.ingredientSets || []),
    ];
    const references = [];
    for (const [setIndex, set] of allSets.entries()) {
      const setLabel =
        typeof set?.name === 'string' && set.name.trim() ? set.name.trim() : String(setIndex + 1);
      for (const [essenceId, quantity] of Object.entries(set.essences || {})) {
        references.push({ setLabel, essenceId, quantity });
      }
      for (const group of set.ingredientGroups || []) {
        for (const option of group?.options || []) {
          if (option?.match?.type !== 'essence') continue;
          references.push({
            setLabel,
            essenceId: String(option.match.essenceId || '').trim(),
            quantity: option.match.amount,
          });
        }
      }
    }
    return references;
  }

  /** An essence's display NAME from the system's definitions (issue 595). An UNKNOWN essence has
   * no definition and therefore no name, so its message omits it entirely. */
  _essenceNameMap(definitions) {
    return new Map(
      definitions
        .filter((def) => typeof def?.name === 'string' && def.name.trim())
        .map((def) => [def.id, def.name.trim()])
    );
  }

  /** Validate ingredient-set essence requirements against the crafting system's essence
   * definitions. */
  _validateEssenceReferences(recipe) {
    const system = this._resolveEssenceValidationSystem(recipe);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const definitions = resolvedEssencesFor(system);
    const validEssenceIds = new Set(definitions.map((def) => def.id));
    const essenceNames = this._essenceNameMap(definitions);

    const issues = [];

    // Report a non-positive-quantity essence, preferring the named message when the
    // essence resolves to a definition (issue 595 — never surface the raw id).
    const pushBadQuantity = (setLabel, essenceId) => {
      const essenceName = essenceNames.get(essenceId);
      issues.push(
        essenceName
          ? buildRecipeActivationIssue('ingredientSetEssenceQuantityNamed', {
              set: setLabel,
              essence: essenceName,
            })
          : buildRecipeActivationIssue('ingredientSetEssenceQuantity', { set: setLabel })
      );
    };

    for (const { setLabel, essenceId, quantity } of this._collectEssenceReferences(recipe)) {
      if (!validEssenceIds.has(essenceId)) {
        issues.push(buildRecipeActivationIssue('ingredientSetUnknownEssence', { set: setLabel }));
      }
      const num = Number(quantity);
      if (!Number.isFinite(num) || num <= 0) {
        pushBadQuantity(setLabel, essenceId);
      }
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
    };
  }

  /**
   * ACTIVATION-only blocker: a recipe may not be ENABLED while it requires a DISABLED essence
   * (issue 1036). The placement is load-bearing, because a persistence-level blocker would abort
   * `CraftingSystemManager.deleteEssence` mid-cascade with the essence maps already mutated in
   * memory and nothing persisted. A recipe may therefore still be SAVED while it requires a
   * disabled essence; disabling one does not retro-disable an already-enabled recipe, because
   * the gate fires only on a `false -> true` transition.
   */
  _validateEnabledEssenceReferences(recipe) {
    const system = this._resolveEssenceValidationSystem(recipe);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const definitions = resolvedEssencesFor(system);
    // Only a DEFINED essence can be disabled; an unknown id is `_validateEssenceReferences`'s
    // business and is already reported there, so it is not reported twice here.
    const disabled = new Map(
      definitions
        .filter((def) => def?.enabled === false)
        .map((def) => [def.id, String(def.name || def.id)])
    );
    if (disabled.size === 0) {
      return { valid: true, errors: [], issues: [] };
    }

    const issues = [];
    const reported = new Set();
    for (const { setLabel, essenceId } of this._collectEssenceReferences(recipe)) {
      const essenceName = disabled.get(essenceId);
      if (!essenceName) continue;
      // One issue per (set, essence) pair: a set naming the same essence in both its
      // legacy map and a group option is ONE authoring fact, not two.
      const signature = JSON.stringify([setLabel, essenceId]);
      if (reported.has(signature)) continue;
      reported.add(signature);
      issues.push(
        buildRecipeActivationIssue('ingredientSetDisabledEssence', {
          set: setLabel,
          essence: essenceName,
        })
      );
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
    };
  }

  _validateResolutionMode(recipe, { requireComplete = true } = {}) {
    const modeService = game.fabricate?.getResolutionModeService?.();
    if (!modeService) {
      return { valid: true, errors: [] };
    }
    return modeService.validateRecipe(recipe, { requireComplete });
  }

  _validateTagPlaceholders(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { valid: true, errors: [], issues: [] };
    }

    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const validTags = new Set(
      [
        ...(system.itemTags || []).map((tag) => String(tag || '').trim()),
        ...(system.tags || []).map((tag) => String(tag || '').trim()),
      ].filter(Boolean)
    );

    const issues = [];
    const steps =
      typeof recipe.getExecutionSteps === 'function'
        ? recipe.getExecutionSteps()
        : [{ id: 'implicit', ingredientSets: recipe.ingredientSets || [] }];
    for (const step of steps) {
      for (const ingredientSet of step.ingredientSets || []) {
        const groups =
          Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
            ? ingredientSet.ingredientGroups
            : (ingredientSet.ingredients || []).map((ingredient) => ({ options: [ingredient] }));

        for (const [groupIndex, group] of groups.entries()) {
          // Name the group by author-name or 1-based position, never its id (595).
          const groupLabel =
            typeof group?.name === 'string' && group.name.trim()
              ? group.name.trim()
              : String(groupIndex + 1);
          for (const option of group.options || []) {
            const match = option.match || null;
            if (getMatchHandler(match).type !== 'tags') continue;
            const tagIds = Array.isArray(match.tags) ? match.tags : [];

            for (const tagId of tagIds) {
              const normalized = String(tagId || '').trim();
              if (!normalized) continue;
              if (validTags.has(normalized)) continue;
              issues.push(
                buildRecipeActivationIssue('ingredientGroupUnknownTag', {
                  group: groupLabel,
                  tag: normalized,
                })
              );
            }
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
    };
  }

  /** Reconcile the actor flags a recipe mutation orphaned, through the shared gate (issue 1226,
   * `data-models/spec.md` § Valid Id Basis). What replaces an omitted corpus-derived sweep is a
   * SUBJECT-TARGETED prune of exactly the ids this mutation removed. */
  async _cleanupFlagsAfterRecipeMutation({ removedRecipeIds = [] } = {}) {
    const runManager = game.fabricate?.getCraftingRunManager?.();
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    const systemManager = this._systemManager();
    if (!runManager && !visibilityService) return;

    const removed = [...(removedRecipeIds || [])]
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    const validRecipes = new Set(this.getRecipes({}).map((r) => r.id));
    const validSystems = new Set((systemManager?.getSystems?.() || []).map((s) => s.id));

    const passes = [];
    if (runManager) {
      passes.push({
        label: 'orphaned crafting runs',
        sweep: () => runManager.cleanupInvalidRuns(validRecipes, validSystems),
        targeted: removed.length > 0 ? () => runManager.removeRunsForRecipes?.(removed) : null,
      });
    }
    if (visibilityService) {
      passes.push({
        label: 'orphaned learned recipes',
        sweep: () => visibilityService.cleanupLearnedRecipes(validRecipes),
        targeted:
          removed.length > 0 ? () => visibilityService.forgetDeletedRecipes?.(removed) : null,
      });
    }

    return runGatedMutationCleanup({
      passes,
      subject: 'a recipe change',
    });
  }
}
