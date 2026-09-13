/**
 * THE SCALAR HELPERS ARE DECLARED ONCE, AND THE ONES THAT ARE NOT SAY WHY (issue #1662).
 *
 * Eleven names were being redefined across `src/` — 61 declarations between them, every copy
 * counted by SonarCloud's duplication detector. The issue asked for one implementation each.
 *
 * SIX OF THE ELEVEN COULD BE MERGED. FIVE COULD NOT, and that is the finding, not a caveat. The
 * bodies were compared before anything was consolidated, and only six names are written
 * identically at every site. The other five differ in ways that change what the function returns:
 *
 *   - `numberOrNull` (5 sites, 3 bodies) — two have no empty-string or null guard, so `''` and
 *     `null` come back as `0` rather than `null`, because `Number('')` is `0`.
 *   - `stringOrEmpty` (9 sites, 4 bodies) — three return `String(value)`; one TRIMS it. `' a '`
 *     is `' a '` or `'a'` depending which file you are in.
 *   - `trimmed` (10 sites, 2 bodies) — `typeof value === 'string' ? value.trim() : ''` against
 *     `String(value ?? '').trim()`. The number `42` is `''` in six files and `'42'` in four.
 *   - `stringOrNull` (9 sites, 4 bodies) — two delegate to other local helpers, two inline.
 *   - `normalizeList` (4 sites, 3 bodies) — one wraps a scalar into a one-item list, one unwraps
 *     a `Map`, one returns `[]`.
 *   - `normalizeIdList` (3 sites, 2 bodies) — one requires an array, one accepts a scalar.
 *
 * Merging those behind one implementation would change behaviour at some call site, silently, in
 * migration and runtime paths. Each needs its own proof that the differing inputs cannot reach it,
 * or a distinctly-named export — which is work, not a rename, and it is not in this change.
 *
 * So this gate covers the six that merged, and records the other five as measured divergence with
 * their site counts pinned. The pin is what makes the list shrink rather than drift: fixing one is
 * a visible edit to a number.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseModule, walkNodes } from './helpers/moduleAst.js';
import { byCodePoint } from './helpers/ratchetBaseline.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

const CANONICAL = 'src/utils/scalars.js';

/** The names `src/utils/scalars.js` owns. Declaring one of these anywhere else is the failure. */
const CONSOLIDATED = [
  'cloneJson',
  'isPlainObject',
  'normalizeConditionId',
  'normalizeTag',
  'normalizeTagList',
  'trimString',
];

/**
 * Names still declared per file, with the number of declarations, because their copies disagree.
 *
 * Pinned exactly, not as a ceiling — the same shape as every other baseline in this epic. A
 * ceiling banks a free slot each time one is fixed.
 */
const DIVERGENT = {
  numberOrNull: 5,
  stringOrNull: 9,
  stringOrEmpty: 9,
  trimmed: 10,
  normalizeList: 4,
  normalizeIdList: 3,
};

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every function declaration of `names` under `src/`, as `name -> ['file:line', …]`.
 *
 * PARSED, not grepped. A regex over `function <name>` misses `const <name> = (…) =>` and matches
 * the word inside a comment or a string, and both errors run in the direction that makes this gate
 * quieter than it should be.
 */
function declarationsOf(names) {
  const wanted = new Set(names);
  const found = new Map();
  for (const file of Object.keys(collectSources(`${repoRoot}/src`, { extensions: ['.js'] }))) {
    const ast = parseModule(readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8'));
    for (const node of walkNodes(ast)) {
      let name = null;
      if (node.type === 'FunctionDeclaration' && node.id?.name) name = node.id.name;
      if (
        node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
      ) {
        name = node.id.name;
      }
      if (!name || !wanted.has(name)) continue;
      if (!found.has(name)) found.set(name, []);
      found.get(name).push(`${file}:${node.loc?.start?.line ?? 0}`);
    }
  }
  return found;
}

test('the scan sees a real corpus', () => {
  // A parse that started throwing, or a `collectSources` that stopped recursing, would make every
  // assertion below pass over nothing.
  const files = Object.keys(collectSources(`${repoRoot}/src`, { extensions: ['.js'] }));
  assert.ok(files.length > 350, `expected the whole src/ tree, found ${files.length} files`);
  assert.ok(files.includes(CANONICAL), `${CANONICAL} must be in the scanned corpus`);
});

test('each consolidated helper is declared once, in scalars.js', () => {
  const declarations = declarationsOf(CONSOLIDATED);
  const offenders = [];
  for (const name of CONSOLIDATED) {
    const sites = (declarations.get(name) ?? []).sort(byCodePoint);
    const outside = sites.filter((site) => !site.startsWith(`${CANONICAL}:`));
    if (outside.length > 0) offenders.push(`${name}: ${outside.join(', ')}`);
    assert.ok(
      sites.some((site) => site.startsWith(`${CANONICAL}:`)),
      `${name} is not declared in ${CANONICAL} at all, so this gate is guarding a name nothing owns`
    );
  }
  assert.deepEqual(
    offenders,
    [],
    `these helpers are declared outside ${CANONICAL}. Import them from there instead — the copies ` +
      'were compared body-for-body before they were merged, so a new local one is a divergence ' +
      'nobody has checked.'
  );
});

test('the divergent helpers have not quietly multiplied', () => {
  const declarations = declarationsOf(Object.keys(DIVERGENT));
  const counts = Object.fromEntries(
    Object.keys(DIVERGENT).map((name) => [name, (declarations.get(name) ?? []).length])
  );
  assert.deepEqual(
    counts,
    DIVERGENT,
    'the count of un-consolidated scalar helpers changed. Going DOWN is the point: fix one, and ' +
      'lower its number here in the same commit. Going UP means a seventh spelling of a helper ' +
      'whose six existing spellings already disagree.'
  );
});

test('no divergent name is also owned by scalars.js', () => {
  // The two lists must not overlap, or a name could be "consolidated" and "divergent" at once and
  // the two assertions above would contradict each other without either failing.
  const overlap = CONSOLIDATED.filter((name) => name in DIVERGENT);
  assert.deepEqual(overlap, []);

  const canonical = parseModule(readFileSync(path.join(REPOSITORY_ROOT, CANONICAL), 'utf8'));
  const exported = new Set();
  for (const node of walkNodes(canonical)) {
    if (node.type === 'FunctionDeclaration' && node.id?.name) exported.add(node.id.name);
  }
  assert.deepEqual(
    [...exported].sort(byCodePoint),
    [...CONSOLIDATED].sort(byCodePoint),
    `${CANONICAL} declares a different set of helpers than this gate enforces`
  );
  assert.deepEqual(
    Object.keys(DIVERGENT).filter((name) => exported.has(name)),
    [],
    `${CANONICAL} exports a helper this file records as divergent, which cannot both be true`
  );
});

test('the gate can actually fail', () => {
  // Guarding the guard: the parser must really report a declaration it is handed, or "no copies
  // outside scalars.js" is a sentence about an empty search.
  const probe = parseModule('export function isPlainObject(value) { return !!value; }\n');
  const names = [...walkNodes(probe)]
    .filter((node) => node.type === 'FunctionDeclaration')
    .map((node) => node.id?.name);
  assert.deepEqual(names, ['isPlainObject']);

  const arrow = parseModule('const cloneJson = (value) => value;\n');
  const arrows = [...walkNodes(arrow)].filter(
    (node) => node.type === 'VariableDeclarator' && node.init?.type === 'ArrowFunctionExpression'
  );
  assert.equal(arrows.length, 1, 'an arrow-function copy must be seen too, not only a declaration');
});
