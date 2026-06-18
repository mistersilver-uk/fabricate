import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Use the shared mounted-component harness rather than re-inlining the compile/
// mount boilerplate (which duplicates the other mount tests).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chance-bar-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/gatheringFormat.js'
  ],
  compiledModules: ['src/ui/svelte/apps/gathering/ChanceBar.svelte'],
  componentPath: 'src/ui/svelte/apps/gathering/ChanceBar.svelte'
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ChanceBar (mounted)', () => {
  it('renders nothing when value is null', async () => {
    const root = await harness.mount({ value: null, scale: 'success' });
    assert.equal(root.querySelector('[role="meter"]'), null);
  });

  it('renders a success meter with the success data-attribute and no tier', async () => {
    const root = await harness.mount({ value: 1, scale: 'success' });
    const meter = root.querySelector('.chance-bar');
    assert.ok(meter, 'expected a .chance-bar root (success)');
    assert.equal(meter.getAttribute('data-gathering-success-value'), '100');
    assert.equal(meter.getAttribute('aria-valuenow'), '100');
    assert.equal(meter.getAttribute('aria-valuemin'), '0');
    assert.equal(meter.getAttribute('aria-valuemax'), '100');
    assert.equal(meter.getAttribute('data-gathering-event-value'), null);
    assert.equal(root.querySelector('.chance-bar-caption') !== null, true);
    assert.match(root.querySelector('.chance-bar-fill').getAttribute('style'), /^width: 100%;?$/);
    assert.equal(root.querySelector('.chance-bar-percent').textContent, '100%');
  });

  it('hides the caption when showCaption is false', async () => {
    const root = await harness.mount({ value: 0.5, scale: 'success', showCaption: false });
    assert.equal(root.querySelector('.chance-bar-caption'), null);
    assert.ok(root.querySelector('.chance-bar'));
  });

  it('renders an event meter with the event data-attributes', async () => {
    const root = await harness.mount({ value: 0.5, scale: 'event' });
    const meter = root.querySelector('.chance-bar');
    assert.ok(meter, 'expected a .chance-bar root (event)');
    assert.equal(meter.getAttribute('data-gathering-event-value'), '50');
    assert.equal(meter.getAttribute('data-gathering-success-value'), null);
    assert.equal(meter.getAttribute('aria-valuenow'), '50');
  });

  it('maps the event tier ladder to the right class and data-attribute', async () => {
    const cases = [
      [0.8, 'red'],
      [0.6, 'amber'],
      [0.3, 'yellow'],
      [0.1, 'green']
    ];
    for (const [value, tier] of cases) {
      const root = await harness.mount({ value, scale: 'event' });
      const meter = root.querySelector('.chance-bar');
      assert.ok(meter.classList.contains(`tier-${tier}`), `value ${value} should be tier-${tier}`);
      assert.equal(meter.getAttribute('data-gathering-event-tier'), tier);
      harness.remount();
    }
  });
});
