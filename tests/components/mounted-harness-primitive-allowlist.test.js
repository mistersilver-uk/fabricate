/** Guard for a hand-maintained mirror that fails SILENTLY. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const SHARED_PRIMITIVES = [
  'src/ui/svelte/components/EmptyState.svelte',
  'src/ui/svelte/components/Callout.svelte',
  // The manager's ONE selection control and ONE essence quantity card (issue 772).
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  // The manager's ONE modal-dialog chrome (issue 877). Both import-flow modals render
  // through it, so adding it to a third screen would silently pull it into every suite
  // that mounts a tree containing that screen.
  'src/ui/svelte/components/Modal.svelte',
  // The manager's ONE icon fact row (issue 881), a side-panel primitive the scoped-entity preview,
  // the world catalogue shell and the inspectors pull into several mounted trees.
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  // The manager's ONE chip (issue 883). This is the sharpest case yet.
  'src/ui/svelte/components/Chip.svelte',
  // The manager's ONE multi-select toolbar and ONE bulk-edit chrome (issue 1010).
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
  // The inspector's filling root and pinned foot (issues 2498, 2500): four system inspectors and,
  // through `BulkEditPanelShell`, every bulk panel render it.
  'src/ui/svelte/apps/manager/InspectorPanel.svelte',
  // The app's one select (issue 1504), which pulls `SearchablePopover` in behind it. The guard
  // names it for a suite whose roster it reads: inline, by name or shorthand, and one spread deep.
  'src/ui/svelte/components/Select.svelte',
  // The product's ONE horizontal fill bar, ONE row disclosure and ONE ordered list (issue 1512).
  // The list reaches five manager surfaces at once, and it renders the disclosure and the icon
  // button behind it, so a tree holding any converted list pulls three primitives in.
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/SortableList.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  // The three instruments over it (issue 1782): the player window, the journal and the Checks
  // Studio render them, so each joins the trees that already compile the leaf.
  'src/ui/svelte/components/Meter.svelte',
  'src/ui/svelte/components/BandedBar.svelte',
  'src/ui/svelte/components/StageBars.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
  // The range bar's marker (issue 2431): every tree holding the strip compiles it.
  'src/ui/svelte/components/RangeBarMarker.svelte',
  // The rule row and its sentence (issue 1782): every tree holding the Checks Studio's triggers or
  // a gathering inspector's condition modifiers renders both.
  'src/ui/svelte/components/RuleRow.svelte',
  'src/ui/svelte/components/RuleSentence.svelte',
  // The set picker (issue 1782): the recipe-item editor's contents tab and the crafting bar.
  'src/ui/svelte/components/SetPicker.svelte',
  // The set card (issue 2512): every recipe set, the Tools tab's per-set cards and salvage groups.
  'src/ui/svelte/components/SetCard.svelte',
  // The routing overview (issue 2513): the recipe Overview's routing card and the salvage well.
  'src/ui/svelte/components/RoutingOverview.svelte',
  // The inspector rail section (issue 1782): the essence, tool and recipe-item inspectors.
  'src/ui/svelte/components/Rail.svelte',
  // The log list (issue 1782): every tree holding the journal's Finished list renders it.
  'src/ui/svelte/components/LogList.svelte',
  // The data table (issue 1782): the gathering task editor's drop rules and the crafting IO table.
  'src/ui/svelte/components/DataTable.svelte',
  // The typeahead (issue 1782): the recipe-item limits tab and the gathering task and modifier editors.
  'src/ui/svelte/components/Typeahead.svelte',
  // Three the manager and the player window both render, adjudicated in when the two-root clause
  // below arrived (issue 1782): the dice faces of a check's evidence and outcome preview, the
  // segmented choice the browse filters and the Checks Studio share, and the inset well the
  // requirement chooser and the dice prompt draw.
  'src/ui/svelte/components/DiceTiles.svelte',
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/components/Well.svelte',
  // The strip of current values (issue 1521): the crafting check card and the gathering detail
  // render it, so every crafting and gathering tree compiles it.
  'src/ui/svelte/components/InfoStrip.svelte',
  // THE manager's labelled push-button (issue 1096). It is the sharpest entry on this list
  // after `Chip`: the button class is a CSS convention repeated across more than sixty
  // components, so every step of the conversion sweep drops this primitive into another
  // mounted tree. Two screens use it today — the Modifiers card in `SystemEditView` and the
  // Tool Studio header, which is the authority the primitive reproduces — and they already
  // sit in four different mounted trees between them.
  'src/ui/svelte/components/Button.svelte',
  // THE manager's icon-only push-button (issue 1422).
  'src/ui/svelte/components/IconButton.svelte',
  // THE manager's editor tab strip (issue 1362).
  'src/ui/svelte/components/EditorTabs.svelte',
  // THE manager's on/off switch (issue 1040). Sharper again than `Button`.
  'src/ui/svelte/components/StatusToggle.svelte',
  // THE manager's card shell (issue 1427).
  'src/ui/svelte/components/InspectorCard.svelte',
  // THE manager's labelled form field.
  'src/ui/svelte/components/Field.svelte',
  // The scoped-entity list composition and the world-catalogue shell over it (issue 1380).
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
  // THE manager's filter bar and its search field (issue 1039). The pair reaches every browse
  // screen in the manager — systems, recipes, components, essences, environments, gathering
  // tasks and events, realms, books-and-scrolls, access and both world scoped-entity lists —
  // and the field reaches four editors and two rosters on top of that, so between them they sit
  // in more mounted trees than any entry above except `Chip`.
  'src/ui/svelte/components/SearchField.svelte',
  'src/ui/svelte/components/FilterBar.svelte',
  // THE editor validation surface (issue 1444).
  // BOTH FIGURES ARE RE-DERIVED FROM THE TREE rather than adjusted, because the pair this note
  // replaced had drifted in opposite directions — it said seven renderers and four direct
  // callers while the tree held nine and five. The measurement is a grep for the import
  // specifier, which returns SIX direct importers; one of them is `scoped/ScopedValidationTab`,
  // an intermediary rather than a screen, and that shell has five callers of its own, so the
  // surface count is 6 - 1 + 5.
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  // THE manager's searchable picker (issue 1458), and the entry with the LONGEST tail.
  'src/ui/svelte/components/SearchablePopover.svelte',
  // Its portaled panel (issue 1719), which inherits that tail whole: the picker renders it in
  // every open state, so it is in the static closure of every suite the entry above reaches. It
  // is the sharpest silent-failure case on this list, because a panel missing from a roster
  // cancels the suite at the click that opens it rather than failing an assertion.
  'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  // THE shared overflow action menu (issue 1477). It is a LEAF TWO RUNGS DOWN.
  'src/ui/svelte/components/ActionMenu.svelte',
  // THE THREE THAT SHIPPED TOGETHER (issue 1505).
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/StatBox.svelte',
  'src/ui/svelte/components/Notice.svelte',
  // THE ONE ART TILE (issue 1506), and the widest case this list has been offered. It was the
  // manager's tile; that change retired the player Crafting tab's two tiles into it, so it is now
  // rendered from forty-two files across the manager and crafting trees — a third tree many
  // times over, which is this list's own bar. It is also the entry with the most to gain from
  // membership: measured before that change, ZERO of the eleven mounted suites that named a
  // crafting-thumb path carried a Medallion entry, so every one of them would have taken the
  // silent `# cancelled` rather than the named "mounts a tree that renders it but never compiles
  // it" failure. Its sibling `Avatar` deliberately did NOT join at two callers, which was this
  // list's rule read the other way; that ruling has since been overturned by the caller it named
  // as its own condition — see the entry below.
  'src/ui/svelte/components/Medallion.svelte',
  // THE FOUR THAT ARRIVED IN `components/` AT ISSUE 1509.
  'src/ui/svelte/components/RadioCardGroup.svelte',
  'src/ui/svelte/components/ToggleCard.svelte',
  'src/ui/svelte/components/ItemDropZone.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  // THE PORTRAIT (issue 1514), joining on exactly the condition its own non-membership note set:
  // "it joins the moment a third caller in a third tree arrives, which is what makes this a
  // criterion rather than a preference." The player inventory inspector's source-actor portrait
  // is that caller, and the player window is that tree — the two shipped sites are the GM
  // Knowledge roster row and its detail header, both under the manager root. Nothing about the
  // criterion moved; the tree did. It is also the entry with the sharpest silent failure on this
  // list, because it was the one component here whose omission was NOT named: three suites mount
  // an inventory tree, and each of them would have taken a `# cancelled` with no message rather
  // than the named "mounts a tree that renders it but never compiles it" line.
  'src/ui/svelte/components/Avatar.svelte',
  // THE ONE NOT-YET-READY CHROME the player views draw (issue 1514).
  // THE ENTRY IS LOAD-BEARING AND IT WAS MEASURED BOTH WAYS, because an addition to this list
  // that changes nothing is the shape of guard this file exists to prevent. Dropping the path
  // from `PLAYER_APP_COMPILED_MODULES` reds the clause below by name against EIGHT suites —
  // the alchemy view, the app root, the journal view, three gathering suites (the detail, the
  // environments and the actor bar) and both inventory suites. Dropping it from BOTH that
  // roster and this list leaves the file GREEN. The pair is what proves the entry is doing the
  // work rather than describing it.
  // WHICH SUITES THOSE ARE, RE-MEASURED, because the sentence here first said SEVEN and said
  // they were all hand-rolled, and both halves were wrong. It is eight — `journal-view-mounted`
  // was missing from the list — and FIVE of the eight are `createMountedComponentHarness`
  // suites: the alchemy view, the app root, the journal view and both inventory suites. Only
  // the three gathering suites are hand-rolled.
  'src/ui/svelte/apps/PlayerViewState.svelte',
  // The identity row every player detail pane leads with (issue 1518): the crafting, inventory and
  // journal trees all render it, so an omission is named here rather than cancelling a suite.
  'src/ui/svelte/apps/PlayerDetailHeader.svelte',
  // The requirement chooser (issue 1518): every tree holding the crafting rail renders it, and it
  // is a new file, so an omission would cancel a suite silently rather than fail it by name.
  'src/ui/svelte/components/RequirementChooser.svelte',
  // The browse pager (issue 1518): every player browse list and the inventory inspector's
  // per-section lists render it, beside the manager's browse screens.
  'src/ui/svelte/components/Pagination.svelte',
  // The routed ladder (issue 1644): crafting's routed tiers and salvage's routed body draw it, and
  // the recipe-item preview carries that salvage body into the manager tree.
  'src/ui/svelte/components/OutcomeLadder.svelte',
  // The dense row (issue 1644): the yield scale, the recipe list and the Journal draw it.
  'src/ui/svelte/components/ListRow.svelte',
  // The cross-reference list over it (issue 2321): the inventory inspector draws it in the player
  // window, and the recipe-item preview carries that inspector into the manager tree.
  'src/ui/svelte/components/XrefList.svelte',
  // A browse list's loading and error forms (issue 2548): the systems library, the environment
  // browser and the Knowledge roster draw it, in every manager tree that mounts one of them.
  'src/ui/svelte/components/ListState.svelte',
  // The yield scale (issue 1644): the gathering find section draws it over the same dense row.
  'src/ui/svelte/components/YieldScale.svelte',
  // The app navigation and its labelled rows (issue 1777): the manager root and the player shell
  // both render the first, and the second is in its static closure wherever it is mounted.
  'src/ui/svelte/components/NavSidebar.svelte',
  'src/ui/svelte/components/NavSidebarRows.svelte',
];

/** Components adjudicated AGAINST membership, and why a non-entry is worth recording. */
const ADJUDICATED_NON_MEMBERS = Object.freeze([
  // The shared vocabulary shell and its panel (issue 1915). They clear the DESIGN-SYSTEM bar at two
  // independent callers, and they are one tree short of THIS list's bar: the two Tags & Categories
  // screens are the only trees that render them, and both are already named by the two suites that
  // mount them. They join the moment a third mounted tree draws a vocabulary panel, which is the
  // overturn condition rather than a preference.
  'src/ui/svelte/apps/manager/VocabularyShell.svelte',
  'src/ui/svelte/apps/manager/VocabularyShellPanel.svelte',
]);

test('a component adjudicated OUT of the shared set is really out of it, and really exists', () => {
  // Two ways this record rots, and both leave it looking like configuration. A path that no
  // longer exists is a ruling about nothing; a path that has since been ADDED above is a ruling
  // the tree has already overturned, and the comment would go on claiming the opposite.
  for (const file of ADJUDICATED_NON_MEMBERS) {
    assert.ok(existsSync(resolve(repoRoot, file)), `${file} is adjudicated and is not on disk`);
    assert.ok(
      !SHARED_PRIMITIVES.includes(file),
      `${file} is recorded as adjudicated OUT of the shared set and is also in it. One of the ` +
        'two is stale, and the list is the one every suite is checked against.'
    );
  }
});

// `import X from './Y.svelte'` — the only form the mount harnesses' temp tree resolves.
const SVELTE_IMPORT = /import\s+\w+\s+from\s+'([^']+\.svelte)'/g;

// A suite declares its temp tree in a `writeCompiledSvelte(…)` argument or a `compiledModules`
// array, roster name or shorthand. A spread is followed one level into the file declaring it, and
// a call on a roster (`NAME.filter(…)`) is not read. Each `compiledModules` key is its own roster.
const WRITE_COMPILED = /writeCompiledSvelte\(\s*([^)]*?)\s*\)/g;
const COMPILED_MODULES = /compiledModules\s*:\s*\[([\s\S]*?)\]/g;
const COMPILED_MODULES_NAME = /compiledModules\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}]|$)/gm;
const COMPILED_MODULES_SHORTHAND = /[{,]\s*compiledModules\s*(?=[,}]|$)/gm;
const SPREAD = /\.\.\.(\w+)/g;
const LOCAL_ARRAY = /const\s+(\w+)\s*=\s*\[([^\]]*)\]/g;
const EXPORTED_ROSTER = /export\s+const\s+(\w+)\s*=\s*Object\.freeze\(\[([^\]]*)\]/g;
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g;
// A template-literal compile inside a loop: writeCompiledSvelte(`prefix/${part}.svelte`).
const TEMPLATE_COMPILE = /^`([^`$]*)\$\{(\w+)\}([^`]*)`$/;
// The SAME compile loop with no template at all.
const BARE_LOOP_COMPILE = /^(\w+)$/;
// Deliberately path-SHAPED rather than `'([^']+)'`. These lists are heavily commented and the
// comments contain apostrophes ("the manager's ONE chip"), which desynchronise naive quote
// pairing and make it read prose as module paths. Requiring no whitespace inside the quotes
// means a stray apostrophe pair can never match, because the text between two of them always
// spans words.
const QUOTED = /'([\w./@-]+)'/g;

const literalsIn = (body) => [...body.matchAll(QUOTED)].map(([, value]) => value);

// A bare identifier element of a roster body: alone between `[`, `,` or a line start and `,` or the
// body's end, so `...NAME`, `NAME(…)` and `NAME.x` are not elements.
const BARE_ELEMENT = /(?:^|[,[])\s*([A-Za-z_$][\w$]*)\s*(?=,|$)/g;
const withoutComments = (text) =>
  text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');

/** The path each bare identifier in a body names, when `text` binds it once to a path literal. */
function constPathsIn(body, text) {
  const paths = [];
  for (const [, name] of withoutComments(body).matchAll(BARE_ELEMENT)) {
    const declaration = new RegExp(
      String.raw`const\s+${name.replaceAll('$', String.raw`\$`)}\s*=\s*(?:'([\w./@-]+)'\s*;)?`,
      'g'
    );
    const declared = [...text.matchAll(declaration)];
    if (declared.length === 1 && declared[0][1]) paths.push(declared[0][1]);
  }
  return paths;
}

const pathsOfBody = (body, text) => [...literalsIn(body), ...constPathsIn(body, text)];

/**
 * One roster per `compiledModules` occurrence, tagged with the line of its key, plus one hand-rolled
 * roster holding every `writeCompiledSvelte(` region, because a hand-rolled suite builds one tree.
 */
function rostersOf(suite, suitePath) {
  const arrays = arraysOf(suite, suitePath);
  const lineOf = (index) => suite.slice(0, index).split('\n').length;

  // A roster passed by name reads as its body when the suite declares it, else as `[...NAME]`.
  const rosterRegion = (name) =>
    arrays.get(name)?.file === suitePath ? arrays.get(name).body : `...${name}`;

  // The list a `for (const <variable> of …)` compile loop iterates, inline or by const name.
  const loopMembers = (variable) => {
    const binding = new RegExp(
      `for\\s*\\(\\s*const\\s+${variable}\\s+of\\s+(\\[[^\\]]*\\]|\\w+)\\s*\\)`
    ).exec(suite);
    if (!binding) return null;
    return literalsIn(
      binding[1].startsWith('[') ? binding[1] : (arrays.get(binding[1])?.body ?? '')
    );
  };

  const pathsOfRegion = (region) => {
    const template = TEMPLATE_COMPILE.exec(region.trim());
    if (template) {
      const [, prefix, variable, suffix] = template;
      return (loopMembers(variable) ?? []).map((member) => `${prefix}${member}${suffix}`);
    }

    // The same loop with whole paths and no template around the variable.
    const bare = BARE_LOOP_COMPILE.exec(region.trim());
    const members = bare ? loopMembers(bare[1]) : null;
    if (members) return members;

    return [...pathsOfBody(region, suite), ...spreadPathsOf(region, arrays, suite, suitePath)];
  };

  const keyed = (line, region) => ({ line, paths: pathsOfRegion(region) });
  const rosters = [
    ...[...suite.matchAll(COMPILED_MODULES)].map(({ index, 1: body }) =>
      keyed(lineOf(index), body)
    ),
    ...[...suite.matchAll(COMPILED_MODULES_NAME)].map(({ index, 1: name }) =>
      keyed(lineOf(index), rosterRegion(name))
    ),
    ...[...suite.matchAll(COMPILED_MODULES_SHORTHAND)].map(({ index, 0: matched }) =>
      keyed(lineOf(index + matched.indexOf('compiledModules')), rosterRegion('compiledModules'))
    ),
  ];

  const handRolled = [...suite.matchAll(WRITE_COMPILED)].map(([, argument]) => argument);
  if (handRolled.length > 0) {
    rosters.push({ line: null, paths: handRolled.flatMap(pathsOfRegion) });
  }
  return rosters;
}

/** The set of component paths a suite actually COMPILES into its temp tree. */
const compiledPathsOf = (suite, suitePath) =>
  rostersOf(suite, suitePath).flatMap(({ paths }) => paths);

/** The paths each `...NAME` in a region resolves to, plus those of NAME's own spreads. */
function spreadPathsOf(region, arrays, suite, suitePath) {
  const textOf = (file) => (file === suitePath ? suite : readFileSync(file, 'utf8'));
  const paths = [];
  for (const [, spread] of region.matchAll(SPREAD)) {
    const array = arrays.get(spread);
    if (!array) continue;
    paths.push(...pathsOfBody(array.body, textOf(array.file)));
    const scope = array.file === suitePath ? arrays : arraysOfFile(array.file);
    for (const [, nested] of array.body.matchAll(SPREAD)) {
      const inner = scope.get(nested);
      if (inner) paths.push(...pathsOfBody(inner.body, textOf(inner.file)));
    }
  }
  return paths;
}

/** A file's arrays by local name: the frozen rosters it imports and the arrays it declares. */
function arraysOf(source, file) {
  const declaredIn = (pattern) =>
    [...source.matchAll(pattern)].map(([, name, body]) => [name, { body, file }]);
  return new Map([
    ...importedArraysOf(source, file),
    ...declaredIn(LOCAL_ARRAY),
    ...declaredIn(EXPORTED_ROSTER),
  ]);
}

const arraysOfFile = (file) => arraysOf(readFileSync(file, 'utf8'), file);

/** The frozen rosters a file imports, keyed by local name and resolved relative to that file. */
function importedArraysOf(source, fromFile) {
  const pairs = [];
  for (const [, names, specifier] of source.matchAll(NAMED_IMPORT)) {
    const resolved = resolve(repoRoot, dirname(fromFile), specifier);
    if (!existsSync(resolved)) continue;
    const declared = new Map(
      [...readFileSync(resolved, 'utf8').matchAll(EXPORTED_ROSTER)].map(([, name, body]) => [
        name,
        { body, file: resolved },
      ])
    );
    for (const raw of names.split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)
        .at(-1);
      if (declared.has(name)) pairs.push([name, declared.get(name)]);
    }
  }
  return pairs;
}

function repoPathsUnder(directory, extension) {
  return readdirSync(resolve(repoRoot, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) =>
      relative(repoRoot, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')
    );
}

function readRepoFile(repoPath) {
  return readFileSync(resolve(repoRoot, repoPath), 'utf8');
}

const componentPaths = repoPathsUnder('src', '.svelte');

const componentImports = new Map(
  componentPaths.map((componentPath) => [
    componentPath,
    [...readRepoFile(componentPath).matchAll(SVELTE_IMPORT)].map(([, specifier]) =>
      posix.normalize(posix.join(posix.dirname(componentPath), specifier))
    ),
  ])
);

function closureOf(componentPath, seen = new Set()) {
  for (const dependency of componentImports.get(componentPath) || []) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    closureOf(dependency, seen);
  }
  return seen;
}

const closures = new Map(componentPaths.map((path) => [path, closureOf(path)]));

/** What one suite's temp trees name, and each shared primitive a tree renders without naming. */
function gapsIn(suitePath, suite) {
  const rosters = rostersOf(suite, suitePath);
  const compiled = new Set(rosters.flatMap(({ paths }) => paths));
  const named = componentPaths.filter((path) => compiled.has(path));
  const gaps = rosters.flatMap(({ line, paths }) => {
    const own = componentPaths.filter((path) => paths.includes(path));
    const where = line === null ? '' : ` (the roster at line ${line})`;
    return SHARED_PRIMITIVES.filter(
      (primitive) =>
        !own.includes(primitive) && own.some((path) => closures.get(path).has(primitive))
    ).map(
      (primitive) =>
        `${suitePath} mounts a tree that renders ${primitive} but never compiles it${where}`
    );
  });
  return { named, gaps };
}

/** Below this many suites resolving a component, the reader has stopped seeing its rosters. */
const RESOLVED_SUITE_FLOOR = 185;
/** Below this many multi-line rosters across the resolved helpers, the capture check went blind. */
const ROSTER_FLOOR = 40;

test('every hand-rolled mount harness names the shared primitives its tree renders', () => {
  const gaps = [];
  let resolved = 0;
  for (const suitePath of repoPathsUnder('tests', '.test.js')) {
    const suite = readRepoFile(suitePath);
    // A suite that compiles nothing cannot hang on a missing component. Matched as a CALL.
    if (!suite.includes('writeCompiledSvelte(') && !suite.includes('compiledModules')) continue;
    const { named, gaps: suiteGaps } = gapsIn(suitePath, suite);
    if (named.length > 0) resolved += 1;
    gaps.push(...suiteGaps);
  }

  assert.ok(
    resolved >= RESOLVED_SUITE_FLOOR,
    `only ${resolved} suites resolve a component, so the reader stopped seeing their rosters`
  );
  assert.deepEqual(
    gaps,
    [],
    `a missing entry HANGS the suite (# cancelled), it does not fail it:\n- ${gaps.join('\n- ')}`
  );
});

const [SELECT, SELECT_HOST] = ['Select', 'BulkEditSelect'].map((name) =>
  SHARED_PRIMITIVES.find((path) => path.endsWith(`/${name}.svelte`))
);
const SYNTHETIC_SUITE = 'tests/components/synthetic-roster.test.js';
// Assembled at run time, so this file holds no roster the live walk above reads.
const syntheticSuite = (...lines) => lines.join('\n').replaceAll('@KEY', 'compiledModules');

test('a roster passed by name or shorthand is read as a spread, and a call on it is not', () => {
  const gapsOf = (...lines) => gapsIn(SYNTHETIC_SUITE, syntheticSuite(...lines));
  const selectGap = `${SYNTHETIC_SUITE} mounts a tree that renders ${SELECT} but never compiles it (the roster at line 2)`;

  const byName = gapsOf(`const TREE = ['${SELECT_HOST}'];`, 'h({ @KEY: TREE });');
  assert.ok(byName.gaps.includes(selectGap), 'a roster passed by name is read');
  const shorthand = gapsOf(`const @KEY = ['${SELECT_HOST}'];`, 'h({ @KEY });');
  assert.ok(shorthand.gaps.includes(selectGap), 'a roster passed by shorthand is read');
  const call = gapsOf(`const TREE = ['${SELECT_HOST}'];`, 'h({ @KEY: TREE.filter(Boolean) });');
  assert.deepEqual(call.named, [], 'a call on a roster stays unread, as the harness test needs');
});

const [BUTTON, ARMED_DANGER_BUTTON, INSPECTOR_CARD] = [
  'Button',
  'ArmedDangerButton',
  'InspectorCard',
].map((name) => SHARED_PRIMITIVES.find((path) => path.endsWith(`/${name}.svelte`)));
const BULK_DELETE_CARD = 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte';
const gapFor = (primitive, line) =>
  `${SYNTHETIC_SUITE} mounts a tree that renders ${primitive} but never compiles it` +
  (line === undefined ? '' : ` (the roster at line ${line})`);
const quoted = (...paths) => paths.map((path) => `'${path}'`).join(', ');

test('a harness roster is checked on its own, so another harness cannot hide its omission', () => {
  const both = syntheticSuite(
    `h({ @KEY: [${quoted(BUTTON, ARMED_DANGER_BUTTON, INSPECTOR_CARD, BULK_DELETE_CARD)}] });`,
    `h({ @KEY: [${quoted(ARMED_DANGER_BUTTON, INSPECTOR_CARD, BULK_DELETE_CARD)}] });`
  );
  assert.deepEqual(gapsIn(SYNTHETIC_SUITE, both).gaps, [gapFor(BUTTON, 2)]);
  assert.ok(
    compiledPathsOf(both, SYNTHETIC_SUITE).includes(BUTTON),
    'the union of both rosters names Button, which is what hid the second roster’s gap'
  );
});

test('a path constant the declaring file binds once is read as its path', () => {
  const card = syntheticSuite(`const CARD = '${BULK_DELETE_CARD}';`, 'h({ @KEY: [CARD] });');
  const rendered = [BUTTON, ARMED_DANGER_BUTTON, INSPECTOR_CARD];
  assert.deepEqual(
    gapsIn(SYNTHETIC_SUITE, card).gaps,
    SHARED_PRIMITIVES.filter((primitive) => rendered.includes(primitive)).map((primitive) =>
      gapFor(primitive, 2)
    )
  );
});

test('an element no single path constant binds is left unread, not failed', () => {
  const unread = {
    'an identifier nothing declares': syntheticSuite('h({ @KEY: [componentPath] });'),
    'a template-literal constant': syntheticSuite(
      `const CARD = \`${BULK_DELETE_CARD}\`;`,
      'h({ @KEY: [CARD] });'
    ),
    'a constant declared twice': syntheticSuite(
      `const CARD = '${BULK_DELETE_CARD}';`,
      `const CARD = '${INSPECTOR_CARD}';`,
      'h({ @KEY: [CARD] });'
    ),
    'a call': syntheticSuite(
      `const component = '${BULK_DELETE_CARD}';`,
      "h({ @KEY: [component('X')] });"
    ),
    'a spread constant': syntheticSuite(
      `const CARD = '${BULK_DELETE_CARD}';`,
      'h({ @KEY: [...CARD] });'
    ),
  };
  for (const [label, suite] of Object.entries(unread)) {
    assert.deepEqual(gapsIn(SYNTHETIC_SUITE, suite).named, [], `${label} stays unread`);
  }
});

test('one hand-rolled temp tree is checked whole, whichever call compiles each component', () => {
  const calls = [BUTTON, ARMED_DANGER_BUTTON, INSPECTOR_CARD, BULK_DELETE_CARD].map(
    (path) => `writeCompiledSvelte('${path}');`
  );
  assert.deepEqual(gapsIn(SYNTHETIC_SUITE, syntheticSuite(...calls)).gaps, []);
});

test('a spread roster is followed one level into the file that declares it', () => {
  const spreading = (name, helper) =>
    syntheticSuite(`import { ${name} } from '../helpers/${helper}';`, `h({ @KEY: [...${name}] });`);

  const unread = [
    ['CRAFTING_APP_COMPILED_MODULES', 'svelte-component-harness.js'],
    ['SCOPED_SHARED_COMPILED_MODULES', 'componentScopeMountModules.js'],
  ].filter(
    ([name, helper]) => !compiledPathsOf(spreading(name, helper), SYNTHETIC_SUITE).includes(SELECT)
  );
  assert.deepEqual(unread, [], 'each reaches Select only through a nested SELECT_COMPILED_MODULES');
});

test('every inspected suite resolves at least one real component, so none passes vacuously', () => {
  // The RATCHET on the guard above.
  const unreadable = [];
  for (const suitePath of repoPathsUnder('tests', '.test.js')) {
    const suite = readRepoFile(suitePath);
    // The same CALL form as the guard above.
    if (!suite.includes('writeCompiledSvelte(') && !suite.includes('compiledModules')) continue;
    if (suite.includes('createMountedComponentHarness')) continue;
    // The scoped-screen factories (`tests/helpers/componentScopeMountModules.js`) hand a suite
    // its `compiledModules` as a RETURN VALUE, not as a literal it declares, and they carry
    // their own closure exactly as `createMountedComponentHarness` does — so a suite that only
    // reads that manifest back (issue 1371's rendered catalogue suite walks it for scoped
    // `<style>` blocks) names no path this parser can read, and is not vacuous for it.
    if (suite.includes('componentScopeMountModules.js')) continue;

    const compiled = new Set(compiledPathsOf(suite, suitePath));
    if (!componentPaths.some((path) => compiled.has(path))) unreadable.push(suitePath);
  }

  assert.deepEqual(
    unreadable,
    [],
    'these suites compile components the parser cannot read, so the guard above holds over an ' +
      'empty set for them and reports clean whatever they render:\n- ' +
      unreadable.join('\n- ')
  );
});

// The declared APPLICATION ROOTS a shared primitive may live under.
const APPLICATION_ROOTS = [
  'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
  'src/ui/svelte/apps/gathering/GatheringView.svelte',
  'src/ui/svelte/apps/FabricateAppRoot.svelte',
];

test('the shared primitives are reachable from a declared application root, so the guard has teeth', () => {
  // If this ever stops holding, the guard above is vacuous and the walk needs revisiting.
  const rootClosures = APPLICATION_ROOTS.map((root) => {
    const closure = closures.get(root);
    assert.ok(closure, `${root} is a tracked component`);
    return closure;
  });
  for (const primitive of SHARED_PRIMITIVES) {
    assert.ok(
      rootClosures.some((closure) => closure.has(primitive)),
      `${primitive} should be reachable from at least one declared application root`
    );
  }
});

test('a shared component two application roots render is adjudicated, in or out', () => {
  // The guard above fires only for a suite that compiles a tree holding a listed primitive but not
  // the primitive, so an entry every suite already compiles could be dropped without a failure.
  // This clause is what makes dropping one fail by name (issue 1782).
  const rootClosures = APPLICATION_ROOTS.map((root) => closures.get(root));
  const adjudicated = new Set([...SHARED_PRIMITIVES, ...ADJUDICATED_NON_MEMBERS]);
  const shared = componentPaths.filter(
    (path) =>
      /^src\/ui\/svelte\/components\/[^/]+\.svelte$/.test(path) &&
      rootClosures.filter((closure) => closure.has(path)).length >= 2
  );
  assert.ok(
    shared.includes('src/ui/svelte/components/SetPicker.svelte') && shared.length >= 20,
    `only ${shared.length} components are reachable from two roots, so the walk stopped seeing them`
  );
  assert.deepEqual(
    shared.filter((path) => !adjudicated.has(path)),
    [],
    'these components render under two application roots, so a mounted suite of either tree can ' +
      'hang on them; add each to SHARED_PRIMITIVES, or record why not in ADJUDICATED_NON_MEMBERS'
  );
});

// A COMMENT INSIDE A ROSTER IS INSIDE THAT ROSTER'S CAPTURED BODY (issue 1514).
const ROSTER_HELPERS = Object.freeze([
  'tests/helpers/svelte-component-harness.js',
  'tests/helpers/checksHarnessModules.js',
  'tests/helpers/componentEditViewModules.js',
  'tests/helpers/rollPromptHarnessModules.js',
  'tests/helpers/componentScopeMountModules.js',
]);

/** Every file a compiling suite's imported rosters are declared in, at either spread level. */
function rosterSources() {
  const sources = new Set();
  for (const suitePath of repoPathsUnder('tests', '.test.js')) {
    const suite = readRepoFile(suitePath);
    if (!suite.includes('writeCompiledSvelte(') && !suite.includes('compiledModules')) continue;
    for (const [, { file }] of importedArraysOf(suite, suitePath)) {
      sources.add(file);
      for (const [, nested] of arraysOfFile(file)) sources.add(nested.file);
    }
  }
  return [...sources].map((file) => relative(repoRoot, file).replaceAll('\\', '/'));
}

/** How many multi-line rosters a helper exports, and each the reader captures short. */
function truncatedRostersIn(sourcePath) {
  const source = readRepoFile(sourcePath);
  const rosterNames = [...source.matchAll(/^export const (\w+) = Object\.freeze\(\[$/gm)].map(
    ([, name]) => name
  );

  // Ground truth is one quoted path per line inside the declaration.
  const declaredPathsOf = (name) => {
    const start = source.indexOf(`export const ${name} = Object.freeze([`);
    const end = source.indexOf('\n]);', start);
    assert.ok(end > start, `${name} is a frozen array literal closed by ']);'`);
    return [...source.slice(start, end).matchAll(/^\s*'([\w./@-]+)',?\s*$/gm)].map(([, p]) => p);
  };

  // The real reader, driven through a synthetic file beside the helper that imports every roster.
  const resolved = new Map(
    importedArraysOf(
      `import { ${rosterNames.join(', ')} } from './${posix.basename(sourcePath)}';`,
      sourcePath
    )
  );

  const truncated = [];
  for (const name of rosterNames) {
    const declared = declaredPathsOf(name);
    const roster = resolved.get(name);
    if (roster === undefined) {
      truncated.push(`${sourcePath}: ${name} was not resolved by importedArraysOf at all`);
      continue;
    }
    const captured = literalsIn(roster.body);
    const missing = declared.filter((path) => !captured.includes(path));
    if (missing.length > 0) {
      truncated.push(
        `${sourcePath}: ${name} resolves ${captured.length} of ${declared.length} paths; ` +
          `a bracket character in its comments truncated the capture before ${missing.join(', ')}`
      );
    }
  }
  return { rosters: rosterNames.length, truncated };
}

test('every exported roster the guard reader resolves through is captured whole', () => {
  const sources = rosterSources();
  assert.deepEqual(
    ROSTER_HELPERS.filter((helper) => !sources.includes(helper)),
    [],
    'the reader no longer resolves through these roster helpers, so this clause stopped seeing them'
  );

  const results = sources.map(truncatedRostersIn);
  const rosters = results.reduce((total, { rosters: count }) => total + count, 0);
  assert.ok(rosters >= ROSTER_FLOOR, `expected at least ${ROSTER_FLOOR} rosters, found ${rosters}`);

  const truncated = results.flatMap((result) => result.truncated);
  assert.deepEqual(
    truncated,
    [],
    'a closing bracket inside a roster comment silently narrows the naming guard above:\n- ' +
      truncated.join('\n- ')
  );
});

// The picker's two pure leaves, which every harness that mounts a picker names together. The
// closure walk above quantifies over `.svelte` shared primitives, so it cannot see a roster that
// names one `.js` module and not the other, and that omission cancels the suite silently. Each is
// imported by `components/SearchablePopover.svelte` alone, which is what makes the two rosters'
// requirement sets identical rather than merely similar.
const CO_LOCATED_PICKER_MODULES = Object.freeze([
  'src/ui/svelte/util/listboxNavigation.js',
  'src/ui/svelte/util/pickerOptionModel.js',
]);

test('a roster naming one of the picker’s two leaf modules names the other', () => {
  // Anchored on the opening quote, so a relative import specifier — the unit tests' own
  // `'../../src/ui/svelte/util/listboxNavigation.js'` — is not read as a roster entry. Symmetric by
  // construction: either leaf named alone counts the roster and is checked against the full set.
  const quoted = CO_LOCATED_PICKER_MODULES.map((path) => `'${path}'`);
  const gaps = [];
  let rosters = 0;
  for (const file of repoPathsUnder('tests', '.js')) {
    const source = readRepoFile(file);
    const named = quoted.filter((entry) => source.includes(entry));
    if (named.length === 0) continue;
    rosters += 1;
    if (named.length !== quoted.length) gaps.push(file);
  }

  assert.ok(
    rosters >= 30,
    `only ${rosters} files name a picker leaf module as a roster entry, so this clause has ` +
      'lost most of its domain and would pass over an almost empty set'
  );
  assert.deepEqual(
    gaps,
    [],
    'these rosters name one of the picker’s two leaf modules and not the other, so a suite that ' +
      `opens a picker hangs (# cancelled) instead of failing:\n- ${gaps.join('\n- ')}`
  );
});
