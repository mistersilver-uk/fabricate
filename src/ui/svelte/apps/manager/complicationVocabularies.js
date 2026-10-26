/**
 * The system-scoped names a complication's trigger sentence reads: a macro by its uuid and a check
 * trigger by its id. Both studios' stage lists build them here, so each names the same macro and
 * trigger (`ui-entity-editors` Component Studio requirement 16).
 */

/** Macro uuid to name, the uuid standing in for a nameless macro; an option with no uuid is dropped. */
export function complicationMacroNames(macroOptions) {
  return new Map(
    (macroOptions || [])
      .filter((macro) => macro?.uuid)
      .map((macro) => [macro.uuid, macro.name || macro.uuid])
  );
}

/** Trigger id to label, the id standing in for an unlabelled trigger; an option with no id is dropped. */
export function complicationTriggerLabels(triggerOptions) {
  return new Map(
    (triggerOptions || [])
      .filter((option) => option?.id)
      .map((option) => [option.id, option.label || option.id])
  );
}
