/**
 * The mounted fixture the published-`Stepper` prop suites share: a harness, a fresh seam over the
 * adapter's own table, escape and report recording, and a recording `mountStepper`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach } from 'node:test';

import { recorder } from './publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  recordEscapes,
  shippedSeam,
} from './publishedComponentModules.js';
import { createMountedComponentHarness } from './svelte-component-harness.js';

export const STEPPER_NAMES = Object.freeze({
  ariaLabel: 'Days to credit',
  decrementLabel: 'Decrease days to credit',
  incrementLabel: 'Increase days to credit',
});

/** The props of a stepper at 2 with its three names and an `onChange` that keeps nothing, with `overrides` over them. */
export const base = (overrides = {}) => ({
  value: 2,
  ...STEPPER_NAMES,
  onChange() {},
  ...overrides,
});

/** Types `raw` into `input` as a user would, firing the real `input` event. */
export function type(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** Registers the suite hooks and returns `{ ui, mountStepper, state }` for the calling file. */
export function installStepperSeam(tmpPrefix) {
  const harness = createMountedComponentHarness({
    repoRoot: resolve(import.meta.dirname, '../..'),
    tmpPrefix,
    rawModules: PUBLISHED_RAW_MODULES,
    runeModules: PUBLISHED_RUNE_MODULES,
    compiledModules: PUBLISHED_COMPILED_MODULES,
    componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
  });
  const state = { seamParts: null, reports: [], escaped: [], targets: [], stopRecording: null };

  before(async () => {
    await harness.setup();
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    state.seamParts = { createPublishedComponents, runtime, components };
    state.stopRecording = recordEscapes((error) => {
      state.escaped.push(error);
    });
  });

  after(() => {
    state.stopRecording();
    return harness.teardown();
  });

  beforeEach(() => {
    state.reports = [];
    state.escaped = [];
    state.targets = [];
  });

  afterEach(() => {
    for (const shell of state.targets) shell.remove();
    assert.deepEqual(state.escaped, [], 'nothing was thrown past the seam');
    assert.deepEqual(state.reports, [], 'nothing was reported');
  });

  const ui = () =>
    shippedSeam({
      ...state.seamParts,
      report: (...args) => {
        state.reports.push(args);
      },
    });

  /** A stepper mounted with `props` over `base`, recording `onChange`: its target, handle, calls and parts. */
  function mountStepper(props = {}) {
    const change = recorder();
    const target = fabricateTarget(state.targets, 'fabricate');
    const handle = ui().mount('Stepper', {
      target,
      props: base({ onChange: change.record, ...props }),
    });
    return {
      target,
      handle,
      calls: change.calls,
      record: change.record,
      root: () => target.querySelector('.fab-stepper'),
      input: () => target.querySelector('input'),
      decrement: () => target.querySelector('button[data-stepper-decrement]'),
      increment: () => target.querySelector('button[data-stepper-increment]'),
    };
  }

  return { ui, mountStepper, state };
}
