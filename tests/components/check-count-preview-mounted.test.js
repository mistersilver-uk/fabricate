/** The Checks Studio's success-counting preview, odds and readiness, MOUNTED (issue 2004). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from 'svelte';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
  CHECKS_TREE_COMPILED_MODULES,
} from '../helpers/checksHarnessModules.js';
import { installCountDice } from '../helpers/countEngineDice.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-count-preview-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  // The tree's own list is spread by name: the primitive allowlist guard reads one spread deep.
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    ...CHECK_EDITOR_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/checks/CheckModeCallout.svelte',
    'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
});

const WORLD_ACTORS = [
  {
    id: 'idrin',
    name: 'Idrin',
    type: 'character',
    getRollData: () => ({ skills: { smith: { rank: 4 } } }),
  },
  { id: 'vosk', name: 'Vosk', type: 'character', getRollData: () => ({ skills: {} }) },
];

const BEST = { enabled: true, faces: { kind: 'best' } };
const WORST = { enabled: true, faces: { kind: 'worst' } };
const pool = (overrides, direction = 'over') => ({
  product: 'count',
  direction,
  pool: { die: 10, threshold: '8', required: 2, ...overrides },
});

/** The lab's smithing check: Idrin's six d10s at 8 or better, tens exploding and ones cancelling. */
const SMITHING = {
  rollFormula: '',
  dc: 14,
  thresholdMode: 'meet',
  dcMode: 'static',
  evaluation: pool({ base: '@skills.smith.rank + 2', explode: BEST, cancel: WORST }),
  checkBreakage: { triggers: [] },
  tiers: [
    { id: 'simple', name: 'Simple Work', dc: 10, successes: 1 },
    { id: 'master', name: 'Masterwork', dc: 20, successes: 4 },
  ],
};

let dice;

before(async () => {
  await harness.setup();
  globalThis.game.actors = {
    contents: WORLD_ACTORS,
    get: (id) => WORLD_ACTORS.find((actor) => actor.id === id),
  };
});
after(() => harness.teardown());
afterEach(() => {
  dice?.restore();
  dice = null;
  harness.remount();
});

/** Script the dice the next roll shows, through the core-faithful double. */
function script(faces) {
  dice?.restore();
  dice = installCountDice({ faces, chat: false });
  return dice;
}

async function mountSimple(check, props = {}) {
  return harness.mount({
    activity: 'crafting',
    resolutionMode: 'simple',
    craftingCheckSimple: check,
    activation: { crafting: { enabled: true, optional: false } },
    features: { salvage: true },
    ...props,
  });
}

async function settle() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

async function choosePreviewActor(root, actorId) {
  root.querySelector('[data-checks-preview-actor]').click();
  await settle();
  const option = root.querySelector(`[data-popover-option="${actorId}"]`);
  assert.ok(Boolean(option), `the picker offers "${actorId}"`);
  option.click();
  await settle();
}

async function roll(root, done = '[data-checks-simulator-readout], [data-checks-simulator-note="zero-pool"]') {
  root.querySelector('[data-checks-simulator-roll]').click();
  for (let attempt = 0; attempt < 12 && !root.querySelector(done); attempt += 1) await settle();
}

const odds = (root) => root.querySelector('[data-checks-odds-state]');
const rollButton = (root) => root.querySelector('[data-checks-simulator-roll]');
const oddsRows = (root) =>
  [...root.querySelectorAll('[data-checks-odds-percent]')].map((cell) => [
    cell.dataset.checksOddsPercent,
    cell.textContent.trim(),
  ]);

describe('count odds and the simulator readout', () => {
  it('charts outcomes with a Botch split, and heads the panel with the expected net', async () => {
    script([]);
    const root = await mountSimple(SMITHING);
    await choosePreviewActor(root, 'idrin');
    assert.equal(odds(root).dataset.checksOddsProduct, 'count');
    assert.deepEqual(oddsRows(root), [
      ['botch', '12.2%'],
      ['failure', '43.5%'],
      ['success', '44.4%'],
    ]);
    const domain = root.querySelector('[data-checks-odds-domain]');
    assert.equal(domain.textContent.trim(), 'nearly exact · expected 1.33');
    assert.equal(domain.dataset.checksOddsExpected, '1.33');
    assert.equal(
      root.querySelector('[data-checks-digest-row="formula"]').textContent.trim(),
      'Roll · (@skills.smith.rank + 2)d10 · each ≥ 8',
      'the retained formula is inert on the digest too'
    );
  });

  it('rolls one tile per face, marked, and states the net, required and margin the runner executed', async () => {
    script([8, 10, 1, 3, 9, 2, 10, 1]);
    const root = await mountSimple(SMITHING);
    await choosePreviewActor(root, 'idrin');
    await roll(root);
    const readout = root.querySelector('[data-checks-simulator-readout]');
    assert.equal(readout.dataset.checksSimulatorProduct, 'count');
    const tiles = [...readout.querySelectorAll('[data-checks-simulator-face]')];
    assert.deepEqual(
      tiles.map((tile) => [tile.textContent.trim(), tile.dataset.checksSimulatorFaceMarks]),
      [
        ['8', 'qualified'],
        ['10', 'qualified exploded'],
        ['1', 'cancelled'],
        ['3', ''],
        ['9', 'qualified'],
        ['2', ''],
        ['10', 'qualified exploded'],
        ['1', 'cancelled'],
      ]
    );
    assert.equal(tiles[1].getAttribute('aria-label'), '10, qualified and exploded');
    assert.equal(tiles[1].querySelectorAll('i.fa-check, i.fa-rotate').length, 2, 'a glyph per mark');
    assert.equal(readout.querySelector('[data-checks-simulator-total]').dataset.checksSimulatorTotal, '2');
    assert.equal(
      readout.querySelector('[data-checks-simulator-breakdown]').textContent.trim(),
      '4 qualified − 2 cancelled = 2 net'
    );
    assert.equal(
      readout.querySelector('[data-checks-simulator-margin]').textContent.trim(),
      '2 needed · margin +0'
    );
    // The tile's tone is the face's result: success for a qualifier, danger for a cancel.
    const tone = (tile) => tile.querySelector('.fab-medallion').className;
    assert.match(tone(tiles[0]), /is-tone-success/);
    assert.match(tone(tiles[2]), /is-tone-danger/);
    assert.doesNotMatch(tone(tiles[3]), /is-tone-/, 'a face that did nothing is untoned');
    assert.ok(root.querySelector('[data-checks-simulator-legend]'));
    assert.equal(root.querySelector('[data-checks-simulator-band]').dataset.checksSimulatorBand, 'success');
  });

  it('abstains with no actor, and drops a result when the actor is cleared', async () => {
    script([8, 9, 9, 9, 9, 9]);
    const root = await mountSimple(SMITHING);
    assert.equal(odds(root).dataset.checksOddsReason, 'needs-preview-actor');
    assert.equal(rollButton(root).disabled, true);
    await choosePreviewActor(root, 'idrin');
    await roll(root);
    assert.ok(root.querySelector('[data-checks-simulator-readout]'));
    await choosePreviewActor(root, 'no-actor');
    assert.ok(!root.querySelector('[data-checks-simulator-readout]'), 'the result is dropped');
    assert.ok(root.querySelector('[data-checks-simulator-state="needs-preview-actor"]'));
    assert.equal(rollButton(root).disabled, true);
  });

  it('names the actor lacking a path, disables Roll and changes no dot', async () => {
    script([]);
    const root = await mountSimple(SMITHING);
    const dots = () => root.querySelectorAll('[data-checks-section-dot]').length;
    const before = dots();
    await choosePreviewActor(root, 'vosk');
    assert.equal(odds(root).dataset.checksOddsReason, 'count-path-unresolved');
    assert.equal(
      odds(root).textContent.trim(),
      'Vosk has no value at @skills.smith.rank, so there is nothing to chart for them.'
    );
    assert.equal(rollButton(root).disabled, true);
    const callout = root.querySelector(
      '[data-checks-section-callout="countPathUnresolvedForPreview"]'
    );
    assert.ok(Boolean(callout), 'the roll section explains the warning');
    assert.equal(dots(), before, 'a transient warning puts no dot on a section');
  });

  it('fails a zero pool without a tile or a Roll', async () => {
    const counted = script([]);
    const root = await mountSimple({
      ...SMITHING,
      evaluation: pool({ base: '0', required: 1, zeroPoolFails: true }),
      tiers: [],
    });
    await roll(root);
    assert.ok(root.querySelector('[data-checks-simulator-note="zero-pool"]'));
    assert.equal(root.querySelector('[data-checks-simulator-band]').dataset.checksSimulatorBand, 'failure');
    assert.ok(!root.querySelector('[data-checks-simulator-face]'), 'no tile');
    assert.equal(counted.constructed.length, 0, 'no Roll was constructed');
  });

  it('marks a botch on the readout, with the true minus', async () => {
    script([2, 4, 6]);
    const root = await mountSimple({
      ...SMITHING,
      evaluation: pool({
        die: 6,
        base: '3',
        threshold: '7',
        required: 1,
        cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
      }),
      tiers: [],
    });
    assert.equal(odds(root).querySelector('[data-checks-odds-row]').dataset.checksOddsRow, 'botch');
    await roll(root);
    const readout = root.querySelector('[data-checks-simulator-readout][data-checks-simulator-botch]');
    assert.ok(Boolean(readout), 'the readout is marked a botch');
    const total = readout.querySelector('[data-checks-simulator-total]');
    assert.equal(total.dataset.checksSimulatorTotal, '-3');
    assert.equal(total.textContent.trim(), '−3');
    assert.match(root.querySelector('[data-checks-simulator-band]').textContent, /Botched/);
    assert.equal(
      root.querySelector('[data-checks-simulator-band-name]').textContent.trim(),
      'Botch'
    );
  });

  it('states that a dynamic required count is not previewed by running its macro', async () => {
    script([]);
    const root = await mountSimple({ ...SMITHING, dcMode: 'dynamic' });
    assert.ok(root.querySelector('[data-checks-simulator-note="dynamic-required"]'));
  });

  it('labels each preview record by its successes needed', async () => {
    script([]);
    const root = await mountSimple(SMITHING);
    const trigger = root.querySelector('[data-checks-preview-record]');
    trigger.click();
    await settle();
    const labels = [...document.querySelectorAll('[role="option"]')].map((option) =>
      option.textContent.trim()
    );
    assert.deepEqual(labels.slice(0, 3), [
      'Default · 2 successes',
      'Simple Work · 1 success',
      'Masterwork · 4 successes',
    ]);
  });
});

describe('count readiness on the route', () => {
  it('explains the pool faults in the roll section', async () => {
    script([]);
    const root = await mountSimple({
      ...SMITHING,
      evaluation: pool({ base: '2', threshold: '1d4 + 6', required: 3 }),
      tiers: [{ id: 'unset', name: 'Unset Work', dc: 12, successes: null }],
    });
    for (const id of ['countThresholdInvalid', 'countTierWithoutSuccesses', 'countRequiredExceedsMaxPool']) {
      assert.ok(root.querySelector(`[data-checks-section-callout="${id}"]`), `${id} is explained`);
    }
    assert.ok(!root.querySelector('[data-checks-section-callout="noRollFormula"]'));
  });
});
