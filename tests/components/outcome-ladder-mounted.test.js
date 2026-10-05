// The shared routed ladder's reached tier, optional band and hook pass-through (issue 1644), and
// the dense list row's root pass-through that carries a yield's hook.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const ladder = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-outcome-ladder-',
  compiledModules: ['OutcomeLadder', 'ListRow', 'Medallion', 'Chip'].map(component),
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
    const target = await ladder.mount({ tiers: TIERS, reachedId: 'standard', reachedLabel: 'Your roll' });
    const marked = reached(target);
    assert.deepEqual(tierIds(marked), ['flawed'], 'a merged id marks the row it was merged into');
    assert.equal(marked[0].getAttribute('data-outcome-rolled'), 'true');
    assert.ok(marked[0].classList.contains('is-reached'));
    assert.equal(marked[0].querySelectorAll('[data-outcome-reached]').length, 1);
    assert.equal(marked[0].querySelector('[data-outcome-reached]').textContent.trim(), 'Your roll');
    assert.equal(target.querySelectorAll('[data-outcome-reached]').length, 1, 'one pill in all');
  });

  it("falls back to a tier's own id when it carries no ids", async () => {
    const target = await ladder.mount({ tiers: TIERS, reachedId: 'fine', reachedLabel: 'Your roll' });
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
    assert.equal(unknown.querySelectorAll('[data-outcome-tier]').length, 3, 'every tier still draws');
  });

  it('draws a band chip only for a tier that has a band', async () => {
    const tiers = [
      { id: 'banded', name: 'Banded', band: '14+', yields: [] },
      { id: 'bare', name: 'Bare', yields: [] },
      { id: 'blank', name: 'Blank', band: '', yields: [] },
    ];
    const target = await ladder.mount({ tiers, emptyTierText: 'nothing' });
    const chips = (id) =>
      target.querySelectorAll(`[data-outcome-tier="${id}"] .fab-outcome-tier-heading .manager-chip`);
    assert.equal(chips('banded').length, 1);
    assert.equal(chips('banded')[0].textContent.trim(), '14+');
    assert.equal(chips('bare').length, 0, 'a band-less tier draws no chip');
    assert.equal(chips('blank').length, 0, 'an empty band draws no chip');
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
    assert.ok(target.querySelector('.manager-chip[data-band-hook="10–20"]'), 'band props on its chip');
    assert.ok(
      target.querySelector('.manager-chip[data-pill-hook][data-outcome-reached]'),
      "reached props on the tier's pill"
    );
    assert.ok(
      target.querySelector('[data-list-row="dense"][data-yield-hook="c2"]'),
      'yield props on its row'
    );
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
    assert.ok(root.classList.contains('fab-outcome-ladder') && root.classList.contains('extra-ladder'));
    assert.equal(target.querySelectorAll('button, input, select, a, [tabindex]').length, 0);
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
