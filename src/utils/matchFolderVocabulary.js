/**
 * Folder-name "match-by-name" for folder-aware bulk import (issue 771).
 *
 * The lightweight default behind the mapping step: a detected folder whose name matches
 * an existing category and/or tag pre-fills that assignment, so a GM who just wants
 * "folder name → category/tag" can click straight through.
 *
 * The two axes are INDEPENDENT — a folder may match a category, a tag, both, or
 * neither, and each is applied on its own:
 *  - `category` is compared CASE-INSENSITIVELY against `componentCategories` and, on a
 *    hit, resolves to the vocabulary's own casing (so `Reagent` stays `Reagent`).
 *  - `tag` is compared against `itemTags` LOWERCASED (tags are stored lowercase) and,
 *    on a hit, resolves to the lowercased folder name.
 *
 * Pure and Foundry-global-free.
 *
 * @param {string} folderName
 * @param {{ componentCategories?: string[], itemTags?: string[] }} [vocabulary]
 * @returns {{ category: string|null, tag: string|null }}
 */
export function matchFolderNameToVocabulary(
  folderName,
  { componentCategories = [], itemTags = [] } = {}
) {
  const name = String(folderName || '').trim();
  if (!name) return { category: null, tag: null };
  const lower = name.toLowerCase();

  const category =
    (componentCategories || []).find(
      (candidate) => String(candidate).trim().toLowerCase() === lower
    ) || null;

  const tagMatches = (itemTags || []).some(
    (candidate) => String(candidate).toLowerCase() === lower
  );
  const tag = tagMatches ? lower : null;

  return { category, tag };
}
