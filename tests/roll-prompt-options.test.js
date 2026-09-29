import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInteractiveRollOptions,
  buildSinglePromptData,
  normalizeSituationalBonus,
  promptBulkCheckRoll,
  promptCheckRoll,
  translatePromptAnswer,
} from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { resolveCheckDecision } from '../src/systems/checkRollDecision.js';
import { rollPromptTarget } from '../src/ui/svelte/apps/crafting/rollPromptTarget.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { stubI18n, stubPromptSurface } from './helpers/rollPromptDialogStub.js';

const choice = {
  modifiers: [{ id: 'a', label: 'A', display: '+1' }, { id: 'b', label: 'B', display: '+1d4' }],
  maxPicks: 2,
  defaultSelectedIds: ['a', 'b'],
};

async function open(args, answer) {
  const surface = stubPromptSurface(() => answer);
  try {
    return { view: null, result: await promptCheckRoll(args), ...surface, surface };
  } finally {
    surface.restore();
  }
}

describe('roll prompt adapter', () => {
  it('builds the automated-caller bag with a strict interactive flag and no stray keys', () => {
    for (const interactive of [false, undefined, 'true']) {
      assert.equal(buildInteractiveRollOptions({ interactive }).interactive, false);
    }
    const options = buildInteractiveRollOptions({
      interactive: true, actor: { name: 'Brenna' }, activity: 'Crafting', name: 'Iron', dc: 12, img: 'icons/iron.webp',
    });
    assert.equal(options.interactive, true);
    assert.equal(options.img, 'icons/iron.webp');
    assert.deepEqual(Object.keys(options).sort(), [
      'activity', 'dc', 'flavor', 'img', 'interactive', 'name', 'prompt', 'rollMode', 'speaker',
    ]);
  });

  it('names a DC in the chat flavor only for a summed roll-over fixed target, else a Target (Q20)', () => {
    const flavor = (evaluation, dc = 14) => buildInteractiveRollOptions(
      { interactive: true, actor: null, name: 'Rope', activity: 'Crafting', dc, evaluation },
      () => null
    ).flavor;
    const skill = { product: 'sum', direction: 'over', target: { source: 'attribute', expression: '@skill' } };
    const underSkill = { ...skill, direction: 'under' };
    assert.equal(flavor(undefined), 'Rope — Crafting check (DC 14)');
    assert.equal(flavor({ product: 'sum', direction: 'under', target: { source: 'fixed' } }), 'Rope — Crafting check (Target 14)');
    assert.equal(flavor(skill), 'Rope — Crafting check (Target 14)');
    assert.equal(flavor(underSkill), 'Rope — Crafting check (Target 14)');
    for (const evaluation of [undefined, skill, underSkill]) {
      assert.doesNotMatch(flavor(evaluation, null), /\(/, 'an unresolved target names no number');
    }
    assert.equal(flavor({ product: 'count', direction: 'under' }, 2), 'Rope — Crafting check', 'a count names neither');
  });

  it('withholds only a Target flavor when the caller grades no target', () => {
    const flavor = (evaluation) => buildInteractiveRollOptions(
      { actor: null, name: 'Rope', activity: 'Gathering', dc: 9, evaluation, flavorWithheld: true },
      () => null
    );
    assert.equal(flavor({ direction: 'under' }).flavor, 'Rope — Gathering check');
    assert.equal(flavor(undefined).flavor, 'Rope — Gathering check (DC 9)');
    assert.ok(!Object.hasOwn(flavor(undefined), 'flavorWithheld'), 'no stray key reaches the bag');
  });

  it('localizes the Target flavor suffix', () => {
    const restore = stubI18n({ 'FABRICATE.Check.Roll.FlavorTarget': 'Ziel {target}' });
    try {
      const { flavor } = buildInteractiveRollOptions(
        { actor: null, name: 'Rope', activity: 'Crafting', dc: 9, evaluation: { direction: 'under' } },
        () => null
      );
      assert.equal(flavor, 'Rope — Crafting check (Ziel 9)');
    } finally {
      restore();
    }
  });

  it('builds localized activity and actor-subject labels without inventing a missing subject', () => {
    const named = buildSinglePromptData({ activity: 'Crafting', actorName: 'Brenna', name: 'Iron', dc: 12, thresholdMode: 'exceed' });
    assert.equal(named.title, 'Crafting check');
    assert.equal(named.subtitle, 'Brenna · Iron');
    assert.equal(named.comparison, 'exceed');
    assert.equal(buildSinglePromptData({ activity: 'Salvage', actorName: 'Brenna' }).subtitle, 'Brenna');
    assert.equal(buildSinglePromptData({ thresholdMode: 'exceed', comparison: null }).comparison, null);
    assert.equal(buildSinglePromptData({ thresholdMode: 'exceed', comparison: 'meet' }).comparison, 'meet');
  });

  it('inserts user-authored names literally, never as replacement patterns', () => {
    const data = buildSinglePromptData({ activity: "$'Forge", actorName: 'A$&B', name: '$1 Blade' });
    assert.equal(data.title, "$'Forge check");
    assert.equal(data.subtitle, 'A$&B · $1 Blade');
  });

  it('binds the actor name while preserving the runner prompt payload', async () => {
    let captured;
    const options = buildInteractiveRollOptions({ actor: { name: 'Brenna' }, activity: 'Crafting' }, async (payload) => {
      captured = payload;
      return { confirmed: true };
    });
    assert.deepEqual(await options.prompt({ resolvedFormula: '1d20 + 2', thresholdMode: 'exceed' }), { confirmed: true });
    assert.deepEqual(captured, { resolvedFormula: '1d20 + 2', thresholdMode: 'exceed', actorName: 'Brenna' });
  });

  it('offers Advantage only for a strictly true allowAdvantage', async () => {
    for (const allowAdvantage of [undefined, null, 'true', 1]) {
      const { view } = await open({ activity: 'Crafting', allowAdvantage }, null);
      assert.equal(view.allowAdvantage, false, `${String(allowAdvantage)} is not true`);
    }
    const { view } = await open({ activity: 'Crafting', allowAdvantage: true }, null);
    assert.equal(view.allowAdvantage, true);
  });

  it('offers exactly the four legacy roll-mode tokens under Fabricate labels', async () => {
    const restore = stubI18n({ 'FABRICATE.App.RollPrompt.RollModePrivate': 'Private GM roll (lang)' });
    const previousConfig = globalThis.CONFIG;
    globalThis.CONFIG = { get Dice() { throw new Error('CONFIG.Dice must not be read'); } };
    try {
      const { view } = await open({ activity: 'Crafting' }, null);
      assert.deepEqual(view.rollModes.map((mode) => mode.value), ['publicroll', 'gmroll', 'blindroll', 'selfroll']);
      assert.deepEqual(view.rollModes.map((mode) => mode.label), ['Public roll', 'Private GM roll (lang)', 'Blind GM roll', 'Self roll']);
    } finally {
      globalThis.CONFIG = previousConfig;
      restore();
    }
  });

  it('carries the client default roll mode into the view and the automated bag', async () => {
    for (const [setting, expected] of [[undefined, 'publicroll'], ['unknown', 'publicroll'], ['blindroll', 'blindroll']]) {
      const restore = stubI18n({}, { rollMode: setting });
      try {
        assert.equal(buildInteractiveRollOptions({ activity: 'Crafting' }).rollMode, expected);
        const { view, result } = await open({ activity: 'Crafting' }, { confirmed: true, rollMode: 'unknown' });
        assert.equal(view.defaultRollMode, expected);
        assert.equal(result.rollMode, expected, 'an unsupported submitted mode falls back to the default');
      } finally {
        restore();
      }
    }
  });

  it('normalizes the situational bonus', () => {
    for (const [raw, expected] of [['', null], [null, null], ['   ', null], ['2', '2'], ['  +2  ', '2'], ['-1', '-1'], ['1d4 + 1', '1d4 + 1'], ['++2', '+2']]) {
      assert.equal(normalizeSituationalBonus(raw), expected, JSON.stringify(raw));
    }
  });

  it('re-imposes the pick cap on an over-large submitted selection', async () => {
    const { result } = await open({ modifierChoice: choice }, { confirmed: true, chosenModifierIds: ['b', 'a', 'x'] });
    assert.deepEqual(result.chosenModifierIds, ['b', 'a']);
    assert.equal(result.chosenModifierId, 'b');
  });

  it('preserves an explicit empty selection and the headless defaults', async () => {
    const { result } = await open({ modifierChoice: choice }, { confirmed: true, chosenModifierIds: [] });
    assert.deepEqual(result.chosenModifierIds, []);
    assert.ok(!Object.hasOwn(result, 'chosenModifierId'));
    const defaulted = await open({ modifierChoice: choice }, { confirmed: true });
    assert.deepEqual(defaulted.result.chosenModifierIds, ['a', 'b']);
    const headless = await promptCheckRoll({ modifierChoice: choice });
    assert.deepEqual(headless, { confirmed: true, chosenModifierIds: ['a', 'b'], chosenModifierId: 'a' });
    assert.deepEqual(await promptCheckRoll(), { confirmed: true });
  });

  it('maps every non-confirmation and a failed open to the unchanged false shape', async () => {
    for (const answer of [undefined, null, false, {}, { confirmed: 'yes' }]) {
      assert.deepEqual((await open({}, answer)).result, { confirmed: false }, JSON.stringify(answer));
    }
    const previousError = console.error;
    console.error = () => {};
    const surface = stubPromptSurface(() => {
      throw new Error('host refused');
    });
    try {
      assert.deepEqual(await promptCheckRoll({ activity: 'Crafting' }), { confirmed: false });
    } finally {
      surface.restore();
      console.error = previousError;
    }
  });

  it('hands the prompt the pre-modifier target and a summed check direction', async () => {
    const received = async (evaluation, dc = 15) => {
      let input;
      await resolveCheckDecision({
        authoredFormula: '1d20', actor: null, deferred: false, Roll: null,
        evaluation: normalizeCheckEvaluation(evaluation),
        resolvedCheck: { formula: '1d20', selected: [] },
        displayFormula: (formula) => ({ display: formula }),
        options: { interactive: true, dc, prompt: async (payload) => { input = payload; return null; } },
      });
      return { target: input.target, direction: input.direction, dc: input.dc };
    };
    assert.deepEqual(await received({ direction: 'under' }), { target: 15, direction: 'under', dc: 15 });
    assert.deepEqual(await received({}), { target: 15, direction: 'over', dc: 15 });
    assert.deepEqual(await received({ product: 'count', direction: 'under' }, null), {
      target: null, direction: 'under', dc: null,
    }, 'a count prompt names its per-die direction and no target');
  });

  it('hands a count prompt its pre-modifier pool, threshold and required count (issue 2004)', async () => {
    const received = async (evaluation, { required = 3, countPolicy, thresholdMode } = {}) => {
      let input;
      await resolveCheckDecision({
        authoredFormula: '', actor: null, deferred: false, Roll: null,
        evaluation: normalizeCheckEvaluation({ product: 'count', ...evaluation }),
        resolvedCheck: { formula: '', selected: [] },
        displayFormula: () => null,
        countPolicy,
        options: {
          interactive: true, dc: null, required, thresholdMode,
          prompt: async (payload) => { input = payload; return null; },
        },
      });
      return input;
    };
    const policy = { dice: 4, die: 6, threshold: 5, comparison: 'exceed', resolved: { base: 4.9 } };
    const input = await received(
      { direction: 'under', pool: { modifierDestination: 'threshold' } },
      { countPolicy: policy, thresholdMode: 'exceed' }
    );
    const { product, direction, comparison, pool, threshold, die, required, modifierDestination } = input;
    assert.deepEqual(
      { product, direction, comparison, pool, threshold, die, required, modifierDestination },
      {
        product: 'count', direction: 'under', comparison: 'exceed', pool: 4, threshold: 5, die: 6,
        required: 3, modifierDestination: 'threshold',
      },
      'the floored pool the policy resolved, never the unfloored base'
    );
    assert.deepEqual([input.dc, input.target, input.formula, input.allowAdvantage], [null, null, '', false]);
    assert.equal(input.thresholdMode, 'exceed');
    const bare = await received({}, { required: null });
    assert.deepEqual(
      [bare.direction, bare.pool, bare.threshold, bare.die, bare.required, bare.modifierDestination],
      ['over', null, null, null, null, 'pool'],
      'no policy and a progressive check name no pool or required count'
    );
    const summed = await received({ product: 'sum' });
    assert.ok(!Object.hasOwn(summed, 'product') && !Object.hasOwn(summed, 'pool'), 'sum adds no count field');
  });

  it('shows a count prompt its pool line and successes chip, never a formula or DC', async () => {
    const count = (fields) => open({
      product: 'count', pool: 6, die: 10, threshold: 8, required: 2, comparison: 'meet',
      modifierDestination: 'pool', dc: 12, target: 12, formula: '1d20', displayFormula: '1d20', ...fields,
    }, null);
    const { view } = await count({ direction: 'over' });
    assert.equal(view.formula, '6d10 · each ≥ 8');
    assert.deepEqual([view.dc, view.dcText, view.neededText, view.chipText], [null, '', '2 successes needed', '2 successes needed']);
    assert.deepEqual(view.count, {
      pool: 6, die: 10, threshold: 8, thresholdSource: null, explode: null, cancel: null, required: 2,
      destination: 'pool',
    });
    assert.equal(view.labels.formulaNote, 'Success on ≥ 8');
    assert.equal(view.labels.eachAdds, 'Each adds dice.');
    assert.equal(
      view.labels.bonusHelp,
      'A bonus adds that many dice. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    const signs = [];
    for (const direction of ['over', 'under']) {
      for (const comparison of ['meet', 'exceed']) {
        signs.push((await count({ direction, comparison, threshold: 7.456 })).view.formula);
      }
    }
    assert.deepEqual(signs, [
      '6d10 · each ≥ 7.46', '6d10 · each > 7.46', '6d10 · each ≤ 7.46', '6d10 · each < 7.46',
    ]);
    const under = (await count({ direction: 'under', modifierDestination: 'threshold', required: 1 })).view;
    assert.equal(under.direction, 'under');
    assert.equal(under.neededText, '1 success needed');
    assert.equal(under.labels.eachAdds, 'Each moves the threshold.');
    assert.equal(
      under.labels.bonusHelp,
      'A bonus moves the threshold by that much. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    assert.equal((await count({ required: 0 })).view.neededText, '0 successes needed');
    const progressive = (await count({ required: null })).view;
    assert.deepEqual([progressive.count.required, progressive.neededText], [null, '']);
    assert.equal((await count({ comparison: undefined, thresholdMode: 'exceed' })).view.comparison, 'exceed');
  });

  it('states a count prompt\'s qualifying rule under its pool line, frames 30 and 35', async () => {
    const note = async (fields) => (await open({
      product: 'count', pool: 6, die: 10, threshold: 8, required: 2, comparison: 'meet', direction: 'over',
      formula: '1d20 + 4', displayFormula: '1d20 + 4', dc: 15, ...fields,
    }, null)).view.labels.formulaNote;
    const best = { kind: 'best', value: null, once: false };
    const worst = { kind: 'worst', value: null };
    assert.equal(
      await note({ explode: best, cancel: worst }),
      'Success on ≥ 8 · best face explodes · worst face cancels',
      'frame 35'
    );
    assert.equal(
      await note({
        pool: 2, die: 20, threshold: 14, direction: 'under', thresholdSource: '@abilities.int.mod + 11',
      }),
      'Success on ≤ 14 (@abilities.int.mod + 11)',
      'frame 30: the threshold and the expression it was read from'
    );
    assert.equal(
      await note({ comparison: 'exceed', explode: { ...best, once: true } }),
      'Success on > 8 · best face explodes once'
    );
    assert.equal(
      await note({ explode: { kind: 'from', value: 9 }, cancel: { kind: 'from', value: 2 } }),
      'Success on ≥ 8 · faces ≥ 9 explode · faces ≤ 2 cancel'
    );
    assert.equal(
      await note({ die: 20, direction: 'under', explode: { kind: 'from', value: 2, once: true }, cancel: { kind: 'from', value: 19 } }),
      'Success on ≤ 8 · faces ≤ 2 explode once · faces ≥ 19 cancel'
    );
    assert.equal(
      await note({ explode: { kind: 'from', value: 11 }, cancel: { kind: 'from', value: 12 } }),
      'Success on ≥ 8 · faces ≤ 12 cancel',
      'a face beyond the die never explodes, and over it cancels every face'
    );
    assert.equal(
      await note({ direction: 'under', cancel: { kind: 'from', value: 12 } }),
      'Success on ≤ 8',
      'under, a cancel face beyond the die cancels none'
    );
    assert.equal(await note({ pool: null, threshold: null, die: null, explode: best }), undefined,
      'a hidden or redacted pool states no rule');
    const { view } = await open({
      product: 'count', pool: 6, die: 10, threshold: 8, required: 2, direction: 'over',
      explode: best, cancel: worst, formula: '1d20 + 4', displayFormula: '1d20 + 4', dc: 15,
    }, null);
    const shown = JSON.stringify([view.formula, view.labels.formulaNote, view.neededText, view.dcText]);
    assert.ok(!shown.includes('1d20') && !shown.includes('DC') && !shown.includes('15'),
      'never the retained roll formula or a DC');
  });

  it('carries the threshold source and face rules only from a resolved pool', async () => {
    const received = async (pool, countPolicy) => {
      let input;
      await resolveCheckDecision({
        authoredFormula: '', actor: null, deferred: false, Roll: null,
        evaluation: normalizeCheckEvaluation({ product: 'count', pool }),
        resolvedCheck: { formula: '', selected: [] },
        displayFormula: () => null,
        countPolicy,
        options: { interactive: true, dc: null, required: 2, prompt: async (payload) => { input = payload; return null; } },
      });
      return [input.thresholdSource, input.explode, input.cancel];
    };
    const policy = {
      dice: 6, die: 10, threshold: 14, comparison: 'meet',
      explode: { kind: 'best', value: null, once: false }, cancel: { kind: 'from', value: 2 },
    };
    assert.deepEqual(await received({ threshold: ' @abilities.int.mod + 11 ' }, policy), [
      '@abilities.int.mod + 11', { kind: 'best', value: null, once: false }, { kind: 'from', value: 2 },
    ]);
    assert.deepEqual(await received({ threshold: '8' }, { ...policy, explode: null, cancel: null }), [null, null, null],
      'a plain number names no source');
    assert.deepEqual(await received({ threshold: '@abilities.int.mod' }, null), [null, null, null],
      'no resolved pool, no source or rules');
  });

  it('names a summed roll-under target to stay under, and leaves roll-over copy unchanged', async () => {
    const under = (thresholdMode) => open({ dc: 15, target: 15, direction: 'under', thresholdMode }, null);
    const meet = (await under('meet')).view;
    assert.equal(meet.direction, 'under');
    assert.equal(`${meet.dcText} · ${meet.labels.meet}`, 'Target 15 · stay at or under');
    assert.equal(`${meet.dcText} · ${(await under('exceed')).view.labels.exceed}`, 'Target 15 · stay under');
    assert.deepEqual(
      [meet.chipText, (await under('exceed')).view.chipText, (await open({ dc: 12, thresholdMode: 'exceed' }, null)).view.chipText],
      ['Target 15 · stay at or under', 'Target 15 · stay under', 'DC 12 · beat'],
      'the one target chip reads the number and its comparison'
    );
    assert.equal((await open({ name: 'Vein' }, null)).view.chipText, '', 'no number, no chip');
    assert.equal(meet.labels.eachAdds, 'Each raises the target.');
    assert.equal(meet.labels.formulaNote, 'The dice are compared as rolled.');
    assert.equal(
      meet.labels.bonusHelp,
      'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    for (const args of [{ dc: 12 }, { dc: 12, target: 12, direction: 'over' }]) {
      const { view } = await open(args, null);
      assert.equal(view.direction, 'over');
      assert.deepEqual(
        [view.dcText, view.labels.meet, view.labels.exceed, view.labels.eachAdds, view.labels.bonusHelp],
        ['DC 12', 'meet or beat', 'beat', 'Each adds to the total.',
          'A bonus adds to the total. A rolled bonus such as 1d4 is rolled with the check.'],
        'a roll-over prompt keeps its DC copy byte for byte'
      );
      assert.equal(view.labels.formulaNote, undefined, 'a roll-over formula carries no note');
    }
  });

  it('names a count row\'s required successes in a bulk batch', async () => {
    const surface = stubPromptSurface(() => null);
    try {
      await promptBulkCheckRoll({ subjects: [
        { name: 'Ore', need: { kind: 'successes', count: 3 } },
        { name: 'Scrap', need: { kind: 'dc', dc: 12 } },
      ] });
      assert.deepEqual(surface.view.subjects.map((row) => row.needText), ['3 needed', 'DC 12']);
    } finally {
      surface.restore();
    }
  });

  it('gives an all-count batch with one destination that count\'s help, and a mix the summed help', async () => {
    const help = async (subjects) => {
      const surface = stubPromptSurface(() => null);
      try {
        await promptBulkCheckRoll({ subjects });
        return surface.view.labels.bonusHelp;
      } finally {
        surface.restore();
      }
    };
    const row = (destination, kind = 'successes') => ({ name: 'Ore', need: { kind, count: 2, destination } });
    assert.equal(
      await help([row('pool'), row('pool')]),
      'A bonus adds that many dice. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    assert.equal(
      await help([row('threshold'), row('threshold')]),
      'A bonus moves the threshold by that much. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    const summed = 'A bonus adds to the total. A rolled bonus such as 1d4 is rolled with the check.';
    assert.equal(await help([row('pool'), row('threshold')]), summed, 'two destinations have no one answer');
    assert.equal(await help([row('pool'), { name: 'Scrap', need: { kind: 'dc', dc: 12 } }]), summed);
    assert.equal(await help([row(undefined)]), summed, 'a row naming no destination keeps the summed help');
    assert.equal(await help([row('pool'), row('pool', 'dc')]), summed, 'only count rows answer by destination');
  });

  it('reads the target before the legacy dc, and names no direction without a number', () => {
    assert.equal(buildSinglePromptData({ dc: 12, target: 9, direction: 'under' }).dc, 9);
    assert.equal(buildSinglePromptData({ dc: 12 }).dc, 12);
    const blank = buildSinglePromptData({ dc: null, direction: 'under' });
    assert.deepEqual([blank.dc, blank.direction], [null, 'over']);
  });

  it('hands a roll-under prompt its target basis and the Tool bonus, and nothing to any other', async () => {
    const basis = { expression: '@skills.smith.level', value: 12, adjustment: null };
    const received = async (evaluation) => {
      let input;
      await resolveCheckDecision({
        authoredFormula: '1d20', actor: null, deferred: false, Roll: null,
        evaluation: normalizeCheckEvaluation(evaluation),
        resolvedCheck: { formula: '1d20', selected: [] },
        displayFormula: (formula) => ({ display: formula }),
        options: {
          interactive: true, dc: 12, targetBasis: basis,
          toolContributions: [{ value: 2 }, { value: -1 }, null, { value: Number.NaN }],
          prompt: async (payload) => { input = payload; return null; },
        },
      });
      return [input.targetBasis, input.toolBonus];
    };
    assert.deepEqual(await received({ direction: 'under' }), [basis, 1]);
    for (const evaluation of [{}, { product: 'count', direction: 'under' }]) {
      assert.deepEqual(await received(evaluation), [undefined, undefined], JSON.stringify(evaluation));
    }
    const options = buildInteractiveRollOptions({ interactive: true, dc: 10, targetBasis: basis }, () => null);
    assert.equal(options.targetBasis, basis);
    assert.equal(Object.hasOwn(buildInteractiveRollOptions({ interactive: true, dc: 10 }), 'targetBasis'), false);
  });

  it('names a roll-under target after its flat modifiers and Tool bonus, and explains it', async () => {
    const target = async (args, selectedIds = []) => {
      const { view } = await open({ dc: 10, target: 10, direction: 'under', ...args }, null);
      return rollPromptTarget(view, selectedIds);
    };
    const hardWork = { expression: '@skills.smith.level', value: 12, adjustment: { kind: 'add', value: -2, label: 'Hard Work' } };
    assert.deepEqual(await target({ targetBasis: hardWork, selectedModifiers: [{ label: 'Steady hands', value: 1 }] }), {
      chipText: 'Target 11 · stay at or under', source: '@skills.smith.level 12 · Hard Work −2 · modifiers +1',
    }, 'frame 29, with the true minus sign');
    assert.deepEqual(await target({ targetBasis: hardWork, thresholdMode: 'exceed' }), {
      chipText: 'Target 10 · stay under', source: '@skills.smith.level 12 · Hard Work −2',
    }, 'a character-value target explains itself with no modifier applied');
    const halved = { ...hardWork, adjustment: { kind: 'multiply', value: 0.5, label: '' } };
    assert.equal((await target({ targetBasis: halved, dc: 6, target: 6 })).source, '@skills.smith.level 12 · difficulty ×½');
    const floored = { expression: '@skills.lore.level', value: 9, adjustment: { kind: 'multiply', value: 0.5, label: '' } };
    assert.deepEqual(await target({ targetBasis: floored, dc: 4, target: 4 }), {
      chipText: 'Target 4 · stay at or under', source: '@skills.lore.level 9 · difficulty ×½',
    }, 'the line names the value and multiplier before the floor; the chip names the floored target');
    const bare = { expression: '@skills.smith.level', value: 12, adjustment: null };
    assert.deepEqual(await target({ targetBasis: bare, dc: 12, target: 12 }), {
      chipText: 'Target 12 · stay at or under', source: '@skills.smith.level 12',
    }, 'an unadjusted character value still names itself, with no difficulty part');
    assert.deepEqual(await target({ dc: 15, target: 15, toolBonus: 2, selectedModifiers: [{ value: 1 }, { value: -4 }] }), {
      chipText: 'Target 14 · stay at or under', source: 'Base 15 · tools +2 · modifiers −3',
    }, 'a fixed target names its base once something raised it');
    assert.deepEqual(await target({ dc: 15, target: 15, selectedModifiers: [{ label: 'Die', display: '+1d4', value: null }] }), {
      chipText: 'Target 15 + 1d4 · stay at or under', source: '',
    }, 'a rolled modifier is named as pending, never averaged in, and shows no line (issue 2005)');
    const choicePlan = { options: [{ id: 'a', value: 1 }, { id: 'b', value: null }, { id: 'c', value: 3 }] };
    const { view } = await open({ dc: 10, target: 10, direction: 'under', targetBasis: hardWork }, null);
    const live = (ids) => rollPromptTarget({ ...view, choicePlan }, ids).chipText;
    assert.deepEqual([live(['a']), live(['c']), live(['b']), live(['a', 'c'])], [
      'Target 11 · stay at or under', 'Target 13 · stay at or under',
      'Target 10 · stay at or under', 'Target 14 · stay at or under',
    ], 'the picked choices, not the offered ones, raise the target');
  });

  it('names only a typed bonus the dice engine accepts as pending (R9)', async () => {
    const { view } = await open({ dc: 12, target: 12, direction: 'under' }, null);
    const original = globalThis.Roll;
    globalThis.Roll = { validate: (formula) => /^\d*d\d+$/.test(formula) };
    try {
      assert.equal(rollPromptTarget(view, [], 'abc').chipText, 'Target 12 · stay at or under');
      assert.equal(rollPromptTarget(view, [], '1d4').chipText, 'Target 12 + 1d4 · stay at or under');
    } finally {
      if (original === undefined) delete globalThis.Roll;
      else globalThis.Roll = original;
    }
  });

  it('keeps the roll-over chip text and gives it no explanation', async () => {
    const { view } = await open({ dc: 12, target: 12, direction: 'over', toolBonus: 2, selectedModifiers: [{ value: 1 }] }, null);
    assert.deepEqual(rollPromptTarget(view, []), { chipText: 'DC 12 · meet or beat', source: '' });
    assert.equal(Object.hasOwn(view, 'targetBasis'), false);
  });

  it('formats the pick cap and the DC before the component sees them', async () => {
    const { view } = await open({ modifierChoice: choice, dc: 12 }, null);
    assert.equal(view.labels.pickUpTo, 'Pick up to 2');
    assert.equal(view.dcText, 'DC 12');
    assert.equal((await open({}, null)).view.dcText, '', 'no DC, no DC copy');
  });

  it('opens the modal whenever the page has a body, rather than confirming headlessly', async () => {
    const previousDocument = globalThis.document;
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(String(args[0]));
    globalThis.document = { body: {} };
    try {
      // Node cannot load the `.svelte` module, so the attempted open fails and reads as a dismissal.
      assert.deepEqual(await promptCheckRoll({ activity: 'Crafting' }), { confirmed: false });
      assert.ok(errors.some((line) => line.includes('Roll prompt failed to load')), errors.join('\n'));
    } finally {
      globalThis.document = previousDocument;
      console.error = previousError;
    }
  });

  it('translates a confirmed answer into the unchanged caller keys', () => {
    const plan = { options: [], maxPicks: 1, defaultSelectedIds: [] };
    assert.deepEqual(
      translatePromptAnswer({ confirmed: true, bonus: ' +1d4 ', rollMode: 'gmroll', advantage: 'advantage' }, { defaultRollMode: 'publicroll', choicePlan: plan }),
      { confirmed: true, bonus: '1d4', rollMode: 'gmroll', advantage: 'advantage' }
    );
    assert.equal(
      translatePromptAnswer({ confirmed: true, advantage: 'sideways' }, { defaultRollMode: 'publicroll', choicePlan: plan }).advantage,
      'normal'
    );
  });
});
