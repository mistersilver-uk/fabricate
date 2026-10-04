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
import { renderDiceTilesHtml, tileModel } from '../../src/ui/presenters/countDiceTiles.js';

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

/** The executed smithing roll as the count Roll projects it: 8 10 1 3 9 2, then 10 and 1. */
const SMITHING_PROJECTION = {
  results: [
    { index: 0, face: 8, qualified: true },
    { index: 1, face: 10, qualified: true, exploded: true },
    { index: 2, face: 1, cancelled: true },
    { index: 3, face: 3 },
    { index: 4, face: 9, qualified: true },
    { index: 5, face: 2 },
    { index: 6, face: 10, qualified: true, exploded: true, explodedFrom: 1 },
    { index: 7, face: 1, cancelled: true, explodedFrom: 6 },
  ],
};

const tileFacts = (tile, face, marks) => [
  face,
  marks,
  tile.hasAttribute('data-dice-tile-generated'),
  tile.getAttribute('aria-label'),
];
const simulatorTile = (tile) =>
  tileFacts(tile, tile.dataset.checksSimulatorFace, tile.dataset.checksSimulatorFaceMarks);

/** The tiles the chat renderer writes for a projection, read as the simulator's are. */
function chatTiles(projection) {
  const host = document.createElement('div');
  host.innerHTML = renderDiceTilesHtml(tileModel(projection), (key) => key);
  return [...host.querySelectorAll('.fabricate-dice-tiles__tile')].map((tile) =>
    tileFacts(tile, tile.dataset.diceTileFace, tile.dataset.diceTileMarks)
  );
}

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
    // Each explosion's die follows the die that rolled it, as the result card draws it (issue 2006).
    assert.deepEqual(
      tiles.map((tile) => [tile.textContent.trim(), tile.dataset.checksSimulatorFaceMarks]),
      [
        ['8', 'qualified'],
        ['10', 'qualified exploded'],
        ['10', 'qualified exploded'],
        ['1', 'cancelled'],
        ['1', 'cancelled'],
        ['3', ''],
        ['9', 'qualified'],
        ['2', ''],
      ]
    );
    assert.equal(tiles[1].getAttribute('aria-label'), '10, qualified and exploded');
    assert.equal(tiles[2].getAttribute('aria-label'), '10, qualified, exploded and rolled by an explosion');
    assert.equal(tiles[1].querySelectorAll('i.fa-check, i.fa-rotate').length, 2, 'a glyph per mark');
    assert.deepEqual(
      tiles.map(simulatorTile),
      chatTiles(SMITHING_PROJECTION),
      'the simulator draws the tiles the result card renders for the same projection (N29)'
    );
    assert.equal(readout.querySelector('[data-checks-simulator-total]').dataset.checksSimulatorTotal, '2');
    assert.deepEqual(readReadout(root), {
      medallion: ['2', 'net'],
      breakdown: '4 qualified − 2 cancelled = 2 net · Idrin',
      total: '2',
      line: ['needs 2 · margin +0', 'margin'],
      card: ['success', 'Success', 'The recipe’s result set is produced'],
      note: MARGIN_NOTES.count,
      rows: [['result-group', 'Result set produced', 'Success']],
    });
    // The shared tiles sit under the medallion row (issue 2006).
    assert.ok(Boolean(readout.querySelector('.manager-checks-simulator-head + .fabricate-dice-tiles')));
    // The tile's tone is the face's result: success for a qualifier, danger for a cancel.
    const tone = (tile) => tile.className;
    assert.match(tone(tiles[0]), /fabricate-dice-tiles__tile--success/);
    assert.match(tone(tiles[3]), /fabricate-dice-tiles__tile--danger/);
    assert.doesNotMatch(tone(tiles[5]), /--/, 'a face that did nothing is untoned');
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
    assert.equal(root.querySelector('[data-check-count-actor-line]').dataset.checkCountActorLine, 'unresolved');
    assert.match(root.querySelector('[data-check-count-actor-line]').textContent, /Vosk has no value at @skills\.smith\.rank/);
    assert.ok(!root.querySelector('[data-check-count-expected]'), 'no reading, never 0');
    const notice = root.querySelector('[data-checks-section-notice="countPathUnresolvedForPreview"]');
    assert.ok(Boolean(notice), 'the roll section opens with a notice explaining the warning');
    assert.equal(notice.dataset.noticeTone, 'warning', 'amber, as frame 19 draws it');
    assert.equal(
      notice.querySelector('.fab-notice-title').textContent.trim(),
      'A character path does not resolve'
    );
    assert.match(
      notice.querySelector('.fab-notice-detail').textContent,
      /IssueCountPathUnresolvedForPreview:\{"actor":"Vosk","path":"@skills\.smith\.rank","input":"base"\}/u,
      'the detail is the Validation sentence, naming the actor and the path'
    );
    const panel = root.querySelector('[role="tabpanel"]');
    assert.ok(panel.firstElementChild.matches('[data-checks-section-notices="roll"]'), 'it opens the pane');
    notice.querySelector('[data-notice-action]').click();
    await settle();
    assert.ok(
      root.ownerDocument.activeElement === root.querySelector('[data-validation-target="checks-count-base"]'),
      'Review focuses the base pool the actor cannot read (issue 2006)'
    );
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
      ['success', 'Fine', 'The recipe’s result set is produced'],
      [['result-group', 'Result set produced', 'Fine']],
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
      ['success', 'Success', 'The recipe’s result set is produced'],
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
    // Blocking issues first, as Validation orders its rows (issue 2082); all three block since issue 2006.
    const ids = [...root.querySelectorAll('[data-checks-section-notices="roll"] > [data-checks-section-notice]')].map(
      (notice) => notice.getAttribute('data-checks-section-notice')
    );
    assert.deepEqual(ids, ['countThresholdInvalid', 'countTierWithoutSuccesses', 'countRequiredExceedsMaxPool']);
    assert.ok(!root.querySelector('[data-checks-section-notice="noRollFormula"]'));
  });

  it('hands the ceiling to additional dice in the roll section, and only while on (issue 2008)', async () => {
    const additionalDice = { enabled: true, source: 'path', path: 'system.resources.momentum.value', max: 1 };
    const notices = async (enabled) => {
      script([]);
      const root = await mountSimple({
        ...SMITHING,
        evaluation: pool({ base: '2', additionalDice: { ...additionalDice, enabled } }),
        tiers: [
          { id: 'arcane', name: 'Arcane Work', dc: 12, successes: 3 },
          { id: 'impossible', name: 'Impossible Work', dc: 12, successes: 4 },
        ],
      });
      // The harness localizes to the key and its data, so each notice names its tiers as data.
      const named = Object.fromEntries(
        [...root.querySelectorAll(':scope [data-checks-section-notices="roll"] > [data-checks-section-notice]')].map(
          (notice) => [notice.dataset.checksSectionNotice, /"names":"([^"]*)"/.exec(notice.textContent)?.[1]]
        )
      );
      harness.remount();
      return named;
    };
    assert.deepEqual(await notices(true), {
      countRequiredExceedsMaxPool: 'Impossible Work',
      countRequiredExceedsBasePool: 'Arcane Work',
    });
    // A disabled record keeps its maximum, and the ceiling ignores it.
    assert.deepEqual(await notices(false), {
      countRequiredExceedsMaxPool: 'Arcane Work, Impossible Work',
    });
  });

  it('ranks the preview actor warning with the warnings, below a blocking fault', async () => {
    script([]);
    const everyFace = { enabled: true, faces: { kind: 'from', value: 1 } };
    const root = await mountSimple({
      ...SMITHING,
      evaluation: pool({ base: '@skills.smith.rank + 2', explode: everyFace }),
      tiers: [{ id: 'unset', name: 'Unset Work', dc: 12, successes: null }],
    });
    await choosePreviewActor(root, 'vosk');
    const ids = [...root.querySelectorAll('[data-checks-section-notices="roll"] > [data-checks-section-notice]')].map(
      (notice) => notice.getAttribute('data-checks-section-notice')
    );
    assert.deepEqual(ids, ['countExplodeUnbounded', 'countTierWithoutSuccesses', 'countPathUnresolvedForPreview']);
  });
});

// The Formula card's reading and actor line are composed by ChecksView from the same preview the
// odds panel reads, so this needs the whole view (issue 2006, N6).
describe('the Formula card reads the odds panel and the preview placement (issue 2006)', () => {
  const reading = (root) => root.querySelector('[data-check-count-expected]');
  const expected = (root) =>
    root.querySelector('[data-checks-odds-domain]')?.dataset.checksOddsExpected ?? null;
  const KNACK = (expression) => ({
    modifiers: [{ id: 'knack', label: 'Knack', expression }],
    craftingDefaultModifierPolicy: 'addAll',
    craftingDefaultModifierIds: ['knack'],
  });

  it('crafting: expected successes equals the odds heading, and the actor line composes', async () => {
    script([]);
    const root = await mountSimple(SMITHING);
    assert.ok(!reading(root), 'no reading while the odds wait for an actor');
    await choosePreviewActor(root, 'idrin');
    assert.equal(expected(root), '1.33');
    assert.equal(reading(root).dataset.checkCountExpected, expected(root));
    assert.equal(reading(root).dataset.checkCountExpectedStatus, 'nearly-exact');
    assert.equal(
      root.querySelector('[data-check-count-actor-line]').textContent.trim(),
      'For Idrin: 6d10, each ≥ 8.'
    );
  });

  it('salvage: a literal pool reads 1.30 with no actor, as the odds panel does', async () => {
    script([]);
    const root = await harness.mount({
      activity: 'salvage',
      salvageResolutionMode: 'simple',
      salvageCheckSimple: {
        ...SMITHING,
        evaluation: pool({ die: 20, base: '2', threshold: '8', required: 1 }),
        tiers: [],
      },
      activation: { salvage: { enabled: true, optional: false } },
      features: { salvage: true },
    });
    await settle();
    assert.equal(expected(root), '1.30');
    assert.equal(reading(root).dataset.checkCountExpected, '1.30');
    assert.equal(reading(root).dataset.checkCountExpectedStatus, 'exact');
  });

  it('a library benefit grows the pool once in the actor line and the odds', async () => {
    script([]);
    const root = await mountSimple(SMITHING, KNACK('1'));
    await choosePreviewActor(root, 'idrin');
    assert.equal(
      root.querySelector('[data-check-count-actor-line]').textContent.trim(),
      'For Idrin: 7d10, each ≥ 8 (pool 6 grown by 1).'
    );
    assert.equal(reading(root).dataset.checkCountExpected, expected(root));
  });

  it('both readings vanish when a rolled benefit cannot be enumerated', async () => {
    // The core double rolls one `NdX` term only, so a library fragment `(1d2x)` is proved rollable
    // by a Roll with no synchronous evaluation, which the rollability check accepts.
    const previous = globalThis.Roll;
    globalThis.Roll = class ParseOnlyRoll {
      static replaceFormulaData(formula) {
        return formula;
      }
    };
    try {
      const root = await mountSimple(SMITHING, KNACK('1d2x'));
      await choosePreviewActor(root, 'idrin');
      assert.equal(odds(root).dataset.checksOddsReason, 'modifier-preroll-not-enumerable');
      assert.ok(!reading(root), 'the reading abstains with the odds, never showing 0');
      assert.equal(
        root.querySelector('[data-check-count-actor-line]').textContent.trim(),
        'For Idrin: 6d10 + (1d2x) dice, each ≥ 8.'
      );
    } finally {
      globalThis.Roll = previous;
    }
  });
});
