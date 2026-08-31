/**
 * `MacroExecutor` — the direct-evaluation seam for GM-authored script macros.
 *
 * The behavioural cases pin the three payload aliases, the ambient Foundry globals and the
 * error passthrough. The last two cases pin the JUSTIFICATION for bypassing
 * `Macro#canUserExecute` (issue 1286): the executing client may now be a GM, so the reason
 * that bypass was originally documented with — "the script still runs as the current player
 * with no added server or document authority" — is false, and the source must not carry it.
 * A comment is the only carrier that reason has ever had, so a source assertion is the only
 * thing that can keep it honest; a hand-maintained justification with no guard is exactly
 * the kind of mirror that rots silently.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MacroExecutor } from '../src/utils/MacroExecutor.js';

const MACRO_EXECUTOR_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'utils', 'MacroExecutor.js'),
  'utf8'
);

/**
 * The same source with every comment removed.
 *
 * Needed because the justification below TALKS ABOUT the `type === 'script'` gate at
 * length, so a raw-text assertion that the gate is absent is satisfied by nothing and
 * defeated by the prose explaining why it is absent. The two views are kept separate rather
 * than one being derived ad hoc inside a case, so it is obvious which claim is about the
 * code and which is about the reasoning.
 */
const MACRO_EXECUTOR_CODE = MACRO_EXECUTOR_SOURCE.replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

/**
 * The same source as ONE line, with comment leaders and line breaks collapsed to single
 * spaces.
 *
 * Prose assertions read this rather than the raw text: a sentence that happens to wrap
 * across two comment lines is the same sentence, and a guard that failed when someone
 * reflowed a paragraph would be reworded away rather than satisfied.
 */
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
  // The gate the bypass is ABOUT. A macro document that refuses the current user must still
  // run, because the point of the seam is to let a player-initiated activity execute
  // GM-selected automation the player holds no document permission for. If this ever starts
  // failing, the bypass was removed rather than re-justified, and five callers with three
  // different disclosure contracts changed behaviour at once.
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

  // The three links of the chain that bounds it INSTEAD. Each is named because a
  // justification that cited only one of them would be a weaker claim than the one the
  // socket actually makes.
  for (const link of ['ADDRESSING ONLY', 'ATTESTED SENDER', 'ACTOR AUTHORIZATION']) {
    assert.ok(MACRO_EXECUTOR_PROSE.includes(link), `the justification names ${link}`);
  }

  assert.ok(
    /MACRO_SCRIPT stays UNCONSULTED, deliberately/.test(MACRO_EXECUTOR_PROSE),
    'and records that the world script permission is left unconsulted on purpose'
  );
});

test('the type === script gate is NOT centralised into this module', () => {
  // `recipes-and-steps` requires a craft-time type check at the call site, and centralising
  // it here would turn a chat-type essence property macro from a silent console.warn into a
  // per-essence-per-result error notification. Assert the absence, not just the prose.
  assert.ok(
    !/\.type\b/.test(MACRO_EXECUTOR_CODE),
    'the executable body reads no `type` property off the resolved Macro'
  );
  assert.ok(
    !/script/i.test(MACRO_EXECUTOR_CODE),
    'and names no macro type token, so there is nothing here to discriminate on'
  );
  assert.ok(
    MACRO_EXECUTOR_PROSE.includes('must not be, centralised here'),
    'and the source says why, so the next reader does not re-derive it as an optimisation'
  );
});
