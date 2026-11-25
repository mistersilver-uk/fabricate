/** The structured summary `CompendiumImporter.importFromPackData` answers, before any phase runs. */
export function createImportSummary(systemData, recipesData) {
  return {
    system: { id: null, name: systemData.name || '', created: false, skipped: false },
    components: { total: 0, remapped: [], retained: [], unresolved: [] },
    recipes: { total: recipesData.length, imported: 0, skipped: 0, pruned: 0, errors: [] },
    collisions: [],
    // Recipes of the target system absent from the payload, under overwrite: `pruned` when
    // provenance-matched, else `reported`.
    orphans: [],
    // The cross-reference report surfaced to the GM.
    unresolvedReferences: [],
  };
}
