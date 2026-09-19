/**
 * The smoke harness's canvas-readiness predicate, and the harness contract that keeps it in force
 * (issue 1010).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isCanvasReadyForScene } from '../scripts/lib/foundryCanvasReadiness.js';
import { SMOKE_SOURCE } from './helpers/interactablesSmokeLocators.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCENE_ID = 'sceneAzureGrove';
const OTHER_SCENE_ID = 'scenePreviouslyViewed';

/** Install a fake `globalThis.canvas` for one assertion and restore whatever was there. */
function withCanvas(canvasValue, body) {
  const had = Object.hasOwn(globalThis, 'canvas');
  const previous = globalThis.canvas;
  globalThis.canvas = canvasValue;
  try {
    return body();
  } finally {
    if (had) globalThis.canvas = previous;
    else delete globalThis.canvas;
  }
}

/** The harness source with whole-line comments removed, so prose cannot satisfy a code assertion. */
function harnessCode() {
  return SMOKE_SOURCE
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'));
    })
    .join('\n');
}

test('a fully drawn canvas showing the requested scene is ready', () => {
  withCanvas({ ready: true, scene: { id: SCENE_ID } }, () => {
    assert.ok(isCanvasReadyForScene(SCENE_ID));
  });
});

test('the mid-draw window is NOT ready — the exact state that threw in issue #1010', () => {
  // Canvas##draw assigns `#scene = nextScene` (board.mjs:1149) long before `#activateTicker()`
  // (1209) creates `pendingRenderFlags` and before `#ready = true` (1475).
  withCanvas({ ready: false, scene: { id: SCENE_ID } }, () => {
    assert.ok(
      !isCanvasReadyForScene(SCENE_ID),
      'the scene id matching while `ready` is false is precisely the window in which creating a' +
        ' placeable throws "Cannot read properties of undefined (reading \'INTERFACE\')" — the' +
        ' predicate must refuse it'
    );
  });
});

test('a stale ready flag cannot pass for the incoming scene', () => {
  // The other half of the ordering argument: `#ready = false` at board.mjs:1105 runs BEFORE the
  // scene swaps at 1149, so `ready === true` alongside the NEW id can only mean that draw finished.
  withCanvas({ ready: true, scene: { id: OTHER_SCENE_ID } }, () => {
    assert.ok(!isCanvasReadyForScene(SCENE_ID), 'a ready canvas showing another scene is not ready');
  });
});

test('an absent or half-built canvas is not ready', () => {
  for (const [label, value] of [
    ['no canvas at all', undefined],
    ['a null canvas', null],
    ['a canvas with no scene', { ready: true }],
    ['a canvas with a null scene', { ready: true, scene: null }],
    ['a canvas with no ready flag', { scene: { id: SCENE_ID } }],
  ]) {
    withCanvas(value, () => {
      assert.ok(!isCanvasReadyForScene(SCENE_ID), `${label} must not read as ready`);
    });
  }
});

test('the predicate demands a boolean true, not a truthy ready', () => {
  // `=== true` rather than a truthy read, so a future Foundry that swapped `ready` for a promise or
  // a status string could not silently satisfy this the instant the field became non-empty.
  withCanvas({ ready: 'drawing', scene: { id: SCENE_ID } }, () => {
    assert.ok(!isCanvasReadyForScene(SCENE_ID));
  });
});

test('the predicate survives being shipped to the browser as source text', () => {
  // Playwright does not send the function — it sends `String(fn)` and evaluates it in the page.
  const rebuilt = new Function(`return (${String(isCanvasReadyForScene)});`)();

  assert.equal(typeof rebuilt, 'function', 'the predicate must stringify back into a function');
  withCanvas({ ready: true, scene: { id: SCENE_ID } }, () => {
    assert.ok(rebuilt(SCENE_ID), 'the rebuilt predicate must still accept a ready canvas');
  });
  withCanvas({ ready: false, scene: { id: SCENE_ID } }, () => {
    assert.ok(!rebuilt(SCENE_ID), 'the rebuilt predicate must still refuse the mid-draw window');
  });
});

test('the harness routes every scene activation through the readiness helper', () => {
  const code = harnessCode();

  // Non-vacuity: assert the inputs are alive before asserting anything about their contents.
  assert.ok(code.length > 10_000, 'read no meaningful harness source — this guard would be vacuous');
  assert.ok(
    code.includes('async function activateSceneAndAwaitCanvasReady('),
    'activateSceneAndAwaitCanvasReady is gone from the harness. If it was renamed, repoint this' +
      ' test; do not delete it — it is what keeps a new scene switch from being written the old way.'
  );
  assert.ok(
    code.includes('foundryCanvasReadiness.js'),
    'the harness no longer imports the shared readiness predicate'
  );

  const activations = code.match(/\.activate\(\)/g) ?? [];
  assert.equal(
    activations.length,
    1,
    `the harness makes ${activations.length} scene activation call(s); exactly one is expected, the` +
      ' one inside activateSceneAndAwaitCanvasReady. A bare scene.activate() only STARTS an async' +
      ' draw, so anything creating a placeable after it races the canvas (issue #1010). Route the' +
      ' new call site through the helper.'
  );

  const sceneIdWaits = code.match(/canvas\??\.?scene\??\.?\.?id === /g) ?? [];
  assert.equal(
    sceneIdWaits.length,
    0,
    'the harness compares canvas.scene.id directly. That is NOT a canvas-readiness predicate — it' +
      ' becomes true about sixty lines before the render queues exist. Wait on' +
      ' isCanvasReadyForScene instead.'
  );
});

test('placeables are seeded BEFORE their scene is viewed, not after', () => {
  // The ordering is what actually prevents the throw, and it is the half a readiness wait cannot
  // provide: that wait is bounded and tolerant, so on a slow first draw it gives up and the walk
  // creates straight into the open window anyway — observed, not hypothesised (issue #1010).
  const code = harnessCode();

  const seedIndex = code.indexOf("createEmbeddedDocuments('Tile'");
  const viewIndex = code.indexOf('activateSceneAndAwaitCanvasReady(page, interactableRef?.sceneId)');

  assert.ok(seedIndex > 0, 'could not find the Tile seed in the harness — this guard is vacuous');
  assert.ok(viewIndex > 0, 'could not find the scene activation — this guard is vacuous');
  assert.ok(
    seedIndex < viewIndex,
    'the Manage Interactables block activates its scene BEFORE seeding placeables into it. That' +
      ' order creates documents on a scene the canvas may be mid-draw on, which throws' +
      " \"Cannot read properties of undefined (reading '<PRIORITY>')\" out of core as an" +
      ' unhandled rejection — a pageerror with no failing step. Seed first, then activate.'
  );
});

test('the harness carries no render-priority console-error waiver', () => {
  const code = harnessCode();

  assert.equal(
    code.match(/reading '(?:OBJECTS|INTERFACE|PERCEPTION)'/g),
    null,
    "a `reading '<PRIORITY>'` waiver is back in the harness. Both spellings of that message come" +
      ' from one place — canvas.pendingRenderFlags[priority] in RenderFlags#set/#clear — and are' +
      ' reachable only before the first scene finishes drawing. That window is closed by' +
      ' activateSceneAndAwaitCanvasReady, so the message returning means the readiness contract' +
      ' broke somewhere, and the [pageerror-stack] line in console.log will name the caller.' +
      ' Diagnose it; suppressing it is what hid issue #1010 for a year.'
  );
});

test('the pageerror handler records a stack for diagnosis without widening the gate', () => {
  const code = harnessCode();

  assert.ok(
    code.includes('consoleLog.push(`[pageerror-stack] ${err.stack}`)'),
    'the pageerror handler no longer records err.stack. An unhandled rejection from core Foundry' +
      ' carries no harness step to attribute it to, so without the stack the only way to find the' +
      ' throwing call is reading the Foundry source.'
  );

  const gateWrites = code.match(/consoleErrors\.push\([^)]*\)/g) ?? [];
  assert.ok(gateWrites.length > 0, 'found no consoleErrors writes at all — this guard is vacuous');
  assert.ok(
    gateWrites.every((write) => !write.includes('err.stack')),
    'a stack reached consoleErrors. The gate matches its waiver patterns against the MESSAGE, so' +
      ' feeding it stack text changes which runs fail; stacks belong in consoleLog only.'
  );
});
