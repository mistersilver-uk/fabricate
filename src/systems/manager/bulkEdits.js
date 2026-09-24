/**
 * The bulk edits (issue 1923): one staged edit applied to a selection of components, recipes or
 * essence definitions, each in one write per setting. Collaborators arrive in `io`.
 */
import { normalizeSelectionIds } from '../../utils/bulkSelectionModel.js';
import { advanceDefinitionRevision } from '../../utils/definitionIndex.js';
import { normalizeRecipeCategory } from '../../utils/recipeCategories.js';
import { resolveRecipeCheckTierOptions } from '../../utils/routedOutcomeKeywords.js';
import { resolveActiveCraftingCheckFormula } from '../checkModifierResolver.js';
import { RecipeActivationError } from '../RecipeActivationError.js';
import { RecipePersistenceError } from '../RecipePersistenceError.js';

import { baseCollaborators, COMPONENT_FACTS, RECIPE_ITEM_FACTS } from './collaborators.js';

/** This cluster's `io` bag: the base thunks plus the manager members these bodies reach. */
export function bulkEditsCollaborators(manager) {
  return {
    ...baseCollaborators(manager),
    updateSystem: (systemId, updates) => manager.updateSystem(systemId, updates),
    scopeBasis: (system) => manager._scopeBasis(system),
    salvageNormalizationContext: (system) => manager._salvageNormalizationContext(system),
    normalizeComponent: (item, options) => manager._normalizeComponent(item, options),
    seedMembershipFromLegacyScalars: (system) => manager._seedMembershipFromLegacyScalars(system),
    normalizeMembershipRecipeIds: (recipeIds) => manager._normalizeMembershipRecipeIds(recipeIds),
  };
}

/** Lowercase, trim and drop empty tags, preserving order; de-duplication is the caller's job. */
function normalizeBulkTagList(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) =>
      String(tag || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

/**
 * Apply category, tag, essence and progressive-DC edits to components in one `save()` (issues
 * 771, 772), with `Component` semantics: `category` overwrites, `addTags` unions stored lowercase
 * and `removeTags` applies after it, and `essences`/`difficulty` test presence, not truthiness.
 * Changed components re-normalize under the system's essence and salvage context (issue 764).
 * Answers the cohort the edit was applied to, not a diff, as `applyBulkEditToEssences` does.
 */
export async function applyBulkEditToComponents(
  io,
  systemId,
  componentIds,
  edit = {},
  options = {}
) {
  io.assertGM('apply a bulk edit to components');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const targetIds = new Set(Array.from(componentIds || [], String));
  if (targetIds.size === 0) return { updated: 0, componentIds: [] };

  const bulkEdit = edit && typeof edit === 'object' ? edit : {};
  const rawCategory = typeof bulkEdit.category === 'string' ? bulkEdit.category.trim() : '';
  const hasCategory = rawCategory !== '';
  const addTags = normalizeBulkTagList(bulkEdit.addTags);
  const removeTags = new Set(normalizeBulkTagList(bulkEdit.removeTags));
  const hasEssences = Object.hasOwn(bulkEdit, 'essences');
  const hasDifficulty = Object.hasOwn(bulkEdit, 'difficulty');
  const staged =
    hasCategory || addTags.length > 0 || removeTags.size > 0 || hasEssences || hasDifficulty;
  if (!staged) return { updated: 0, componentIds: [] };

  // A `_normalizeSystem` bypass site (issue 1359): same basis, `Set|null`; see `_scopeBasis`.
  const { essenceIds: validEssenceIds } = io.scopeBasis(system);
  const salvageContext = io.salvageNormalizationContext(system);
  const changedIds = [];
  for (let idx = 0; idx < system.components.length; idx += 1) {
    const component = system.components[idx];
    if (!targetIds.has(String(component.id))) continue;

    const currentTags = Array.isArray(component.tags) ? component.tags : [];
    let nextTags = currentTags;
    if (addTags.length > 0) {
      const seen = new Set(currentTags.map((tag) => String(tag).toLowerCase()));
      nextTags = [...currentTags];
      for (const tag of addTags) {
        if (seen.has(tag)) continue;
        seen.add(tag);
        nextTags.push(tag);
      }
    }
    // AFTER the union, so a tag in both lists loses.
    if (removeTags.size > 0) {
      nextTags = nextTags.filter((tag) => !removeTags.has(String(tag).toLowerCase()));
    }

    system.components[idx] = io.normalizeComponent(
      {
        ...component,
        category: hasCategory ? rawCategory : component.category,
        tags: nextTags,
        essences: hasEssences ? bulkEdit.essences : component.essences,
        difficulty: hasDifficulty ? bulkEdit.difficulty : component.difficulty,
        id: component.id,
      },
      { validEssenceIds, ...salvageContext }
    );
    changedIds.push(String(component.id));
  }
  if (changedIds.length > 0) advanceDefinitionRevision(system.components);

  if (changedIds.length > 0 && options.persist !== false)
    await io.saveSystems({ put: system, domains: COMPONENT_FACTS });
  return { updated: changedIds.length, componentIds: changedIds };
}

/**
 * Apply category, status, lock, check-tier and book edits to recipes in one `recipes` and one
 * `craftingSystems` write (issue 1010); `edit` carries `toBulkRecipeEdit`'s staged keys, tested by
 * presence since `false` and `null` are real. Books save first, as the membership-basis marker,
 * which this maintains itself, makes later reads well-defined; each half skips an empty save. The
 * activation gate runs per recipe in batch order inside `updateRecipe`, so
 * `RecipeManager#canActivateRecipe` is only a lower bound.
 */
export async function applyBulkEditToRecipes(io, systemId, recipeIds, edit = {}) {
  io.assertGM('apply a bulk edit to recipes');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const result = {
    updated: 0,
    recipeIds: [],
    blockedEnables: 0,
    blockedRecipeIds: [],
    rejected: 0,
    rejectedRecipeIds: [],
    booksUpdated: 0,
    bookIds: [],
    bookAdditions: 0,
    bookRemovals: 0,
  };

  // Resolves, and rejects, the staged check tier before anything is mutated.
  const axes = resolveBulkRecipeAxes(system, edit);
  if (!axes.staged) return result;

  const targetIds = new Set(normalizeSelectionIds(recipeIds));
  if (targetIds.size === 0) return result;

  const cohort = (io.recipeManager()?.getRecipes?.({ craftingSystemId: systemId }) ?? []).filter(
    (recipe) => targetIds.has(String(recipe?.id ?? ''))
  );

  const books = applyBulkRecipeBookMembership(io, system, cohort, axes);
  result.bookIds = books.bookIds;
  result.booksUpdated = books.bookIds.length;
  result.bookAdditions = books.additions;
  result.bookRemovals = books.removals;
  if (books.changed) {
    system.membershipResolvesByRecipeIds = true;
    await io.saveSystems({ put: system, domains: RECIPE_ITEM_FACTS });
  }

  const outcome = await applyBulkRecipePatches(io, cohort, axes);
  result.recipeIds = outcome.recipeIds;
  result.updated = outcome.recipeIds.length;
  result.blockedRecipeIds = outcome.blockedRecipeIds;
  result.blockedEnables = outcome.blockedRecipeIds.length;
  result.rejectedRecipeIds = outcome.rejectedRecipeIds;
  result.rejected = outcome.rejectedRecipeIds.length;

  if (result.updated > 0) await io.recipeManager().save();

  // At most one of each change hook. On the writing client `reload()` returns `false` and the
  // socket bridge re-emits nothing, so a book change needs its own signal for the GM's windows.
  if (books.changed) io.notifySystemsChanged();
  if (result.updated > 0) {
    io.recipeManager().notifyRecipesChanged?.({
      action: 'bulkEdit',
      recipeIds: result.recipeIds,
    });
  }

  return result;
}

/** Read the six-key `edit` into an axis descriptor by presence. The check tier resolves, or
 * throws, here before any mutation: a bulk write is stricter than the single-recipe editor. */
function resolveBulkRecipeAxes(system, edit) {
  const bulkEdit = edit && typeof edit === 'object' ? edit : {};
  const axes = {
    hasCategory: Object.hasOwn(bulkEdit, 'category'),
    category: bulkEdit.category,
    hasEnabled: Object.hasOwn(bulkEdit, 'enabled'),
    enabled: bulkEdit.enabled === true,
    hasLocked: Object.hasOwn(bulkEdit, 'locked'),
    locked: bulkEdit.locked === true,
    hasCheckTier: Object.hasOwn(bulkEdit, 'checkTierId'),
    checkTierId: null,
    // A staged book set is a selection, so it takes `normalizeSelectionIds`.
    addBookIds: new Set(normalizeSelectionIds(bulkEdit.addBookIds)),
    removeBookIds: new Set(normalizeSelectionIds(bulkEdit.removeBookIds)),
  };
  axes.staged =
    axes.hasCategory ||
    axes.hasEnabled ||
    axes.hasLocked ||
    axes.hasCheckTier ||
    Object.hasOwn(bulkEdit, 'addBookIds') ||
    Object.hasOwn(bulkEdit, 'removeBookIds');
  if (axes.hasCheckTier) axes.checkTierId = resolveBulkCheckTierId(system, bulkEdit.checkTierId);
  return axes;
}

/** A staged check-tier id, or throw. Empty means Default DC; anything else must be an option of
 * `resolveRecipeCheckTierOptions` over the resolver's active slot (issue 1096), the list the
 * editor dropdown and bulk panel read. A `null` slot accepts only Default DC. */
function resolveBulkCheckTierId(system, rawTierId) {
  const tierId = typeof rawTierId === 'string' ? rawTierId.trim() : '';
  if (!tierId) return null;

  const options = resolveRecipeCheckTierOptions(
    system?.craftingCheck,
    resolveActiveCraftingCheckFormula(system).slot
  );
  const known = options.some((tier) => String(tier?.id ?? '') === tierId);
  if (!known) {
    throw new Error(`Check tier not authored by crafting system ${system?.id}: ${tierId}`);
  }
  return tierId;
}

/** Apply the book axis once per definition; a definition named by both lists loses to remove.
 * Edge counts are against the seeded arrays and exclude the seed's own writes; `changed` is true
 * when any definition was mutated, seed included. */
function applyBulkRecipeBookMembership(io, system, cohort, axes) {
  const bookIds = [];
  let additions = 0;
  let removals = 0;
  const touched = axes.addBookIds.size > 0 || axes.removeBookIds.size > 0;
  const selectedIds = cohort.map((recipe) => String(recipe?.id ?? '')).filter(Boolean);
  if (!touched || selectedIds.length === 0) {
    return { changed: false, bookIds, additions, removals };
  }

  // Seed before any array is replaced, while the legacy resolution is live, or the marker set
  // below would orphan every other book's scalar-only members.
  const seeded = io.seedMembershipFromLegacyScalars(system);
  const selected = new Set(selectedIds);

  for (const definition of system.recipeItemDefinitions || []) {
    const definitionId = String(definition?.id ?? '');
    const remove = axes.removeBookIds.has(definitionId);
    const add = !remove && axes.addBookIds.has(definitionId);
    if (!add && !remove) continue;

    const current = io.normalizeMembershipRecipeIds(definition.recipeIds);
    const next = remove
      ? current.filter((id) => !selected.has(id))
      : io.normalizeMembershipRecipeIds([...current, ...selectedIds]);
    if (next.length === current.length && next.every((id, index) => id === current[index])) {
      continue;
    }

    definition.recipeIds = next;
    bookIds.push(definitionId);
    // One operation per definition, so the delta is the edge count.
    if (remove) removals += current.length - next.length;
    else additions += next.length - current.length;
  }
  // Membership rewritten in place on elements (issue 1076).
  if (bookIds.length > 0) advanceDefinitionRevision(system.recipeItemDefinitions);

  return { changed: seeded || bookIds.length > 0, bookIds, additions, removals };
}

/** The per-recipe half, atomic only across microtasks: an await on real I/O here would let
 * `reload()` replace the recipes map between iterations and discard staged edits. */
async function applyBulkRecipePatches(io, cohort, axes) {
  const recipeIds = [];
  const blockedRecipeIds = [];
  const rejectedRecipeIds = [];

  for (const recipe of cohort) {
    const updates = buildBulkRecipePatch(recipe, axes);
    if (Object.keys(updates).length === 0) continue;

    const recipeId = String(recipe.id);
    const outcome = await writeBulkRecipePatch(io, recipeId, updates);
    if (outcome.updated) recipeIds.push(recipeId);
    if (outcome.blocked) blockedRecipeIds.push(recipeId);
    if (outcome.rejected) rejectedRecipeIds.push(recipeId);
  }

  return { recipeIds, blockedRecipeIds, rejectedRecipeIds };
}

/** Only the staged fields that differ, so an agreeing recipe gets no `updateRecipe` call. The
 * category normalizes first, as `Recipe` does, or `'General'` would differ from `'general'`. */
function buildBulkRecipePatch(recipe, axes) {
  const updates = {};
  if (axes.hasCategory) {
    const category = normalizeRecipeCategory(axes.category);
    if (category !== recipe.category) updates.category = category;
  }
  if (axes.hasEnabled && (recipe.enabled === true) !== axes.enabled) {
    updates.enabled = axes.enabled;
  }
  if (axes.hasLocked && (recipe.locked === true) !== axes.locked) {
    updates.locked = axes.locked;
  }
  if (axes.hasCheckTier && (recipe.checkTierId ?? null) !== axes.checkTierId) {
    updates.checkTierId = axes.checkTierId;
  }
  return updates;
}

/** Write one recipe's patch. A refused enable (`RecipeActivationError`) retries without `enabled`,
 * clean because `updateRecipe` throws before storing; an unsaveable recipe
 * (`RecipePersistenceError`) is logged and skipped, since the books save has committed. */
async function writeBulkRecipePatch(io, recipeId, updates) {
  // `persist: false` mutates memory per recipe for one trailing `save()`; `allowIncomplete` keeps
  // an authoring shell editable.
  const options = { persist: false, notify: false, emitChange: false, allowIncomplete: true };
  try {
    await io.recipeManager().updateRecipe(recipeId, updates, options);
    return { updated: true, blocked: false, rejected: false };
  } catch (error) {
    if (error instanceof RecipePersistenceError) {
      console.warn(
        `Fabricate | bulk recipe edit could not save recipe ${recipeId}: ${error.message}`
      );
      return { updated: false, blocked: false, rejected: true };
    }
    if (!(error instanceof RecipeActivationError)) throw error;

    delete updates.enabled;
    if (Object.keys(updates).length === 0) {
      return { updated: false, blocked: true, rejected: false };
    }
    await io.recipeManager().updateRecipe(recipeId, updates, options);
    return { updated: true, blocked: true, rejected: false };
  }
}

/**
 * Apply icon, colour and enabled edits to essence definitions in one `craftingSystems` write
 * (issue 1036) through `updateSystem`, so the alchemy guard throws on a status flip that collapses
 * two recipes onto one signature (Alchemy Uniqueness Revalidation, clauses 3 and 5). Every axis is
 * presence-gated, since `enabled: false` and `colorToken: null` are real; an empty `edit` writes
 * nothing. Answers the cohort the edit was applied to.
 */
export async function applyBulkEditToEssences(io, systemId, essenceIds, edit = {}) {
  io.assertGM('apply a bulk edit to essences');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const targetIds = new Set(normalizeSelectionIds(essenceIds));
  if (targetIds.size === 0) return { updated: 0, essenceIds: [] };

  const bulkEdit = edit && typeof edit === 'object' ? edit : {};
  const hasIcon = Object.hasOwn(bulkEdit, 'icon') && String(bulkEdit.icon || '').trim() !== '';
  const hasColorToken = Object.hasOwn(bulkEdit, 'colorToken');
  const hasEnabled = Object.hasOwn(bulkEdit, 'enabled');
  if (!hasIcon && !hasColorToken && !hasEnabled) return { updated: 0, essenceIds: [] };

  const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
  const changedIds = [];
  const next = definitions.map((definition) => {
    if (!targetIds.has(String(definition?.id ?? ''))) return definition;
    changedIds.push(String(definition.id));
    return {
      ...definition,
      icon: hasIcon ? String(bulkEdit.icon).trim() : definition.icon,
      colorToken: hasColorToken ? bulkEdit.colorToken : definition.colorToken,
      enabled: hasEnabled ? bulkEdit.enabled === true : definition.enabled !== false,
    };
  });
  if (changedIds.length === 0) return { updated: 0, essenceIds: [] };

  await io.updateSystem(systemId, { essenceDefinitions: next });
  return { updated: changedIds.length, essenceIds: changedIds };
}
