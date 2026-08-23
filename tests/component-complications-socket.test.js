/**
 * Issue 1286 — the GM-authoritative complication delivery channel.
 *
 * Two properties matter here, and the first is not confidentiality: the `craftingSystems`
 * world setting replicates unfiltered, so a determined player can already READ a `gmOnly`
 * complication. What this channel guarantees is
 *
 *   - EXECUTION authority: the macro and the GM-only card happen on a GM client, from the
 *     complication the GM's own world setting holds, never from anything on the wire, and
 *   - AUTHORIZATION: what runs is bounded to complications the SERVER-ATTESTED sender's
 *     own actor was eligible for, re-checked GM-side against that sender.
 *
 * The routing decisions are unit-tested against the module; the authorization itself lives
 * in `main.js`'s apply body, where a Foundry `Actor` is reachable, so it is pinned by the
 * composition guard at the bottom of this file rather than left asserted by nothing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');

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

/**
 * The body of a top-level function in `src/main.js`, from its signature to the first
 * column-zero `}`. Slicing rather than searching the whole file is what makes the
 * ordering and absence assertions below mean anything: `main.js` mentions
 * `isGatheringActorSelectableByUser` legitimately elsewhere, on paths where the ambient
 * user IS the subject.
 *
 * @param {string} name
 * @returns {string}
 */
function mainFunctionBody(name) {
  const start = mainSource.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `src/main.js should declare ${name}`);
  const end = mainSource.indexOf('\n}\n', start);
  assert.ok(end > start, `${name} should be a top-level function`);
  return mainSource.slice(start, end);
}

/**
 * Source with its comments removed, so an absence assertion reads the CODE. The apply
 * body names the inert predicates in prose precisely to explain why it does not use
 * them, and a naive text search cannot tell that apart from using one.
 *
 * @param {string} source
 * @returns {string}
 */
function withoutComments(source) {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * Every function the GM-side apply path is composed from IN `main.js`, comments stripped.
 *
 * The pure half — the authored re-read, the `script` discriminant, the macro scope and the
 * isolation loop — moved to `complicationSocket.js` and is driven with real inputs below,
 * because a source-text pin cannot tell an exact id match apart from one with a positional
 * fallback. What is left here is genuinely a Foundry edge and can only be pinned as text.
 */
function complicationApplySource() {
  return withoutComments([
    'applyComplicationDelivery',
    'complicationComponentsFor',
    'resolveComplicationSpeaker',
    'runComplicationDelivery',
    'runComplicationMacro',
    'postGmComplicationCard',
  ]
    .map((name) => mainFunctionBody(name))
    .join('\n'));
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

// --- Composition guard -------------------------------------------------------------
//
// The routing above is pure and unit-testable; the actor re-authorization is not, because
// it needs a Foundry `Actor`. It lives in `main.js`'s apply body, so these assertions pin
// it as source text — without them the security acceptance criteria are asserted by
// nothing at all.

test('the complication route is registered on the shared channel in its own guard', () => {
  assert.ok(
    mainSource.includes('routeComplicationDeliveryMessage(payload, {'),
    'the complication action should be routed from the single module.fabricate handler'
  );
  assert.ok(
    mainSource.includes('allowSender: complicationDeliveryRateLimiter'),
    'the inbound route should be rate limited per sender'
  );
  assert.ok(
    mainSource.includes('isFreshDelivery: complicationDeliveryDedupe'),
    'the inbound route should de-duplicate within this context'
  );
  assert.ok(
    mainSource.includes('const complicationDeliveryRateLimiter = createComplicationRateLimiter()'),
    'the limiter must be held at module scope: a per-message limiter refuses nothing'
  );

  const route = mainSource.indexOf('routeComplicationDeliveryMessage(payload, {');
  const guard = mainSource.lastIndexOf('try {', route);
  const rescue = mainSource.indexOf('} catch (_error) {', route);
  assert.ok(guard !== -1 && guard < route, 'the route should sit inside its own try block');
  assert.ok(rescue > route, 'a throw on one payload must not starve the others on this channel');
  assert.equal(
    mainSource.slice(guard, route).includes('routeGathering'),
    false,
    'the complication route needs its OWN try/catch, not a share of another route'
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

test('the elected GM re-reads the authored complication from its own world setting', () => {
  const apply = complicationApplySource();
  assert.ok(
    mainFunctionBody('applyComplicationDelivery').includes(
      'components: complicationComponentsFor(craftingSystemId)'
    ),
    'every addressed complication is resolved against THIS client corpus before anything runs'
  );
  assert.ok(
    mainFunctionBody('complicationComponentsFor').includes(
      'fabricate.craftingSystemManager?.getComponentsForSystem?.(craftingSystemId)'
    ),
    'the macro, the name and the visibility come from this client own copy of craftingSystems'
  );
  assert.ok(
    mainFunctionBody('runComplicationMacro').includes('isRunnableComplicationMacro(macro)'),
    'the script gate is a call-site check, and the call site is where the macro runs'
  );
  for (const forged of [
    'payload.macroUuid',
    'entry.macroUuid',
    'entry.visibility',
    'entry.severity',
    'entry.speaker',
  ]) {
    assert.equal(
      apply.includes(forged),
      false,
      `the apply path must not read ${forged}: a payload carries no executable authority`
    );
  }
});

test('1286: a gmOnly complication produces a GM-only card, or it produces nothing at all', () => {
  const apply = mainFunctionBody('applyComplicationDelivery');
  assert.ok(
    apply.includes('await postGmComplicationCard({'),
    'gmOnly is the AUTHORED DEFAULT, so a delivery that ran only macros is a silent no-op ' +
      'for the common case and for every macro-less complication'
  );

  const card = withoutComments(mainFunctionBody('postGmComplicationCard'));
  assert.ok(
    card.includes('gmComplications('),
    'the card is projected through the GM-facing projection, not a hand-rolled one'
  );
  assert.ok(
    card.includes("applyBulkChatVisibility(chatData, 'gmroll')"),
    'the legacy rollMode CREATE option is roll-gated and this card carries no rolls, so ' +
      'create alone would post a GM-only card PUBLICLY'
  );
  assert.equal(
    /core.,\s*.rollMode./.test(card),
    false,
    'core.rollMode is scope: client, so on the GM client the fallback is the GM own selector'
  );
  assert.ok(
    card.indexOf('speaker') < card.indexOf('applyBulkChatVisibility'),
    'applyMode ic branch reads speaker.actor unguarded, so the speaker must be built first'
  );
  assert.ok(
    card.indexOf('applyBulkChatVisibility') < card.indexOf('ChatMessage.create'),
    'an unmapped token must throw BEFORE the message exists: a GM-only card that cannot be ' +
      'made GM-only must not be posted at all'
  );
  const guard = card.indexOf('try {');
  assert.ok(
    guard !== -1 && guard < card.indexOf('ChatMessage.create'),
    'the whole body is contained: the acting client has already returned and the award is committed'
  );

  // recipes-and-steps/spec.md § "The `script` gate is a call-site check" requires a uuid that
  // does not resolve to a script macro to be "skipped and REPORTED on the GM-facing output".
  // A console.warn on the one client that can fix the link is not a report, so the status has
  // to survive the runner AND reach the card.
  assert.ok(
    mainFunctionBody('runComplicationMacro').includes("return { status: 'skipped', macroUuid }"),
    'the broken link is reported as skipped rather than as "no macro authored"'
  );
  assert.ok(
    card.includes('report?.macro'),
    'and that report is carried onto the card row rather than dropped after the console line'
  );
});

test('a GM-side apply refuses a sender who owns nothing, whatever the running user owns', () => {
  const body = mainFunctionBody('applyComplicationDelivery');

  assert.ok(
    body.includes("const senderUser = game.users?.get?.(senderId) ?? null;"),
    'the subject of the permission test is the server-attested sender'
  );
  assert.ok(
    body.includes("if (actor.testUserPermission(senderUser, 'OWNER') !== true) {"),
    'the actor is re-authorized against the attested sender directly'
  );

  // `actor.isOwner` resolves against the AMBIENT `game.user` and is therefore true for
  // every actor on the GM client that evaluates it, so an `isOwner`-first predicate
  // passes for a sender who owns nothing. That defect is live in the blind-gather relay
  // (issue 1288) and must not be copied here.
  for (const inert of ['isGatheringActorSelectableByUser', '.isOwner', 'game.user?.isGM']) {
    assert.equal(
      complicationApplySource().includes(inert),
      false,
      `${inert} is inert on a GM-side apply path and must not authorize this delivery`
    );
  }

  const code = withoutComments(body);
  assert.ok(
    code.indexOf('testUserPermission') < code.indexOf('applyAuthoredComplications'),
    'the refusal must precede execution, or an unauthorized sender still runs a macro'
  );
  assert.ok(
    code.indexOf('testUserPermission') < code.indexOf('postGmComplicationCard'),
    'and it must precede the GM card, or an unauthorized sender still authors GM chat'
  );
});

test('the delivery writer is composed with the Foundry edges and a non-Math.random mint', () => {
  assert.ok(
    mainSource.includes('this.complicationDeliveryWriter = createComplicationDeliveryWriter({'),
    'the acting-client writer should be composed during bootstrap'
  );
  assert.ok(
    mainSource.includes(
      'mintResolutionId: () => globalThis.foundry?.utils?.randomID?.()'
    ),
    'the resolution id is minted with foundry.utils.randomID, never Math.random (S2245)'
  );
  assert.equal(
    /Math\.random\(\)/.test(mainFunctionBody('applyComplicationDelivery')),
    false,
    'no insecure randomness on the complication path'
  );
});

test('1286: the delivery writer is INJECTED into both engines that fire complications', () => {
  // Each engine also falls back to `game.fabricate.complicationDeliveryWriter`, so delivery
  // works either way — but a seam only the ambient fallback ever satisfies is not a seam: it
  // cannot be substituted by a suite that builds its own engine, and the wiring is invisible
  // at the bootstrap site. Both engines are asserted, because only one of them is obvious.
  assert.ok(
    mainSource.includes(
      'this.craftingEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter })'
    ),
    'the crafting engine (immediate craft, timed craft FINISH and salvage) takes the writer'
  );
  assert.ok(
    mainSource.includes(
      'gatheringEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter })'
    ),
    'and so does the gathering engine'
  );
});

test('1286: bulk salvage relays through the writer rather than emitting per row', () => {
  assert.ok(
    mainSource.includes(
      'deliverComplications: (message) => this.complicationDeliveryWriter?.deliver(message)'
    ),
    'the batched relay seam is wired, or BulkSalvageService silently relays nothing'
  );
});
