/**
 * Pure helpers for the Foundry smoke harness's manager layout-overflow guard (issue #645, Guard 2).
 */

/** Count how many measured elements matched each selector. */
function countMatchesBySelector(metrics) {
  const counts = new Map();
  if (!Array.isArray(metrics)) return counts;
  for (const record of metrics) {
    if (!record || typeof record.selector !== 'string') continue;
    const increment = Number.isFinite(record.count) ? record.count : 1;
    counts.set(record.selector, (counts.get(record.selector) || 0) + increment);
  }
  return counts;
}

/**
 * Assert every `expected` selector matched at least one measured element, and throw naming each
 * expected selector that matched none.
 */
export function assertExpectedSelectorsPresent(metrics, expected, label) {
  if (!Array.isArray(expected) || expected.length === 0) return;
  const counts = countMatchesBySelector(metrics);
  const missing = expected.filter((selector) => (counts.get(selector) || 0) < 1);
  if (missing.length > 0) {
    const where = label ? ` at ${label}` : '';
    throw new Error(
      `Manager layout guard${where}: expected selector(s) matched no elements — ${missing.join(', ')}. ` +
        'A renamed or removed class silently drops the surface to zero overflow coverage; ' +
        'update the class here and in the per-surface expected map if the rename is intentional.'
    );
  }
}

/**
 * Per manager-surface critical selectors that must render, keyed by the exact `label` (or
 * `captureStableManagerView` `layout`) passed to `assertManagerLayoutStable`.
 */
export const MANAGER_SURFACE_EXPECTED_SELECTORS = {
  // System library browser — the systems list (harness clicks a system row).
  'normal default selection': ['.manager-system-row', '.manager-system-identity'],

  // Recipes browser (harness waits on `.manager-recipe-row`).
  'recipes normal': ['.manager-recipe-row'],
  'recipes narrow': ['.manager-recipe-row'],
  'recipes no check': ['.manager-recipe-row'],

  // Recipe editor — the `<main class="manager-recipe-edit-main">` wrapper renders
  // on every tab (overview/ingredients/validation/results/access rail).
  'recipe edit normal': ['.manager-recipe-edit-main'],
  'recipe edit ingredients': ['.manager-recipe-edit-main'],
  'recipe edit validation': ['.manager-recipe-edit-main'],
  'recipe edit multistep': ['.manager-recipe-edit-main'],
  'recipe edit access rail': ['.manager-recipe-edit-main'],
  'manager-recipe-edit-results': ['.manager-recipe-edit-main'],
  'manager-recipe-edit-results-multistep': ['.manager-recipe-edit-main'],
  'manager-recipe-edit-results-progressive': ['.manager-recipe-edit-main'],
  'manager-recipe-edit-results-alchemy': ['.manager-recipe-edit-main'],

  // Components browser (harness clicks a `.manager-component-row`).
  'components normal': [
    '.manager-components-list',
    '.manager-component-row',
    '.manager-component-identity',
  ],
  'components stacked': ['.manager-components-list', '.manager-component-row'],
  // The component editor is a single scrolling column with no right rail (decision 4).
  'component edit normal': ['.manager-component-edit-view', '.manager-component-identity-strip'],

  // Essences browser + editor (issue 1036).
  'essences normal': ['.manager-essences-table', '.manager-essence-row'],
  'essences stacked': ['.manager-essence-row'],
  'essences disabled in use': ['.manager-essence-row', '.manager-essence-identity'],
  'essences grid': ['.manager-essences-table', '.manager-essence-row'],
  // The bulk panel REPLACES the inspector while a selection exists, so the browser's own
  // row is still the thing to measure.
  'essences bulk edit': ['.manager-essence-row'],
  'essence-edit first state': ['.manager-essence-edit-view'],
  'essence edit on craft': ['.manager-essence-edit-view'],
  'essence edit validation': ['.manager-essence-edit-view'],

  // Environments browser (harness asserts `.manager-environment-row` count >= 1).
  'environments normal': [
    '.manager-environments-table',
    '.manager-environment-row',
    '.manager-environment-identity',
  ],
  'environments stacked': ['.manager-environment-row'],

  // Gathering events browser + editors. The events browser became a list with the other three
  // in issue 1515; its row class survives that deliberately, so it stays the pinned selector.
  'gathering events normal': ['.manager-gathering-event-row'],
  'gathering event editor normal': ['.manager-gathering-event-edit-view'],
  'gathering task editor normal': ['.manager-gathering-task-edit-view'],
  'gathering task editor stacked': ['.manager-gathering-task-edit-view'],

  // Gathering travel (harness waits on `.manager-travel-parties-row`).
  'gathering travel normal': ['.manager-travel-parties-row'],
  'gathering travel stacked': ['.manager-travel-parties-row'],

  // System editor form (harness waits on the system-edit route + its controls).
  'system edit normal': ['.manager-system-edit-form'],
  'system edit narrow': ['.manager-system-edit-form'],
  'system edit blocked': ['.manager-system-edit-form'],

  // Tools browser (harness waits on `.manager-tools-row`).
  'tools normal': ['.manager-tools-row'],

  // GM Knowledge surface (issue 785). Both widths pin the owned-copy row, which the harness proves
  // is rendered right before each of these assertions.
  'knowledge normal': ['.manager-knowledge-copy-row'],
  'knowledge narrow': ['.manager-knowledge-copy-row'],
};

/**
 * Look up the pinned critical selectors for a manager surface label. Returns an empty array for an
 * unmapped surface so the caller asserts nothing there.
 */
export function expectedSelectorsForManagerSurface(label) {
  return MANAGER_SURFACE_EXPECTED_SELECTORS[label] || [];
}
