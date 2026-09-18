/**
 * THE SCALAR HELPERS ARE DECLARED ONCE, AND THE ONES THAT ARE NOT SAY WHY (issue #1662).
 * `numberOrNull` (5 sites, 3 bodies) — two have no empty-string or null guard, so `''` and `null`
 * come back as `0` rather than `null`, because `Number('')` is `0`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseModule, walkNodes } from './helpers/moduleAst.js';
import { parseComponent } from './helpers/svelteStructureContract.js';
import { byCodePoint } from './helpers/ratchetBaseline.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

const CANONICAL = 'src/utils/scalars.js';

/** The names `src/utils/scalars.js` owns. Declaring one of these anywhere else is the failure. */
const CONSOLIDATED = {
  cloneJson: [CANONICAL],
  isPlainObject: [CANONICAL],
  normalizeConditionId: [CANONICAL],
  normalizeTagList: [CANONICAL],
  trimString: [CANONICAL],
  // `TagsCategoriesView.svelte` keeps its own `normalizeTag`, and the exception is recorded rather
  // than merged because it DIVERGES: it spells the guard `String(value || '')` where `scalars.js`
  // spells it `String(value ?? '')`, so `0` normalises to `''` there and `'0'` here, and likewise
  // `false` and `NaN`.
  normalizeTag: [CANONICAL, 'src/ui/svelte/apps/manager/TagsCategoriesView.svelte'],
};

/**
 * Names still declared per file, with the number of declarations, because their copies disagree.
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

/** Every function declaration of `names` under `src/`, as `name -> ['file:line', …]`. */
function declarationsOf(names) {
  const wanted = new Set(names);
  const found = new Map();
  // `.svelte` INCLUDED, and that is the whole difference between this gate and a comfortable one
  // (issue 1050).
  for (const file of Object.keys(collectSources(`${repoRoot}/src`))) {
    const source = readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');
    const ast = file.endsWith('.svelte') ? parseComponent(source) : parseModule(source);
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

test('each consolidated helper is declared only where it is allowed to be', () => {
  const declarations = declarationsOf(Object.keys(CONSOLIDATED));
  const offenders = [];
  const stale = [];
  for (const [name, allowed] of Object.entries(CONSOLIDATED)) {
    const sites = (declarations.get(name) ?? []).sort(byCodePoint);
    const files = new Set(sites.map((site) => site.slice(0, site.lastIndexOf(':'))));
    for (const site of sites) {
      if (!allowed.some((file) => site.startsWith(`${file}:`))) offenders.push(`${name}: ${site}`);
    }
    assert.ok(
      files.has(CANONICAL),
      `${name} is not declared in ${CANONICAL} at all, so this gate guards a name nothing owns`
    );
    // A recorded exception that no longer declares the helper is stale, and a stale exception is
    // a licence nobody is using that the next author can reach for.
    for (const file of allowed) {
      if (!files.has(file)) stale.push(`${name}: ${file}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these helpers are declared somewhere CONSOLIDATED does not allow. Import them from ` +
      `${CANONICAL} instead — the copies were compared body-for-body before they were merged, so ` +
      'a new local one is a divergence nobody has checked.'
  );
  assert.deepEqual(stale, [], 'these CONSOLIDATED exceptions name a file that no longer declares the helper');
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
  const overlap = Object.keys(CONSOLIDATED).filter((name) => name in DIVERGENT);
  assert.deepEqual(overlap, []);

  const canonical = parseModule(readFileSync(path.join(REPOSITORY_ROOT, CANONICAL), 'utf8'));
  const exported = new Set();
  for (const node of walkNodes(canonical)) {
    if (node.type === 'FunctionDeclaration' && node.id?.name) exported.add(node.id.name);
  }
  assert.deepEqual(
    [...exported].sort(byCodePoint),
    Object.keys(CONSOLIDATED).sort(byCodePoint),
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
