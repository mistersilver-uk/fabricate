// Mounted coverage for RunCard: status pill + data hooks, the world-time
// countdown (waiting vs ready), the progress bar, selection styling/aria, and
// click-to-select. Uses the shared createMountedComponentHarness; every rendered
// .svelte and imported module is registered in the harness allowlist so the
// suite cannot silently hang as `# cancelled`.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { makeCraftingRun } from '../helpers/journal-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-run-card-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js'
  ],
  compiledModules: [
    'src/ui/svelte/apps/journal/RunStatusPill.svelte',
    'src/ui/svelte/apps/journal/RunCard.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/journal/RunCard.svelte'
});

describe('RunCard mounted behavior', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('renders the name, status pill, and stable data hooks', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0 });
    const card = target.querySelector('.journal-run-card');
    assert.equal(card.getAttribute('data-run-id'), 'run-craft-1');
    assert.equal(card.getAttribute('data-run-type'), 'crafting');
    assert.equal(card.getAttribute('data-run-status'), 'waiting');
    assert.ok(card.textContent.includes('Healing Potion'), 'run name rendered');
    const pill = card.querySelector('.journal-status-pill');
    assert.equal(pill.getAttribute('data-run-status'), 'waiting', 'pill carries the run status');
    assert.ok(pill.textContent.includes('Status.waiting'), 'pill renders the localized waiting label');
  });

  it('shows a remaining countdown while waiting and a progress bar', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 500 });
    const countdown = target.querySelector('[data-run-countdown]');
    assert.ok(countdown.textContent.includes('Countdown.Remaining'), 'waiting card shows the remaining countdown');
    assert.ok(countdown.textContent.includes('8m 20s'), 'countdown formats availableAt - now (1000 - 500 = 500s)');
    const progress = target.querySelector('[data-run-progress]');
    assert.equal(progress.getAttribute('data-run-progress'), '50', 'progress is 50% at the halfway point');
    assert.equal(progress.getAttribute('role'), 'progressbar', 'progress bar exposes the progressbar role');
    assert.ok(
      String(progress.getAttribute('aria-label')).includes('Progress.Label'),
      'progress bar carries a localized aria-label'
    );
  });

  it('shows "ready to continue" once the gate has matured', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 2000 });
    const countdown = target.querySelector('[data-run-countdown]');
    assert.ok(
      countdown.textContent.includes('Countdown.ReadyToContinue'),
      'a matured gate reads ready, not a frozen timer'
    );
  });

  it('marks the selected card with aria-pressed and the selection class', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, selected: true });
    const card = target.querySelector('.journal-run-card');
    assert.equal(card.getAttribute('aria-pressed'), 'true');
    assert.equal(card.getAttribute('data-selected'), 'true');
    assert.ok(card.classList.contains('is-selected'), 'selected card carries the highlight class');
  });

  it('invokes onSelect with the run id on click', async () => {
    let selectedId = null;
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, onSelect: (id) => { selectedId = id; } });
    target.querySelector('.journal-run-card').click();
    assert.equal(selectedId, 'run-craft-1', 'clicking the card selects it');
  });
});
