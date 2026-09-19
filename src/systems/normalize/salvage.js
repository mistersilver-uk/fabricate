/**
 * The component salvage normalizers (issue 1713): free pure functions the `CraftingSystemManager`
 * delegates to, and the home of the Simple-mode group-count invariant. Internal to that aggregate —
 * a private continuation of the `_normalizeComponent` chokepoint, reached only through the
 * manager's delegates and `./components.js` — nothing else imports it.
 */
import { normalizeQuantityFormula } from '../../models/Result.js';
import { authoredCheckModifierIds } from '../../utils/checkModifierPicks.js';

/** Derive the salvage-normalization context (issue 764) from an owning crafting system.
 * `salvageSimpleCheckHasFormula` reads `salvageCraftingCheck.simple.rollFormula` SPECIFICALLY —
 * the only slot the Simple engine consults — never an OR across the three slots. Tolerant of a
 * raw, pre-normalized system. */
export function salvageNormalizationContext(system = {}) {
  const raw = system?.salvageResolutionMode;
  const token = raw === 'tiered' ? 'routed' : raw; // legacy alias
  const salvageResolutionMode = ['simple', 'routed', 'progressive'].includes(token)
    ? token
    : 'simple';
  const formula = system?.salvageCraftingCheck?.simple?.rollFormula;
  const salvageSimpleCheckHasFormula = typeof formula === 'string' && formula.trim() !== '';
  return { salvageResolutionMode, salvageSimpleCheckHasFormula };
}

/** Normalize a component's salvage config. In Simple salvage mode this enforces the group-count
 * invariant (issue 764) via a SUCCESS-FIRST retain-one clamp: one success group at
 * `resultGroups[0]`, which the engine awards ON SUCCESS via `slice(0, 1)` with no role filter,
 * plus at most one reserved `role: 'failure'` group. The ordering is load-bearing, because the
 * FAILURE branch must select BY ROLE or a failed check would award the success output. */
export function normalizeSalvage(salvage = {}, options = {}) {
  if (!salvage || typeof salvage !== 'object') {
    return {
      enabled: false,
      // Default TRUE (issue 651), matching the `Recipe.allowPlayerResultReorder`
      // default. This non-object path returns its own literal, so the default has to
      // be stated on BOTH return paths or a component with no salvage config renders
      // the GM toggle off against a default-on spec.
      allowPlayerResultReorder: true,
      ingredientQuantity: 1,
      toolIds: [],
      resultGroups: [],
      dcOverride: null,
      // `checkModifierIds` is deliberately ABSENT from this literal, not `[]`: an empty
      // array is an AUTHORED pick of zero, and a component with no salvage config at all
      // has authored nothing. Seeding one here would silently give every such component a
      // pick of zero modifiers under `bySubject`. See the attach in the main return.
    };
  }

  const rawQty = Number(salvage.ingredientQuantity);
  const ingredientQuantity = Number.isFinite(rawQty) && rawQty >= 1 ? Math.floor(rawQty) : 1;

  // A set override replaces the system-level salvage default DC; null uses it. null/''/undefined
  // are guarded explicitly so re-normalizing a null stays null (`Number(null)` is a spurious 0).
  const dcOverride = (() => {
    const raw = salvage.dcOverride;
    if ([null, undefined, ''].includes(raw)) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  })();

  // HOISTED DELIBERATELY (issue 676). `enabled` is the first key of the literal
  // below and `resultGroups` used to be computed ~10 lines later, so clamping
  // `enabled` in place against the groups would read an uninitialized local.
  const normalizedGroups = Array.isArray(salvage.resultGroups)
    ? salvage.resultGroups.map((g) => normalizeSalvageResultGroup(g)).filter(Boolean)
    : [];

  // Simple-mode SUCCESS-FIRST retain-one clamp (issue 764). Routed, progressive and the
  // no-context default keep every group and the lower-bound-only `enabled` rule.
  const { salvageResolutionMode, salvageSimpleCheckHasFormula } = options;
  let resultGroups = normalizedGroups;
  let enabled = salvage.enabled === true && normalizedGroups.length > 0;
  if (salvageResolutionMode === 'simple') {
    const successGroup = normalizedGroups.find((g) => g.role !== 'failure');
    const failureGroup = normalizedGroups.find((g) => g.role === 'failure');
    const clamped = [];
    // Success group ALWAYS at index 0 — the engine's SUCCESS award is `slice(0, 1)` with no role
    // filter, so a failure-first input is re-ordered here. Unchanged by issue 1098, whose
    // failure award selects BY ROLE precisely so this guarantee stays the only thing relied on.
    if (successGroup) clamped.push(successGroup);
    // Reserved failure group tolerated ONLY with an authored Simple check formula.
    if (failureGroup && salvageSimpleCheckHasFormula === true) clamped.push(failureGroup);
    resultGroups = clamped;
    // A Simple config with no success group cannot be enabled: the success branch's
    // `slice(0, 1)` would otherwise award a lone `role: 'failure'` group on a PASSED check.
    enabled = salvage.enabled === true && successGroup != null;
  }

  return {
    // Requirement 5 (`data-models` → Component) is ENFORCED HERE, not by any UI control (issue
    // 676): the normalizer is the single chokepoint EVERY writer passes, and a control that
    // merely refuses to ENABLE a zero-group component cannot stop one BECOMING zero-group.
    enabled,
    // GM-authored policy: may a player reorder this salvage's progressive result
    // stages? Default TRUE (issue 651) — an absent key reads as `true`, which is why
    // the 1.17.0 migration does not seed it.
    allowPlayerResultReorder: salvage.allowPlayerResultReorder !== false,
    ingredientQuantity,
    dcOverride,
    // Preserve migrated salvage tool references so they are not orphaned on the
    // next system save. Coerced to trimmed, non-empty, deduped id strings.
    toolIds: normalizeToolIds(salvage.toolIds),
    resultGroups,
    // This component's own check-modifier pick (issue 1095), consulted only under `bySubject`.
    // Attached ONLY when authored, keyed on `Array.isArray` AT ENTRY: an authored EMPTY array is
    // a real pick of zero, distinct from an absent one which inherits the check default. It is
    // deliberately NOT keyed on the post-filter length.
    ...authoredCheckModifierIds(salvage.checkModifierIds),
    ...(salvage.outcomeRouting &&
      typeof salvage.outcomeRouting === 'object' && {
        outcomeRouting: { ...salvage.outcomeRouting },
      }),
    ...(salvage.timeRequirement &&
      typeof salvage.timeRequirement === 'object' && {
        timeRequirement: normalizeTimeRequirement(salvage.timeRequirement),
      }),
    ...(salvage.currencyRequirement &&
      typeof salvage.currencyRequirement === 'object' && {
        currencyRequirement: normalizeCurrencyRequirement(salvage.currencyRequirement),
      }),
  };
}

/** Normalize an array of library tool id strings to trimmed, non-empty, deduped strings,
 * tolerating non-array or nullish input. */
export function normalizeToolIds(toolIds) {
  if (!Array.isArray(toolIds)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of toolIds) {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeSalvageResult(result) {
  if (!result || typeof result !== 'object') return null;
  const compId = result.componentId || result.systemItemId;
  const quantityFormula = normalizeQuantityFormula(result.quantityFormula);
  return {
    id: result.id || foundry.utils.randomID(),
    componentId: compId || null,
    systemItemId: compId || null, // transitional alias
    quantity:
      Number.isFinite(Number(result.quantity)) && Number(result.quantity) >= 1
        ? Number(result.quantity)
        : 1,
    // Absence is the fixed-amount state, so `''` and whitespace collapse to it (issue 1645).
    ...(quantityFormula && { quantityFormula }),
    propertyMacroUuid: result.propertyMacroUuid || null,
  };
}

export function normalizeSalvageResultGroup(group) {
  if (!group || typeof group !== 'object') return null;
  const results = Array.isArray(group.results)
    ? group.results.map((r) => normalizeSalvageResult(r)).filter(Boolean)
    : [];
  return {
    id: group.id || foundry.utils.randomID(),
    name: String(group.name || '').trim() || 'Result Group',
    // Preserve a reserved `role: 'failure'` group (issue 764). The editor never AUTHORS this
    // role, but import, copy-mode and migration can carry one, and the Simple-mode clamp
    // distinguishes success groups by it. Only the reserved value is emitted.
    ...(group.role === 'failure' && { role: 'failure' }),
    results,
  };
}

export function normalizeTimeRequirement(time) {
  if (!time || typeof time !== 'object') return {};
  const result = {};
  for (const key of ['minutes', 'hours', 'days', 'months', 'years']) {
    const val = Number(time[key]);
    if (Number.isFinite(val) && val > 0) {
      result[key] = val;
    }
  }
  return result;
}

export function normalizeCurrencyRequirement(currency) {
  if (!currency || typeof currency !== 'object') return {};
  const amount = Number(currency.amount);
  return {
    unit: String(currency.unit || '').trim() || 'gp',
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
  };
}
