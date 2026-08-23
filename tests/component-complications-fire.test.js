/**
 * `src/systems/complicationRuntime.js` and `evaluateSideRoll` — the EFFECTFUL half of
 * progressive component complications (issue 1286).
 *
 * Three things are pinned here that nothing else can pin:
 *
 *  1. **The condition gate FAILS CLOSED** on every uncertainty, and resolves its comparand
 *     through `resolveCheckFormulaDisplay` — which substitutes roll data WITHOUT rolling — so
 *     a `1d6` comparand does not quietly re-roll on every evaluation and mean something
 *     different each time the same gate is asked.
 *  2. **Nothing here can cost a resolution its award.** A complication is strictly downstream
 *     of a committed award, so a throwing condition roll, a malformed effect roll and a
 *     garbage plan all resolve rather than reject.
 *  3. **The GM request carries ADDRESSING ONLY.** A payload naming a macro uuid, an audience
 *     or chat content would let any authenticated player ask a GM client to execute arbitrary
 *     code at GM authority. The key set is asserted exactly, not by sampling.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSideRoll } from '../src/systems/checkRoll.js';
import {
  buildGmComplicationCardContent,
  fireComplications,
  gmComplications,
  rollGmComplicationEffect,
} from '../src/systems/complicationRuntime.js';
import { planComplications } from '../src/utils/complicationPlan.js';
import { authoredComplications } from '../src/utils/componentComplications.js';

let minted = 0;
const mintId = () => `fx${++minted}`;

/** One AUTHORED complication, normalized through the real shape. */
function complication(overrides = {}) {
  const { complications } = authoredComplications(
    [{ activities: { salvage: true }, ...overrides }],
    mintId
  );
  return complications[0];
}

/**
 * A one-stage salvage plan for the given complications. The five-bucket mapping is proved
 * against the real award loop in `component-complications-plan.test.js`; this suite only needs
 * a plan to fire.
 */
function planOf(authored, { bucket = 'full' } = {}) {
  const produced = { id: 'iron', name: 'Iron Ingot', complications: authored };
  return planComplications({
    activity: 'salvage',
    resolutionId: 'res-1',
    stages: [{ resultId: 'r1', componentId: 'iron', component: produced }],
    award: {
      awarded: bucket === 'full' ? [{ id: 'r1' }] : [],
      partialResult: null,
      haltedResult: bucket === 'halted' ? { id: 'r1' } : null,
      skippedResults: [],
    },
  });
}

const ACTOR = { uuid: 'Actor.hero', getRollData: () => ({ abilities: { str: { mod: 3 } } }) };

/**
 * A dice engine that records every formula it is asked to construct, so "the comparand was not
 * rolled" is an assertion about calls rather than about an outcome.
 */
function installRoll({ totals = {}, defaultTotal = 0, throwOn = [] } = {}) {
  const constructed = [];
  const messages = [];
  globalThis.Roll = class FakeRoll {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      this.dice = [];
      constructed.push(formula);
    }
    async evaluate() {
      if (throwOn.includes(this.formula)) throw new Error(`bad formula: ${this.formula}`);
      this.total = Object.hasOwn(totals, this.formula) ? totals[this.formula] : defaultTotal;
      return this;
    }
    async toMessage(messageData, options) {
      messages.push({ messageData, options });
      return {};
    }
    static replaceFormulaData(formula, data, { missing }) {
      return String(formula).replaceAll(/@([\w.]+)/g, (_, path) => {
        const value = path.split('.').reduce((carried, key) => carried?.[key], data);
        return value === undefined ? missing : String(value);
      });
    }
    static validate(formula) {
      return !/NaN/.test(String(formula));
    }
  };
  return { constructed, messages };
}

function uninstallRoll() {
  delete globalThis.Roll;
  delete globalThis.ChatMessage;
}

/** V14 is probed for by a `ChatMessage.applyMode` STATIC, which a subclass cannot fool. */
function installChatMessage({ v14 = false } = {}) {
  globalThis.ChatMessage = v14 ? { applyMode: () => {} } : { applyRollMode: () => {} };
}

// ── evaluateSideRoll: the option key and the vocabulary, chosen together ─────

test('1286: evaluateSideRoll posts a LEGACY token under the legacy key on V13', async (t) => {
  t.after(uninstallRoll);
  const { constructed, messages } = installRoll({ totals: { '2d6': 7 } });
  installChatMessage({ v14: false });

  const rolled = await evaluateSideRoll('2d6', ACTOR, { rollMode: 'gmroll', flavor: 'Shrapnel' });

  assert.deepEqual(constructed, ['2d6'], 'the expression is rolled VERBATIM: no shim, no append');
  assert.equal(rolled.total, 7);
  assert.equal(rolled.posted, true);
  assert.equal(messages[0].options.rollMode, 'gmroll');
  assert.ok(!('messageMode' in messages[0].options), 'a V14 key on V13 silently posts public');
  assert.equal(messages[0].options.create, true);
  assert.equal(messages[0].messageData.flavor, 'Shrapnel');
});

test('1286: evaluateSideRoll TRANSLATES the token when it switches to the V14 key', async (t) => {
  t.after(uninstallRoll);
  const { messages } = installRoll({ totals: { '2d6': 7 } });
  installChatMessage({ v14: true });

  await evaluateSideRoll('2d6', ACTOR, { rollMode: 'gmroll' });
  await evaluateSideRoll('2d6', ACTOR, { rollMode: 'publicroll' });

  assert.deepEqual(
    messages.map((message) => message.options.messageMode),
    ['gm', 'public'],
    'switching the key WITHOUT the vocabulary hands a legacy token to applyMode, which throws'
  );
  assert.ok(!('rollMode' in messages[0].options));
});

test('1286: an unmapped token passes through rather than defaulting to public', async (t) => {
  t.after(uninstallRoll);
  const { messages } = installRoll();
  installChatMessage({ v14: true });

  await evaluateSideRoll('2d6', ACTOR, { rollMode: 'ic' });

  assert.equal(
    messages[0].options.messageMode,
    'ic',
    'a `?? public` default would leak a blind roll'
  );
});

test('1286: evaluateSideRoll defaults to an EXPLICIT public token, never the client setting', async (t) => {
  t.after(uninstallRoll);
  const { messages } = installRoll();
  installChatMessage({ v14: false });

  await evaluateSideRoll('2d6', ACTOR, {});

  assert.equal(messages[0].options.rollMode, 'publicroll');
});

test('1286: evaluateSideRoll reports no engine rather than throwing, and can skip the post', async (t) => {
  t.after(uninstallRoll);
  assert.deepEqual(await evaluateSideRoll('2d6', ACTOR, {}), {
    engine: false,
    total: 0,
    formula: null,
    posted: false,
    roll: null,
  });

  const { messages } = installRoll({ totals: { '2d6': 5 } });
  installChatMessage({ v14: false });
  assert.equal((await evaluateSideRoll('   ', ACTOR, {})).engine, false, 'an empty expression');

  const quiet = await evaluateSideRoll('2d6', ACTOR, { post: false });
  assert.equal(quiet.total, 5);
  assert.equal(quiet.posted, false);
  assert.deepEqual(messages, []);
});

test('1286: a chat failure is swallowed, because the outcome is already committed', async (t) => {
  t.after(uninstallRoll);
  installRoll({ totals: { '2d6': 4 } });
  installChatMessage({ v14: false });
  globalThis.Roll.prototype.toMessage = async () => {
    throw new Error('sidebar exploded');
  };
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = original;
  });

  const rolled = await evaluateSideRoll('2d6', ACTOR, {});

  assert.equal(rolled.total, 4, 'the roll still happened');
  assert.equal(rolled.posted, false);
  assert.equal(errors.length, 1);
});

// ── the condition gate ──────────────────────────────────────────────────────

/** A complication whose ONLY clause is a condition roll, so the gate alone decides. */
function diceGated(rollCondition, overrides = {}) {
  return complication({ visibility: 'visible', name: 'Shrapnel', rollCondition, ...overrides });
}

async function fireDiceGated(rollCondition, rollOptions = {}) {
  const { constructed } = installRoll(rollOptions);
  installChatMessage({ v14: false });
  const plan = planOf([diceGated({ enabled: true, ...rollCondition })]);
  assert.equal(plan.firings[0].needsDice, true, 'the planner defers a condition roll');
  const result = await fireComplications({ plan, actor: ACTOR, context: {} });
  return { result, constructed };
}

test('1286: a condition roll that satisfies its comparand fires the complication', async (t) => {
  t.after(uninstallRoll);
  const { result } = await fireDiceGated(
    { expr: '1d20', cmp: 'lte', value: '1' },
    { totals: { '1d20': 1 } }
  );

  assert.equal(result.fired.length, 1);
  assert.deepEqual(
    result.fired[0].matchedConditions,
    ['rollCondition'],
    'the settled roll joins the matched clauses so the card can say what fired it'
  );
  assert.equal(result.fired[0].needsDice, false);
});

test('1286: a condition roll that misses its comparand fires nothing', async (t) => {
  t.after(uninstallRoll);
  const { result } = await fireDiceGated(
    { expr: '1d20', cmp: 'lte', value: '1' },
    { totals: { '1d20': 14 } }
  );

  assert.deepEqual(result.fired, []);
  assert.deepEqual(result.gmRequests, []);
});

test('1286: the comparand resolves roll data WITHOUT rolling', async (t) => {
  t.after(uninstallRoll);
  const { result, constructed } = await fireDiceGated(
    { expr: '1d20', cmp: 'gte', value: '@abilities.str.mod' },
    { totals: { '1d20': 3 } }
  );

  assert.equal(result.fired.length, 1, '3 >= 3');
  assert.deepEqual(constructed, ['1d20'], 'the comparand was substituted, never evaluated');
});

test('1286: a DICE comparand fails closed rather than being rolled', async (t) => {
  t.after(uninstallRoll);
  const { result, constructed } = await fireDiceGated(
    { expr: '1d20', cmp: 'gte', value: '1d6' },
    { totals: { '1d20': 20 } }
  );

  assert.deepEqual(result.fired, [], 'a rolled comparand would mean something different each ask');
  assert.deepEqual(constructed, ['1d20'], 'and it is not rolled even once');
});

test('1286: the gate fails closed with no dice engine at all', async (t) => {
  t.after(uninstallRoll);
  delete globalThis.Roll;
  const plan = planOf([diceGated({ enabled: true, expr: '1d20', cmp: 'gte', value: '1' })]);

  const result = await fireComplications({ plan, actor: ACTOR, context: {} });

  assert.deepEqual(result.fired, []);
});

test('1286: the gate fails closed on an unparseable, empty or absent comparand', async (t) => {
  t.after(uninstallRoll);
  for (const value of ['wobble', '', '   ']) {
    const { result } = await fireDiceGated(
      { expr: '1d20', cmp: 'gte', value },
      { totals: { '1d20': 20 } }
    );
    assert.deepEqual(result.fired, [], `comparand ${JSON.stringify(value)} must not match`);
  }
});

test('1286: the gate fails closed on an empty expression and on a valueless operator', async (t) => {
  t.after(uninstallRoll);
  const empty = await fireDiceGated({ expr: '  ', cmp: 'gte', value: '1' });
  assert.deepEqual(empty.result.fired, []);
  assert.deepEqual(empty.constructed, [], 'nothing is rolled for an expression that is not one');

  // `exists` has no numeric reading against a roll total, and an `exists` gate offered against
  // one would be a complication that always fires.
  const valueless = await fireDiceGated(
    { expr: '1d20', cmp: 'exists', value: '1' },
    { totals: { '1d20': 20 } }
  );
  assert.deepEqual(valueless.result.fired, []);
});

test('1286: a throwing condition roll costs its own complication and nothing else', async (t) => {
  t.after(uninstallRoll);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = original;
  });
  installRoll({ totals: { '1d4': 1 }, throwOn: ['1d20'] });
  installChatMessage({ v14: false });
  const plan = planOf([
    diceGated({ enabled: true, expr: '1d20', cmp: 'lte', value: '1' }, { name: 'Broken' }),
    diceGated({ enabled: true, expr: '1d4', cmp: 'lte', value: '1' }, { name: 'Intact' }),
  ]);

  const result = await fireComplications({ plan, actor: ACTOR, context: {} });

  assert.deepEqual(
    result.fired.map((entry) => entry.complication.name),
    ['Intact'],
    'one bad complication must not cost the resolution its others'
  );
  assert.equal(errors.length, 1);
});

// ── effects ─────────────────────────────────────────────────────────────────

test('1286: a VISIBLE effect roll is rolled and posted publicly on the acting client', async (t) => {
  t.after(uninstallRoll);
  const { constructed, messages } = installRoll({ totals: { '2d6': 9 } });
  installChatMessage({ v14: false });
  const plan = planOf([
    complication({
      visibility: 'visible',
      name: 'Shrapnel',
      when: { stageAwarded: true },
      effectRoll: { enabled: true, expr: '2d6', label: 'Shrapnel damage' },
    }),
  ]);

  const result = await fireComplications({
    plan,
    actor: ACTOR,
    context: { craftingSystemId: 'sys-1', speaker: { actor: 'Actor.hero' } },
  });

  assert.deepEqual(constructed, ['2d6']);
  assert.equal(result.fired[0].effectRoll.total, 9);
  assert.equal(result.fired[0].effectRoll.posted, true);
  assert.equal(messages[0].options.rollMode, 'publicroll', 'never the writing client’s selector');
  assert.equal(messages[0].messageData.flavor, 'Shrapnel damage');
  assert.deepEqual(messages[0].messageData.speaker, { actor: 'Actor.hero' });
});

test('1286: a gmOnly effect roll is NOT rolled here — the elected GM rolls it', async (t) => {
  t.after(uninstallRoll);
  const { constructed, messages } = installRoll({ totals: { '2d6': 9 } });
  installChatMessage({ v14: false });
  const plan = planOf([
    complication({
      visibility: 'gmOnly',
      name: 'Curse',
      when: { stageAwarded: true },
      effectRoll: { enabled: true, expr: '2d6', label: 'Curse' },
    }),
  ]);

  const result = await fireComplications({
    plan,
    actor: ACTOR,
    context: { craftingSystemId: 's' },
  });

  assert.deepEqual(constructed, [], 'a player client must not roll a GM-only complication’s dice');
  assert.deepEqual(messages, []);
  assert.equal(result.fired[0].effectRoll.total, null);
  assert.equal(result.gmRequests[0].effectRollTotal, null);
});

test('1286: a failed effect roll still leaves the macro request intact', async (t) => {
  t.after(uninstallRoll);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = original;
  });
  installRoll({ throwOn: ['2d6??'] });
  installChatMessage({ v14: false });
  const plan = planOf([
    complication({
      visibility: 'visible',
      name: 'Shrapnel',
      when: { stageAwarded: true },
      effectRoll: { enabled: true, expr: '2d6??', label: 'Shrapnel' },
      macroUuid: 'Macro.abc',
    }),
  ]);

  const result = await fireComplications({
    plan,
    actor: ACTOR,
    context: { craftingSystemId: 's' },
  });

  assert.equal(result.fired.length, 1, 'the complication still fired');
  assert.equal(result.fired[0].effectRoll.total, null);
  assert.match(result.fired[0].effectRoll.error, /bad formula/);
  assert.equal(result.gmRequests.length, 1, 'the macro is still requested of the GM');
  assert.equal(errors.length, 1);
});

// ── the GM request ──────────────────────────────────────────────────────────

test('1286: the GM request carries ADDRESSING ONLY', async (t) => {
  t.after(uninstallRoll);
  installRoll({ totals: { '2d6': 9 } });
  installChatMessage({ v14: false });
  const plan = planOf([
    complication({
      visibility: 'gmOnly',
      name: 'Curse of the Forge',
      description: 'Something goes badly wrong',
      severity: 'severe',
      when: { stageAwarded: true },
      macroUuid: 'Macro.abc',
    }),
  ]);

  const result = await fireComplications({
    plan,
    actor: ACTOR,
    context: { craftingSystemId: 'sys-1', speaker: { actor: 'Actor.hero' } },
  });

  const [request] = result.gmRequests;
  assert.deepEqual(
    Object.keys(request).sort(),
    [
      'activity',
      'actorUuid',
      'bucket',
      'complicationId',
      'componentId',
      'craftingSystemId',
      'effectRollTotal',
      'resolutionId',
      'resultId',
    ],
    'a payload carrying a macro uuid would let any player run arbitrary code at GM authority'
  );
  assert.deepEqual(request, {
    craftingSystemId: 'sys-1',
    componentId: 'iron',
    complicationId: plan.firings[0].complicationId,
    resultId: 'r1',
    activity: 'salvage',
    bucket: 'full',
    actorUuid: 'Actor.hero',
    resolutionId: 'res-1',
    effectRollTotal: null,
  });
});

test('1286: a VISIBLE complication needs the GM only when it names a macro', async (t) => {
  t.after(uninstallRoll);
  installRoll({ totals: { '2d6': 4 } });
  installChatMessage({ v14: false });
  const shared = { visibility: 'visible', when: { stageAwarded: true } };

  const chatOnly = await fireComplications({
    plan: planOf([complication({ ...shared, name: 'Sparks' })]),
    actor: ACTOR,
    context: {},
  });
  assert.deepEqual(chatOnly.gmRequests, [], 'it rides the card the acting client already posts');

  const withMacro = await fireComplications({
    plan: planOf([complication({ ...shared, name: 'Sparks', macroUuid: 'Macro.abc' })]),
    actor: ACTOR,
    context: {},
  });
  assert.equal(
    withMacro.gmRequests.length,
    1,
    'every complication macro runs on a GM client, whatever the audience'
  );
});

test('1286: fireComplications resolves rather than rejecting, whatever it is handed', async (t) => {
  t.after(uninstallRoll);
  for (const plan of [undefined, null, {}, { firings: 'nonsense' }, { firings: [null, 7] }]) {
    const result = await fireComplications({ plan });
    assert.deepEqual(result.fired, []);
    assert.deepEqual(result.gmRequests, []);
  }
  assert.deepEqual(await fireComplications(), {
    activity: null,
    resolutionId: null,
    fired: [],
    gmRequests: [],
  });
});

// ── the GM projection ───────────────────────────────────────────────────────

test('1286: gmComplications projects the authored record but never the macro uuid', async (t) => {
  t.after(uninstallRoll);
  installRoll({ totals: { '2d6': 9 } });
  installChatMessage({ v14: false });
  const plan = planOf([
    complication({
      visibility: 'gmOnly',
      name: 'Curse',
      description: 'A hex settles on the forge',
      severity: 'severe',
      when: { stageAwarded: true },
      macroUuid: 'Macro.abc',
    }),
  ]);

  const result = await fireComplications({ plan, actor: ACTOR, context: {} });
  const [projected] = gmComplications(result.fired);

  assert.equal(projected.name, 'Curse');
  assert.equal(projected.description, 'A hex settles on the forge');
  assert.equal(projected.severity, 'severe');
  assert.equal(projected.visibility, 'gmOnly');
  assert.equal(projected.componentName, 'Iron Ingot');
  assert.deepEqual(projected.buckets, ['full']);
  assert.deepEqual(projected.matchedConditions, ['stageAwarded']);
  assert.ok(!('macroUuid' in projected), 'the GM side re-reads it from its own world setting');
  assert.ok(!('complication' in projected), 'the raw record is not the projection');
});

test('1286: gmComplications tolerates an empty or absent fired list', () => {
  assert.deepEqual(gmComplications(undefined), []);
  assert.deepEqual(gmComplications([]), []);
});

// ── The GM side: the effect roll the acting client deliberately did not make ──

test('1286: the elected GM ROLLS the gmOnly effect roll the acting client skipped', async (t) => {
  t.after(uninstallRoll);
  const { constructed, messages } = installRoll({ totals: { '2d6': 9 } });
  installChatMessage({ v14: false });

  const rolled = await rollGmComplicationEffect({
    complication: complication({
      visibility: 'gmOnly',
      name: 'Curse',
      effectRoll: { enabled: true, expr: '2d6', label: 'Curse damage' },
    }),
    actor: ACTOR,
    speaker: { actor: 'Actor.hero' },
  });

  assert.deepEqual(
    constructed,
    ['2d6'],
    'without this the acting client’s "the GM rolls it" is a claim nothing discharges'
  );
  assert.equal(rolled.requested, true);
  assert.equal(rolled.total, 9);
  assert.equal(rolled.posted, true);
  assert.equal(
    messages[0].options.rollMode,
    'gmroll',
    'EXPLICIT: core.rollMode is scope client, so on the GM’s client the fallback is the GM’s own selector'
  );
  assert.equal(messages[0].messageData.flavor, 'Curse damage');
});

test('1286: the GM side refuses to roll a VISIBLE complication, the mirror of the acting client', async (t) => {
  t.after(uninstallRoll);
  const { constructed } = installRoll({ totals: { '2d6': 9 } });
  installChatMessage({ v14: false });

  const rolled = await rollGmComplicationEffect({
    complication: complication({
      visibility: 'visible',
      effectRoll: { enabled: true, expr: '2d6' },
    }),
    actor: ACTOR,
  });

  assert.deepEqual(
    constructed,
    [],
    'a visible roll belongs to the player’s own client and its dice'
  );
  assert.equal(rolled.requested, true, 'the GM authored one; it was simply not rolled HERE');
  assert.equal(rolled.total, null);
  assert.equal(rolled.posted, false);
});

test('1286: a GM-side effect roll that blows up is contained and reported as unrolled', async (t) => {
  t.after(uninstallRoll);
  const original = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = original;
  });
  installRoll({ throwOn: ['2d6??'] });
  installChatMessage({ v14: false });

  const rolled = await rollGmComplicationEffect({
    complication: complication({
      visibility: 'gmOnly',
      effectRoll: { enabled: true, expr: '2d6??' },
    }),
    actor: ACTOR,
  });

  assert.equal(rolled.requested, true);
  assert.equal(rolled.total, null);
  assert.ok(rolled.error, 'the failure is reported on the return, never thrown at the delivery');
});

test('1286: a complication with no authored effect roll asks the GM for nothing', async (t) => {
  t.after(uninstallRoll);
  const { constructed } = installRoll();
  installChatMessage({ v14: false });

  const rolled = await rollGmComplicationEffect({
    complication: complication({ visibility: 'gmOnly' }),
    actor: ACTOR,
  });

  assert.deepEqual(constructed, []);
  assert.equal(rolled.requested, false);
});

// ── The GM-only card ─────────────────────────────────────────────────────────

/** One GM card row, in the shape `main.js` composes from `gmComplications` plus the report. */
function gmRow(overrides = {}) {
  return {
    name: 'Curse',
    description: 'The ingot cracks.',
    severity: 'major',
    visibility: 'gmOnly',
    componentName: 'Iron Ingot',
    effectRoll: null,
    claimed: { bucket: null, effectRollTotal: null },
    macro: null,
    ...overrides,
  };
}

test('1286: an empty GM card builds NO content, so no empty message is created', () => {
  assert.equal(buildGmComplicationCardContent({ entries: [] }), '');
  assert.equal(buildGmComplicationCardContent(), '');
  assert.equal(buildGmComplicationCardContent({ entries: null }), '');
});

test('1286: the GM card names the complication the GM authored, with its own actor', () => {
  const content = buildGmComplicationCardContent({
    entries: [gmRow()],
    actorName: 'Aldric',
    reporterName: 'Player One',
  });

  assert.ok(content.includes('Curse'));
  assert.ok(content.includes('Iron Ingot'));
  assert.ok(content.includes('The ingot cracks.'));
  assert.ok(content.includes('Aldric'));
  assert.ok(content.includes('Player One'));
  assert.ok(
    content.includes('data-fabricate-complication-severity="major"'),
    'every attribute this card writes is double-quoted'
  );
});

test('1286: a hostile authored description cannot inject markup into the GM card', () => {
  const content = buildGmComplicationCardContent({
    entries: [
      gmRow({
        name: '<script>alert(1)</script>',
        description: '<img src=x onerror="alert(1)">',
        componentName: 'Iron" onmouseover="evil()',
      }),
    ],
    actorName: '<b>Aldric</b>',
  });

  assert.equal(content.includes('<script>'), false);
  assert.equal(content.includes('<img'), false);
  assert.equal(
    content.includes('onerror="'),
    false,
    'the attribute-opening quote is escaped, so the handler never becomes one'
  );
  assert.equal(content.includes('<b>Aldric</b>'), false);
  assert.ok(content.includes('&lt;script&gt;'), 'it is rendered as text, not dropped silently');
  assert.ok(content.includes('&quot;'), 'the quote that would escape an attribute is escaped');
});

test('1286: the acting client’s bucket and total are presented as an unverified CLAIM', () => {
  const content = buildGmComplicationCardContent(
    {
      entries: [gmRow({ claimed: { bucket: 'halted', effectRollTotal: 4 } })],
    },
    (key) =>
      ({
        'FABRICATE.Chat.GmComplication.Unverified': 'Reported by the acting client',
        'FABRICATE.Chat.GmComplication.Stage': 'Stage',
        'FABRICATE.Chat.GmComplication.Bucket.halted': 'Stopped here',
        'FABRICATE.Chat.GmComplication.EffectRoll': 'Effect roll',
      })[key] ?? key
  );

  assert.ok(
    content.includes('Reported by the acting client'),
    'the GM cannot re-derive the bucket or the total, so the card must not state them flat'
  );
  assert.ok(content.includes('Stage: Stopped here'));
  assert.ok(content.includes('Effect roll: 4'));

  const noClaim = buildGmComplicationCardContent(
    { entries: [gmRow({ claimed: { bucket: 'halted', effectRollTotal: null } })] },
    (key) => (key === 'FABRICATE.Chat.GmComplication.EffectRoll' ? 'Effect roll' : key)
  );
  assert.equal(
    noClaim.includes('Effect roll'),
    false,
    'Number(null) is 0, so a coercing test would report an absent claim as a rolled zero'
  );
});

test('1286: a macro that did not resolve to a script macro is REPORTED, not only logged', () => {
  const content = buildGmComplicationCardContent(
    { entries: [gmRow({ macro: { status: 'skipped', macroUuid: 'Compendium.pack.Macro.abc' } })] },
    (key) => (key === 'FABRICATE.Chat.GmComplication.MacroSkipped' ? 'Macro skipped' : key)
  );

  assert.ok(content.includes('Macro skipped: Compendium.pack.Macro.abc'));
});

test('1286: a macro that threw is reported, and one that ran adds no noise', () => {
  const failed = buildGmComplicationCardContent(
    { entries: [gmRow({ macro: { status: 'failed', macroUuid: 'Macro.x' } })] },
    (key) => (key === 'FABRICATE.Chat.GmComplication.MacroFailed' ? 'Macro failed' : key)
  );
  assert.ok(failed.includes('Macro failed: Macro.x'));

  const ran = buildGmComplicationCardContent({
    entries: [gmRow({ macro: { status: 'ran', macroUuid: 'Macro.x' } })],
  });
  assert.equal(ran.includes('Macro.x'), false, 'a macro that simply worked is not news');
});

test('1286: the GM-rolled effect roll is reported with its formula and its total', () => {
  const content = buildGmComplicationCardContent(
    {
      entries: [gmRow({ effectRoll: { requested: true, total: 9, formula: '2d6', posted: true } })],
    },
    (key) => (key === 'FABRICATE.Chat.GmComplication.EffectRoll' ? 'Effect roll' : key)
  );
  assert.ok(content.includes('Effect roll: 2d6 = 9'));

  const failed = buildGmComplicationCardContent(
    {
      entries: [
        gmRow({ effectRoll: { requested: true, total: null, formula: '2d6??', posted: false } }),
      ],
    },
    (key) => (key === 'FABRICATE.Chat.GmComplication.EffectRollFailed' ? 'Effect roll failed' : key)
  );
  assert.ok(failed.includes('Effect roll failed: 2d6??'));
});

test('1286: a VISIBLE complication on the GM card says the player saw it too', () => {
  const seen = buildGmComplicationCardContent(
    { entries: [gmRow({ visibility: 'visible' })] },
    (key) => (key === 'FABRICATE.Chat.GmComplication.PlayerVisible' ? 'Shown to the player' : key)
  );
  assert.ok(seen.includes('Shown to the player'));

  const hidden = buildGmComplicationCardContent(
    { entries: [gmRow({ visibility: 'gmOnly' })] },
    (key) => (key === 'FABRICATE.Chat.GmComplication.PlayerVisible' ? 'Shown to the player' : key)
  );
  assert.equal(hidden.includes('Shown to the player'), false);
});

test('1286: a severity outside the vocabulary resolves no key rather than rendering one', () => {
  const content = buildGmComplicationCardContent({
    entries: [gmRow({ severity: 'constructor' })],
  });
  assert.equal(
    content.includes('FABRICATE.Admin.Manager.Component.Complications.Severity.constructor'),
    false,
    'a label key interpolated from an authored token would render as garbage forever'
  );
  assert.ok(content.includes('data-fabricate-complication-severity="constructor"'));
});

// ── An id-less stage: unclassifiable, so it must fail toward silence ──────────

test('1286: an AWARDED stage with no result id fires no stageMissed complication', async (t) => {
  t.after(uninstallRoll);
  installRoll();
  installChatMessage({ v14: false });

  // `resolveProgressiveAward` pushes a result into `awarded` whatever its id, and only the
  // classifier's own id set drops it — so an id-less stage that WAS awarded is invisible in
  // `awarded` here. Classifying it as `unreached` would fire "you missed the iron ingot" on
  // a component the player is holding; `skipped` is the bucket that contributes to nothing.
  const authored = complication({
    visibility: 'visible',
    name: 'You missed it',
    when: { stageMissed: true },
  });
  const awardedWithNoId = { name: 'Iron Ingot' };
  const plan = planComplications({
    activity: 'salvage',
    resolutionId: 'res-idless',
    stages: [
      { resultId: null, componentId: 'iron', component: { id: 'iron', complications: [authored] } },
    ],
    award: {
      awarded: [awardedWithNoId],
      partialResult: null,
      haltedResult: null,
      skippedResults: [],
    },
  });

  assert.deepEqual(
    plan.stages.map((stage) => stage.bucket),
    ['skipped'],
    'the partition stays total, and the bucket that contributes to nothing is the honest one'
  );
  assert.deepEqual(plan.firings, [], 'nothing fires on a stage this classifier cannot place');

  const fired = await fireComplications({ plan, actor: ACTOR, context: {} });
  assert.deepEqual(fired.fired, []);
  assert.deepEqual(fired.gmRequests, []);
});
