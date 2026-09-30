/**
 * The Checks route's words for the activity on screen: its record noun, singular and plural, the
 * word its Roll button names it by, its authored mode's name, and why its failure-result policy
 * has no reach. Pure; the caller injects `text`, so every word stays localized.
 */

const RECORD_NOUNS = Object.freeze({
  crafting: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Crafting', 'recipe'],
  salvage: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Salvage', 'salvageable item'],
  gathering: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Gathering', 'gathering task'],
});

// Sentence-initial, and the three do not pluralize alike.
const RECORD_NOUNS_PLURAL = Object.freeze({
  crafting: ['FABRICATE.Admin.Manager.Checks.RecordNoun.CraftingPlural', 'Recipes'],
  salvage: ['FABRICATE.Admin.Manager.Checks.RecordNoun.SalvagePlural', 'Salvageable items'],
  gathering: ['FABRICATE.Admin.Manager.Checks.RecordNoun.GatheringPlural', 'Gathering tasks'],
});

// Lower-case, as the Roll button names the activity mid-sentence.
const ACTIVITY_WORDS = Object.freeze({
  crafting: ['FABRICATE.Admin.Manager.Checks.Simulator.ActivityCrafting', 'crafting'],
  salvage: ['FABRICATE.Admin.Manager.Checks.Simulator.ActivitySalvage', 'salvage'],
  gathering: ['FABRICATE.Admin.Manager.Checks.Simulator.ActivityGathering', 'gathering'],
});

/** The activity's record noun, crafting's for an unknown activity. */
export function recordNounFor(activity, text) {
  return text(...(RECORD_NOUNS[activity] || RECORD_NOUNS.crafting));
}

/** The same noun's plural. */
export function recordNounPluralFor(activity, text) {
  return text(...(RECORD_NOUNS_PLURAL[activity] || RECORD_NOUNS_PLURAL.crafting));
}

/** The activity as the Roll button names it; blank for an unknown activity. */
export function activityWordFor(activity, text) {
  const entry = ACTIVITY_WORDS[activity];
  return entry ? text(...entry) : '';
}

/**
 * WHERE THE FAILURE POLICY HAS NO REACH, and why: neither `routedByIngredients` nor `progressive`
 * has an outcome tier or reserved failure group to mark, so a stated reason renders rather than
 * a control that silently does nothing. Blank where the policy applies.
 */
export function failurePolicyInertNote(
  { activity, gatheringD100, resolutionMode, craftingProgressive, salvageProgressive },
  text
) {
  if (activity === 'gathering') {
    return gatheringD100
      ? text(
          'FABRICATE.Admin.Manager.Checks.FailureResults.InertGatheringD100',
          'The d100 gathering roll has no failure outcome to produce — and routed and progressive gathering are not available yet. This setting is kept and takes effect when they are.'
        )
      : '';
  }
  if (activity === 'crafting' && resolutionMode === 'routedByIngredients') {
    return text(
      'FABRICATE.Admin.Manager.Checks.FailureResults.InertRoutedByIngredients',
      'In routed-by-ingredients mode the check has no outcome tiers to mark as failures, so nothing here can be produced on a failed check. This setting is kept, and applies again if you switch to a mode that has them.'
    );
  }
  const progressive =
    (activity === 'crafting' && craftingProgressive) ||
    (activity === 'salvage' && salvageProgressive);
  return progressive
    ? text(
        'FABRICATE.Admin.Manager.Checks.FailureResults.InertProgressive',
        'A progressive check spends its rolled value down one ordered list of results, so it has no failure outcome to produce. This setting is kept, and applies again if you switch to a mode that has one.'
      )
    : '';
}

// The AUTHORED mode, for the "does not apply in {mode} mode" copy and the Validation rail's
// rows — deliberately NOT the readiness mode, which collapses every no-check mode to `none`
// and would name a mode no economy editor offers. IT IS LOCALIZED through the SAME strings
// the rest of the manager uses: the authored token is an internal identifier and the three
// subsystems spell one concept three ways.
const SUBSYSTEM_MODE_LABELS = Object.freeze({
  crafting: {
    simple: ['FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'],
    routedByIngredients: [
      'FABRICATE.Admin.Manager.ResolutionRoutedByIngredients',
      'Routed by ingredients',
    ],
    routedByCheck: ['FABRICATE.Admin.Manager.ResolutionRoutedByCheck', 'Routed by check'],
    progressive: ['FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'],
    alchemy: ['FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy'],
  },
  // Alchemy's row names the ALCHEMY CHECK MODE, the choice deciding what alchemy rolls.
  alchemy: {
    none: ['FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNone', 'No check'],
    simple: ['FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimple', 'Simple check'],
    tiered: ['FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTiered', 'Tiered check'],
  },
  salvage: {
    simple: ['FABRICATE.Admin.SystemSettings.SalvageResolutionSimple', 'Simple'],
    progressive: ['FABRICATE.Admin.SystemSettings.SalvageResolutionProgressive', 'Progressive'],
    routed: ['FABRICATE.Admin.SystemSettings.SalvageResolutionRouted', 'Routed by check'],
  },
  gathering: {
    d100: ['FABRICATE.Admin.Manager.Economy.Resolution.D100', 'd100 roll'],
    progressive: ['FABRICATE.Admin.Manager.Economy.Resolution.Progressive', 'Progressive'],
    routed: ['FABRICATE.Admin.Manager.Economy.Resolution.Routed', 'Routed by check'],
  },
});

/** The GM-facing name of an authored mode; an unmapped token falls back to itself, so a
 *  mode added to a picker without a row here reads as unfinished, not as another. */
export function subsystemModeLabel(vocabulary, mode, text) {
  const entry = SUBSYSTEM_MODE_LABELS[vocabulary]?.[mode];
  return entry ? text(entry[0], entry[1]) : String(mode || '');
}
