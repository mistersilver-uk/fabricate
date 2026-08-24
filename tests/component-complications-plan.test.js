/**
 * `src/utils/complicationPlan.js` — the PURE decision half of progressive component
 * complications (issue 1286), and the two player-facing projections that live beside it.
 *
 * Every award in this suite is produced by the REAL `resolveProgressiveAward` loop rather than
 * hand-written, because the whole point of the five-bucket model is that it agrees with the
 * loop's own stopping behaviour. A hand-built `{awarded, haltedResult}` would pass whatever
 * the classifier happened to believe.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPLICATION_STAGE_BUCKETS,
  forecastComplications,
  planComplications,
  publicComplications,
} from '../src/utils/complicationPlan.js';
import { authoredComplications } from '../src/utils/componentComplications.js';
import { resolveProgressiveAward } from '../src/utils/progressiveAward.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let minted = 0;
const mintId = () => `cx${++minted}`;

/** One AUTHORED complication, normalized through the real shape so no test invents a field. */
function complication(overrides = {}) {
  const { complications } = authoredComplications(
    [{ activities: { salvage: true }, ...overrides }],
    mintId
  );
  return complications[0];
}

/** A component carrying zero or more complications. */
function component(id, complications = []) {
  return { id, name: `${id} name`, complications };
}

/** One ordered stage occurrence: a result id, and the component that stage produces. */
function stage(resultId, produced) {
  return { resultId, componentId: produced.id, component: produced };
}

/**
 * Spend a budget down the ordered stage list through the REAL award loop.
 *
 * @param {Array<object>} stages ordered stage occurrences
 * @param {Record<string, number>} difficulties per-result-id cost
 */
function runAward(stages, difficulties, options = {}) {
  return resolveProgressiveAward({
    results: stages.map((entry) => ({ id: entry.resultId })),
    initialRemaining: options.budget,
    costFor: (result) => difficulties[result.id],
    awardMode: options.awardMode ?? 'equal',
    invalidCost: options.invalidCost ?? 'skip',
    zeroRemainingOnPartial: options.zeroRemainingOnPartial ?? true,
  });
}

/** The bucket the plan assigned each stage, keyed by result id. */
function bucketsByResultId(plan) {
  return Object.fromEntries(plan.stages.map((entry) => [entry.resultId, entry.bucket]));
}

// ── stage classification ────────────────────────────────────────────────────

test('1286: a five-stage salvage whose budget dies at stage 2 misses stages 3-5', () => {
  const components = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    component(id, [complication({ when: { stageMissed: true } })])
  );
  const stages = components.map((produced, index) => stage(`r${index + 1}`, produced));
  const difficulties = { r1: 4, r2: 4, r3: 4, r4: 4, r5: 4 };
  const award = runAward(stages, difficulties, { budget: 6 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(bucketsByResultId(plan), {
    r1: 'full',
    r2: 'halted',
    r3: 'unreached',
    r4: 'unreached',
    r5: 'unreached',
  });
  assert.deepEqual(
    plan.firings.map((firing) => firing.componentId),
    ['b', 'c', 'd', 'e'],
    'the halted stage and every stage the loop never visited both read as missed'
  );
  assert.equal(
    plan.firings.some((firing) => firing.componentId === 'a'),
    false,
    'the awarded component is not missed'
  );
});

test('1286: an invalid cost AFTER the halt is skipped, not unreached, and fires nothing', () => {
  const missed = complication({ when: { stageMissed: true } });
  const components = ['a', 'b', 'c', 'd'].map((id) => component(id, [missed]));
  const stages = components.map((produced, index) => stage(`r${index + 1}`, produced));
  // `r3` sits after the halt at `r2` AND carries a difficulty the loop can never spend.
  const award = runAward(stages, { r1: 4, r2: 4, r3: 0, r4: 4 }, { budget: 6 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(bucketsByResultId(plan), {
    r1: 'full',
    r2: 'halted',
    r3: 'skipped',
    r4: 'unreached',
  });
  assert.equal(
    plan.firings.some((firing) => firing.componentId === 'c'),
    false,
    'a GM misconfiguration is not a narrative outcome, so a skipped stage contributes to nothing'
  );
});

test('1286: a partial tail matches stagePartial and NEITHER stageAwarded NOR stageMissed', () => {
  const tail = component('tail', [
    complication({ when: { stagePartial: true } }),
    complication({ when: { stageAwarded: true } }),
    complication({ when: { stageMissed: true } }),
  ]);
  const stages = [stage('r1', component('head')), stage('r2', tail)];
  const award = runAward(stages, { r1: 4, r2: 9 }, { budget: 6, awardMode: 'partial' });

  assert.equal(award.haltedResult, null, 'a partial tail and a halt are mutually exclusive');
  assert.equal(award.partialResult.id, 'r2');
  assert.ok(
    award.awarded.some((result) => result.id === 'r2'),
    'the partial tail is a MEMBER of awarded, which is why `full = awarded \\ {partialResult}`'
  );

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(bucketsByResultId(plan), { r1: 'full', r2: 'partial' });
  assert.deepEqual(
    plan.firings.map((firing) => firing.matchedConditions),
    [['stagePartial']],
    'only the partial clause matches: a classifier reading "full = every member of awarded" would match all three'
  );
});

test('1286: a budget that covers the whole list halts nothing and misses nothing', () => {
  const missed = complication({ when: { stageMissed: true } });
  const stages = [stage('r1', component('a', [missed])), stage('r2', component('b', [missed]))];
  const award = runAward(stages, { r1: 4, r2: 4 }, { budget: 20 });

  assert.equal(award.haltedResult, null);

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(bucketsByResultId(plan), { r1: 'full', r2: 'full' });
  assert.deepEqual(plan.firings, []);
});

test('1286: stagePartial never matches under equal, and the exceed boundary halts where equal awards', () => {
  const partial = complication({ when: { stagePartial: true } });
  const stages = [stage('r1', component('a', [partial])), stage('r2', component('b', [partial]))];

  for (const awardMode of ['equal', 'exceed']) {
    const award = runAward(stages, { r1: 4, r2: 9 }, { budget: 6, awardMode });
    assert.equal(award.partialResult, null, `${awardMode} awards no partial tail`);
    const plan = planComplications({ activity: 'salvage', stages, award });
    assert.deepEqual(plan.firings, [], `${awardMode} can never match stagePartial`);
  }

  // The boundary: a stage whose cost EXACTLY equals the remaining budget.
  const exact = { r1: 4, r2: 2 };
  const equalPlan = planComplications({
    activity: 'salvage',
    stages,
    award: runAward(stages, exact, { budget: 6, awardMode: 'equal' }),
  });
  const exceedPlan = planComplications({
    activity: 'salvage',
    stages,
    award: runAward(stages, exact, { budget: 6, awardMode: 'exceed' }),
  });
  assert.equal(bucketsByResultId(equalPlan).r2, 'full');
  assert.equal(bucketsByResultId(exceedPlan).r2, 'halted');
});

test('1286: every stage lands in exactly one of the five declared buckets', () => {
  const stages = ['r1', 'r2', 'r3', 'r4'].map((id, index) => stage(id, component(`c${index}`)));
  const award = runAward(stages, { r1: 2, r2: 0, r3: 2, r4: 2 }, { budget: 3 });
  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.equal(plan.stages.length, stages.length);
  for (const entry of plan.stages) {
    assert.ok(
      COMPLICATION_STAGE_BUCKETS.includes(entry.bucket),
      `${entry.resultId} landed in an undeclared bucket`
    );
  }
});

// ── the per-RESULT-ENTRY firing rule ────────────────────────────────────────

test('1286: a component staged three times fires its matching complication THREE times', () => {
  const shrapnel = complication({ when: { stageMissed: true, stageAwarded: true } });
  const repeated = component('iron', [shrapnel]);
  const stages = [stage('r1', repeated), stage('r2', repeated), stage('r3', repeated)];
  const award = runAward(stages, { r1: 4, r2: 4, r3: 4 }, { budget: 6 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(bucketsByResultId(plan), { r1: 'full', r2: 'halted', r3: 'unreached' });
  assert.deepEqual(
    plan.firings.map((firing) => [firing.resultId, firing.bucket, firing.buckets]),
    [
      ['r1', 'full', ['full']],
      ['r2', 'halted', ['halted']],
      ['r3', 'unreached', ['unreached']],
    ],
    'three entries were three awards, so each fires on its own and reports its OWN bucket'
  );
  assert.deepEqual(
    plan.firings.map((firing) => firing.complicationId),
    Array(3).fill(shrapnel.id),
    'one complication, three firings — a `1d6` staged three times rolls three times'
  );
});

test('1286: a stageMissed complication never fires against an entry the loop AWARDED', () => {
  const missed = complication({ when: { stageMissed: true } });
  const repeated = component('iron', [missed]);
  const stages = [stage('r1', repeated), stage('r2', repeated), stage('r3', repeated)];
  const award = runAward(stages, { r1: 4, r2: 4, r3: 4 }, { budget: 6 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(bucketsByResultId(plan), { r1: 'full', r2: 'halted', r3: 'unreached' });
  assert.deepEqual(
    plan.firings.map((firing) => firing.resultId),
    ['r2', 'r3'],
    'the awarded entry is not missed, however the component fared on its other entries'
  );
  assert.deepEqual(
    plan.firings.map((firing) => firing.matchedConditions),
    [['stageMissed'], ['stageMissed']],
    'each firing reports the clause ITS OWN entry satisfied'
  );
});

test('1286: firings come back in RESULT ENTRY order, interleaved across components', () => {
  const missed = () => complication({ when: { stageMissed: true } });
  const iron = component('iron', [missed()]);
  const coal = component('coal', [missed()]);
  const stages = [stage('r1', iron), stage('r2', coal), stage('r3', iron)];
  const award = runAward(stages, { r1: 4, r2: 4, r3: 4 }, { budget: 0 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(
    plan.firings.map((firing) => [firing.resultId, firing.componentId]),
    [
      ['r1', 'iron'],
      ['r2', 'coal'],
      ['r3', 'iron'],
    ],
    'stage order, not a per-component grouping that would emit both iron firings first'
  );
});

test('1286: a complication authored TWICE on one component fires once per entry, not twice', () => {
  const shrapnel = complication({ when: { stageMissed: true } });
  // The same authored record listed twice — the one dedupe that survives, scoped to the entry.
  const repeated = component('iron', [shrapnel, shrapnel]);
  const stages = [stage('r1', repeated), stage('r2', repeated)];
  const award = runAward(stages, { r1: 4, r2: 4 }, { budget: 0 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.deepEqual(
    plan.firings.map((firing) => firing.resultId),
    ['r1', 'r2'],
    'two entries, one firing each — the within-entry dedupe is on complicationId alone'
  );
});

test('1286: a SKIPPED entry fires nothing, even for a trigger that matched', () => {
  const triggered = complication({ when: { checkTrigger: 'nat1' } });
  const repeated = component('iron', [triggered]);
  const stages = [stage('r1', repeated), stage('r2', repeated), stage('r3', repeated)];
  // `r2` carries an invalid cost, so the loop skips it while awarding the other two.
  const award = runAward(stages, { r1: 2, r2: 0, r3: 2 }, { budget: 20 });

  const plan = planComplications({
    activity: 'salvage',
    stages,
    award,
    matchedTriggerIds: ['nat1'],
    checkTriggerIds: ['nat1'],
  });

  assert.equal(bucketsByResultId(plan).r2, 'skipped');
  assert.deepEqual(
    plan.firings.map((firing) => firing.resultId),
    ['r1', 'r3'],
    'a trigger reads the same on every entry, but a skipped stage is not an award to hang a consequence on'
  );
});

test('1286: a firing decided only by a condition roll still names an occurrence', () => {
  const diceOnly = component('iron', [
    complication({ rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' } }),
  ]);
  const stages = [stage('r1', diceOnly)];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });

  const plan = planComplications({ activity: 'salvage', stages, award });

  assert.equal(plan.firings.length, 1);
  assert.equal(plan.firings[0].needsDice, true, 'the planner cannot roll, so it defers');
  assert.deepEqual(plan.firings[0].matchedConditions, []);
  assert.equal(plan.firings[0].resultId, 'r1');
  assert.equal(plan.firings[0].bucket, 'full');
});

// ── activities ──────────────────────────────────────────────────────────────

test('1286: a salvage-only complication fires on salvage and nothing on a craft of the same component', () => {
  const salvageOnly = component('iron', [
    complication({
      activities: { salvage: true, crafting: false, gathering: false },
      when: { stageAwarded: true },
    }),
  ]);
  const stages = [stage('r1', salvageOnly)];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });

  assert.equal(planComplications({ activity: 'salvage', stages, award }).firings.length, 1);
  assert.deepEqual(planComplications({ activity: 'crafting', stages, award }).firings, []);
  assert.deepEqual(planComplications({ activity: 'gathering', stages, award }).firings, []);
});

test('1286: an unknown activity token fires nothing rather than everything', () => {
  const anywhere = component('iron', [
    complication({
      activities: { salvage: true, crafting: true, gathering: true },
      when: { stageAwarded: true },
    }),
  ]);
  const stages = [stage('r1', anywhere)];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });

  assert.deepEqual(planComplications({ activity: 'harvesting', stages, award }).firings, []);
});

// ── when.checkTrigger ───────────────────────────────────────────────────────

test('1286: a named trigger fires regardless of its breakTools/outcome/tierStep values', () => {
  const named = component('iron', [complication({ when: { checkTrigger: 'nat1' } })]);
  const stages = [stage('r1', named)];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });

  const plan = planComplications({
    activity: 'salvage',
    stages,
    award,
    matchedTriggerIds: ['nat1'],
    checkTriggerIds: ['nat1', 'nat20'],
  });

  assert.equal(plan.firings.length, 1);
  assert.deepEqual(plan.firings[0].matchedConditions, ['checkTrigger']);
});

test('1286: an authored trigger no complication names acquires no fourth effect', () => {
  const unrelated = component('iron', [complication({ when: { stageAwarded: true } })]);
  const stages = [stage('r1', unrelated)];
  const award = runAward(stages, { r1: 40 }, { budget: 6 });

  const plan = planComplications({
    activity: 'salvage',
    stages,
    award,
    matchedTriggerIds: ['nat1'],
    checkTriggerIds: ['nat1'],
  });

  assert.deepEqual(plan.firings, [], 'a matched trigger fires nothing on its own');
});

test('1286: a trigger id the activity does not own is INERT, never a validation error', () => {
  const stale = complication({ when: { checkTrigger: 'deleted', stageAwarded: true } });
  const stages = [stage('r1', component('iron', [stale]))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });

  const allClauses = { ...stale, match: 'all' };
  const strict = [stage('r1', component('iron', [allClauses]))];

  const plan = planComplications({
    activity: 'salvage',
    stages: strict,
    award,
    matchedTriggerIds: [],
    checkTriggerIds: ['still-here'],
  });

  assert.equal(
    plan.firings.length,
    1,
    'an unresolvable id fails OPEN: it contributes nothing to `all` rather than blocking it'
  );
  assert.deepEqual(plan.firings[0].matchedConditions, ['stageAwarded']);
});

test('1286: a complication whose ONLY clause is an unowned trigger never fires', () => {
  const orphan = complication({ when: { checkTrigger: 'deleted' } });
  const stages = [stage('r1', component('iron', [orphan]))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });

  assert.deepEqual(
    planComplications({
      activity: 'salvage',
      stages,
      award,
      checkTriggerIds: ['still-here'],
    }).firings,
    [],
    'nothing enabled never fires'
  );
});

// ── match ───────────────────────────────────────────────────────────────────

test('1286: `all` needs every enabled clause, `any` needs one, nothing enabled never fires', () => {
  const stages = [stage('r1', component('iron'))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 }); // r1 is `full`

  const clauses = { stageAwarded: true, stageMissed: true };
  const plan = (match, when = clauses) =>
    planComplications({
      activity: 'salvage',
      stages: [stage('r1', component('iron', [complication({ match, when })]))],
      award,
    }).firings;

  assert.deepEqual(plan('all'), [], 'one of two enabled clauses matched');
  assert.equal(plan('any').length, 1);
  assert.deepEqual(plan('any', {}), [], 'nothing enabled');
  assert.deepEqual(plan('all', {}), [], 'nothing enabled, under `all` too');
});

test('1286: a DISABLED rollCondition contributes nothing and cannot make `all` unsatisfiable', () => {
  const stages = [stage('r1', component('iron'))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });
  const authored = complication({
    match: 'all',
    when: { stageAwarded: true },
    rollCondition: { enabled: false, expr: '1d20', cmp: 'eq', value: '1' },
  });

  const plan = planComplications({
    activity: 'salvage',
    stages: [stage('r1', component('iron', [authored]))],
    award,
  });

  assert.equal(plan.firings.length, 1);
  assert.equal(plan.firings[0].needsDice, false, 'no dice are needed for a disabled condition');
});

test('1286: under `any`, a clause that already matched settles it without a roll', () => {
  const stages = [stage('r1', component('iron'))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });
  const authored = complication({
    match: 'any',
    when: { stageAwarded: true },
    rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' },
  });

  const plan = planComplications({
    activity: 'salvage',
    stages: [stage('r1', component('iron', [authored]))],
    award,
  });

  assert.equal(
    plan.firings[0].needsDice,
    false,
    '`any` is already satisfied, so nothing is rolled'
  );
});

test('1286: under `all`, the settled clauses gate the roll and the roll is deferred', () => {
  const stages = [stage('r1', component('iron'))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 }); // `full`
  const authored = (when) =>
    complication({
      match: 'all',
      when,
      rollCondition: { enabled: true, expr: '1d20', cmp: 'eq', value: '1' },
    });

  const matching = planComplications({
    activity: 'salvage',
    stages: [stage('r1', component('iron', [authored({ stageAwarded: true })]))],
    award,
  });
  assert.equal(matching.firings[0].needsDice, true);

  const failing = planComplications({
    activity: 'salvage',
    stages: [stage('r1', component('iron', [authored({ stageMissed: true })]))],
    award,
  });
  assert.deepEqual(failing.firings, [], 'a failed stage clause short-circuits before any roll');
});

// ── the misconfiguration abort ──────────────────────────────────────────────

test('1286: a resolution aborted by invalidCost `fail` fires nothing', () => {
  const missed = complication({
    activities: { gathering: true },
    when: { stageMissed: true, stageAwarded: true },
  });
  const stages = ['r1', 'r2'].map((id, index) => stage(id, component(`c${index}`, [missed])));
  const award = runAward(stages, { r1: 0, r2: 4 }, { budget: 20, invalidCost: 'fail' });

  assert.equal(award.invalidResultId, 'r1');

  const plan = planComplications({ activity: 'gathering', stages, award });

  assert.equal(plan.aborted, true);
  assert.deepEqual(plan.firings, [], 'the crafting misconfiguration gate fires nothing either');
});

// ── the two player projections ──────────────────────────────────────────────

test('1286: forecastComplications projects only VISIBLE complications for the activity', () => {
  const authored = component('iron', [
    complication({ visibility: 'visible', name: 'Shrapnel', when: { stageMissed: true } }),
    complication({ visibility: 'gmOnly', name: 'Curse', when: { stageMissed: true } }),
    complication({
      visibility: 'visible',
      name: 'Crafting only',
      activities: { crafting: true },
      when: { stageMissed: true },
    }),
  ]);

  const forecast = forecastComplications(authored, { activity: 'salvage' });

  assert.deepEqual(
    forecast.map((entry) => entry.name),
    ['Shrapnel']
  );
});

test('1286: the forecast excludes complications that provably cannot fire', () => {
  const authored = component('iron', [
    complication({ visibility: 'visible', name: 'No clause' }),
    complication({ visibility: 'visible', name: 'Orphan trigger', when: { checkTrigger: 'gone' } }),
    complication({ visibility: 'visible', name: 'Owned trigger', when: { checkTrigger: 'nat1' } }),
    complication({
      visibility: 'visible',
      name: 'Dice only',
      rollCondition: { enabled: true, expr: '1d20', cmp: 'lte', value: '1' },
    }),
  ]);

  const forecast = forecastComplications(authored, {
    activity: 'salvage',
    checkTriggerIds: ['nat1'],
  });

  assert.deepEqual(
    forecast.map((entry) => entry.name),
    ['Owned trigger', 'Dice only'],
    'so "N complications could fire" is not a lie'
  );
});

test('1286: neither player projection ever emits when, rollCondition, effectRoll or macroUuid', () => {
  const secretive = complication({
    visibility: 'visible',
    name: 'Shrapnel',
    description: 'Splinters everywhere',
    severity: 'major',
    when: { stageMissed: true, checkTrigger: 'nat1' },
    rollCondition: { enabled: true, expr: '1d20', cmp: 'lte', value: '1' },
    effectRoll: { enabled: true, expr: '2d6', label: 'Shrapnel' },
    macroUuid: 'Macro.abc',
  });
  const leaked = ['when', 'rollCondition', 'effectRoll', 'macroUuid', 'activities', 'match'];

  const [forecast] = forecastComplications(component('iron', [secretive]), { activity: 'salvage' });
  for (const key of leaked) assert.ok(!(key in forecast), `forecast leaked ${key}`);
  assert.equal(forecast.name, 'Shrapnel');
  assert.equal(forecast.severity, 'major');

  const [projected] = publicComplications([
    {
      resultId: 'r1',
      componentId: 'iron',
      complicationId: secretive.id,
      buckets: ['halted'],
      complication: secretive,
    },
  ]);
  for (const key of leaked) assert.ok(!(key in projected), `publicComplications leaked ${key}`);
  assert.deepEqual(projected, {
    resultId: 'r1',
    componentId: 'iron',
    complicationId: secretive.id,
    buckets: ['halted'],
    name: 'Shrapnel',
    description: 'Splinters everywhere',
    severity: 'major',
  });
});

test('1286: publicComplications drops every gmOnly complication, whoever the acting user is', () => {
  const stages = [stage('r1', component('iron'))];
  const award = runAward(stages, { r1: 4 }, { budget: 6 });
  const fired = planComplications({
    activity: 'salvage',
    stages: [
      stage(
        'r1',
        component('iron', [
          complication({ visibility: 'gmOnly', name: 'Curse', when: { stageAwarded: true } }),
          complication({ visibility: 'visible', name: 'Sparks', when: { stageAwarded: true } }),
        ])
      ),
    ],
    award,
  }).firings;

  assert.equal(fired.length, 2, 'both fire; only one is a player’s to see');
  assert.deepEqual(
    publicComplications(fired).map((entry) => entry.name),
    ['Sparks'],
    'the projection is keyed on the AUDIENCE, never on the acting user’s role'
  );
});

test('1286: the run-record keys are a subset of the public projection', () => {
  const authored = complication({ visibility: 'visible', when: { stageAwarded: true } });
  const [projected] = publicComplications([
    {
      resultId: 'r1',
      componentId: 'iron',
      complicationId: authored.id,
      buckets: [],
      complication: authored,
    },
  ]);

  for (const key of ['resultId', 'componentId', 'complicationId', 'buckets']) {
    assert.ok(key in projected, `the salvage run record needs ${key}`);
  }
});

// ── the leaf assertion ──────────────────────────────────────────────────────

test('1286: complicationPlan.js imports NOTHING but the frozen vocabularies', () => {
  // The `manager-color-tokens.js` precedent asserts ZERO imports, which would fail a module
  // that legitimately imports one thing. The ALLOWLIST form is what this module needs: it must
  // read the vocabularies rather than restate them, and it must not acquire a runtime import —
  // a player view-model importing this leaf would otherwise gain `checkRoll.js`'s whole
  // sixteen-module closure, in every mounted Svelte suite that declares its closure verbatim.
  const source = readFileSync(join(ROOT, 'src', 'utils', 'complicationPlan.js'), 'utf8');
  const specifiers = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(
    (match) => match[1]
  );

  assert.deepEqual(
    specifiers,
    ['./componentComplications.js'],
    'complicationPlan.js may import the frozen vocabularies and nothing else'
  );
  assert.equal(
    /\bimport\s*\(/.test(source),
    false,
    'a dynamic import would evade the allowlist above'
  );
});

test('1286: componentComplications.js, the module it imports, is itself import-free', () => {
  const source = readFileSync(join(ROOT, 'src', 'utils', 'componentComplications.js'), 'utf8');
  assert.equal(
    /^\s*import\s/m.test(source),
    false,
    'the allowlist is only worth anything while the allowed module is a leaf'
  );
});
