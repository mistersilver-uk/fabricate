/**
 * The three world scoped-entity ENTRY routes, and the breadcrumb seam they hand to PRs 6a, 6b
 * and 6c (issue 1362, epic 1357).
 *
 * ## Why the entry trail is three crumbs and the catalogue trail is two
 *
 * The prototype's `crumbFor` settles it: a catalogue is `[World, <catalogue>]`, and an entry is
 * `[World, <catalogue>, <entity name>]` with the MIDDLE crumb clickable back to the catalogue.
 * That middle crumb is the only back-affordance out of an entry editor, which is released to
 * full width and therefore has no inspector to carry one - so a one-level `World > <screen>`
 * trail on an entry route is not a smaller version of the right answer, it is a dead end.
 *
 * ## Why it lives here rather than inline in the shell
 *
 * `CraftingSystemManagerRoot.svelte` is one of the gateway files requirement 7 of
 * `### GM World Scoped Entity Routes` closes to the four later lanes of this epic, and the
 * breadcrumb is shell chrome those lanes cannot reach. So the shell owns the trail and this
 * module owns the two facts a later lane has to be able to supply without reopening it: which
 * catalogue an entry route returns to, and how the entity's own name is resolved out of the
 * published world corpus. A lane that renders a catalogue row wires `onOpenEntry(entityId)` on
 * its own page and the crumb follows.
 *
 * ## It imports NOTHING, deliberately
 *
 * The shell's compiled module graph is copied file-by-file into three hand-rolled mounted test
 * trees. A helper that reached the scope descriptors would drag five more modules into every
 * one of them, and an omission in those lists does not fail - it HANGS, reported as
 * `# cancelled`. An import-free leaf closes its own graph in one line.
 */

/**
 * Per entry route: the world corpus its subject lives in, and the catalogue its middle crumb
 * returns to.
 *
 * The catalogue's title key is carried here rather than re-derived, so the middle crumb names
 * the catalogue with the same string the catalogue's own page header uses.
 * `tests/components/manager-contract.test.js` asserts that against the shell's own `viewTitle`,
 * because a hand-maintained mirror of a lang key is exactly the kind that rots silently.
 *
 * @type {Readonly<Record<string, Readonly<{entityType: string, catalogueView: string,
 *   catalogueTitleKey: string, catalogueTitleFallback: string}>>>}
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

/**
 * The entry-route descriptor for a route token, or `null` for every other route.
 *
 * @param {string} view
 * @returns {Readonly<object>|null}
 */
export function scopedEntryRoute(view) {
  return SCOPED_ENTRY_ROUTES[view] ?? null;
}

/**
 * The name of the world entity an entry route is open on, or `''` when there is none.
 *
 * `''` RATHER THAN A PLACEHOLDER, because the caller has a truthful fallback to hand - the
 * screen's own title - and an entity that is missing from the corpus, is unnamed, or has not
 * been chosen yet are all the same thing from the breadcrumb's point of view: there is no
 * subject to name. `entities` is the corpus's own roster, which carries no schema beyond `id`
 * (`scopedDefinitionStore.js`), so `name` is read defensively rather than assumed.
 *
 * @param {unknown} entities The published world corpus roster for the entity type.
 * @param {unknown} entityId
 * @returns {string}
 */
export function scopedEntryName(entities, entityId) {
  if (!Array.isArray(entities) || typeof entityId !== 'string' || entityId === '') return '';
  const entity = entities.find((candidate) => candidate?.id === entityId);
  return typeof entity?.name === 'string' ? entity.name.trim() : '';
}
