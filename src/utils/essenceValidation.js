/**
 * Pure validation and offer-list model for the GM Essence Studio (issue 1036).
 *
 * It lives under `src/utils/` and not in `apps/manager/essences/essenceStudio.js`
 * deliberately: `npm run lint` and `format:check` do NOT cover `src/ui/**\/*.js` while
 * SonarCloud still indexes it, so a module there can be lint-green and Sonar-red.
 * `tools/toolStudio.js` already sits in that blind spot and this change does not widen it —
 * the studio adapter keeps only presentation wiring, and everything decidable without a
 * DOM lives here.
 *
 * Nothing in this file touches Foundry globals, the store, or localization. Callers
 * localize; the macro-resolution and source-state facts are supplied as inputs because
 * resolving them needs `await fromUuid`, which a pure leaf must not do.
 */

/**
 * The add-new offer list: every essence a GM may ADD to a component or a recipe now.
 *
 * **A disabled essence is withheld from the OFFER, never from the DATA.** This is a single
 * exported projection with exactly five consumers — the component editor's add-essence
 * control, `ComponentBulkEditPanel`'s essence add, `RecipeIngredientGroupCard`'s
 * add-option control AND its `firstEssence` default selection, and the same pair reached
 * through the separate `ComponentEditorRoot` app window — because the alternative (filter
 * the `essenceOptions` PROP) is destructive in three separate places:
 *
 * - `componentEditor.buildComponentEditorUpdates` rebuilds `updates.essences` SOLELY from
 *   `draft.essenceOptions`, so a filtered option set drops a disabled essence's authored
 *   quantity on the very next component save;
 * - `ComponentBulkEditPanel`'s staged essences map overwrites wholesale, so a filtered
 *   `essenceDefinitions` prop wipes disabled-essence quantities across a whole selection;
 * - `RecipeIngredientOption` resolves its display through `essenceOptions.find(...)` and
 *   `RecipeIngredientGroupCard` gates the essence match type on `essenceOptions.length > 0`,
 *   so filtering that prop renders authored options unresolved and removes the essence
 *   ingredient type entirely from a system whose essences are all disabled.
 *
 * The five `essenceOptions` props therefore stay UNFILTERED, and a disabled essence that
 * already carries a positive quantity — or is already referenced — is rendered with a
 * Disabled marker and stays editable and clearable.
 *
 * Default-true, matching the persisted field: an option carrying no `enabled` key at all
 * (a legacy fixture, a hand-built test row) is offered.
 *
 * @param {{id?: string, enabled?: boolean}[]} essenceOptions the UNFILTERED option list.
 * @returns {object[]} a new array; the input is not mutated.
 */
export function selectableEssenceOptions(essenceOptions) {
  return (Array.isArray(essenceOptions) ? essenceOptions : []).filter(
    (option) => option?.enabled !== false
  );
}

/**
 * What an essence-editing surface RENDERS: everything {@link selectableEssenceOptions}
 * offers, plus everything the caller says is already in play.
 *
 * The two component-quantity grids and the recipe option picker are each simultaneously an
 * offer AND the editing surface for what is already authored, and the rule for those is
 * one sentence: **only the ADD-NEW offer withholds a disabled essence.** A disabled
 * essence that already carries a positive quantity, or is already chosen, stays rendered
 * and clearable — otherwise the surface that authored the value becomes the one place the
 * GM cannot remove it.
 *
 * `isRetained` is a predicate rather than a fixed field because "already in play" is a
 * different question per surface: a positive quantity in the component editor, a positive
 * STAGED quantity in the bulk panel, the currently-chosen id in a recipe option picker.
 * One projection with a predicate keeps that decision at the call site while the offer
 * rule stays here — three near-identical inline filters would be three places for it to
 * drift, and SonarCloud counts the copies.
 *
 * Input order is preserved, which is the system's own vocabulary order.
 *
 * @param {{id?: string, enabled?: boolean}[]} essenceOptions the UNFILTERED option list.
 * @param {(option: object) => boolean} [isRetained] whether this option is already in play.
 * @returns {object[]} a new array; the input is not mutated.
 */
export function visibleEssenceOptions(essenceOptions, isRetained = () => false) {
  const options = Array.isArray(essenceOptions) ? essenceOptions : [];
  const offered = new Set(selectableEssenceOptions(options).map((option) => option?.id));
  return options.filter((option) => offered.has(option?.id) || isRetained(option) === true);
}

/**
 * The Validation tab's check ids, in render order.
 *
 * A frozen list rather than an inline literal so the presentation adapter's label map and
 * this module cannot drift into covering different sets.
 */
export const ESSENCE_VALIDATION_CHECKS = Object.freeze([
  'name',
  'icon',
  'colour',
  'description',
  'macro',
  'source',
  'usage',
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
});

function trimmed(value) {
  return String(value ?? '').trim();
}

/**
 * Evaluate an essence draft for the editor's Validation tab.
 *
 * The enumerated checks, with their severities:
 *
 * - **name** *(blocking)* — an essence with no name is unaddressable everywhere it appears.
 * - **icon** *(blocking)* — the row, the grid card, the inspector and the preview all render
 *   a tile; the normalizer's `fas fa-mortar-pestle` default means this passes for real data.
 * - **colour** *(informational, ALWAYS a pass)* — an unset colour renders in the theme
 *   accent BY DESIGN, so it is not a warning. The row carries `state` so the tab can say
 *   which of the two it is without inventing a failure.
 * - **description** *(warning)* — a described essence is what the inspector and the
 *   component picker read; its absence degrades rather than breaks.
 * - **macro** *(warning)* — only when `features.propertyMacros` is ON. An authored
 *   `propertyMacroUuid` that does not resolve to a script Macro will be SKIPPED SILENTLY at
 *   craft time (a per-essence-per-result toast would spam the crafting player), so this tab
 *   is the GM's only route to the fact.
 * - **source** *(warning)* — only when `features.effectTransfer` is ON, and only for a
 *   `stale` or `missing` source. It replaces the dropped "source carries active effects"
 *   row: the store computes `sourceState` on every card already, and the browser's
 *   needs-attention filter exists precisely because a broken source link is otherwise
 *   unfindable.
 * - **usage** *(informational, ALWAYS a pass)* — whether the enabled state matches the
 *   essence's use. A DISABLED essence that components carry and recipes require is the
 *   headline state of this feature, not a defect: its quantities still match, accumulate
 *   and are consumed; only the behaviour it carries onto a crafted result is suppressed.
 *
 * A blocking issue does NOT disable the essence's own Enabled toggle. The prototype's
 * subtitle asserts a gate this change does not implement.
 *
 * Every informational check reports `valid: true` and carries a `state`, so `passing +
 * warnings + blocking` always equals the number of checks and no row is uncounted.
 *
 * @param {{name?: string, icon?: string, colorToken?: ?string, description?: string,
 *   propertyMacroUuid?: ?string, enabled?: boolean}} essence
 * @param {{propertyMacrosEnabled?: boolean, effectTransferEnabled?: boolean,
 *   macroResolved?: ?boolean, sourceState?: string, componentUsageCount?: number,
 *   recipeUsageCount?: number}} [context] `macroResolved` is `null`/`undefined` while
 *   resolution is still in flight, which passes — a spinner must not read as a defect.
 * @returns {{checks: {id: string, severity: string, valid: boolean, state: string}[],
 *   counts: {passing: number, warnings: number, blocking: number}}}
 */
export function essenceEditorValidation(essence, context = {}) {
  const macroUuid = trimmed(essence?.propertyMacroUuid);
  const macroApplies = context.propertyMacrosEnabled === true && macroUuid !== '';
  const sourceState = trimmed(context.sourceState) || 'none';
  const sourceApplies =
    context.effectTransferEnabled === true &&
    (sourceState === 'stale' || sourceState === 'missing');
  const inUse = Number(context.componentUsageCount) > 0 || Number(context.recipeUsageCount) > 0;
  const disabled = essence?.enabled === false;

  const states = {
    name: trimmed(essence?.name) ? 'authored' : 'missing',
    icon: trimmed(essence?.icon) ? 'authored' : 'missing',
    colour: trimmed(essence?.colorToken) ? 'authored' : 'unset',
    description: trimmed(essence?.description) ? 'authored' : 'missing',
    macro: macroResolutionState(macroApplies, context.macroResolved),
    source: sourceApplies ? sourceState : 'ok',
    usage: usageState(disabled, inUse),
  };
  const failing = new Set(['missing', 'unresolved', 'stale']);

  const checks = ESSENCE_VALIDATION_CHECKS.map((id) => {
    const severity = SEVERITY[id];
    const state = states[id];
    return {
      id,
      severity,
      // An informational row can never fail — see the header. Everything else fails on
      // one of the three failure states.
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
