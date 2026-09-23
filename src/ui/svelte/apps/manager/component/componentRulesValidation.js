/**
 * The Component Rules editor's Validation tab: ONE SYSTEM'S RULES — the essence contribution, the
 * salvage results, the outcome routing and the progressive DC. Deliberately not
 * `componentScopeValidation.js`, which validates a WORLD entry and holds none of those facts;
 * widening it to take both would make it the union of two screens.
 *
 * EVERY INPUT IS SUPPLIED, AND EVERY ONE IS THE DRAFT — this module reaches nothing — because a
 * validation surface reading the PERSISTED record would tell a GM their unsaved fix had not landed.
 * The one exception is `resultRulesById`, a fact about OTHER records the draft cannot carry. The
 * evaluator is string-free and the presentation function localizes, so a unit test needs no
 * localization seam.
 */

/** The checks, in the order the surface renders them. */
export const COMPONENT_RULES_VALIDATION_CHECKS = [
  'category',
  'essences',
  'salvageResults',
  'salvageResultRules',
  'salvageRouting',
  'progressiveDc',
];

/**
 * Which group each check belongs to. TWO, because these checks fall cleanly in two: what this
 * system CLASSIFIES the component as, and what it does when the component is broken down.
 */
const CHECK_GROUP = {
  category: 'classification',
  essences: 'classification',
  salvageResults: 'salvage',
  salvageResultRules: 'salvage',
  salvageRouting: 'salvage',
  progressiveDc: 'salvage',
};

/**
 * Each check's severity. `salvageResults` and `salvageRouting` BLOCK, both describing salvage that
 * is switched on and cannot resolve; everything else warns, because a missing essence contribution
 * or an inherited-but-unset category is a gap a GM may have meant.
 */
const SEVERITY = {
  category: 'warning',
  essences: 'warning',
  salvageResults: 'blocking',
  salvageResultRules: 'warning',
  salvageRouting: 'blocking',
  progressiveDc: 'warning',
};

/** The two groups, in render order. */
export const COMPONENT_RULES_VALIDATION_GROUPS = [
  {
    id: 'classification',
    labelKey: 'FABRICATE.Admin.Manager.Component.Validation.GroupClassification',
    fallback: 'Classification',
    icon: 'fas fa-folder-open',
  },
  {
    id: 'salvage',
    labelKey: 'FABRICATE.Admin.Manager.Component.Validation.GroupSalvage',
    fallback: 'Salvage',
    icon: 'fas fa-recycle',
  },
];

/**
 * Whether a check applies at all here. One that cannot be answered is DROPPED rather than answered
 * `pass`: a green `Outcome routing` row on a simple-salvage system claims a check that never ran.
 */
function checkApplies(id, gates) {
  if (id === 'essences') return gates.essencesOffered;
  if (id === 'salvageResults' || id === 'salvageResultRules') return gates.salvageActive;
  if (id === 'salvageRouting') return gates.salvageActive && gates.routed;
  if (id === 'progressiveDc') return gates.salvageActive && gates.progressive;
  return true;
}

/**
 * Evaluate one system's component rules. `context` carries the draft's category, essence total and
 * salvage results, the SYSTEM's own `salvageFeatureEnabled` / `routed` / `progressive` switches,
 * and the two cross-record lists — `resultsWithoutRules` and `unroutedOutcomes`.
 */
export function componentRulesValidation(context = {}) {
  const resultsWithoutRules = Array.isArray(context.resultsWithoutRules)
    ? context.resultsWithoutRules
    : [];
  const unroutedOutcomes = Array.isArray(context.unroutedOutcomes) ? context.unroutedOutcomes : [];
  const dc = Number(context.progressiveDc);

  const gates = {
    salvageActive: context.salvageFeatureEnabled === true && context.salvageEnabled === true,
    routed: context.routed === true,
    progressive: context.progressive === true,
    essencesOffered: context.essencesOffered === true,
  };

  const valid = {
    category: String(context.category ?? '').trim() !== '',
    essences: (Number(context.essenceTotal) || 0) > 0,
    salvageResults: (Number(context.resultCount) || 0) > 0,
    salvageResultRules: resultsWithoutRules.length === 0,
    salvageRouting: unroutedOutcomes.length === 0,
    progressiveDc: Number.isFinite(dc) && dc >= 1,
  };

  const counted = {
    salvageResultRules: resultsWithoutRules.length,
    salvageRouting: unroutedOutcomes.length,
  };

  const checks = COMPONENT_RULES_VALIDATION_CHECKS.filter((id) => checkApplies(id, gates)).map(
    (id) => ({
      id,
      severity: SEVERITY[id],
      valid: valid[id],
      count: counted[id] ?? 0,
    })
  );

  return {
    checks,
    counts: {
      passing: checks.filter((check) => check.valid).length,
      warnings: checks.filter((check) => !check.valid && check.severity === 'warning').length,
      blocking: checks.filter((check) => !check.valid && check.severity === 'blocking').length,
    },
  };
}

/** One check's row status; an early-return chain, because SonarCloud reports a nested ternary. */
function checkStatus(check) {
  if (check.valid) return 'pass';
  return check.severity === 'blocking' ? 'block' : 'warn';
}

/** Each check's title, in its passing and its failing branch. */
const TITLES = {
  category: [
    ['FABRICATE.Admin.Manager.Component.Validation.CategoryPass', 'A category resolves here'],
    ['FABRICATE.Admin.Manager.Component.Validation.CategoryFail', 'No category resolves here'],
  ],
  essences: [
    [
      'FABRICATE.Admin.Manager.Component.Validation.EssencesPass',
      'It contributes essences in this system',
    ],
    [
      'FABRICATE.Admin.Manager.Component.Validation.EssencesFail',
      'It contributes no essences in this system',
    ],
  ],
  salvageResults: [
    ['FABRICATE.Admin.Manager.Component.Validation.ResultsPass', 'Salvage awards results'],
    [
      'FABRICATE.Admin.Manager.Component.Validation.ResultsFail',
      'Salvage is on but awards nothing',
    ],
  ],
  salvageResultRules: [
    [
      'FABRICATE.Admin.Manager.Component.Validation.ResultRulesPass',
      'Every result has rules in this system',
    ],
    [
      'FABRICATE.Admin.Manager.Component.Validation.ResultRulesFail',
      '{count} result has no rules in this system',
    ],
  ],
  salvageRouting: [
    ['FABRICATE.Admin.Manager.Component.Validation.RoutingPass', 'Every outcome routes somewhere'],
    ['FABRICATE.Admin.Manager.Component.Validation.RoutingFail', '{count} outcome awards nothing'],
  ],
  progressiveDc: [
    ['FABRICATE.Admin.Manager.Component.Validation.DcPass', 'It carries a progressive DC'],
    ['FABRICATE.Admin.Manager.Component.Validation.DcFail', 'It carries no progressive DC'],
  ],
};

/** Each check's failing-branch detail sentence. A passing row carries none. */
const DETAILS = {
  category: [
    'FABRICATE.Admin.Manager.Component.Validation.CategoryDetail',
    'Inherit the world value, or pick one of this system’s own.',
  ],
  essences: [
    'FABRICATE.Admin.Manager.Component.Validation.EssencesDetail',
    'A component with no essences cannot satisfy an essence requirement here.',
  ],
  salvageResults: [
    'FABRICATE.Admin.Manager.Component.Validation.ResultsDetail',
    'Add a result, or switch salvage off for this component.',
  ],
  salvageResultRules: [
    'FABRICATE.Admin.Manager.Component.Validation.ResultRulesDetail',
    'A result this system has no rules for cannot be awarded: {names}.',
  ],
  salvageRouting: [
    'FABRICATE.Admin.Manager.Component.Validation.RoutingDetail',
    'An unrouted outcome awards nothing on the tier a player rolled: {names}.',
  ],
  progressiveDc: [
    'FABRICATE.Admin.Manager.Component.Validation.DcDetail',
    'Progressive salvage claims each result while the check total still covers its DC.',
  ],
};

/**
 * The grouped rows in the shape `EditorValidationSurface` takes. The check SET, its order and every
 * severity come from the evaluator; this only maps them onto copy, and it FILTERS BEFORE IT MAPS so
 * an absent check is dropped rather than dereferenced half-built inside a render. `phrase` defaults
 * to token replacement over the fallback, so a unit test needs no localization seam.
 */
export function componentRulesValidationPresentation(
  context = {},
  phrase = (_key, fallback, data) =>
    Object.entries(data ?? {}).reduce(
      (copy, [token, value]) => copy.replaceAll(`{${token}}`, String(value)),
      fallback
    )
) {
  const { checks, counts } = componentRulesValidation(context);
  const byId = new Map(checks.map((check) => [check.id, check]));
  const names = {
    salvageResultRules: (context.resultsWithoutRules ?? []).join(', '),
    salvageRouting: (context.unroutedOutcomes ?? []).join(', '),
  };

  const rows = (groupId) =>
    COMPONENT_RULES_VALIDATION_CHECKS.filter(
      (id) => CHECK_GROUP[id] === groupId && byId.has(id)
    ).map((id) => {
      const check = byId.get(id);
      const [pass, fail] = TITLES[id];
      const [titleKey, titleFallback] = check.valid ? pass : fail;
      const [detailKey, detailFallback] = DETAILS[id];
      return {
        id,
        status: checkStatus(check),
        title: phrase(titleKey, titleFallback, { count: check.count }),
        detail: check.valid
          ? ''
          : phrase(detailKey, detailFallback, { names: names[id] ?? '', count: check.count }),
      };
    });

  return {
    checks,
    counts,
    groups: COMPONENT_RULES_VALIDATION_GROUPS.map((group) => ({
      id: group.id,
      label: phrase(group.labelKey, group.fallback, {}),
      icon: group.icon,
      rows: rows(group.id),
    })).filter((group) => group.rows.length > 0),
  };
}
