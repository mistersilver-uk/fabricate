/** The View Lab's `Roll` class (issue 859). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getCaseById } from '../scripts/lib/viewLabCases.js';
import { resolveSalvageCheck } from '../src/systems/salvageCheckUsability.js';
import { hasPlainD20 } from '../src/utils/craftingCheckExpression.js';

import { createLabRoll } from './view-lab/foundry/labRoll.js';
import { installLabRandom } from './view-lab/foundry/labRandom.js';
import { installFoundryShim } from './view-lab/foundry/installFoundryShim.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import { buildLabActors } from './view-lab/world/labActors.js';
import {
  rolledDiceGroups,
  evaluateCheckRoll,
  evaluatePreparedRunCheck,
  postCheckRollHandoff,
} from '../src/systems/checkRoll.js';
import {
  buildCheckModifierChoice,
  buildCheckModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
} from '../src/systems/checkModifierResolver.js';

/** The two statics the shim hands through, reproduced verbatim from `installFoundryShim.js`. */
const STATICS = {
  replaceFormulaData(formula, data = {}, { missing = 'NaN' } = {}) {
    return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
      const value = String(path)
        .split('.')
        .reduce((current, part) => (current == null ? undefined : current[part]), data);
      return value === undefined || value === null ? missing : String(value);
    });
  },
  validate(formula) {
    return !/NaN|@/.test(String(formula));
  },
};

/**
 * Build a `Roll` over a freshly seeded stream, so every test starts at draw 0.
 *
 * @param {number} [seed] The seed; defaults to the lab's own.
 * @returns {Function} A `Roll` class.
 */
function makeRoll(seed = LIVE_SEED) {
  const random = installLabRandom({ seed });
  // `installLabRandom` swaps the realm's `Math.random`/`Date.now`; restore immediately. Only the
  // generator function itself is wanted here, and leaking the swap would poison sibling tests.
  random.restore();
  return createLabRoll({
    random: random.random,
    replaceFormulaData: STATICS.replaceFormulaData,
    validate: STATICS.validate,
  });
}

/**
 * The seed the lab actually renders with, read out of `labWorld.js`'s own default rather than
 * copied. A copy is what let the reviewer change `labWorld.js`'s seed with this whole file green.
 */
const LIVE_SEED = (() => {
  const source = readFileSync(new URL('./view-lab/world/labWorld.js', import.meta.url), 'utf8');
  const match = /seed\s*=\s*([\d_]+)/.exec(source);
  assert.ok(match, 'labWorld.js no longer declares a default seed');
  return Number(match[1].replaceAll('_', ''));
})();

test('the seeded smithing check clears its own threshold', () => {
  // The COMPOSED invariant, not three copied literals.
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const smithing = content.systems.find((system) => system.id === 'lab-smithing');
  assert.ok(smithing, 'the smithing fixture system exists');
  const { rollFormula, thresholds } = smithing.craftingCheck.simple;
  const brenna = actors.find((actor) => actor.id === 'lab-actor-brenna');
  assert.ok(brenna, 'Brenna exists');

  const Roll = makeRoll();
  const roll = new Roll(rollFormula, brenna.getRollData());
  return roll.evaluate().then((evaluated) => {
    assert.ok(
      evaluated.total >= thresholds.success,
      `the seeded smithing craft must clear its threshold, or the two craft frames stop showing a ` +
        `successful craft: rolled ${evaluated.total} of ${rollFormula} against ${thresholds.success}`
    );
  });
});

test('the bulk roll prompt frame is what its own subjects authored', () => {
  // COMPOSED, and about a frame that exists: `player-inventory-bulk-roll-prompt` publishes the ONE
  // dialog a whole batch answers, and two of its visible properties are decided entirely by fixture
  // data rather than by anything the panel does.
  const viewCase = getCaseById('player-inventory-bulk-roll-prompt');
  assert.ok(viewCase, 'the bulk roll-prompt case is still in the registry');

  const keys = (viewCase.steps ?? [])
    .map((step) => /data-inventory-card="([^"]+)"/.exec(step?.selector ?? '')?.[1])
    .filter(Boolean);
  assert.equal(keys.length, 2, `expected the case to select two cards, saw ${keys.join(', ')}`);

  // A card key is `<systemId>:<componentId>`, and the system half is the participation the row
  // ACTS on: a bulk row acts on the selected participation when its card is the inspected one and
  // the primary otherwise, and both of these cards resolve to the system their key names.
  const content = buildLabContent();
  const checks = keys.map((key) => {
    const systemId = key.slice(0, key.indexOf(':'));
    const system = content.systems.find((entry) => entry.id === systemId);
    assert.ok(system, `the case selects a card from "${systemId}", which the world no longer has`);
    return { key, ...resolveSalvageCheck(system) };
  });

  const usable = checks.filter((check) => check.checkUsable);
  assert.deepEqual(
    checks.map((check) => `${check.key}=${check.checkUsable}`),
    ['lab-herbalism:hb-cracked-alembic=true', 'lab-smithing:sm-air-shard=false'],
    'the published frame is a MIXED batch — one subject that rolls and one that does not — over a ' +
      'heading that counts BOTH. Changing which is which changes the picture'
  );
  assert.ok(
    usable.length > 0,
    'no subject in the batch has a usable salvage check, so the service would never prompt and ' +
      'the case can no longer be captured'
  );
  assert.ok(
    usable.every((check) => hasPlainD20(check.rollFormula)),
    `the frame publishes an Advantage / Normal / Disadvantage row, which the service offers only ` +
      `when EVERY usable-check subject's authored formula carries a plain 1d20: ` +
      `${usable.map((check) => `${check.key} rolls ${check.rollFormula}`).join(', ')}`
  );
});

test('the same seed replays the same faces', async () => {
  const first = await new (makeRoll())('4d6 + 2').evaluate();
  const second = await new (makeRoll())('4d6 + 2').evaluate();
  assert.deepEqual(second.dice, first.dice, 'identical dice');
  assert.equal(second.total, first.total, 'identical total');
  // A different seed must actually differ, or "deterministic" is indistinguishable from "constant".
  const other = await new (makeRoll(1))('4d6 + 2').evaluate();
  assert.notDeepEqual(other.dice, first.dice, 'a different seed rolls differently');
});

test('evaluate resolves to this, and is idempotent', async () => {
  const Roll = makeRoll();
  const roll = new Roll('2d8');
  const evaluated = await roll.evaluate({ allowInteractive: false });
  assert.equal(evaluated, roll, 'evaluate resolves to the roll itself');
  const total = roll.total;
  await roll.evaluate();
  assert.equal(roll.total, total, 're-evaluating does not re-roll');
  assert.equal(roll.dice.length, 1, 're-evaluating does not append a second die group');
});

test('the die shape is the one rolledDiceGroups reads', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('3d6 + 1').evaluate();
  const [die] = roll.dice;
  assert.equal(die.number, 3);
  assert.equal(die.faces, 6);
  assert.equal(die.results.length, 3);
  // `active: true` on a kept result, matching every Foundry-shaped dice fixture in this repo
  // (`check-roll.test.js`, `check-roll-dice.test.js`, `check-roll-tier-step.test.js`).
  assert.ok(
    die.results.every((entry) => entry.active === true),
    'a kept result is explicitly active'
  );
  assert.equal(
    die.total,
    die.results.reduce((sum, entry) => sum + entry.result, 0),
    'die.total is the sum of its faces when nothing is dropped'
  );
  const [group] = rolledDiceGroups(roll);
  assert.equal(group.group, '3d6');
  assert.equal(group.sum, die.total);
  assert.equal(group.results.length, 3, 'every face is active');
});

test('kh keeps the highest and marks the rest inactive', async () => {
  const Roll = makeRoll();
  // `2d20kh1` is exactly what `applyD20Advantage` emits for advantage.
  const roll = await new Roll('2d20kh1').evaluate();
  const [die] = roll.dice;
  assert.equal(die.results.length, 2, 'both faces are recorded');
  const dropped = die.results.filter((entry) => entry.active === false);
  assert.equal(dropped.length, 1, 'exactly one face is dropped');
  const kept = die.results.filter((entry) => entry.active !== false);
  assert.equal(die.total, kept[0].result, 'the total is the kept face');
  assert.ok(kept[0].result >= dropped[0].result, 'kh keeps the higher face');
  assert.equal(roll.total, die.total);
  // And the consumer agrees: the dropped face must not reach the active-only face list.
  const [group] = rolledDiceGroups(roll);
  assert.equal(group.results.length, 1, 'rolledDiceGroups sees only the kept face');
});

test('kl keeps the lowest', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('2d20kl1').evaluate();
  const [die] = roll.dice;
  const kept = die.results.filter((entry) => entry.active !== false);
  const dropped = die.results.filter((entry) => entry.active === false);
  assert.equal(kept.length, 1);
  assert.ok(kept[0].result <= dropped[0].result, 'kl keeps the lower face');
  assert.equal(die.total, kept[0].result);
});

test('roll data substitutes, and a missing key contributes zero', async () => {
  const Roll = makeRoll();
  // `missing: '0'` inside evaluate mirrors Foundry's behaviour for a Roll constructed WITH data:
  // an unresolved key contributes nothing rather than producing NaN.
  const roll = await new Roll('1d20 + @nope.missing', {}).evaluate();
  assert.ok(Number.isFinite(roll.total), 'an unresolved key does not produce NaN');
  assert.equal(roll.total, roll.dice[0].total, 'it contributes exactly zero');
});

test('a bare dN defaults to one die', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('d20').evaluate();
  assert.equal(roll.dice[0].number, 1);
  assert.equal(roll.dice[0].results.length, 1);
});

test('toMessage routes to ChatMessage.create and tolerates its absence', async () => {
  const Roll = makeRoll();
  const roll = await new Roll('1d6').evaluate();
  const created = [];
  const previous = globalThis.ChatMessage;
  try {
    globalThis.ChatMessage = {
      async create(data) {
        created.push(data);
        return { _id: 'lab-chat-0', ...data };
      },
    };
    const message = await roll.toMessage({ flavor: 'Crafting · Herbalism' }, { rollMode: 'roll' });
    assert.equal(created.length, 1);
    assert.equal(created[0].flavor, 'Crafting · Herbalism');
    assert.deepEqual(created[0].rolls, [roll], 'the roll is carried on `rolls`');
    assert.equal(created[0].rollMode, 'roll');
    assert.equal(message._id, 'lab-chat-0');

    // `create: false` returns the data without posting.
    const data = await roll.toMessage({}, { create: false });
    assert.equal(created.length, 1, 'create:false posts nothing');
    assert.deepEqual(data.rolls, [roll]);

    // No ChatMessage at all must not throw — `checkRoll.js` console.errors on a throw here, and
    // the capture driver fails a case on any console error.
    globalThis.ChatMessage = undefined;
    assert.equal(await roll.toMessage({}), null);
  } finally {
    globalThis.ChatMessage = previous;
  }
});

test('evaluated Roll snapshots survive JSON transport without consuming seeded entropy', async () => {
  const Roll = makeRoll();
  const ControlRoll = makeRoll();
  const formula = '2d20kh1 + @prof + 1d4 [Tool]';
  const options = { flavor: 'Smithing', custom: { source: 'check' } };
  const original = await new Roll(formula, { prof: 3 }, options).evaluate();
  await new ControlRoll(formula, { prof: 3 }).evaluate();
  const snapshot = original.toJSON();
  assert.deepEqual(
    Object.keys(snapshot).sort((a, b) => a.localeCompare(b)),
    ['class', 'dice', 'evaluated', 'formula', 'options', 'terms', 'total']
  );
  assert.equal(snapshot.class, 'LabRoll');
  assert.equal(snapshot.evaluated, true, 'core uses evaluated, not _evaluated, on the wire');
  assert.equal(snapshot.formula, '2d20kh1 + 3 + 1d4 [Tool]');
  assert.equal(snapshot.total, original.total);
  assert.deepEqual(snapshot.options, options);
  const transported = JSON.parse(JSON.stringify(snapshot));
  const restored = Roll.fromData(transported);
  assert.ok(restored instanceof Roll);
  assert.deepEqual(restored.terms, original.terms);
  assert.deepEqual(restored.dice, original.dice);
  assert.equal(restored.result, original.result);
  assert.equal(restored.formula, original.formula);
  assert.equal(restored._evaluated, true);
  assert.equal(await restored.evaluate(), restored);
  assert.equal(restored.total, original.total);
  assert.deepEqual(rolledDiceGroups(restored), rolledDiceGroups(original));
  const message = await restored.toMessage(
    { flags: { fabricate: { check: true } } },
    { messageMode: 'self', create: false }
  );
  assert.equal(message.messageMode, 'self');
  assert.deepEqual(message.flags, { fabricate: { check: true } });
  assert.equal(message.rolls[0], restored);
  assert.deepEqual(
    (await new Roll('4d20').evaluate()).dice,
    (await new ControlRoll('4d20').evaluate()).dice,
    'restore/evaluate/post consumed no draws'
  );
  snapshot.terms[0].results[0].result = -1;
  transported.options.custom.source = 'changed';
  transported.dice[0].results[0].result = -2;
  assert.ok(original.terms[0].results[0].result > 0, 'serialization detached nested results');
  assert.ok(restored.dice[0].results[0].result > 0, 'restoration detached nested results');
  assert.equal(restored.options.custom.source, 'check');
});

test('Roll reconstruction preserves zero totals and unevaluated state', async () => {
  const Roll = makeRoll();
  const zero = await new Roll('0').evaluate();
  assert.equal(Roll.fromData(JSON.parse(JSON.stringify(zero))).total, 0);
  const pending = Roll.fromData(
    JSON.parse(JSON.stringify(new Roll('1d6 + @prof', { prof: 2 })))
  );
  assert.equal(pending._evaluated, false);
  assert.equal(pending.total, undefined);
  assert.deepEqual(pending.dice, []);
  const expected = await new (makeRoll())('1d6 + 2').evaluate();
  assert.equal((await pending.evaluate()).total, expected.total);
});

test('prepared run checks hand the evaluated lab roll to player chat on both chat APIs', async (t) => {
  for (const [api, modeOption] of [
    ['v13', 'rollMode'],
    ['v14', 'messageMode'],
  ]) {
    await t.test(api, async (t) => {
      const Roll = makeRoll();
      const ControlRoll = makeRoll();
      const posted = [];
      const previous = ['Roll', 'ChatMessage'].map((key) => [
        key, Object.getOwnPropertyDescriptor(globalThis, key),
      ]);
      t.after(() => {
        for (const [key, descriptor] of previous) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else delete globalThis[key];
        }
      });
      globalThis.Roll = Roll;
      globalThis.ChatMessage = {
        ...(api === 'v14' ? { applyMode() {} } : {}),
        async create(data) {
          posted.push(data);
          return data;
        },
      };
      const speaker = { actor: 'lab-actor-brenna', alias: 'Brenna' };
      const preparation = {
        rollFormula: '1d20 + @prof',
        slot: 'simple',
        checkConfig: { dc: 1 },
        flavor: 'Crafting · Smithing',
        speaker,
      };
      const result = await evaluatePreparedRunCheck(
        preparation,
        { getRollData: () => ({ prof: 3 }) },
        { allowAdvantage: true, advantage: 'advantage', rollMode: 'selfroll' }
      );
      assert.equal(result.success, true);
      assert.equal(posted.length, 0, 'authority evaluation does not post the visible check');
      assert.ok(result.rollHandoff?.serializedRoll, 'authority produces a serializable handoff');
      const handoff = JSON.parse(JSON.stringify(result.rollHandoff));
      assert.deepEqual(await postCheckRollHandoff(handoff, { Roll }), { success: true });
      assert.equal(posted.length, 1);
      const message = posted[0];
      assert.deepEqual(message.speaker, speaker);
      assert.equal(message.flavor, preparation.flavor);
      assert.equal(message[modeOption], api === 'v14' ? 'self' : 'selfroll');
      assert.equal(message.rolls[0].total, result.data.total);
      assert.deepEqual(rolledDiceGroups(message.rolls[0]), result.data.diceGroups);
      assert.equal(message.rolls[0]._evaluated, true);
      await new ControlRoll('2d20kh1 + 3').evaluate();
      assert.deepEqual(
        (await new Roll('4d20').evaluate()).dice,
        (await new ControlRoll('4d20').evaluate()).dice
      );
    });
  }
});

test('the statics behave exactly as the object they replaced', () => {
  const Roll = makeRoll();
  // Pinned because ~15 recipe check cards render off `replaceFormulaData`, and
  // `resolveCheckFormulaDisplay` gates its `resolved` flag on `validate`.
  assert.equal(Roll.replaceFormulaData('1d20 + @prof', { prof: 3 }), '1d20 + 3');
  assert.equal(
    Roll.replaceFormulaData('1d20 + @prof', {}, { missing: 'NaN' }),
    '1d20 + NaN',
    'an unresolved key yields the requested missing marker'
  );
  assert.equal(Roll.replaceFormulaData('1d20 + @a.b.c', { a: { b: { c: 7 } } }), '1d20 + 7');
  assert.equal(Roll.validate('1d20 + 3'), true);
  assert.equal(Roll.validate('1d20 + @x'), false);
  assert.equal(Roll.validate('1d20 + NaN'), false);
});

test('the shim installs a Roll CONSTRUCTOR, so evaluateCheckRoll reaches the prompt', async () => {
  // COMPOSITION, and the reason this test exists: every other test here imports `createLabRoll`
  // directly, so reverting `installFoundryShim.js` to the pre-change two-static object left the
  // whole capability gone with the suite green.
  const content = buildLabContent();
  const actors = buildLabActors(content);
  const previous = { Roll: globalThis.Roll, game: globalThis.game, ui: globalThis.ui };
  try {
    installFoundryShim({
      seed: LIVE_SEED,
      actorList: actors,
      scenes: [],
      settings: new Map(),
      i18n: { localize: (key) => key, format: (key) => key },
      worldTime: 0,
      documents: new Map(),
    });
    assert.equal(typeof globalThis.Roll, 'function', 'the shim installs a Roll constructor');

    let prompted = false;
    const result = await evaluateCheckRoll(
      '1d20 + 3',
      { getRollData: () => ({}) },
      {
        interactive: true,
        prompt: async () => {
          prompted = true;
          return { confirmed: true };
        },
      }
    );
    assert.equal(result.engine, true, 'the check is engine-evaluated rather than short-circuited');
    assert.ok(prompted, 'the interactive prompt is reached');
  } finally {
    globalThis.Roll = previous.Roll;
    globalThis.game = previous.game;
    globalThis.ui = previous.ui;
  }
});

// The `player-crafting-roll-prompt` frame's PREMISE, read from the fixtures rather than assumed
// (issues 1055, 1094).
test('the lab fixtures still reach the interactive modifier fieldset (issues 1055, 1094)', () => {
  const content = buildLabContent();
  const herbalism = content.systems.find((system) => system.id === 'lab-herbalism');
  assert.ok(herbalism, 'the herbalism fixture system exists');
  const stillroom = content.recipes.find((recipe) => recipe.id === 'hb-r-stillroom');
  assert.ok(stillroom, 'the roll-prompt case’s recipe exists');

  // The rule is the SYSTEM's, full stop. A recipe may carry a pick, never a rule.
  const active = resolveActiveCraftingCheckFormula(herbalism);
  assert.ok(
    active.checkUsable,
    'the active mode still carries an authored roll formula — without one the engine offers no choice'
  );
  // Read the AUTHORED field, not `active.rollFormula`.
  const authoredFormula = herbalism?.craftingCheck?.[active.slot]?.rollFormula ?? '';
  assert.ok(authoredFormula.trim() !== '', 'the fixture authors a formula on the active slot');
  assert.equal(
    authoredFormula.includes('@craftingmod'),
    false,
    'and the FIXTURE seeds no retired placeholder, so the capture case does not depend on one'
  );
  // The lab fixture authors its two libraries at their PRE-MIGRATION locations on purpose (issues
  // 1095 C13, 1117), so the lab BUILD's migration pass is what lifts and merges them.
  const migrated = {
    ...herbalism,
    modifiers: herbalism.craftingCheck?.checkModifiers,
  };
  const context = buildCheckModifierContext(migrated, 'crafting', stillroom);
  assert.equal(
    resolveModifierPolicy(context),
    'playerPicks',
    'the effective rule is playerPicks; authored anywhere but the SYSTEM it is not honoured'
  );

  // …and the descriptor the prompt renders from. `null` here is the failure the CI capture
  // reported: the dialog opens with no fieldset in it.
  const choice = buildCheckModifierChoice(context, () => 1);
  assert.ok(choice, 'a modifier-choice descriptor is built');
  assert.ok(
    choice.modifiers.length >= 2,
    `the two-option floor is cleared (${choice.modifiers.length} eligible)`
  );
  assert.ok(
    choice.maxPicks >= 2,
    'the cap leaves room for a MULTI-pick checkbox group rather than a pick-one radio group'
  );
});
