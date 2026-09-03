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

import {
  parseDesignLibrary,
  primitiveNamesIn,
  readDesignLibrary,
} from './helpers/designLibrary.js';
import { styleTextFor } from './helpers/styleBlockScan.js';

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

/** Every shipped component, as the repository-relative POSIX path a manifest row names. */
const SHIPPED_COMPONENT_PATHS = toRepositoryPaths(
  REPO_ROOT,
  listSvelteComponents(path.join(REPO_ROOT, 'src'))
);

/** Every shipped component's basename, without the extension. */
const SHIPPED_COMPONENT_NAMES = new Set(
  SHIPPED_COMPONENT_PATHS.map((file) => path.basename(file, '.svelte'))
);

/** The directory `AGENTS.md` and `spec.md` both name when they prohibit an unrecorded primitive. */
const PRIMITIVE_DIRECTORY = 'src/ui/svelte/components/';

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
 * The 33 library entries with no shipped implementation.
 *
 * Not a debt list to be paid down in one change and not a ceiling: it is the specified-but-unbuilt
 * quadrant of the conformance question, and it moves in BOTH directions — down when a primitive is
 * built and gains a manifest row, up when the library specifies a new one. Either way the edit is
 * the same size as the change that caused it.
 */
const SPECIFIED_ONLY = [
  'AppRail',
  'AppTitleBar',
  'Avatar',
  'BandedBar',
  'BrowseCard',
  'ChoiceGroup',
  'DataTable',
  'InfoStrip',
  'Kicker',
  'ListRow',
  'LogList',
  'Menu',
  'Meter',
  'NavSidebar',
  'Notice',
  'PageHeader',
  'PickerRow',
  'Rail',
  'RequirementChooser',
  'RuleRow',
  'RuleSentence',
  'Search',
  'Select',
  'SetPicker',
  'SortableList',
  'StageBars',
  'StatBox',
  'TierTrack',
  'ValidationList',
  'ValidationSummary',
  'ViewToggle',
  'Well',
  'XrefList',
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

test('no library entry recorded as unbuilt ships as a component', () => {
  // The clause above compares the register against the MANIFEST; this one compares it against the
  // DISK. That is the difference between "the two documents agree" and "the two documents describe
  // the repository", and only the second catches a primitive that shipped without its row: the name
  // stays in the register, the manifest never learns about it, and the two artifacts go on agreeing
  // with each other about a set that no longer matches what is built.
  assert.deepEqual(
    SPECIFIED_ONLY.filter((name) => SHIPPED_COMPONENT_NAMES.has(name)),
    [],
    'a library entry is recorded as specified-but-unbuilt and a component of that name ships. ' +
      'Either it shipped without its manifest row, which is the name-no-diff-can-be-attributed-to ' +
      'case, or an unrelated file took the name, which makes the register ambiguous.'
  );
});

/**
 * The closed status vocabulary, and the two shapes it takes.
 *
 * spec.md requirement "Every entry carries a status" states three values for an ENTRY and adds
 * `prose` for a library block that specifies no primitive at all. The fourth value exists so the
 * attribute is UNIVERSAL: with it, a block carrying no status is always a defect, and the
 * properties below never have to decide whether a silent block was meant to be exempt.
 *
 * Written as two lists rather than one with a filter, because the difference between them is the
 * whole distinction: `prose` is legal on a block and illegal on a name or a manifest row, and one
 * list would make that a comment rather than an assertion.
 */
const MEMBER_STATUSES = ['target', 'shipped', 'divergent'];

/** @see MEMBER_STATUSES */
const BLOCK_STATUSES = [...MEMBER_STATUSES, 'prose'];

/**
 * How this corpus writes an issue reference, which a `divergent` entry owes.
 *
 * `issue 1373`, not the hash form — that one is what the colour gate over `src/ui` and `styles`
 * rejects, and these registers follow the same convention so a sentence can move between them.
 */
const ISSUE_REFERENCE = /\bissue \d+\b/u;

/**
 * A block's own status, derived from the statuses of the names it declares.
 *
 * `divergent` beats `target` beats `shipped`, so a block reads as met only when everything it
 * specifies is met. DERIVED rather than hand-typed: a multi-name block is the one place where a
 * block-level value could be written to disagree with the names under it, and the entry that
 * exercises the rule is live — the field block declares `shipped` for the field shell and
 * `target` for the select and the search, so the roll-up is proved by the corpus and not only
 * by this comment.
 *
 * @param {string[]} statuses every per-name status in one block
 * @returns {string} the block's value
 */
function weakest(statuses) {
  if (statuses.includes('divergent')) return 'divergent';
  if (statuses.includes('target')) return 'target';
  return 'shipped';
}

/** Every primitive name the library declares, against the status its own block gives it. */
const PER_NAME_STATUS = new Map(
  library.blocks.flatMap((block) => Object.entries(block.perNameStatus))
);

/** The blocks that name at least one primitive. */
const NAMING_BLOCKS = library.blocks.filter((block) => block.names.length > 0);

/** The blocks that name none — section prose. @see NAMING_BLOCKS */
const PROSE_BLOCKS = library.blocks.filter((block) => block.names.length === 0);

test('every library block declares a status from the closed vocabulary', () => {
  assert.ok(library.blocks.length > 0, 'the parser found no `div.spec`, so this has no domain');
  assert.equal(
    library.blocks.length,
    library.blockCount,
    'a `div.spec` no longer holds exactly one `div.spec-head`. The status records are keyed on ' +
      'the outer element and every count above is keyed on the inner one, so the two registers ' +
      'would silently stop describing the same blocks.'
  );
  for (const block of library.blocks) {
    assert.ok(
      BLOCK_STATUSES.includes(block.status),
      `a library block headed ${JSON.stringify(block.names.join(' ') || 'section prose')} ` +
        `declares status ${JSON.stringify(block.status)}. Every block declares one of ` +
        `${BLOCK_STATUSES.join(', ')}: a specimen with no status reads as a description of the ` +
        'tree, which is what this vocabulary exists to stop.'
    );
  }
});

test('a block that names a primitive gives every name its own status', () => {
  assert.ok(NAMING_BLOCKS.length > 0, 'no block names a primitive, so this has no domain');
  assert.equal(
    NAMING_BLOCKS.length,
    library.headings.length - library.nonPrimitiveHeadings.length,
    'the naming blocks and the naming headings disagree in number, so one of the two anchors is ' +
      'reading a different set of elements'
  );
  for (const block of NAMING_BLOCKS) {
    assert.notEqual(
      block.status,
      'prose',
      `${block.names.join(' ')} is declared section prose and names ${block.names.length} ` +
        'primitive(s). `prose` exempts a block from every correspondence below.'
    );
    for (const name of block.names) {
      assert.ok(
        MEMBER_STATUSES.includes(block.perNameStatus[name]),
        `${name} is named by a heading and declares status ` +
          `${JSON.stringify(block.perNameStatus[name])}. A heading naming several primitives ` +
          'gives each its own, so no name inherits a verdict passed on a different component.'
      );
    }
  }
});

/**
 * A naming heading holds its names and NOTHING else, which is what keeps the chip outside it.
 *
 * The prose census above pins its 20 headings by exact text, so a chip moved into one of those reds
 * immediately. The other 30 have no such pin: they are read for the names they yield, and `shipped`
 * or `IconButton · target` yields none, so every property in this file would still pass with the
 * status written inside the `h4` that the parser and the migrations table both describe as sitting
 * beside it. This is the pin for those 30, and it is the whole reason the block carries its heading.
 *
 * Compared DECODED, in the parser's own form, so a pure re-escaping of an entity does not red it.
 */
test('a naming heading is its names and nothing else, so no chip has moved inside it', () => {
  assert.ok(NAMING_BLOCKS.length > 0, 'no block names a primitive, so this has no domain');
  for (const block of NAMING_BLOCKS) {
    assert.equal(
      block.heading,
      block.names.map((name) => `<${name}>`).join(' '),
      `the heading of the ${JSON.stringify(block.names.join(' '))} entry carries text beyond the ` +
        'names it declares. A status chip belongs beside the `h4` and not inside it: the heading ' +
        'is the vocabulary, and a value describing the tree written there is read as part of it.'
    );
  }
});

test('a block that names no primitive is declared as prose', () => {
  assert.ok(PROSE_BLOCKS.length > 0, 'every block names a primitive, so this has no domain');
  for (const block of PROSE_BLOCKS) {
    assert.equal(
      block.status,
      'prose',
      'a section-prose block declares an entry status. It specifies no component, so `target` ' +
        'there claims an implementation is owed for something nothing could implement.'
    );
  }
});

test('a block’s own status is the weakest of the names it declares', () => {
  const mixed = NAMING_BLOCKS.filter(
    (block) => new Set(Object.values(block.perNameStatus)).size > 1
  );
  assert.ok(
    mixed.length > 0,
    'no block declares two different per-name statuses, so every block satisfies the roll-up ' +
      'below trivially and this property proves nothing about it'
  );
  for (const block of NAMING_BLOCKS) {
    assert.equal(
      block.status,
      weakest(Object.values(block.perNameStatus)),
      `${block.names.join(' ')} declares ${JSON.stringify(block.status)} over per-name statuses ` +
        `${JSON.stringify(block.perNameStatus)}. A block reads as met only when everything it ` +
        'specifies is met, so the block value is derived rather than chosen.'
    );
  }
});

/**
 * The ordering itself, over inputs the corpus does not contain.
 *
 * `divergent` has no live instance — no block and no member row declares it — so the property above
 * ranks it against nothing: delete that branch from {@link weakest} and every corpus block still
 * agrees with what is left. The rule is a rule about three values, and the third is exactly the one
 * a maintainer reaches for under pressure, so it is pinned here rather than left to a future entry
 * to discover.
 */
test('the roll-up ranks all three values, including the one no entry declares today', () => {
  assert.equal(weakest(['shipped', 'divergent']), 'divergent');
  assert.equal(weakest(['divergent', 'target']), 'divergent');
  assert.equal(weakest(['target', 'shipped', 'divergent']), 'divergent');
  assert.equal(weakest(['shipped', 'target']), 'target');
  assert.equal(weakest(['shipped', 'shipped']), 'shipped');
  assert.equal(weakest(['shipped']), 'shipped');
});

test('every shipped-member row carries the status its specimen declares', () => {
  // The domain is the MEMBER table alone, never `MANIFEST_ROWS`. That constant also spreads
  // `NOT_A_PRIMITIVE`, whose rows record non-membership rather than a member's fidelity and carry
  // no status at all — quantifying over it would report eleven absent fields as defects.
  assert.ok(DESIGN_SYSTEM_PRIMITIVES.length > 0, 'the member table is empty, so this is vacuous');
  const named = DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.library !== null);
  assert.ok(
    named.length > 0,
    'no member row names a library entry, so the correspondence below has no domain and only ' +
      'the vocabulary clause would run'
  );
  for (const row of DESIGN_SYSTEM_PRIMITIVES) {
    assert.ok(
      MEMBER_STATUSES.includes(row.status),
      `${row.path} carries status ${JSON.stringify(row.status)}, which is outside ` +
        MEMBER_STATUSES.join(', ')
    );
  }
  for (const row of named) {
    assert.equal(
      row.status,
      PER_NAME_STATUS.get(row.library.slice(1, -1)),
      `${row.path} records ${row.library} as ${JSON.stringify(row.status)} and that specimen ` +
        `declares ${JSON.stringify(PER_NAME_STATUS.get(row.library.slice(1, -1)))}. The two ` +
        'halves are one correspondence: a row free to disagree with its specimen is a second ' +
        'opinion about the same fact, and a reader has no way to tell which half is stale.'
    );
  }
});

test('a member row naming no specimen is a target by construction', () => {
  const unnamed = DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.library === null);
  assert.ok(unnamed.length > 0, 'every member row names a specimen, so this has no domain');
  for (const row of unnamed) {
    assert.ok(
      row.status === 'target' || row.status === 'divergent',
      `${row.path} names no library entry and carries status ${JSON.stringify(row.status)}. ` +
        'There is no specimen for it to match, so `shipped` claims a fidelity to nothing; the ' +
        'specimen it is owed is the target.'
    );
  }
});

test('a recorded non-member carries no status, because it is not a member', () => {
  assert.ok(NOT_A_PRIMITIVE.length > 0, 'the non-member table is empty, so this is vacuous');
  for (const row of NOT_A_PRIMITIVE) {
    assert.ok(
      !('status' in row),
      `${row.path} is an adjudicated NON-MEMBER and carries a status. Status is a member's ` +
        'fidelity to its specimen; on a non-member it reads as "unbuilt", which is the opposite ' +
        'of what that table records.'
    );
  }
});

test('every entry recorded as specified-but-unbuilt is declared a target', () => {
  // DERIVED from the register above rather than restated. That quadrant is already pinned by
  // exact equality there, so a second hand-typed list of the same names would be a copy free to
  // disagree with it — and the copy is the one nothing would notice.
  assert.ok(SPECIFIED_ONLY.length > 0, 'the unbuilt register is empty, so this has no domain');
  for (const name of SPECIFIED_ONLY) {
    assert.ok(
      PER_NAME_STATUS.has(name),
      `${name} is recorded as specified-but-unbuilt and its specimen declares no status for it`
    );
    assert.notEqual(
      PER_NAME_STATUS.get(name),
      'shipped',
      `${name} is recorded as specified-but-unbuilt and its specimen declares it shipped. ` +
        'Nothing implements it, so there is nothing for the specimen to match.'
    );
  }
});

test('a divergent entry names the issue that decided it', () => {
  // NO DOMAIN GUARD, and that is deliberate rather than an omission. Nothing is `divergent` today:
  // spec.md requirement "Every entry carries a status" reserves that value for a maintainer
  // decision and none has been taken, so a guard here would fail on a corpus that is CORRECT.
  // The property is written now so the first entry moved there arrives with its reason attached,
  // rather than acquiring the obligation after the fact.
  const divergentRows = DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.status === 'divergent');
  for (const row of divergentRows) {
    assert.match(
      row.why,
      ISSUE_REFERENCE,
      `${row.path} is recorded divergent and its judgement names no issue. "Divergent" means a ` +
        'decision was taken; a decision nobody can look up is indistinguishable from drift.'
    );
  }
  const divergentBlocks = NAMING_BLOCKS.filter((candidate) =>
    Object.values(candidate.perNameStatus).includes('divergent')
  );
  for (const block of divergentBlocks) {
    const start = librarySource.indexOf(`<h4>&lt;${block.names[0]}&gt;`);
    assert.match(
      librarySource.slice(start, librarySource.indexOf('</div>\n\n', start)),
      ISSUE_REFERENCE,
      `${block.names.join(' ')} declares a divergent name and its entry names no issue`
    );
  }
});

/**
 * The 34 shipped rows the library does not name.
 *
 * RE-COUNTED at issue 1392 rather than incremented. The heading said 31 while the register
 * held 33, so it was already two out before this change added one — the list itself is pinned
 * by equality against the manifest and never drifted, but the figure a reader trusts without
 * counting had. It is 34, and it is the length of the list below and of the manifest rows
 * carrying `library: null`, which the property beneath asserts are the same set.
 *
 * Pinned by EQUALITY rather than as a ceiling, for the reason
 * `tests/design-system-primitives.test.js` records for its own baselines: a ceiling loosens by one
 * slot every time debt is paid, and it permits a net-zero swap — document one, undocument another,
 * and the count never moves.
 *
 * GROWTH HERE IS NOT ALWAYS DEBT, and `downtime/WorldDowntimeTabs` is the worked example. This
 * list is every manifest row with `library: null`, and `MANIFEST_ROWS` spans BOTH tables — so
 * recording a NON-MEMBER lands here too. That row arrived by being adjudicated against `<TabBar>`
 * and ruled out with its measurements, which is the register doing its job; it is not a primitive
 * that shipped undocumented. The failure message below states the other reading because it is the
 * commoner one, not the only one.
 *
 * `checks/ChecksEditorTabs` was recorded here the same way by issue 1038 and is NOT here now:
 * issue 1429 gave the primitive the Rail Marker Family as a capability and converted that strip,
 * so it is a CALLER rather than a recorded non-member, and a row asserting otherwise would be
 * false. A non-member row is a measurement of the tree, so it expires when the tree changes.
 *
 * `SystemOverviewView` and `environment/EnvironmentValidationTab` arrived the same way at issue
 * 1444 and are the same kind of growth: both were PROPOSED as unconverted call sites of
 * `EditorValidationSurface` and both measured as a different surface, so each is a recorded
 * adjudication rather than a primitive that shipped undocumented.
 */
const UNDOCUMENTED_ROWS = [
  // `components/ActionMenu` is the newest arrival and is the ORDINARY kind of growth: a member of
  // the set that no `library.html` specimen names. Its row records that `<Menu>` was considered
  // and why the correspondence is not made — that entry is the kind-choice menu `<PickerRow>`'s
  // `allowAny` opens, which is a `SearchablePopover` today — so this is a stated debt rather than
  // a primitive that shipped unrecorded.
  //
  // Two of the three that arrived together at issue 1458 are adjudicated NON-MEMBERS rather than
  // undocumented PRIMITIVES, recorded with the measurement that ruled them out of the
  // `SearchablePopover` conversion — a multi-select checklist in the player window, and two
  // typeahead comboboxes. That is the register doing its job, and it is the same
  // growth-is-not-always-debt case `downtime/WorldDowntimeTabs` records below.
  //
  // The third, `environment/CompositionList`, is no longer one of them. Issue 1446 measured its
  // two callers, moved it to `DESIGN_SYSTEM_PRIMITIVES`, and adjudicated its `library` column
  // against three entries — so it stays on THIS list, and for the ordinary reason: it is a member
  // of the set that no `library.html` specimen names. Its four `role="menu"` action menus are
  // still a recorded non-conversion; a component can be a primitive and carry one.
  // Sorted, and this entry moved rather than arrived: issue 1500 relocated the player top bar from
  // `components/` to `apps/`, which changes where it sorts and nothing about its adjudication.
  'src/ui/svelte/apps/ActorSelectTopBar.svelte',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
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
  // The world modifier library's entry row (issue 1373, maintainer round 4). Genuinely
  // undocumented rather than an adjudicated non-member: it is a MEMBER at two callers, and
  // `library.html` specifies no row for a library entry at all — `:626`'s `<OptionCards>` is the
  // card group this row replaced at one of the two call sites, which is the opposite treatment.
  'src/ui/svelte/apps/manager/ModifierLibraryRow.svelte',
  'src/ui/svelte/apps/manager/ResolutionModeCard.svelte',
  'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
  'src/ui/svelte/apps/manager/SystemOverviewView.svelte',
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  // Promoted at issue 1392 and the ORDINARY kind of growth: a member of the set that no
  // `library.html` specimen names. Its row adjudicates `<SetPicker>`, the nearest entry, and
  // records why the correspondence is not made — a vocabulary editor is not one record's
  // membership of a set.
  'src/ui/svelte/apps/manager/VocabularyPanel.svelte',
  'src/ui/svelte/apps/manager/downtime/WorldDowntimeTabs.svelte',
  'src/ui/svelte/apps/manager/environment/CompositionList.svelte',
  'src/ui/svelte/apps/manager/environment/EnvironmentValidationTab.svelte',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
  'src/ui/svelte/components/ActionMenu.svelte',
  'src/ui/svelte/components/ChanceSlider.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
  'src/ui/svelte/components/DropZone.svelte',
  'src/ui/svelte/components/EssenceSourceSelector.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/ManagerColorPicker.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
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
 * The clause that makes the prohibition enforceable rather than merely stated.
 *
 * `AGENTS.md` forbids adding a component under `src/ui/svelte/components/` without its specimen and
 * its row, and `spec.md` names this file as the gate that fails on that. Neither was true until this
 * property existed: a five-line stub dropped into that directory with no specimen and no row left
 * the whole file green, and so did the same stub WITH a specimen but no row. Nothing distinguished
 * "specified but unbuilt" from "specified, built, and unrecorded".
 *
 * Requiring the ROW is what closes it, because the row is the only obligation the rest of this file
 * can reason from. A row either names a library entry — which must resolve to a specimen, and must
 * not name a declined candidate — or it is `library: null`, in which case it must appear in
 * {@link UNDOCUMENTED_ROWS}, which is pinned by exact equality. So a new component reaches a green
 * gate only by acquiring a specimen or by being recorded as an accepted debt, and either way an
 * author states which.
 */
test('every component in the primitive directory carries a manifest row', () => {
  const recorded = new Set(MANIFEST_ROWS.map((row) => row.path));
  const inDirectory = SHIPPED_COMPONENT_PATHS.filter((file) =>
    file.startsWith(PRIMITIVE_DIRECTORY)
  );
  assert.ok(
    inDirectory.length > 10,
    `the walk found ${inDirectory.length} files under ${PRIMITIVE_DIRECTORY}, so either the ` +
      'directory moved or the walk is not reaching it, and this property has no domain'
  );
  assert.deepEqual(
    inDirectory.filter((file) => !recorded.has(file)),
    [],
    `a component under ${PRIMITIVE_DIRECTORY} carries no manifest row. Record it: with the name ` +
      'of its library specimen, or with `library: null` and a row in the undocumented register ' +
      'above, which says out loud that it ships as an undocumented primitive.'
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
  assert.ok(
    cited.length > 20,
    `the library cites ${cited.length} components, so it stopped citing`
  );
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
 *
 * THE NOTATION IS CAPABILITY-SCOPED: it resolves against `design-system` and nothing else, because
 * `SPEC_REQUIREMENTS` below reads that one file. Any other capability's `spec.md` may be cited in
 * these artifacts — `library.html` names `ui-integration/spec.md` nine times, seven of them still by
 * line — but not in THIS notation, which the property below would resolve against the wrong
 * document in both directions: a heading absent from `design-system` reported as dangling when it
 * is present where the citation actually points, and a heading present in `design-system` accepted
 * for a capability whose spec has never carried it.
 *
 * That is why the capability is CAPTURED rather than excluded. A negative lookbehind on `/` would
 * decline a foreign citation by not matching it, which closes the misresolution and reopens the
 * silence one layer down: an unmatched citation is an unchecked citation, and this file exists
 * because unreachable configuration looks exactly like working configuration. Capturing the prefix
 * costs one group, needs no prefix-to-path registry — this change has already priced what a
 * hand-maintained registry costs — and turns a SLASH-ADJACENT foreign prefix into a named failure.
 * Group 1 is the capability, absent when the citation is bare; group 2 is the heading.
 *
 * That qualifier is deliberate rather than modest. Three foreign shapes still read as bare and are
 * still resolved against this capability, and they are described here rather than written out
 * because this file is itself scanned: a capability path closed in backticks before the notation
 * begins, which matters because backticking paths is this corpus's own convention; a capability
 * named as prose with a space where the slash would be; and a prefix wrapped at the slash across a
 * JSDoc line break, which `unwrapped` rejoins with a space. None is a regression — the capture is
 * a strict superset of the pattern it replaced, so nothing matches less than before — and none was
 * closed by either remedy considered. Dropping the qualifier would be this file committing the
 * defect it exists to report: a claim broader than the check behind it.
 */
const REQUIREMENT_CITATION = /(?:([A-Za-z0-9._-]+)\/)?spec\.md requirement "([^"]+)"/g;

/** The one capability the notation resolves against, and the implicit prefix of a bare citation. */
const CITED_CAPABILITY = 'design-system';

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
  ...readFileSync(
    path.join(REPO_ROOT, `openspec/specs/${CITED_CAPABILITY}/spec.md`),
    'utf8'
  ).matchAll(/^### Requirement: (.+)$/gm),
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

test('every spec.md citation names a design-system requirement that still exists', () => {
  const requirements = new Set(SPEC_REQUIREMENTS);
  assert.ok(
    requirements.size > 20,
    `spec.md yielded ${requirements.size} requirement headings, so the reader is broken and every ` +
      'citation below would be reported as dangling'
  );
  for (const [label, prose] of CITING_PROSE) {
    const citations = [...unwrapped(prose).matchAll(REQUIREMENT_CITATION)].map((match) => ({
      capability: match[1] ?? CITED_CAPABILITY,
      heading: match[2],
    }));
    // Before anything is resolved: every citation has to be ABOUT the capability this property can
    // resolve. A foreign one is not a dangling heading and must not be reported as one — it is a
    // citation written in a notation that cannot check it, which is the silence this file closes.
    for (const { capability, heading } of citations) {
      assert.equal(
        capability,
        CITED_CAPABILITY,
        `${label} writes a requirement citation prefixed \`${capability}/\`, naming ` +
          `${JSON.stringify(heading)}. This notation is capability-scoped: it resolves only ` +
          `against \`openspec/specs/${CITED_CAPABILITY}/spec.md\`, so a citation carrying any ` +
          `other prefix would be answered by the wrong document. Cite ${capability} by some ` +
          'other form, or move the requirement.'
      );
    }
    const cited = citations.map((citation) => citation.heading);
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
          `\`openspec/specs/${CITED_CAPABILITY}/spec.md\`. A reader following the citation finds ` +
          'nothing, which is the defect this change was opened to close.'
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

/**
 * A rule's whole selector list, for every rule in a stylesheet.
 *
 * `postcss` is not a declared dependency of this repository — `postcss-scss` is, and reaching
 * through it for a transitive peer would make a gate depend on a package nothing lists. A rule is
 * recognisable without a parser: it is the text between the previous statement boundary and a `{`.
 * Proved rather than assumed — this scanner was compared against `postcss` over the whole style
 * corpus, all 185 files carrying CSS, and agreed on the multiset of selector lists in every one,
 * including this stylesheet's 2645 rules.
 *
 * THE FIRST CHARACTER CLASS EXCLUDES WHITESPACE AS WELL AS `@`, and that is the one non-obvious
 * part. `\s*` is free to backtrack, so a class that merely excluded `@` still matched by starting
 * the capture ON a whitespace character and swallowing the at-rule behind it — which counted every
 * `@container` prelude as a rule, silently, and made one measured count read 31 instead of 30. A
 * nested rule INSIDE an at-rule is still counted, because its prelude follows the at-rule's `{`.
 */
const SELECTOR_LIST = /(?:^|[{};])\s*([^{};\s@][^{};]*)\{/g;

/**
 * @param {string} css Comment-stripped CSS.
 * @returns {string[]} Each rule's selector list, whitespace collapsed, in source order.
 */
function selectorListsIn(css) {
  const lists = [];
  SELECTOR_LIST.lastIndex = 0;
  for (let found = SELECTOR_LIST.exec(css); found !== null; found = SELECTOR_LIST.exec(css)) {
    lists.push(found[1].trim().replaceAll(/\s+/gu, ' '));
    // Step back onto the `{` this match consumed: it is the statement boundary a nested rule's
    // own prelude is anchored on, and consuming it would hide every rule inside an at-rule.
    SELECTOR_LIST.lastIndex = found.index + found[0].length - 1;
  }
  return lists;
}

/** The sheet every stylesheet claim in the manifest is about. */
const STYLESHEET = 'styles/fabricate.css';

/** Its rules, as selector lists. */
const STYLESHEET_SELECTORS = selectorListsIn(
  styleTextFor(STYLESHEET, readFileSync(path.join(REPO_ROOT, STYLESHEET), 'utf8'))
);

/**
 * A claim that the manifest makes about a class family in the shipped stylesheet.
 *
 * `scripts/lib/designSystemPrimitives.js` states the notation and why a count stays inside `why`
 * rather than becoming a field. Group 1 is the count, group 2 the family without its trailing
 * `-*`, group 3 the optional root the rules must additionally sit under.
 *
 * The notation is deliberately the one the FALSE sentences already used. Three rows said
 * "113 `.manager-travel-*` rules in `styles/fabricate.css`", two of them to rule a conversion
 * structurally impossible, and it had been wrong since thirteen minutes before the first of them
 * merged. This pattern matches that sentence as it was written, so this property is not a rule
 * that only binds on prose authored after it.
 */
const FAMILY_RULE_CLAIM =
  /(\d+) `\.([a-z][a-z\d-]*)-\*` rules(?: under `\.([a-z][a-z\d-]*)`)? in `styles\/fabricate\.css`/gu;

/** A claim about the number of rules in a row's OWN component's scoped `<style>` block. */
const SCOPED_RULE_CLAIM = /(\d+) scoped rules/gu;

test('every class-family rule count the manifest asserts is re-derived from the stylesheet', () => {
  assert.ok(
    STYLESHEET_SELECTORS.length > 1000,
    `${STYLESHEET} yielded ${STYLESHEET_SELECTORS.length} rules, so the scanner is broken and ` +
      'every count below would be compared against a number nobody measured'
  );
  const claims = MANIFEST_ROWS.flatMap((row) =>
    [...row.why.matchAll(FAMILY_RULE_CLAIM)].map((found) => ({
      row,
      text: found[0],
      count: Number(found[1]),
      family: `.${found[2]}-`,
      root: found[3] === undefined ? null : `.${found[3]}`,
    }))
  );
  assert.ok(
    claims.length > 0,
    'no manifest row states a class-family rule count in the notation this property reads, so ' +
      'either the notation changed and every such claim is unchecked again, or the rows that ' +
      'made one stopped and this property has no domain'
  );
  for (const claim of claims) {
    const measured = STYLESHEET_SELECTORS.filter(
      (selector) =>
        selector.includes(claim.family) && (claim.root === null || selector.includes(claim.root))
    );
    assert.equal(
      measured.length,
      claim.count,
      `${claim.row.path} states "${claim.text}" and ${STYLESHEET} has ${measured.length}. A ` +
        'stylesheet claim in a register row is not decoration: two rows disqualified a component ' +
        'on one of these, and it had been false since before the row was written.'
    );
  }
});

test('every scoped rule count the manifest asserts is re-derived from that component', () => {
  const claims = MANIFEST_ROWS.flatMap((row) =>
    [...row.why.matchAll(SCOPED_RULE_CLAIM)].map((found) => ({
      row,
      text: found[0],
      count: Number(found[1]),
    }))
  );
  assert.ok(
    claims.length > 0,
    'no manifest row states a scoped rule count in the notation this property reads, so either ' +
      'the notation changed or this property has no domain'
  );
  for (const claim of claims) {
    const source = readFileSync(path.join(REPO_ROOT, claim.row.path), 'utf8');
    const measured = selectorListsIn(styleTextFor(claim.row.path, source));
    assert.equal(
      measured.length,
      claim.count,
      `${claim.row.path} states "${claim.text}" and its own <style> block holds ` +
        `${measured.length}. Both rows carrying one of these use it to size the blast radius of ` +
        'a conversion, so the figure is the argument rather than a detail of it.'
    );
  }
});
