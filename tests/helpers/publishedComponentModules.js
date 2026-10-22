/**
 * What the published-component mounted suites share (issue 2448): the harness lists of the seam,
 * its adapter and every shipped entry's import closure, and the target helpers. Each list is
 * one frozen literal with no nested bracket, because
 * `tests/components/mounted-harness-primitive-allowlist.test.js` reads a roster's paths as text.
 */
import assert from 'node:assert/strict';

export const PUBLISHED_SEAM = 'src/ui/publishedComponentSeam.js';
export const PUBLISHED_ADAPTER = 'src/ui/publishedComponents.svelte.js';

/** The first argument of the seam's report of a contained fault, and of a callback failure. */
export const FAULT_REPORT = 'Fabricate | Published component render failed:';
export const CALLBACK_REPORT = 'Fabricate | Published component callback failed:';

export const PUBLISHED_RAW_MODULES = Object.freeze([
  'src/ui/publishedComponentSeam.js',
  'src/ui/publishedComponentProps.js',
  'src/ui/publishedComponentCallbacks.js',
  'src/ui/publishedComponentValues.js',
  'src/ui/publishedComponentManifest.js',
  'src/ui/publishedComponentOverlays.js',
  'src/ui/svelte/util/overlayHost.js',
  'src/ui/theme.js',
  'src/ui/svelte/util/dropRateTier.js',
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/util/overlayBounds.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/listboxNavigation.js',
  'src/ui/svelte/util/pickerOptionModel.js',
  'src/ui/svelte/util/appLocalizer.js',
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
  'src/ui/svelte/components/Rail.svelte',
  'src/ui/svelte/components/InspectorCard.svelte',
  'src/ui/svelte/components/EmptyState.svelte',
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/components/Button.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/components/SearchField.svelte',
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/Select.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
  'src/ui/svelte/components/SearchablePopoverPanel.svelte',
]);

/** Past Svelte's flush and the boundary's `onerror` microtask, and the deferred unmount after it. */
export const settle = () => new Promise((done) => setTimeout(done, 0));

/** An empty target in a shell carrying `classes`, a Fabricate window frame's by default; `shells` collects it for removal. */
export function fabricateTarget(shells, classes = 'fabricate') {
  const shell = document.createElement('section');
  shell.className = classes;
  const target = document.createElement('div');
  shell.append(target);
  document.body.append(shell);
  shells.push(shell);
  return target;
}

/** An empty target in a companion's own shell, under no Fabricate root; `shells` collects it for removal. */
export function companionTarget(shells) {
  const target = fabricateTarget(shells, 'companion-sheet');
  assert.ok(!target.closest('.fabricate, .fabricate-app, .fabricate-manager'), 'no app root');
  return target;
}

/** Runs `run` with `css` in the document and a theme named on its root, then removes both. */
export async function underSheet(css, run) {
  const root = document.documentElement;
  const sheet = document.createElement('style');
  sheet.textContent = css;
  document.head.append(sheet);
  root.setAttribute('data-fabricate-theme', 'probe');
  try {
    await run();
  } finally {
    root.removeAttribute('data-fabricate-theme');
    sheet.remove();
  }
}

/**
 * Passes `record` every error thrown past the seam until the returned function is called: Node's
 * uncaught exceptions and unhandled rejections, and those happy-dom traps in its timers and
 * microtasks and reports on its own window, which never reach `process`.
 */
export function recordEscapes(record) {
  const view = document.defaultView;
  const trapped = (event) => record(event.error);
  process.on('uncaughtException', record);
  process.on('unhandledRejection', record);
  view.addEventListener('error', trapped);
  return () => {
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
    view.removeEventListener('error', trapped);
  };
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
  assert.equal(style.padding, '0px', what);
  assert.equal(style.margin, '-1px', what);
  assert.equal(style.whiteSpace, 'nowrap', what);
  assert.equal(style.borderWidth, '0px', what);
}
