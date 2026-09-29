/** Issues 2005 and 2006 — the read-only band pictures, drawn from the runtime's own grading. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  bandsAreEditable,
  buildCountBands,
  countBandScale,
  countPoolSettlesToZero,
  describeBandScale,
  describeCountBandRange,
  describeBandsUnavailable,
  buildPassFailBands,
  buildRoutedBands,
  describeBandRange,
  previewBandTarget,
  resolvePreviewTarget,
} from '../src/ui/svelte/apps/manager/checks/checkBandModel.js';
import { classifyCheckTotal } from '../src/systems/checkRouting.js';
import {
  missingTargetPaths,
  targetValueStatus,
} from '../src/ui/svelte/apps/manager/checks/checkTargetStatus.js';

const fallback = (_key, text) => text;
const NAMES = { success: 'Success', failure: 'Failure' };
const UNDER_FIXED = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
const attribute = (direction, adjustmentKind = 'add', baseAdjustment = null) => ({
  product: 'sum',
  direction,
  target: { source: 'attribute', expression: '@skills.craft.value', adjustmentKind, baseAdjustment },
});
const LADDER = [
  { id: 'extreme', name: 'Extreme', success: true, dc: 0, adjustment: 0.2 },
  { id: 'hard', name: 'Hard', success: true, dc: 0, adjustment: 0.5 },
  { id: 'regular', name: 'Regular', success: true, dc: 0, adjustment: 1 },
  { id: 'otherwise', name: 'Otherwise', success: false, dc: 0, adjustment: null },
];

const summary = (bands) =>
  bands.map((band) => `${band.name}: ${describeBandRange(band, fallback)}`).join('; ');

describe('bandsAreEditable', () => {
  it('keeps handles only for summed roll-over against a fixed DC', () => {
    assert.equal(bandsAreEditable(undefined), true);
    assert.equal(bandsAreEditable({ product: 'sum', direction: 'over' }), true);
    assert.equal(bandsAreEditable(UNDER_FIXED), false);
    assert.equal(bandsAreEditable(attribute('over')), false);
  });

  it('keeps a count record read-only, since the runtime grades it as count (issue 2004)', () => {
    assert.equal(bandsAreEditable({ ...attribute('under'), product: 'count' }), false);
  });
});

describe('buildPassFailBands', () => {
  it('ends an inclusive under success at the target and a strict one a step below', () => {
    const meet = buildPassFailBands({ evaluation: UNDER_FIXED, comparison: 'meet', target: 12, names: NAMES });
    assert.equal(summary(meet), 'Success: 12 or under; Failure: 13 or over');
    const exceed = buildPassFailBands({ evaluation: UNDER_FIXED, comparison: 'exceed', target: 12, names: NAMES });
    assert.equal(summary(exceed), 'Success: 11 or under; Failure: 12 or over');
  });

  it('puts an over success at the high end', () => {
    const bands = buildPassFailBands({ evaluation: attribute('over'), comparison: 'meet', target: 14, names: NAMES });
    assert.equal(summary(bands), 'Failure: 13 or under; Success: 14 or over');
    assert.ok(bands[0].from < bands[1].from, 'value order');
  });

  it('widens a supplied reachable range to show the target', () => {
    const bands = buildPassFailBands({ evaluation: UNDER_FIXED, comparison: 'meet', target: 12, min: 3, max: 18, names: NAMES });
    assert.deepEqual([bands[0].from, bands.at(-1).to], [3, 18]);
  });
});

describe('buildRoutedBands', () => {
  it('draws the percentile ladder with Otherwise taking the remainder', () => {
    const bands = buildRoutedBands({
      evaluation: attribute('under', 'multiply'),
      comparison: 'meet',
      anchor: 55,
      type: 'relative',
      outcomes: LADDER,
    });
    assert.equal(summary(bands), 'Extreme: 11 or under; Hard: 12–27; Regular: 28–55; Otherwise: 56 or over');
    assert.deepEqual(
      bands.map((band) => band.index),
      [0, 1, 2, 3],
      'each band names its authored row'
    );
  });

  it('moves every edge a step toward the better end when strict', () => {
    const bands = buildRoutedBands({
      evaluation: attribute('under', 'multiply'),
      comparison: 'exceed',
      anchor: 55,
      type: 'relative',
      outcomes: LADDER,
    });
    assert.equal(summary(bands), 'Extreme: 10 or under; Hard: 11–26; Regular: 27–54; Otherwise: 55 or over');
  });

  it('floors a multiplied threshold', () => {
    const bands = buildRoutedBands({
      evaluation: attribute('under', 'multiply'),
      comparison: 'meet',
      anchor: 9,
      type: 'relative',
      outcomes: [LADDER[1], LADDER[3]],
    });
    assert.equal(summary(bands), 'Hard: 4 or under; Otherwise: 5 or over');
  });

  it('subtracts a benefit-signed offset under and clamps into the least demanding tier', () => {
    const bands = buildRoutedBands({
      evaluation: UNDER_FIXED,
      comparison: 'meet',
      anchor: 12,
      type: 'relative',
      outcomes: [
        { id: 'superb', name: 'Superb', success: true, dc: 5 },
        { id: 'fine', name: 'Fine', success: true, dc: 0 },
        { id: 'poor', name: 'Poor', success: false, dc: -20 },
      ],
    });
    assert.equal(summary(bands), 'Superb: 7 or under; Fine: 8–12; Poor: 13 or over');
  });

  it('draws a fixed-range check as authored', () => {
    const bands = buildRoutedBands({
      evaluation: UNDER_FIXED,
      comparison: 'meet',
      anchor: 0,
      type: 'fixed',
      outcomes: [
        { id: 'b', name: 'B', start: 6, end: 10 },
        { id: 'a', name: 'A', start: 1, end: 5 },
      ],
    });
    assert.equal(summary(bands), 'A: 5 or under; B: 6 or over');
    assert.deepEqual(bands.map((band) => band.index), [1, 0]);
  });

  it('adds a roll-under modifier total after the multiply, as the runtime routes it', () => {
    const idrin = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };
    const evaluation = attribute('under', 'multiply');
    const previewed = previewBandTarget(
      { evaluation, anchor: 0, tier: { name: 'Standard', adjustment: 1 }, character: idrin, modifiers: 6 },
      fallback
    );
    assert.deepEqual([previewed.anchor, previewed.delta, previewed.target], [55, 6, 61]);
    const bands = buildRoutedBands({
      evaluation,
      comparison: 'meet',
      anchor: previewed.anchor,
      targetDelta: previewed.delta,
      type: 'relative',
      outcomes: LADDER,
    });
    assert.deepEqual(
      bands.map((band) => `${band.name}: ${describeBandRange(band, fallback)}`),
      ['Extreme: 17 or under', 'Hard: 18–33', 'Regular: 34–61', 'Otherwise: 62 or over']
    );
    for (let total = bands[0].from; total <= bands.at(-1).to; total += 1) {
      const { matched } = classifyCheckTotal({
        type: 'relative',
        total,
        dc: 55,
        targetDelta: 6,
        comparison: 'meet',
        relativeOutcomes: LADDER,
        fixedOutcomes: [],
        triggers: [],
        clampToNearest: true,
        evaluation,
      });
      const band = bands.find((entry) => total >= entry.from && total <= entry.to);
      assert.equal(band.id, matched.id, `total ${total}`);
    }
  });

  it('draws nothing with no tiers', () => {
    assert.deepEqual(
      buildRoutedBands({ evaluation: UNDER_FIXED, anchor: 10, type: 'relative', outcomes: [] }),
      []
    );
  });
});

describe('resolvePreviewTarget', () => {
  const character = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };

  it('keeps a fixed anchor and needs no character', () => {
    assert.deepEqual(resolvePreviewTarget({ evaluation: UNDER_FIXED, anchor: 12 }), {
      state: 'ok',
      target: 12,
      value: null,
    });
  });

  it('asks for a character before reading a path, and names a missing one', () => {
    assert.deepEqual(resolvePreviewTarget({ evaluation: attribute('under'), anchor: 0 }), {
      state: 'needs-actor',
    });
    assert.deepEqual(
      resolvePreviewTarget({
        evaluation: attribute('under'),
        anchor: 0,
        character: { name: 'Vosk', rollData: {} },
      }),
      { state: 'unresolved', reason: 'unresolved-path' }
    );
  });

  it('applies the record adjustment, else the base, and floors', () => {
    const evaluation = attribute('under', 'multiply', 0.5);
    assert.deepEqual(resolvePreviewTarget({ evaluation, anchor: 0, character }), {
      state: 'ok',
      target: 27,
      value: 55,
    });
    assert.equal(resolvePreviewTarget({ evaluation, anchor: 0, adjustment: 0.2, character }).target, 11);
  });

  it('resolves an actor-free literal without a character', () => {
    const evaluation = { ...attribute('under', 'add', -2), target: { source: 'attribute', expression: '14', baseAdjustment: -2 } };
    assert.equal(resolvePreviewTarget({ evaluation, anchor: 0 }).target, 12);
  });
});

describe('the read-only strip copy', () => {
  it('states the target and where success sits, in the plain comparison word', () => {
    assert.equal(
      describeBandScale({ direction: 'under', comparison: 'exceed', target: 12, cmp: 'under' }, fallback),
      'Target 12. Success sits at the low end: a total under 12 succeeds.'
    );
    assert.equal(
      describeBandScale(
        { direction: 'under', comparison: 'meet', target: 27, source: 'Idrin 55, Hard ×½', cmp: 'at or under' },
        fallback
      ),
      'Target 27 (Idrin 55, Hard ×½). Success sits at the low end: a total at or under 27 succeeds.'
    );
    assert.equal(
      describeBandScale({ direction: 'over', comparison: 'meet', target: 14, source: 'Idrin 14' }, fallback),
      'Target 14 (Idrin 14). Success sits at the high end: a total of 14 or more succeeds.'
    );
    assert.equal(
      describeBandScale({ direction: 'over', comparison: 'exceed', target: 14 }, fallback),
      'Target 14. Success sits at the high end: a total above 14 succeeds.'
    );
  });

  it('names the missing actor or value instead of charting a zero', () => {
    assert.match(describeBandsUnavailable({ state: 'needs-actor' }, {}, fallback), /Choose a character/);
    assert.equal(
      describeBandsUnavailable(
        { state: 'unresolved', reason: 'unresolved-path' },
        { character: { name: 'Vosk' }, expression: '@skills.craft.value' },
        fallback
      ),
      'Vosk is missing a value this check reads (@skills.craft.value), so it cannot resolve for them.'
    );
  });

  it('names only the paths the character is missing', () => {
    assert.equal(
      describeBandsUnavailable(
        { state: 'unresolved', reason: 'unresolved-path' },
        {
          character: { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } },
          expression: '@skills.craft.value + @skills.nope.mod + @skills.nope.mod',
        },
        fallback
      ),
      'Idrin is missing a value this check reads (@skills.nope.mod), so it cannot resolve for them.'
    );
  });

  it('gives every other refusal its own sentence, with or without a character', () => {
    const vosk = { name: 'Vosk', rollData: {} };
    const cases = [
      ['expression-missing', null, 'This check cannot roll: no target formula is set.'],
      ['expression-missing', vosk, 'This check cannot roll: no target formula is set.'],
      [
        'dice',
        null,
        'This check cannot roll: its target formula rolls dice, but a target must be a fixed number.',
      ],
      [
        'adjustment-invalid',
        vosk,
        'This check cannot roll: its difficulty adjustment is invalid; a multiplier must be above zero.',
      ],
    ];
    for (const [reason, character, sentence] of cases) {
      assert.equal(
        describeBandsUnavailable({ state: 'unresolved', reason }, { character, expression: '' }, fallback),
        sentence,
        reason
      );
    }
  });

  it('reports a real refusal from the preview target, never a missing value', () => {
    const idrin = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };
    const blank = { ...attribute('under'), target: { source: 'attribute', expression: '' } };
    const dice = { ...attribute('under'), target: { source: 'attribute', expression: '1d4 + 10' } };
    for (const [evaluation, character, pattern] of [
      [blank, null, /no target formula is set/],
      [blank, idrin, /no target formula is set/],
      [dice, null, /rolls dice/],
    ]) {
      const state = resolvePreviewTarget({ evaluation, anchor: 12, character });
      assert.match(describeBandsUnavailable(state, { character, expression: '' }, fallback), pattern);
    }
  });
});

describe('previewBandTarget', () => {
  const idrin = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };

  it('names the base adjustment when the previewed tier sets none', () => {
    const evaluation = attribute('over', 'add', -5);
    assert.equal(
      previewBandTarget({ evaluation, anchor: 0, character: idrin }, fallback).source,
      'Idrin @skills.craft.value 55, base −5'
    );
    assert.equal(
      previewBandTarget({ evaluation, anchor: 0, tier: { name: 'Hard', adjustment: -2 }, character: idrin }, fallback)
        .source,
      'Idrin @skills.craft.value 55, Hard −2'
    );
  });

  it('raises a roll-under target by the modifiers and names them, and leaves roll-over alone', () => {
    const under = previewBandTarget(
      { evaluation: attribute('under'), anchor: 0, character: idrin, modifiers: 1 },
      fallback
    );
    assert.equal(under.target, 56);
    assert.equal(under.source, 'Idrin @skills.craft.value 55, modifiers +1');
    const fixedUnder = previewBandTarget(
      { evaluation: { product: 'sum', direction: 'under' }, anchor: 10, character: idrin, modifiers: 1 },
      fallback
    );
    assert.deepEqual([fixedUnder.target, fixedUnder.source], [11, 'includes modifiers +1']);
    const over = previewBandTarget(
      { evaluation: attribute('over'), anchor: 0, character: idrin, modifiers: 1 },
      fallback
    );
    assert.deepEqual([over.target, over.source], [55, 'Idrin @skills.craft.value 55']);
  });

  it('leaves an actor-free literal unsourced', () => {
    const evaluation = { ...attribute('under'), target: { source: 'attribute', expression: '14' } };
    assert.deepEqual(previewBandTarget({ evaluation, anchor: 0 }, fallback), {
      state: 'ok',
      anchor: 14,
      delta: 0,
      target: 14,
      value: 14,
      source: '',
    });
  });
});

describe('targetValueStatus', () => {
  const idrin = { name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } };

  it('says nothing until an expression is written', () => {
    assert.equal(targetValueStatus('  ', idrin, fallback), null);
  });

  it('asks for a character before reading a path, and resolves one for the actor', () => {
    assert.equal(targetValueStatus('@skills.craft.value', null, fallback).tone, 'muted');
    assert.deepEqual(targetValueStatus('@skills.craft.value - 2', idrin, fallback), {
      tone: 'resolved',
      text: 'Idrin → 53',
    });
  });

  it('names only the missing paths, and states any other refusal as the runtime does', () => {
    assert.equal(
      targetValueStatus('@skills.nope.mod + 40', idrin, fallback).text,
      'Idrin has no value at @skills.nope.mod. The check cannot resolve for them.'
    );
    assert.deepEqual(targetValueStatus('1d4 + 10', null, fallback), {
      tone: 'unresolved',
      text: 'This check cannot roll: its target formula rolls dice, but a target must be a fixed number.',
    });
    assert.deepEqual(missingTargetPaths('@a + @{b.c} + @a', { a: 1 }), ['@{b.c}']);
  });
});

describe('count bands (issue 2006)', () => {
  const COUNT_NAMES = { ...NAMES, botch: 'Botch' };
  const counting = ({ cancel = true, direction = 'over', ...pool } = {}) => ({
    product: 'count',
    direction,
    pool: { die: 10, base: '4', threshold: '8', cancel: { enabled: cancel }, ...pool },
  });
  // Authored best first: the ladder is ranked by threshold, never by list order.
  const FORGE = [
    { id: 'masterwork', name: 'Masterwork', success: true, dc: 3 },
    { id: 'fine', name: 'Fine', success: true, dc: 1 },
    { id: 'success', name: 'Success', success: true, dc: 0 },
    { id: 'ruined', name: 'Ruined', success: false, dc: -2 },
  ];
  const countSummary = (bands) =>
    bands.map((band) => `${band.name}: ${describeCountBandRange(band, fallback)}`).join('; ');

  it('N11: states the ladder in net successes at required + dc, a Botch first while cancelling', () => {
    const bands = buildCountBands({
      evaluation: counting(),
      required: 2,
      outcomes: FORGE,
      names: COUNT_NAMES,
    });
    assert.equal(
      countSummary(bands),
      'Botch: below 0; Ruined: 0–1; Success: 2; Fine: 3–4; Masterwork: 5 or more'
    );
    assert.deepEqual(
      bands.map((band) => band.tone),
      ['danger', 'danger', 'warning', 'info', 'accent'],
      'the botch is the worst hue and the tiers walk the ramp by net'
    );
  });

  it('N11: drops the Botch band only when cancelling is off', () => {
    const bands = buildCountBands({
      evaluation: counting({ cancel: false }),
      required: 2,
      outcomes: FORGE,
      names: COUNT_NAMES,
    });
    assert.equal(countSummary(bands), 'Ruined: 0–1; Success: 2; Fine: 3–4; Masterwork: 5 or more');
  });

  it('agrees with the routed grading the runner uses at every net it draws', () => {
    const bands = buildCountBands({
      evaluation: counting({ cancel: false }),
      required: 2,
      outcomes: FORGE,
      names: COUNT_NAMES,
    });
    for (let net = 0; net <= 8; net += 1) {
      const { matched } = classifyCheckTotal({
        type: 'relative',
        total: net,
        dc: 2,
        comparison: 'meet',
        relativeOutcomes: FORGE,
        fixedOutcomes: [],
        triggers: [],
        clampToNearest: true,
      });
      const band = bands.findLast((entry) => entry.from <= net);
      assert.equal(band.id, matched.id, `net ${net}`);
    }
  });

  it('never reverses the ladder for a per-die test under the threshold', () => {
    const under = buildCountBands({
      evaluation: counting({ direction: 'under' }),
      required: 2,
      outcomes: FORGE,
      names: COUNT_NAMES,
    });
    assert.equal(
      countSummary(under),
      'Botch: below 0; Ruined: 0–1; Success: 2; Fine: 3–4; Masterwork: 5 or more'
    );
  });

  it('draws a simple check as Failure and Success at its successes needed', () => {
    const bands = buildCountBands({ evaluation: counting(), required: 3, names: COUNT_NAMES });
    assert.equal(countSummary(bands), 'Botch: below 0; Failure: 0–2; Success: 3 or more');
  });

  it('draws fixed ranges as authored, with a Botch only where the lowest range starts at 0', () => {
    const ranges = [
      { id: 'bad', name: 'Bad', success: false, start: 0, end: 1 },
      { id: 'good', name: 'Good', success: true, start: 2, end: 6 },
    ];
    const names = COUNT_NAMES;
    const fixed = buildCountBands({ evaluation: counting(), type: 'fixed', outcomes: ranges, names });
    assert.equal(countSummary(fixed), 'Botch: below 0; Bad: 0–1; Good: 2–6');
    const shifted = ranges.map((range) => ({ ...range, start: range.start + 1, end: range.end + 1 }));
    const noBotch = buildCountBands({ evaluation: counting(), type: 'fixed', outcomes: shifted, names });
    assert.equal(countSummary(noBotch), 'Bad: 1–2; Good: 3–7');
  });

  it('draws nothing for a routed check with no tiers', () => {
    const bands = buildCountBands({ evaluation: counting(), required: 2, outcomes: [], names: COUNT_NAMES });
    assert.deepEqual(bands, []);
  });

  it('states the scale in successes, with the zero-pool and botch clauses', () => {
    assert.equal(
      countBandScale({ required: 2 }, fallback),
      'Measured in successes. The count must reach 2.'
    );
    assert.equal(
      countBandScale({ required: 2, zeroPool: true, cancels: true }, fallback),
      'Measured in successes. The count must reach 2; this pool is reduced to zero, so the check fails automatically. A net below zero is a botch.'
    );
  });

  it("reads a zero pool from the actor's settled pool, never a refusal", () => {
    const zero = (pool, extra = {}) =>
      countPoolSettlesToZero({ evaluation: counting(pool), thresholdMode: 'meet', ...extra });
    assert.equal(zero({ base: '0', zeroPoolFails: true }), true);
    assert.equal(zero({ base: '0', zeroPoolFails: false }), false);
    assert.equal(zero({ base: '@a.b', zeroPoolFails: true }), false, 'no actor is not zero');
    const actor = { name: 'Idrin', rollData: { a: { b: 1 } } };
    assert.equal(zero({ base: '@a.b', zeroPoolFails: true }, { character: actor }), false);
    const penalty = { poolDelta: -1, thresholdDelta: 0, preRolls: [] };
    assert.equal(
      zero({ base: '@a.b', zeroPoolFails: true }, { character: actor, placement: penalty }),
      true
    );
  });
});
