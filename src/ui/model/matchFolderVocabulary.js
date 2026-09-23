/** Folder-name "match-by-name" for folder-aware bulk import (issue 771). */
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
