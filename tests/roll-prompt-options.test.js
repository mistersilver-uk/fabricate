import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInteractiveRollOptions,
  buildSinglePromptData,
  normalizeSituationalBonus,
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

  it('names a DC in the chat flavor only for a summed roll-over fixed target', () => {
    const flavor = (evaluation) => buildInteractiveRollOptions(
      { interactive: true, actor: null, name: 'Rope', activity: 'Crafting', dc: 14, evaluation },
      () => null
    ).flavor;
    const skill = { product: 'sum', direction: 'over', target: { source: 'attribute', expression: '@skill' } };
    assert.equal(flavor(undefined), 'Rope — Crafting check (DC 14)');
    assert.equal(flavor({ product: 'sum', direction: 'under', target: { source: 'fixed' } }), 'Rope — Crafting check');
    assert.equal(flavor(skill), 'Rope — Crafting check');
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
      target: null, direction: null, dc: null,
    }, 'a count prompt names no direction and no target');
  });

  it('names a summed roll-under target to stay under, and leaves roll-over copy unchanged', async () => {
    const under = (thresholdMode) => open({ dc: 15, target: 15, direction: 'under', thresholdMode }, null);
    const meet = (await under('meet')).view;
    assert.equal(meet.direction, 'under');
    assert.equal(`${meet.dcText} · ${meet.labels.meet}`, 'Target 15 · stay at or under');
    assert.equal(`${meet.dcText} · ${(await under('exceed')).view.labels.exceed}`, 'Target 15 · stay under');
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
      chipText: 'Target 11 · stay at or under', source: '@skills.smith.level 12 · Hard Work -2 · modifiers +1',
    }, 'frame 29');
    assert.deepEqual(await target({ targetBasis: hardWork, thresholdMode: 'exceed' }), {
      chipText: 'Target 10 · stay under', source: '@skills.smith.level 12 · Hard Work -2',
    }, 'a character-value target explains itself with no modifier applied');
    const halved = { ...hardWork, adjustment: { kind: 'multiply', value: 0.5, label: '' } };
    assert.equal((await target({ targetBasis: halved, dc: 6, target: 6 })).source, '@skills.smith.level 12 · difficulty ×0.5');
    assert.deepEqual(await target({ dc: 15, target: 15, toolBonus: 2, selectedModifiers: [{ value: 1 }, { value: -4 }] }), {
      chipText: 'Target 14 · stay at or under', source: 'Base 15 · tools +2 · modifiers -3',
    }, 'a fixed target names its base once something raised it');
    assert.deepEqual(await target({ dc: 15, target: 15, selectedModifiers: [{ label: 'Die', display: '+1d4', value: null }] }), {
      chipText: 'Target 15 · stay at or under', source: '',
    }, 'a rolled modifier is rolled first, so it neither moves the chip nor shows a line');
    const choicePlan = { options: [{ id: 'a', value: 1 }, { id: 'b', value: null }, { id: 'c', value: 3 }] };
    const { view } = await open({ dc: 10, target: 10, direction: 'under', targetBasis: hardWork }, null);
    const live = (ids) => rollPromptTarget({ ...view, choicePlan }, ids).chipText;
    assert.deepEqual([live(['a']), live(['c']), live(['b']), live(['a', 'c'])], [
      'Target 11 · stay at or under', 'Target 13 · stay at or under',
      'Target 10 · stay at or under', 'Target 14 · stay at or under',
    ], 'the picked choices, not the offered ones, raise the target');
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
