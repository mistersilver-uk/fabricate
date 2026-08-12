/**
 * ADD A COMMON TRIGGER — the conditions almost every system writes (issue 1096).
 *
 * Authoring a trigger by hand requires knowing the dice-group and condition vocabulary before
 * you can write one: which group, which aggregate, which operator, and then which of three
 * independent effects. The prototype puts a row of one-click presets above the list, and the
 * presets teach that vocabulary by example — a GM clicks `Natural 20 → step up a tier`, the
 * trigger appears fully authored, and every control on it is then legible because the sentence
 * it produced is on the card.
 *
 * ## A preset produces an ORDINARY trigger
 *
 * There is no marker field, no preset id on the trigger, and nothing downstream that treats a
 * preset-authored trigger differently from a hand-authored one. That is a hard rule rather
 * than a simplification: the moment a preset produced something special, the engine, the
 * readiness pass and the summariser would each need to know about it, and "add this for me"
 * would have become a second kind of trigger. `buildPresetTrigger` therefore returns exactly
 * the shape `CheckTriggers.addTrigger` returns, with the fields it would have made the GM set.
 *
 * ## They adapt to what the check CAN do
 *
 * A tier step is meaningless on a check with no tiers, and an automatic success is meaningless
 * on a progressive check that awards rather than passes. So the effect a preset authors is
 * chosen from the check's own `kind`, and the presets are withheld entirely when the formula
 * rolls no dice — a `Natural 20 on 1d20` preset offered against a formula containing no die
 * would author a condition pointing at a group that does not exist.
 *
 * Pure: no Svelte, no Foundry. `tests/check-trigger-presets.test.js` pins the exact trigger
 * each preset authors.
 */

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Breakage.';

/**
 * The two presets, as descriptions rather than as built triggers: the die group and the check
 * kind are not known until a call site supplies them.
 *
 * `high` fires on the best face of the leading die group and `low` on the worst, which is the
 * pair every system in the design frames writes first.
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
 * @param {Array<{groupId: number, label: string, sides: number}>} args.diceGroups Groups
 *   parsed from the roll formula, in evaluated-term order.
 * @returns {Array<{id: string, icon: string, key: string, fallback: string, data: object}>}
 *   Each entry is a `{ key, fallback, data }` fragment in the same shape
 *   `checkTriggerSummary` returns, so one resolver in the component serves both.
 */
export function checkTriggerPresets({ kind = 'simple', diceGroups = [] } = {}) {
  const groups = Array.isArray(diceGroups) ? diceGroups : [];
  // The LEADING d20 if the formula has one, else the first group at all. A system rolling
  // `2d6 + 1d20` means the d20 by "natural 20", and index order alone would pick the 2d6.
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
 * Build the trigger one preset authors.
 *
 * The shape is `CheckTriggers.addTrigger`'s, field for field, so a preset-authored trigger and
 * a hand-authored one are the same object — including `tierStep`, which is written here rather
 * than left to the normalizer for the same reason it is written there.
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

  // `anyDie`, not `total`: "a natural 20" is a FACE, and on a `2d20` group the total can
  // never be 20 while either die showing 20 is exactly the state a GM means.
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
    // Matching `addTrigger`: a preset must not turn tool breakage on where a hand-added
    // trigger would not, and must not leave it off where one would.
    breakTools: showBreakTools === true,
    tierStep: routed
      ? { mode: presetId === 'high' ? 'up' : 'down', steps: 1, tierId: null }
      : { mode: 'none', steps: 1, tierId: null },
  };
}
