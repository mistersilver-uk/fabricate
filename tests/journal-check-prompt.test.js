import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PREPARE_RETRY_LIMIT } from '../src/systems/journalCheckPrompt.js';
import { createJournalRunCommandService } from '../src/systems/journalRunCommands.js';
import { decisionStandsFor } from '../src/systems/preparedDecisionPolicy.js';

import { replicatedAuthorityFixture } from './helpers/replicatedJournalAuthority.js';

const COMMAND = Object.freeze({
  actorUuid: 'Actor.a',
  runType: 'crafting',
  runId: 'run-1',
  expectedRevision: 3,
  action: 'execute',
  payload: { selectionPlan: { setId: 'one' } },
});

/**
 * The elected GM's own command service over a real authority, so a token is issued, expired,
 * consumed and released by the production store. `describe(call)` answers each preparation, and
 * `clock.now` is shared by the service and the authority.
 */
function promptHarness({ describe: describeCheck, promptCheck, now = null }) {
  const clock = { now: 1000 };
  const read = now ?? (() => clock.now);
  const world = replicatedAuthorityFixture({ now: read });
  const gm = { id: 'gm', isGM: true };
  const run = { id: COMMAND.runId, lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
  const seen = { describes: 0, evaluated: [], executes: 0, notices: 0, prompts: [] };
  let id = 0;
  const service = createJournalRunCommandService({
    authority: world.authority,
    currentUser: () => gm,
    activeGM: () => gm,
    getUser: () => gm,
    resolveUuid: async () => ({ uuid: COMMAND.actorUuid }),
    emit: () => {},
    randomId: () => `request-${++id}`,
    now: read,
    promptCheck: async (descriptor) => {
      seen.prompts.push(descriptor);
      return promptCheck(descriptor, clock, seen.prompts.length);
    },
    onCheckChanged: () => (seen.notices += 1),
    operations: {
      crafting: {
        getRun: () => run,
        describeCheck: async () => describeCheck((seen.describes += 1)),
        evaluateCheck: async ({ decision }) => {
          seen.evaluated.push(decision);
          return { engineEvaluated: true, success: true, data: {} };
        },
        execute: async () => ({ success: true, runId: run.id, runRevision: (seen.executes += 1) }),
      },
    },
  });
  const tokenStatuses = () =>
    Object.values(world.state().prepareTokens).map((record) => record.status);
  return { service, clock, seen, tokenStatuses };
}

const required = (publicPrompt) => ({
  required: true,
  publicPrompt,
  privateEvaluation: { rollFormula: '1d20' },
});

const FORGE = Object.freeze({ label: 'Forge', target: 12, allowsSituationalModifier: true });

describe('a prepare token refused after the roll prompt', () => {
  it('settles the answer under a fresh preparation without asking again', async () => {
    const { service, seen, tokenStatuses } = promptHarness({
      describe: () => required({ ...FORGE }),
      promptCheck: async (_descriptor, clock) => {
        clock.now += 61_000;
        return { confirmed: true, bonus: '2' };
      },
    });
    const response = await service.executeJournalRunCommand(COMMAND);

    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(seen.prompts.length, 1, 'the player is asked once');
    assert.equal(seen.notices, 0);
    assert.equal(seen.describes, 2, 'the original command prepared the check again');
    assert.equal(seen.evaluated.length, 1);
    assert.equal(seen.evaluated[0].bonus, '2', 'the answer given to the expired prompt settled');
    assert.equal(seen.executes, 1);
    assert.deepEqual(tokenStatuses(), ['released', 'consumed'], 'the expired token is not active');
  });

  it('asks again with a notice when the fresh preparation describes a different check', async () => {
    const { service, seen, tokenStatuses } = promptHarness({
      describe: (call) => required({ ...FORGE, target: call === 1 ? 12 : 15 }),
      promptCheck: async (_descriptor, clock, call) => {
        if (call === 1) clock.now += 61_000;
        return { confirmed: true, bonus: call === 1 ? '2' : '4' };
      },
    });
    const response = await service.executeJournalRunCommand(COMMAND);

    assert.equal(response.success, true, JSON.stringify(response));
    assert.deepEqual(
      seen.prompts.map((descriptor) => descriptor.target),
      [12, 15],
      'the second prompt shows the fresh descriptor'
    );
    assert.equal(seen.notices, 1, 'the player is told the details changed');
    assert.equal(seen.evaluated.length, 1);
    assert.equal(seen.evaluated[0].bonus, '4', 'the second answer is the one that settled');
    assert.deepEqual(tokenStatuses(), ['released', 'consumed']);
  });

  it('releases the fresh token when the reopened prompt is dismissed', async () => {
    const { service, seen, tokenStatuses } = promptHarness({
      describe: (call) => required({ ...FORGE, target: call === 1 ? 12 : 15 }),
      promptCheck: async (_descriptor, clock, call) => {
        if (call === 1) clock.now += 61_000;
        return { confirmed: call === 1 };
      },
    });
    const response = await service.executeJournalRunCommand(COMMAND);

    assert.deepEqual(response, { success: false, cancelled: true, reason: 'roll-cancelled' });
    assert.equal(seen.executes, 0);
    assert.equal(seen.evaluated.length, 0);
    assert.deepEqual(tokenStatuses(), ['released', 'released'], 'no token is left active');
  });

  it('stops preparing again at the retry limit and answers the refusal', async () => {
    // Every clock read is 100s on, so each token is past its minute by the time it is consumed.
    let time = 0;
    const { service, seen, tokenStatuses } = promptHarness({
      describe: () => required({ ...FORGE }),
      promptCheck: async () => ({ confirmed: true }),
      now: () => (time += 100_000),
    });
    const response = await service.executeJournalRunCommand(COMMAND);

    assert.deepEqual(response, { success: false, reason: 'prepare-token-invalid' });
    assert.equal(seen.describes, 1 + PREPARE_RETRY_LIMIT);
    assert.equal(seen.prompts.length, 1);
    assert.equal(seen.executes, 0);
    assert.ok(
      tokenStatuses().every((status) => status === 'released'),
      'every refused token is released'
    );
  });

  it('answers the reason a fresh preparation refuses with', async () => {
    const { service, seen } = promptHarness({
      describe: (call) =>
        call === 1
          ? required({ ...FORGE })
          : { required: false, blocked: 'source-actor-not-found' },
      promptCheck: async (_descriptor, clock) => {
        clock.now += 61_000;
        return { confirmed: true };
      },
    });
    const response = await service.executeJournalRunCommand(COMMAND);

    assert.deepEqual(response, { success: false, reason: 'source-actor-not-found' });
    assert.equal(seen.prompts.length, 1);
    assert.equal(seen.executes, 0);
  });

  it('settles a prompt answered inside the minute on its first token', async () => {
    const { service, seen, tokenStatuses } = promptHarness({
      describe: () => required({ ...FORGE }),
      promptCheck: async (_descriptor, clock) => {
        clock.now += 59_000;
        return { confirmed: true };
      },
    });
    const response = await service.executeJournalRunCommand(COMMAND);

    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(seen.describes, 1);
    assert.deepEqual(tokenStatuses(), ['consumed']);
  });
});

describe('decisionStandsFor', () => {
  const offer = (overrides = {}) => ({
    available: 5,
    limit: 3,
    max: 3,
    resourceLabel: 'Focus',
    unavailable: null,
    reach: { needed: 2, perDieMost: 1, explode: 'off', rescued: false },
    ...overrides,
  });
  const check = (additionalDiceOffer) => ({
    label: 'Forge',
    product: 'count',
    pool: 4,
    ...(additionalDiceOffer && { additionalDiceOffer }),
  });

  it('holds for the same check however its keys are ordered', () => {
    const answered = {
      label: 'Forge',
      target: 12,
      advantageOffer: { advantage: true, kind: 'keep' },
    };
    const fresh = { advantageOffer: { kind: 'keep', advantage: true }, target: 12, label: 'Forge' };
    assert.equal(decisionStandsFor({ confirmed: true }, answered, fresh), true);
  });

  it('fails when any described fact differs', () => {
    const answered = { label: 'Forge', target: 12, selectedModifiers: [{ label: 'Focus' }] };
    assert.equal(decisionStandsFor({}, answered, { ...answered, target: 13 }), false);
    assert.equal(decisionStandsFor({}, answered, { ...answered, selectedModifiers: [] }), false);
  });

  it('holds while the bought dice stay within the fresh limit', () => {
    const answered = check(offer());
    const poorer = check(offer({ available: 2, limit: 2 }));
    assert.equal(decisionStandsFor({ additionalDice: 2 }, answered, poorer), true);
    assert.equal(decisionStandsFor({ additionalDice: 3 }, answered, poorer), false);
    assert.equal(decisionStandsFor({ additionalDice: 0 }, answered, poorer), true);
  });

  it('fails when the offer appears, disappears or changes its terms', () => {
    const answered = check(offer());
    assert.equal(decisionStandsFor({}, answered, check(null)), false);
    assert.equal(decisionStandsFor({}, check(null), answered), false);
    const unavailable = check(offer({ unavailable: 'resourceUnreadable', limit: 0 }));
    assert.equal(decisionStandsFor({}, answered, unavailable), false);
    const reach = { needed: 3, perDieMost: 1, explode: 'off', rescued: false };
    assert.equal(decisionStandsFor({}, answered, check(offer({ reach }))), false);
  });
});
