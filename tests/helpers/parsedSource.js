/**
 * The one read seam a structure contract may use (issue 1691). It returns ASTs and never source
 * text, so a converted pin cannot quietly become `text.includes(…)` again — the ratchet scores a
 * binding initialised from a non-base reader as a path rather than a source, so a text return would
 * leave the old shape uncounted. Do not stringify an AST to match it: `JSON.stringify(ast).includes`
 * is the one text-shaped route an AST return still leaves open, and it is forbidden.
 * `tests/svelte-structure-contract.test.js` pins the two sentences above.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseModule } from './moduleAst.js';
import { parseComponent, parseComponentScope } from './svelteStructureContract.js';
import { repoRoot } from './sourceScan.js';

/** Parsed once per file per vocabulary: `npm test` reads the manager root from several suites. */
const parsed = new Map();

function astOf(repoRelativePath, vocabulary, parse) {
  const key = `${vocabulary}:${repoRelativePath}`;
  if (!parsed.has(key)) {
    parsed.set(key, parse(readFileSync(resolve(repoRoot, repoRelativePath), 'utf8')));
  }
  return parsed.get(key);
}

/** One `.svelte` file as the `svelte/compiler` AST the template predicates read. */
export function componentAstOf(repoRelativePath) {
  return astOf(repoRelativePath, 'component', parseComponent);
}

/** One `.svelte` file as the scope-resolved parse `readsGlobal` needs. */
export function componentScopeOf(repoRelativePath) {
  return astOf(repoRelativePath, 'scope', parseComponentScope);
}

/** One `.js` / `.mjs` file as `{ast, scopeManager}`. */
export function moduleAstOf(repoRelativePath) {
  return astOf(repoRelativePath, 'module', parseModule);
}

function pathsIn(dir, extension) {
  return readdirSync(resolve(repoRoot, dir))
    .filter((entry) => entry.endsWith(extension))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => `${dir}/${entry}`);
}

/**
 * Every component in a directory, for the claims a composite binding used to make by joining its
 * files: quantify over these with `some`, rather than restating the join.
 */
export function componentAstsIn(dir) {
  return pathsIn(dir, '.svelte').map(componentAstOf);
}

/** Every plain module in a directory, the `.js` half of the same quantifier. */
export function moduleAstsIn(dir) {
  return pathsIn(dir, '.js').map(moduleAstOf);
}
