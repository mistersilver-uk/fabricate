/**
 * The GM-gated write half of the Knowledge surface (issue 785): resolve the nominated actor, copy
 * and definition, then delegate to the `knowledgeMutations` primitives beside this file. It lives
 * under `src/ui/` rather than `src/systems/` because the gate reads `game.user.isGM` and the
 * lookups read `game.actors`, and the domain roots are armed against a bare Foundry global.
 */
import { matchRecipeItemDefinition } from '../../../../../utils/sourceUuid.js';

import {
  KNOWLEDGE_MESSAGES,
  deleteOwnedRecipeItemCopy,
  eraseLearnedRecipeEntry,
  expendOwnedRecipeItemUse,
  resetActorKnowledgeState,
} from './knowledgeMutations.js';

/**
 * `isGM` rather than `activeGM`: this is a single-client, user-initiated mutation from a GM-only
 * Application, so there is no N-client duplicate-execution risk, and `activeGM` would lock out the
 * assistant GMs `SvelteCraftingSystemManagerApp.show()` already admits. Foundry authorises the
 * writes for an assistant too (`testUserPermission` short-circuits any `isGM` to OWNER).
 */
function knowledgeActor(actorId) {
  if (game.user?.isGM !== true)
    return { denied: { success: false, message: KNOWLEDGE_MESSAGES.gmOnly } };
  const actor = game.actors?.get?.(actorId);
  if (!actor) return { denied: { success: false, message: KNOWLEDGE_MESSAGES.noActor } };
  return { actor };
}

// Prefer the definition the projected row already resolved, so the GM's click acts on exactly the
// book the row displayed; fall back to a live match when the row is stale.
function resolveKnowledgeDefinition({ item, definitionId, systemId }) {
  const definitions = Array.isArray(
    game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId)?.recipeItemDefinitions
  )
    ? game.fabricate.getCraftingSystemManager().getSystem(systemId).recipeItemDefinitions
    : [];
  const named = definitionId
    ? definitions.find((definition) => String(definition?.id) === String(definitionId))
    : null;
  return named || matchRecipeItemDefinition(item, definitions, systemId).definition;
}

// Every seam mutation takes document ids, never uuids, and a target that vanished between render
// and click yields a result shape rather than a throw past a store that expects one.
function knowledgeTarget(actorId, itemId) {
  const { actor, denied } = knowledgeActor(actorId);
  if (denied) return { denied };
  const item = actor.items?.get?.(itemId);
  if (!item) return { denied: { success: false, message: KNOWLEDGE_MESSAGES.noItem } };
  return { actor, item };
}

/**
 * Spend one charge of an owned recipe-item copy. Applies no visibility or knowledge-mode gate: the
 * GM named the copy.
 */
export async function expendRecipeItemUse({
  actorId,
  itemId,
  definitionId,
  systemId,
  service,
} = {}) {
  const { actor, item, denied } = knowledgeTarget(actorId, itemId);
  if (denied) return denied;
  return await expendOwnedRecipeItemUse({
    actor,
    item,
    service,
    definition: resolveKnowledgeDefinition({ item, definitionId, systemId }),
  });
}

/** Delete one owned copy — whole document, never a stack decrement. */
export async function deleteOwnedRecipeItem({ actorId, itemId } = {}) {
  const { item, denied } = knowledgeTarget(actorId, itemId);
  if (denied) return denied;
  return await deleteOwnedRecipeItemCopy({ item });
}

/** Erase one learned recipe through the merged issue 773 primitive. */
export async function eraseLearnedRecipe({ actorId, recipeId, service } = {}) {
  const { actor, denied } = knowledgeActor(actorId);
  if (denied) return denied;
  return await eraseLearnedRecipeEntry({ actor, service, recipeId });
}

/** Both reset grains, routed through the merged GM API. The gate is identical. */
export async function resetActorKnowledge({ actorId, systemId = null } = {}) {
  const { denied } = knowledgeActor(actorId);
  if (denied) return denied;
  return await resetActorKnowledgeState({
    reset: game?.fabricate?.resetActorKnowledge,
    thisArg: game?.fabricate,
    actorId,
    systemId,
  });
}
