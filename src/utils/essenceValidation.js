/** Pure validation and offer-list model for the GM Essence Studio (issue 1036). */

import { stringOrEmpty as trimmed } from './scalars.js';

/** The add-new offer list: every essence a GM may ADD to a component or a recipe now. */
export function selectableEssenceOptions(essenceOptions) {
  return (Array.isArray(essenceOptions) ? essenceOptions : []).filter(
    (option) => option?.enabled !== false
  );
}

/**
 * What an essence-editing surface RENDERS: everything {@link selectableEssenceOptions} offers, plus
 * everything the caller says is already in play.
 */
export function visibleEssenceOptions(essenceOptions, isRetained = () => false) {
  const options = Array.isArray(essenceOptions) ? essenceOptions : [];
  const offered = new Set(selectableEssenceOptions(options).map((option) => option?.id));
  return options.filter((option) => offered.has(option?.id) || isRetained(option) === true);
}

/** The Validation tab's check ids, in render order. */
export const ESSENCE_VALIDATION_CHECKS = Object.freeze([
  'name',
  'icon',
  'colour',
  'description',
  'macro',
  'source',
  'usage',
  // ── THE WORLD-SCOPE PASS (issue 1372) ──────────────────────────────────────────────────── Three
  // checks over the WORLD DEFAULTS, which exist only on the world entry editor.
  'worldEffectSource',
  'worldMacro',
  'worldUsage',
  // ── THE SYSTEM-SCOPE PASS (issue 1372) ─────────────────────────────────────────────────── Five
  // checks about THIS system's membership record.
  'systemRules',
  'systemEnabled',
  'systemEffectSource',
  'systemMacro',
  'systemCarrier',
]);

/** Blocking stops nothing shipping; it is what the editor's Blocking count reports. */
const SEVERITY = Object.freeze({
  name: 'blocking',
  icon: 'blocking',
  colour: 'info',
  description: 'warning',
  macro: 'warning',
  source: 'warning',
  usage: 'info',
  worldEffectSource: 'warning',
  worldMacro: 'warning',
  worldUsage: 'warning',
  systemRules: 'blocking',
  systemEnabled: 'info',
  systemEffectSource: 'warning',
  systemMacro: 'warning',
  systemCarrier: 'blocking',
});

/** The scope each check belongs to. */
const CHECK_SCOPE = Object.freeze({
  name: 'both',
  icon: 'both',
  colour: 'both',
  description: 'both',
  macro: 'system',
  source: 'system',
  usage: 'system',
  worldEffectSource: 'world',
  worldMacro: 'world',
  worldUsage: 'world',
  systemRules: 'system',
  systemEnabled: 'system',
  systemEffectSource: 'system',
  systemMacro: 'system',
  systemCarrier: 'system',
});

/** The five system-scope membership checks `systemRules` gates, in render order. */
const SYSTEM_MEMBERSHIP_CHECKS = Object.freeze([
  'systemEnabled',
  'systemEffectSource',
  'systemMacro',
  'systemCarrier',
]);

/** Evaluate an essence draft for the editor's Validation tab. */
export function essenceEditorValidation(essence, context = {}) {
  const macroUuid = trimmed(essence?.propertyMacroUuid);
  const macroApplies = context.propertyMacrosEnabled === true && macroUuid !== '';
  const sourceState = trimmed(context.sourceState) || 'none';
  const sourceApplies =
    context.effectTransferEnabled === true &&
    (sourceState === 'stale' || sourceState === 'missing');
  const inUse = Number(context.componentUsageCount) > 0 || Number(context.recipeUsageCount) > 0;
  const disabled = essence?.enabled === false;
  const worldScope = context.scope === 'world';
  const membershipKnown = context.membershipKnown === true;
  const member = context.member === true;
  const enabledHere = context.enabledHere !== false;

  const states = {
    name: trimmed(essence?.name) ? 'authored' : 'missing',
    icon: trimmed(essence?.icon) ? 'authored' : 'missing',
    colour: trimmed(essence?.colorToken) ? 'authored' : 'unset',
    description: trimmed(essence?.description) ? 'authored' : 'missing',
    macro: macroResolutionState(macroApplies, context.macroResolved),
    source: sourceApplies ? sourceState : 'ok',
    usage: usageState(disabled, inUse),
    worldEffectSource: authoredState(context.worldEffectSource),
    worldMacro: authoredState(context.worldMacro),
    worldUsage: Number(context.memberSystemCount) > 0 ? 'used' : 'missing',
    systemRules: member ? 'member' : 'missing',
    systemEnabled: enabledHere ? 'enabled' : 'disabled',
    systemEffectSource: sectionState(
      context.resolvedEffectSource,
      context.sectionInherited,
      'effectSource'
    ),
    systemMacro: sectionState(context.resolvedMacro, context.sectionInherited, 'macro'),
    systemCarrier: enabledHere && Number(context.componentCarrierCount) === 0 ? 'missing' : 'ok',
  };
  const failing = new Set(['missing', 'unresolved', 'stale']);

  const checks = ESSENCE_VALIDATION_CHECKS.filter((id) =>
    checkApplies(id, { worldScope, membershipKnown, member })
  ).map((id) => {
    const severity = SEVERITY[id];
    const state = states[id];
    return {
      id,
      severity,
      // An informational row can never fail — see the header.
      valid: severity === 'info' ? true : !failing.has(state),
      state,
    };
  });

  return {
    checks,
    counts: {
      passing: checks.filter((check) => check.valid).length,
      warnings: checks.filter((check) => !check.valid && check.severity === 'warning').length,
      blocking: checks.filter((check) => !check.valid && check.severity === 'blocking').length,
    },
  };
}

/** `'ok'` when the gate is off or nothing is authored; `'unresolved'` only on a proven miss. */
function macroResolutionState(applies, macroResolved) {
  if (!applies) return 'ok';
  return macroResolved === false ? 'unresolved' : 'authored';
}

/** The informational enabled-vs-use fact, never a failure. */
function usageState(disabled, inUse) {
  if (!disabled) return 'enabled';
  return inUse ? 'disabled-in-use' : 'disabled-unused';
}

/** Whether one check is answerable on the screen that is asking. */
function checkApplies(id, { worldScope, membershipKnown, member }) {
  const owner = CHECK_SCOPE[id];
  if (owner === 'both') return true;
  if (owner === 'world') return worldScope;
  if (worldScope) return false;
  if (id === 'systemRules') return membershipKnown;
  if (SYSTEM_MEMBERSHIP_CHECKS.includes(id)) return membershipKnown && member;
  return true;
}

/** `'authored'` when a world default holds a value at all; `'missing'` when it is unset. */
function authoredState(value) {
  if (value === null || value === undefined) return 'missing';
  if (typeof value === 'string') return value.trim() ? 'authored' : 'missing';
  if (typeof value === 'object') return Object.keys(value).length > 0 ? 'authored' : 'missing';
  return 'authored';
}

/** Which scope a resolved section came from, or `'missing'` when nothing resolves. */
function sectionState(resolved, inherited, section) {
  if (authoredState(resolved) === 'missing') return 'missing';
  return inherited?.[section] === false ? 'overridden' : 'inherited';
}
