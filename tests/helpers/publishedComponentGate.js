/**
 * What the published component gates share (issue 2452): the three parses a gate reads of a file,
 * an entry's import closure, admission rule 9's scan of one component, and every stylesheet a
 * published root's selectors are read from. `tests/published-component-manifest.test.js` and
 * `tests/published-component-controls.test.js` import them.
 */
import assert from 'node:assert/strict';
import { posix, resolve } from 'node:path';

import { stylesheetSources } from '../../scripts/lib/stylesheetSource.js';

import { templateOf } from './apiConvention.js';
import { importedModules, lazilyImportedModules, parseModule, walkNodes } from './moduleAst.js';
import { componentAstOf, componentScopeOf, moduleAstOf } from './parsedSource.js';
import { readScannedDirectory, repoRoot } from './sourceScan.js';
import { parseComponentScope } from './svelteStructureContract.js';

export const byName = (a, b) => a.localeCompare(b);

/** The three parses the gate reads of a file: a component, its scopes, and a plain module. */
export const SHIPPED = Object.freeze({
  component: componentAstOf,
  componentScope: componentScopeOf,
  module: moduleAstOf,
});

/** The same three parses over `sources`, a map of path to text. */
export function syntheticReader(sources) {
  return {
    component: (file) => templateOf(file, sources[file]).ast,
    componentScope: (file) => parseComponentScope(sources[file]),
    module: (file) => parseModule(sources[file]),
  };
}

export const isComponent = (file) => file.endsWith('.svelte');

/**
 * The file at `path` and every relative `.svelte` or `.js` file it reaches by `import`,
 * `export … from`, `export * from` or a literal `import()`, so a re-export-only barrel is walked.
 */
export function importClosure(path, reader, seen = new Set()) {
  if (seen.has(path)) return seen;
  seen.add(path);
  const ast = isComponent(path) ? reader.component(path) : reader.module(path).ast;
  for (const specifier of [...importedModules(ast), ...lazilyImportedModules(ast)]) {
    if (!specifier.startsWith('.') || !/\.(?:svelte|js)$/.test(specifier)) continue;
    importClosure(posix.join(posix.dirname(path), specifier), reader, seen);
  }
  return seen;
}

const FOCUSABLE_TAGS = new Set(['button', 'a']);
const FORM_CONTROLS = new Set(['button', 'input', 'select', 'textarea']);

export const attributeOf = (element, name) =>
  element.attributes.find((attribute) => attribute.type === 'Attribute' && attribute.name === name);

/** An attribute's text when it is static, `''` when bare, else `undefined`. */
export function staticText(attribute) {
  if (!attribute) return undefined;
  if (attribute.value === true) return '';
  const parts = [attribute.value].flat();
  if (parts.some((part) => part.type !== 'Text')) return undefined;
  return parts.map((part) => part.data).join('');
}

/**
 * Admission rule 9 over one closure file: a `button`, `a` or `[tabindex]` element states
 * `data-keyboard-focus="true"`, a `button` states `type="button"`, and no form control states
 * `name`. Answers each element it judged beside each fault, both as `<file>: <tag> …`.
 */
export function focusableElements(file, ast) {
  const judged = [];
  const faults = [];
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'RegularElement') continue;
    const focusable = FOCUSABLE_TAGS.has(node.name) || Boolean(attributeOf(node, 'tabindex'));
    const control = FORM_CONTROLS.has(node.name);
    if (!focusable && !control) continue;
    const states = (name, value) => staticText(attributeOf(node, name)) === value;
    judged.push(`${file}: ${node.name}`);
    if (focusable && !states('data-keyboard-focus', 'true')) {
      faults.push(`${file}: ${node.name} does not state data-keyboard-focus="true"`);
    }
    if (node.name === 'button' && !states('type', 'button')) {
      faults.push(`${file}: button does not state type="button"`);
    }
    if (control && attributeOf(node, 'name')) faults.push(`${file}: ${node.name} states name`);
  }
  return { judged, faults };
}

/** Every `.svelte` file under `dir`, recursively, by path. */
export function componentPathsUnder(dir, isRoot = true) {
  return readScannedDirectory(resolve(repoRoot, dir), { isRoot })
    .flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return componentPathsUnder(path, false);
      return path.endsWith('.svelte') ? [path] : [];
    })
    .sort(byName);
}

let stylesheets;
/** Every module sheet partial and every component `<style>` under `src/ui/svelte`, as `[file, css]`. */
export function everyStylesheet() {
  if (stylesheets) return stylesheets;
  const sheets = stylesheetSources().parts.map(({ file, text }) => [
    file,
    templateOf(file, `<style>${text}</style>`).ast.css,
  ]);
  const blocks = componentPathsUnder('src/ui/svelte').map((file) => [
    file,
    componentAstOf(file).css,
  ]);
  assert.equal(sheets.length, 14, 'the fourteen partials');
  assert.ok(blocks.length > 400, 'every component under src/ui/svelte');
  stylesheets = [...sheets, ...blocks];
  return stylesheets;
}
