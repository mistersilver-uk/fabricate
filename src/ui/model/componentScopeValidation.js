/**
 * The world Component entry's Validation model. Pure and Foundry-free, with each check's severity
 * and presentation registered beside it, because the row builder filters before it maps.
 * `hasSourceLink` answers presence only, and `worldCategory`/`worldTags` never block.
 */

import { stringOrEmpty as trimmed } from '../../utils/scalars.js';

/** The check ids, in render order. */
export const COMPONENT_SCOPE_VALIDATION_CHECKS = Object.freeze([
  'source',
  'name',
  'worldCategory',
  'worldTags',
  // `systemRules` gates the system-scope pass: with no membership record `systemCategory` is
  // unanswerable, so the evaluator returns after it and omits the later row.
  'systemRules',
  'systemCategory',
]);

/** Each check's severity. */
const SEVERITY = Object.freeze({
  source: 'blocking',
  name: 'blocking',
  worldCategory: 'warning',
  worldTags: 'warning',
  systemRules: 'warning',
  systemCategory: 'blocking',
});

/** Which group each check renders under. */
const CHECK_GROUP = Object.freeze({
  source: 'source',
  name: 'identity',
  worldCategory: 'classification',
  worldTags: 'classification',
  systemRules: 'system',
  systemCategory: 'system',
});

/** The two system-scope checks that only exist once a system is in view at all. */
const SYSTEM_CHECKS = Object.freeze(['systemRules', 'systemCategory']);

/** The group headings, in render order. */
export const COMPONENT_SCOPE_VALIDATION_GROUPS = Object.freeze([
  Object.freeze({
    id: 'source',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Validation.GroupSource',
    fallback: 'Source item',
    icon: 'fas fa-link',
  }),
  Object.freeze({
    id: 'identity',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Validation.GroupIdentity',
    fallback: 'Identity',
    icon: 'fas fa-signature',
  }),
  Object.freeze({
    id: 'classification',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Validation.GroupClassification',
    fallback: 'World classification',
    icon: 'fas fa-globe',
  }),
  Object.freeze({
    id: 'system',
    labelKey: 'FABRICATE.Admin.Manager.Scoped.Component.Validation.GroupSystem',
    fallback: 'System rules',
    icon: 'fas fa-screwdriver-wrench',
  }),
]);

/** Whether one check is answerable on the state the screen is holding. */
function checkApplies(id, { systemKnown, member }) {
  if (!SYSTEM_CHECKS.includes(id)) return true;
  if (!systemKnown) return false;
  if (id === 'systemRules') return true;
  return member;
}

/** Evaluate a world component entry for the Validation tab. */
export function componentScopeValidation(context = {}) {
  const systemKnown = context.systemKnown === true;
  const member = context.member === true;
  const worldTags = Array.isArray(context.worldTags) ? context.worldTags : [];

  const states = {
    source: context.hasSourceLink === true ? 'linked' : 'missing',
    name: trimmed(context.name) ? 'authored' : 'missing',
    worldCategory: trimmed(context.worldCategory) ? 'authored' : 'missing',
    worldTags: worldTags.length > 0 ? 'authored' : 'missing',
    systemRules: member ? 'member' : 'missing',
    systemCategory: trimmed(context.resolvedCategory) ? 'resolved' : 'missing',
  };

  const checks = COMPONENT_SCOPE_VALIDATION_CHECKS.filter((id) =>
    checkApplies(id, { systemKnown, member })
  ).map((id) => ({
    id,
    severity: SEVERITY[id],
    valid: states[id] !== 'missing',
    state: states[id],
  }));

  return {
    checks,
    counts: {
      passing: checks.filter((check) => check.valid).length,
      warnings: checks.filter((check) => !check.valid && check.severity === 'warning').length,
      blocking: checks.filter((check) => !check.valid && check.severity === 'blocking').length,
    },
  };
}

/** One check's row status. */
function checkStatus(check) {
  if (check.valid) return 'pass';
  return check.severity === 'blocking' ? 'block' : 'warn';
}

/** Pick the singular or the plural `[key, fallback]` pair for a count. */
function oneOrMany(count, one, many) {
  return count === 1 ? one : many;
}

/** One check's title, in the two states it has. */
function checkTitle(id, check, phrase, context) {
  const missing = check.state === 'missing';
  const systemName = trimmed(context.systemName) || trimmed(context.systemId);
  const data = {
    system: systemName,
    count: Array.isArray(context.worldTags) ? context.worldTags.length : 0,
  };
  // EVERY KEY IS A COMPLETE LITERAL, never a base plus an interpolated suffix.
  const titles = {
    source: missing
      ? [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.SourceMissing',
          'No source item linked',
        ]
      : [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.SourceLinked',
          'A source item is linked',
        ],
    name: missing
      ? ['FABRICATE.Admin.Manager.Scoped.Component.Validation.NameMissing', 'Name is empty']
      : ['FABRICATE.Admin.Manager.Scoped.Component.Validation.NameSet', 'Name is set'],
    worldCategory: missing
      ? [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldCategoryMissing',
          'No world category',
        ]
      : [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldCategorySet',
          'World category is set',
        ],
    // The singular is its own key, not a rounding of the plural.
    worldTags: missing
      ? ['FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldTagsMissing', 'No world tags']
      : oneOrMany(
          data.count,
          [
            'FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldTagsSetOne',
            '{count} world tag set',
          ],
          [
            'FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldTagsSet',
            '{count} world tags set',
          ]
        ),
    systemRules: missing
      ? [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.SystemRulesMissing',
          'No rules in {system}',
        ]
      : [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.SystemRulesPresent',
          'Rules exist in {system}',
        ],
    systemCategory: missing
      ? [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.SystemCategoryMissing',
          'No category resolves here',
        ]
      : [
          'FABRICATE.Admin.Manager.Scoped.Component.Validation.SystemCategoryResolved',
          'Category resolves in {system}',
        ],
  };
  const [key, fallback] = titles[id];
  return phrase(key, fallback, data);
}

/** The one-line explanation under a failing row, for the three states that need one. */
function checkDetail(id, check, phrase) {
  if (check.state !== 'missing') return '';
  const details = {
    source: [
      'FABRICATE.Admin.Manager.Scoped.Component.Validation.SourceMissingNote',
      'Every component needs one source item.',
    ],
    worldCategory: [
      'FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldCategoryMissingNote',
      'Systems that inherit fall back to their own list.',
    ],
    // NOT `Nothing merges into system tag lists.` (issue 1371, revision 8).
    worldTags: [
      'FABRICATE.Admin.Manager.Scoped.Component.Validation.WorldTagsMissingNote',
      'Each system relies on its own list.',
    ],
    systemCategory: [
      'FABRICATE.Admin.Manager.Scoped.Component.Validation.SystemCategoryMissingNote',
      'Inheriting from a world value that is not set.',
    ],
  };
  const entry = details[id];
  if (!entry) return '';
  return phrase(entry[0], entry[1], {});
}

/** The grouped rows, in the shape `EditorValidationSurface` takes. */
export function componentScopeValidationPresentation(
  context = {},
  phrase = (_key, fallback, data) =>
    Object.entries(data ?? {}).reduce(
      (copy, [token, value]) => copy.replaceAll(`{${token}}`, String(value)),
      fallback
    )
) {
  const { checks, counts } = componentScopeValidation(context);
  const byId = new Map(checks.map((check) => [check.id, check]));

  const rows = (groupId) =>
    COMPONENT_SCOPE_VALIDATION_CHECKS.filter(
      (id) => CHECK_GROUP[id] === groupId && byId.has(id)
    ).map((id) => {
      const check = byId.get(id);
      return {
        id,
        status: checkStatus(check),
        title: checkTitle(id, check, phrase, context),
        detail: checkDetail(id, check, phrase),
      };
    });

  return {
    checks,
    counts,
    groups: COMPONENT_SCOPE_VALIDATION_GROUPS.map((group) => ({
      id: group.id,
      label: phrase(group.labelKey, group.fallback, {}),
      icon: group.icon,
      rows: rows(group.id),
    })).filter((group) => group.rows.length > 0),
  };
}
