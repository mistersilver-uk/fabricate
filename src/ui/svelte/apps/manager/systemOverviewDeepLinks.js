/**
 * Where a Validation issue deep-links: its group (an issue `kind`, or the `entityKind` of a
 * Counter or Crafting Action library issue) maps to the view it opens and the open helper that
 * selects the record there. A group with no entry, a `system` blocker among them, has no link.
 */

/**
 * @param {object} open The root's open helpers, each taking the record id.
 * @returns {{ links: object, selectIssue: (issue: object) => void }}
 */
export function createOverviewDeepLinks({
  editRecipe,
  editEnvironment,
  editComponent,
  openCounter,
  openAction,
}) {
  const environmentLink = {
    view: 'environment-edit',
    targetId: (issue) => issue.environmentId,
    open: editEnvironment,
  };
  const links = {
    recipe: { view: 'recipe-edit', targetId: (issue) => issue.entityId, open: editRecipe },
    environment: environmentLink,
    task: environmentLink,
    event: environmentLink,
    salvage: { view: 'component-edit', targetId: (issue) => issue.entityId, open: editComponent },
    counter: { view: 'iterative-counters', targetId: (issue) => issue.entityId, open: openCounter },
    action: {
      view: 'iterative-action-edit',
      targetId: (issue) => issue.entityId,
      open: openAction,
    },
  };

  function selectIssue(issue) {
    if (!issue) return;
    const group = issue.kind === 'system' ? issue.entityKind : issue.kind;
    const target = Object.hasOwn(links, group) ? links[group] : null;
    const id = target?.targetId(issue);
    if (id) target.open(id);
  }

  return { links, selectIssue };
}
