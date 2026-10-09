/**
 * Issue 2008's additional-dice roll prompt states on the horseshoe's simple crafting check (frames
 * 30 to 34), one per row of the prompt's state table and ruling R1 to R4, and the companion overlay
 * carrying the same control. Each state is seeded by `tests/view-lab/additionalDiceFixtures.js`.
 */

import { CRAFTING_SIMPLE } from './caseConstants.js';
import { playerCase } from './caseFactories.js';

const SINGLE_PROMPT = '.fabricate-app .manager-modal[data-roll-prompt="single"]';
const CRAFT_HORSESHOE = Object.freeze([
  { selector: '.crafting-recipe-row[data-recipe-id="sm-r-horseshoe"]' },
  { selector: '[data-crafting-craft][data-crafting-craft-disabled="false"]' },
]);
const STEP_UP = Object.freeze({
  selector: `${SINGLE_PROMPT} [data-roll-prompt-additional-dice-stepper] [data-stepper-increment]`,
});

/** The control's resource line, then its spend line. */
const LINE = (resource, spend) =>
  `:has([data-roll-prompt-additional-dice-resource]:text-is("${resource}"))` +
  `:has([data-roll-prompt-additional-dice-spend]:text-is("${spend}"))`;
/** The control's one message, by its Notice tone and sentence. */
const MESSAGE = (tone, text) =>
  `:has([data-roll-prompt-additional-dice-message].is-${tone}:has-text("${text}"))`;
const NO_MESSAGE = ':not(:has([data-roll-prompt-additional-dice-message]))';
/** The stepper input, enabled or disabled, at `value`. */
const STEPPER = (disabled) =>
  `:has(input[data-roll-prompt-additional-dice]${disabled ? ':disabled' : ':not(:disabled)'})`;
/** A footer action blocked in place (`aria-disabled`), or enabled. */
const BLOCKED = (action) =>
  `:has(.manager-modal-footer button[data-action="${action}"][aria-disabled="true"])`;
const ENABLED = (action) =>
  `:has(.manager-modal-footer button[data-action="${action}"]:not([aria-disabled]))`;
const BLOCK_NOTE = (text) => `:has([data-roll-prompt-block-note]:text-is("${text}"))`;
const NO_BLOCK_NOTE = ':not(:has([data-roll-prompt-block-note]))';
const ALL_ENABLED = ENABLED('disadvantage') + ENABLED('normal') + ENABLED('advantage');
const TWO_D20 =
  ':has(.formula-content .formula[data-roll-prompt-count="under"]:text-is("2d20 · each ≤ 13"))';

const PROMPT_SOURCES = Object.freeze([
  CRAFTING_SIMPLE,
  /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Target|Footer|AdditionalDice)?\.svelte$/,
  /^src\/ui\/svelte\/apps\/crafting\/rollPrompt(?:Target)?\.js$/,
  /^src\/ui\/presenters\/additionalDicePrompt\.js$/,
]);

function promptCase({ id, label, state, expectSelector, steps = [], ...rest }) {
  return playerCase({
    id,
    label: `Player app — crafting roll prompt, additional dice ${label}`,
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting', dialog: 'open', rollPromptState: state },
    steps: [...CRAFT_HORSESHOE, ...steps],
    expectSelector: SINGLE_PROMPT + expectSelector,
    kinds: rest.position ? ['player', 'crafting', 'responsive'] : ['player', 'crafting'],
    sourceMatches: PROMPT_SOURCES,
    ...rest,
  });
}

const IMPOSSIBLE =
  BLOCKED('disadvantage') +
  BLOCKED('normal') +
  BLOCKED('advantage') +
  MESSAGE(
    'danger',
    'Cannot reach 5 successes. 2 dice need at least 3 more, and at most 1 can ever be added.'
  ) +
  BLOCK_NOTE('Rolling is disabled: this attempt cannot reach the successes it needs.');

export function playerAdditionalDicePromptCases() {
  return [
    // Frame 30 (`pCntOn`): two d20s need two successes, so nothing is short and nothing is said.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional',
      label: 'offered from Momentum (prototype frame 30)',
      state: 'count-additional',
      expectSelector:
        TWO_D20 +
        LINE('Momentum 2 available', 'Spends 0 Momentum') +
        ':has(input[data-roll-prompt-additional-dice]:not(:disabled))' +
        NO_MESSAGE +
        ALL_ENABLED,
    }),
    // Frame 31 at rest: the stepper opens at 0, so the shortfall is stated and never pre-selected.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-floor',
      label: 'one die short, none chosen yet (prototype frame 31, at rest)',
      state: 'count-additional-floor',
      expectSelector:
        LINE('Momentum 2 available', 'Spends 0 Momentum') +
        MESSAGE('warning', 'At least 1 additional die needed to be able to succeed.') +
        ALL_ENABLED,
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-floor-enough',
      label: 'one die short, one chosen (prototype frame 31)',
      state: 'count-additional-floor',
      steps: [STEP_UP],
      expectSelector:
        LINE('Momentum 2 available', 'Spends 1 Momentum') +
        MESSAGE('success', 'At least 1 additional die is needed. You have enough.') +
        ALL_ENABLED,
    }),
    // Frame 32 under R1: with no Momentum, only Advantage's extra die can reach three successes.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-insufficient',
      label: 'none affordable, only Advantage reaching (prototype frame 32, ruling R1)',
      state: 'count-additional-insufficient',
      expectSelector:
        LINE('Momentum 0 available', 'Spends 0 Momentum') +
        STEPPER(true) +
        MESSAGE(
          'danger',
          'Without Advantage, these dice cannot reach 3 successes. 2 dice need at least 1 more, and you can afford 0.'
        ) +
        BLOCKED('disadvantage') +
        BLOCKED('normal') +
        ENABLED('advantage') +
        BLOCK_NOTE('Only Advantage can reach the successes needed.'),
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-disadvantage-only',
      label: 'none affordable, only Disadvantage short (ruling R1)',
      state: 'count-additional-disadvantage-only',
      expectSelector:
        BLOCKED('disadvantage') +
        ENABLED('normal') +
        ENABLED('advantage') +
        BLOCK_NOTE('Disadvantage cannot reach the successes needed.'),
    }),
    // Frame 33: five successes from two d20s, one more affordable, and one more with Advantage.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-impossible',
      label: 'no action able to reach (prototype frame 33)',
      state: 'count-additional-impossible',
      expectSelector: IMPOSSIBLE + ':has(input[name="situationalBonus"]:focus)',
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-impossible-narrow',
      label: 'no action able to reach, at 1024x640 (prototype frame 33)',
      state: 'count-additional-impossible',
      position: { width: 1024, height: 640 },
      expectSelector: IMPOSSIBLE,
      expectContained: [
        { container: SINGLE_PROMPT, target: `${SINGLE_PROMPT} .manager-modal-footer` },
        {
          container: `${SINGLE_PROMPT} .manager-modal-footer`,
          target: `${SINGLE_PROMPT} [data-roll-prompt-block-note]`,
        },
      ],
    }),
    // Decision 16: an automatic-success trigger can still pass, so it warns and never blocks.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-rescued',
      label: 'no action able to reach, rescued by an automatic success',
      state: 'count-additional-rescued',
      expectSelector:
        MESSAGE('danger', 'A trigger on this check can still succeed it.') +
        ALL_ENABLED +
        NO_BLOCK_NOTE,
    }),
    // A recursive explosion can always reach, so the shortfall reads as without exploding dice.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-explode',
      label: 'short of five successes while dice explode',
      state: 'count-additional-explode',
      expectSelector:
        MESSAGE('warning', 'At least 3 additional dice needed to succeed without exploding dice.') +
        ':not(:has([data-roll-prompt-additional-dice-message]:has-text("Cannot reach")))' +
        ALL_ENABLED +
        NO_BLOCK_NOTE,
    }),
    // R4: a modifier takes every die, and nothing affordable lifts the pool off zero.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-zero-pool',
      label: 'a pool at zero no die can lift (ruling R4)',
      state: 'count-additional-zero-pool',
      expectSelector:
        BLOCKED('disadvantage') +
        BLOCKED('normal') +
        BLOCKED('advantage') +
        BLOCK_NOTE(
          'Rolling is disabled: the pool is reduced to zero, and the dice you can add cannot lift it.'
        ),
    }),
    // R1 with advantage off: the one Roll is judged as Normal.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-single-roll',
      label: 'the single Roll unable to reach (ruling R1)',
      state: 'count-additional-single-roll',
      expectSelector:
        ':not(:has(button[data-action="advantage"]))' +
        BLOCKED('roll') +
        BLOCK_NOTE('Rolling is disabled: this attempt cannot reach the successes it needs.'),
    }),
    // Reachable without bought dice, and none affordable: said, and nothing blocks.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-unaffordable',
      label: 'none affordable on a reachable roll',
      state: 'count-additional-unaffordable',
      expectSelector:
        LINE('Momentum 0 available', 'Spends 0 Momentum') +
        STEPPER(true) +
        MESSAGE('info', 'Not enough Momentum to buy a die.') +
        ALL_ENABLED,
    }),
    // R2: no Resource name, so the amount stands alone.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-unlabelled',
      label: 'with no Resource name (ruling R2)',
      state: 'count-additional-unlabelled',
      expectSelector:
        LINE('2 available', 'Spends 0') +
        ':not(:has([data-roll-prompt-additional-dice-group]:has-text("Momentum")))',
    }),
    // Frame 34 (`pCntMiss`): Sera Vane holds no Momentum, and no path reaches the player.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-unreadable',
      label: 'with no readable value (prototype frame 34)',
      state: 'count-additional-unreadable',
      expectSelector:
        LINE('Sera Vane has no Momentum value', 'Spends 0') +
        STEPPER(true) +
        MESSAGE(
          'info',
          'Additional dice are unavailable: Sera Vane has no readable Momentum value.'
        ) +
        ':not(:has([data-roll-prompt-additional-dice-group]:has-text("system.")))' +
        ALL_ENABLED,
    }),
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-overridden',
      label: 'set by an active effect',
      state: 'count-additional-overridden',
      expectSelector:
        LINE('Momentum unavailable', 'Spends 0') +
        STEPPER(true) +
        MESSAGE(
          'info',
          "Additional dice are unavailable: an active effect sets Sera Vane's Momentum, so it cannot be spent."
        ),
    }),
    // A system narrowing update permission (core's OWNER test passes every owner).
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-not-writable',
      label: 'that the player cannot change',
      state: 'count-additional-not-writable',
      expectSelector:
        LINE('Momentum unavailable', 'Spends 0') +
        STEPPER(true) +
        MESSAGE('info', "Additional dice are unavailable: you cannot change Sera Vane's Momentum."),
    }),
    // The read macro is a chat macro, refused before it runs.
    promptCase({
      id: 'player-crafting-roll-prompt-count-additional-macro-failed',
      label: 'whose read macro cannot run',
      state: 'count-additional-macro-failed',
      expectSelector:
        LINE('Momentum unavailable', 'Spends 0') +
        STEPPER(true) +
        MESSAGE(
          'info',
          'Additional dice are unavailable: the macro that reads Momentum did not return a number.'
        ),
    }),
    // A companion's interactive request prompts on the standalone overlay with the same control.
    playerCase({
      id: 'player-crafting-roll-prompt-count-additional-companion',
      label: 'Player app — a companion success-counting roll prompt offering additional dice',
      smokeLabels: [],
      reaches: 'beyond',
      query: {
        tab: 'crafting',
        dialog: 'open',
        viewer: 'gm',
        companionRoll: 'count-additional',
        rollPromptState: 'count-additional',
      },
      steps: [{ selector: '[data-lab-companion-roll]' }],
      expectSelector:
        '.fabricate-standalone-overlay .manager-modal[data-roll-prompt="single"]' +
        LINE('Momentum 2 available', 'Spends 0 Momentum') +
        ' input[data-roll-prompt-additional-dice]:not(:disabled)',
      kinds: ['player', 'crafting'],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/crafting\/RollPromptAdditionalDice\.svelte$/,
        /^src\/systems\/companionCheck(?:Roll|Evaluation)\.js$/,
        /^src\/bootstrap\/companionFacade\.js$/,
      ],
    }),
  ];
}
