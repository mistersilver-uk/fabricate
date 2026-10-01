/**
 * The player window: the Gathering tab and every crafting resolution mode.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  COUNT_ADVANTAGE_FOOTER,
  CRAFTING_PROGRESSIVE,
  CRAFTING_ROUTED_CHECK,
  CRAFTING_ROUTED_INGREDIENTS,
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
} from './caseConstants.js';
import { playerCase, responsiveLayout } from './caseFactories.js';
import { playerAdvantagePromptCases } from './playerAdvantagePromptCases.js';
import { playerCountResultCases } from './playerCountResultCases.js';

/** The single-subject roll prompt: Fabricate's own modal, mounted over the player window. */
const SINGLE_PROMPT = '.fabricate-app .manager-modal[data-roll-prompt="single"]';
/** The files a count prompt case is drawn from (issue 2006). */
const COUNT_PROMPT_SOURCES = Object.freeze([
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
  /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
]);

/** Issue 2005's player-rendering states: open the horseshoe and press Craft, prompting. */
const CRAFT_HORSESHOE = Object.freeze([
  { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
  { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
]);
/** Type a rolled situational bonus into the standing prompt, which the pre-roll row then states. */
const TYPE_ROLLED_BONUS = Object.freeze({
  selector: `${SINGLE_PROMPT} input[name="situationalBonus"]`,
  fill: '1d4',
});
const ROLL = Object.freeze({ selector: `${SINGLE_PROMPT} button[type="submit"]` });
/** Choose a roll mode on the standing prompt the way a player does, through the shared Select. */
const ROLL_MODE = (mode) => [
  { selector: `${SINGLE_PROMPT} .mode-field .fabricate-select-trigger` },
  { selector: `.fabricate-app > .fabricate-select-popover [data-popover-option="${mode}"]` },
];
const RESULT_BOX = '[data-crafting-run-summary] [data-recipe-section="roll-result"]';
const EVIDENCE_ROWS = (...ids) =>
  `[data-check-evidence-rows]${ids.map((id) => `:has([data-check-evidence="${id}"])`).join('')}`;
/** The result card a `chatLog=1` lab docks beside the window; it never whispers to hide a check. */
const CHAT_CARD = '.fabricate-craft-chat';
/** The lab's own docked log, asserted visibly rather than as UI the product emits. */
const LAB_CHAT = (visibility) =>
  `[data-view-lab-chat-log] > .chat-message[data-view-lab-chat-visibility="${visibility}"]`;
const PROMPT_SOURCES = [
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
  /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
];
const RESULT_SOURCES = [
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/detail\/(?:RollResultBox|CheckEvidenceRows)\.svelte$/,
  /^src\/ui\/presenters\/check(?:Display|EvidenceRows)\.js$/,
  /^src\/ui\/svelte\/stores\/craftingStore/,
];
const DESCRIPTOR_SOURCES = [
  CRAFTING_SHARED,
  CRAFTING_SIMPLE,
  /^src\/ui\/presenters\/(?:CraftingListingBuilder|checkDescriptor)\.js$/,
];
const CHAT_SOURCES = [
  /^src\/ui\/presenters\/(?:CraftingChatCard|checkDisplay|checkEvidenceRows)\.js$/,
  /^src\/systems\/craftCardFields\.js$/,
];

export const CASES = Object.freeze([
  playerCase({
    id: 'player-crafting-roll-prompt-basic',
    label: 'Player app — 2d6 crafting roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'basic' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      `${SINGLE_PROMPT}:not(:has(button[data-action="advantage"]))` +
      ':has(.manager-modal-footer button[data-action="roll"][type="submit"])' +
      ':has(.manager-modal-subtitle:has-text("Bend Horseshoe"))' +
      ':has(.formula-content .formula:has-text("2d6 + 3"))' +
      ':has(.formula-content .manager-chip:has-text("DC 15 · meet or beat"))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SIMPLE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPromptHost\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-advantage',
    label: 'Player app — d20 crafting roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'advantage' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    // Frame 27: Disadvantage and Advantage each state the keep rule under their label.
    expectSelector:
      SINGLE_PROMPT +
      ':has(.manager-modal-footer button[data-action="disadvantage"] .action-note:text-is("keep the worse"))' +
      ':has(.manager-modal-footer button[data-action="advantage"] .action-note:text-is("keep the better"))' +
      ':has(.manager-modal-subtitle:has-text("Bend Horseshoe"))' +
      ':has(.formula-content .formula:has-text("1d20 + 3"))' +
      ':has(.formula-content .manager-chip:has-text("DC 15 · meet or beat"))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SIMPLE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-under',
    label: 'Player app — roll-under crafting roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      `${SINGLE_PROMPT}:has(button[data-action="advantage"])` +
      ':has(.manager-modal-subtitle:text-is("Sera Vane · Hard Work"))' +
      ':has(.formula-content .formula:text-is("1d20") + .formula-note:text-is("The dice are compared as rolled."))' +
      ':has(.target-row > .manager-chip[data-roll-prompt-target="under"]:has-text("Target 11 · stay at or under"))' +
      ':has(.target-row > .target-source:has-text("Sera Vane @skills")' +
      ':has-text("level 12 · Hard Work −2 · modifiers +1"))' +
      ':has(.static-modifiers .manager-chip:has-text("Steady hands +1"))' +
      ':has(.static-modifiers > .help:text-is("Each raises the target."))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SIMPLE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  // The recipe detail behind that prompt: the bare roll, and no DC chip for a roll-under target.
  playerCase({
    id: 'player-crafting-check-under',
    label: 'Player app — roll-under crafting check in the recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', rollPromptState: 'under' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-recipe-section="check"]', scroll: true },
    ],
    expectSelector:
      '[data-recipe-section="check"][data-check-usable="true"]' +
      ':has([data-check-formula] code:text-is("1d20"))' +
      ':not(:has([data-check-dc]))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_SIMPLE,
      /^src\/ui\/presenters\/CraftingListingBuilder\.js$/,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  // Issue 2005: a check that offers no situational bonus shows no field, and focus falls to Roll.
  playerCase({
    id: 'player-crafting-roll-prompt-under-bonus-off',
    label: 'Player app — roll-under crafting roll prompt with no bonus offer',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-bonus-off' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      `${SINGLE_PROMPT}:has(.target-row > .manager-chip[data-roll-prompt-target="under"])` +
      ':not(:has(input[name="situationalBonus"])):not(:has(.bonus-group))',
    kinds: ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
  }),
  // Strictly under: the chip and its explanation name a target the total must stay under.
  playerCase({
    id: 'player-crafting-roll-prompt-under-strict',
    label: 'Player app — roll-under crafting roll prompt, strictly under the target',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-strict' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      `${SINGLE_PROMPT} .target-row > .manager-chip[data-roll-prompt-target="under"]` +
      ':has-text("Target 11 · stay under")',
    kinds: ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
  }),
  // The player picks one of two modifiers, and the chip and its explanation follow the pick.
  playerCase({
    id: 'player-crafting-roll-prompt-under-picks',
    label: 'Player app — roll-under crafting roll prompt with a modifier to pick',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-picks' },
    steps: [
      ...CRAFT_HORSESHOE,
      {
        selector: `${SINGLE_PROMPT} input[type="radio"][name="craftingModifier"][value="lab-mod-sure-grip"]`,
      },
    ],
    expectSelector:
      `${SINGLE_PROMPT}:has(input[type="radio"][name="craftingModifier"])` +
      ':has(.target-row > .manager-chip[data-roll-prompt-target="under"]:has-text("Target 12 · stay at or under"))',
    kinds: ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
  }),
  // A typed rolled bonus is pending: the chip names it beside the settled target, never an average.
  playerCase({
    id: 'player-crafting-roll-prompt-under-rolled-bonus',
    label: 'Player app — roll-under crafting roll prompt with a rolled bonus typed',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under' },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS],
    expectSelector:
      `${SINGLE_PROMPT} .target-live[aria-live="polite"] .target-row` +
      ' > .manager-chip:has-text("Target 11 + 1d4 · stay at or under")',
    kinds: ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
  }),
  // A character-value target read over is a target to meet or beat, never a DC.
  playerCase({
    id: 'player-crafting-roll-prompt-over-attribute',
    label: 'Player app — roll-over crafting roll prompt against a character value',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'over-attribute' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector: `${SINGLE_PROMPT} .formula-content .manager-chip:has-text("Target 10 · meet or beat")`,
    kinds: ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
  }),
  // The character-value prompt at the 1024x640 floor, its footer inside the window.
  playerCase({
    id: 'player-crafting-roll-prompt-under-compact',
    label: 'Player app — roll-under crafting roll prompt at 1024x640',
    smokeLabels: [],
    reaches: 'beyond',
    position: { width: 1024, height: 640 },
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      `${SINGLE_PROMPT} .target-live[aria-live="polite"] .target-row` +
      ' > .manager-chip[data-roll-prompt-target="under"]:has-text("Target 11 · stay at or under")',
    expectContained: [
      { container: SINGLE_PROMPT, target: `${SINGLE_PROMPT} .manager-modal-footer` },
    ],
    kinds: ['player', 'crafting', 'responsive'],
    sourceMatches: PROMPT_SOURCES,
  }),
  // The recipe's check card names the target and its source fact, or why the target cannot be read.
  playerCase({
    id: 'player-crafting-check-descriptor-under-resolved',
    label: 'Player app — roll-under check card naming its character-value target',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', rollPromptState: 'under' },
    steps: [CRAFT_HORSESHOE[0], { selector: '[data-recipe-section="check"]', scroll: true }],
    expectSelector:
      '[data-recipe-section="check"]:not(:has([data-check-dc]))' +
      ':has([data-check-target="under"]:has-text("Target 11 · stay at or under"))' +
      ':has([data-check-target-source]:has-text("Sera Vane @skills")' +
      ':has-text("level 12 · Hard Work −2 · modifiers +1"))',
    kinds: ['player', 'crafting'],
    sourceMatches: DESCRIPTOR_SOURCES,
  }),
  playerCase({
    id: 'player-crafting-check-descriptor-under-unresolved',
    label: 'Player app — roll-under check card whose character value cannot be read',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', rollPromptState: 'under-unresolved' },
    steps: [CRAFT_HORSESHOE[0], { selector: '[data-recipe-section="check"]', scroll: true }],
    expectSelector:
      '[data-recipe-section="check"]:not(:has([data-check-target]))' +
      ' [data-check-target-unresolved]:has-text("could not read a number for its target")',
    kinds: ['player', 'crafting'],
    sourceMatches: DESCRIPTOR_SOURCES,
  }),
  // The player result box's Target, Pre-rolled and Margin rows for a passed and a failed roll-under.
  playerCase({
    id: 'player-crafting-roll-result-under-pass',
    label: 'Player app — roll-under crafting result box, passed, with its evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-evidence' },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS, ROLL, { selector: RESULT_BOX, scroll: true }],
    expectSelector:
      `${RESULT_BOX}[data-roll-success="true"]` +
      ':has([data-roll-summary]:text-is("The result group is produced.")) ' +
      EVIDENCE_ROWS('target', 'preRolled', 'margin'),
    kinds: ['player', 'crafting'],
    sourceMatches: RESULT_SOURCES,
  }),
  playerCase({
    id: 'player-crafting-roll-result-under-fail',
    label: 'Player app — roll-under crafting result box, failed, with its evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-evidence-fail' },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS, ROLL, { selector: RESULT_BOX, scroll: true }],
    // The resolved-failure toast the player is shown, which the lab reports as a console warning.
    allowedConsoleErrors: [/Your crafting check failed/],
    expectSelector:
      `${RESULT_BOX}[data-roll-success="false"]` +
      ':has([data-roll-summary]:text-is("Nothing is produced; the failure policy applies.")) ' +
      EVIDENCE_ROWS('target', 'preRolled', 'margin'),
    kinds: ['player', 'crafting'],
    sourceMatches: RESULT_SOURCES,
  }),
  // The posted result card: public states its rows, private and blind neither a total nor rows.
  playerCase({
    id: 'player-crafting-chat-card-under-public',
    label: 'Player app — roll-under crafting result card, public roll, with its evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-evidence', chatLog: '1' },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS, ROLL],
    expectSelector:
      `${CHAT_CARD}:has(.fabricate-craft-chat__result):has(.fabricate-craft-chat__dice) ` +
      '.fabricate-craft-chat__evidence:has([data-check-evidence="preRolled"])',
    expectVisible: `${LAB_CHAT('public')} .fabricate-craft-chat__evidence`,
    kinds: ['player', 'crafting'],
    sourceMatches: CHAT_SOURCES,
  }),
  playerCase({
    id: 'player-crafting-chat-card-under-whispered',
    label:
      'Player app — roll-under crafting result card after a private GM roll, no total or evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-evidence', chatLog: '1' },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS, ...ROLL_MODE('gmroll'), ROLL],
    expectSelector:
      `${CHAT_CARD}:has(.fabricate-craft-chat__result):not(:has(.fabricate-craft-chat__roll))` +
      ':not(:has(.fabricate-craft-chat__dice)):not(:has(.fabricate-craft-chat__evidence))',
    expectVisible: LAB_CHAT('whisper'),
    kinds: ['player', 'crafting'],
    sourceMatches: CHAT_SOURCES,
  }),
  playerCase({
    id: 'player-crafting-chat-card-under-blind',
    label:
      'Player app — roll-under crafting result card after a blind roll, no total or evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'under-evidence', chatLog: '1' },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS, ...ROLL_MODE('blindroll'), ROLL],
    expectSelector:
      `${CHAT_CARD}:has(.fabricate-craft-chat__result):not(:has(.fabricate-craft-chat__roll))` +
      ':not(:has(.fabricate-craft-chat__dice)):not(:has(.fabricate-craft-chat__evidence))',
    expectVisible: LAB_CHAT('blind'),
    kinds: ['player', 'crafting'],
    sourceMatches: CHAT_SOURCES,
  }),
  // Issue 2132: a failed card's reason line, inked into the chat's own ink as the pill is.
  playerCase({
    id: 'player-crafting-chat-card-under-fail',
    label: 'Player app — failed roll-under crafting result card, with its failure reason',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'crafting',
      dialog: 'open',
      rollPromptState: 'under-evidence-fail',
      chatLog: '1',
    },
    steps: [...CRAFT_HORSESHOE, TYPE_ROLLED_BONUS, ROLL],
    allowedConsoleErrors: [/Your crafting check failed/],
    expectSelector: `${CHAT_CARD}.fabricate-craft-chat--failure:has(.fabricate-craft-chat__result) .fabricate-craft-chat__notice`,
    expectVisible: `${LAB_CHAT('public')} .fabricate-craft-chat__notice`,
    kinds: ['player', 'crafting'],
    sourceMatches: CHAT_SOURCES,
  }),
  // The control: a sum/over fixed card gains the pill, dice line, and Needed and Margin rows (M1, M3).
  playerCase({
    id: 'player-crafting-chat-card-over-control',
    label: 'Player app — roll-over crafting result card, with its Needed and Margin rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', rollPromptState: 'over-evidence', chatLog: '1' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      `${CHAT_CARD}:has(.fabricate-craft-chat__result)` +
      ':has([data-check-evidence="needed"]):has([data-check-evidence="margin"])',
    kinds: ['player', 'crafting'],
    sourceMatches: CHAT_SOURCES,
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-count',
    label: 'Player app — success-counting crafting roll prompt, modifiers add dice',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      SINGLE_PROMPT +
      COUNT_ADVANTAGE_FOOTER +
      ':has(.manager-modal-subtitle:text-is("Sera Vane · Fine Craft"))' +
      ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("6d10 · each ≥ 8"))' +
      ':has(.formula-content .formula-note:text-is("Success on ≥ 8 · explodes on 10 · 1 cancels a success"))' +
      ':has(.formula-content .manager-chip[data-roll-prompt-required="2"]:has-text("2 successes needed"))' +
      ':has(.static-modifiers .manager-chip:has-text("Steady hands +1"))' +
      ':has(.static-modifiers > .help:text-is("Each adds dice."))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SIMPLE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-count-threshold',
    label: 'Player app — success-counting crafting roll prompt, modifiers move the threshold',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count-threshold' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      SINGLE_PROMPT +
      COUNT_ADVANTAGE_FOOTER +
      ':has(.manager-modal-subtitle:text-is("Sera Vane · Complex Work"))' +
      ':has(.formula-content .formula[data-roll-prompt-count="under"]:text-is("2d20 · each ≤ 14"))' +
      ':has(.formula-content .formula-note:text-is("Success on ≤ 14 (character value 13), moved +1 by modifiers"))' +
      ':has(.formula-content .manager-chip[data-roll-prompt-required="2"]:has-text("2 successes needed"))' +
      ':has(.static-modifiers .manager-chip:has-text("Steady hands +1"))' +
      ':has(.static-modifiers > .help:text-is("Each moves the threshold."))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SIMPLE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  // Issue 2006: the note names the faces actually authored, a from-face explosion and cancel.
  playerCase({
    id: 'player-crafting-roll-prompt-count-explode',
    label: 'Player app — success-counting crafting roll prompt naming its chosen faces',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count-explode' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      SINGLE_PROMPT +
      COUNT_ADVANTAGE_FOOTER +
      ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("6d10 · each ≥ 7"))' +
      ':has(.formula-content .formula-note:text-is("Success on ≥ 7 · explodes on 9 or above once · 2 or under cancels a success"))' +
      ':not(:has([data-roll-prompt-zero-pool]))' +
      ' .formula-content .manager-chip[data-roll-prompt-required="2"]',
    kinds: ['player', 'crafting'],
    sourceMatches: COUNT_PROMPT_SOURCES,
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-count-explode-narrow',
    label: 'Player app — success-counting crafting roll prompt naming its chosen faces at 1024x640',
    smokeLabels: [],
    reaches: 'beyond',
    position: { width: 1024, height: 640 },
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count-explode' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      SINGLE_PROMPT +
      ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("6d10 · each ≥ 7"))' +
      ' .formula-content .manager-chip[data-roll-prompt-required="2"]',
    kinds: ['player', 'crafting', 'responsive'],
    sourceMatches: COUNT_PROMPT_SOURCES,
  }),
  // A pool reduced to zero warns that the roll fails, and the roll stays possible.
  playerCase({
    id: 'player-crafting-roll-prompt-count-zero',
    label: 'Player app — success-counting crafting roll prompt over a pool of no dice',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'count-zero' },
    steps: [...CRAFT_HORSESHOE],
    expectSelector:
      SINGLE_PROMPT +
      COUNT_ADVANTAGE_FOOTER +
      ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("0d10 · each ≥ 7"))' +
      ':has(button[type="submit"]:not([disabled]))' +
      ' .formula-content [data-roll-prompt-zero-pool]',
    kinds: ['player', 'crafting'],
    sourceMatches: COUNT_PROMPT_SOURCES,
  }),
  // The recipe detail behind the count prompt: the pool line in place of a formula, its successes
  // needed (issue 2006) and no DC chip.
  playerCase({
    id: 'player-crafting-check-count',
    label: 'Player app — success-counting crafting check in the recipe detail',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', rollPromptState: 'count' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-recipe-section="check"]', scroll: true },
    ],
    expectSelector:
      '[data-recipe-section="check"][data-check-usable="true"]' +
      ':has([data-check-formula] code:text-is("5d10 · each ≥ 8"))' +
      ':has([data-check-successes-needed="2"]:has-text("2 successes needed"))' +
      ':not(:has([data-check-dc]))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_SIMPLE,
      /^src\/ui\/presenters\/CraftingListingBuilder\.js$/,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-light',
    label: 'Player app — light frame crafting roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'light', colorScheme: 'light' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      `${SINGLE_PROMPT}:not(:has(button[data-action="advantage"]))` +
      ':has(.manager-modal-footer button[data-action="roll"][type="submit"])' +
      ':has(.manager-modal-subtitle:has-text("Bend Horseshoe"))' +
      ':has(.formula-content .formula:has-text("2d6 + 3"))' +
      ':has(.formula-content .manager-chip:has-text("DC 15 · meet or beat"))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SIMPLE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  playerCase({
    id: 'player-gathering-events',
    label: 'Player app — Gathering events',
    smokeLabels: ['player-gathering-events'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The counterpart's own sequence, on the world's only environment that has an Events tab.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '[data-gathering-detail-tab="events"]' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-task-ready',
    label: 'Player app — Gathering task ready',
    smokeLabels: ['player-gathering-task-ready'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The counterpart's condition is a selected task whose attempt is not blocked.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-ridgemoss"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-after-success',
    label: 'Player app — Gathering after success',
    smokeLabels: ['player-gathering-after-success'],
    // The gather runs end to end and the frame says so: `Nodes available: 2/3` against the ready state's 3/3.
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '.gathering-task-row[data-task-id="sm-task-prospect"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-drop-open',
    label: 'Player app — Gathering drop modifiers open',
    // The only state that draws the repaired drop disclosure (issue 1512), on the world's five-row
    // drop table, so one open row's breakdown shows against four collapsed siblings.
    reaches: 'beyond',
    smokeLabels: [],
    query: { tab: 'gathering' },
    steps: [
      { selector: '.gathering-env-card[data-environment-id="sm-env-mine"]' },
      { selector: '.gathering-task-row[data-task-id="sm-task-prospect"] .gathering-task-summary' },
      { selector: ':nth-match(.gathering-task-drop-summary, 1)', scroll: true },
      // A scroll step short-circuits before the driver's activation branch, so opening is its own.
      { selector: ':nth-match(.gathering-task-drop-summary, 1)', press: 'Enter' },
    ],
    // The open row and the region it names, so a header that only flipped its attribute fails.
    expectSelector:
      '.gathering-task-drop:has(.gathering-task-drop-summary[aria-expanded="true"][aria-controls])' +
      ' [data-gathering-drop-modifiers]',
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-tool-blocked',
    label: 'Player app — Gathering tool blocked',
    smokeLabels: ['player-gathering-tool-blocked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // Blocked on the tool reason: the task wants the herbalist's alembic and the gathering actor is the smith.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-icecap"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-timed-ready',
    label: 'Player app — Gathering timed ready',
    smokeLabels: ['player-gathering-timed-ready'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // A timed task before it starts: unblocked, with the requirements panel naming the six hours it will wait.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-slowbloom"] .gathering-task-summary' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-timed-active',
    label: 'Player app — Gathering timed active',
    smokeLabels: ['player-gathering-timed-active'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The same task after its attempt has been started.
    steps: [
      { selector: '.gathering-env-card[data-environment-id="hb-env-ridge"]' },
      { selector: '.gathering-task-row[data-task-id="hb-task-slowbloom"] .gathering-task-summary' },
      { selector: '.gathering-task-detail-attempt' },
    ],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-blind',
    label: 'Player app — Gathering blind',
    smokeLabels: ['player-gathering-blind'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // A blind-selection environment redacts its task list: one opaque attempt card, with the mask chip above it.
    steps: [{ selector: '.gathering-env-card[data-environment-id="hb-env-thicket"]' }],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-realm-locked',
    label: 'Player app — Gathering realm locked',
    smokeLabels: ['player-gathering-realm-locked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    // The one environment-card state selection cannot reach: a locked teaser with the not-in-current-realm alert.
    steps: [{ selector: '.gathering-env-card.is-locked', scroll: true }],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-gathering-stacked',
    label: 'Player app — Gathering stacked',
    smokeLabels: ['player-gathering-stacked'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'gathering', 'responsive'],
    expectLayout: responsiveLayout('.gathering-view-container', '.gathering-view-grid'),
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  }),
  playerCase({
    id: 'player-crafting-simple',
    label: 'Player app — Crafting simple',
    smokeLabels: ['player-crafting-simple'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1100, height: 760 },
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  // The Crafting header withholds `Ready to craft` and leads the blocking callout with the authority's own reason.
  playerCase({
    id: 'player-crafting-authority-blocked',
    label: 'Player app — Crafting blocked by the run authority',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', journalCaseState: 'authority-unavailable' },
    steps: [],
    position: { width: 1100, height: 760 },
    expectTab: 'crafting',
    expectSelector: '[data-recipe-authority-blocked]',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/apps\/crafting\/RecipeDetailHeader\.svelte$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-category-filter-list',
    label: 'Player app — Crafting category filter list',
    smokeLabels: [],
    reaches: 'beyond',
    // The full-width panel, and the only player option list with a sentinel row (issue 1511).
    query: { tab: 'crafting' },
    position: { width: 1100, height: 760 },
    steps: [{ selector: '[data-crafting-category-filter]' }],
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="__unchanged__"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-crafting-sources-picker',
    label: 'Player app — Crafting component sources picker',
    // The panel thirty-three frames claim and none opens (issue 1513).
    reaches: 'beyond',
    smokeLabels: [],
    query: { tab: 'crafting' },
    steps: [{ selector: '[data-crafting-sources-add]' }],
    // The portaled form, as of the phase that routed this control onto the shared picker.
    expectSelector:
      '.fabricate-picker-popover.crafting-sources-popover ' +
      '.manager-travel-popover-options .crafting-source-option',
    kinds: ['player', 'crafting'],
    // `apps/crafting/ComponentSourcesBar.svelte` named explicitly rather than left to `CRAFTING_SHARED`.
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-crafting-ingredient-routed',
    label: 'Player app — Crafting ingredient routed',
    smokeLabels: ['player-crafting-ingredient-routed'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="jw-r-cast"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_INGREDIENTS,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-routed-by-check',
    label: 'Player app — Crafting routed by check',
    smokeLabels: ['player-crafting-routed-by-check'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The crafting list pages at twelve rows, and the lab world now holds more recipes than
    // that ahead of the Runeblade alphabetically (issue 1907), so narrow the list first.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Runeblade' },
      { selector: '.crafting-recipe-row[data-recipe-id="rw-r-blade"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_CHECK,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-run-summary',
    label: 'Player app — Crafting run summary',
    smokeLabels: ['player-crafting-run-summary'],
    // The counterpart waits on the right column swapping to the run summary, which needs a `lastRollResult` entry.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Smelt Iron' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-iron-ingot"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-roll-result',
    label: 'Player app — Crafting roll result',
    smokeLabels: ['player-crafting-roll-result'],
    // The counterpart's condition is the `RollResultBox` inside the run summary, scrolled into frame.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
      {
        selector: '[data-crafting-run-summary] [data-recipe-section="roll-result"]',
        scroll: true,
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt',
    label: 'Player app — Crafting roll prompt with modifier choice',
    smokeLabels: ['player-crafting-roll-prompt'],
    // The interactive check roll prompt, standing and unanswered, with the `playerPicks` fieldset issue 855 adds.
    reaches: 'exact',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'pick-one' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    // The app route alone is satisfied by a prompt that never opened, so the prompt is asserted.
    expectSelector:
      `${SINGLE_PROMPT}:has(input[type="radio"][name="craftingModifier"])` +
      ':has(.manager-modal-subtitle:has-text("Reduce a Stillroom Batch"))' +
      ':has(.formula-content .formula:has-text("1d20 + 3"))' +
      ':not(:has(.formula-content .manager-chip))' +
      ':has(.modifier-choice span:has-text("Medicine") ~ span:last-child:has-text("+4"))' +
      ':has(.modifier-choice span:has-text("Nature") ~ span:last-child:has-text("+2"))' +
      ':has(.modifier-choice span:has-text("Herbalism kit") ~ span:last-child:has-text("+3"))',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      // Narrow rather than `CRAFTING_SHARED`: `rollPrompt.js` builds this dialog end to end and nothing else does.
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPromptHost\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-multipick',
    label: 'Player app — multipick crafting roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      SINGLE_PROMPT +
      ':has(.manager-modal-subtitle:has-text("Reduce a Stillroom Batch"))' +
      ':has(.formula-content .formula:has-text("1d20 + 3"))' +
      ':not(:has(.formula-content .manager-chip))' +
      ':has(input[type="checkbox"][name="craftingModifier"][aria-label="Medicine +4"])' +
      ':has(input[type="checkbox"][name="craftingModifier"][aria-label="Nature +2"])',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-overflow',
    label: 'Player app — dense crafting roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'overflow' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      SINGLE_PROMPT +
      ':has(.manager-modal-subtitle:has-text("Reduce a Stillroom Batch"))' +
      ':has(.formula-content .formula:has-text("1d20 + 3"))' +
      ':not(:has(.formula-content .manager-chip))' +
      ':has(.modifier-choice span:has-text("of the longest remembered herbalist tradition"))' +
      ':has(input[type="checkbox"][name="craftingModifier"][aria-label*="Medicine"][aria-label*="+4"])',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-roll-prompt-compact',
    label: 'Player app — crafting roll prompt at its height cap',
    smokeLabels: [],
    reaches: 'beyond',
    // Enough long-named choices to meet the modal's height cap: the body scrolls, the footer stays.
    query: { tab: 'crafting', dialog: 'open', rollPromptState: 'compact' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
    ],
    expectSelector:
      SINGLE_PROMPT +
      ':has(.manager-modal-subtitle:has-text("Reduce a Stillroom Batch"))' +
      ':has(.modifier-choice span:has-text("Field note 9"))',
    expectScrollable: `${SINGLE_PROMPT} .fabricate-roll-prompt`,
    expectContained: [
      { container: SINGLE_PROMPT, target: `${SINGLE_PROMPT} .manager-modal-footer` },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPromptHost\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-essence-alternative',
    label: 'Player app — Crafting essence alternative',
    smokeLabels: ['player-crafting-essence-alternative'],
    // The counterpart wants an open alternatives radiogroup whose essence option draws the glyph face.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Quench in Fire' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-quenchoil"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-alternatives',
    label: 'Player app — Crafting alternatives',
    smokeLabels: ['player-crafting-alternatives'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-longsword"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-legacy',
    label: 'Player app — Crafting essence legacy',
    smokeLabels: ['player-crafting-essence-legacy'],
    // Window, and unreachable from fixture data: the legacy surface renders only from a set-level essences map.
    reaches: 'window',
    query: { tab: 'crafting' },
    steps: [],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-ingredient',
    label: 'Player app — Crafting essence ingredient',
    smokeLabels: ['player-crafting-essence-ingredient'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-emberbrand"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-shopping',
    label: 'Player app — Crafting essence shopping',
    smokeLabels: ['player-crafting-essence-shopping'],
    // The counterpart's condition is an essence tile inside the shopping list's acquire card.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Rivet Chainmail' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"]' },
      {
        selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"] .crafting-recipe-row-add',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-slot-rail',
    label: 'Player app — Crafting slot rail',
    smokeLabels: ['player-crafting-slot-rail'],
    // The counterpart's three assertions reproduced: the rail's exact slot states, and exactly one chooser open.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Temper a Tidebound' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-tidebound"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-tag-unmatched',
    label: 'Player app — Crafting tag unmatched',
    smokeLabels: ['player-crafting-tag-unmatched'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The counterpart's three assertions reproduced: a tag tile draws its own glyph, and no chooser is open.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Refine Silver' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-silver-ingot"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-pool',
    label: 'Player app — Crafting essence pool',
    smokeLabels: ['player-crafting-essence-pool'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-pick-for-me',
    label: 'Player app — Crafting pick for me',
    smokeLabels: ['player-crafting-pick-for-me'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // `Pick for me` restoring the resolver's suggestion after the player trimmed it, as the counterpart does.
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Rivet Chainmail' },
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-chainmail"]' },
      {
        selector: '.essence-pool-carrier[data-essence-carrier="Item.sm-coal"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector: '.essence-pool-carrier[data-essence-carrier="Item.sm-ruby"] .fab-stepper-input',
        fill: '0',
      },
      { selector: '.requirement-rail-wand' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-essence-pool-shared',
    label: 'Player app — Crafting essence pool shared',
    smokeLabels: ['player-crafting-essence-pool-shared'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    // The shared-pool proof: two essence requirements in one set, funded from one dual carrier.
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-deepbind"]' },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-iron-ore"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-iron-ingot"] .fab-stepper-input',
        fill: '0',
      },
      {
        selector:
          '.essence-pool-carrier[data-essence-carrier="Item.sm-steel-ingot"] .fab-stepper-input',
        fill: '2',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-consumption-plan',
    label: 'Player app — Crafting consumption plan',
    smokeLabels: ['player-crafting-consumption-plan'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [{ selector: '.crafting-recipe-row[data-recipe-id="sm-r-shield"]' }],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-multistep',
    label: 'Player app — Crafting multistep',
    smokeLabels: ['player-crafting-multistep'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-recipe-row[data-recipe-id="sm-r-pattern-blade"]' },
      // Scroll to the second step to show its own coal-only cost rather than step 1's Steel Ingot and Coal.
      { selector: '[data-recipe-step]:nth-of-type(2)', scroll: true },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [CRAFTING_SHARED, CRAFTING_SIMPLE, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  playerCase({
    id: 'player-crafting-routed-multistep',
    label: 'Player app — Crafting routed multistep with an empty first step',
    // Issue 1907: the first step's routed group is authored EMPTY, so the selected set produces
    // nothing and the Produces row has to come from the TERMINAL step instead. `gl-r-lens` is the
    // world's only multi-step `routedByIngredients` recipe — Jewellery's feature is off by design.
    reaches: 'beyond',
    smokeLabels: [],
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reading Lens' },
      { selector: '.crafting-recipe-row[data-recipe-id="gl-r-lens"]' },
      // The Produces row sits below the requirements and the alternatives, so the frame has to be
      // scrolled to it or it photographs everything except the thing it exists to show.
      { selector: '[data-io-group="outputs"]', scroll: true },
    ],
    // The routed body over a product row: without the terminal-step read the Output section is not
    // rendered at all, so this selector is satisfied only by the fixed behaviour.
    expectSelector:
      '[data-recipe-mode="routedByIngredients"] [data-io-group="outputs"] .crafting-io-output-name',
    // The PRODUCT NAME is what the frame has to make legible; `scrollIntoViewIfNeeded` leaves the
    // group itself flush against the scroll container's edge once the multi-step hint wraps.
    expectContained: [
      {
        container: '[data-crafting-detail-scroll]',
        target: '[data-io-group="outputs"] .crafting-io-output-name',
      },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_ROUTED_INGREDIENTS,
      /^src\/ui\/presenters\/CraftingListingBuilder\.js$/,
      /^src\/ui\/svelte\/stores\/craftingStore/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive',
    label: 'Player app — Crafting progressive',
    smokeLabels: ['player-crafting-progressive'],
    // The reorderable stage list at rest, with grips, ordinals, per-stage difficulty and its thresholds.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
    // The crafting half of the complication band (issue 1286): `ProgressiveBody` passes `complications` unconditionally.
    expectSelector:
      '[data-recipe-mode="progressive"]' +
      ':has([data-recipe-section="progressive-stages"] ' +
      '[data-progressive-stage-complications][data-progressive-stage-complication-tense="forecast"] ' +
      '[data-progressive-stage-complication="hb-comp-dust-cloud"])' +
      ':not(:has([data-progressive-stage-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    id: 'player-crafting-progressive-reordered',
    label: 'Player app — Crafting progressive reordered',
    smokeLabels: ['player-crafting-progressive-reordered'],
    // The same list after one downward move, the only state in which two of its invariants stop being vacuous.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
      { selector: '[data-progressive-stage-move-down]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-fixed',
    label: 'Player app — Crafting progressive fixed',
    smokeLabels: ['player-crafting-progressive-fixed'],
    // The GM-ordered variant, on its own recipe: `allowPlayerResultReorder` defaults true, so false must be authored.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Set the Drying Kiln' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-kiln"]' },
    ],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-progressive-stacked',
    label: 'Player app — Crafting progressive stacked',
    smokeLabels: ['player-crafting-progressive-stacked'],
    // The shared 960px boundary makes the stacked condition reachable at the 1024px player-window floor.
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [
      { selector: '.crafting-browser-search input', fill: 'Reduce a Stillroom' },
      { selector: '.crafting-recipe-row[data-recipe-id="hb-r-stillroom"]' },
    ],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'crafting', 'responsive'],
    sourceMatches: [
      CRAFTING_SHARED,
      CRAFTING_PROGRESSIVE,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-crafting-stacked',
    label: 'Player app — Crafting stacked',
    smokeLabels: ['player-crafting-stacked'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'crafting', 'responsive'],
    expectLayout: responsiveLayout('.crafting-view-container', '.crafting-view-grid'),
    sourceMatches: [CRAFTING_SHARED, /^src\/ui\/svelte\/stores\/craftingStore/],
  }),
  ...playerCountResultCases(),
  ...playerAdvantagePromptCases(),
]);
