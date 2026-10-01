/**
 * Issue 2006 — a success-counting craft, salvage or bulk salvage states its executed dice as tiles
 * and count rows only for a public, non-secret roll, on a V13 (`applyRollMode`) and a V14
 * (`applyMode`) build, from the evidence the roll itself produced (N31, N33); a zero pool states
 * no total and no tile (N32); and none of that evidence is persisted or flagged (N36).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePreparedRunCheck } from '../src/systems/checkRoll.js';
import { checkDisplayForCard } from '../src/systems/craftCardFields.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation, preparedCountCheck } from './helpers/countFixtures.js';
import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { salvageRunProbe } from './helpers/salvagePipelineProbe.js';

const ROLL_MODES = ['publicroll', 'gmroll', 'blindroll', 'selfroll'];

/**
 * Pass: a d6 pool of 2 succeeding on every face, each die exploding once, so the faces 3 and 5
 * roll the explosions 2 and 4 and net 4 against the 2 needed.
 */
const PASS_POOL = Object.freeze({
  die: 6,
  base: '2',
  threshold: '1',
  required: 2,
  explode: { enabled: true, faces: { kind: 'from', value: 1 }, once: true },
});
const PASS_FACES = [3, 5, 2, 4];

/** Botch: a d6 pool of 3 that no face qualifies and every face from 6 down cancels, netting −3. */
const BOTCH_POOL = Object.freeze({
  die: 6,
  base: '3',
  threshold: '7',
  required: 1,
  cancel: { enabled: true, faces: { kind: 'from', value: 6 } },
});

/** Character value: success on at or above the crafter's `@skills.craft.value`. */
const CHARACTER_POOL = Object.freeze({ die: 6, base: '2', threshold: '@skills.craft.value' });

const ZERO_POOL = Object.freeze({ die: 6, base: '0', required: 1 });

const simpleCheck = (pool) => ({
  rollFormula: '',
  thresholdMode: 'meet',
  evaluation: normalizeCheckEvaluation(countEvaluation(pool)),
});

/** A V13 or V14 `ChatMessage` whose created messages are recorded whole. */
function installChatMessage(version, created) {
  const applier =
    version === 13
      ? { applyRollMode: (data, mode) => Object.assign(data, { rollMode: mode }) }
      : { applyMode: (data, mode) => Object.assign(data, { messageMode: mode }) };
  // ratchet-exempt(lint): the gate stubs Foundry's global ChatMessage, as a real card post reads it.
  globalThis.ChatMessage = {
    create: async (data) => {
      created.push(data);
      return { id: `msg-${created.length}` };
    },
    getSpeaker: () => ({ alias: 'Crafter' }),
    ...applier,
  };
}

/** The card with its invisible enrichment joiners removed. */
const readable = (card) => String(card?.content ?? '').replaceAll(/[\u{2060}\u{200B}]/gu, '');

/** The posted result cards of `created`, never the count Roll's own roll message. */
const resultCards = (created) =>
  created.filter((data) => String(data.content).includes('fabricate-craft-chat'));

/** `[face, marks]` for every tile a card's markup draws, in order. */
function tilesOf(content) {
  return [...content.matchAll(/data-dice-tile-face="(\d+)" data-dice-tile-marks="([^"]*)"/g)].map(
    ([, face, marks]) => [Number(face), marks]
  );
}

/** Craft once with a count check over `pool`, answering the prompt with `rollMode`. */
async function craftCount({ version = 14, rollMode = 'publicroll', pool, faces = [], skill }) {
  const world = craftProbe({
    features: { craftingChecks: true, chatOutput: true },
    craftingCheck: { enabled: true, consumption: {}, simple: simpleCheck(pool) },
    resolutionService: probeResolutionService({ mode: 'simple' }),
  });
  if (skill !== undefined) world.craftingActor.system.skills = { craft: { value: skill } };
  globalThis.game.i18n.localize = shippedLocalize;
  const checks = [];
  const run = world.engine._runCraftingCheck.bind(world.engine);
  world.engine._runCraftingCheck = async (...args) => {
    const result = await run(...args);
    checks.push(result);
    return result;
  };
  const created = [];
  installChatMessage(version, created);
  const dice = installCountDice({ faces, chat: false });
  const prompt = stubPromptSurface(() => ({ confirmed: true, rollMode }));
  try {
    const result = await world.craft(null, { interactive: true });
    return { world, result, check: checks[0], cards: resultCards(created), created };
  } finally {
    prompt.restore();
    dice.restore();
  }
}

for (const version of [13, 14]) {
  test(`V${version}: a public count craft states the tiles, the summary and the count rows`, async () => {
    const { result, cards } = await craftCount({ version, pool: PASS_POOL, faces: PASS_FACES });
    assert.equal(result.success, true, 'a net of 4 reaches the 2 needed');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].rolls, undefined, 'the card carries no count Roll or pre-roll');
    const content = readable(cards[0]);
    assert.deepEqual(tilesOf(content), [
      [3, 'qualified exploded'],
      [2, 'qualified'],
      [5, 'qualified exploded'],
      [4, 'qualified'],
    ]);
    assert.ok(content.includes('data-check-count-summary>2d6, each ≥ 1</div>'));
    assert.doesNotMatch(content, /__roll-value/, 'the summary replaces the numeric roll row');
    assert.ok(content.includes('4 qualified − 0 cancelled = 4 net'));
    assert.ok(content.includes('2 · margin +2'));
    assert.doesNotMatch(content, /data-check-evidence="successOn"/, 'a fixed, unmoved threshold');
    assert.doesNotMatch(content, /fabricate-dice-tiles__legend/, 'chat draws no legend');
  });

  for (const rollMode of ROLL_MODES.slice(1)) {
    test(`V${version} ${rollMode}: a count craft card states no net, tiles or count rows`, async () => {
      const { cards } = await craftCount({ version, rollMode, pool: PASS_POOL, faces: PASS_FACES });
      const content = readable(cards[0]);
      assert.doesNotMatch(content, /data-dice-tile|data-check-evidence|data-check-count-summary/);
      assert.doesNotMatch(content, /__roll-value/, 'nor the bare net (issue 2054)');
      assert.match(content, /fa-circle-check/, 'it keeps its pill');
    });
  }
}

test('a botch reads Botch and cancels every tile, below zero in the danger tone', async () => {
  const { cards } = await craftCount({ pool: BOTCH_POOL, faces: [6, 6, 6] });
  const content = readable(cards[0]);
  assert.ok(content.includes('fa-skull" aria-hidden="true"></i>Botch</div>'));
  assert.deepEqual(tilesOf(content), [
    [6, 'cancelled'],
    [6, 'cancelled'],
    [6, 'cancelled'],
  ]);
  assert.ok(
    content.includes(
      'evidence-row--danger" data-check-evidence="count"><dt class="fabricate-craft-chat__evidence-label">Count</dt>'
    )
  );
  assert.ok(content.includes('0 qualified − 3 cancelled = −3 net'));
  assert.ok(content.includes('1 · a net below zero is a botch'));
});

test('a botch is named only on a public card; a GM or blind roll reads a plain Failure', async () => {
  for (const rollMode of ['gmroll', 'blindroll']) {
    const { cards } = await craftCount({ rollMode, pool: BOTCH_POOL, faces: [6, 6, 6] });
    const content = readable(cards[0]);
    assert.ok(!content.includes('fa-skull'), `${rollMode}: no Botch pill`);
    assert.ok(content.includes('fa-circle-xmark" aria-hidden="true"></i>Failure</div>'), rollMode);
  }
  const { cards } = await craftCount({ pool: BOTCH_POOL, faces: [6, 6, 6] });
  assert.ok(readable(cards[0]).includes('fa-skull" aria-hidden="true"></i>Botch</div>'), 'public');
});

test('a zero pool states no total and no tile, only why nothing was rolled (N32)', async () => {
  const { result, cards } = await craftCount({ pool: ZERO_POOL });
  assert.equal(result.success, false);
  const content = readable(cards[0]);
  assert.doesNotMatch(content, /__roll-value|data-dice-tile/);
  assert.ok(content.includes('data-check-count-summary>0d6 = 0 dice</div>'));
  assert.ok(content.includes('A pool reduced to zero fails automatically. Nothing was rolled.'));
});

/** Anything a zero-pool card that is not public may not state beside its pill. */
const PILL_ALONE = /__roll|data-dice-tile|data-check-count-summary|data-check-evidence/;

test('a gmroll zero-pool card states its Failure pill alone (issue 2054)', async () => {
  const { result, cards } = await craftCount({ rollMode: 'gmroll', pool: ZERO_POOL });
  assert.equal(result.success, false);
  const content = readable(cards[0]);
  assert.match(content, /fa-circle-xmark" aria-hidden="true"><\/i>Failure<\/div>/);
  assert.doesNotMatch(content, PILL_ALONE);
});

test('a secret zero-pool card states its Failure pill alone (issue 2054)', async () => {
  const dice = installCountDice({ faces: [], chat: false });
  const secret = await evaluatePreparedRunCheck(
    preparedCountCheck({ count: { base: 0 } }),
    { getRollData: () => ({}) },
    { rollMode: 'publicroll' },
    { secret: true }
  ).finally(dice.restore);
  assert.equal(secret.data.zeroPool, true, 'positive control: the pool was reduced to zero');
  const world = craftProbe({
    features: { craftingChecks: true, chatOutput: true },
    craftingCheck: { enabled: true, consumption: {}, simple: simpleCheck(ZERO_POOL) },
    resolutionService: probeResolutionService({ mode: 'simple' }),
    checkResult: secret,
  });
  globalThis.game.i18n.localize = shippedLocalize;
  const created = [];
  installChatMessage(14, created);
  await world.craft();
  const content = readable(resultCards(created)[0]);
  assert.match(content, /fa-circle-xmark" aria-hidden="true"><\/i>Failure<\/div>/);
  assert.doesNotMatch(content, PILL_ALONE);
});

test('the card states the executed threshold, never the live actor or check (N31)', async () => {
  const { world, check, cards } = await craftCount({
    pool: CHARACTER_POOL,
    faces: [4, 2],
    skill: 4,
  });
  const posted = readable(cards[0]);
  assert.ok(posted.includes('≥ 4 · character value 4'), 'the executed character value');
  world.craftingActor.system.skills.craft.value = 1;
  world.system.craftingCheck.simple.evaluation.pool.threshold = '6';
  const again = checkDisplayForCard(check);
  assert.equal(again.count.threshold.effective, 4);
  assert.equal(again.count.threshold.source, 'character');
  assert.deepEqual(
    again.count.tiles.tiles.map((tile) => tile.marks.join(' ')),
    ['qualified', '']
  );
});

test('no count evidence is persisted, flagged or handed off (N36)', async () => {
  const { world, result, check, created } = await craftCount({
    pool: PASS_POOL,
    faces: PASS_FACES,
  });
  assert.ok(check.countDisplay, 'positive control: the execution reported its dice');
  assert.ok(!('countDisplay' in check.data), 'check data gains nothing');
  for (const message of created) {
    assert.doesNotMatch(JSON.stringify(message.flags ?? {}), /countDisplay|explodedFrom|tiles/);
  }
  const persisted = JSON.stringify(world.craftingActor.flags ?? {});
  assert.match(persisted, /"successes":4/, 'positive control: the run history holds the check');
  assert.doesNotMatch(persisted, /countDisplay|explodedFrom|"tiles"/);
  assert.deepEqual(Object.keys(result), ['success', 'results', 'message']);
});

/** A salvage of Iron Ore under a count check over `pool`, answered with `rollMode`. */
async function salvageCount({ version = 14, rollMode = 'publicroll', pool, faces = [] }) {
  const world = salvageProbe({
    salvageCraftingCheck: {
      simple: simpleCheck(pool),
      consumption: { consumeComponentOnFail: true },
    },
  });
  globalThis.game.i18n.localize = shippedLocalize;
  const created = [];
  installChatMessage(version, created);
  const dice = installCountDice({ faces, chat: false });
  try {
    const result = await world.salvage({ interactive: true, rollDecision: { rollMode } });
    return { result, cards: resultCards(created) };
  } finally {
    dice.restore();
  }
}

for (const version of [13, 14]) {
  for (const rollMode of ROLL_MODES) {
    test(`V${version} ${rollMode}: a count salvage card states its dice only when public`, async () => {
      const { result, cards } = await salvageCount({
        version,
        rollMode,
        pool: PASS_POOL,
        faces: PASS_FACES,
      });
      assert.equal(result.success, true);
      const content = readable(cards[0]);
      if (rollMode === 'publicroll') {
        assert.equal(tilesOf(content).length, 4);
        assert.ok(content.includes('data-check-count-summary>2d6, each ≥ 1</div>'));
        assert.doesNotMatch(content, /__roll-value/);
        assert.ok(content.includes('2 · margin +2'));
        assert.ok(result.check.count, 'the salvage result carries the projection for its summary');
      } else {
        assert.doesNotMatch(content, /data-dice-tile|data-check-evidence|data-check-count-summary/);
        assert.doesNotMatch(content, /__roll-value/, 'nor the bare net (issue 2054)');
      }
    });
  }
}

test('a zero-pool salvage card states no total and no tile (N32)', async () => {
  const { result, cards } = await salvageCount({ pool: ZERO_POOL });
  assert.equal(result.success, false);
  const content = readable(cards[0]);
  assert.doesNotMatch(content, /__roll-value|data-dice-tile/);
  assert.ok(content.includes('0d6 = 0 dice'));
});

/** One bulk salvage of Iron Ore under a count check, its aggregate card read as text by key. */
async function bulkCount({ rollMode, pool, faces = [] }) {
  const world = salvageRunProbe({
    salvageCraftingCheck: { simple: simpleCheck(pool) },
    targets: [
      {
        id: 'ore',
        name: 'Iron Ore',
        quantity: 3,
        ingredientQuantity: 1,
        resultGroups: [
          { id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 2 }] },
        ],
      },
    ],
    awards: [{ id: 'shard', name: 'Shard' }],
  });
  const dice = installCountDice({ faces, chat: false });
  try {
    await world.bulkSalvage(['ore'], { rollDecision: { confirmed: true, rollMode } });
  } finally {
    dice.restore();
  }
  return world.journal.entries.find(([name]) => name === 'chat.bulk')[1].text;
}

test('a bulk subject states its count summary and rows in place of its net only when public', async () => {
  const shown = await bulkCount({ rollMode: 'publicroll', pool: PASS_POOL, faces: PASS_FACES });
  assert.match(shown, /CountEvidence\.Summary .*Simulator\.CountNet .*CountEvidence\.NeededMargin/);
  assert.doesNotMatch(shown, /Chat\.Roll/, 'the summary replaces the roll row');
  const hidden = await bulkCount({ rollMode: 'gmroll', pool: PASS_POOL, faces: PASS_FACES });
  assert.doesNotMatch(hidden, /CountEvidence|Simulator/);
  assert.doesNotMatch(hidden, /Chat\.Roll/, 'a private subject states no net (issue 2054)');
});

test('a zero-pool bulk subject states no total (N32)', async () => {
  const text = await bulkCount({ rollMode: 'publicroll', pool: ZERO_POOL });
  assert.match(text, /CountEvidence\.SummaryZeroBare/);
  assert.doesNotMatch(text, /Chat\.Roll/);
});

test('a prepared count check reports its dice only when it is not secret (N33)', async () => {
  const actor = { getRollData: () => ({}) };
  const run = async (secret) => {
    const dice = installCountDice({ faces: [9, 3], chat: false });
    try {
      return await evaluatePreparedRunCheck(
        preparedCountCheck(),
        actor,
        { rollMode: 'publicroll' },
        { secret }
      );
    } finally {
      dice.restore();
    }
  };
  const visible = await run(false);
  assert.deepEqual(visible.visibility, { rollMode: 'publicroll', secret: false });
  assert.deepEqual(
    visible.countDisplay.results.map((entry) => [entry.face, entry.qualified]),
    [
      [9, true],
      [3, false],
    ]
  );
  const secret = await run(true);
  assert.deepEqual(secret.visibility, { rollMode: 'gmroll', secret: true });
  assert.ok(!('countDisplay' in secret), 'a secret check keeps its dice inside the authority');
  assert.equal(checkDisplayForCard(secret).count, null);
});

test('a prepared count replays the character-value threshold source it captured', async () => {
  const replayed = async (count) => {
    const dice = installCountDice({ faces: [9, 3], chat: false });
    try {
      const prepared = preparedCountCheck({ count });
      const result = await evaluatePreparedRunCheck(
        prepared,
        { getRollData: () => ({}) },
        {
          rollMode: 'publicroll',
        }
      );
      return result.countDisplay.threshold.source;
    } finally {
      dice.restore();
    }
  };
  assert.equal(await replayed({ thresholdSource: 'character' }), 'character');
  assert.equal(await replayed({}), 'fixed', 'a fixed threshold stays fixed');
});

test('a gathering check persists whole, so it keeps no count evidence or visibility (N34)', async () => {
  const gathering = new GatheringEngine({ localize: (key) => key });
  gathering.installVersionedRunAuthority({ evaluatePreparedRunCheck });
  const dice = installCountDice({ faces: [9, 3], chat: false });
  try {
    const evaluated = await gathering.evaluatePreparedVersionedCheck({
      actor: { getRollData: () => ({}) },
      privateEvaluation: preparedCountCheck(),
      decision: { rollMode: 'publicroll' },
    });
    assert.equal(evaluated.data.successes, 1, 'positive control: the pool rolled');
    assert.ok(!('countDisplay' in evaluated) && !('visibility' in evaluated));
  } finally {
    dice.restore();
  }
});
