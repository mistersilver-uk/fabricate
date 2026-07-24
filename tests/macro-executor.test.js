import test from 'node:test';
import assert from 'node:assert/strict';

import { MacroExecutor } from '../src/utils/MacroExecutor.js';

function withFakeFoundry(macroCommand, run, runtime = {}) {
  const previousFromUuid = globalThis.fromUuid;
  const previousGame = globalThis.game;
  const previousFoundry = globalThis.foundry;
  const previousUi = globalThis.ui;

  globalThis.fromUuid = runtime.fromUuid ?? (async () => ({ command: macroCommand }));
  globalThis.game = runtime.game ?? {};
  globalThis.foundry = runtime.foundry ?? {};
  globalThis.ui = runtime.ui ?? {};

  return run().finally(() => {
    globalThis.fromUuid = previousFromUuid;
    globalThis.game = previousGame;
    globalThis.foundry = previousFoundry;
    globalThis.ui = previousUi;
  });
}

test('MacroExecutor.run exposes exactly three identical payload aliases', async () => {
  const payload = { dc: 12 };
  const command = `return {
    argumentCount: arguments.length,
    aliasesAreIdentical: scope === context && context === args,
    dc: scope.dc
  };`;
  const result = await withFakeFoundry(command, () => MacroExecutor.run('Macro.x', payload));

  assert.deepEqual(result, {
    argumentCount: 3,
    aliasesAreIdentical: true,
    dc: 12,
  });
});

test('MacroExecutor.run leaves Foundry client globals available directly', async () => {
  const sentinelGame = { id: 'sentinel-game' };
  const sentinelFoundry = { id: 'sentinel-foundry' };
  const sentinelUi = { id: 'sentinel-ui' };
  const sentinelDocument = { id: 'sentinel-document' };
  const command = `return {
    game,
    foundry,
    ui,
    document: await fromUuid("Actor.sentinel")
  };`;
  const sentinelFromUuid = async (uuid) =>
    uuid === 'Macro.x' ? { command } : sentinelDocument;

  const result = await withFakeFoundry(
    command,
    () => MacroExecutor.run('Macro.x', {}),
    {
      game: sentinelGame,
      foundry: sentinelFoundry,
      ui: sentinelUi,
      fromUuid: sentinelFromUuid,
    }
  );

  assert.strictEqual(result.game, sentinelGame);
  assert.strictEqual(result.foundry, sentinelFoundry);
  assert.strictEqual(result.ui, sentinelUi);
  assert.strictEqual(result.document, sentinelDocument);
});

test('MacroExecutor.run propagates a command-thrown error unchanged', async () => {
  const macroError = new Error('macro command failed');
  const command = 'throw game.macroError;';

  await assert.rejects(
    withFakeFoundry(command, () => MacroExecutor.run('Macro.x', {}), {
      game: { macroError },
    }),
    (error) => error === macroError
  );
});
