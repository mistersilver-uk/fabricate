/**
 * Issue 1286 — the GM-authoritative complication delivery channel. Two properties matter here, and
 * the first is not confidentiality: the `craftingSystems` world setting replicates unfiltered, so a
 * determined player can already READ a `gmOnly` complication.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPLICATION_DELIVER,
  COMPLICATION_DELIVERY_MAX_ENTRIES,
  COMPLICATION_RATE_LIMIT,
  applyAuthoredComplications,
  buildComplicationMacroContext,
  complicationDeliveryKey,
  createComplicationDeliveryDedupe,
  createComplicationDeliveryWriter,
  createComplicationRateLimiter,
  findAuthoredComplication,
  isRunnableComplicationMacro,
  routeComplicationDeliveryMessage,
  validateComplicationDeliveryPayload,
} from '../src/systems/complicationSocket.js';
import { Fabricate } from '../src/bootstrap/Fabricate.js';
import { applyComplicationDelivery } from '../src/bootstrap/socketRouter.js';
import { defineStructureContract } from './helpers/structureContract.js';

function entry(overrides = {}) {
  return {
    componentId: 'component-1',
    complicationId: 'complication-1',
    resultId: 'result-1',
    activity: 'salvage',
    bucket: 'stageMissed',
    ...overrides,
  };
}

function message(overrides = {}) {
  return {
    action: COMPLICATION_DELIVER,
    craftingSystemId: 'system-1',
    actorUuid: 'Actor.a',
    resolutionId: 'resolution-1',
    complications: [entry()],
    ...overrides,
  };
}

/** One authored component, as the elected GM's own `craftingSystems` record holds it. */
function authoredComponent(overrides = {}) {
  return {
    id: 'component-1',
    name: 'Iron Ingot',
    complications: [
      { id: 'complication-1', name: 'Shrapnel', severity: 'major', visibility: 'gmOnly' },
      { id: 'complication-2', name: 'Slag', severity: 'minor', visibility: 'visible' },
    ],
    ...overrides,
  };
}

test('a delivery payload names the addressing and nothing executable', () => {
  assert.equal(validateComplicationDeliveryPayload(null), null);
  assert.equal(validateComplicationDeliveryPayload({ action: 'somethingElse' }), null);
  assert.equal(validateComplicationDeliveryPayload(message({ craftingSystemId: '  ' })), null);
  assert.equal(validateComplicationDeliveryPayload(message({ actorUuid: '' })), null);
  assert.equal(
    validateComplicationDeliveryPayload(message({ resolutionId: '' })),
    null,
    'the resolution id is what makes the de-duplication key unique, so it is required'
  );
  assert.equal(validateComplicationDeliveryPayload(message({ complications: [] })), null);
  assert.equal(validateComplicationDeliveryPayload(message({ complications: entry() })), null);

  const normalized = validateComplicationDeliveryPayload(
    message({
      craftingSystemId: ' system-1 ',
      complications: [
        {
          ...entry(),
          effectRollTotal: 4,
          // Everything a forged payload would want to carry, and none of it addressing.
          macroUuid: 'Macro.evil',
          visibility: 'visible',
          name: 'Forged name',
          description: '<img src=x onerror=alert(1)>',
          severity: 'severe',
          speaker: { alias: 'The GM' },
          content: '<p>anything</p>',
        },
      ],
    })
  );

  assert.deepEqual(normalized, {
    action: COMPLICATION_DELIVER,
    craftingSystemId: 'system-1',
    actorUuid: 'Actor.a',
    resolutionId: 'resolution-1',
    complications: [
      {
        componentId: 'component-1',
        complicationId: 'complication-1',
        resultId: 'result-1',
        activity: 'salvage',
        bucket: 'stageMissed',
        effectRollTotal: 4,
      },
    ],
  });
  for (const forged of [
    'macroUuid',
    'visibility',
    'name',
    'description',
    'severity',
    'speaker',
    'content',
  ]) {
    assert.ok(
      !(forged in normalized.complications[0]),
      `the normalized entry must not carry ${forged}: the GM re-reads it from its own world setting`
    );
  }
});

test('an entry addressing nothing is dropped without costing the legitimate entries', () => {
  const normalized = validateComplicationDeliveryPayload(
    message({
      complications: [
        entry({ componentId: '' }),
        entry({ complicationId: '  ' }),
        entry({ resultId: null }),
        entry({ activity: 'downtime' }),
        entry({ activity: '' }),
        'not-an-object',
        null,
        entry({ resultId: 'result-2', effectRollTotal: NaN }),
      ],
    })
  );

  assert.equal(normalized.complications.length, 1, 'only the well-formed entry survives');
  assert.equal(normalized.complications[0].resultId, 'result-2');
  assert.equal(
    normalized.complications[0].effectRollTotal,
    null,
    'a non-finite claimed total is reported as absent rather than as a number'
  );
});

test('a hostile payload cannot address an unbounded number of complications', () => {
  const complications = Array.from({ length: COMPLICATION_DELIVERY_MAX_ENTRIES + 25 }, (_, index) =>
    entry({ resultId: `result-${index}` })
  );
  const normalized = validateComplicationDeliveryPayload(message({ complications }));
  assert.equal(normalized.complications.length, COMPLICATION_DELIVERY_MAX_ENTRIES);
});

test('the writer applies locally on the elected GM and emits everywhere else', () => {
  const emitted = [];
  const applied = [];
  const gm = createComplicationDeliveryWriter({
    isActiveGM: () => true,
    emitComplications: (payload) => emitted.push(payload),
    applyComplications: (payload) => applied.push(payload),
  });

  assert.equal(
    gm.deliver({
      craftingSystemId: 'system-1',
      actorUuid: 'Actor.a',
      resolutionId: 'resolution-1',
      complications: [entry()],
    }),
    true
  );
  assert.equal(applied.length, 1, 'a broadcast excludes the emitter, so the GM applies locally');
  assert.equal(emitted.length, 0);

  const player = createComplicationDeliveryWriter({
    isActiveGM: () => false,
    emitComplications: (payload) => emitted.push(payload),
    applyComplications: (payload) => applied.push(payload),
  });
  assert.equal(
    player.deliver({
      craftingSystemId: 'system-1',
      actorUuid: 'Actor.a',
      resolutionId: 'resolution-1',
      complications: [entry()],
    }),
    true
  );
  assert.equal(emitted.length, 1);
  assert.equal(applied.length, 1, 'the player client applies nothing itself');
});

test('with no GM connected the delivery is dropped and reported, never emitted into the void', () => {
  const emitted = [];
  const unroutable = [];
  const writer = createComplicationDeliveryWriter({
    isActiveGM: () => false,
    hasActiveGM: () => false,
    onUnroutable: (payload) => unroutable.push(payload),
    emitComplications: (payload) => emitted.push(payload),
    applyComplications: () => {},
  });

  assert.equal(
    writer.deliver({
      craftingSystemId: 'system-1',
      actorUuid: 'Actor.a',
      resolutionId: 'resolution-1',
      complications: [entry()],
    }),
    false,
    'the award and the player card already committed; only the GM-side effects are lost'
  );
  assert.deepEqual(emitted, []);
  assert.equal(unroutable.length, 1);
  assert.equal(unroutable[0].resolutionId, 'resolution-1');
});

test('the resolution id is minted through an injected edge, never inside this module', () => {
  const emitted = [];
  const writer = createComplicationDeliveryWriter({
    isActiveGM: () => false,
    mintResolutionId: () => 'minted-1',
    emitComplications: (payload) => emitted.push(payload),
    applyComplications: () => {},
  });

  assert.equal(
    writer.deliver({
      craftingSystemId: 'system-1',
      actorUuid: 'Actor.a',
      complications: [entry()],
    }),
    true
  );
  assert.equal(emitted[0].resolutionId, 'minted-1');

  const unmintable = createComplicationDeliveryWriter({
    isActiveGM: () => false,
    emitComplications: () => assert.fail('an unidentified resolution must not be emitted'),
    applyComplications: () => {},
  });
  assert.equal(
    unmintable.deliver({
      craftingSystemId: 'system-1',
      actorUuid: 'Actor.a',
      complications: [entry()],
    }),
    false,
    'with no id and no mint the delivery fails closed rather than shipping an unkeyable message'
  );
});

test('an inbound delivery is applied only by the elected GM, only for an attested sender', () => {
  const applied = [];
  const applyComplications = (args) => applied.push(args);

  assert.equal(
    routeComplicationDeliveryMessage(message(), {
      isActiveGM: () => false,
      senderId: 'user-1',
      applyComplications,
    }),
    false,
    'a non-elected client applies nothing, even though every client receives the broadcast'
  );
  assert.equal(
    routeComplicationDeliveryMessage(message(), {
      isActiveGM: () => true,
      senderId: '',
      applyComplications,
    }),
    false,
    'a blank sender is refused fail-closed'
  );
  assert.equal(
    routeComplicationDeliveryMessage(message(), {
      isActiveGM: () => true,
      applyComplications,
    }),
    false,
    'an absent sender is refused fail-closed'
  );
  assert.deepEqual(applied, [], 'nothing reached the applier');

  assert.equal(
    routeComplicationDeliveryMessage(message({ senderId: 'forged-user' }), {
      isActiveGM: () => true,
      senderId: 'user-1',
      applyComplications,
    }),
    true
  );
  assert.equal(
    applied[0].senderId,
    'user-1',
    'the attested sender is what the applier re-authorizes against, never a payload field'
  );
});

test('a flood from one sender is throttled, and a refused message costs no budget', () => {
  const applied = [];
  const allowSender = createComplicationRateLimiter({ now: () => 0 });
  const route = (senderId, payload = message()) =>
    routeComplicationDeliveryMessage(payload, {
      isActiveGM: () => true,
      senderId,
      allowSender,
      applyComplications: (args) => applied.push(args),
    });

  // Malformed and unauthenticated messages are refused BEFORE the limiter is consulted,
  // so they may not eat into the sender's allowance.
  for (let index = 0; index < 50; index += 1) {
    assert.equal(route('user-1', { action: 'somethingElse' }), false);
    assert.equal(route('', message()), false);
  }

  for (let index = 0; index < COMPLICATION_RATE_LIMIT; index += 1) {
    assert.equal(
      route('user-1', message({ resolutionId: `resolution-${index}` })),
      true,
      `delivery ${index} should be allowed`
    );
  }
  assert.equal(route('user-1', message({ resolutionId: 'resolution-over' })), false);
  assert.equal(
    route('user-2', message({ resolutionId: 'resolution-other' })),
    true,
    'the budget is per sender'
  );
  assert.equal(applied.length, COMPLICATION_RATE_LIMIT + 1);
});

test('1286: the budget admits the FANNED-OUT worst case a legitimate player can produce', () => {
  // The limiter is sized from the bulk SELECTION CAP, not from "one message per run". This is
  // asserted as BEHAVIOUR rather than as `COMPLICATION_RATE_LIMIT === 100`, which would only
  // restate the constant.
  const BULK_SELECTION_CAP = 25; // BulkSalvageService's BULK_MAX_ITEMS, stated not imported:
  // this module is the pure half of a socket channel and must not depend on a crafting
  // service to describe its own budget.
  const FANNED_OUT_RUNS = 3;
  const COLLAPSED_CHAIN_STEPS = 5;
  const ONE_AT_A_TIME = 10;

  const allowSender = createComplicationRateLimiter({ now: () => 0 });
  const refused = [];
  let sequence = 0;
  const route = (overrides) => {
    sequence += 1;
    const ok = routeComplicationDeliveryMessage(
      message({ resolutionId: `resolution-${sequence}`, ...overrides }),
      {
        isActiveGM: () => true,
        senderId: 'user-1',
        allowSender,
        applyComplications: () => {},
      }
    );
    if (!ok) refused.push(sequence);
    return ok;
  };

  for (let run = 0; run < FANNED_OUT_RUNS; run += 1) {
    for (let pair = 0; pair < BULK_SELECTION_CAP; pair += 1) {
      route({ craftingSystemId: `system-${pair}`, actorUuid: `Actor.a${pair}` });
    }
  }
  for (let step = 0; step < COLLAPSED_CHAIN_STEPS; step += 1) route({});
  for (let resolution = 0; resolution < ONE_AT_A_TIME; resolution += 1) route({});

  assert.deepEqual(
    refused,
    [],
    `the legitimate worst case is ${FANNED_OUT_RUNS} fanned-out bulk runs of ` +
      `${BULK_SELECTION_CAP} pairs plus a ${COLLAPSED_CHAIN_STEPS}-step chain and ` +
      `${ONE_AT_A_TIME} single resolutions, and none of it may be refused`
  );
  assert.equal(sequence, 90, 'and that worst case is what was actually driven');
});

test('1286: the budget is still FINITE, so a scripted flood is still useless', () => {
  const allowSender = createComplicationRateLimiter({ now: () => 0 });
  const route = (index) =>
    routeComplicationDeliveryMessage(message({ resolutionId: `flood-${index}` }), {
      isActiveGM: () => true,
      senderId: 'user-1',
      allowSender,
      applyComplications: () => {},
    });

  for (let index = 0; index < COMPLICATION_RATE_LIMIT; index += 1) {
    assert.equal(route(index), true, `delivery ${index} is inside the budget`);
  }
  assert.equal(route(COMPLICATION_RATE_LIMIT), false, 'and the next one is not');
});

test('a batched bulk salvage costs one unit of budget, not one per row', () => {
  const applied = [];
  const allowSender = createComplicationRateLimiter({ now: () => 0, limit: 2 });
  const bulk = message({
    complications: Array.from({ length: 25 }, (_, index) => entry({ resultId: `result-${index}` })),
  });

  assert.equal(
    routeComplicationDeliveryMessage(bulk, {
      isActiveGM: () => true,
      senderId: 'user-1',
      allowSender,
      applyComplications: (args) => applied.push(args),
    }),
    true
  );
  assert.equal(applied[0].complications.length, 25, 'every row still reaches the applier');
  assert.equal(
    routeComplicationDeliveryMessage(message({ resolutionId: 'resolution-2' }), {
      isActiveGM: () => true,
      senderId: 'user-1',
      allowSender,
      applyComplications: (args) => applied.push(args),
    }),
    true,
    'the 25-row message consumed one unit, so the next resolution is still deliverable'
  );
});

test('one context applies the same complication once, per stage occurrence', () => {
  const applied = [];
  const isFreshDelivery = createComplicationDeliveryDedupe();
  const route = (payload) =>
    routeComplicationDeliveryMessage(payload, {
      isActiveGM: () => true,
      senderId: 'user-1',
      isFreshDelivery,
      applyComplications: (args) => applied.push(args),
    });

  assert.equal(route(message()), true);
  assert.equal(route(message()), false, 'the repeat delivery applies nothing');
  assert.equal(applied.length, 1);

  assert.equal(
    route(message({ complications: [entry({ resultId: 'result-2' })] })),
    true,
    'a component may appear several times in one resolution: each occurrence fires once'
  );
  assert.equal(
    route(message({ resolutionId: 'resolution-2' })),
    true,
    'the same component and complication in a LATER resolution is a new delivery'
  );

  const partiallySeen = route(
    message({ complications: [entry(), entry({ resultId: 'result-3' })] })
  );
  assert.equal(partiallySeen, true);
  assert.deepEqual(
    applied.at(-1).complications.map((item) => item.resultId),
    ['result-3'],
    'a re-delivered message keeps its unseen occurrences and drops the seen one'
  );
});

test('the de-duplication set is bounded and evicts oldest-first', () => {
  const isFreshDelivery = createComplicationDeliveryDedupe({ limit: 2 });
  assert.equal(isFreshDelivery('a'), true);
  assert.equal(isFreshDelivery('b'), true);
  assert.equal(isFreshDelivery('a'), false);
  assert.equal(isFreshDelivery('c'), true);
  assert.equal(isFreshDelivery('a'), true, 'the oldest key was evicted to keep the set bounded');
  assert.equal(isFreshDelivery(''), false, 'an unkeyable delivery is never treated as fresh');
});

test('the de-duplication key is the resolution, the stage occurrence and the complication', () => {
  assert.equal(
    complicationDeliveryKey({
      resolutionId: 'resolution-1',
      resultId: 'result-1',
      complicationId: 'complication-1',
    }),
    'resolution-1|result-1|complication-1'
  );
  assert.notEqual(
    complicationDeliveryKey({ resolutionId: 'r1', resultId: 'a', complicationId: 'b' }),
    complicationDeliveryKey({ resolutionId: 'r1', resultId: 'b', complicationId: 'a' })
  );
});

test('1286: an addressed complication that does not exist is DROPPED, never defaulted', () => {
  const components = [authoredComponent()];

  assert.deepEqual(
    findAuthoredComplication(components, {
      componentId: 'component-1',
      complicationId: 'complication-2',
    }),
    { component: components[0], complication: components[0].complications[1] },
    'an exact id match resolves to that component and that complication'
  );

  assert.equal(
    findAuthoredComplication(components, {
      componentId: 'component-1',
      complicationId: 'complication-404',
    }),
    null,
    'a complication id that resolves to nothing is dropped: a `?? authored[0]` tail would ' +
      'fire the GM first authored complication from an id the SENDER chose'
  );
  assert.equal(
    findAuthoredComplication(components, {
      componentId: 'component-404',
      complicationId: 'complication-1',
    }),
    null,
    'a component id that resolves to nothing is dropped, not defaulted to the first component'
  );
  assert.equal(
    findAuthoredComplication(components, { componentId: '  ', complicationId: 'complication-1' }),
    null
  );
  assert.equal(
    findAuthoredComplication(components, { componentId: 'component-1', complicationId: '' }),
    null
  );
  assert.equal(findAuthoredComplication(null, {}), null);
  assert.equal(
    findAuthoredComplication([{ id: 'component-1' }], {
      componentId: 'component-1',
      complicationId: 'complication-1',
    }),
    null,
    'a component authoring no complications resolves nothing at all'
  );
});

test('1286: the script gate is a COMPLETE discriminant over the macro type vocabulary', () => {
  assert.equal(isRunnableComplicationMacro({ type: 'script', command: 'return 1;' }), true);
  assert.equal(
    isRunnableComplicationMacro({ type: 'chat', command: '/roll 1d6' }),
    false,
    'command is a required string on a chat macro too, and the Macro type DEFAULTS to chat'
  );
  assert.equal(isRunnableComplicationMacro({ type: 'script' }), false);
  assert.equal(isRunnableComplicationMacro({ type: 'script', command: 42 }), false);
  assert.equal(isRunnableComplicationMacro(null), false);
});

test('1286: an unresolvable entry runs NOTHING and costs the resolution none of the others', async () => {
  const components = [authoredComponent()];
  const ran = [];
  const applied = await applyAuthoredComplications({
    components,
    complications: [
      entry({ complicationId: 'complication-404' }),
      entry({ componentId: 'component-404' }),
      entry({ complicationId: 'complication-2', resultId: 'result-2' }),
      entry({ complicationId: 'complication-1', resultId: 'result-3' }),
    ],
    execute: ({ complication, entry: addressed }) => {
      ran.push([complication.id, addressed.resultId]);
      return { ok: true };
    },
  });

  assert.deepEqual(
    ran,
    [
      ['complication-2', 'result-2'],
      ['complication-1', 'result-3'],
    ],
    'the two unresolvable entries execute nothing, and the resolvable ones keep their order'
  );
  assert.deepEqual(
    applied.map((row) => row.complication.id),
    ['complication-2', 'complication-1']
  );
  assert.deepEqual(applied[0].report, { ok: true });
});

test('1286: a macro that throws on the GM side is CONTAINED, not merely stepped over', async () => {
  const ran = [];
  const applied = await applyAuthoredComplications({
    components: [authoredComponent()],
    complications: [
      entry({ complicationId: 'complication-1' }),
      entry({ complicationId: 'complication-2', resultId: 'result-2' }),
    ],
    execute: async ({ complication }) => {
      ran.push(complication.id);
      if (complication.id === 'complication-1') throw new Error('the macro blew up');
      return { ok: true };
    },
  });

  assert.deepEqual(ran, ['complication-1', 'complication-2'], 'the next entry still runs');
  assert.equal(
    applied[0].report,
    null,
    'the failure is caught rather than escaping: without the await it would be an ' +
      'UNHANDLED REJECTION and this row would hold a pending promise instead of null'
  );
  assert.deepEqual(applied[1].report, { ok: true });
});

test('1286: entries apply SEQUENTIALLY — entry 2 does not start until entry 1 settles', async () => {
  // Property 3 of `applyAuthoredComplications`'s docblock, and the one an order assertion alone
  // cannot hold: both of the tests above push synchronously at the top of their executor, so their
  // `deepEqual` on the recorded order passes just as well under `Promise.all`.
  const events = [];
  let release = () => {};
  const held = new Promise((resolve) => {
    release = resolve;
  });

  const applying = applyAuthoredComplications({
    components: [authoredComponent()],
    complications: [
      entry({ complicationId: 'complication-1' }),
      entry({ complicationId: 'complication-2', resultId: 'result-2' }),
    ],
    execute: async ({ complication }) => {
      events.push(`start:${complication.id}`);
      if (complication.id === 'complication-1') await held;
      events.push(`end:${complication.id}`);
      return { ok: true };
    },
  });

  // Two full microtask drains. Under `Promise.all` entry 2's executor would have been
  // INVOKED already, because the loop would not be waiting on entry 1 at all.
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(
    events,
    ['start:complication-1'],
    'entry 2 must not have started while entry 1 is still in flight'
  );

  release();
  const applied = await applying;

  assert.deepEqual(events, [
    'start:complication-1',
    'end:complication-1',
    'start:complication-2',
    'end:complication-2',
  ]);
  assert.deepEqual(
    applied.map((row) => row.complication.id),
    ['complication-1', 'complication-2']
  );
});

test('1286: the macro scope is built from the AUTHORED record, never from the wire', () => {
  const component = authoredComponent();
  const context = buildComplicationMacroContext({
    craftingSystemId: 'system-1',
    component,
    complication: { ...component.complications[0], macroUuid: 'Macro.authored' },
    entry: {
      ...entry(),
      // Everything a forged payload would want to dictate. Validation already strips these;
      // this pins that the BUILDER would ignore them even if it did not.
      macroUuid: 'Macro.evil',
      visibility: 'visible',
      severity: 'minor',
      speaker: { alias: 'The GM' },
    },
    actor: { uuid: 'Actor.a' },
    token: null,
    speaker: { alias: 'Iron Golem' },
    senderUser: { id: 'user-1' },
    resolutionId: 'resolution-1',
  });

  assert.deepEqual(context.complication, {
    id: 'complication-1',
    name: 'Shrapnel',
    severity: 'major',
    visibility: 'gmOnly',
  });
  assert.equal(
    JSON.stringify(context).includes('Macro.evil'),
    false,
    'no macro uuid reaches a macro scope, least of all one from the payload'
  );
  assert.equal(
    JSON.stringify(context).includes('The GM'),
    false,
    'the speaker is resolved GM-side from the addressing, never read from the payload'
  );
  assert.equal(context.speaker.alias, 'Iron Golem');
  assert.equal(context.bucket, 'stageMissed', 'the client CLAIM is passed as reported');
});

// The elected-GM apply path, driven through `applyComplicationDelivery` itself (issue 1933). The
// route onto the shared channel, its budget and its de-duplication are read from a real boot's
// `socketRoutes` in `tests/fixtures/fabricateBootContract.golden.json`.

const SENDER = { id: 'user-player', name: 'Player' };

/** A script macro that records its run in the world's own log. */
const SCRIPT_MACRO = { type: 'script', command: "globalThis.__complicationLog.push(['macro'])" };

/**
 * An elected-GM client holding one authored `gmOnly` complication whose macro is `Macro.authored`,
 * the addressed actor, and recording `fromUuid`, `ChatMessage` and warning edges into one log.
 */
function gmApplyWorld({
  senderOwns = true,
  chatOutput = true,
  macro = SCRIPT_MACRO,
  permissionTestable = true,
} = {}) {
  const log = [];
  const actor = {
    id: 'actor-a',
    uuid: 'Actor.a',
    name: 'Iron Golem',
    // The ambient GM owns every actor, which is exactly why this must never authorize.
    isOwner: true,
  };
  if (permissionTestable) {
    actor.testUserPermission = (user, level) => {
      log.push(['permission', user?.id, level]);
      return senderOwns && user === SENDER && level === 'OWNER';
    };
  }
  globalThis.__complicationLog = log;
  globalThis.game = {
    user: { id: 'user-gm', name: 'GM', isGM: true },
    users: { get: (id) => (id === SENDER.id ? SENDER : null) },
    i18n: { localize: (key) => key },
  };
  globalThis.fromUuidSync = (uuid) => (uuid === actor.uuid ? actor : null);
  globalThis.fromUuid = async (uuid) => {
    log.push(['fromUuid', uuid]);
    return uuid === 'Macro.authored' ? macro : null;
  };
  globalThis.ChatMessage = {
    getSpeaker: ({ actor: speaking }) => ({ actor: speaking?.id, alias: speaking?.name }),
    applyRollMode: (chatData, mode) => log.push(['visibility', mode, chatData.speaker?.alias]),
    create: async (...args) => log.push(['create', args.length, args[0]]),
  };
  const authored = authoredComponent({
    complications: [
      {
        id: 'complication-1',
        name: 'Shrapnel',
        severity: 'major',
        visibility: 'gmOnly',
        macroUuid: 'Macro.authored',
      },
    ],
  });
  globalThis.fabricate = {
    craftingSystemManager: {
      getComponentsForSystem: (id) => (id === 'system-1' ? [authored] : []),
      getSystem: (id) => ({ id, features: { chatOutput } }),
    },
  };
  return { log, actor };
}

/** Deliver one message from the attested sender, capturing what the apply path warns. */
async function deliverAsSender(overrides = {}) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (text) => warnings.push(String(text));
  try {
    const applied = await applyComplicationDelivery({ ...message(overrides), senderId: SENDER.id });
    return { applied, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

const steps = (log) => log.map(([step]) => step);

test('the elected GM re-reads the authored complication from its own world setting', async () => {
  const { log } = gmApplyWorld();
  await deliverAsSender({
    macroUuid: 'Macro.forged',
    complications: [
      entry({
        macroUuid: 'Macro.forged',
        visibility: 'visible',
        severity: 'minor',
        speaker: { alias: 'Forged' },
      }),
    ],
  });

  assert.deepEqual(
    log.filter(([step]) => step === 'fromUuid'),
    [
      ['fromUuid', 'Macro.authored'],
      ['fromUuid', 'Macro.authored'],
    ],
    'the macro comes from THIS client copy of the record — resolved by the gate and the runner — never the wire'
  );
  const [, , card] = log.find(([step]) => step === 'create');
  assert.equal(card.speaker.alias, 'Iron Golem', 'the speaker is resolved GM-side');
  assert.ok(card.content.includes('Shrapnel'), 'the card names the AUTHORED complication');
});

test('1286: a gmOnly complication posts ONE GM-only card: speaker, then gmroll, then create', async () => {
  const { log } = gmApplyWorld();
  await deliverAsSender();

  assert.deepEqual(steps(log), [
    'permission',
    'fromUuid',
    'fromUuid',
    'macro',
    'visibility',
    'create',
  ]);
  const [, mode, speakerAlias] = log.find(([step]) => step === 'visibility');
  assert.equal(
    mode,
    'gmroll',
    'the legacy create option is roll-gated, so visibility is applied first'
  );
  assert.equal(speakerAlias, 'Iron Golem', 'the speaker is on chatData before visibility runs');
  const [, argumentCount, card] = log.find(([step]) => step === 'create');
  assert.equal(argumentCount, 1, 'visibility rides on the data, never as a create option');
  assert.equal(card.author, 'user-gm');
});

test('1286: chatOutput selects the card rows, and never gates the macro', async () => {
  const quiet = gmApplyWorld({ chatOutput: false });
  await deliverAsSender();
  assert.deepEqual(
    steps(quiet.log),
    ['permission', 'fromUuid', 'fromUuid', 'macro'],
    'the macro ran, no card'
  );

  for (const [status, macro] of [
    ['skipped', { type: 'chat', command: 'not a script' }],
    ['failed', { type: 'script', command: "throw new Error('authored bug')" }],
  ]) {
    const faulted = gmApplyWorld({ chatOutput: false, macro });
    const originalError = console.error;
    console.error = () => {};
    try {
      await deliverAsSender();
    } finally {
      console.error = originalError;
    }
    assert.equal(
      steps(faulted.log).at(-1),
      'create',
      `a ${status} macro is reported to the GM regardless`
    );
  }
});

test('a GM-side apply refuses a sender who owns nothing, whatever the running user owns', async () => {
  const { log } = gmApplyWorld({ senderOwns: false });
  const { applied, warnings } = await deliverAsSender();

  assert.equal(applied, null);
  assert.deepEqual(
    log,
    [['permission', SENDER.id, 'OWNER']],
    'asked of the attested sender, then nothing ran'
  );
  assert.ok(warnings.some((text) => text.includes('the sender does not own the addressed actor')));
});

test('1286: a delivery dropped because the actor is not permission-testable is REPORTED', async () => {
  const { log } = gmApplyWorld({ permissionTestable: false });
  const { applied, warnings } = await deliverAsSender();

  assert.equal(applied, null);
  assert.deepEqual(log, [], 'nothing runs against an actor whose permissions cannot be asked');
  assert.ok(warnings.some((text) => text.includes('permission-testable document')));
});

test('1286: bulk salvage relays through the writer it reads at call time', () => {
  const delivered = [];
  const facade = new Fabricate();
  const service = facade._getBulkSalvageService();
  facade.complicationDeliveryWriter = { deliver: (request) => delivered.push(request) };

  service.deliverComplications({ resolutionId: 'bulk' });

  assert.deepEqual(delivered, [{ resolutionId: 'bulk' }]);
});

// No insecure randomness anywhere on the socket edge; the writer's mint is a boot probe.
defineStructureContract(
  'the socket edge mints nothing with Math.random',
  'src/bootstrap/socketRouter.js',
  {
    readsNo: ['Math.random'],
  }
);
