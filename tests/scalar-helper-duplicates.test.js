/** Every name `src/utils/scalars.js` owns is declared only there, and no retired name anywhere. */
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
  arrayOrEmpty: [CANONICAL],
  arrayOrWrapped: [CANONICAL],
  cloneJson: [CANONICAL],
  isPlainObject: [CANONICAL],
  iterableToArray: [CANONICAL],
  laxNumberOrNull: [CANONICAL],
  normalizeConditionId: [CANONICAL],
  normalizeIdList: [CANONICAL],
  normalizeTag: [CANONICAL],
  normalizeTagList: [CANONICAL],
  numberOrNull: [CANONICAL],
  stringOnlyIdList: [CANONICAL],
  stringOrEmpty: [CANONICAL],
  stringOrNull: [CANONICAL],
  trimString: [CANONICAL],
  trimStringOrNull: [CANONICAL],
  untrimmedStringOrEmpty: [CANONICAL],
  untrimmedStringOrNull: [CANONICAL],
};

/** Names no longer declared under `src/`: a hub re-publishes some as aliases, and a private copy like `_isPlainObject` is imported from its shared equivalent instead. */
const RETIRED = ['_isPlainObject', 'normalizeList', 'numberOrNullStrict', 'trimmed'];

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every function declaration of `names` under `src/`, as `name -> ['file:line', …]`. */
function declarationsOf(names) {
  const wanted = new Set(names);
  const found = new Map();
  // `.svelte` is in scope, because a component copy is a copy (issue 1050).
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
  // A throwing parse or a `collectSources` that stopped recursing passes every assertion over nothing.
  const scanned = Object.keys(collectSources(`${repoRoot}/src`));
  const modules = scanned.filter((file) => file.endsWith('.js'));
  assert.ok(modules.length > 350, `expected the whole src/ tree, found ${modules.length} modules`);
  assert.ok(modules.includes(CANONICAL), `${CANONICAL} must be in the scanned corpus`);

  const components = scanned.filter((file) => file.endsWith('.svelte'));
  assert.ok(components.length > 300, `expected the component tree, found ${components.length} files`);

  const probe = parseComponent('<script>\nfunction trimmed(value) { return value; }\n</script>\n');
  const declared = [...walkNodes(probe)]
    .filter((node) => node.type === 'FunctionDeclaration')
    .map((node) => node.id?.name);
  assert.deepEqual(declared, ['trimmed'], 'a component declaration must be visible to the walk');
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
    // A recorded exception the file no longer uses is a licence the next author can reach for.
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

test('the retired helper names have no declaration left', () => {
  const declarations = declarationsOf(RETIRED);
  assert.deepEqual(
    Object.fromEntries([...declarations].map(([name, sites]) => [name, sites.sort(byCodePoint)])),
    {},
    'a retired name was declared again. Import the export whose body it has from ' +
      `${CANONICAL}, or alias it at the import, rather than writing the function out.`
  );
});

test('no retired name is also owned by scalars.js', () => {
  // Overlapping lists would let a name be consolidated and retired at once, failing neither test.
  const overlap = Object.keys(CONSOLIDATED).filter((name) => RETIRED.includes(name));
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
    RETIRED.filter((name) => exported.has(name)),
    [],
    `${CANONICAL} exports a helper this file records as retired, which cannot both be true`
  );
});

test('the gate can actually fail', () => {
  // The parser must report a declaration it is handed, or "no copies" is a sentence about nothing.
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
