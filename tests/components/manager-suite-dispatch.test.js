/**
 * Every per-surface manager suite module is reached by its dispatcher (issue 1512).
 * Those modules are plain `.js` outside the `npm test` glob, so a dropped import retires a whole
 * surface's cases silently instead of failing. The dispatchers are read as TEXT and parsed, never
 * imported, because importing one runs the suites it dispatches.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { calledName, parseModule, walkNodes } from '../helpers/moduleAst.js';
import { repoRoot } from '../helpers/sourceScan.js';

/** Repointing this at an empty directory must red the exact-count assertions below. */
const SUITE_DIRECTORY = 'tests/components';

/** A `-fixtures` module is data and `manager-layout-shared.js` is harness code, so neither is a suite. */
const MOUNTED_MODULE = /^manager-(.+)-mounted\.js$/;
const LAYOUT_MODULE = /^manager-layout-(?!.*-fixtures)(.+)\.js$/;
const LAYOUT_SHARED = 'manager-layout-shared.js';

const MOUNTED_DISPATCHER = 'manager-mounted.test.js';
const LAYOUT_DISPATCHER = 'manager-layout.test.js';

/** Exact, not a floor: a floor admits a module nothing dispatches as long as the others stay. */
const MOUNTED_COUNT = 13;
const LAYOUT_COUNT = 7;

const ENTRY_POINT = /^register[A-Za-z0-9]*Cases$/;

const readSuite = (name) => readFileSync(path.join(repoRoot, SUITE_DIRECTORY, name), 'utf8');

function suiteFileNames(pattern, excluded = []) {
  return readdirSync(path.join(repoRoot, SUITE_DIRECTORY))
    .filter((name) => pattern.test(name) && !excluded.includes(name))
    .sort();
}

/** By AST in both cases, so a specifier or a call left inside a comment cannot satisfy the gate. */
function importedSpecifiers(source) {
  const { ast } = parseModule(source);
  const specifiers = new Set();
  for (const node of walkNodes(ast)) {
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      specifiers.add(node.source.value);
    }
  }
  return specifiers;
}

function invokedNames(source) {
  const { ast } = parseModule(source);
  const names = new Set();
  for (const node of walkNodes(ast)) {
    const name = calledName(node);
    if (name) names.add(name);
  }
  return names;
}

/** The single `register*Cases` name a mounted module exports, which its dispatcher must call. */
function entryPointName(fileName) {
  const { ast } = parseModule(readSuite(fileName));
  const names = [];
  for (const node of walkNodes(ast)) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declared = node.declaration?.id?.name;
    if (declared && ENTRY_POINT.test(declared)) names.push(declared);
  }
  assert.equal(names.length, 1, `${fileName} must export exactly one register*Cases entry point`);
  return names[0];
}

const mountedModules = suiteFileNames(MOUNTED_MODULE);
const layoutModules = suiteFileNames(LAYOUT_MODULE, [LAYOUT_SHARED]);

test('the mounted and layout suite sets are the exact sets their dispatchers carry', () => {
  assert.equal(
    mountedModules.length,
    MOUNTED_COUNT,
    `expected ${MOUNTED_COUNT} manager-*-mounted.js modules, found ${mountedModules.join(', ')}`,
  );
  assert.equal(
    layoutModules.length,
    LAYOUT_COUNT,
    `expected ${LAYOUT_COUNT} manager-layout-*.js modules, found ${layoutModules.join(', ')}`,
  );
});

test('every mounted suite module is imported by its dispatcher and its cases are registered', () => {
  const source = readSuite(MOUNTED_DISPATCHER);
  const specifiers = importedSpecifiers(source);
  const invoked = invokedNames(source);
  for (const fileName of mountedModules) {
    assert.ok(
      specifiers.has(`./${fileName}`),
      `${MOUNTED_DISPATCHER} does not import ./${fileName}, so its cases never run`,
    );
    const entryPoint = entryPointName(fileName);
    assert.ok(
      invoked.has(entryPoint),
      `${MOUNTED_DISPATCHER} imports ./${fileName} but never calls ${entryPoint}()`,
    );
  }
});

test('every layout suite module is imported by its dispatcher', () => {
  const specifiers = importedSpecifiers(readSuite(LAYOUT_DISPATCHER));
  for (const fileName of layoutModules) {
    assert.ok(
      specifiers.has(`./${fileName}`),
      `${LAYOUT_DISPATCHER} does not import ./${fileName}, so its cases never run`,
    );
  }
});
