/**
 * The result-side choice group's authoring edits (issue 1773), as pure functions over the editor's
 * draft: convert, add and remove an alternative, and the four header settings, each writing only
 * what the group's cell reads (`data-models` Result requirements 8 to 13); and the problems the
 * Validation tab reports, read through the predicates the save refuses on (`choiceGroupShape.js`).
 */
import {
  GROUP_AWARD_STRATEGIES,
  GROUP_CHOOSERS,
  countProblem,
  knownSetting,
  ladderProblems,
} from '../../../../../utils/choiceGroupShape.js';
import { diceEngine, quantityFormulaErrors } from '../../../../../utils/rollFormulaRollability.js';

import { emptyResult } from './pickerRowKinds.js';

/** The fixed N's floor: up to one is any one of. */
export const MIN_AWARD_COUNT = 2;

export const chooserOf = (group) => (group?.chooser === 'rolled' ? 'rolled' : 'playerChooses');
export const strategyOf = (group) => (group?.awardStrategy === 'upTo' ? 'upTo' : 'anyOne');

/** A fresh id for a draft entry: Foundry's own where it is loaded. */
export function newDraftId() {
  const random = globalThis.foundry?.utils?.randomID;
  if (typeof random === 'function') return random();
  return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}

/** `entry` without the selecting range only a rolled group's member reads. */
function withoutRange(entry) {
  const { selectionRange: _range, ...rest } = entry;
  return rest;
}

const blank = (text) => typeof text !== 'string' || text.trim() === '';

/**
 * A flat result converted in place: it keeps its id as the group and its pick becomes the first
 * alternative, beside an empty row of `kind`; the group opens on any one of, the player choosing.
 */
export function convertToGroup(entry, kind, firstId = newDraftId(), addedId = newDraftId()) {
  return {
    id: entry.id,
    alternatives: [{ ...withoutRange(entry), id: firstId }, emptyResult(kind, addedId)],
  };
}

/** `group` with an empty alternative of `kind` appended. */
export function withAlternative(group, kind, id = newDraftId()) {
  return { ...group, alternatives: [...group.alternatives, emptyResult(kind, id)] };
}

/** `group` without its `index`th alternative; one left is that alternative again, without the
 *  group's settings or its range, and none left is `null`. */
export function withoutAlternative(group, index) {
  const rest = group.alternatives.filter((_, i) => i !== index);
  if (rest.length === 0) return null;
  return rest.length === 1 ? withoutRange(rest[0]) : { ...group, alternatives: rest };
}

/**
 * Rolled writes the chooser alone. Under the player the expression, the ranges and repeats stay in
 * the draft, hidden, so switching back restores them; `Result` saves none of them there.
 */
export function withChooser(group, chooser) {
  if (chooser === 'rolled') return { ...group, chooser: 'rolled' };
  const { chooser: _c, ...rest } = group;
  return rest;
}

/** Up to N opens on a fixed N of two; any one of drops N and repeats; the current one is `group`. */
export function withStrategy(group, strategy) {
  if ((group?.awardStrategy ?? 'anyOne') === strategy) return group;
  const {
    awardStrategy: _a,
    awardCount: _n,
    awardCountFormula: _f,
    withReplacement: _w,
    ...rest
  } = group;
  return strategy === 'upTo'
    ? { ...rest, awardStrategy: 'upTo', awardCount: MIN_AWARD_COUNT }
    : rest;
}

/**
 * `group` with the amount slot's patch written as its N: a typed expression replaces the fixed N,
 * and Fixed, or a cleared expression, restores it; a fixed N is held at two or more.
 */
export function withCount(group, patch) {
  const { awardCount, awardCountFormula: _f, ...rest } = group;
  if (Object.hasOwn(patch, 'quantityFormula')) {
    return blank(patch.quantityFormula)
      ? { ...rest, awardCount: awardCount ?? MIN_AWARD_COUNT }
      : { ...rest, awardCountFormula: patch.quantityFormula };
  }
  const typed = Math.round(Number(patch.quantity));
  return { ...rest, awardCount: Math.max(MIN_AWARD_COUNT, Number.isFinite(typed) ? typed : 0) };
}

/** Repeats are written only while allowed; unique is their absence. */
export function withRepeats(group, allowed) {
  const { withReplacement: _w, ...rest } = group;
  return allowed ? { ...rest, withReplacement: true } : rest;
}

/** The selection expression as typed, or no key when it is blank. */
export function withSelection(group, formula) {
  const { selectionFormula: _s, ...rest } = group;
  return blank(formula) ? rest : { ...rest, selectionFormula: formula };
}

/** `next`, a member's own row edit, keeping `member`'s range, which a retype rebuilds without. */
export function keepingRange(member, next) {
  if (!member?.selectionRange || next?.selectionRange) return next;
  return { ...next, selectionRange: member.selectionRange };
}

/** `member` with its range as typed; a range with neither end is no range. */
export function withRange(member, range) {
  const ends = { from: range?.from ?? null, to: range?.to ?? null };
  if (ends.from === null && ends.to === null) return withoutRange(member);
  return { ...member, selectionRange: ends };
}

/** Whether `formula` fails the save's rollability floor, the dice engine being Foundry's own. */
const unrollable = (formula) => quantityFormulaErrors(formula.trim(), diceEngine()).length > 0;

/**
 * What blocks a group from saving, as codes, by the predicates `Result.validate` reads: `tooFew`
 * alternatives, an unknown chooser or strategy as `settings`, a rolled group's `selection` missing
 * or unrollable and its `ranges` (`ladderProblems`), and an up-to group's `count`.
 */
export function groupProblems(group) {
  const alternatives = Array.isArray(group?.alternatives) ? group.alternatives : [];
  const problems = alternatives.length < 2 ? ['tooFew'] : [];
  const known =
    knownSetting(group?.chooser, GROUP_CHOOSERS) &&
    knownSetting(group?.awardStrategy, GROUP_AWARD_STRATEGIES);
  if (!known) problems.push('settings');
  if (group?.chooser === 'rolled') {
    const selection = group.selectionFormula;
    if (blank(selection) || unrollable(selection)) problems.push('selection');
    if (ladderProblems(alternatives).length > 0) problems.push('ranges');
  }
  const count = group?.awardCountFormula;
  const uncounted = countProblem(group) || (!blank(count) && unrollable(count));
  if (group?.awardStrategy === 'upTo' && uncounted) problems.push('count');
  return problems;
}
