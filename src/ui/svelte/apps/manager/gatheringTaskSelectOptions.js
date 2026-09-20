/**
 * The gathering task editor's seven converted select vocabularies, in `<Select>`'s `{value, label}`
 * option shape (issue 1510): every label carried verbatim from the `<option>` it replaced, every
 * list in its authored order, and copy injected as `text(key, fallback)` so this leaf imports
 * nothing.
 */

/** The unit keys the respawn interval offers, and the order the row reads them in. */
const RESPAWN_INTERVAL_UNITS = Object.freeze(['minutes', 'hours', 'days', 'weeks']);

/** The sign a stamina modifier row applies, minus first as authored; neither glyph is copy. */
export const STAMINA_MODIFIER_OPERATORS = Object.freeze([
  Object.freeze({ value: '-', label: '−' }),
  Object.freeze({ value: '+', label: '+' }),
]);

/** The canvas-drop default, with the sentinel row that stands for "ask on drop" first. */
export function defaultEnvironmentOptions(environments, text) {
  return [
    {
      value: '',
      label: text(
        'FABRICATE.Admin.Manager.Environment.Tasks.DefaultEnvironmentNone',
        'None (ask on drop)'
      ),
    },
    ...environments.map((environment) => ({ value: environment.id, label: environment.name })),
  ];
}

/** When an attempt takes a node out of the pool. */
export function depletionTimingOptions(text) {
  return [
    {
      value: 'onStart',
      label: text('FABRICATE.Admin.Manager.Economy.DepleteOnStart', 'On start'),
    },
    {
      value: 'onSuccess',
      label: text('FABRICATE.Admin.Manager.Economy.DepleteOnSuccess', 'On success'),
    },
  ];
}

/** How a depleted pool comes back. */
export function respawnPolicyOptions(text) {
  return [
    { value: 'manual', label: text('FABRICATE.Admin.Manager.Economy.RespawnManual', 'Manual') },
    {
      value: 'overTime',
      label: text('FABRICATE.Admin.Manager.Economy.RespawnOverTime', 'Over world time'),
    },
    {
      value: 'nonRegenerating',
      label: text('FABRICATE.Admin.Manager.Economy.RespawnNone', 'Does not regenerate'),
    },
  ];
}

/**
 * The respawn interval's unit, from `Economy.Unit.*`'s singular half — the one the stamina
 * regeneration row already reads, so "Every 3 Minute" is carried; `Recipe.DurationUnitPlural`
 * declares no `weeks` and cannot be adopted.
 */
export function respawnIntervalUnitOptions(text) {
  return RESPAWN_INTERVAL_UNITS.map((unit) => ({
    value: unit,
    label: text(`FABRICATE.Admin.Manager.Economy.Unit.${unit}`, unit),
  }));
}

/** What one elapsed interval awards. */
export function respawnGainModeOptions(text) {
  return [
    {
      value: 'guaranteed',
      label: text('FABRICATE.Admin.Manager.Economy.GainGuaranteed', 'Add one node'),
    },
    {
      value: 'chance',
      label: text('FABRICATE.Admin.Manager.Economy.GainChance', 'Chance to add one'),
    },
    {
      value: 'expression',
      label: text('FABRICATE.Admin.Manager.Economy.GainExpression', 'Roll an amount'),
    },
  ];
}

/** The per-actor cost modifiers a row may point at, falling back to the id where one is unlabelled. */
export function staminaModifierOptions(library) {
  return library.map((entry) => ({ value: entry.id, label: entry.label || entry.id }));
}
