/**
 * The world Component entry's Validation model (issue 1371, epic 1357).
 *
 * Pure, and specifically FOUNDRY-FREE: it reads no global, resolves no document and awaits
 * nothing. It sits under `src/utils/` for the reason `essenceValidation.js` states at its own
 * head — `npm run lint` and `format:check` do not cover `src/ui/**\/*.js` while SonarCloud still
 * indexes it, so a module parked there can be lint-green and Sonar-red.
 *
 * ── NO RESOLUTION-DEPENDENT CHECK, AND THAT IS A SCOPE DECISION ──────────────────────────────
 * `Linked source item is missing` is deliberately NOT here. `hasSourceLink` answers PRESENCE and
 * never resolution: the projection that computes it reads no Foundry global by design, and the
 * synchronous resolver throws on a compendium-embedded uuid unless it is asked not to and answers
 * a pack INDEX entry for an uncached compendium Item — so a "synchronous" resolution check is not
 * a presence answer either. `No source item linked`, which presence answers exactly, is kept.
 *
 * ── THE CHECK, ITS SEVERITY AND ITS PRESENTATION ARE REGISTERED TOGETHER ─────────────────────
 * All three live in this one module, because the failure they guard against is a check registered
 * in the evaluator and omitted from the presentation map: the row builder FILTERS BEFORE IT MAPS,
 * so an unpresented check is dropped in silence rather than throwing. One list, one severity
 * table, one presentation table, and the filter reads all three.
 *
 * ── THE TWO `warning` SEVERITIES ARE LOAD-BEARING ────────────────────────────────────────────
 * `worldCategory` and `worldTags` are warnings and must not be promoted to blocking. A world
 * component with neither is a legitimate authored state — an inheriting system falls back to its
 * own category, and a system with no world tags relies on its own list — so a blocking row would
 * make a correct entry look broken while still satisfying any presence-only assertion.
 */

/**
 * The check ids, in render order.
 *
 * A frozen list rather than an inline literal, so the severity table, the presentation table and
 * the evaluator cannot drift into covering different sets.
 *
 * @type {readonly string[]}
 */
export const COMPONENT_SCOPE_VALIDATION_CHECKS = Object.freeze([
  'source',
  'name',
  'worldCategory',
  'worldTags',
  // ── THE SYSTEM-SCOPE PASS ────────────────────────────────────────────────────────────────
  // `systemRules` is the gate: with no membership record `systemCategory` is not merely passing,
  // it is unanswerable, so the evaluator RETURNS after `systemRules` and the later row is omitted
  // rather than reported as a pass about a record nobody authored.
  'systemRules',
  'systemCategory',
]);

/**
 * Each check's severity.
 *
 * `blocking` and `warning` are the two that can fail; there is no informational check here,
 * because every fact this entry states about itself is one a GM can act on.
 *
 * @type {Readonly<Record<string, 'blocking'|'warning'>>}
 */
const SEVERITY = Object.freeze({
  source: 'blocking',
  name: 'blocking',
  worldCategory: 'warning',
  worldTags: 'warning',
  systemRules: 'blocking',
  systemCategory: 'blocking',
});

/**
 * Which group each check renders under.
 *
 * @type {Readonly<Record<string, string>>}
 */
const CHECK_GROUP = Object.freeze({
  source: 'source',
  name: 'identity',
  worldCategory: 'classification',
  worldTags: 'classification',
  systemRules: 'system',
  systemCategory: 'system',
});

/**
 * The two system-scope checks that only exist once a system is in view at all.
 *
 * @type {readonly string[]}
 */
const SYSTEM_CHECKS = Object.freeze(['systemRules', 'systemCategory']);

/**
 * The group headings, in render order.
 *
 * @type {ReadonlyArray<Readonly<{id: string, labelKey: string, fallback: string, icon: string}>>}
 */
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

function trimmed(value) {
  return String(value ?? '').trim();
}

/**
 * Whether one check is answerable on the state the screen is holding.
 *
 * @param {string} id
 * @param {{systemKnown: boolean, member: boolean}} scope
 * @returns {boolean}
 */
function checkApplies(id, { systemKnown, member }) {
  if (!SYSTEM_CHECKS.includes(id)) return true;
  if (!systemKnown) return false;
  // THE EARLY RETURN. With no membership record the only answerable system-scope fact is that
  // there are no rules here.
  if (id === 'systemRules') return true;
  return member;
}

/**
 * Evaluate a world component entry for the Validation tab.
 *
 * Every input is supplied by the caller, because each one is a fact the caller already holds and
 * this module is not allowed to reach: the DRAFT identity rather than the persisted record, the
 * world defaults as the GM has them on screen, and the resolved per-system answer off the world
 * projection's own join.
 *
 * @param {object} context
 * @param {string} [context.name] The buffered display name.
 * @param {boolean} [context.hasSourceLink] Whether the record names a source Item at all.
 * @param {unknown} [context.worldCategory] The world default category, or absence.
 * @param {unknown} [context.worldTags] The world default tag list.
 * @param {boolean} [context.systemKnown] Whether a crafting system is in view.
 * @param {boolean} [context.member] Whether that system has a membership record.
 * @param {unknown} [context.resolvedCategory] What `category` resolves to for that system.
 * @returns {{checks: {id: string, severity: string, valid: boolean, state: string}[],
 *   counts: {passing: number, warnings: number, blocking: number}}}
 */
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

/**
 * One check's row status. Written as an early-return chain rather than a nested ternary, which
 * SonarCloud reports as S3358 in a file it indexes.
 *
 * @param {{valid: boolean, severity: string}} check
 * @returns {'pass'|'warn'|'block'}
 */
function checkStatus(check) {
  if (check.valid) return 'pass';
  return check.severity === 'blocking' ? 'block' : 'warn';
}

/**
 * One check's title, in the two states it has.
 *
 * @param {string} id
 * @param {{state: string}} check
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @param {object} context
 * @returns {string}
 */
function checkTitle(id, check, phrase, context) {
  const missing = check.state === 'missing';
  const systemName = trimmed(context.systemName) || trimmed(context.systemId);
  const titles = {
    source: missing
      ? ['Validation.SourceMissing', 'No source item linked']
      : ['Validation.SourceLinked', 'A source item is linked'],
    name: missing
      ? ['Validation.NameMissing', 'Name is empty']
      : ['Validation.NameSet', 'Name is set'],
    worldCategory: missing
      ? ['Validation.WorldCategoryMissing', 'No world category']
      : ['Validation.WorldCategorySet', 'World category is set'],
    worldTags: missing
      ? ['Validation.WorldTagsMissing', 'No world tags']
      : ['Validation.WorldTagsSet', '{count} world tags set'],
    systemRules: missing
      ? ['Validation.SystemRulesMissing', 'No rules in {system}']
      : ['Validation.SystemRulesPresent', 'Rules exist in {system}'],
    systemCategory: missing
      ? ['Validation.SystemCategoryMissing', 'No category resolves here']
      : ['Validation.SystemCategoryResolved', 'Category resolves in {system}'],
  };
  const [suffix, fallback] = titles[id];
  return phrase(`FABRICATE.Admin.Manager.Scoped.Component.${suffix}`, fallback, {
    system: systemName,
    count: Array.isArray(context.worldTags) ? context.worldTags.length : 0,
  });
}

/**
 * The one-line explanation under a failing row, for the three states that need one.
 *
 * @param {string} id
 * @param {{state: string}} check
 * @param {(key: string, fallback: string, data?: object) => string} phrase
 * @returns {string}
 */
function checkDetail(id, check, phrase) {
  if (check.state !== 'missing') return '';
  const details = {
    source: ['Validation.SourceMissingNote', 'Every component needs one source item.'],
    worldCategory: [
      'Validation.WorldCategoryMissingNote',
      'Systems that inherit fall back to their own list.',
    ],
    worldTags: ['Validation.WorldTagsMissingNote', 'Nothing merges into system tag lists.'],
    systemCategory: [
      'Validation.SystemCategoryMissingNote',
      'Inheriting from a world value that is not set.',
    ],
  };
  const entry = details[id];
  if (!entry) return '';
  return phrase(`FABRICATE.Admin.Manager.Scoped.Component.${entry[0]}`, entry[1], {});
}

/**
 * The grouped rows, in the shape `EditorValidationSurface` takes.
 *
 * The check SET, its order and every severity come from the evaluator above; this maps them onto
 * copy. The row builder FILTERS BEFORE IT MAPS, which is what makes it able to drop a check the
 * evaluator did not return rather than dereference a half-object inside a render.
 *
 * @param {object} context see {@link componentScopeValidation}.
 * @param {(key: string, fallback: string, data?: object) => string} [phrase] the caller's
 *   interpolating localizer. Defaults to token replacement over the fallback, so a unit test
 *   needs no localization seam.
 * @returns {{checks: object[], counts: object, groups: object[]}}
 */
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
