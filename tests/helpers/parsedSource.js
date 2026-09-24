/**
 * The one read seam a structure contract may use (issue 1691). It returns ASTs and never source
 * text, so a converted pin cannot become `text.includes(…)` again, and
 * `JSON.stringify(ast).includes` is forbidden as the one text route an AST return leaves open.
 * `tests/svelte-structure-contract.test.js` pins those two sentences.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseModule } from './moduleAst.js';
import { parseComponent, parseComponentScope } from './svelteStructureContract.js';
import { readScannedDirectory, repoRoot } from './sourceScan.js';

const parsed = new Map();

function astOf(repoRelativePath, vocabulary, parse) {
  const key = `${vocabulary}:${repoRelativePath}`;
  if (!parsed.has(key)) {
    parsed.set(key, parse(readFileSync(resolve(repoRoot, repoRelativePath), 'utf8')));
  }
  return parsed.get(key);
}

export function componentAstOf(repoRelativePath) {
  return astOf(repoRelativePath, 'component', parseComponent);
}

export function componentScopeOf(repoRelativePath) {
  return astOf(repoRelativePath, 'scope', parseComponentScope);
}

export function moduleAstOf(repoRelativePath) {
  return astOf(repoRelativePath, 'module', parseModule);
}

function pathsIn(dir, extension) {
  return readdirSync(resolve(repoRoot, dir))
    .filter((entry) => entry.endsWith(extension))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => `${dir}/${entry}`);
}

export function componentAstsIn(dir) {
  return pathsIn(dir, '.svelte').map(componentAstOf);
}

/** The same components as `[repoRelativePath, ast]`, for a corpus whose failures name the file. */
export function componentAstEntriesIn(dir) {
  return pathsIn(dir, '.svelte').map((path) => [path, componentAstOf(path)]);
}

export function moduleAstsIn(dir) {
  return pathsIn(dir, '.js').map(moduleAstOf);
}

/** Every `.svelte`, `.js` and `.mjs` file under `root`, recursively, as `[path, ast]` by path. */
export function sourceAstEntriesUnder(root) {
  const entries = [];
  const walk = (dir) => {
    for (const entry of readScannedDirectory(resolve(repoRoot, dir), { isRoot: dir === root })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith('.svelte')) entries.push([path, componentAstOf(path)]);
      else if (/\.m?js$/.test(path)) entries.push([path, moduleAstOf(path).ast]);
    }
  };
  walk(root);
  return entries.sort(([left], [right]) => left.localeCompare(right));
}
