/**
 * The real-Foundry roll-under chat card cases (issue 2005): each crafting check configuration,
 * decided by construction whatever the dice show, and the checks its posted card, its roll
 * message and, for the refusal, the crafting app must pass. Pure and Playwright-free, so the
 * smoke's assertions are unit-tested against cards the shipped renderer builds.
 */
import { formatSignedStep } from '../../src/utils/checkAdjustmentFormat.js';

import { summarizeCraftCard } from './craftChatCardSummary.js';

/** The crafter's character value every attribute case reads: a dnd5e Starter Hero's Strength. */
export const UNDER_CHARACTER_PATH = '@abilities.str.value';

/** The least Strength that keeps the passing case a pass: `1d6` against it plus a `1d4`. */
export const UNDER_MIN_CHARACTER_VALUE = 6;

const attribute = (expression, adjustmentKind = 'add') => ({
  product: 'sum',
  direction: 'under',
  target: { source: 'attribute', expression, adjustmentKind, baseAdjustment: null },
});

/** The smoke case ids, in walk order: each rolls `check` in one mode's check slot. */
export const UNDER_CHAT_CARD_CASES = Object.freeze([
  {
    id: 'pass',
    // A d6 never exceeds a Strength of 6 or more, raised further by the typed situational 1d4.
    resolutionMode: 'simple',
    slot: 'simple',
    bonus: '1d4',
    check: {
      rollFormula: '1d6',
      dc: 10,
      thresholdMode: 'meet',
      evaluation: attribute(UNDER_CHARACTER_PATH),
    },
  },
  {
    id: 'fail',
    // 31 to 36 never stays at or under the fixed target 12.
    resolutionMode: 'simple',
    slot: 'simple',
    check: {
      rollFormula: '1d6 + 30',
      dc: 12,
      thresholdMode: 'meet',
      evaluation: { product: 'sum', direction: 'under', target: { source: 'fixed' } },
    },
  },
  {
    id: 'otherwise',
    // 31 to 36 stays under no multiplied Strength, which dnd5e caps at 30, so Otherwise applies.
    resolutionMode: 'routedByCheck',
    slot: 'routed',
    check: {
      type: 'relative',
      rollFormula: '1d6 + 30',
      dc: 10,
      thresholdMode: 'meet',
      evaluation: attribute(UNDER_CHARACTER_PATH, 'multiply'),
      relativeOutcomes: [
        {
          id: 'under-regular',
          name: 'Regular',
          success: true,
          breakTools: false,
          dc: 0,
          adjustment: 1,
        },
        {
          id: 'under-otherwise',
          name: 'Otherwise',
          success: false,
          breakTools: false,
          dc: 0,
          adjustment: null,
        },
      ],
    },
  },
  {
    id: 'misconfigured',
    // No actor carries this path, so the check refuses before its prompt opens.
    resolutionMode: 'simple',
    slot: 'simple',
    check: {
      rollFormula: '1d6',
      dc: 10,
      thresholdMode: 'meet',
      evaluation: attribute('@fabricateSmoke.missing'),
    },
  },
]);

/** `{ face, total }` from a dice line of `formula (face) … = total, compared as rolled`, or null. */
function parseDiceLine(line, formula) {
  const head = formula.replace(/^1d6/, String.raw`1d6 \((\d)\)`).replaceAll('+', String.raw`\+`);
  const match = new RegExp(String.raw`^${head} = (\d+), compared as rolled$`).exec(line ?? '');
  return match ? { face: Number(match[1]), total: Number(match[2]) } : null;
}

/** Every roll the execute posted, flattened: `{ formula, total, results }`. */
const postedRolls = (rollMessages) => rollMessages.flatMap((message) => message.rolls ?? []);

/** A formula without spacing or the one pair of brackets a rolled bonus may be wrapped in. */
const bare = (formula) =>
  String(formula ?? '')
    .replaceAll(/\s+/g, '')
    .replace(/^\((.*)\)$/, '$1');

const rollsOf = (rollMessages, formula) =>
  postedRolls(rollMessages).filter((roll) => bare(roll.formula) === bare(formula));

/** The check's own Roll, found by its formula, must show the card's face and total. */
function rollAgreementFailures(caseId, formula, dice, rollMessages) {
  const rolls = rollsOf(rollMessages, formula);
  if (rolls.length !== 1) return [`${caseId}: ${rolls.length} posted ${formula} rolls, expected 1`];
  const [roll] = rolls;
  const faces = (roll.results ?? []).filter((entry) => entry.active !== false);
  if (roll.total !== dice.total || faces.length !== 1 || faces[0].result !== dice.face) {
    return [`${caseId}: the card's ${dice.face} = ${dice.total} disagrees with the posted roll`];
  }
  return [];
}

const rowText = (summary, id) => summary.rows.find((row) => row.id === id)?.text ?? null;

function rowIdFailures(caseId, summary, expected) {
  const ids = summary.rows.map((row) => row.id);
  return JSON.stringify(ids) === JSON.stringify(expected)
    ? []
    : [
        `${caseId}: evidence rows ${ids.join(', ') || 'none'}, expected ${expected.join(', ') || 'none'}`,
      ];
}

/** The passing case's rows must fold: the character value plus the pre-roll is the target. */
function passRowFailures(summary, dice, rollMessages, characterValue) {
  const failures = rowIdFailures('pass', summary, ['target', 'preRolled', 'margin']);
  const target = /^(\d+) · .+ @abilities\.str\.value (\d+), situational \+(\d+)$/.exec(
    rowText(summary, 'target') ?? ''
  );
  if (!target) return [...failures, `pass: Target row "${rowText(summary, 'target')}"`];
  const [total, value, situational] = target.slice(1).map(Number);
  if (value !== characterValue) failures.push(`pass: Target read ${value}, not ${characterValue}`);
  if (total !== value + situational) failures.push(`pass: Target ${total} does not fold`);
  if (
    rowText(summary, 'preRolled') !== `Situational 1d4 rolled ${situational}, raising the target`
  ) {
    failures.push(`pass: Pre-rolled row "${rowText(summary, 'preRolled')}"`);
  }
  const margin = `${formatSignedStep(total - dice.total)} under the target`;
  if (rowText(summary, 'margin') !== margin) failures.push(`pass: Margin is not "${margin}"`);
  const preRolls = rollsOf(rollMessages, '1d4');
  if (preRolls.length !== 1 || preRolls[0].total !== situational) {
    failures.push('pass: the posted 1d4 pre-roll disagrees with the Pre-rolled row');
  }
  return failures;
}

function failRowFailures(summary, dice) {
  const failures = rowIdFailures('fail', summary, ['target', 'margin']);
  if (rowText(summary, 'target') !== '12 · fixed')
    failures.push('fail: Target is not "12 · fixed"');
  const margin = `${formatSignedStep(12 - dice.total)} under the target`;
  if (rowText(summary, 'margin') !== margin) failures.push(`fail: Margin is not "${margin}"`);
  return failures;
}

const EXPECTED = Object.freeze({
  pass: { result: 'success', formula: '1d6' },
  fail: { result: 'failure', formula: '1d6 + 30' },
  otherwise: { result: 'failure', formula: '1d6 + 30' },
});

/**
 * Every way one rolled case's card and the roll messages its execute created fall short, empty
 * when it passes. `rollMessages` are `{ rolls: [{ formula, total, results }] }` per created
 * message; `characterValue` is the crafter's Strength as the smoke read it.
 */
export function underCardFailures(caseId, { card, rollMessages = [], characterValue = null }) {
  const expected = EXPECTED[caseId];
  if (!expected) return [`unknown roll-under chat card case "${caseId}"`];
  const summary = summarizeCraftCard(card);
  const failures = [];
  if (summary.result !== expected.result) {
    failures.push(`${caseId}: result pill ${summary.result}, expected ${expected.result}`);
  }
  if (summary.rollValue) failures.push(`${caseId}: the dice line must replace the roll row`);
  const dice = parseDiceLine(summary.diceLine, expected.formula);
  if (!dice) return [...failures, `${caseId}: dice line "${summary.diceLine}"`];
  failures.push(...rollAgreementFailures(caseId, expected.formula, dice, rollMessages));
  if (caseId === 'pass') {
    failures.push(...passRowFailures(summary, dice, rollMessages, characterValue));
  }
  if (caseId === 'fail') failures.push(...failRowFailures(summary, dice));
  // Otherwise has no threshold, so it names neither a target nor a margin.
  if (caseId === 'otherwise') failures.push(...rowIdFailures('otherwise', summary, []));
  return failures;
}

/** The unresolved-path refusal sentence (`FABRICATE.Check.TargetRefusal.UnresolvedPath`). */
const UNRESOLVED_REFUSAL = /the character value its target reads was not found/;

/**
 * Whether the craft refused for the unresolved path. The public craft runs the versioned
 * lifecycle, whose descriptor refuses by throwing `CHECK_TARGET_INVALID`, so it answers
 * `success: false` with the refusal sentence and no `misconfigured` flag; a direct runner answers
 * `misconfigured` with `data.targetRefusal`.
 */
function refusedUnresolved(result) {
  if (result?.success !== false || !UNRESOLVED_REFUSAL.test(result?.message ?? '')) return false;
  return result.misconfigured !== true || result.data?.targetRefusal === 'unresolved-path';
}

/**
 * Every way the refusing case falls short: the craft must refuse for the unresolved path, open no
 * prompt, create no message, leave the log's `.fabricate-craft-chat` count unchanged, and the
 * Crafting tab must show the refusal.
 */
export function misconfiguredFailures({
  result,
  createdMessages = [],
  cardCount = {},
  promptOpened = false,
  refusalText = '',
}) {
  const failures = [];
  if (!refusedUnresolved(result)) {
    failures.push(`misconfigured: the craft answered ${JSON.stringify(result ?? null)}`);
  }
  if (promptOpened) failures.push('misconfigured: a roll prompt opened');
  if (createdMessages.length > 0) {
    failures.push(`misconfigured: the craft created ${createdMessages.length} messages`);
  }
  if (!Number.isInteger(cardCount.before) || cardCount.after !== cardCount.before) {
    failures.push(
      `misconfigured: the chat log held ${cardCount.before} crafting cards and then ${cardCount.after}`
    );
  }
  if (!/could not read a number for its target/.test(refusalText)) {
    failures.push(`misconfigured: the check card shows "${refusalText}", not the refusal`);
  }
  return failures;
}
