/**
 * Issue 2005 — a result card posted by a real salvage or craft states the executed check's evidence
 * rows only for a public, non-secret roll, on a V13 (`applyRollMode`) and a V14 (`applyMode`) build,
 * and a hostile modifier label posts with no enrichment pattern left in the card.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { craftProbe, probeResolutionService, salvageProbe } from './helpers/craftPipelineProbe.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';
import { stubRoll } from './helpers/routedCheckEngine.js';
import { salvageRunProbe } from './helpers/salvagePipelineProbe.js';

const ROLL_MODES = ['publicroll', 'gmroll', 'blindroll', 'selfroll'];
const HOSTILE_LABEL = '[[1d20]] @abilities.str.value';

/** A `1d4` (or `(1d4)`) totals 3 and any other formula 9 as 2, 4 and 3; every posted roll message
 * is recorded. */
function installRoll(rollMessages) {
  globalThis.Roll = class EvidenceRoll {
    constructor(formula) {
      this.formula = String(formula);
      const constant = Number(this.formula);
      if (Number.isFinite(constant)) this.total = constant;
      else this.total = this.formula.replaceAll(/[()\s]/g, '') === '1d4' ? 3 : 9;
      const faces = [2, 4, 3].map((result) => ({ result }));
      this.dice = Number.isFinite(constant)
        ? []
        : [{ number: 3, faces: 6, total: this.total, results: faces }];
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
    async toMessage(data, options) {
      rollMessages.push(options);
    }
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  };
}

/** A V13 or V14 `ChatMessage` whose created messages are recorded whole. */
function installChatMessage(version, created) {
  const applier =
    version === 13
      ? { applyRollMode: (data, mode) => Object.assign(data, { rollMode: mode }) }
      : { applyMode: (data, mode) => Object.assign(data, { messageMode: mode }) };
  globalThis.ChatMessage = {
    create: async (data) => {
      created.push(data);
      return { id: `msg-${created.length}` };
    },
    getSpeaker: () => ({ alias: 'Salvager' }),
    ...applier,
  };
}

/** A real sum/under salvage against character value 12 with −2 and a rolled 1d4 library bonus. */
async function salvageAs(version, rollMode) {
  const world = salvageProbe({
    salvageCraftingCheck: {
      simple: {
        rollFormula: '3d6',
        evaluation: {
          product: 'sum',
          direction: 'under',
          target: { source: 'attribute', expression: '@skills.craft.value' },
        },
      },
      consumption: { consumeComponentOnFail: true },
      defaultModifierIds: ['steady'],
    },
  });
  const system = globalThis.game.fabricate.getCraftingSystemManager().getSystem('sys-salvage');
  system.modifiers = [{ id: 'steady', label: HOSTILE_LABEL, expression: '1d4' }];
  system.components[0].salvage.adjustmentOverride = -2;
  world.actor.system.skills = { craft: { value: 12 } };
  globalThis.game.i18n.localize = shippedLocalize;
  const created = [];
  const rollMessages = [];
  installRoll(rollMessages);
  installChatMessage(version, created);
  const result = await world.salvage({ interactive: true, rollDecision: { rollMode } });
  delete globalThis.Roll;
  const cards = created.filter((data) => String(data.content).includes('fabricate-craft-chat'));
  return { result, cards, rollMessages };
}

for (const version of [13, 14]) {
  for (const rollMode of ROLL_MODES) {
    test(`V${version} ${rollMode}: the card states evidence only for a public roll`, async () => {
      const { result, cards, rollMessages } = await salvageAs(version, rollMode);
      assert.equal(result.success, true, 'the 3d6 of 9 stays at or under 13');
      assert.equal(cards.length, 1);
      const [card] = cards;
      assert.ok(!('whisper' in card) && !('blind' in card), 'a result card is never whispered');
      assert.ok(!card.flags?.fabricate, 'and carries no evidence flags');
      assert.equal(card.rolls, undefined, 'and no pre-roll Roll instances');
      const modeKey = version === 13 ? 'rollMode' : 'messageMode';
      assert.ok(rollMessages.every((options) => modeKey in options), `the roll used ${modeKey}`);
      const content = String(card.content);
      if (rollMode === 'publicroll') {
        assert.match(content, /data-check-evidence="target"/);
        assert.match(content, /data-check-evidence="preRolled"/);
        assert.match(content, /data-check-evidence="margin"/);
        // 12 − 2, raised by the rolled 1d4 of 3, against the 3d6 of 9.
        assert.ok(
          content
            .replaceAll('\u2060', '')
            .includes('13 · Salvager @skills.craft.value 12, difficulty −2, modifiers +3')
        );
        assert.ok(content.includes('+4 under the target'));
      } else {
        assert.doesNotMatch(content, /evidence|character value|under the target/);
      }
    });
  }
}

test('a hostile label posts with no inline-roll opener and no @ reference left to enrich', async () => {
  const { cards } = await salvageAs(14, 'publicroll');
  const content = String(cards[0].content);
  assert.ok(content.includes('abilities.str.value'), 'positive control: the label was posted');
  assert.doesNotMatch(content, /\[\[/);
  assert.doesNotMatch(content, /@\w/);
});

/** A real sum/under craft against Hard Work's −2 on character value 12, with a rolled 1d4 bonus. */
async function craftAs(version, rollMode) {
  const world = craftProbe({
    features: { craftingChecks: true },
    craftingCheck: {
      enabled: true,
      consumption: {},
      defaultModifierIds: ['steady'],
      simple: {
        rollFormula: '3d6',
        dc: 10,
        evaluation: {
          product: 'sum',
          direction: 'under',
          target: { source: 'attribute', expression: '@skills.craft.value', adjustmentKind: 'add' },
        },
        tiers: [{ id: 'hard', name: 'Hard Work', adjustment: -2 }],
      },
    },
    resolutionService: probeResolutionService({ mode: 'simple' }),
  });
  world.system.modifiers = [{ id: 'steady', label: 'Steady hands', expression: '1d4' }];
  world.recipe.checkTierId = 'hard';
  world.craftingActor.system.skills = { craft: { value: 12 } };
  globalThis.game.i18n.localize = shippedLocalize;
  const created = [];
  installRoll([]);
  installChatMessage(version, created);
  const prompt = stubPromptSurface(() => ({ confirmed: true, rollMode }));
  const result = await world.craft(null, { interactive: true }).finally(prompt.restore);
  delete globalThis.Roll;
  const cards = created.filter((data) => String(data.content).includes('fabricate-craft-chat'));
  return { result, cards };
}

/** The card with its invisible enrichment joiners removed. */
const readable = (card) => String(card.content).replaceAll('\u2060', '');

for (const version of [13, 14]) {
  test(`V${version}: a public craft card states the pill, dice line and ruled rows (QE3)`, async () => {
    const { result, cards } = await craftAs(version, 'publicroll');
    assert.equal(result.success, true, 'the 3d6 of 9 stays at or under 13');
    assert.equal(cards.length, 1);
    const content = readable(cards[0]);
    assert.ok(content.includes('fa-circle-check" aria-hidden="true"></i>Success</div>'));
    assert.ok(content.includes('3d6 (2 + 4 + 3) = 9, compared as rolled'));
    assert.ok(content.includes('13 · Crafter @skills.craft.value 12, Hard Work −2, modifiers +3'));
    assert.ok(content.includes('Steady hands 1d4 rolled 3, raising the target'));
    assert.ok(content.includes('+4 under the target'));
  });

  for (const rollMode of ROLL_MODES.slice(1)) {
    test(`V${version} ${rollMode}: a private craft card states no dice line or rows`, async () => {
      const { cards } = await craftAs(version, rollMode);
      const content = readable(cards[0]);
      assert.doesNotMatch(content, /evidence|__dice|under the target|Crafter @/);
      assert.match(content, /__roll-value">9</, 'it keeps the bare total');
    });
  }
}

test('a failed bulk subject states its own evidence rows on the aggregate card (QE8 G8)', async () => {
  const world = salvageRunProbe({
    salvageCraftingCheck: {
      simple: {
        rollFormula: '1d20',
        dc: 10,
        thresholdMode: 'meet',
        evaluation: { product: 'sum', direction: 'under' },
      },
    },
    targets: [
      {
        id: 'ore',
        name: 'Iron Ore',
        quantity: 3,
        ingredientQuantity: 1,
        resultGroups: [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 2 }] }],
      },
    ],
    awards: [{ id: 'shard', name: 'Shard' }],
  });
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  await world.bulkSalvage(['ore']);
  delete globalThis.Roll;
  const [, { text }] = world.journal.entries.find(([name]) => name === 'chat.bulk');
  assert.match(text, /BulkSalvageOutcomeFailed/, 'positive control: the 17 fails a target of 10');
  assert.match(text, /Evidence\.Target .*Evidence\.Margin/, 'the failure publishes its check');
});
