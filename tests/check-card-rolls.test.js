/**
 * A public check's rolls ride the result card instead of a second chat message: the offer a roll
 * opens, the card that claims it, the fallback when no card does, and the authority that keeps the
 * requester from posting a roll the card already carried.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it, test } from 'node:test';

import {
  CARD_ROLLS,
  claimCardRolls,
  handoffRolls,
  offerCardRolls,
  offeredCardAuthor,
  offeredCardRolls,
  openCardRollsCount,
  settleCardRolls,
  withOfferedHandoff,
} from '../src/systems/checkCardRolls.js';
import { evaluatePreparedRunCheck } from '../src/systems/checkRoll.js';
import { postCheckRoll, reportedVisibility } from '../src/systems/checkRollOutput.js';
import { checkDisplayForCard } from '../src/systems/craftCardFields.js';
import { createJournalRunCommandService } from '../src/systems/journalRunCommands.js';
import { postResultCard } from '../src/systems/resultCardPost.js';

import { installCountDice } from './helpers/countEngineDice.js';
import { preparedCountCheck } from './helpers/countFixtures.js';
import { createPersistedCraftingHistory } from './helpers/journal-fixtures.js';
import { replicatedAuthorityFixture } from './helpers/replicatedJournalAuthority.js';

const previousChatMessage = globalThis.ChatMessage;
afterEach(() => {
  if (previousChatMessage === undefined) delete globalThis.ChatMessage;
  else Object.assign(globalThis, { ChatMessage: previousChatMessage });
});

/**
 * A V13 (`applyRollMode`) or V14 (`applyMode`) `ChatMessage` recording each created message beside
 * its create options; `failing` rejects every create, as a server refusal does.
 */
function installChatMessage({ version = 14, failing = false } = {}) {
  const created = [];
  const ChatMessage = {
    create: async (data, options) => {
      if (failing) throw new Error('create refused');
      created.push({ data, options });
      return { id: `message-${created.length}` };
    },
    getSpeaker: ({ actor }) => ({ alias: actor?.name ?? 'Speaker' }),
    ...(version === 13 ? { applyRollMode: () => {} } : { applyMode: () => {} }),
  };
  Object.assign(globalThis, { ChatMessage });
  return created;
}

const checkResult = (rollMode = 'publicroll', extra = {}) => ({
  success: true,
  value: 14,
  data: { total: 14, formula: '1d20' },
  visibility: { rollMode, secret: false },
  ...extra,
});

const roll = (formula) => ({ formula });

describe('the card roll offer', () => {
  it('hands its rolls to the card that claims it, and posts nothing itself', async () => {
    let fallbacks = 0;
    const key = offerCardRolls({ rolls: () => [roll('1d20')], post: async () => (fallbacks += 1) });
    assert.deepEqual(offeredCardRolls(key), [roll('1d20')]);
    claimCardRolls(key);
    assert.equal(await settleCardRolls(key), true);
    assert.equal(fallbacks, 0);
    assert.deepEqual(offeredCardRolls(key), [], 'a settled offer is closed');
  });

  it('posts its own roll message when no card claimed it', async () => {
    let fallbacks = 0;
    const key = offerCardRolls({ rolls: () => [roll('1d20')], post: async () => (fallbacks += 1) });
    assert.equal(await settleCardRolls(key), false);
    assert.equal(fallbacks, 1);
    assert.equal(await settleCardRolls(key), false, 'settling twice posts once');
    assert.equal(fallbacks, 1);
  });

  it('answers no rolls and no claim for a key nobody offered', async () => {
    assert.deepEqual(offeredCardRolls('unknown'), []);
    assert.deepEqual(offeredCardRolls(undefined), []);
    assert.equal(await settleCardRolls(undefined), false);
  });

  it('answers no rolls when they cannot be rebuilt, leaving the fallback to post', async () => {
    const errors = [];
    const original = console.error;
    console.error = (...args) => {
      errors.push(args);
    };
    try {
      const key = offerCardRolls({
        rolls: () => {
          throw new Error('unknown roll class');
        },
      });
      assert.deepEqual(offeredCardRolls(key), []);
      assert.equal(errors.length, 1);
      assert.equal(await settleCardRolls(key), false);
    } finally {
      console.error = original;
    }
  });

  it('settles the oldest open offer past its bound, so its roll is posted rather than lost', async () => {
    let fallbacks = 0;
    const first = offerCardRolls({
      rolls: () => [roll('first')],
      post: async () => (fallbacks += 1),
    });
    const later = Array.from({ length: 50 }, (_, index) =>
      offerCardRolls({ rolls: () => [roll(`later-${index}`)] })
    );
    assert.deepEqual(offeredCardRolls(first), [], 'the oldest offer was closed');
    assert.equal(fallbacks, 1, 'and its roll posted its own message');
    assert.deepEqual(offeredCardRolls(later.at(-1)), [roll('later-49')]);
    for (const key of later) await settleCardRolls(key);
    assert.equal(openCardRollsCount(), 0);
  });

  it('names the user its card is authored as, and no one once it is settled', async () => {
    const key = offerCardRolls({ rolls: () => [roll('1d20')], author: 'player' });
    assert.equal(offeredCardAuthor(key), 'player');
    assert.equal(offeredCardAuthor(offerCardRolls({ rolls: () => [] }, 'plain')), null);
    await settleCardRolls(key);
    await settleCardRolls('plain');
    assert.equal(offeredCardAuthor(key), null);
  });
});

describe('postCheckRoll', () => {
  const posting = (options, rollMode = 'publicroll') => {
    const messages = [];
    const toMessage = async (...args) => {
      messages.push(args);
    };
    const main = { formula: '1d20', toMessage };
    return { messages, input: { roll: main, preRolls: [], options, flavor: 'Forge', rollMode } };
  };
  const carrying = { interactive: true, cardRolls: true, reportVisibility: true };

  it('offers a public roll to the card instead of posting it', async () => {
    installChatMessage();
    const { messages, input } = posting(carrying);
    const answer = await postCheckRoll(input);
    assert.equal(messages.length, 0, 'no roll message yet');
    assert.deepEqual(offeredCardRolls(answer.cardRolls), [input.roll]);
    assert.deepEqual(reportedVisibility({ rollMode: 'publicroll', ...answer }), {
      visibility: { rollMode: 'publicroll', secret: false },
      cardRolls: answer.cardRolls,
    });
    assert.equal(await settleCardRolls(answer.cardRolls), false);
    assert.equal(messages.length, 1, 'the unclaimed offer posted the roll message');
    assert.deepEqual(messages[0][1], { messageMode: 'public', create: true });
  });

  for (const rollMode of ['gmroll', 'blindroll', 'selfroll', null]) {
    it(`posts a ${rollMode} roll at once under its own mode, offering nothing`, async () => {
      installChatMessage();
      const { messages, input } = posting(carrying, rollMode);
      assert.deepEqual(await postCheckRoll(input), {});
      assert.equal(messages.length, 1);
    });
  }

  it('posts at once for a caller that posts no card, or reports no visibility', async () => {
    installChatMessage();
    for (const options of [
      { interactive: true },
      { interactive: true, cardRolls: true },
      { interactive: true, reportVisibility: true },
    ]) {
      const { messages, input } = posting(options);
      assert.deepEqual(await postCheckRoll(input), {});
      assert.equal(messages.length, 1, JSON.stringify(options));
    }
  });

  it('opens the offer under the key its caller minted, so the caller can settle it unanswered', async () => {
    installChatMessage();
    const { messages, input } = posting({ ...carrying, cardRolls: 'minted-key' });
    assert.deepEqual(await postCheckRoll(input), { cardRolls: 'minted-key' });
    assert.equal(await settleCardRolls('minted-key'), false);
    assert.equal(messages.length, 1);
  });

  it('neither posts nor offers a roll that is not interactive, or told not to post', async () => {
    installChatMessage();
    for (const options of [
      { ...carrying, interactive: false },
      { ...carrying, post: false },
    ]) {
      const { messages, input } = posting(options);
      assert.deepEqual(await postCheckRoll(input), {});
      assert.equal(messages.length, 0);
    }
  });
});

describe('postResultCard', () => {
  const offered = (result) => {
    const key = offerCardRolls({ rolls: () => [roll('1d20'), roll('1d4')] });
    return { key, check: checkDisplayForCard({ ...result, cardRolls: key }) };
  };
  const card = (check, rolls = []) =>
    postResultCard({ actor: { name: 'Tinker' }, content: '<div>card</div>', rolls, check });

  for (const [version, mode] of [
    [13, { rollMode: 'publicroll' }],
    [14, { messageMode: 'public' }],
  ]) {
    it(`V${version}: a public card carries the check rolls first and names the public mode`, async () => {
      const created = installChatMessage({ version });
      const { key, check } = offered(checkResult());
      await card(check, [roll('2d6')]);
      assert.equal(created.length, 1);
      assert.deepEqual(created[0].data.rolls, [roll('1d20'), roll('1d4'), roll('2d6')]);
      assert.deepEqual(created[0].data.speaker, { alias: 'Tinker' });
      assert.deepEqual(created[0].options, mode);
      assert.ok(!('whisper' in created[0].data), 'the card data names no whisper');
      assert.ok(!('author' in created[0].data), 'an offer with no author leaves it to the client');
      assert.equal(await settleCardRolls(key), true);
    });
  }

  it("authors a card carrying check rolls as the offer's user, and no other card", async () => {
    const created = installChatMessage();
    const authored = (result) => {
      const key = offerCardRolls({ rolls: () => [roll('1d20')], author: 'player' });
      return { key, check: checkDisplayForCard({ ...result, cardRolls: key }) };
    };
    const carried = authored(checkResult());
    await card(carried.check);
    assert.equal(created[0].data.author, 'player');
    const kept = authored(checkResult('gmroll'));
    await card(kept.check);
    assert.ok(!('author' in created[1].data), 'a card with no check roll keeps its own author');
    await settleCardRolls(carried.key);
    await settleCardRolls(kept.key);
  });

  it('leads with a dice-bearing roll, since Dice So Nice reads the first roll alone', async () => {
    const created = installChatMessage();
    const flat = { formula: '5', dice: [] };
    const rolled = { formula: '1d4', dice: [{ faces: 4 }] };
    const award = { formula: '2d6', dice: [{ faces: 6 }] };
    const key = offerCardRolls({ rolls: () => [flat, rolled] });
    await card(checkDisplayForCard({ ...checkResult(), cardRolls: key }), [award]);
    assert.deepEqual(created[0].data.rolls, [rolled, flat, award]);
    await settleCardRolls(key);

    const diceless = offerCardRolls({ rolls: () => [flat, { formula: '7', dice: [] }] });
    await card(checkDisplayForCard({ ...checkResult(), cardRolls: diceless }));
    assert.deepEqual(
      created[1].data.rolls.map((entry) => entry.formula),
      ['5', '7'],
      'with no dice anywhere the order stands'
    );
    await settleCardRolls(diceless);
  });

  for (const rollMode of ['gmroll', 'blindroll', 'selfroll']) {
    it(`a ${rollMode} card carries no check roll even when one is offered`, async () => {
      const created = installChatMessage();
      const { key, check } = offered(checkResult(rollMode));
      await card(check);
      assert.equal('rolls' in created[0].data, false);
      assert.equal(created[0].options, undefined, 'a roll-free card names no mode');
      assert.equal(await settleCardRolls(key), false, 'the offer is left for its own message');
    });
  }

  it('a secret card carries no check roll', async () => {
    const created = installChatMessage();
    const visibility = { rollMode: 'publicroll', secret: true };
    const { key, check } = offered(checkResult('publicroll', { visibility }));
    await card(check);
    assert.equal('rolls' in created[0].data, false);
    assert.equal(await settleCardRolls(key), false);
  });

  it('a card with only rolled award amounts posts as it did, naming no mode', async () => {
    const created = installChatMessage();
    await card(checkDisplayForCard(checkResult()), [roll('2d6')]);
    assert.deepEqual(created[0].data.rolls, [roll('2d6')]);
    assert.equal(created[0].options, undefined);
  });

  it('leaves the offer unclaimed when the card cannot be created', async () => {
    installChatMessage({ failing: true });
    const errors = [];
    const original = console.error;
    console.error = (...args) => {
      errors.push(args);
    };
    try {
      const { key, check } = offered(checkResult());
      await card(check);
      assert.equal(errors.length, 1, 'the failure is logged, never thrown');
      assert.equal(await settleCardRolls(key), false);
    } finally {
      console.error = original;
    }
  });
});

describe('checkDisplayForCard', () => {
  it('names the offer under a key no clone or transport keeps', () => {
    const display = checkDisplayForCard(checkResult('publicroll', { cardRolls: 'request-1' }));
    assert.equal(display[CARD_ROLLS], 'request-1');
    assert.equal(structuredClone(display)[CARD_ROLLS], undefined);
    assert.doesNotMatch(JSON.stringify(display), /request-1/);
    assert.deepEqual(Object.keys(display), Object.keys(checkDisplayForCard(checkResult())));
  });
});

describe('withOfferedHandoff', () => {
  const handoff = { serializedRoll: { formula: '1d20', total: 14 } };
  const Roll = { fromData: (data) => ({ rebuilt: data.formula }) };

  it('offers a public check under the key, and survives the clone a grant takes', async () => {
    const offered = structuredClone(withOfferedHandoff(checkResult(), handoff, 'request-public'));
    assert.equal(offered.cardRolls, 'request-public');
    assert.equal(await settleCardRolls('request-public'), false);
  });

  it('offers nothing for a private or secret check, or one with no handoff', () => {
    const secret = checkResult('publicroll', {
      visibility: { rollMode: 'publicroll', secret: true },
    });
    for (const result of [checkResult('gmroll'), checkResult('blindroll'), secret]) {
      assert.equal(withOfferedHandoff(result, handoff, 'request-private'), result);
    }
    const open = checkResult();
    assert.equal(withOfferedHandoff(open, null, 'request-private'), open);
    assert.deepEqual(offeredCardRolls('request-private'), []);
  });

  it('rebuilds the check roll first, from copies, since Roll.fromData mutates its input', () => {
    const data = {
      serializedRoll: { formula: '1d20' },
      serializedPreRolls: [{ formula: '1d4' }, { formula: '1d6' }],
    };
    const mutating = {
      fromData: (entry) => {
        entry.consumed = true;
        return { rebuilt: entry.formula };
      },
    };
    assert.deepEqual(handoffRolls(data, mutating), [
      { rebuilt: '1d20' },
      { rebuilt: '1d4' },
      { rebuilt: '1d6' },
    ]);
    assert.equal(data.serializedRoll.consumed, undefined);
    assert.equal(data.serializedPreRolls[0].consumed, undefined);
    assert.throws(() => handoffRolls(data, { fromData: () => null }), /reconstruction failed/);
    assert.deepEqual(handoffRolls(handoff, Roll), [{ rebuilt: '1d20' }]);
  });
});

/**
 * One interactive execute through the elected GM's command service and a real authority. The
 * stage's `execute` reads its trusted check result through the grant, as the crafting engine does,
 * and posts the result card with it when `postsCard`.
 */
async function executeThroughAuthority({
  rollMode = 'publicroll',
  runType = 'crafting',
  postsCard = true,
  authorizeRollHandoff = null,
  execute = null,
  stageMethod = 'execute',
  electedAfterEvaluation = true,
  payload = undefined,
}) {
  const created = installChatMessage();
  const previousRoll = globalThis.Roll;
  Object.assign(globalThis, { Roll: { fromData: (data) => ({ rebuilt: data.formula }) } });
  const gm = { id: 'gm', isGM: true };
  const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
  const handoff = { serializedRoll: { formula: '1d20', total: 14 } };
  const posted = [];
  let id = 0;
  let elected = true;
  const service = createJournalRunCommandService({
    authority: replicatedAuthorityFixture().authority,
    currentUser: () => gm,
    activeGM: () => (elected ? gm : null),
    getUser: () => gm,
    resolveUuid: async () => ({ uuid: 'Actor.a', name: 'Tinker' }),
    emit: () => {},
    randomId: () => `request-${++id}`,
    promptCheck: async () => ({ confirmed: true, rollMode }),
    postRollHandoff: async (received) => {
      posted.push(received);
    },
    operations: {
      [runType]: {
        getRun: () => run,
        describeCheck: async () => ({
          required: true,
          publicPrompt: { label: 'Forge' },
          privateEvaluation: { rollFormula: '1d20' },
        }),
        evaluateCheck: async () => {
          elected = electedAfterEvaluation;
          return { ...checkResult(rollMode), engineEvaluated: true, rollHandoff: handoff };
        },
        ...(authorizeRollHandoff && { authorizeRollHandoff }),
        [stageMethod]: async ({ actor, executionGrant, requestId }) => {
          if (execute) return execute();
          const trusted = service.consumeExecutionGrant(executionGrant, {
            operation: 'execute',
            requestId,
          });
          if (postsCard) {
            const check = checkDisplayForCard(trusted.resolvedCheckResult);
            await postResultCard({ actor, content: '<div>card</div>', rolls: [], check });
          }
          return { success: true, runId: run.id, runRevision: 4 };
        },
      },
    },
  });
  try {
    const response = await service
      .executeJournalRunCommand({
        actorUuid: 'Actor.a',
        runType,
        runId: run.id,
        expectedRevision: 3,
        action: 'execute',
        ...(payload && { payload }),
      })
      .catch((error) => ({ threw: error }));
    return { response, created, posted, handoff };
  } finally {
    if (previousRoll === undefined) delete globalThis.Roll;
    else Object.assign(globalThis, { Roll: previousRoll });
  }
}

describe('a Journal crafting check whose card carries the roll', () => {
  it('returns no handoff for a public check, so the requester posts no second message', async () => {
    const { response, created, posted } = await executeThroughAuthority({});
    assert.equal(response.success, true, JSON.stringify(response));
    assert.deepEqual(
      created.map((message) => message.data.rolls),
      [[{ rebuilt: '1d20' }]]
    );
    assert.deepEqual(created[0].options, { messageMode: 'public' });
    assert.equal(Object.hasOwn(response, 'rollHandoff'), false);
    assert.deepEqual(posted, [], 'the dice ride the one card');
    assert.ok(response.check, 'the executed evidence still reaches the entitled requester');
  });

  for (const rollMode of ['gmroll', 'blindroll', 'selfroll']) {
    it(`keeps the ${rollMode} roll off the card and hands it back for its own message`, async () => {
      const { response, created, posted, handoff } = await executeThroughAuthority({ rollMode });
      assert.equal('rolls' in created[0].data, false);
      assert.deepEqual(response.rollHandoff, handoff);
      assert.deepEqual(posted, [handoff]);
    });
  }

  it('hands a public roll back when the stage posted no card', async () => {
    const { response, created, posted, handoff } = await executeThroughAuthority({
      postsCard: false,
    });
    assert.deepEqual(created, []);
    assert.deepEqual(response.rollHandoff, handoff);
    assert.deepEqual(posted, [handoff], 'the roll still animates, as its own message');
  });

  it('authors the card as the attested sender, whatever the payload names', async () => {
    const { created } = await executeThroughAuthority({
      payload: { senderId: 'forged', author: 'forged' },
    });
    assert.equal(created[0].data.author, 'gm', 'the sender the transport attested');
  });

  it('keeps the roll off the card of an initiator the handoff is refused to', async () => {
    const { response, created, posted } = await executeThroughAuthority({
      authorizeRollHandoff: async () => false,
    });
    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(created.length, 1);
    assert.equal('rolls' in created[0].data, false, 'the card carries no check roll');
    assert.equal(Object.hasOwn(response, 'rollHandoff'), false);
    assert.deepEqual(posted, [], 'and no roll message is posted');
    assert.equal(openCardRollsCount(), 0);
  });

  for (const [exit, options, reason] of [
    ['the stage throws', { execute: () => Promise.reject(new Error('stage failed')) }, null],
    [
      'the election is lost after the check',
      { electedAfterEvaluation: false },
      'active-gm-required',
    ],
    ['the operation has no stage method', { stageMethod: 'absent' }, 'unsupported-operation'],
  ]) {
    it(`leaves no offer open when ${exit}`, async () => {
      const { response, created, posted } = await executeThroughAuthority(options);
      assert.notEqual(response.success, true);
      if (reason) assert.match(JSON.stringify(response), new RegExp(reason));
      assert.deepEqual(created, []);
      assert.deepEqual(posted, []);
      assert.equal(openCardRollsCount(), 0, 'the offer the check opened is closed');
    });
  }

  it('never offers a gathering roll, whose card states no roll', async () => {
    const { response, created, posted, handoff } = await executeThroughAuthority({
      runType: 'gathering',
    });
    assert.equal('rolls' in created[0].data, false);
    assert.deepEqual(response.rollHandoff, handoff);
    assert.deepEqual(posted, [handoff]);
  });
});

/**
 * A real prepared count check, evaluated as the authority does, executed through the real crafting
 * engine's versioned stage with the check result the grant hands it.
 */
async function executeRealStage(rollMode) {
  const created = installChatMessage();
  const dice = installCountDice({ faces: [9, 8], chat: false });
  try {
    const evaluated = await evaluatePreparedRunCheck(
      preparedCountCheck(),
      { getRollData: () => ({}) },
      { rollMode }
    );
    const { rollHandoff, secret, ...trusted } = evaluated;
    assert.equal(secret, false);
    const key = `stage-${rollMode}`;
    const offered = structuredClone(withOfferedHandoff(trusted, rollHandoff, key));
    const fixture = await createPersistedCraftingHistory({
      stageCount: 1,
      timed: false,
      drive: async (context) => {
        context.system.features.chatOutput = true;
        context.engine.installVersionedRunAuthority({
          consumeExecutionGrant: async () => ({ operationId: key, resolvedCheckResult: offered }),
        });
        const stage = await context.engine.executeVersionedStage({
          viewer: context.gm,
          actor: context.actor,
          componentSourceActors: context.sources,
          runId: context.runId,
          expectedRevision: context.manager().getRun(context.actor, context.runId).runRevision,
          requestId: key,
          executionGrant: 'grant',
        });
        return { stage, carried: await settleCardRolls(key) };
      },
    });
    const cards = created.filter(({ data }) =>
      String(data.content).includes('fabricate-craft-chat')
    );
    return { ...fixture, cards, rollHandoff, CountRoll: dice.CountRoll, rolled: dice.formulas() };
  } finally {
    dice.restore();
  }
}

test('the real versioned stage posts one card carrying a public count Roll, never rerolled', async () => {
  const { stage, carried, cards, rollHandoff, CountRoll, rolled } =
    await executeRealStage('publicroll');
  assert.equal(stage.success, true, JSON.stringify(stage));
  assert.ok(rollHandoff?.serializedRoll, 'positive control: the evaluation produced a handoff');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].data.rolls.length, 1);
  assert.ok(cards[0].data.rolls[0] instanceof CountRoll, 'the card carries the rebuilt count Roll');
  assert.equal(cards[0].data.rolls[0].total, rollHandoff.serializedRoll.total);
  assert.deepEqual(cards[0].options, { messageMode: 'public' });
  assert.match(String(cards[0].data.content), /data-dice-tile/, 'beside the tiles it states');
  assert.equal(carried, true, 'so the authority returns no handoff');
  assert.equal(rolled.length, 1, 'the dice were rolled once, by the evaluation');
});

test('the real versioned stage keeps a private count Roll off its card', async () => {
  const { stage, carried, cards } = await executeRealStage('gmroll');
  assert.equal(stage.success, true, JSON.stringify(stage));
  assert.equal(cards.length, 1);
  assert.equal('rolls' in cards[0].data, false);
  assert.equal(carried, false, 'so the roll keeps its own message under its own visibility');
});
