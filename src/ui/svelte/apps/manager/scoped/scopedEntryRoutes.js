/** The three world scoped-entity ENTRY routes and the breadcrumb seam later lanes read. */

/**
 * Per entry route: its world corpus, and the catalogue its middle crumb returns to — the only way
 * back out of a full-width editor. `manager-contract.test.js` pins the title key to `viewTitle`.
 */
export const SCOPED_ENTRY_ROUTES = Object.freeze({
  'world-component-entry': Object.freeze({
    entityType: 'component',
    catalogueView: 'world-components',
    catalogueTitleKey: 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle',
    catalogueTitleFallback: 'Component catalogue',
  }),
  'world-essence-entry': Object.freeze({
    entityType: 'essence',
    catalogueView: 'world-essences',
    catalogueTitleKey: 'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle',
    catalogueTitleFallback: 'Essence Catalogue',
  }),
  'world-tool-entry': Object.freeze({
    entityType: 'tool',
    catalogueView: 'world-tools',
    catalogueTitleKey: 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle',
    catalogueTitleFallback: 'Tools Catalogue',
  }),
});

export function scopedEntryRoute(view) {
  return SCOPED_ENTRY_ROUTES[view] ?? null;
}

/** The name of the world entity an entry route is open on; `''` when the corpus has none. */
export function scopedEntryName(entities, entityId) {
  if (!Array.isArray(entities) || typeof entityId !== 'string' || entityId === '') return '';
  const entity = entities.find((candidate) => candidate?.id === entityId);
  return typeof entity?.name === 'string' ? entity.name.trim() : '';
}
