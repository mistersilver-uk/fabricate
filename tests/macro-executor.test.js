/**
 * `MacroExecutor` — the direct-evaluation seam for GM-authored script macros. The behavioural cases
 * pin the three payload aliases, the ambient Foundry globals and the error passthrough (issue
 * 1286).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MacroExecutor } from '../src/utils/MacroExecutor.js';
import { defineStructureContract } from './helpers/structureContract.js';

const MACRO_EXECUTOR_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'utils', 'MacroExecutor.js'),
  'utf8'
);

/** The same source as ONE line, with comment leaders and line breaks collapsed to single spaces. */
const MACRO_EXECUTOR_PROSE = MACRO_EXECUTOR_SOURCE.replaceAll(
  /\s*(?:\*|\/\/)?\s*\n\s*(?:\*|\/\/)?\s*/g,
  ' '
);

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
  const sentinelFromUuid = async (uuid) => (uuid === 'Macro.x' ? { command } : sentinelDocument);

  const result = await withFakeFoundry(command, () => MacroExecutor.run('Macro.x', {}), {
    game: sentinelGame,
    foundry: sentinelFoundry,
    ui: sentinelUi,
    fromUuid: sentinelFromUuid,
  });

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

test('MacroExecutor.run still bypasses canUserExecute — the code is deliberately unchanged', async () => {
  // The gate the bypass is ABOUT. A macro document that refuses the current user must still run,
  // because the point of the seam is to let a player-initiated activity execute GM-selected
  // automation the player holds no document permission for.
  const macro = {
    command: 'return 42;',
    canUserExecute: () => false,
    testUserPermission: () => false,
  };
  const result = await withFakeFoundry('unused', () => MacroExecutor.run('Macro.x', {}), {
    fromUuid: async () => macro,
  });
  assert.equal(result, 42, 'the command ran without consulting the document gate');
});

// A deliberate prose pin (issue 1933 retains it): a comment is the only carrier this reasoning has,
// and the chain it names is exercised by `tests/component-complications-socket.test.js`.
test('the bypass justification records GM-side execution, not "no added authority"', () => {
  // The retired claim, which was true only while every macro ran on the acting player's
  // client. Complication macros run on an elected GM, who is OWNER of every document.
  assert.ok(
    !MACRO_EXECUTOR_PROSE.includes('no added server or document authority'),
    'the false justification is gone and must not come back'
  );
  assert.ok(
    /executing client may be a GM/i.test(MACRO_EXECUTOR_PROSE),
    'the source says out loud that the executing client may be a GM'
  );

  // The three links of the chain that bounds it INSTEAD. Each is named because a justification that
  // cited only one of them would be a weaker claim than the one the socket actually makes.
  for (const link of ['ADDRESSING ONLY', 'ATTESTED SENDER', 'ACTOR AUTHORIZATION']) {
    assert.ok(MACRO_EXECUTOR_PROSE.includes(link), `the justification names ${link}`);
  }
});

test('MacroExecutor.run consults no world script permission, deliberately', async () => {
  // MACRO_SCRIPT governs whether a USER may author script macros; the script run here is the
  // GM's, so gating on it would silently disable GM-authored automation for those players.
  const asked = [];
  const refuse = (name) => (...args) => asked.push([name, ...args]) && false;
  const user = { isGM: false, role: 1, can: refuse('can'), hasPermission: refuse('hasPermission') };
  const result = await withFakeFoundry('return 7;', () => MacroExecutor.run('Macro.x', {}), {
    game: { user, permissions: { MACRO_SCRIPT: [4] } },
  });
  assert.equal(result, 7, 'a user refused MACRO_SCRIPT still runs the GM-selected macro');
  assert.deepEqual(asked, [], 'and neither permission check was asked');
});

// `recipes-and-steps` requires a craft-time type check at the call site; centralising it here
// would turn a chat-type essence property macro from a silent console.warn into a
// per-essence-per-result error notification.
test('the type === script gate is NOT centralised into this module', async () => {
  for (const type of ['script', 'chat', undefined]) {
    const macro = { type, command: 'return scope.dc;' };
    const result = await withFakeFoundry('unused', () => MacroExecutor.run('Macro.x', { dc: 9 }), {
      fromUuid: async () => macro,
    });
    assert.equal(result, 9, `a ${type ?? 'typeless'} macro runs its command unchanged`);
  }
});

defineStructureContract(
  'the executor reads the command and never the macro type',
  'src/utils/MacroExecutor.js',
  { reads: ['macro.command'], propertyReads: [['type', []]], spellsNo: ['script', 'Script'] }
);
