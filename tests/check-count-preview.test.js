/** The Checks Studio's success-counting preview: records, abstention, odds and readout (issue 2004). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPreviewCheckArgs,
  buildPreviewRecords,
  runCheckPreview,
} from '../src/ui/svelte/apps/manager/checks/checkPreview.js';
import { ODDS_REASONS } from '../src/ui/svelte/apps/manager/checks/checkOdds.js';
import {
  PREVIEW_ABSTENTIONS,
  buildOddsModel,
  buildReadoutModel,
  labelPreviewRecords,
  previewAbstention,
  previewEnumeration,
  previewSignature,
} from '../src/ui/svelte/apps/manager/checks/checkPreviewModel.js';
import { countDigestFormula } from '../src/ui/svelte/apps/manager/checks/countPreviewModel.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { installCountDice } from './helpers/countEngineDice.js';
import { recordedRollDouble } from './helpers/recordedRollParse.js';
import { createLabRoll } from './view-lab/foundry/labRoll.js';

const text = (_key, fallback) => fallback;
const REAL = recordedRollDouble();
const LAB_ROLL = createLabRoll({
  random: () => 0.5,
  replaceFormulaData: REAL.replaceFormulaData,
  validate: REAL.validate,
});

const IDRIN = { name: 'Idrin', getRollData: () => ({ skills: { smith: { rank: 4 } } }) };
const VOSK = { name: 'Vosk', getRollData: () => ({ skills: {} }) };
const character = (actor) => (actor ? { name: actor.name, rollData: actor.getRollData() } : null);

const BEST = { enabled: true, faces: { kind: 'best' } };
const WORST = { enabled: true, faces: { kind: 'worst' } };
const count = (pool, direction = 'over') => ({ product: 'count', direction, pool: { ...pool } });

/** The lab's crafting pool: Idrin's six d10s at 8 or better, tens exploding and ones cancelling. */
const SMITHING = {
  rollFormula: '1d20',
  dc: 14,
  thresholdMode: 'meet',
  evaluation: count({
    die: 10,
    base: '@skills.smith.rank + 2',
    threshold: '8',
    required: 2,
    explode: BEST,
    cancel: WORST,
  }),
  checkBreakage: { triggers: [] },
  tiers: [
    { id: 'simple', name: 'Simple Work', successes: 1 },
    { id: 'fine', name: 'Fine Craft', successes: 2 },
    { id: 'master', name: 'Masterwork', successes: 4 },
    { id: 'unset', name: 'Unset Work', successes: null },
  ],
};

/** The lab's routed gathering pool: six literal d10s, Ruined to Masterwork. */
const FORAGING = {
  thresholdMode: 'meet',
  type: 'relative',
  evaluation: count({ die: 10, base: '6', threshold: '8', required: 2, explode: BEST, cancel: WORST }),
  relativeOutcomes: [
    { id: 'ruined', name: 'Ruined', dc: -1, success: false },
    { id: 'success', name: 'Success', dc: 0, success: true },
    { id: 'fine', name: 'Fine', dc: 1, success: true },
    { id: 'master', name: 'Masterwork', dc: 3, success: true },
  ],
  fixedOutcomes: [],
  checkBreakage: { triggers: [] },
};

function plan({ draft, activity = 'crafting', mode = 'simple', actor = IDRIN, record = null, system = null }) {
  return buildPreviewCheckArgs({ activity, mode, draft, system, actor, record });
}

function oddsFor(previewPlan, actor = previewPlan.actor, sandbox = {}) {
  const abstention = previewAbstention(previewPlan, character(actor));
  const enumeration = previewEnumeration(previewPlan, abstention, { Roll: LAB_ROLL });
  return buildOddsModel({ plan: previewPlan, enumeration, abstention, sandbox }, text);
}

const rowsOf = (odds) => odds.rows.map((row) => [row.id, row.percent]);

/** Roll the preview over scripted faces and build its readout. */
async function rolled(previewPlan, faces) {
  const dice = installCountDice({ faces, chat: false });
  try {
    const result = await runCheckPreview(previewPlan);
    const readout = buildReadoutModel(
      { plan: previewPlan, result, rolling: false, resolved: true },
      text
    );
    return { result, readout, formulas: dice.formulas(), constructed: dice.constructed };
  } finally {
    dice.restore();
  }
}

describe('a count preview plan', () => {
  it('rolls the pool, leaving the retained formula inert', () => {
    const previewPlan = plan({ draft: SMITHING });
    assert.equal(previewPlan.evaluation.product, 'count');
    assert.equal(previewPlan.formula, '', 'the retained 1d20 is not the preview formula');
    assert.equal(previewPlan.dc, 2, 'the default record reads the pool’s required count');
    assert.equal(previewPlan.args.dc, 2);
    assert.equal(previewPlan.target.ok, true);
    assert.equal(previewPlan.target.policy.resolved.base, 6, 'Idrin’s rank 4 plus 2');
  });

  it('reads a recipe tier’s successes, and a null one inherits the pool’s', () => {
    const records = buildPreviewRecords({ check: SMITHING });
    const required = (id) =>
      plan({ draft: SMITHING, record: records.find((record) => record.id === id) }).dc;
    assert.equal(required('master'), 4);
    assert.equal(required('simple'), 1);
    assert.equal(required('unset'), 2);
  });

  it('labels each record by its successes needed, and a progressive record by name alone', () => {
    const evaluation = normalizeCheckEvaluation(SMITHING.evaluation);
    const records = buildPreviewRecords({ check: SMITHING, defaultLabel: 'Default' });
    assert.deepEqual(
      labelPreviewRecords(records, { evaluation }, text).map((record) => record.label),
      [
        'Default · 2 successes',
        'Simple Work · 1 success',
        'Fine Craft · 2 successes',
        'Masterwork · 4 successes',
        'Unset Work · 2 successes',
      ]
    );
    assert.deepEqual(
      labelPreviewRecords(records, { evaluation, progressive: true }, text).map((r) => r.label),
      ['Default', 'Simple Work', 'Fine Craft', 'Masterwork', 'Unset Work']
    );
  });

  it('names the digest roll row with the authored expressions', () => {
    const evaluation = normalizeCheckEvaluation(SMITHING.evaluation);
    assert.equal(
      countDigestFormula(SMITHING, evaluation, text),
      'Roll · (@skills.smith.rank + 2)d10 · each ≥ 8',
      'a base that reads the character is bracketed, so it is not read as a sum with the dice'
    );
    const strictUnder = normalizeCheckEvaluation(count({ die: 20, base: '2', threshold: '13' }, 'under'));
    assert.equal(
      countDigestFormula({ thresholdMode: 'exceed' }, strictUnder, text),
      'Roll · 2d20 · each < 13'
    );
    assert.equal(countDigestFormula({}, normalizeCheckEvaluation({}), text), null);
  });

  it('drops a rolled result when the pool changes underneath it', () => {
    const signature = (draft) =>
      previewSignature({ activity: 'crafting', mode: 'simple', plan: plan({ draft }), actorId: 'idrin' });
    const moved = {
      ...SMITHING,
      evaluation: { ...SMITHING.evaluation, pool: { ...SMITHING.evaluation.pool, threshold: '9' } },
    };
    assert.notEqual(signature(SMITHING), signature(moved));
  });
});

describe('count abstention', () => {
  it('needs a character when the pool reads one, and charts a literal pool without one', () => {
    const noActor = plan({ draft: SMITHING, actor: null });
    assert.deepEqual(previewAbstention(noActor, null), {
      reason: PREVIEW_ABSTENTIONS.needsPreviewActor,
    });
    assert.equal(previewAbstention(plan({ draft: FORAGING, actor: null }), null), null);
  });

  it('names the actor and the path a character lacks', () => {
    const abstention = previewAbstention(plan({ draft: SMITHING, actor: VOSK }), character(VOSK));
    assert.deepEqual(abstention, {
      reason: ODDS_REASONS.countPathUnresolved,
      data: { actor: 'Vosk', path: '@skills.smith.rank' },
    });
  });

  it('names the actor whose value is not a number', () => {
    const odd = { name: 'Odd', getRollData: () => ({ skills: { smith: { rank: 'high' } } }) };
    const abstention = previewAbstention(plan({ draft: SMITHING, actor: odd }), character(odd));
    assert.deepEqual(abstention, {
      reason: ODDS_REASONS.countValueNotNumeric,
      data: { actor: 'Odd' },
    });
  });

  it('refuses a pool whose own threshold rolls dice, naming the input in the hint', () => {
    const draft = {
      ...FORAGING,
      evaluation: count({ die: 10, base: '2', threshold: '1d4 + 6', required: 1 }),
    };
    const previewPlan = plan({ draft, activity: 'salvage', actor: null });
    const abstention = previewAbstention(previewPlan, null);
    assert.equal(abstention.reason, PREVIEW_ABSTENTIONS.targetInvalid);
    assert.equal(abstention.refusal.refusedInput, 'threshold');
    const readout = buildReadoutModel({ plan: previewPlan, result: null, abstention }, text);
    assert.match(readout.abstain.hint, /threshold/i);
  });
});

describe('count odds', () => {
  it('charts the lab smithing pool as outcomes with a Botch split and the expected net', () => {
    const odds = oddsFor(plan({ draft: SMITHING }));
    assert.equal(odds.product, 'count');
    assert.deepEqual(rowsOf(odds), [
      ['botch', 12.2],
      ['failure', 43.5],
      ['success', 44.4],
    ]);
    assert.equal(odds.expected, '1.33');
    assert.equal(odds.domain, 'nearly exact · expected 1.33', 'recursion leaves a residual');
  });

  it('charts routed tiers worst to best, the Botch first', () => {
    const odds = oddsFor(plan({ draft: FORAGING, activity: 'gathering', mode: 'routed', actor: null }));
    assert.deepEqual(rowsOf(odds), [
      ['botch', 12.2],
      ['ruined', 43.5],
      ['success', 21.7],
      ['fine', 19.6],
      ['master', 3],
    ]);
  });

  it('charts a literal roll-under pool with no actor, exactly', () => {
    const draft = {
      thresholdMode: 'meet',
      evaluation: count(
        { die: 20, base: '2', threshold: '13', required: 2, modifierDestination: 'threshold' },
        'under'
      ),
      checkBreakage: { triggers: [] },
    };
    const odds = oddsFor(plan({ draft, activity: 'salvage', actor: null }));
    assert.deepEqual(rowsOf(odds), [
      ['failure', 57.7],
      ['success', 42.3],
    ]);
    assert.equal(odds.domain, 'exact · expected 1.30');
  });

  it('splits no Botch without cancelling, nor when a net below zero can still succeed', () => {
    const plain = { ...FORAGING, evaluation: count({ die: 10, base: '6', threshold: '8', required: 2 }) };
    const noCancel = oddsFor(plan({ draft: plain, activity: 'gathering', mode: 'routed', actor: null }));
    assert.ok(!noCancel.rows.some((row) => row.id === 'botch'));

    const rescued = {
      ...SMITHING,
      checkBreakage: {
        triggers: [
          { id: 'r', condition: { type: 'rollTotal', operator: '<', value: 0 }, outcome: 'success' },
        ],
      },
    };
    const odds = oddsFor(plan({ draft: rescued }));
    assert.ok(!odds.rows.some((row) => row.id === 'botch'), 'a botch that succeeds is no botch');
    assert.equal(odds.rows.find((row) => row.id === 'success').percent, 56.5);
  });

  it('splits a progressive Botch out of the rows that award nothing', () => {
    const draft = { ...FORAGING, evaluation: SMITHING.evaluation, awardMode: 'equal' };
    const odds = oddsFor(plan({ draft, mode: 'progressive' }), IDRIN, {
      difficulties: [1, 1, 2],
      awardMode: 'equal',
    });
    assert.deepEqual(odds.rows.map((row) => row.id), ['botch', 'award-0', 'award-1', 'award-2', 'award-3']);
    assert.equal(odds.rows[0].percent, 12.2);
  });

  it('enumerates an any-die face trigger jointly with the net', () => {
    // 2d6 at 5 or better, both needed: 4 of 36 pass; a six on either die forces a success, so
    // 11 of 36 show a six and (5, 5) passes without one, 12 of 36 in all.
    const pool = count({ die: 6, base: '2', threshold: '5', required: 2 });
    const trigger = {
      id: 'six',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 6 },
      outcome: 'success',
    };
    const draft = { thresholdMode: 'meet', evaluation: pool, checkBreakage: { triggers: [trigger] } };
    const odds = oddsFor(plan({ draft, actor: null }));
    assert.equal(odds.rows.find((row) => row.id === 'success').percent, 33.3);
    const without = oddsFor(plan({ draft: { ...draft, checkBreakage: { triggers: [] } }, actor: null }));
    assert.equal(without.rows.find((row) => row.id === 'success').percent, 11.1);
  });

  it('abstains from a face trigger a net distribution cannot follow', () => {
    const trigger = {
      id: 'high',
      condition: { type: 'diceGroup', groupId: 0, aggregate: 'highestDie', operator: '==', value: 10 },
      outcome: 'success',
    };
    const draft = { ...SMITHING, checkBreakage: { triggers: [trigger] } };
    const odds = oddsFor(plan({ draft }));
    assert.equal(odds.enumerable, false);
    assert.equal(odds.reason, ODDS_REASONS.countFaceTriggerNotEnumerable);
    assert.equal(odds.product, 'count');
  });

  it('abstains when explosions leave too much mass unexpanded', () => {
    const draft = {
      ...SMITHING,
      evaluation: count({
        die: 10,
        base: '6',
        threshold: '8',
        required: 2,
        explode: { enabled: true, faces: { kind: 'from', value: 2 } },
      }),
    };
    const odds = oddsFor(plan({ draft, actor: null }));
    assert.equal(odds.reason, ODDS_REASONS.countResidualTooLarge);
  });

  it('mixes a separately rolled pool bonus in exactly, and refuses one it cannot enumerate', () => {
    const system = (expression) => ({
      modifiers: [{ id: 'knack', label: 'Knack', expression }],
      craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['knack'] },
    });
    const draft = {
      thresholdMode: 'meet',
      evaluation: count({ die: 6, base: '1', threshold: '5', required: 2 }),
      checkBreakage: { triggers: [] },
    };
    // 1 + 1d2 dice: two dice half the time (4 of 36 pass) and three the other half (7 of 27).
    const joint = oddsFor(plan({ draft, actor: null, system: system('1d2') }));
    assert.equal(joint.rows.find((row) => row.id === 'success').percent, 18.5);
    const refused = oddsFor(plan({ draft, actor: null, system: system('1d2x') }));
    assert.equal(refused.reason, ODDS_REASONS.preRollNotEnumerable);
  });

  it('keeps a free-text success-counting sum formula out of the count odds (MC22)', () => {
    const draft = { rollFormula: '2d20cs<=10', dc: 1, thresholdMode: 'meet', checkBreakage: { triggers: [] } };
    const odds = oddsFor(plan({ draft, actor: null }));
    assert.equal(odds.reason, ODDS_REASONS.dieModifiers);
    assert.equal(odds.product, undefined, 'a sum check is never charted as a count');
  });
});

describe('the count readout', () => {
  it('marks every face the runner rolled, explosions included, and agrees with its net', async () => {
    // 8 10 1 3 9 2, the 10 explodes into a 10, which explodes into a 1.
    const { result, readout } = await rolled(plan({ draft: SMITHING }), [8, 10, 1, 3, 9, 2, 10, 1]);
    assert.equal(result.data.total, 2);
    assert.deepEqual(
      readout.count.faces.map((tile) => [tile.face, tile.marks.join(' ')]),
      [
        [8, 'qualified'],
        [10, 'qualified exploded'],
        [1, 'cancelled'],
        [3, ''],
        [9, 'qualified'],
        [2, ''],
        [10, 'qualified exploded'],
        [1, 'cancelled'],
      ]
    );
    assert.equal(readout.count.faces.length, result.data.diceGroups[0].results.length);
    assert.equal(readout.count.faces[1].label, '10, qualified and exploded');
    assert.equal(readout.total, 2);
    assert.equal(readout.breakdown, '4 qualified − 2 cancelled = 2 net');
    assert.equal(readout.marginLabel, '2 needed · margin +0', 'a zero margin is signed');
    assert.equal(readout.bandName, 'Success');
    assert.equal(readout.bandDetail, 'The result group is produced.');
    assert.equal(readout.hasFormula, true);
  });

  it('marks each face against the threshold the runner executed, a benefit having moved it', async () => {
    const draft = {
      thresholdMode: 'meet',
      evaluation: count(
        { die: 20, base: '2', threshold: '13', required: 1, modifierDestination: 'threshold' },
        'under'
      ),
      checkBreakage: { triggers: [] },
    };
    const system = {
      modifiers: [{ id: 'steady', label: 'Steady hands', expression: '1' }],
      craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['steady'] },
    };
    const { result, readout } = await rolled(plan({ draft, actor: IDRIN, system }), [14, 15]);
    assert.equal(result.data.target, 14, 'the +1 raises the roll-under threshold');
    assert.deepEqual(
      readout.count.faces.map((tile) => tile.marks.join(' ')),
      ['qualified', ''],
      'a 14 qualifies at or under the executed 14, not the authored 13'
    );
  });

  it('marks a face that both qualifies and cancels with both, contributing nothing', async () => {
    const draft = {
      thresholdMode: 'meet',
      evaluation: count({ die: 6, base: '2', threshold: '1', required: 1, cancel: WORST }),
      checkBreakage: { triggers: [] },
    };
    const { readout } = await rolled(plan({ draft, actor: null }), [1, 4]);
    assert.equal(readout.count.faces[0].label, '1, qualified and cancelled');
    assert.equal(readout.breakdown, '2 qualified − 1 cancelled = 1 net');
  });

  it('reports a botch with the true minus and says so on the band', async () => {
    const draft = {
      ...FORAGING,
      evaluation: count({
        die: 6,
        base: '3',
        threshold: '7',
        required: 1,
        cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
      }),
      relativeOutcomes: [
        { id: 'failure', name: 'Failure', dc: -1, success: false },
        { id: 'success', name: 'Success', dc: 0, success: true },
      ],
    };
    const { readout } = await rolled(
      plan({ draft, activity: 'gathering', mode: 'routed', actor: null }),
      [2, 4, 6]
    );
    assert.equal(readout.total, -3);
    assert.equal(readout.count.shownTotal, '−3');
    assert.equal(readout.count.botch, true);
    assert.deepEqual(readout.count.faces.map((tile) => tile.marks.join(' ')), ['cancelled', 'cancelled', 'cancelled']);
    assert.equal(readout.bandDetail, 'Botched. Nothing is produced; the failure policy applies.');
    assert.equal(readout.bandName, 'Botch', 'named as the odds panel names it, not as its band');
    assert.equal(
      readout.marginLabel,
      '1 needed · a net below zero is a botch',
      "the record's count, not the Failure tier's 0 the net graded into"
    );
  });

  it('keeps a rescued botch’s success copy, the net-below-zero fact still marked', async () => {
    const rescue = { id: 'r', condition: { type: 'rollTotal', operator: '<', value: 0 }, outcome: 'success' };
    const draft = { ...SMITHING, checkBreakage: { triggers: [rescue] } };
    const { readout } = await rolled(plan({ draft }), [1, 1, 1, 1, 1, 1]);
    assert.equal(readout.count.botch, true, 'the net is below zero');
    assert.equal(readout.bandSuccess, true);
    assert.equal(readout.bandName, 'Success');
    assert.equal(readout.bandDetail, 'The result group is produced.');
  });

  it('fails a zero pool with no tiles, no total and no Roll', async () => {
    const draft = {
      thresholdMode: 'meet',
      evaluation: count({ die: 10, base: '0', threshold: '8', required: 1, zeroPoolFails: true }),
      checkBreakage: { triggers: [] },
    };
    const { readout, constructed } = await rolled(plan({ draft, activity: 'salvage', actor: null }), []);
    assert.equal(constructed.length, 0, 'nothing was rolled');
    assert.equal(readout.count.zeroPool, true);
    assert.deepEqual(readout.count.faces, []);
    assert.equal(readout.total, null);
    assert.equal(readout.bandSuccess, false);
  });

  it('shows a progressive pool’s raw net and awards what is left above zero', async () => {
    const draft = { evaluation: count({ die: 6, base: '2', threshold: '7', required: 1, cancel: WORST }), checkBreakage: { triggers: [] } };
    const { readout } = await rolled(plan({ draft, mode: 'progressive', actor: null }), [1, 3]);
    assert.equal(readout.total, -1);
    assert.equal(readout.bandName, 'Awards 0');
    assert.equal(readout.marginLabel, '', 'a progressive check grades no required count');
    assert.equal(
      readout.bandDetail,
      'The value is spent down the recipe’s ordered results, each costing its own difficulty.',
      'a progressive net below zero keeps its award detail'
    );
  });

  it('states that a dynamic required count was not previewed by running its macro', () => {
    const readout = buildReadoutModel(
      { plan: plan({ draft: { ...SMITHING, dcMode: 'dynamic' } }), result: null },
      text
    );
    assert.equal(readout.dynamicNote, 'dynamic-required');
  });
});
