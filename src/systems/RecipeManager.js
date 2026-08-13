import { getFabricateFlag, isSafeFlagKeySegment } from '../config/flags.js';
import { SETTING_KEYS } from '../config/settings.js';
import { matchGatheringTools, classifyGatheringToolStates } from '../gatheringToolRuntime.js';
import { getIngredientComponentId, getMatchHandler } from '../models/match/matchTypes.js';
import { DEFAULT_RECIPE_IMAGE, Recipe } from '../models/Recipe.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import {
  accumulateItemEssences,
  findMatchingComponent,
  resolveItemEssences,
} from '../utils/essenceResolver.js';
import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';
import {
  itemResolvesToComponent,
  itemResolvesToTool,
  itemIsToolByDurableIdentity,
} from '../utils/sourceUuid.js';

import { evaluatePrerequisite } from './characterPrerequisites.js';
import { applyDefinitionChange } from './CraftingDefinitionRepository.js';
import { buildCurrencyAffordProbe, getCurrencyRequirementConfig } from './currencyAffordance.js';
import { formatCurrencyRequirement, normalizeCurrencyUnit } from './currencyProfile.js';
import { readStackQuantity } from './itemStackQuantity.js';
import { RecipeActivationError } from './RecipeActivationError.js';
import { RecipePersistenceError } from './RecipePersistenceError.js';
import { corpusChanged, REVISION_SCOPES, RevisionRegistry } from './revisionTokens.js';
import { SettingsCraftingDefinitionRepository } from './SettingsCraftingDefinitionRepository.js';
import { SignatureValidator } from './SignatureValidator.js';
import { computeSystemVisibility } from './systemValidation.js';
import { ingredientSetToolsAreActive, resolveToolPrerequisites } from './toolCheckBonus.js';

const DEFAULT_RECIPE_IMG = DEFAULT_RECIPE_IMAGE;
const FALLBACK_RECIPE_IMG = 'icons/sundries/documents/document-bound-white-tan.webp';
const FALLBACK_COMPONENT_IMG = 'icons/svg/item-bag.svg';
// Foundry's generic default Item image. On a MATERIAL tile it is a sentinel meaning
// "no image", never an image to render (issue 917): a tag requirement with nothing
// matching in inventory has no item to read an image from, and a matched item may
// carry the literal as its own `img`. Both resolve to a null image so the tile draws
// its glyph. `FALLBACK_COMPONENT_IMG` is deliberately NOT retired — it also backs the
// tool-state image below, and blanking tool tiles is a different change.
const GENERIC_ITEM_IMG = 'icons/svg/item-bag.svg';
// A currency match never resolves to an inventory item, so it always shows a coin icon.
const FALLBACK_CURRENCY_IMG = 'icons/svg/coins.svg';

/**
 * The concrete owned Item documents reserved by an ingredient selection.
 * A physical Item cannot simultaneously be consumed as an ingredient and
 * participate as a reusable Tool in the same attempt.
 *
 * @param {object|null} selection
 * @returns {Set<object>}
 */
function selectedIngredientItems(selection) {
  return new Set(
    (Array.isArray(selection?.plan) ? selection.plan : [])
      .map((entry) => entry?.item)
      .filter(Boolean)
  );
}

/**
 * Manages recipe storage, retrieval, and CRUD operations
 */
export class RecipeManager {
  /**
   * @param {object} [deps]
   * @param {Function|null} [deps.getCraftingSystem] - `(systemId) => system`. The
   *   pre-existing narrow seam; still honoured by {@link _resolveCraftingSystem}.
   * @param {Function|null} [deps.getCraftingSystemManager] - `() => CraftingSystemManager`.
   *   The manager itself, for the paths that need more than one system or need the
   *   recipe/component accessors (issue 1072). Both default to the `game.fabricate`
   *   globals, so every existing `new RecipeManager({})` construction is unaffected.
   * @param {import('./CraftingDefinitionRepository.js').CraftingDefinitionRepository}
   *   [deps.repository] - the persistence seam (issue 1089). Defaults to the
   *   settings-backed adapter, so the ~100 single-argument construction sites in
   *   production and tests keep working unchanged; inject a fake to count reads and
   *   writes without patching `game.settings`.
   */
  constructor({
    getCraftingSystem = null,
    getCraftingSystemManager = null,
    repository = null,
  } = {}) {
    this.recipes = new Map();
    this.initialized = false;
    // The revision-token registry this manager mints from (issue 1076). Per manager, never
    // a module singleton: two managers in one test process must not share counters.
    this._revisions = new RevisionRegistry();
    // The retained `craftingSystemId -> recipe id[]` cohort, rebuilt lazily. Holds IDS, not
    // recipe objects, so replacing a stored recipe under the same id is transparently
    // correct and only an add/remove/move can invalidate it.
    this._cohortCache = null;
    this.getCraftingSystem = typeof getCraftingSystem === 'function' ? getCraftingSystem : null;
    this._getCraftingSystemManager =
      typeof getCraftingSystemManager === 'function' ? getCraftingSystemManager : null;
    // The adapter shares THIS map rather than mirroring it — see
    // `SettingsCraftingDefinitionRepository` for why a second ordered map would be a
    // silent corruption of the persisted array's order. The manager still owns every
    // in-memory `set`/`delete` on it: the repository is the persistence seam, not the
    // domain state, and a document-backed adapter (#1080) will not maintain this map.
    this._repository =
      repository ??
      new SettingsCraftingDefinitionRepository({
        settingKey: SETTING_KEYS.RECIPES,
        corpus: () => this.recipes,
        hydrate: (raw) => Recipe.fromJSON(raw),
        serialize: (recipe) => recipe.toJSON(),
        scopeOf: (recipe) => recipe?.craftingSystemId ?? null,
      });
  }

  /**
   * The crafting-system manager collaborator.
   *
   * Every path that needs the manager routes through here (issue 1072). Twelve sites
   * previously read `game.fabricate?.getCraftingSystemManager?.()` inline — including
   * {@link _validateSignatures}, the one path the alchemy signature-audit work has to
   * instrument — which meant the manager was reachable only by installing a global
   * shim. A counting or caching collaborator can now be injected through the
   * constructor, and the global stays as the default so no existing caller changes.
   *
   * Resolved per call, never cached: `game.fabricate` is assembled during Foundry's
   * `ready` hook, after the managers are constructed, so a value captured in the
   * constructor would be `undefined` forever.
   *
   * @returns {object|null}
   * @private
   */
  _systemManager() {
    if (this._getCraftingSystemManager) return this._getCraftingSystemManager() ?? null;
    return game.fabricate?.getCraftingSystemManager?.() ?? null;
  }

  /**
   * The seam bag handed to the currency affordance layer.
   *
   * `evaluateCraftability` builds a currency probe per recipe, and that probe resolves the
   * system's currency config — so without this the player listing path would still reach
   * the `game.fabricate` global once per recipe even though the manager holds an injected
   * collaborator (issue 1072). Mirrors `CraftingEngine._currencySeams()`, which supplies
   * the coin spenders on the same bag.
   *
   * @returns {{getCraftingSystemManager: () => object|null}}
   * @private
   */
  _currencySeams() {
    return { getCraftingSystemManager: () => this._systemManager() };
  }

  /**
   * A {@link SignatureValidator} source built from the manager collaborator.
   *
   * One definition shared by the enable-time gate ({@link _validateSignatures}) and the
   * post-mutation reconciliation ({@link disableSignatureConflicts}), which previously
   * carried near-identical adapter closures that could drift apart (issue 1072).
   * `getComponentsForSystem` prefers the manager's own accessor so a counting or indexed
   * manager is actually consulted, and falls back to reading `system.components` for the
   * many fixtures whose system manager is a bare `{getSystem}` object.
   *
   * @param {object} systemManager
   * @param {(systemId: string) => object[]} getRecipesForSystem - Supplied by the caller
   *   because the two callers genuinely differ: the enable-time gate substitutes the
   *   candidate recipe for its still-disabled stored copy.
   * @returns {{getSystem: Function, getRecipesForSystem: Function, getComponentsForSystem: Function}}
   * @private
   */
  _signatureSource(systemManager, getRecipesForSystem) {
    return {
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem,
      getComponentsForSystem: (id) =>
        typeof systemManager.getComponentsForSystem === 'function'
          ? systemManager.getComponentsForSystem(id)
          : systemManager.getSystem(id)?.components || [],
    };
  }

  /**
   * Ensure only GMs can mutate recipe state
   * @param {string} action - Action name for error context
   * @private
   */
  _assertGM(action) {
    if (!game.user?.isGM) {
      throw new Error(`GM permissions required: ${action}`);
    }
  }

  /**
   * Reject a recipe id that cannot serve as a durable-flag MAP KEY (issue 1143), the
   * exact sibling of `CraftingSystemManager._assertValidSystemId` and the same
   * `isSafeFlagKeySegment` doctrine.
   *
   * A recipe id is interpolated into two per-actor flag maps, `learnedRecipes` and
   * `discoveryProgress`. Those are written through a flattened `Document#update` path,
   * and `Document#update` dot-expands the whole nested VALUE TREE of an `ObjectField`
   * (V14 in `ObjectField#_cleanType`, V13 one level up in `DataModel#updateSource`), so
   * an id containing a `.` is not stored under the key it was written with — it becomes
   * a SUBTREE. Every reader indexing the map by id then misses it, and worse, the
   * id→storage mapping stops being injective: learning `a.b` and then `a` silently
   * destroys `a.b` before any reader runs. Reader-side repair
   * (`recipeKeyedFlagEntries.js`) is best-effort for worlds that already carry such an
   * id; refusing it here is the complete fix.
   *
   * Fail LOUDLY at the entry point rather than accepting a booby-trapped id. The id is
   * NEVER rewritten — recipe books, Required Knowledge, and learned entries all
   * reference the recipe by id. `foundry.utils.randomID()` always satisfies the pattern,
   * so this can only fire for an imported or hand-authored id; the compendium importer
   * already isolates a per-recipe failure into its import report. Loading an existing
   * world does NOT route through here, so a world that already holds such an id keeps
   * working under reader-side repair instead of being bricked.
   *
   * @private
   */
  _assertValidRecipeId(id) {
    if (!isSafeFlagKeySegment(id)) {
      throw new Error(
        `Invalid recipe id "${id}": a recipe id must match /^[A-Za-z0-9_-]+$/ (no dots or spaces), because it is used as a durable-flag map key in learnedRecipes and discoveryProgress.`
      );
    }
  }

  /**
   * Initialize the recipe manager and load saved recipes
   */
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
   * Persist a recipe mutation through the definition repository (issue 1089).
   *
   * `save()` with no argument is the whole-corpus write it has always been, and it is
   * still the batch callers' flush point: the compendium importer and the
   * essence-deletion cascade mutate the in-memory map per recipe with
   * `{ persist: false }` and then issue exactly one of these.
   *
   * `save({ put })` / `save({ delete })` / `save({ batch })` name the records a
   * mutation actually touched. Under the settings adapter all four write the same
   * bytes, because `game.settings.set` cannot address one element — but the
   * information is now carried to the seam instead of being discarded at the call
   * site, which is the whole point of landing this before the persistence ADR.
   *
   * @param {import('./CraftingDefinitionRepository.js').DefinitionChange} [change]
   */
  async save(change = null) {
    await applyDefinitionChange(this._repository, change, this.recipes.values());
  }

  /**
   * Re-read the persisted recipes setting into the in-memory map. Unlike
   * `initialize()` (which early-returns once initialized), this is the un-guarded
   * refresh path used when the replicated world setting changes on ANOTHER client —
   * the GM's save updates their own map directly, but a player's in-memory map only
   * catches up here. Does NOT persist, so it is safe to call from a settings hook
   * without a write loop.
   *
   * Change detection is {@link corpusChanged}, NOT `JSON.stringify` of the whole corpus
   * (issue 1076). The old comparison serialized every recipe twice per reload — 22.3 MB of
   * string per pass at 10,000 recipes — on every connected client, purely to answer a
   * boolean. The replacement compares record by record with a reference fast path and
   * short-circuits at the first difference, and a reload that finds no change advances no
   * revision token.
   *
   * @returns {boolean} `true` only when the recipes actually changed, so
   *   callers can skip re-emitting a change hook (and avoid a redundant refresh on
   *   the writing client, whose map already holds the saved data).
   */
  reload() {
    // Optional repository capability: `null` means the backend has no synchronous
    // replicated snapshot to read, which is the honest answer for anything
    // document-backed (#1088 Q3). Reloading is then a no-op rather than a wrong
    // answer, and #1092 owns the replacement transport.
    const savedRecipes = this._repository.readReplicatedSnapshot();
    if (!savedRecipes) return false;
    const next = new Map();
    for (const recipe of savedRecipes) {
      next.set(recipe.id, recipe);
    }
    const changed = corpusChanged(this.recipes.values(), next.values(), (recipe) =>
      typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe
    );
    this.recipes = next;
    this.initialized = true;
    // The cohort index is keyed on the map object, so a replaced map is already a miss;
    // dropping it here keeps that explicit rather than incidental.
    this._cohortCache = null;
    if (changed) {
      const touched = new Set();
      for (const recipe of next.values()) touched.add(recipe?.craftingSystemId);
      this._advanceRecipeRevision(...touched);
    }
    return changed;
  }

  _notifyRecipesChanged(action, details = {}) {
    globalThis.Hooks?.callAll?.('fabricate.recipesChanged', {
      action,
      recipes: this.getRecipes(),
      ...details,
    });
  }

  notifyRecipesChanged(details = {}) {
    this._notifyRecipesChanged(details.action || 'external', details);
  }

  /**
   * Create a new recipe
   * @param {Object} recipeData - Recipe configuration
   * @param {{notify?: boolean, allowIncomplete?: boolean, persist?: boolean}} [options] - Set
   *   notify=false for batch callers that emit their own summary. Set allowIncomplete=true to
   *   persist a structurally valid but incomplete authoring shell (missing ingredient sets /
   *   result groups); such a shell stays non-craftable because the engine gates on the full
   *   completeness contract. Set persist=false for batch callers (e.g. the compendium importer)
   *   that mutate the in-memory map per recipe and then issue a SINGLE `save()` after the whole
   *   batch; validation, map mutation, and notify/emitChange gating are unchanged, only the
   *   per-recipe `save()` (one whole-array `recipes` world write) is skipped. Default `true`
   *   keeps every single-recipe caller issuing its one write.
   * @returns {Promise<Recipe>}
   */
  async createRecipe(recipeData, options = {}) {
    this._assertGM('create recipe');

    const recipe = new Recipe(recipeData);
    this._assertValidRecipeId(recipe.id);
    const validation = this._validateRecipeForPersistence(recipe, {
      requireComplete: !options.allowIncomplete,
    });

    if (!validation.valid) {
      // A structural/reference save failure carries coded, id-free issues so the UI
      // can localize it (issue 595); the `.message` keeps the headless English
      // aggregate for console/non-UI callers.
      throw new RecipePersistenceError('create', recipe.name, validation.issues);
    }

    // A recipe may only be created active when fully valid. A drafting create (allowIncomplete) is
    // not an enable action, so an invalid draft is born disabled; a strict create that explicitly
    // asks for an active recipe is rejected so the caller fixes it first.
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
    this._advanceRecipeRevision(recipe.craftingSystemId);
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

  /**
   * Update an existing recipe
   * @param {string} recipeId - Recipe ID to update
   * @param {Object} updates - Properties to update
   * @param {{notify?: boolean, allowIncomplete?: boolean, persist?: boolean}} [options] - Set
   *   notify=false for batch callers that emit their own summary. Set allowIncomplete=true to
   *   persist a structurally valid but incomplete authoring shell (e.g. identity-only edits to a
   *   recipe whose ingredients/results are still empty); such a shell stays non-craftable. Set
   *   persist=false for batch callers (e.g. the compendium importer) that mutate the in-memory
   *   map per recipe and then issue a SINGLE `save()` after the whole batch; validation, map
   *   mutation, and notify/emitChange gating are unchanged, only the per-recipe `save()` (one
   *   whole-array `recipes` world write) is skipped. Default `true` keeps every single-recipe
   *   caller issuing its one write.
   * @returns {Promise<Recipe>}
   */
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
      // See createRecipe: a coded, id-free persistence error the UI can localize
      // (issue 595) — e.g. an ingredient set mapping to a missing result group on an
      // ordinary save no longer leaks the set/group id into the toast.
      throw new RecipePersistenceError('update', updatedRecipe.name, validation.issues);
    }

    // Only an explicit transition into the enabled state requires full validity. Edits to an
    // already-enabled recipe (and any disable) persist on structural validity alone; the engine
    // still gates craftability and the alchemy signature re-check disables conflicts after deletes.
    if (updatedRecipe.enabled === true && recipe.enabled !== true) {
      const activation = this._validateRecipeForActivation(updatedRecipe);
      if (!activation.valid) {
        throw new RecipeActivationError(updatedRecipe.name, activation.issues);
      }
    }

    this.recipes.set(recipeId, updatedRecipe);
    // Both systems, because an edit that MOVES a recipe must also invalidate a consumer
    // watching the system it left (issue 1076).
    this._advanceRecipeRevision(recipe.craftingSystemId, updatedRecipe.craftingSystemId);
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

  /**
   * Whether the activation gate would ACCEPT this recipe — the ONE predicate behind the
   * recipe browser's `Can't enable` pill, the bulk edit panel's pre-flight count, and the
   * bulk write's own per-recipe gate (issue 1010).
   *
   * Three surfaces reading one predicate is the whole point of the method existing. The row
   * previously derived its pill from `incomplete`
   * (`validate().valid === false && validateStructure().valid === true`), so a STRUCTURALLY
   * broken recipe wore no pill at all while still being un-enableable, and a second, wider
   * predicate beside it would let the panel count recipes no row was marking.
   *
   * Evaluates a CLONE with `enabled: true`, never the stored recipe. That is load-bearing,
   * not defensive: {@link RecipeManager#_validateSignatures} substitutes the candidate into
   * the live recipe list, and `SignatureValidator.validateSystem` then scans
   * `recipes.filter((r) => r?.enabled)` — so handing it a stored `enabled: false` recipe
   * filters the candidate out of its OWN scan and answers "not blocked" for a recipe
   * `updateRecipe` will refuse. The clone is built exactly as `updateRecipe` builds its
   * candidate (`Recipe.fromJSON` over the stored JSON plus the patch), so the two cannot
   * drift apart.
   *
   * Reads only: nothing is written to the map and nothing is persisted, so this is safe on
   * a render path.
   *
   * EXACT for the persistence and completeness blockers — structure, completeness, essence
   * references, tag placeholders and resolution-mode requirements. A LOWER BOUND for the
   * alchemy signature collisions a BATCH itself creates: two recipes that collide only with
   * EACH OTHER both answer `valid: true` here, because each is evaluated against the
   * pre-batch list, while a batch enable accepts the first and refuses the second. That
   * follows from the same order-dependence that makes the in-loop gate correct, so it is
   * structural rather than a gap to close — a pre-flight count derived from this predicate
   * is a lower bound and must be worded as one, and the post-apply `blockedEnables` count is
   * the authority.
   *
   * @param {Recipe|string} recipeOrId a recipe, or the id of one held in this manager.
   * @returns {{valid: boolean, errors: string[],
   *   issues: {code: string|null, params: object, message: string}[]}}
   *   An id (or object) that resolves to no recipe is INVALID rather than a throw, so a
   *   render path and a stale selection never have to guard the call.
   */
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

  /**
   * Delete a recipe
   * @param {string} recipeId - Recipe ID to delete
   * @param {{notify?: boolean, emitChange?: boolean, cleanupFlags?: boolean, persist?: boolean}} [options]
   *   Set `notify=false` for batch callers that emit their own summary. Set
   *   `cleanupFlags=false` when a batch caller (e.g. `CraftingSystemManager.deleteSystem`
   *   or the compendium importer's prune phase) deletes many recipes and then runs its
   *   OWN single bulk actor-flag cleanup pass (see {@link cleanupOrphanedRecipeFlags}),
   *   so the per-recipe `_cleanupFlagsAfterRecipeMutation` fan-out (N recipes × M actors
   *   flag scans) is not repeated once per recipe. Set `persist=false` (symmetric with
   *   `createRecipe`/`updateRecipe`) for a batch caller that mutates the in-memory map
   *   per recipe and then issues a SINGLE `save()` after the whole batch; only the
   *   per-recipe `save()` (one whole-array `recipes` world write) is skipped. Default
   *   `true` keeps every single-recipe caller issuing its one write.
   */
  async deleteRecipe(recipeId, options = {}) {
    this._assertGM('delete recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    this.recipes.delete(recipeId);
    this._advanceRecipeRevision(recipe.craftingSystemId);
    if (options.persist !== false) {
      await this.save({ delete: recipeId });
    }
    if (options.cleanupFlags !== false) {
      await this._cleanupFlagsAfterRecipeMutation();
    }
    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${recipe.name}" deleted`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('delete', { recipeId });
    }
  }

  /**
   * Run ONE bulk actor-flag cleanup pass after a batch of recipe deletions (the
   * `deleteSystem` precedent). A batch caller — e.g. the compendium importer's prune
   * phase — deletes many recipes with `cleanupFlags:false` to suppress the per-recipe
   * fan-out, then calls this once so invalid-run and learned-recipe flags reconcile
   * against the post-deletion map in a single O(affected actors) pass rather than
   * O(pruned × actors). Public thin wrapper over `_cleanupFlagsAfterRecipeMutation`.
   */
  async cleanupOrphanedRecipeFlags() {
    await this._cleanupFlagsAfterRecipeMutation();
  }

  /**
   * Get a recipe by ID
   * @param {string} recipeId - Recipe ID
   * @returns {Recipe|null}
   */
  getRecipe(recipeId) {
    return this.recipes.get(recipeId) || null;
  }

  /**
   * The current revision token of one scope (issue 1076).
   *
   * The read half of the contract documented in {@link module:revisionTokens}. Consumers
   * (#1074's signature report, #1077's snapshots, #1078's invalidation routing) hold a
   * token and compare it with `===`; they never advance one.
   *
   * @param {string} [scope] A member of `REVISION_SCOPES`, defaulting to the whole recipe
   *   domain.
   * @returns {number}
   */
  revision(scope = REVISION_SCOPES.recipes) {
    return this._revisions.read(scope);
  }

  /**
   * Advance the recipe revision tokens after a mutation, and drop the cohort index.
   *
   * Always advances the DOMAIN scope plus the scope of every crafting system named — a
   * move between systems names both, because a consumer watching the system the recipe
   * LEFT must also stop trusting its cache.
   *
   * @param {...(string|null|undefined)} systemIds The crafting systems this mutation
   *   touched.
   * @returns {void}
   * @private
   */
  _advanceRecipeRevision(...systemIds) {
    this._cohortCache = null;
    const scopes = systemIds
      .filter((systemId) => systemId != null)
      .map((systemId) => REVISION_SCOPES.recipesOfSystem(systemId));
    this._revisions.advance(REVISION_SCOPES.recipes, ...scopes);
  }

  /**
   * The retained `craftingSystemId -> recipe id[]` cohort index (issue 1076).
   *
   * `getRecipes({craftingSystemId})` is called from every listing, visibility and
   * validation path, and each call used to copy EVERY recipe in EVERY system into a fresh
   * array before discarding all but one system's. The index answers the same question from
   * the smallest cohort instead.
   *
   * It stores IDS rather than recipe objects on purpose: replacing a stored recipe under
   * the same id — which is what `updateRecipe` does — leaves the cohort correct without any
   * bookkeeping, so only an add, a delete or a move between systems can invalidate it. Its
   * validity is the map's identity plus its size plus the domain revision token, so a
   * fixture that populates `manager.recipes` directly is still seen.
   *
   * @returns {Map<*, string[]>} Recipe ids per crafting system id, in map insertion order.
   * @private
   */
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

  /**
   * Get all recipes
   * @param {Object} filters - Optional filters
   * @returns {Recipe[]}
   */
  getRecipes(filters = {}) {
    let recipes;
    // Start from the smallest indexed cohort available rather than copying the whole
    // corpus and filtering it down (issue 1076). Order is the map's insertion order in
    // both branches, so the returned list is identical to the pre-index one.
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

  /**
   * Find recipes that can be crafted with the given component source actors
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @returns {Recipe[]}
   */
  getAvailableRecipes(componentSourceActors) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const recipes = this.getRecipes({ enabled: true });
    const available = [];

    // System-validity gate: a system with a `blocks: 'system'` issue exposes NO
    // recipes to non-GM users (the crafting guard then has nothing to start). GMs
    // bypass the gate so they can still reach a broken system to fix it. The
    // per-system blocker decision is computed at most once per listing call
    // (cached by system id), NOT a full overview rebuild — this is a synchronous
    // per-render read.
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

  /**
   * Whether a system is hidden by a `blocks: 'system'` validation issue. Cached
   * per listing call so a multi-recipe system is evaluated once. Returns false
   * (fail-open) when the system or validation collaborators are unavailable, so a
   * missing manager never blanks a player's recipe list. GM bypass is the
   * caller's concern.
   *
   * @param {string|null|undefined} systemId
   * @param {Map<string, boolean>} cache Per-call blocker cache, keyed by system id.
   * @returns {boolean}
   * @private
   */
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
      components: system.components || [],
    });
    cache.set(systemId, blocksSystem === true);
    return blocksSystem === true;
  }

  /**
   * Evaluate whether a recipe can be crafted, returning a single unified result
   * that is the sole source of truth for both the craftability boolean and the
   * per-ingredient/essence/tool display states.
   *
   * This eliminates the divergent computation paths that caused the false
   * "Cannot Craft" status (T-082): previously canCraft() and the UI display loop
   * each walked the items independently, leading to inconsistent results when
   * shared items were involved.
   *
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @param {Recipe} recipe - The recipe to evaluate
   * @param {object} [options]
   * @param {{ systemId?: string|null, componentIds?: string[] }|null} [options.presentTools] -
   *   Virtual-present payload injected by an active canvas Tool station (Phase 4).
   *   A tool whose componentId is in `componentIds` AND whose recipe crafting
   *   system matches the payload `systemId` is satisfied WITHOUT an owned item and
   *   is marked `{ available: true, virtual: true }` so the caller excludes it
   *   from breakage/usage. componentId is per-system, so the system scope prevents
   *   a tool from system A satisfying a system-B recipe.
   * @param {object|null} [options.craftingActor] - the actor whose currency funds a
   *   currency-alternative group. The display probe is bound to this actor so the
   *   craftability shown to a player agrees with what the engine spends. Defaults to
   *   `null`, which makes every currency option show as missing (no crash).
   * @param {Function} [options.resolveComponent] - Optional component resolver injected
   *   on the alchemy craft path (issue 578) so a tier-4-only submission satisfies the
   *   ingredient and essence checks against the same component the collector bucketed it
   *   to. Defaults (undefined) to the shared resolvers used by standard crafting and
   *   every display caller — byte-for-byte unchanged.
   * @param {object|null} [options.optionOverrides] - Per-group player option overrides
   *   (issue 552), keyed by `group.id` → `{ optionIndex, heldItemId? }`. Threaded to
   *   `resolveIngredientSelection` so both this display path and the engine's
   *   consumption resolve the SAME chosen option/stack. Null (the default) keeps the
   *   first-satisfiable behaviour byte-for-byte unchanged.
   * @param {object|null} [options.essenceAllocation] - The player's `{ itemKey: units }`
   *   funding for the set's shared essence block (issue 917), threaded so the rail
   *   displays exactly what the craft consumes. Null (the default) uses the allocator's
   *   suggestion, which is today's behaviour.
   * @returns {{
   *   canCraft: boolean,
   *   satisfiableSet: IngredientSet|null,
   *   missing: { ingredients: Array, essences: Array, tools: Array },
   *   ingredientStates: Array<{ groupId: string|null, description: string, need: number, have?: number, delivered?: number, owned?: number, satisfied: boolean, hasChoice: boolean, choiceCount: number, isEssence?: boolean, icon?: string|null }>,
   *   ingredientChoices: Array<object>,
   *   essenceStates: Array<{ type: string, need: number, have: number, satisfied: boolean, isEssence: boolean, icon: string|null }>,
   *   essencePool: object|null,
   *   toolStates: Array<{ name: string, img: string|null, available: boolean, virtual?: boolean }>
   * }}
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

    // Bind the currency affordability probe to the crafting actor so a currency
    // alternative is selectable in the display exactly when the engine could spend
    // it. A null actor yields a probe that is always false (currency shows missing).
    const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe, this._currencySeams());

    // Resolve the recipe's currency units once so a currency option's cost row can
    // render a human label (abbreviation, else label) instead of the raw unit id.
    // Normalizing here (not the raw config units) applies the abbreviation self-heal
    // and works even when currency is disabled/invalid.
    const currencyUnits = this._resolveNormalizedCurrencyUnits(recipe);

    // Bind the component-aware essence resolver so an essence GROUP option can draw
    // down items carrying that essence (issue 649). Byte-for-byte for recipes with no
    // essence options; a capability increase for those that do.
    const resolveItemEssencesForSet = this._buildEssenceOptionResolver(recipe, resolveComponent);

    // Attempt to find a satisfiable ingredient set.
    // We capture both the satisfiable set (if any) and the first-set result for
    // the fallback display path.
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

    // Build tool states from resolved library Tools using the satisfiable set
    // (or first set as fallback). Reuses the gathering tool matcher path so the
    // presence check agrees with attempt validation. Tools resolve from the
    // per-system library via `toolIds`.
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

    // Build ingredient display states from the selection result that matches
    // the craftability decision — ensuring they are always consistent.
    //
    // If craftable: use satisfiableSetSelection (all groups satisfied).
    // If not craftable: use firstSetSelection (shows what is missing from set 0).
    const displayIngredientSet = displaySet;

    const ingredientStates = this._buildIngredientStates(
      recipe,
      displayIngredientSet,
      displaySelection,
      availableItems
    );

    // Per-group player-facing option/stack choices (issue 552). Empty unless a group
    // offers a real choice (multiple authored options, or a tag option matching more
    // than one held stack), so the common single-option case renders no selector.
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

    // Build essence states from the display set. This readout is display-only and is
    // intentionally NOT threaded with the alchemy tier-4 resolver (issue 578): it is
    // harmless because `missing.essences` below is forced empty whenever canCraft is
    // true, and the alchemy workbench does not render this per-type essence-state list.
    const essenceStates = this._buildEssenceStates(
      recipe,
      displayIngredientSet,
      availableItems,
      features
    );

    // The set's shared essence funding (issue 917) — the carriers a player allocates
    // from and what each requirement is delivered. Null when the system has essences
    // disabled or the set authors no essence requirement.
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

  /**
   * The material requirement to craft a recipe ONCE via ANY ingredient set, for the
   * shopping list. Unlike {@link evaluateCraftability} (which reports a single
   * chosen set), this unions every set: per component / per essence the `need` is
   * the MAXIMUM across sets, and tools are the union of every set's tools. That is
   * exactly enough to craft the recipe once whichever set the player picks — NOT
   * enough to craft every set at once.
   *
   * Same `{ ingredientStates, essenceStates, toolStates }` shape as
   * evaluateCraftability (with `have` re-derived against the merged max `need`), so
   * the shopping aggregator consumes it identically.
   *
   * @param {Actor[]} componentSourceActors
   * @param {Recipe} recipe
   * @param {object} [options]
   * @param {object|null} [options.craftingActor]
   * @returns {{ ingredientStates: Array, essenceStates: Array, toolStates: Array }}
   */
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
      for (const state of this._buildIngredientStates(recipe, set, selection, availableItems)) {
        const key = state.componentId ?? state.description ?? state.name;
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

    // Re-derive satisfaction against the merged max need. An essence requirement has
    // no `have` — its plan-scoped `delivered` is capped at `need` and would always
    // read satisfied — so the shopping projection restates its `owned` (the uncapped
    // essence amount held) as the `have` the aggregator shops against.
    const ingredientStates = [...ingredientByKey.values()].map((state) => {
      const held = state.isEssence === true ? (state.owned ?? 0) : (state.have ?? 0);
      return { ...state, have: held, satisfied: held >= (state.need ?? 0) };
    });
    const essenceStates = [...essenceByType.values()].map((essence) => ({
      ...essence,
      satisfied: (essence.have ?? 0) >= (essence.need ?? 0),
    }));

    return { ingredientStates, essenceStates, toolStates: [...toolByKey.values()] };
  }

  /**
   * Build per-tool display/presence states for a recipe's resolved library
   * Tools. Each entry is
   * `{ name, available }` where `available` is true when at least one of the
   * supplied items satisfies the tool's component reference (and is not broken),
   * using the same matcher gathering attempt validation uses.
   *
   * @private
   * @param {Recipe} recipe
   * @param {Array<object>} tools - resolved library Tool objects
   * @param {Array<Item>} availableItems - aggregated source-actor items
   * @returns {Array<{ name: string, available: boolean }>}
   */
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
    // `matchGatheringTools` scopes the virtual-present set to the system passed
    // here (the recipe's crafting system), so a present tool from a different
    // system never satisfies this recipe's tool prerequisites.
    const matchArgs = {
      actor: { items: availableItems },
      system: { id: recipe?.craftingSystemId ?? null },
      task: { id: recipe?.id ?? null, craftingSystemId: recipe?.craftingSystemId ?? null },
      tools,
      craftingSystemManager: { recipeManager: this },
      presentTools,
    };
    const matched = matchGatheringTools(matchArgs);
    // The same matcher, split into present/damaged/missing so the UI can show
    // "Repair" (present-but-broken) vs "Acquire" (absent) — `matched` alone
    // collapses both broken and absent into unavailable.
    const stateByTool = new Map(
      classifyGatheringToolStates(matchArgs).map((entry) => [entry.tool, entry.state])
    );
    // Index by tool so the per-tool state can carry the virtual flag (a
    // virtual-present match has no owned item and must be excluded from
    // breakage/usage by the caller).
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
    return Array.isArray(system?.characterPrerequisites) ? system.characterPrerequisites : [];
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

  /**
   * Derive per-group ingredient display states from a resolved selection result.
   * The states are derived from the SAME selection result that determined craftability,
   * so they are always consistent with the canCraft boolean.
   *
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @param {Object} selection - result from resolveIngredientSelection
   * @param {Item[]} availableItems
   * @returns {Array<{ componentId: string|null, name: string, img: string|null, description: string, need: number, have?: number, delivered?: number, owned?: number, satisfied: boolean, isEssence?: boolean, icon?: string|null }>}
   * @private
   */
  _buildIngredientStates(recipe, ingredientSet, selection, availableItems) {
    if (!ingredientSet) return [];

    const context = {
      availableItems,
      selection,
      missingByGroup: this._missingEntriesByGroupId(selection),
      // The option the engine chose per group (issue 553), so the tile always mirrors
      // the option/stack the craft consumes.
      chosenByGroup: this._chosenOptionByGroup(ingredientSet, selection),
      // Every essence requirement's attributed share of the block, keyed by group id
      // (issue 917) — the SOLE source of an essence tile's reported quantity, on the
      // satisfied path as well as the missing one.
      essenceByGroup: this._essenceRequirementsByGroupId(selection),
    };

    return this._displayGroups(ingredientSet).map((group) =>
      this._buildIngredientState(recipe, group, context)
    );
  }

  /**
   * The groups a display state is built for: the authored ingredient groups, or a
   * synthetic one-option group per legacy flat ingredient.
   * @private
   */
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

  /**
   * The display state for ONE ingredient group, dispatched on the chosen option's
   * kind: an essence requirement reports its attributed share of the block, a short
   * group its missing entry, and a satisfied component/tag group its held quantity.
   * @private
   */
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

    if (missingEntry) {
      return {
        ...this._resolveIngredientVisual(recipe, chosenOption, context.availableItems),
        ...base,
        need: Number(missingEntry.need || chosenOption?.quantity || 1),
        have: Number(missingEntry.have || 0),
        satisfied: false,
      };
    }

    // The specific inventory item the engine will consume for this option, from the
    // same consumption plan, so a shared tag/component tile shows the CONSUMED item
    // rather than the first inventory item that merely matches (issue 553).
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

  /**
   * A group's tile caption: ONLY the chosen option's description (issue 552) instead
   * of OR-joining every option's name against a single unlabelled have/need pip, with
   * the OR-join retained as the fallback when the chosen option describes to nothing.
   * @private
   */
  _resolveGroupDescription(recipe, chosenOption, options) {
    const chosen = this._resolveIngredientDescription(recipe, chosenOption);
    if (chosen) return chosen;
    return options.map((o) => this._resolveIngredientDescription(recipe, o) || '').join(' OR ');
  }

  /**
   * The display state for one ESSENCE requirement.
   *
   * An essence option is amount-based, not occurrence-based, so it reports `delivered`
   * — the essence amount the resolved allocation supplies it under the block's
   * per-essence-id partition — beside `owned`, the essence amount held across every
   * matching carrier. The component/tag `have` is deliberately NOT reused: it is not
   * net of plan, and reading two different questions off one key in a single array is
   * exactly the ambiguity issue 917 removes. Because every take is capped at `need`, a
   * satisfied requirement always reads `need / need`.
   * @private
   */
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

  /**
   * The inventory item the consumption plan spends for a group.
   *
   * An essence requirement resolves through `essenceGroupIds` FIRST: the block emits
   * one entry per item key naming one `ingredient`, so a sibling essence tile reading
   * only `entry.ingredient` would resolve to no consumed item at all.
   * @private
   */
  _consumedItemForGroup(selection, group, chosenOption) {
    const entries = selection?.plan || [];
    const groupId = group?.id ?? null;
    if (groupId) {
      const byGroup = entries.find((entry) => entry?.essenceGroupIds?.includes(groupId));
      if (byGroup) return byGroup.item ?? null;
    }
    return entries.find((entry) => entry.ingredient === chosenOption)?.item || null;
  }

  /**
   * Map each group id to the option the resolver chose for it. For a satisfied group
   * that is the pushed `selectedIngredients` entry (item or currency); for a missing
   * group it is the `missingGroups` representative option (the overridden or
   * best-effort short option). resolveIngredientSelection appends exactly ONE entry
   * to `selectedIngredients` per NON-missing group in group order, so satisfied
   * groups read their option by running index.
   * @private
   * @returns {Map<string, Ingredient|null>}
   */
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

  /**
   * Resolve the recipe's configured currency units into normalized units so a currency
   * option's cost row renders a human label. Normalizing (rather than reading the raw
   * config units) applies the abbreviation self-heal, so a legacy unit whose stored
   * abbreviation is its own generated id still resolves to its label.
   * @private
   * @returns {object[]}
   */
  _resolveNormalizedCurrencyUnits(recipe) {
    const units = getCurrencyRequirementConfig(recipe, this._currencySeams())?.units || [];
    return units.map((unit) => normalizeCurrencyUnit(unit)).filter(Boolean);
  }

  /**
   * Build the player-facing per-group option/stack choices (issue 552). Only groups
   * that offer a real choice appear: a MULTI-option group emits an `option`
   * radiogroup, and when the currently-chosen option is a tag matching MORE THAN ONE
   * held stack it also emits a `stack` radiogroup so the player can pick which held
   * item to consume. Single-option groups with no multi-stack tag emit nothing, so
   * the common case shows no selector.
   *
   * Each `option` carries `{ optionIndex, name, img, need, have, satisfied,
   * isCurrency, isEssence?, icon?, costLabel, affordable }` — an insufficient option is included
   * (selectable but flagged `satisfied: false`), matching the resolver, which
   * honours it and lets the craft block with the missing-materials message.
   *
   * @private
   * @returns {Array<object>}
   */
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

  /**
   * Build one option descriptor for the choices model. `have` is the raw total held
   * quantity matching the option across the full inventory (an isolated affordability
   * indicator per alternative, independent of the shared remaining-quantity pool).
   * @private
   */
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

  /**
   * The distinct held stacks a tag option matches, or `[]` when the option is not a
   * tag option (component/currency/exact-item options resolve to a single item and
   * offer no held-stack choice).
   * @private
   * @returns {Array<{ itemId: string, name: string, img: string|null, have: number }>}
   */
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

  /**
   * Resolve a human-readable description for an ingredient, using the resolved
   * component name instead of generic "component" text.
   *
   * @param {Recipe} recipe
   * @param {Ingredient|null} ingredient
   * @returns {string}
   * @private
   */
  _resolveIngredientDescription(recipe, ingredient) {
    if (!ingredient) return '';
    const match = ingredient.match || null;
    if (match?.type === 'component' && match.componentId) {
      const name = this.resolveComponentName(recipe, match.componentId);
      return `${ingredient.quantity || 1}x ${name}`;
    }
    // Resolve the essence NAME (not the raw essenceId, which is a generated id) so an
    // essence option's tile reads "3x Fire essence" rather than "3x <uuid> essence"
    // (the issue-595 opaque-id class). The pure handler's describe stays generic.
    if (match?.type === 'essence' && match.essenceId) {
      const name = this._resolveEssenceName(recipe, match.essenceId);
      const amount = Math.max(0, Number(match.amount) || 0);
      return `${amount}x ${name} essence`;
    }
    return ingredient.getDescription?.() || '';
  }

  /**
   * Resolve the tile presentation (component id, display name, image or essence
   * glyph metadata) for an ingredient, so the player detail can render its grid. Component-typed
   * matches resolve through the managed component library. Tag- and currency-typed
   * matches carry no managed component id, so their image is resolved from a live
   * inventory item that satisfies the match (issue 551): a tag tile shows the img
   * of the first held item matching the tag, falling back to a generic tag icon
   * when nothing in inventory matches; a currency tile always shows a coin icon (currency never
   * resolves to an inventory item). Anything else falls back to a null image (the
   * UI thumbnail then shows its default) and the ingredient's own description.
   *
   * @param {Recipe} recipe
   * @param {Ingredient|null} ingredient
   * @param {Item[]} [availableItems] - live inventory used to resolve a tag tile's
   *   image from a satisfying item; defaults to none.
   * @param {Item|null} [consumedItem] - the specific inventory item the engine will
   *   actually consume for this option (from the resolved consumption plan). When
   *   supplied, a tag tile borrows THIS item's image so the tile matches the item
   *   the craft spends, not merely the first inventory item that shares the tag
   *   (issue 553). Falls back to the first tag-matching held item (issue 551).
   * @returns {{ componentId: string|null, name: string, img: string|null, isEssence?: boolean, icon?: string|null }}
   * @private
   */
  _resolveIngredientVisual(recipe, ingredient, availableItems = [], consumedItem = null) {
    const match = ingredient?.match || null;
    if (match?.type === 'component' && match.componentId) {
      return {
        componentId: match.componentId,
        name: this.resolveComponentName(recipe, match.componentId),
        img: this._materialImg(this.resolveComponentImg(recipe, match.componentId)),
      };
    }

    // An essence tile resolves its NAME + authored icon from the essence definition
    // (never the raw essenceId). It carries an explicit presentation discriminator so
    // player surfaces render the authored glyph rather than an image fallback, plus
    // the GM-authored colour token that tints that glyph (issue 917).
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
      return { componentId: null, name, img: FALLBACK_CURRENCY_IMG };
    }

    return { componentId: null, name, img: null };
  }

  /**
   * A MATERIAL tile's image, or null when there is nothing to show. Foundry's generic
   * item-bag literal is the "no image" sentinel here rather than an image (issue 917),
   * so the tile falls back to its glyph instead of rendering the bag. It never falls
   * back to the recipe blueprint — that is the RECIPE's fallback, not a material's.
   * @private
   */
  _materialImg(img) {
    const resolved = typeof img === 'string' ? img.trim() : '';
    return !resolved || resolved === GENERIC_ITEM_IMG ? null : resolved;
  }

  /**
   * The GM-authored `--fab-tag-*` colour token for an essence definition, or null when
   * unauthored (which every surface renders as the theme accent — today's appearance).
   * @private
   */
  _essenceColorToken(definition) {
    const token = typeof definition?.colorToken === 'string' ? definition.colorToken.trim() : '';
    return token || null;
  }

  /**
   * Build essence display states for the given ingredient set.
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @param {Item[]} availableItems
   * @param {{ enableEssences: boolean }} features
   * @returns {Array<{ type: string, name: string, icon: string|null, isEssence: boolean, need: number, have: number, satisfied: boolean }>}
   * @private
   */
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

  /**
   * The shared essence-funding model for one ingredient set's craftability
   * (issue 917): what each essence requirement needs and was delivered, which held
   * stacks can fund it and how many units of each the plan draws, and the allocation
   * tying the two together.
   *
   * `null` when the system has essences disabled (matching the per-set essence-state
   * projection) or when the set authors no essence requirement, so a caller can gate
   * the whole surface on its presence.
   *
   * Every quantity here comes from the RESOLVER's own ledger. In particular
   * `carriers[].ownedUnits` is the units left AFTER the set's non-essence plan has
   * claimed: no surface re-reads the item's raw stack quantity, which lives at a
   * game-system-specific configured path, can be absent or `NaN`, and would offer the
   * player units the craft cannot spend.
   *
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @param {object|null} selection - the resolved selection carrying `essencePool`
   * @param {{ enableEssences: boolean }} features
   * @returns {object|null}
   * @private
   */
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

  /**
   * Resolve an essence's definition (`{ id, name, icon, … }`) from its system's
   * essence library, or null when no definition matches.
   * @private
   */
  _resolveEssenceDefinition(recipe, type) {
    const systemId = recipe?.craftingSystemId;
    const system = systemId ? this._systemManager()?.getSystem(systemId) : null;
    const definitions = Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
    return definitions.find((def) => def?.id === type) ?? null;
  }

  /**
   * Resolve an essence's display label from the system's essence definitions,
   * falling back to the raw type id when no definition/name is configured.
   * @private
   */
  _resolveEssenceName(recipe, type) {
    const name = this._resolveEssenceDefinition(recipe, type)?.name;
    return typeof name === 'string' && name.trim() ? name : String(type ?? '');
  }

  /**
   * Check if a recipe can be crafted with items from the given component source actors.
   * This is a thin wrapper around evaluateCraftability() that returns only the
   * backward-compatible subset: { canCraft, satisfiableSet, missing }.
   *
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @param {Recipe} recipe - The recipe to check
   * @param {object} [options]
   * @param {{ systemId?: string|null, componentIds?: string[] }|null} [options.presentTools] -
   *   Virtual-present payload from an active canvas Tool station (see
   *   evaluateCraftability for the system-scoping semantics).
   * @param {object|null} [options.craftingActor] - actor whose currency funds a
   *   currency-alternative group (see evaluateCraftability). Defaults to `null`.
   * @param {Function} [options.resolveComponent] - Optional component resolver injected
   *   on the alchemy craft path (issue 578); defaults (undefined) to the standard-craft
   *   resolvers (see evaluateCraftability).
   * @param {object|null} [options.optionOverrides] - Per-group player option overrides
   *   (issue 552), keyed by group id, forwarded to the resolver so the craftability
   *   decision honours the chosen option/stack (an insufficient choice blocks).
   * @returns {{canCraft: boolean, satisfiableSet: IngredientSet|null, missing: Object}}
   */
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

  /**
   * Check if an ingredient set can be satisfied with available items.
   *
   * Deliberately currency-BLIND: it passes no `affordCurrency` probe, so a currency
   * alternative never satisfies a group here. This helper does not feed the
   * craftability decision (that runs through {@link evaluateCraftability}, which is
   * actor-bound and currency-aware); it is an item/essence-only completeness check,
   * so threading the actor probe through it would add nothing.
   *
   * @param {IngredientSet} ingredientSet - The ingredient set to check
   * @param {Item[]} availableItems - Items available for crafting
   * @returns {{ingredients: Array, essences: Array}}
   * @private
   */
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

  /**
   * Resolve recipe-wide Tool ids plus any active ingredient-set Tool ids to
   * library Tool objects from the recipe's crafting system. Set ids are active
   * only for a named set in routed-by-ingredients mode. Unknown ids are skipped
   * rather than throwing, and duplicate references resolve once.
   *
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @returns {Array<object>} resolved library Tool objects
   */
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
      const tool = (system.tools || []).find((entry) => entry?.id === id) || null;
      if (tool) tools.push(tool);
    }
    return tools;
  }

  /**
   * Resolve a single library Tool by id from the recipe's crafting system.
   * @private
   */
  _getTool(recipe, toolId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !toolId) return null;
    const system = this._resolveCraftingSystem(systemId);
    if (!system) return null;
    return (system.tools || []).find((tool) => tool?.id === toolId) || null;
  }

  /**
   * Check whether a concrete item satisfies a recipe ingredient
   * @param {Recipe} recipe
   * @param {Ingredient} ingredient
   * @param {Item} item
   * @param {Function} [resolveComponent] - Optional component resolver injected on the
   *   alchemy craft path (issue 578) so a tier-4-only submission resolves to the same
   *   component the collector bucketed it to. Defaults (undefined) to the shared
   *   {@link resolveComponentForItem} used by standard crafting — byte-for-byte unchanged.
   * @returns {boolean}
   */
  ingredientMatchesItem(recipe, ingredient, item, resolveComponent) {
    const features = this._getSystemFeatures(recipe);
    // A component (or legacy systemItem) match resolves its id via the handler;
    // tags/currency/no-match return null and fall to the bare-field fallback,
    // then on to `_matchesIngredient`.
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

      // Source-UUID matching failed — fall back to an exact (case-insensitive) name
      // match, even when the component carries a registeredItemUuid. Foundry's transitive
      // `_stats.duplicateSource` points at the ORIGINAL template rather than the
      // component's own source item, so an inventory copy of a component that was
      // built by copying another item as a template (a common GM workflow) has no
      // ref back to the component's source and would otherwise never match despite
      // being the right, identically-named component. Shared, telemetry-bearing helper
      // (issue 540); case-INSENSITIVE, exactly as before.
      const byName = matchComponentByName(item, managedItem, {
        caseSensitive: false,
        systemId: recipe?.craftingSystemId,
      });
      if (!byName) return false;
    } else if (getMatchHandler(ingredient?.match).type === 'tags') {
      // A by-TAG ingredient carries no managed component id, so it never took the
      // component branch above — yet its authored tags live on the managed COMPONENT
      // definition (the very source the recipe editor links tag ingredients from),
      // NOT on the owned item's own flags. Resolve the item's component here (the one
      // craft-time seam with system-component context) and match against its tags, so
      // craft-time availability matches the editor's tag linking (issue 857).
      if (!this._matchesTagIngredient(recipe, ingredient, item, features, resolveComponent)) {
        return false;
      }
    } else if (!this._matchesIngredient(ingredient, item, features)) {
      return false;
    }

    return true;
  }

  /**
   * Whether an owned item satisfies a by-TAG ingredient at craft time. Fabricate
   * never stamps `flags.fabricate.tags` onto inventory items, so a tag ingredient
   * cannot be matched off the item's own flags alone (that is why by-tag ingredients
   * showed "no components available" while by-component ingredients worked — issue
   * 857). Resolve the item to its managed component and evaluate the tag rule against
   * the UNION of the component's authored tags and any item-level tag flag
   * (back-compat / third-party tagging), reusing the shared tags-match handler so the
   * any/all comparison stays single-sourced.
   *
   * @param {Recipe} recipe
   * @param {Ingredient} ingredient - a tags-type ingredient option
   * @param {Item} item
   * @param {{enableTags: boolean}} features
   * @param {Function} [resolveComponent] - the same component resolver threaded to
   *   {@link ingredientMatchesItem}; defaults to {@link findMatchingComponent}.
   * @returns {boolean}
   * @private
   */
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

  /**
   * Check whether a concrete item satisfies a Tool's PRESENCE requirement — the wide,
   * non-destructive gate (issue 561). A first-class Tool carries its OWN source references,
   * so the owned item is resolved against the system's Tools library directly (durable
   * `roles[systemId].toolId` first, then source-ref intersection) — NOT through a managed
   * component. It falls back to an exact, case-insensitive match on the tool's snapshot name
   * (the linked component's name for a migrated componentId-tool), so an un-restamped
   * template copy still satisfies presence.
   *
   * @param {Recipe} recipe
   * @param {object} tool - A first-class library Tool
   * @param {Item} item
   * @returns {boolean}
   */
  toolMatchesItem(recipe, tool, item) {
    if (!tool) return false;
    const tools = this._getSystemTools(recipe);
    if (itemResolvesToTool(item, tool, tools, recipe?.craftingSystemId)) return true;
    // Snapshot-name fallback (presence only, never destructive): the item-sourced tool's
    // own snapshot name, or the linked component's name for a migrated componentId-tool.
    // Shared, telemetry-bearing helper (issue 540); case-INSENSITIVE, exactly as before.
    const fallbackName = tool.name || this._getComponent(recipe, tool.componentId)?.name || '';
    if (!fallbackName) return false;
    return matchComponentByName(
      item,
      { name: fallbackName, id: tool.id },
      { caseSensitive: false, systemId: recipe?.craftingSystemId }
    );
  }

  /**
   * Whether an owned item may be selected for a Tool's **usage or breakage** — the narrow
   * durable-identity gate (issue 561, superseding the component-scoped #557 gate). Delegates
   * to {@link itemIsToolByDurableIdentity}, which accepts ONLY the tool's own durable
   * identity (`roles[systemId].toolId`) or the item's own uuid/compendium source — never a
   * transitive `_stats.duplicateSource` reference and never a name fallback.
   *
   * This is the destructive-path counterpart to the wide {@link toolMatchesItem} presence
   * matcher: an item that satisfies presence only by duplicate-source or name is NOT
   * selected to be consumed or destroyed.
   *
   * @param {Recipe} recipe
   * @param {object} tool - A first-class library Tool
   * @param {Item} item
   * @returns {boolean}
   */
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

    // Dispatch ONLY for terminal match types — they fully decide the result off
    // the match object. A `component`/null/unknown match is non-terminal and
    // falls through to the legacy bare-field `ingredient.tag` block and the
    // `ingredient.alternatives` recursion below, which key off bare
    // `ingredient.*` fields, not the match (so a `{type:'component'}` ingredient
    // with `alternatives` still recurses into them). The handler declares its own
    // terminality (tags/currency → true; component/unknown → false).
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

  /**
   * Resolve a component by ID for the given recipe
   * @private
   */
  _getComponent(recipe, componentId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !componentId) return null;
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;
    return (system.components || []).find((item) => item.id === componentId) || null;
  }

  /**
   * Resolve the display name for a managed component.
   * Precedence: component.name (synchronous, no async needed for name-only).
   * Falls back to localized "Unknown Component" if the component is not found.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {string}
   */
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

  /**
   * Resolve the display name for a managed component, resolving registeredItemUuid via fromUuid()
   * when the component has one. Falls back gracefully on broken references.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {Promise<string>}
   */
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

  /**
   * Resolve the icon image for a managed component.
   * Returns component.img if available, falls back to FALLBACK_COMPONENT_IMG.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {string}
   */
  resolveComponentImg(recipe, componentId) {
    if (!componentId) return FALLBACK_COMPONENT_IMG;
    const component = this._getComponent(recipe, componentId);
    if (!component) return FALLBACK_COMPONENT_IMG;
    return component.img || FALLBACK_COMPONENT_IMG;
  }

  /**
   * Resolve a result description using the component name.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @param {number} quantity
   * @returns {string}
   */
  resolveResultDescription(recipe, componentId, quantity = 1) {
    const name = this.resolveComponentName(recipe, componentId);
    return `${quantity}x ${name}`;
  }

  /**
   * Resolve the icon for a recipe (synchronous).
   * If the recipe has a non-default img, return it as-is.
   * Otherwise returns the recipe img (which may be the default bag icon).
   * For async resolution including linked item fallback, use resolveRecipeIconAsync().
   *
   * @param {Recipe} recipe
   * @returns {string}
   */
  resolveRecipeIcon(recipe) {
    const img = recipe?.img || DEFAULT_RECIPE_IMG;
    if (img && img !== DEFAULT_RECIPE_IMG) return img;
    // Synchronous path cannot reliably resolve recipe-item definitions — return the
    // fallback marker if async resolution may still produce a better icon.
    return img === DEFAULT_RECIPE_IMG ? FALLBACK_RECIPE_IMG : img;
  }

  /**
   * Resolve the icon for a recipe with full fallback chain (async).
   * Precedence:
   * 1. recipe.img if it is set AND is not the default bag icon
   * 2. recipeItemId -> recipe item definition -> resolved item.img
   * 3. linkedRecipeItemUuid → resolved item.img (legacy compatibility)
   * 3. FALLBACK_RECIPE_IMG
   *
   * @param {Recipe} recipe
   * @returns {Promise<string>}
   */
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

  /**
   * Accumulate essences from all available items
   * @param {Item[]} items - Items to check
   * @param {Recipe|null} [recipe] - Recipe whose system supplies the candidate
   *   components and system id for essence resolution.
   * @param {Function} [resolveComponent] - Optional component resolver injected on the
   *   alchemy craft path (issue 578) so a tier-4-only item contributes its component's
   *   essences. Defaults to the shared {@link findMatchingComponent} via
   *   {@link accumulateItemEssences} used by standard crafting — byte-for-byte unchanged.
   * @returns {Object} - Accumulated essences { 'light': 3, 'fire': 2 }
   * @private
   */
  _accumulateEssences(items, recipe = null, resolveComponent = findMatchingComponent) {
    return accumulateItemEssences(items, {
      components: this._getSystemComponents(recipe),
      systemId: recipe?.craftingSystemId,
      multiplyByQuantity: true,
      resolveComponent,
    });
  }

  /**
   * A per-item essence resolver bound to a recipe's system components + id (and the
   * optional alchemy-path component resolver), for threading into
   * `IngredientSet.resolveIngredientSelection` so an essence GROUP option draws down
   * items carrying that essence — the component-aware capability increase over the
   * flag-only default (issue 649).
   * @param {Recipe} recipe
   * @param {Function} [resolveComponent]
   * @returns {(item: object) => Record<string, number>}
   * @private
   */
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
    return Array.isArray(system?.components) ? system.components : [];
  }

  /**
   * Resolve the first-class Tools library for a recipe's crafting system (issue 561),
   * mirroring {@link _getSystemComponents}. The single source of truth the tool matchers
   * resolve owned items against.
   * @private
   */
  _getSystemTools(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    return Array.isArray(system?.tools) ? system.tools : [];
  }

  /**
   * Import recipes from JSON.
   *
   * Each recipe that cannot be imported is skipped and recorded as a conflict:
   * `reason: 'invalid'` when activation validation fails (carrying the validation
   * `errors`), or `reason: 'duplicate-id'` when a recipe with the same id already
   * exists and `overwrite` is false. On completion the skipped recipes are surfaced
   * in ONE aggregated conflict-report notification (spec item 3), kept distinct from
   * the terminal counts notification (spec item 4). Duplicate-id skips are no longer
   * silent.
   *
   * @param {Object[]} recipesData - Array of recipe data
   * @param {boolean} overwrite - Whether to overwrite existing recipes
   * @returns {Promise<{ imported: number, skipped: number, total: number,
   *   conflicts: Array<{ recipeId: string, recipeName: string, reason: string,
   *   errors?: string[] }> }>} import counts plus the per-recipe conflict list
   */
  async importRecipes(recipesData, overwrite = false) {
    this._assertGM('import recipes');

    let imported = 0;
    let skipped = 0;
    // Per-recipe conflict reasons, aggregated into ONE report at completion (spec
    // item 3) rather than mid-loop console.warn (invalid) or silent skips (duplicate
    // id). Distinct from the terminal counts notification below (spec item 4).
    const conflicts = [];

    for (const recipeData of recipesData) {
      const recipe = Recipe.fromJSON(recipeData);
      const validation = this._validateRecipeForActivation(recipe);

      if (!validation.valid) {
        conflicts.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          reason: 'invalid',
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
      this._advanceRecipeRevision(recipe.craftingSystemId);
      imported++;
    }

    await this.save();
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

  /**
   * Build the aggregated import-conflict report string: names each skipped recipe
   * and its machine-readable reason. Emitted once at import completion (spec item 3),
   * distinct from the terminal counts notification (spec item 4).
   * @param {Array<{ recipeId: string, recipeName: string, reason: string }>} conflicts
   * @returns {string}
   * @private
   */
  _formatImportConflictReport(conflicts) {
    const reasonLabels = { 'duplicate-id': 'duplicate id', invalid: 'invalid' };
    const details = conflicts
      .map((c) => `"${c.recipeName || c.recipeId}" (${reasonLabels[c.reason] || c.reason})`)
      .join(', ');
    return `${conflicts.length} recipe(s) could not be imported: ${details}`;
  }

  /**
   * Export recipes to JSON
   * @param {string[]} recipeIds - Optional array of recipe IDs to export (exports all if not provided)
   * @returns {Object[]}
   */
  exportRecipes(recipeIds = null) {
    this._assertGM('export recipes');

    const recipes = recipeIds
      ? recipeIds.map((id) => this.recipes.get(id)).filter(Boolean)
      : [...this.recipes.values()];

    return recipes.map((r) => r.toJSON());
  }

  /**
   * Validate recipe core rules and system-specific essence references
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  /**
   * Validation required to *persist* a recipe. Structural/completeness integrity (per
   * {@link Recipe#validate}/{@link Recipe#validateStructure}) plus essence, tag-placeholder, and
   * resolution-mode reference checks. Signature uniqueness is intentionally excluded — a signature
   * conflict never blocks persistence; it only blocks activation (see
   * {@link RecipeManager#_validateRecipeForActivation}).
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateRecipeForPersistence(recipe, { requireComplete = true } = {}) {
    const baseValidation = requireComplete ? recipe.validate() : recipe.validateStructure();
    // Collect structured issues in the same order as the raw error strings (base,
    // essence, tag, resolution mode). The base/essence/tag validators still emit
    // plain English strings, so they ride as UNCODED issues (the localizer passes
    // their message through). Resolution-mode failures now carry a stable `code` +
    // id-free params so the UI can localize them (issue 595).
    const issues = [];
    const pushPlain = (list) => {
      for (const message of list || []) issues.push({ code: null, params: {}, message });
    };
    // A sub-validator that supplies structured `issues` (coded + id-free, issue 595)
    // contributes them directly; a legacy string-only validator rides as UNCODED
    // issues (English passthrough). Every recipe-save validator here — base
    // (Recipe.validate/validateStructure), essence references, tag placeholders, and
    // resolution mode — now supplies coded, id-free issues.
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

  /**
   * Full validity required to *activate* a recipe (set `enabled === true`): completeness plus all
   * persistence checks plus signature uniqueness. A recipe may be persisted while invalid, but may
   * only be enabled when this passes.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[], issues: {code: string|null, params: object, message: string}[]}}
   *   `issues` mirrors `errors` with a stable `code` + params so the UI can
   *   localize the enable failure (issue 550); `errors` stays the raw English list.
   * @private
   */
  _validateRecipeForActivation(recipe) {
    const persistence = this._validateRecipeForPersistence(recipe, { requireComplete: true });
    const errors = [...persistence.errors];
    // Structured, coded issues run in parallel with the raw `errors` strings so a
    // UI caller can localize them (issue 550). Persistence now supplies its own
    // structured issues — coded + id-free for resolution-mode failures (issue 595),
    // uncoded (English passthrough) for the remaining base/essence/tag strings.
    const issues = [...persistence.issues];
    const signatureValidation = this._validateSignatures(recipe);
    errors.push(...signatureValidation.errors);
    issues.push(...(signatureValidation.issues || []));
    // A DISABLED essence blocks activation only (issue 1036) — never persistence. See
    // `_validateEnabledEssenceReferences` for why that placement is load-bearing.
    const disabledEssenceValidation = this._validateEnabledEssenceReferences(recipe);
    errors.push(...disabledEssenceValidation.errors);
    issues.push(...disabledEssenceValidation.issues);

    return {
      valid: errors.length === 0,
      errors,
      issues,
    };
  }

  /**
   * Validate that this recipe's ingredient signatures do not overlap with other recipes
   * in the same crafting system. Warns GMs of ambiguous crafting scenarios.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateSignatures(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return { valid: true, errors: [] };

    const systemManager = this._systemManager();
    if (!systemManager) return { valid: true, errors: [] };

    // Signature uniqueness only matters when the engine *infers* which recipe
    // the player is crafting from the submitted ingredients — i.e. alchemy
    // mode (see CraftingEngine._matchAlchemySignature). In every selected-recipe
    // mode (simple/mapped/tiered/routed/progressive) the player picks the recipe
    // explicitly, so shared base materials — iron+wood → axe OR spear OR shield —
    // are never ambiguous. Enforcing overlap there is stricter than the runtime
    // that depends on it and rejects perfectly valid recipes.
    const system = systemManager.getSystem(systemId);
    if (system?.resolutionMode !== 'alchemy') return { valid: true, errors: [] };

    // The validator is now enabled-scoped (issue 649). This gate runs on an ENABLE
    // transition, but the store copy of `recipe` is still disabled (it is persisted
    // only after this passes). Substitute the candidate recipe (enabled = its target
    // state) so the scan evaluates the collision the enable would create; without the
    // swap the enabled-scoped validator would exclude the still-disabled store copy
    // and miss the conflict. That substitution is the ONLY reason this path cannot
    // hand the manager straight to the validator (issue 1072).
    const csm = this._signatureSource(systemManager, (id) =>
      this.getRecipes({ craftingSystemId: id }).map((existing) =>
        existing.id === recipe.id ? recipe : existing
      )
    );

    const validator = new SignatureValidator(csm);
    const result = validator.validateRecipe(recipe, systemId);
    const errors = result.conflicts.map((c) => c.message);
    const issues = result.conflicts.map((c) => ({
      code: c.code,
      params: c.params,
      message: c.message,
    }));
    return { valid: errors.length === 0, errors, issues };
  }

  /**
   * In an alchemy system, disable every currently-enabled recipe that participates in any ingredient
   * signature conflict. Used to reconcile recipes after an essence/component deletion changes
   * signatures. No-op for non-alchemy systems.
   *
   * `SignatureValidator.validateSystem` is enabled-scoped (issue 649), so the conflicts it
   * reports are only among ENABLED recipes — the exact set the runtime matcher can pick.
   * A recipe whose sole collision partner is already disabled therefore does NOT appear as a
   * conflict and STAYS enabled: the enabled residual is the collision-free set the runtime
   * needs. Disabling all participants of a conflict genuinely clears the gate.
   * @param {string} systemId
   * @returns {Promise<Array<{id: string, name: string}>>} the recipes that were disabled
   */
  async disableSignatureConflicts(systemId) {
    const systemManager = this._systemManager();
    const system = systemManager?.getSystem(systemId);
    if (system?.resolutionMode !== 'alchemy') return [];

    // No candidate substitution here — this runs AFTER the mutation is stored — so the
    // recipe accessor is the plain store read (issue 1072).
    const validator = new SignatureValidator(
      this._signatureSource(systemManager, (id) => this.getRecipes({ craftingSystemId: id }))
    );

    const { conflicts } = validator.validateSystem(systemId);
    const conflictIds = new Set();
    for (const conflict of conflicts) {
      conflictIds.add(conflict.recipeA.id);
      conflictIds.add(conflict.recipeB.id);
    }

    const disabled = [];
    for (const id of conflictIds) {
      const recipe = this.recipes.get(id);
      if (recipe?.enabled === true) {
        recipe.enabled = false;
        disabled.push({ id, name: recipe.name });
      }
    }

    if (disabled.length > 0) {
      // The repository's bulk boundary, on a real multi-record mutation: each disabled
      // recipe announces itself, and the batch coalesces them into exactly one write —
      // the same single write the whole-corpus `save()` issued here before. Naming the
      // records is what lets a granular backend (#1080) write only these N without any
      // caller changing.
      await this.save({ batch: disabled.map(({ id }) => this.recipes.get(id)) });
      this._notifyRecipesChanged('update', {
        disabledForSignatureConflict: disabled.map((d) => d.id),
      });
    }

    return disabled;
  }

  /**
   * Validate ingredient-set essence requirements against crafting system essence definitions.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  /**
   * The crafting system whose essence definitions a recipe's essence references are
   * validated against, or `null` when essences do not apply at all.
   *
   * Shared by {@link RecipeManager#_validateEssenceReferences} (persistence) and
   * {@link RecipeManager#_validateEnabledEssenceReferences} (activation) so the two can
   * never disagree about when the `features.essences` master switch takes them out of
   * play — the activation blocker being subordinate to that switch is the contract, not
   * an accident.
   * @param {object} recipe
   * @returns {object|null}
   * @private
   */
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

  /**
   * Every essence reference a recipe makes, in validation order.
   *
   * Walks recipe-level AND step-level ingredient sets, and within each set BOTH the legacy
   * per-set `essences` map (back-compat read) and first-class essence group OPTIONS (issue
   * 649) — in that order — so a dangling or disabled reference in a group option is seen
   * exactly as one in the legacy map is. One walk serves both essence validators; a second
   * copy is how the two would start covering different reference shapes.
   *
   * @param {object} recipe
   * @returns {{setLabel: string, essenceId: string, quantity: unknown}[]}
   * @private
   */
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

  /**
   * An essence's display NAME from the system's definitions (issue 595) so a message
   * never surfaces the raw essence id. An UNKNOWN essence has no definition and therefore
   * no name, so its message omits it entirely.
   * @param {object[]} definitions
   * @returns {Map<string, string>}
   * @private
   */
  _essenceNameMap(definitions) {
    return new Map(
      definitions
        .filter((def) => typeof def?.name === 'string' && def.name.trim())
        .map((def) => [def.id, def.name.trim()])
    );
  }

  _validateEssenceReferences(recipe) {
    const system = this._resolveEssenceValidationSystem(recipe);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
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
   * ACTIVATION-only blocker: a recipe may not be ENABLED while it requires a DISABLED
   * essence (issue 1036).
   *
   * **This deliberately does NOT run at persistence level, and that placement is
   * load-bearing.** {@link RecipeManager#_validateEssenceReferences} feeds
   * {@link RecipeManager#_validateRecipeForPersistence}, whose issues `updateRecipe`
   * THROWS on as a `RecipePersistenceError`, and `allowIncomplete` relaxes only
   * `requireComplete`, which that function never reads. A persistence-level blocker would
   * therefore abort `CraftingSystemManager.deleteEssence` mid-cascade: that method
   * rewrites every referencing recipe through `updateRecipe(..., { allowIncomplete: true })`
   * BEFORE `await this.save()`, so a recipe still naming a SECOND disabled essence would
   * throw with `essenceDefinitions` and the component essence maps already mutated in
   * memory, some recipes written, and nothing persisted. The bulk `deleteEssences`
   * multiplies that exposure over a whole selection.
   *
   * A recipe may therefore still be SAVED while it requires a disabled essence; it may not
   * be ENABLED. Disabling an essence does not retro-disable an already-enabled recipe —
   * the activation gate fires only on a `false -> true` transition — and re-enabling the
   * essence clears the issue without touching recipe state.
   *
   * @param {object} recipe
   * @returns {{valid: boolean, errors: string[], issues: object[]}}
   * @private
   */
  _validateEnabledEssenceReferences(recipe) {
    const system = this._resolveEssenceValidationSystem(recipe);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
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

  async _cleanupFlagsAfterRecipeMutation() {
    const runManager = game.fabricate?.getCraftingRunManager?.();
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    const systemManager = this._systemManager();
    if (!runManager && !visibilityService) return;

    const validRecipes = new Set(this.getRecipes({}).map((r) => r.id));
    const validSystems = new Set((systemManager?.getSystems?.() || []).map((s) => s.id));
    if (runManager) {
      await runManager.cleanupInvalidRuns(validRecipes, validSystems);
    }
    if (visibilityService) {
      await visibilityService.cleanupLearnedRecipes(validRecipes);
    }
  }
}
