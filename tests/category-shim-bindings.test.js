/**
 * THE CATEGORY HELPERS ARE ONE IMPLEMENTATION, AND THE SHIMS ARE BINDINGS RATHER THAN COPIES
 * (issue #1663).
 *
 * `componentCategories.js` and `recipeCategories.js` exported the same six things with the entity
 * word substituted, and their five functions were identical character-for-character modulo that
 * word. They are now ONE implementation in `categoryNormalization.js` plus two re-export bindings.
 * What must not happen next is a re-divergence: a shim that declares a second literal, or binds
 * the wrong original, or grows a seventh export, is back where the issue started and nothing else
 * in the suite would notice.
 *
 * WHY THIS IS AN AST GATE AND NOT A SOURCE-TEXT ONE. Three reasons, all of them structural:
 *  - a text rule for "only re-export statements" has to tolerate Prettier's line wrapping, a
 *    trailing comma and a header comment, and every tolerance widens the hole it is guarding;
 *  - `ast.body` node-type equality ENUMERATES WHAT IS ALLOWED rather than listing what is
 *    forbidden, so an unanticipated form is red by construction instead of silently permitted;
 *  - this file needs no row in `tests/source-pin-ledger.txt`, which matters because epic #1658 is
 *    converting source-text pins to AST reads and a new text-pinning gate would go the wrong way.
 *    NOT because it is an AST gate — being one proves nothing. `tests/scalar-helper-duplicates.test.js`
 *    is an AST gate and scores 2, at its two reads whose argument resolves to a binding that SPELLS
 *    `src/utils/scalars.js`. This file scores 0 because no read here NAMES a `src/` path at all: the
 *    paths arrive as loop variables over `SHIMS` and over the corpus walk, and `countPinSites` scores
 *    the named path. Measured, not assumed: `countPinSites` from `tests/helpers/sourcePinSites.js`
 *    scores this file 0 and `tests/source-pin-ratchet.test.js` stays green with no row added.
 *    Hoisting either shim path into a `const` read through would make this a two-site file.
 *
 * THE `.svelte` SCAN IS LOAD-BEARING, not thoroughness. `tests/helpers/sourceScan.js` says of its
 * own default that "`.svelte` is load-bearing — real call sites live there"; `AGENTS.md` records
 * issue 1050, where reasoning that Svelte is invisible to SonarCloud shipped a duplication failure
 * with 93 of its 98 duplicated lines in one `.svelte` file; and the first draft of the sibling gate
 * `tests/scalar-helper-duplicates.test.js` scanned `.js` only and was blind to a live, divergent
 * seventh `normalizeTag`.
 *
 * That scan needs an ANCHOR, and this gate has none of its own. No `.svelte` file declares any of
 * the eighteen names today, and the one `PINNED_EXCEPTIONS` file — `craftingStore.svelte.js` — ends
 * in `.js`, so narrowing the walk to `{ extensions: ['.js'] }` returns a byte-identical result and
 * leaves every other assertion here green. The sibling gate is anchored by its `normalizeTag`
 * exception in a real `.svelte` file; this one pins the corpus the walk actually visited instead.
 *
 * WHAT THIS GATE CANNOT SEE, beyond the stated limit below: a SWAPPED binding. The AST half and the
 * runtime half both read `SHIMS`, so a swap applied consistently to the shim and to that constant
 * passes both. `tests/component-category-utils.test.js` and `tests/recipe-category-utils.test.js`
 * are what catch it — each asserts a distinguishing VALUE for all six names per kind, so
 * `getCategoryLabel` exported as `normalizeRecipeCategory` reds there. This is a structure gate;
 * the behaviour proof lives in those two suites.
 *
 * STATED LIMIT, as the scalar gate states its own: a brand-new SEVENTH copy of this logic under a
 * DIFFERENT name is not caught here — nothing names it, so nothing can look for it. SonarCloud's
 * duplication detector is the backstop for that case, and it counts `src/**` and `tests/**` alike.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as componentCategories from '../src/utils/componentCategories.js';
import * as categoryNormalization from '../src/utils/categoryNormalization.js';
import * as recipeCategories from '../src/utils/recipeCategories.js';

import { parseModule, walkNodes } from './helpers/moduleAst.js';
import { parseComponent } from './helpers/svelteStructureContract.js';
import { byCodePoint } from './helpers/ratchetBaseline.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

const SHARED = 'src/utils/categoryNormalization.js';
const SHARED_SPECIFIER = './categoryNormalization.js';

/** The six names the shared implementation owns. */
const SHARED_NAMES = Object.freeze([
  'GENERAL_CATEGORY_NAME',
  'getCategoryLabel',
  'getEffectiveCategoryNames',
  'isGeneralCategoryName',
  'normalizeCategoryName',
  'normalizeCustomCategoryNames',
]);

/**
 * Each shim's public surface as `exported name -> the shared name it must bind`.
 *
 * This mapping is the pin that catches a shim binding the WRONG original — a swap of
 * `getCategoryLabel` for `normalizeCategoryName` would still be a re-export of the right module,
 * still be six names, and still type-check as far as anything else here is concerned.
 */
const SHIMS = Object.freeze({
  'src/utils/componentCategories.js': Object.freeze({
    GENERAL_COMPONENT_CATEGORY: 'GENERAL_CATEGORY_NAME',
    getComponentCategoryLabel: 'getCategoryLabel',
    getEffectiveComponentCategories: 'getEffectiveCategoryNames',
    isGeneralComponentCategory: 'isGeneralCategoryName',
    normalizeComponentCategory: 'normalizeCategoryName',
    normalizeCustomComponentCategories: 'normalizeCustomCategoryNames',
  }),
  'src/utils/recipeCategories.js': Object.freeze({
    GENERAL_RECIPE_CATEGORY: 'GENERAL_CATEGORY_NAME',
    getEffectiveRecipeCategories: 'getEffectiveCategoryNames',
    getRecipeCategoryLabel: 'getCategoryLabel',
    isGeneralRecipeCategory: 'isGeneralCategoryName',
    normalizeCustomRecipeCategories: 'normalizeCustomCategoryNames',
    normalizeRecipeCategory: 'normalizeCategoryName',
  }),
});

/**
 * Six per shim, pinned as a number.
 *
 * `SHIMS` above is this gate's ONLY record of each shim's surface, and `RETIRED_NAMES` is derived
 * from it — so a name deleted from a shim AND from its mapping is green on every assertion here,
 * and silently drops out of the retired scan, licensing a fresh declaration of it anywhere under
 * `src/`. Pinning the count turns that into an edit to a number, which a reviewer sees.
 */
const SHIM_EXPORT_COUNT = 6;

test('each shim still carries exactly six public names', () => {
  for (const [shim, mapping] of Object.entries(SHIMS)) {
    assert.equal(Object.keys(mapping).length, SHIM_EXPORT_COUNT, `${shim} must map six names`);
  }
  assert.equal(RETIRED_NAMES.length, 2 * SHIM_EXPORT_COUNT);
});

/**
 * The shared module's exports as a plain object.
 *
 * Copied rather than indexed directly because `import-x/namespace` cannot validate a COMPUTED
 * reference into an imported namespace, and the lookups below are computed by construction — the
 * whole point is that the mapping, not this file's syntax, decides which original each name binds.
 * A spread preserves identity, which is what every assertion here compares.
 *
 * It is a SNAPSHOT taken at module evaluation. Every export here is a `const` or a function
 * declaration and none is ever reassigned, so the snapshot IS the live binding; introduce a
 * reassigned `let` export and this copy would silently diverge from it while the shim's live
 * binding moved, and the failure message below would not describe that.
 */
const SHARED_EXPORTS = { ...categoryNormalization };

/** The loaded namespace per shim path, so the AST half and the runtime half name one list. */
const NAMESPACES = Object.freeze({
  'src/utils/componentCategories.js': componentCategories,
  'src/utils/recipeCategories.js': recipeCategories,
});

/**
 * The twelve entity-worded names, retired as DECLARATIONS.
 *
 * After the shims land these exist only as export SPECIFIERS, which are not declarations — so a
 * copy-paste of the old body back into either shim, or into any third file, is caught here and
 * named by file. This is the important half of the declaration scan: the six shared names being
 * declared once is the easy direction.
 */
const RETIRED_NAMES = Object.freeze(
  [...new Set(Object.values(SHIMS).flatMap((mapping) => Object.keys(mapping)))].sort(byCodePoint)
);

/**
 * Retired names that are still declared somewhere, recorded rather than merged.
 *
 * `craftingStore.svelte.js` keeps its own `GENERAL_RECIPE_CATEGORY`, and the exception is written
 * down for the reason its own comment gives: "A local copy keeps the store import-free." Importing
 * the shim would pull the shared module graph into a store whose unit-test compiler deliberately
 * resolves nothing. It is also used for the OPPOSITE ordering — the store pins the reserved bucket
 * LAST in the category filter, where `getEffectiveCategoryNames` puts it FIRST — so it is not the
 * same value doing the same job. Same shape, and the same reasoning, as the `normalizeTag`
 * exception in `tests/scalar-helper-duplicates.test.js`.
 */
const PINNED_EXCEPTIONS = Object.freeze({
  GENERAL_RECIPE_CATEGORY: ['src/ui/svelte/stores/craftingStore.svelte.js'],
});

const REPOSITORY_ROOT = path.join(import.meta.dirname, '..');

/**
 * One tracked file's text.
 *
 * The only source TEXT this gate touches, and it is handed straight to a parser: every assertion
 * below is on the parsed tree, never on the characters. No `includes`, `assert.match` or regex
 * `test` is applied to any of it, and no read here names a `src/` path — the paths arrive as loop
 * variables over `SHIMS` and over the corpus walk — so the file scores zero source-pin sites.
 */
const sourceText = (file) => readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');

/** `exported -> local` for every specifier of a re-export node, in source order. */
function specifierMapping(nodes) {
  const mapping = {};
  for (const node of nodes) {
    for (const specifier of node.specifiers ?? []) {
      mapping[specifier.exported?.name] = specifier.local?.name;
    }
  }
  return mapping;
}

test('the scan sees a real corpus', () => {
  // A parse that started throwing, or a `collectSources` that stopped recursing, would make every
  // assertion below pass over nothing.
  const files = Object.keys(collectSources(`${repoRoot}/src`, { extensions: ['.js'] }));
  assert.ok(files.length > 350, `expected the whole src/ tree, found ${files.length} files`);
  assert.ok(files.includes(SHARED), `${SHARED} must be in the scanned corpus`);
  for (const shim of Object.keys(SHIMS)) {
    assert.ok(files.includes(shim), `${shim} must be in the scanned corpus`);
  }
});

test('each shim is nothing but re-exports of the shared implementation', () => {
  for (const [shim, mapping] of Object.entries(SHIMS)) {
    const { ast } = parseModule(sourceText(shim));
    // ENUMERATES WHAT IS ALLOWED. Anything that is not a re-export statement — a local `const`, a
    // function, a side-effect import, a default export — is a body node of another type and reds
    // here without this gate having to anticipate it.
    assert.deepEqual(
      [...new Set(ast.body.map((node) => node.type))],
      ['ExportNamedDeclaration'],
      `${shim} must contain re-export statements and nothing else`
    );
    for (const node of ast.body) {
      // `export const GENERAL_COMPONENT_CATEGORY = 'general';` is an `ExportNamedDeclaration`
      // TOO, with a `declaration` and no `source` — and it is exactly the re-divergence this
      // catches. A null declaration is what makes the node a re-export rather than a definition,
      // so it is asserted FIRST: checked after the `source` assertion it could NEVER fail, because
      // `export const x = 1 from 'm'` is not grammatical and a node carrying a `source` therefore
      // cannot also carry a `declaration`. Ordered this way the re-inlined literal reds on the
      // assertion that describes it rather than on a confusing "may only re-export from" message.
      assert.equal(
        node.declaration ?? null,
        null,
        `${shim} must re-export, never declare: a declaration here is a second copy of the value`
      );
      assert.equal(
        node.source?.value,
        SHARED_SPECIFIER,
        `${shim} may only re-export from ${SHARED_SPECIFIER}`
      );
    }
    assert.deepEqual(
      specifierMapping(ast.body),
      mapping,
      `${shim} must bind exactly these six originals, under exactly these six public names`
    );
  }
});

test('the shims resolve to the SAME objects as the shared implementation, at runtime', () => {
  // THE RUNTIME HALF EXISTS BECAUSE THE AST HALF NEVER LOADS EITHER MODULE: a misspelled export in
  // `categoryNormalization.js` parses perfectly and would leave a pure AST gate green.
  assert.deepEqual(
    Object.keys(categoryNormalization).sort(byCodePoint),
    [...SHARED_NAMES].sort(byCodePoint),
    `${SHARED} exports a different set of names than this gate enforces`
  );

  for (const [shim, mapping] of Object.entries(SHIMS)) {
    const namespace = NAMESPACES[shim];
    // THE SURFACE-GROWTH GUARD. A seventh export on a shim is a name the shared module does not
    // own, which is how a "binding" quietly becomes a module with logic in it again.
    assert.deepEqual(
      Object.keys(namespace).sort(byCodePoint),
      Object.keys(mapping).sort(byCodePoint),
      `${shim} must expose exactly its six public names`
    );
    for (const [exported, local] of Object.entries(mapping)) {
      assert.strictEqual(
        namespace[exported],
        SHARED_EXPORTS[local],
        `${shim}'s ${exported} must BE ${local}, not a copy of it`
      );
    }
  }
});

test('only the two shims import the shared implementation', () => {
  // The shared module's header calls the shims its only sanctioned importers. Unenforced that is
  // prose, and this is the ONE place the entity-neutral naming is riskier than what it replaced:
  // at a direct call site nothing in `normalizeCategoryName` says WHICH stored vocabulary the
  // argument came from, which is exactly the mistake `normalizeComponentCategory` made impossible.
  const importers = [];
  for (const [file, source] of Object.entries(collectSources(`${repoRoot}/src`))) {
    if (file === SHARED) continue;
    const parsed = file.endsWith('.svelte') ? parseComponent(source) : parseModule(source);
    for (const node of walkNodes(parsed)) {
      if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration') continue;
      if (node.source?.value?.endsWith('/categoryNormalization.js')) importers.push(file);
    }
  }
  assert.deepEqual(
    [...new Set(importers)].sort(byCodePoint),
    Object.keys(SHIMS).sort(byCodePoint),
    `${SHARED} may only be reached through its two shims: import the entity-worded name, which ` +
      'says at the call site which stored vocabulary the argument belongs to'
  );
});

test('the two shims hand out one function, not two that agree today', () => {
  // ASSERTED DIRECTLY RATHER THAN BY TRANSITIVITY, so the failure message names both shims. Via
  // the shared module the same fact is two assertions apart, and the reader of a red build would
  // have to join them to see that the component and recipe paths had come apart.
  assert.strictEqual(
    componentCategories.normalizeComponentCategory,
    recipeCategories.normalizeRecipeCategory,
    'normalizeComponentCategory and normalizeRecipeCategory must be the same function'
  );
  assert.strictEqual(
    componentCategories.getComponentCategoryLabel,
    recipeCategories.getRecipeCategoryLabel,
    'getComponentCategoryLabel and getRecipeCategoryLabel must be the same function'
  );
});

/**
 * Every declaration of `names` under `src/`, as `name -> ['file:line', …]`.
 *
 * PARSED, not grepped. A regex over `const <name>` matches the word inside a comment or a string —
 * and both shims and this file's own prose NAME the retired helpers, so a text scan would be
 * answered with an allowlist covering exactly the files the gate exists to police.
 *
 * `VariableDeclarator` as well as `FunctionDeclaration`, because `GENERAL_CATEGORY_NAME` is a
 * string constant and a re-declared copy of it is the failure mode `===` cannot see (below).
 */
/** The files the declaration walk actually visited, so a test can pin the extensions it used. */
let walkedFiles = [];

function declarationsOf(names) {
  const wanted = new Set(names);
  const found = new Map();
  for (const name of wanted) found.set(name, []);
  walkedFiles = Object.keys(collectSources(`${repoRoot}/src`));
  for (const file of walkedFiles) {
    const source = sourceText(file);
    const parsed = file.endsWith('.svelte') ? parseComponent(source) : parseModule(source);
    for (const node of walkNodes(parsed)) {
      let name = null;
      if (node.type === 'FunctionDeclaration' && node.id?.name) name = node.id.name;
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') name = node.id.name;
      if (!name || !wanted.has(name)) continue;
      if (!found.has(name)) found.set(name, []);
      found.get(name).push(`${file}:${node.loc?.start?.line ?? 0}`);
    }
  }
  return found;
}

/**
 * One walk of `src/` for all eighteen names, memoized.
 *
 * The corpus parse costs several seconds, and the two scans below want the same tree; doing it
 * twice doubles the cost of this file inside `npm test` for no extra proof. Seeded with every
 * wanted name so an absent name reads as "declared nowhere" rather than as a missing key.
 */
let scanned = null;
function declarations() {
  scanned ??= declarationsOf([...SHARED_NAMES, ...RETIRED_NAMES]);
  return scanned;
}

test('the declaration walk really covers .svelte, not only .js', () => {
  // THE ONLY ASSERTION THAT CAN SEE THE `.svelte` HALF, and it exists because that half is
  // currently inert. No `.svelte` file declares any of the eighteen names today, and the one
  // `PINNED_EXCEPTIONS` file — `craftingStore.svelte.js` — ends in `.js`, so narrowing
  // `declarationsOf` to `{ extensions: ['.js'] }` returns a BYTE-IDENTICAL result map and leaves
  // every other assertion in this file green. The corpus floor above cannot catch it either: that
  // floor builds its own `.js`-only corpus by construction. `tests/scalar-helper-duplicates.test.js`
  // is anchored by its `normalizeTag` exception in a real `.svelte` file; this gate has no such
  // anchor, so it pins the corpus the walk visited instead.
  declarations();
  const components = walkedFiles.filter((file) => file.endsWith('.svelte'));
  assert.ok(
    components.length > 300,
    `expected src/**/*.svelte in the declaration walk, found ${components.length}`
  );
});

/** The distinct files a name is declared in, for one scan's results. */
const filesOf = (scan, name) =>
  new Set((scan.get(name) ?? []).map((site) => site.slice(0, site.lastIndexOf(':'))));

test('each shared helper is declared exactly once, in the shared module', () => {
  const declared = declarations();
  const sites = Object.fromEntries(
    SHARED_NAMES.map((name) => [name, (declared.get(name) ?? []).sort(byCodePoint)])
  );
  assert.deepEqual(
    Object.fromEntries(SHARED_NAMES.map((name) => [name, [...filesOf(declared, name)]])),
    Object.fromEntries(SHARED_NAMES.map((name) => [name, [SHARED]])),
    `every shared category helper must be declared in ${SHARED} and nowhere else`
  );
  for (const name of SHARED_NAMES) {
    assert.equal(
      sites[name].length,
      1,
      `${name} is declared ${sites[name].length} times: ${sites[name].join(', ')}`
    );
  }
});

test('no retired entity-worded helper is declared again, except where it is recorded', () => {
  const declared = declarations();
  const offenders = [];
  const stale = [];
  for (const name of RETIRED_NAMES) {
    const allowed = PINNED_EXCEPTIONS[name] ?? [];
    const files = filesOf(declared, name);
    for (const site of (declared.get(name) ?? []).sort(byCodePoint)) {
      if (!allowed.some((file) => site.startsWith(`${file}:`))) offenders.push(`${name}: ${site}`);
    }
    // A recorded exception that no longer declares the name is stale, and a stale exception is a
    // licence nobody is using that the next author can reach for.
    for (const file of allowed) {
      if (!files.has(file)) stale.push(`${name}: ${file}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these entity-worded category helpers are declared in `src/` again. They are re-export ' +
      `specifiers now, not definitions: import them from their shim, which binds ${SHARED}. A ` +
      'fresh declaration is a second implementation of a body that was merged precisely because ' +
      'the two copies agreed character-for-character.'
  );
  assert.deepEqual(
    stale,
    [],
    'these PINNED_EXCEPTIONS name a file that no longer declares the helper'
  );
});

test('the AST binding assertion is not redundant with the runtime one', () => {
  // `GENERAL_CATEGORY_NAME` IS THE STRING `'general'`, so `===` on it proves nothing at all: any
  // copy-pasted `export const GENERAL_COMPONENT_CATEGORY = 'general';` satisfies the runtime
  // identity check above, forever, on every machine. TWO STRUCTURAL assertions carry that name
  // instead: the shim's body holding a re-export with a null `declaration`, and the retired-name
  // scan finding no `GENERAL_COMPONENT_CATEGORY` declared anywhere under `src/`. Neither is
  // duplicative of the runtime test; do not delete either as though it were.
  assert.equal(typeof categoryNormalization.GENERAL_CATEGORY_NAME, 'string');
  assert.strictEqual(
    componentCategories.GENERAL_COMPONENT_CATEGORY,
    recipeCategories.GENERAL_RECIPE_CATEGORY,
    'a string identity that a copy would also satisfy — hence the AST gate'
  );
});

test('the gate can actually fail', () => {
  // Guarding the guard: the parser must really report a declaration it is handed, or "no retired
  // copies under src/" is a sentence about an empty search.
  const { ast: declared } = parseModule("export const GENERAL_COMPONENT_CATEGORY = 'general';\n");
  const constants = [...walkNodes(declared)].filter(
    (node) => node.type === 'VariableDeclarator' && node.id?.name === 'GENERAL_COMPONENT_CATEGORY'
  );
  assert.equal(constants.length, 1, 'a re-declared constant must be seen by the walk');

  const { ast: fn } = parseModule('export function normalizeRecipeCategory(value) { return value; }\n');
  const functions = [...walkNodes(fn)]
    .filter((node) => node.type === 'FunctionDeclaration')
    .map((node) => node.id?.name);
  assert.deepEqual(functions, ['normalizeRecipeCategory']);

  // AND THE PARSE MUST DISTINGUISH A RE-DECLARATION FROM A RE-EXPORT, which is the one distinction
  // every assertion in this file rests on. Both are `ExportNamedDeclaration`; only `source` tells
  // them apart.
  const [declaration] = declared.body;
  assert.equal(declaration.type, 'ExportNamedDeclaration');
  assert.equal(declaration.source ?? null, null, 'a declaration has no source module');

  const { ast: reexport } = parseModule(`export { a as b } from '${SHARED_SPECIFIER}';\n`);
  const [binding] = reexport.body;
  assert.equal(binding.type, 'ExportNamedDeclaration');
  assert.equal(binding.source?.value, SHARED_SPECIFIER, 'a re-export names the module it binds');
  assert.equal(binding.declaration ?? null, null);
});
