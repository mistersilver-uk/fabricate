/**
 * The result-side choice group's authoring edits (issue 1773), as pure functions over the editor's
 * draft: convert, add and remove an alternative, and the four header settings, each writing only
 * what the group's cell reads (`data-models` Result requirements 8 to 13); and the ladder problems
 * the range cells and the Validation tab both report.
 */
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

/** Rolled writes no expression and no ranges; player-chooses drops both, and repeats with them. */
export function withChooser(group, chooser) {
  if (chooser === 'rolled') return { ...group, chooser: 'rolled' };
  const { chooser: _c, selectionFormula: _s, withReplacement: _w, ...rest } = group;
  return { ...rest, alternatives: rest.alternatives.map(withoutRange) };
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

/** `member` with its range as typed; a range with neither end is no range. */
export function withRange(member, range) {
  const ends = { from: range?.from ?? null, to: range?.to ?? null };
  if (ends.from === null && ends.to === null) return withoutRange(member);
  return { ...member, selectionRange: ends };
}

const finiteRange = (range) => Number.isFinite(range?.from) && Number.isFinite(range?.to);
const overlaps = (a, b) => a.from <= b.to && b.from <= a.to;

/**
 * Per alternative, aligned to `alternatives`: `{ code: 'inverted' }` where `from` exceeds `to`,
 * `{ code: 'overlap', with }` naming the first other alternative whose range shares a value, else
 * `null`. A missing range is not a cell problem; the Validation tab reports it.
 */
export function rangeProblems(alternatives = []) {
  const ranges = alternatives.map((member) =>
    finiteRange(member?.selectionRange) ? member.selectionRange : null
  );
  return ranges.map((range, index) => {
    if (!range) return null;
    if (range.from > range.to) return { code: 'inverted' };
    const other = ranges.findIndex(
      (candidate, i) =>
        i !== index && candidate && candidate.from <= candidate.to && overlaps(range, candidate)
    );
    return other === -1 ? null : { code: 'overlap', with: other };
  });
}

/**
 * What blocks a group from saving, as codes: `tooFew` alternatives, a rolled group's `selection`
 * missing or its `ranges` missing, inverted or overlapping, and an up-to group's `count` missing.
 */
export function groupProblems(group) {
  const alternatives = Array.isArray(group?.alternatives) ? group.alternatives : [];
  const problems = alternatives.length < 2 ? ['tooFew'] : [];
  if (chooserOf(group) === 'rolled') {
    if (blank(group.selectionFormula)) problems.push('selection');
    const unranged = alternatives.some((member) => !finiteRange(member?.selectionRange));
    if (unranged || rangeProblems(alternatives).some(Boolean)) problems.push('ranges');
  }
  const counted = Number.isFinite(group?.awardCount) || !blank(group?.awardCountFormula);
  if (strategyOf(group) === 'upTo' && !counted) problems.push('count');
  return problems;
}
