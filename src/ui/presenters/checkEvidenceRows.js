/**
 * The Target, Pre-rolled and Margin rows a result box and a result chat card state for an executed
 * summed check (issue 2005), read from its display projection only. A sum/over/fixed check has no
 * rows, so its surfaces are unchanged; `localize` is key-only, as every card module's is.
 */
import { fill } from '../svelte/apps/crafting/rollPromptTarget.js';
import { formatCheckAdjustment } from '../svelte/apps/manager/checks/checkAdjustmentLabel.js';

const KEYS = Object.freeze({
  target: 'FABRICATE.Check.Evidence.Target',
  preRolled: 'FABRICATE.Check.Evidence.PreRolled',
  margin: 'FABRICATE.Check.Evidence.Margin',
  targetTerms: 'FABRICATE.Check.Evidence.TargetTerms',
  characterValue: 'FABRICATE.Check.Evidence.CharacterValue',
  fixed: 'FABRICATE.Check.Evidence.Fixed',
  difficulty: 'FABRICATE.Check.Evidence.Difficulty',
  tools: 'FABRICATE.Check.Evidence.Tools',
  modifiers: 'FABRICATE.Check.Evidence.Modifiers',
  situational: 'FABRICATE.Check.Evidence.Situational',
  preRoll: 'FABRICATE.Check.Evidence.PreRoll',
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

/** `+5`, `+0` or `−2`, with the true minus sign. */
const signed = (value) => (value === 0 ? '+0' : formatCheckAdjustment('add', value));

/** Whether a projection's surfaces gain evidence rows: a summed check other than sum/over/fixed. */
function statesEvidence(display) {
  const evidence = display?.evidence;
  if (!evidence || display.evaluation?.product !== 'sum') return false;
  return display.evaluation.direction === 'under' || Array.isArray(evidence.targetTerms);
}

/** The pre-rolls that raised the target, in the order they settled. */
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
  for (const entry of targetPreRolls(evidence)) add(entry.source, entry.total);
  return totals;
}

/** The terms after the target number: its anchor, the difficulty step and each benefit group. */
function targetParts(evidence, loc) {
  const [anchor, ...steps] = evidence.targetTerms;
  const parts = [];
  if (anchor?.kind === 'anchor') {
    parts.push(
      evidence.targetSource === 'attribute'
        ? fill(loc(KEYS.characterValue), { value: anchor.value })
        : loc(KEYS.fixed)
    );
  }
  for (const term of steps) {
    if (term.kind !== 'adjustment' && term.kind !== 'multiplier') continue;
    const kind = term.kind === 'multiplier' ? 'multiply' : 'add';
    parts.push(fill(loc(KEYS.difficulty), { value: formatCheckAdjustment(kind, term.value) }));
  }
  const totals = benefitTotals(evidence);
  for (const [group] of BENEFIT_GROUPS) {
    if (totals.get(group)) parts.push(fill(loc(KEYS[group]), { value: signed(totals.get(group)) }));
  }
  return parts;
}

function targetText(evidence, loc) {
  if (!Array.isArray(evidence.targetTerms) || evidence.targetTerms.length === 0) {
    return String(evidence.target);
  }
  return fill(loc(KEYS.targetTerms), {
    target: evidence.target,
    terms: targetParts(evidence, loc).join(', '),
  });
}

function preRollLabel(entry, loc) {
  if (entry.label) return entry.label;
  if (entry.source === 'tool') return loc(KEYS.toolLabel);
  if (entry.source === 'situational') return loc(KEYS.situationalLabel);
  return loc(KEYS.modifierLabel);
}

function preRolledText(evidence, loc) {
  return targetPreRolls(evidence)
    .map((entry) =>
      fill(loc(KEYS.preRoll), {
        label: preRollLabel(entry, loc),
        formula: entry.expression,
        total: entry.total,
      })
    )
    .join('; ');
}

/**
 * `[{ id: 'target' | 'preRolled' | 'margin', label, text }]` for an executed summed check, empty
 * for sum/over/fixed and for no evidence. A fixed range or Otherwise has no target, so it names
 * neither a target nor a margin; a legacy record omits the rows its evidence lacks.
 */
export function checkEvidenceRows(display, localize = (key) => key) {
  if (!statesEvidence(display)) return [];
  const loc = (key) => localize(key) ?? key;
  const { evidence } = display;
  const under = display.evaluation.direction === 'under';
  const rows = [];
  if (evidence.target !== null) {
    rows.push({ id: 'target', label: loc(KEYS.target), text: targetText(evidence, loc) });
  }
  const preRolled = preRolledText(evidence, loc);
  if (preRolled) rows.push({ id: 'preRolled', label: loc(KEYS.preRolled), text: preRolled });
  if (evidence.target !== null && evidence.margin !== null) {
    const margin = signed(evidence.margin);
    rows.push({
      id: 'margin',
      label: loc(KEYS.margin),
      text: under ? fill(loc(KEYS.marginUnder), { margin }) : margin,
    });
  }
  return rows;
}
