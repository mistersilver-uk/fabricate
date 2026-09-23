/** Cascade planning for vocabulary deletion (issue 689). */

import { GENERAL_COMPONENT_CATEGORY } from '../../utils/componentCategories.js';
import { GENERAL_RECIPE_CATEGORY } from '../../utils/recipeCategories.js';

function vocabularyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function reassignmentsFor(records, categoryName, generalBucket) {
  const target = vocabularyKey(categoryName);
  if (!target || target === generalBucket) return [];

  const reassignments = [];
  for (const record of records || []) {
    if (!record?.id) continue;
    if (vocabularyKey(record.category) === target) {
      reassignments.push({ id: record.id, category: generalBucket });
    }
  }
  return reassignments;
}

/** Recipes whose `category` matches the deleted recipe category, each patched back to `general`. */
export function planRecipeCategoryReassignments(recipes, categoryName) {
  return reassignmentsFor(recipes, categoryName, GENERAL_RECIPE_CATEGORY);
}

/**
 * Components whose `category` matches the deleted component category, each patched back to
 * `general`.
 */
export function planComponentCategoryReassignments(components, categoryName) {
  return reassignmentsFor(components, categoryName, GENERAL_COMPONENT_CATEGORY);
}

/** Components carrying the deleted tag, each patched with the tag removed from its `tags` array. */
export function planTagRemovals(components, tagName) {
  const target = vocabularyKey(tagName);
  if (!target) return [];

  const removals = [];
  for (const component of components || []) {
    if (!component?.id) continue;
    const tags = Array.isArray(component.tags) ? component.tags : [];
    if (tags.every((tag) => vocabularyKey(tag) !== target)) continue;
    removals.push({
      id: component.id,
      tags: tags.filter((tag) => vocabularyKey(tag) !== target),
    });
  }
  return removals;
}

// Rewrite a single ingredient `match`, returning a new match with the deleted tag removed, or null
// when it is not a tag placeholder naming the target.
function rewriteMatch(match, target) {
  if (match?.type !== 'tags') return null;
  const tags = Array.isArray(match.tags) ? match.tags : [];
  if (tags.every((tag) => vocabularyKey(tag) !== target)) return null;
  return { ...match, tags: tags.filter((tag) => vocabularyKey(tag) !== target) };
}

// Rebuild a `{ match }`-bearing list (a group's options or a legacy ingredient set's ingredients),
// returning a new array only when a member changed.
function stripTagFromRefs(refs, target) {
  if (!Array.isArray(refs)) return null;
  let changed = false;
  const next = refs.map((ref) => {
    const match = rewriteMatch(ref?.match, target);
    if (!match) return ref;
    changed = true;
    return { ...ref, match };
  });
  return changed ? next : null;
}

function stripTagFromGroups(groups, target) {
  let changed = false;
  const next = groups.map((group) => {
    const options = stripTagFromRefs(group?.options, target);
    if (!options) return group;
    changed = true;
    return { ...group, options };
  });
  return changed ? next : null;
}

// Mirror vocabularyUsage.matchesOf: prefer the grouped-options shape, falling back to the legacy
// bare-`ingredients` list so the strip covers exactly what the reference count credits.
function stripTagFromIngredientSet(set, target) {
  const groups = Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : [];
  if (groups.length > 0) {
    const next = stripTagFromGroups(groups, target);
    if (!next) return null;
    // The `...set` spread used to carry a STALE flat mirror through unchanged, so a tag cascade
    // left the retired `ingredients` alias still naming the tag it had just removed.
    const rewritten = { ...set, ingredientGroups: next };
    delete rewritten.ingredients;
    return rewritten;
  }
  const ingredients = stripTagFromRefs(set?.ingredients, target);
  return ingredients ? { ...set, ingredients } : null;
}

function stripTagFromSets(sets, target) {
  if (!Array.isArray(sets)) return null;
  let changed = false;
  const next = sets.map((set) => {
    const rewritten = stripTagFromIngredientSet(set, target);
    if (!rewritten) return set;
    changed = true;
    return rewritten;
  });
  return changed ? next : null;
}

function stripTagFromSteps(steps, target) {
  if (!Array.isArray(steps)) return null;
  let changed = false;
  const next = steps.map((step) => {
    const sets = stripTagFromSets(step?.ingredientSets, target);
    if (!sets) return step;
    changed = true;
    return { ...step, ingredientSets: sets };
  });
  return changed ? next : null;
}

/**
 * Recipes whose tag-placeholder ingredients (`match.type === 'tags'`) name the deleted tag, each
 * paired with the minimal `updateRecipe` patch that strips the tag out of every placeholder — at
 * the top level (`ingredientSets`) and per step (`steps[].ingredientSets`).
 */
export function planRecipeTagRemovals(recipes, tagName) {
  const target = vocabularyKey(tagName);
  if (!target) return [];

  const patches = [];
  for (const recipe of recipes || []) {
    if (!recipe?.id) continue;
    const updates = {};
    const sets = stripTagFromSets(recipe.ingredientSets, target);
    if (sets) updates.ingredientSets = sets;
    const steps = stripTagFromSteps(recipe.steps, target);
    if (steps) updates.steps = steps;
    if (Object.keys(updates).length > 0) patches.push({ id: recipe.id, updates });
  }
  return patches;
}
