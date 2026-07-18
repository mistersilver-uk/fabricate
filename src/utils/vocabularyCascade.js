/**
 * Cascade planning for vocabulary deletion (issue 689).
 *
 * Deleting a category or tag that records still reference is a DESTRUCTIVE record
 * rewrite, not a silent orphaning: a deleted recipe/component category reassigns
 * the affected records' `category` back to the reserved `general` bucket, and a
 * deleted item tag is stripped from every component carrying it.
 *
 * These planners are pure: they read the current records and return the minimal
 * set of record patches to apply. The store owns applying them through the
 * recipe/component update paths, then replacing the vocabulary array + icon map.
 */

import { GENERAL_COMPONENT_CATEGORY } from './componentCategories.js';
import { GENERAL_RECIPE_CATEGORY } from './recipeCategories.js';

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

/**
 * Recipes whose `category` matches the deleted recipe category, each patched back
 * to `general`. Empty when the category is `general` or unreferenced.
 *
 * @param {Array<{id: string, category?: string}>} recipes
 * @param {string} categoryName
 * @returns {Array<{id: string, category: string}>}
 */
export function planRecipeCategoryReassignments(recipes, categoryName) {
  return reassignmentsFor(recipes, categoryName, GENERAL_RECIPE_CATEGORY);
}

/**
 * Components whose `category` matches the deleted component category, each patched
 * back to `general`. Empty when the category is `general` or unreferenced.
 *
 * @param {Array<{id: string, category?: string}>} components
 * @param {string} categoryName
 * @returns {Array<{id: string, category: string}>}
 */
export function planComponentCategoryReassignments(components, categoryName) {
  return reassignmentsFor(components, categoryName, GENERAL_COMPONENT_CATEGORY);
}

/**
 * Components carrying the deleted tag, each patched with the tag removed from its
 * `tags` array. Empty when the tag is unreferenced. Comparison is
 * case-insensitive because item tags are stored lowercase but a stray mixed-case
 * value should still be stripped.
 *
 * @param {Array<{id: string, tags?: string[]}>} components
 * @param {string} tagName
 * @returns {Array<{id: string, tags: string[]}>}
 */
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
