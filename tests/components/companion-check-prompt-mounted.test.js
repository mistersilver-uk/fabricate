/**
 * A companion's interactive Standalone Check Roll, composed end to end (issue 2006): the facade's
 * own seams, the real prompt adapter and ManagerModal host on the standalone overlay, the player's
 * answer, the posted Roll and the grade, for every published capability row and target source.
 */
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';

import { companionFacade } from '../../src/bootstrap/companionFacade.js';
import { CHECK_EVALUATION_CAPABILITIES } from '../../src/systems/companionCheckEvaluation.js';
import { rollActorCheck } from '../../src/systems/companionCheckRoll.js';
import { CHECK_ROLL_MESSAGE_KEYS } from '../../src/systems/companionContract.js';
import { overrideRollPromptSurface } from '../../src/ui/svelte/apps/crafting/rollPrompt.js';
import { openRollPromptModal } from '../../src/ui/svelte/apps/crafting/rollPromptHost.js';
import { installCountDice } from '../helpers/countEngineDice.js';
import { countEvaluation } from '../helpers/countFixtures.js';
import {
  ROLL_PROMPT_COMPILED_MODULES,
  ROLL_PROMPT_PATH,
  ROLL_PROMPT_RAW_MODULES,
} from '../helpers/rollPromptHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-companion-prompt-',
  componentPath: ROLL_PROMPT_PATH,
  rawModules: ROLL_PROMPT_RAW_MODULES,
  compiledModules: ROLL_PROMPT_COMPILED_MODULES,
  rootClass: 'fabricate fabricate-app',
});

const ACTOR = {
  id: 'actor-skilled',
  name: 'Idrin',
  getRollData: () => ({ skills: { craft: { value: 55 } } }),
};

/**
 * What each row's prompt shows and how its roll grades. A summed row rolls `1d20` (a 10) against
 * DC 15 or the character's 55; a count row ignores that formula and its conflicting DC 99, and the
 * player's typed `1` adds a third d10 to a pool of 2 (faces 9, 9, 3, success on 8): over counts 2
 * of the 2 needed and passes, under counts 1 and fails.
 */
const EXPECTED = {
  'sum/over/fixed': { chip: 'DC 15 · meet or beat', outcome: 'checkFailed', total: 10 },
  'sum/over/attribute': { chip: 'Target 55 · meet or beat', outcome: 'checkFailed', total: 10 },
  'sum/under/fixed': { chip: 'Target 15 · stay at or under', outcome: 'checkPassed', total: 10 },
  'sum/under/attribute': { chip: 'Target 55 · stay at or under', outcome: 'checkPassed', total: 10 },
  'count/over/fixed': { chip: '2 successes needed', line: '3d10 · each ≥ 8', outcome: 'checkPassed', total: 2 },
  'count/over/attribute': { chip: '2 successes needed', line: '3d10 · each ≥ 8', outcome: 'checkPassed', total: 2 },
  'count/under/fixed': { chip: '2 successes needed', line: '3d10 · each ≤ 8', outcome: 'checkFailed', total: 1 },
  'count/under/attribute': { chip: '2 successes needed', line: '3d10 · each ≤ 8', outcome: 'checkFailed', total: 1 },
};

const cells = CHECK_EVALUATION_CAPABILITIES.modes.flatMap((mode) =>
  mode.targetSources.map((source) => ({ mode, source, key: `${mode.product}/${mode.direction}/${source}` }))
);

function requestFor({ mode, source }) {
  const counted = mode.product === 'count';
  const evaluation = counted
    ? { ...countEvaluation({ direction: mode.direction, required: 2 }), target: { source } }
    : {
        product: 'sum',
        direction: mode.direction,
        target: source === 'attribute' ? { source, expression: '@skills.craft.value' } : { source },
      };
  return {
    actor: ACTOR,
    callSite: 'gmAction',
    formula: '1d20',
    dc: counted ? 99 : 15,
    label: 'Research',
    interactive: true,
    evaluation,
  };
}

async function openedPrompt() {
  let layer = null;
  for (let attempt = 0; attempt < 50 && !layer?.querySelector('[data-roll-prompt]'); attempt += 1) {
    await new Promise((settle) => setImmediate(settle));
    layer = document.querySelector('.fabricate-standalone-overlay');
  }
  assert.ok(layer?.querySelector('[data-roll-prompt]'), 'the prompt mounted on the standalone overlay');
  return { layer, dialog: layer.querySelector('[data-roll-prompt]') };
}

function typeBonus(dialog, value) {
  const bonus = dialog.querySelector('input[name="situationalBonus"]');
  bonus.value = value;
  bonus.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
  flushSync();
}

describe('a companion interactive check through the real prompt host (issue 2006)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('publishes every row interactive, and each prompts on the overlay, posts its Roll and grades', async () => {
    assert.deepEqual(cells.map(({ key }) => key), Object.keys(EXPECTED), 'every published cell is expected');
    const loadComponent = () => harness.loadRuneModule(ROLL_PROMPT_PATH);
    for (const cell of cells) {
      const { key, mode } = cell;
      const expected = EXPECTED[key];
      const counted = mode.product === 'count';
      assert.equal(mode.interactive, true, `${key}: published interactive`);
      document.body.replaceChildren();
      const dice = installCountDice({ faces: counted ? [9, 9, 3] : [10] });
      const restoreSurface = overrideRollPromptSurface((view) => openRollPromptModal(view, { loadComponent }));
      try {
        const pending = rollActorCheck(requestFor(cell), companionFacade._companionCheckSeams());
        const { layer, dialog } = await openedPrompt();
        const chip = dialog.querySelector('.formula-content .manager-chip');
        assert.equal(chip?.textContent.trim(), expected.chip, `${key}: the chip`);
        if (counted) {
          assert.equal(chip.dataset.rollPromptRequired, '2', `${key}: pool.required, never the dc`);
          typeBonus(dialog, '1');
          const line = dialog.querySelector('.formula-content .formula');
          assert.equal(line.textContent, expected.line, `${key}: the typed bonus adds a die`);
          assert.ok(!dialog.querySelector('button[data-action="advantage"]'), `${key}: no advantage until issue 2007`);
        }
        dialog.querySelector('button[type="submit"]').click();
        const result = await pending;
        assert.ok(!layer.isConnected, `${key}: the overlay leaves once answered`);
        assert.equal(result.outcome, expected.outcome, `${key}: ${JSON.stringify(result)}`);
        assert.equal(result.total, expected.total, key);
        assert.equal(dice.posts.length, 1, `${key}: one Roll posted`);
        if (counted) {
          assert.ok(dice.posts[0].rolls[0] instanceof dice.CountRoll, `${key}: the count Roll posted`);
          assert.equal(dice.posts[0].rolls[0].dice[0].results.length, 3, `${key}: three dice rolled`);
          assert.deepEqual(result.messageData, { label: 'Research', total: expected.total, required: 2 });
          const passed = expected.outcome === 'checkPassed';
          assert.equal(
            result.message,
            CHECK_ROLL_MESSAGE_KEYS[passed ? 'checkPassedCount' : 'checkFailedCount'],
            key
          );
        }
      } finally {
        restoreSurface();
        dice.restore();
      }
    }
  });
});
