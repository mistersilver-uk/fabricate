/**
 * Issue 2005 — a result card posted by a real salvage states the executed check's evidence rows
 * only for a public, non-secret roll, on a V13 (`applyRollMode`) and a V14 (`applyMode`) build, and
 * a hostile modifier label posts with no enrichment pattern left in the card.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';
import { salvageProbe } from './helpers/craftPipelineProbe.js';

const ROLL_MODES = ['publicroll', 'gmroll', 'blindroll', 'selfroll'];
const HOSTILE_LABEL = '[[1d20]] @abilities.str.value';

/** A `1d4` totals 3 and any other formula 9; every posted roll message is recorded. */
function installRoll(rollMessages) {
  globalThis.Roll = class EvidenceRoll {
    constructor(formula) {
      this.formula = String(formula);
      const constant = Number(this.formula);
      if (Number.isFinite(constant)) this.total = constant;
      else this.total = this.formula === '1d4' ? 3 : 9;
      this.dice = Number.isFinite(constant) ? [] : [{ number: 3, faces: 6, total: this.total }];
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
