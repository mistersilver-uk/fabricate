/**
 * Integrity properties over the design-system manifest and the two registries derived from it
 * (issue 1116).
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
import {
  KNOWN_UNREGISTERED_SHARED_COMPONENTS,
  KNOWN_UNREGISTERED_SHARED_COMPONENT_TOTAL,
} from './components/design-system-known-debt.js';
import { assertRatchet, tallyByKey } from './helpers/ratchetBaseline.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The roots a diff can name that `BROAD_SIGNAL_PATTERN` can match. */
const RENDER_ROOTS = ['src', 'styles'];

/**
 * Every file under {@link RENDER_ROOTS}, as repository-relative POSIX paths.
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
 * Rows carrying a given evidence judgement, across BOTH manifest arrays. SELECTS BY EQUALITY, which
 * is why the partition property below exists.
 */
const rowsWithEvidence = (evidence) => MANIFEST_ROWS.filter((row) => row.evidence === evidence);

/** Case ids that actually publish a frame. An override naming anything else is inert. */
const PUBLISHING_CASE_IDS = new Set(
  VIEW_LAB_CASES.filter((viewCase) => viewCase.publish).map((viewCase) => viewCase.id)
);

/** The V8-escaped source of `BROAD_SIGNAL_PATTERN`, verbatim. */
const EXPECTED_BROAD_SIGNAL_SOURCE = String.raw`^styles\/|^src\/ui\/svelte\/components\/|^src\/ui\/theme\.js$|^src\/ui\/svelte\/apps\/manager\/(ExplainerCard|IconFactRow|ManagerModal)\.svelte$`;

/**
 * The keys `BROAD_SIGNAL_CASE_OVERRIDES` carries — the DOMAIN, pinned separately from the entries.
 */
const EXPECTED_OVERRIDE_KEYS = [
  // Issue 1477: the shared overflow action menu. Its entry names the one published frame that
  // OPENS a menu, which is the only state in which the primitive is visible at all.
  'src/ui/svelte/components/ActionMenu.svelte',
  // Issue 1506: an actor's portrait, and the FIRST key this list gains by a primitive ARRIVING.
  'src/ui/svelte/components/Avatar.svelte',
  // Issue 1505: the widened standing statement, the FIRST entry whose primitive earned its frames by
  // re-authoring rather than by a new state, and — with `EmptyState` — moved here by issue 1710.
  'src/ui/svelte/components/Callout.svelte',
  // Issue 1508: the percentage slider, and the second key gained by a family being RE-ROOTED rather
  // than by a component arriving or acquiring a state.
  'src/ui/svelte/components/ChanceSlider.svelte',
  // Issue 1509: the editor tab strip, and the third key gained by neither of the two routes above —
  // the component did not acquire a state and it did not arrive.
  'src/ui/svelte/components/ChoiceOptionList.svelte',
  'src/ui/svelte/components/EditorTabs.svelte',
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  'src/ui/svelte/components/EmptyState.svelte',
  // The player window's shared top bar was here until issue 1500, and its ABSENCE is the point.
  'src/ui/svelte/components/EssencePool.svelte',
  'src/ui/svelte/components/EssenceSourceSelector.svelte',
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/InspectorCard.svelte',
  'src/ui/svelte/components/ItemDropZone.svelte',
  // Issue 1505: the uppercase micro-label, on sixteen converted eyebrow sites.
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/ListRow.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  // Issue 1506: the app's ONE art tile, after it absorbed both crafting thumbnails. ONE frame,
  // because one STATE is what neither representative frame reaches: a TINTED glyph-chip tile.
  'src/ui/svelte/components/Medallion.svelte',
  // Issue 1458: the pill multi-select's add menu became a `SearchablePopover`, which left the
  // component exactly one painted rule of its own — the at-cap trigger treatment — and that rule
  // had to be re-anchored through `:global()` because the button is the primitive's element now.
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  // Issue 1505: the surface that reports something that just happened.
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/components/OutcomeLadder.svelte',
  'src/ui/svelte/components/RadioCardGroup.svelte',
  // THE searchable picker. This list is compared against `Object.keys(...).sort()`, so the entry
  // sits here rather than four lines up because issue 1500 moved the file from
  // `apps/manager/SearchablePopover.svelte` into `components/` — which changes nothing about the
  // override itself and everything about where it sorts.
  'src/ui/svelte/components/RunActionBar.svelte',
  'src/ui/svelte/components/RunProgress.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
  // Issue 1719: the picker's portaled panel, extracted as an INTERNAL PART of the entry above. It
  // sorts immediately after its parent, which is the whole reason the part is named for the part
  // rather than for a new piece of vocabulary. Its entry names SEVENTEEN frames against the
  // parent's ten, because every caller that opens a panel draws this file and only this file.
  'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  // Issue 1504: the app's own select.
  'src/ui/svelte/components/Select.svelte',
  // Issue 1373, round 5: the box's `sm` SIZE has one caller — the Tool Studio's prerequisite row
  // — and neither representative frame draws it. Its override names the one frame that does.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  // Issue 1505: the at-a-glance figure. It sorts HERE rather than after `StatusToggle` because this
  // list is compared against `Object.keys(...).sort()` and `'B'` < `'u'`.
  'src/ui/svelte/components/SlotRow.svelte',
  'src/ui/svelte/components/SlotTile.svelte',
  'src/ui/svelte/components/StageCard.svelte',
  'src/ui/svelte/components/StageNav.svelte',
  'src/ui/svelte/components/StatBox.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
  'src/ui/svelte/components/ToggleCard.svelte',
  // Issue 1515: THE SHEET, and the first key here that is not a component path. It sorts last
  // because this list is compared against `Object.keys(...).sort()` and `'src/'` < `'styles/'`.
  'src/ui/svelte/components/WorldClockChip.svelte',
  'src/ui/svelte/components/YieldScale.svelte',
  'styles/fabricate.css',
];

/**
 * Every `sourceMatches` pattern that names a file `BROAD_SIGNAL_PATTERN` also matches, as `<case
 * id> :: <pattern source>` (issue 1509).
 */
const BROAD_SHADOWED_SOURCE_MATCHES = [
  String.raw`coverage-theme-light-manager :: ^src\/ui\/theme\.js$`,
  String.raw`coverage-theme-light-manager :: ^styles\/fabricate\.css$`,
  String.raw`coverage-theme-light-player :: ^src\/ui\/theme\.js$`,
  String.raw`coverage-theme-light-player :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-chrome :: ^src\/ui\/svelte\/components\/Chip\.svelte$`,
  String.raw`manager-world-downtime-test-companion-chrome :: ^src\/ui\/svelte\/components\/Medallion\.svelte$`,
  String.raw`manager-world-downtime-test-companion-chrome :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-installed :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-rollup :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-downtime-test-companion-tab-navigation :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-parties-card-stacked-680 :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-parties-last-page :: ^src\/ui\/svelte\/components\/Pagination\.svelte$`,
  String.raw`manager-world-parties-stacked :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-default-collapsed :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-expanded-neutral :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-long-label-focus :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-ungated :: ^styles\/fabricate\.css$`,
  String.raw`manager-world-travel-with-gathering-expanded :: ^styles\/fabricate\.css$`,
];

/**
 * Broad-signal components that no frame in the registry renders. Each later primitive extraction in
 * this programme removes its own entry; the only accepted edits are a REMOVAL (issue 1116) and a
 * RE-KEY between the two primitive directories, which holds the length (issue 1710).
 */
const PRIMITIVES_WITH_NO_FRAME = [
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/ManagerModal.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/ManagerColorPicker.svelte',
  'src/ui/svelte/components/ManagerColorPopover.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/SegmentedControl.svelte',
];

test('the inputs every property below quantifies over are alive', () => {
  // A guard that stopped looking at anything must not keep reporting success.
  assert.ok(
    RENDER_FILES.length > 100,
    `expected a populated render-file walk, got ${RENDER_FILES.length}`
  );
  assert.ok(
    RENDER_FILES.some((file) => file.split('/').length > 4),
    'the render-file walk reached no nested file, so it is not recursing'
  );
  assert.ok(BROAD_SIGNAL_FILES.length > 0, 'BROAD_SIGNAL_PATTERN matched nothing on disk');
  // 48 as of issue 1392, which promoted `apps/manager/VocabularyPanel.svelte`: the World Vocabulary
  // screen is its second independent caller, and property (e) below reported it as a component that
  // had crossed the membership bar with nobody adjudicating it.
  assert.equal(DESIGN_SYSTEM_PRIMITIVES.length, 59, 'the shipped primitive set changed size');
  assert.equal(NOT_A_PRIMITIVE.length, 17, 'the recorded non-member set changed size');
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
  assert.equal(BROAD_SIGNAL_PATTERN.source.length, 144);
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

  // Containment, not equality: the shipped selectors are scoped ('.fabricate-manager
  // [data-band-strip-band]'), so an equality criterion would fail a correct implementation.
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
  // a case id that is already in the representative pair and the selection is unchanged, the entry
  // still resolves, and the primitive silently goes back to publishing frames that do not contain
  // it.
  const expectations = [
    [
      'src/ui/svelte/components/IconPicker.svelte',
      'manager-system-edit-lists',
      'the one case whose steps click an icon-picker trigger — everything this primitive presents ' +
        'exists only in the open popover, and neither representative frame opens one',
    ],
    [
      'src/ui/svelte/components/EmptyState.svelte',
      'manager-systems-empty',
      'the frame that draws the dashed empty panel, and the one `docs/help/quickstart.md` Step 1 ' +
        'embeds — both representative frames are POPULATED states',
    ],
    // The `note` variant (issue 1373) released the panel entirely for an empty inside an overlay
    // the product has already bounded — a picker popover.
    [
      'src/ui/svelte/components/EmptyState.svelte',
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
  // REPRESENTATIVE_CASE_IDS; these are additive, narrowly named exceptions") (issue 1116).
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

/** The import graph under `src/`, measured once for every clause below. */
const IMPORTERS = measureImporters(REPO_ROOT);

/** A component this repository is known to import heavily. See the control clause below. */
const POPULATED_CONTROL = 'src/ui/svelte/components/Chip.svelte';

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
 */
const PROSE_CALLER_COUNT =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+callers?\b/gi;

/** A backticked component path or partial path, as the `why` prose writes one. */
const BACKTICKED_COMPONENT = /`([^`]*\.svelte)`/g;

/**
 * Whether `token` names `file`, anchored on the path separator.
 *
 * The anchor is the whole point: a suffix test without it accepts `Chip.svelte` for
 * `manager/components/EssenceChip.svelte` and credits one component with another's importers.
 * This is only ever asked against ONE row's own caller list, so the ambiguity a bare basename
 * would carry across the tree is not reintroduced.
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
  // above.
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
  // independent rows, each measured against the tree.
  assert.ok(
    DESIGN_SYSTEM_PRIMITIVES.length > 0,
    'the member table is empty, so this has no domain'
  );
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
  // WITHOUT THIS, THE TWO CLAUSES BELOW ARE OPT-IN (issue 1378).
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
  // The sibling clauses below each carry their own non-vacuity guard; this one delegated its to the
  // row-count pin in the first test, which means a hollowed manifest reddens there and never
  // mentions the partition.
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
  // copies agreed.
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
  // Four since issue 1371 r16-list: `BulkEditSelect` is the Recipe Studio's alone and is routed
  // to the recipe frames by its own pattern rather than by the shared one.
  assert.equal(
    claimed.length,
    4,
    `expected the four shared bulk surfaces, got ${JSON.stringify(claimed)}`
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
  // `openspec/specs/design-system/library.html`, and a hand-maintained mirror with nothing checking
  // it rots — which is this change's own thesis, so shipping one unguarded inside it would be
  // self-refuting.
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

/* ── (e) the closed vocabulary is closed over the WHOLE UI tree, not one directory ────────── */

/** The UI root every shared Svelte component lives under. */
const UI_ROOT = 'src/ui/svelte/';

/** The flat directory the primitive set has been read as being about. */
const PRIMITIVE_DIRECTORY = 'src/ui/svelte/components/';

/** The bar `spec.md` sets for membership: two or more independent callers. */
const MEMBERSHIP_BAR = 2;

/**
 * Every `.svelte` outside `components/` that clears the membership bar and has no manifest row. The
 * register below is therefore the EXCLUSION MECHANISM rather than a list of offenders (issue 1481).
 */
function unregisteredSharedComponents() {
  const registered = new Set(MANIFEST_ROWS.map((row) => row.path));
  return RENDER_FILES.filter(
    (file) =>
      file.startsWith(UI_ROOT) &&
      file.endsWith('.svelte') &&
      !file.startsWith(PRIMITIVE_DIRECTORY) &&
      !registered.has(file) &&
      IMPORTERS.importersOf(file).length >= MEMBERSHIP_BAR
  );
}

test('(e) the register of unadjudicated shared components is exactly what is recorded', () => {
  const domain = RENDER_FILES.filter(
    (file) =>
      file.startsWith(UI_ROOT) &&
      file.endsWith('.svelte') &&
      !file.startsWith(PRIMITIVE_DIRECTORY) &&
      IMPORTERS.importersOf(file).length >= MEMBERSHIP_BAR
  );

  // Non-vacuity in the direction that matters.
  assert.ok(
    domain.length >= 50,
    `only ${domain.length} components outside ${PRIMITIVE_DIRECTORY} clear the ${MEMBERSHIP_BAR}-` +
      'caller bar, against the 65 this tree holds. With none, the register is empty and this ' +
      'property is satisfied by a broken scan.'
  );
  assert.ok(
    domain.some((file) => MANIFEST_ROWS.some((row) => row.path === file)),
    'no component outside the primitive directory carries a manifest row, so the exclusion ' +
      'mechanism this register relies on is not being exercised by the tree at all'
  );

  assertRatchet({
    label: 'shared components outside components/ with no manifest row',
    baseline: KNOWN_UNREGISTERED_SHARED_COMPONENTS,
    pinnedTotal: KNOWN_UNREGISTERED_SHARED_COMPONENT_TOTAL,
    observed: tallyByKey(unregisteredSharedComponents(), (file) => file),
    scanned: IMPORTERS.fileCount,
    floor: 500,
    guidance:
      'A component with two or more independent callers is a candidate for the shared vocabulary, ' +
      'wherever it lives — see the "primitive set is a closed, versioned vocabulary" requirement ' +
      'in `openspec/specs/design-system/spec.md`, which sets the bar by CALLER COUNT and not by ' +
      'directory. A name arriving here means one more component crossed the bar without anyone ' +
      'deciding: either promote it, with its `library` adjudication and its `evidence` ' +
      'derivation, or record it on `notAPrimitive` with the measurement that put it there. A name ' +
      'LEAVING here without a manifest row means it dropped below the bar, which is worth a ' +
      'sentence of its own.',
  });
});

test('(e) every registered path is a real, unadjudicated component', () => {
  // THE MIRROR GUARD. A register keyed on a path rots the moment a file is renamed, and
  // `assertRatchet` would report that as VANISHED — correct, but in the language of counts rather
  // than of the mistake.
  const onDisk = new Set(RENDER_FILES);
  const registered = new Set(MANIFEST_ROWS.map((row) => row.path));
  const paths = KNOWN_UNREGISTERED_SHARED_COMPONENTS.map((row) => row.key);

  assert.deepEqual(
    paths.filter((file) => !onDisk.has(file)),
    [],
    'a register row names a file that is not on disk. A renamed component leaves a row that can ' +
      'never match anything, and the next author reads it as a component nobody has adjudicated ' +
      'when in fact nobody can find it.'
  );
  assert.deepEqual(
    paths.filter((file) => registered.has(file)),
    [],
    'a register row names a component that now HAS a manifest row. That is the register working ' +
      '— the component was adjudicated — and the row should have been deleted by the change that ' +
      'adjudicated it, with the pinned total lowered to match.'
  );
  assert.deepEqual(
    paths.filter((file) => file.startsWith(PRIMITIVE_DIRECTORY)),
    [],
    `a register row names a file under ${PRIMITIVE_DIRECTORY}, which is outside this property's ` +
      'domain entirely — those are covered by the manifest clauses above, and a row here would be ' +
      'checked by nothing while looking checked'
  );
});

test('(e) exactly one shared member row still lives outside the primitive directory', () => {
  assert.deepEqual(
    MANIFEST_ROWS.filter(
      (row) => row.scope === 'shared' && !row.path.startsWith(PRIMITIVE_DIRECTORY)
    ).map((row) => row.path),
    ['src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte'],
    'the design-system spec names this set; a promotion or a new shared row outside ' +
      `${PRIMITIVE_DIRECTORY} must update that sentence with it`
  );
});

const APP_DIRECTORY = 'src/ui/svelte/apps/';

test('(f) no file under components/ imports from the application tree', () => {
  // The dependency graph inverted rather than a source pin: `importersOf` is measured, so this adds
  // no `tests/source-pin-ledger.txt` row and no specifier's spelling can satisfy it.
  const appRenderFiles = RENDER_FILES.filter((file) => file.startsWith(APP_DIRECTORY));
  assert.ok(
    appRenderFiles.length >= 200,
    `only ${appRenderFiles.length} files walked under ${APP_DIRECTORY}, against the 333 this tree ` +
      'holds. With none, the property below is satisfied by a broken walk.'
  );

  const inversions = appRenderFiles
    .flatMap((file) =>
      IMPORTERS.importersOf(file)
        .filter((importer) => importer.startsWith(PRIMITIVE_DIRECTORY))
        .map((importer) => `${importer} imports ${file}`)
    )
    .sort();

  assert.deepEqual(
    inversions,
    [],
    'a shared primitive imports from the application tree. The set is the layer every application ' +
      'depends on, so an edge in this direction makes one primitive unusable without the manager ' +
      'and reverses the dependency the `design-system` capability specifies. Move the imported ' +
      'file into the primitive directory, or take the dependency out of the primitive.'
  );
});
