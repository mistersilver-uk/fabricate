/**
 * The Foundry smoke walk as a composition: the loop that drives it, the registry it reads, and the
 * module-scope rules that keep importing the tree from a test inert (issue 1692).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runScenarios } from '../scripts/foundry-smoke/runScenarios.mjs';
import { SMOKE_SCENARIOS, SMOKE_SCENARIO_IDS } from '../scripts/foundry-smoke/registry.mjs';
import { D0_SKIPPABLE_SECTIONS, SCREENSHOT_CAPTURE_ORDER } from '../scripts/lib/screenshotCaptureMap.js';
import { parseModule } from './helpers/moduleAst.js';
import { physicalLines } from './helpers/unitSizes.js';
import {
  SMOKE_SOURCE_FILES,
  SMOKE_SOURCE_SEGMENTS,
} from './helpers/interactablesSmokeLocators.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const sourceOf = (file) => SMOKE_SOURCE_SEGMENTS[SMOKE_SOURCE_FILES.indexOf(file)];
const SCENARIO_FILES = SMOKE_SOURCE_FILES.filter((file) =>
  file.startsWith('scripts/foundry-smoke/scenarios/')
);

/** Every scenario in walk order, groups and their children alike. */
function* flatten(scenarios) {
  for (const scenario of scenarios) {
    yield scenario;
    yield* flatten(scenario.children ?? []);
  }
}

/** A context stub that records what the loop asks of it. */
function fakeContext({ skippedSections = [] } = {}) {
  const log = [];
  let openPhase = null;
  return {
    log,
    currentPhaseName: () => openPhase,
    startPhase(name) {
      openPhase = name;
      log.push(`phase:${name}`);
    },
    shouldRunScreenshotSection(name) {
      return !skippedSections.includes(name);
    },
  };
}

const fakeScenario = (id, extra = {}) => ({
  id,
  phase: null,
  section: null,
  async run(ctx, helpers) {
    ctx.log.push(`run:${id}`);
    await new Promise((settle) => setImmediate(settle));
    ctx.log.push(`done:${id}`);
    if (extra.children) await helpers.runChildren();
  },
  ...extra,
});

test('runScenarios invokes every scenario exactly once, in array order, awaiting each', async () => {
  const ctx = fakeContext();
  await runScenarios([fakeScenario('a'), fakeScenario('b'), fakeScenario('c')], ctx);
  assert.deepEqual(ctx.log, ['run:a', 'done:a', 'run:b', 'done:b', 'run:c', 'done:c']);
});

test('a group scenario runs its children in declared order, inside its own run', async () => {
  const ctx = fakeContext();
  const group = fakeScenario('group', { children: [fakeScenario('x'), fakeScenario('y')] });
  await runScenarios([group, fakeScenario('after')], ctx);
  assert.deepEqual(ctx.log, [
    'run:group',
    'done:group',
    'run:x',
    'done:x',
    'run:y',
    'done:y',
    'run:after',
    'done:after',
  ]);
});

test('a child whose section is skipped never has its run called', async () => {
  const ctx = fakeContext({ skippedSections: ['tools'] });
  const group = fakeScenario('group', {
    children: [
      fakeScenario('recipes', { section: 'recipes' }),
      fakeScenario('tools', { section: 'tools' }),
    ],
  });
  await runScenarios([group], ctx);
  assert.equal(ctx.log.includes('run:tools'), false);
  assert.ok(ctx.log.includes('run:recipes'));
});

test('a scenario that throws surfaces the throw', async () => {
  const ctx = fakeContext();
  const boom = {
    id: 'boom',
    phase: null,
    section: null,
    run: async () => {
      throw new Error('scenario failed');
    },
  };
  await assert.rejects(
    () => runScenarios([boom, fakeScenario('never')], ctx),
    /scenario failed/
  );
  assert.equal(ctx.log.includes('run:never'), false);
});

test('startPhase is called once per distinct phase, so eight D0 children yield one row', async () => {
  const ctx = fakeContext();
  const children = Array.from({ length: 8 }, (_, index) =>
    fakeScenario(`d0-${index}`, { phase: 'phase-D0' })
  );
  const spine = fakeScenario('spine', { children });
  spine.run = async (context, helpers) => {
    context.startPhase('phase-D0');
    await helpers.runChildren();
  };
  await runScenarios([fakeScenario('boot', { phase: 'boot-and-join' }), spine], ctx);
  assert.deepEqual(
    ctx.log.filter((entry) => entry.startsWith('phase:')),
    ['phase:boot-and-join', 'phase:phase-D0']
  );
});

test('the section map is a bijection with D0_SKIPPABLE_SECTIONS', () => {
  const sections = [...flatten(SMOKE_SCENARIOS)].map((scenario) => scenario.section).filter(Boolean);
  const declared = D0_SKIPPABLE_SECTIONS.map((section) => section.name);
  assert.deepEqual([...sections].sort(), [...declared].sort());
  assert.equal(new Set(sections).size, sections.length, 'every section name has exactly one scenario');
});

test('SMOKE_SCENARIOS is the walk, in order, with no cleanup or teardown entry', () => {
  assert.deepEqual(SMOKE_SCENARIO_IDS, [
    'boot-and-join',
    'phase-b-actors-items',
    'phase-c-crafting-system',
    'd0-spine',
    'recipes',
    'components-checks',
    'tags-essences',
    'gathering',
    'tools',
    'world-scope-identity',
    'knowledge',
    'overview-interactables',
    'import-alchemy-experimental',
    'phase-e',
  ]);
  assert.ok(SMOKE_SCENARIO_IDS.length >= 13);
  for (const id of SMOKE_SCENARIO_IDS) {
    assert.doesNotMatch(id, /^phase-f/);
    assert.doesNotMatch(id, /cleanup|teardown/);
  }
});

test('every consumed key is published earlier in walk order, or by the runner', () => {
  const runnerPublished = new Set(['cleanup', 'bootTimings', 'screenshotRunIdentity']);
  const published = new Set(runnerPublished);
  for (const scenario of flatten(SMOKE_SCENARIOS)) {
    for (const key of scenario.consumes ?? []) {
      assert.ok(published.has(key), `${scenario.id} consumes '${key}' before anything publishes it`);
    }
    for (const key of scenario.publishes ?? []) published.add(key);
  }
});

test('the runner calls runSmokeCleanup from its finally, never from the loop', () => {
  const runner = sourceOf('scripts/foundry-test-run.mjs');
  const calls = runner.match(/runSmokeCleanup\(/g) ?? [];
  assert.equal(calls.length, 1, 'exactly one call site');
  const finallyOpen = runner.indexOf('} finally {');
  const callAt = runner.indexOf('await runSmokeCleanup(ctx);');
  assert.ok(finallyOpen >= 0 && callAt > finallyOpen, 'the call must sit inside the finally block');
  assert.equal(sourceOf('scripts/foundry-smoke/registry.mjs').includes('runSmokeCleanup'), false);
  assert.equal(
    sourceOf('scripts/foundry-smoke/runScenarios.mjs').includes('runSmokeCleanup'),
    false
  );
});

test('no scenario module reads process.env or process.argv, or imports the run identity', () => {
  for (const file of SCENARIO_FILES) {
    const source = sourceOf(file);
    assert.doesNotMatch(source, /\bprocess\s*(?:\.|\?\.)\s*env\b/, file);
    assert.doesNotMatch(source, /\bprocess\s*(?:\.|\?\.)\s*argv\b/, file);
    assert.doesNotMatch(source, /globalThis\s*(?:\.|\?\.)\s*process\b/, file);
    assert.doesNotMatch(source, /foundryRunIdentity/, file);
  }
});

const parse = (source) => parseModule(source).ast;

/** Whether a top-level initializer is the one allowed shape, `Object.freeze(…)`. */
const isAllowedTopLevelCall = (node) =>
  node.callee?.type === 'MemberExpression' &&
  node.callee.object?.name === 'Object' &&
  node.callee.property?.name === 'freeze';

function topLevelCalls(ast) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && !isAllowedTopLevelCall(node)) found.push(node);
    if (node.type === 'AwaitExpression') found.push(node);
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) for (const child of value) walk(child);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  for (const statement of ast.body) {
    // A function body is not top-level scope; only what runs at import is.
    if (statement.type === 'FunctionDeclaration' || statement.type === 'ImportDeclaration') continue;
    if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration;
      if (!declaration || declaration.type === 'FunctionDeclaration') continue;
      // A descriptor's `run` is a method, so its body is not evaluated at import either.
      if (declaration.type === 'ObjectExpression') {
        for (const property of declaration.properties) {
          if (property.value?.type === 'FunctionExpression') continue;
          walk(property.value);
        }
        continue;
      }
      walk(declaration);
      continue;
    }
    walk(statement);
  }
  return found;
}

test('no scenario module evaluates a call, or awaits, in top-level scope', () => {
  for (const file of SCENARIO_FILES) {
    const offenders = topLevelCalls(parse(sourceOf(file)));
    assert.deepEqual(
      offenders.map((node) => `${file}:${node.loc.start.line}`),
      [],
      `${file} does work at import time`
    );
  }
});

test('the non-negative control: a top-level const initializer that calls is caught', () => {
  const offenders = topLevelCalls(parse("const identity = { runId: randomUUID() };\nexport default identity;\n"));
  assert.equal(offenders.length, 1);
});

test('every smoke module stays inside the size cap, and the runner inside its own', () => {
  for (const file of SMOKE_SOURCE_FILES) {
    if (file === 'scripts/foundry-test-run.mjs') continue;
    const lines = physicalLines(sourceOf(file));
    assert.ok(lines <= 1500, `${file} is ${lines} lines, over the 1,500-line cap`);
  }
  const runner = readFileSync(resolve(REPO_ROOT, 'scripts/foundry-test-run.mjs'), 'utf8');
  assert.ok(physicalLines(runner) <= 400, `the runner is ${physicalLines(runner)} lines, over 400`);
  const mainAt = runner.indexOf('async function main() {');
  const mainEnd = runner.indexOf('\nmain().catch(');
  assert.ok(mainAt >= 0 && mainEnd > mainAt, 'the runner must still declare and drive main()');
  const mainLines = physicalLines(runner.slice(mainAt, mainEnd));
  assert.ok(mainLines <= 150, `main() is ${mainLines} lines, over 150`);
});

test('the label-emission parse over every module covers the whole capture order', () => {
  const patterns = [
    /screenshot\(\s*page\s*,\s*'([^']+)'/g,
    /captureToolStudioProduct\(\s*ctx\s*,\s*'([^']+)'/g,
    /captureStableManagerView\(\s*ctx\s*,\s*\{[\s\S]*?label:\s*'([^']+)'[\s\S]*?\}\s*\)/g,
    /captureGroupedContinuationFrame\(\s*ctx,\s*\{[\s\S]*?label:\s*'([^']+)'/g,
    /captureBulkEditFrame\(\s*ctx,\s*\{[\s\S]*?label:\s*'([^']+)'/g,
    /captureRecipeResultsTab\(\s*ctx,\s*[^,]+,\s*'([^']+)'/g,
    /captureCurrentPlayerGathering\(\s*'([^']+)'/g,
    /captureSelectedGatheringTask\(\s*\{[\s\S]*?label:\s*'([^']+)'[\s\S]*?\}\s*\)/g,
    /handleRollPromptIfPresent\(\s*ctx\s*,\s*'([^']+)'/g,
  ];
  const emitted = new Set();
  for (const segment of SMOKE_SOURCE_SEGMENTS) {
    for (const pattern of patterns) {
      for (const match of segment.matchAll(pattern)) emitted.add(match[1]);
    }
  }
  const missing = SCREENSHOT_CAPTURE_ORDER.filter((label) => !emitted.has(label));
  assert.deepEqual(missing, []);
});
