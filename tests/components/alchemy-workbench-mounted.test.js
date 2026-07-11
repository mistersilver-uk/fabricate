import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Standalone fixture constants (NO model imports) so the mounted graph stays on
// the harness allowlist (importing a model would hang the suite as # cancelled).
const ESSENCES = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }];
const RESULT = { componentId: 'out', name: 'Vigor Elixir', img: null, quantity: 1, essences: ESSENCES };
const BENCH = [{ componentId: 'emberroot', name: 'Emberroot', img: null, qty: 1 }];
const BENCH_WITH_ESSENCES = [
  { componentId: 'emberroot', name: 'Emberroot', img: null, qty: 2, essences: ESSENCES }
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alchemy-workbench-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
    'src/ui/svelte/apps/alchemy/Workbench.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/alchemy/Workbench.svelte'
});

function brewButton(target) {
  return target.querySelector('[data-alchemy-brew]');
}
function statusPill(target) {
  return target.querySelector('[data-alchemy-status]');
}

describe('Workbench (mounted)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('empty mode: status pill reflects empty and Brew is disabled', async () => {
    const target = await harness.mount({ mode: 'empty', benchEmpty: true });
    assert.match(statusPill(target).getAttribute('data-alchemy-status'), /empty/);
    assert.equal(brewButton(target).disabled, true, 'empty mode disables Brew');
  });

  it('ready mode: status names the target and Brew is enabled', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'Elixir of Vigor',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true
    });
    assert.equal(statusPill(target).getAttribute('data-alchemy-status'), 'ready');
    assert.ok(statusPill(target).textContent.includes('Elixir of Vigor'), 'status names the ready recipe');
    assert.equal(brewButton(target).disabled, false, 'ready mode enables Brew');
    assert.equal(target.querySelector('[data-alchemy-status]').getAttribute('aria-live'), 'polite');
  });

  it('assembling mode: Brew is disabled (mid-build)', async () => {
    const target = await harness.mount({
      mode: 'assembling',
      targetName: 'Elixir of Vigor',
      benchEmpty: false,
      benchChips: BENCH,
      brewEnabled: false
    });
    assert.equal(brewButton(target).disabled, true);
  });

  it('untried mode: Brew is enabled and no undiscovered recipe identity is rendered', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      brewEnabled: true
    });
    assert.equal(brewButton(target).disabled, false, 'untried can experiment');
    // The untried Produces panel must NOT confirm a reaction or name any hidden
    // recipe/result — only its own props are ever rendered.
    const html = target.innerHTML;
    assert.ok(!html.includes('SECRET_UNDISCOVERED'), 'no undiscovered recipe name leaks');
    assert.ok(!html.includes('Vigor Elixir'), 'no result is shown for an untried bench');
    assert.ok(target.querySelector('[data-alchemy-unknown]'), 'the neutral unknown-outcome card is shown');
  });

  it('brew-in-flight disables Brew even when the mode would enable it', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'X',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true,
      brewInFlight: true
    });
    assert.equal(brewButton(target).disabled, true, 'in-flight guard blocks double-submit');
  });

  // -------------------------------------------------------------------------
  // D — chip interaction event hit-tests (add / remove-one / remove-all)
  // -------------------------------------------------------------------------

  function mountChip(calls) {
    return harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      onAdd: (id) => calls.push(['add', id]),
      onRemoveOne: (id) => calls.push(['removeOne', id]),
      onRemoveAll: (id) => calls.push(['removeAll', id])
    });
  }

  it('chip body left-click ADDS one', async () => {
    const calls = [];
    const target = await mountChip(calls);
    target.querySelector('[data-alchemy-chip="emberroot"]').click();
    assert.deepEqual(calls, [['add', 'emberroot']]);
  });

  it('chip body Enter ADDS one; Shift+Enter REMOVES one', async () => {
    const calls = [];
    const target = await mountChip(calls);
    const chip = target.querySelector('[data-alchemy-chip="emberroot"]');
    chip.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chip.dispatchEvent(
      new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
    );
    assert.deepEqual(calls, [['add', 'emberroot'], ['removeOne', 'emberroot']]);
  });

  it('chip right-click (contextmenu) REMOVES one', async () => {
    const calls = [];
    const target = await mountChip(calls);
    const chip = target.querySelector('[data-alchemy-chip="emberroot"]');
    chip.dispatchEvent(new globalThis.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    assert.deepEqual(calls, [['removeOne', 'emberroot']]);
  });

  it('the `−` control REMOVES one and does NOT also add (stopPropagation)', async () => {
    const calls = [];
    const target = await mountChip(calls);
    target.querySelector('[data-alchemy-chip-remove-one="emberroot"]').click();
    assert.deepEqual(calls, [['removeOne', 'emberroot']], 'no add fires from the − control');
  });

  it('the `×` control REMOVES all and does NOT also add (stopPropagation)', async () => {
    const calls = [];
    const target = await mountChip(calls);
    target.querySelector('[data-alchemy-chip-remove="emberroot"]').click();
    assert.deepEqual(calls, [['removeAll', 'emberroot']], 'the × removes all and never adds');
  });

  it('Enter on the focused `×` REMOVES all and does NOT bubble to the chip-body add', async () => {
    // Regression: without the target===currentTarget guard, an Enter keydown from a
    // focused nested button bubbles to the chip-body handler, which preventDefaults
    // the button's native activation and fires onAdd — so Enter on × would ADD.
    const calls = [];
    const target = await mountChip(calls);
    const removeAll = target.querySelector('[data-alchemy-chip-remove="emberroot"]');
    // A real activation dispatches keydown (bubbling) AND the native click; the
    // guard must let the click through while ignoring the bubbled keydown.
    removeAll.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    removeAll.click();
    assert.deepEqual(calls, [['removeAll', 'emberroot']], 'Enter on × removes all and never adds');
  });

  it('Enter on the focused `−` REMOVES one and does NOT bubble to the chip-body add', async () => {
    const calls = [];
    const target = await mountChip(calls);
    const removeOne = target.querySelector('[data-alchemy-chip-remove-one="emberroot"]');
    removeOne.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    removeOne.click();
    assert.deepEqual(calls, [['removeOne', 'emberroot']], 'Enter on − removes one and never adds');
  });

  it('renders essence icons + counts on a bench chip carrying essences', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH_WITH_ESSENCES
    });
    const chip = target.querySelector('[data-alchemy-chip="emberroot"]');
    const essence = chip.querySelector('[data-alchemy-essence="fire"]');
    assert.ok(essence, 'the essence chip renders on the bench chip');
    assert.ok(essence.querySelector('i.fa-fire'), 'the essence icon renders');
    assert.ok(essence.textContent.includes('×2'), 'the per-unit essence count renders');
  });

  // The aggregate readout is the only progress signal an essence-authored recipe
  // gets (no `concrete` multiset -> resolution fails safe to `untried`).
  it('renders the aggregate essence readout under the bench signature', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      signatureText: 'Emberroot ×2',
      benchEssences: [
        { id: 'toxic', name: 'Toxic', icon: 'fas fa-skull', quantity: 4 },
        { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 }
      ]
    });
    const readout = target.querySelector('[data-alchemy-bench-essences]');
    assert.ok(readout, 'the aggregate essence readout renders');
    const toxic = readout.querySelector('[data-alchemy-essence="toxic"]');
    assert.ok(toxic.querySelector('i.fa-skull'), 'the aggregate essence icon renders');
    assert.ok(toxic.textContent.includes('×4'), 'the summed essence total renders');
    assert.ok(
      readout.querySelector('[data-alchemy-essence="water"]').textContent.includes('×1'),
      'every aggregated essence renders'
    );
  });

  it('omits the aggregate essence readout when the bench carries no essences', async () => {
    const target = await harness.mount({
      mode: 'untried',
      benchEmpty: false,
      benchChips: BENCH,
      benchEssences: []
    });
    assert.equal(
      target.querySelector('[data-alchemy-bench-essences]'),
      null,
      'no readout for an essence-less bench'
    );
  });

  it('renders essence icons + counts on the Produces result card', async () => {
    const target = await harness.mount({
      mode: 'ready',
      targetName: 'Elixir',
      benchEmpty: false,
      benchChips: BENCH,
      result: RESULT,
      brewEnabled: true
    });
    const essence = target.querySelector('[data-alchemy-result] [data-alchemy-essence="fire"]');
    assert.ok(essence, 'the Produces result surfaces essence chips');
    assert.ok(essence.textContent.includes('×2'));
  });
});
