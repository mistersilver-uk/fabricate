/**
 * Unit coverage for the PURE {@link InteractionPromptApp} singleton decisions.
 *
 * The app shell extends `SvelteApplicationMixin(ApplicationV2)` and imports a
 * `.svelte` root, so it cannot be `new`'d under `node:test`. The
 * show/dismiss-matching logic is extracted into the plain `.js`
 * `interactionPromptSingleton.js` so it is testable here; a source guard pins
 * that the shipped app uses these decisions (so the contract cannot silently
 * drift).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planPromptDismiss, buildPromptBehaviorRef } from '../../src/ui/interactionPromptSingleton.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('buildPromptBehaviorRef joins a complete ref into a stable key', () => {
  assert.equal(buildPromptBehaviorRef({ sceneId: 's1', regionId: 'r1', behaviorId: 'b1' }), 's1.r1.b1');
});

test('buildPromptBehaviorRef returns null for an incomplete ref', () => {
  assert.equal(buildPromptBehaviorRef({ sceneId: 's1', regionId: 'r1' }), null);
  assert.equal(buildPromptBehaviorRef({}), null);
  assert.equal(buildPromptBehaviorRef(), null);
});

test('planPromptDismiss: a bare dismiss always closes the live prompt', () => {
  assert.equal(planPromptDismiss('s1.r1.b1', undefined), true);
  assert.equal(planPromptDismiss('s1.r1.b1', null), true);
  assert.equal(planPromptDismiss(null, undefined), true);
});

test('planPromptDismiss: a targeted dismiss only closes when the ref matches the live prompt', () => {
  assert.equal(planPromptDismiss('s1.r1.b1', 's1.r1.b1'), true, 'matching ref dismisses');
  assert.equal(planPromptDismiss('s1.r1.b1', 's1.r2.b2'), false, 'a stale exit for a different region does NOT dismiss a newer prompt');
  assert.equal(planPromptDismiss(null, 's1.r1.b1'), false, 'nothing to dismiss when no live prompt ref');
});

// --- source guard: the shipped app uses these decisions ---------------------

test('InteractionPromptApp imports + uses the singleton decisions (no drift)', () => {
  const source = readFileSync(resolve(__dirname, '../../src/ui/InteractionPromptApp.svelte.js'), 'utf8');
  assert.match(source, /from '\.\/interactionPromptSingleton\.js'/, 'the app imports the pure decisions');
  assert.match(source, /planPromptDismiss\(InteractionPromptApp\._behaviorRef, behaviorRef\)/, 'dismiss() gates on planPromptDismiss');
  assert.match(source, /static async show\(/, 'show() is a static singleton entry point');
  assert.match(source, /static async dismiss\(/, 'dismiss() is a static entry point');
  // Replace-on-enter: show() closes any existing instance before constructing.
  assert.match(source, /InteractionPromptApp\._instance/, 'tracks a single live instance');
});
