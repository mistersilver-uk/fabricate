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
import { forceTrigger, MARGIN_NOTES, readReadout } from '../helpers/checkReadoutDom.js';

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
    assert.deepEqual(readReadout(root), {
      medallion: ['2', 'net'],
      breakdown: '4 qualified − 2 cancelled = 2 net · Idrin',
      total: '2',
      line: ['needs 2 · margin +0', 'margin'],
      card: ['success', 'Success', 'The recipe’s result group is produced'],
      note: MARGIN_NOTES.count,
      rows: [['result-group', 'Result group produced', 'Success']],
    });
    // The tiles sit in their own component under the medallion row, the #2006 seam.
    assert.ok(Boolean(readout.querySelector('.manager-checks-simulator-head + .manager-checks-simulator-dice')));
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
      'Vosk is missing a value this check reads (@skills.smith.rank), so it cannot resolve for them.'
    );
    assert.equal(rollButton(root).disabled, true);
    const notice = root.querySelector('[data-checks-section-notice="countPathUnresolvedForPreview"]');
    assert.ok(Boolean(notice), 'the roll section opens with a notice explaining the warning');
    assert.equal(notice.dataset.noticeTone, 'warning', 'amber, as frame 19 draws it');
    assert.equal(
      notice.querySelector('.fab-notice-title').textContent.trim(),
      'A character path does not resolve'
    );
    assert.match(
      notice.querySelector('.fab-notice-detail').textContent,
      /IssueCountPathUnresolvedForPreview:\{"actor":"Vosk","path":"@skills\.smith\.rank"\}/u,
      'the detail is the Validation sentence, naming the actor and the path'
    );
    const panel = root.querySelector('[role="tabpanel"]');
    assert.ok(panel.firstElementChild.matches('[data-checks-section-notices="roll"]'), 'it opens the pane');
    notice.querySelector('[data-notice-action]').click();
    await settle();
    assert.ok(root.ownerDocument.activeElement === panel, 'no count control exists yet, so Review focuses the section');
    assert.equal(dots(), before, 'a transient warning puts no dot on a section');
  });

  it('says why a pool above the dice Foundry rolls at once is not charted', async () => {
    script([]);
    const root = await mountSimple({ ...SMITHING, evaluation: pool({ base: '1000', required: 1 }), tiers: [] });
    assert.equal(odds(root).dataset.checksOddsReason, 'pool-too-large');
    assert.equal(
      odds(root).textContent.trim(),
      'This pool is more dice than Foundry can roll at once, so there is nothing to chart.'
    );
  });

  it('fails a zero pool without a tile or a Roll', async () => {
    const counted = script([]);
    const root = await mountSimple({
      ...SMITHING,
      evaluation: pool({ base: '0', required: 1, zeroPoolFails: true }),
      tiers: [],
    });
    await roll(root);
    assert.deepEqual(readReadout(root), {
      medallion: ['0', 'net'],
      breakdown: 'pool reduced to 0',
      total: '0',
      line: ['needs 1 · margin −1', 'margin'],
      card: ['failure', 'Failure', 'Nothing is produced'],
      note: ['zero-pool', 'The pool was reduced to zero, so the check fails automatically.'],
      rows: [['failure-result', 'Failure policy applies', 'per recipe']],
    });
    assert.ok(!root.querySelector('[data-checks-simulator-face]'), 'no tile');
    assert.ok(!root.querySelector('[data-checks-simulator-legend]'), 'and no legend');
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
    assert.deepEqual(readReadout(root), {
      medallion: ['−3', 'net'],
      breakdown: '0 qualified − 3 cancelled = −3 net',
      total: '−3',
      line: ['needs 1 · a net below zero is a botch', 'botch'],
      card: ['failure', 'Botch', 'Net below zero'],
      note: null,
      rows: [['failure-result', 'Failure policy applies', 'per recipe']],
    });
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

describe('the count readout per outcome (issue 2080)', () => {
  const BOTCHING = pool({
    die: 6,
    base: '3',
    threshold: '7',
    required: 1,
    cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
  });
  const ROUTED_COUNT = {
    rollFormula: '',
    dc: 0,
    type: 'relative',
    thresholdMode: 'meet',
    evaluation: SMITHING.evaluation,
    relativeOutcomes: [
      { id: 'ruined', name: 'Ruined', dc: -1, success: false },
      { id: 'success', name: 'Success', dc: 0, success: true },
      { id: 'fine', name: 'Fine', dc: 1, success: true },
      { id: 'masterwork', name: 'Masterwork', dc: 3, success: true },
    ],
    checkBreakage: { triggers: [] },
    tiers: [],
  };
  const mountRouted = (check) =>
    harness.mount({
      activity: 'crafting',
      resolutionMode: 'routedByCheck',
      craftingCheck: check,
      activation: { crafting: { enabled: true, optional: false } },
      features: { salvage: true },
    });
  const rolled = async (root, actor = 'idrin') => {
    if (actor) await choosePreviewActor(root, actor);
    await roll(root);
    return readReadout(root);
  };

  it('fails short of the count with no botch', async () => {
    script([8, 3, 4, 5, 6, 2]);
    const root = await mountSimple(SMITHING);
    const readout = await rolled(root);
    assert.deepEqual([readout.medallion, readout.line, readout.card, readout.note], [
      ['1', 'net'],
      ['needs 2 · margin −1', 'margin'],
      ['failure', 'Failure', 'Nothing is produced'],
      MARGIN_NOTES.count,
    ]);
    assert.ok(!root.querySelector('[data-checks-simulator-botch]'), 'a net of 1 is no botch');
  });

  it('names the routed tier the net lands on', async () => {
    script([8, 9, 9, 3, 4, 5]);
    const readout = await rolled(await mountRouted(ROUTED_COUNT));
    assert.deepEqual([readout.line, readout.card, readout.rows], [
      ['needs 2 · margin +1', 'margin'],
      ['success', 'Fine', 'The recipe’s result group is produced'],
      [['result-group', 'Result group produced', 'Fine']],
    ]);
  });

  it('notes a routed count a trigger forced, in place of the margin note (M17b)', async () => {
    script([8, 9, 9, 3, 4, 5]);
    const check = { ...ROUTED_COUNT, checkBreakage: { triggers: [forceTrigger('failure')] } };
    const readout = await rolled(await mountRouted(check));
    assert.deepEqual([readout.card[1], readout.note], [
      'Ruined',
      ['forced', 'Trigger fired — forced to the worst failing tier.'],
    ]);
  });

  it('reads a routed botch a trigger rescued against the required count (ruling 3)', async () => {
    script([2, 4, 6]);
    const check = {
      ...ROUTED_COUNT,
      evaluation: BOTCHING,
      relativeOutcomes: [
        { id: 'failure', name: 'Failure', dc: -1, success: false },
        { id: 'success', name: 'Success', dc: 0, success: true },
      ],
      checkBreakage: { triggers: [forceTrigger('success')] },
    };
    const readout = await rolled(await mountRouted(check), null);
    assert.deepEqual([readout.total, readout.line, readout.card[1]], [
      '−3',
      ['needs 1 · margin −4', 'margin'],
      'Success',
    ]);
  });

  it('reads a botch a trigger rescued as a success on the normal margin line (M8, M17b)', async () => {
    script([2, 4, 6]);
    const rescued = { ...SMITHING, evaluation: BOTCHING, tiers: [] };
    const root = await mountSimple({ ...rescued, checkBreakage: { triggers: [forceTrigger('success')] } });
    const readout = await rolled(root, null);
    assert.ok(root.querySelector('[data-checks-simulator-readout][data-checks-simulator-botch]'), 'still a net below zero');
    assert.deepEqual([readout.total, readout.line, readout.card, readout.note], [
      '−3',
      ['needs 1 · margin −4', 'margin'],
      ['success', 'Success', 'The recipe’s result group is produced'],
      ['forced', 'Trigger fired — automatic success.'],
    ]);
  });

  it('spends a progressive net down the sandbox order (R8)', async () => {
    script([8, 9, 3, 4, 5, 6]);
    const root = await harness.mount({
      activity: 'crafting',
      resolutionMode: 'progressive',
      craftingCheckProgressive: {
        awardMode: 'equal',
        rollFormula: '',
        evaluation: pool({ base: '6', required: undefined }),
        checkBreakage: { triggers: [] },
        preview: { difficulties: [1, 1, 2] },
      },
      activation: { crafting: { enabled: true, optional: false } },
      features: { salvage: true },
    });
    assert.deepEqual(await rolled(root, null), {
      medallion: ['2', 'net'],
      breakdown: '2 qualified − 0 cancelled = 2 net',
      total: '2',
      line: ['value spent', ''],
      card: ['success', '2 of 3 awarded', 'The value is fully spent'],
      note: null,
      rows: [
        ['result-1', 'Result 1', 'awarded'],
        ['result-2', 'Result 2', 'awarded'],
      ],
    });
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
      assert.ok(root.querySelector(`[data-checks-section-notice="${id}"]`), `${id} is explained`);
      assert.ok(!root.querySelector(`[data-checks-section-callout="${id}"]`), `${id} is a notice, not a callout`);
    }
    assert.ok(!root.querySelector('[data-checks-section-callout="noRollFormula"]'));
    assert.ok(!root.querySelector('[data-checks-section-notice="noRollFormula"]'));
  });
});
