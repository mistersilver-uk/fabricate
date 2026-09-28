/** The Checks Studio's preview view-model and roll-under odds (issue 2003). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPreviewCheckArgs,
  buildPreviewRecords,
  runCheckPreview,
} from '../src/ui/svelte/apps/manager/checks/checkPreview.js';
import {
  ODDS_REASONS,
  describeFormulaEnumerability,
  enumeratePassFailOdds,
} from '../src/ui/svelte/apps/manager/checks/checkOdds.js';
import {
  PREVIEW_ABSTENTIONS,
  buildOddsModel,
  buildReadoutModel,
  labelPreviewRecords,
  previewAbstention,
  previewActorNote,
  previewEnumeration,
  previewSignature,
} from '../src/ui/svelte/apps/manager/checks/checkPreviewModel.js';
import { SUM_OVER_EVALUATION } from '../src/systems/checkModifierRouter.js';
import { recordedRollDouble } from './helpers/recordedRollParse.js';
import { createLabRoll } from './view-lab/foundry/labRoll.js';

const REAL = recordedRollDouble();
let draw = 0.5;
const LAB_ROLL = createLabRoll({
  random: () => draw,
  replaceFormulaData: REAL.replaceFormulaData,
  validate: REAL.validate,
});
const text = (_key, fallback) => fallback;

const IDRIN = { name: 'Idrin', getRollData: () => ({ skills: { craft: { value: 55 } }, prof: 3 }) };
const VOSK = { name: 'Vosk', getRollData: () => ({ skills: {}, prof: 3 }) };
const character = (actor) => (actor ? { name: actor.name, rollData: actor.getRollData() } : null);

const under = (target = {}) => ({ product: 'sum', direction: 'under', target });
const attribute = (expression, extra = {}) =>
  under({ source: 'attribute', expression, adjustmentKind: 'multiply', ...extra });

/** A system whose crafting check applies the given library expressions to every roll. */
function systemWith(...expressions) {
  const modifiers = expressions.map((expression, index) => ({
    id: `mod-${index}`,
    label: `Mod ${index}`,
    expression,
  }));
  return {
    modifiers,
    craftingCheck: {
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: modifiers.map((entry) => entry.id),
    },
  };
}

function plan({ draft, mode = 'simple', actor = IDRIN, system = null, record = null }) {
  return buildPreviewCheckArgs({ activity: 'crafting', mode, draft, system, actor, record });
}

function oddsOf(previewPlan) {
  const enumeration = describeFormulaEnumerability(previewPlan.formula, previewPlan.actor, {
    Roll: LAB_ROLL,
    craftingModifier: previewPlan.args.craftingModifier,
    evaluation: previewPlan.evaluation,
  });
  return buildOddsModel({ plan: previewPlan, enumeration, sandbox: {} }, text);
}

/** The odds model the route builds, through the same enumeration it reads. */
function previewEnumerated(previewPlan) {
  const enumeration = previewEnumeration(previewPlan, null, { Roll: LAB_ROLL });
  return buildOddsModel({ plan: previewPlan, enumeration, sandbox: {} }, text);
}

const percentOf = (odds, id) => odds.rows.find((row) => row.id === id)?.percent ?? 0;

const MULTIPLY_ROUTED = {
  rollFormula: '1d100',
  evaluation: attribute('@skills.craft.value', { baseAdjustment: 1 }),
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: [
    { id: 'failure', name: 'Failure', adjustment: null, success: false },
    { id: 'regular', name: 'Regular', adjustment: 1, success: true },
    { id: 'hard', name: 'Hard', adjustment: 0.5, success: true },
    { id: 'extreme', name: 'Extreme', adjustment: 0.2, success: true },
  ],
  fixedOutcomes: [],
  checkBreakage: { triggers: [] },
};

describe('preview records read the evaluation', () => {
  const check = {
    dc: 12,
    tiers: [
      { id: 'hard', name: 'Hard', dc: 15, adjustment: 0.5 },
      { id: 'plain', name: 'Plain', dc: 12, adjustment: null },
    ],
  };
  const labels = (evaluation) =>
    labelPreviewRecords(buildPreviewRecords({ check }), { evaluation }, text).map(
      (record) => record.label
    );

  it('labels a character-value record by its adjustment, a null tier inheriting the base', () => {
    assert.deepEqual(labels(attribute('@x')), [
      'Default · base adjustment',
      'Hard · ×½',
      'Plain · base adjustment',
    ]);
  });

  it('labels a fixed roll-under record by its target and roll-over by its DC', () => {
    assert.deepEqual(labels(under({ source: 'fixed' })), [
      'Default · target 12',
      'Hard · target 15',
      'Plain · target 12',
    ]);
    assert.deepEqual(labels(SUM_OVER_EVALUATION), [
      'Default · DC 12',
      'Hard · DC 15',
      'Plain · DC 12',
    ]);
  });
});

describe('buildPreviewCheckArgs resolves the target as the runtime does', () => {
  it('grades a character value with the record’s adjustment, else the base', () => {
    const draft = {
      rollFormula: '1d100',
      dc: 99,
      evaluation: attribute('@skills.craft.value', { baseAdjustment: 1 }),
    };
    const base = plan({ draft });
    assert.equal(base.args.dc, 55, 'the DC field is ignored for a character value');
    assert.deepEqual(base.args.evaluation, base.evaluation);
    const hard = plan({ draft, record: { id: 'hard', dc: 99, adjustment: 0.5 } });
    assert.equal(hard.args.dc, 27, 'floor(55 × ½)');
  });

  it('leaves a roll-over fixed DC’s argument bag exactly as it was', () => {
    const previewPlan = plan({ draft: { rollFormula: '1d20', dc: 12 } });
    assert.equal(previewPlan.args.rollOptions, null);
    assert.equal(Object.hasOwn(previewPlan.args, 'evaluation'), false);
    assert.equal(previewPlan.args.dc, 12);
  });

  it('places Tool terms on a roll-under target instead of appending them', () => {
    const draft = { rollFormula: '1d20', dc: 10, evaluation: under({ source: 'fixed' }) };
    const toolTerms = [{ value: 3, label: 'Tools' }];
    const placed = buildPreviewCheckArgs({ activity: 'crafting', mode: 'simple', draft, toolTerms });
    assert.equal(placed.formula, '1d20', 'nothing is appended under');
    assert.deepEqual(placed.args.rollOptions.toolContributions.map((term) => term.value), [3]);
    const over = buildPreviewCheckArgs({
      activity: 'crafting',
      mode: 'simple',
      draft: { rollFormula: '1d20', dc: 10 },
      toolTerms,
    });
    assert.equal(over.formula, '1d20 + 3[Tools]', 'roll-over still appends');
  });
});

describe('previewAbstention', () => {
  const abstain = (draft, actor, mode = 'simple') =>
    previewAbstention(plan({ draft, actor, mode }), character(actor))?.reason ?? null;

  it('abstains first for a check reading the character with no actor chosen', () => {
    assert.equal(abstain(MULTIPLY_ROUTED, null, 'routed'), PREVIEW_ABSTENTIONS.needsPreviewActor);
    const readsFormula = { rollFormula: '1d20 + @prof', dc: 10, evaluation: under({}) };
    assert.equal(abstain(readsFormula, null), PREVIEW_ABSTENTIONS.needsPreviewActor);
    const progressive = { rollFormula: '1d20 + @prof', evaluation: under({}) };
    assert.equal(
      abstain(progressive, null, 'progressive'),
      PREVIEW_ABSTENTIONS.needsPreviewActor,
      'needs-preview-actor outranks the progressive refusal'
    );
  });

  it('keeps an actorless literal target and formula previewable', () => {
    const literal = { rollFormula: '1d20', evaluation: attribute('14', { adjustmentKind: 'add' }) };
    assert.equal(abstain(literal, null), null);
  });

  it('never abstains for roll-over against a fixed DC, which keeps its own reading', () => {
    assert.equal(abstain({ rollFormula: '1d20 + @prof', dc: 10 }, null), null);
  });

  it('treats a character value the mode does not read as inert, grading like a fixed DC', () => {
    const leftover = {
      product: 'sum',
      direction: 'over',
      target: { source: 'attribute', expression: '@x' },
    };
    const progressive = { rollFormula: '1d20 + @prof', evaluation: leftover };
    assert.equal(abstain(progressive, null, 'progressive'), null);
    const ranges = {
      ...MULTIPLY_ROUTED,
      rollFormula: '1d20 + @prof',
      evaluation: leftover,
      type: 'fixed',
      fixedOutcomes: [{ id: 'good', name: 'Good', start: 1, end: 20, success: true }],
    };
    assert.equal(abstain(ranges, null, 'routed'), null);
    const inertPlan = plan({ draft: progressive, actor: null, mode: 'progressive' });
    assert.equal(
      previewActorNote({ plan: inertPlan, actor: null }, text),
      'With no actor selected every roll-data key reads as 0.'
    );
    const dynamic = plan({ draft: { ...ranges, dcMode: 'dynamic' }, actor: null, mode: 'routed' });
    const readout = buildReadoutModel(
      { plan: dynamic, result: null, rolling: false, resolved: true },
      text
    );
    assert.notEqual(readout.dynamicNote, 'dynamic-target', 'a range check reads no target');
  });

  it('names the actor and the missing path, or the unreadable value', () => {
    const missing = previewAbstention(plan({ draft: MULTIPLY_ROUTED, actor: VOSK, mode: 'routed' }), character(VOSK));
    assert.deepEqual(missing, {
      reason: PREVIEW_ABSTENTIONS.pathUnresolved,
      data: { actor: 'Vosk', path: '@skills.craft.value' },
    });
    const words = { name: 'Wren', getRollData: () => ({ skills: { craft: { value: 'high' } } }) };
    assert.equal(abstain(MULTIPLY_ROUTED, words, 'routed'), PREVIEW_ABSTENTIONS.valueNotNumeric);
  });

  it('calls a fault of the check’s own target invalid, whoever previews it', () => {
    const dice = { rollFormula: '1d20', evaluation: attribute('1d6') };
    assert.equal(abstain(dice, IDRIN), PREVIEW_ABSTENTIONS.targetInvalid);
    const zero = { rollFormula: '1d20', evaluation: attribute('@skills.craft.value', { baseAdjustment: 0 }) };
    assert.equal(abstain(zero, IDRIN), PREVIEW_ABSTENTIONS.targetInvalid);
    const progressive = { rollFormula: '1d20', evaluation: under({}) };
    assert.equal(abstain(progressive, IDRIN, 'progressive'), PREVIEW_ABSTENTIONS.progressiveUnder);
  });

  it('charts and rolls nothing while abstaining', () => {
    const previewPlan = plan({ draft: MULTIPLY_ROUTED, actor: null, mode: 'routed' });
    const abstention = previewAbstention(previewPlan, null);
    const enumeration = previewEnumeration(previewPlan, abstention, { Roll: LAB_ROLL });
    const odds = buildOddsModel({ plan: previewPlan, enumeration, abstention, sandbox: {} }, text);
    assert.deepEqual(
      [odds.enumerable, odds.reason],
      [false, PREVIEW_ABSTENTIONS.needsPreviewActor]
    );
    const readout = buildReadoutModel(
      { plan: previewPlan, result: null, rolling: false, resolved: true, abstention },
      text
    );
    assert.equal(readout.abstain.hint, 'Choose a character who has every value this check reads, then roll.');
    assert.deepEqual([readout.target, readout.margin], [null, null]);
  });
});

describe('roll-under odds place the modifiers on the target (QE7)', () => {
  const SIMPLE_UNDER = { rollFormula: '1d20', dc: 10, thresholdMode: 'meet', evaluation: under({ source: 'fixed' }) };

  it('charts 60% for 1d20 at or under 10 with a +2 library scalar, and the runner agrees', async () => {
    const previewPlan = plan({ draft: SIMPLE_UNDER, system: systemWith('2') });
    const odds = oddsOf(previewPlan);
    assert.equal(percentOf(odds, 'success'), 60);
    assert.equal(odds.direction, 'under');

    // The appended placement this replaces: the +2 lands on the roll, and the chance drops.
    const appended = describeFormulaEnumerability(previewPlan.formula, IDRIN, {
      Roll: LAB_ROLL,
      craftingModifier: previewPlan.args.craftingModifier,
      evaluation: SUM_OVER_EVALUATION,
    });
    const appendedRows = enumeratePassFailOdds({
      outcomes: appended.outcomes,
      args: { dc: 10, comparison: 'meet', triggers: [], direction: 'under' },
    });
    assert.equal(appendedRows.find((row) => row.id === 'success').percent, 40);

    const previous = globalThis.Roll;
    globalThis.Roll = LAB_ROLL;
    let passed = 0;
    try {
      for (let face = 1; face <= 20; face += 1) {
        draw = (face - 0.5) / 20;
        const result = await runCheckPreview(previewPlan);
        assert.equal(result.data.total, face, 'the runner rolls the face, nothing appended');
        if (result.success) passed += 1;
      }
    } finally {
      globalThis.Roll = previous;
      draw = 0.5;
    }
    assert.equal(passed, 12, 'twelve of twenty faces pass, the 60% the chart shows');
  });

  it('charts 83.3% for 1d6 + 1d6 against 7 with +2, where appending charts 27.8%', () => {
    const draft = { ...SIMPLE_UNDER, rollFormula: '1d6 + 1d6', dc: 7 };
    const previewPlan = plan({ draft, system: systemWith('2') });
    assert.equal(percentOf(oddsOf(previewPlan), 'success'), 83.3);
    const appended = describeFormulaEnumerability(previewPlan.formula, IDRIN, {
      Roll: LAB_ROLL,
      craftingModifier: previewPlan.args.craftingModifier,
    });
    const rows = enumeratePassFailOdds({
      outcomes: appended.outcomes,
      args: { dc: 7, comparison: 'meet', triggers: [], direction: 'under' },
    });
    assert.equal(rows.find((row) => row.id === 'success').percent, 27.8);
  });

  it('keeps the track window on the roll itself, not the roll plus the modifier', () => {
    const previewPlan = plan({ draft: SIMPLE_UNDER, system: systemWith('2') });
    const totals = previewEnumeration(previewPlan, null, { Roll: LAB_ROLL }).outcomes.map(
      (outcome) => outcome.total
    );
    assert.deepEqual([Math.min(...totals), Math.max(...totals)], [1, 20]);
  });

  it('enumerates a separately rolled 1d4 jointly with the main die, never appended', () => {
    const previewPlan = plan({ draft: SIMPLE_UNDER, system: systemWith('1d4') });
    const enumeration = previewEnumeration(previewPlan, null, { Roll: LAB_ROLL });
    assert.equal(enumeration.combinations, 80, 'twenty faces times four');
    assert.equal(enumeration.faces, null, 'a joint space is counted in combinations');
    const totals = enumeration.outcomes.map((outcome) => outcome.total);
    assert.deepEqual([Math.min(...totals), Math.max(...totals)], [1, 20]);
    // P(d20 <= 10 + d4) = (11 + 12 + 13 + 14) / 80.
    assert.equal(percentOf(oddsOf(previewPlan), 'success'), 62.5);
  });

  it('places a Tool term on the roll-under target through the odds enumeration', () => {
    const args = (toolTerms) =>
      buildPreviewCheckArgs({ activity: 'crafting', mode: 'simple', draft: SIMPLE_UNDER, toolTerms });
    assert.equal(percentOf(previewEnumerated(args([])), 'success'), 50);
    assert.equal(
      percentOf(previewEnumerated(args([{ value: 3, label: 'Tools' }])), 'success'),
      65,
      'a scalar Tool term of +3 raises the under-10 target to 13'
    );
  });

  it('heads roll-under odds with the formula, naming a separately rolled bonus', () => {
    const fixed = previewEnumerated(plan({ draft: SIMPLE_UNDER }));
    assert.equal(fixed.caption, 'exact · 1d20');
    const joint = previewEnumerated(plan({ draft: SIMPLE_UNDER, system: systemWith('1d4') }));
    assert.equal(joint.caption, 'exact · 1d20 with 1d4');
    const over = previewEnumerated(plan({ draft: { rollFormula: '1d20', dc: 10 } }));
    assert.equal(over.caption, '', 'roll-over against a fixed DC counts its faces');
  });

  it('abstains for a pre-roll outside the whitelist and for a joint space above the cap', () => {
    const knack = plan({ draft: SIMPLE_UNDER, system: systemWith('2d4') });
    assert.equal(oddsOf(knack).reason, ODDS_REASONS.preRollNotEnumerable);
    const joint = plan({ draft: { ...SIMPLE_UNDER, rollFormula: '1d100' }, system: systemWith('1d1000') });
    assert.equal(oddsOf(joint).reason, ODDS_REASONS.tooManyOutcomes, '100 × 1000 is over 50,000');
    const alone = plan({ draft: SIMPLE_UNDER, system: systemWith('1d60000') });
    assert.equal(oddsOf(alone).reason, ODDS_REASONS.tooManyOutcomes);
  });
});

describe('routed roll-under odds rows run worst to best', () => {
  it('lists 1d100 against 55 as Failure 45, Regular 28, Hard 16, Extreme 11', () => {
    const odds = oddsOf(plan({ draft: MULTIPLY_ROUTED, mode: 'routed' }));
    assert.deepEqual(
      odds.rows.map((row) => [row.id, row.percent]),
      [
        ['failure', 45],
        ['regular', 28],
        ['hard', 16],
        ['extreme', 11],
      ]
    );
  });

  it('lists the unrouted bucket first', () => {
    const draft = {
      ...MULTIPLY_ROUTED,
      evaluation: under({ source: 'fixed' }),
      dc: 10,
      type: 'fixed',
      fixedOutcomes: [
        { id: 'good', name: 'Good', start: 1, end: 5, success: true },
        { id: 'fair', name: 'Fair', start: 6, end: 10, success: true },
      ],
    };
    const odds = oddsOf(plan({ draft: { ...draft, rollFormula: '1d20' }, mode: 'routed' }));
    assert.deepEqual(odds.rows.map((row) => row.id), ['unrouted', 'fair', 'good']);
  });
});

describe('the simulator readout reads the executed target', () => {
  const result = (data) => ({ success: true, outcome: 'pass', data: { diceGroups: [], ...data } });

  it('shows the runner’s target and margin under as target and margin', () => {
    const previewPlan = plan({ draft: { rollFormula: '1d20', dc: 12, evaluation: under({}) } });
    const readout = buildReadoutModel(
      {
        plan: previewPlan,
        result: result({ total: 9, target: 14, margin: 5 }),
        rolling: false,
        resolved: true,
      },
      text
    );
    assert.deepEqual(
      [readout.target, readout.margin, readout.gradeLabel],
      [14, 5, 'target 14 · margin +5']
    );
    assert.equal(readout.direction, 'under');
    assert.match(readout.bandDetail, /stays at or under the target/);
  });

  it('shows no target or margin for an Otherwise result, never a target of 0', () => {
    const readout = buildReadoutModel(
      {
        plan: plan({ draft: MULTIPLY_ROUTED, mode: 'routed' }),
        result: result({ total: 97, target: null, margin: null }),
        rolling: false,
        resolved: true,
      },
      text
    );
    assert.deepEqual([readout.target, readout.margin, readout.gradeLabel], [null, null, '']);
  });

  it('keeps roll-over against a fixed DC reading total − DC', () => {
    const previewPlan = plan({ draft: { rollFormula: '1d20', dc: 12 } });
    const readout = buildReadoutModel(
      {
        plan: previewPlan,
        result: result({ total: 15, target: 99, margin: 99 }),
        rolling: false,
        resolved: true,
      },
      text
    );
    assert.deepEqual([readout.target, readout.margin, readout.gradeLabel], [12, 3, 'vs DC 12 · +3']);
  });

  it('states the dynamic target, not the dynamic DC, for a character value', () => {
    const draft = { ...MULTIPLY_ROUTED, dcMode: 'dynamic' };
    const readout = buildReadoutModel(
      { plan: plan({ draft, mode: 'routed' }), result: null, rolling: false, resolved: true },
      text
    );
    assert.equal(readout.dynamicNote, 'dynamic-target');
  });
});

describe('the no-actor note and the invalidation signature', () => {
  it('words the no-actor note for a check graded any other way than roll-over DC', () => {
    const underPlan = plan({ draft: { rollFormula: '1d20', evaluation: under({}) }, actor: null });
    assert.equal(
      previewActorNote({ plan: underPlan, actor: null }, text),
      'No actor chosen. Values read from a character are not charted.'
    );
    const overPlan = plan({ draft: { rollFormula: '1d20', dc: 10 }, actor: null });
    assert.equal(
      previewActorNote({ plan: overPlan, actor: null }, text),
      'With no actor selected every roll-data key reads as 0.'
    );
  });

  it('moves with the actor’s value, the record’s adjustment and the evaluation', () => {
    const signature = (actor, record, draft = MULTIPLY_ROUTED) =>
      previewSignature({
        activity: 'crafting',
        mode: 'routed',
        plan: plan({ draft, actor, mode: 'routed', record }),
        actorId: 'same',
        record,
      });
    const base = signature(IDRIN, null);
    assert.notEqual(signature(VOSK, null), base, 'another actor’s value');
    assert.notEqual(signature(IDRIN, { id: 'x', dc: 0, adjustment: 0.5 }), base);
    const add = { ...MULTIPLY_ROUTED, evaluation: attribute('@skills.craft.value', { adjustmentKind: 'add' }) };
    assert.notEqual(signature(IDRIN, null, add), base);
  });
});
