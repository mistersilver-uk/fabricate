/** The coverage gate over the design system's two halves (issue 1116). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { measureImporters } from '../scripts/lib/componentImporters.js';
import {
  DESIGN_SYSTEM_PRIMITIVES,
  NOT_A_PRIMITIVE,
  RULED_OUT,
} from '../scripts/lib/designSystemPrimitives.js';
import { listSvelteComponents, toRepositoryPaths } from '../scripts/lib/svelteComponentFiles.js';

import { parseDesignLibrary, primitiveNamesIn, readDesignLibrary } from './helpers/designLibrary.js';
import { styleTextFor } from './helpers/styleBlockScan.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Order two strings by code point, ascending.
 *
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

/** The nine name-shaped ruled-out candidates, DERIVED rather than re-typed. */
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

/**
 * The directory `AGENTS.md` and `spec.md` both name when they prohibit an unrecorded primitive.
 *
 * Its `startsWith` test decides only where a manifest row is compulsory (issue 1481 item 2); a
 * component in a nested `apps/manager` directory may hold a row and is not compelled to.
 */
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
  // file — at which point the edit should be accepted deliberately rather than absorbed (issue
  // 1371).
  assert.equal(library.blockCount, 59, 'spec-head block count');
  assert.equal(
    library.headingCount,
    59,
    'the one-heading-per-block relation broke: a block with two h4s double-counts its entry, and ' +
      'a block with none drops it out of the set entirely'
  );
  assert.equal(library.names.length, 71, 'distinct primitive names');
  assert.equal(
    library.nameOccurrences,
    71,
    'occurrences no longer equal distinct names, so one primitive is now named by two entries ' +
      'and the set has a duplicate'
  );
  assert.equal(library.headings.length - library.nonPrimitiveHeadings.length, 39, 'naming blocks');
  assert.equal(library.nonPrimitiveHeadings.length, 20, 'section-prose blocks');

  // The only pair that pins the ANCHOR as narrower than a file-wide scan.
  assert.equal(library.fileWideNames.length, 82, 'file-wide primitive-shaped names');
  assert.equal(library.namesOutsideHeadings.length, 11, 'names outside every spec-head heading');
});

/**
 * The 20 `div.spec-head > h4` headings that name no primitive: section prose, pinned by exact
 * decoded text.
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
  'Simple and alchemy — the reserved failure group',
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

/** The 27 library entries with no shipped implementation (issue 1505). */
const SPECIFIED_ONLY = [
  'AppRail', 'AppTitleBar', 'BandedBar', 'BrowseCard', 'ChoiceGroup',
  'DataTable', 'InfoStrip', 'LogList', 'Menu',
  'Meter', 'NavSidebar', 'PageHeader', 'PickerRow', 'Rail',
  'RequirementChooser', 'RuleRow', 'RuleSentence', 'Search', 'SetPicker',
  'SortableList', 'StageBars', 'TierTrack', 'ValidationList', 'ValidationSummary',
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

test('no library entry recorded as unbuilt ships as a component', () => {
  // The clause above compares the register against the MANIFEST; this one compares it against the
  // DISK.
  assert.deepEqual(
    SPECIFIED_ONLY.filter((name) => SHIPPED_COMPONENT_NAMES.has(name)),
    [],
    'a library entry is recorded as specified-but-unbuilt and a component of that name ships. ' +
      'Either it shipped without its manifest row, which is the name-no-diff-can-be-attributed-to ' +
      'case, or an unrelated file took the name, which makes the register ambiguous.'
  );
});

/**
 * The closed status vocabulary, and the two shapes it takes. spec.md requirement "Every entry
 * carries a status" states three values for an ENTRY and adds `prose` for a library block that
 * specifies no primitive at all.
 */
const MEMBER_STATUSES = ['target', 'shipped', 'divergent'];

/** @see MEMBER_STATUSES */
const BLOCK_STATUSES = [...MEMBER_STATUSES, 'prose'];

/** How this corpus writes an issue reference, which a `divergent` entry owes (issue 1373). */
const ISSUE_REFERENCE = /\bissue \d+\b/u;

/**
 * A block's own status, derived from the statuses of the names it declares.
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

/** A naming heading holds its names and NOTHING else, which is what keeps the chip outside it. */
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

/** The ordering itself, over inputs the corpus does not contain. */
test('the roll-up ranks all three values, including the one no entry declares today', () => {
  assert.equal(weakest(['shipped', 'divergent']), 'divergent');
  assert.equal(weakest(['divergent', 'target']), 'divergent');
  assert.equal(weakest(['target', 'shipped', 'divergent']), 'divergent');
  assert.equal(weakest(['shipped', 'target']), 'target');
  assert.equal(weakest(['shipped', 'shipped']), 'shipped');
  assert.equal(weakest(['shipped']), 'shipped');
});

test('every shipped-member row carries the status its specimen declares', () => {
  // The domain is the MEMBER table alone, never `MANIFEST_ROWS`.
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

/**
 * The closed `scope` vocabulary, per spec.md requirement "A shared primitive's class family is
 * rooted at the primitive, not at an app" and its scenario "A component that cannot leave its area
 * keeps that area's root".
 */
const SCOPES = ['shared', 'manager-only'];

/** The area a `manager-only` row says its component cannot leave. */
const MANAGER_DIRECTORY = 'src/ui/svelte/apps/manager/';

/**
 * The rows whose family this programme has RE-ROOTED at a class the primitive itself emits, and
 * which therefore owe both a `shared` scope and an entry in the gate that proves the rooting (issue
 * 1502).
 */
const RE_ROOTED_ROWS = [
  'src/ui/svelte/components/ChanceSlider.svelte',
  'src/ui/svelte/components/EditorTabs.svelte',
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/InspectorCard.svelte',
  'src/ui/svelte/components/ItemDropZone.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/RadioCardGroup.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/ToggleCard.svelte',
];

/** The gate that PROVES a family is not application-rooted, read for its component paths only. */
const AREA_SCOPE_GATE = 'tests/components/searchable-popover-area-scope.test.js';

/** Every component path the area-scope gate holds an entry for. */
function areaScopeGateComponents() {
  const source = readFileSync(path.join(REPO_ROOT, AREA_SCOPE_GATE), 'utf8');
  const opener = 'const PRIMITIVES = Object.freeze([';
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `${AREA_SCOPE_GATE} no longer declares \`${opener}\``);
  const end = source.indexOf('\n]);', start);
  assert.notEqual(end, -1, `the \`PRIMITIVES\` literal in ${AREA_SCOPE_GATE} is unterminated`);

  const region = source.slice(start, end);
  const found = new Set();
  for (const [, list] of region.matchAll(/components: Object\.freeze\(\[([^\]]*)\]\)/gu)) {
    for (const [, file] of list.matchAll(/'([^']+)'/gu)) found.add(file);
  }
  return found;
}

test('every member row records a scope from the closed vocabulary, and no non-member does', () => {
  assert.ok(DESIGN_SYSTEM_PRIMITIVES.length > 0, 'the member table is empty, so this is vacuous');
  for (const row of DESIGN_SYSTEM_PRIMITIVES) {
    assert.ok(
      SCOPES.includes(row.scope),
      `${row.path} carries scope ${JSON.stringify(row.scope)}, which is outside the ` +
        `${JSON.stringify(SCOPES)} vocabulary. The field is universal on a member row: a row ` +
        'without one leaves "can this leave the manager?" unanswered, which is the omission this ' +
        'field exists to convert into a decision.'
    );
  }

  assert.ok(NOT_A_PRIMITIVE.length > 0 && RULED_OUT.length > 0, 'a non-member table is empty');
  for (const row of [...NOT_A_PRIMITIVE, ...RULED_OUT]) {
    assert.ok(
      !('scope' in row),
      `${row.path ?? row.name} is a recorded NON-MEMBER and carries a scope. Scope answers where ` +
        'a member of the vocabulary may render; on a row the register has adjudicated OUT of the ' +
        'vocabulary it is a decision about a component the register says is not a member. This is ' +
        'the same boundary the status clause above draws, for the same reason.'
    );
  }
});

test('a manager-only row states its reason, and no caller outside the manager contradicts it', () => {
  const scoped = DESIGN_SYSTEM_PRIMITIVES.filter((row) => row.scope === 'manager-only');
  assert.ok(scoped.length > 0, 'no row is manager-only, so both clauses below are vacuous');

  const graph = measureImporters(REPO_ROOT);
  assert.ok(
    graph.importEdgeCount > 1000,
    `the import graph resolved only ${graph.importEdgeCount} edges, so "no importer outside the ` +
      'manager" is true of everything and the clause below measures nothing'
  );

  for (const row of scoped) {
    assert.ok(
      row.why.includes('manager-only'),
      `${row.path} is scoped manager-only and its \`why\` never says so. The value is a decision, ` +
        'and a decision whose reason is unwritten is indistinguishable from a default.'
    );

    const outside = graph
      .importersOf(row.path)
      .filter((importer) => !importer.startsWith(MANAGER_DIRECTORY));
    assert.deepEqual(
      outside,
      [],
      `${row.path} is scoped manager-only and is imported from outside ${MANAGER_DIRECTORY}. ` +
        'The scope is then a false claim about a component another application already renders, ' +
        'which is worse than no claim: the register would be recording a decision the tree has ' +
        'already overruled. Either the scope is `shared` and the path is the debt, or the ' +
        'importer is the defect.'
    );
  }
});

test('every re-rooted family carries a shared scope and an entry in the gate that proves it', () => {
  const byPath = new Map(DESIGN_SYSTEM_PRIMITIVES.map((row) => [row.path, row]));
  const entries = areaScopeGateComponents();
  assert.ok(
    entries.size >= 21,
    `the area-scope gate reader found only ${entries.size} component paths, against the 22 that ` +
      'file holds across 21 entries. The reader has stopped matching and the clause below passes ' +
      'on nothing.'
  );

  for (const componentPath of RE_ROOTED_ROWS) {
    const row = byPath.get(componentPath);
    assert.ok(Boolean(row), `${componentPath} is recorded as re-rooted and has no manifest row`);
    assert.equal(
      row.scope,
      'shared',
      `${componentPath} had its family re-rooted at a class it emits and is scoped ` +
        `${JSON.stringify(row.scope)}. Re-rooting is exactly what makes a component renderable ` +
        'outside the manager, so a `manager-only` scope on one contradicts the work that landed it.'
    );
    assert.ok(
      entries.has(componentPath),
      `${componentPath} is scoped shared as a re-rooted family and ${AREA_SCOPE_GATE} holds no ` +
        'entry for it. The register records the decision and the gate proves the rooting; without ' +
        'the entry the claim is unmeasured, which is the state this pairing exists to prevent.'
    );
  }
});

test('every entry recorded as specified-but-unbuilt is declared a target', () => {
  // DERIVED from the register above rather than restated.
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
  // NO DOMAIN GUARD, and that is deliberate rather than an omission.
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
 * The 31 shipped rows the library does not name. RE-COUNTED at issue 1392 rather than incremented.
 */
const UNDOCUMENTED_ROWS = [
  // `components/ActionMenu` is the newest arrival and is the ORDINARY kind of growth: a member of
  // the set that no `library.html` specimen names (issue 1458).
  'src/ui/svelte/apps/ActorSelectTopBar.svelte',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
  'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  // The world modifier library's entry row (issue 1373, maintainer round 4).
  'src/ui/svelte/apps/manager/ModifierLibraryRow.svelte',
  'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
  'src/ui/svelte/apps/manager/SystemOverviewView.svelte',
  // Promoted at issue 1392 and the ORDINARY kind of growth: a member of the set that no
  // `library.html` specimen names.
  'src/ui/svelte/apps/manager/VocabularyPanel.svelte',
  'src/ui/svelte/apps/manager/downtime/WorldDowntimeTabs.svelte',
  'src/ui/svelte/apps/manager/environment/CompositionList.svelte',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
  // Issue 1648 reuses these domain authoring compositions across crafting and gathering.
  // The manifest records their new shared membership and why no generic library entry applies.
  'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
  'src/ui/svelte/components/ActionMenu.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  'src/ui/svelte/components/ChanceSlider.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  'src/ui/svelte/components/EssenceSourceSelector.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/ManagerColorPicker.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  'src/ui/svelte/components/ToggleCard.svelte',
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
 * The clause that makes the prohibition enforceable rather than merely stated. Requiring the ROW is
 * what closes it, because the row is the only obligation the rest of this file can reason from.
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

/** Primitives the library CITES normatively without giving them an entry. */
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
      'Cited at `library.html:1756` and `:1768` as the element two specimens render. NOT a loose ' +
      'citation: spec.md requirement "Sets and groups are the container layer above the row" ' +
      'already MANDATES the surface — "The routing is authored in TWO surfaces" and "A ROUTING ' +
      'OVERVIEW lists every source with the set it produces". This is a bound requirement whose ' +
      'specimen has no entry of its own.',
  },
];

test('every primitive name in the library is an entry, a declined candidate, or a recorded debt', () => {
  // The length pin runs FIRST, deliberately.
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
 */
const REQUIREMENT_CITATION = /(?:([A-Za-z0-9._-]+)\/)?spec\.md requirement "([^"]+)"/g;

/** The one capability the notation resolves against, and the implicit prefix of a bare citation. */
const CITED_CAPABILITY = 'design-system';

/**
 * Collapse a JSDoc line break — newline, optional `*` gutter, indentation — into a single space.
 *
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

/** Every body of prose that cites `spec.md` by requirement, as `[label, text]`. */
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
    // resolve.
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

/** A rule's whole selector list, for every rule in a stylesheet. */
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
 * `scripts/lib/designSystemPrimitives.js` states the notation and why a count stays inside `why`
 * rather than becoming a field.
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
