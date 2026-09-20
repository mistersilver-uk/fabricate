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
  'src/ui/svelte/apps/manager/ManagerModal.svelte',
  // The manager's ONE "how this surface works" explainer card and ONE icon fact row
  // (issue 881). Both are side-panel primitives, so the Tool Studio and the Tags &
  // Categories rail already pull them into two different mounted trees and the next
  // side panel will pull them into a third.
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  // The manager's ONE chip (issue 883). This is the sharpest case yet.
  'src/ui/svelte/components/Chip.svelte',
  // The manager's ONE multi-select toolbar and ONE bulk-edit chrome (issue 1010).
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
  // THE APP'S ONE SELECT (issue 1504). It is the widest-reaching arrival on this list since
  // `EmptyState`: three shared components render it — `Pagination`, `BulkEditSelect` and
  // `EntityListInspectorFrame` — so it is in the static closure of every suite that mounts a
  // tree holding a pager, a bulk panel or a scoped catalogue, which is most of them. And it
  // pulls `SearchablePopover` in behind it, which is exactly the silent fan-out this list
  // exists to turn into a named failure.
  'src/ui/svelte/components/Select.svelte',
  // THE right-inspector action button (issue 1036, maintainer round 2).
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  // The product's ONE horizontal fill bar, ONE row disclosure and ONE ordered list (issue 1512).
  // The list reaches five manager surfaces at once, and it renders the disclosure and the icon
  // button behind it, so a tree holding any converted list pulls three primitives in.
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/SortableList.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
  // THE manager's labelled push-button (issue 1096). It is the sharpest entry on this list
  // after `Chip`: `manager-button` is a CSS convention repeated across more than sixty
  // components, so every step of the conversion sweep drops this primitive into another
  // mounted tree. Two screens use it today — the Modifiers card in `SystemEditView` and the
  // Tool Studio header, which is the authority the primitive reproduces — and they already
  // sit in four different mounted trees between them.
  'src/ui/svelte/components/ManagerButton.svelte',
  // THE manager's icon-only push-button (issue 1422).
  'src/ui/svelte/components/IconButton.svelte',
  // THE manager's editor tab strip (issue 1362).
  'src/ui/svelte/components/EditorTabs.svelte',
  // THE manager's on/off switch (issue 1040). Sharper again than `ManagerButton`.
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
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
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
];

/** Components adjudicated AGAINST membership, and why a non-entry is worth recording. */
const ADJUDICATED_NON_MEMBERS = Object.freeze([]);

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

// The three forms a suite uses to DECLARE what its temp tree compiles.
const WRITE_COMPILED = /writeCompiledSvelte\(\s*([^)]*?)\s*\)/g;
const COMPILED_MODULES = /compiledModules\s*:\s*\[([\s\S]*?)\]/g;
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

/** The set of component paths a suite actually COMPILES into its temp tree. */
function compiledPathsOf(suite) {
  // `const NAME = [ … ]` — the backing array for both `...NAME` spreads inside a
  // `compiledModules` list and `for (const x of NAME)` compile loops.
  const arrays = new Map([
    ...importedArraysOf(suite),
    ...[...suite.matchAll(/const\s+(\w+)\s*=\s*\[([^\]]*)\]/g)].map(([, name, body]) => [
      name,
      body,
    ]),
  ]);
  const literalsIn = (body) => [...body.matchAll(QUOTED)].map(([, value]) => value);

  const declared = [];
  const regions = [
    ...[...suite.matchAll(WRITE_COMPILED)].map(([, argument]) => argument),
    ...[...suite.matchAll(COMPILED_MODULES)].map(([, body]) => body),
  ];

  // The list a `for (const <variable> of …)` compile loop iterates, inline or by const name.
  const loopMembers = (variable) => {
    const binding = new RegExp(
      `for\\s*\\(\\s*const\\s+${variable}\\s+of\\s+(\\[[^\\]]*\\]|\\w+)\\s*\\)`
    ).exec(suite);
    if (!binding) return null;
    return literalsIn(binding[1].startsWith('[') ? binding[1] : (arrays.get(binding[1]) ?? ''));
  };

  for (const region of regions) {
    const template = TEMPLATE_COMPILE.exec(region.trim());
    if (template) {
      // A compile loop. The iterated list is either inline.
      const [, prefix, variable, suffix] = template;
      const members = loopMembers(variable);
      if (!members) continue;
      for (const member of members) declared.push(`${prefix}${member}${suffix}`);
      continue;
    }

    const bare = BARE_LOOP_COMPILE.exec(region.trim());
    if (bare) {
      // The same loop with whole paths and no template around the variable.
      for (const member of loopMembers(bare[1]) ?? []) declared.push(member);
      continue;
    }

    for (const value of literalsIn(region)) declared.push(value);
    // `compiledModules: [...SHARED, 'one/more.svelte']`.
    for (const [, spread] of region.matchAll(/\.\.\.(\w+)/g)) {
      for (const value of literalsIn(arrays.get(spread) ?? '')) declared.push(value);
    }
  }

  return declared;
}

/**
 * Backing arrays a suite IMPORTS, keyed by the local name it spreads them under.
 * @param {string} suite Source text of the suite.
 * @returns {Array<[string, string]>} `[localName, arrayBody]` pairs.
 */
function importedArraysOf(suite) {
  const pairs = [];
  for (const [, names, specifier] of suite.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
    const resolved = resolve(repoRoot, 'tests/components', specifier);
    if (!existsSync(resolved)) continue;
    const source = readFileSync(resolved, 'utf8');
    const declared = new Map(
      [...source.matchAll(/export\s+const\s+(\w+)\s*=\s*Object\.freeze\(\[([^\]]*)\]/g)].map(
        ([, name, body]) => [name, body]
      )
    );
    for (const raw of names.split(',')) {
      const name = raw.trim().split(/\s+as\s+/).at(-1);
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

test('every hand-rolled mount harness names the shared primitives its tree renders', () => {
  const suitePaths = repoPathsUnder('tests', '.test.js');
  const gaps = [];

  for (const suitePath of suitePaths) {
    const suite = readRepoFile(suitePath);
    // A suite that compiles nothing cannot hang on a missing component. Matched as a CALL.
    if (!suite.includes('writeCompiledSvelte(') && !suite.includes('compiledModules')) continue;

    const compiled = new Set(compiledPathsOf(suite));
    const named = componentPaths.filter((path) => compiled.has(path));
    const required = new Set(
      SHARED_PRIMITIVES.filter(
        (primitive) =>
          !named.includes(primitive) &&
          named.some((path) => closures.get(path).has(primitive))
      )
    );

    for (const primitive of required) {
      gaps.push(`${suitePath} mounts a tree that renders ${primitive} but never compiles it`);
    }
  }

  assert.deepEqual(
    gaps,
    [],
    `a missing entry HANGS the suite (# cancelled), it does not fail it:\n- ${gaps.join('\n- ')}`
  );
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

    const compiled = new Set(compiledPathsOf(suite));
    if (!componentPaths.some((path) => compiled.has(path))) unreadable.push(suitePath);
  }

  assert.deepEqual(
    unreadable,
    [],
    'these suites compile components the parser cannot read, so the guard above holds over an '
      + 'empty set for them and reports clean whatever they render:\n- '
      + unreadable.join('\n- ')
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

// A COMMENT INSIDE A ROSTER IS INSIDE THAT ROSTER'S CAPTURED BODY (issue 1514).
const HARNESS_ROSTER_SOURCE = 'tests/helpers/svelte-component-harness.js';

test('every exported roster in the shared harness resolves whole through the guard reader', () => {
  const source = readRepoFile(HARNESS_ROSTER_SOURCE);
  const rosterNames = [...source.matchAll(/^export const (\w+) = Object\.freeze\(\[$/gm)].map(
    ([, name]) => name
  );
  assert.ok(
    rosterNames.length >= 8,
    `expected the harness to export its module rosters as frozen arrays, found ${rosterNames.length}`
  );

  // Ground truth is one quoted path per line inside the declaration.
  const declaredPathsOf = (name) => {
    const start = source.indexOf(`export const ${name} = Object.freeze([`);
    const end = source.indexOf('\n]);', start);
    assert.ok(end > start, `${name} is a frozen array literal closed by ']);'`);
    return [...source.slice(start, end).matchAll(/^\s*'([\w./@-]+)',?\s*$/gm)].map(([, p]) => p);
  };

  // The real reader, driven through a synthetic suite that imports every roster by name.
  const resolved = new Map(
    importedArraysOf(
      `import { ${rosterNames.join(', ')} } from '../helpers/svelte-component-harness.js';`
    )
  );

  const truncated = [];
  for (const name of rosterNames) {
    const declared = declaredPathsOf(name);
    const body = resolved.get(name);
    if (body === undefined) {
      truncated.push(`${name} was not resolved by importedArraysOf at all`);
      continue;
    }
    const captured = [...body.matchAll(QUOTED)].map(([, value]) => value);
    const missing = declared.filter((path) => !captured.includes(path));
    if (missing.length) {
      truncated.push(
        `${name} resolves ${captured.length} of ${declared.length} declared paths; ` +
          `a bracket character in its comments truncated the capture before ${missing.join(', ')}`
      );
    }
  }

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
