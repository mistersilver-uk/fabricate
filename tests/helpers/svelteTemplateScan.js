/** A template scanner over every `.svelte` file the product ships (issue 1497). */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'svelte/compiler';

import { byCodePoint } from './ratchetBaseline.js';
import { repoRoot } from './sourceScan.js';

/** The repository-relative root every UI template lives under. */
export const UI_TEMPLATE_ROOT = 'src/ui/svelte';

/**
 * Every `.svelte` file under `dir`, recursively, as absolute paths in code-point order. SORTED,
 * which `readdirSync` is not required to be.
 *
 * @param {string} dir An absolute directory path.
 * @param {string[]} [found] Accumulator, for the recursion.
 * @returns {string[]} Absolute paths.
 */
export function svelteFiles(dir, found = []) {
  const entries = [...readdirSync(dir, { withFileTypes: true })].sort((left, right) =>
    byCodePoint(left.name, right.name)
  );
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) svelteFiles(full, found);
    else if (entry.name.endsWith('.svelte')) found.push(full);
  }
  return found;
}

/**
 * Visit every `RegularElement` AND every `Component` in a parsed template.
 *
 * @param {unknown} node Any AST node, array of nodes, or `ast.fragment`.
 * @param {boolean} [inForm] Whether an ancestor `<form>` element is open.
 * @param {Set<object>} [seen] Cycle guard, for the recursion.
 */
export function walkElements(node, visit, inForm = false, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit, inForm, seen);
    return;
  }
  let descendantsAreInForm = inForm;
  if (node.type === 'RegularElement' || node.type === 'Component') {
    visit(node, inForm);
    if (node.type === 'RegularElement' && node.name.toLowerCase() === 'form') {
      descendantsAreInForm = true;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    walkElements(node[key], visit, descendantsAreInForm, seen);
  }
}

/**
 * Every UI template, parsed once, as `{ file, source, ast }`.
 *
 * @param {string} [root] Repository-relative directory to walk.
 */
export function parsedTemplates(root = UI_TEMPLATE_ROOT) {
  return svelteFiles(path.join(repoRoot, root)).map((full) => {
    const source = readFileSync(full, 'utf8');
    return {
      file: path.relative(repoRoot, full).split(path.sep).join('/'),
      source,
      ast: parse(source, { modern: true }),
    };
  });
}

/**
 * One STATIC attribute of an element, by name, or `undefined`.
 *
 * @param {object} element A `RegularElement` or `Component` node.
 */
export function attributeNamed(element, name) {
  return (element.attributes || []).find(
    (attribute) => attribute.type === 'Attribute' && attribute.name === name
  );
}

/**
 * The verbatim source text of an attribute, or `null` when the element does not carry it.
 *
 * @param {string} source The file's text.
 * @param {object} element A `RegularElement` or `Component` node.
 */
export function attributeText(source, element, name) {
  const attribute = attributeNamed(element, name);
  return attribute ? source.slice(attribute.start, attribute.end) : null;
}

/** The 1-based line holding `index` in `source`. */
export function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}
