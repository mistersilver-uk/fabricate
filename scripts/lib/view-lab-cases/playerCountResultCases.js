/**
 * Issue 2006's executed count evidence in the player's crafting result box, and the count
 * descriptor behind it. Each rolled state is deterministic by construction
 * (`tests/view-lab/countResultFixtures.js`), so its tiles and rows are known before it rolls.
 */

import { CRAFTING_SHARED, CRAFTING_SIMPLE } from './caseConstants.js';
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
  /^src\/ui\/svelte\/components\/DiceTiles\.svelte$/,
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
        ':not(:has(button[data-action="advantage"]))' +
        ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("4d10 · each ≥ 8"))' +
        ':has(.formula-content .formula-note:text-is("Success on ≥ 8 · explodes on 10 · 1 cancels a success"))' +
        ' .formula-content .manager-chip[data-roll-prompt-required="2"]',
      kinds: ['player', 'crafting'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/crafting\/(?:RollPrompt(?:Target)?\.svelte|rollPrompt(?:Target|Host)?\.js)$/,
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
