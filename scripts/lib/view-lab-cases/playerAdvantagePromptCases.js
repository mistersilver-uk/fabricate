/**
 * Issue 2007's roll prompt footers on the horseshoe's simple crafting check, one per advantage
 * rule the prototype draws (frames 27 to 30 and 35), and the results an Advantage roll leaves.
 * Each state is seeded by `tests/view-lab/rollPromptFixtures.js`.
 */

import { CRAFTING_SHARED, CRAFTING_SIMPLE } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

const SINGLE_PROMPT = '.fabricate-app .manager-modal[data-roll-prompt="single"]';
const CRAFT_HORSESHOE = Object.freeze([
  { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
  { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
]);
const ADVANTAGE = Object.freeze({ selector: `${SINGLE_PROMPT} button[data-action="advantage"]` });
const DISADVANTAGE = Object.freeze({
  selector: `${SINGLE_PROMPT} button[data-action="disadvantage"]`,
});
const RESULT_BOX = '[data-crafting-run-summary] [data-recipe-section="roll-result"]';
const SHOW_RESULT = Object.freeze({ selector: RESULT_BOX, scroll: true });
/** A result box evidence row, by id and the text it reads. */
const ROW = (id, text) => `:has([data-check-evidence="${id}"]:has-text("${text}"))`;

/** The footer button for `action`, and the one-line note it carries. */
const NOTE = (action, text) =>
  `:has(.manager-modal-footer button[data-action="${action}"] .action-note:text-is("${text}"))`;
const ROLL_BETWEEN = ':has(.manager-modal-footer button[data-action="normal"][type="submit"])';
/** Disadvantage, Roll and Advantage, each outer button with its note. */
const THREE = (worse, better) =>
  NOTE('disadvantage', worse) + ROLL_BETWEEN + NOTE('advantage', better);
const KEEP_FOOTER = THREE('keep the worse', 'keep the better');
const OVER_2D6 =
  ':has(.formula-content .formula:has-text("2d6 + 3"))' +
  ':has(.formula-content .manager-chip:has-text("DC 15 · meet or beat"))';

const PROMPT_SOURCES = Object.freeze([
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
  /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
]);
const RESULT_SOURCES = Object.freeze([
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/detail\/(?:RollResultBox|CheckEvidenceRows)\.svelte$/,
  /^src\/ui\/presenters\/(?:checkDisplay|checkEvidenceRows|countDiceTiles|countEvidenceRows)\.js$/,
]);
const CHAT_SOURCES = Object.freeze([
  /^src\/ui\/presenters\/(?:CraftingChatCard|checkDiceLine|checkDisplay)\.js$/,
]);

function promptCase({ id, label, state, expectSelector, ...rest }) {
  return playerCase({
    id,
    label: `Player app — crafting roll prompt, ${label}`,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: state },
    steps: [...CRAFT_HORSESHOE],
    expectSelector: SINGLE_PROMPT + expectSelector,
    kinds: ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
    ...rest,
  });
}

export function playerAdvantagePromptCases() {
  return [
    // The fix: a plain `2d6` now offers keep, where it once rolled alone.
    promptCase({
      id: 'player-crafting-roll-prompt-keep-multi',
      label: 'keep one on a 2d6 first group',
      state: 'keep-multi',
      expectSelector: KEEP_FOOTER + OVER_2D6,
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-advantage-under',
      label: 'keep one on 3d6 under a target (prototype frame 29)',
      state: 'advantage-under',
      expectSelector:
        KEEP_FOOTER +
        ':has(.formula-content .formula:text-is("3d6"))' +
        ':has(.target-row > .manager-chip[data-roll-prompt-target="under"]:has-text("Target 11 · stay at or under"))',
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-advantage-bonus',
      label: 'a 1d6 bonus die added to the total',
      state: 'advantage-bonus',
      expectSelector: THREE('−1d6 to the total', '+1d6 to the total') + OVER_2D6,
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-advantage-only',
      label: 'a bonus die with no disadvantage (prototype frame 28)',
      state: 'advantage-only',
      expectSelector:
        ':not(:has(button[data-action="disadvantage"]))' +
        ROLL_BETWEEN +
        NOTE('advantage', '+1d6 to the total') +
        OVER_2D6,
    }),
    // The longest note at the 1024x640 floor: one line, inside its button, the footer inside the prompt.
    promptCase({
      id: 'player-crafting-roll-prompt-advantage-long',
      label: 'a three-term bonus die raising the target at 1024x640',
      state: 'advantage-long',
      position: { width: 1024, height: 640 },
      kinds: ['player', 'crafting', 'responsive'],
      expectSelector:
        THREE(
          '−(2d4 + 1d6 + 1d8 + 1d10 + 2) to the target',
          '+(2d4 + 1d6 + 1d8 + 1d10 + 2) to the target'
        ) + ':has(.target-row > .manager-chip[data-roll-prompt-target="under"])',
      expectContained: [
        { container: SINGLE_PROMPT, target: `${SINGLE_PROMPT} .manager-modal-footer` },
        {
          container: `${SINGLE_PROMPT} button[data-action="advantage"]`,
          target: `${SINGLE_PROMPT} button[data-action="advantage"] .action-note`,
        },
      ],
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-count-advantage',
      label: 'a counting pool offering two dice either way',
      state: 'count-advantage',
      expectSelector:
        THREE('−2 dice', '+2 dice') +
        ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("6d10 · each ≥ 8"))',
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-count-advantage-off',
      label: 'a counting pool offering no advantage',
      state: 'count-advantage-off',
      expectSelector:
        ':not(:has(button[data-action="advantage"])):not(:has(.action-note))' +
        ':has(.manager-modal-footer button[data-action="roll"][type="submit"])' +
        ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("6d10 · each ≥ 8"))',
    }),
    // The posted card's dice line reads the kept group as rolled: `2d20kh1 (face) + 3 …`.
    playerCase({
      id: 'player-crafting-chat-card-advantage-keep',
      label: 'Player app — crafting result card after Advantage keeps the better d20',
      smokeLabels: [],
      reaches: 'beyond',
      query: {
        tab: 'crafting',
        dialog: 'open',
        rollPromptState: 'advantage-result-keep',
        chatLog: '1',
      },
      steps: [...CRAFT_HORSESHOE, ADVANTAGE],
      expectSelector: '.fabricate-craft-chat .fabricate-craft-chat__dice:has-text("2d20kh1 (")',
      kinds: ['player', 'crafting'],
      sourceMatches: CHAT_SOURCES,
    }),
    // The bonus die rolls after the check's own terms, on a total no roll misses DC 15 with.
    playerCase({
      id: 'player-crafting-chat-card-advantage-bonus',
      label: 'Player app — crafting result card after Advantage adds a 1d6 bonus die to the total',
      smokeLabels: [],
      reaches: 'beyond',
      query: {
        tab: 'crafting',
        dialog: 'open',
        rollPromptState: 'advantage-result-bonus',
        chatLog: '1',
      },
      steps: [...CRAFT_HORSESHOE, ADVANTAGE],
      expectSelector: '.fabricate-craft-chat .fabricate-craft-chat__dice:has-text("+ 20 + (1d6)")',
      kinds: ['player', 'crafting'],
      sourceMatches: CHAT_SOURCES,
    }),
    // Advantage adds `countDice` dice: four d6s, each meeting 1 and exploding once, net eight.
    playerCase({
      id: 'player-crafting-roll-result-count-advantage',
      label: 'Player app — success-counting result box after Advantage adds two dice',
      smokeLabels: [],
      reaches: 'beyond',
      query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count-result-advantage' },
      steps: [...CRAFT_HORSESHOE, ADVANTAGE, SHOW_RESULT],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="true"]` +
        ROW('count', '8 qualified − 0 cancelled = 8 net') +
        ' [data-check-evidence="needed"]:has-text("2 · margin +6")',
      kinds: ['player', 'crafting'],
      sourceMatches: RESULT_SOURCES,
    }),
    // Disadvantage on a roll-under bonus die: its unsigned pre-roll lowers the target.
    playerCase({
      id: 'player-crafting-roll-result-under-disadvantage-bonus',
      label:
        'Player app — roll-under result box after Disadvantage lowers the target by a bonus die',
      smokeLabels: [],
      reaches: 'beyond',
      query: { tab: 'crafting', dialog: 'open', rollPromptState: 'advantage-under-disadvantage' },
      steps: [...CRAFT_HORSESHOE, DISADVANTAGE, SHOW_RESULT],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="true"]` +
        ROW('target', 'modifiers −') +
        ' [data-check-evidence="preRolled"]:has-text("Disadvantage 1d8 + 1 rolled")' +
        ':has-text("lowering the target")',
      kinds: ['player', 'crafting'],
      sourceMatches: RESULT_SOURCES,
    }),
    // Disadvantage removes three dice from a pool of two: the pool empties and the roll fails.
    playerCase({
      id: 'player-crafting-roll-result-count-disadvantage-zero',
      label: 'Player app — success-counting result box, a pool emptied by Disadvantage',
      smokeLabels: [],
      reaches: 'beyond',
      query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count-result-disadvantage-zero' },
      steps: [...CRAFT_HORSESHOE, DISADVANTAGE, SHOW_RESULT],
      allowedConsoleErrors: [/Your crafting check failed/],
      expectSelector:
        `${RESULT_BOX}[data-roll-success="false"]` +
        ':not(:has([data-check-count-tiles]))' +
        ':has-text("2d10 − 3 disadvantage = 0 dice")' +
        ROW('pool', 'Reduced to zero by a disadvantage penalty of −3'),
      kinds: ['player', 'crafting'],
      sourceMatches: RESULT_SOURCES,
    }),
  ];
}
