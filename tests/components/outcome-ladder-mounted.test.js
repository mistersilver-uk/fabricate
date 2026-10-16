// The shared routed ladder's reached tier, optional band and hook pass-through (issue 1644), its
// yield chips (issue 2257), and the dense list row's root pass-through.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  createMountedComponentHarness,
  OUTCOME_LADDER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const ladder = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-outcome-ladder-',
  compiledModules: ['OutcomeLadder', 'Kicker', 'Medallion', 'Chip'].map(component),
  rawModules: OUTCOME_LADDER_RAW_MODULES,
  componentPath: component('OutcomeLadder'),
});
const row = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-list-row-',
  compiledModules: ['ListRow', 'Medallion'].map(component),
  componentPath: component('ListRow'),
});

const TIERS = [
  {
    id: 'flawed',
    ids: ['flawed', 'standard'],
    name: 'Flawed, Standard',
    yields: [{ name: 'Bronze Ingot', quantity: '×2' }],
  },
  { id: 'fine', name: 'Fine', yields: [{ name: 'Steel Ingot', quantity: '×1' }] },
  { id: 'ruined', name: 'Ruined', fail: true, yields: [] },
];

const reached = (target) => [...target.querySelectorAll('[data-outcome-rolled]')];
const tierIds = (nodes) => nodes.map((node) => node.getAttribute('data-outcome-tier'));

describe('OutcomeLadder reached tier and pass-through (issue 1644)', () => {
  before(() => ladder.setup());
  afterEach(() => ladder.remount());
  after(() => ladder.teardown());

  it('marks the one tier whose merged ids contain the reached id', async () => {
    const target = await ladder.mount({
      tiers: TIERS,
      reachedId: 'standard',
      reachedLabel: 'Your roll',
    });
    const marked = reached(target);
    assert.deepEqual(tierIds(marked), ['flawed'], 'a merged id marks the row it was merged into');
    assert.equal(marked[0].getAttribute('data-outcome-rolled'), 'true');
    assert.ok(marked[0].classList.contains('is-reached'));
    assert.equal(marked[0].querySelectorAll('[data-outcome-reached]').length, 1);
    assert.equal(marked[0].querySelector('[data-outcome-reached]').textContent.trim(), 'Your roll');
    assert.equal(target.querySelectorAll('[data-outcome-reached]').length, 1, 'one pill in all');
  });

  it("falls back to a tier's own id when it carries no ids", async () => {
    const target = await ladder.mount({
      tiers: TIERS,
      reachedId: 'fine',
      reachedLabel: 'Your roll',
    });
    assert.deepEqual(tierIds(reached(target)), ['fine']);
  });

  it('marks exactly one row when two tiers name the reached id', async () => {
    const tiers = [...TIERS, { id: 'again', ids: ['fine'], name: 'Again', yields: [] }];
    const target = await ladder.mount({ tiers, reachedId: 'fine', reachedLabel: 'Your roll' });
    assert.deepEqual(tierIds(reached(target)), ['fine'], 'the first tier naming it, and only it');
  });

  it('marks nothing without a reached id, or for an id no tier names', async () => {
    const before = await ladder.mount({ tiers: TIERS, reachedLabel: 'Your roll' });
    assert.equal(reached(before).length, 0);
    assert.equal(before.querySelectorAll('[data-outcome-reached], .is-reached').length, 0);
    ladder.remount();
    const unknown = await ladder.mount({ tiers: TIERS, reachedId: 'missing', reachedLabel: 'x' });
    assert.equal(reached(unknown).length, 0);
    assert.equal(
      unknown.querySelectorAll('[data-outcome-tier]').length,
      3,
      'every tier still draws'
    );
  });

  it('draws a bare band, named by its tone, only for a tier that has a band', async () => {
    const tiers = [
      { id: 'banded', name: 'Banded', band: '14+', yields: [] },
      { id: 'failed', name: 'Failed', band: '<14', fail: true, yields: [] },
      { id: 'bare', name: 'Bare', yields: [] },
      { id: 'blank', name: 'Blank', band: '', yields: [] },
    ];
    const target = await ladder.mount({ tiers, emptyTierText: 'nothing' });
    const bands = (id) =>
      target.querySelectorAll(
        `[data-outcome-tier="${id}"] .fab-outcome-tier-heading [data-outcome-band]`
      );
    assert.equal(bands('banded').length, 1);
    assert.equal(bands('banded')[0].textContent.trim(), '14+');
    assert.equal(bands('banded')[0].getAttribute('data-outcome-band'), 'neutral');
    assert.equal(bands('failed')[0].getAttribute('data-outcome-band'), 'danger');
    assert.equal(bands('bare').length, 0, 'a band-less tier draws no band');
    assert.equal(bands('blank').length, 0, 'an empty band draws no band');
    assert.equal(
      target.querySelectorAll(':scope .fab-outcome-tier-heading .manager-chip').length,
      0,
      'a band is a bare figure, not a chip'
    );
  });

  it("passes each tier's, band's, pill's and yield's props through as hooks", async () => {
    const tiers = [
      {
        id: 'o1',
        name: 'Pass',
        band: '10–20',
        props: { 'data-tier-hook': 'o1' },
        bandProps: { 'data-band-hook': '10–20' },
        reachedProps: { 'data-pill-hook': '' },
        yields: [{ id: 'y1', name: 'Shard', quantity: '×1', props: { 'data-yield-hook': 'c2' } }],
      },
    ];
    const target = await ladder.mount({ tiers, reachedId: 'o1', reachedLabel: 'Your roll' });
    const tier = target.querySelector('[data-tier-hook="o1"]');
    assert.ok(tier?.matches('[data-outcome-tier="o1"].fab-outcome-tier'), 'tier props on the tier');
    assert.ok(
      target.querySelector('[data-outcome-band="neutral"][data-band-hook="10–20"]'),
      'band props on the band'
    );
    assert.ok(
      target.querySelector('.manager-chip[data-pill-hook][data-outcome-reached]'),
      "reached props on the tier's pill"
    );
    assert.ok(
      target.querySelector('.fab-outcome-yield[data-outcome-yield][data-yield-hook="c2"]'),
      'yield props on its chip'
    );
  });

  it('falls back to its own id when a tier carries an empty ids list', async () => {
    const tiers = [{ id: 'a', ids: [], name: 'A', yields: [] }];
    const target = await ladder.mount({ tiers, reachedId: 'a', reachedLabel: 'Your roll' });
    assert.deepEqual(tierIds(reached(target)), ['a']);
  });

  it("names each tier's status glyph for a screen reader, and draws no label when given none", async () => {
    const labels = { successLabel: 'Success', failureLabel: 'Failure' };
    const target = await ladder.mount({ tiers: TIERS, ...labels });
    const status = (id) =>
      target.querySelector(
        `:scope [data-outcome-tier="${id}"] .visually-hidden[data-outcome-status]`
      )?.textContent;
    assert.equal(status('flawed'), 'Success');
    assert.equal(status('ruined'), 'Failure');
    assert.ok(
      target.querySelector(':scope [data-outcome-status] + .fab-outcome-tier-name'),
      'the status reads before the tier name'
    );
    ladder.remount();
    const bare = await ladder.mount({ tiers: TIERS });
    assert.equal(bare.querySelectorAll('[data-outcome-status]').length, 0);
  });

  it('carries a root hook and class, and offers no control', async () => {
    const target = await ladder.mount({
      tiers: TIERS,
      reachedId: 'fine',
      reachedLabel: 'Your roll',
      class: 'extra-ladder',
      'data-root-hook': 'yes',
    });
    const root = target.querySelector('[data-outcome-ladder]');
    assert.equal(root.getAttribute('data-root-hook'), 'yes');
    assert.ok(
      root.classList.contains('fab-outcome-ladder') && root.classList.contains('extra-ladder')
    );
    assert.equal(target.querySelectorAll('button, input, select, a, [tabindex]').length, 0);
  });
});

describe('OutcomeLadder yield chips (issue 2257 D14, D19)', () => {
  before(() => ladder.setup());
  afterEach(() => ladder.remount());
  after(() => ladder.teardown());

  const YIELDS = [
    {
      id: 'art',
      name: 'Steel Ingot',
      img: 'icons/commodities/metal/ingot-steel.webp',
      quantity: '×2',
    },
    { id: 'glyph', name: 'Ember Salt', icon: 'fas fa-fire', tint: 'mist', quantity: '×1' },
    { id: 'generic', name: 'Odd Lump', art: 'icons/svg/item-bag.svg', icon: 'fas fa-cube' },
    { id: 'group', name: 'One of', detail: 'Steel Ingot · Bronze Ingot' },
  ];
  const chip = (target, id) => target.querySelector(`[data-yield="${id}"]`);
  const mount = () =>
    ladder.mount({
      tiers: [
        {
          id: 'pass',
          name: 'Pass',
          yields: YIELDS.map((item) => ({ ...item, props: { 'data-yield': item.id } })),
        },
      ],
    });

  it('leads a yield with art by its 14px picture', async () => {
    const target = await mount();
    const art = chip(target, 'art');
    const picture = art.querySelector('.fab-medallion[data-medallion="image"]');
    assert.ok(Boolean(picture), 'the yield draws its picture');
    assert.match(picture.getAttribute('style'), /width: 14px; height: 14px/u);
    assert.equal(picture.querySelector('img').getAttribute('src'), YIELDS[0].img);
    assert.equal(picture.querySelector('img').getAttribute('alt'), '');
    assert.ok(!art.querySelector('.fab-outcome-yield-glyph'), 'a picture, not also a glyph');
  });

  it('falls back to its own glyph, tinted, where the yield has no art', async () => {
    const target = await mount();
    const glyph = chip(target, 'glyph').querySelector('i.fab-outcome-yield-glyph');
    assert.ok(Boolean(glyph), 'the yield draws its glyph');
    assert.ok(glyph.classList.contains('fa-fire'));
    assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.getAttribute('style'), '--fab-outcome-yield-tint: var(--fab-tag-mist);');
    assert.ok(!chip(target, 'glyph').querySelector('.fab-medallion'), 'no tile for a glyph');
    assert.ok(chip(target, 'group').querySelector('i.fab-outcome-yield-glyph.fa-box'));
  });

  it("reads Foundry's generic item image as no art", async () => {
    const target = await mount();
    const generic = chip(target, 'generic');
    assert.ok(!generic.querySelector('.fab-medallion'), 'the generic bag draws no picture');
    assert.ok(generic.querySelector('i.fab-outcome-yield-glyph.fa-cube'), 'it draws its glyph');
  });

  it('names each chip in full in its title, with its quantity and its members', async () => {
    const target = await mount();
    const name = chip(target, 'art').querySelector('.fab-outcome-yield-name');
    assert.equal(name.getAttribute('title'), 'Steel Ingot');
    assert.equal(
      chip(target, 'art').querySelector('.fab-outcome-yield-quantity').textContent,
      '×2'
    );
    assert.ok(!chip(target, 'generic').querySelector('.fab-outcome-yield-quantity'));
    assert.equal(
      chip(target, 'group').querySelector('.fab-outcome-yield-detail').textContent,
      'Steel Ingot · Bronze Ingot'
    );
    assert.equal(target.querySelectorAll('[data-list-row]').length, 0, 'a chip, not a list row');
  });

  it('heads the ladder with the shared kicker', async () => {
    const target = await ladder.mount({ tiers: [], label: 'Outcomes', hint: 'one roll' });
    const kicker = target.querySelector(':scope .fab-outcome-heading > span.fab-kicker');
    assert.equal(kicker?.textContent, 'Outcomes');
    assert.equal(target.querySelector('.fab-outcome-hint').textContent, 'one roll');
  });
});

describe('ListRow root pass-through (issue 1644)', () => {
  before(() => row.setup());
  afterEach(() => row.remount());
  after(() => row.teardown());

  it('lands a caller hook and class on the root and keeps its own row hook', async () => {
    const target = await row.mount({
      name: 'Shard',
      quantity: '×1',
      class: 'extra-row',
      'data-award-kind': 'currency',
      'data-list-row': 'caller',
    });
    const root = target.querySelector('.fabricate-list-row');
    assert.equal(root.getAttribute('data-award-kind'), 'currency');
    assert.ok(root.classList.contains('extra-row'));
    assert.equal(root.getAttribute('data-list-row'), 'dense', "the row's own hook wins");
  });
});
