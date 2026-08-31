/**
 * The coverage gate over the design system's two halves.
 *
 * `openspec/specs/design-system/spec.md` says the shared primitive set is the set the library
 * enumerates, and `AGENTS.md` prohibits adding a component under `src/ui/svelte/components/`
 * without recording it. Until this file existed, nothing read the enumeration: the vocabulary lived
 * in `library.html` as names inside 30 of its 50 `div.spec-head > h4` headings, and the only reader
 * was a whole-file `includes()` in `tests/design-system-primitives.test.js` that cannot tell an
 * ENTRY from a CITATION — a manifest row naming a RULED-OUT primitive passed it.
 *
 * This is issue 1116's defect class in the specification layer: unreachable configuration looks
 * identical to working configuration. A rule binding on an enumeration nothing can read is
 * indistinguishable from a rule being followed.
 *
 * WHAT THE TWO HALVES EACH CARRY
 * ------------------------------
 * The library specimen carries purpose, geometry and API — what a reader needs rendered. The
 * manifest row carries the implementation path and the caller count — what a gate needs to check.
 * Neither is a subset of the other, so the gate below is a correspondence and not a copy: every
 * name the library enumerates is either recorded as shipped in the manifest or recorded here as
 * specified-but-unbuilt, and every name the manifest records resolves to a library entry.
 *
 * WHY THE UNBUILT NAMES ARE A REGISTER HERE AND NOT `path: null` MANIFEST ROWS
 * ---------------------------------------------------------------------------
 * The obvious move is to fill the manifest's empty quadrant with rows carrying a null path. It
 * collides with four properties issue 1378 shipped, two of them silently:
 * `tests/design-system-primitives.test.js:415-422` joins the path against the repo root and
 * `path.join(root, null)` THROWS rather than failing as an assertion; `:474-491` asserts no
 * `targeted` row matches `BROAD_SIGNAL_PATTERN`, and `BROAD_SIGNAL_PATTERN.test(null)` coerces to
 * the string `"null"` and returns false, so 38 null-path rows would pass silently while inflating
 * that property's domain from ~20 real rows to ~59; `:425-457` demands every row carry an
 * `evidence` judgement, which a row with no file has no routing to record; and `:264` pins the row
 * count at 38. A register of names collides with none of them and says what it means.
 *
 * WHY THE HAND-TYPED LISTS BELOW CARRY LENGTH PINS
 * ------------------------------------------------
 * Two of them — the non-primitive heading census and the cited-without-entry residue — are checked
 * by membership rather than only by equality, and membership alone makes the cheapest repair an
 * append. A new `<h4>Toggle</h4>` greens by adding `Toggle` to the census list, which is the exact
 * drift the census exists to catch. The pin makes that repair a deliberate, reviewable edit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_SYSTEM_PRIMITIVES,
  NOT_A_PRIMITIVE,
  RULED_OUT,
} from '../scripts/lib/designSystemPrimitives.js';
import { listSvelteComponents, toRepositoryPaths } from '../scripts/lib/svelteComponentFiles.js';

import { parseDesignLibrary, primitiveNamesIn, readDesignLibrary } from './helpers/designLibrary.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Order two strings by code point, ascending.
 *
 * Explicit rather than a bare `sort()`, for the reason `scripts/lib/svelteComponentFiles.js`
 * records beside its own copy: `localeCompare` is locale-dependent, so two machines could order
 * the registers below differently and disagree about a set they both measured correctly.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
const byCodePoint = (left, right) => (left < right ? -1 : Number(left > right));

const librarySource = readDesignLibrary();
const library = parseDesignLibrary(librarySource);

/** Every manifest row, members and recorded non-members alike. */
const MANIFEST_ROWS = [...DESIGN_SYSTEM_PRIMITIVES, ...NOT_A_PRIMITIVE];

/** Manifest `library` values are written with their brackets (`'<Stepper>'`); entries are not. */
const MANIFEST_NAMES = MANIFEST_ROWS.filter((row) => row.library !== null).map((row) =>
  row.library.slice(1, -1)
);

/**
 * The nine name-shaped ruled-out candidates, DERIVED rather than re-typed.
 *
 * `RULED_OUT` holds ten entries and the tenth, `Destructive panel`, is prose rather than a
 * component name — running the same name pattern over the register picks the distinction up
 * without anyone having to remember it.
 */
const RULED_OUT_NAMES = RULED_OUT.flatMap((entry) => primitiveNamesIn(entry.name));

/** Every shipped component's basename, without the extension. */
const SHIPPED_COMPONENT_NAMES = new Set(
  toRepositoryPaths(REPO_ROOT, listSvelteComponents(path.join(REPO_ROOT, 'src'))).map((file) =>
    path.basename(file, '.svelte')
  )
);

test('the corpus every property below quantifies over is alive', () => {
  assert.ok(library.blockCount > 0, 'the parser found no spec-head block; the anchor is dead');
  assert.ok(MANIFEST_ROWS.length > 0, 'the manifest is empty, so every comparison is vacuous');
  assert.equal(
    RULED_OUT_NAMES.length,
    9,
    'the name-shaped ruled-out register changed size; it is the subtrahend in the residue check ' +
      'below, so a silent change there silently changes what counts as an orphan citation'
  );
  assert.ok(
    SHIPPED_COMPONENT_NAMES.size > 50,
    `the component walk found ${SHIPPED_COMPONENT_NAMES.size} files, so it is not walking`
  );
});

test('the library has the exact structure the parser assumes', () => {
  // EXACT rather than floors. Every one of these is a fact about a hand-authored file that the
  // properties below read as if it were a database, and each moves only when someone edits that
  // file — at which point the edit should be accepted deliberately rather than absorbed.
  assert.equal(library.blockCount, 50, 'spec-head block count');
  assert.equal(
    library.headingCount,
    50,
    'the one-heading-per-block relation broke: a block with two h4s double-counts its entry, and ' +
      'a block with none drops it out of the set entirely'
  );
  assert.equal(library.names.length, 58, 'distinct primitive names');
  assert.equal(
    library.nameOccurrences,
    58,
    'occurrences no longer equal distinct names, so one primitive is now named by two entries ' +
      'and the set has a duplicate'
  );
  assert.equal(library.headings.length - library.nonPrimitiveHeadings.length, 30, 'naming blocks');
  assert.equal(library.nonPrimitiveHeadings.length, 20, 'section-prose blocks');

  // The only pair that pins the ANCHOR as narrower than a file-wide scan. If the parser were ever
  // widened to the whole file these two would collapse to 69 and 0, and every set comparison below
  // would quietly start counting the ruled-out register as part of the vocabulary.
  assert.equal(library.fileWideNames.length, 69, 'file-wide primitive-shaped names');
  assert.equal(library.namesOutsideHeadings.length, 11, 'names outside every spec-head heading');
});

/**
 * The 20 `div.spec-head > h4` headings that name no primitive: section prose, pinned by exact
 * decoded text.
 *
 * Encoding: DECODED, which is what `tests/helpers/designLibrary.js` yields and why. The corpus
 * mixes three spellings — three of these carry entities (`&amp;`, `&mdash;`) and four carry a raw
 * U+00B7 — so pinning raw markup would pin an inconsistency and would red on a pure re-escaping
 * that changes nothing a reader sees.
 */
const NON_PRIMITIVE_HEADINGS = [
  'The five rules that keep screens consistent',
  'Depth & interaction',
  'Entity tints',
  'The drop-rate ramp',
  'The ladder',
  'Spacing scale',
  'Radius & control height',
  'Elevation',
  'The state set',
  'Hit targets, naming, announcement',
  'The mark vocabulary',
  'The two sets',
  'Routed by ingredients',
  'Routed by check',
  'Simple and alchemy — the reserved failure set',
  'What each mode allows',
  'A · Browse screen',
  'B · Editor screen',
  'C · Player screen',
  'D · Validation screen',
];

test('every spec-head heading either names a primitive or is recorded as section prose', () => {
  const unaccounted = library.nonPrimitiveHeadings.filter(
    (heading) => !NON_PRIMITIVE_HEADINGS.includes(heading)
  );
  assert.deepEqual(
    unaccounted,
    [],
    'a spec-head heading names no primitive and is not recorded as prose. Either it is an entry ' +
      'whose name is not written `&lt;Name&gt;` — in which case the set silently lost a member — ' +
      'or it is a new section, which is an edit to record here.'
  );
});

test('every recorded section-prose heading is still in the library', () => {
  // THE ANTI-VACUITY ANCHOR. The clause above is "yields a name or is listed", which is vacuously
  // true over zero headings: rename the `spec-head` class and it passes while the parser sees
  // nothing. This is the only clause that reds on that.
  const present = new Set(library.headings);
  for (const heading of NON_PRIMITIVE_HEADINGS) {
    assert.ok(present.has(heading), `no spec-head heading reads ${JSON.stringify(heading)}`);
  }
});

test('the section-prose register is pinned at its measured size and holds no primitive name', () => {
  assert.equal(
    NON_PRIMITIVE_HEADINGS.length,
    20,
    'without this pin the cheapest way to green a new `<h4>Toggle</h4>` is to append `Toggle` ' +
      'here, which is the drift the census exists to catch'
  );
  const names = new Set([...library.names, ...MANIFEST_NAMES, ...RULED_OUT_NAMES]);
  for (const heading of NON_PRIMITIVE_HEADINGS) {
    assert.ok(
      !names.has(heading),
      `${JSON.stringify(heading)} is recorded as section prose and is also a primitive name. A ` +
        'heading is prose or it is an entry; recording an entry as prose exempts it from every ' +
        'correspondence below.'
    );
  }
});

test('every manifest library name resolves to a library entry', () => {
  assert.ok(MANIFEST_NAMES.length > 0, 'no row records a library name, so this has no domain');
  const ruledOut = new Set(RULED_OUT_NAMES);
  const entries = new Set(library.names);
  const namedRows = MANIFEST_ROWS.filter((candidate) => candidate.library !== null);
  for (const row of namedRows) {
    const name = row.library.slice(1, -1);
    assert.ok(
      !ruledOut.has(name),
      `${row.path} records library entry ${row.library}, which the ruled-out register DECLINED. ` +
        'The existing whole-file spelling guard admits this, because a declined candidate is ' +
        'written in the library in the same notation as an entry.'
    );
    assert.ok(
      entries.has(name),
      `${row.path} records library entry ${row.library}, which is no spec-head heading. The ` +
        'correspondence points at nothing, so the row claims a specification it does not have.'
    );
  }
});

/**
 * The 38 library entries with no shipped implementation.
 *
 * Not a debt list to be paid down in one change and not a ceiling: it is the specified-but-unbuilt
 * quadrant of the conformance question, and it moves in BOTH directions — down when a primitive is
 * built and gains a manifest row, up when the library specifies a new one. Either way the edit is
 * the same size as the change that caused it.
 */
const SPECIFIED_ONLY = [
  'AppRail', 'AppTitleBar', 'Avatar', 'BandedBar', 'BrowseCard',
  'Card', 'ChoiceGroup', 'DataTable', 'Field', 'FilterBar',
  'IconButton', 'InfoStrip', 'Kicker', 'ListRow', 'LogList',
  'Menu', 'Meter', 'NavSidebar', 'Notice', 'PageHeader',
  'PickerRow', 'Rail', 'RequirementChooser', 'RuleRow', 'RuleSentence',
  'Search', 'Select', 'SetPicker', 'SortableList', 'StageBars',
  'StatBox', 'TierTrack', 'Toggle', 'ValidationList', 'ValidationSummary',
  'ViewToggle', 'Well', 'XrefList',
];

test('every library entry is either recorded as shipped or recorded as unbuilt', () => {
  const shipped = new Set(MANIFEST_NAMES);
  assert.deepEqual(
    library.names.filter((name) => !shipped.has(name)),
    SPECIFIED_ONLY,
    'the specified-but-unbuilt set changed. This is the direction that catches a primitive ' +
      'shipping without its manifest row: the name stays in this register, and the register no ' +
      'longer matches what the two artifacts say.'
  );
  assert.deepEqual(
    SPECIFIED_ONLY.filter((name) => shipped.has(name)),
    [],
    'a name is recorded as unbuilt and also carries a manifest row naming a file'
  );
});

/**
 * The 24 shipped rows the library does not name.
 *
 * Pinned by EQUALITY rather than as a ceiling, for the reason
 * `tests/design-system-primitives.test.js` records for its own baselines: a ceiling loosens by one
 * slot every time debt is paid, and it permits a net-zero swap — document one, undocument another,
 * and the count never moves.
 */
const UNDOCUMENTED_ROWS = [
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
  'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  'src/ui/svelte/apps/manager/ResolutionModeCard.svelte',
  'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  'src/ui/svelte/components/ActorSelectTopBar.svelte',
  'src/ui/svelte/components/ChanceSlider.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
  'src/ui/svelte/components/DropZone.svelte',
  'src/ui/svelte/components/EssenceSourceSelector.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/ManagerColorPicker.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
];

test('the shipped rows the library does not name are exactly the known set', () => {
  assert.deepEqual(
    MANIFEST_ROWS.filter((row) => row.library === null)
      .map((row) => row.path)
      .sort(byCodePoint),
    UNDOCUMENTED_ROWS,
    'the undocumented shipped set changed. Adding one is a new undocumented primitive; removing ' +
      'one means a library entry was written for it, which is the direction this list should move.'
  );
});

/**
 * Primitives the library CITES normatively without giving them an entry.
 *
 * This register is what the residue check compares against, and it closes the defect CLASS rather
 * than today's two instances: a third orphan citation added later reds here instead of shipping
 * silently. Writing the missing specimens is design work with its own review, so the register
 * records the debt and section 16 of the library points a reader at it.
 */
const CITED_WITHOUT_ENTRY = [
  {
    name: 'Locked',
    why:
      'Cited at `library.html:642` and `:852` as the route a disabled option takes, carrying a ' +
      'required `reason`. Both citations are library prose describing a specimen; `spec.md` ' +
      'commits to no clause naming it, so this is a loose citation with a missing entry.',
  },
  {
    name: 'RoutingOverview',
    why:
      'Cited at `library.html:1576` and `:1588` as the element two specimens render. NOT a loose ' +
      'citation: spec.md requirement "Sets and groups are the container layer above the row" ' +
      'already MANDATES the surface — "The routing is authored in TWO surfaces" and "A ROUTING ' +
      'OVERVIEW lists every source with the set it produces". This is a bound requirement whose ' +
      'specimen has no entry of its own.',
  },
];

test('every primitive name in the library is an entry, a declined candidate, or a recorded debt', () => {
  // The length pin runs FIRST, deliberately. The equality below would also red on an append, but
  // it would report a set difference; the pin reports that the register grew, which is the fact a
  // reviewer has to accept.
  assert.equal(
    CITED_WITHOUT_ENTRY.length,
    2,
    'the cited-without-entry register is pinned for the same reason the heading census is: ' +
      'without it the cheapest repair available to the next author is a one-token append'
  );
  for (const entry of CITED_WITHOUT_ENTRY) {
    assert.ok(entry.why.length > 0, `${entry.name} is recorded with no reason`);
  }
  // Set equality never mentions these: they are not spec-head names, so they are in neither side
  // of it. The residue is the only property that can see them at all.
  assert.deepEqual(
    library.namesOutsideHeadings.filter((name) => !RULED_OUT_NAMES.includes(name)),
    CITED_WITHOUT_ENTRY.map((entry) => entry.name),
    'the library names a primitive outside every spec-head heading, and that name is neither a ' +
      'declined candidate nor a recorded debt. A reader following the citation finds nothing.'
  );
});

test('every component the library cites by filename still exists', () => {
  const citations = [...librarySource.matchAll(/[A-Za-z][A-Za-z0-9]*\.svelte/g)].map(
    (match) => match[0]
  );
  const cited = [...new Set(citations)].sort(byCodePoint);
  assert.ok(cited.length > 20, `the library cites ${cited.length} components, so it stopped citing`);
  for (const file of cited) {
    assert.ok(
      SHIPPED_COMPONENT_NAMES.has(path.basename(file, '.svelte')),
      `library.html cites ${file}, which no longer exists under src/. Every one of these is ` +
        'evidence for a stated geometry or a recorded migration; a renamed file leaves the claim ' +
        'standing with nothing behind it.'
    );
  }
});

/**
 * A citation of a `spec.md` requirement, written as the words `spec.md requirement` followed by the
 * heading in double quotes.
 *
 * The notation exists because the alternative rotted inside this very change. Amending `spec.md`
 * added six lines above the vocabulary requirement, and that shifted every `spec.md:NNN` citation in
 * `scripts/lib/designSystemPrimitives.js`, in this file and in `library.html` section 16 onto prose
 * that says something else — including the one sentence that carries the whole distinction between
 * a BOUND requirement and a loose citation. A line number cannot be resolved by anything, so nothing
 * reported it; a heading can be, and the property below does.
 */
const REQUIREMENT_CITATION = /spec\.md requirement "([^"]+)"/g;

/**
 * Collapse a JSDoc line break — newline, optional `*` gutter, indentation — into a single space.
 *
 * Without this the notation would carry a hidden formatting rule: a heading that happened to wrap
 * across two comment lines would read correctly and match nothing, so the guard below would be
 * strictest exactly where prose is longest. The first draft of this change hit that on its own
 * first run.
 *
 * @param {string} prose
 * @returns {string} the same prose on one line
 */
const unwrapped = (prose) => prose.replaceAll(/\n\s*\*?\s*/g, ' ');

/** `### Requirement:` headings, which is what a citation has to land on. */
const SPEC_REQUIREMENTS = [
  ...readFileSync(path.join(REPO_ROOT, 'openspec/specs/design-system/spec.md'), 'utf8').matchAll(
    /^### Requirement: (.+)$/gm
  ),
].map((match) => match[1]);

/**
 * Every body of prose that cites `spec.md` by requirement, as `[label, text]`.
 *
 * The manifest enters as its PARSED `why` strings rather than as raw JSON, because JSON escapes the
 * quotes the notation uses and a raw scan would miss a citation it should have checked — the failure
 * mode this whole file exists to prevent.
 */
const CITING_PROSE = [
  [
    'scripts/lib/designSystemPrimitives.js',
    readFileSync(path.join(REPO_ROOT, 'scripts/lib/designSystemPrimitives.js'), 'utf8'),
  ],
  ['openspec/specs/design-system/library.html', librarySource],
  ['tests/design-system-coverage.test.js', readFileSync(fileURLToPath(import.meta.url), 'utf8')],
  ['scripts/lib/designSystemPrimitives.json', MANIFEST_ROWS.map((row) => row.why).join('\n')],
];

test('every spec.md citation names a requirement that still exists', () => {
  const requirements = new Set(SPEC_REQUIREMENTS);
  assert.ok(
    requirements.size > 20,
    `spec.md yielded ${requirements.size} requirement headings, so the reader is broken and every ` +
      'citation below would be reported as dangling'
  );
  for (const [label, prose] of CITING_PROSE) {
    const cited = [...unwrapped(prose).matchAll(REQUIREMENT_CITATION)].map((match) => match[1]);
    assert.ok(
      cited.length > 0,
      `${label} cites no spec.md requirement in the notation this property reads. Either the ` +
        'notation changed, in which case every citation in that file is now unchecked, or the ' +
        'file stopped citing the capability and no longer belongs in this list.'
    );
    for (const heading of cited) {
      assert.ok(
        requirements.has(heading),
        `${label} cites ${JSON.stringify(heading)}, which is no "### Requirement:" heading in ` +
          'spec.md. A reader following the citation finds nothing, which is the defect this ' +
          'change was opened to close.'
      );
    }
  }
});

test('no declined candidate ships as a component', () => {
  for (const name of RULED_OUT_NAMES) {
    assert.ok(
      !SHIPPED_COMPONENT_NAMES.has(name),
      `${name}.svelte ships and the ruled-out register declines it. The register says the ` +
        'absence of that primitive is a decision; a file with that name says otherwise, and one ' +
        'of the two has to be wrong.'
    );
  }
});
