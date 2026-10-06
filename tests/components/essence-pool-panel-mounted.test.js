/** EssencePoolPanel (issues 917, 1644) — the crafting adapter onto the shared `EssencePool`. */
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
    'src/ui/svelte/util/essenceTint.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/foundryIconCatalogue.json',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/FillBar.svelte',
    'src/ui/svelte/components/Meter.svelte',
    'src/ui/svelte/components/EssencePool.svelte',
    'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
});

function requirement(essenceId, name, need, delivered, colorToken = null) {
  return { groupId: `g-${essenceId}`, essenceId, name, icon: 'fas fa-sun', colorToken, need, delivered };
}

function carrier(itemKey, name, ownedUnits, allocatedUnits, perUnit) {
  return { itemKey, name, img: null, ownedUnits, allocatedUnits, perUnit };
}

// One Duskcrystal yields 2 Radiant and 1 Shadow: one allocated unit moves both bars.
const SHARED = essencePool({
  requirements: [
    requirement('radiant', 'Radiant', 2, 2, 'butter'),
    requirement('shadow', 'Shadow', 3, 1, 'lavender'),
  ],
  carriers: [
    carrier('Item.dusk', 'Duskcrystal', 3, 1, { radiant: 2, shadow: 1 }),
    carrier('Item.prism', 'Prism Ash', 2, 0, { radiant: 1, ember: 1 }),
  ],
  allocation: { 'Item.dusk': 1 },
});

const text = (node) => node.textContent.trim();
const totals = (target) =>
  Object.fromEntries(
    [...target.querySelectorAll('[data-essence-total]')].map((node) => [
      node.dataset.essenceTotal,
      text(node),
    ])
  );
const states = (target) =>
  [...target.querySelectorAll('[data-essence-meter]')].map((node) => [
    node.dataset.essenceMeter,
    node.dataset.essenceMeterState,
  ]);
const flush = () => new Promise((done) => setTimeout(done, 0));

describe('EssencePoolPanel mounted behavior', () => {
  let restoreI18n = () => {};
  before(async () => {
    await harness.setup();
    restoreI18n = installLangBackedI18n(repoRoot);
  });
  after(() => {
    restoreI18n();
    harness.teardown();
  });
  afterEach(harness.remount);

  it('renders nothing for a set with no essence requirement', async () => {
    const target = await harness.mount({ pool: null });
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  it('composes the shared pool, leaving the panel identity to the region that holds it', async () => {
    const target = await harness.mount({ pool: SHARED });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]');
    assert.ok(panel.querySelector('[data-essence-pool]'), 'the shared primitive draws the pool');
    assert.ok(!panel.hasAttribute('id'));
    assert.ok(!panel.hasAttribute('aria-labelledby'));
    assert.equal(
      text(panel.querySelector('.fab-essence-pool-kicker')),
      'Essence pool shared by 2 requirements'
    );
    assert.ok(!panel.querySelector('.manager-empty.is-note'), 'carriers exist, so no empty note');
  });

  it('draws one carrier row for two meters, and one allocation counts toward both', async () => {
    const target = await harness.mount({ pool: SHARED });
    assert.equal(target.querySelectorAll('[data-essence-carrier="Item.dusk"]').length, 1);
    assert.deepEqual(totals(target), { radiant: '2 / 2', shadow: '1 / 3' });

    target.querySelector(':scope [data-essence-carrier="Item.dusk"] [data-stepper-increment]').click();
    await flush();
    assert.deepEqual(totals(target), { radiant: '4 / 2', shadow: '2 / 3' });
  });

  it('keeps the carrier and allocation hooks literal on the row and its input', async () => {
    const target = await harness.mount({ pool: SHARED });
    const row = target.querySelector('[data-essence-carrier="Item.dusk"]');
    assert.equal(row.getAttribute('data-essence-source'), 'Item.dusk', 'the primitive row');
    const input = row.querySelector('input[type="number"]');
    assert.equal(input.getAttribute('data-essence-allocation'), 'Item.dusk');
    assert.equal(input.getAttribute('aria-label'), 'Units of Duskcrystal to spend');
    assert.equal(
      row.querySelector('[data-stepper-decrement]').getAttribute('aria-label'),
      'Spend one less Duskcrystal'
    );
    assert.equal(
      row.querySelector('[data-stepper-increment]').getAttribute('aria-label'),
      'Spend one more Duskcrystal'
    );
  });

  it('states what a carrier yields to each pool it funds, and the units owned', async () => {
    const target = await harness.mount({ pool: SHARED });
    const reading = (key) =>
      text(target.querySelector(`[data-essence-carrier="${key}"] .fab-essence-source-reading`));
    assert.equal(reading('Item.dusk'), '+2 Radiant · +1 Shadow · You own 3.');
    assert.equal(reading('Item.prism'), '+1 Radiant · You own 2.', 'ember funds no pool here');
  });

  // `capAtHeld`: crafting lets the player over-fund on purpose, up to the units actually owned.
  it('caps each stepper at ownedUnits, even once every requirement is met', async () => {
    const met = essencePool({
      requirements: [requirement('radiant', 'Radiant', 2, 2)],
      carriers: [carrier('Item.dusk', 'Duskcrystal', 3, 1, { radiant: 2 })],
    });
    const target = await harness.mount({ pool: met });
    assert.deepEqual(states(target), [['radiant', 'met']]);
    const input = target.querySelector('[data-essence-allocation="Item.dusk"]');
    assert.equal(input.getAttribute('max'), '3');
    const increment = target.querySelector('[data-stepper-increment]');
    assert.equal(increment.disabled, false, 'a met pool still accepts a deliberate surplus');

    const full = await harness.setProps({
      pool: { ...met, carriers: [{ ...met.carriers[0], allocatedUnits: 3 }] },
    });
    assert.equal(full.querySelector('[data-stepper-increment]').disabled, true, 'but not past owned');
  });

  it('reports onAllocate(itemKey, units) with the new unit count on every edit', async () => {
    const calls = [];
    const target = await harness.mount({
      pool: SHARED,
      onAllocate: (itemKey, units) => calls.push([itemKey, units]),
    });
    target.querySelector(':scope [data-essence-carrier="Item.prism"] [data-stepper-increment]').click();
    target.querySelector(':scope [data-essence-carrier="Item.dusk"] [data-stepper-decrement]').click();
    const input = target.querySelector('[data-essence-allocation="Item.prism"]');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.deepEqual(calls, [
      ['Item.prism', 1],
      ['Item.dusk', 0],
      ['Item.prism', 2],
    ]);
  });

  it('reads met, partial and short from data-essence-meter-state', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [
          requirement('a', 'A', 2, 2),
          requirement('b', 'B', 2, 1),
          requirement('c', 'C', 2, 0),
        ],
        carriers: [],
      }),
    });
    assert.deepEqual(states(target), [
      ['a', 'met'],
      ['b', 'partial'],
      ['c', 'short'],
    ]);
  });

  it('sums two requirements naming one essence into one bar and one state', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [
          requirement('radiant', 'Radiant', 2, 2),
          { ...requirement('radiant', 'Radiant', 2, 0), groupId: 'g-radiant-2' },
        ],
        carriers: [carrier('Item.dusk', 'Duskcrystal', 3, 1, { radiant: 2 })],
      }),
    });
    assert.deepEqual(states(target), [['radiant', 'partial']]);
    assert.deepEqual(totals(target), { radiant: '2 / 4' });
  });

  it('tints a meter from its authored palette token while it is short', async () => {
    const target = await harness.mount({ pool: SHARED });
    const meter = (id) => target.querySelector(`[data-essence-meter="${id}"]`);
    assert.equal(meter('radiant').dataset.essenceMeterTint, 'butter');
    assert.equal(meter('shadow').dataset.essenceMeterTint, 'lavender');
    const fill = (id) => meter(id).querySelector('.fab-fill-bar-fill').getAttribute('style') ?? '';
    assert.match(fill('shadow'), /var\(--fab-tag-lavender\)/u, 'short: the essence colour');
    assert.doesNotMatch(fill('radiant'), /--fab-tag-/u, 'met: the success tone');
  });

  it('states an overshoot as a sentence beneath the carriers', async () => {
    const [dusk, prism] = SHARED.carriers;
    const target = await harness.mount({
      pool: { ...SHARED, carriers: [{ ...dusk, allocatedUnits: 2 }, prism] },
    });
    const sentence = target.querySelector('[data-essence-overshoot="radiant"]');
    assert.equal(text(sentence), 'Radiant: 2 more than required');
    assert.ok(
      target.querySelector('[data-essence-sources]').compareDocumentPosition(sentence) & 4,
      'beneath the carrier list'
    );
    assert.ok(!target.querySelector('[data-essence-overshoot="shadow"]'), 'shadow is still short');
  });

  it('prints a fractional pool at its authored precision, with no rounding-error surplus', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [requirement('radiant', 'Radiant', 0.6, 0.6)],
        carriers: [carrier('Item.dusk', 'Duskcrystal', 3, 3, { radiant: 0.2 })],
      }),
    });
    assert.deepEqual(totals(target), { radiant: '0.6 / 0.6' });
    assert.ok(!target.querySelector('[data-essence-overshoot="radiant"]'));
  });

  it('states the empty case rather than an empty carrier list', async () => {
    const target = await harness.mount({ pool: essencePool({ carriers: [], allocation: {} }) });
    assert.equal(
      text(target.querySelector('.manager-empty.is-note')),
      'You have no components that carry these essences.'
    );
    assert.ok(target.querySelector('[data-essence-meter="radiant"]'), 'the requirement still shows');
  });

  it('recaps exactly the allocated carriers beneath the pool, each with its yield', async () => {
    const target = await harness.mount({ pool: SHARED });
    const picked = [...target.querySelectorAll('[data-essence-picked]')];
    assert.deepEqual(
      picked.map((row) => [row.dataset.essencePicked, text(row.querySelector('.essence-pool-picked-count'))]),
      [['Item.dusk', '×1']]
    );
    assert.ok(
      target.querySelector('[data-essence-pool]').compareDocumentPosition(picked[0]) & 4,
      'the recap follows the pool'
    );
    const chips = [...picked[0].querySelectorAll('.essence-contribution')].map(text);
    assert.deepEqual(chips, ['2 Radiant', '1 Shadow']);

    const cleared = await harness.setProps({
      pool: { ...SHARED, carriers: SHARED.carriers.map((entry) => ({ ...entry, allocatedUnits: 0 })) },
    });
    assert.equal(cleared.querySelectorAll('[data-essence-picked]').length, 0);
  });

  it('lists only carriers that contribute an essence the set needs', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [requirement('radiant', 'Radiant', 2, 0)],
        carriers: [
          carrier('Item.dusk', 'Duskcrystal', 3, 0, { radiant: 2 }),
          carrier('Item.coal', 'Coal', 15, 0, { ember: 1 }),
          carrier('Item.ash', 'Ash', 4, 0, {}),
        ],
      }),
    });
    const listed = [...target.querySelectorAll('[data-essence-carrier]')].map(
      (row) => row.dataset.essenceCarrier
    );
    assert.deepEqual(listed, ['Item.dusk']);
    assert.ok(!target.querySelector('.manager-empty.is-note'));

    const none = await harness.setProps({
      pool: essencePool({
        requirements: [requirement('radiant', 'Radiant', 2, 0)],
        carriers: [carrier('Item.coal', 'Coal', 15, 0, { ember: 1 })],
      }),
    });
    assert.equal(none.querySelectorAll('[data-essence-carrier]').length, 0);
    assert.ok(none.querySelector('.manager-empty.is-note'), 'nothing useful is stated as empty');
  });

  it('adds fractional requirements naming one essence without binary drift', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [
          requirement('radiant', 'Radiant', 0.1, 0.3),
          { ...requirement('radiant', 'Radiant', 0.2, 0), groupId: 'g-radiant-2' },
        ],
        carriers: [carrier('Item.dusk', 'Duskcrystal', 5, 3, { radiant: 0.1 })],
      }),
    });
    assert.deepEqual(totals(target), { radiant: '0.3 / 0.3' });
    assert.deepEqual(states(target), [['radiant', 'met']]);
    assert.ok(!target.querySelector('[data-essence-overshoot]'));
  });

  it('states a fractional surplus at its authored precision', async () => {
    const target = await harness.mount({
      pool: essencePool({
        requirements: [requirement('radiant', 'Radiant', 0.2, 0.2)],
        carriers: [carrier('Item.dusk', 'Duskcrystal', 5, 3, { radiant: 0.1 })],
      }),
    });
    assert.equal(text(target.querySelector('[data-essence-overshoot="radiant"]')), 'Radiant: 0.1 more than required');
  });

  it('reads a requirement needing nothing as met, whatever it reports delivered', async () => {
    const target = await harness.mount({
      pool: essencePool({ requirements: [requirement('radiant', 'Radiant', 0, -1)], carriers: [] }),
    });
    assert.deepEqual(states(target), [['radiant', 'met']]);
  });

  it('leaves the tint hook off an untinted requirement', async () => {
    const target = await harness.mount({
      pool: essencePool({ requirements: [requirement('radiant', 'Radiant', 2, 0)], carriers: [] }),
    });
    assert.ok(!target.querySelector('[data-essence-meter="radiant"]').hasAttribute('data-essence-meter-tint'));
  });

  it('multiplies a recap yield by the allocated units', async () => {
    const [dusk, prism] = SHARED.carriers;
    const target = await harness.mount({
      pool: { ...SHARED, carriers: [{ ...dusk, allocatedUnits: 2 }, prism] },
    });
    const chips = [...target.querySelectorAll('[data-essence-picked="Item.dusk"] .essence-contribution')];
    assert.deepEqual(chips.map(text), ['4 Radiant', '2 Shadow']);
  });

  it('mutes a recap essence the set does not require', async () => {
    const [dusk, prism] = SHARED.carriers;
    const target = await harness.mount({
      pool: { ...SHARED, carriers: [dusk, { ...prism, allocatedUnits: 1 }] },
    });
    const chips = [...target.querySelectorAll('[data-essence-picked="Item.prism"] .essence-contribution')];
    assert.deepEqual(chips.map(text), ['1 Radiant', '1 ember']);
    assert.deepEqual(
      chips.map((chip) => chip.classList.contains('is-required')),
      [true, false]
    );
  });

  it('disables every stepper when the rail is read-only', async () => {
    const target = await harness.mount({ pool: SHARED, readOnly: true });
    const controls = [
      ...target.querySelectorAll('input[type="number"], [data-stepper-increment], [data-stepper-decrement]'),
    ];
    assert.equal(controls.length, 6);
    assert.ok(controls.every((control) => control.disabled));
  });

  it('animates nothing, so no reduced-motion exemption is needed', () => {
    const code = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte'),
      'utf8'
    ).replaceAll(/<!--[\s\S]*?-->/gu, '');
    assert.ok(!/transition:|prefers-reduced-motion/u.test(code));
  });
});
