/**
 * What the published-component mounted suites share (issue 2448): the harness lists of the seam,
 * its adapter and every shipped entry's import closure, and the bare-target helpers. Each list is
 * one frozen literal with no nested bracket, because
 * `tests/components/mounted-harness-primitive-allowlist.test.js` reads a roster's paths as text.
 */
import assert from 'node:assert/strict';

export const PUBLISHED_SEAM = 'src/ui/publishedComponentSeam.js';
export const PUBLISHED_ADAPTER = 'src/ui/publishedComponents.svelte.js';

export const PUBLISHED_RAW_MODULES = Object.freeze([
  'src/ui/publishedComponentSeam.js',
  'src/ui/publishedComponentManifest.js',
  'src/ui/svelte/util/dropRateTier.js',
]);

export const PUBLISHED_RUNE_MODULES = Object.freeze(['src/ui/publishedComponents.svelte.js']);

export const PUBLISHED_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/published/PublishedComponentHost.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/TierTrack.svelte',
  'src/ui/svelte/components/Avatar.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/Meter.svelte',
  'src/ui/svelte/components/BandedBar.svelte',
  'src/ui/svelte/components/StatBox.svelte',
  'src/ui/svelte/components/InfoStrip.svelte',
]);

/** Past Svelte's flush and the boundary's `onerror` microtask, and the deferred unmount after it. */
export const settle = () => new Promise((done) => setTimeout(done, 0));

/** An empty target in a companion's own shell, under no Fabricate root; `shells` collects it for removal. */
export function companionTarget(shells) {
  const shell = document.createElement('section');
  shell.className = 'companion-sheet';
  const target = document.createElement('div');
  shell.append(target);
  document.body.append(shell);
  shells.push(shell);
  assert.ok(!target.closest('.fabricate, .fabricate-app, .fabricate-manager'), 'no app root');
  return target;
}

/** A fresh seam over the shipped manifest, registered with the adapter's own `components` table. */
export function shippedSeam({ createPublishedComponents, runtime, components, report }) {
  const instance = createPublishedComponents({ isReady: () => true, report });
  instance.register({ ...runtime, components });
  return instance.publicApi;
}

export function assertClipped(element, what) {
  const style = getComputedStyle(element);
  assert.equal(style.position, 'absolute', `${what} is taken out of flow`);
  assert.equal(style.overflow, 'hidden', what);
  assert.equal(style.width, '1px', what);
  assert.equal(style.height, '1px', what);
  assert.equal(style.clipPath, 'inset(50%)', what);
}
