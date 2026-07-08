import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Standalone fixture constants (NO model imports) so the mounted graph stays on
// the harness allowlist (importing a model would hang the suite as # cancelled).
const RESULT = { componentId: 'out', name: 'Vigor Elixir', img: null, quantity: 1 };
const BENCH = [{ componentId: 'emberroot', name: 'Emberroot', img: null, qty: 1 }];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alchemy-workbench-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/alchemy/Workbench.svelte'],
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
});
