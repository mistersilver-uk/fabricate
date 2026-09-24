/**
 * The delete cascades (issue 1923): a crafting system with its recipes and system-scoped state, a
 * recipe set with its book membership and actor flags, and a component set with its recipe
 * references, salvage runs and alchemy signature conflicts. Collaborators arrive in `io`.
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
import { ALL_INVALIDATION_DOMAINS } from '../invalidationDomains.js';
import { runGatedMutationCleanup } from '../mutationCleanupComposition.js';

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
 * no actor. The membership prune never seeds the basis marker (issue 1011) and is restored if its
 * save fails; both change hooks fire, gated per axis. `system` is the live record, not a snapshot.
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
 * before the save, safe only because the activation blocker is not a persistence check. A surviving
 * component's salvage result naming a deleted component is deliberately left dangling.
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
