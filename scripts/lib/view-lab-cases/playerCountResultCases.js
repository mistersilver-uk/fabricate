/**
 * Issue 2006's executed count evidence in the player's crafting result box, and the count
 * descriptor behind it. Each rolled state is deterministic by construction
 * (`tests/view-lab/countResultFixtures.js`), so its tiles and rows are known before it rolls.
 */

import { COUNT_ADVANTAGE_FOOTER, CRAFTING_SHARED, CRAFTING_SIMPLE } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

const SINGLE_PROMPT = '.fabricate-app .manager-modal[data-roll-prompt="single"]';
const CRAFT_HORSESHOE = Object.freeze([
  { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
  { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
]);
const ROLL = Object.freeze({ selector: `${SINGLE_PROMPT} button[type="submit"]` });
const RESULT_BOX = '[data-crafting-run-summary] [data-recipe-section="roll-result"]';
/** A row of the result box's count evidence, by id and the text it reads. */
const ROW = (id, text) => `:has([data-check-evidence="${id}"]:has-text("${text}"))`;
const RESULT_SOURCES = Object.freeze([
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/detail\/(?:RollResultBox|CheckEvidenceRows)\.svelte$/,
  /^src\/ui\/presenters\/(?:checkDisplay|countDiceTiles|countEvidenceRows)\.js$/,
  /^src\/systems\/countDisplayEvidence\.js$/,
]);

/** The roll-and-look walk every rolled state shares, and the failure toast a failed craft raises. */
function rolledCase({ id, label, state, expectSelector, failed = false, ...rest }) {
  return playerCase({
    id,
    label,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: state, ...rest.query },
    steps: [
      ...CRAFT_HORSESHOE,
      ...(rest.steps ?? []),
      ROLL,
      { selector: RESULT_BOX, scroll: true },
    ],
    ...(failed && { allowedConsoleErrors: [/Your crafting check failed/] }),
    expectSelector,
    ...(rest.position && { position: rest.position }),
    ...(rest.expectVisible && { expectVisible: rest.expectVisible }),
    kinds: rest.kinds ?? ['player', 'crafting'],
    sourceMatches: RESULT_SOURCES,
  });
}

/** Buy one additional die on the standing prompt (issue 2008). */
const BUY_ONE = Object.freeze({
  selector: `${SINGLE_PROMPT} [data-roll-prompt-additional-dice-stepper] [data-stepper-increment]`,
});
/** Frame 39: three d20s at or under 20, the third bought, so the last original tile is dashed. */
const BOUGHT_TILES =
  ':has([data-dice-tile-marks~="qualified"]:not([data-dice-tile-marks~="bought"]))' +
  ':has(.fabricate-dice-tiles__tile:last-child[data-dice-tile-marks~="bought"])';
const BOUGHT_ROW = ROW('additionalDice', '1 bought · spent 1 Momentum');

/** Two d6s both meet 1 and explode once: each original tile is ✓↻, each explosion its own ✓. */
const PASS =
  `${RESULT_BOX}[data-roll-success="true"]` +
  ROW('count', '4 qualified − 0 cancelled = 4 net') +
  ROW('needed', '2 · margin +2') +
  ' [data-check-count-tiles]' +
  ':has([data-dice-tile-marks~="qualified"][data-dice-tile-marks~="exploded"]:not([data-dice-tile-generated]))' +
  ':has([data-dice-tile-generated][data-dice-tile-marks="qualified"])';

export function playerCountResultCases() {
  return [
    rolledCase({
      id: 'player-crafting-roll-result-count-pass',
      label: 'Player app — success-counting result box, passed, its exploding tiles and rows',
      state: 'count-result-pass',
      expectSelector: PASS,
    }),
    rolledCase({
      id: 'player-crafting-roll-result-count-pass-narrow',
      label: 'Player app — success-counting result box, passed, at 1024x640',
      state: 'count-result-pass',
      position: { width: 1024, height: 640 },
      kinds: ['player', 'crafting', 'responsive'],
      expectSelector: PASS,
    }),
    rolledCase({
      id: 'player-crafting-roll-result-count-fail',
      label: 'Player app — success-counting result box, failed with no die qualifying',
      state: 'count-result-fail',
      failed: true,
      expectSelector:
        `${RESULT_BOX}[data-roll-success="false"]` +
        `:has([data-check-count-tiles] [data-dice-tile-marks=""])` +
        ':not(:has([data-dice-tile-marks~="qualified"]))' +
        ROW('count', '0 qualified − 0 cancelled = 0 net') +
        ROW('needed', '1 · margin −1'),
    }),
    ...['dark', 'light'].map((scheme) =>
      rolledCase({
        id: `player-crafting-roll-result-count-botch${scheme === 'light' ? '-light' : ''}`,
        label: `Player app — success-counting result box, botched, every tile cancelled (${scheme})`,
        state: 'count-result-botch',
        failed: true,
        // Fabricate's own surfaces keep their theme, so the light frame also docks the chat card.
        ...(scheme === 'light' && { query: { colorScheme: 'light', chatLog: '1' } }),
        ...(scheme === 'light' && {
          expectVisible:
            '[data-view-lab-chat-log] > .chat-message[data-view-lab-chat-visibility="public"] ' +
            '.fabricate-craft-chat .fabricate-dice-tiles:has([data-dice-tile-marks="cancelled"])',
        }),
        expectSelector:
          `${RESULT_BOX}[data-roll-success="false"]` +
          ':has([data-roll-summary]:text-is("Botched. Nothing is produced; the failure policy applies."))' +
          ':has([data-check-count-tiles] [data-dice-tile-marks="cancelled"])' +
          ':not(:has([data-dice-tile-marks]:not([data-dice-tile-marks="cancelled"])))' +
          ROW('count', '0 qualified − 3 cancelled = −3 net') +
          ROW('needed', '1 · a net below zero is a botch'),
      })
    ),
    rolledCase({
      id: 'player-crafting-roll-result-count-zero',
      label: 'Player app — success-counting result box over a pool of no dice',
      state: 'count-result-zero',
      failed: true,
      expectSelector:
        `${RESULT_BOX}[data-roll-success="false"]` +
        ':not(:has([data-roll-total])):not(:has([data-check-count-tiles]))' +
        ROW('result', 'A pool reduced to zero fails automatically. Nothing was rolled.'),
    }),
    // Frame 41: a situational −6 typed into the prompt reduces six dice to none, so the Pool row
    // names the penalty above the Result.
    rolledCase({
      id: 'player-crafting-roll-result-count-zero-penalty',
      label: 'Player app — success-counting result box, a pool reduced to zero by a penalty',
      state: 'count-result-zero-penalty',
      failed: true,
      steps: [{ selector: `${SINGLE_PROMPT} input[name="situationalBonus"]`, fill: '-6' }],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="false"]` +
        ':not(:has([data-check-count-tiles]))' +
        ':has([data-check-evidence="pool"] + [data-check-evidence="result"])' +
        ROW('pool', 'Reduced to zero by a situational penalty of −6') +
        ROW('result', 'A pool reduced to zero fails automatically. Nothing was rolled.'),
    }),
    // Issue 2008, frame 39: one bought die joins the pool, marked on the last original tile.
    rolledCase({
      id: 'player-crafting-roll-result-count-bought',
      label: 'Player app — success-counting result box with one bought die (prototype frame 39)',
      state: 'count-result-bought',
      steps: [BUY_ONE],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="true"]` +
        BOUGHT_ROW +
        ROW('count', '3 qualified − 0 cancelled = 3 net') +
        ':has([data-dice-tiles-legend]:has-text("dashed = bought"))' +
        ` [data-check-count-tiles]${BOUGHT_TILES}`,
    }),
    // The bought die misses, so its dashed border is the tile's only paint (WCAG 1.4.11).
    rolledCase({
      id: 'player-crafting-roll-result-count-bought-miss',
      label: 'Player app — success-counting result box whose one bought die misses',
      state: 'count-result-bought-miss',
      steps: [BUY_ONE],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="true"]` +
        BOUGHT_ROW +
        ROW('count', '2 qualified − 0 cancelled = 2 net') +
        ' [data-check-count-tiles]' +
        ':has(.fabricate-dice-tiles__tile:last-child[data-dice-tile-marks="bought"])',
    }),
    // A blind roll withholds the bought dice with every other executed fact.
    rolledCase({
      id: 'player-crafting-roll-result-count-bought-secret',
      label: 'Player app — success-counting result box after a blind roll with a bought die',
      state: 'count-result-bought',
      steps: [
        BUY_ONE,
        { selector: `${SINGLE_PROMPT} .mode-field .fabricate-select-trigger` },
        {
          selector: '.fabricate-app > .fabricate-select-popover [data-popover-option="blindroll"]',
        },
      ],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="true"]` +
        ':not(:has([data-check-count-tiles])):not(:has([data-check-evidence-rows]))' +
        ':not(:has([data-dice-tiles-legend]))',
    }),
    // The posted card states the summary the result box has no room for (frame 39's chat card).
    rolledCase({
      id: 'player-crafting-roll-result-count-bought-chat',
      label: 'Player app — success-counting result card with one bought die (prototype frame 39)',
      state: 'count-result-bought',
      steps: [BUY_ONE],
      query: { chatLog: '1' },
      expectSelector:
        '.fabricate-craft-chat:has-text("Crafting Successful")' +
        ':has([data-check-count-summary]:has-text("3d20 (2 + 1 bought), each ≤ 20"))' +
        ':has([data-check-evidence="additionalDice"]:has-text("1 bought · spent 1 Momentum"))' +
        ' .fabricate-dice-tiles__tile:last-child[data-dice-tile-marks~="bought"]',
    }),
    // The crafting app reaches no secret check, so its withheld state is the roll it cannot see.
    rolledCase({
      id: 'player-crafting-roll-result-count-secret',
      label: 'Player app — success-counting result box after a blind roll, no tiles or rows',
      state: 'count-result-pass',
      steps: [
        { selector: `${SINGLE_PROMPT} .mode-field .fabricate-select-trigger` },
        {
          selector: '.fabricate-app > .fabricate-select-popover [data-popover-option="blindroll"]',
        },
      ],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="true"]` +
        ':not(:has([data-check-count-tiles])):not(:has([data-check-evidence-rows]))',
    }),
    // A companion's interactive count request prompts on the standalone overlay, with no window.
    playerCase({
      id: 'player-crafting-roll-prompt-count-companion',
      label: 'Player app — a companion success-counting roll prompt on the standalone overlay',
      smokeLabels: [],
      reaches: 'beyond',
      query: { tab: 'crafting', dialog: 'open', viewer: 'gm', companionRoll: 'count' },
      steps: [{ selector: '[data-lab-companion-roll]' }],
      expectSelector:
        '.fabricate-standalone-overlay .manager-modal[data-roll-prompt="single"]' +
        COUNT_ADVANTAGE_FOOTER +
        ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("4d10 · each ≥ 8"))' +
        ':has(.formula-content .formula-note:text-is("Success on ≥ 8 · explodes on 10 · 1 cancels a success"))' +
        ' .formula-content .manager-chip[data-roll-prompt-required="2"]',
      kinds: ['player', 'crafting'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/crafting\/(?:RollPrompt(?:Target|Footer)?\.svelte|rollPrompt(?:Target|Host)?\.js)$/,
        /^src\/systems\/companionCheck(?:Roll|Evaluation)\.js$/,
        /^src\/bootstrap\/companionFacade\.js$/,
      ],
    }),
    // The singular successes needed a recipe tier sets, beside the pool line and never a DC.
    playerCase({
      id: 'player-crafting-check-descriptor-count',
      label: 'Player app — success-counting check card needing one success from its recipe tier',
      smokeLabels: [],
      reaches: 'beyond',
      query: { tab: 'crafting', rollPromptState: 'count-result-descriptor' },
      steps: [CRAFT_HORSESHOE[0], { selector: '[data-recipe-section="check"]', scroll: true }],
      expectSelector:
        '[data-recipe-section="check"][data-check-usable="true"]:not(:has([data-check-dc]))' +
        ':has([data-check-formula] code:text-is("2d6 · each ≥ 1"))' +
        ' [data-check-successes-needed="1"]:text-is("1 success needed")',
      kinds: ['player', 'crafting'],
      sourceMatches: [
        CRAFTING_SHARED,
        CRAFTING_SIMPLE,
        /^src\/ui\/presenters\/(?:CraftingListingBuilder|checkDescriptor)\.js$/,
      ],
    }),
  ];
}
