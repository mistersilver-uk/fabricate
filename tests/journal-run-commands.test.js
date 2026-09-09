import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JOURNAL_RUN_SOCKET_KIND,
  journalRunDismissalKey,
  createJournalRunCommandService,
} from '../src/systems/journalRunCommands.js';

function commandHarness({
  currentUserId = 'player',
  activeGMId = 'gm',
  timeoutMs = 20,
  run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' },
  getDismissals = () => ({}),
  setDismissals = async () => undefined,
  operations = null,
  promptCheck = null,
  postRollHandoff = null,
  authority = null,
} = {}) {
  const emitted = [];
  const users = new Map([
    ['player', { id: 'player', isGM: false }],
    ['other', { id: 'other', isGM: false }],
    ['gm', { id: 'gm', isGM: true }],
  ]);
  const actor = {
    uuid: 'Actor.a',
    testUserPermission: (user, level) => level === 'OWNER' && user?.id === 'player',
  };
  let id = 0;
  const service = createJournalRunCommandService({
    authority: authority ?? {
      availability: () => ({ available: true, reason: null }),
      run: async (_request, handler) =>
        handler({
          createExecutionGrant: () => ({ grant: true }),
          issuePrepareToken: () => 'token',
          consumePrepareToken: () => ({}),
          releasePrepareToken: () => true,
        }),
      consumeExecutionGrant: (grant) => grant?.grant === true,
    },
    currentUser: () => users.get(currentUserId),
    activeGM: () => users.get(activeGMId) ?? null,
    getUser: (userId) => users.get(userId) ?? null,
    resolveUuid: async (uuid) => (uuid === actor.uuid ? actor : null),
    emit: (message) => emitted.push(message),
    randomId: () => `id-${++id}`,
    timeoutMs,
    operations: operations ?? {
      crafting: {
        getRun: () => run,
        execute: async (args) => ({ success: true, action: 'execute', args }),
        cancel: async (args) => ({ success: true, action: 'cancel', args }),
      },
    },
    getDismissals,
    setDismissals,
    promptCheck,
    postRollHandoff,
  });
  return { service, emitted, actor };
}

describe('journal run command protocol', () => {
  it('accepts a command only from the server-attested sender and re-resolves ownership', async () => {
    const { service } = commandHarness({ currentUserId: 'gm' });
    const reply = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
        senderId: 'other',
      },
      'player'
    );
    assert.equal(reply.response.success, true);
    assert.equal(reply.recipientId, 'player');

    const denied = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r2',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'other'
    );
    assert.equal(denied.response.reason, 'owner-required');
  });

  it('lets only the elected GM tab answer a broadcast request', async () => {
    const { service, emitted } = commandHarness({ currentUserId: 'player' });
    const result = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'player'
    );
    assert.equal(result, null);
    assert.deepEqual(emitted, []);
  });

  it('keeps a losing elected-GM tab silent so it cannot outrun the claim winner', async () => {
    const { service, emitted } = commandHarness({
      currentUserId: 'gm',
      authority: {
        availability: () => ({ available: false, reason: 'claim-held' }),
        run: async () => ({ success: false, reason: 'claim-held' }),
        consumeExecutionGrant: () => null,
      },
    });
    const result = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'player'
    );
    assert.equal(result, null);
    assert.deepEqual(emitted, []);
  });

  it('rejects stale revision before invoking an operation', async () => {
    const { service } = commandHarness({ currentUserId: 'gm' });
    const reply = await service.handleRequest(
      {
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 2,
        action: 'execute',
      },
      'player'
    );
    assert.deepEqual(reply, { success: false, reason: 'stale-run', currentRevision: 3 });
  });

  it('fails closed for unsupported run operations with zero effects', async () => {
    const { service } = commandHarness({ currentUserId: 'gm' });
    const reply = await service.handleRequest(
      {
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'gathering',
        runId: 'run-1',
        expectedRevision: 0,
        action: 'execute',
      },
      'player'
    );
    assert.equal(reply.reason, 'unsupported-operation');
  });

  it('rejects legacy runs at the versioned command boundary', async () => {
    const { service } = commandHarness({ currentUserId: 'gm', run: { id: 'run-1', runRevision: 3 } });
    const response = await service.handleRequest(
      {
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'player'
    );
    assert.equal(response.reason, 'unsupported-version');
  });

  it('dispatches an authority-prepared recipe-less alchemy fizzle through its durable operation', async () => {
    let starts = 0;
    let fizzles = 0;
    const { service } = commandHarness({
      currentUserId: 'gm',
      operations: {
        crafting: {
          prepareStart: async () => ({
            success: true,
            executionOperation: 'executeAlchemyFizzle',
            payload: { craftingSystemId: 'alchemy' },
            trustedContext: { activityKind: 'alchemy', matched: false },
          }),
          start: async () => (++starts, { success: true }),
          executeAlchemyFizzle: async () => (++fizzles, {
            success: false,
            disposition: 'no-match',
          }),
        },
      },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: '',
      expectedRevision: 0,
      action: 'start',
      payload: { activityKind: 'alchemy' },
    });
    assert.equal(response.disposition, 'no-match');
    assert.equal(starts, 0);
    assert.equal(fizzles, 1);
  });

  it('prepares on the GM, accepts only player decisions, and posts a validated handoff locally', async () => {
    let executeArgs = null;
    let evaluatedDecision = null;
    let posted = null;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({
        confirmed: true,
        total: 999,
        chosenModifierIds: ['allowed'],
        advantage: 'advantage',
      }),
      postRollHandoff: async (handoff) => (posted = handoff),
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Forge', mode: 'simple' },
            privateEvaluation: { rollFormula: '1d20' },
          }),
          evaluateCheck: async ({ decision }) => {
            evaluatedDecision = decision;
            return {
              engineEvaluated: true,
              success: true,
              value: 17,
              data: {},
              rollHandoff: { serializedRoll: { formula: '1d20', total: 17 } },
            };
          },
          execute: async (args) => {
            executeArgs = args;
            return { success: true };
          },
        },
      },
    });
    const result = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
      payload: { total: 500, roll: { formula: 'bad' }, selectionPlan: { setId: 'one' } },
    });
    assert.equal(result.success, true);
    assert.deepEqual(evaluatedDecision, {
      bonus: null,
      rollMode: null,
      advantage: 'advantage',
      modifierIds: ['allowed'],
    });
    assert.equal(Object.hasOwn(executeArgs.payload, 'total'), false);
    assert.equal(Object.hasOwn(executeArgs.payload, 'roll'), false);
    assert.deepEqual(executeArgs.payload.selectionPlan, { setId: 'one' });
    assert.deepEqual(posted, { serializedRoll: { formula: '1d20', total: 17 } });
  });

  it('releases a prepared check on local dismissal without invoking the mutation', async () => {
    let releases = 0;
    let mutations = 0;
    const { service } = commandHarness({
      currentUserId: 'gm',
      promptCheck: async () => ({ confirmed: false }),
      authority: {
        availability: () => ({ available: true, reason: null }),
        run: async (_request, handler) => handler({
          createExecutionGrant: () => ({ grant: true }),
          issuePrepareToken: () => 'token',
          consumePrepareToken: () => null,
          releasePrepareToken: () => (++releases, true),
        }),
        consumeExecutionGrant: () => ({}),
      },
      operations: {
        crafting: {
          getRun: () => ({ id: 'run-1', lifecycleVersion: 1, runRevision: 3 }),
          describeCheck: async () => ({ required: true, publicPrompt: {}, privateEvaluation: {} }),
          execute: async () => (++mutations, { success: true }),
        },
      },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.equal(response.cancelled, true);
    assert.equal(releases, 1);
    assert.equal(mutations, 0);
  });

  it('returns a sanitized secret-check reply without live results or roll details', async () => {
    let posts = 0;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({ confirmed: true }),
      postRollHandoff: async () => { posts += 1; },
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Unknown work' },
            privateEvaluation: { rollFormula: '1d20+9' },
          }),
          evaluateCheck: async () => ({
            engineEvaluated: true,
            secret: true,
            success: true,
            outcome: 'hidden-tier',
            value: 19,
            data: { diceGroups: [{ group: '1d20', results: [19] }] },
          }),
          execute: async () => ({
            success: true,
            message: '19 vs DC 15',
            disposition: 'hidden-tier',
            results: [{ uuid: 'Item.secret', update() {} }],
          }),
        },
      },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.deepEqual(response, {
      success: true,
      runId: 'run-1',
      status: null,
      runRevision: null,
      secret: true,
      reason: null,
    });
    assert.equal(posts, 0);
  });

  it('accepts replies only from the elected GM for this recipient/session/correlation', async () => {
    const { service, emitted } = commandHarness();
    const pending = service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    const request = emitted[0];
    const base = {
      kind: JOURNAL_RUN_SOCKET_KIND.REPLY,
      recipientId: 'player',
      sessionId: request.sessionId,
      requestId: request.requestId,
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      response: { success: true },
    };
    assert.equal(service.acceptReply({ ...base, recipientId: 'other' }, 'gm'), false);
    assert.equal(service.acceptReply({ ...base, sessionId: 'late-tab' }, 'gm'), false);
    assert.equal(service.acceptReply({ ...base, requestId: 'wrong' }, 'gm'), false);
    assert.equal(service.acceptReply(base, 'other'), false);
    assert.equal(service.acceptReply(base, 'gm'), true);
    assert.deepEqual(await pending, { success: true });
    assert.equal(service.acceptReply(base, 'gm'), false, 'late duplicate reply is ignored');
  });

  it('times out visibly and a retry receives a fresh request id', async () => {
    const { service, emitted } = commandHarness({ timeoutMs: 5 });
    const first = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.equal(first.reason, 'command-timeout');
    void service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.notEqual(emitted[0].requestId, emitted[1].requestId);
  });

  it('uses collision-safe JSON tuple dismissal keys', () => {
    assert.equal(
      journalRunDismissalKey({ actorUuid: 'Actor.a:b', runType: 'crafting', runId: 'c:d' }),
      '["Actor.a:b","crafting","c:d"]'
    );
  });

  it('dismisses only terminal history into the user setting and never mutates the run', async () => {
    let stored = {};
    const terminal = { id: 'run-1', lifecycleVersion: 1, runRevision: 4, status: 'completed' };
    const { service } = commandHarness({
      run: terminal,
      getDismissals: () => stored,
      setDismissals: async (value) => (stored = value),
    });
    const result = await service.dismissJournalRun({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
    });
    assert.equal(result.success, true);
    assert.equal(Object.keys(stored).length, 1);
    assert.equal(terminal.status, 'completed', 'history is untouched');
    assert.ok(service.getDismissedJournalRunKeys({ actorUuid: 'Actor.a', viewerId: 'player' }).has(result.key));

    const active = commandHarness({ run: { ...terminal, status: 'waiting' } });
    assert.equal(
      (await active.service.dismissJournalRun({
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
      })).reason,
      'active-run'
    );
  });
});
