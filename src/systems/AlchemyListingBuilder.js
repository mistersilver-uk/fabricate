/**
 * AlchemyListingBuilder — player-facing, leak-safe listing / view-model
 * construction for the unified-window Alchemy tab (the Workbench).
 *
 * A one-directional read-side collaborator that projects the crafting backend
 * (`RecipeManager` + `CraftingSystemManager`) into a redaction-safe model for the
 * Alchemy workbench UI. It NEVER mutates state and NEVER imports Foundry runtime
 * globals — every Foundry-facing read flows through injected collaborators and the
 * actor objects passed to `buildListing`, so GM and player viewers resolve through
 * one code path.
 *
 * REVEAL-not-gate. `visibilityMode` selects which source(s) REVEAL a recipe in the
 * Known list (item = a held book/scroll, knowledge = learned, Manual = a per-recipe
 * access grant, global = brew-discovery), with discovery-by-brew unioned across all
 * modes. Brewing is NEVER gated by reveal — the builder reads only the reveal signal
 * (`access.visible`) through the injected `recipeVisibility` collaborator, never
 * `craftable`. A revealed recipe projects identically to a brew-discovered one.
 *
 * THE LEAK INVARIANT. For a non-GM viewer the builder projects, per (actor x chosen
 * system):
 *  - REVEALED recipes only (id, name, icon, a rich structured signature summary, and
 *    result — all safe because the discipline has revealed them to this player);
 *  - the COUNT of non-revealed valid recipes only (`undiscoveredCount = valid −
 *    revealed`), derived behind this seam — the non-revealed list is NEVER sent to
 *    the client to count locally, and no non-revealed name / signature / result
 *    reaches any client field;
 *  - the owned components in that system with held quantities;
 *  - the actor's fizzled-signature keys for that system (read only through
 *    `getFabricateFlag`, never a raw flag path);
 *  - and cross-system chooser summaries (`N known . M total` per enabled alchemy
 *    system, where `N` is the revealed count).
 *
 * A GM viewer has every enabled recipe revealed (alchemy visibility grants a GM full
 * access), so the non-revealed count is zero for a GM.
 */

import { getFabricateFlag } from '../config/flags.js';
import { resolveAlchemySubmissionComponent } from '../utils/alchemySubmissions.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import { routedSuccessTierOptions } from '../utils/routedOutcomeKeywords.js';

import { readStackQuantity } from './itemStackQuantity.js';
import { buildPassInventorySnapshot } from './passInventorySnapshot.js';
import { SignatureValidator } from './SignatureValidator.js';

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function stringOrNull(value) {
  const out = stringOrEmpty(value);
  return out.length > 0 ? out : null;
}

function actorKey(actor) {
  return actor?.id ?? actor?.uuid ?? null;
}

export class AlchemyListingBuilder {
  /**
   * @param {object} deps
   * @param {object} deps.recipeManager - `getRecipes({ craftingSystemId, enabled })`.
   * @param {object} deps.craftingSystemManager - `getSystems()` / `getSystem(id)`.
   * @param {object} [deps.signatureValidator] - Provides `expandIngredientToComponentIds`.
   *   Defaults to a fresh {@link SignatureValidator} (the expansion path needs no manager).
   * @param {Function} [deps.getViewer] - Fallback viewer accessor.
   * @param {Function} [deps.localize] - `(key, data?) => string`.
   * @param {Function} [deps.resolveComponentForItem] - `(item, components, systemId) =>
   *   component|null`. A SNAPSHOT collaborator, not a builder one: this builder never calls it.
   *   It is supplied so the per-pass snapshot built here is the same complete value the
   *   crafting and visibility passes build (issue 1228), rather than a half of one that would
   *   answer `available: false` for every recipe if a later consumer read its tallies.
   *   Injected rather than imported — see `passInventorySnapshot`'s header.
   */
  constructor({
    recipeManager = null,
    craftingSystemManager = null,
    signatureValidator = null,
    recipeVisibility = null,
    getViewer = null,
    localize = (key) => key,
    resolveComponentForItem = null,
  } = {}) {
    this.recipeManager = recipeManager;
    this.craftingSystemManager = craftingSystemManager;
    this.signatureValidator = signatureValidator ?? new SignatureValidator({});
    // Reveal collaborator (`RecipeVisibilityService`). The builder reads only the
    // `visible` (reveal) signal, NEVER `craftable`, and single-sources the reveal
    // decision here rather than reimplementing it. When absent it degrades to a
    // null collaborator that reveals nothing beyond GM/learned (the Foundry-free
    // test-seam default).
    this.recipeVisibility = recipeVisibility;
    this._getViewer = typeof getViewer === 'function' ? getViewer : null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._resolveComponentForItem =
      typeof resolveComponentForItem === 'function' ? resolveComponentForItem : null;
  }

  /**
   * Build the Alchemy workbench listing for one crafting actor + component-source
   * actors, scoped to `craftingSystemId` (the chosen discipline). Returns
   * `denied: true` with empty data when there is no resolvable owner (a non-owner
   * viewer's actor resolves to null upstream).
   *
   * @param {object} options
   * @param {object|null} [options.craftingActor]
   * @param {object[]} [options.componentSourceActors]
   * @param {object|null} [options.viewer]
   * @param {string|null} [options.craftingSystemId] Active discipline; null = none chosen yet.
   * @returns {object} Leak-safe alchemy listing model.
   */
  buildListing({
    craftingActor = null,
    componentSourceActors = [],
    viewer = null,
    craftingSystemId = null,
  } = {}) {
    const resolvedViewer = viewer ?? this._getViewer?.() ?? null;
    const isGM = resolvedViewer?.isGM === true;

    // The reveal decision (item/Manual modes) reads the crafting actor + the
    // component-source actors, so thread the filtered sources into both the chooser
    // summaries and the active listing loop — otherwise the chooser `N known` count
    // (revealed) would diverge from the panel for item/Manual modes.
    const revealSources = this._filterActors(componentSourceActors);

    // Every enabled alchemy system that owns recipes, resolved ONCE with its cohort. The
    // cohort used to be re-read per system by the enabled filter and again by the summary;
    // the pass snapshot below needs the union of them anyway (issue 1228).
    const enabledSystems = this._enabledAlchemySystems();

    // ONE snapshot for the whole pass, discarded when this returns (issue 1228). Every
    // `_isRevealed` below routes through it, so an `item`-visibility-mode discipline resolves
    // its held books ONCE instead of re-enumerating every source actor's whole inventory per
    // recipe — the #1077 defect this builder still carried. It is built from EVERY enabled
    // alchemy system's cohort, not just the active one, because the chooser summaries evaluate
    // reveal for all of them and the candidate superset must cover every legacy book link any
    // of those recipes' matchers could see.
    //
    // Nothing here forces an INVENTORY read: the snapshot's walk is lazy, so a `global`- or
    // `knowledge`-mode discipline, which never consults held items, adds no inventory cost.
    // It is not literally free — the legacy book links are collected eagerly over every
    // enabled system's cohort whatever the mode — but that is one pass over the recipes
    // already in hand, and it is `O(recipes)` once rather than per recipe.
    const snapshot = this._passSnapshot(
      craftingActor,
      revealSources,
      enabledSystems.flatMap((entry) => entry.recipes)
    );

    // The chooser summaries span every enabled alchemy system with recipes; they
    // are always safe (counts + system identity only).
    const chooserSystems = enabledSystems.map((entry) =>
      this._systemSummary({
        system: entry.system,
        recipes: entry.recipes,
        craftingActor,
        isGM,
        viewer: resolvedViewer,
        componentSourceActors: revealSources,
        snapshot,
      })
    );

    // No resolvable owner (non-owner viewer upstream) -> denied, empty payload.
    if (!craftingActor) {
      return this._emptyListing({ craftingSystemId, systems: chooserSystems, denied: true });
    }

    const activeEntry = craftingSystemId
      ? enabledSystems.find((entry) => entry.system.id === craftingSystemId) || null
      : null;
    const activeSystem = activeEntry?.system ?? null;
    if (!activeSystem) {
      // A resolvable owner with no discipline chosen yet (the >1-system chooser
      // case): report the resolved actor so the view distinguishes "choose a
      // discipline" (needsChooser) from the genuine no-actor state. Without this
      // the chooser is unreachable — `AlchemyView` checks no-actor before
      // needsChooser, and a null selectedActorId reads as no-actor.
      return this._emptyListing({
        craftingSystemId,
        systems: chooserSystems,
        denied: false,
        craftingActor,
      });
    }

    const sources = this._dedupeActors([
      craftingActor,
      ...this._filterActors(componentSourceActors),
    ]);
    const components = Array.isArray(activeSystem.components) ? activeSystem.components : [];
    const recipes = activeEntry.recipes;
    const learnedMap = this._getLearnedMap(craftingActor);

    const known = [];
    let undiscoveredCount = 0;
    for (const recipe of recipes) {
      if (!this._isValidAlchemyRecipe(recipe)) continue;
      if (
        this._isRevealed(recipe, {
          viewer: resolvedViewer,
          isGM,
          craftingActor,
          componentSourceActors: revealSources,
          learnedMap,
          snapshot,
        })
      ) {
        // A revealed recipe projects identically to a brew-discovered one: full
        // name + signature summary + result, selectable and auto-fillable.
        known.push(this._projectLearnedRecipe(recipe, activeSystem, components));
      } else {
        // Leak-safe: a non-revealed recipe is a count only — no name / signature /
        // result reaches any client field.
        undiscoveredCount += 1;
      }
    }

    return {
      denied: false,
      selectedActorId: actorKey(craftingActor),
      activeSystemId: activeSystem.id,
      activeSystemName: stringOrEmpty(activeSystem.name),
      systems: chooserSystems,
      recipes: known,
      undiscoveredCount,
      components: this._projectOwnedComponents(components, sources, activeSystem),
      fizzleKeys: this._getFizzleKeys(craftingActor, activeSystem.id),
    };
  }

  _emptyListing({ craftingSystemId, systems, denied, craftingActor = null }) {
    return {
      denied,
      selectedActorId: craftingActor ? actorKey(craftingActor) : null,
      activeSystemId: craftingSystemId ?? null,
      activeSystemName: '',
      systems,
      recipes: [],
      undiscoveredCount: 0,
      components: [],
      fizzleKeys: [],
    };
  }

  /**
   * Enabled crafting systems in alchemy mode that own at least one recipe, each paired with
   * the cohort that proved it.
   *
   * The cohort is RETURNED rather than rediscovered because the enabled filter, the chooser
   * summary and the active listing loop all needed it and each used to ask the recipe manager
   * for its own copy (issue 1228).
   *
   * @returns {Array<{system: object, recipes: object[]}>}
   */
  _enabledAlchemySystems() {
    const all = this.craftingSystemManager?.getSystems?.() ?? [];
    const enabled = [];
    for (const system of Array.isArray(all) ? all : []) {
      if (system?.resolutionMode !== 'alchemy' || system?.enabled === false) continue;
      const recipes = this._systemRecipes(system?.id);
      if (recipes.length === 0) continue;
      enabled.push({ system, recipes });
    }
    return enabled;
  }

  /**
   * The per-pass inventory snapshot every reveal decision in one workbench open shares.
   *
   * A per-pass VALUE, never a field: `inventorySnapshot`'s invalidation rule is that no
   * snapshot outlives the synchronous pass that built it, because nothing mints a revision
   * token when a player's `actor.items` changes and a stale read would feed the reveal gate —
   * a dropped book must un-reveal on the very next build.
   *
   * @param {object|null} craftingActor
   * @param {object[]} componentSourceActors
   * @param {object[]} recipes Every recipe this pass will evaluate reveal for.
   * @returns {object}
   * @private
   */
  _passSnapshot(craftingActor, componentSourceActors, recipes) {
    return buildPassInventorySnapshot({
      craftingActor,
      componentSourceActors,
      recipes,
      resolveComponent: this._resolveComponentForItem,
    });
  }

  _systemRecipes(systemId) {
    if (!systemId) return [];
    const recipes = this.recipeManager?.getRecipes?.({ craftingSystemId: systemId, enabled: true });
    return Array.isArray(recipes) ? recipes : [];
  }

  /**
   * A chooser card summary for one alchemy system: `{ id, name, img, description,
   * knownCount, totalCount }`. `totalCount` counts enabled, structurally-valid
   * alchemy recipes (the system-validity gate); `knownCount` those REVEALED to the
   * viewer (the routed reveal decision — all of them for a GM), so it matches the
   * panel for item/Manual modes. No undiscovered recipe identity leaks.
   *
   * `recipes` is the cohort {@link _enabledAlchemySystems} already resolved and `snapshot` the
   * per-pass inventory snapshot (issue 1228) — this used to re-read the cohort and evaluate
   * every reveal with no snapshot at all, which is one full inventory walk per recipe per
   * chooser card on an `item`-visibility-mode discipline.
   */
  _systemSummary({
    system,
    recipes,
    craftingActor,
    isGM,
    viewer,
    componentSourceActors = [],
    snapshot = null,
  }) {
    const learnedMap = this._getLearnedMap(craftingActor);
    const valid = recipes.filter((recipe) => this._isValidAlchemyRecipe(recipe));
    const knownCount = valid.filter((recipe) =>
      this._isRevealed(recipe, {
        viewer,
        isGM,
        craftingActor,
        componentSourceActors,
        learnedMap,
        snapshot,
      })
    ).length;
    return {
      id: system.id,
      name: stringOrEmpty(system.name),
      img: stringOrNull(system.img),
      description: stringOrEmpty(system.description),
      knownCount,
      totalCount: valid.length,
    };
  }

  /**
   * A recipe is a valid alchemy candidate (for counting + projection) when it has
   * at least one ingredient set carrying either ingredient groups or an essence
   * requirement. This is the builder's system-validity gate: an empty recipe is
   * never counted as undiscoverable content.
   */
  _isValidAlchemyRecipe(recipe) {
    const sets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];
    return sets.some(
      (set) =>
        (Array.isArray(set?.ingredientGroups) && set.ingredientGroups.length > 0) ||
        (set?.essences && Object.keys(set.essences).length > 0)
    );
  }

  /**
   * Whether a recipe is REVEALED to the viewer, routed through the injected
   * `recipeVisibility` collaborator's reveal signal (`access.visible`), NEVER
   * `craftable` (brewing is never gated by reveal). When no collaborator is wired
   * (the Foundry-free test-seam default) it degrades to GM-sees-all / learned-only.
   */
  _isRevealed(
    recipe,
    { viewer, isGM, craftingActor, componentSourceActors = [], learnedMap, snapshot = null } = {}
  ) {
    if (typeof this.recipeVisibility?.evaluateRecipeAccess === 'function') {
      const access = this.recipeVisibility.evaluateRecipeAccess({
        recipe,
        viewer,
        craftingActor,
        componentSourceActors,
        // The per-pass snapshot (issue 1228). A pure read optimisation — omit it and the
        // evaluation is byte-for-byte what it was, at one whole inventory walk per recipe.
        snapshot,
      });
      return access?.visible === true;
    }
    // Null-collaborator default.
    if (isGM) return true;
    const map = learnedMap ?? this._getLearnedMap(craftingActor);
    return Boolean(map?.[recipe?.id]);
  }

  _getLearnedMap(actor) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', {});
    return learned && typeof learned === 'object' ? learned : {};
  }

  /**
   * The actor's fizzled-signature keys for this system, read ONLY via
   * `getFabricateFlag` (the effective stored path is doubly-nested under
   * `flags.fabricate.fabricate.alchemyDeadEnds`). Returns [] when unset.
   */
  _getFizzleKeys(actor, systemId) {
    const deadEnds = getFabricateFlag(actor, 'alchemyDeadEnds', {});
    const forSystem = deadEnds && typeof deadEnds === 'object' ? deadEnds[systemId] : null;
    return Array.isArray(forSystem) ? forSystem.filter((key) => typeof key === 'string') : [];
  }

  _filterActors(actors) {
    return Array.isArray(actors) ? actors.filter(Boolean) : [];
  }

  _dedupeActors(actors) {
    const seen = new Set();
    const out = [];
    for (const actor of actors) {
      if (!actor) continue;
      const key = actorKey(actor);
      if (key != null && seen.has(key)) continue;
      if (key != null) seen.add(key);
      out.push(actor);
    }
    return out;
  }

  /**
   * Owned components in the active system with held quantity > 0, aggregated
   * across the source actors. Projects `{ componentId, name, img, held, essences }`
   * (the resolved per-unit essence icons + counts, `[]` when the system has no
   * essences or the component carries none).
   */
  _projectOwnedComponents(components, sources, system = null) {
    if (!Array.isArray(components) || components.length === 0) return [];
    const held = new Map();
    for (const actor of sources) {
      const items = actor?.items ? [...actor.items] : [];
      for (const item of items) {
        // Bucket-once (issue 572): the SAME composed, system-scoped resolver the
        // submission collector uses, threading `system?.id` so a durable
        // `roles[systemId].componentId` item the player drags is attributed here to
        // the same component the collector and engine credit — never a divergent
        // duplicate-lineage component.
        const component = resolveAlchemySubmissionComponent(item, components, system?.id);
        if (!component?.id) continue;
        held.set(component.id, (held.get(component.id) || 0) + readStackQuantity(item));
      }
    }
    const rows = [];
    for (const component of components) {
      const owned = held.get(component.id) || 0;
      if (owned <= 0) continue;
      rows.push({
        componentId: stringOrNull(component.id),
        name: stringOrEmpty(component.name),
        img: stringOrNull(component.img),
        held: owned,
        essences: this._projectComponentEssences(component, system),
      });
    }
    return rows.sort((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Project one LEARNED recipe into a leak-safe display model: id/name/icon, a
   * rich structured `signatureSummary` (one entry per ingredient set, each with
   * its groups/options + per-option quantity + set-level essences + routed
   * result), a headline `result`, and a `concrete` reduction (a plain-component
   * `{ componentId: qty }` multiset) present ONLY when the recipe reduces to a
   * concrete multiset (single ingredient set, single-option groups, no essence
   * requirement). `concrete` is null otherwise — the store then fails safe to
   * `untried` and offers no auto-fill.
   */
  _projectLearnedRecipe(recipe, system, components) {
    const sets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
    const signatureSummary = sets.map((set) => this._projectSet(set, recipe, system, components));
    const headline = signatureSummary[0]?.result ?? null;
    const concrete = this._concreteMultiset(sets, components);
    const essenceRequirement = this._essenceRequirement(sets, system);
    // Carry the system-level alchemy check mode so the workbench can flag a
    // check-gated outcome ("a check gates this result") for simple/tiered brews.
    const checkMode = system?.alchemy?.checkMode || 'none';
    return {
      id: stringOrNull(recipe.id),
      name: stringOrEmpty(recipe.name),
      img: stringOrNull(recipe.img),
      description: stringOrEmpty(recipe.description),
      signatureSummary,
      result: headline,
      concrete,
      essenceRequirement,
      checkMode,
      checkGated: checkMode === 'simple' || checkMode === 'tiered',
    };
  }

  /**
   * The essence requirement of an ESSENCE-ONLY recipe, as the same resolved
   * `[{ id, name, icon, quantity }]` shape the signature summary uses (so the
   * store can both MATCH against it and label the still-needed rows from one
   * projection). Null unless: essences are enabled for the system, the recipe has
   * exactly one ingredient set, that set carries a non-empty essence map, and it
   * has NO ingredient groups.
   *
   * A set that MIXES ingredient groups with essences is deliberately left null:
   * the store cannot verify the group half client-side, so it must fail safe to
   * `untried` rather than emit a false `ready`.
   *
   * Callers must mirror the engine's `>=` semantics — `_matchAlchemySignature`
   * satisfies an essence when the submitted total is at LEAST the required
   * quantity, so surplus essences still match.
   */
  _essenceRequirement(sets, system) {
    if (!this._essencesEnabled(system)) return null;
    if (!Array.isArray(sets) || sets.length !== 1) return null;
    const set = sets[0];
    const groups = Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : [];

    // Legacy shape (back-compat read): no ingredient groups + a per-set essences map.
    if (groups.length === 0) {
      const resolved = this._resolveEssenceList(set?.essences, system);
      return resolved.length > 0 ? resolved : null;
    }

    // First-class shape (issue 649): an essence-only set is one whose EVERY group is a
    // SINGLE-OPTION essence group (exactly what the 1.17.0 migration produces). A mixed
    // set, or a group with an OR of essences, cannot be verified client-side, so it
    // fails safe to null (the store then offers no auto-fill).
    const essenceMap = {};
    for (const group of groups) {
      const options = Array.isArray(group?.options) ? group.options : [];
      if (options.length !== 1 || options[0]?.match?.type !== 'essence') return null;
      const match = options[0].match;
      const id = String(match.essenceId || '').trim();
      const amount = Number(match.amount) || 0;
      if (id && amount > 0) essenceMap[id] = Math.max(essenceMap[id] || 0, amount);
    }
    // Fold any legacy per-set map entries (transitional).
    for (const [id, qty] of Object.entries(set?.essences || {})) {
      const amount = Number(qty) || 0;
      if (amount > 0) essenceMap[id] = Math.max(essenceMap[id] || 0, amount);
    }
    const resolved = this._resolveEssenceList(essenceMap, system);
    return resolved.length > 0 ? resolved : null;
  }

  _projectSet(set, recipe, system, components) {
    const groups = (Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []).map((group) =>
      this._projectGroup(group, components, system)
    );
    const essences = this._projectEssences(set, system);
    return {
      setId: stringOrNull(set?.id),
      groups,
      essences,
      result: this._projectResult(recipe, set, system, components),
    };
  }

  _projectGroup(group, components, system = null) {
    const options = (Array.isArray(group?.options) ? group.options : []).map((option) => {
      const componentId = this._optionComponentId(option);
      const component = componentId ? findById(getDefinitionIndex(components), componentId) : null;
      // An essence-type ingredient option (componentId is null) resolves to the
      // essence's NAME + ICON from the system's essence definitions, and its
      // display quantity is the required essence AMOUNT (`match.amount`), NOT the
      // per-option quantity — the raw essence id is never player-facing. The
      // component path is unchanged (name from the component, quantity from the
      // option).
      if (!component && option?.match?.type === 'essence') {
        return this._projectEssenceOption(option, system);
      }
      return {
        componentId: stringOrNull(componentId),
        name: component ? stringOrEmpty(component.name) : this._optionLabel(option),
        img: component ? stringOrNull(component.img) : null,
        quantity: Math.max(1, Number(option?.quantity) || 1),
      };
    });
    return { options };
  }

  /**
   * Project an essence-type ingredient option into the same display shape a
   * component option uses, resolving the essence's NAME + ICON against the
   * system's `essenceDefinitions` (falling back to the raw id only when no
   * definition exists) and surfacing the required essence AMOUNT as `quantity`.
   */
  _projectEssenceOption(option, system) {
    const match = option?.match ?? {};
    const essenceId = String(match.essenceId || '').trim();
    const defs = Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
    const def = defs.find((candidate) => candidate.id === essenceId) ?? null;
    return {
      componentId: null,
      essenceId: stringOrNull(essenceId),
      name: stringOrEmpty(def?.name) || stringOrEmpty(essenceId),
      img: null,
      icon: stringOrNull(def?.icon),
      colorToken: stringOrNull(def?.colorToken),
      quantity: Math.max(1, Number(match.amount) || 1),
    };
  }

  _optionComponentId(option) {
    return option?.match?.componentId ?? option?.componentId ?? null;
  }

  _optionLabel(option) {
    const tags = option?.match?.tags;
    if (Array.isArray(tags) && tags.length > 0) return tags.join(', ');
    if (option?.match?.type === 'essence') {
      const id = String(option.match.essenceId || '').trim();
      if (id) return id;
    }
    return this.localize('FABRICATE.Labels.UnknownComponent');
  }

  _projectEssences(set, system) {
    return this._resolveEssenceList(set?.essences, system);
  }

  /**
   * Whether the system has essences enabled (canonical `features.essences`, with the
   * legacy `enableEssences` fallback).
   */
  _essencesEnabled(system) {
    return system?.features?.essences === true || system?.enableEssences === true;
  }

  /**
   * A component's per-unit essences resolved against the system's essence
   * definitions, as `[{ id, name, icon, quantity }]`. Empty when essences are
   * disabled for the system or the component carries none — so the workbench shows
   * essence icons + counts only where they are meaningful.
   */
  _projectComponentEssences(component, system) {
    if (!this._essencesEnabled(system)) return [];
    return this._resolveEssenceList(component?.essences, system);
  }

  /**
   * Shared essence-map → display-list resolver. Maps `{ essenceId: quantity }`
   * against the system's `essenceDefinitions`, dropping zero/invalid quantities and
   * falling back to the raw id when a definition is missing.
   *
   * `colorToken` carries the GM-authored per-essence colour (issue 917) alongside the
   * icon; null (unauthored) renders in the theme accent, which is how every essence
   * chip renders today.
   */
  _resolveEssenceList(rawMap, system) {
    const raw = rawMap && typeof rawMap === 'object' ? rawMap : {};
    const defs = Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
    const defById = new Map(defs.map((def) => [def.id, def]));
    const out = [];
    for (const [essenceId, quantity] of Object.entries(raw)) {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const def = defById.get(essenceId);
      out.push({
        id: stringOrNull(essenceId),
        name: stringOrEmpty(def?.name) || stringOrEmpty(essenceId),
        icon: stringOrNull(def?.icon),
        colorToken: stringOrNull(def?.colorToken),
        quantity: qty,
      });
    }
    return out;
  }

  /**
   * The SUCCESS result a set routes to, projected as a leak-safe headline (the
   * reserved `role: 'failure'` group is NEVER surfaced to Produces). Dispatched on
   * the system-level `alchemy.checkMode`:
   *  - none / simple → the first non-failure (success) group;
   *  - tiered → the TOP SUCCESS TIER's assigned group (routed outcome-tier order),
   *    falling back to the first non-failure group when no tier is routed yet.
   * The projected result is the first result in that group, resolved to its component.
   */
  _projectResult(recipe, set, system, components) {
    const groups = Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [];
    const successGroups = groups.filter((group) => group?.role !== 'failure');
    if (successGroups.length === 0) return null;
    const checkMode = system?.alchemy?.checkMode || 'none';
    let group = successGroups[0];
    if (checkMode === 'tiered') {
      const tiers = routedSuccessTierOptions(system?.craftingCheck?.routed);
      for (const tier of tiers) {
        const match = successGroups.find(
          (candidate) =>
            Array.isArray(candidate.checkOutcomeIds) && candidate.checkOutcomeIds.includes(tier.id)
        );
        if (match) {
          group = match;
          break;
        }
      }
    }
    const results = Array.isArray(group?.results) ? group.results : [];
    const first = results[0];
    if (!first) return null;
    const component = first.componentId
      ? findById(getDefinitionIndex(components), first.componentId)
      : null;
    return {
      componentId: stringOrNull(first.componentId),
      name: component ? stringOrEmpty(component.name) : stringOrEmpty(group?.name),
      img: component ? stringOrNull(component.img) : null,
      quantity: Math.max(1, Number(first.quantity) || 1),
      essences: component ? this._projectComponentEssences(component, system) : [],
    };
  }

  /**
   * Reduce a recipe's ingredient sets to a concrete plain-component multiset when
   * (and only when) it is a single ingredient set, every group has exactly one
   * option, that option is a plain component match with a resolvable id, and there
   * is no set-level essence requirement. Returns `{ componentId: qty }` or null.
   */
  _concreteMultiset(sets, components) {
    if (!Array.isArray(sets) || sets.length !== 1) return null;
    const set = sets[0];
    if (set?.essences && Object.keys(set.essences).length > 0) return null;
    const groups = Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : [];
    if (groups.length === 0) return null;
    const multiset = {};
    for (const group of groups) {
      const options = Array.isArray(group?.options) ? group.options : [];
      if (options.length !== 1) return null;
      const option = options[0];
      if (option?.match && option.match.type !== 'component') return null;
      const componentId = this._optionComponentId(option);
      // An EXISTENCE test, not a projection — but still a full library walk per group per
      // revealed recipe (`recipes x groups x components`), and it stayed on that footing
      // longer than its neighbours only because it is spelled `.every(c => !(c.id === id))`
      // rather than `.find(...)` and so was invisible to the site sweep (issue 1202).
      if (!componentId || !findById(getDefinitionIndex(components), componentId)) return null;
      const quantity = Math.max(1, Number(option?.quantity) || 1);
      multiset[componentId] = (multiset[componentId] || 0) + quantity;
    }
    return Object.keys(multiset).length > 0 ? multiset : null;
  }
}
