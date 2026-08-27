/**
 * `awardComponents`' behaviour — the Component Award the companion contract publishes
 * (issue 1301).
 *
 * The member PLACES components on a player's sheet, which makes three claims worth a suite of
 * their own, each a VALUE that a shape pin cannot see:
 *
 *   1. **A write is judged by its own return.** Foundry document writes fail silently far more
 *      often than they reject: `createEmbeddedDocuments` resolves `[]` when a `_preCreate` hook
 *      refuses, and `Document#update` resolves `undefined` when the diff is empty — which is
 *      what a GM-authored stack-quantity path that is not in the item's data model produces.
 *      Every cell marked *(D0)* drives a RESOLVED-null or RESOLVED-undefined write, not a
 *      rejection, because a stub that models Foundry naively passes without them.
 *   2. **Partial success is expressed, and the total is derived.** Three of five entries placed
 *      is a real outcome, `placements` is index-addressed onto the caller's own request, and
 *      `awarded` is SUMMED from what the writes returned rather than from what was asked for.
 *   3. **Nothing is invented.** A world that cannot express a count of N refuses that entry
 *      rather than creating one document and reporting N, and a component the world cannot
 *      stack gets a second document rather than a count field it has no schema for.
 *
 * **The suite configures a NON-DEFAULT stack-quantity path for its whole file**, because every
 * path-threading assertion here is vacuous otherwise: an implementation that re-resolved the
 * module's ambient default at each site would satisfy an assertion written against
 * `itemStackQuantityPath()`. Each test file is its own process under `node --test`, so a
 * file-scoped `before`/`after` pair is the suite-level form of the shipped per-test
 * `t.after(resetItemStackQuantityPath)` convention.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import {
  AWARD_ENTRIES_MAX,
  COMPANION_OUTCOMES,
  COMPONENT_AWARD_ENTRY_OUTCOMES,
  POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
  POOLED_HOLDINGS_READ_MESSAGE_KEYS,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CURRENCY_CREDIT_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  AFFORDABILITY_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_MEMBERS,
} from '../src/systems/companionContract.js';
import { awardComponents } from '../src/systems/companionComponentAward.js';
import { createOrStackComponentItem } from '../src/systems/componentStacking.js';
import {
  configureItemStackQuantityPath,
  readStoredStackQuantity,
  resetItemStackQuantityPath,
} from '../src/systems/itemStackQuantity.js';

import {
  assertContractResult,
  assertMessageDataCovers,
  assertMessageIsFromTable,
} from './helpers/companionContractOutcomes.js';
import {
  FabricateFacadeUnderTest,
  installFacadeGame,
  makeFacadeActor,
} from './helpers/fabricateFacadeHarness.js';

/**
 * The configured path, spelled as a LITERAL everywhere below.
 *
 * Never `itemStackQuantityPath()`: comparing an implementation's answer against the live module
 * default is satisfied by an implementation that re-resolves that default at every site and
 * threads nothing, which is the exact regression the once-per-call resolution exists to prevent.
 */
const QUANTITY_PATH = 'system.count.value';

const SYSTEM = { id: 'sys-1', name: 'Test System', components: [] };
const KEY = 'FABRICATE.Component.Award';

before(() => configureItemStackQuantityPath(QUANTITY_PATH));
after(() => resetItemStackQuantityPath());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Write `value` at the configured path on `target`, creating the intermediate objects. */
function storeQuantity(target, value) {
  target.system = { ...(target.system ?? {}), count: { value } };
  return target;
}

/** The value stored at the configured path, or `null` when there is none to read. */
const storedQuantity = (target) =>
  readStoredStackQuantity(target, { absentDefault: null, path: QUANTITY_PATH });

/**
 * A component definition. `registeredItemUuid` is present by default, because the ORDINARY
 * award resolves a source item and the fallback payload is the exception.
 */
function makeComponent(id, extra = {}) {
  return {
    id,
    name: `Component ${id}`,
    img: `icons/${id}.webp`,
    registeredItemUuid: `Item.source-${id}`,
    ...extra,
  };
}

/**
 * An item document double whose `update` records its payload and applies it.
 *
 * `update` answers what a REAL `Document#update` answers: the document when it applied a
 * change. The shapes are NAMED rather than passed as the values themselves, because passing
 * `updateResult: undefined` silently takes the default and drives the opposite of the cell that
 * asked for it:
 *
 * - `'document'` — accepted AND visible on a re-read, the ordinary case;
 * - `'resolves-undefined'` — the empty-diff case, where the GM-authored path is not in the
 *   item's data model, Foundry discards the key and the promise resolves with nothing;
 * - `'resolves-null'` — the same, spelled the other way a stub might;
 * - `'document-without-applying'` — ACCEPTED and invisible: `readStoredStackQuantity` reads the
 *   PREPARED document, not `_source`, so a game system that recomputes the configured path in
 *   data preparation masks a write Foundry took. It is the shape that separates judging the
 *   write's own return from re-reading the stored value across it.
 */
function makeItem(id, { stored, updateResult = 'document' } = {}) {
  const item = {
    id,
    name: `Item ${id}`,
    updates: [],
    update(payload) {
      item.updates.push(payload);
      if (updateResult === 'document' || updateResult === 'document-without-applying') {
        if (updateResult === 'document') {
          for (const [path, value] of Object.entries(payload)) {
            if (path === QUANTITY_PATH) storeQuantity(item, value);
          }
        }
        return Promise.resolve(item);
      }
      return Promise.resolve(updateResult === 'resolves-null' ? null : undefined);
    },
  };
  if (stored !== undefined) storeQuantity(item, stored);
  return item;
}

/**
 * An actor double that CREATES, counting what reached `createEmbeddedDocuments`.
 *
 * `createResult: 'empty'` is the shape that matters most: a stub returning `[]` is what a
 * refusing `_preCreate` hook, a refusing `preCreateItem` hook and a throwing `Item` constructor
 * all look like to a caller, and `createOrStackComponentItem` turns it into a `null` return.
 */
function makeAwardActor({ createResult = 'document' } = {}) {
  const actor = {
    name: 'Bearer',
    items: [],
    created: [],
    createCalls: [],
    async createEmbeddedDocuments(type, payloads) {
      actor.createCalls.push({ type, payloads });
      if (createResult === 'empty') return [];
      if (createResult === 'throw') throw new Error('the server refused the create');
      const documents = (payloads ?? []).map((data, index) => {
        const created = makeItem(`created-${actor.created.length + index}`);
        const authored = storedQuantity(data);
        if (authored !== null) storeQuantity(created, authored);
        return created;
      });
      actor.created.push(...documents);
      return documents;
    },
  };
  return actor;
}

/**
 * The six seams, with a call record for each.
 *
 * `createOrStack` DELEGATES TO THE REAL SEAM by default rather than stubbing it, so
 * "exactly one create reached `createEmbeddedDocuments`" is a statement about shipped code and
 * so `componentStacking.js`'s own `[created] ?? null` normalisation — which every *(D0)* cell
 * leans on — is the implementation under test rather than a reproduction of it.
 */
function makeAwardSeams({
  components = [],
  systems = [SYSTEM],
  matching = () => [],
  sourceItem = (component) => ({
    toObject: () => storeQuantity({ name: component.name, img: component.img, type: 'weapon' }, 1),
  }),
  createOrStack,
  elected = true,
} = {}) {
  const byId = new Map(components.map((component) => [component.id, component]));
  const calls = { findComponentItems: [], resolveSourceItem: [], createOrStack: [], elected: 0 };
  const seams = {
    resolveSystem: (systemId) => systems.find((system) => system.id === systemId) ?? null,
    resolveComponent: (system, componentId) => byId.get(componentId) ?? null,
    findComponentItems: (actor, component, system) => {
      calls.findComponentItems.push({ actor, component, system });
      return matching(component);
    },
    resolveSourceItem: async (uuid) => {
      calls.resolveSourceItem.push(uuid);
      const component = components.find((entry) => entry.registeredItemUuid === uuid) ?? null;
      return typeof sourceItem === 'function' ? sourceItem(component) : sourceItem;
    },
    createOrStack: async (params) => {
      calls.createOrStack.push(params);
      if (typeof createOrStack === 'function') return createOrStack(params);
      return createOrStackComponentItem(params);
    },
    isElectedExecutor: () => {
      calls.elected += 1;
      return elected;
    },
  };
  return { seams, calls };
}

/** One award, with the fixture named only where it differs from the default. */
async function runAward({ actor, awards, systemId = SYSTEM.id, callSite = 'gmAction', ...rest }) {
  const target = actor ?? makeAwardActor();
  const { seams, calls } = makeAwardSeams(rest);
  const result = await awardComponents(target, { systemId, awards, callSite }, seams);
  return { result, calls, actor: target, seams };
}

/** `{ componentId, quantity }`, the only two keys an entry may carry. */
const entry = (componentId, quantity) => ({ componentId, quantity });

// ---------------------------------------------------------------------------
// AC-3 / AC-4 / AC-5 — the answer shape, and what `placements` distinguishes
// ---------------------------------------------------------------------------

describe('AC-3 — partial success is expressed, and the total is a VALUE', () => {
  it('answers partiallyAwarded with a summed total and one record per entry, in order', async () => {
    const components = [makeComponent('c0'), makeComponent('c2'), makeComponent('c4')];
    const { result, calls } = await runAward({
      components,
      awards: [entry('c0', 3), entry('missing', 2), entry('c2', 1), entry('c4', 0), entry('c4', 2)],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.partiallyAwarded);
    assert.equal(result.success, true, 'some of the act happened, so the call succeeded');
    assert.equal(result.placements.length, 5, 'a record per entry, never an abort');
    result.placements.forEach((placement, index) =>
      assert.equal(placement.index, index, 'records are index-addressed onto the request')
    );
    assert.equal(result.placements[1].outcome, COMPANION_OUTCOMES.componentNotFound);
    assert.equal(result.placements[3].outcome, COMPANION_OUTCOMES.invalidQuantity);
    // The value the criterion exists for: a lane that trusted a caller total, or returned a
    // boolean, or aborted at entry 1, cannot produce 6 here.
    assert.equal(result.awarded, 6, '3 + 1 + 2, summed from what the writes returned');
    assert.equal(
      calls.findComponentItems.length,
      3,
      'and the resolver is not consulted for a refused quantity or an unresolvable component'
    );
  });
});

describe('AC-4 — the loop ACCUMULATES rather than aborting at the first failure', () => {
  it('writes for both surviving entries after entry 0 refuses', async () => {
    const components = [makeComponent('c1'), makeComponent('c2')];
    const { result, calls } = await runAward({
      components,
      awards: [entry('missing', 5), entry('c1', 2), entry('c2', 3)],
    });

    assert.equal(calls.createOrStack.length, 2, 'the mutating call happened twice');
    assert.equal(result.placements[1].placed, 2);
    assert.equal(result.placements[2].placed, 3);
    assert.equal(result.outcome, COMPANION_OUTCOMES.partiallyAwarded);
  });
});

describe('AC-5 — attempted-and-failed is distinguishable from never-attempted', () => {
  it('(a) answers awardFailed with a FULL placement list when everything was attempted', async () => {
    const { result } = await runAward({
      components: [],
      awards: [entry('a', 1), entry('b', 2), entry('c', 3)],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.awardFailed);
    assert.equal(result.success, false, 'an ACT that did not happen answers false');
    assert.equal(result.awarded, 0, 'nothing landed, and that zero is observed');
    assert.equal(result.placements.length, 3, 'every entry was attempted and refused');
  });

  it('(b) answers a pre-attempt refusal with NO placements and a null total', async () => {
    const { result } = await runAward({
      components: [],
      awards: [entry('a', 1), entry('b', 2), entry('c', 3)],
      callSite: 'nonsense',
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.invalidCallSite);
    assert.equal(result.awarded, null, 'a sum over nothing is vacuous, never zero');
    assert.deepEqual(result.placements, [], 'nothing was attempted');
  });
});

// ---------------------------------------------------------------------------
// AC-6 — the request key set is CLOSED, at both levels
// ---------------------------------------------------------------------------

describe('AC-6 — a HOSTILE request cannot widen the answer, the seam call or the payload', () => {
  it('answers identically and hands the seam an identical, gate-owned bag', async () => {
    const components = [makeComponent('c1')];
    const gateResolvedActor = makeAwardActor();
    const callersOwnActor = makeAwardActor();

    const clean = await runAward({
      actor: gateResolvedActor,
      components,
      awards: [entry('c1', 2)],
    });
    const hostileSeams = makeAwardSeams({ components });
    const hostile = await awardComponents(
      gateResolvedActor,
      {
        systemId: SYSTEM.id,
        awards: [{ componentId: 'c1', quantity: 2 }],
        callSite: 'gmAction',
        // Everything a caller might hope to override, including the DERIVED answer fields.
        actor: callersOwnActor,
        matchingItems: [makeItem('smuggled', { stored: 99 })],
        itemData: { name: 'Smuggled', evil: true },
        quantityPath: 'system.somewhere.else',
        success: true,
        outcome: COMPANION_OUTCOMES.awarded,
        message: 'FABRICATE.Knowledge.Grant.Success',
        awarded: 999,
        placed: 999,
        placements: ['nonsense'],
      },
      hostileSeams.seams
    );

    // (a) the answer, field for field.
    assert.deepEqual({ ...hostile }, { ...clean.result }, 'the answer is unchanged');
    assert.deepEqual(
      { ...hostile.placements[0] },
      { ...clean.result.placements[0] },
      'and so is every placement record'
    );

    // (b) the seam's bag.
    const [cleanCall] = clean.calls.createOrStack;
    const [hostileCall] = hostileSeams.calls.createOrStack;
    assert.deepEqual(
      Object.keys(hostileCall),
      Object.keys(cleanCall),
      'the seam receives a byte-identical key set'
    );
    assert.equal(hostileCall.actor, gateResolvedActor, 'the GATE-resolved actor, by reference');
    assert.notEqual(hostileCall.actor, callersOwnActor, "and never the caller's own object");
    assert.deepEqual(hostileCall.matchingItems, [], 'always [], so the seam cannot stack');
    assert.equal(hostileCall.quantityPath, QUANTITY_PATH, 'the path resolved once, threaded');

    // (c) the item payload.
    assert.deepEqual(
      Object.keys(hostileCall.itemData).sort(),
      Object.keys(cleanCall.itemData).sort(),
      'the payload key set is unchanged'
    );
    for (const key of ['componentId', 'quantity', 'systemId', 'actor', 'itemData', 'evil']) {
      assert.equal(
        key in hostileCall.itemData,
        false,
        `no caller-supplied key reaches the created document (${key})`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// AC-7 / AC-8 — the carve-out is unreachable, and the module cannot reach past its seams
// ---------------------------------------------------------------------------

describe('AC-7 — the published carve-out is unreachable, so a stable member cannot throw', () => {
  it('refuses an unresolvable component WITHOUT calling the resolver seam', async () => {
    const { result, calls } = await runAward({ components: [], awards: [entry('missing', 1)] });

    assert.equal(result.outcome, COMPANION_OUTCOMES.awardFailed);
    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.componentNotFound);
    // The real content: `findComponentItems` THROWS on a null component, so resolution has to
    // precede it. A count of 0 is the only way to say that.
    assert.equal(calls.findComponentItems.length, 0);
  });

  it('refuses an unresolvable system the same way, with no placements at all', async () => {
    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 1)],
      systemId: 'no-such-system',
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.systemNotFound);
    assert.deepEqual(result.placements, []);
    assert.equal(calls.findComponentItems.length, 0);
  });
});

describe('AC-8 — the import list is a PROPERTY, not a spelling', () => {
  const SOURCE = readFileSync(
    new URL('../src/systems/companionComponentAward.js', import.meta.url),
    'utf8'
  );
  const CODE = SOURCE.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/.*$/gm, '')
    .replaceAll(/'(?:[^'\\]|\\.)*'/g, "''")
    .replaceAll(/"(?:[^"\\]|\\.)*"/g, '""')
    .replaceAll(/`(?:[^`\\]|\\.)*`/g, '``');

  it('imports from EXACTLY four modules, and reads no Foundry global', () => {
    const specifiers = [...CODE.matchAll(/^import[\s\S]*?from\s+''/gm)].length;
    const sources = [...SOURCE.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(
      ([, source]) => source
    );
    assert.equal(specifiers, sources.length, 'every import was located');
    assert.deepEqual(
      [...sources].sort(),
      [
        '../config/flags.js',
        './companionContract.js',
        './componentStacking.js',
        './itemStackQuantity.js',
      ],
      'admitting `./CraftingEngine.js` would let the module reach a live engine past the very ' +
        'seam every stacking assertion here depends on'
    );
    assert.equal(/globalThis/.test(CODE), false, 'no globalThis');
    assert.equal(/\bgame\b/.test(CODE), false, 'and no bare `game`');
  });
});

// ---------------------------------------------------------------------------
// AC-9 (D0) — a stable member neither throws nor lies, at five sites
// ---------------------------------------------------------------------------

describe('AC-9 (D0) — a write is judged by what it RETURNED, at five sites', () => {
  const THREE = [entry('c0', 1), entry('c1', 2), entry('c2', 3)];
  const components = [makeComponent('c0'), makeComponent('c1'), makeComponent('c2')];

  /** Entry 1 of 3 fails; entries 0 and 2 must still place their full amounts. */
  function assertNeighboursPlaced(result) {
    assert.equal(result.placements[1].outcome, COMPANION_OUTCOMES.awardFailed);
    assert.equal(result.placements[1].placed, 0);
    assert.equal(result.placements[0].placed, 1, 'the loop accumulates around the failure');
    assert.equal(result.placements[2].placed, 3);
  }

  it('(a) a create seam that REJECTS answers awardFailed for that entry alone', async () => {
    let calls = 0;
    const { result } = await runAward({
      components,
      awards: THREE,
      createOrStack: (params) => {
        calls += 1;
        if (calls === 2) throw new Error('the server refused');
        return createOrStackComponentItem(params);
      },
    });

    assertNeighboursPlaced(result);
    assert.equal(result.outcome, COMPANION_OUTCOMES.partiallyAwarded);
  });

  it('(b) a create seam that RESOLVES NULL answers the same, and the total is a value', async () => {
    // The likeliest silent success in the change: a stubbed `createEmbeddedDocuments`
    // returning `[]` is the DEFAULT shape of such a stub, and a lane that treats a
    // non-throwing call as success reports `placed: N` for a write that created nothing.
    let calls = 0;
    const { result } = await runAward({
      components,
      awards: THREE,
      createOrStack: (params) => {
        calls += 1;
        if (calls === 2) return createOrStackComponentItem({ ...params, actor: emptyActor });
        return createOrStackComponentItem(params);
      },
    });

    assertNeighboursPlaced(result);
    assert.equal(result.awarded, 4, '1 + 3, and never 1 + 2 + 3');
  });

  const emptyActor = makeAwardActor({ createResult: 'empty' });

  it('(c) a resolveSourceItem that REJECTS proves the try encloses the whole body', async () => {
    let calls = 0;
    const { result } = await runAward({
      components,
      awards: THREE,
      sourceItem: (component) => {
        calls += 1;
        if (calls === 2) throw new Error('a server error loading from a pack that exists');
        return { toObject: () => storeQuantity({ name: component.name, type: 'weapon' }, 1) };
      },
    });

    assertNeighboursPlaced(result);
  });

  it('(d) a malformed ENTRY refuses the whole call, before any write', async () => {
    const { result, calls } = await runAward({
      components,
      awards: [THREE[0], null, THREE[2]],
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.invalidAwards);
    assert.deepEqual(result.placements, []);
    assert.equal(calls.createOrStack.length, 0);
  });

  it('(e) a resolveSourceItem that RESOLVES NULL falls back, and authors the whole payload', async () => {
    const component = makeComponent('c-fallback');
    const { result, calls } = await runAward({
      components: [component],
      awards: [entry('c-fallback', 4)],
      sourceItem: () => null,
    });

    assert.equal(
      result.placements[0].placed,
      4,
      'a dangling uuid does not make a component unawardable'
    );
    assert.deepEqual(
      calls.createOrStack[0].itemData,
      {
        name: component.name,
        img: component.img,
        type: 'loot',
        system: { count: { value: 4 } },
        flags: {
          fabricate: { fabricate: { roles: { [SYSTEM.id]: { componentId: component.id } } } },
        },
      },
      'the fallback payload is composed from NAMED keys, quantity written and identity stamped'
    );
  });
});

// ---------------------------------------------------------------------------
// AC-15 / AC-16 / AC-17 — non-idempotency, the election, and the gate order
// ---------------------------------------------------------------------------

describe('AC-15 — non-idempotency is a pinned PROPERTY, not a docs sentence', () => {
  it('awards 3 then 6 across two identical calls', async () => {
    const component = makeComponent('c1');
    // An EXPLICIT stored value, and `0` deliberately: a finite stored zero is kept as a base,
    // while an item carrying NO readable value refuses the stack and creates a second document
    // — so a fixture with an absent value would be asserting a different rule entirely.
    const stack = makeItem('owned', { stored: 0 });
    const actor = makeAwardActor();
    const fixture = { components: [component], matching: () => [stack] };

    const first = await runAward({ actor, awards: [entry('c1', 3)], ...fixture });
    assert.equal(storedQuantity(stack), 3, 'call 1 wrote 0 + 3');
    assert.equal(first.result.placements[0].stacked, true);

    const second = await runAward({ actor, awards: [entry('c1', 3)], ...fixture });
    assert.equal(storedQuantity(stack), 6, 'call 2 wrote 3 + 3 — a second award is a second award');
    assert.equal(second.result.awarded, 3, 'and each call reports only what IT placed');
  });
});

describe('AC-16 — the election gate is ZERO WRITES, not merely an outcome token', () => {
  it('refuses a broadcast from an unelected client without touching anything', async () => {
    const stack = makeItem('owned', { stored: 2 });
    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      matching: () => [stack],
      awards: [entry('c1', 3)],
      callSite: 'broadcast',
      elected: false,
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.notElected);
    assert.deepEqual(result.placements, []);
    assert.equal(calls.createOrStack.length, 0, 'no create');
    assert.deepEqual(stack.updates, [], 'and no stack write');
    assert.equal(storedQuantity(stack), 2);
  });

  it('admits an elected broadcast, so the refusal is the ELECTION and not the call site', async () => {
    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 3)],
      callSite: 'broadcast',
      elected: true,
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.awarded);
    assert.equal(calls.elected, 1, 'and the election IS consulted for a broadcast');
  });
});

describe('AC-17 — the two published gate-order consequences hold one member over', () => {
  const GM_USER = { id: 'user-gm', isGM: true };

  function standUp({ ready = true, actors = [] } = {}) {
    installFacadeGame({ user: GM_USER, actors });
    const { seams, calls } = makeAwardSeams({ components: [makeComponent('c1')] });
    const facade = new FabricateFacadeUnderTest({
      ready,
      craftingSystemManager: { getSystem: (id) => (id === SYSTEM.id ? SYSTEM : null) },
      componentAwardSeams: seams,
    });
    return { facade, calls };
  }

  it('answers noActor — not invalidCallSite — for a GM holding a stale actorId', async () => {
    const { facade, calls } = standUp({ actors: [] });

    const result = await facade.awardComponents({
      actorId: 'gone',
      systemId: SYSTEM.id,
      awards: [entry('c1', 1)],
      callSite: 'nonsense',
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.noActor);
    assert.equal(result.message, COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]);
    assert.equal(calls.createOrStack.length, 0);
  });

  it('answers notReady — not invalidCallSite — before readiness', async () => {
    const actor = makeFacadeActor('actor-1');
    const { facade, calls } = standUp({ ready: false, actors: [actor] });

    const result = await facade.awardComponents({
      actorId: 'actor-1',
      systemId: SYSTEM.id,
      awards: [entry('c1', 1)],
      callSite: 'nonsense',
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.notReady);
    assert.equal(result.message, COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.notReady]);
    assert.equal(calls.createOrStack.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-18 — every outcome, at BOTH levels, in this member's OWN words
// ---------------------------------------------------------------------------

describe('AC-18 — the driven vocabulary equals the declared vocabulary, at both levels', () => {
  /**
   * Drive every outcome this member can answer with, at both levels, and collect them.
   *
   * The three FACADE refusals are driven through the harness facade, because the leaf can
   * never emit them — which is the point of asserting the two sets rather than one.
   */
  async function driveEveryOutcome() {
    const answers = [];
    const record = (result) => {
      answers.push(result);
      return result;
    };
    const components = [makeComponent('c1'), makeComponent('c2')];

    // awarded, partiallyAwarded, awardFailed, invalidAwards, systemNotFound, invalidCallSite,
    // notElected — plus componentNotFound, invalidQuantity and multiUnitUnsupported per entry.
    record((await runAward({ components, awards: [entry('c1', 2)] })).result);
    record((await runAward({ components, awards: [entry('c1', 2), entry('missing', 1)] })).result);
    record((await runAward({ components: [], awards: [entry('c1', 1)] })).result);
    record((await runAward({ components, awards: [] })).result);
    record((await runAward({ components, awards: [entry('c1', 1)], systemId: 'nope' })).result);
    record((await runAward({ components, awards: [entry('c1', 1)], callSite: 'x' })).result);
    record(
      (
        await runAward({
          components,
          awards: [entry('c1', 1)],
          callSite: 'broadcast',
          elected: false,
        })
      ).result
    );
    record((await runAward({ components, awards: [entry('c1', 0)] })).result);
    // An entry-level `awardFailed` needs a failed WRITE: an unresolvable component answers
    // `componentNotFound`, so the call-level case above cannot produce it.
    record(
      (
        await runAward({
          actor: makeAwardActor({ createResult: 'empty' }),
          components,
          awards: [entry('c1', 1)],
        })
      ).result
    );
    record(
      (
        await runAward({
          components,
          awards: [entry('c1', 3)],
          sourceItem: (component) => ({ toObject: () => ({ name: component.name, system: {} }) }),
        })
      ).result
    );

    const GM_USER = { id: 'user-gm', isGM: true };
    const facadeCall = async ({ user, ready, actors, actorId }) => {
      installFacadeGame({ user, actors });
      const facade = new FabricateFacadeUnderTest({
        ready,
        craftingSystemManager: { getSystem: () => SYSTEM },
        componentAwardSeams: makeAwardSeams({ components }).seams,
      });
      return record(
        await facade.awardComponents({
          actorId,
          systemId: SYSTEM.id,
          awards: [entry('c1', 1)],
          callSite: 'gmAction',
        })
      );
    };
    const actor = makeFacadeActor('actor-1');
    await facadeCall({
      user: { id: 'p', isGM: false },
      ready: true,
      actors: [actor],
      actorId: 'actor-1',
    });
    await facadeCall({ user: GM_USER, ready: true, actors: [], actorId: 'gone' });
    await facadeCall({ user: GM_USER, ready: false, actors: [actor], actorId: 'actor-1' });

    return answers;
  }

  it('(a) drives every CALL-level outcome the table declares, and no other', async () => {
    const answers = await driveEveryOutcome();
    const declared = Object.keys(COMPONENT_AWARD_MESSAGE_KEYS).filter(
      (outcome) => !COMPONENT_AWARD_ENTRY_OUTCOMES.includes(outcome)
    );

    assert.deepEqual(
      [...new Set(answers.map((answer) => answer.outcome))].sort(),
      [...declared].sort(),
      'the call-level set is COMPUTED from the table minus the entry-only tokens'
    );
  });

  it('(b) drives every ENTRY-level outcome an entry can answer with, and no other', async () => {
    const answers = await driveEveryOutcome();
    // The entry's FULL vocabulary: the entry-ONLY tokens plus the two it shares with the call
    // level. `COMPONENT_AWARD_ENTRY_OUTCOMES` is the entry-only three, which is what makes
    // (a)'s subtraction exact.
    const expected = [
      ...COMPONENT_AWARD_ENTRY_OUTCOMES,
      COMPANION_OUTCOMES.awarded,
      COMPANION_OUTCOMES.awardFailed,
    ].sort();

    assert.deepEqual(
      [...new Set(answers.flatMap((answer) => answer.placements.map((p) => p.outcome)))].sort(),
      expected
    );
  });

  it('(c) answers — and every placement — come from this member’s OWN table', async () => {
    const answers = await driveEveryOutcome();

    for (const answer of answers) {
      assertMessageIsFromTable(answer, COMPONENT_AWARD_MESSAGE_KEYS, 'the award');
      assertMessageDataCovers(answer, `the ${answer.outcome} answer`);
      for (const placement of answer.placements) {
        assertMessageIsFromTable(placement, COMPONENT_AWARD_MESSAGE_KEYS, 'a placement');
        assertMessageDataCovers(placement, `the ${placement.outcome} placement`);
      }
    }
    // And never another member's words, which is what a shared string would look like.
    const foreign = [
      KNOWLEDGE_GRANT_MESSAGE_KEYS,
      AFFORDABILITY_MESSAGE_KEYS,
      CHECK_ROLL_MESSAGE_KEYS,
      CURRENCY_CREDIT_MESSAGE_KEYS,
    ].flatMap((table) => Object.values(table));
    for (const answer of answers) {
      assert.equal(foreign.includes(answer.message), false, `${answer.outcome} borrowed a key`);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-21 to AC-25 — the quantity, the two branches, and the carry map
// ---------------------------------------------------------------------------

/**
 * The path is resolved ONCE PER CALL and threaded, asserted where the property has content.
 *
 * **Configuring a non-default path for the suite does not test this, and believing it did was
 * the gap this section closes.** `configureItemStackQuantityPath` sets the module state that
 * `itemStackQuantityPath()` itself reads, so for the whole file AMBIENT EQUALS CONFIGURED — an
 * implementation that re-resolves the ambient path at every site produces the identical value
 * and every assertion above still passes. Writing the literal rather than
 * `itemStackQuantityPath()` closed a tautology in the ASSERTION; it did not close the mutation.
 *
 * The property is only observable across a MID-CALL reconfiguration, which the member's own
 * docblock names as the reason for resolving once: the per-entry body spans two `await`s, so a
 * GM changing the setting between them makes a re-resolving lane write at one path and read at
 * another. The `findComponentItems` seam is the natural place to reproduce it — it is called
 * inside the per-entry body, after resolution and before either write.
 */
describe('the stack-quantity path is resolved ONCE, across a mid-call reconfiguration', () => {
  /** Reconfigure the ambient path the first time the resolver seam is consulted. */
  function reconfiguringResolver(answer = () => []) {
    let reconfigured = false;
    return (component) => {
      if (!reconfigured) {
        configureItemStackQuantityPath('system.other.value');
        reconfigured = true;
      }
      return answer(component);
    };
  }

  it('creates at the path the call STARTED with, never the one it ended with', async (t) => {
    t.after(() => configureItemStackQuantityPath(QUANTITY_PATH));

    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 3)],
      matching: reconfiguringResolver(),
    });

    assert.equal(result.placements[0].placed, 3);
    const [call] = calls.createOrStack;
    assert.equal(call.quantityPath, QUANTITY_PATH, 'the seam is told the ORIGINAL path');
    assert.equal(storedQuantity(call.itemData), 3, 'and the payload authors the count there');
    assert.equal(
      call.itemData.system.other,
      undefined,
      'nothing is authored at the path the GM switched to mid-call'
    );
  });

  it('stacks at the path the call STARTED with, in the write payload itself', async (t) => {
    t.after(() => configureItemStackQuantityPath(QUANTITY_PATH));

    const stack = makeItem('owned', { stored: 2 });
    const { result } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 3)],
      matching: reconfiguringResolver(() => [stack]),
    });

    assert.equal(result.placements[0].stacked, true, 'the base was read at the original path');
    assert.deepEqual(
      stack.updates,
      [{ [QUANTITY_PATH]: 5 }],
      'ONE key, at the path resolved once — a re-resolving lane reads at one and writes at another'
    );
  });
});

describe('AC-21 (D0) — the create path writes the quantity onto the PAYLOAD', () => {
  it('authors the count at the configured path, as well as passing awardedQuantity', async () => {
    const { calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 4)],
    });

    const [call] = calls.createOrStack;
    assert.equal(storedQuantity(call.itemData), 4, 'the payload carries the count');
    assert.equal(call.awardedQuantity, 4, 'and the seam is told too');
    // Mutation this closes: pass ONLY `awardedQuantity`. The seam ignores it on the create
    // path, so every created item is one unit while the answer reports N.
  });
});

describe('AC-22 (D0) — the stack write is judged by its OWN return, with no re-read', () => {
  const components = [makeComponent('c1')];

  it('(a) a resolved update stacks base + quantity, at the configured path', async () => {
    const stack = makeItem('owned', { stored: 2 });
    const { result, calls } = await runAward({
      components,
      matching: () => [stack],
      awards: [entry('c1', 3)],
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.awarded);
    assert.equal(result.placements[0].placed, 3);
    assert.equal(result.placements[0].stacked, true);
    assert.deepEqual(
      stack.updates,
      [{ [QUANTITY_PATH]: 5 }],
      'ONE key, at the configured path, carrying base + quantity'
    );
    assert.equal(calls.createOrStack.length, 0, 'and no create');
  });

  it('(b) an update RESOLVING UNDEFINED is a failure, and never falls through to create', async () => {
    // Foundry's own behaviour when the GM-authored path is not in the item's data model.
    const stack = makeItem('owned', { stored: 2, updateResult: 'resolves-undefined' });
    const { result, calls } = await runAward({
      components,
      matching: () => [stack],
      awards: [entry('c1', 3)],
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.awardFailed);
    assert.equal(result.placements[0].placed, 0);
    assert.equal(result.placements[0].stacked, null);
    assert.equal(result.awarded, 0);
    assert.equal(storedQuantity(stack), 2, 'the stack did not move');
    assert.equal(calls.createOrStack.length, 0, 'a discarded write is not a licence to create');
  });

  it('(c) an OBJECT at the configured path refuses before attempting anything', async () => {
    // The object must sit on the SOURCE ITEM as well as on the matched stub: the refusal is
    // produced against the PAYLOAD, and a stub-only object makes the target unreadable, which
    // is the fall-through-to-create rule rather than this one. That is the realistic
    // misconfigured world — a GM who configured the parent of the count configures it for
    // every item in the world.
    const stack = makeItem('owned');
    stack.system = { count: { value: { total: 2 } } };
    const { result, calls } = await runAward({
      components,
      matching: () => [stack],
      awards: [entry('c1', 3)],
      sourceItem: () => ({
        toObject: () => ({
          name: 'Source',
          type: 'weapon',
          system: { count: { value: { total: 2 } } },
        }),
      }),
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.multiUnitUnsupported);
    assert.equal(result.placements[0].placed, 0);
    assert.deepEqual(stack.updates, [], 'nothing was written');
    assert.equal(calls.createOrStack.length, 0);
  });

  it('(e) a write Foundry ACCEPTED but a re-read cannot see still counts as awarded', async () => {
    // The second mutation AC-22 names, and the one its other four cells cannot catch: implement
    // verification as a pre-read/post-read inequality and this cell flips to `awardFailed` —
    // which D4a publishes as RETRY-SAFE, so its failure mode is a DOUBLE AWARD.
    //
    // No concurrency is needed to reach it. `readStoredStackQuantity` reads the PREPARED
    // document rather than `_source` — the divergence `probeStackQuantityPath`'s own
    // `'schema-discard'` verdict exists for — so a system that recomputes the configured path
    // during data preparation masks a successful write from any re-read.
    const stack = makeItem('owned', { stored: 2, updateResult: 'document-without-applying' });
    const { result, calls } = await runAward({
      components,
      matching: () => [stack],
      awards: [entry('c1', 3)],
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.awarded);
    assert.equal(result.placements[0].placed, 3, 'the write ANSWERED, so the award landed');
    assert.equal(result.placements[0].stacked, true);
    assert.deepEqual(stack.updates, [{ [QUANTITY_PATH]: 5 }], 'and it wrote base + quantity');
    assert.equal(storedQuantity(stack), 2, 'while a re-read still answers the OLD value');
    assert.equal(calls.createOrStack.length, 0);
  });

  it('(d) an ABSENT stored value creates instead of inventing a count', async () => {
    const stack = makeItem('owned');
    const { result, calls } = await runAward({
      components,
      matching: () => [stack],
      awards: [entry('c1', 1)],
      sourceItem: () => ({ toObject: () => ({ name: 'Source', type: 'weapon', system: {} }) }),
    });

    assert.equal(calls.createOrStack.length, 1, 'the leaf did NOT stack');
    assert.equal(result.placements[0].stacked, false);
    assert.equal(result.placements[0].placed, 1);
    assert.deepEqual(stack.updates, [], 'and never wrote a count onto an item that carries none');
  });
});

describe('AC-23 — multiUnitUnsupported refuses rather than under-awarding', () => {
  const NO_QUANTITY = () => ({ toObject: () => ({ name: 'Plain', type: 'weapon', system: {} }) });

  it('(a) refuses a multi-unit award onto a source item with no quantity field', async () => {
    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 3)],
      sourceItem: NO_QUANTITY,
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.multiUnitUnsupported);
    assert.equal(result.placements[0].placed, 0);
    assert.equal(calls.createOrStack.length, 0);
  });

  it('(b) admits a SINGLE unit onto the same item, because one document is one unit', async () => {
    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 1)],
      sourceItem: NO_QUANTITY,
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.awarded);
    assert.equal(result.placements[0].placed, 1);
    assert.equal(calls.createOrStack.length, 1);
  });

  it('(c) refuses an OBJECT at the path — the presence test cannot see this', async () => {
    const { result, calls } = await runAward({
      components: [makeComponent('c1')],
      awards: [entry('c1', 3)],
      sourceItem: () => ({
        toObject: () => ({ name: 'Parent', type: 'weapon', system: { count: { value: {} } } }),
      }),
    });

    assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.multiUnitUnsupported);
    assert.equal(calls.createOrStack.length, 0);
  });

  it('(d) two single-unit entries make TWO documents, and invent no count', async () => {
    const actor = makeAwardActor();
    const { result, calls } = await runAward({
      actor,
      components: [makeComponent('c1')],
      awards: [entry('c1', 1), entry('c1', 1)],
      sourceItem: NO_QUANTITY,
    });

    assert.equal(calls.createOrStack.length, 2, 'two creates');
    assert.equal(actor.created.length, 2, 'and two documents');
    assert.equal(result.placements[0].stacked, false);
    assert.equal(result.placements[1].stacked, false);
    assert.equal(result.awarded, 2);
    for (const payload of calls.createOrStack) {
      assert.equal(storedQuantity(payload.itemData), null, 'no count is authored');
    }
    assert.deepEqual(actor.created[0].updates, [], 'and the first document is never written to');
  });
});

describe('AC-24 — the quantity domain is ENUMERATED, not approximated', () => {
  const REFUSED = [
    ['zero', 0],
    ['a negative', -1],
    ['a fraction', 2.5],
    ['a fractional string', '3.5'],
    ['an empty string', ''],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['missing', undefined],
    ['true', true],
    ['an array', [3]],
    ['beyond MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
  ];

  for (const [label, quantity] of REFUSED) {
    it(`refuses ${label} per ENTRY, with no write attempted`, async () => {
      const { result, calls } = await runAward({
        components: [makeComponent('c1')],
        awards: [{ componentId: 'c1', quantity }],
      });

      assert.equal(result.placements[0].outcome, COMPANION_OUTCOMES.invalidQuantity);
      assert.equal(result.placements[0].placed, 0);
      assert.equal(calls.createOrStack.length, 0);
    });
  }

  for (const quantity of [3, '3']) {
    it(`places ${JSON.stringify(quantity)}, because a numeric string is a number`, async () => {
      const { result } = await runAward({
        components: [makeComponent('c1')],
        awards: [{ componentId: 'c1', quantity }],
      });

      assert.equal(result.placements[0].placed, 3);
      assert.equal(result.placements[0].requested, quantity, 'and the request is echoed verbatim');
    });
  }
});

describe('AC-25 — a duplicate componentId in ONE request produces one item', () => {
  it('stacks the second entry onto the item the first created', async () => {
    const actor = makeAwardActor();
    const { result, calls } = await runAward({
      actor,
      components: [makeComponent('c1')],
      // The pessimistic case: the resolver answers `[]` BOTH times, modelling an item
      // collection that has not caught up with the create.
      matching: () => [],
      awards: [entry('c1', 2), entry('c1', 3)],
    });

    assert.equal(calls.createOrStack.length, 1, 'exactly one create was attempted');
    assert.equal(actor.createCalls.length, 1, 'and exactly one reached createEmbeddedDocuments');
    assert.deepEqual(
      actor.created[0].updates,
      [{ [QUANTITY_PATH]: 5 }],
      "entry 1's write went to the item entry 0 created"
    );
    assert.equal(result.placements[1].stacked, true);
    assert.equal(result.awarded, 5, 'the fact this criterion exists to protect');
  });
});

// ---------------------------------------------------------------------------
// AC-26 / AC-27 — the awards list, and the placement records
// ---------------------------------------------------------------------------

describe('AC-26 — awards validation is a REFUSAL, never a vacuous success', () => {
  const REFUSED = [
    ['an empty list', []],
    ['null', null],
    ['a string', 'x'],
    ['a null entry', [null]],
    ['an entry with no quantity', [{ componentId: 'c1' }]],
    ['an entry carrying a systemId', [{ componentId: 'c1', quantity: 1, systemId: 'sys-1' }]],
    ['a 65-entry list', Array.from({ length: 65 }, () => entry('c1', 1))],
  ];

  for (const [label, awards] of REFUSED) {
    it(`refuses ${label} at the CALL level`, async () => {
      const { result, calls } = await runAward({ components: [makeComponent('c1')], awards });

      assert.equal(result.outcome, COMPANION_OUTCOMES.invalidAwards);
      assert.equal(result.success, false);
      assert.equal(result.awarded, null);
      assert.deepEqual(result.placements, []);
      assert.equal(calls.createOrStack.length, 0);
      assert.deepEqual(result.messageData, { max: AWARD_ENTRIES_MAX });
    });
  }

  it(`accepts a ${AWARD_ENTRIES_MAX}-entry list, so the bound is a bound and not an off-by-one`, async () => {
    const { result } = await runAward({
      components: [makeComponent('c1')],
      awards: Array.from({ length: AWARD_ENTRIES_MAX }, () => entry('c1', 1)),
    });

    assert.equal(result.placements.length, AWARD_ENTRIES_MAX);
  });
});

describe('AC-27 — placement records echo the caller and are DEEPLY frozen', () => {
  it('echoes componentId and requested, derives stacked, and freezes every level', async () => {
    const stack = makeItem('owned', { stored: 1 });
    const { result } = await runAward({
      components: [makeComponent('c1'), makeComponent('c2')],
      matching: (component) => (component.id === 'c2' ? [stack] : []),
      awards: [entry('c1', 2), entry('c2', 1), entry('missing', 4)],
    });

    assert.deepEqual(
      result.placements.map((placement) => [placement.componentId, placement.requested]),
      [
        ['c1', 2],
        ['c2', 1],
        ['missing', 4],
      ],
      'the caller can map every record back onto its own entry'
    );
    assert.equal(result.placements[0].stacked, false, 'a create with no matches');
    assert.equal(result.placements[1].stacked, true, 'a stack onto an existing item');
    assert.equal(result.placements[2].stacked, null, 'and null for an entry that placed nothing');

    assert.ok(Object.isFrozen(result), 'the answer is frozen');
    assert.ok(Object.isFrozen(result.placements), 'the array is frozen');
    for (const placement of result.placements) {
      assert.ok(Object.isFrozen(placement), 'and so is every entry');
      assert.deepEqual(Object.keys(placement), [
        'index',
        'componentId',
        'requested',
        'placed',
        'stacked',
        'outcome',
        'message',
      ]);
      assert.ok(
        placement.message.startsWith(`${KEY}.`),
        `a placement answers with this member's own key, got ${placement.message}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// AC-30 — the contract's prose cannot silently contradict its own table
// ---------------------------------------------------------------------------

describe('AC-30 — the member-count prose is checked, in two halves', () => {
  const CONTRACT_SOURCE = readFileSync(
    new URL('../src/systems/companionContract.js', import.meta.url),
    'utf8'
  );

  /**
   * The file's PROSE — every block and line comment — with the JSDoc gutter stripped and
   * whitespace collapsed.
   *
   * Normalised because prose WRAPS: the claim about which members target an actor is split
   * across a line break by `prettier`, and a scan of the raw text would silently match nothing
   * and assert nothing. Comments only, because a number inside code is not a claim.
   */
  const PROSE = [
    ...[...CONTRACT_SOURCE.matchAll(/\/\*[\s\S]*?\*\//g)].map(([block]) => block),
    ...[...CONTRACT_SOURCE.matchAll(/^\s*\/\/.*$/gm)].map(([line]) => line),
  ]
    .join('\n')
    .replaceAll(/^\s*\*+/gm, ' ')
    .replaceAll(/\s+/g, ' ');

  it('(a) carries none of the phrases this change falsified', () => {
    // ABSENCE ONLY. A presence assertion would red on an innocent reword and its only remedy
    // would be editing the assertion — which is exactly how a criterion becomes the next stale
    // record. Absence reds only on a reword that KEEPS a wrong claim, which is perfect signal.
    for (const phrase of [
      'ten members',
      'Exactly ONE of the ten',
      'all FOUR `stable` members',
      'the THREE that target an actor',
      'two comments in',
      'the one route that lets a component award STACK',
      'ten TUPLES',
      // Falsified by the two pooled members (issue 1342).
      'the twelve members',
      'twelve TUPLES',
      'all SIX `stable` members',
      'the FIVE of those that target an actor',
    ]) {
      assert.equal(
        PROSE.includes(phrase),
        false,
        `the contract still claims "${phrase}", which its own table now contradicts`
      );
    }
  });

  it('(b) names no count that disagrees with a value computed from the table', () => {
    // COMPUTED, so it generalises past this change's phrases: any prose added later that
    // qualifies "members", "TUPLES" or "that target an actor" with a number is checked against
    // the table itself rather than against a literal somebody has to remember to update.
    const WORDS = new Map([
      ['one', 1],
      ['two', 2],
      ['three', 3],
      ['four', 4],
      ['five', 5],
      ['six', 6],
      ['seven', 7],
      ['eight', 8],
      ['nine', 9],
      ['ten', 10],
      ['eleven', 11],
      ['twelve', 12],
      ['thirteen', 13],
      ['fourteen', 14],
      ['fifteen', 15],
    ]);
    const numberOf = (token) =>
      WORDS.get(String(token).toLowerCase()) ?? (/^\d+$/.test(token) ? Number(token) : null);

    const members = COMPANION_MEMBERS.length;
    const stableMethods = COMPANION_MEMBERS.filter(
      (member) => member.promise === 'stable' && member.kind === 'method'
    ).length;
    // "The members that target an actor" is the set that can answer `noActor`, which is a
    // property of the shipped key tables rather than of the member row.
    const actorTargeted = [
      KNOWLEDGE_GRANT_MESSAGE_KEYS,
      AFFORDABILITY_MESSAGE_KEYS,
      CHECK_ROLL_MESSAGE_KEYS,
      COMPONENT_AWARD_MESSAGE_KEYS,
      CURRENCY_CREDIT_MESSAGE_KEYS,
      // The pooled pair targets a SET of actors, which is still targeting an actor: both
      // answer `noActor`, so both belong in the count the prose claims (issue 1342). Leaving
      // them out would let the prose keep saying FIVE and stay green.
      POOLED_HOLDINGS_READ_MESSAGE_KEYS,
      POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
    ].filter((table) => table[COMPANION_OUTCOMES.noActor] !== undefined).length;

    const claims = [
      {
        // `the N members` and `N TUPLES` only. A bare "four members now gate on it" is a
        // SUBSET count and a true statement, so a pattern that read every "<number> members"
        // as a claim about the table's size would be the false-positive class AC-30(a) is
        // written to avoid — with editing the assertion as its only remedy.
        label: 'the member count',
        expected: members,
        pattern: /\bthe\s+([A-Za-z]+|\d+)\s+members\b|([A-Za-z]+|\d+)\s+TUPLES\b/g,
        skip: /`?stable`?\s+members/,
      },
      {
        label: 'the stable-method count',
        expected: stableMethods,
        pattern: /([A-Za-z]+|\d+)\s+`?stable`?\s+members/g,
      },
      {
        label: 'the actor-targeted count',
        expected: actorTargeted,
        pattern: /([A-Za-z]+|\d+)\s+(?:of those\s+)?that target an actor/g,
      },
    ];

    for (const claim of claims) {
      let matched = 0;
      for (const [whole, ...groups] of PROSE.matchAll(claim.pattern)) {
        if (claim.skip?.test(whole)) continue;
        const value = numberOf(groups.find((group) => group !== undefined));
        if (value === null) continue;
        matched += 1;
        assert.equal(
          value,
          claim.expected,
          `${claim.label}: the prose says "${whole.trim()}" while the table says ${claim.expected}`
        );
      }
      assert.ok(matched > 0, `${claim.label}: matched nothing, so this half asserts nothing`);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-31 — the carry map is PER CALL
// ---------------------------------------------------------------------------

describe('AC-31 — the duplicate-componentId carry map is per CALL, never module scope', () => {
  it('never takes one actor’s item as another actor’s stack target', async () => {
    const components = [makeComponent('c1')];
    const first = makeAwardActor();
    const second = makeAwardActor();

    await runAward({ actor: first, components, matching: () => [], awards: [entry('c1', 3)] });
    const { result, calls } = await runAward({
      actor: second,
      components,
      matching: () => [],
      awards: [entry('c1', 3)],
    });

    assert.deepEqual(calls.createOrStack[0].matchingItems, []);
    assert.equal(result.placements[0].stacked, false, 'the second call CREATED');
    assert.equal(first.createCalls.length, 1, 'one document per actor');
    assert.equal(second.createCalls.length, 1);
    // The mutation this closes: a module-scoped map lands actor B's award on actor A's sheet
    // with a truthful-looking `success: true, stacked: true, placed: 3`.
    assert.deepEqual(first.created[0].updates, [], "the first actor's item is untouched");
  });
});
