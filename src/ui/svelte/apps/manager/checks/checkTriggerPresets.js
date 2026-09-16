/**
 * ADD A COMMON TRIGGER — the conditions almost every system writes, taught by example: the
 * trigger appears fully authored and every control on it is then legible.
 *
 * A PRESET PRODUCES AN ORDINARY TRIGGER — no marker field, no preset id, nothing downstream
 * treating it differently — and that is a hard rule: the moment a preset produced something
 * special, the engine, the readiness pass and the summariser would each need to know about it.
 * THEY ADAPT TO WHAT THE CHECK CAN DO through its `kind`, and are withheld entirely when the
 * formula rolls no dice, a preset offered against one authoring a condition pointing at a group
 * that does not exist. `tests/check-trigger-presets.test.js` pins what each preset authors.
 */

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Breakage.';

/**
 * The two presets, as descriptions rather than built triggers, the die group and the check kind
 * not being known until a call site supplies them: `high` fires on the best face of the leading
 * die group and `low` on the worst.
 */
const PRESETS = Object.freeze([
  Object.freeze({
    id: 'high',
    icon: 'fas fa-arrow-up',
    key: `${NAMESPACE}PresetHigh`,
    fallback: 'Natural {max} on {die} → {effect}',
  }),
  Object.freeze({
    id: 'low',
    icon: 'fas fa-arrow-down',
    key: `${NAMESPACE}PresetLow`,
    fallback: 'Natural {min} on {die} → {effect}',
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

function effectKind(kind) {
  if (kind === 'routed') return 'routed';
  if (kind === 'progressive') return 'progressive';
  return 'simple';
}

/**
 * The presets offered for one check, or an empty list when none can be authored.
 *
 * @param {object} args
 * @param {string} args.kind `routed` | `progressive` | `simple`.
 * @param {Array<{groupId: number, label: string, sides: number}>} args.diceGroups Groups parsed
 *   from the roll formula, in evaluated-term order.
 * @returns {Array<{id: string, icon: string, key: string, fallback: string, data: object}>} Each
 *   a `{ key, fallback, data }` fragment in `checkTriggerSummary`'s shape, so one resolver in
 *   the component serves both.
 */
export function checkTriggerPresets({ kind = 'simple', diceGroups = [] } = {}) {
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
      max: String(group.sides),
      min: '1',
      effect: { key: effects[preset.id][0], fallback: effects[preset.id][1] },
    },
  }));
}

/**
 * Build the trigger one preset authors, in `CheckTriggers.addTrigger`'s shape field for field —
 * including `tierStep`, written here rather than left to the normalizer for the reason it is
 * written there — so a preset-authored trigger and a hand-authored one are the same object.
 *
 * @param {object} args
 * @param {string} args.presetId `high` | `low`.
 * @param {string} args.kind `routed` | `progressive` | `simple`.
 * @param {Array<{groupId: number, sides: number}>} args.diceGroups Parsed groups.
 * @param {boolean} [args.showBreakTools] Whether tool breakage is reachable on this check.
 * @param {() => string} args.newId The caller's id generator, so ids come from one source.
 * @returns {object|null} The trigger, or `null` when no preset can be built.
 */
export function buildPresetTrigger({
  presetId,
  kind = 'simple',
  diceGroups = [],
  showBreakTools = false,
  newId,
}) {
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
    value: presetId === 'high' ? group.sides : 1,
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
