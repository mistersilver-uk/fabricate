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
    // The essence colour fold: the pool meters tint to the essence being filled.
    'src/ui/svelte/util/essenceTint.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte',
    'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
});

const SHARED = essencePool({
  requirements: [
    {
      groupId: 'g-radiant',
      essenceId: 'radiant',
      name: 'Radiant',
      icon: 'fas fa-sun',
      colorToken: 'butter',
      need: 2,
      delivered: 2,
      owned: 4,
      satisfied: true,
    },
    {
      groupId: 'g-shadow',
      essenceId: 'shadow',
      name: 'Shadow',
      icon: 'fas fa-moon',
      colorToken: 'lavender',
      need: 3,
      delivered: 1,
      owned: 2,
      satisfied: false,
    },
  ],
  carriers: [
    {
      itemKey: 'Item.dusk',
      name: 'Duskcrystal',
      img: 'icons/gem.webp',
      ownedUnits: 3,
      allocatedUnits: 1,
      perUnit: { radiant: 2, shadow: 1 },
    },
    {
      itemKey: 'Item.prism',
      name: 'Prism Ash',
      img: null,
      ownedUnits: 2,
      allocatedUnits: 0,
      perUnit: { radiant: 1, ember: 1 },
    },
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
      bars.map((bar) => [
        bar.getAttribute('aria-valuemin'),
        bar.getAttribute('aria-valuenow'),
        bar.getAttribute('aria-valuemax'),
      ]),
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

  // Zero delivered is an ERROR in the published slot-state matrix, not "a shorter bar":
  // without a danger rule the only difference between untouched and part-funded was the
  // fill width, which is a use-of-colour-alone failure at 6px tall.
  it('carries a distinct state class for every meter state, danger tone included', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [
          { groupId: 'g-a', essenceId: 'a', name: 'A', icon: 'fas fa-sun', need: 2, delivered: 2 },
          { groupId: 'g-b', essenceId: 'b', name: 'B', icon: 'fas fa-moon', need: 2, delivered: 1 },
          { groupId: 'g-c', essenceId: 'c', name: 'C', icon: 'fas fa-star', need: 2, delivered: 0 },
        ],
        carriers: [],
        allocation: {},
      }),
    });
    assert.deepEqual(
      [...target.querySelectorAll('[data-essence-meter]')].map((meter) => [
        meter.getAttribute('data-essence-meter-state'),
        meter.classList.contains('is-met'),
        meter.classList.contains('is-partial'),
        meter.classList.contains('is-short'),
      ]),
      [
        ['met', true, false, false],
        ['partial', false, true, false],
        ['short', false, false, true],
      ]
    );

    // happy-dom cannot compute a cascade, so the tone is asserted against the
    // component's own scoped block: an emitted class with no rule is the defect.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte'),
      'utf8'
    );
    // The state classes are styled on the BAR FILL, which is where an uncoloured essence
    // still reads its state from.
    assert.match(
      source,
      /\.essence-pool-meter\.is-short \.essence-pool-bar-fill\s*\{[^}]*--fab-danger/
    );
    assert.match(source, /\.essence-pool-meter\.is-partial \.essence-pool-bar-fill\s*\{/);
    // But NOT on the meter BOX (maintainer round). The box carries the essence's identity;
    // the `x/y` ratio in its head and the colour-coded requirement tiles above the panel
    // carry the state. A box in the success family said nothing the ratio had not already
    // said, and cost the box the one thing only it could say — which essence this is —
    // leaving two met requirements in a shared pool as two identical green boxes.
    const boxStateRule = /\.essence-pool-meter\.is-(?:met|short)\s*\{/;
    assert.equal(
      boxStateRule.test(source),
      false,
      'the meter box carries no success/danger state rule'
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
      inputs.map((input) => [
        input.getAttribute('data-essence-allocation'),
        input.value,
        input.getAttribute('max'),
      ]),
      [
        ['Item.dusk', '1', '3'],
        ['Item.prism', '0', '2'],
      ]
    );
    assert.deepEqual(
      inputs.map((input) => input.getAttribute('min')),
      ['0', '0']
    );
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
    target.querySelector('[data-essence-carrier="Item.prism"] [data-stepper-increment]').click();
    assert.deepEqual(calls.at(-1), ['Item.prism', 1]);
  });

  it('multiplies a carrier contribution by the units allocated, and mutes an essence the set does not need', async () => {
    const target = await harness.mount({ pool: SHARED });
    const picked = target.querySelector('[data-essence-picked="Item.dusk"]');
    const chips = [...picked.querySelectorAll('.essence-contribution')];
    assert.match(chips[0].textContent, /"amount":2/, 'one allocated unit yields 2 Radiant');
    assert.match(chips[1].textContent, /"amount":1/);
    assert.ok(chips.every((chip) => chip.classList.contains('is-required')));

    const prismChips = [
      ...target.querySelectorAll('[data-essence-carrier="Item.prism"] .essence-contribution'),
    ];
    assert.ok(prismChips[0].classList.contains('is-required'), 'radiant is required here');
    assert.ok(!prismChips[1].classList.contains('is-required'), 'ember is spent but funds nothing');
  });

  // ONE component for one meaning: the identical chip is rendered from the carrier facts,
  // the selection recap and the consumption plan, so it is `EssenceContribution` rather
  // than three copies of the same markup + rules.
  //
  // And the authored tint is scoped to the GLYPH. The spec sentence this change added
  // says label text keeps the standard body/muted colours, because a tag-palette colour
  // behind 10px/600 text is where an authored colour can cut contrast.
  it('renders every contribution through one component whose tint reaches the glyph only', async () => {
    const target = await harness.mount({ pool: SHARED });
    const chips = [...target.querySelectorAll('.essence-contribution')];
    assert.ok(chips.length >= 3, 'the carrier facts and the recap both use it');
    assert.match(chips[0].getAttribute('style'), /--fab-chip-color: var\(--fab-tag-butter\)/);

    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte'),
      'utf8'
    );
    assert.match(
      source,
      /\.essence-contribution\.is-required i\s*\{\s*color: var\(--fab-chip-color/
    );
    assert.ok(
      !/\.essence-contribution\.is-required\s*\{/.test(source),
      'the tinted rule must target the glyph, never the span wrapping the label text'
    );
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
