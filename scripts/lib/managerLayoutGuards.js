/**
 * Pure helpers for the Foundry smoke harness's manager layout-overflow guard
 * (issue #645, Guard 2).
 *
 * `assertManagerLayoutStable` in `scripts/foundry-test-run.mjs` measures a fixed
 * list of ~38 manager selectors and throws on horizontal overflow of whatever it
 * FINDS. That is fail-open: if a critical row/edit-form class is renamed or
 * removed, its selector matches nothing, is simply not measured, and the surface
 * loses overflow coverage silently. The only global backstop is a
 * `rowCount === 0 && editFormCount === 0` throw that spans EVERY surface, so a
 * single renamed per-surface class stays invisible.
 *
 * These helpers close that gap by naming, per manager surface, the selector(s)
 * that MUST match at least one element, and failing loud when one does not. They
 * are deliberately side-effect-free and import nothing from Playwright or
 * `foundry-test-run.mjs` (that harness launches Chromium on import), so
 * `tests/foundry-manager-layout-guard.test.js` exercises the same decision logic
 * the harness runs at smoke time.
 */

/**
 * Count how many measured elements matched each selector.
 *
 * Accepts the harness's per-element measurement array (each record carries a
 * `.selector`; one record per matched element) OR a pre-summarised
 * `{ selector, count }[]` array. A record's `count` is used when it is a finite
 * number, otherwise the record counts as a single matched element. A selector
 * that matched nothing has no records, so it is absent from the map (count 0).
 *
 * @param {Array<{ selector?: string, count?: number }>} metrics
 * @returns {Map<string, number>}
 */
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
 * Assert every `expected` selector matched at least one measured element, and
 * throw naming EACH expected selector that matched none.
 *
 * This is the fail-loud converse of the harness's measure-what-you-find pass: a
 * renamed or removed critical class drops its match count to 0, so listing it in
 * `expected` for the surfaces that render it turns silent coverage loss into a
 * thrown error. Extra/unexpected selectors in `metrics` are ignored — a surface
 * legitimately renders many selectors the caller does not pin.
 *
 * An empty (or non-array) `expected` asserts nothing, so a surface with no
 * pinned critical selector is a no-op rather than a false failure.
 *
 * @param {Array<{ selector?: string, count?: number }>} metrics - the per-element
 *   (or pre-summarised) selector measurements the harness computed
 * @param {string[]} expected - selectors that MUST match at least one element
 * @param {string} [label] - the surface label, included in the thrown message
 * @throws {Error} when any `expected` selector matched zero elements
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
 * Per manager-surface critical selectors that MUST render, keyed by the exact
 * `label` (or `captureStableManagerView` `layout`) passed to
 * `assertManagerLayoutStable`.
 *
 * Each surface pins ONLY selector(s) the harness already proves are present
 * right before its layout assertion (via a `waitFor`/`.count()` check), so this
 * map never false-fails on a legitimately-rendered surface. Surfaces that render
 * no stable row/edit-form selector (e.g. the checks editor/validation LIST
 * views, the tags browser, the selected-system overview facts page, the
 * gathering settings form) are intentionally OMITTED — an unmapped label asserts
 * nothing and keeps relying on the harness's global row/edit-form backstop.
 *
 * @type {Record<string, string[]>}
 */
export const MANAGER_SURFACE_EXPECTED_SELECTORS = {
  // System library browser — the systems table (harness clicks a system row).
  'normal default selection': ['.manager-system-row'],

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
  'components normal': ['.manager-component-row'],
  'components stacked': ['.manager-component-row'],
  'component edit normal': ['.manager-component-edit-view'],

  // Essences browser + editor.
  'essences normal': ['.manager-essence-row'],
  'essences stacked': ['.manager-essence-row'],
  'essence-edit first state': ['.manager-essence-edit-view'],

  // Environments browser (harness asserts `.manager-environment-row` count >= 1).
  'environments normal': ['.manager-environment-row'],
  'environments stacked': ['.manager-environment-row'],

  // Gathering events browser + editors.
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
};

/**
 * Look up the pinned critical selectors for a manager surface label. Returns an
 * empty array for an unmapped surface so the caller asserts nothing there.
 *
 * @param {string} label
 * @returns {string[]}
 */
export function expectedSelectorsForManagerSurface(label) {
  return MANAGER_SURFACE_EXPECTED_SELECTORS[label] || [];
}
