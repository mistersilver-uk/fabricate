/**
 * ADD A COMMON TRIGGER — the conditions almost every system writes, taught by example: the
 * trigger appears fully authored and every control on it is then legible.
 *
 * A PRESET PRODUCES AN ORDINARY TRIGGER — no marker field, no preset id, nothing downstream
 * treating it differently — and that is a hard rule: the moment a preset produced something
 * special, the engine, the readiness pass and the summariser would each need to know about it.
 * THEY ADAPT TO WHAT THE CHECK CAN DO through its `kind` and its evaluation's polarity, and are
 * withheld entirely when the formula rolls no dice, a preset offered against one authoring a
 * condition pointing at a group that does not exist. A counting check is offered its own presets
 * on its pool. `tests/check-trigger-presets.test.js` pins what each preset authors. */

import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Breakage.';

/**
 * The two presets, as descriptions rather than built triggers, the die group and the check kind
 * not being known until a call site supplies them: `high` fires on the best face of the leading
 * die group and `low` on the worst, whichever face {@link presetPolarity} calls best. */
const PRESETS = Object.freeze([
  Object.freeze({
    id: 'high',
    icon: 'fas fa-arrow-up',
    key: `${NAMESPACE}PresetHigh`,
    fallback: 'Natural {face} on {die} → {effect}',
  }),
  Object.freeze({
    id: 'low',
    icon: 'fas fa-arrow-down',
    key: `${NAMESPACE}PresetLow`,
    fallback: 'Natural {face} on {die} → {effect}',
  }),
]);

/** What a preset DOES, per check kind. Routed steps a tier; everything else forces a verdict. */
const EFFECT_COPY = Object.freeze({
  routed: {
    high: [`${NAMESPACE}PresetEffectStepUp`, 'step up a tier'],
    low: [`${NAMESPACE}PresetEffectStepDown`, 'step down a tier'],
  },
  progressive: {
    high: [`${NAMESPACE}PresetEffectAwardAll`, 'award every result'],
    low: [`${NAMESPACE}PresetEffectAwardNone`, 'award nothing'],
  },
  simple: {
    high: [`${NAMESPACE}PresetEffectSuccess`, 'automatic success'],
    low: [`${NAMESPACE}PresetEffectFailure`, 'automatic failure'],
  },
});

/**
 * Which end of a die is its best face under `evaluation`: `'low'` when the check rolls under,
 * whether it sums or counts, else `'high'`. Count direction qualifies dice and never reverses
 * the net ranking, so the outcome each preset forces is unchanged.
 */
export function presetPolarity(evaluation) {
  return evaluation?.direction === 'under' ? 'low' : 'high';
}

/** The face the `high` (best) or `low` (worst) preset names on a die of `sides`. */
function presetFace(presetId, sides, evaluation) {
  const best = presetPolarity(evaluation) === 'low' ? 1 : sides;
  const worst = best === 1 ? sides : 1;
  return presetId === 'high' ? best : worst;
}

function effectKind(kind) {
  if (kind === 'routed') return 'routed';
  if (kind === 'progressive') return 'progressive';
  return 'simple';
}

/**
 * The presets offered for one check, or an empty list when none can be authored.
 * @param {object} args
 * @param {string} args.kind `routed` | `progressive` | `simple`.
 * @param {Array<{groupId: number, label: string, sides: number}>} args.diceGroups Groups parsed
 *   from the roll formula, in evaluated-term order.
 * @param {object|null} [args.evaluation] The check's evaluation, which sets the best face; a
 *   counting one is offered the count presets on its pool instead.
 * @param {string|null} [args.lowestTierId] A routed check's lowest-ranked tier, which Botch targets.
 * @returns {Array<{id: string, icon: string, key: string, fallback: string, data: object}>} Each
 *   a `{ key, fallback, data }` fragment in `checkTriggerSummary`'s shape.
 */
export function checkTriggerPresets({
  kind = 'simple',
  diceGroups = [],
  evaluation = null,
  lowestTierId = null,
} = {}) {
  if (evaluation?.product === 'count') return countPresets({ kind, evaluation, lowestTierId });
  const groups = Array.isArray(diceGroups) ? diceGroups : [];
  // The LEADING d20 if the formula has one, else the first group: a system rolling `2d6 + 1d20`
  // means the d20 by "natural 20", where index order alone picks the 2d6.
  const group = groups.find((entry) => entry.sides === 20) ?? groups[0];
  if (!group || !Number.isFinite(group.sides) || group.sides < 2) return [];
  const effects = EFFECT_COPY[effectKind(kind)];
  return PRESETS.map((preset) => ({
    id: preset.id,
    icon: preset.icon,
    key: preset.key,
    fallback: preset.fallback,
    data: {
      die: group.label,
      face: String(presetFace(preset.id, group.sides, evaluation)),
      effect: { key: effects[preset.id][0], fallback: effects[preset.id][1] },
    },
  }));
}

/**
 * Build the trigger one preset authors, in `CheckTriggers.addTrigger`'s shape field for field —
 * including `tierStep`, written here rather than left to the normalizer — so a preset-authored
 * trigger and a hand-authored one are the same object.
 * @param {object} args
 * @param {string} args.presetId `high` | `low`.
 * @param {string} args.kind `routed` | `progressive` | `simple`.
 * @param {Array<{groupId: number, sides: number}>} args.diceGroups Parsed groups.
 * @param {boolean} [args.showBreakTools] Whether tool breakage is reachable on this check.
 * @param {() => string} args.newId The caller's id generator, so ids come from one source.
 * @param {object|null} [args.evaluation] The check's evaluation, which sets the best face.
 * @param {string|null} [args.lowestTierId] A routed check's lowest-ranked tier, which Botch targets.
 * @returns {object|null} The trigger, or `null` when no preset can be built.
 */
export function buildPresetTrigger({
  presetId,
  kind = 'simple',
  diceGroups = [],
  showBreakTools = false,
  newId,
  evaluation = null,
  lowestTierId = null,
}) {
  if (evaluation?.product === 'count') {
    return buildCountPresetTrigger({
      presetId,
      kind,
      evaluation,
      lowestTierId,
      showBreakTools,
      newId,
    });
  }
  const groups = Array.isArray(diceGroups) ? diceGroups : [];
  const group = groups.find((entry) => entry.sides === 20) ?? groups[0];
  if (!group || (presetId !== 'high' && presetId !== 'low')) return null;

  // `anyDie`, not `total`: "a natural 20" is a FACE, and on a `2d20` group the total can never
  // be 20 while either die showing 20 is exactly the state a GM means.
  const condition = {
    type: 'diceGroup',
    groupId: group.groupId,
    aggregate: 'anyDie',
    operator: '==',
    value: presetFace(presetId, group.sides, evaluation),
  };

  const routed = effectKind(kind) === 'routed';
  return {
    id: newId(),
    condition,
    outcome: routed ? 'none' : presetId === 'high' ? 'success' : 'failure',
    // Matching `addTrigger` in both directions.
    breakTools: showBreakTools === true,
    tierStep: routed
      ? { mode: presetId === 'high' ? 'up' : 'down', steps: 1, tierId: null }
      : { mode: 'none', steps: 1, tierId: null },
  };
}

/**
 * The one die group a counting check's triggers read (issue 2006): its pool, as group 0, never the
 * retained formula's groups. `null` for a summing check.
 */
export function countPoolDiceGroup(evaluation) {
  if (evaluation?.product !== 'count') return null;
  const { die } = normalizeCheckEvaluation(evaluation).pool;
  return { groupId: 0, raw: `d${die}`, count: null, sides: die, label: `d${die}` };
}

/**
 * The dice groups a trigger reads, in evaluated-term order with `groupId` the engine's `roll.dice`
 * index: a counting check's one pool group, else the formula's, a repeated group numbered.
 */
export function triggerDiceGroups({ evaluation, rollFormula }, text) {
  const pool = countPoolDiceGroup(evaluation);
  if (pool) return [pool];
  const parsed = parseDiceGroups(rollFormula);
  const seen = new Map();
  const totals = new Map();
  for (const group of parsed) totals.set(group.raw, (totals.get(group.raw) || 0) + 1);
  return parsed.map((group, groupId) => {
    const occurrence = (seen.get(group.raw) || 0) + 1;
    seen.set(group.raw, occurrence);
    const label =
      totals.get(group.raw) > 1
        ? text('FABRICATE.Admin.Manager.Checks.Breakage.GroupOrdinal', '{die} #{n}')
            .replace('{die}', group.raw)
            .replace('{n}', String(occurrence))
        : group.raw;
    return { groupId, raw: group.raw, count: group.count, sides: group.sides, label };
  });
}

const COUNT_PRESETS = Object.freeze({
  high: [
    'FABRICATE.Admin.Manager.Checks.Count.Triggers.PresetBest',
    'Any die shows its best face ({face}) → {effect}',
  ],
  low: [
    'FABRICATE.Admin.Manager.Checks.Count.Triggers.PresetWorst',
    'Every die shows its worst face ({face}) → {effect}',
  ],
  botch: [
    'FABRICATE.Admin.Manager.Checks.Count.Triggers.PresetBotch',
    'Botch (net below zero) → {effect}',
  ],
});

const COUNT_EFFECTS = Object.freeze({
  routed: {
    ...EFFECT_COPY.routed,
    botch: ['FABRICATE.Admin.Manager.Checks.Count.Triggers.EffectLowestTier', 'lowest tier'],
  },
  progressive: { low: EFFECT_COPY.progressive.low, botch: EFFECT_COPY.progressive.low },
  simple: { low: EFFECT_COPY.simple.low, botch: EFFECT_COPY.simple.low },
});

const COUNT_ICONS = Object.freeze({ high: 'fas fa-arrow-up', low: 'fas fa-arrow-down' });

/**
 * The count presets a check is offered, in order: routed steps on the best and worst faces, the
 * others fail on the worst. Botch needs cancelling, since only a cancel takes the net below zero,
 * and a routed Botch needs a tier to target.
 */
function countPresetIds(kind, pool, lowestTierId) {
  const routed = effectKind(kind) === 'routed';
  const ids = routed ? ['high', 'low'] : ['low'];
  if (pool.cancel.enabled && (!routed || lowestTierId)) ids.push('botch');
  return ids;
}

function countPresets({ kind, evaluation, lowestTierId }) {
  const { pool } = normalizeCheckEvaluation(evaluation);
  const effects = COUNT_EFFECTS[effectKind(kind)];
  const routed = effectKind(kind) === 'routed';
  return countPresetIds(kind, pool, lowestTierId).map((id) => {
    const [key, fallback] = COUNT_PRESETS[id];
    const effect = { key: effects[id][0], fallback: effects[id][1] };
    return {
      id,
      icon: routed && id !== 'botch' ? COUNT_ICONS[id] : 'fas fa-skull',
      key,
      fallback,
      data:
        id === 'botch'
          ? { effect }
          : { face: String(presetFace(id, pool.die, evaluation)), effect },
    };
  });
}

// Botch is `net < 0`, never `<= 0`: a net of zero is no botch.
function countPresetCondition(presetId, die, evaluation) {
  if (presetId === 'botch') return { type: 'rollTotal', operator: '<', value: 0 };
  return {
    type: 'diceGroup',
    groupId: 0,
    aggregate: presetId === 'high' ? 'anyDie' : 'allDice',
    operator: '==',
    value: presetFace(presetId, die, evaluation),
  };
}

const COUNT_TIER_STEP_MODES = Object.freeze({ high: 'up', low: 'down', botch: 'target' });

function buildCountPresetTrigger({
  presetId,
  kind,
  evaluation,
  lowestTierId,
  showBreakTools,
  newId,
}) {
  const { pool } = normalizeCheckEvaluation(evaluation);
  if (!countPresetIds(kind, pool, lowestTierId).includes(presetId)) return null;
  const routed = effectKind(kind) === 'routed';
  return {
    id: newId(),
    condition: countPresetCondition(presetId, pool.die, evaluation),
    outcome: routed ? 'none' : 'failure',
    breakTools: showBreakTools === true,
    tierStep: routed
      ? {
          mode: COUNT_TIER_STEP_MODES[presetId],
          steps: 1,
          tierId: presetId === 'botch' ? lowestTierId : null,
        }
      : { mode: 'none', steps: 1, tierId: null },
  };
}
