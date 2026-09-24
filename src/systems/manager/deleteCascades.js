/**
 * The delete cascades (issue 1923): a crafting system with its recipes and system-scoped state, a
 * recipe set with its book membership and actor flags, a component set with its recipe
 * references, salvage runs and alchemy signature conflicts, and an essence set with its component
 * rows and recipe ingredient sets. Collaborators arrive in `io`.
 */
import { normalizeSelectionIds } from '../../utils/bulkSelectionModel.js';
import {
  recipeLostItsShape,
  recipeReferencesAnyComponent,
  stripComponentsFromRecipeJson,
} from '../../utils/recipeComponentReferences.js';
import {
  buildLearnedRecipeActorIndex,
  planRecipeItemMembershipPrune,
  selectLearnerActorIds,
} from '../../utils/recipeDeleteImpact.js';
import { recipeReferencesEssence } from '../../utils/recipeEssenceReferences.js';
import { ALL_INVALIDATION_DOMAINS } from '../invalidationDomains.js';
import { runGatedMutationCleanup } from '../mutationCleanupComposition.js';
import { resolvedComponentEssencesById } from '../resolvedComponentEssences.js';

import { baseCollaborators, ESSENCE_FACTS, RECIPE_ITEM_FACTS } from './collaborators.js';

/** This cluster's `io` bag: the base thunks plus the manager members these bodies reach. */
export function deleteCascadesCollaborators(manager) {
  return {
    ...baseCollaborators(manager),
    systemRecord: (systemId) => manager.systems.get(systemId),
    forgetSystem: (systemId) => manager.systems.delete(systemId),
    cleanupSystemScopedState: (systemId, options) =>
      manager._cleanupSystemScopedState(systemId, options),
    deleteComponentSet: (systemId, componentIds) =>
      manager._deleteComponentSet(systemId, componentIds),
    stripComponentsFromRecipes: (systemId, removedIdSet) =>
      manager._stripComponentsFromRecipes(systemId, removedIdSet),
    reconcileAlchemySignaturesAfterDeletion: (system) =>
      manager._reconcileAlchemySignaturesAfterDeletion(system),
    cleanupSalvageRunsForComponent: (componentId, systemId) =>
      manager._cleanupSalvageRunsForComponent(componentId, systemId),
    cleanupCraftingPreferences: (options) => manager._cleanupCraftingPreferences(options),
    normalizeMembershipRecipeIds: (recipeIds) => manager._normalizeMembershipRecipeIds(recipeIds),
    getGatheringEnvironmentStore: () => manager._getGatheringEnvironmentStore(),
    getGatheringRunManager: () => manager._getGatheringRunManager(),
    getSalvageRunManager: () => manager._getSalvageRunManager(),
    getCraftingRunManager: () => manager._getCraftingRunManager(),
    getGatheringRichStateService: () => manager._getGatheringRichStateService(),
    getRecipeVisibilityService: () => manager._getRecipeVisibilityService(),
    stripEssenceFromSets: (sets, essenceId) => manager._stripEssenceFromSets(sets, essenceId),
    resolvedEssencesById: (systemId) => resolvedComponentEssencesById(manager, systemId),
  };
}

/**
 * Delete a crafting system and its recipes (GM only). A failed recipe delete is logged and the
 * rest continue, and the system is still removed and saved, so no half-deleted system persists.
 * Emits one aggregated notification, or a warning with the undeleted count.
 */
export async function deleteSystem(io, systemId) {
  io.assertGM('delete crafting system');
  const system = io.systemRecord(systemId);
  if (!system) {
    throw new Error(`Crafting system not found: ${systemId}`);
  }

  const affected = io.recipeManager().getRecipes({ craftingSystemId: systemId });
  const failedRecipeIds = [];
  // Ids actually removed, which the mutation-time Valid Id Basis gate prunes when the corpus
  // cannot be attested complete (issue 1226); a failed delete's recipe still exists.
  const deletedRecipeIds = [];
  for (const recipe of affected) {
    try {
      await io.recipeManager().deleteRecipe(recipe.id, { notify: false, cleanupFlags: false });
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

  io.forgetSystem(systemId);
  await io.saveSystems({ delete: systemId, domains: ALL_INVALIDATION_DOMAINS });

  await io.cleanupSystemScopedState(systemId, { removedRecipeIds: deletedRecipeIds });

  io.notifySystemsChanged();

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
    globalThis.ui?.notifications?.warn?.(
      `${summary} ${failedRecipeIds.length} ${recipeLabel} could not be auto-deleted and may need manual removal (see the console for ids).`
    );
  } else {
    globalThis.ui?.notifications?.info?.(summary);
  }
}

/** Cascade cleanup across every store keyed by `systemId`, skipping unavailable services.
 * Learned-recipe flags are cleaned once after recipes and the system are gone. Only the
 * learned-recipe and preference sweeps are corpus-derived and gated on a Valid Id Basis (issue
 * 1226); the rest name the deleted system. */
export async function cleanupSystemScopedState(io, systemId, { removedRecipeIds = [] } = {}) {
  const environmentStore = io.getGatheringEnvironmentStore();
  if (environmentStore?.cleanupByCraftingSystem) {
    try {
      await environmentStore.cleanupByCraftingSystem(systemId);
    } catch (error) {
      console.error('Fabricate | environment cleanup failed for system', systemId, error);
    }
  }

  const gatheringRunManager = io.getGatheringRunManager();
  if (gatheringRunManager?.removeRunsForSystem) {
    try {
      await gatheringRunManager.removeRunsForSystem(systemId);
    } catch (error) {
      console.error('Fabricate | gathering-run cleanup failed for system', systemId, error);
    }
  }

  const salvageRunManager = io.getSalvageRunManager();
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

  const craftingRunManager = io.getCraftingRunManager();
  if (craftingRunManager?.removeRunsForSystem) {
    try {
      await craftingRunManager.removeRunsForSystem(systemId);
    } catch (error) {
      console.error('Fabricate | crafting-run cleanup failed for system', systemId, error);
    }
  }

  const richStateService = io.getGatheringRichStateService();
  if (richStateService?.removeSystem) {
    try {
      await richStateService.removeSystem(systemId);
    } catch (error) {
      console.error('Fabricate | gathering-config cleanup failed for system', systemId, error);
    }
  }

  const visibilityService = io.getRecipeVisibilityService();
  if (visibilityService?.cleanupLearnedRecipes) {
    try {
      const removed = [...(removedRecipeIds || [])]
        .map((id) => String(id ?? '').trim())
        .filter(Boolean);
      const validRecipeIds = new Set(
        io
          .recipeManager()
          .getRecipes({})
          .map((r) => r.id)
      );
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
    await io.cleanupCraftingPreferences({ subject: 'a crafting-system deletion' });
  } catch (error) {
    console.error('Fabricate | preference cleanup failed for system', systemId, error);
  }
}

/**
 * The shared body of every cascading recipe delete (issue 1132). It writes `recipes`, then
 * `craftingSystems`, then actor flags: a failed book write leaves dangling ids the next delete
 * repairs, where books first could drop surviving recipes, and a revoked `SETTINGS_MODIFY` mutates
 * no actor. The membership prune never sets, reads or seeds the basis marker (issue 1011) and is
 * restored if its save fails; both change hooks fire, gated per axis. `system` is the live record,
 * not a snapshot: `updateSystem`'s mode change calls this and saves the same record afterwards.
 */
export async function deleteRecipeSet(io, system, recipeIds, options = {}) {
  const requested = normalizeSelectionIds(recipeIds);
  const recipes = requested
    .map((recipeId) => io.recipeManager()?.getRecipe?.(recipeId))
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

  const outcome = await io.recipeManager().deleteRecipes(doomedIds, {
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
    entry.definition.recipeIds = io.normalizeMembershipRecipeIds(entry.recipeIds);
  }
  const recipeItemsRewritten = plan.prunes.length;
  if (recipeItemsRewritten > 0) {
    try {
      await io.saveSystems({ put: system, domains: RECIPE_ITEM_FACTS });
    } catch (error) {
      // Restore the live definitions before rethrowing, so this client never shows a prune the
      // world did not receive.
      for (const [definition, recipeIds] of membershipRestore) definition.recipeIds = recipeIds;
      throw error;
    }
  }

  // One clean-up per set, which is two actor walks: `CraftingRunManager.cleanupInvalidRuns` and
  // `RecipeVisibilityService.cleanupLearnedRecipes`.
  await io.recipeManager().cleanupOrphanedRecipeFlags?.({ removedRecipeIds: outcome.recipeIds });

  if (recipeItemsRewritten > 0 && options.notifySystems !== false) io.notifySystemsChanged();
  if (options.emitChange !== false) {
    // The singular `{recipeId}` payload widened to the id set; the singular key is also emitted
    // for a one-id set, so the payload shape matches `RecipeManager.deleteRecipe`'s.
    const details = { action: 'delete', recipeIds: outcome.recipeIds };
    if (outcome.recipeIds.length === 1) details.recipeId = outcome.recipeIds[0];
    io.recipeManager().notifyRecipesChanged?.(details);
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

export async function deleteItem(io, systemId, itemId) {
  io.assertGM('delete component');
  const outcome = await io.deleteComponentSet(systemId, [itemId]);
  if (outcome.deleted === 0) return false;

  if (outcome.recipesUpdated > 0) {
    globalThis.ui?.notifications?.info?.(
      `Removed "${outcome.removedNames[0] || 'component'}" and updated ${outcome.recipesUpdated} recipe(s).`
    );
  }

  await io.reconcileAlchemySignaturesAfterDeletion(outcome.system);

  return true;
}

/**
 * Delete a set of components in one `craftingSystems` write and one `recipes` write (issue 1129),
 * rather than one of each per component; a recipe referencing two deleted components is rewritten
 * once. Both settings are replaced, so no `-=` key is needed. In-use components are warned about,
 * not refused; `recipesDisabled` counts recipes this call took from enabled to disabled.
 */
export async function deleteComponents(io, systemId, componentIds) {
  io.assertGM('delete components');
  const outcome = await io.deleteComponentSet(systemId, componentIds);
  if (outcome.deleted === 0) {
    return { deleted: 0, componentIds: [], recipesUpdated: 0, recipesDisabled: 0 };
  }

  io.notifySystemsChanged();

  if (outcome.recipesUpdated > 0) {
    globalThis.ui?.notifications?.info?.(
      `Removed ${outcome.deleted} component(s) and updated ${outcome.recipesUpdated} recipe(s).`
    );
  }

  await io.reconcileAlchemySignaturesAfterDeletion(outcome.system);

  return {
    deleted: outcome.deleted,
    componentIds: outcome.componentIds,
    recipesUpdated: outcome.recipesUpdated,
    recipesDisabled: outcome.recipesDisabled,
  };
}

/**
 * The shared body of `deleteItem` and `deleteComponents`: remove the components, repair references
 * and persist once, without a GM gate, notification or alchemy reconcile. The recipe rewrites run
 * before the save, safe only because the activation blocker is `_validateRecipeForActivation`, not
 * `_validateRecipeForPersistence`. A surviving component's salvage result naming a deleted
 * component is left dangling, since the bulk panel's impact statement claims no salvage coverage.
 */
export async function deleteComponentSet(io, systemId, componentIds) {
  const system = io.getSystem(systemId);
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

  const { recipesUpdated, recipesDisabled } = await io.stripComponentsFromRecipes(
    systemId,
    removedIdSet
  );

  // Clean up salvage runs referencing each deleted component.
  for (const componentId of removedIds) {
    await io.cleanupSalvageRunsForComponent(componentId, systemId);
  }

  await io.saveSystems({ put: system, domains: ESSENCE_FACTS });

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
export async function stripComponentsFromRecipes(io, systemId, removedIdSet) {
  const recipes = io
    .recipeManager()
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

    await io.recipeManager().updateRecipe(recipe.id, json, {
      persist: false,
      notify: false,
      emitChange: false,
      allowIncomplete: true,
    });
  }

  if (recipes.length > 0) {
    await io.recipeManager().save();
    // One change signal for the batch, restoring what `emitChange: false` suppressed:
    // `settingChangeBridge` re-emits only when `reload()` returns truthy, which it does not on
    // the writing client. The component-side attribution travels with it (issue 1078).
    io.recipeManager().notifyRecipesChanged({
      action: 'update',
      domains: ESSENCE_FACTS,
      systemIds: [systemId],
    });
  }
  return { recipesUpdated: recipes.length, recipesDisabled };
}

/** After a deletion in an alchemy system, disable every recipe now in a signature conflict and
 * notify the GM of their names; no-op otherwise. */
export async function reconcileAlchemySignaturesAfterDeletion(io, system) {
  if (system?.resolutionMode !== 'alchemy') return;
  const disabled = await io.recipeManager().disableSignatureConflicts(system.id);
  if (disabled.length > 0) {
    const names = disabled.map((d) => d.name).join(', ');
    globalThis.ui?.notifications?.info?.(
      `Disabled ${disabled.length} recipe(s) with conflicting signatures: ${names}`
    );
  }
}

/**
 * Make the essence delete an override before it strips (issue 1371): since the `1.32.0` election
 * a component's `essences` are a world section a system inherits, so stripping the in-system row
 * alone changes nothing resolved. Each affected inheriting pair is flipped first, seeded from the
 * map it resolved before the flip; the world map and other systems are untouched, and
 * `componentEssenceOverride` decides which pairs are shadowed. No seam means no flip; a refused
 * flag write is logged and returned as `unreachable`, never thrown.
 */
async function overrideInheritedEssencesBeforeStrip(
  io,
  system,
  essenceIds,
  overrideInheritedEssences
) {
  if (typeof overrideInheritedEssences !== 'function') {
    return { overridden: [], unreachable: [] };
  }
  const deleted = new Set(essenceIds.map(String));
  const resolved = io.resolvedEssencesById(system.id);
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
 * setting the manager cannot write; see `overrideInheritedEssencesBeforeStrip`.
 */
export async function deleteEssence(io, systemId, essenceId, { overrideInheritedEssences } = {}) {
  io.assertGM('delete essence');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
  const removed = definitions.find((def) => def.id === essenceId);
  if (!removed) return false;

  // Before the definitions move: the seam reads what the pair resolves.
  await overrideInheritedEssencesBeforeStrip(io, system, [essenceId], overrideInheritedEssences);

  system.essenceDefinitions = definitions.filter((def) => def.id !== essenceId);
  system.essences = system.essenceDefinitions.map((def) => def.id);

  // Strip the essence from components still carrying it, so references do not dangle.
  for (const component of system.components || []) {
    if (component.essences && essenceId in component.essences) {
      delete component.essences[essenceId];
    }
  }

  // Strip the essence from recipe ingredient sets, touching only referencing recipes.
  const recipes = io
    .recipeManager()
    .getRecipes({})
    .filter((r) => r.craftingSystemId === systemId && recipeReferencesEssence(r, essenceId));
  let updatedRecipeCount = 0;
  for (const recipe of recipes) {
    const updated = recipe.toJSON();
    updated.ingredientSets = io.stripEssenceFromSets(updated.ingredientSets, essenceId);
    updated.steps = (updated.steps || []).map((step) => ({
      ...step,
      ingredientSets: io.stripEssenceFromSets(step.ingredientSets, essenceId),
    }));

    if (recipeLostItsShape(updated)) updated.enabled = false;

    await io.recipeManager().updateRecipe(recipe.id, updated, {
      notify: false,
      allowIncomplete: true,
    });
    updatedRecipeCount += 1;
  }

  await io.saveSystems({ put: system, domains: ESSENCE_FACTS });
  io.notifySystemsChanged();

  if (updatedRecipeCount > 0) {
    globalThis.ui?.notifications?.info?.(
      `Removed essence "${removed.name ?? 'essence'}" and updated ${updatedRecipeCount} recipe(s).`
    );
  }

  await io.reconcileAlchemySignaturesAfterDeletion(system);

  return true;
}

/**
 * Delete essence definitions in one `craftingSystems` and one `recipes` write (issue 1036):
 * looping `deleteEssence` would write `recipes` per recipe, each a `reload()`, serialization diff
 * and `Hooks.callAll` on every client, twice for a recipe naming two deleted essences. Both
 * settings are replaced, so no `-=` key. Recipe rewrites precede the save, safe only as the
 * disabled-essence blocker gates activation. In-use essences are warned, not refused;
 * `recipesDisabled` counts recipes newly disabled.
 */
export async function deleteEssences(io, systemId, essenceIds, { overrideInheritedEssences } = {}) {
  io.assertGM('delete essences');
  const system = io.getSystem(systemId);
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
  await overrideInheritedEssencesBeforeStrip(io, system, removedIds, overrideInheritedEssences);

  system.essenceDefinitions = definitions.filter((def) => !removedIdSet.has(String(def?.id ?? '')));
  system.essences = system.essenceDefinitions.map((def) => def.id);

  // Strip every deleted essence from components still carrying it.
  for (const component of system.components || []) {
    if (!component.essences) continue;
    for (const essenceId of removedIds) {
      if (essenceId in component.essences) delete component.essences[essenceId];
    }
  }

  const { recipesUpdated, recipesDisabled } = await stripEssencesFromRecipes(
    io,
    systemId,
    removedIds
  );

  await io.saveSystems({ put: system, domains: ESSENCE_FACTS });
  io.notifySystemsChanged();

  if (recipesUpdated > 0) {
    globalThis.ui?.notifications?.info?.(
      `Removed ${removedIds.length} essence(s) and updated ${recipesUpdated} recipe(s).`
    );
  }

  await io.reconcileAlchemySignaturesAfterDeletion(system);

  return { deleted: removedIds.length, essenceIds: removedIds, recipesUpdated, recipesDisabled };
}

/** Strip the deleted essences from referencing recipes in one `recipes` write, each recipe
 * rewritten once; the trailing save is the only persist. `recipeLostItsShape` reads the
 * `recipe.toJSON()` shape, whose results live in `resultGroups` alone (issue 1087). */
async function stripEssencesFromRecipes(io, systemId, removedIds) {
  const recipes = io
    .recipeManager()
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
      updated.ingredientSets = io.stripEssenceFromSets(updated.ingredientSets, essenceId);
      updated.steps = (updated.steps || []).map((step) => ({
        ...step,
        ingredientSets: io.stripEssenceFromSets(step.ingredientSets, essenceId),
      }));
    }
    if (recipeLostItsShape(updated)) {
      if (updated.enabled !== false) recipesDisabled += 1;
      updated.enabled = false;
    }

    await io.recipeManager().updateRecipe(recipe.id, updated, {
      persist: false,
      notify: false,
      emitChange: false,
      allowIncomplete: true,
    });
  }

  if (recipes.length > 0) await io.recipeManager().save();
  return { recipesUpdated: recipes.length, recipesDisabled };
}

/**
 * Strip an essence from ingredient sets: remove the legacy per-set map key and any essence option
 * from each group, drop groups left with no options, then sets left with nothing. `ingredients` is
 * resolved, never spread through (issue 1036): a pre-1135 stale flat mirror would keep a set alive
 * on the deleted essence alone, failing persistence mid-cascade and letting `IngredientSet`
 * resurrect the option. A group-authored set drops the mirror (issue 1135); a legacy flat-shape set
 * keeps it, filtered. `essences: {}` retires on the same reasoning.
 */
export function stripEssenceFromSets(sets, essenceId) {
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
