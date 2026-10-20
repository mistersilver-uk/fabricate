/** One-call version-1 brewing through `submitAlchemyAttempt` (issue 2574). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { serializedOperationResult } from '../src/systems/journalRunReply.js';
import { executePublicBrew } from '../src/systems/publicAlchemyBrew.js';
import { versionedTransitionResult } from '../src/systems/versionedCommandResults.js';

const actor = { uuid: 'Actor.alchemist' };
const sourceActors = [{ uuid: 'Actor.alchemist' }, { uuid: 'Actor.satchel' }];

/** A reply in the shape the command layer serializes `startVersionedRun`'s result into. */
function startReply({ status = 'inProgress', canExecuteImmediately = true } = {}) {
  const run = { id: 'run-1', status, runRevision: 3, currentStepIndex: 0 };
  return serializedOperationResult({
    ...versionedTransitionResult(run, { success: true, disposition: 'started' }),
    started: true,
    requiresExecution: status !== 'waitingTime',
    canExecuteImmediately,
  });
}

function executeReply(outcome) {
  const run = {
    id: 'run-1',
    status: outcome.success ? 'succeeded' : 'failed',
    runRevision: 5,
    currentStepIndex: null,
  };
  return serializedOperationResult(versionedTransitionResult(run, outcome));
}

function brew({ started, settled = null, interactive = false, executeCommand } = {}) {
  const commands = [];
  const reply = executePublicBrew({
    requestStart: async () => started,
    actor,
    sourceActors,
    interactive,
    executeCommand:
      executeCommand === undefined
        ? async (command, options) => {
            commands.push({ command, options });
            return settled;
          }
        : executeCommand,
  });
  return { reply, commands };
}

test("a ready matched brew executes once with the started revision and the caller's flag", async () => {
  const settled = executeReply({
    success: true,
    disposition: 'succeeded',
    createdResultUuids: ['Actor.alchemist.Item.elixir'],
  });
  const { reply, commands } = brew({ started: startReply(), settled, interactive: true });
  const result = await reply;

  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0], {
    command: {
      actorUuid: actor.uuid,
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
      payload: { trigger: 'manual', sourceActorUuids: ['Actor.alchemist', 'Actor.satchel'] },
    },
    options: { interactive: true },
  });
  assert.equal(Object.hasOwn(commands[0].command.payload, 'selectionPlan'), false);
  assert.equal(result.success, true);
  assert.equal(result.disposition, 'succeeded');
  assert.deepEqual(result.createdResultUuids, ['Actor.alchemist.Item.elixir']);
});

test('the public API default keeps the execute non-interactive', async () => {
  const { reply, commands } = brew({
    started: startReply(),
    settled: executeReply({ success: true }),
  });
  await reply;
  assert.deepEqual(commands[0].options, { interactive: false });
});

test('waiting, unready, fizzled and refused starts are returned unchanged', async () => {
  const fizzle = serializedOperationResult(
    versionedTransitionResult(
      { id: 'run-2', status: 'failed', runRevision: 1, currentStepIndex: null },
      {
        success: false,
        disposition: 'no-match',
        consumed: true,
      }
    )
  );
  const refusal = { success: false, reason: 'alchemy-submission-invalid' };
  for (const started of [
    startReply({ status: 'waitingTime' }),
    startReply({ canExecuteImmediately: false }),
    fizzle,
    refusal,
  ]) {
    const { reply, commands } = brew({ started, settled: executeReply({ success: true }) });
    assert.equal(await reply, started);
    assert.equal(commands.length, 0);
  }
});

test('a ready start without an execute command reports it rather than reading as brewed', async () => {
  const started = startReply();
  const result = await brew({ started, executeCommand: null }).reply;
  assert.equal(result.success, false);
  assert.equal(result.reason, 'execute-command-unavailable');
  assert.equal(result.runId, 'run-1');
});

test('a roll dismissed after the start keeps the started run on the reply', async () => {
  const settled = { success: false, cancelled: true, reason: 'roll-cancelled' };
  const result = await brew({ started: startReply(), settled }).reply;
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.runId, 'run-1');
  assert.equal(result.requiresExecution, true);
});

test('an execute that rejects after the start answers the live run instead of throwing', async () => {
  const executeCommand = async () => {
    throw new Error('socket closed');
  };
  const result = await brew({ started: startReply(), executeCommand }).reply;
  assert.equal(result.success, false);
  assert.equal(result.reason, 'operation-failed');
  assert.equal(result.runId, 'run-1');
  assert.equal(result.requiresExecution, true);
});
