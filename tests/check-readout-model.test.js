/** The Checks Studio simulator's rolled readout, over hand-built runner results (issue 2080). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReadoutModel } from '../src/ui/svelte/apps/manager/checks/checkReadoutModel.js';

const text = (_key, fallback) => fallback;

const FIXED = { source: 'fixed' };
const OVER = { product: 'sum', direction: 'over', target: FIXED };
const UNDER = { product: 'sum', direction: 'under', target: FIXED };
const CHARACTER_OVER = { product: 'sum', direction: 'over', target: { source: 'attribute' } };
const COUNT = { product: 'count', direction: 'over', target: FIXED, pool: { die: 10 } };

function plan(evaluation, { kind = 'passFail', dc = 12, args = {} } = {}) {
  return { kind, formula: '1d20', dc, dynamicDc: false, evaluation, target: null, args };
}

const d20 = (face) => [{ groupId: 0, group: '1d20', results: [face] }];
const threeD6 = [{ groupId: 0, group: '3d6', results: [5, 5, 3] }];

const result = (success, data, extra = {}) => ({
  success,
  outcome: success ? 'pass' : 'fail',
  value: data.total ?? 0,
  data: { diceGroups: [], ...data },
  ...extra,
});

function readout(previewPlan, rolled, extra = {}) {
  return buildReadoutModel(
    {
      plan: previewPlan,
      result: rolled,
      rolling: false,
      resolved: true,
      actorName: 'Sera Vane',
      consumption: { consumeOnFail: true, breakToolsOnFail: false },
      ...extra,
    },
    text
  );
}

const rowIds = (model) => model.rows.map((row) => row.id);
const MARGIN_UNDER =
  'Margin is shown so that higher is always better: how far under the target the total landed.';

describe('the medallion and the breakdown', () => {
  it('shows a fixed DC’s first face captioned with its die, never the total (M2)', () => {
    const model = readout(plan(OVER), result(true, { total: 15, diceGroups: d20(9) }));
    assert.deepEqual(model.medallion, { value: '9', caption: 'd20' });
    assert.deepEqual([model.total, model.totalValue], ['15', 15]);
    assert.equal(model.breakdown, 'd20 9 +6 · Sera Vane');
  });

  it('shows a roll-under or character total captioned "total", with raw only under (M1, M3)', () => {
    const rolled = result(true, { total: 13, target: 14, margin: 1, diceGroups: threeD6 });
    const under = readout(plan(UNDER), rolled);
    assert.deepEqual(under.medallion, { value: '13', caption: 'total' });
    assert.equal(under.breakdown, '5 + 5 + 3 · raw · Sera Vane');
    const character = readout(plan(CHARACTER_OVER), rolled);
    assert.deepEqual(character.medallion, { value: '13', caption: 'total' });
    assert.equal(character.breakdown, '5 + 5 + 3 · Sera Vane');
  });

  it('signs "+0" on a fixed DC and writes every negative with the true minus (M4, M5)', () => {
    const zero = readout(plan(OVER), result(false, { total: 9, diceGroups: d20(9) }));
    assert.equal(zero.breakdown, 'd20 9 +0 · Sera Vane');
    const negative = readout(plan(OVER), result(false, { total: 7, diceGroups: d20(9) }));
    assert.equal(negative.breakdown, 'd20 9 −2 · Sera Vane');
    const under = readout(
      plan(UNDER),
      result(false, { total: -2, target: 1, margin: -3, diceGroups: [] })
    );
    assert.equal(under.total, '−2');
    assert.equal(under.targetLine, 'target 1 · margin −3');
  });
});

describe('the target line', () => {
  it('names only the DC on a pass/fail fixed DC, and the margin on a relative route (M6)', () => {
    const rolled = result(true, { total: 15, diceGroups: d20(12) });
    const passFail = readout(plan(OVER), rolled);
    assert.equal(passFail.targetLine, 'vs DC 12');
    assert.deepEqual([passFail.target, passFail.margin, passFail.marginKind], [12, 3, '']);
    const routedPlan = plan(OVER, { kind: 'routed', args: { type: 'relative' } });
    const routed = readout(routedPlan, { ...rolled, outcome: 'Fine' });
    assert.equal(routed.targetLine, 'vs DC 12 · +3');
    assert.equal(routed.marginKind, 'margin');
    const below = readout(routedPlan, { ...result(false, { total: 9, diceGroups: d20(9) }), outcome: 'Poor' });
    assert.equal(below.targetLine, 'vs DC 12 · −3');
  });

  it('names the band the total fell in, or none, and never a DC (M12)', () => {
    const bands = [
      { id: 'low', name: 'Low', start: 1, end: 11, success: false },
      { id: 'high', name: 'High', start: 10, end: 14, success: true },
      { id: 'top', name: 'Top', start: 15, end: 20, success: true },
    ];
    const routedPlan = plan(OVER, { kind: 'routed', args: { type: 'fixed', fixedOutcomes: bands } });
    const inBand = readout(routedPlan, {
      ...result(true, { total: 12, outcomeId: 'high', diceGroups: d20(12) }),
      outcome: 'High',
    });
    assert.equal(inBand.targetLine, 'in the 10–14 band');
    assert.equal(inBand.card.detail, 'Counts as a success · result set bound to this tier');
    const stepped = readout(routedPlan, {
      ...result(true, {
        total: 11,
        outcomeId: 'top',
        diceGroups: d20(11),
        tierStepApplied: { mode: 'up', steps: 1 },
      }),
      outcome: 'Top',
    });
    assert.equal(stepped.targetLine, 'in the 10–14 band', 'the rolled band, highest start, not the stepped one');
    assert.equal(stepped.card.title, 'Top');
    const outside = readout(routedPlan, {
      ...result(false, { total: 30, outcomeId: null, diceGroups: d20(20) }),
      outcome: null,
    });
    assert.equal(outside.targetLine, 'outside every band');
    const fractional = readout(routedPlan, {
      ...result(true, { total: 14.5, outcomeId: 'high', diceGroups: d20(12) }),
      outcome: 'High',
    });
    assert.equal(fractional.targetLine, 'in the 10–14 band', 'a fractional total floors, as routing does (issue 2059)');
    assert.deepEqual([outside.card.title, outside.card.detail, outside.card.tone], [
      'Failure',
      'Nothing is produced',
      'danger',
    ]);
  });

  it('reads "No tiers configured" only when the check has no tiers at all', () => {
    const failing = [{ id: 'ruined', name: 'Ruined', dc: 0, success: false }];
    const routed = (relativeOutcomes) =>
      plan(OVER, { kind: 'routed', args: { type: 'relative', relativeOutcomes } });
    const forced = readout(routed(failing), {
      ...result(true, { total: 15, diceGroups: d20(12), forcedOutcome: 'success' }),
      outcome: null,
    });
    // No tier caught it, so no result group is produced, even though a trigger forced success.
    assert.deepEqual([forced.card.title, forced.card.detail, forced.card.tone], [
      'Failure',
      'Nothing is produced',
      'danger',
    ]);
    assert.deepEqual(forced.note, {
      kind: 'forced',
      text: 'Trigger fired — forced to success, but no succeeding tier exists, so nothing is produced.',
    });
    const forcedFailure = readout(routed(failing), {
      ...result(false, { total: 15, diceGroups: d20(12), forcedOutcome: 'failure' }),
      outcome: null,
    });
    assert.equal(
      forcedFailure.note.text,
      'Trigger fired — forced to the worst failing tier.',
      'every other forced note is unchanged'
    );
    assert.deepEqual(forced.rows.map((row) => [row.id, row.label, row.meta]), [
      ['failure-result', 'Failure result if this recipe defines one', 'per recipe'],
      ['ingredients', 'Ingredients consumed', 'policy on'],
      ['tools', 'Tools survive', 'policy off'],
    ]);
    const empty = readout(routed([]), { ...result(false, { total: 15, diceGroups: d20(12) }), outcome: null });
    assert.deepEqual([empty.card.title, empty.card.detail], [
      'No tiers configured',
      'Add at least one outcome tier for this check to resolve',
    ]);
  });

  it('shows no target line for a result graded with no target, never a target of 0', () => {
    const model = readout(
      plan(CHARACTER_OVER, { kind: 'routed', args: { type: 'relative' } }),
      { ...result(false, { total: 97, target: null, margin: null, diceGroups: [] }), outcome: 'Otherwise' }
    );
    assert.deepEqual([model.targetLine, model.target, model.margin], ['', null, null]);
    assert.equal(model.note, null, 'no margin is shown, so no margin is explained');
  });
});

describe('the note', () => {
  it('always explains a roll-under, character or count margin and never a plain fixed DC (M7)', () => {
    const under = readout(plan(UNDER), result(true, { total: 9, target: 14, margin: 5, diceGroups: [] }));
    assert.deepEqual(under.note, { kind: 'margin', text: MARGIN_UNDER });
    const character = readout(
      plan(CHARACTER_OVER),
      result(true, { total: 60, target: 55, margin: 5, diceGroups: [] })
    );
    assert.equal(
      character.note.text,
      'Margin is shown so that higher is always better: how far over the target the total landed.'
    );
    const count = readout(plan(COUNT, { dc: 2 }), result(true, { total: 3, margin: 1 }));
    assert.equal(
      count.note.text,
      'Margin is shown so that higher is always better: successes over what was needed.'
    );
    const fixed = readout(plan(OVER), result(true, { total: 15, diceGroups: d20(12) }));
    assert.equal(fixed.note, null, 'a fixed DC notes only a trigger');
  });

  it('gives the one note slot to a forced outcome over a tier step (deviation 2)', () => {
    const routedPlan = plan(OVER, { kind: 'routed', args: { type: 'relative' } });
    const data = { total: 15, diceGroups: d20(12), tierStepApplied: { mode: 'up', steps: 1 } };
    const forced = readout(routedPlan, { ...result(true, { ...data, forcedOutcome: 'success' }), outcome: 'Fine' });
    assert.equal(forced.note.kind, 'forced');
    assert.equal(readout(routedPlan, { ...result(true, data), outcome: 'Fine' }).note.kind, 'trigger');
  });

  it('names a trigger’s step direction and its count, or the tier it placed (M13)', () => {
    const routedPlan = plan(OVER, { kind: 'routed', args: { type: 'relative' } });
    const stepped = (mode, steps) =>
      readout(routedPlan, {
        ...result(true, { total: 15, diceGroups: d20(12), tierStepApplied: { mode, steps } }),
        outcome: 'Masterwork',
      }).note;
    assert.deepEqual(stepped('up', 1), {
      kind: 'trigger',
      text: 'Trigger fired — the result steps up 1 tier.',
    });
    assert.equal(stepped('up', 2).text, 'Trigger fired — the result steps up 2 tiers.');
    assert.equal(stepped('down', 1).text, 'Trigger fired — the result steps down 1 tier.');
    assert.equal(stepped('down', 3).text, 'Trigger fired — the result steps down 3 tiers.');
    assert.equal(stepped('target', 2).text, 'Trigger fired — the result is forced to Masterwork.');
  });

  it('explains a trigger-forced outcome in its kind’s own words (M17b)', () => {
    const forced = (previewPlan, success, extra = {}) =>
      readout(previewPlan, {
        ...result(success, { total: 5, diceGroups: d20(1), forcedOutcome: success ? 'success' : 'failure' }),
        ...extra,
      }).note;
    assert.deepEqual(forced(plan(OVER), true), {
      kind: 'forced',
      text: 'Trigger fired — automatic success.',
    });
    assert.equal(forced(plan(OVER), false).text, 'Trigger fired — automatic failure.');
    const progressive = plan(OVER, { kind: 'progressive' });
    assert.equal(
      forced(progressive, true, { success: true }).text,
      'Trigger fired — every result is awarded.'
    );
    assert.equal(forced(progressive, false, { success: true }).text, 'Trigger fired — nothing is awarded.');
    const routed = plan(OVER, { kind: 'routed', args: { type: 'relative' } });
    assert.equal(
      forced(routed, true, { outcome: 'Masterwork' }).text,
      'Trigger fired — forced to the best succeeding tier.'
    );
    assert.equal(
      forced(routed, false, { outcome: 'Ruined' }).text,
      'Trigger fired — forced to the worst failing tier.'
    );
    const countRouted = plan(COUNT, { kind: 'routed', dc: 2, args: { type: 'relative' } });
    assert.equal(
      forced(countRouted, true, { outcome: 'Masterwork' }).text,
      'Trigger fired — forced to the best succeeding tier.'
    );
    assert.equal(forced(plan(COUNT, { dc: 2 }), false).text, 'Trigger fired — automatic failure.');
  });

  it('gives the one note slot to a forced outcome over the margin note (R5)', () => {
    const under = plan(UNDER);
    const rolled = { total: 9, target: 14, margin: 5, diceGroups: [] };
    const forced = readout(under, result(false, { ...rolled, forcedOutcome: 'failure' }));
    assert.deepEqual(forced.note, { kind: 'forced', text: 'Trigger fired — automatic failure.' });
    assert.equal(readout(under, result(true, rolled)).note.kind, 'margin', 'positive control');
  });
});

describe('the result card', () => {
  it('names the success or failure and what the record produces', () => {
    const success = readout(plan(OVER), result(true, { total: 15, diceGroups: d20(12) }), {
      recordNoun: 'component',
    });
    assert.deepEqual(success.card, {
      tone: 'success',
      icon: 'fas fa-circle-check',
      title: 'Success',
      detail: 'The component’s result set is produced',
    });
    const failure = readout(plan(OVER), result(false, { total: 5, diceGroups: d20(2) }));
    assert.deepEqual(failure.card, {
      tone: 'danger',
      icon: 'fas fa-circle-xmark',
      title: 'Failure',
      detail: 'Nothing is produced',
    });
  });

  it('reads a rescued botch as a success with the normal line, and botches only when not (M8)', () => {
    const countPlan = plan(COUNT, { dc: 2 });
    const net = { total: -1, margin: -3, successes: 1, cancelled: 2 };
    const rescued = readout(countPlan, result(true, net));
    assert.equal(rescued.count.botch, true, 'the net is below zero');
    assert.deepEqual([rescued.card.title, rescued.card.tone], ['Success', 'success']);
    assert.deepEqual([rescued.targetLine, rescued.marginKind], ['needs 2 · margin −3', 'margin']);
    const botched = readout(countPlan, result(false, net));
    assert.deepEqual([botched.card.title, botched.card.detail], ['Botch', 'Net below zero']);
    assert.deepEqual(
      [botched.targetLine, botched.marginKind],
      ['needs 2 · a net below zero is a botch', 'botch']
    );
    assert.equal(botched.note, null, 'the botch line shows no margin, so none is explained');
  });

  it('reads a routed count against the check’s own required count, not the tier floor (F1)', () => {
    const routedCount = plan(COUNT, { kind: 'routed', dc: 1, args: { type: 'relative' } });
    // The engine measures a routed margin from the rolled tier's floor (0 here).
    const rescued = readout(routedCount, {
      ...result(true, { total: -3, margin: -3, successes: 0, cancelled: 3, forcedOutcome: 'success' }),
      outcome: 'Success',
    });
    assert.deepEqual([rescued.targetLine, rescued.target, rescued.margin], ['needs 1 · margin −4', 1, -4]);
    const unforced = readout(routedCount, {
      ...result(false, { total: 0, margin: 0, successes: 0, cancelled: 0 }),
      outcome: 'Failure',
    });
    assert.equal(unforced.targetLine, 'needs 1 · margin −1');
  });

  it('titles a routed zero pool "Failure", whatever tier the runner names', () => {
    const routedCount = plan(COUNT, { kind: 'routed', dc: 1, args: { type: 'relative' } });
    const model = readout(routedCount, { ...result(false, { total: null, zeroPool: true }), outcome: 'Ruined' });
    assert.deepEqual([model.card.title, model.card.tone], ['Failure', 'danger']);
  });

  it('fails a zero pool with a 0 net, its own breakdown, target line and note (M14)', () => {
    const model = readout(plan(COUNT, { dc: 3 }), result(false, { total: null, zeroPool: true }));
    assert.deepEqual(model.medallion, { value: '0', caption: 'net' });
    assert.equal(model.breakdown, 'pool reduced to 0 · Sera Vane');
    assert.equal(model.targetLine, 'needs 3 · margin −3');
    assert.deepEqual(model.note, {
      kind: 'zero-pool',
      text: 'The pool was reduced to zero, so the check fails automatically.',
    });
    assert.deepEqual([model.card.title, model.card.tone], ['Failure', 'danger']);
    assert.deepEqual(model.count, { dice: { tiles: [], more: 0 }, zeroPool: true, botch: false });
  });
});

describe('what happens', () => {
  it('lists one row for a roll-under, character or count, plus tools only when they break (M9)', () => {
    const rolled = { total: 9, target: 14, margin: 5, diceGroups: [] };
    assert.deepEqual(rowIds(readout(plan(UNDER), result(true, rolled))), ['result-group']);
    assert.deepEqual(rowIds(readout(plan(CHARACTER_OVER), result(false, rolled))), ['failure-result']);
    assert.deepEqual(
      rowIds(readout(plan(COUNT, { dc: 2 }), result(false, { total: 1, margin: -1 }))),
      ['failure-result']
    );
    const broken = readout(plan(UNDER), result(true, { ...rolled, breakTools: true }));
    assert.deepEqual(broken.rows.map((row) => [row.id, row.meta]), [
      ['result-group', 'Success'],
      ['tools', 'by tier'],
    ]);
    assert.deepEqual(
      rowIds(readout(plan(OVER), result(false, { total: 5, diceGroups: d20(2) }))),
      ['failure-result', 'ingredients', 'tools'],
      'positive control: a fixed DC lists every consequence'
    );
  });

  it('reads the failure-result policy as never, per record or always (M10)', () => {
    const rolled = result(false, { total: 20, target: 14, margin: -6, diceGroups: [] });
    const meta = (failureResultPolicy) =>
      readout(plan(UNDER), rolled, { failureResultPolicy, recordNoun: 'recipe' }).rows[0];
    assert.deepEqual(
      [meta('never').meta, meta('perRecord').meta, meta('always').meta],
      ['never', 'per recipe', 'always']
    );
    assert.equal(meta('never').label, 'Failure policy applies');
    const fixed = (failureResultPolicy) =>
      readout(plan(OVER), result(false, { total: 5, diceGroups: d20(2) }), {
        failureResultPolicy,
        recordNoun: 'gathering row',
      }).rows[0];
    assert.deepEqual(
      [fixed('never').label, fixed('perRecord').label, fixed('always').label],
      ['Nothing produced', 'Failure result if this gathering row defines one', 'Failure result produced']
    );
    assert.deepEqual(
      [fixed('never').tone, fixed('perRecord').tone, fixed('always').tone],
      ['danger', 'neutral', 'warning']
    );
  });

  it('reads a fixed DC’s consumption from the activity’s own policies', () => {
    const failed = result(false, { total: 5, diceGroups: d20(2) });
    const rows = (activity, consumption) =>
      readout(plan(OVER), failed, { activity, consumption }).rows.map((row) => [row.label, row.meta]);
    assert.deepEqual(rows('crafting', { consumeOnFail: false, breakToolsOnFail: true }).slice(1), [
      ['Ingredients returned', 'policy off'],
      ['Required tools break', 'policy on'],
    ]);
    assert.deepEqual(rows('salvage', { consumeOnFail: true, breakToolsOnFail: false }).slice(1), [
      ['Item consumed', 'policy on'],
      ['Tools survive', 'policy off'],
    ]);
    assert.deepEqual(
      rows('gathering', { consumeOnFail: true, breakToolsOnFail: true }).slice(1),
      [],
      'gathering consumes no ingredients and has no tool policy of its own'
    );
    const success = readout(plan(OVER), result(true, { total: 15, diceGroups: d20(12) }));
    assert.deepEqual(success.rows.map((row) => [row.label, row.meta]), [
      ['Result set produced', 'full'],
      ['Ingredients consumed', 'as listed'],
    ]);
  });

  it('names the cause of broken tools with the engine’s precedence, the tier first', () => {
    const trigger = {
      id: 'shatter',
      breakTools: true,
      condition: { type: 'rollTotal', operator: '>=', value: 15 },
    };
    const routedPlan = plan(OVER, { kind: 'routed', args: { type: 'relative', triggers: [trigger] } });
    const both = readout(routedPlan, {
      ...result(true, { total: 15, diceGroups: d20(12), breakTools: true }),
      outcome: 'Fine',
    });
    assert.deepEqual(both.rows.at(-1), {
      id: 'tools',
      icon: 'fas fa-hammer',
      tone: 'danger',
      label: 'Required tools break',
      meta: 'by tier',
    });
    assert.equal(both.rows[0].meta, 'Fine', 'a routed success names its tier');
    const triggerOnly = readout(routedPlan, {
      ...result(true, { total: 15, diceGroups: d20(12), breakTools: false }),
      outcome: 'Fine',
    });
    assert.equal(triggerOnly.rows.at(-1).meta, 'by trigger');
  });
});

describe('a progressive readout (R8)', () => {
  const progressive = plan(OVER, { kind: 'progressive' });
  const spend = (value, sandbox, data = {}) =>
    readout(
      progressive,
      { success: true, outcome: null, value, data: { total: value, diceGroups: d20(9), ...data } },
      { sandbox }
    );

  it('reads what the value bought down the typed order, and what it left over', () => {
    const model = spend(20, { difficulties: [8, 5, 10, 4], awardMode: 'equal' });
    assert.deepEqual([model.card.title, model.card.detail, model.card.tone], [
      '2 of 4 awarded',
      '7 left over — not enough for the next result',
      'success',
    ]);
    assert.deepEqual(model.rows.map((row) => [row.label, row.meta]), [
      ['Result 1', 'awarded'],
      ['Result 2', 'awarded'],
    ]);
    assert.equal(model.targetLine, 'value spent');
    assert.equal(model.note, null, 'a progressive check carries no margin');
  });

  it('marks a partial award, a fully spent value, and nothing recovered', () => {
    const partial = spend(10, { difficulties: [8, 5], awardMode: 'partial' });
    assert.deepEqual(partial.rows.map((row) => row.meta), ['awarded', 'partial']);
    assert.equal(partial.card.detail, 'The value is fully spent');
    const none = spend(3, { difficulties: [8], awardMode: 'equal' });
    assert.deepEqual([none.card.title, none.card.tone], ['0 of 1 awarded', 'danger']);
    assert.deepEqual(none.rows, [
      { id: 'nothing', icon: 'fas fa-ban', tone: 'muted', label: 'Nothing recovered', meta: '—' },
    ]);
  });

  it('awards everything on a forced success and keeps "Awards n" with no typed order', () => {
    const forced = spend(Number.MAX_SAFE_INTEGER, { difficulties: [8, 5] }, { forcedOutcome: 'success' });
    assert.deepEqual([forced.card.title, forced.card.detail], ['2 of 2 awarded', 'The value is fully spent']);
    const untyped = spend(14, { difficulties: [] });
    assert.equal(untyped.card.title, 'Awards 14');
    assert.deepEqual(untyped.rows, []);
    const forcedUntyped = spend(Number.MAX_SAFE_INTEGER, { difficulties: [] }, { forcedOutcome: 'success' });
    assert.equal(forcedUntyped.card.title, 'Awards every result', 'never the sentinel value');
  });
});

describe('the readout’s state', () => {
  it('labels Roll by activity and the waiting hint by record, then Roll again', () => {
    const waiting = readout(plan(OVER), null, { activityLabel: 'salvage', recordNoun: 'component' });
    assert.equal(waiting.rollLabel, 'Roll a test salvage check');
    assert.equal(
      waiting.waitingHint,
      'Roll a test check to see exactly which outcome a component lands on and what it costs the character.'
    );
    assert.deepEqual([waiting.medallion, waiting.card, waiting.note, waiting.rows], [null, null, null, []]);
    const rolled = readout(plan(OVER), result(true, { total: 15, diceGroups: d20(12) }));
    assert.equal(rolled.rollLabel, 'Roll again');
  });

  it('withholds every rolled figure while abstaining', () => {
    const model = readout(plan(UNDER), result(true, { total: 9, target: 14, margin: 5 }), {
      abstention: { reason: 'needs-preview-actor' },
    });
    assert.equal(model.abstain.reason, 'needs-preview-actor');
    assert.deepEqual([model.medallion, model.card, model.targetLine], [null, null, '']);
  });
});

describe('the Preview’s additional dice (issue 2008)', () => {
  const PATH = 'system.resources.momentum.value';
  const paid = (rule = {}, product = 'count') => ({
    ...COUNT,
    product,
    pool: {
      die: 10,
      additionalDice: {
        enabled: true,
        source: 'path',
        path: PATH,
        readMacroUuid: '',
        spendMacroUuid: '',
        max: 3,
        label: 'Momentum',
        ...rule,
      },
    },
  });
  const stored = (value) => ({
    name: 'Sera Vane',
    readStored: (path) => ({ value: path === PATH ? value : undefined, overridden: false }),
  });
  const bounds = (evaluation, character = stored(2)) =>
    readout(plan(evaluation), null, { character }).additionalDice;

  it('offers no stepper unless a counting check allows additional dice', () => {
    assert.equal(readout(plan(COUNT), null).additionalDice, null);
    assert.equal(bounds(paid({ enabled: false })), null);
    assert.equal(bounds(paid({}, 'sum')), null);
  });

  it('bounds a path source by the Preview-as actor’s stored balance and the per-roll most', () => {
    assert.deepEqual(bounds(paid()), {
      limit: 2,
      note: { kind: 'path', text: 'Up to 2 for Sera Vane (Momentum 2, at most 3 per roll).' },
    });
    assert.deepEqual(bounds(paid({ max: 1, label: '' }), stored(2.7)), {
      limit: 1,
      note: { kind: 'path', text: 'Up to 1 for Sera Vane (2 available, at most 1 per roll).' },
    });
  });

  it('adds nothing for an unreadable balance, no actor or no source, and says which', () => {
    const unreadable = 'Sera Vane has no stored number at system.resources.momentum.value, so no dice can be added.';
    for (const value of [undefined, '3', -1, NaN]) {
      assert.deepEqual(bounds(paid(), stored(value)), {
        limit: 0,
        note: { kind: 'unreadable', text: unreadable },
      });
    }
    assert.deepEqual(bounds(paid(), null), {
      limit: 0,
      note: { kind: 'no-actor', text: 'Choose a character to see how many they can add.' },
    });
    const noSource = {
      limit: 0,
      note: { kind: 'no-source', text: 'This check has no source to pay for additional dice.' },
    };
    assert.deepEqual(bounds(paid({ path: '  ' })), noSource);
    assert.deepEqual(bounds(paid({ source: 'macro', readMacroUuid: 'Macro.read' })), noSource);
  });

  it('adds nothing for a balance an active effect sets, and says so (issue 2008)', () => {
    const overridden = {
      name: 'Sera Vane',
      readStored: () => ({ value: 2, overridden: true }),
    };
    assert.deepEqual(bounds(paid(), overridden), {
      limit: 0,
      note: {
        kind: 'overridden',
        text: "An active effect changes Sera Vane's system.resources.momentum.value, so no dice can be added.",
      },
    });
  });

  it('bounds a macro source by its most per roll, reading nothing', () => {
    const unread = {
      name: 'Sera Vane',
      readStored: () => assert.fail('a macro source reads no stored value'),
    };
    const macro = paid({ source: 'macro', readMacroUuid: 'Macro.read', spendMacroUuid: 'Macro.spend' });
    const note = 'The preview never runs the read macro, so up to 3 can be added here.';
    assert.deepEqual(bounds(macro, unread), { limit: 3, note: { kind: 'macro', text: note } });
    assert.deepEqual(bounds(macro, null), { limit: 3, note: { kind: 'macro', text: note } });
  });

  it('marks the dice a simulated roll bought on its tiles, from the engine’s own projection', () => {
    const results = [
      { index: 0, face: 9, qualified: true },
      { index: 1, face: 3 },
      { index: 2, face: 8, qualified: true },
    ];
    const rolled = result(true, { total: 2, successes: 2, cancelled: 0, diceGroups: [] }, {
      countDisplay: { results, bought: 1 },
    });
    const { dice } = readout(plan(paid()), rolled).count;
    assert.deepEqual(
      dice.tiles.map((tile) => tile.bought === true),
      [false, false, true]
    );
    assert.equal(dice.bought, 1);
  });
});
