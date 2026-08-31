/**
 * The pooled holdings READ's BEHAVIOUR (issue 1342, phase 4) — `readPooledHoldings`, the leaf
 * behind `game.fabricate.readPooledHoldings`.
 *
 * The contract half — what the answer's fields promise, and how `sufficient` is derived — is
 * pinned by `tests/companion-pooled-holdings-contract.test.js`. This suite is about what the
 * member DOES: resolving a cost's name against every crafting system's definitions, counting a
 * component across a party through the matcher the consume will write through, classifying a
 * tool, and pooling coin.
 *
 * Four claims carry the weight, and each is asserted against a REAL collaborator rather than a
 * convenient double:
 *
 *   - **The count comes from the published matcher.** `CraftingEngine.findComponentItems` is
 *     borrowed from its own prototype, so its case-SENSITIVE, TIERED ALL-OR-NOTHING behaviour is
 *     what the read reports. A looser double would report a number the consume cannot pay.
 *   - **A tool's state comes from the shipped classifier**, driven through the REAL
 *     `RecipeManager.toolMatchesItem`, so a `damaged` tool reads insufficient exactly as the
 *     start-attempt gate refuses one.
 *   - **`balanceNotConfigured` blocks nothing.** A `macro` world with no `balance` macro answers
 *     `null` for its currency cost while every component and tool cost in the same request is
 *     answered normally. This is the placement the contract declares as data, proved as behaviour.
 *   - **A cost's `name` means the same thing on every axis.** A currency cost resolves its coin
 *     by id, abbreviation or label, folded exactly as the component axis folds a definition
 *     name, and reports a collision as `ambiguous` rather than picking one — while an exact id
 *     still wins outright, so a label typed onto another coin cannot redirect a working caller.
 *   - **The issue-540 name-only telemetry is not fired by resolving a cost's NAME**, with a
 *     negative control proving the probe can see a warning at all — a silent probe that could
 *     never fire would pass the first assertion vacuously.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import {
  COMPANION_OUTCOMES,
  POOLED_ACTORS_MAX,
  POOLED_COSTS_MAX,
  POOLED_TOOL_STATES,
} from '../src/systems/companionContract.js';
import { readPooledHoldings } from '../src/systems/companionPooledHoldings.js';
import { resetNameOnlyMatchTelemetry } from '../src/utils/componentNameMatch.js';

import { POOLED_LADDER, POOLED_MACROS, PooledActorFake } from './helpers/pooled-currency-fixtures.js';

/**
 * A `game` global, because `resolveCoinSpender` reads a BARE `game.fabricate?.…` on its accessor
 * fallbacks. Under Foundry the global always exists, so this models production.
 */
globalThis.game = globalThis.game ?? { fabricate: {} };

const SMITHING = 'smithing';
const ALCHEMY = 'alchemy';
const IRON_SOURCE = 'Item.ironIngotSource';

/**
 * One owned item.
 *
 * `getFlag` is a real function rather than a bare `flags` literal, because `isToolBroken` reads
 * the broken marker through `candidate.getFlag(...)` first and `globalThis.foundry.utils` second:
 * an inert `{ flags: { fabricate: { toolBroken: true } } }` fixture would classify a broken tool
 * as `present` and the suite would prove the opposite of what it claims.
 */
class HeldItem {
  constructor(name, { uuid = null, quantity = 1, broken = false } = {}) {
    this.name = name;
    if (uuid) this.uuid = uuid;
    this.system = { quantity };
    this.flags = broken ? { fabricate: { toolBroken: true } } : {};
  }

  getFlag(scope, key) {
    return this.flags?.[scope]?.[key];
  }
}

/** An actor holding coin and items, with every `update` recorded so "writes nothing" is testable. */
function makeActor(name, { currency = {}, items = [] } = {}) {
  const actor = new PooledActorFake(name, currency);
  actor.items = items;
  return actor;
}

/**
 * Two crafting systems, because a cost's name resolves ACROSS systems and `ambiguous` is a claim
 * about more than one of them answering.
 *
 * `Iron Ingot` carries a source reference and `Ember Dust` does not, so one component exercises
 * the durable tier of `findComponentItems` and the other its deprecated name tier — and
 * `Ember Dust` exists in BOTH systems, which is the ambiguity a companion must be told about
 * before it consumes by the id this read hands back.
 */
function makeSystems() {
  return [
    {
      id: SMITHING,
      components: [
        { id: 'iron', name: 'Iron Ingot', registeredItemUuid: IRON_SOURCE },
        { id: 'ember', name: 'Ember Dust' },
      ],
      tools: [{ id: 'hammer', name: "Smith's Hammer", componentId: null }],
    },
    {
      id: ALCHEMY,
      components: [{ id: 'alchemy-ember', name: 'Ember Dust' }],
      tools: [],
    },
  ];
}

/**
 * The REAL tool matcher, borrowed from `RecipeManager`'s prototype and given only the two
 * private readers it calls.
 *
 * Borrowed rather than stubbed because a looser double would report a hit the shipped matcher
 * refuses, and the read would then promise a tool the start-attempt gate rejects. `recipeManager`
 * is the shape `resolveToolMatcher` falls through to, exactly as production passes
 * `{ recipeManager: this }`.
 */
function toolMatcherFor(systems) {
  const byId = new Map(systems.map((system) => [system.id, system]));
  const of = (recipe) => byId.get(recipe?.craftingSystemId) ?? null;
  return {
    recipeManager: {
      _getSystemTools: (recipe) => of(recipe)?.tools ?? [],
      _getComponent: (recipe, componentId) =>
        (of(recipe)?.components ?? []).find((entry) => entry.id === componentId) ?? null,
      toolMatchesItem: RecipeManager.prototype.toolMatchesItem,
    },
  };
}

/**
 * The seam bag the facade will inject, with the PUBLISHED matcher borrowed from its own prototype.
 *
 * `findComponentItems` reads no `this`, so calling it detached is the whole real method and not a
 * re-implementation of it — which is the point: the read's numbers must be the matcher's numbers.
 */
function readSeams(systems, { spendStrategy = 'actorProperty', macros = {}, ...rest } = {}) {
  return {
    listSystems: () => systems,
    findComponentItems: (actor, component, system) =>
      CraftingEngine.prototype.findComponentItems.call(null, actor, component, system),
    craftingSystemManager: toolMatcherFor(systems),
    getCurrencyConfig: () => ({ spendStrategy, providerId: '', macros, units: POOLED_LADDER }),
    ...rest,
  };
}

/** A cost entry, spelled with the closed key set the member requires. */
const cost = (type, name, quantity = 1) => ({ type, name, quantity });

/** Read `costs` for `actors` against the default two-system world. */
function read(actors, costs, seamOverrides = {}, systems = makeSystems()) {
  return readPooledHoldings(actors, { costs }, readSeams(systems, seamOverrides));
}

/** `[outcome, available, sufficient]` per reading — the three fields most claims are about. */
const summarize = (result) =>
  result.readings.map((reading) => [reading.outcome, reading.available, reading.sufficient]);

describe('readPooledHoldings — components', () => {
  it('sums a component across the party and hands back the ids a consume needs', async () => {
    const party = [
      makeActor('Idrin', { items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 })] }),
      makeActor('Sera', { items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 3 })] }),
      makeActor('Bram', { items: [new HeldItem('Rope')] }),
    ];

    const result = await read(party, [cost('component', 'Iron Ingot', 4)]);

    assert.equal(result.success, true);
    assert.equal(result.outcome, COMPANION_OUTCOMES.read);
    const [reading] = result.readings;
    // 2 + 3 counted as STACKS, not as documents: three items are held and the pool is five.
    assert.equal(reading.available, 5);
    assert.equal(reading.sufficient, true);
    assert.equal(reading.systemId, SMITHING);
    assert.equal(reading.componentId, 'iron');
    assert.equal(reading.requested, 4);
    assert.equal(reading.ambiguous, false);
    assert.equal(reading.state, null, 'a component reading answers no tool state');
    assert.deepEqual(
      result.actorUuids,
      ['Actor.Idrin', 'Actor.Sera', 'Actor.Bram'],
      'the RESOLVED set is echoed in the order the pool was read in'
    );
  });

  it('answers a provable zero — not "cannot see" — for a component nobody carries', async () => {
    const party = [makeActor('Idrin', { items: [new HeldItem('Rope')] })];

    const result = await read(party, [cost('component', 'Iron Ingot', 1)]);

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.read, 0, false]]);
  });

  it('reports the matcher’s TIERED ALL-OR-NOTHING count rather than smoothing it', async () => {
    // Two durably-linked copies and three name-only ones. `findComponentItems` returns the
    // durable tier's hits and NEVER falls back once that tier answered, so the honest pooled
    // number is 2. A read that summed both tiers would promise five to a consume that can only
    // find two — the gate that lies, in the direction that hurts.
    const party = [
      makeActor('Idrin', {
        items: [
          new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 }),
          new HeldItem('Iron Ingot', { quantity: 3 }),
        ],
      }),
    ];

    const result = await read(party, [cost('component', 'Iron Ingot', 5)]);

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.read, 2, false]]);
  });

  it('flags a name that answers in two crafting systems as ambiguous', async () => {
    const party = [makeActor('Idrin', { items: [new HeldItem('Ember Dust', { quantity: 4 })] })];

    const result = await read(party, [cost('component', 'Ember Dust', 1)]);

    const [reading] = result.readings;
    assert.equal(reading.ambiguous, true, 'two systems answered, so the caller must choose');
    assert.equal(reading.systemId, SMITHING, 'and the first system in the seam’s order answered');
    assert.equal(reading.componentId, 'ember');
    assert.equal(reading.available, 4);
  });

  it('reports an ID that answers in two systems as ambiguous AFTER the 1.30.0 re-key', async () => {
    // ISSUE 1370 criterion 9, and the BEHAVIOUR here is unchanged while the FILE is not: this
    // measurement is taken after `systemComponents` was repointed at the shared read seam.
    //
    // The id tier runs across EVERY system. Before `1.30.0` one real item authored in two systems
    // had two DIFFERENT ids, so an id-keyed cost could only ever answer in one of them. The
    // migration re-keys both in-system definitions to ONE world id, so the same read now answers
    // in two - which is exactly why `companion-api`'s ambiguity obligation STANDS even though its
    // stated reason ("a component id is not unique across crafting systems") is retracted. The two
    // candidate systems still resolve DIFFERENT DOCUMENT SETS, because `findComponentItems` is
    // system-scoped through the durable identity roles map.
    const party = [makeActor('Idrin', { items: [new HeldItem('Ember Dust', { quantity: 4 })] })];

    const beforeMigration = makeSystems();
    const beforeReading = (
      await read(party, [cost('component', 'ember', 1)], {}, beforeMigration)
    ).readings[0];
    assert.equal(beforeReading.ambiguous, false, 'two DIFFERENT ids, so only one system answered');

    const afterMigration = makeSystems();
    afterMigration[1].components[0].id = 'ember';
    const afterReading = (
      await read(party, [cost('component', 'ember', 1)], {}, afterMigration)
    ).readings[0];
    assert.equal(afterReading.ambiguous, true, 'ONE world id, so both member systems answer');
    assert.equal(afterReading.componentId, 'ember');
    assert.equal(afterReading.systemId, SMITHING, 'and the seam order still decides which wins');
  });

  it('refuses ONE reading, not the call, for a name no system knows', async () => {
    const party = [makeActor('Idrin')];

    const result = await read(party, [
      cost('component', 'Mithril', 1),
      cost('component', 'Ember Dust', 1),
    ]);

    assert.equal(result.outcome, COMPANION_OUTCOMES.read, 'the call still answered');
    assert.deepEqual(summarize(result), [
      [COMPANION_OUTCOMES.componentNotFound, null, null],
      [COMPANION_OUTCOMES.read, 0, false],
    ]);
    assert.equal(result.readings[0].componentId, null);
  });
});

describe('readPooledHoldings — tools', () => {
  const toolCost = [cost('tool', "Smith's Hammer")];

  it('answers a state and no quantity when the party holds a working tool', async () => {
    const party = [makeActor('Idrin'), makeActor('Sera', { items: [new HeldItem("Smith's Hammer")] })];

    const [reading] = (await read(party, toolCost)).readings;

    assert.equal(reading.state, POOLED_TOOL_STATES.present);
    assert.equal(reading.sufficient, true);
    assert.equal(reading.available, null, 'a tool is a capability, not a quantity');
    assert.equal(reading.systemId, SMITHING);
  });

  it('reads a broken tool as damaged, and damaged is NOT sufficient', async () => {
    // The whole reason a tool's `sufficient` is `state === 'present'` and nothing else: the
    // hammer is physically in the party's hands, and the shipped start-attempt gate still
    // refuses it.
    const party = [makeActor('Idrin', { items: [new HeldItem("Smith's Hammer", { broken: true })] })];

    const [reading] = (await read(party, toolCost)).readings;

    assert.equal(reading.state, POOLED_TOOL_STATES.damaged);
    assert.equal(reading.sufficient, false);
  });

  it('reads a tool nobody in the party holds as missing', async () => {
    const [reading] = (await read([makeActor('Idrin')], toolCost)).readings;

    assert.equal(reading.state, POOLED_TOOL_STATES.missing);
    assert.equal(reading.sufficient, false);
  });

  it('pools the party into one inventory, so any member’s tool satisfies the cost', async () => {
    const party = [
      makeActor('Idrin'),
      makeActor('Sera'),
      makeActor('Bram', { items: [new HeldItem("Smith's Hammer")] }),
    ];

    assert.equal((await read(party, toolCost)).readings[0].state, POOLED_TOOL_STATES.present);
  });

  it('refuses a tool name no system declares', async () => {
    const result = await read([makeActor('Idrin')], [cost('tool', 'Glassblower’s Pipe')]);

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.toolNotFound, null, null]]);
    assert.equal(result.readings[0].state, null);
  });

  it('names a COMPONENT-LINKED tool by its component, and reports that component back', async () => {
    // Two claims no other tool case can make, because every other fixture tool carries its own
    // `name` and a `componentId` of `null`.
    //
    // The first is `toolDisplayName`'s fallback: a tool whose snapshot name was never
    // backfilled is known by its LINKED COMPONENT's name, which is the expression
    // `RecipeManager.toolMatchesItem` derives its own fallback from — so a tool this read can
    // find is a tool that matcher can match. With `own` truthy on every other fixture the
    // fallback was dead code as far as the suite was concerned.
    //
    // The second matters more to a caller: `componentId` on a tool reading is the id a
    // companion would then hand to the CONSUME. Until this case it was only ever observed at
    // `null`, so a reading that named the wrong component would have looked identical.
    const systems = [
      {
        id: SMITHING,
        components: [{ id: 'tongs', name: 'Iron Tongs' }],
        tools: [{ id: 'tongs-tool', name: '', componentId: 'tongs' }],
      },
    ];
    const party = [makeActor('Idrin', { items: [new HeldItem('Iron Tongs')] })];

    const [reading] = (await read(party, [cost('tool', 'Iron Tongs')], {}, systems)).readings;

    assert.equal(reading.state, POOLED_TOOL_STATES.present, 'the linked name found the tool');
    assert.equal(reading.sufficient, true);
    assert.equal(reading.systemId, SMITHING);
    assert.equal(reading.componentId, 'tongs', 'and the reading names the component it links to');

    // The counterpart, so the assertion above is not satisfied by a member that echoes the
    // cost's own name: a tool with no link reports `null`, not a component id.
    const unlinked = (await read(party, [cost('tool', "Smith's Hammer")])).readings[0];
    assert.equal(unlinked.componentId, null);
  });
});

describe('readPooledHoldings — currency', () => {
  it('pools coin across the party and reports it in the unit the caller asked in', async () => {
    // 1 gp + 50 sp + 30 cp is 630 copper on the fixture ladder, and 6 whole gold pieces. The
    // FLOOR is the claim: a pool holding 6.3 gp cannot pay 7.
    const party = [
      makeActor('Idrin', { currency: { gp: 1 } }),
      makeActor('Sera', { currency: { sp: 50 } }),
      makeActor('Bram', { currency: { cp: 30 } }),
    ];

    const result = await read(party, [cost('currency', 'gp', 6), cost('currency', 'gp', 7)]);

    assert.deepEqual(summarize(result), [
      [COMPANION_OUTCOMES.read, 6, true],
      [COMPANION_OUTCOMES.read, 6, false],
    ]);
    assert.equal(result.readings[0].unitId, 'gp');
  });

  it('refuses a unit the world ladder does not name', async () => {
    const result = await read([makeActor('Idrin')], [cost('currency', 'zorkmid', 1)]);

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.unitNotFound, null, null]]);
    assert.equal(result.readings[0].unitId, 'zorkmid');
  });

  it('reads an unreadable actor as "cannot see", never as a partial sum', async () => {
    const opaque = makeActor('Sera');
    opaque.system.currency.gp = 'a pouch';
    const party = [makeActor('Idrin', { currency: { gp: 9 } }), opaque];

    const result = await read(party, [cost('currency', 'gp', 1)]);

    // 9 would be a confident number about a DIFFERENT party, and it is always too small — so a
    // gate built on it refuses parties that can pay while looking authoritative.
    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.balanceNotConfigured, null, null]]);
  });

  it('lets a macro world with no balance macro block NOTHING ELSE in the request', async () => {
    // The placement the contract declares as data, proved as behaviour: `balanceNotConfigured`
    // is a READING's answer, so the component and tool costs beside it are answered in full.
    const { balance, ...withoutBalance } = POOLED_MACROS;
    assert.ok(balance, 'the fixture macro set really does carry a balance key to remove');
    const party = [
      makeActor('Idrin', {
        currency: { gp: 9 },
        items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 }), new HeldItem("Smith's Hammer")],
      }),
    ];

    const result = await read(
      party,
      [cost('currency', 'gp', 1), cost('component', 'Iron Ingot', 2), cost('tool', "Smith's Hammer")],
      { spendStrategy: 'macro', macros: withoutBalance }
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.read);
    assert.deepEqual(summarize(result), [
      [COMPANION_OUTCOMES.balanceNotConfigured, null, null],
      [COMPANION_OUTCOMES.read, 2, true],
      [COMPANION_OUTCOMES.read, null, true],
    ]);
    assert.equal(result.readings[2].state, POOLED_TOOL_STATES.present);
  });

  it('reads an unconfigured coin ladder as unreadable rather than as nothing', async () => {
    const result = await read([makeActor('Idrin')], [cost('currency', 'gp', 1)], {
      getCurrencyConfig: () => ({ spendStrategy: 'actorProperty', macros: {}, units: [] }),
    });

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.balanceNotConfigured, null, null]]);
  });
});

describe('readPooledHoldings — the request itself', () => {
  const party = () => [makeActor('Idrin')];

  it('splits a mistyped axis from an axis it does not serve yet', async () => {
    const result = await read(party(), [
      cost('components', 'Iron Ingot', 1),
      cost('essence', 'fire', 1),
      cost('tag', 'metal', 1),
    ]);

    assert.deepEqual(
      result.readings.map((reading) => reading.outcome),
      [
        COMPANION_OUTCOMES.invalidCostType,
        COMPANION_OUTCOMES.costTypeUnsupported,
        COMPANION_OUTCOMES.costTypeUnsupported,
      ],
      '"you mistyped" and "not yet" send an author to two different places'
    );
    assert.equal(result.readings[0].type, 'components', 'the caller’s own spelling is echoed back');
  });

  it('refuses a quantity per reading, and decides the AXIS first', async () => {
    const result = await read(party(), [
      cost('component', 'Iron Ingot', 0),
      cost('component', 'Iron Ingot', 1.5),
      cost('component', 'Iron Ingot', -2),
      cost('component', 'Iron Ingot', 'three'),
      { type: 'nonsense', name: 'Iron Ingot', quantity: 0 },
    ]);

    assert.deepEqual(
      result.readings.map((reading) => reading.outcome),
      [
        COMPANION_OUTCOMES.invalidQuantity,
        COMPANION_OUTCOMES.invalidQuantity,
        COMPANION_OUTCOMES.invalidQuantity,
        COMPANION_OUTCOMES.invalidQuantity,
        // A quantity is meaningless until the axis it counts is known, so the axis refuses first.
        COMPANION_OUTCOMES.invalidCostType,
      ]
    );
    assert.equal(result.readings[0].requested, null);
  });

  it('accepts the numeric string a companion legitimately reads off an authored field', async () => {
    const holder = makeActor('Idrin', {
      items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 })],
    });

    const result = await read([holder], [cost('component', 'Iron Ingot', '2')]);

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.read, 2, true]]);
    assert.equal(result.readings[0].requested, 2);
  });

  it('refuses the whole call for a cost list that is not a bounded list of well-formed entries', async () => {
    const overBound = Array.from({ length: POOLED_COSTS_MAX + 1 }, () =>
      cost('component', 'Iron Ingot', 1)
    );
    const cases = [
      ['absent', null],
      ['not a list', { type: 'component', name: 'Iron Ingot', quantity: 1 }],
      ['empty', []],
      ['over-bound', overBound],
      ['an entry missing a key', [{ type: 'component', name: 'Iron Ingot' }]],
      ['an entry carrying an extra key', [{ ...cost('component', 'Iron Ingot', 1), systemId: SMITHING }]],
      ['an entry that is not an object', ['Iron Ingot']],
    ];

    for (const [label, costs] of cases) {
      const result = await read(party(), costs);
      assert.equal(result.outcome, COMPANION_OUTCOMES.invalidCosts, label);
      assert.equal(result.success, false, label);
      assert.deepEqual(result.readings, [], `${label}: a refusal reads nothing`);
      assert.deepEqual(result.actorUuids, [], `${label}: and echoes no pool`);
      assert.deepEqual(result.messageData, { max: POOLED_COSTS_MAX }, label);
    }
    // A list one shorter than the refused one is accepted, so the bound is the bound and not a
    // guard that refuses everything.
    assert.equal((await read(party(), overBound.slice(1))).outcome, COMPANION_OUTCOMES.read);
  });

  it('fails closed on an actor set it cannot address, interpolating its own bound', async () => {
    const costs = [cost('component', 'Iron Ingot', 1)];
    const cases = [
      ['absent', null],
      ['not a list', makeActor('Idrin')],
      ['empty', []],
      ['over-bound', Array.from({ length: POOLED_ACTORS_MAX + 1 }, (_, i) => makeActor(`A${i}`))],
      ['carrying something that is not addressable', [makeActor('Idrin'), { name: 'Sera' }]],
    ];

    for (const [label, actors] of cases) {
      const result = await read(actors, costs);
      assert.equal(result.outcome, COMPANION_OUTCOMES.invalidActorUuids, label);
      assert.deepEqual(result.readings, [], `${label}: nothing is read from a set like this`);
      assert.deepEqual(result.messageData, { max: POOLED_ACTORS_MAX }, label);
    }
  });

  it('refuses a pool that is not a SET, because summing it twice errs PERMISSIVE', async () => {
    // The one refusal on this floor whose absence produces a WRONG NUMBER rather than a
    // crash. Every reading sums per entry, so one document listed twice reads as a party
    // holding twice what it holds — and the caller consumes on the strength of that answer.
    // The facade's gate refuses the repeat before this floor ever sees it; the floor exists
    // because the member below it deletes and a floor that trusts its caller is not one.
    const idrin = makeActor('Idrin', {
      currency: { gp: 3 },
      items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 5 })],
    });
    const sera = makeActor('Sera');

    for (const [label, party] of [
      ['the same document twice', [idrin, idrin]],
      ['a repeat buried in a larger party', [idrin, sera, idrin]],
    ]) {
      const result = await read(party, [cost('component', 'Iron Ingot', 8)]);
      assert.equal(result.outcome, COMPANION_OUTCOMES.invalidActorUuids, label);
      assert.deepEqual(result.messageData, { max: POOLED_ACTORS_MAX }, label);
      assert.deepEqual(result.readings, [], label);
    }

    // The number the refusal prevents, stated so the case cannot be read as ceremony: Idrin
    // holds five, and the doubled pool would have answered ten — sufficient for a cost of
    // eight the party cannot pay.
    const honest = await read([idrin], [cost('component', 'Iron Ingot', 8)]);
    assert.deepEqual(summarize(honest), [[COMPANION_OUTCOMES.read, 5, false]]);
  });
});

describe('readPooledHoldings — the promises it makes to a companion', () => {
  it('writes nothing, on any actor, for any axis', async () => {
    const items = [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 })];
    const party = [makeActor('Idrin', { currency: { gp: 5 }, items })];

    await read(party, [
      cost('component', 'Iron Ingot', 1),
      cost('currency', 'gp', 1),
      cost('tool', "Smith's Hammer"),
    ]);

    assert.deepEqual(party[0].updates, [], 'a holdings read must write nothing');
    assert.equal(party[0].totalCopper(), 500);
    assert.equal(items[0].system.quantity, 2, 'and must not touch a stack it counted');
  });

  it('deep-freezes the answer, both lists and every reading', async () => {
    const result = await read([makeActor('Idrin')], [cost('component', 'Iron Ingot', 1)]);

    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.actorUuids));
    assert.ok(Object.isFrozen(result.readings));
    assert.ok(Object.isFrozen(result.readings[0]), 'a mutable reading is a published mutable record');
  });

  it('never throws: a seam that rejects becomes a refusal, at whichever level it broke', async () => {
    const explode = () => {
      throw new Error('the crafting library is unreadable');
    };

    const perCost = await read([makeActor('Idrin')], [cost('component', 'Iron Ingot', 1)], {
      findComponentItems: explode,
    });
    assert.deepEqual(summarize(perCost), [[COMPANION_OUTCOMES.readFailed, null, null]]);
    assert.equal(perCost.outcome, COMPANION_OUTCOMES.read, 'one broken axis is not the call');

    const perCall = await read([makeActor('Idrin')], [cost('component', 'Iron Ingot', 1)], {
      listSystems: explode,
    });
    assert.equal(perCall.outcome, COMPANION_OUTCOMES.readFailed);
    assert.equal(perCall.success, false);
    assert.deepEqual(perCall.readings, []);
  });
});

describe('readPooledHoldings — the deprecated name tier’s telemetry', () => {
  let warnings;
  let originalWarn;

  beforeEach(() => {
    resetNameOnlyMatchTelemetry();
    warnings = [];
    originalWarn = console.warn;
    console.warn = (...args) => warnings.push(String(args[0] ?? ''));
  });

  afterEach(() => {
    console.warn = originalWarn;
    resetNameOnlyMatchTelemetry();
  });

  const nameOnly = () => warnings.filter((line) => line.includes('name-only match'));

  it('emits nothing while resolving a cost’s NAME to a definition', async () => {
    // The cost names a component BY NAME and the actors hold it by SOURCE REFERENCE, so the only
    // name compare in the whole call is the definition lookup — which goes through
    // `definitionIndex`'s own maps and never through the warn-once reporter. A companion polling
    // holdings every stage must not register as reliance on the tier #540 exists to remove.
    const party = [
      makeActor('Idrin', { items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 })] }),
    ];

    const result = await read(party, [cost('component', 'Iron Ingot', 1)]);

    assert.equal(result.readings[0].available, 2, 'the read really did resolve and count');
    assert.deepEqual(nameOnly(), [], 'resolving a cost name is not reliance on the name tier');
  });

  it('still reports the ITEM-side fallback, which is what proves the probe can fire at all', async () => {
    // The negative control. `Ember Dust` carries no source reference, so `findComponentItems`
    // falls to its case-SENSITIVE name tier against the actor's items — the shipped, deprecated
    // compare — and that one MUST keep reporting. Without this case the assertion above would
    // pass even if the telemetry were disconnected entirely.
    const party = [makeActor('Idrin', { items: [new HeldItem('Ember Dust', { quantity: 3 })] })];

    const result = await read(party, [cost('component', 'Ember Dust', 1)]);

    assert.equal(result.readings[0].available, 3);
    assert.equal(nameOnly().length, 1, 'the item-side compare is a name-only match and says so');
  });
});

describe('readPooledHoldings — a cost names its coin the way it names its component', () => {
  /** 1 gp + 50 sp + 30 cp is 630 copper on the fixture ladder, and 6 whole gold pieces. */
  const party = () => [
    makeActor('Idrin', { currency: { gp: 1 } }),
    makeActor('Sera', { currency: { sp: 50 } }),
    makeActor('Bram', { currency: { cp: 30 } }),
  ];

  it('resolves a coin by its label, its abbreviation or a differently-cased id', async () => {
    // THE ASYMMETRY THIS CLOSES. A component cost's name folds case-insensitively against
    // definition names; a currency cost's name used to be passed through as an internal unit id
    // and matched exactly, so a caller authoring requirements the way a person writes them got
    // two axes that resolved and a third that answered `unitNotFound` forever.
    const names = ['gp', 'GP', 'Gold', 'gold', '  GOLD  '];

    for (const name of names) {
      const result = await read(party(), [cost('currency', name, 6)]);
      assert.deepEqual(
        summarize(result),
        [[COMPANION_OUTCOMES.read, 6, true]],
        `"${name}" must name the same coin as every other spelling of it`
      );
      // The CANONICAL id is echoed back whatever the caller typed, because the caller is liable
      // to consume by it afterwards and the consume takes ids.
      assert.equal(result.readings[0].unitId, 'gp', `"${name}" resolves to the ladder's own id`);
      assert.equal(result.readings[0].ambiguous, false);
    }
  });

  it('answers all three axes from human-written names in ONE request', async () => {
    const holder = makeActor('Idrin', {
      currency: { gp: 4 },
      items: [
        new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 2 }),
        new HeldItem("Smith's Hammer"),
      ],
    });

    const result = await read([holder], [
      cost('component', 'iron ingot', 2),
      cost('tool', "smith's hammer"),
      cost('currency', 'Gold', 4),
    ]);

    assert.deepEqual(summarize(result), [
      [COMPANION_OUTCOMES.read, 2, true],
      [COMPANION_OUTCOMES.read, null, true],
      [COMPANION_OUTCOMES.read, 4, true],
    ]);
    assert.equal(result.readings[2].unitId, 'gp');
  });

  it('keeps unitNotFound for a name no coin on the ladder answers to', async () => {
    const result = await read(party(), [cost('currency', 'zorkmid', 1)]);

    assert.deepEqual(summarize(result), [[COMPANION_OUTCOMES.unitNotFound, null, null]]);
    assert.equal(result.readings[0].ambiguous, false, 'nothing matched, so nothing collided');
    assert.equal(result.readings[0].unitId, 'zorkmid', 'and the caller’s own string comes back');
  });

  it('reports a coin name two coins answer to as ambiguous, and still reads the first', async () => {
    // `Crown` is one coin's LABEL and another's ABBREVIATION. The two are alternatives for the
    // same slot in the display chain, so a caller holding a string Fabricate printed cannot know
    // which field it came from — ranking them would settle a real collision by a coin flip that
    // looks authoritative. The reading's own `ambiguous` field is where that goes, exactly as it
    // does for a component name matching in two crafting systems.
    const colliding = [
      {
        id: 'u1',
        label: 'Crown',
        abbreviation: 'cr',
        actorPath: 'system.currency.gp',
        contains: [{ unitId: 'u2', amount: 10 }],
      },
      {
        id: 'u2',
        label: 'Shilling',
        abbreviation: 'crown',
        actorPath: 'system.currency.sp',
        contains: [],
      },
    ];
    const holder = makeActor('Idrin', { currency: { gp: 3 } });

    const result = await read([holder], [cost('currency', 'Crown', 3)], {
      getCurrencyConfig: () => ({
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: {},
        units: colliding,
      }),
    });

    const [reading] = result.readings;
    assert.equal(reading.ambiguous, true, 'the caller is told the name was not decisive');
    assert.equal(reading.outcome, COMPANION_OUTCOMES.read, 'and it is still answered, not refused');
    assert.equal(reading.unitId, 'u1', 'the first coin in LADDER order');
    assert.equal(reading.available, 3, '30 base units, read back in the coin that was named');
    assert.equal(reading.sufficient, true);
  });

  it('lets an exact unit id win outright, so a rename elsewhere cannot redirect it', async () => {
    // The precedence claim as BEHAVIOUR: `gold` is one coin's id and another's label. A caller
    // that has always asked for `gold` keeps getting the coin it asked for, and the GM who typed
    // that label onto a second coin has not silently changed what an existing request means.
    const words = [
      {
        id: 'gold',
        label: 'Royal',
        abbreviation: 'ry',
        actorPath: 'system.currency.gp',
        contains: [{ unitId: 'bit', amount: 10 }],
      },
      {
        id: 'bit',
        label: 'gold',
        abbreviation: 'bt',
        actorPath: 'system.currency.sp',
        contains: [],
      },
    ];
    const seams = {
      getCurrencyConfig: () => ({
        spendStrategy: 'actorProperty',
        providerId: '',
        macros: {},
        units: words,
      }),
    };
    const holder = () => makeActor('Idrin', { currency: { gp: 2 } });

    const exact = (await read([holder()], [cost('currency', 'gold', 1)], seams)).readings[0];
    assert.equal(exact.unitId, 'gold');
    assert.equal(exact.ambiguous, false);
    assert.equal(exact.available, 2, 'two of the coin whose ID is `gold`, not twenty of the other');

    // One case off, the exact tier misses and the folded tier sees BOTH — which is the honest
    // answer rather than a silent pick.
    const folded = (await read([holder()], [cost('currency', 'GOLD', 1)], seams)).readings[0];
    assert.equal(folded.ambiguous, true);
  });
});

describe('readPooledHoldings — a cost may name a definition by the id the read hands back', () => {
  // THE ROUND TRIP IS THE POINT. Every reading echoes the `componentId` it resolved, and the
  // consume takes ids ONLY. A read that published an id and then refused to accept it would be
  // answering a different question on the way back in: a companion caching a reading and later
  // refreshing it would have to go back to the authored name it had already replaced.
  //
  // The tier order is the coin axis's, and so is its reasoning — exact id outright, then the
  // folded name tier.

  it('resolves a component cost by its definition id', async () => {
    const party = [
      makeActor('Idrin', { items: [new HeldItem('Iron Ingot', { uuid: IRON_SOURCE, quantity: 4 })] }),
    ];

    const result = await read(party, [cost('component', 'iron', 1)]);

    assert.equal(result.readings[0].available, 4, 'the id resolved to the same definition');
    assert.equal(result.readings[0].componentId, 'iron');
    assert.equal(result.readings[0].systemId, SMITHING);
    assert.equal(result.readings[0].ambiguous, false);
  });

  it('resolves a tool cost by its definition id', async () => {
    const party = [makeActor('Idrin', { items: [new HeldItem("Smith's Hammer")] })];

    const result = await read(party, [cost('tool', 'hammer', 1)]);

    assert.equal(result.readings[0].state, 'present');
    assert.equal(result.readings[0].sufficient, true);
  });

  it('lets an id win outright over a name that collides with it', async () => {
    // A world where one component's ID is another component's NAME. The id tier answers and the
    // name tier is never consulted, so a rename cannot silently redirect a caller holding an id —
    // the same durable-handle-beats-display-text rule the coin axis states.
    const systems = [
      {
        id: SMITHING,
        components: [
          { id: 'ashes', name: 'Grave Ashes', registeredItemUuid: IRON_SOURCE },
          { id: 'grave', name: 'ashes' },
        ],
        tools: [],
      },
    ];
    const party = [
      makeActor('Idrin', { items: [new HeldItem('Grave Ashes', { uuid: IRON_SOURCE, quantity: 7 })] }),
    ];

    const result = await read(party, [cost('component', 'ashes', 1)], {}, systems);

    assert.equal(result.readings[0].componentId, 'ashes', 'the id decided it, not the name');
    assert.equal(result.readings[0].available, 7);
    assert.equal(result.readings[0].ambiguous, false, 'one id match is not an ambiguity');
  });

  it('still reports an ambiguous NAME when no id answers', async () => {
    // The fall-through is unchanged: `Ember Dust` exists in both fixture systems and neither is
    // named by an id, so the name tier runs and the collision is reported rather than settled.
    const party = [makeActor('Idrin', { items: [new HeldItem('Ember Dust', { quantity: 2 })] })];

    const result = await read(party, [cost('component', 'Ember Dust', 1)]);

    assert.equal(result.readings[0].ambiguous, true);
  });
});
