import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Use the shared mounted-component harness rather than re-inlining the compile/
// mount boilerplate (which duplicates the other mount tests).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chance-bar-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/util/dropRateTier.js'
  ],
  // `FillBar` joined the tree when issue 1096 rebuilt ChanceBar on the shared primitive
  // `ui-visual-style/spec.md` §Shared product UI primitives names. Omitting it does not fail
  // this suite — `createMountedComponentHarness` throws in `before()` naming the module,
  // which is the loud half of the trap; a hand-rolled harness would have HUNG instead.
  compiledModules: [
    'src/ui/svelte/components/FillBar.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/components/BandedBar.svelte',
    'src/ui/svelte/apps/gathering/ChanceBar.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/gathering/ChanceBar.svelte'
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ChanceBar (mounted)', () => {
  it('renders nothing when value is null', async () => {
    const root = await harness.mount({ value: null, scale: 'success' });
    assert.ok(!root.querySelector('[role="meter"]'), 'no meter for a null value');
  });

  it('renders a success meter with the success data-attribute and no tier', async () => {
    const root = await harness.mount({ value: 1, scale: 'success' });
    // A single-row `BandedBar` is a meter (issue 1782).
    const meter = root.querySelector('.fab-banded-bar[role="meter"]');
    assert.ok(meter, 'expected a single-row banded meter (success)');
    assert.equal(meter.getAttribute('data-gathering-success-value'), '100');
    assert.equal(meter.getAttribute('aria-valuenow'), '100');
    assert.equal(meter.getAttribute('aria-valuemin'), '0');
    assert.equal(meter.getAttribute('aria-valuemax'), '100');
    assert.ok(!meter.hasAttribute('data-gathering-event-value'), 'no event hook on the success scale');
    assert.match(
      meter.getAttribute('aria-label'),
      /^FABRICATE\.App\.Gathering\.Detail\.SuccessChance:/,
      'the sentence naming the chance replaces the caption as the name'
    );
    assert.ok(Boolean(root.querySelector('.fab-kicker')), 'the caption renders as a kicker');
    assert.match(
      root.querySelector('.fab-fill-bar-fill').getAttribute('style'),
      /^width: 100%;?$/
    );
    assert.equal(root.querySelector('[data-banded-bar-percent]').textContent, '100%');
  });

  it('hides the caption when showCaption is false', async () => {
    const root = await harness.mount({ value: 0.5, scale: 'success', showCaption: false });
    assert.ok(!root.querySelector('.fab-kicker'), 'no kicker is rendered');
    assert.ok(root.querySelector('[role="meter"]').getAttribute('aria-label'), 'and it stays named');
  });

  it('renders an event meter with the event data-attributes', async () => {
    const root = await harness.mount({ value: 0.5, scale: 'event' });
    const meter = root.querySelector('[role="meter"]');
    assert.ok(meter, 'expected a meter (event)');
    assert.equal(meter.getAttribute('data-gathering-event-value'), '50');
    assert.ok(!meter.hasAttribute('data-gathering-success-value'), 'no success hook on the event scale');
    assert.equal(meter.getAttribute('aria-valuenow'), '50');
  });

  it('reads the event scale off the risk ramp, one named fill per tier', async () => {
    // Ruling 4 (issue 1782): four bands, and the middle one is a named theme colour.
    const cases = [
      [0.8, 'red', { tone: 'danger', style: '' }],
      [0.6, 'amber', { tone: 'success', style: 'var(--fab-hazard-mid)' }],
      [0.3, 'yellow', { tone: 'warning', style: '' }],
      [0.1, 'green', { tone: 'success', style: '' }],
    ];
    for (const [value, tier, fill] of cases) {
      const root = await harness.mount({ value, scale: 'event' });
      const meter = root.querySelector('[role="meter"]');
      assert.equal(meter.getAttribute('data-gathering-event-tier'), tier, `${value} is ${tier}`);
      const bar = root.querySelector('.fab-fill-bar');
      assert.equal(bar.getAttribute('data-fill-bar-tone'), fill.tone, `${tier} takes its tone`);
      const style = root.querySelector('.fab-fill-bar-fill').getAttribute('style') || '';
      if (fill.style) assert.ok(style.includes(fill.style), `${tier} paints ${fill.style}`);
      else assert.doesNotMatch(style, /background/, `${tier} leaves the tone in charge`);
      harness.remount();
    }
  });

  it('leaves the success scale on the primitive semantic tone, with no inline colour', async () => {
    const root = await harness.mount({ value: 0.5, scale: 'success' });
    const fill = root.querySelector('.fab-fill-bar-fill');
    assert.ok(fill.classList.contains('is-success'), 'the success scale is a flat green');
    assert.doesNotMatch(fill.getAttribute('style') || '', /background/);
  });
});
