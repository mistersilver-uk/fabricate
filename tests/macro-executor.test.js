import test from 'node:test';
import assert from 'node:assert/strict';

import { MacroExecutor } from '../src/utils/MacroExecutor.js';

function withFakeFoundry(macroCommand, run) {
  const previousFromUuid = globalThis.fromUuid;
  const previousGame = globalThis.game;
  const previousFoundry = globalThis.foundry;
  const previousUi = globalThis.ui;

  globalThis.fromUuid = async () => ({ command: macroCommand });
  globalThis.game = globalThis.game ?? {};
  globalThis.foundry = globalThis.foundry ?? {};
  globalThis.ui = globalThis.ui ?? {};

  return run().finally(() => {
    globalThis.fromUuid = previousFromUuid;
    globalThis.game = previousGame;
    globalThis.foundry = previousFoundry;
    globalThis.ui = previousUi;
  });
}

test('MacroExecutor.run binds args as an alias for context so Foundry-convention macros work', async () => {
  const command = 'return { dc: args?.dc ?? 99, source: typeof args };';
  const result = await withFakeFoundry(command, () =>
    MacroExecutor.run('Macro.x', { dc: 12 })
  );
  assert.deepEqual(result, { dc: 12, source: 'object' });
});

test('MacroExecutor.run still exposes context for callers using the explicit name', async () => {
  const command = 'return { dc: context?.dc ?? null };';
  const result = await withFakeFoundry(command, () =>
    MacroExecutor.run('Macro.x', { dc: 7 })
  );
  assert.deepEqual(result, { dc: 7 });
});
