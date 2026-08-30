/**
 * Integrity properties over the design-system manifest and the two registries derived from it.
 *
 * The defect class issue 1116 names is not a wrong routing rule. It is that UNREACHABLE
 * CONFIGURATION LOOKS IDENTICAL TO WORKING CONFIGURATION: an override naming a case id that does
 * not exist is dropped by the `selected.has(id) && viewCase.publish` filter at the end of
 * `mapChangedFilesToCases`, so the entry sits in `viewLabCases.js` reading like a decision while
 * the primitive keeps publishing the representative pair, and nothing anywhere reports it. That is
 * not hypothetical — two comments in that registry cited `manager-gathering-stamina-rolls` for
 * years and no case has ever had that id.
 *
 * Everything below exists to make one of those silences audible.
 *
 * WHY THE PATTERN SOURCE IS PINNED AS A LITERAL STRING
 * ----------------------------------------------------
 * `BROAD_SIGNAL_PATTERN` is now DERIVED from `scripts/lib/designSystemPrimitives.js` rather than
 * typed out, which is the point of issue 1378 — but a derivation is exactly the thing that can
 * widen or narrow without anyone editing a line that looks like routing. Adding `evidence: 'broad'`
 * to one manifest row silently conscripts a sixth of the corpus into the representative pair;
 * dropping it from another silently hands a primitive's evidence to whichever cases happen to
 * claim its path. Pinning the emitted source turns both into a diff a reviewer must accept.
 *
 * WHY THE BASELINES ARE PINNED EXACTLY RATHER THAN AS CEILINGS
 * ------------------------------------------------------------
 * Both `BROAD_SHADOWED_SOURCE_MATCHES` and `PRIMITIVES_WITH_NO_FRAME` are debt registers, and a
 * `<=` ceiling loosens by one slot every time debt is paid: remove an entry, and the list sits one
 * under the ceiling with nothing requiring the ceiling to follow it. The next author can then
 * append instead of fixing and still pass. `tests/scripts-lint-gate-coverage.test.js` records the
 * same reasoning for `ACKNOWLEDGED_UNGATED_COUNT`, and this file follows it.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED
 * ----------------------------------
 * That every case id cited in a COMMENT in `viewLabCases.js` resolves to a real case. Measured, 41
 * backticked kebab-case tokens in that file's comments are not case ids and nearly all are
 * legitimate — fixture ids (`hb-r-stillroom`), data attributes (`data-arm-token`), a sibling test
 * filename. One is decisive: the registry opens a comment with `KNOWN GAP — no
 * coverage-mode-progressive-detail`, a deliberate citation of an id that does not exist, recording
 * an adjudicated gap. A property that reddened there would invite an implementer to "fix" it by
 * deleting the adjudication, and there is no non-fragile way to tell a cited case id from a
 * fixture id by shape.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_SYSTEM_PRIMITIVES,
  NOT_A_PRIMITIVE,
  RULED_OUT,
  primitivePathsByEvidence,
} from '../scripts/lib/designSystemPrimitives.js';
import {
  BROAD_SIGNAL_CASE_OVERRIDES,
  BROAD_SIGNAL_PATTERN,
  VIEW_LAB_CASES,
  mapChangedFilesToCases,
} from '../scripts/lib/viewLabCases.js';
import { VIEW_RECIPES } from '../scripts/ui-pr-screenshot-evidence.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The roots a diff can name that `BROAD_SIGNAL_PATTERN` can match. `styles/` is included because
 * `styles/fabricate.css` is a broad signal and is the most commonly touched UI file in the
 * repository, so a walk that missed it would make property (b)'s baseline collapse from 21 to 8
 * while still reporting success.
 */
const RENDER_ROOTS = ['src', 'styles'];

/**
 * Every file under {@link RENDER_ROOTS}, as repository-relative POSIX paths.
 *
 * POSIX-normalised because `readdirSync` yields `ui\theme.js` on a Windows dev machine and
 * `ui/theme.js` on the `ubuntu-latest` runner, while every pattern in both registries is written
 * forward-slash. Without this the assertions below disagree with themselves across platforms.
 *
 * @returns {string[]} sorted repository-relative paths
 */
function listRenderFiles() {
  const found = [];
  const walk = (absolute, relative) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(childAbsolute, childRelative);
      else found.push(childRelative);
    }
  };
  for (const root of RENDER_ROOTS) walk(path.join(REPO_ROOT, root), root);
  return found.sort();
}

const RENDER_FILES = listRenderFiles();
const BROAD_SIGNAL_FILES = RENDER_FILES.filter((file) => BROAD_SIGNAL_PATTERN.test(file));

/** Every manifest row, members and recorded non-members alike. See {@link NOT_A_PRIMITIVE}. */
const MANIFEST_ROWS = [...DESIGN_SYSTEM_PRIMITIVES, ...NOT_A_PRIMITIVE];

/** Rows carrying a given evidence judgement, across BOTH manifest arrays. */
const rowsWithEvidence = (evidence) => MANIFEST_ROWS.filter((row) => row.evidence === evidence);

/** Case ids that actually publish a frame. An override naming anything else is inert. */
const PUBLISHING_CASE_IDS = new Set(
  VIEW_LAB_CASES.filter((viewCase) => viewCase.publish).map((viewCase) => viewCase.id)
);

/**
 * The V8-escaped source of `BROAD_SIGNAL_PATTERN`, verbatim.
 *
 * `String.raw` rather than a quoted string with doubled backslashes: the value contains 28 `\/`
 * sequences, and a pin that has to be hand-escaped to be written down is a pin that will be
 * updated by re-pasting whatever the code currently emits, which is not a pin at all.
 */
const EXPECTED_BROAD_SIGNAL_SOURCE = String.raw`^styles\/|^src\/ui\/svelte\/components\/|^src\/ui\/theme\.js$|^src\/ui\/svelte\/apps\/manager\/(ArmedDangerButton|Callout|Chip|EditorValidationSurface|EmptyState|ExplainerCard|IconFactRow|ItemDropZone|ManagerModal|RadioCardGroup|RollDataExpressionInput|SearchablePopover|SegmentedControl|ToggleCard)\.svelte$`;

/**
 * The keys `BROAD_SIGNAL_CASE_OVERRIDES` carries — the DOMAIN, pinned separately from the entries.
 *
 * `viewLabCases.js` exports that table solely for this file, so a later refactor that moved the
 * overrides into the case literals and left the export as `{}` would leave every loop below
 * running over nothing and every property green over an empty domain. The domain pin is what makes
 * that unrepresentable rather than merely unlikely.
 */
const EXPECTED_OVERRIDE_KEYS = [
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
];

/**
 * Every `sourceMatches` pattern that names a file `BROAD_SIGNAL_PATTERN` also matches, as
 * `<case id> :: <pattern source>`.
 *
 * These can never be consulted. `selectRenderFileCases` `continue`s on a broad-signal file BEFORE
 * it reaches any case's `sourceMatches`, so each of these is a case declaring an interest the
 * router will not act on. Reporting them is the point of this baseline; it is NOT a clean-tree
 * assertion, because deleting 21 patterns across 17 case literals is unscoped work and each one
 * needs its own adjudication — several of these cases plainly DO want their `styles/fabricate.css`
 * claim honoured, and answering that is a routing decision, not a tidy-up.
 *
 * Thirteen of the 21 are `styles/fabricate.css` claimants, which is a historical accident of which
 * cases pasted the pattern rather than an attribution anyone made.
 *
 * The only accepted edit to this list is a REMOVAL, with the reason in the commit that makes it.
 */
const BROAD_SHADOWED_SOURCE_MATCHES = [
  String.raw`coverage-theme-light-manager :: ^src\/ui\/theme\.js$`,
  String.raw`coverage-theme-light-manager :: ^styles\/fabricate\.css$`,
  String.raw`coverage-theme-light-player :: ^src\/ui\/theme\.js$`,
  String.raw`coverage-theme-light-player :: ^styles\/fabricate\.css$`,
  String.raw`manager-checks-crafting-dynamic-dc :: ^src\/ui\/svelte\/apps\/manager\/ItemDropZone\.svelte$`,
  String.raw`manager-component-complications-empty :: ^src\/ui\/svelte\/apps\/manager\/EmptyState\.svelte$`,
  String.raw`manager-world-downtime-test-companion-chrome :: ^src\/ui\/svelte\/apps\/manager\/Chip\.svelte$`,
  String.raw`manager-world-downtime-test-companion-chrome :: ^src\/ui\/svelte\/components\/Medallion\.svelte$`,
  String.raw`manager-world-downtime-test-companion-chrome :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-installed :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-rollup :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-tab-navigation :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-parties-card-stacked-680 :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-parties-empty :: ^src\/ui\/svelte\/apps\/manager\/(CraftingSystemManagerRoot|EnvironmentsBrowserView|GatheringPartiesTab|EmptyState)\.svelte$`,
  String.raw`manager-world-parties-last-page :: ^src\/ui\/svelte\/components\/Pagination\.svelte$`,
  String.raw`manager-world-parties-stacked :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-default-collapsed :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-expanded-neutral :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-long-label-focus :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-ungated :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-with-gathering-expanded :: ^styles\/fabricate\.css$`,
];

/**
 * Broad-signal components that no frame in the registry renders.
 *
 * Membership rule, stated so the number is reproducible: a file matched by `BROAD_SIGNAL_PATTERN`
 * whose path ends `.svelte` and which has no `BROAD_SIGNAL_CASE_OVERRIDES` entry. A change to one
 * of these publishes `manager-components-normal` and `fabricate-app-shell` and nothing else, and
 * whether either frame contains the changed component is unexamined — which is issue 1116's
 * complaint, unresolved for these 28 and resolved for `Stepper` and `ThresholdBandStrip`, whose
 * entries this change added.
 *
 * The three non-Svelte broad signals — `styles/fabricate.css`, `src/ui/theme.js` and
 * `components/stepperLabels.js` — are excluded by the rule rather than by an exception, because no
 * frame "renders" a stylesheet or a label module and the representative pair is the honest evidence
 * for them.
 *
 * Five entries are `NOT_A_PRIMITIVE` rows rather than members: `ActorSelectTopBar`, `DropZone`,
 * `ImagePathPicker`, `ManagerColorPicker` and `RowDisclosure`. They are here because the routing
 * question is "what does the pattern match", and the pattern matches them — which is precisely the
 * defect issue 1378 names, that a directory cannot tell a primitive from a component that merely
 * lives in it. Two of them are dead code and can leave this list by being deleted.
 *
 * Each later primitive extraction in this programme removes its own entry, and the only accepted
 * edit is a REMOVAL.
 */
const PRIMITIVES_WITH_NO_FRAME = [
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/ItemDropZone.svelte',
  'src/ui/svelte/apps/manager/ManagerModal.svelte',
  'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
  'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  'src/ui/svelte/components/ActorSelectTopBar.svelte',
  'src/ui/svelte/components/ChanceSlider.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
  'src/ui/svelte/components/DropZone.svelte',
  'src/ui/svelte/components/EssenceSourceSelector.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/ImagePathPicker.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/ManagerColorPicker.svelte',
  'src/ui/svelte/components/ManagerColorPopover.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
];

test('the inputs every property below quantifies over are alive', () => {
  // A guard that stopped looking at anything must not keep reporting success. The nested-file
  // check is what a walk that lost its recursion would fail; a named path is deliberately not
  // used, because deleting that one file would then read as broken recursion and invite a repoint.
  assert.ok(RENDER_FILES.length > 100, `expected a populated render-file walk, got ${RENDER_FILES.length}`);
  assert.ok(
    RENDER_FILES.some((file) => file.split('/').length > 4),
    'the render-file walk reached no nested file, so it is not recursing'
  );
  assert.ok(BROAD_SIGNAL_FILES.length > 0, 'BROAD_SIGNAL_PATTERN matched nothing on disk');
  assert.equal(DESIGN_SYSTEM_PRIMITIVES.length, 38, 'the shipped primitive set changed size');
  assert.equal(NOT_A_PRIMITIVE.length, 5, 'the recorded non-member set changed size');
  assert.ok(RULED_OUT.length > 0, 'the ruled-out register is empty');
  assert.ok(PUBLISHING_CASE_IDS.size > 0, 'no case publishes, so override values cannot be checked');
});

test('BROAD_SIGNAL_PATTERN emits exactly the pinned source', () => {
  assert.equal(
    BROAD_SIGNAL_PATTERN.source,
    EXPECTED_BROAD_SIGNAL_SOURCE,
    'the broad-signal set changed. That is a routing change for every UI PR: widening it takes ' +
      'frames away from the cases that claim a file, narrowing it hands a primitive\'s evidence ' +
      'to whichever cases happen to name its path. Accept it by updating this pin deliberately.'
  );
  assert.equal(BROAD_SIGNAL_PATTERN.source.length, 308);
});

test('(a) every override key is a broad-signal file that exists on disk', () => {
  assert.deepEqual(
    Object.keys(BROAD_SIGNAL_CASE_OVERRIDES).sort(),
    EXPECTED_OVERRIDE_KEYS,
    'the override domain changed; see EXPECTED_OVERRIDE_KEYS for why it is pinned'
  );
  for (const key of EXPECTED_OVERRIDE_KEYS) {
    assert.ok(
      BROAD_SIGNAL_PATTERN.test(key),
      `${key} is not a broad signal, so selectRenderFileCases never reaches its override — it ` +
        'would be consulted through the case sourceMatches instead, and this entry is dead'
    );
    assert.ok(existsSync(path.join(REPO_ROOT, key)), `${key} does not exist; the override is dead`);
  }
});

test('(a) every override value names a case that publishes', () => {
  const entries = Object.entries(BROAD_SIGNAL_CASE_OVERRIDES);
  assert.ok(entries.length > 0, 'the override table is empty, so this property has no domain');
  for (const [key, caseIds] of entries) {
    assert.ok(caseIds.length > 0, `${key} overrides to no case at all`);
    for (const caseId of caseIds) {
      // `mapChangedFilesToCases` filters on `selected.has(id) && viewCase.publish`, so a bogus id
      // and an unpublishable one fail the same silent way: the primitive keeps publishing the
      // representative pair and the entry looks like it worked.
      assert.ok(
        PUBLISHING_CASE_IDS.has(caseId),
        `${key} overrides to '${caseId}', which is not the id of a publishing case. The entry is ` +
          'silently dropped and the primitive still publishes only the representative pair.'
      );
    }
  }
});

test('(a) the two primitives issue 1116 named now publish a frame that renders them', () => {
  const selectedFor = (file) => mapChangedFilesToCases([file]).map((viewCase) => viewCase.id);

  const stepperCases = selectedFor('src/ui/svelte/components/Stepper.svelte');
  assert.ok(
    stepperCases.includes('manager-gathering-economy-actors'),
    `a Stepper change selected ${JSON.stringify(stepperCases)}, none of which renders a stepper`
  );

  // Containment, not equality: the shipped selectors are scoped
  // ('.fabricate-manager [data-band-strip-band]'), so an equality criterion would fail a correct
  // implementation.
  const stripCases = selectedFor('src/ui/svelte/components/ThresholdBandStrip.svelte');
  const stripSelectors = stripCases
    .map((id) => VIEW_LAB_CASES.find((viewCase) => viewCase.id === id)?.expectSelector ?? '')
    .join(' ');
  assert.ok(
    stripSelectors.includes('[data-band-strip-band]'),
    `no selected case anchors on a band: ${JSON.stringify(stripCases)}`
  );
  assert.ok(
    stripSelectors.includes('[data-band-strip-handle]'),
    `no selected case anchors on a drag handle: ${JSON.stringify(stripCases)}`
  );
});

test('(a) the representative pair survives an override, additively', () => {
  // The override mechanism is ADDITIVE by contract (`viewLabCases.js`: "Broad signals still select
  // REPRESENTATIVE_CASE_IDS; these are additive, narrowly named exceptions"). Issue 1116's
  // suggested "claimed wins, no fallback" rule would have dropped the pair, and would have taken
  // `styles/fabricate.css` from 2 frames to 13 as well.
  for (const key of EXPECTED_OVERRIDE_KEYS) {
    const selected = mapChangedFilesToCases([key]).map((viewCase) => viewCase.id);
    assert.ok(
      selected.includes('manager-components-normal') && selected.includes('fabricate-app-shell'),
      `${key} lost the representative pair; it selected ${JSON.stringify(selected)}`
    );
  }
});

test('(b) sourceMatches patterns shadowed by the broad signal are exactly the known baseline', () => {
  const shadowed = [];
  for (const viewCase of VIEW_LAB_CASES) {
    for (const pattern of viewCase.sourceMatches ?? []) {
      if (BROAD_SIGNAL_FILES.some((file) => pattern.test(file))) {
        shadowed.push(`${viewCase.id} :: ${pattern.source}`);
      }
    }
  }
  assert.deepEqual(
    shadowed.sort(),
    BROAD_SHADOWED_SOURCE_MATCHES,
    'a case declared a sourceMatches pattern naming a broad-signal file. selectRenderFileCases ' +
      'never reaches it, so the declaration does nothing. Either the file should not be a broad ' +
      'signal, or the case wants a BROAD_SIGNAL_CASE_OVERRIDES entry instead.'
  );
});

test('(c) every manifest row names a file that exists', () => {
  for (const row of MANIFEST_ROWS) {
    assert.ok(
      existsSync(path.join(REPO_ROOT, row.path)),
      `${row.path} is in the manifest and not on disk. A renamed or deleted primitive leaves a ` +
        'row that can never match anything, and a derivation over it emits a name nothing has.'
    );
  }
});

test("(c) every 'broad' row is matched by BROAD_SIGNAL_PATTERN", () => {
  const broadRows = rowsWithEvidence('broad');
  assert.ok(broadRows.length > 0, "no row carries evidence 'broad', so this property is vacuous");
  for (const row of broadRows) {
    assert.ok(
      BROAD_SIGNAL_PATTERN.test(row.path),
      `${row.path} is recorded as a broad signal and the pattern does not match it, so a change ` +
        'to it routes through case sourceMatches instead of the representative pair. A manager ' +
        'row reaches the pattern only by being on the derived name list; a nested path never does.'
    );
  }
});

test("(c) no 'targeted' row is matched by BROAD_SIGNAL_PATTERN", () => {
  const targetedRows = rowsWithEvidence('targeted');
  assert.ok(targetedRows.length > 0, "no row carries evidence 'targeted', so this property is vacuous");
  for (const row of targetedRows) {
    assert.ok(
      !BROAD_SIGNAL_PATTERN.test(row.path),
      `${row.path} is recorded as targeted and BROAD_SIGNAL_PATTERN matches it anyway, so the ` +
        'judgement beside the row is inert: selectRenderFileCases will route it to the ' +
        'representative pair and never consult the cases that claim it. A targeted component ' +
        'placed under src/ui/svelte/components/ is swallowed by that directory leg whatever is ' +
        'written beside it — a directory cannot tell a primitive from a component that merely ' +
        'lives there, which is the defect issue 1378 names.'
    );
  }
});

test('the two studio recipes share one bulk-surface pattern, and it names only targeted rows', () => {
  // The evidence script held this regex TWICE, once per studio match list, and nothing checked the
  // copies agreed. It is hoisted now, so the intersection below reaches the single constant — and
  // if anyone un-hoists it and edits one copy, the intersection empties and this fails.
  const sourcesFor = (recipeId) =>
    (VIEW_RECIPES.find((recipe) => recipe.id === recipeId)?.matches ?? []).map(
      (pattern) => pattern.source
    );
  const componentsSources = sourcesFor('manager-components');
  const recipesSources = sourcesFor('manager-recipes');
  assert.ok(componentsSources.length > 0 && recipesSources.length > 0, 'a studio recipe vanished');

  const shared = componentsSources.filter((source) => recipesSources.includes(source));
  assert.equal(
    shared.length,
    1,
    `expected the two studios to share exactly the bulk-surface pattern, got ${JSON.stringify(shared)}`
  );

  const sharedPattern = new RegExp(shared[0]);
  const claimed = RENDER_FILES.filter((file) => sharedPattern.test(file));
  assert.equal(claimed.length, 5, `expected the five shared bulk surfaces, got ${JSON.stringify(claimed)}`);

  const targetedPaths = new Set(primitivePathsByEvidence('targeted'));
  for (const file of claimed) {
    assert.ok(
      targetedPaths.has(file),
      `${file} is routed to the bulk frames by scripts/ui-pr-screenshot-evidence.mjs but is not ` +
        'an evidence: \'targeted\' row in the manifest. The two registries now disagree about ' +
        'what evidence a change to it requires: one sends it to named frames, the other to the ' +
        'representative pair.'
    );
  }
});

test('every recorded library name is spelled as library.html spells it', () => {
  // The `library` column is a hand-typed mirror of `openspec/specs/design-system/library.html`,
  // and a hand-maintained mirror with nothing checking it rots. This is a SPELLING guard only —
  // it proves the name exists there, not that the shipped component conforms to that entry. The
  // conformance gate that reads the library properly is the next change in this programme.
  const library = readFileSync(
    path.join(REPO_ROOT, 'openspec/specs/design-system/library.html'),
    'utf8'
  );
  const named = MANIFEST_ROWS.filter((row) => row.library !== null);
  assert.ok(named.length > 0, 'no row records a library name, so this property has no domain');
  for (const row of named) {
    const escaped = row.library.replace('<', '&lt;').replace('>', '&gt;');
    assert.ok(
      library.includes(escaped),
      `${row.path} records library entry ${row.library}, which library.html does not contain`
    );
  }
});

test('the broad-signal components that no frame renders are exactly the known baseline', () => {
  const unphotographed = BROAD_SIGNAL_FILES.filter(
    (file) => file.endsWith('.svelte') && !BROAD_SIGNAL_CASE_OVERRIDES[file]
  );
  assert.deepEqual(
    unphotographed.sort(),
    PRIMITIVES_WITH_NO_FRAME,
    'the set of broad-signal components with no frame that renders them changed. Adding one is ' +
      'a regression: that component now publishes two frames that may not contain it. Removing ' +
      'one means an override was added, which is the direction this list is meant to move.'
  );
});
