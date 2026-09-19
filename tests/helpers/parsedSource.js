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
import { repoRoot } from './sourceScan.js';

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

export function moduleAstsIn(dir) {
  return pathsIn(dir, '.js').map(moduleAstOf);
}
