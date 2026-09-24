/**
 * THE ONE-SHOT VERSION ADVANCES THAT CONSUME A MIGRATION'S OUTPUT (issue 1363), driven through the
 * real module entry: the stamps and the `1.30.0` remap are its exports, and the `1.34.0` essence
 * remap is reachable only through the `ready` startup sequence.
 */

import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';

import { Fabricate } from '../src/bootstrap/Fabricate.js';
import { installIdentityRepairs } from '../src/bootstrap/migrations.js';
import {
  COMPONENT_FLAG_STAMP_TARGET,
  SETTING_KEYS,
  TOOL_FLAG_STAMP_TARGET,
  WORLD_ESSENCE_MERGE_FLAG_TARGET,
  WORLD_SCOPE_IDENTITY_FLAG_TARGET,
} from '../src/config/settings.js';
import {
  mayClearWorldEssenceMergeMap,
  mayClearWorldScopeRekeyMap,
  remapCompletedCleanly,
  WORLD_ESSENCE_MERGE_RETIRED_LEG,
  WORLD_ESSENCE_MERGE_SYSTEMS_LEG,
} from '../src/systems/remapWorldScopeIdentityFlags.js';
import { ASSISTANT_GM, asLabUser } from './helpers/bootContractProbes.js';
import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';
import { ACTIVE_GM, brokenActor, PLAYER } from './helpers/migrationPassDriver.js';

const LAB_BOOT = { timeout: 300000 };
const write = (key, value) => globalThis.game.settings.set('fabricate', key, value);
const read = (key) => globalThis.game.settings.get('fabricate', key);

/** Replace what the remap passes walk, keeping the lab collection's other members; `walked` counts. */
function walkOnly(actors) {
  const game = globalThis.game;
  const original = game.actors;
  const walked = { count: 0 };
  game.actors = Object.assign(Object.create(original), {
    *[Symbol.iterator]() {
      walked.count += 1;
      yield* actors;
    },
  });
  return { walked, restore: () => (game.actors = original) };
}

/** Run `work` with `console.warn` recorded rather than printed. */
async function recordingWarnings(work) {
  const { warn } = console;
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
  try {
    await work();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

test('the two stamp targets are BUMPED, which is what makes the repair happen at all', () => {
  assert.equal(COMPONENT_FLAG_STAMP_TARGET, 2);
  assert.equal(TOOL_FLAG_STAMP_TARGET, 2);
  assert.equal(WORLD_SCOPE_IDENTITY_FLAG_TARGET, 1);
});

test('the clear gates are semver compares, never lexicographic', () => {
  assert.equal(mayClearWorldScopeRekeyMap('1.29.0'), false);
  assert.equal(mayClearWorldScopeRekeyMap('1.4.0'), false, 'and never a lexicographic compare');
  assert.equal(mayClearWorldScopeRekeyMap('1.30.0'), true);
  assert.equal(WORLD_ESSENCE_MERGE_FLAG_TARGET, 1);
  assert.equal(mayClearWorldEssenceMergeMap('1.33.0'), false);
  assert.equal(mayClearWorldEssenceMergeMap('1.4.0'), false, "1.4.0's population tears most");
  assert.equal(mayClearWorldEssenceMergeMap('1.34.0'), true);
  assert.equal(mayClearWorldEssenceMergeMap('1.35.0'), true);
  assert.equal(mayClearWorldEssenceMergeMap(undefined), false, 'an unstamped world has not run it');
});

test('a PARTIAL remap is the only summary that withholds', () => {
  assert.equal(remapCompletedCleanly({ skippedErrors: 0 }), true);
  assert.equal(remapCompletedCleanly({ skippedErrors: 1 }), false);
  assert.equal(remapCompletedCleanly({ skippedErrors: 3, lockedSkips: 0 }), false);
  // A LOCKED skip is a standing condition a re-run cannot improve, so it must NOT withhold.
  assert.equal(remapCompletedCleanly({ skippedErrors: 0, lockedSkips: 9 }), true);
  assert.equal(remapCompletedCleanly(null), true, 'a pass that did not run withholds nothing');
  assert.equal(remapCompletedCleanly(undefined), true);
});

test('the two one-shots keep separate settings', () => {
  assert.notEqual(
    SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION,
    SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION
  );
  assert.notEqual(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP, SETTING_KEYS.WORLD_SCOPE_REKEY_MAP);
});

test(
  'each 1.30.0 consumer does its work but withholds its advance until 1.30.0 completed',
  LAB_BOOT,
  async () => {
    await withFabricateLifecycleReplay(async ({ loadModule }) => {
      const main = await loadModule('/src/main.js');
      const worked = [];
      for (const method of ['autoStampComponentSources', 'autoStampToolSources']) {
        main.default.craftingSystemManager[method] = async () => worked.push(method);
      }
      const passes = [
        ['runComponentFlagAutoStamp', 'COMPONENT_FLAG_STAMP_VERSION', COMPONENT_FLAG_STAMP_TARGET],
        ['runToolFlagAutoStamp', 'TOOL_FLAG_STAMP_VERSION', TOOL_FLAG_STAMP_TARGET],
        [
          'runWorldScopeIdentityFlagRemap',
          'WORLD_SCOPE_IDENTITY_FLAG_VERSION',
          WORLD_SCOPE_IDENTITY_FLAG_TARGET,
        ],
      ];
      // One predicate for all three: `1.4.0` is the value a bare string `>=` would admit.
      for (const migrationVersion of ['1.4.0', '1.29.0', '1.30.0']) {
        await write(SETTING_KEYS.MIGRATION_VERSION, migrationVersion);
        await write(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, {});
        for (const [pass, versionKey, target] of passes) {
          await write(SETTING_KEYS[versionKey], 0);
          worked.length = 0;
          await recordingWarnings(() => main[pass]());
          const advanced = migrationVersion === '1.30.0';
          assert.equal(
            read(SETTING_KEYS[versionKey]),
            advanced ? target : 0,
            `${pass} @ ${migrationVersion}`
          );
          if (pass !== 'runWorldScopeIdentityFlagRemap') {
            assert.equal(worked.length, 1, `${pass} still does its work first, withheld or not`);
          }
        }
      }
    });
  }
);

test(
  'the 1.30.0 remap advances an empty map, withholds a partial one, and gates on the active GM',
  LAB_BOOT,
  async () => {
    await withFabricateLifecycleReplay(async ({ loadModule }) => {
      const { runWorldScopeIdentityFlagRemap } = await loadModule('/src/main.js');
      const player = globalThis.game.users.get('user-lab-player');
      // Factories: the lab keeps the object a caller writes, so a shared literal would compare a
      // map an in-place edit had changed against itself.
      const pending = () => ({ 'sys-a': { components: { old: 'new' } } });
      const essencePending = () => ({
        [WORLD_ESSENCE_MERGE_SYSTEMS_LEG]: { 'sys-a': { essences: { loser: 'survivor' } } },
      });
      const arrange = async (rekeyMap) => {
        await write(SETTING_KEYS.MIGRATION_VERSION, '1.30.0');
        await write(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION, 0);
        await write(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, rekeyMap);
        await write(SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION, 0);
        await write(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP, essencePending());
      };

      // Nothing to re-key: no walk, and the advance still lands so the pass stops re-checking.
      await arrange({});
      const idle = walkOnly([brokenActor()]);
      await runWorldScopeIdentityFlagRemap();
      idle.restore();
      assert.equal(idle.walked.count, 0, 'an empty map remaps nothing');
      assert.equal(read(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION), 1);

      // A partial pass keeps its decision record and its version.
      await arrange(pending());
      const partial = walkOnly([brokenActor()]);
      const warnings = await recordingWarnings(() => runWorldScopeIdentityFlagRemap());
      partial.restore();
      assert.equal(partial.walked.count, 1, 'the pending map is walked');
      assert.deepEqual(read(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP), pending(), 'the map is retained');
      assert.equal(read(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION), 0, 'and the version too');
      assert.ok(warnings.some((line) => line.includes('RETAINED: 1 document(s)')));

      // The boot pass carries its own single-writer gate.
      for (const user of [ASSISTANT_GM, player]) {
        await arrange({});
        await asLabUser(user, () => runWorldScopeIdentityFlagRemap());
        assert.equal(read(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION), 0, `${user.id} refused`);
      }
      await runWorldScopeIdentityFlagRemap();
      assert.equal(
        read(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION),
        1,
        'the active GM admitted'
      );
      assert.deepEqual(
        [
          read(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP),
          read(SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION),
        ],
        [essencePending(), 0],
        'the 1.30.0 advance never touches the 1.34.0 decision record or its version'
      );
    });
  }
);

test('the 1.34.0 essence one-shot, through the ready sequence', LAB_BOOT, async () => {
  await withFabricateLifecycleReplay(async ({ ready, loadModule }) => {
    const { default: facade } = await loadModule('/src/main.js');
    // The migration pass would advance `migrationVersion` before the one-shot reads it.
    facade._runMigrations = async () => {};
    const player = globalThis.game.users.get('user-lab-player');
    const retired = () => ({ loser: { name: 'Loser' } });
    const pending = () => ({
      [WORLD_ESSENCE_MERGE_SYSTEMS_LEG]: { 'sys-a': { essences: { loser: 'survivor' } } },
      [WORLD_ESSENCE_MERGE_RETIRED_LEG]: retired(),
    });
    const boot = async ({
      migrationVersion = '1.34.0',
      mergeMap = pending(),
      user,
      actors,
    } = {}) => {
      await write(SETTING_KEYS.MIGRATION_VERSION, migrationVersion);
      await write(SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION, 0);
      await write(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP, mergeMap);
      // The 1.30.0 one-shot is spent, and its map is still pending: the essence pass must not care.
      await write(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION, WORLD_SCOPE_IDENTITY_FLAG_TARGET);
      await write(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, { 'sys-a': { components: { a: 'b' } } });
      const walk = actors ? walkOnly(actors) : null;
      const warnings = await recordingWarnings(() => (user ? asLabUser(user, ready) : ready()));
      walk?.restore();
      return {
        warnings,
        mergeMap: read(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP),
        version: read(SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION),
      };
    };

    for (const migrationVersion of ['1.33.0', '1.4.0']) {
      const torn = await boot({ migrationVersion });
      assert.deepEqual(torn.mergeMap, pending(), `a torn ${migrationVersion} retains the map`);
      assert.equal(torn.version, 0, 'and withholds the advance');
      assert.ok(torn.warnings.some((line) => line.includes('1.34.0 migration has not completed')));
    }

    const partial = await boot({ actors: [brokenActor()] });
    assert.deepEqual(partial.mergeMap, pending(), 'a partial remap retains the map');
    assert.equal(partial.version, 0);

    const cleared = await boot();
    assert.deepEqual(
      cleared.mergeMap[WORLD_ESSENCE_MERGE_SYSTEMS_LEG],
      {},
      'the transient leg empties'
    );
    assert.deepEqual(
      cleared.mergeMap[WORLD_ESSENCE_MERGE_RETIRED_LEG],
      retired(),
      'the tombstone stays'
    );
    assert.equal(cleared.version, WORLD_ESSENCE_MERGE_FLAG_TARGET);
    assert.deepEqual(
      read(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP),
      { 'sys-a': { components: { a: 'b' } } },
      'the essence one-shot never touches the 1.30.0 decision record'
    );

    const empty = await boot({ mergeMap: {} });
    assert.equal(empty.version, WORLD_ESSENCE_MERGE_FLAG_TARGET, 'nothing to remap still advances');

    for (const user of [ASSISTANT_GM, player]) {
      const refused = await boot({ user });
      assert.deepEqual(refused.mergeMap, pending(), `${user.id} leaves the map alone`);
      assert.equal(refused.version, 0);
    }
  });
});

describe('the public recovery actions run on the active GM alone', () => {
  const ACTIONS = [
    ['remapWorldScopeIdentityFlags', 'applyWorldScopeIdentityFlagRemap', 'WORLD_SCOPE_REKEY_MAP'],
    [
      'remapWorldEssenceIdentityFlags',
      'applyWorldEssenceMergeFlagRemap',
      'WORLD_ESSENCE_MERGE_MAP',
    ],
  ];
  const PENDING = {
    WORLD_SCOPE_REKEY_MAP: { 'sys-a': { components: { a: 'b' } } },
    WORLD_ESSENCE_MERGE_MAP: { systems: { 'sys-a': { essences: { a: 'b' } } } },
  };

  function arrange(user, mapKey, map) {
    const repairs = [];
    installIdentityRepairs({
      applyWorldScopeIdentityFlagRemap: (value) => repairs.push(['scope', value]) && 'repaired',
      applyWorldEssenceMergeFlagRemap: (value) => repairs.push(['essence', value]) && 'repaired',
    });
    const values = new Map([[SETTING_KEYS[mapKey], map]]);
    globalThis.game = {
      user,
      users: { activeGM: ACTIVE_GM },
      settings: { get: (_, key) => values.get(key) },
    };
    return repairs;
  }

  for (const [method, , mapKey] of ACTIONS) {
    it(`${method} refuses an assistant GM and a player, and SAYS SO`, async () => {
      for (const user of [{ ...ASSISTANT_GM }, PLAYER]) {
        const repairs = arrange(user, mapKey, PENDING[mapKey]);
        const warnings = await recordingWarnings(async () => {
          assert.equal(await new Fabricate()[method](), null);
        });
        assert.deepEqual(repairs, [], 'a refused call does no work');
        assert.ok(
          warnings.some((line) => line.includes('ACTIVE GM alone')),
          'never silently'
        );
      }
    });

    it(`${method} repairs a PENDING map on the active GM and is inert on a cleared one`, async () => {
      const repairs = arrange(ACTIVE_GM, mapKey, PENDING[mapKey]);
      assert.equal(await new Fabricate()[method](), 'repaired');
      assert.deepEqual(
        repairs.map(([, value]) => value),
        [PENDING[mapKey]]
      );
      const idle = arrange(ACTIVE_GM, mapKey, {});
      assert.equal(await new Fabricate()[method](), null, 'a consumed map has nothing to recover');
      assert.deepEqual(idle, []);
    });
  }
});
