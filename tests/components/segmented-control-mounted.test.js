import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Shared mounted-component harness (no inlined mount boilerplate — that trips the
// Sonar duplication gate).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-segmented-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/SegmentedControl.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/SegmentedControl.svelte'
});

const OPTIONS = [
  { value: 'destroyed', labelKey: 'FABRICATE.X.Destroyed', fallback: 'Destroyed', icon: 'fas fa-trash' },
  { value: 'inert', labelKey: 'FABRICATE.X.Inert', fallback: 'Becomes inert' }
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('SegmentedControl (mounted)', () => {
  it('renders one radio segment per option with the fallback labels', async () => {
    const root = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'when-spent' });
    const segments = root.querySelectorAll('.manager-segment');
    assert.equal(segments.length, 2);
    const radios = root.querySelectorAll('input[type="radio"]');
    assert.equal(radios.length, 2);
    assert.equal(radios[0].getAttribute('name'), 'when-spent');
    const labels = [...root.querySelectorAll('.manager-segment-label')].map(n => n.textContent);
    assert.deepEqual(labels, ['Destroyed', 'Becomes inert']);
  });

  it('reflects the selected value on the active segment and its radio', async () => {
    const root = await harness.mount({ options: OPTIONS, value: 'inert', groupName: 'g' });
    const active = root.querySelector('.manager-segment.is-active');
    assert.ok(active, 'expected an active segment');
    assert.equal(active.querySelector('.manager-segment-label').textContent, 'Becomes inert');
    const radios = root.querySelectorAll('input[type="radio"]');
    assert.equal(radios[0].checked, false);
    assert.equal(radios[1].checked, true);
  });

  it('calls onChange with the option value when a segment is selected', async () => {
    const calls = [];
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      onChange: (v) => calls.push(v)
    });
    const inertRadio = root.querySelectorAll('input[type="radio"]')[1];
    inertRadio.checked = true;
    inertRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(calls, ['inert']);
  });

  it('does not fire onChange when the already-selected segment is chosen', async () => {
    const calls = [];
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      onChange: (v) => calls.push(v)
    });
    const destroyedRadio = root.querySelectorAll('input[type="radio"]')[0];
    destroyedRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(calls, []);
  });

  it('stamps dataAttr and optionDataAttr hooks', async () => {
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      dataAttr: 'data-when-spent-control',
      optionDataAttr: 'data-when-spent-option'
    });
    assert.ok(root.querySelector('[data-when-spent-control]'));
    assert.ok(root.querySelector('[data-when-spent-option="inert"]'));
  });
});
