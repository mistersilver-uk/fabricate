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
  PLAYER_APP_COMPILED_MODULES,
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
    // The shared primitives this tree draws, as ONE spread (issue 1514). See
    // `PLAYER_APP_COMPILED_MODULES` in the harness for why it is one roster and not a
    // list per suite.
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/components/RunProgress.svelte',
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
    // Issue 1648, D-029: the WORD is `In progress`, not `Waiting`. The projected status is still
    // carried on the hook, because the filter and the frames select on it — what merged is the
    // player-facing vocabulary, not the projection.
    assert.ok(chip.textContent.includes('Status.inProgress'), 'chip renders the merged label');
    assert.equal(chipToneOf(chip), 'info', 'an unpaused active run wears the in-progress chip');
    assert.ok(chip.classList.contains('is-list'), 'the row pill takes the list density');
  });

  // Issue 1648, D-029/M19. The maintainer's ruling: an unpaused active craft reads `In progress`
  // whether it is counting the world clock down or sitting between stages. The two badges were
  // interchangeable to read, so they become ONE badge — identical word AND identical tone AND
  // identical glyph, because two chips that merely resemble each other have not merged.
  it('gives a waiting run and an in-progress run the one merged badge', async () => {
    const seen = [];
    for (const derivedStatus of ['waiting', 'inProgress']) {
      const target = await harness.mount({ run: { ...makeCraftingRun(), derivedStatus }, now: 0 });
      const chip = target.querySelector('.journal-run-status');
      seen.push({
        status: chip.getAttribute('data-run-status'),
        text: chip.textContent.trim(),
        tone: chipToneOf(chip),
        icon: chip.querySelector('i')?.className
      });
      harness.remount();
    }
    assert.equal(seen[0].text, seen[1].text, 'one word for both');
    assert.equal(seen[0].tone, seen[1].tone, 'one tone for both');
    assert.equal(seen[0].icon, seen[1].icon, 'one glyph for both');
    assert.ok(seen[0].text.includes('Status.inProgress'), 'and the surviving word is In progress');
    assert.deepEqual(
      seen.map((entry) => entry.status),
      ['waiting', 'inProgress'],
      'the projection still distinguishes what the player is shown as one state'
    );
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
      ['waiting', 'info'],
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

  // Issue 1648, M10. An Active row must say which of the player's runs is waiting on THEM.
  // The projection's two attention states have their own chip beside the status one, which keeps
  // the countdown the status chip reports rather than replacing it.
  for (const [label, run, kind, tone] of [
    ['a choice', { awaitingChoice: true }, 'choice', 'accent'],
    ['materials', { actions: { disabledReason: 'selectionRequired' } }, 'materials', 'warning'],
  ]) {
    it(`marks an Active row waiting on ${label}`, async () => {
      const target = await harness.mount({ run: { ...makeCraftingRun(), ...run }, now: 0 });
      const chip = target.querySelector('[data-run-attention]');
      assert.equal(chip.getAttribute('data-run-attention'), kind);
      assert.equal(chipToneOf(chip), tone);
      assert.ok(chip.textContent.includes(kind === 'choice' ? 'awaitingChoice' : 'needsMaterials'));
      // The status chip is still there: what the clock is doing and what the player owes are
      // two different facts, and the row reports both.
      assert.ok(target.querySelector('.journal-run-status'));
    });
  }

  // Issue 1648, U2. The one state that needs an irreversible click had no Active-row signal at
  // all: a timed stage with every requirement met and its start untaken projects `inProgress`
  // with no gate, no attention and no notice, so under the merged badge it reads exactly like a
  // run counting down. In a list of six runs nobody could see which one was waiting for them.
  it('marks an Active row that is waiting for the player to begin it', async () => {
    const base = makeCraftingRun();
    const run = {
      ...base,
      derivedStatus: 'inProgress',
      timeGate: null,
      actions: { ...base.actions, atStageStart: true, beginStep: true, disabledReason: 'stageNotStarted' }
    };
    const target = await harness.mount({ run, now: 0 });
    const chip = target.querySelector('[data-run-attention]');
    assert.equal(chip.getAttribute('data-run-attention'), 'start');
    assert.equal(chipToneOf(chip), 'accent', 'the "your move" family, not the blocked one');
    assert.ok(chip.textContent.includes('readyToBegin'));
    assert.ok(target.querySelector('.journal-run-status'), 'beside the status, never instead of it');
  });

  // The chip reads the projection's own "`beginVersionedStage` would commit this" answer, so it
  // cannot invite a click the command refuses: a stage still short of its materials keeps the
  // blocked chip it already had.
  it('does not invite a begin the command would refuse', async () => {
    const base = makeCraftingRun();
    const run = {
      ...base,
      derivedStatus: 'inProgress',
      timeGate: null,
      actions: { ...base.actions, atStageStart: true, beginStep: false, disabledReason: 'selectionRequired' }
    };
    const target = await harness.mount({ run, now: 0 });
    assert.equal(target.querySelector('[data-run-attention]').dataset.runAttention, 'materials');
  });

  it('claims nothing of the player on a row that is merely counting down', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0 });
    assert.ok(target.querySelector('.journal-run-status'), 'the row rendered');
    assert.ok(!target.querySelector('[data-run-attention]'), 'the same hook finds nothing here');
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

  // Issue 1648, M18. Between its stages a multi-step run holds no `timeGate`, and the whole
  // timing block was suppressed on that predicate — so `Minor Elixir of Mending`, step 2 of 3,
  // showed nothing where `Build Round Shield` showed a bar. Once both wear one badge (D-029)
  // the bar is the ONLY thing left on the row separating a run counting down from one waiting
  // on the player, so it has to survive. It reads completed stages over total, with the current
  // stage at zero, because that is how far through the run actually is.
  it('keeps a progress reading on a multi-step run between its stages', async () => {
    const base = makeCraftingRun();
    const run = {
      ...base,
      derivedStatus: 'inProgress',
      timeGate: null,
      stepIndex: 1,
      steps: [
        { ...base.steps[0], status: 'succeeded', timeGate: null },
        { ...base.steps[1], status: 'inProgress' }
      ],
      currentStep: null
    };
    const target = await harness.mount({ run, now: 0 });
    const progress = target.querySelector('[data-run-progress]');
    assert.ok(progress, 'the bar survives a stage with no clock');
    // Issue 1648, UX2-5. The accessible value states what the TRACKS draw. `progress` is null
    // with no gate, so publishing the clock fraction told a screen-reader user "Progress, 0"
    // beside a filled track; `.fab-run-progress-tracks` is `aria-hidden`, so there was no second
    // reading to correct it.
    assert.equal(progress.getAttribute('aria-valuenow'), '50', 'one of two stages is complete');
    const tracks = [...target.querySelectorAll('[data-run-progress-track]')];
    assert.equal(tracks.length, 2, 'one track per authored stage');
    assert.deepEqual(
      tracks.map((track) => track.dataset.stageProgressState),
      ['success', 'accent'],
      'the finished stage reads done and the unbegun one reads current'
    );
    // A countdown needs a deadline and this stage has none. `None` is the string a MATURED wait
    // prints, so the row says nothing about time rather than something false.
    assert.ok(!target.querySelector('[data-run-countdown]'), 'and invents no countdown for it');
  });

  it('draws no stage rail for a run that has no stages at all', async () => {
    // Gathering and salvage project `steps: []`. A lone empty track would assert a sequence the
    // run does not have, so the whole timing block stays suppressed for them.
    const target = await harness.mount({
      run: { ...makeCraftingRun(), derivedStatus: 'inProgress', timeGate: null, steps: [], currentStep: null },
      now: 0
    });
    assert.ok(!target.querySelector('[data-run-progress]'));
    assert.ok(!target.querySelector('.journal-run-card-timing'));
  });

  // Issue 1648, UX2-6. M18 asked for the rail BETWEEN the stages of a multi-step run, and the
  // predicate's own comment scopes the no-sequence case correctly. A single-stage craft is the
  // same lone empty track, asserting a 0% where progress has no meaning: the maintainer's own
  // unstarted single-step runs are exactly this shape.
  it('draws no stage rail for an unstarted SINGLE-stage run', async () => {
    const base = makeCraftingRun();
    const target = await harness.mount({
      run: {
        ...base,
        derivedStatus: 'inProgress',
        timeGate: null,
        stepIndex: 0,
        steps: [{ ...base.steps[0], status: 'inProgress', timeGate: null }],
        currentStep: null
      },
      now: 0
    });
    assert.ok(!target.querySelector('[data-run-progress]'), 'no lone empty track');
    assert.ok(!target.querySelector('.journal-run-card-timing'), 'and no timing block around it');
  });

  // The gated single-stage run keeps its bar: there the fraction is a CLOCK reading, which is
  // meaningful whatever the stage count. Without this the fix above would take the countdown's
  // own bar away with it.
  it('keeps the clock bar on a single-stage run that IS counting down', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 500 });
    const progress = target.querySelector('[data-run-progress]');
    assert.ok(progress, 'a gated run still reports its clock');
    assert.equal(progress.getAttribute('aria-valuenow'), '50');
  });

  it('marks the selected card with aria-pressed and the selection class', async () => {
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, selected: true });
    const card = target.querySelector('.journal-run-card');
    assert.equal(card.getAttribute('aria-pressed'), 'true');
    assert.equal(card.getAttribute('data-selected'), 'true');
    assert.ok(card.classList.contains('is-selected'), 'selected card carries the highlight class');
  });

  it('freezes paused countdown and progress after the old gate deadline', async () => {
    for (const now of [500, 5000]) {
      const run = makeCraftingRun({ derivedStatus: 'paused', pauseState: { pausedAt: 500, remainingSeconds: 500 } });
      const target = await harness.mount({ run, now });
      assert.match(target.querySelector('[data-run-countdown]').textContent, /8m 20s/);
      assert.doesNotMatch(target.querySelector('[data-run-countdown]').textContent, /ReadyTo/);
      assert.equal(target.querySelector('[data-run-progress]').getAttribute('data-run-progress'), '50');
      harness.remount();
    }
  });

  it('invokes onSelect with the composite-identity run on click', async () => {
    let selectedId = null;
    const target = await harness.mount({ run: makeCraftingRun(), now: 0, onSelect: (id) => { selectedId = id; } });
    target.querySelector('.journal-run-card').click();
    assert.equal(selectedId.id, 'run-craft-1', 'clicking the card selects the native run object');
  });
});
