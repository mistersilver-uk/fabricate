import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/gatheringFormat.js'
  ],
  // `FillBar` joined the tree when issue 1096 rebuilt ChanceBar on the shared primitive
  // `ui-integration/spec.md` §Shared product UI primitives names. Omitting it does not fail
  // this suite — `createMountedComponentHarness` throws in `before()` naming the module,
  // which is the loud half of the trap; a hand-rolled harness would have HUNG instead.
  compiledModules: [
    'src/ui/svelte/components/FillBar.svelte',
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
    // The fill moved into the shared `FillBar` leaf (issue 1096). Retargeted rather than
    // deleted: the value-width binding is the thing this line has always been proving, and
    // an assertion left pointing at the retired `.chance-bar-fill` would have passed
    // vacuously the moment `querySelector` started returning null had it been a truthiness
    // check instead of a read.
    assert.match(
      root.querySelector('.fab-fill-bar-fill').getAttribute('style'),
      /^width: 100%;?$/
    );
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

  it('routes the event fill through the tier custom property, and keeps four DISTINCT values', async () => {
    // The tier classes used to select four rules in this component's own scoped block, and
    // rebuilding on `FillBar` put the painted element out of that block's reach. The colour
    // therefore travels as ONE inherited custom property, and nothing in the assertions
    // above would notice if two tiers had been folded onto one value on the way.
    //
    // Two halves, because neither is sufficient alone. The MOUNTED half proves the child
    // actually reads the property (a rebuild that dropped the `color` prop would leave the
    // four rules declaring a variable nobody consumes). The SOURCE half proves the four
    // rules still resolve to four different colours — happy-dom applies no stylesheet at
    // all, so a mounted read cannot see a declared value, and a `color-mix()` written
    // inline is silently DISCARDED by its `cssText` parser, which is what makes the
    // stylesheet the right home for these rather than a workaround for the test.
    const root = await harness.mount({ value: 0.6, scale: 'event' });
    const fill = root.querySelector('.fab-fill-bar-fill');
    assert.match(fill.getAttribute('style') || '', /background:\s*var\(--chance-bar-fill\)/);

    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/gathering/ChanceBar.svelte'),
      'utf8'
    );
    const declared = [...source.matchAll(/\.chance-bar\.tier-\w+\s*\{\s*--chance-bar-fill:\s*([^;]+);/g)].map(
      ([, value]) => value.trim()
    );
    assert.equal(declared.length, 4, `expected four tier declarations, got ${declared.length}`);
    assert.equal(new Set(declared).size, 4, `expected four distinct fills, got ${declared}`);
    for (const colour of declared) {
      assert.match(colour, /var\(--fab-/, `${colour} should resolve through a theme token`);
    }

    // And a DEFAULT on the base class. `var()` with no value and no fallback resolves to the
    // guaranteed-invalid value, so `background` falls back to `transparent` — a fill that
    // paints nothing, under a caption reading a real percentage. The default is declared at
    // lower specificity than the four tiers, so it can only ever apply when none of them does.
    const base = /\.chance-bar\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?--chance-bar-fill:\s*(var\(--fab-[\w-]+\));/.exec(
      source
    );
    assert.ok(Boolean(base), 'the base .chance-bar rule declares a fallback fill');
    // And it is a NAMED neutral, not "any theme token". Accepting any `--fab-*` let the fill
    // of last resort be `--fab-danger` — byte-identical to `tier-red`, so a bar whose tier
    // rule never applied was indistinguishable from the scale's most alarming reading — and
    // would equally accept `--fab-success` under a danger caption.
    assert.equal(base[1], 'var(--fab-text-subtle)', 'the last-resort fill is a subtle neutral');
    assert.ok(
      !declared.includes(base[1]),
      `the fallback must not be one of the four tier colours, got ${base[1]}`
    );
  });

  it('leaves the success scale on the primitive semantic tone, with no inline colour', async () => {
    const root = await harness.mount({ value: 0.5, scale: 'success' });
    const fill = root.querySelector('.fab-fill-bar-fill');
    assert.ok(fill.classList.contains('is-success'), 'the success scale is a flat green');
    assert.doesNotMatch(fill.getAttribute('style') || '', /background/);
  });
});
