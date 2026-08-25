/**
 * THE DIFFICULTY CARD, DRIVEN THROUGH ITS CONTROLS (issue 1096).
 *
 * Written after an audit asked which controls in this change a test actually CLICKS. The
 * comparison segments and the DC-source radios were asserted by PRESENCE only — their
 * `onChange` handlers were reachable by reading the source and by nothing else, which is the
 * same exposure that lets a control ship inert with a green proof beside it.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-difficulty-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/apps/manager/checks/checksCopy.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/**
 * The real control inside a segment is the visually hidden radio; the `<label>` is only the
 * styled surface. Set `.checked`, then dispatch a bubbling `change` — a bare `.click()` on
 * the label is NOT it.
 */
function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  return radio;
}

describe('the Difficulty card writes what its controls say', () => {
  it('CHOOSING a comparison segment emits the new threshold mode', async () => {
    const emitted = [];
    const root = await harness.mount({
      dc: 12,
      thresholdMode: 'meet',
      onChange: (patch) => emitted.push(patch),
    });
    assert.ok(
      root.querySelector('[data-threshold-mode-option="meet"]').classList.contains('is-active'),
      'the authored mode is the lit one before anything is touched'
    );
    choose(root, 'data-threshold-mode-option', 'exceed');
    assert.deepEqual(emitted.at(-1), { thresholdMode: 'exceed' });
  });

  it('re-choosing the mode already in force writes nothing', async () => {
    const emitted = [];
    const root = await harness.mount({
      dc: 12,
      thresholdMode: 'meet',
      onChange: (patch) => emitted.push(patch),
    });
    choose(root, 'data-threshold-mode-option', 'meet');
    assert.equal(emitted.length, 0, 'a no-op selection must not dirty the draft');
  });

  it('CHOOSING a DC source emits the new mode', async () => {
    const emitted = [];
    const root = await harness.mount({
      showDcSource: true,
      dc: 12,
      dcMode: 'static',
      onChange: (patch) => emitted.push(patch),
    });
    choose(root, 'data-dc-mode-option', 'dynamic');
    assert.deepEqual(emitted.at(-1), { dcMode: 'dynamic' });
  });

  it('re-choosing the DC source already in force writes nothing', async () => {
    const emitted = [];
    const root = await harness.mount({
      showDcSource: true,
      dc: 12,
      dcMode: 'dynamic',
      onChange: (patch) => emitted.push(patch),
    });
    choose(root, 'data-dc-mode-option', 'dynamic');
    assert.equal(emitted.length, 0);
  });

  it('withholds the DC-source chooser entirely when the slot carries no dcMode', async () => {
    const root = await harness.mount({ dc: 12 });
    assert.equal(
      root.querySelector('[data-dc-mode-option]'),
      null,
      'a chooser writing a field nothing reads must not render'
    );
    assert.ok(root.querySelector('[data-check-dc]'), 'the base DC still does');
  });

  it("puts the activity's own noun in the DC-source copy", async () => {
    const root = await harness.mount({ showDcSource: true, dc: 12, recordNoun: 'gathering task' });
    const text = root.querySelector('[data-dc-mode-option="static"]').textContent;
    assert.match(text, /gathering task/);
    assert.doesNotMatch(text, /\{record\}/, 'no placeholder survives to the screen');
  });
});
