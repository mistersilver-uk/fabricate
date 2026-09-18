/**
 * THE CATEGORY HELPERS ARE ONE IMPLEMENTATION, AND THE SHIMS ARE BINDINGS RATHER THAN COPIES (issue
 * #1663).
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

/** Each shim's public surface as `exported name -> the shared name it must bind`. */
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

/** Six per shim, pinned as a number. */
const SHIM_EXPORT_COUNT = 6;

test('each shim still carries exactly six public names', () => {
  for (const [shim, mapping] of Object.entries(SHIMS)) {
    assert.equal(Object.keys(mapping).length, SHIM_EXPORT_COUNT, `${shim} must map six names`);
  }
  assert.equal(RETIRED_NAMES.length, 2 * SHIM_EXPORT_COUNT);
});

/** The shared module's exports as a plain object. */
const SHARED_EXPORTS = { ...categoryNormalization };

/** The loaded namespace per shim path, so the AST half and the runtime half name one list. */
const NAMESPACES = Object.freeze({
  'src/utils/componentCategories.js': componentCategories,
  'src/utils/recipeCategories.js': recipeCategories,
});

/** The twelve entity-worded names, retired as DECLARATIONS. */
const RETIRED_NAMES = Object.freeze(
  [...new Set(Object.values(SHIMS).flatMap((mapping) => Object.keys(mapping)))].sort(byCodePoint)
);

/** Retired names that are still declared somewhere, recorded rather than merged. */
const PINNED_EXCEPTIONS = Object.freeze({
  GENERAL_RECIPE_CATEGORY: ['src/ui/svelte/stores/craftingStore.svelte.js'],
});

const REPOSITORY_ROOT = path.join(import.meta.dirname, '..');

/**
 * One tracked file's text. The only source TEXT this gate touches, and it is handed straight to a
 * parser: every assertion below is on the parsed tree, never on the characters.
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
      // `export const GENERAL_COMPONENT_CATEGORY = 'general';` is an `ExportNamedDeclaration` TOO,
      // with a `declaration` and no `source` — and it is exactly the re-divergence this catches.
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
  // The shared module's header calls the shims its only sanctioned importers.
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
  // ASSERTED DIRECTLY RATHER THAN BY TRANSITIVITY, so the failure message names both shims.
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

/** Every declaration of `names` under `src/`, as `name -> ['file:line', …]`. */
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

/** One walk of `src/` for all eighteen names, memoized. */
let scanned = null;
function declarations() {
  scanned ??= declarationsOf([...SHARED_NAMES, ...RETIRED_NAMES]);
  return scanned;
}

test('the declaration walk really covers .svelte, not only .js', () => {
  // THE ONLY ASSERTION THAT CAN SEE THE `.svelte` HALF, and it exists because that half is
  // currently inert.
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
  // identity check above, forever, on every machine.
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
  // every assertion in this file rests on.
  const [declaration] = declared.body;
  assert.equal(declaration.type, 'ExportNamedDeclaration');
  assert.equal(declaration.source ?? null, null, 'a declaration has no source module');

  const { ast: reexport } = parseModule(`export { a as b } from '${SHARED_SPECIFIER}';\n`);
  const [binding] = reexport.body;
  assert.equal(binding.type, 'ExportNamedDeclaration');
  assert.equal(binding.source?.value, SHARED_SPECIFIER, 'a re-export names the module it binds');
  assert.equal(binding.declaration ?? null, null);
});
