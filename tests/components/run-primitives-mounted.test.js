import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

function createHarness(name, dependencies = [], rawModules = []) {
  return createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-${name.toLowerCase()}-`,
    rawModules,
    compiledModules: [component(name), ...dependencies],
    componentPath: component(name),
  });
}

const runActionHarness = createHarness(
  'RunActionBar',
  [
    component('ManagerButton'),
    component('IconButton'),
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  ],
  ['src/ui/svelte/util/foundryBridge.js']
);
const worldClockHarness = createHarness('WorldClockChip', [component('Chip')]);
const slotRowHarness = createHarness('SlotRow', [
  component('SlotTile'),
  component('ChoiceOptionList'),
  component('Medallion'),
]);
const essenceHarness = createHarness('EssencePool', [
  component('FillBar'),
  component('Medallion'),
  component('Stepper'),
]);
const progressHarness = createHarness('RunProgress', [component('FillBar')]);
const stageNavHarness = createHarness('StageNav', [component('IconButton'), component('ManagerButton')]);
const stageCardHarness = createHarness('StageCard', [component('Chip')]);
const yieldHarness = createHarness('YieldScale', [component('Chip'), component('Medallion')]);
const outcomeHarness = createHarness('OutcomeLadder', [component('Chip')]);
const harnesses = [
  runActionHarness,
  worldClockHarness,
  slotRowHarness,
  essenceHarness,
  progressHarness,
  stageNavHarness,
  stageCardHarness,
  yieldHarness,
  outcomeHarness,
];

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

function sourceOf(name) {
  return readFileSync(resolve(repoRoot, component(name)), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
}

function expectGeometry(name, selector, declarations) {
  const source = sourceOf(name);
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${name} declares ${selector}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const body = source.slice(open + 1, close);
  for (const declaration of declarations) {
    assert.match(body, declaration, `${name} ${selector} keeps ${declaration}`);
  }
}

describe('run primitives mounted behavior', () => {
  before(async () => {
    for (const harness of harnesses) await harness.setup();
  });

  after(() => {
    for (const harness of harnesses) harness.teardown();
  });

  it('acts on completion, busy primary, pause, and the in-bar cancellation decision', async () => {
    const calls = [];
    const common = {
      run: { id: 'run-1', paused: false },
      runLabel: 'Forge Iron Rivets',
      cancel: {
        ariaLabel: 'Cancel Forge Iron Rivets',
        prompt: 'Cancel this run?',
        confirmLabel: 'Cancel the whole run',
        keepLabel: 'Keep it',
      },
      pause: { label: 'Pause', ariaLabel: 'Pause Forge Iron Rivets', enabled: true },
      resume: { label: 'Resume', ariaLabel: 'Resume Forge Iron Rivets' },
      primary: { label: 'Roll check', icon: 'fas fa-dice-d20', enabled: true },
      completion: {
        label: 'Complete',
        ariaLabel: 'How Forge Iron Rivets completes',
        value: 'manual',
        options: [
          { value: 'manual', label: 'By hand', icon: 'fas fa-hand-pointer' },
          { value: 'worldTime', label: 'As time passes', icon: 'fas fa-bolt' },
        ],
        onChange: (value) => {
          calls.push(['completion', value]);
        },
      },
      onPrimary: () => {
        calls.push(['primary']);
      },
      onPause: () => {
        calls.push(['pause']);
      },
      onResume: () => {
        calls.push(['resume']);
      },
      onCancel: () => {
        calls.push(['cancel']);
      },
    };

    const target = await runActionHarness.mount(common);
    assert.deepEqual(
      [...target.querySelectorAll(':scope > [data-run-action], :scope > [data-run-completion]')].map(
        (control) => control.getAttribute('data-run-action') || 'completion'
      ),
      ['cancel-arm', 'pause', 'completion', 'primary'],
      'the four action families keep their fixed order'
    );
    const completion = target.querySelector('input[value="worldTime"]');
    completion.click();
    await flushRender();
    assert.deepEqual(calls.shift(), ['completion', 'worldTime']);

    target.querySelector('[data-run-action="primary"]').click();
    assert.deepEqual(calls.shift(), ['primary']);

    target.querySelector('[data-run-action="pause"]').click();
    assert.deepEqual(calls.shift(), ['pause']);

    target.querySelector('[data-run-action="cancel-arm"]').click();
    await flushRender();
    assert.ok(target.querySelector('[data-run-cancel-decision]'), 'cancel decision appears in the bar');
    assert.ok(!target.querySelector('[data-run-action="primary"]'), 'primary withdraws while cancel is armed');
    assert.ok(!target.querySelector('[data-run-action="pause"]'), 'pause withdraws while cancel is armed');
    assert.ok(!target.querySelector('[data-run-completion]'), 'completion switch withdraws while armed');

    target.querySelector('[data-run-action="cancel-keep"]').click();
    await flushRender();
    assert.ok(target.querySelector('[data-run-action="primary"]'), 'keeping restores sibling actions');

    target.querySelector('[data-run-action="cancel-arm"]').click();
    await flushRender();
    target.querySelector('[data-run-action="cancel-confirm"]').click();
    assert.deepEqual(calls.shift(), ['cancel']);
    runActionHarness.remount();

    const busy = await runActionHarness.mount({
      ...common,
      primary: { ...common.primary, busy: true, busyLabel: 'Rolling check…' },
    });
    const busyPrimary = busy.querySelector('[data-run-action="primary"]');
    assert.equal(busyPrimary.disabled, true);
    assert.equal(busyPrimary.getAttribute('aria-busy'), 'true');
    assert.match(busyPrimary.textContent, /Rolling check/u);
    runActionHarness.remount();

    const paused = await runActionHarness.mount({
      ...common,
      run: { id: 'run-1', paused: true },
    });
    assert.deepEqual(
      [...paused.querySelectorAll(':scope > [data-run-action]')].map((control) =>
        control.getAttribute('data-run-action')
      ),
      ['cancel-arm', 'resume'],
      'a paused run exposes only cancel and resume'
    );
    paused.querySelector('[data-run-action="resume"]').click();
    assert.deepEqual(calls.shift(), ['resume']);
    runActionHarness.remount();

    const waiting = await runActionHarness.mount({
      ...common,
      pause: { ...common.pause, enabled: false, reason: 'Nothing is counting down' },
      primary: { ...common.primary, enabled: false, reason: 'The clock has not reached this stage' },
    });
    const waitingPrimary = waiting.querySelector('[data-run-action="primary"]');
    assert.equal(waitingPrimary.disabled, true);
    assert.equal(waitingPrimary.hasAttribute('aria-busy'), false);
    assert.equal(waitingPrimary.title, 'The clock has not reached this stage');
    assert.equal(waiting.querySelector('[data-run-action="pause"]').disabled, true);

    for (const control of waiting.querySelectorAll('button')) {
      assert.equal(control.getAttribute('data-keyboard-focus'), 'true');
    }
    expectGeometry('RunActionBar', '.fab-run-action-bar', [/gap:\s*var\(--fab-space-2\)/u]);
    expectGeometry('RunActionBar', ':global(.fab-run-action-control)', [
      /height:\s*34px/u,
      /border-radius:\s*9px/u,
    ]);
  });

  it('states the world clock as a read-only 28px info chip', async () => {
    const target = await worldClockHarness.mount({ label: 'World clock', value: 'Day 14 · 08:00' });
    const chip = target.querySelector('[data-world-clock]');
    assert.equal(chip.textContent.replaceAll(/\s+/gu, ' ').trim(), 'World clock Day 14 · 08:00');
    assert.ok(!chip.querySelector('button'), 'the player clock has no control');
    expectGeometry('WorldClockChip', ':global(.fab-world-clock-chip)', [
      /height:\s*28px/u,
      /border-radius:\s*7px/u,
    ]);
  });

  it('opens one choice below the slot row, chooses spare stock, and locks to images', async () => {
    const choices = [];
    const requirements = [
      { id: 'fixed', kind: 'fixed', componentId: 'charcoal', label: 'Charcoal', needed: 1, icon: 'fas fa-fire' },
      {
        id: 'binder',
        kind: 'choice',
        label: 'Any binder',
        needed: 1,
        openLabel: 'Choose a binder',
        affordanceLabel: '1 of 2',
        candidates: [
          { id: 'resin', label: 'Pine Resin', icon: 'fas fa-leaf' },
          { id: 'glass', label: 'Duskglass', icon: 'fas fa-flask' },
        ],
      },
    ];
    const held = (id) => ({ charcoal: 4, resin: 3, glass: 2 }[id] ?? 0);
    const claimed = (id) => (id === 'glass' ? 2 : 0);
    const target = await slotRowHarness.mount({
      requirements,
      held,
      claimed,
      openSlot: '',
      onOpen: () => {},
      onChoose: (slotId, componentId) => {
        choices.push([slotId, componentId]);
      },
      slotLabel: (slot) => slot.openLabel || slot.label,
      choiceLabel: 'Choose a component',
      candidateSummary: (count) => `${count} can fill this slot`,
      candidateReading: ({ held: count, needed, spare }) =>
        `${count} held · needs ${needed}${spare < needed ? ' · none spare' : ''}`,
    });

    target.querySelector(':scope [data-slot-id="binder"] button').click();
    await flushRender();
    assert.ok(target.querySelector('[data-choice-options="binder"]'), 'the chooser opens in flow');
    const unavailable = target.querySelector('[data-choice-id="glass"]');
    assert.equal(unavailable.disabled, true, 'stage claims, not held stock, disable a candidate');
    target.querySelector('[data-choice-id="resin"]').click();
    assert.deepEqual(choices, [['binder', 'resin']]);
    assert.equal(target.querySelectorAll('[data-choice-options]').length, 1, 'only one chooser is rendered');
    expectGeometry('SlotTile', '.fab-slot-tile-shell', [/width:\s*56px/u]);
    expectGeometry('SlotTile', '.fab-slot-tile', [/width:\s*56px/u, /height:\s*56px/u, /border-radius:\s*11px/u]);
    expectGeometry('ChoiceOptionList', '.fab-choice-option', [/height:\s*44px/u, /border-radius:\s*11px/u]);
    slotRowHarness.remount();

    const locked = await slotRowHarness.mount({
      requirements,
      held,
      claimed,
      locked: true,
      slotLabel: (slot) => slot.label,
    });
    assert.equal(locked.querySelectorAll(':scope [data-slot-id] [role="img"]').length, 2);
    assert.ok(!locked.querySelector('button'), 'rolled slots expose no controls');
  });

  it('uses one stage allocation for every essence threshold and states overshoot below sources', async () => {
    const steps = [];
    const thresholds = [
      {
        essence: 'radiant',
        amount: 4,
        icon: 'fas fa-star',
        tint: 'butter',
        sources: [{ id: 'duskglass', label: 'Duskglass', icon: 'fas fa-flask', tint: 'aqua' }],
      },
      {
        essence: 'shadow',
        amount: 3,
        icon: 'fas fa-droplet',
        tint: 'mauve',
        sources: [{ id: 'duskglass', label: 'Duskglass', icon: 'fas fa-flask', tint: 'aqua' }],
      },
    ];
    const target = await essenceHarness.mount({
      thresholds,
      allocation: { duskglass: 2 },
      onStep: (id, delta) => {
        steps.push([id, delta]);
      },
      yield: (_id, essence) => (essence === 'radiant' ? 2 : 2),
      held: () => 3,
      spare: () => 1,
      essenceLabel: (essence) => `${essence} channelled`,
      sourceReading: (_source, contributions, held, spare) =>
        `${contributions.map((entry) => `+${entry.amount} ${entry.label}`).join(' · ')} each · ${held} held · ${spare} spare`,
      overshootLabel: (essence, amount) => `${essence} is ${amount} over the requirement`,
      allocationLabel: (source) => `${source.label} spent on this stage`,
      decrementLabel: (source) => `Use one fewer ${source.label}`,
      incrementLabel: (source) => `Use one more ${source.label}`,
    });

    assert.equal(target.querySelectorAll('[data-essence-source="duskglass"]').length, 1, 'shared carrier renders once');
    assert.equal(target.querySelector('[data-essence-total="radiant"]').textContent.trim(), '4 / 4');
    assert.equal(target.querySelector('[data-essence-total="shadow"]').textContent.trim(), '4 / 3');
    assert.equal(
      target
        .querySelector(':scope [data-essence-threshold="shadow"] [role="progressbar"]')
        .getAttribute('aria-valuenow'),
      '3',
      'overshoot does not put the progressbar value beyond its maximum'
    );
    const overshoot = target.querySelector('[data-essence-overshoot]');
    assert.match(overshoot.textContent, /shadow is 1 over/u);
    assert.ok(
      target.querySelector('[data-essence-sources]').compareDocumentPosition(overshoot) & 4,
      'overshoot follows the source list'
    );
    const increment = target.querySelector(':scope [data-essence-source="duskglass"] [data-stepper-increment]');
    assert.equal(increment.disabled, true, 'all pools met disables further allocation');
    const decrement = target.querySelector(':scope [data-essence-source="duskglass"] [data-stepper-decrement]');
    decrement.click();
    await flushRender();
    assert.deepEqual(steps, [['duskglass', -1]], 'one physical allocation is stepped once');
    assert.equal(
      target.querySelector('[data-essence-total="radiant"]').textContent.trim(),
      '2 / 4',
      'the bindable allocation updates before the callback returns control'
    );
    expectGeometry('EssencePool', '.fab-essence-pool', [/border-radius:\s*9px/u, /padding:\s*var\(--fab-space-3\)/u]);
  });

  it('renders progress separately from a five-number viewed-stage window', async () => {
    const stages = Array.from({ length: 8 }, (_, index) => ({ id: `s${index + 1}`, name: `Stage ${index + 1}` }));
    const viewed = [];
    const progress = await progressHarness.mount({
      stages,
      current: 3,
      progress: 64,
      blocker: 'Materials needed',
      label: 'Progress',
    });
    assert.equal(progress.querySelectorAll('[data-run-progress-track]').length, 8);
    assert.equal(progress.querySelector('[data-run-progress-blocker]').textContent, 'Materials needed');
    expectGeometry('RunProgress', '.fab-run-progress-track', [/height:\s*6px/u, /border-radius:\s*999px/u]);

    const nav = await stageNavHarness.mount({
      stages,
      current: 3,
      view: 2,
      window: 9,
      onView: (index) => {
        viewed.push(index);
      },
      stageLabel: (_stage, index) => `Show stage ${index + 1}`,
      previousLabel: 'Show the previous stage',
      nextLabel: 'Show the next stage',
      positionLabel: (view, total) => `Stage ${view + 1} of ${total}`,
      returnLabel: (current) => `Back to stage ${current + 1}`,
    });
    assert.equal(nav.querySelectorAll('[data-stage-nav-index]').length, 5);
    assert.equal(nav.querySelector('[aria-pressed="true"]').getAttribute('data-stage-nav-index'), '2');
    assert.equal(nav.querySelector('[data-stage-nav-index="3"]').getAttribute('data-current'), 'true');
    nav.querySelector('[data-stage-nav-index="4"]').click();
    nav.querySelector('[data-stage-nav-return]').click();
    assert.deepEqual(viewed, [4, 3]);
    expectGeometry('StageNav', '.fab-stage-nav-number', [/width:\s*26px/u, /height:\s*26px/u, /border-radius:\s*7px/u]);
    stageNavHarness.remount();
    const single = await stageNavHarness.mount({ stages: stages.slice(0, 1), current: 0, view: 0 });
    assert.equal(single.querySelector('[data-stage-nav]'), null, 'one stage needs no navigation control');
  });

  it('keeps inactive stage cards inert and uses worked-stage geometry only for current', async () => {
    const future = await stageCardHarness.mount({
      stage: { name: 'Quench and temper', summary: 'Needs 6 hours once reached' },
      index: 4,
      current: false,
      state: 'future',
    });
    const card = future.querySelector('[data-stage-card]');
    assert.equal(card.getAttribute('data-stage-state'), 'future');
    assert.ok(!card.querySelector('button'), 'a future stage is inert');
    expectGeometry('StageCard', '.fab-stage-card', [/border-radius:\s*9px/u]);
    expectGeometry('StageCard', '.fab-stage-card.is-inactive', [/background:\s*transparent/u, /border:\s*1px dashed/u]);
  });

  it('sorts the d100 scale commonest first and inserts exactly one roll cut', async () => {
    const entries = [
      { id: 'rare', name: 'Skyfall Shard', icon: 'fas fa-star', tint: 'lavender', qty: 1, chance: 5 },
      { id: 'sure', name: 'Greyfell Scree', icon: 'fas fa-hammer', tint: 'slate', qty: 3, chance: 100 },
      { id: 'mid', name: 'Iron Nodule', icon: 'fas fa-hammer', tint: 'mist', qty: 2, chance: 70 },
    ];
    const labels = {
      threshold: (entry) => (entry.chance >= 100 ? 'always comes back' : `comes back on ${entry.chance} or less`),
      cleared: () => 'came back',
      missed: (entry) => `needed ${entry.chance} or less`,
      chance: (entry) => `${entry.chance}%`,
      quantity: (entry) => `×${entry.qty}`,
      cut: (roll) => `Rolled ${roll}`,
      cutNote: () => 'anything rarer than this fell short',
      topCutNote: () => 'over every chance on the scale',
      bottomCutNote: () => 'every find on the scale cleared it',
    };
    const target = await yieldHarness.mount({ entries, roll: 41, labels });
    assert.deepEqual(
      [...target.querySelectorAll('[data-yield-entry]')].map((row) => row.getAttribute('data-yield-entry')),
      ['sure', 'mid', 'rare']
    );
    assert.equal(target.querySelectorAll('[data-yield-cut]').length, 1);
    assert.equal(target.querySelectorAll('button').length, 0, 'the scale is read-only');
    expectGeometry('YieldScale', '.fab-yield-row', [/border-radius:\s*9px/u, /background:\s*var\(--fab-bg-2\)/u]);
    yieldHarness.remount();

    const top = await yieldHarness.mount({ entries, roll: 101, labels });
    assert.match(top.querySelector('[data-yield-cut]').textContent, /over every chance/u);
    yieldHarness.remount();
    const bottom = await yieldHarness.mount({ entries, roll: 1, labels });
    assert.match(bottom.querySelector('[data-yield-cut]').textContent, /every find on the scale cleared it/u);
  });

  it('states the complete routed outcome ladder including failure without controls', async () => {
    const target = await outcomeHarness.mount({
      tiers: [
        { name: 'Bountiful', band: '20+', yields: [{ name: 'Iron Nodule', quantity: '×4' }] },
        { name: 'Barren', band: '<14', fail: true, yields: [] },
      ],
      emptyTierText: 'nothing — the trail goes cold',
    });
    assert.equal(target.querySelectorAll('[data-outcome-tier]').length, 2);
    assert.equal(target.querySelector('[data-outcome-tier].is-failure').textContent.includes('Barren'), true);
    assert.match(target.querySelector('[data-outcome-empty]').textContent, /trail goes cold/u);
    assert.equal(target.querySelectorAll('button, input, select').length, 0);
    expectGeometry('OutcomeLadder', '.fab-outcome-tier', [/border-radius:\s*9px/u, /background:\s*var\(--fab-bg-2\)/u]);
  });
});
