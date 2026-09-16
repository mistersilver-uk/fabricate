/**
 * THE WORLD-SCOPE IDENTITY SMOKE PLAN (issue 1363, acceptance criterion 6c).
 *
 * Nothing inside `scripts/foundry-test-run.mjs` can be executed by a unit test — it exports
 * nothing and runs `main()` on import — so the SEED PLAN and the EXPECTATIONS live in a pure
 * module and are asserted here without booting Chromium. What stays in the harness is the
 * Foundry edge alone.
 *
 * This file also PINS the two mirrors the plan carries, because `scripts/**` must not import
 * from `src/**`: the canonical alchemy signature key, and the fact that the plan drives the same
 * remap the production `ready` pass drives.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalKey,
  planWorldScopeIdentitySmoke,
  seededFlagPaths,
} from '../scripts/lib/worldScopeIdentitySmoke.js';
import { remapWorldScopeIdentityFlags } from '../src/migration/remapWorldScopeIdentityFlags.js';
import { canonicalSignatureKey } from '../src/utils/alchemySignatureKey.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const IDS = Object.freeze({
  systemId: 'smoke-system',
  oldComponentId: 'zzz-old-component',
  newComponentId: 'aaa-new-component',
  oldToolId: 'old-tool',
  newToolId: 'new-tool',
});

test('the canonical alchemy key mirror agrees with the shipped helper', () => {
  // `scripts/**` cannot import `src/**`, so the key builder is spelled twice. A guarded mirror,
  // not a hand-maintained one: this pin is what makes the second spelling safe.
  for (const multiset of [
    { b: 1, a: 2 },
    { [IDS.oldComponentId]: 2, 'zz-other': 1 },
    { [IDS.newComponentId]: 2, 'zz-other': 1 },
    {},
  ]) {
    assert.equal(canonicalKey(multiset), canonicalSignatureKey(multiset));
  }
});

test('the plan REFUSES a fixture that could pass with the repair never written', () => {
  // A map whose image equals its keys proves nothing, and the migration itself refuses one.
  assert.throws(() => planWorldScopeIdentitySmoke({ ...IDS, newComponentId: IDS.oldComponentId }));
  assert.throws(() => planWorldScopeIdentitySmoke({ ...IDS, newToolId: IDS.oldToolId }));
  for (const key of ['systemId', 'oldComponentId', 'newComponentId', 'oldToolId', 'newToolId']) {
    assert.throws(() => planWorldScopeIdentitySmoke({ ...IDS, [key]: '' }), new RegExp(key));
  }
});

test('the re-key CHANGES the lexical order, so a textual substitution cannot pass', () => {
  const plan = planWorldScopeIdentitySmoke(IDS);
  const before = plan.alchemyDeadEnds.value[IDS.systemId][0];
  const after = plan.expectations.alchemyDeadEndKey;
  assert.match(before, /^zz-other:1\|zzz-old-component:2$/, 'the old id sorts LAST');
  assert.match(after, /^aaa-new-component:2\|zz-other:1$/, 'and the new id sorts FIRST');
  assert.notEqual(
    after,
    before.replace(IDS.oldComponentId, IDS.newComponentId),
    'so a substituted key is NOT the key the reader will look for'
  );
});

test('the plan covers every site `#### D8` enumerates, at both flag depths', () => {
  const plan = planWorldScopeIdentitySmoke(IDS);
  assert.deepEqual(
    seededFlagPaths(plan),
    [
      { key: `roles.${IDS.systemId}.componentId`, bare: false },
      { key: `roles.${IDS.systemId}.toolId`, bare: false },
      { key: 'componentId', bare: false },
      { key: 'craftingRuns', bare: false },
      { key: 'salvageRuns', bare: false },
      { key: 'gatheringRuns', bare: true },
      { key: 'alchemyDeadEnds', bare: false },
    ],
    'and `gatheringRuns` is the ONE at the SINGLE-scope depth'
  );
});

test('the REAL remap turns the seeded plan into exactly the expected values', async () => {
  // The plan is only worth shipping if the production pass actually satisfies it. This drives
  // the real `remapWorldScopeIdentityFlags` over the plan's own seed, so a plan that expected
  // something the pass does not do fails HERE rather than in a container.
  const plan = planWorldScopeIdentitySmoke(IDS);
  const stored = {
    fabricate: {
      fabricate: {
        // SEEDED FROM THE PLAN, never from the ids directly: the plan is the artifact the
        // harness writes, so a seed transcribed independently drifts from it silently and the
        // drift then surfaces only in a container.
        roles: {
          [IDS.systemId]: { componentId: plan.componentFlag.value, toolId: plan.toolFlag.value },
        },
        componentId: plan.legacyScalar.value,
        craftingRuns: plan.craftingRuns.value,
        salvageRuns: plan.salvageRuns.value,
        alchemyDeadEnds: plan.alchemyDeadEnds.value,
      },
      gatheringRuns: plan.gatheringRuns.value,
    },
  };
  const read = (key, bare) => {
    let node = bare ? stored.fabricate : stored.fabricate.fabricate;
    for (const segment of key.split('.')) {
      if (node === null || typeof node !== 'object') return undefined;
      node = node[segment];
    }
    return node;
  };
  const write = (key, value, bare) => {
    const segments = key.split('.');
    const leaf = segments.pop();
    let node = bare ? stored.fabricate : stored.fabricate.fabricate;
    for (const segment of segments) {
      node[segment] ??= {};
      node = node[segment];
    }
    node[leaf] = value;
  };
  const item = { id: 'owned', getFlag: () => undefined };
  const actor = { id: 'hero', items: [item] };

  await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: plan.rekeyMap,
    readFlag: (document, key, fallback = null, options = {}) =>
      read(key, options.bare === true) ?? fallback,
    writeFabricateFlag: async (document, key, value) => write(key, value, false),
    writeBareFlag: async (document, key, value) => write(key, value, true),
  });

  const { expectations } = plan;
  assert.equal(read(plan.componentFlag.key, false), expectations.componentFlag);
  assert.equal(read(plan.toolFlag.key, false), expectations.toolFlag);
  assert.equal(read('componentId', false), expectations.legacyScalar);
  const crafting = read('craftingRuns', false).active[expectations.runIds.craftingRunId];
  assert.equal(crafting.steps[0].requirements[0].componentId, expectations.craftingRunComponentId);
  assert.deepEqual(crafting.steps[0].toolIds, [expectations.craftingRunToolId]);
  assert.equal(
    read('salvageRuns', false).active[expectations.runIds.salvageRunId].componentId,
    expectations.salvageRunComponentId
  );
  assert.deepEqual(read('gatheringRuns', true).active[expectations.runIds.gatheringRunId].toolIds, [
    expectations.gatheringRunToolId,
  ]);
  assert.deepEqual(read('alchemyDeadEnds', false)[IDS.systemId], [expectations.alchemyDeadEndKey]);
});

test('the harness wires the section, and asserts the FLAG VALUE rather than a resolution outcome', () => {
  // A source contract, because the harness cannot be imported. Deleting the section, or
  // softening it to a resolution assertion, must flip this to FAIL — a resolution assertion is
  // TRUE with the repair never written, which is the whole reason criterion 6 exists.
  const harness = readFileSync(resolve(HERE, '..', 'scripts', 'foundry-test-run.mjs'), 'utf8');
  assert.match(harness, /planWorldScopeIdentitySmoke/, 'the harness drives the shared plan');
  assert.match(
    harness,
    /step: 'world-scope-identity-remap'/,
    'and records it on the step ledger, so a failure is visible in summary.json'
  );
  assert.match(
    harness,
    /remapWorldScopeIdentityFlags\(\)/,
    'it invokes the REAL repair through the GM recovery entry point'
  );
  // Every flag the plan seeds must be READ BACK and CHECKED. A section that seeded them and
  // asserted a resolution outcome instead would be green with the repair never written, which
  // is the entire reason acceptance criterion 6 exists. Plain substring checks, because the
  // labels contain regex metacharacters and an escaping slip would silently weaken the guard.
  for (const label of [
    "check('roles.componentId'",
    "check('roles.toolId'",
    "check('legacy componentId scalar'",
    "check('craftingRuns requirement componentId'",
    "check('craftingRuns step toolIds'",
    "check('salvageRuns componentId'",
    "check('gatheringRuns toolIds (single-scope depth)'",
    "check('alchemyDeadEnds'",
  ]) {
    assert.ok(harness.includes(label), `the section must assert ${label}`);
  }
  assert.ok(
    harness.includes('expected.componentFlag'),
    'and it compares against the PLAN, so the expectation and the seed cannot drift'
  );
});
