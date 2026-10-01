/**
 * Issue 2054 — every client receives a ChatMessage's `content` and `flags` whatever its whisper, so
 * a result card for a check that is not public (a gmroll, blindroll or selfroll, or a secret
 * prepared check) states no roll total and no check evidence on the crafting, salvage, bulk salvage
 * and gathering cards. A public roll is the positive control that the detector sees the total.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bulkFacade } from '../src/bootstrap/bulkFacade.js';
import { BulkSalvageService } from '../src/systems/BulkSalvageService.js';
import { evaluatePreparedRunCheck } from '../src/systems/checkRoll.js';
import { buildBulkSalvageChatContent } from '../src/ui/presenters/BulkSalvageChatCard.js';
import { executedCheckDisplay } from '../src/ui/presenters/checkDisplay.js';
import { buildSalvageChatContent } from '../src/ui/presenters/SalvageChatCard.js';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import {
  compendiumSourceItem,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { salvageRunProbe } from './helpers/salvagePipelineProbe.js';

const TOTAL = 17;
const PRIVATE_MODES = ['gmroll', 'blindroll', 'selfroll'];
const EVIDENCE = /data-check-evidence|data-check-count-summary|__dice|__roll-value|fa-skull/;

/** Everything a message broadcasts that Fabricate authored: its content and its flags. */
function broadcast(message) {
  const content = String(message?.content ?? '').replaceAll(/[\u{2060}\u{200B}]/gu, '');
  return `${content} ${JSON.stringify(message?.flags ?? {})}`;
}

const statesTotal = (message) =>
  new RegExp(String.raw`(?<![\d.])${TOTAL}(?!\d)`).test(broadcast(message));

/** Assert no created message states the total or any check evidence, after at least one card. */
function assertWithheld(created, label) {
  assert.ok(created.length > 0, `${label}: a result card was posted`);
  for (const message of created) {
    assert.ok(!statesTotal(message), `${label}: no roll total in content or flags`);
    assert.doesNotMatch(broadcast(message), EVIDENCE, `${label}: no check evidence`);
  }
}

/** A `1d20` that always rolls the total. */
function installRoll() {
  const TotalRoll = class {
    constructor(formula) {
      this.formula = String(formula);
      this.total = TOTAL;
      this.dice = [
        { number: 1, faces: 20, total: TOTAL, results: [{ result: TOTAL, active: true }] },
      ];
    }
    async evaluate() {
      return this;
    }
    evaluateSync() {
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    // The check's own Roll message is Foundry's to show, so it is never recorded as a card.
    async toMessage() {}
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  };
  Object.assign(globalThis, { Roll: TotalRoll });
}

/**
 * Core's V13 `applyRollMode`: every mode but `publicroll` and `selfroll` whispers the GMs, and
 * only `blindroll` is blind. Its whisper protects nothing, since content and flags still reach
 * every client.
 */
function applyRollMode(data, mode) {
  if (mode === 'selfroll') data.whisper = ['user-probe'];
  else if (mode !== 'publicroll') data.whisper = ['gm-1'];
  data.blind = mode === 'blindroll';
  return data;
}

/** A recording `ChatMessage`: every created message is kept whole. */
function installChatMessage(created) {
  const ChatMessage = {
    create: async (data) => {
      created.push(data);
      return { id: `msg-${created.length}` };
    },
    getSpeaker: () => ({ alias: 'Crafter' }),
    applyRollMode,
  };
  Object.assign(globalThis, { ChatMessage });
}

const SIMPLE_CHECK = { rollFormula: '1d20', dc: 10, thresholdMode: 'meet' };

/** A real interactive craft whose prompt answers `rollMode`, or a craft fed `checkResult`. */
async function craftCards({ rollMode = 'publicroll', checkResult = null } = {}) {
  const world = craftProbe({
    features: { craftingChecks: true },
    craftingCheck: { enabled: true, consumption: {}, simple: SIMPLE_CHECK },
    resolutionService: probeResolutionService({ mode: 'simple' }),
    ...(checkResult && { checkResult }),
  });
  globalThis.game.i18n.localize = shippedLocalize;
  const created = [];
  installRoll();
  installChatMessage(created);
  const prompt = stubPromptSurface(() => ({ confirmed: true, rollMode }));
  const result = await world.craft(null, { interactive: true }).finally(prompt.restore);
  delete globalThis.Roll;
  return { result, created };
}

/** A real interactive single salvage rolled under `rollMode`. */
async function salvageCards(rollMode) {
  const world = salvageProbe({ salvageCraftingCheck: { simple: SIMPLE_CHECK, consumption: {} } });
  const created = [];
  installRoll();
  installChatMessage(created);
  const result = await world.salvage({ interactive: true, rollDecision: { rollMode } });
  delete globalThis.Roll;
  return { result, created };
}

/** A real bulk salvage of one target, posted through the facade's real aggregate-card poster. */
async function bulkCards(rollMode) {
  const world = salvageRunProbe({
    salvageCraftingCheck: { simple: SIMPLE_CHECK },
    awards: [{ id: 'shard', name: 'Shard' }],
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
  });
  const created = [];
  installRoll();
  installChatMessage(created);
  const service = new BulkSalvageService({
    salvage: (...args) => world.engine.salvage(...args),
    getCraftingSystem: () => world.system,
    promptRollDecision: async () => ({ confirmed: true, bonus: 0, rollMode, advantage: null }),
    postChatMessage: (message) => bulkFacade._postBulkSalvageChatMessage(message),
  });
  const { actor } = world;
  const report = await service.run({
    targets: [
      {
        actorUuid: actor.uuid,
        actorId: actor.id,
        actorName: actor.name,
        systemId: world.system.id,
        componentId: 'ore',
      },
    ],
  });
  delete globalThis.Roll;
  return { report, created };
}

/** The GM-side answer a secret (or visible) prepared check sends back to the crafting client. */
async function preparedCheck(secret) {
  installRoll();
  try {
    return await evaluatePreparedRunCheck(
      { rollFormula: '1d20', slot: 'simple', checkConfig: {}, decisionPolicy: { dc: 10 } },
      { getRollData: () => ({}) },
      { rollMode: 'publicroll' },
      { secret }
    );
  } finally {
    delete globalThis.Roll;
  }
}

test('a public craft, salvage and bulk card states the total (positive control)', async () => {
  const craft = await craftCards();
  assert.equal(craft.result.success, true);
  const salvage = await salvageCards('publicroll');
  const bulk = await bulkCards('publicroll');
  assert.equal(bulk.report.posted, true);
  for (const [label, { created }] of Object.entries({ craft, salvage, bulk })) {
    assert.equal(created.length, 1, `${label}: one card`);
    assert.ok(statesTotal(created[0]), `${label}: the detector sees a public total`);
  }
});

for (const rollMode of PRIVATE_MODES) {
  test(`a ${rollMode} craft card states its outcome and no total`, async () => {
    const { result, created } = await craftCards({ rollMode });
    assert.equal(result.success, true);
    assertWithheld(created, `craft ${rollMode}`);
    assert.ok(!('whisper' in created[0]), 'and is not whispered to compensate');
    assert.match(String(created[0].content), /fa-circle-check/, 'the Success pill stays');
  });

  test(`a ${rollMode} salvage card states no total`, async () => {
    const { result, created } = await salvageCards(rollMode);
    assert.equal(result.success, true);
    assertWithheld(created, `salvage ${rollMode}`);
    assert.ok(!('whisper' in created[0]), 'and is not whispered to compensate');
    assert.match(String(created[0].content), /SalvageSuccess/, 'the outcome stays');
  });

  test(`a ${rollMode} bulk card states no subject total`, async () => {
    const { report, created } = await bulkCards(rollMode);
    assert.equal(report.items[0].outcome, 'succeeded');
    assertWithheld(created, `bulk ${rollMode}`);
  });
}

test('a craft fed a secret prepared check states no total; a visible one does', async () => {
  const secret = await preparedCheck(true);
  assert.equal(secret.data.total, TOTAL, 'positive control: the authority rolled the total');
  assertWithheld((await craftCards({ checkResult: secret })).created, 'craft secret');
  const visible = await craftCards({ checkResult: await preparedCheck(false) });
  assert.ok(statesTotal(visible.created[0]), 'a visible prepared check states its total');
});

test('a secret display withholds the salvage and bulk totals the builders are handed', async () => {
  const secret = executedCheckDisplay(await preparedCheck(true));
  const salvage = buildSalvageChatContent({ status: 'succeeded', rollValue: TOTAL, check: secret });
  const bulk = buildBulkSalvageChatContent({
    status: 'succeeded',
    subjects: [{ name: 'Iron Ore', outcome: 'succeeded', rollValue: TOTAL, check: secret }],
  });
  assertWithheld([{ content: salvage }], 'salvage secret');
  assertWithheld([{ content: bulk }], 'bulk secret');
});

const SCRAP_UUID = 'Compendium.fixture.materials.Item.scrap';

/** A real routed gathering attempt rolled under the client mode `rollMode`, or a versioned one fed
 * the authority's `resolved` answer. */
async function gatherCards({ rollMode = 'publicroll', resolved = null } = {}) {
  const fixture = gatheringFixture({
    mode: 'routed',
    chatOutput: true,
    components: [{ id: 'scrap', name: 'Scrap', registeredItemUuid: SCRAP_UUID, difficulty: 1 }],
    resultGroups: [
      { id: 'yield', name: 'Yield', results: [{ id: 'r', componentId: 'scrap', quantity: 2 }] },
    ],
  });
  const outcome = await runRealGatheringAttempt({
    ...fixture,
    sources: { [SCRAP_UUID]: compendiumSourceItem({ uuid: SCRAP_UUID, name: 'Scrap', img: '' }) },
    rollTotal: TOTAL,
    versioned: Boolean(resolved),
    resolvedCheckResult: resolved,
    beforeStart: () => {
      globalThis.game.settings = { get: () => rollMode };
    },
  });
  return { ...outcome, created: outcome.chat };
}

test('a gathering card states no total whatever the roll mode or secrecy', async () => {
  const resolved = { ...(await preparedCheck(true)), status: 'success', outcome: 'Yield' };
  const runs = [
    ...['publicroll', ...PRIVATE_MODES].map((rollMode) => ({ rollMode })),
    { resolved },
  ];
  for (const run of runs) {
    const label = `gather ${run.rollMode ?? 'secret'}`;
    const { created, record, error } = await gatherCards(run);
    assert.equal(error, null);
    assert.ok(JSON.stringify(record).includes(`"total":${TOTAL}`), `${label}: it rolled the total`);
    assertWithheld(created, label);
  }
});
