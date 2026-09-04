/*
 * NO COMPONENT MAY HARD-CODE AN APPLICATION ROOT AS ITS PORTAL HOST (issue 1466).
 *
 * This is the SCRIPT half of the rule `searchable-popover-area-scope.test.js` enforces for CSS,
 * and it is deliberately general where that one is about a single primitive. The CSS gate asks
 * that no rule the picker owns be rooted at an application root; this one asks that no component
 * anywhere decide WHERE ITS OVERLAY LIVES by naming one.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────
 * Six components each wrote `closest('.fabricate-manager')` to find their portal host, and a
 * seventh wrote the worse variant, `document.querySelector('.fabricate-manager')`. Three of the
 * six lived in `src/ui/svelte/components/`, the shared directory whose premise is that a
 * component there works wherever it is mounted.
 *
 * Outside the manager the ancestor form returns null: the portal no-ops while the positioning
 * pass falls back to viewport coordinates, and the panel draws in the wrong place with identical
 * markup and no error. The document-wide form is worse rather than better — it finds the manager
 * window WHEREVER IT IS, so a dialog opened from another application portals itself into a
 * different window entirely.
 *
 * ── WHY IT NEEDS A GATE ─────────────────────────────────────────────────────────────────────
 * `closest('.fabricate-manager')` is what a reasonable author writes. Every existing manager
 * surface works, the manager is where these components are used today, and nothing in the
 * repository fails — the failure is a panel's POSITION in an application that does not exist yet.
 * The defect reappeared six times for exactly that reason, and the seventh occurrence would cost
 * one line to add.
 *
 * ── WHAT MAKES THIS NOT VACUOUS ─────────────────────────────────────────────────────────────
 * This is an ABSENCE gate over two derived populations, so either could silently go empty and
 * leave it passing while examining nothing. Both are floored, and the shipped tree has ZERO
 * offenders, which means the interesting number is not "how many did we find" but "did the
 * scanner still find anything AT ALL to look at":
 *
 *   1. The application-root vocabulary is read out of the APPLICATIONS — their ApplicationV2
 *      `classes` arrays and the root element each one's Svelte root component renders — not from
 *      a list here. A list would rot the moment an application is added.
 *   2. The portal population is read out of the corpus: every file that imports the portal action
 *      or hands a portal target to one that does.
 *   3. The SELECTOR EXTRACTOR is floored on the calls it finds, not on the offences. After the
 *      fix there are no offending calls at all, so a pattern that quietly stopped matching would
 *      report a clean tree. The floor is on the host lookups those files still legitimately make,
 *      which proves the scanner is still reading. Issue 1500 took most of them out of this
 *      population — the three `closest()` clipping walks became a `bounds` value resolved inside
 *      `actions/anchoredPopover.js` from a selector it is handed — so the two that remain are
 *      named individually below rather than merely counted.
 *   4. The detector is proved to fire on a synthetic offender and not to fire on a shipped
 *      selector, so a predicate rewritten to match everything or nothing reds here rather than
 *      greening the assertion below.
 *   5. A positive ADOPTION clause, because "nobody hard-codes a root" is also satisfied by
 *      deleting every portal in the repository.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { collectWorkingTreeSources, repoRoot, stripComments } from '../helpers/sourceScan.js';
import { OVERLAY_HOST_ROOT_CLASSES } from '../../src/ui/svelte/util/overlayHost.js';

/** The one module allowed to name an application root: the shared resolver itself. */
const RESOLVER = 'src/ui/svelte/util/overlayHost.js';
const RESOLVER_FUNCTION = 'resolveOverlayHost';
/** The action itself, whose own `anchoredPopover(node, …)` signature is not an adoption of it. */
const ANCHORED_POPOVER = 'src/ui/svelte/actions/anchoredPopover.js';
const PORTAL_ACTION = 'actions/portal.js';
/**
 * The THIRD portal route (issue 1500). Five overlays no longer name `portal.js` at all: they
 * `use:anchoredPopover`, which resolves the host and portals on their behalf. Without this the
 * population would silently shed them and this gate would guard the two that stayed behind.
 */
const ANCHORED_POPOVER_ACTION = 'actions/anchoredPopover.js';

const byName = (a, b) => a.localeCompare(b);
const read = (file) => readFileSync(join(repoRoot, file), 'utf8');

/**
 * Every class that identifies a Fabricate application's own root element.
 *
 * Derived from the applications, in the two layers a Foundry app actually has: the `classes`
 * ApplicationV2 puts on the window FRAME, and the class the Svelte root component renders on the
 * element INSIDE the window content. Both are roots for this purpose — a portal host hard-coded
 * to either pins the component to one application.
 *
 * @returns {Set<string>} The application-root vocabulary.
 */
function applicationRootClasses() {
  const uiDir = join(repoRoot, 'src/ui');
  const appFiles = readdirSync(uiDir).filter((file) => file.endsWith('.svelte.js'));
  const classes = new Set(OVERLAY_HOST_ROOT_CLASSES);
  const rootComponents = new Set();

  for (const file of appFiles) {
    const source = read(`src/ui/${file}`);
    for (const array of source.matchAll(/classes:\s*\[([^\]]*)\]/g)) {
      for (const literal of array[1].matchAll(/['"]([^'"]+)['"]/g)) classes.add(literal[1]);
    }
    for (const imported of source.matchAll(/import\s+\w+\s+from\s+['"](\.[^'"]+Root\.svelte)['"]/g)) {
      rootComponents.add(resolve(uiDir, imported[1]));
    }
  }

  for (const component of rootComponents) {
    const source = readFileSync(component, 'utf8');
    // The first element after the script block is the component's root element.
    const markup = source.slice(source.lastIndexOf('</script>'));
    const rootElement = markup.match(/<\w+[^>]*\sclass="([^"{]+)"/);
    if (rootElement) for (const cls of rootElement[1].split(/\s+/)) classes.add(cls);
  }

  return classes;
}

/**
 * Every `src/ui` file that portals something, or hands a portal target to a file that does.
 *
 * Membership is what makes a hard-coded root an OFFENCE rather than a legitimate lookup: the
 * manager's own root component queries `.fabricate-manager` to rescue focus into its live region,
 * which is a component naming ITS OWN root and is nobody else's business. The same string in a
 * portal host is the defect.
 *
 * @param {Record<string, string>} corpus Working-tree sources.
 * @returns {string[]} Sorted file paths.
 */
function portalingFiles(corpus) {
  return Object.entries(corpus)
    .filter(
      ([, text]) =>
        text.includes(PORTAL_ACTION) ||
        text.includes(ANCHORED_POPOVER_ACTION) ||
        text.includes('portalTarget')
    )
    .map(([file]) => file)
    .sort(byName);
}

/**
 * Every DOM lookup made from a string-literal selector, with its position.
 *
 * `closest`, `querySelector` and `querySelectorAll` are the three ways a component locates
 * another element by name, and all three have been used as a portal host at some point in this
 * codebase's history.
 *
 * @param {string} text Source with comments already blanked.
 * @returns {Array<{call: string, selector: string}>}
 */
function selectorLookups(text) {
  const found = [];
  const pattern = /\.(closest|querySelectorAll|querySelector)\(\s*(['"`])([^'"`]*)\2/g;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push({ call: match[1], selector: match[3] });
    match = pattern.exec(text);
  }
  return found;
}

/** The class names a selector string mentions. */
const classesIn = (selector) => [...selector.matchAll(/\.([\w-]+)/g)].map((entry) => entry[1]);

/**
 * Does this selector name an application root?
 *
 * @param {string} selector A CSS selector string from a DOM lookup.
 * @param {Set<string>} roots The application-root vocabulary.
 * @returns {string[]} The roots it names; empty when it names none.
 */
function applicationRootsNamedBy(selector, roots) {
  return classesIn(selector).filter((cls) => roots.has(cls));
}

const corpus = collectWorkingTreeSources(['src/ui'], ['.js', '.svelte']);
const stripped = Object.fromEntries(
  Object.entries(corpus).map(([file, text]) => [file, stripComments(text)])
);

test('the application-root vocabulary is derived from the applications themselves', () => {
  const roots = applicationRootClasses();

  for (const anchor of [
    // One window class and one Svelte-root class from each of the two applications that can host
    // an overlay, so a derivation that loses either LAYER reds rather than silently narrowing.
    'fabricate-app',
    'fabricate-app-shell',
    'crafting-system-manager',
    'fabricate-manager',
  ]) {
    assert.ok(
      roots.has(anchor),
      `\`${anchor}\` is no longer in the derived application-root set. Either an application was ` +
        'renamed — retarget this gate — or the derivation has stopped reading one of its two ' +
        'layers, in which case the assertions below are policing a smaller vocabulary than they ' +
        `claim. Derived: ${[...roots].sort(byName).join(', ')}`
    );
  }

  assert.ok(
    roots.size >= 10,
    `only ${roots.size} application-root classes were derived. Seven applications contribute ` +
      'thirteen; a collapse to a handful means the reader is finding one layer and not the other.'
  );
});

test('the portal population is the set of components that actually portal', () => {
  const files = portalingFiles(corpus);

  for (const anchor of [
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    // Reached through the `portalTarget` PROP rather than the action, which is the second route
    // into this population and the one a membership test written around imports alone would miss.
    'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
  ]) {
    assert.ok(
      files.includes(anchor),
      `${anchor} portals an overlay but is not in the scanned population, so nothing below ` +
        `examines it. Found: ${files.join(', ')}`
    );
  }

  assert.ok(
    files.length >= 9,
    `only ${files.length} files were detected as portaling. Nine do since issue 1500 re-keyed ` +
      'five of them onto the anchored-popover action; a lower number means the membership test ' +
      'has narrowed and this gate is guarding a subset.'
  );
});

test('the selector extractor still finds the host lookups it reads', () => {
  // THE LOAD-BEARING FLOOR. The shipped tree has zero offences, so every offence-counting
  // assertion here passes trivially — including one whose pattern has stopped matching anything
  // at all. What proves the scanner is alive is the lookups these files legitimately still make:
  // the horizontal-bounds walks (`closest('.admin-main, .manager-main, …')`) and friends.
  const files = portalingFiles(corpus);
  const lookups = files.flatMap((file) => selectorLookups(stripped[file]));

  // NAMED, not merely counted. Two literal-selector lookups survive in this population after
  // issue 1500, so a bare floor of two would be satisfied by two lookups of any kind — including
  // two the extractor found by accident. These are the shipped pair: the biome picker's own
  // clipping walk, which is the LAST `closest()` here and the one the clause below reads, and the
  // icon picker's row measurement.
  for (const anchor of ['.manager-main', '.essence-icon-picker-option']) {
    assert.ok(
      lookups.some((lookup) => lookup.selector === anchor),
      `the extractor no longer finds the shipped lookup for \`${anchor}\`, so the absence ` +
        'assertion below is holding over an empty set rather than a clean one. Found: ' +
        lookups.map((lookup) => `${lookup.call}('${lookup.selector}')`).join(', ')
    );
  }

  assert.ok(
    lookups.length >= 2,
    `the extractor found only ${lookups.length} selector lookups across ${files.length} portaling ` +
      'files. Two ship; a number this low means the pattern no longer matches the code.'
  );

  assert.ok(
    lookups.some((lookup) => lookup.call === 'closest'),
    'no `closest(...)` lookup was found in any portaling file, which is the exact call shape the ' +
      'defect took. The extractor is not reading what it claims to.'
  );
});

test('the application-root detector fires', () => {
  const roots = applicationRootClasses();

  assert.deepEqual(
    applicationRootsNamedBy('.fabricate-manager', roots),
    ['fabricate-manager'],
    'the detector no longer recognises the exact selector the defect was written with, so this ' +
      'gate cannot see the regression it exists to catch'
  );
  assert.deepEqual(
    applicationRootsNamedBy('.manager-main, .manager-table-scroll', roots),
    [],
    'the detector flags a shipped, legitimate lookup — a scroller inside the app, not the app ' +
      'root. It would red on the tree as it stands and be "fixed" by deleting it.'
  );
  assert.deepEqual(
    applicationRootsNamedBy('.essence-icon-picker-popover', roots),
    [],
    'the detector matches a plain component class, so it is deciding on the wrong population'
  );
});

test('no component hard-codes an application root as a portal host', () => {
  const roots = applicationRootClasses();
  const offenders = [];

  for (const file of portalingFiles(corpus)) {
    if (file === RESOLVER) continue;
    for (const { call, selector } of selectorLookups(stripped[file])) {
      const named = applicationRootsNamedBy(selector, roots);
      if (named.length > 0) offenders.push(`${file}: .${call}('${selector}') names ${named.join(', ')}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'these components decide where their overlay lives by naming an application root, so each ' +
      'one works in exactly one application and silently mispositions its panel in every other — ' +
      'the defect issue 1466 removed from six components at once:\n  ' +
      offenders.join('\n  ') +
      `\n\nResolve the host from the component's own node instead: ` +
      `\`${RESOLVER_FUNCTION}(node)\` from ${RESOLVER}, which walks up to the nearest ` +
      'application root and reports it when there is none.'
  );
});

test('every portal target is resolved through the shared resolver or handed in by its caller', () => {
  // THE POSITIVE HALF. Absence alone is also satisfied by a tree with no portals in it, and by a
  // component that invents a third way to find a host — walking `parentElement` twice, say — which
  // names no root and would pass the clause above while reintroducing the same coupling.
  const targets = [];
  const unresolved = [];

  for (const [file, text] of Object.entries(corpus)) {
    if (file === RESOLVER || file === ANCHORED_POPOVER) continue;
    const source = stripComments(text);
    // The anchored-popover action resolves the host through `resolveOverlayHost` itself, so a
    // caller that uses it is adopted BY CONSTRUCTION and has no expression to examine. Counting
    // those uses is what keeps this adoption clause from collapsing as the callers convert.
    for (const use of source.matchAll(/use:anchoredPopover=|anchoredPopover\(\w/g)) {
      targets.push(`${file}: ${use[0]}`);
    }
    for (const use of source.matchAll(/use:portal=\{([^}]*)\}/g)) {
      const expression = use[1].trim();
      targets.push(`${file}: ${expression}`);

      // Either the expression resolves the host itself, or it calls a local function that does,
      // or it is a bare identifier — a prop the caller supplies, which is the sanctioned way for
      // a presentational panel to be told its host.
      const callee = expression.match(/\(?\w*\)?\s*=>\s*(\w+)\(/)?.[1];
      const calleeBody = callee
        ? source.slice(source.indexOf(`function ${callee}(`)).slice(0, 400)
        : '';
      const resolved =
        expression.includes(RESOLVER_FUNCTION) ||
        calleeBody.includes(RESOLVER_FUNCTION) ||
        /^[\w.]+$/.test(expression);
      if (!resolved) unresolved.push(`${file}: use:portal={${expression}}`);
    }
  }

  assert.ok(
    targets.length >= 7,
    `only ${targets.length} portaled overlays were found across the corpus. Eight ship — two ` +
      'through `use:portal` and six through the anchored-popover action; a lower number means ' +
      'this clause is confirming adoption across a set that has gone empty.'
  );

  assert.deepEqual(
    unresolved,
    [],
    'these portal targets neither resolve their host through the shared resolver nor receive it ' +
      'from their caller, so each one is deciding for itself where an overlay lives — which is ' +
      'the coupling issue 1466 removed, in whatever spelling it has been rewritten as:\n  ' +
      unresolved.join('\n  ')
  );
});
