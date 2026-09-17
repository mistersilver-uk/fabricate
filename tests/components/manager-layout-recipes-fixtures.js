/**
 * Fixtures and rendered-geometry readers for `manager-layout-recipes.js` (issue 1670).
 *
 * Recipe browser, tag requirement and requirement-picker layout: the markup, the component sources and the
 * page readers that surface's tests measure through. Nothing here asserts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockFor, managerComponentDir } from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Until issue 785 the Books & Scrolls surface carried its own duplicate page header, so it
// had FOUR unconditional grid children against the shared three-track `auto auto 1fr`: the
// `1fr` landed on the TOOLBAR — it swallowed every pixel of slack and floated mid-panel —
// while the table fell into an implicit `auto` row pinned to the bottom of the view. The
// header is gone (the shell renders one already) and the route names its own tracks. This
// guard ties the template to the markup rather than to a literal value: adding a section
// without widening the template reintroduces exactly that defect, and before this test no
// coverage existed for this route at all.
/**
 * ONE GUARD FOR THE THREE ROUTES THAT DECLARE THEIR OWN `grid-template-rows` (issue 1371,
 * round 3), because it is one defect family and it has now shipped three times.
 *
 * ## The defect
 *
 * `.manager-main` is a grid whose row track list is named in the sheet, per route. A child added
 * to the markup without a track added to the sheet shifts every later child one track down: the
 * last named track is `minmax(0, 1fr)` and its MIN IS 0, so whichever child lands there collapses
 * to nothing and paints over its neighbours. On `components` that put the toolbar — its filter
 * row, its inherit summary and its count — on top of rows 1 to 3 of the list. The sheet's own
 * comments record the same off-by-one for the same route from issue 676; it happened again
 * because nothing measured it.
 *
 * ## Why one function rather than three tests
 *
 * The three guards were near-identical bodies differing in a file name, a selector, a count and
 * two message strings. SonarCloud's copy-paste detector matches by token SHAPE rather than by
 * literal, so that is duplicated new lines against the quality gate — and worse, the three copies
 * had already DRIFTED: `books-scrolls` used a hand-listed tag alternation while the other two used
 * the general matcher, so the same markup was counted two ways in one file. One function makes the
 * matcher one thing by construction.
 *
 * ## The child matcher
 *
 * ANY two-space-indented opening tag, element or COMPONENT, rather than a hand-listed alternation.
 * A list does not fail on an unknown tag: it silently stops counting one, and the track assertion
 * then compares a short count against a short template and passes. Issue 1429 turned a grid child
 * into `<VocabularyTabs>`, a name no list was holding, and `<Pagination>` and
 * `<SharedDefinitionCallout>` are capitalised too.
 *
 * That opener is DESCRIBED rather than quoted, deliberately. This file's own `withoutComments`
 * strips comments with a non-greedy regex over the RAW text, so a comment that spells the opener
 * pairs with the next closer anywhere below it and deletes everything between — it once silently
 * blanked two fixtures 200k characters later. The lookahead is not decoration either: without it
 * the pattern ends in a `*` quantifier followed by the regex's closing slash, and that sequence IS
 * a block-comment terminator to every raw-text stripper here.
 *
 * ## And the count must be UNCONDITIONAL
 *
 * A `{#if}` at grid level makes the child count a function of state, and no static track list can
 * be right for two different counts — the collapsing track simply moves depending on what is
 * rendered. So a top-level block opener is a FAILURE rather than something to count: the repair is
 * always the same, wrap the conditional content in an unconditional element. That is exactly what
 * `.manager-component-head` does on `components`, and without this assertion a probe child added
 * as `{#if …}<section/>{/if}` was counted as zero and the whole guard passed green.
 *
 * @param {object} args
 * @param {string} args.viewFile the `.svelte` under `apps/manager/`.
 * @param {string} args.route the `data-manager-view` token, which is also the sheet selector key.
 * @param {number} args.expectedChildren how many unconditional top-level children the view renders.
 * @param {number} [args.growingTrackIndex] which track must be `minmax(0, 1fr)`; last by default.
 * @param {number} [args.impliedTrailingTracks] children the sheet deliberately leaves to IMPLICIT
 *   auto rows, with the reason at the call site. Not a licence: it is a recorded shortfall.
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

  // Tracks are SPACE-separated, and `minmax(0, 1fr)` contains a space of its own, so tokenize
  // functional notation as one unit rather than splitting on whitespace.
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
// `proto:2292` is the panel, `proto:2293` its header and `proto:4682`-`4683` its entries.
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