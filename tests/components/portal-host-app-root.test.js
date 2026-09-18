/*
 * NO COMPONENT MAY HARD-CODE AN APPLICATION ROOT AS ITS PORTAL HOST (issue 1466).
 *   2. The portal population is read out of the corpus: every file that imports the portal action
 *      or the anchored-popover action, or owns the clipping selectors they pass. Read from CODE —
 *      the corpus is scanned with its comments blanked, so prose about a portal never joins a
 *      population this gate floors.
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
/** The THIRD portal route (issue 1500). Six overlays no longer name `portal.js` at all. */
const ANCHORED_POPOVER_ACTION = 'actions/anchoredPopover.js';
/** The module that now HOLDS the clipping selectors (issue 1500), and the reason it is scanned. */
const OVERLAY_BOUNDS = 'src/ui/svelte/util/overlayBounds.js';
const OVERLAY_BOUNDS_MODULE = 'util/overlayBounds.js';

const byName = (a, b) => a.localeCompare(b);
const read = (file) => readFileSync(join(repoRoot, file), 'utf8');

/**
 * Every class that identifies a Fabricate application's own root element.
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
 * Every `src/ui` file that portals something, or owns the clipping selectors those files pass.
 *
 * @param {Record<string, string>} sources Working-tree sources with comments blanked.
 * @returns {string[]} Sorted file paths.
 */
function portalingFiles(sources) {
  return Object.entries(sources)
    .filter(
      ([file, text]) =>
        file === OVERLAY_BOUNDS ||
        text.includes(PORTAL_ACTION) ||
        text.includes(ANCHORED_POPOVER_ACTION) ||
        text.includes(OVERLAY_BOUNDS_MODULE)
    )
    .map(([file]) => file)
    .sort(byName);
}

/**
 * Every DOM lookup made from a string-literal selector, with its position.
 *   - `(?:\?\.)?\(` — an OPTIONAL call. `menuRoot?.querySelector?.('button')` is what a
 *     component writes when the node may not be mounted yet, and `ActionMenu` and
 *     `SearchablePopover` both write it. A pattern demanding a bare `(` read
 *     `null?.querySelector?.('.fabricate-manager')` as no lookup at all.
 *   - the argument may contain the OPPOSITE quote. A selector is CSS, and CSS attribute values
 *     are quoted: `querySelectorAll('[role="menuitem"]:not([disabled])')` is one shipped call
 *     that a `[^'"`]*` body could not reach past its second character. Each alternative below
 *     therefore excludes only its OWN delimiter, so `closest('[role="x"] .fabricate-manager')`
 *     — an offence written the way a real selector is written — is read rather than skipped.
 * The bodies stop at a newline. A selector never spans one, and an unterminated quote would
 * otherwise swallow the rest of the file and report it as one enormous selector.
 *
 * @param {string} text Source with comments already blanked.
 * @returns {Array<{call: string, selector: string}>}
 */
function selectorLookups(text) {
  const found = [];
  const pattern =
    /\.(closest|querySelectorAll|querySelector)(?:\?\.)?\(\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`)/g;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push({ call: match[1], selector: match[2] ?? match[3] ?? match[4] });
    match = pattern.exec(text);
  }
  return found;
}

/**
 * Every selector string a file states as a CONSTANT rather than passing to a call.
 *   - the OPPOSITE quote inside the body, which the old `[^'"]*` excluded both of. That one did
 *     not merely stop short, because the closing delimiter backreferenced the opening one: the
 *     match failed outright, and `const HOST = '[role="dialog"] .fabricate-manager'` was read as
 *     NO selector rather than as a fragment. Each alternative below excludes only its own
 *     delimiter, exactly as the call reader's do, so that value is now read whole.
 *
 * @param {string} text Source with comments already blanked.
 * @returns {Array<{call: string, selector: string}>}
 */
function boundsSelectors(text) {
  const pattern =
    /(?:(?:const|let)\s+\w+\s*=|\bbounds\s*:)\s*(?:'([.[][^'\n]*)'|"([.[][^"\n]*)"|`([.[][^`\n]*)`)/g;
  return [...text.matchAll(pattern)].map((match) => ({
    call: 'bounds',
    selector: match[1] ?? match[2] ?? match[3],
  }));
}

/**
 * Every selector this file states, in whichever of the two shapes it states it.
 *
 * @param {string} text Source with comments already blanked.
 * @returns {Array<{call: string, selector: string}>}
 */
function hostLookups(text) {
  return [...selectorLookups(text), ...boundsSelectors(text)];
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
    `only ${roots.size} application-root classes were derived. Six application files contribute ` +
      'TWELVE, and the two moves behind that figure are both issue 1520\'s: the deletion of the ' +
      'orphaned component-editor window took its window and Svelte-root classes with it, ' +
      'leaving eleven, and the split of the player window\'s drag-resize floor off the shared ' +
      '`fabricate-app` area class added `fabricate-app-window` to `SvelteFabricateApp`\'s ' +
      '`classes` array, making twelve. A class the frame emits is a root for this derivation ' +
      'whatever it carries, so a floor-only class counts like any other; a collapse to a ' +
      'handful means the reader is finding one layer and not the other.'
  );
});

test('the portal population is the set of components that actually portal', () => {
  const files = portalingFiles(stripped);

  for (const anchor of [
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    // A SCREEN REGION rather than a shared component.
    'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
    // The selectors themselves, which is the shape the clipping boundary took when it left the
    // components. Without this file the offence clause reads no boundary selector at all.
    'src/ui/svelte/util/overlayBounds.js',
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
      'six of them onto the anchored-popover action, moved the clipping selectors into their own ' +
      'module and left `ManagerColorPopover` a plain panel its caller positions; a lower number ' +
      'means the membership test has narrowed and this gate is guarding a subset.'
  );
});

test('the selector extractor still finds the host lookups it reads', () => {
  // THE LOAD-BEARING FLOOR. The shipped tree has zero offences.
  const files = portalingFiles(stripped);
  const lookups = files.flatMap((file) => hostLookups(stripped[file]));

  // NAMED, not merely counted. Seven selectors survive in this population.
  //   `.manager-main`                       a boundary CONSTANT, `MANAGER_MAIN_SELECTOR` in the
  //                                         bounds module — the biome picker's clipping walk in
  //                                         the form it took when it left the component
  //   `.essence-icon-picker-option`         a plain call, the icon picker's row measurement
  //   `button`                              an OPTIONAL call, `?.querySelector?.('button')`, which
  //                                         two components write and the first pattern could not
  //                                         see at all
  //   `[role="menuitem"]:not([disabled])`   an argument carrying the OPPOSITE quote, which is what
  //                                         any attribute selector carries
  for (const anchor of [
    '.manager-main',
    '.essence-icon-picker-option',
    'button',
    '[role="menuitem"]:not([disabled])',
  ]) {
    assert.ok(
      lookups.some((lookup) => lookup.selector === anchor),
      `the extractor no longer finds the shipped lookup for \`${anchor}\`, so the absence ` +
        'assertion below is holding over an empty set rather than a clean one. Found: ' +
        lookups.map((lookup) => `${lookup.call}('${lookup.selector}')`).join(', ')
    );
  }

  assert.ok(
    lookups.length >= 7,
    `the extractor found only ${lookups.length} selectors across ${files.length} portaling ` +
      'files. Seven ship; a number this low means the pattern no longer matches the code.'
  );

  // BOTH READERS ARE ALIVE. The defect was written as `closest('.fabricate-manager')`.
  for (const shape of ['querySelector', 'bounds']) {
    assert.ok(
      lookups.some((lookup) => lookup.call === shape),
      `no \`${shape}\` selector was found in any portaling file. Both shapes ship — a DOM lookup ` +
        'in a component and a boundary constant in `util/overlayBounds.js` — so the extractor is ' +
        'not reading what it claims to.'
    );
  }
});

test('the selector extractor reads every spelling a host lookup can take', () => {
  // SYNTHETIC, because the shipped tree cannot exercise all of them. The clause above is floored on
  // what the population happens to contain, and the population is a moving target: `closest()` had
  // four uses here until issue 1500 moved every one of them into a constant, at which point the
  // `closest` alternative of the pattern was matched by NOTHING and could have been deleted
  // without reddening a thing. These inputs are fixed, so each alternative keeps a witness whether
  // or not any component still writes it.
  for (const [label, source, expected] of [
    ['the plain ancestor walk', `root.closest('.fabricate-manager')`, 'closest'],
    ['a document-wide query', `document.querySelector(".fabricate-manager")`, 'querySelector'],
    ['an every-match query', "host.querySelectorAll('.fabricate-manager')", 'querySelectorAll'],
    ['an optional call', `menuRoot?.querySelector?.('.fabricate-manager')`, 'querySelector'],
    ['a template literal', 'root.closest(`.fabricate-manager`)', 'closest'],
  ]) {
    assert.deepEqual(
      selectorLookups(source),
      [{ call: expected, selector: '.fabricate-manager' }],
      `\`selectorLookups\` no longer reads ${label}, which is one of the five ways this offence ` +
        `has been or can be written: ${source}`
    );
  }

  // The opposite quote, kept separate because the SELECTOR is what differs rather than the call.
  assert.deepEqual(
    selectorLookups(`row.closest('[role="listitem"] .fabricate-manager')`),
    [{ call: 'closest', selector: '[role="listitem"] .fabricate-manager' }],
    'a selector carrying the opposite quote is truncated or dropped, so an offence written with ' +
      'an attribute clause in front of it passes this gate'
  );

  // The value reader, over every spelling a STATED selector takes.
  for (const source of [
    `const MANAGER_HOST_SELECTOR = '.fabricate-manager';`,
    `const PORTAL_HOME = '.fabricate-manager';`,
    `let MANAGER_BOUNDS = '.fabricate-manager';`,
    'const TEMPLATE_HOME = `.fabricate-manager`;',
    `const options = { bounds: '.fabricate-manager' };`,
  ]) {
    assert.deepEqual(
      boundsSelectors(source),
      [{ call: 'bounds', selector: '.fabricate-manager' }],
      `\`boundsSelectors\` does not read \`${source}\`, so stating a root as a value rather than ` +
        'passing it to a call is a way out of this gate'
    );
  }

  // The opposite quote in the STATED shape.
  assert.deepEqual(
    boundsSelectors(`const HOST = '[role="dialog"] .fabricate-manager';`),
    [{ call: 'bounds', selector: '[role="dialog"] .fabricate-manager' }],
    'a stated selector carrying the opposite quote is truncated or dropped, so an offence lifted ' +
      'into a constant behind an attribute clause passes this gate'
  );

  // AND IT IS NOT MATCHING EVERYTHING. A widened predicate that answered "selector" to any string
  // constant would satisfy every assertion above and turn the offence clause into noise.
  for (const source of [
    `const ADD_TAG_LABEL = 'Add tag';`,
    `const VOCABULARY = 'biomes';`,
    `const HREF = 'https://example.invalid/.fabricate-manager';`,
  ]) {
    assert.deepEqual(
      boundsSelectors(source),
      [],
      `\`boundsSelectors\` reads \`${source}\` as a selector, so it is deciding on the wrong ` +
        'population and every constant in the corpus is now this gate\'s business'
    );
  }
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

  for (const file of portalingFiles(stripped)) {
    if (file === RESOLVER) continue;
    for (const { call, selector } of hostLookups(stripped[file])) {
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
  // THE POSITIVE HALF. Absence alone is also satisfied by a tree with no portals in it.
  const targets = [];
  const unresolved = [];

  for (const [file, text] of Object.entries(corpus)) {
    if (file === RESOLVER || file === ANCHORED_POPOVER) continue;
    const source = stripComments(text);
    // The anchored-popover action resolves the host through `resolveOverlayHost` itself.
    for (const use of source.matchAll(/use:anchoredPopover=|anchoredPopover\(\w/g)) {
      targets.push(`${file}: ${use[0]}`);
    }
    for (const use of source.matchAll(/use:portal=\{([^}]*)\}/g)) {
      const expression = use[1].trim();
      targets.push(`${file}: ${expression}`);

      // Either the expression resolves the host itself.
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

  // SIX SHIP as of issue 1503, down from eight.
  assert.ok(
    targets.length >= 5,
    `only ${targets.length} portaled overlays were found across the corpus. Six ship — one ` +
      'through `use:portal` and five through the anchored-popover action; a lower number means ' +
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
