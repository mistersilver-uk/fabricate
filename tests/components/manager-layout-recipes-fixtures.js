/** Fixtures and rendered-geometry readers for `manager-layout-recipes.js` (issue 1670). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockFor, managerComponentDir } from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Until issue 785 the Books & Scrolls surface carried its own duplicate page header.
/**
 * ONE GUARD FOR THE THREE ROUTES THAT DECLARE THEIR OWN `grid-template-rows` (issue 1371,
 * round 3), because it is one defect family and it has now shipped three times.
 * A list does not fail on an unknown tag: it silently stops counting one, and the track assertion
 * then compares a short count against a short template and passes. Issue 1429 turned a grid child
 * into `<VocabularyTabs>` and issue 1915 replaced it with `<VocabularyShell>`, neither a name any
 * list was holding, and `<Pagination>` and `<SharedDefinitionCallout>` are capitalised too.
 *
 * @param {object} args
 * @param {string} args.viewFile the `.svelte` under `apps/manager/`.
 * @param {string} args.route the `data-manager-view` token, which is also the sheet selector key.
 * @param {number} args.expectedChildren how many unconditional top-level children the view renders.
 * @param {number} [args.growingTrackIndex] which track must be `minmax(0, 1fr)`; last by default.
 * @param {number} [args.impliedTrailingTracks] children the sheet deliberately leaves to IMPLICIT
 * @param {string} args.growingLabel what the growing child is, for the failure message.
 * @param {string} args.autoLabel what the content-sized children are, for the failure message.
 * @param {(main: string, children: string[]) => void} [args.also] route-specific extra assertions.
 */
export function assertOneTrackPerGridChild({
  viewFile,
  route,
  expectedChildren,
  growingTrackIndex,
  impliedTrailingTracks = 0,
  growingLabel,
  autoLabel,
  also = () => {},
}) {
  const source = readFileSync(resolve(managerComponentDir, viewFile), 'utf8');
  // Anchored on the TAG NAME rather than on `<main class="manager-main`, because two of these
  // views write their attributes one per line and the class is not on the opening tag's own line.
  const mainIndex = source.search(/<main\b/);
  assert.notEqual(mainIndex, -1, `${viewFile} should render a <main> element`);
  assert.ok(
    /<main\b[^<]*class="manager-main[\s"]/.test(source),
    `${viewFile} should render its content region as .manager-main`
  );
  const main = source.slice(mainIndex);

  const conditionals = main.match(/^ {2}\{#\w+/gm) || [];
  assert.deepEqual(
    conditionals,
    [],
    `${viewFile} renders a CONDITIONAL direct child of .manager-main (${conditionals.join(', ')}). ` +
      'The child count then depends on state, so the collapsing `minmax(0, 1fr)` track lands on a ' +
      'different child in each state and no single track list is right for both. Wrap the ' +
      'conditional content in an unconditional element, as `.manager-component-head` does.'
  );

  const children = main.match(/^ {2}<[A-Za-z][\w-]*(?=[\s>])/gm) || [];
  assert.equal(
    children.length,
    expectedChildren,
    `expected ${expectedChildren} unconditional top-level grid children in ${viewFile}, got ` +
      `${children.length}: ${children.join(', ')}`
  );
  assert.equal(
    main.includes('manager-section-header'),
    false,
    `${viewFile} must not render a second page header (issue 676/785/878)`
  );

  const block = blockFor(`.fabricate-manager[data-manager-view="${route}"] .manager-main`);
  const template = block.match(/grid-template-rows:([^;]+);/)?.[1]?.trim();
  assert.ok(template, `the ${route} route must declare its own grid-template-rows`);

  // Tracks are SPACE-separated, and `minmax(0, 1fr)` contains a space of its own.
  const tracks = template.match(/[a-z-]+\([^)]*\)|\S+/g) || [];
  assert.equal(
    tracks.length,
    children.length - impliedTrailingTracks,
    `expected ${children.length - impliedTrailingTracks} tracks for ${children.length} children ` +
      `in ${route}, got "${template}"`
  );

  const growing = growingTrackIndex ?? tracks.length - 1;
  assert.equal(
    tracks[growing],
    'minmax(0, 1fr)',
    `${growingLabel} takes the slack, got "${template}"`
  );
  assert.ok(
    tracks.every((track, index) => index === growing || track === 'auto'),
    `only ${growingLabel} may grow; ${autoLabel} must be auto, got "${template}"`
  );

  also(main, children);
}

// ── THE "or…" MENU (issue 1373, maintainer round 8) ──────────────────────────────────────
// The panel a requirement row opens to accept a different KIND of ingredient in its place.
const orMenuGroupCardPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte'
);
export const orMenuGroupCardSource = readFileSync(orMenuGroupCardPath, 'utf8');

export const OR_MENU_KINDS = ['component', 'tag', 'essence', 'currency'];
export const OR_MENU_LABELS = {
  component: 'Component',
  tag: 'Tag',
  essence: 'Essence',
  currency: 'Currency',
};
export const OR_MENU_GLYPHS = {
  component: 'fa-solid fa-cube',
  tag: 'fa-solid fa-tag',
  essence: 'fa-solid fa-flask-vial',
  currency: 'fa-solid fa-coins',
};
// ── THE KIND PICKER (issue 1510) ─────────────────────────────────────────────────────────
/**
 * The requirement row's kind control exactly as `RecipeIngredientOption` renders it: the picker ROOT
 * with the trigger nested inside, because the root is where `.fabricate-select` and the caller's
 * `.manager-recipe-option-kind` land while the rung is `.fabricate-select
 * .fabricate-select-trigger-inline`. A trigger-only fixture matches neither, and the row-parity and
 * tint measurements would go fictional green on markup the app no longer emits.
 *
 * @param {string} label The chosen kind's own word, as the trigger shows it.
 * @returns {string} The picker's markup.
 */
export function kindPickerFixture(label) {
  return (
    '<div class="fabricate-picker manager-travel-picker fabricate-select manager-recipe-option-kind">' +
    '<button type="button" class="fabricate-select-trigger fabricate-select-trigger-inline"' +
    ' data-recipe-option-kind data-select-size="inline" role="combobox" aria-haspopup="listbox"' +
    ' aria-expanded="false" aria-label="Requirement kind" title="Requirement kind">' +
    `<span class="manager-travel-picker-value fabricate-select-value">${label}</span>` +
    '<i class="fas fa-chevron-down" aria-hidden="true"></i></button></div>'
  );
}
