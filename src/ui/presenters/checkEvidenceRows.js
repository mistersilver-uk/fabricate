/**
 * The rows a result box and a result chat card state for an executed summed check (issue 2005),
 * read from its display projection only: Target, Pre-rolled and Margin, or for a fixed roll-high
 * target Needed and Margin. `localize` is key-only, as every card module's is.
 */
import { preRollBenefit } from '../../systems/checkModifierRouter.js';
import { formatCheckAdjustment, formatSignedStep } from '../../utils/checkAdjustmentFormat.js';
import { fill } from '../../utils/fillPlaceholders.js';

const KEYS = Object.freeze({
  target: 'FABRICATE.Check.Evidence.Target',
  preRolled: 'FABRICATE.Check.Evidence.PreRolled',
  margin: 'FABRICATE.Check.Evidence.Margin',
  needed: 'FABRICATE.Check.Evidence.Needed',
  neededDc: 'FABRICATE.Check.Evidence.NeededDc',
  meetOrBeat: 'FABRICATE.Check.Evidence.MeetOrBeat',
  beat: 'FABRICATE.Check.Evidence.Beat',
  targetTerms: 'FABRICATE.Check.Evidence.TargetTerms',
  characterValue: 'FABRICATE.Check.Evidence.CharacterValue',
  characterValueOf: 'FABRICATE.Check.Evidence.CharacterValueOf',
  fixed: 'FABRICATE.Check.Evidence.Fixed',
  difficulty: 'FABRICATE.Check.Evidence.Difficulty',
  tierAdjustment: 'FABRICATE.Check.Evidence.TierAdjustment',
  tools: 'FABRICATE.Check.Evidence.Tools',
  modifiers: 'FABRICATE.Check.Evidence.Modifiers',
  situational: 'FABRICATE.Check.Evidence.Situational',
  preRoll: 'FABRICATE.Check.Evidence.PreRoll',
  preRollLowering: 'FABRICATE.Check.Advantage.PreRollLowering',
  marginUnder: 'FABRICATE.Check.Evidence.MarginUnder',
  toolLabel: 'FABRICATE.Check.Evidence.ToolLabel',
  modifierLabel: 'FABRICATE.Check.Evidence.ModifierLabel',
  situationalLabel: 'FABRICATE.Check.Evidence.SituationalLabel',
});

/** Which benefit group a term or pre-roll source joins, in the order the Target row names them. */
const BENEFIT_GROUPS = Object.freeze([
  ['tools', ['tool']],
  ['modifiers', ['library', 'advantage']],
  ['situational', ['situational']],
]);

/** A typed `@path`'s inner dots, each followed by a word character. */
const PATH_DOT = /@[\w.]+/g;

/**
 * `text` split after each inner dot of every `@path`, so a path too wide for its column breaks at
 * `@skills.smith.` / `level` rather than mid-word (maintainer ruling); joined, the pieces are `text`.
 */
export function pathBreakSegments(text) {
  const value = String(text ?? '');
  const segments = [];
  let cursor = 0;
  for (const { 0: path, index } of value.matchAll(PATH_DOT)) {
    for (const dot of path.matchAll(/\.(?=\w)/g)) {
      const end = index + dot.index + 1;
      segments.push(value.slice(cursor, end));
      cursor = end;
    }
  }
  segments.push(value.slice(cursor));
  return segments;
}

/** Whether a projection's surfaces gain evidence rows: a summed check that rolled for a target. */
export function statesEvidence(display) {
  const evidence = display?.evidence;
  if (!evidence || display.evaluation?.product !== 'sum') return false;
  if (display.evaluation.direction === 'under' || Array.isArray(evidence.targetTerms)) return true;
  return evidence.target !== null;
}

/** A roll-high target read against a fixed DC: no recorded terms name another source. */
function fixedOver(display) {
  return display.evaluation.direction === 'over' && !Array.isArray(display.evidence.targetTerms);
}

/** The pre-rolls that moved the target, in the order they settled. */
function targetPreRolls(evidence) {
  return (evidence.preRolls ?? []).filter((entry) => entry.destination === 'target');
}

function benefitTotals(evidence) {
  const totals = new Map();
  const add = (source, value) => {
    const group = BENEFIT_GROUPS.find(([, sources]) => sources.includes(source))?.[0];
    if (group) totals.set(group, (totals.get(group) ?? 0) + value);
  };
  for (const term of evidence.targetTerms ?? []) {
    if (term.kind === 'benefit') add(term.source, term.value);
  }
  for (const entry of targetPreRolls(evidence)) add(entry.source, preRollBenefit(entry));
  return totals;
}

/**
 * The anchor's part: the character's name and typed formula with its value, `fixed`, or nothing
 * when the source was not recorded. A record without the formula falls back to `character value`.
 */
function anchorPart(evidence, anchor, loc) {
  if (evidence.targetSource === 'fixed') return loc(KEYS.fixed);
  if (evidence.targetSource !== 'attribute') return '';
  if (!evidence.targetExpression) return fill(loc(KEYS.characterValue), { value: anchor.value });
  return fill(loc(KEYS.characterValueOf), {
    actor: evidence.targetActor ?? '',
    expression: evidence.targetExpression,
    value: anchor.value,
  }).trim();
}

/** A difficulty step, named by its tier when the record carries the tier's label. */
function stepPart(term, loc) {
  const kind = term.kind === 'multiplier' ? 'multiply' : 'add';
  const value = formatCheckAdjustment(kind, term.value);
  return term.label
    ? fill(loc(KEYS.tierAdjustment), { label: term.label, value })
    : fill(loc(KEYS.difficulty), { value });
}

/** The terms after the target number: its anchor, the difficulty step and each benefit group. */
function targetParts(evidence, loc) {
  const [anchor, ...steps] = evidence.targetTerms;
  const parts = [];
  if (anchor?.kind === 'anchor') parts.push(anchorPart(evidence, anchor, loc));
  for (const term of steps) {
    if (term.kind === 'adjustment' || term.kind === 'multiplier') parts.push(stepPart(term, loc));
  }
  const totals = benefitTotals(evidence);
  for (const [group] of BENEFIT_GROUPS) {
    const total = totals.get(group);
    if (total) parts.push(fill(loc(KEYS[group]), { value: formatSignedStep(total) }));
  }
  return parts;
}

function targetText(evidence, loc) {
  if (!Array.isArray(evidence.targetTerms) || evidence.targetTerms.length === 0) {
    return String(evidence.target);
  }
  const terms = targetParts(evidence, loc).filter(Boolean);
  if (terms.length === 0) return String(evidence.target);
  return fill(loc(KEYS.targetTerms), { target: evidence.target, terms: terms.join(', ') });
}

/** A pre-roll's recorded label, else its source's generic name. */
export function preRollLabel(entry, loc) {
  if (entry.label) return entry.label;
  if (entry.source === 'tool') return loc(KEYS.toolLabel);
  if (entry.source === 'situational') return loc(KEYS.situationalLabel);
  return loc(KEYS.modifierLabel);
}

/** An expression without the one pair of brackets the resolver wraps a rolled modifier in. */
export function bareExpression(expression) {
  const inner = /^\((.*)\)$/.exec(expression)?.[1];
  if (inner === undefined) return expression;
  let depth = 0;
  for (const character of inner) {
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;
    if (depth < 0) return expression;
  }
  return depth === 0 ? inner : expression;
}

function preRolledText(evidence, loc) {
  return targetPreRolls(evidence)
    .map((entry) =>
      fill(loc(entry.negate ? KEYS.preRollLowering : KEYS.preRoll), {
        label: preRollLabel(entry, loc),
        formula: bareExpression(entry.expression),
        total: entry.total,
      })
    )
    .join('; ');
}

/** `Needed: DC 12, meet or beat` for a fixed roll-high target (frame 37). */
function neededRow(evidence, loc) {
  return {
    id: 'needed',
    label: loc(KEYS.needed),
    text: fill(loc(KEYS.neededDc), {
      target: evidence.target,
      comparison: loc(evidence.comparison === 'exceed' ? KEYS.beat : KEYS.meetOrBeat),
    }),
  };
}

/**
 * `[{ id: 'target' | 'needed' | 'preRolled' | 'margin', label, text }]` for an executed summed
 * check, empty for no evidence. A fixed range, Otherwise or progressive check has no target, so it
 * names neither a target nor a margin; a legacy record omits the rows its evidence lacks.
 */
export function checkEvidenceRows(display, localize = (key) => key) {
  if (!statesEvidence(display)) return [];
  const loc = (key) => localize(key) ?? key;
  const { evidence } = display;
  const under = display.evaluation.direction === 'under';
  const rows = [];
  if (evidence.target !== null) {
    rows.push(
      fixedOver(display)
        ? neededRow(evidence, loc)
        : { id: 'target', label: loc(KEYS.target), text: targetText(evidence, loc) }
    );
  }
  const preRolled = preRolledText(evidence, loc);
  if (preRolled) rows.push({ id: 'preRolled', label: loc(KEYS.preRolled), text: preRolled });
  if (evidence.target !== null && evidence.margin !== null) {
    const margin = formatSignedStep(evidence.margin);
    rows.push({
      id: 'margin',
      label: loc(KEYS.margin),
      text: under ? fill(loc(KEYS.marginUnder), { margin }) : margin,
    });
  }
  return rows;
}
