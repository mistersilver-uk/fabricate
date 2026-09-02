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
 *
 * NOT ASSERTED YET, AND DELIBERATELY DEFERRED
 * -------------------------------------------
 * That every `evidence: 'targeted'` row is claimed by at least one case's `sourceMatches`. It is a
 * follow-up rather than an omission, and the measured consequence is recorded here so it survives
 * the wait: an unclaimed targeted row does not publish NOTHING. `mapChangedFilesToCases` falls back
 * to `FALLBACK_CASE_ID`, which is `fabricate-app-shell` — the PLAYER window. So a manager
 * primitive whose claim was deleted in a rename would publish a frame that structurally cannot
 * contain it, and `check-screenshots` would go green on it.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { measureImporters } from '../scripts/lib/componentImporters.js';
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
 * repository: 13 of property (b)'s 21 baseline entries are patterns claiming it, so a walk that
 * missed this root would compute 8 where the baseline says 21.
 *
 * That fails the `deepEqual` loudly rather than silently — the reason to walk every root the
 * pattern can match is that the baseline only MEANS what it says if it was measured over the whole
 * domain. A narrowed walk would red as an unexplained baseline change, and the tempting repair is
 * to re-paste the smaller list.
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

/**
 * Rows carrying a given evidence judgement, across BOTH manifest arrays.
 *
 * SELECTS BY EQUALITY, which is why the partition property below exists. A row whose `evidence` is
 * neither of the two values is filtered out of both clauses of property (c) and asserted by
 * nothing — and under `src/ui/svelte/components/` nothing else would notice, because a row there
 * reaches `BROAD_SIGNAL_PATTERN` through the DIRECTORY leg, which never consults the manifest, so
 * that row's `evidence` has no other reader in the repository.
 */
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
const EXPECTED_BROAD_SIGNAL_SOURCE = String.raw`^styles\/|^src\/ui\/svelte\/components\/|^src\/ui\/theme\.js$|^src\/ui\/svelte\/apps\/manager\/(ArmedDangerButton|Callout|Chip|EditorValidationSurface|EmptyState|ExplainerCard|IconFactRow|ItemDropZone|ManagerModal|RadioCardGroup|SearchablePopover|SegmentedControl|ToggleCard)\.svelte$`;

/**
 * The keys `BROAD_SIGNAL_CASE_OVERRIDES` carries — the DOMAIN, pinned separately from the entries.
 *
 * `viewLabCases.js` exports that table solely for this file, so a later refactor that moved the
 * overrides into the case literals and left the export as `{}` would leave every loop below
 * running over nothing and every property green over an empty domain. The domain pin is what makes
 * that unrepresentable rather than merely unlikely.
 */
const EXPECTED_OVERRIDE_KEYS = [
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/ItemDropZone.svelte',
  'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  // Issue 1475: the player window's shared top bar, and the FIRST entry on this list whose
  // override names a player frame. Converting its actor picker onto `SearchablePopover` moved the
  // whole of what changed into the OPEN panel, and both representative frames draw the picker
  // closed — `fabricate-app-shell` is one of them and renders the bar itself, so the closed trigger
  // was never the gap. Its override names `player-actor-picker`.
  'src/ui/svelte/components/ActorSelectTopBar.svelte',
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/InspectorCard.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  // Issue 1458: the pill multi-select's add menu became a `SearchablePopover`, which left the
  // component exactly one painted rule of its own — the at-cap trigger treatment — and that rule
  // had to be re-anchored through `:global()` because the button is the primitive's element now.
  // Its override names the one frame that draws the capped reading.
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  // Issue 1373, round 5: the box's `sm` SIZE has one caller — the Tool Studio's prerequisite row
  // — and neither representative frame draws it. Its override names the one frame that does.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
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
 * complaint, unresolved for these 27 and resolved for `Stepper` and `ThresholdBandStrip`, whose
 * entries issue 1378 added, and for `EditorValidationSurface`, whose entry issue 1444 added when
 * it closed that primitive.
 *
 * The three non-Svelte broad signals — `styles/fabricate.css`, `src/ui/theme.js` and
 * `components/stepperLabels.js` — are excluded by the rule rather than by an exception, because no
 * frame "renders" a stylesheet or a label module and the representative pair is the honest evidence
 * for them.
 *
 * Four entries are `NOT_A_PRIMITIVE` rows rather than members: `DropZone`, `ImagePathPicker`,
 * `ManagerColorPicker` and `RowDisclosure`. They are here because the routing question is "what
 * does the pattern match", and the pattern matches them — which is precisely the defect issue 1378
 * names, that a directory cannot tell a primitive from a component that merely lives in it. Two of
 * them are dead code and can leave this list by being deleted.
 *
 * Each later primitive extraction in this programme removes its own entry, and the only accepted
 * edit is a REMOVAL. `ModifierPillSelect` left it that way at issue 1458, when its add menu became
 * a `SearchablePopover` and the at-cap trigger treatment it was left holding acquired an override
 * naming the one frame that draws it. `SelectionCheckbox` left it at issue 1373's round 5, when
 * the Tool Studio's prerequisite list gained a frame and with it the `sm` size's only rendering.
 */
const PRIMITIVES_WITH_NO_FRAME = [
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/ManagerModal.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
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
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
];

test('the inputs every property below quantifies over are alive', () => {
  // A guard that stopped looking at anything must not keep reporting success. The nested-file
  // check is what a walk that lost its recursion would fail; a named path is deliberately not
  // used, because deleting that one file would then read as broken recursion and invite a repoint.
  assert.ok(
    RENDER_FILES.length > 100,
    `expected a populated render-file walk, got ${RENDER_FILES.length}`
  );
  assert.ok(
    RENDER_FILES.some((file) => file.split('/').length > 4),
    'the render-file walk reached no nested file, so it is not recursing'
  );
  assert.ok(BROAD_SIGNAL_FILES.length > 0, 'BROAD_SIGNAL_PATTERN matched nothing on disk');
  assert.equal(DESIGN_SYSTEM_PRIMITIVES.length, 46, 'the shipped primitive set changed size');
  assert.equal(NOT_A_PRIMITIVE.length, 11, 'the recorded non-member set changed size');
  assert.ok(RULED_OUT.length > 0, 'the ruled-out register is empty');
  assert.ok(
    PUBLISHING_CASE_IDS.size > 0,
    'no case publishes, so override values cannot be checked'
  );
});

test('BROAD_SIGNAL_PATTERN emits exactly the pinned source', () => {
  assert.equal(
    BROAD_SIGNAL_PATTERN.source,
    EXPECTED_BROAD_SIGNAL_SOURCE,
    'the broad-signal set changed. That is a routing change for every UI PR: widening it takes ' +
      "frames away from the cases that claim a file, narrowing it hands a primitive's evidence " +
      'to whichever cases happen to name its path. Accept it by updating this pin deliberately.'
  );
  assert.equal(BROAD_SIGNAL_PATTERN.source.length, 284);
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

test('(a) the two older overrides still name the frame that renders their state', () => {
  // The DOMAIN is pinned above and the VALUES have to be pinned too, one primitive at a time,
  // because a value is only ever wrong in a way no other assertion can see: repoint an override at
  // a case id that is already in the representative pair and the selection is unchanged, the
  // entry still resolves, and the primitive silently goes back to publishing frames that do not
  // contain it. Measured — repointing `IconPicker` that way survived the whole suite.
  //
  // `Stepper` and `ThresholdBandStrip` are pinned by the test above, and `SearchablePopover`'s two
  // picker ids by `tests/view-lab-cases.test.js` ('the broad SearchablePopover signal captures
  // BOTH of its deliberate picker states'). These two were pinned nowhere. Each expectation names
  // WHY that frame and not another, because that is the fact a future repoint has to argue with.
  const expectations = [
    [
      'src/ui/svelte/components/IconPicker.svelte',
      'manager-system-edit-lists',
      'the one case whose steps click an icon-picker trigger — everything this primitive presents ' +
        'exists only in the open popover, and neither representative frame opens one',
    ],
    [
      'src/ui/svelte/apps/manager/EmptyState.svelte',
      'manager-systems-empty',
      'the frame that draws the dashed empty panel, and the one `docs/help/quickstart.md` Step 1 ' +
        'embeds — both representative frames are POPULATED states',
    ],
    // The `note` variant (issue 1373) released the panel entirely for an empty inside an overlay
    // the product has already bounded — a picker popover. `manager-systems-empty` is a hero panel
    // filling a pane and cannot show it, so the primitive gained a SECOND treatment with no frame
    // rather than a second instance of one it had.
    [
      'src/ui/svelte/apps/manager/EmptyState.svelte',
      'world-tool-entry-on-break-repair-tag-picker-empty',
      'the one frame that draws the `note` variant — every other empty in the corpus is a ' +
        'bordered panel filling a region',
    ],
  ];
  for (const [file, caseId, because] of expectations) {
    assert.ok(
      BROAD_SIGNAL_CASE_OVERRIDES[file].includes(caseId),
      `${file} no longer overrides to '${caseId}', ${because}`
    );
    const selected = mapChangedFilesToCases([file]).map((viewCase) => viewCase.id);
    assert.ok(
      selected.includes(caseId),
      `a ${file} change selected ${JSON.stringify(selected)}, which does not include '${caseId}'`
    );
  }
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

/**
 * The import graph under `src/`, measured once for every clause below.
 *
 * `scripts/lib/componentImporters.js` states the two ways a matcher for this is wrong here — a
 * line-at-a-time scan that misses 11% of the graph, and a whole-file one that spans a docblock into
 * the next statement — and why it compares whole resolved paths and never a basename.
 */
const IMPORTERS = measureImporters(REPO_ROOT);

/** A component this repository is known to import heavily. See the control clause below. */
const POPULATED_CONTROL = 'src/ui/svelte/apps/manager/Chip.svelte';

/** The number words a `why` may spell a caller count with, plus the digits. */
const COUNT_WORDS = new Map([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

/**
 * A caller count stated in prose: a numeral or a number word immediately before `caller`/`callers`.
 *
 * `\s+` rather than `[\s-]+` is deliberate. `two-caller bar` names the RULE, not this row's count,
 * and a hyphen is what distinguishes the two throughout this corpus.
 */
const PROSE_CALLER_COUNT = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+callers?\b/gi;

/** A backticked component path or partial path, as the `why` prose writes one. */
const BACKTICKED_COMPONENT = /`([^`]*\.svelte)`/g;

/**
 * Whether `token` names `file`, anchored on the path separator.
 *
 * The anchor is the whole point and the register records why on its own `DropZone` row: a suffix
 * test without it accepts `DropZone.svelte` for `apps/manager/ItemDropZone.svelte` and credits a
 * dead component with seven importers. This is only ever asked against ONE row's own caller list,
 * so the ambiguity a bare basename would carry across the tree is not reintroduced.
 *
 * @param {string} file repository-relative POSIX path
 * @param {string} token what the prose wrote
 * @returns {boolean}
 */
const namesFile = (file, token) => file === token || file.endsWith(`/${token}`);

test('the importer scan is measuring a populated tree, not silently matching nothing', () => {
  // THE CONTROL, SHIPPED AS A CLAUSE RATHER THAN RUN ONCE BY HAND.
  //
  // Every clause below is satisfied by a scan that returns nothing for everything: zero measured
  // importers equals a `callers: []` row, and the promotion trigger cannot fire on a graph with no
  // edges. A uniformly-empty result reads EXACTLY like a clean tree, and that is not hypothetical —
  // the audit that opened issue 1446 returned zero importers for every row on its first pass,
  // through broken quoting inside the scan, and it was caught only because someone thought to ask
  // the scan about a component they knew had dozens of callers.
  //
  // So that question is asked here, every run. `Chip` is the one this manifest calls "the
  // highest-traffic primitive in the codebase"; the bound is far under its measured count so that
  // ordinary churn does not touch it, and far over anything a broken matcher produces.
  assert.ok(
    IMPORTERS.fileCount > 500,
    `the walk found ${IMPORTERS.fileCount} files under src/, so it is not reaching the tree`
  );
  assert.ok(
    IMPORTERS.importEdgeCount > 1000,
    `the scan resolved ${IMPORTERS.importEdgeCount} import edges across the whole of src/, which ` +
      'is far too few to be this repository. The matcher has stopped matching, and every caller ' +
      'clause below is now green over an empty graph.'
  );
  assert.ok(
    IMPORTERS.importersOf(POPULATED_CONTROL).length >= 20,
    `${POPULATED_CONTROL} measured ${IMPORTERS.importersOf(POPULATED_CONTROL).length} importers. ` +
      'It is the most-imported component in the repository, so a low count here means the scan is ' +
      'broken rather than that the tree changed.'
  );
});

test('(d) every recorded non-member names exactly the callers it has', () => {
  // THE CLAUSE THE REGISTER WAS MISSING, AND THE THREE SHAPES IT CATCHES.
  //
  // The dead-component rows always had their zero-importer claim re-checked, by the disk clause
  // plus PRIMITIVES_WITH_NO_FRAME. The count-justified rows had nothing, and measured at issue
  // 1446 three of them were wrong:
  //
  //   * `InspectorActionButton` had TWO callers and a row that said so, in a table for components
  //     with fewer. It said it was owed a move for two issues and nothing moved it.
  //   * `environment/CompositionList` claimed ONE caller, named `EnvironmentCompositionTab.svelte`
  //     as that caller, and had TWO. No file of that name has ever existed in this repository. The
  //     row was authored the day before it was found and every gate passed on it.
  //   * `recipe-item/RecipeItemLimitsTab` had the right COUNT beside the wrong FILE.
  //
  // Equality against the measurement is what closes all three at once, and it is why the field
  // holds PATHS: a count check alone cannot see the third, and an existence check alone cannot see
  // the third either, because `RecipeItemEditorTabs.svelte` is a real file — just not this one's
  // caller.
  assert.ok(NOT_A_PRIMITIVE.length > 0, 'the non-member table is empty, so this has no domain');
  for (const row of NOT_A_PRIMITIVE) {
    assert.ok(
      Array.isArray(row.callers),
      `${row.path} carries no \`callers\` array. spec.md requirement "The primitive set is a ` +
        'closed, versioned vocabulary" has a candidate below the bar recorded WITH ITS CALLERS ' +
        'NAMED; an absent field is not an empty one, and only one of the two can be checked.'
    );
    for (const caller of row.callers) {
      assert.ok(
        existsSync(path.join(REPO_ROOT, caller)),
        `${row.path} names ${caller} as a caller and no such file exists. That is the phantom ` +
          'this clause was written for: the row read like a decision, the file had never existed, ' +
          'and nothing anywhere resolved the name.'
      );
    }
    assert.deepEqual(
      row.callers,
      IMPORTERS.importersOf(row.path),
      `${row.path} records callers that are not the callers it has. The recorded set is the ` +
        'claim this register exists to let a later reader re-test; the measured set is what the ' +
        'tree says. Correct the row — or, if it has reached two, move it to ' +
        'DESIGN_SYSTEM_PRIMITIVES, which is what two independent callers mean.'
    );
  }
});

test('(d) no recorded non-member has reached the membership bar', () => {
  // The promotion trigger, stated as its own clause rather than left implicit in the equality
  // above. It is the one this register has now missed twice, and it fails with the sentence a
  // reader needs rather than as a mismatched array.
  for (const row of NOT_A_PRIMITIVE) {
    assert.ok(
      row.callers.length < 2,
      `${row.path} is recorded as NOT a primitive and has ${row.callers.length} independent ` +
        `callers: ${row.callers.join(', ')}. spec.md requirement "The primitive set is a closed, ` +
        'versioned vocabulary" puts a candidate into the set at two or more, so this row is owed a ' +
        'move to DESIGN_SYSTEM_PRIMITIVES — with its own `library` adjudication, its own ' +
        '`evidence` derivation, and both table length pins recomputed.'
    );
  }
});

test('(d) every shipped primitive still clears the membership bar', () => {
  // The bar from the member side, which is also the broadest non-vacuity signal in this file: 46
  // independent rows, each measured against the tree. A row that fell to one caller is a primitive
  // whose second adopter was deleted or renamed, and it belongs on NOT_A_PRIMITIVE with the
  // measurement that put it there — the register moves in both directions.
  assert.ok(DESIGN_SYSTEM_PRIMITIVES.length > 0, 'the member table is empty, so this has no domain');
  for (const row of DESIGN_SYSTEM_PRIMITIVES) {
    const measured = IMPORTERS.importersOf(row.path);
    assert.ok(
      measured.length >= 2,
      `${row.path} is a member of the shared primitive set and ${measured.length} file(s) import ` +
        `it: ${JSON.stringify(measured)}. The bar is two or more independent callers.`
    );
    assert.ok(
      !('callers' in row),
      `${row.path} is a member and carries a \`callers\` field. Members are held to the BAR, not ` +
        'to an enumeration — `Chip` has 59 importers and an exact list there would be a manifest ' +
        'edit on every unrelated PR that adds one usage. A half-filled field on some members and ' +
        'not others is the ambiguity this asymmetry is deliberate to avoid.'
    );
  }
});

test('(d) no non-member prose contradicts its measured callers', () => {
  // THE FIELD IS THE AUTHORITY AND THE SENTENCE MUST NOT DISAGREE WITH IT.
  //
  // Adding a structured field does not by itself stop a row being wrong; it relocates where it can
  // be wrong. A row whose `callers` is correct and whose prose still reads "ONE caller,
  // `SomeOtherFile.svelte`" is exactly as misleading as the rows this change repaired, and the
  // repair would look complete. So both directions are asserted: a count spelled in the prose has
  // to agree with the field, and every path in the field has to appear in the prose.
  //
  // WHAT THIS DOES NOT CLOSE, stated rather than implied: the prose may still mention an
  // ADDITIONAL component near its caller claim, and no non-fragile rule distinguishes "and it is a
  // route tab under `RecipeItemEditorTabs`" from a second caller claim. The field is what a reader
  // and every clause above resolve; the prose is a pointer, and it is now a pointer that cannot
  // name a different count or omit a caller.
  for (const row of NOT_A_PRIMITIVE) {
    for (const [, spelling] of row.why.matchAll(PROSE_CALLER_COUNT)) {
      const stated = COUNT_WORDS.get(spelling.toLowerCase()) ?? Number(spelling);
      assert.equal(
        stated,
        row.callers.length,
        `${row.path} writes "${spelling} caller" in its \`why\` and records ` +
          `${row.callers.length} in \`callers\`. One of the two is wrong, and the field is the ` +
          'one the tree was measured against.'
      );
    }
    const namedInProse = [...row.why.matchAll(BACKTICKED_COMPONENT)].map((match) => match[1]);
    for (const caller of row.callers) {
      assert.ok(
        namedInProse.some((token) => namesFile(caller, token)),
        `${row.path} records ${caller} as a caller and its \`why\` never names it. The prose is ` +
          'what a reader acts on, so a caller present only in the data is a caller the next ' +
          'adjudication will not see.'
      );
    }
  }
});

test('(c) the two evidence clauses between them claim every manifest row', () => {
  // WITHOUT THIS, THE TWO CLAUSES BELOW ARE OPT-IN. They select by equality against a literal, so
  // a row reading `evidence: 'targetted'` is in neither and is asserted by nothing — measured, not
  // supposed: that typo on the `RowDisclosure` row, and on the `StatusPill` row, each left the
  // whole suite green. The hole is worst exactly where issue 1378 points, under
  // `src/ui/svelte/components/`, because a row there reaches `BROAD_SIGNAL_PATTERN` through the
  // directory leg and its `evidence` therefore has no other reader anywhere. The manifest is built
  // to grow and every future row hand-types this field, so the partition is asserted rather than
  // trusted. The row counts themselves are pinned in the first test, so this needs no second pin.
  const claimed = new Set([...rowsWithEvidence('broad'), ...rowsWithEvidence('targeted')]);
  const unclaimed = MANIFEST_ROWS.filter((row) => !claimed.has(row)).map(
    (row) => `${row.path} :: evidence ${JSON.stringify(row.evidence)}`
  );
  assert.deepEqual(
    unclaimed,
    [],
    'a manifest row carries an evidence value that is neither broad nor targeted, so both clauses ' +
      'of property (c) skip it and nothing checks the routing its judgement claims.'
  );
  // The sibling clauses below each carry their own non-vacuity guard; this one delegated its to
  // the row-count pin in the first test, which means a hollowed manifest reddens there and never
  // mentions the partition. It carries its own now. What stood here before was an equality
  // between the two filter lengths and the row count, which CANNOT fire: an empty `unclaimed`
  // already means every row carries one of the two values, so the filters partition by
  // construction and the assertion restates its own premise. An assertion that can never fail is
  // the exact thing this file exists to report, so it went rather than sat here looking like a
  // check.
  assert.ok(
    MANIFEST_ROWS.length > 0,
    'the manifest is empty, so this property has no domain and partitions nothing'
  );
});

test("(c) every 'broad' row is matched by BROAD_SIGNAL_PATTERN", () => {
  const broadRows = rowsWithEvidence('broad');
  assert.ok(broadRows.length > 0, "no row carries evidence 'broad', so this property is vacuous");
  for (const row of broadRows) {
    assert.ok(
      BROAD_SIGNAL_PATTERN.test(row.path),
      `${row.path} is recorded as a broad signal and the pattern does not match it, so a change ` +
        'to it routes through case sourceMatches instead of the representative pair. A row under ' +
        'apps/manager/ reaches the pattern only through the derived name alternation, which the ' +
        'pinned source above accepts or rejects as a deliberate edit — including a nested one, ' +
        'since the derivation slices only the apps/manager/ prefix and so emits `checks/Foo` for ' +
        'a nested row, which the alternation does match.'
    );
  }
});

test("(c) no 'targeted' row is matched by BROAD_SIGNAL_PATTERN", () => {
  const targetedRows = rowsWithEvidence('targeted');
  assert.ok(
    targetedRows.length > 0,
    "no row carries evidence 'targeted', so this property is vacuous"
  );
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
  assert.equal(
    claimed.length,
    5,
    `expected the five shared bulk surfaces, got ${JSON.stringify(claimed)}`
  );

  const targetedPaths = new Set(primitivePathsByEvidence('targeted'));
  for (const file of claimed) {
    assert.ok(
      targetedPaths.has(file),
      `${file} is routed to the bulk frames by scripts/ui-pr-screenshot-evidence.mjs but is not ` +
        "an evidence: 'targeted' row in the manifest. The two registries now disagree about " +
        'what evidence a change to it requires: one sends it to named frames, the other to the ' +
        'representative pair.'
    );
  }
});

test('every recorded library name is spelled as library.html spells it', () => {
  // The `library` column and the whole `RULED_OUT` register are hand-typed mirrors of
  // `openspec/specs/design-system/library.html`, and a hand-maintained mirror with nothing
  // checking it rots — which is this change's own thesis, so shipping one unguarded inside it
  // would be self-refuting. `RULED_OUT` is otherwise asserted only to be non-empty, and nothing
  // imports it, so a name invented there would sit in a register the module calls "part of the
  // specification, not commentary" with nothing able to disagree.
  //
  // `library.html` is the only usable anchor. Measured: all ten `<Name>` values appear there, and
  // NONE appears in `spec.md`, which states the same ten judgements in prose ("a member row", "an
  // actor picker") — so anchoring on `spec.md` would produce a guard satisfiable only by rewriting
  // the specification.
  //
  // This is a SPELLING guard only — it proves the name exists there, not that the shipped
  // component conforms to that entry, nor that the verdict recorded beside it is the verdict
  // `library.html` records. The conformance gate that reads the library structurally is the next
  // change in this programme.
  const library = readFileSync(
    path.join(REPO_ROOT, 'openspec/specs/design-system/library.html'),
    'utf8'
  );
  const spelled = (name) => name.replace('<', '&lt;').replace('>', '&gt;');

  const named = MANIFEST_ROWS.filter((row) => row.library !== null);
  assert.ok(named.length > 0, 'no row records a library name, so this property has no domain');
  for (const row of named) {
    assert.ok(
      library.includes(spelled(row.library)),
      `${row.path} records library entry ${row.library}, which library.html does not contain`
    );
  }

  assert.ok(RULED_OUT.length > 0, 'the ruled-out register is empty, so this half has no domain');
  for (const entry of RULED_OUT) {
    assert.ok(
      library.includes(spelled(entry.name)),
      `the ruled-out register names ${entry.name}, which library.html does not contain. That ` +
        'register mirrors the declined candidates the capability records; a name only this file ' +
        'has is a decision the specification never made.'
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
