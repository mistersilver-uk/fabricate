// Mounted coverage for RunCard: status chip + data hooks, the world-time
// countdown (waiting vs ready), the progress bar, selection styling/aria, and
// click-to-select. Uses the shared createMountedComponentHarness; every rendered
// .svelte and imported module is registered in the harness allowlist so the
// suite cannot silently hang as `# cancelled`.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness
} from '../helpers/svelte-component-harness.js';
import { makeCraftingRun } from '../helpers/journal-fixtures.js';
import { chipToneOf } from '../helpers/chipTone.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-run-card-',
  rawModules: [
    // Issue 1504/1506: the raw closure the shared `<Select>` reaches through
    // `SearchablePopover`, which the compiled `<Chip>` closure below arrives with.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
    // Issue 1506: the run's status is a `<Chip>` now, and the chip tone it wears comes from
    // the ONE map the retired status vocabularies were routed through.
    ...STATUS_TONE_RAW_MODULES
  ],
  compiledModules: [
    // Issue 1506: the journal's status pill retired into the shared chip, which this list
    // reaches through the `<Select>` closure rather than by a fourth hand-written literal.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/apps/journal/RunCard.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/journal/RunCard.svelte'
});

describe('RunCard mounted behavior', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('renders the name, status chip, and stable data hooks', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0 });
    const card = target.querySelector('.journal-run-card');
    assert.equal(card.getAttribute('data-run-id'), 'run-craft-1');
    assert.equal(card.getAttribute('data-run-type'), 'crafting');
    assert.equal(card.getAttribute('data-run-status'), 'waiting');
    assert.ok(card.textContent.includes('Healing Potion'), 'run name rendered');
    // Issue 1506: the run status is the shared chip now. `data-run-status` is restated at the CALL
    // SITE through the chip's rest spread, because it is the caller's fact rather than the
    // primitive's — and the TONE is read off the class the chip itself emits, not off a second
    // copy of the tone in a `data-*` attribute of its own.
    const chip = card.querySelector('.journal-run-status');
    assert.equal(chip.getAttribute('data-run-status'), 'waiting', 'chip carries the run status');
    assert.ok(chip.textContent.includes('Status.waiting'), 'chip renders the localized label');
    assert.equal(chipToneOf(chip), 'warning', 'a waiting run is amber');
    assert.ok(chip.classList.contains('is-list'), 'the row pill takes the list density');
  });

  it('routes the vocabulary tones the chip does NOT share through the map', async () => {
    // `ready` and `succeeded` return `tone: 'success'`, which `Chip` does not paint: it DROPS an
    // unrecognised tone with no class, no error and no other failing test, so a verbatim
    // conversion would have rendered both as untoned default chips with their green gone.
    for (const [derivedStatus, tone] of [
      ['ready', 'positive'],
      ['succeeded', 'positive'],
      ['cancelled', 'neutral'],
      ['inProgress', 'info'],
      ['failed', 'danger']
    ]) {
      const target = await harness.mount({ run: { ...makeCraftingRun(), derivedStatus }, now: 0 });
      assert.equal(
        chipToneOf(target.querySelector('.journal-run-status')),
        tone,
        `a ${derivedStatus} run wears the ${tone} chip`
      );
      harness.remount();
    }
  });

  it('shows a remaining countdown while waiting and a progress bar', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 500 });
    const countdown = target.querySelector('[data-run-countdown]');
    assert.ok(countdown.textContent.includes('Countdown.Remaining'), 'waiting card shows the remaining countdown');
    assert.ok(countdown.textContent.includes('8m 20s'), 'countdown formats availableAt - now (1000 - 500 = 500s)');
    const progress = target.querySelector('[data-run-progress]');
    assert.equal(progress.getAttribute('data-run-progress'), '50', 'progress is 50% at the halfway point');
    assert.equal(progress.getAttribute('role'), 'progressbar', 'progress bar exposes the progressbar role');
    // The reused Progress.Label key now resolves to run-neutral "Crafting progress"
    // copy (issue 734); the bar tracks the time gate, not a step count.
    assert.equal(
      progress.getAttribute('aria-label'),
      'FABRICATE.App.Journal.Progress.Label',
      'progress bar carries the localized crafting-progress aria-label'
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
