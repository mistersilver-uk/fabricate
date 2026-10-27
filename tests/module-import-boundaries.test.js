/**
 * Which modules may import which (issues 1789, 1832, 1861): the Foundry-free `src/ui/model/`
 * layer, the two single-importer pipeline continuations, and the normalize modules private to
 * `CraftingSystemManager`. The graph is measured by `scripts/lib/componentImporters.js`, so no
 * `src/` text is pinned here.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { ESLint } from 'eslint';

import { DOMAIN_RESTRICTED_GLOBALS } from '../eslint.config.js';
import { importGraph, measureImporters } from '../scripts/lib/componentImporters.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import { repoRoot } from './helpers/sourceScan.js';

const MODEL_DIR = 'src/ui/model';
const MANAGER = 'src/systems/CraftingSystemManager.js';
const NORMALIZE_DIR = 'src/systems/normalize';

/** Each continuation module and the one module allowed to import it. */
const PRIVATE_CONTINUATIONS = Object.freeze({
  'src/systems/craftPipeline.js': ['src/systems/CraftingEngine.js'],
  'src/systems/gatheringAttemptResolution.js': ['src/systems/GatheringEngine.js'],
});

/** Normalize modules only the manager and the normalize directory itself may import. */
const NORMALIZE_PRIVATE = Object.freeze([
  'components',
  'craftingCheck',
  'essences',
  'recipeItems',
  'salvage',
  'system',
  'systemFields',
  'tools',
]);

/** Normalize modules other layers import on purpose; listed so a new module must be classified. */
const NORMALIZE_SHARED = Object.freeze([
  'checkAdvantage',
  'checkEvaluation',
  'gatheringConditionOptions',
]);

/** Below these the walk or the model layer was truncated rather than measured. */
const WALK_FLOOR = 100;
const MODEL_EDGE_FLOOR = 60;

const normalizePath = (name) => `${NORMALIZE_DIR}/${name}.js`;

function listJsFiles(directory) {
  return readdirSync(`${repoRoot}/${directory}`, { recursive: true })
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => `${directory}/${entry.replaceAll('\\', '/')}`)
    .sort(byCodePoint);
}

/** Importers of any model file that sit outside `src/ui/`. */
function modelImportersOutsideUi(graph, modelFiles) {
  return modelFiles.flatMap((model) =>
    graph
      .importersOf(model)
      .filter((importer) => !importer.startsWith('src/ui/'))
      .map((importer) => `${importer} -> ${model}`)
  );
}

/** Continuation modules whose importer set differs from the table. */
function continuationDrift(graph, table) {
  return Object.entries(table)
    .filter(([file, allowed]) => graph.importersOf(file).join('|') !== [...allowed].join('|'))
    .map(
      ([file, allowed]) => `${file}: ${graph.importersOf(file).join(', ')} (allowed ${allowed})`
    );
}

/** Private normalize modules imported from outside the manager and the normalize directory. */
function normalizeLeaks(graph, privateFiles) {
  return privateFiles.flatMap((file) =>
    graph
      .importersOf(file)
      .filter((importer) => importer !== MANAGER && !importer.startsWith(`${NORMALIZE_DIR}/`))
      .map((importer) => `${importer} -> ${file}`)
  );
}

/** Normalize modules that import the manager back. */
function normalizeImportingManager(graph, normalizeFiles) {
  return normalizeFiles.filter((file) => graph.importsOf(file).includes(MANAGER));
}

const live = measureImporters(repoRoot, 'src');
const modelFiles = listJsFiles(MODEL_DIR);

test('the walk reached the tree and every model file is seen as imported', () => {
  assert.ok(live.fileCount > WALK_FLOOR, `walked only ${live.fileCount} files`);
  assert.ok(modelFiles.length > 0, `${MODEL_DIR} lists no module`);
  const orphans = modelFiles.filter((file) => live.importersOf(file).length === 0);
  assert.deepEqual(orphans, [], 'a model file with no importer means the edges were not read');
  const edges = modelFiles.reduce((sum, file) => sum + live.importersOf(file).length, 0);
  assert.ok(edges >= MODEL_EDGE_FLOOR, `only ${edges} edges into ${MODEL_DIR}`);
  for (const file of [
    ...Object.keys(PRIVATE_CONTINUATIONS),
    ...Object.values(PRIVATE_CONTINUATIONS).flat(),
    MANAGER,
  ]) {
    assert.ok(existsSync(`${repoRoot}/${file}`), `${file} no longer exists`);
  }
});

test('no-restricted-globals is an error on every src/ui/model module and covers each domain global', async () => {
  const eslint = new ESLint();
  const probe = `${MODEL_DIR}/__probe.js`;
  for (const file of [...modelFiles, probe]) {
    const entry = (await eslint.calculateConfigForFile(file)).rules['no-restricted-globals'];
    assert.ok(Array.isArray(entry) && entry[0] === 2, `${file}: rule is not an error`);
    const covered = entry.slice(1).map((option) => option.name);
    for (const { name } of DOMAIN_RESTRICTED_GLOBALS) {
      assert.ok(covered.includes(name), `${file}: ${name} is not restricted`);
    }
  }
});

test('every importer of src/ui/model starts with src/ui/', () => {
  assert.deepEqual(modelImportersOutsideUi(live, modelFiles), []);
});

test('the pipeline continuations are imported only by their one engine', () => {
  for (const [file, allowed] of Object.entries(PRIVATE_CONTINUATIONS)) {
    assert.deepEqual(live.importersOf(file), allowed, file);
  }
  assert.deepEqual(continuationDrift(live, PRIVATE_CONTINUATIONS), []);
});

test('NORMALIZE_PRIVATE and NORMALIZE_SHARED classify every normalize module', () => {
  const listed = listJsFiles(NORMALIZE_DIR);
  const classified = [...NORMALIZE_PRIVATE, ...NORMALIZE_SHARED]
    .map(normalizePath)
    .sort(byCodePoint);
  assert.deepEqual(classified, listed, 'a normalize module is unclassified or gone');
});

test('private normalize modules are imported only by the manager and the normalize directory', () => {
  const privateFiles = NORMALIZE_PRIVATE.map(normalizePath);
  assert.deepEqual(normalizeLeaks(live, privateFiles), []);
  assert.deepEqual(normalizeImportingManager(live, listJsFiles(NORMALIZE_DIR)), []);
});

/** A graph over `{ file: importLines }` with one import line per listed target. */
function syntheticGraph(sources) {
  const text = (file) =>
    (sources[file] ?? []).map((target) => `import '${relativeTo(file, target)}';`).join('\n');
  return importGraph(Object.keys(sources), text);
}

function relativeTo(from, target) {
  const fromParts = from.split('/').slice(0, -1);
  const targetParts = target.split('/');
  while (fromParts.length > 0 && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }
  return `${'../'.repeat(fromParts.length) || './'}${targetParts.join('/')}`;
}

test('each predicate flags one injected forbidden edge and passes the clean graph', () => {
  const model = `${MODEL_DIR}/a.js`;
  const pipeline = 'src/systems/craftPipeline.js';
  const engine = 'src/systems/CraftingEngine.js';
  const components = normalizePath('components');
  const files = (extra) => ({
    [model]: [],
    [pipeline]: [],
    [engine]: [pipeline],
    [MANAGER]: [components],
    [components]: [],
    ...extra,
  });
  const table = { [pipeline]: [engine] };

  const clean = syntheticGraph(files({ 'src/ui/x.js': [model] }));
  assert.deepEqual(modelImportersOutsideUi(clean, [model]), []);
  assert.deepEqual(continuationDrift(clean, table), []);
  assert.deepEqual(normalizeLeaks(clean, [components]), []);
  assert.deepEqual(normalizeImportingManager(clean, [components]), []);

  const modelLeak = syntheticGraph(files({ 'src/systems/x.js': [model] }));
  assert.deepEqual(modelImportersOutsideUi(modelLeak, [model]), [`src/systems/x.js -> ${model}`]);

  const extraImporter = syntheticGraph(files({ 'src/systems/x.js': [pipeline] }));
  assert.equal(continuationDrift(extraImporter, table).length, 1);

  const normalizeLeak = syntheticGraph(files({ 'src/ui/x.js': [components] }));
  assert.deepEqual(normalizeLeaks(normalizeLeak, [components]), [`src/ui/x.js -> ${components}`]);

  const backEdge = syntheticGraph(files({ [components]: [MANAGER] }));
  assert.deepEqual(normalizeImportingManager(backEdge, [components]), [components]);
});
