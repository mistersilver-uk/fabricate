/**
 * The Component Rules editor's Validation tab (issue 1371, maintainer parity round 4).
 *
 * The reference draws this editor with TWO tabs — `Component rules` and `Validation ⓵` — and the
 * shipped editor had no tab strip at all (gap-list row 127). D-9's "this lane does not rebuild
 * `ComponentEditView`'s tab model" was a scope statement rather than a licence, so the strip and
 * its second tab are built here.
 *
 * ── WHY THIS IS NOT `componentScopeValidation.js` ─────────────────────────────────────────
 * That module validates a WORLD entry: its source link, its name, its world defaults, and
 * whether a given system resolves a category from them. This one validates ONE SYSTEM'S RULES —
 * the essence contribution, the salvage results, the outcome routing and the progressive DC —
 * which are exactly the facts the world entry does not hold and cannot answer. Widening that
 * module to take both would make it the union of two screens, and its `systemKnown` / `member`
 * gating already shows how far a shared evaluator can honestly stretch.
 *
 * ── EVERY INPUT IS SUPPLIED, AND EVERY ONE IS THE DRAFT ───────────────────────────────────
 * This module reaches nothing. The editor holds a buffered draft, and a validation surface that
 * read the PERSISTED record would tell a GM their unsaved fix had not landed. The one input that
 * is not the draft is `resultRulesById` — whether the system has rules for each component a
 * salvage result names — because that is a fact about OTHER records the draft cannot carry.
 *
 * The evaluator is string-free and the presentation function localizes, following
 * `componentScopeValidation.js` exactly: a check set that carried its own copy could not be
 * asserted without a localization seam in every unit test.
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
 * Which group each check belongs to.
 *
 * TWO GROUPS, because the reference's validation body is kickered groups of icon rows and these
 * checks fall cleanly in two: what this system CLASSIFIES the component as, and what it does
 * when the component is broken down.
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
 * Each check's severity.
 *
 * `salvageResults` and `salvageRouting` BLOCK, because both describe salvage that is switched on
 * and cannot resolve: an enabled component with no results awards nothing, and an unrouted
 * outcome tier awards nothing on the tier a player actually rolled. Everything else warns — a
 * missing essence contribution or an inherited-but-unset category is a gap a GM may have meant.
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
 * Whether a check applies at all in this configuration.
 *
 * A check that cannot be answered is DROPPED rather than answered `pass`: a green
 * `Outcome routing` row on a system whose salvage is simple would tell a GM something was
 * checked that was not.
 *
 * @param {string} id
 * @param {{salvageActive: boolean, routed: boolean, progressive: boolean, essencesOffered: boolean}} gates
 * @returns {boolean}
 */
function checkApplies(id, gates) {
  if (id === 'essences') return gates.essencesOffered;
  if (id === 'salvageResults' || id === 'salvageResultRules') return gates.salvageActive;
  if (id === 'salvageRouting') return gates.salvageActive && gates.routed;
  if (id === 'progressiveDc') return gates.salvageActive && gates.progressive;
  return true;
}

/**
 * Evaluate one system's component rules.
 *
 * @param {object} context
 * @param {unknown} [context.category] the category this system resolves for the component.
 * @param {boolean} [context.essencesOffered] whether the system defines any essence at all.
 * @param {number} [context.essenceTotal] the total quantity the draft contributes.
 * @param {boolean} [context.salvageFeatureEnabled] the SYSTEM's salvage feature switch.
 * @param {boolean} [context.salvageEnabled] the COMPONENT's own salvage switch.
 * @param {boolean} [context.routed] whether the system routes salvage by check outcome.
 * @param {boolean} [context.progressive] whether the system resolves salvage progressively.
 * @param {number} [context.resultCount] how many results the draft awards.
 * @param {string[]} [context.resultsWithoutRules] result component names this system has no
 *   rules for.
 * @param {string[]} [context.unroutedOutcomes] outcome tiers with no result group.
 * @param {unknown} [context.progressiveDc] the component's own progressive DC.
 * @returns {{checks: {id: string, severity: string, valid: boolean, count: number}[],
 *   counts: {passing: number, warnings: number, blocking: number}}}
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

/**
 * One check's row status. An early-return chain rather than a nested ternary, which SonarCloud
 * reports as S3358 in a file it indexes.
 *
 * @param {{valid: boolean, severity: string}} check
 * @returns {'pass'|'warn'|'block'}
 */
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
 * The grouped rows, in the shape `EditorValidationSurface` takes.
 *
 * The check SET, its order and every severity come from the evaluator above; this maps them onto
 * copy. It FILTERS BEFORE IT MAPS, so a check the evaluator did not return is dropped rather than
 * dereferenced half-built inside a render.
 *
 * @param {object} context see {@link componentRulesValidation}.
 * @param {(key: string, fallback: string, data?: object) => string} [phrase] the caller's
 *   interpolating localizer. Defaults to token replacement over the fallback, so a unit test
 *   needs no localization seam.
 * @returns {{checks: object[], counts: object, groups: object[]}}
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
