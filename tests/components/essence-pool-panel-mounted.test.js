/** EssencePoolPanel (issue 917) — the chooser an essence slot opens. */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { essencePool } from '../helpers/crafting-fixtures.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-pool-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
    'src/ui/svelte/util/essenceIcons.js',
    // The essence colour fold: the pool meters tint to the essence being filled.
    'src/ui/svelte/util/essenceTint.js',
    'src/ui/svelte/apps/crafting/detail/essenceOvershoot.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/foundryIconCatalogue.json',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte',
    // The shared eyebrow (issue 1505). The panel's section title is a `<Kicker>`.
    'src/ui/svelte/components/Kicker.svelte',
    // The shared fill bar and no-state panel (issue 1514). The per-essence meter is a
    // `FillBar` and the no-carriers line is an `EmptyState note`, so omitting either fails
    // this suite by name.
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/FillBar.svelte',
    'src/ui/svelte/components/Meter.svelte',
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

  // ONE RUNG, NOT TWO (issue 1505). The panel's own heading converted to `<Kicker>` while the
  // sub-labels beneath it kept a 10px rule of their own, which inverted the pair: the title that
  // NAMES the section rendered smaller than the label nested under it. Both are kickers now, and
  // this asserts it at the DOM rather than leaving it to a frame nobody diffs.
  it('renders its heading and its sub-labels at the same kicker rung', async () => {
    const target = await harness.mount({ pool: SHARED });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]');
    const kickers = [...panel.querySelectorAll('.fab-kicker')];
    assert.ok(kickers.length >= 2, 'the heading and at least one sub-label are both kickers');
    const subtitle = panel.querySelector('.essence-pool-subtitle');
    assert.ok(Boolean(subtitle), 'the sub-label wrapper survives for its margin');
    assert.ok(
      Boolean(subtitle.querySelector('.fab-kicker')),
      'and the type inside it is the shared kicker, not a second 10px rule'
    );
  });

  // The chooser's panel region is the named one, so the pool carries no identity of its own.
  it('leaves the panel identity to the region that holds it', async () => {
    const target = await harness.mount({ pool: SHARED });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]');
    assert.ok(!panel.hasAttribute('id'));
    assert.ok(!panel.hasAttribute('aria-labelledby'));
  });

  describe('an overshoot', () => {
    // Two units of Duskcrystal deliver four Radiant against a need of two.
    function overshot() {
      const [dusk, ...rest] = SHARED.carriers;
      return { ...SHARED, carriers: [{ ...dusk, allocatedUnits: 2 }, ...rest] };
    }

    it('is a sentence beneath the source list naming the essence and the surplus', async () => {
      const restoreI18n = installLangBackedI18n(repoRoot);
      try {
        const target = await harness.mount({ pool: overshot() });
        const sentence = target.querySelector('[data-essence-overshoot="radiant"]');
        assert.equal(sentence.textContent.trim(), 'Radiant: 2 more than required');
        assert.equal(
          target.querySelector('.essence-pool-carriers').compareDocumentPosition(sentence) & 4,
          4,
          'beneath the carrier list'
        );
      } finally {
        restoreI18n();
      }
    });

    it('is stated by neither the ratio nor the bar, which stop at the need', async () => {
      const target = await harness.mount({ pool: overshot() });
      const meter = target.querySelector('[data-essence-meter="radiant"]');
      assert.equal(meter.querySelector('.essence-pool-meter-ratio').textContent.trim(), '2/2');
      assert.equal(meter.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '2');
    });

    it('is absent while the allocation delivers no more than the need', async () => {
      const target = await harness.mount({ pool: SHARED });
      assert.ok(!target.querySelector('[data-essence-overshoot]'));
    });
  });

  // A RATIO meter, not a percentage one: `aria-valuemax` is the requirement's need (issue 1782).
  it('exposes each requirement as a ratio meter over its own need', async () => {
    const target = await harness.mount({ pool: SHARED });
    const bars = [...target.querySelectorAll('[role="meter"]')];
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
    // Named by a visually hidden label and read by the split value key.
    const name = bars[0].querySelector('.visually-hidden');
    assert.equal(name.id, bars[0].getAttribute('aria-labelledby'), 'the hidden label names it');
    assert.match(name.textContent, /Pool\.MeterLabel/);
    assert.match(bars[0].getAttribute('aria-valuetext'), /Pool\.MeterValue/);
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

    // THE TONE IS A PROP NOW, SO IT IS ASSERTED ON THE RENDERED DOM (issue 1514). The bar is
    // the shared `FillBar`, and a scoped block in this component cannot reach a child
    // component's element — so the three fill-state rules this test used to read became
    // `meterTone`, and the primitive publishes what it resolved on `data-fill-bar-tone`. That
    // is a stronger reading than the source-text one it replaces: a rule can be present and
    // unmatched, whereas this attribute is what actually rendered.
    assert.deepEqual(
      [...target.querySelectorAll('[data-fill-bar-tone]')].map((bar) =>
        bar.getAttribute('data-fill-bar-tone')
      ),
      ['success', 'accent', 'danger'],
      'met is success, partial takes the accent and short is danger — the three fills the ' +
        'deleted `.essence-pool-bar-fill` state rules painted'
    );

    // AND EVERY ONE OF THESE THREE IS UNTINTED.
    assert.deepEqual(
      [...target.querySelectorAll('.fab-fill-bar-fill')].map((fill) =>
        (fill.getAttribute('style') || '').includes('background:')
      ),
      [false, false, false],
      'an essence with no colour of its own leaves the tone in charge'
    );

    // happy-dom cannot compute a cascade.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte'),
      'utf8'
    );
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

  // The stepper's ceiling is `ownedUnits`.
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

  /** THE PER-ESSENCE TINT REACHES THE BAR AS A PROP (issue 1514). */
  it('hands a coloured essence its own tint through the bar`s `color` prop, and an uncoloured one nothing', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [
          {
            groupId: 'g-tinted',
            essenceId: 'radiant',
            name: 'Radiant',
            icon: 'fas fa-sun',
            colorToken: 'butter',
            need: 2,
            delivered: 2,
          },
          {
            groupId: 'g-plain',
            essenceId: 'air',
            name: 'Air',
            icon: 'fas fa-wind',
            colorToken: null,
            need: 2,
            delivered: 2,
          },
        ],
        carriers: [],
        allocation: {},
      }),
    });

    const fills = [...target.querySelectorAll('.fab-fill-bar-fill')];
    assert.equal(fills.length, 2, 'one shared fill per requirement');
    assert.match(
      fills[0].getAttribute('style') || '',
      /background:\s*var\(--fab-chip-color\)/u,
      'the coloured essence paints its fill from the custom property `tintOf` declares on the ' +
        'meter above it, which is the `has-tint` triple this conversion turned into a prop'
    );
    assert.ok(
      !(fills[1].getAttribute('style') || '').includes('background:'),
      'and the uncoloured one passes an empty `color`, so the tone paints it — the two together ' +
        'are what make this a measurement of the prop rather than of the primitive'
    );
    assert.deepEqual(
      [...target.querySelectorAll('[data-fill-bar-tone]')].map((bar) =>
        bar.getAttribute('data-fill-bar-tone')
      ),
      ['success', 'success'],
      'and the tone is resolved for BOTH: losing the green does not lose the state, because the ' +
        'ratio beside the name and `data-essence-meter-state` are what carry it'
    );
  });

  it('states the empty case rather than rendering a bare header', async () => {
    const target = await harness.mount({ pool: essencePool({ carriers: [], allocation: {} }) });
    // The line is an `EmptyState note` since issue 1514.
    assert.match(target.querySelector('.manager-empty.is-note').textContent, /Pool\.NoCarriers/);
  });

  /** THE TRANSITION IS GONE, AND SO IS THE MEDIA QUERY THAT EXEMPTED IT (issue 1514). */
  it('animates the bar nowhere, so the reduced-motion exemption has nothing left to exempt', () => {
    // COMMENTS STRIPPED, in both syntaxes. The record of this deletion is a comment beside the
    // rule it replaced, and it NAMES the declaration it removed — so a raw scan reads the note
    // saying the transition is gone as the transition itself. Measured, not anticipated: this
    // clause failed exactly that way before the strip was added.
    const code = (file) =>
      readFileSync(resolve(repoRoot, file), 'utf8')
        .replaceAll(/<!--[\s\S]*?-->/gu, '')
        .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
    const panel = code('src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte');
    const bar = code('src/ui/svelte/components/FillBar.svelte');
    assert.ok(!/transition:/u.test(panel), 'the panel animates nothing');
    assert.ok(!/transition:/u.test(bar), 'and neither does the shared bar it now renders');
    assert.ok(
      !/prefers-reduced-motion/u.test(panel),
      'so the media query that exempted the old fill is deleted rather than left to exempt nothing'
    );
  });
});
