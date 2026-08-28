/**
 * THE ITEM- AND ACTOR-FLAG REMAP (issue 1363, criterion 6a and 6b).
 *
 * IT IS PROVEN AT THREE LEVELS BECAUSE THE SMOKE ALONE CANNOT FAIL. A stale
 * `roles[systemId].componentId` names an id absent from the re-keyed candidate set, so tier 1
 * returns null and resolution falls through to tier 3 — the source-reference tier, which this
 * change does not touch. "Owned copies still resolve", "a craft, a salvage and a gather succeed"
 * and "every Manager browser lists the same entities" are therefore ALL TRUE with this pass never
 * written. Only an assertion on the FLAG VALUE ITSELF carries falsifiability.
 *
 * This file is level (a), the planner units, one arm per branch, and level (b), the composition
 * mutation: a source-contract assertion that `src/main.js` still calls the pass from its `ready`
 * body, which flips to FAIL when that edge is deleted.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalSignatureKey } from '../src/utils/alchemySignatureKey.js';
import {
  planItemIdentityFlagRemap,
  remapAlchemyDeadEnds,
  remapRunContainer,
  remapWorldScopeIdentityFlags,
  unambiguousComponentRemap,
} from '../src/migration/remapWorldScopeIdentityFlags.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const MAP = Object.freeze({
  'sys-a': { components: { 'old-c': 'new-c' }, tools: { 'old-t': 'new-t' } },
  'sys-b': { components: { 'shared-c': 'b-new' } },
  'sys-c': { components: { 'shared-c': 'c-new' } },
  // A DOTTED system id, which every shipped writer refuses as a flag-path segment. Its old
  // id is deliberately its own, so it cannot perturb the legacy-scalar tie-break below.
  'sys.dotted': { components: { 'dotted-c': 'dotted-new' } },
});

/** A document whose `getFlag(scope, key)` walks a DOTTED key exactly as Foundry's does. */
function makeDocument(flags) {
  return {
    flags,
    getFlag(scope, key) {
      let node = flags?.[scope];
      for (const segment of String(key).split('.')) {
        if (node === null || typeof node !== 'object') return undefined;
        node = node[segment];
      }
      return node;
    },
  };
}

/** The two read depths the production edge supplies. */
function readFlag(document, key, fallback = null, options = {}) {
  const value = options.bare
    ? document?.getFlag?.('fabricate', key)
    : document?.getFlag?.('fabricate', `fabricate.${key}`);
  return value ?? fallback;
}

// ---------------------------------------------------------------------------
// (a) planner units, one per branch
// ---------------------------------------------------------------------------

test('the role componentId leaf is remapped, per system', () => {
  const item = makeDocument({
    fabricate: { fabricate: { roles: { 'sys-a': { componentId: 'old-c' } } } },
  });
  const { writes } = planItemIdentityFlagRemap(item, MAP, new Map(), readFlag);
  assert.deepEqual(writes, [{ flagKey: 'roles.sys-a.componentId', value: 'new-c' }]);
});

test('the role toolId leaf is remapped from the TOOLS leg, not the components leg', () => {
  const item = makeDocument({
    fabricate: { fabricate: { roles: { 'sys-a': { toolId: 'old-t', componentId: 'untouched' } } } },
  });
  const { writes } = planItemIdentityFlagRemap(item, MAP, new Map(), readFlag);
  assert.deepEqual(writes, [{ flagKey: 'roles.sys-a.toolId', value: 'new-t' }]);
});

test('a role leaf for a system with no map, or an id the map does not name, is left alone', () => {
  const item = makeDocument({
    fabricate: {
      fabricate: {
        roles: { 'sys-z': { componentId: 'old-c' }, 'sys-a': { componentId: 'other' } },
      },
    },
  });
  assert.deepEqual(planItemIdentityFlagRemap(item, MAP, new Map(), readFlag).writes, []);
});

test('an UNSAFE (dotted) systemId is SKIPPED and counted, never written', () => {
  const item = makeDocument({
    fabricate: { fabricate: { roles: { 'sys.dotted': { componentId: 'dotted-c' } } } },
  });
  const planned = planItemIdentityFlagRemap(item, MAP, new Map(), readFlag);
  assert.deepEqual(planned.writes, [], 'a dotted segment would MIS-NEST the flag one level deeper');
  assert.deepEqual(planned.unsafeSystemIds, ['sys.dotted']);
});

test('the legacy flat scalar is remapped ONLY when the corpus agrees, and is otherwise UNTOUCHED', () => {
  const unambiguous = unambiguousComponentRemap(MAP);
  assert.equal(unambiguous.get('old-c'), 'new-c', 'named by exactly one system');
  assert.equal(
    unambiguous.has('shared-c'),
    false,
    'named by two systems that DISAGREE about the image, so there is no general tie-break'
  );

  const decidable = makeDocument({ fabricate: { fabricate: { componentId: 'old-c' } } });
  assert.deepEqual(planItemIdentityFlagRemap(decidable, MAP, unambiguous, readFlag).writes, [
    { flagKey: 'componentId', value: 'new-c' },
  ]);

  const ambiguous = makeDocument({ fabricate: { fabricate: { componentId: 'shared-c' } } });
  assert.deepEqual(
    planItemIdentityFlagRemap(ambiguous, MAP, unambiguous, readFlag).writes,
    [],
    'leaving it is behaviour-PRESERVING: a stale scalar makes tiers 1-2 miss and resolution ' +
      'falls through to the unchanged source-reference tier'
  );
});

test("several systems that AGREE on the image are decidable, which is the rule's second half", () => {
  const agreeing = unambiguousComponentRemap({
    'sys-a': { components: { 'old-c': 'new-c' } },
    'sys-b': { components: { 'old-c': 'new-c' } },
  });
  assert.equal(agreeing.get('old-c'), 'new-c');
});

test('each run container is remapped at its OWN depth, scoped by the run own craftingSystemId', () => {
  const container = () => ({
    active: {
      'run-1': {
        id: 'run-1',
        craftingSystemId: 'sys-a',
        componentId: 'old-c',
        steps: [
          {
            requirements: [{ componentId: 'old-c', quantity: 2 }],
            usedTools: [{ toolId: 'old-t' }],
            toolIds: ['old-t'],
          },
        ],
      },
      'run-2': { id: 'run-2', craftingSystemId: 'sys-z', componentId: 'old-c' },
    },
    history: [{ id: 'run-0', craftingSystemId: 'sys-a', componentId: 'old-c' }],
  });
  const value = container();
  assert.equal(remapRunContainer(value, MAP), true);
  assert.equal(value.active['run-1'].componentId, 'new-c');
  assert.equal(value.active['run-1'].steps[0].requirements[0].componentId, 'new-c');
  assert.equal(value.active['run-1'].steps[0].usedTools[0].toolId, 'new-t');
  assert.deepEqual(value.active['run-1'].steps[0].toolIds, ['new-t']);
  assert.equal(value.history[0].componentId, 'new-c');
  assert.equal(
    value.active['run-2'].componentId,
    'old-c',
    'a run in a system with no map is untouched: the same old id in two systems can name two different components'
  );
  assert.equal(remapRunContainer({ active: {} }, MAP), false, 'nothing to do reports no change');
});

test('all THREE run containers are visited, and the gathering one at its SINGLE-scope depth', async () => {
  const written = [];
  const actor = makeDocument({
    fabricate: {
      // DOUBLY nested: written through `setFabricateFlag`.
      fabricate: {
        craftingRuns: { active: { r1: { craftingSystemId: 'sys-a', componentId: 'old-c' } } },
        salvageRuns: { active: { r2: { craftingSystemId: 'sys-a', componentId: 'old-c' } } },
      },
      // SINGLE scope: written with a bare `setFlag`. A pass that assumes one depth silently
      // misses the other.
      gatheringRuns: { active: { r3: { craftingSystemId: 'sys-a', componentId: 'old-c' } } },
    },
  });
  actor.items = [];
  const summary = await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: MAP,
    readFlag,
    writeFabricateFlag: async (document, key, value) => written.push(['nested', key, value]),
    writeBareFlag: async (document, key, value) => written.push(['bare', key, value]),
  });
  assert.equal(summary.remappedRunContainers, 3, 'all three, at their two depths');
  assert.deepEqual(
    written.map(([depth, key]) => `${depth}:${key}`),
    ['nested:craftingRuns', 'nested:salvageRuns', 'bare:gatheringRuns']
  );
});

test('alchemy dead-end signature keys are PARSED, remapped, RE-SORTED and re-joined', () => {
  // The re-key changes the LEXICAL ORDER of the ids, which is what makes textual substitution
  // produce a key the reader can never match again.
  const map = { 'sys-a': { components: { zeta: 'alpha' } } };
  const original = canonicalSignatureKey({ mid: 1, zeta: 2 });
  assert.equal(original, 'mid:1|zeta:2', 'the premise: `zeta` sorts LAST before the re-key');
  const { value, changed } = remapAlchemyDeadEnds({ 'sys-a': [original] }, map);
  assert.equal(changed, true);
  assert.equal(
    value['sys-a'][0],
    canonicalSignatureKey({ alpha: 2, mid: 1 }),
    'and `alpha` sorts FIRST after it, so the key must be REBUILT rather than substituted'
  );
  assert.equal(value['sys-a'][0], 'alpha:2|mid:1');
  assert.notEqual(value['sys-a'][0], original.replace('zeta', 'alpha'));
});

test('the alchemyDeadEnds COMPOSITION edge is wired, not just the pure helper', async () => {
  // MUTATE THE COMPOSITION, NOT ONLY THE PURE HELPER. `const deadEnds = null;` at the call site
  // survives every assertion about `remapAlchemyDeadEnds` itself — and `#### D8` records that
  // revision 3 missed this site ENTIRELY, so the call site is exactly the half that has been
  // wrong before. The run containers already get this treatment; dead ends did not.
  const map = { 'sys-a': { components: { zeta: 'alpha' } } };
  const original = canonicalSignatureKey({ mid: 1, zeta: 2 });
  const written = [];
  const actor = makeDocument({
    fabricate: { fabricate: { alchemyDeadEnds: { 'sys-a': [original] } } },
  });
  actor.items = [];

  const summary = await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: map,
    readFlag,
    writeFabricateFlag: async (document, key, value) => written.push([key, value]),
    writeBareFlag: async () => {},
  });

  assert.equal(summary.remappedAlchemyDeadEnds, 1, 'the pass must REPORT what it remapped');
  assert.deepEqual(
    written,
    [['alchemyDeadEnds', { 'sys-a': ['alpha:2|mid:1'] }]],
    'and must WRITE the rebuilt key back at the doubly-nested depth'
  );
});

test('a dead-end key naming nothing re-keyed writes NOTHING at the composition edge', async () => {
  const written = [];
  const actor = makeDocument({
    fabricate: {
      fabricate: { alchemyDeadEnds: { 'sys-a': [canonicalSignatureKey({ other: 1 })] } },
    },
  });
  actor.items = [];
  const summary = await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: MAP,
    readFlag,
    writeFabricateFlag: async (document, key, value) => written.push([key, value]),
    writeBareFlag: async () => {},
  });
  assert.equal(summary.remappedAlchemyDeadEnds, 0);
  assert.deepEqual(written, [], 'an unchanged flag is never rewritten');
});

test('a dead-end key naming nothing re-keyed is left exactly as it was', () => {
  const key = canonicalSignatureKey({ other: 1 });
  const { value, changed } = remapAlchemyDeadEnds({ 'sys-a': [key] }, MAP);
  assert.equal(changed, false);
  assert.equal(value['sys-a'][0], key);
});

test('the alchemyDeadEnds systemId is a VALUE-side key, so the dotted guard does not apply to it', () => {
  const map = { 'sys.dotted': { components: { 'old-c': 'dotted-new' } } };
  const key = canonicalSignatureKey({ 'old-c': 1 });
  const { value, changed } = remapAlchemyDeadEnds({ 'sys.dotted': [key] }, map);
  assert.equal(changed, true, 'a dotted systemId is a legitimate object key here');
  assert.equal(value['sys.dotted'][0], 'dotted-new:1');
});

test('learnedRecipes is EXCLUDED, because recipe ids are never re-keyed', async () => {
  const written = [];
  const actor = makeDocument({
    fabricate: { fabricate: { learnedRecipes: { 'old-c': true } } },
  });
  actor.items = [];
  await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: MAP,
    readFlag,
    writeFabricateFlag: async (document, key, value) => written.push([key, value]),
    writeBareFlag: async () => {},
  });
  assert.deepEqual(written, []);
});

test('a refused write is counted as a LOCKED skip and never aborts the pass', async () => {
  const actor = {
    items: [
      makeDocument({ fabricate: { fabricate: { roles: { 'sys-a': { componentId: 'old-c' } } } } }),
    ],
  };
  const summary = await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: MAP,
    readFlag,
    writeFabricateFlag: async () => {
      throw new Error('locked pack');
    },
    writeBareFlag: async () => {},
  });
  assert.equal(summary.lockedSkips, 1);
  assert.equal(summary.remappedItems, 0);
});

test('a malformed item is counted and skipped rather than aborting the pass', async () => {
  const actor = {
    items: [
      {
        getFlag() {
          throw new Error('broken document');
        },
      },
      makeDocument({ fabricate: { fabricate: { roles: { 'sys-a': { componentId: 'old-c' } } } } }),
    ],
  };
  const written = [];
  const summary = await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: MAP,
    readFlag,
    writeFabricateFlag: async (document, key, value) => written.push([key, value]),
    writeBareFlag: async () => {},
  });
  assert.equal(summary.skippedErrors, 1);
  assert.deepEqual(written, [['roles.sys-a.componentId', 'new-c']]);
});

test('the unsafe-systemId skips reach the SUMMARY, so the GM notice can name them', async () => {
  const actor = {
    items: [
      makeDocument({
        fabricate: { fabricate: { roles: { 'sys.dotted': { componentId: 'dotted-c' } } } },
      }),
    ],
  };
  const summary = await remapWorldScopeIdentityFlags({
    actors: [actor],
    rekeyMap: MAP,
    readFlag,
    writeFabricateFlag: async () => {},
    writeBareFlag: async () => {},
  });
  assert.deepEqual(summary.unsafeSystemIdSkips, ['sys.dotted']);
});

// ---------------------------------------------------------------------------
// (b) the COMPOSITION mutation
// ---------------------------------------------------------------------------

test('src/main.js calls the remap from its ready body, AFTER the owned-item restamp', () => {
  // DELETING THE `ready`-BODY CALL SITE MUST FLIP THIS TO FAIL. A planner that is perfect and
  // never invoked is indistinguishable, from every runtime observation, from one that is absent:
  // resolution falls through to the untouched source-reference tier either way.
  const source = readFileSync(resolve(HERE, '..', 'src', 'main.js'), 'utf8');
  const restampIndex = source.indexOf('await runOwnedItemComponentIdentityRestamp();');
  const remapIndex = source.indexOf('await runWorldScopeIdentityFlagRemap();');
  assert.ok(restampIndex > 0, 'the premise: the shipped owned-item restamp edge is still there');
  assert.ok(remapIndex > 0, 'the ready body must CALL the world-scope identity flag remap');
  assert.ok(
    remapIndex > restampIndex,
    'it runs after the restamp, which never reaches this population because its planner returns ' +
      'early for any item already carrying a durable identity flag'
  );
  assert.match(
    source,
    /async function runWorldScopeIdentityFlagRemap\(\)/,
    'and the pass is defined, not merely called'
  );
});

test('the clear and the version advance are BOTH inside the same gate', () => {
  // Whenever the clear is withheld the pass must ALSO withhold its own Number-version advance.
  // The shipped one-shot precedent writes its version UNCONDITIONALLY at the end, so a pass that
  // copied it would short-circuit on every later boot and NEVER clear — orphaning the map.
  const source = readFileSync(resolve(HERE, '..', 'src', 'main.js'), 'utf8');
  const body = source.slice(
    source.indexOf('async function runWorldScopeIdentityFlagRemap()'),
    source.indexOf('Run the env-node-driven marker image sync')
  );
  const gateIndex = body.indexOf('if (!mayClearWorldScopeRekeyMap(');
  const clearIndex = body.indexOf('SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, {}');
  const versionIndex = body.indexOf('SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION,\n');
  assert.ok(gateIndex > 0, 'the clear is gated on the producing migration having COMPLETED');
  assert.ok(clearIndex > gateIndex, 'the clear sits AFTER the early return');
  assert.ok(versionIndex > gateIndex, 'and so does the version advance');
  assert.match(
    body.slice(gateIndex, clearIndex),
    /return;/,
    'the gate returns rather than branching'
  );
});
