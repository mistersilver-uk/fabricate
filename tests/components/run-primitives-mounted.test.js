import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createRawSnippet } from 'svelte';

import { createMountedComponentHarness, SELECT_COMPILED_MODULES, SEARCHABLE_POPOVER_RAW_MODULES } from '../helpers/svelte-component-harness.js';

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
const listRowHarness = createHarness('ListRow', [component('Medallion')]);
const chipHarness = createHarness('Chip');
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
const resultModules = ['ListRow', 'Medallion', 'Chip'].map(component);
const stageCardHarness = createHarness('StageCard', [...resultModules, component('Kicker')]);
const yieldHarness = createHarness('YieldScale', resultModules);
const outcomeHarness = createHarness('OutcomeLadder', resultModules);
const pagerHarness = createHarness('Pagination', [...SELECT_COMPILED_MODULES, component('IconButton')], SEARCHABLE_POPOVER_RAW_MODULES);
const harnesses = [
  runActionHarness,
  worldClockHarness,
  listRowHarness,
  chipHarness,
  slotRowHarness,
  essenceHarness,
  progressHarness,
  stageNavHarness,
  stageCardHarness,
  yieldHarness,
  outcomeHarness,
  pagerHarness,
];

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

function sourceOf(name) {
  return readFileSync(resolve(repoRoot, component(name)), 'utf8').replaceAll('\r\n', '\n').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
}

/**
 * The body of the rule whose selector list is EXACTLY `selector`.
 *
 * A plain `indexOf` matched the TAIL of a longer list too, so a pin naming two selectors could
 * silently read a different rule that merely ends with the same two — and then assert against
 * declarations that rule never carried. Only a match at a rule boundary is a rule.
 */
function ruleBody(source, selector) {
  const needle = `${selector} {`;
  for (let from = 0; ; ) {
    const start = source.indexOf(needle, from);
    if (start === -1) return null;
    const before = source.slice(0, start).trimEnd();
    if (before === '' || /[}>]$/u.test(before)) {
      const open = source.indexOf('{', start);
      return source.slice(open + 1, source.indexOf('}', open));
    }
    from = start + 1;
  }
}

function expectGeometry(name, selector, declarations) {
  const body = ruleBody(sourceOf(name), selector);
  assert.notEqual(body, null, `${name} declares ${selector}`);
  for (const declaration of declarations) {
    assert.match(body, declaration, `${name} ${selector} keeps ${declaration}`);
  }
}

describe('run primitives mounted behavior', () => {
  before(async () => {
    for (const harness of harnesses) await harness.setup();
  });

  after(async () => {
    for (const harness of harnesses) harness.remount();
    await flushRender();
    for (const harness of harnesses) harness.teardown();
  });

  it('opts out of the shared cut without coercing unknown row outcomes or losing recorded fields', async () => {
    yieldHarness.remount();
    const props = { roll: 12, entries: [
      { id: 'known', name: 'Known', chance: 90, qty: 0, rawRoll: 12, cleared: true },
      { id: 'unknown', name: 'Unknown', chance: null, qty: null, rawRoll: 94, cleared: null },
    ], labels: { evidence: (entry) => `Raw ${entry.rawRoll}`, quantity: (entry) => entry.qty ?? 'Not recorded' } };
    const target = await yieldHarness.mount({ ...props, rollModel: 'perRow' });
    assert.ok(!target.querySelector('[data-yield-cut]'));
    assert.match(target.querySelector('[data-yield-entry="known"]').textContent, /Raw 12.*0/);
    assert.match(target.querySelector('[data-yield-entry="unknown"]').textContent, /Raw 94.*Not recorded/);
    assert.equal(target.querySelector('[data-yield-entry="unknown"]').classList.contains('is-missed'), false);
    await yieldHarness.setProps({ ...props, rollModel: 'unknown' });
    assert.ok(!target.querySelector('[data-yield-cut]'));
    await yieldHarness.setProps({ ...props, rollModel: 'shared' });
    assert.equal(target.querySelector('[data-yield-shared-roll]').textContent.trim(), '12');
    assert.ok(!target.querySelector('[data-yield-cut]'));
    await yieldHarness.setProps({ ...props, entries: props.entries.map((entry) => ({ ...entry, cleared: true })), rollModel: 'shared' });
    assert.equal(target.querySelectorAll('[data-yield-cut]').length, 1);
  });

  it('keeps the default pager face and opts into compact without changing its named controls', async () => {
    const props = { totalCount: 12, pageSize: 4, pageSizeOptions: [4, 6, 12], persistent: true,
      label: 'Finished runs', navLabel: 'Finished pages' };
    const target = await pagerHarness.mount(props);
    assert.ok(!target.querySelector('[data-pagination-compact], .manager-pagination-hidden'));
    const page = target.querySelector('[data-pagination-page]').textContent;
    await pagerHarness.setProps({ ...props, compact: true });
    assert.equal(target.querySelector('[data-pagination-page]').textContent, page);
    assert.equal(target.querySelector('section').getAttribute('aria-label'), 'Finished runs');
    assert.equal(target.querySelector('nav').getAttribute('aria-label'), 'Finished pages');
    assert.equal(target.querySelector('[data-pagination-prev]').disabled, true);
    assert.equal(target.querySelector('[data-pagination-next]').disabled, false);
    const caption = target.querySelector('[data-pagination-size]').getAttribute('aria-labelledby');
    assert.ok(target.querySelector(`[id="${caption}"]`)?.textContent.trim());
    pagerHarness.remount();
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
      [...target.querySelectorAll('[data-run-action-bar] > [data-run-action], [data-run-action-bar] > [data-run-completion]')].map(
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
      [...paused.querySelectorAll('[data-run-action-bar] > [data-run-action]')].map((control) =>
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
    expectGeometry(
      'RunActionBar',
      '.fab-run-action-bar,\n  .fab-run-begin-decision,\n  .fab-run-cancel-decision',
      [/gap:\s*var\(--fab-space-2\)/u]
    );
    expectGeometry('RunActionBar', ':global(.fab-run-action-control)', [
      /height:\s*34px/u,
      /border-radius:\s*9px/u,
    ]);
    // Issue 1648 (M16 then M26): an unbounded prompt sentence was sizing the header as a
    // `flex: 0 1 auto` item, pushing the Begin/Cancel button off the card's right edge. Taking
    // its own line keeps the buttons — not the prose — in control of the bar's width.
    //
    // Both prompts are a CALLOUT under a single line of controls rather than a bare span beside
    // them, and both decisions are pushed to the far right. Every part is load-bearing: without
    // the auto margin the controls bunch at the left, and without the full basis the sentence
    // rejoins the control row at a wide enough window.
    expectGeometry(
      'RunActionBar',
      '.fab-run-begin-decision,\n  .fab-run-cancel-decision',
      [/margin-left:\s*auto/u]
    );
    expectGeometry('RunActionBar', '.fab-run-begin-prompt,\n  .fab-run-cancel-prompt', [
      /flex:\s*1 1 100%/u,
      /border:\s*1px solid var\(--fab-border\)/u,
      /background:\s*var\(--fab-bg-1\)/u,
    ]);
  });

  /**
   * UX2-7. Arming UNMOUNTS the control that was activated and replaces the whole row, so a
   * keyboard user was dropped onto `<body>` and a screen-reader user was told nothing. Focus
   * lands on the NON-destructive default, the pair announces itself, and `Escape` disarms.
   */
  it('moves focus to the safe default on arming, announces the pair, and disarms on Escape', async () => {
    const target = await runActionHarness.mount({
      run: { id: 'run-1' },
      runLabel: 'Minor Elixir of Mending',
      primary: { label: 'Roll check', enabled: true },
      cancel: { confirmLabel: 'Yes, cancel', keepLabel: 'Keep crafting' },
    });
    target.querySelector('[data-run-action="cancel-arm"]').click();
    await flushRender();

    const decision = target.querySelector('[data-run-cancel-decision]');
    const keep = target.querySelector('[data-run-action="cancel-keep"]');
    assert.equal(decision.getAttribute('role'), 'group', 'the confirmation announces itself');
    assert.equal(decision.getAttribute('aria-label'), 'Yes, cancel');
    assert.equal(
      target.ownerDocument.activeElement,
      keep,
      'and focus is on the non-destructive default, never on the body'
    );

    const view = target.ownerDocument.defaultView;
    keep.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flushRender();
    assert.ok(!target.querySelector('[data-run-cancel-decision]'), 'Escape disarms the confirmation');
    assert.ok(target.querySelector('[data-run-action="cancel-arm"]'), 'and the row comes back');
  });

  it('renders the armed cancel prompt beneath its controls, not inside the decision', async () => {
    // Issue 1648 (M26), the cancel sibling of M16 and reported from a frame: the sentence
    // rendered on its own line ABOVE `Yes, cancel` / `Keep crafting`, with both buttons
    // left-aligned beneath it. The maintainer: "That should be in the top right!"
    const target = await runActionHarness.mount({
      run: { id: 'run-1' },
      runLabel: 'Minor Elixir of Mending',
      primary: { label: 'Roll check', enabled: false },
      cancel: {
        confirmLabel: 'Yes, cancel',
        keepLabel: 'Keep crafting',
        prompt: 'The consumed ingredients and currency will be returned.',
      },
      armed: true,
    });
    const decision = target.querySelector('[data-run-cancel-decision]');
    const prompt = target.querySelector('[data-run-cancel-prompt]');
    assert.ok(decision, 'the cancel decision renders');
    assert.ok(prompt, 'the prompt renders');
    assert.equal(decision.contains(prompt), false, 'the prompt is not inside the decision');
    assert.deepEqual(
      [...decision.querySelectorAll('[data-run-action]')].map((node) => node.dataset.runAction),
      ['cancel-confirm', 'cancel-keep'],
      'so the decision is the two controls and nothing else, on one line'
    );
    const bar = target.querySelector('[data-run-action-bar]');
    const order = [...bar.children];
    assert.ok(
      order.indexOf(prompt) > order.indexOf(decision),
      'and it follows the decision, so it reads as a callout beneath the controls'
    );
  });

  it('renders the begin prompt beneath the controls, not inside the decision', async () => {
    // Issue 1648 (M16), reported twice. The first fix gave the prompt its own line but left it
    // INSIDE `.fab-run-begin-decision`, so it wrapped ABOVE the button and the controls stayed
    // bunched left. DOM order is the fix, so DOM order is what this asserts — a geometry pin
    // alone would have passed on the shape the maintainer rejected.
    const target = await runActionHarness.mount({
      run: { id: 'run-1' },
      runLabel: 'Minor Elixir of Mending',
      primary: { label: 'Roll check', enabled: false },
      begin: { label: 'Begin step', enabled: true, prompt: 'Begins the step now.' },
    });
    const decision = target.querySelector('[data-run-begin]');
    const prompt = target.querySelector('[data-run-begin-prompt]');
    assert.ok(decision, 'the begin decision renders');
    assert.ok(prompt, 'the prompt renders');
    assert.equal(decision.contains(prompt), false, 'the prompt is not inside the decision');
    const bar = target.querySelector('[data-run-action-bar]');
    const order = [...bar.children];
    assert.ok(
      order.indexOf(prompt) > order.indexOf(decision),
      'and it follows the decision, so it reads as a callout beneath the controls'
    );
  });

  it('adds repeated essence needs before evaluating a shared physical allocation', async () => {
    const target = await essenceHarness.mount({
      thresholds: [2, 2].map((amount) => ({ essence: 'fire', amount, sources: [{ id: 'ember', label: 'Ember' }] })),
      allocation: { ember: 1 },
      yield: () => 2,
      spare: () => 1,
      held: () => 2,
      incrementLabel: () => 'More ember',
    });
    assert.equal(target.querySelectorAll('[data-essence-total="fire"]').length, 1);
    assert.match(target.querySelector('[data-essence-total="fire"]').textContent, /2 \/ 4/);
    assert.equal(target.querySelector('[aria-label="More ember"]').disabled, false);
    target.querySelector('[aria-label="More ember"]').click();
    await flushRender();
    assert.match(target.querySelector('[data-essence-total="fire"]').textContent, /4 \/ 4/);
    assert.equal(target.querySelector('[aria-label="More ember"]').disabled, true);
    essenceHarness.remount();
  });

  it('states the world clock as a read-only 28px info chip', async () => {
    const target = await worldClockHarness.mount({ label: 'World clock', value: 'Day 14 · 08:00' });
    const chip = target.querySelector('[data-world-clock]');
    assert.equal(chip.textContent.replaceAll(/\s+/gu, ' ').trim(), 'World clock Day 14 · 08:00');
    assert.ok(!chip.querySelector('button'), 'the player clock has no control');
    assert.ok(chip.classList.contains('is-clock'));
    // Issue 1648: ONE flex child holding ONE line box, so the glyph, the label and the value
    // share a baseline. As three flex children at three type sizes they could not — centring
    // three boxes of 9.92px, 9px and 10.5px put their baselines 1.25px apart, which is what
    // "the world time text is not vertically centred" was.
    assert.deepEqual(
      [...chip.children].map((node) => node.tagName),
      ['SPAN']
    );
    const line = chip.querySelector('.fab-world-clock-line');
    assert.deepEqual(
      [...line.children].map((node) => node.tagName),
      ['I', 'SPAN', 'SPAN']
    );
    expectGeometry('WorldClockChip', '.fab-world-clock-line', [
      /display:\s*flex/u,
      /align-items:\s*baseline/u,
      /gap:\s*var\(--fab-space-2\)/u,
    ]);
    expectGeometry('Chip', '.manager-chip.is-clock', [
      /height:\s*28px/u,
      /min-height:\s*28px/u,
      /border-radius:\s*7px/u,
      /padding:\s*0 var\(--fab-space-2\)/u,
      /gap:\s*var\(--fab-space-2\)/u,
    ]);
  });

  it('uses canonical list line-height across bordered, bare and icon-only chip siblings', async () => {
    for (const props of [{ tone: 'positive' }, { tone: 'danger' }, { emphasis: 'bare' }, { iconOnly: true, 'aria-label': 'Blocked' }]) {
      chipHarness.remount();
      const children = props.iconOnly ? undefined : createRawSnippet(() => ({ render: () => '<span>Recorded status</span>' }));
      const target = await chipHarness.mount({ density: 'list', icon: 'fas fa-check', children, ...props });
      assert.ok(target.querySelector('.manager-chip.is-list'));
      if (!props.iconOnly) assert.match(target.textContent, /Recorded status/);
    }
    expectGeometry('Chip', '.manager-chip.is-list', [/line-height:\s*1\.6/u, /font-size:\s*9px/u, /font-weight:\s*600/u]);
    expectGeometry('Chip', '.manager-chip.is-icon-only.is-list', [/width:\s*15px/u, /height:\s*15px/u]);
    chipHarness.remount();
  });

  it('opts dense cards into truncation while retaining full names and occurrence evidence', async () => {
    const name = 'A long hammer name with a distinct physical source'.repeat(3);
    const detail = 'Stage 1: ×1; Stage 3: ×2 · Broken';
    const target = await listRowHarness.mount({ name, detail, quantity: null });
    assert.ok(!target.querySelector('.is-truncated'));
    await listRowHarness.setProps({ name, detail, quantity: null, truncateName: true });
    assert.ok(target.querySelector('.fabricate-list-row.is-truncated'));
    assert.equal(target.querySelector('.fabricate-list-row-name').title, name);
    assert.equal(target.querySelector('.fabricate-list-row-detail').title, detail);
    assert.equal(target.querySelector('.fabricate-list-row-detail').textContent, detail);
    assert.ok(!target.querySelector('.fabricate-list-row-quantity'));
    listRowHarness.remount();
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
    assert.match(overshoot.textContent, /shadow channelled is 1 over/u);
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
    // Named as the WHOLE selector list: `.fab-stage-nav-number` alone is also a rule of its
    // own, and the size lives on the shared arrow+number rule.
    expectGeometry(
      'StageNav',
      ':global(.fabricate-icon-button.manager-icon-button.fab-stage-nav-arrow),\n  .fab-stage-nav-number',
      [/width:\s*26px/u, /height:\s*26px/u, /border-radius:\s*7px/u]
    );
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
    assert.ok(card.querySelector('.fab-stage-card-heading'), 'headings remain on by default');
    assert.ok(!card.querySelector('button'), 'a future stage is inert');
    expectGeometry('StageCard', '.fab-stage-card', [/border-radius:\s*9px/u]);
    expectGeometry('StageCard', '.fab-stage-card.is-inactive', [/background:\s*transparent/u, /border:\s*1px dashed/u]);

    stageCardHarness.remount();
    const headingless = await stageCardHarness.mount({
      stage: { name: 'Only stage' },
      current: true,
      state: 'current',
      showHeading: false,
    });
    assert.ok(!headingless.querySelector('.fab-stage-card-heading'), 'a single-stage caller can suppress redundant numbering');
  });

  it('keeps explicitly unrecorded outcomes neutral instead of applying the default comparison', async () => {
    const target = await yieldHarness.mount({ entries: [{ id: 'unknown', name: 'Unknown', chance: 100, cleared: null }], roll: 1,
      labels: { threshold: () => 'Not recorded' } });
    assert.ok(!target.querySelector('.is-cleared, .is-missed, [data-yield-cut]'));
    assert.match(target.textContent, /Not recorded/);
    yieldHarness.remount();
  });

  it('renders dense stage result identity, artwork, zero and unknown quantity without chip labels', async () => {
    stageCardHarness.remount();
    const name = 'A very long recorded component name with several words and an unbrokenSuffix'.repeat(2);
    const target = await stageCardHarness.mount({
      io: [{ kind: 'produced', label: 'Produced', items: [
        { id: 'actual', name, img: 'icons/commodities/metal/ingot-stamped-steel.webp', quantityText: '×0' },
        { id: 'unknown', name: 'Unknown material', quantityText: 'Not recorded' },
      ] }],
    });
    const rows = [...target.querySelectorAll('[data-list-row="dense"]')];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].querySelector('.fabricate-list-row-name').textContent, name);
    assert.equal(rows[0].querySelector('img').getAttribute('src'), 'icons/commodities/metal/ingot-stamped-steel.webp');
    assert.equal(rows[0].querySelector('[data-medallion]').style.width, '22px');
    assert.equal(rows[0].querySelector('.fabricate-list-row-quantity').textContent, '×0');
    assert.ok(rows[1].querySelector('[data-medallion="glyph"]'));
    assert.equal(rows[1].querySelector('.fabricate-list-row-quantity').textContent, 'Not recorded');
    assert.ok(!target.querySelector('.manager-chip, button, input'));
    stageCardHarness.remount();
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
    assert.equal(target.querySelectorAll('[data-yield-entry] [data-list-row="dense"]').length, 3);
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
    assert.equal(target.querySelectorAll('[data-list-row="dense"]').length, 1, 'empty tier never gains a result');
    assert.equal(target.querySelector('.fabricate-list-row-quantity').textContent, '×4');
    expectGeometry('OutcomeLadder', '.fab-outcome-tier', [/border-radius:\s*9px/u, /background:\s*var\(--fab-bg-2\)/u]);
  });
});
