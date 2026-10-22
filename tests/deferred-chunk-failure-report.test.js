/**
 * The page session's one deferred-chunk reporter over Foundry's globals (issues 1565, 2455): the
 * Manager's entry and the published seam's share one notice, the seam's copy names no window and is
 * raised once, a failure before `ui.notifications` exists waits for `ready`, and `src/main.js` wires
 * the Manager to the shared instance.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reportDeferredChunkFailure,
  reportPublishedLoadFailure,
} from '../src/ui/deferredChunkFailureReport.js';
import { DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE } from '../src/utils/deferredEntryNotice.js';

import { walkNodes } from './helpers/moduleAst.js';
import { moduleAstOf } from './helpers/parsedSource.js';

const CHUNK_FAILURE = new TypeError(
  'Failed to fetch dynamically imported module: https://host/modules/fabricate/chunks/Rail-B57jCpyM.js'
);
const PART = /^Part of Fabricate could not load because this browser is still running/;
const MANAGER = /^Fabricate could not open the crafting system manager because/;

/** Runs `run` over stubbed `ui`, `game` and `Hooks` globals and a recorded `console.error`. */
async function withFoundryGlobals(run) {
  const saved = ['ui', 'game', 'Hooks'].map((name) => [name, globalThis[name]]);
  const original = console.error;
  const world = { logged: [], notified: [], hooks: [] };
  const once = (name, handler) => {
    world.hooks.push([name, handler]);
  };
  Object.assign(globalThis, { ui: {}, game: {}, Hooks: { once } });
  console.error = (...args) => {
    world.logged.push(args);
  };
  try {
    await run(world);
  } finally {
    console.error = original;
    Object.assign(globalThis, Object.fromEntries(saved));
  }
}

/** The `ui.notifications` `Game#initializeUI` creates, recording each `error`; none stays live. */
function notifications(world) {
  return {
    error: (message, options) => {
      world.notified.push({ message, options });
      return { id: world.notified.length };
    },
    has: () => false,
  };
}

test("the seam's entry raises the neutral notice once, after ready, and the Manager's its own", async () => {
  await withFoundryGlobals(async (world) => {
    reportPublishedLoadFailure(CHUNK_FAILURE);
    assert.deepEqual(world.logged, [[DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, CHUNK_FAILURE]]);
    assert.deepEqual(
      world.hooks.map(([name]) => name),
      ['ready'],
      'a failure before ui.notifications exists waits for ready'
    );

    globalThis.ui.notifications = notifications(world);
    world.hooks[0][1]();
    assert.equal(world.notified.length, 1);
    assert.match(world.notified[0].message, PART);
    assert.doesNotMatch(world.notified[0].message, /crafting system manager/);
    assert.deepEqual(world.notified[0].options, { console: false });

    reportPublishedLoadFailure(CHUNK_FAILURE);
    assert.equal(world.logged.length, 2, 'every failure writes its console line');
    assert.equal(world.notified.length, 1, 'the neutral notice is raised once per page');

    reportDeferredChunkFailure(CHUNK_FAILURE);
    assert.equal(world.notified.length, 2);
    assert.match(world.notified[1].message, MANAGER);
  });
});

/** The value `src/main.js`'s `io` gives `key`, and the local names its import of `source` binds. */
function mainWiring(key, source) {
  const { ast } = moduleAstOf('src/main.js');
  const nodes = [...walkNodes(ast)];
  const values = nodes
    .filter((node) => node.type === 'Property' && node.key?.name === key)
    .map((node) => node.value);
  const imported = nodes
    .flatMap((node) =>
      node.type === 'ImportDeclaration' && node.source.value === source ? node.specifiers : []
    )
    .map((specifier) => [specifier.imported?.name, specifier.local.name]);
  return { values, imported };
}

test("main.js wires the Manager's reporter to the shared instance it imports", () => {
  const { values, imported } = mainWiring(
    'reportManagerLoadFailure',
    './ui/deferredChunkFailureReport.js'
  );
  assert.equal(values.length, 1, 'one reportManagerLoadFailure');
  assert.equal(values[0].type, 'Identifier');
  assert.deepEqual(imported, [['reportDeferredChunkFailure', values[0].name]]);
});
