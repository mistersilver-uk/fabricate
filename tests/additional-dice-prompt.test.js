/**
 * The single roll prompt's additional-dice control (issue 2008): the presenter's lines, message,
 * per-action blocking and block note, the answer bound, the settled pool and the offer allowlist.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { publicAdditionalDiceOffer } from '../src/systems/additionalDiceReach.js';
import {
  actionDeltas,
  additionalDiceCopy,
  describeAdditionalDice,
  pendingDiceRange,
} from '../src/ui/presenters/additionalDicePrompt.js';
import {
  buildSinglePromptData,
  promptActions,
  promptCheckRoll,
  translatePromptAnswer,
} from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { rollPromptTarget } from '../src/ui/svelte/apps/crafting/rollPromptTarget.js';

import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';

const EN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));
/** The shipped strings, so a missing or misspelt leaf reads as its fallback, never as a key. */
const shipped = (key, fallback) =>
  key.split('.').reduce((node, segment) => node?.[segment], EN) ?? fallback;

const reach = (over = {}) => ({
  needed: 2,
  perDieMost: 1,
  explode: 'off',
  rescued: false,
  ...over,
});
const offerOf = (over = {}) =>
  publicAdditionalDiceOffer({
    available: 2,
    limit: 1,
    max: 1,
    resourceLabel: 'Momentum',
    unavailable: null,
    reach: reach(),
    ...over,
  });
const pool = (base, poolDelta = 0, zeroPoolFails = true) => ({
  base,
  poolDelta,
  zeroPoolFails,
  dice: Math.max(0, base + poolDelta),
});
const COUNT_ADVANTAGE = { advantage: true, disadvantage: true, kind: 'count', detail: { dice: 1 } };
const LABELS = { roll: 'Roll', advantage: 'Advantage', disadvantage: 'Disadvantage' };
const THREE = actionDeltas(promptActions(COUNT_ADVANTAGE, LABELS), COUNT_ADVANTAGE);
const SINGLE = actionDeltas(promptActions(null, LABELS), null);

function describe2008({
  offer = offerOf(),
  at = pool(2),
  deltas = SINGLE,
  chosen = 0,
  pending,
} = {}) {
  return describeAdditionalDice({
    offer,
    pool: at,
    deltas,
    pending,
    chosen,
    labels: additionalDiceCopy(offer, shipped),
    actorName: 'Brenna',
  });
}

const NONE = { disadvantage: false, normal: false, advantage: false };

describe('the additional-dice prompt presenter (issue 2008)', () => {
  it('states the resource and the spend, and no message when the pool already reaches (frame 30)', () => {
    const view = describe2008();
    assert.equal(
      `${view.resourceLine} · ${view.spendLine}`,
      'Momentum 2 available · Spends 0 Momentum'
    );
    assert.equal(view.message, null);
    assert.deepEqual([view.disabled, view.blocked, view.blockNote], [false, NONE, '']);
  });

  it('warns of a shortfall it never pre-selects, then says it is enough (frame 31)', () => {
    const short = describe2008({ offer: offerOf({ reach: reach({ needed: 3 }) }) });
    assert.deepEqual(short.message, {
      tone: 'warning',
      text: 'At least 1 additional die needed to be able to succeed.',
    });
    const enough = describe2008({ offer: offerOf({ reach: reach({ needed: 3 }) }), chosen: 1 });
    assert.deepEqual(enough.message, {
      tone: 'success',
      text: 'At least 1 additional die is needed. You have enough.',
    });
    assert.equal(enough.spendLine, 'Spends 1 Momentum');
    const two = describe2008({
      offer: offerOf({ max: 2, limit: 2, reach: reach({ needed: 4 }) }),
      chosen: 1,
    });
    assert.equal(two.message.text, 'At least 2 additional dice needed to be able to succeed.');
  });

  it('disables only the actions that cannot reach, keeping Advantage when it can (R1, frame 32)', () => {
    const view = describe2008({
      offer: offerOf({ available: 0, limit: 0, reach: reach({ needed: 3 }) }),
      deltas: THREE,
    });
    assert.deepEqual(view.blocked, { disadvantage: true, normal: true, advantage: false });
    assert.equal(view.blockNote, 'Only Advantage can reach the successes needed.');
    assert.deepEqual(view.message, {
      tone: 'danger',
      text: 'Cannot reach 3 successes. 2 dice need at least 1 more, and you can afford 0.',
    });
    assert.equal(view.disabled, true, 'nothing to buy');
    const disadvantageOnly = describe2008({
      offer: offerOf({ available: 0, limit: 0 }),
      deltas: THREE,
    });
    assert.deepEqual(disadvantageOnly.blocked, {
      disadvantage: true,
      normal: false,
      advantage: false,
    });
    assert.equal(disadvantageOnly.blockNote, 'Disadvantage cannot reach the successes needed.');
    assert.deepEqual(disadvantageOnly.message, {
      tone: 'info',
      text: 'Not enough Momentum to buy a die.',
    });
  });

  it('disables every action when none can reach, and names the most that can ever be added (frame 33)', () => {
    const impossible = offerOf({ reach: reach({ needed: 4 }) });
    const single = describe2008({ offer: impossible });
    assert.deepEqual(single.blocked, { disadvantage: false, normal: true, advantage: false });
    assert.equal(
      single.blockNote,
      'Rolling is disabled: this attempt cannot reach the successes it needs.'
    );
    assert.equal(
      single.message.text,
      'Cannot reach 4 successes. 2 dice need at least 2 more, and at most 1 can ever be added.'
    );
    const three = describe2008({ offer: offerOf({ reach: reach({ needed: 5 }) }), deltas: THREE });
    assert.deepEqual(three.blocked, { disadvantage: true, normal: true, advantage: true });
    assert.equal(
      three.blockNote,
      'Rolling is disabled: this attempt cannot reach the successes it needs.'
    );
    const lone = describe2008({ offer: impossible, at: pool(1) });
    assert.equal(
      lone.message.text,
      'Cannot reach 4 successes. 1 die needs at least 3 more, and at most 1 can ever be added.'
    );
    const faces = describe2008({ offer: offerOf({ reach: reach({ needed: 1, perDieMost: 0 }) }) });
    assert.equal(faces.message.text, 'Cannot reach 1 success with these dice.');
  });

  it('keeps every action enabled under a rescuing trigger, with the danger message (decision 16)', () => {
    const view = describe2008({
      offer: offerOf({ reach: reach({ needed: 5, rescued: true }) }),
      deltas: THREE,
    });
    assert.deepEqual([view.blocked, view.blockNote], [NONE, '']);
    assert.equal(view.message.tone, 'danger');
  });

  it('never says an exploding pool cannot reach, and warns without exploding dice', () => {
    const view = describe2008({
      offer: offerOf({ reach: reach({ needed: 4, perDieMost: null, explode: 'recursive' }) }),
    });
    assert.deepEqual([view.blocked, view.blockNote], [NONE, '']);
    assert.deepEqual(view.message, {
      tone: 'warning',
      text: 'At least 2 additional dice needed to succeed without exploding dice.',
    });
  });

  it('blocks an unliftable zero pool even when the needed count may not be judged (R4)', () => {
    for (const needed of [2, null]) {
      const view = describe2008({
        offer: offerOf({ reach: reach({ needed }) }),
        at: pool(1, -3),
        deltas: THREE,
      });
      assert.deepEqual(
        view.blocked,
        { disadvantage: true, normal: true, advantage: true },
        String(needed)
      );
      assert.equal(
        view.blockNote,
        'Rolling is disabled: the pool is reduced to zero, and the dice you can add cannot lift it.'
      );
    }
    const hidden = describe2008({
      offer: offerOf({ reach: reach({ needed: null }) }),
      at: pool(1, -3),
    });
    assert.equal(
      hidden.message,
      null,
      'a progressive or prepared routed prompt states no needed count'
    );
    const liftable = describe2008({
      offer: offerOf({ reach: reach({ needed: 1 }) }),
      at: pool(1, -1),
      deltas: THREE,
    });
    assert.equal(liftable.blocked.normal, false, 'one bought die lifts a pool of zero');
  });

  it('never blocks a secret or unentitled prompt, nor states its needed count (R3)', () => {
    for (const limit of [1, 0]) {
      const view = describe2008({
        offer: offerOf({ limit, reach: null }),
        at: pool(2),
        deltas: THREE,
      });
      assert.deepEqual([view.blocked, view.blockNote], [NONE, '']);
      assert.ok(!/reach|needed/.test(view.message?.text ?? ''), String(limit));
    }
    assert.deepEqual(
      describe2008({ offer: offerOf({ reach: null }), at: pool(1, -2) }).blocked,
      NONE
    );
  });

  it('shows an unavailable reason, never an amount, with the stepper disabled', () => {
    const view = describe2008({
      offer: offerOf({ available: 0, limit: 0, unavailable: 'resourceUnreadable' }),
      chosen: 1,
    });
    assert.equal(`${view.resourceLine} · ${view.spendLine}`, 'Momentum unavailable · Spends 0');
    assert.deepEqual(view.message, {
      tone: 'info',
      text: 'Additional dice are unavailable: Brenna has no readable Momentum value.',
    });
    assert.ok(!/available ·|\d available/.test(view.resourceLine));
    assert.equal(view.disabled, true);
    const unlabelled = describe2008({
      offer: offerOf({ resourceLabel: '', unavailable: 'resourceOverridden', limit: 0 }),
    });
    assert.equal(`${unlabelled.resourceLine} · ${unlabelled.spendLine}`, 'Unavailable · Spends 0');
    assert.equal(
      unlabelled.message.text,
      'Additional dice are unavailable: an active effect sets the value, so it cannot be spent.'
    );
  });

  it('names the resource when labelled and no noun at all when not (R2)', () => {
    const unlabelled = describe2008({ offer: offerOf({ resourceLabel: '', limit: 0 }) });
    assert.equal(`${unlabelled.resourceLine} · ${unlabelled.spendLine}`, '2 available · Spends 0');
    assert.equal(unlabelled.message.text, 'Not enough to buy a die.');
    const labelled = describe2008({ offer: offerOf({ limit: 0 }) });
    assert.equal(labelled.message.text, 'Not enough Momentum to buy a die.');
    for (const text of [unlabelled.resourceLine, unlabelled.spendLine, unlabelled.message.text]) {
      assert.ok(!/undefined|null| {2}|\s$|\{/.test(text), text);
    }
  });

  it('judges a pending rolled bonus at its least for the shortfall and its most for reach', () => {
    assert.deepEqual(pendingDiceRange('1d4'), { least: 1, most: 4 });
    assert.deepEqual(pendingDiceRange('2d6 + 1'), { least: 3, most: 13 });
    for (const formula of ['1d4 - 1', '@skill', 'max(1d4, 2)', '1d6x']) {
      assert.deepEqual(pendingDiceRange(formula), { least: null, most: null }, formula);
    }
    const reachable = describe2008({
      offer: offerOf({ reach: reach({ needed: 4 }) }),
      pending: ['1d4'],
    });
    assert.deepEqual(
      [reachable.blocked.normal, reachable.message.text],
      [false, 'At least 1 additional die needed to be able to succeed.']
    );
    const unknown = describe2008({
      offer: offerOf({ reach: reach({ needed: 9 }) }),
      pending: ['@skill'],
    });
    assert.deepEqual([unknown.blocked.normal, unknown.message], [false, null]);
  });

  it('gives each footer action its own count advantage dice', () => {
    assert.deepEqual(THREE, { disadvantage: -1, normal: 0, advantage: 1 });
    assert.deepEqual(SINGLE, { normal: 0 });
    const keep = { advantage: true, disadvantage: false, kind: 'keep', detail: null };
    assert.deepEqual(actionDeltas(promptActions(keep, LABELS), keep), { normal: 0, advantage: 0 });
  });
});

describe('the additional-dice answer and view (issue 2008)', () => {
  const plan = { options: [], maxPicks: 1, defaultSelectedIds: [] };
  const translate = (additionalDice, additionalDiceOffer = offerOf()) =>
    translatePromptAnswer(
      { confirmed: true, additionalDice },
      { defaultRollMode: 'publicroll', choicePlan: plan, additionalDiceOffer }
    );

  it('carries the chosen dice, and refuses a choice outside the offer without clamping it', () => {
    assert.deepEqual(
      [translate(1).additionalDice, translate(1).additionalDiceRefusal],
      [1, undefined]
    );
    assert.equal(translate(undefined).additionalDice, 0, 'omitted is 0');
    const cases = [
      [5, offerOf(), 'choiceAboveLimit'],
      [1.5, offerOf(), 'choiceInvalid'],
      [-1, offerOf(), 'choiceInvalid'],
      ['1', offerOf(), 'choiceInvalid'],
      [1, null, 'notOffered'],
      [1, offerOf({ unavailable: 'resourceNotWritable', limit: 0 }), 'resourceNotWritable'],
    ];
    for (const [dice, offer, refusal] of cases) {
      const answer = translate(dice, offer);
      assert.deepEqual(
        [answer.additionalDice, answer.additionalDiceRefusal],
        [dice, refusal],
        String(dice)
      );
    }
    assert.ok(!('additionalDice' in translate(0, null)), 'no offer and no choice adds nothing');
    assert.deepEqual(
      translatePromptAnswer(null, { choicePlan: plan, additionalDiceOffer: offerOf() }),
      {
        confirmed: false,
      }
    );
  });

  it('settles the chosen dice into the pool line and the zero-pool notice', () => {
    const view = buildSinglePromptData({
      product: 'count',
      direction: 'over',
      comparison: 'meet',
      pool: 1,
      die: 6,
      threshold: 5,
      thresholdAnchor: 5,
      thresholdSource: 'fixed',
      required: 1,
      modifierDestination: 'pool',
    });
    const labels = {
      countFormula: '{pool}d{die} · each {comparison} {threshold}',
      countZeroPool: 'Zero',
      countRule: '',
      countFaces: '',
    };
    const data = { ...view, labels, choicePlan: plan };
    assert.deepEqual(
      [rollPromptTarget(data, [], '-1').formula, rollPromptTarget(data, [], '-1').zeroPool],
      ['0d6 · each ≥ 5', 'Zero']
    );
    const bought = rollPromptTarget(data, [], '-1', 1);
    assert.deepEqual([bought.formula, bought.zeroPool], ['1d6 · each ≥ 5', '']);
    assert.deepEqual(bought.reachPool, { base: 1, poolDelta: -1, zeroPoolFails: true, dice: 0 });
    assert.deepEqual(rollPromptTarget(data, [], '1d4').pendingPool, ['1d4']);
  });

  it('allowlists the offer onto a count prompt, never a path or macro uuid, and answers 0 headless', async () => {
    const offer = {
      available: 2,
      limit: 1,
      max: 1,
      resourceLabel: 'Momentum',
      unavailable: null,
      reach: reach(),
      path: 'system.resources.momentum.value',
      readMacroUuid: 'Macro.read',
      spendMacroUuid: 'Macro.spend',
    };
    const input = {
      product: 'count',
      direction: 'over',
      pool: 2,
      die: 20,
      threshold: 14,
      required: 2,
      actorName: 'Brenna',
      additionalDiceOffer: offer,
    };
    const surface = stubPromptSurface(() => ({ confirmed: true, additionalDice: 1 }));
    try {
      const answer = await promptCheckRoll(input);
      assert.equal(answer.additionalDice, 1);
      assert.deepEqual(surface.view.additionalDiceOffer, publicAdditionalDiceOffer(offer));
      assert.ok(!/system\.resources|Macro\./.test(JSON.stringify(surface.view)), 'no path or uuid');
      assert.equal(surface.view.actorName, 'Brenna');
      await promptCheckRoll({ ...input, product: 'sum' });
      assert.ok(!('additionalDiceOffer' in surface.view), 'a summed check carries no offer');
      await promptCheckRoll({ ...input, additionalDiceOffer: undefined });
      assert.ok(!('additionalDiceOffer' in surface.view), 'no offer, no key');
    } finally {
      surface.restore();
    }
    assert.deepEqual(await promptCheckRoll(input), { confirmed: true, additionalDice: 0 });
    assert.deepEqual(await promptCheckRoll({ ...input, additionalDiceOffer: undefined }), {
      confirmed: true,
    });
  });
});
