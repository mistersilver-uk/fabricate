/**
 * Issue 2424 — `<TierTrack>`: a position along an ordered set of named tiers, drawn as `Chip`
 * badges in a row or as a ladder in a column, with the state told by text as well as colour.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-tier-track-',
  compiledModules: ['Chip', 'TierTrack'].map(component),
  componentPath: component('TierTrack'),
  rootClass: 'companion-sheet',
});

const LABELS = Object.freeze({
  ariaLabel: 'Standing with the Guild',
  currentLabel: 'You are here',
  reachedLabel: 'Reached',
  aheadLabel: 'Ahead',
});

const TOWNS = Object.freeze(['Thorpe', 'Hamlet', 'Village', 'Town'].map((name) => ({ name })));

const LADDER = Object.freeze([
  { id: 'revered', name: 'Revered', figure: '+20', notes: ['Hall keys'], valence: 'positive' },
  { id: 'honoured', name: 'Honoured', figure: '+10', notes: ['Guild rates'], valence: 'positive' },
  { id: 'accepted', name: 'Accepted', figure: '0', notes: ['Market access'] },
  { id: 'wary', name: 'Wary', figure: '−10', notes: ['Watched'], valence: 'neutral' },
  { id: 'hated', name: 'Hated', figure: '−20', notes: ['Refused service'], valence: 'negative' },
]);

const mount = (props) => harness.mount({ ...LABELS, ...props });
const tiersOf = (target) => [...target.querySelectorAll(':scope .fab-tier-track-list > li')];
const valences = (target) => tiersOf(target).map((li) => li.getAttribute('data-valence'));
const currents = (target) => tiersOf(target).map((li) => li.getAttribute('aria-current'));
const hiddenText = (li) => li.querySelector('.fab-tier-track-hidden')?.textContent;
const textOf = (node) => node.textContent.replaceAll(/\s+/g, ' ').trim();
const chipOf = (li) => li.querySelector('.manager-chip');
const toneOf = (li) => [...chipOf(li).classList].filter((name) => name.startsWith('is-'));

describe('TierTrack (issue 2424)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('draws an ordered list named by ariaLabel inside the root, with no hint by default', async () => {
    const target = await mount({ tiers: TOWNS, currentIndex: 1 });
    const root = target.querySelector(':scope > div.fab-tier-track');
    assert.ok(Boolean(root), 'the root is a div');
    const list = root.querySelector(':scope > ol');
    assert.equal(list.getAttribute('role'), 'list');
    assert.equal(list.getAttribute('aria-label'), 'Standing with the Guild');
    assert.ok(
      [...list.children].every((child) => child.tagName === 'LI'),
      'every child is an li'
    );
    assert.ok(!root.querySelector('.fab-tier-track-hint'), 'an empty hint draws nothing');
  });

  it('draws a hint beneath the list when one is passed', async () => {
    const target = await mount({
      tiers: TOWNS,
      currentIndex: 1,
      hint: '40 population to Village.',
    });
    const hint = target.querySelector(':scope .fab-tier-track > ol + p.fab-tier-track-hint');
    assert.equal(textOf(hint), '40 population to Village.');
  });

  it('spreads data attributes onto the root div', async () => {
    const target = await mount({ tiers: TOWNS, 'data-tier-probe': 'guild' });
    const root = target.querySelector('.fab-tier-track');
    assert.equal(root.tagName, 'DIV');
    assert.equal(root.getAttribute('data-tier-probe'), 'guild');
  });

  it('row, ascending: reached up to the current tier, which keeps its tone and leads with a pin', async () => {
    const target = await mount({ tiers: TOWNS, currentIndex: 1 });
    const tiers = tiersOf(target);
    assert.deepEqual(valences(target), ['positive', 'positive', null, null]);
    assert.deepEqual(currents(target), [null, 'step', null, null]);
    assert.deepEqual(tiers.map(toneOf), [['is-positive'], ['is-positive'], [], []]);
    const pin = chipOf(tiers[1]).querySelector('i.fas.fa-location-dot');
    assert.equal(pin?.getAttribute('aria-hidden'), 'true', 'the current badge leads with a pin');
    for (const index of [0, 2, 3]) {
      assert.ok(!tiers[index].querySelector('.fa-location-dot'), `tier ${index} has no pin`);
    }
  });

  it('row: every tier reads its name and its state as two words, the state hidden', async () => {
    const target = await mount({ tiers: TOWNS, currentIndex: 1 });
    const tiers = tiersOf(target);
    assert.deepEqual(tiers.map(textOf), [
      'Thorpe Reached',
      'Hamlet You are here',
      'Village Ahead',
      'Town Ahead',
    ]);
    assert.deepEqual(tiers.map(hiddenText), ['Reached', 'You are here', 'Ahead', 'Ahead']);
    assert.ok(!target.querySelector('.fab-tier-track-marker'), 'no visible marker in a row');
  });

  it('row: a decorative chevron follows every badge but the last, inside its li', async () => {
    const target = await mount({ tiers: TOWNS, currentIndex: 1 });
    const chevrons = tiersOf(target).map((li) => li.querySelector('i.fas.fa-chevron-right'));
    assert.deepEqual(
      chevrons.map((chevron) => chevron?.getAttribute('aria-hidden') ?? null),
      ['true', 'true', 'true', null]
    );
  });

  it('row, descending: reached from the current tier to the end of the list', async () => {
    const target = await mount({ tiers: TOWNS, currentIndex: 1, direction: 'descending' });
    assert.deepEqual(valences(target), [null, 'positive', 'positive', 'positive']);
    assert.deepEqual(currents(target), [null, 'step', null, null]);
    assert.deepEqual(tiersOf(target).map(hiddenText), [
      'Ahead',
      'You are here',
      'Reached',
      'Reached',
    ]);
  });

  it('column, descending: the ladder keeps every valence on a reached rung', async () => {
    const target = await mount({
      tiers: LADDER,
      currentIndex: 2,
      direction: 'descending',
      layout: 'column',
    });
    const tiers = tiersOf(target);
    assert.deepEqual(valences(target), [null, null, 'positive', 'neutral', 'negative']);
    assert.deepEqual(currents(target), [null, null, 'step', null, null]);
    assert.deepEqual(tiers.map(hiddenText), ['Ahead', 'Ahead', undefined, 'Reached', 'Reached']);
    const marker = tiers[2].querySelector('.fab-tier-track-marker');
    assert.equal(textOf(marker), 'You are here', 'the current rung shows its marker');
    assert.ok(!marker.closest('.fab-tier-track-hidden'), 'and the marker is visible');
    assert.equal(target.querySelectorAll('.fab-tier-track-marker').length, 1);
    assert.ok(!target.querySelector('.manager-chip'), 'a ladder draws no badges');
    assert.ok(!target.querySelector('.fa-chevron-right'), 'and no chevrons');
  });

  it('column: each rung has a decorative dot toned only when reached', async () => {
    const target = await mount({
      tiers: LADDER,
      currentIndex: 2,
      direction: 'descending',
      layout: 'column',
    });
    const dots = tiersOf(target).map((li) => li.querySelector('.fab-tier-track-dot'));
    assert.ok(dots.every((dot) => dot?.getAttribute('aria-hidden') === 'true'));
    assert.deepEqual(
      dots.map((dot) => [...dot.classList].filter((name) => name.startsWith('is-'))),
      [[], [], ['is-positive'], ['is-neutral'], ['is-negative']]
    );
  });

  it('draws figures and notes in a column only', async () => {
    const column = await mount({ tiers: LADDER, currentIndex: 0, layout: 'column' });
    const rung = tiersOf(column)[0];
    assert.equal(textOf(rung.querySelector('.fab-tier-track-figure')), '+20');
    assert.deepEqual(
      [...rung.querySelectorAll('.fab-tier-track-note')].map(textOf),
      ['Hall keys'],
      'the notes are drawn beneath the name'
    );
    harness.remount();
    const row = await mount({ tiers: LADDER, currentIndex: 0 });
    assert.ok(!row.querySelector('.fab-tier-track-figure'), 'a row draws no figure');
    assert.ok(!row.querySelector('.fab-tier-track-note'), 'a row draws no note');
    assert.ok(!textOf(row).includes('Hall keys'));
  });

  for (const currentIndex of [-1, -2, 5, 1.5, NaN, '2']) {
    const shown = typeof currentIndex === 'string' ? `'${currentIndex}'` : String(currentIndex);
    for (const direction of ['ascending', 'descending']) {
      it(`reaches nothing at currentIndex ${shown}, ${direction}`, async () => {
        const target = await mount({ tiers: LADDER, currentIndex, direction });
        assert.deepEqual(valences(target), [null, null, null, null, null]);
        assert.deepEqual(currents(target), [null, null, null, null, null]);
        assert.deepEqual(
          tiersOf(target).map(hiddenText),
          Array.from({ length: 5 }, () => 'Ahead')
        );
      });
    }
  }

  it('reads an unknown direction as ascending and an unknown layout as row', async () => {
    const target = await mount({
      tiers: TOWNS,
      currentIndex: 1,
      direction: 'sideways',
      layout: 'grid',
    });
    assert.deepEqual(valences(target), ['positive', 'positive', null, null]);
    assert.equal(target.querySelectorAll('.manager-chip').length, 4, 'drawn as badges');
    assert.equal(target.querySelectorAll('.fa-chevron-right').length, 3);
  });

  it('reads an omitted valence as positive and any unknown one as neutral, on reached tiers only', async () => {
    const tiers = [
      { name: 'Omitted' },
      { name: 'Null', valence: null },
      { name: 'Bogus', valence: 'bogus' },
      { name: 'Ahead', valence: 'negative' },
    ];
    const target = await mount({ tiers, currentIndex: 2 });
    assert.deepEqual(valences(target), ['positive', 'neutral', 'neutral', null]);
    assert.deepEqual(tiersOf(target).map(toneOf), [
      ['is-positive'],
      ['is-neutral'],
      ['is-neutral'],
      [],
    ]);
  });

  it('draws an empty named list for no tiers', async () => {
    const target = await mount({ tiers: [] });
    const list = target.querySelector('ol[role="list"]');
    assert.equal(list.getAttribute('aria-label'), 'Standing with the Guild');
    assert.equal(target.querySelectorAll('li').length, 0);
  });

  for (const tiers of ['Thorpe', { name: 'Thorpe' }, null]) {
    it(`draws tiers that are not an array (${JSON.stringify(tiers)}) as empty`, async () => {
      const target = await mount({ tiers, currentIndex: 0 });
      assert.equal(target.querySelectorAll('li').length, 0);
    });
  }

  it('skips a tier that is not a plain object and keeps reading indices as passed', async () => {
    const tiers = [{ name: 'Alpha' }, 'junk', { name: 'Gamma' }, null, ['Delta'], { name: 'Eta' }];
    const target = await mount({ tiers, currentIndex: 2 });
    assert.deepEqual(tiersOf(target).map(textOf), [
      'Alpha Reached',
      'Gamma You are here',
      'Eta Ahead',
    ]);
    assert.deepEqual(currents(target), [null, 'step', null]);
    assert.equal(target.querySelectorAll('.fa-chevron-right').length, 2, 'none after the last');
  });

  it('draws notes that are not an array as none', async () => {
    const tiers = [{ name: 'Alpha', notes: 'Hall keys' }];
    const target = await mount({ tiers, currentIndex: 0, layout: 'column' });
    assert.equal(target.querySelectorAll('.fab-tier-track-note').length, 0);
  });

  it('renders two tiers with the same name, and repeated notes', async () => {
    const tiers = [
      { id: 'a', name: 'Friendly', notes: ['Trade', 'Trade'] },
      { id: 'a', name: 'Friendly', notes: ['Trade'] },
    ];
    const target = await mount({ tiers, currentIndex: 0, layout: 'column' });
    assert.equal(tiersOf(target).length, 2);
    assert.equal(target.querySelectorAll('.fab-tier-track-note').length, 3);
  });

  it('moves the current tier and every state text on an update, on the same root node', async () => {
    const target = await mount({ tiers: LADDER, currentIndex: 2 });
    const root = target.querySelector('.fab-tier-track');
    await harness.setProps({ currentIndex: 3 });
    assert.ok(target.querySelector('.fab-tier-track') === root, 'nothing remounted');
    assert.deepEqual(currents(target), [null, null, null, 'step', null]);
    assert.deepEqual(tiersOf(target).map(hiddenText), [
      'Reached',
      'Reached',
      'Reached',
      'You are here',
      'Ahead',
    ]);
  });
});
