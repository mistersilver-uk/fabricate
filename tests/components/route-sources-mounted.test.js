/**
 * `RouteSources` (issue 2512): the chips naming what routes into a set, the struck sources that do
 * not route, the unreachable badge, the implicit reserved line, and Assign over every source.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, tick } from 'svelte';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-route-sources-',
  rawModules: [...SEARCHABLE_POPOVER_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [
    ...SEARCHABLE_POPOVER_COMPILED_MODULES,
    'src/ui/svelte/components/RouteSources.svelte',
  ],
  componentPath: 'src/ui/svelte/components/RouteSources.svelte',
});

const GOLD = { id: 's1', label: 'Gold', removable: true };
const SILVER = { id: 's2', label: 'Silver', removable: false, hint: 'default' };
const PARTIAL = { id: 't-partial', label: 'Partial', removable: true, nonRouting: true };
const CANDIDATES = [
  { id: 's1', label: 'Gold', routedTo: 'Ring' },
  { id: 's2', label: 'Silver', routedTo: null },
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

async function settle() {
  flushSync();
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

/** A mounted line with every callback recorded. */
async function mountLine(props = {}) {
  const calls = [];
  const target = await harness.mount({
    candidates: CANDIDATES,
    onAssign: (id) => {
      calls.push(['assign', id]);
    },
    onRemove: (id) => {
      calls.push(['remove', id]);
    },
    ...props,
  });
  const line = target.querySelector('[data-route-sources-line]');
  return {
    target,
    calls,
    line,
    chip: (id) => line.querySelector(`[data-route-sources-chip="${id}"]`),
    chipIds: () =>
      [...line.querySelectorAll('[data-route-sources-chip], [data-route-sources-unreachable]')].map(
        (chip) => chip.getAttribute('data-route-sources-chip') ?? 'unreachable'
      ),
    assign: () => line.querySelector('[data-route-sources-assign]'),
    summary: () => line.querySelector('[data-route-sources-summary]').textContent,
    panel: () => target.querySelector('.fabricate-route-sources-popover'),
    option: (label) =>
      [
        ...(target
          .querySelector('.fabricate-route-sources-popover')
          ?.querySelectorAll('[role="option"]') ?? []),
      ].find((row) => row.textContent.includes(label)),
  };
}

/** The line's own hook, in whichever state it is drawn. */
function assertLineHook(line, name) {
  assert.equal(line.getAttribute('role'), 'group', `${name}: the line is a group`);
  assert.equal(line.getAttribute('tabindex'), '-1', `${name}: it is a programmatic focus target`);
  assert.equal(line.getAttribute('data-keyboard-focus'), 'true', `${name}: Foundry sees its focus`);
  const named = line.ownerDocument.querySelector(`[id="${line.getAttribute('aria-labelledby')}"]`);
  assert.equal(named?.textContent, 'Produced by', `${name}: the label names the group`);
}

describe('RouteSources: the chips', () => {
  it('carries a remove control only on a removable source, and draws the default hint', async () => {
    const view = await mountLine({ sources: [GOLD, SILVER] });
    assert.ok(Boolean(view.chip('s1').querySelector('[data-chip-remove]')), 'Gold is removable');
    assert.ok(!view.chip('s2').querySelector('[data-chip-remove]'), 'a fallback source is not');
    assert.ok(view.chip('s1').classList.contains('is-positive'));
    assert.ok(view.chip('s1').classList.contains('is-row'));
    assert.ok(
      Boolean(view.chip('s1').querySelector('i.fa-check')),
      'an effective source is ticked'
    );
    assert.equal(
      view.chip('s2').querySelector('.fabricate-route-sources-hint').textContent,
      'default'
    );
    assert.equal(view.chip('s2').getAttribute('title'), 'Silver, default');
    assert.equal(
      view.chip('s1').querySelector('[data-chip-remove]').getAttribute('aria-label'),
      'Remove Gold'
    );

    view.chip('s1').querySelector('[data-chip-remove]').click();
    await settle();
    assert.deepEqual(view.calls, [['remove', 's1']]);
  });

  it('strikes a source that does not route, with no tick, a hidden suffix and a remove control', async () => {
    const view = await mountLine({ sources: [GOLD, PARTIAL] });
    const struck = view.chip('t-partial');
    // Neutral, not muted: its ink is the muted text token, which clears 4.5:1 on every theme.
    assert.ok(struck.classList.contains('is-struck') && struck.classList.contains('is-neutral'));
    assert.ok(!struck.querySelector('i.fa-check'), 'a struck source carries no tick');
    assert.equal(struck.querySelector('.visually-hidden').textContent, ', does not route');
    assert.equal(struck.getAttribute('title'), 'Partial, does not route');
    assert.deepEqual(
      view.chipIds(),
      ['s1', 't-partial'],
      'struck sources follow the effective ones'
    );

    struck.querySelector('[data-chip-remove]').click();
    await settle();
    assert.deepEqual(view.calls, [['remove', 't-partial']]);
  });

  it('draws the unreachable badge ahead of any struck source when the caller says nothing reaches the set', async () => {
    const view = await mountLine({ sources: [PARTIAL], unreachable: true });
    assert.deepEqual(view.chipIds(), ['unreachable', 't-partial']);
    const badge = view.line.querySelector('[data-route-sources-unreachable]');
    assert.ok(badge.classList.contains('is-warning'));
    assert.equal(badge.textContent, 'Nothing — unreachable');
    assert.ok(!badge.querySelector('[data-chip-remove]'), 'the badge removes nothing');
  });

  it('draws no badge for a set with no source that the caller does not flag', async () => {
    const view = await mountLine({ sources: [PARTIAL] });
    assert.deepEqual(view.chipIds(), ['t-partial'], 'the badge follows the flag, not the count');
  });

  it('announces the effective sources, or that nothing reaches the set, in a polite summary', async () => {
    let view = await mountLine({ sources: [GOLD, SILVER, PARTIAL] });
    const live = view.line.querySelector('[aria-live="polite"]');
    assert.ok(live.classList.contains('visually-hidden'));
    assert.equal(view.summary(), 'Produced by Gold, Silver');
    harness.remount();
    view = await mountLine({ sources: [], unreachable: true });
    assert.equal(view.summary(), 'Produced by Nothing — unreachable');
  });
});

describe('RouteSources: the line in every state', () => {
  it('replaces the chips and Assign with the implicit words of a reserved role', async () => {
    const view = await mountLine({
      sources: [GOLD],
      implicitLabel: 'a passed check — no assignment',
    });
    assertLineHook(view.line, 'implicit');
    assert.equal(
      view.line.querySelector('[data-route-sources-implicit]').textContent,
      'a passed check — no assignment'
    );
    assert.deepEqual(view.chipIds(), []);
    assert.ok(!view.assign(), 'a reserved role is assigned nothing');
    assert.equal(view.summary(), 'Produced by a passed check — no assignment');
  });

  it('replaces Assign with the hint when there is no candidate', async () => {
    let view = await mountLine({ sources: [], candidates: [] });
    assertLineHook(view.line, 'no candidates');
    assert.ok(!view.assign());
    assert.ok(
      view.line.hasAttribute('data-chip-remove-fallback'),
      'with no Assign, a removed chip falls back to its own line'
    );
    assert.equal(
      view.line.querySelector('[data-route-sources-hint]').textContent,
      'Add an ingredient set first.'
    );
    harness.remount();
    view = await mountLine({ candidates: [], emptyLabel: 'Define outcome tiers first.' });
    assert.equal(
      view.line.querySelector('[data-route-sources-hint]').textContent,
      'Define outcome tiers first.'
    );
  });

  it('draws Assign as a named raw button that a removed chip can fall back to', async () => {
    const view = await mountLine({ sources: [GOLD] });
    assertLineHook(view.line, 'chips');
    const assign = view.assign();
    assert.equal(assign.tagName, 'BUTTON');
    assert.ok(assign.classList.contains('fabricate-route-sources-assign'));
    assert.ok(assign.hasAttribute('data-chip-remove-fallback'));
    assert.equal(assign.getAttribute('data-keyboard-focus'), 'true');
    assert.equal(assign.getAttribute('aria-label'), 'Assign');
    assert.equal(assign.textContent.trim(), 'Assign');
    assert.ok(!view.line.hasAttribute('data-chip-remove-fallback'), 'Assign is the fallback');
  });

  it('names Assign for its set while its visible word stays "Assign"', async () => {
    const view = await mountLine({ sources: [GOLD], assignLabel: 'Assign to Ring' });
    assert.equal(view.assign().getAttribute('aria-label'), 'Assign to Ring');
    assert.equal(view.assign().textContent.trim(), 'Assign');
  });

  it('moves a removed chip’s focus to the line when there is no Assign', async () => {
    const view = await mountLine({ sources: [GOLD], candidates: [] });
    view.chip('s1').querySelector('[data-chip-remove]').click();
    await settle();
    assert.ok(document.activeElement === view.line, 'focus stays on this set’s line');
  });

  it('inerts the chips and Assign when disabled', async () => {
    const view = await mountLine({ sources: [GOLD], disabled: true });
    assert.ok(view.chip('s1').querySelector('[data-chip-remove]').disabled);
    assert.ok(view.assign().disabled);
  });
});

describe('RouteSources: Assign', () => {
  it('assigns a source not yet chosen, and removes one already assigned', async () => {
    const view = await mountLine({ sources: [SILVER], assigned: ['s2'] });
    view.assign().click();
    await settle();
    assert.ok(Boolean(view.panel()), 'Assign opens its panel');
    view.option('Gold').click();
    await settle();
    view.option('Silver').click();
    await settle();
    assert.deepEqual(view.calls, [
      ['assign', 's1'],
      ['remove', 's2'],
    ]);
  });

  it('names where each source routes today, and carries the note atop the panel', async () => {
    const view = await mountLine({
      sources: [],
      assignNote: 'Assigning a tier stops the other tiers routing by name.',
    });
    view.assign().click();
    await settle();
    assert.ok(view.option('Gold').textContent.includes('now → Ring'));
    assert.ok(!view.option('Silver').textContent.includes('now →'), 'a source routed nowhere else');
    assert.equal(
      view.panel().querySelector('[data-route-sources-note]').textContent,
      'Assigning a tier stops the other tiers routing by name.'
    );
  });

  it('draws no note without one', async () => {
    const view = await mountLine({ sources: [] });
    view.assign().click();
    await settle();
    assert.ok(!view.panel().querySelector('[data-route-sources-note]'));
  });
});
