/**
 * EssencePoolPanel (issue 917) — the chooser an essence slot opens.
 *
 * The load-bearing claims: the meter is a RATIO meter (`aria-valuemax = need`, not
 * 100), a carrier's stepper maxes at the units left after the non-essence plan
 * rather than the raw stack, and the whole control set is keyboard-operable and
 * named. The ChanceBar non-reuse exists precisely because a percentage meter cannot
 * make the first of those claims.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { essencePool } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-pool-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
});

const SHARED = essencePool({
  requirements: [
    { groupId: 'g-radiant', essenceId: 'radiant', name: 'Radiant', icon: 'fas fa-sun', colorToken: 'butter', need: 2, delivered: 2, owned: 4, satisfied: true },
    { groupId: 'g-shadow', essenceId: 'shadow', name: 'Shadow', icon: 'fas fa-moon', colorToken: 'lavender', need: 3, delivered: 1, owned: 2, satisfied: false },
  ],
  carriers: [
    { itemKey: 'Item.dusk', name: 'Duskcrystal', img: 'icons/gem.webp', ownedUnits: 3, allocatedUnits: 1, perUnit: { radiant: 2, shadow: 1 } },
    { itemKey: 'Item.prism', name: 'Prism Ash', img: null, ownedUnits: 2, allocatedUnits: 0, perUnit: { radiant: 1, ember: 1 } },
  ],
  allocation: { 'Item.dusk': 1 },
});

describe('EssencePoolPanel mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders nothing for a set with no essence requirement', async () => {
    const target = await harness.mount({ pool: null });
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  it('labels the panel back at the tile that opened it', async () => {
    const target = await harness.mount({
      pool: SHARED,
      panelId: 'panel-1',
      labelledBy: 'fabricate-slot-g-radiant',
    });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]');
    assert.equal(panel.getAttribute('id'), 'panel-1');
    assert.equal(panel.getAttribute('aria-labelledby'), 'fabricate-slot-g-radiant');
  });

  // A RATIO meter, not a percentage one: `aria-valuemax` is the requirement's need.
  it('exposes each requirement as a ratio progressbar over its own need', async () => {
    const target = await harness.mount({ pool: SHARED });
    const bars = [...target.querySelectorAll('[role="progressbar"]')];
    assert.deepEqual(
      bars.map((bar) => [bar.getAttribute('aria-valuemin'), bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]),
      [
        ['0', '2', '2'],
        ['0', '1', '3'],
      ]
    );
    assert.match(bars[0].getAttribute('aria-label'), /Pool\.Meter/);
  });

  it('reports met and short requirements distinctly on one shared pool', async () => {
    const target = await harness.mount({ pool: SHARED });
    assert.deepEqual(
      [...target.querySelectorAll('[data-essence-meter]')].map((meter) =>
        meter.getAttribute('data-essence-meter-state')
      ),
      ['met', 'partial']
    );
  });

  it('prints delivered/need as the readout, never the whole held amount', async () => {
    const target = await harness.mount({ pool: SHARED });
    const ratios = [...target.querySelectorAll('.essence-pool-meter-ratio')].map((node) =>
      node.textContent.trim()
    );
    assert.deepEqual(ratios, ['2/2', '1/3'], 'a met requirement reads exactly need/need');
  });

  it('tints a requirement meter from its authored palette token', async () => {
    const target = await harness.mount({ pool: SHARED });
    const [radiant, shadow] = target.querySelectorAll('[data-essence-meter]');
    assert.match(radiant.getAttribute('style'), /--fab-tag-butter/);
    assert.match(shadow.getAttribute('style'), /--fab-tag-lavender/);
  });

  // The stepper's ceiling is `ownedUnits` — the units left AFTER the set's
  // non-essence plan has claimed — so the player cannot allocate into an
  // infeasible state.
  it('caps each carrier stepper at the units left after the non-essence plan', async () => {
    const target = await harness.mount({ pool: SHARED });
    const inputs = [...target.querySelectorAll('[data-essence-allocation]')];
    assert.deepEqual(
      inputs.map((input) => [input.getAttribute('data-essence-allocation'), input.value, input.getAttribute('max')]),
      [
        ['Item.dusk', '1', '3'],
        ['Item.prism', '0', '2'],
      ]
    );
    assert.deepEqual(inputs.map((input) => input.getAttribute('min')), ['0', '0']);
  });

  it('keeps every allocation control keyboard-operable and named', async () => {
    const target = await harness.mount({ pool: SHARED });
    const row = target.querySelector('[data-essence-carrier="Item.dusk"]');
    const input = row.querySelector('input[type="number"]');
    assert.ok(input, 'the primary control is a real typeable input, not a click-only span');
    assert.match(input.getAttribute('aria-label'), /Pool\.Allocate/);
    assert.match(
      row.querySelector('[data-stepper-decrement]').getAttribute('aria-label'),
      /Pool\.AllocateLess/
    );
    assert.match(
      row.querySelector('[data-stepper-increment]').getAttribute('aria-label'),
      /Pool\.AllocateMore/
    );
  });

  it('reports the carrier and the new unit count on a stepper change', async () => {
    const calls = [];
    const target = await harness.mount({
      pool: SHARED,
      onAllocate: (itemKey, units) => calls.push([itemKey, units]),
    });
    target
      .querySelector('[data-essence-carrier="Item.prism"] [data-stepper-increment]')
      .click();
    assert.deepEqual(calls.at(-1), ['Item.prism', 1]);
  });

  it('multiplies a carrier contribution by the units allocated, and mutes an essence the set does not need', async () => {
    const target = await harness.mount({ pool: SHARED });
    const picked = target.querySelector('[data-essence-picked="Item.dusk"]');
    const chips = [...picked.querySelectorAll('.essence-pool-contribution')];
    assert.match(chips[0].textContent, /"amount":2/, 'one allocated unit yields 2 Radiant');
    assert.match(chips[1].textContent, /"amount":1/);
    assert.ok(chips.every((chip) => chip.classList.contains('is-required')));

    const prismChips = [
      ...target.querySelectorAll('[data-essence-carrier="Item.prism"] .essence-pool-contribution'),
    ];
    assert.ok(prismChips[0].classList.contains('is-required'), 'radiant is required here');
    assert.ok(!prismChips[1].classList.contains('is-required'), 'ember is spent but funds nothing');
  });

  it('shows the selection recap only once something is allocated', async () => {
    const target = await harness.mount({ pool: SHARED });
    assert.equal(target.querySelectorAll('[data-essence-picked]').length, 1);

    const cleared = await harness.setProps({
      pool: essencePool({
        ...SHARED,
        carriers: SHARED.carriers.map((carrier) => ({ ...carrier, allocatedUnits: 0 })),
        allocation: {},
      }),
    });
    assert.equal(cleared.querySelectorAll('[data-essence-picked]').length, 0);
  });

  it('disables every stepper when the rail is read-only', async () => {
    const target = await harness.mount({ pool: SHARED, readOnly: true });
    const controls = [...target.querySelectorAll('input[type="number"], [data-stepper-increment]')];
    assert.ok(controls.length > 0);
    assert.ok(controls.every((control) => control.hasAttribute('disabled')));
  });

  it('states the empty case rather than rendering a bare header', async () => {
    const target = await harness.mount({ pool: essencePool({ carriers: [], allocation: {} }) });
    assert.match(target.querySelector('.essence-pool-empty').textContent, /Pool\.NoCarriers/);
  });

  // happy-dom cannot compute a cascade, so the reduced-motion contract is asserted
  // against the component's own scoped block instead of a computed style.
  it('honours prefers-reduced-motion on the bar transition', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte'),
      'utf8'
    );
    assert.match(source, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
  });
});
