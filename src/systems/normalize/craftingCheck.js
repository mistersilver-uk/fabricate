/**
 * The crafting-check, trigger and crit normalizers (issue 1698): free pure functions the
 * `CraftingSystemManager` delegates to, so the crafting, salvage and gathering checks keep
 * sharing one derivation. Internal to that aggregate — a private continuation of the
 * `_normalizeSystem` chokepoint, reached only through the manager, so nothing else imports it.
 */
import { parsePlainDiceGroups, parseDiceGroups } from '../../utils/craftingCheckExpression.js';
import { normalizeFailureResultPolicy } from '../../utils/failureResultPolicy.js';
import { normalizeModifierPolicy, resolveMaxModifierPicks } from '../checkModifierResolver.js';
import { normalizePreviewSandbox } from '../progressiveCheckSandbox.js';

import {
  normalizeCheckEvaluation,
  normalizeNullableAdjustment,
  normalizeNullableSuccesses,
} from './checkEvaluation.js';

export function normalizeCraftingCheck(check = {}, validCatalogueIds = null) {
  const outcomes = Array.isArray(check?.outcomes) ? check.outcomes : [];
  const normalizedOutcomes = outcomes
    .map((o) =>
      String(o || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  return {
    enabled: check?.enabled === true,
    // `mode` has a single valid value, `passFail`. The former `tiered`/`namedOutcomes` branch
    // referenced the removed tiered concept and was dead — no authoring surface writes it and
    // no runtime reads `craftingCheck.mode` — so any legacy value collapses to `passFail`.
    mode: 'passFail',
    consumption: {
      consumeIngredientsOnFail: check?.consumption?.consumeIngredientsOnFail !== false,
      // Canonical key is `breakToolsOnFail` (1.7.0 rename of the legacy
      // `consumeCatalystsOnFail`). Read new-then-legacy so pre-migration imports/exports
      // still load; the 1.7.0 migration rewrites persisted worlds to the new key.
      breakToolsOnFail:
        (check?.consumption?.breakToolsOnFail ?? check?.consumption?.consumeCatalystsOnFail) ===
        true,
    },
    // The ORTHOGONAL produce/do-not-produce axis (issue 1098). A sibling of
    // `consumption`, not a member of it: consumption answers what a failed check
    // COSTS, this answers what it PRODUCES.
    failureResultPolicy: normalizeFailureResultPolicy(check?.failureResultPolicy),
    progressive: normalizeProgressiveCraftingCheck(check?.progressive),
    outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
    routed: normalizeRoutedCraftingCheck(check?.routed),
    simple: normalizeSimpleCraftingCheck(check?.simple),
    // Crafting's SELECTION over the system-level library (issues 770, 1055, 1095, 1117): the
    // library itself is `system.modifiers`, and what stays here is which entries this activity
    // applies and how they combine. Absent → the `addAll` default with an empty id set.
    ...normalizeCheckModifierSelection(check, validCatalogueIds),
  };
}

/** Normalize ONE activity check's selection over the system catalogue (issue 1095). ONE
 * derivation, three callers, each an allowlist rebuild. `defaultModifierPolicy` is validated
 * through the resolver's own `normalizeModifierPolicy` so the authoring surface and the engine
 * cannot disagree, and `maxModifierPicks` PRESERVES ABSENCE, so a check never asked the
 * question cannot silently acquire a bound that truncates stored picks. */
export function normalizeCheckModifierSelection(check, validIds) {
  const seenDefaults = new Set();
  const defaultModifierIds = (
    Array.isArray(check?.defaultModifierIds) ? check.defaultModifierIds : []
  ).filter((id) => {
    // `!(validIds instanceof Set)` is the UNKNOWN-basis sentinel (issue 1308): a caller that
    // cannot vouch for the modifier library passes `null` and nothing is pruned. The old
    // `new Set()` default was the omitted-argument form of the Valid Id Basis failure.
    if (typeof id !== 'string' || seenDefaults.has(id)) return false;
    if (validIds instanceof Set && !validIds.has(id)) return false;
    seenDefaults.add(id);
    return true;
  });
  const defaultModifierPolicy = normalizeModifierPolicy(check?.defaultModifierPolicy) ?? 'addAll';
  const normalized = { defaultModifierPolicy, defaultModifierIds };
  // Absence-preserving: `resolveMaxModifierPicks` reports every unbounded form —
  // absent, `null`, non-integer, non-positive — as `Infinity`, so only a real positive
  // integer cap survives as a key and unlimited stays unlimited.
  const maxModifierPicks = resolveMaxModifierPicks(check);
  if (Number.isFinite(maxModifierPicks)) normalized.maxModifierPicks = maxModifierPicks;
  return normalized;
}

// Simple pass/fail crafting check for the simple and alchemy modes: a roll formula and a DC
// whose value is polymorphic — a static default with optional named recipe tiers, or a dynamic
// value from a dropped macro. Both field sets are kept so switching `dcMode` never destroys the
// other side's configuration.
export function normalizeSimpleCraftingCheck(simple = {}) {
  const source = !simple || typeof simple !== 'object' ? {} : simple;
  const dc = Number(source.dc);
  const tiers = Array.isArray(source.tiers) ? source.tiers : [];
  const rollFormula = typeof source.rollFormula === 'string' ? source.rollFormula : '';
  return {
    rollFormula,
    evaluation: normalizeCheckEvaluation(source.evaluation),
    dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
    thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    dcMode: source.dcMode === 'dynamic' ? 'dynamic' : 'static',
    tiers: tiers.map((tier) => normalizeSimpleTier(tier)).filter(Boolean),
    macroUuid: source.macroUuid || null,
    checkBreakage: normalizeUnifiedTriggers(rollFormula, source.diceCrits, source.checkBreakage),
  };
}

// Progressive crafting check: a roll formula whose total is the value progressive awarding
// spends against result difficulties — no DC, no comparison, no recipe tiers. This allowlist
// literal is SHARED by the crafting, salvage and gathering checks, so a key omitted here is
// dropped from all three on every normalize.
export function normalizeProgressiveCraftingCheck(progressive = {}) {
  const source = !progressive || typeof progressive !== 'object' ? {} : progressive;
  const rollFormula = typeof source.rollFormula === 'string' ? source.rollFormula : '';
  // The Checks Studio's PREVIEW SANDBOX (issue 1097). Emitted here because this literal is an
  // allowlist rebuild, and ABSENCE-PRESERVING, because an absent experiment is not an empty one.
  // NO RUNTIME PATH READS IT, deliberately: it is scratch state rather than configuration, and
  // nothing validates it either.
  const preview = normalizePreviewSandbox(source.preview);
  const normalized = {
    awardMode: ['partial', 'equal', 'exceed'].includes(source.awardMode)
      ? source.awardMode
      : 'equal',
    rollFormula,
    evaluation: normalizeCheckEvaluation(source.evaluation),
    checkBreakage: normalizeUnifiedTriggers(rollFormula, source.diceCrits, source.checkBreakage),
  };
  // Attached rather than spread, the same way `_normalizeCheckModifierCatalogue` attaches
  // its optional bounds: the key is ABSENT when no experiment has been run.
  if (preview) normalized.preview = preview;
  return normalized;
}

export function normalizeSimpleTier(tier) {
  if (!tier || typeof tier !== 'object') return null;
  const dc = Number(tier.dc);
  return {
    id: tier.id || foundry.utils.randomID(),
    name: String(tier.name || '').trim(),
    dc: Number.isFinite(dc) ? Math.trunc(dc) : 0,
    adjustment: normalizeNullableAdjustment(tier.adjustment),
    successes: normalizeNullableSuccesses(tier.successes),
  };
}

/** Convert a check's legacy per-die crit list into unified trigger objects (issue 419). A crit
 * is kept only when its canonicalized die appears as a plain, unmodified `NdS` group in the
 * formula, and the trigger's `groupId` is the index of the FIRST matching term, so a
 * duplicate-die formula targets the first group only. */
export function convertDiceCritsToTriggers(crits, rollFormula) {
  const list = Array.isArray(crits) ? crits : [];
  if (list.length === 0) return [];
  const groups = parseDiceGroups(rollFormula);
  const plainDice = new Set(parsePlainDiceGroups(rollFormula).map((group) => group.raw));
  return list
    .map((crit) => {
      if (!crit || typeof crit !== 'object') return null;
      // Canonicalize the die key (bare `dN` ≡ `1dN`) and drop crits keyed to a die
      // that is not a plain `NdS` group in the formula (modified pools / orphans).
      const die = canonicalDie(crit.die);
      if (!die || !plainDice.has(die)) return null;
      const groupId = groups.findIndex((group) => group.raw === die);
      if (groupId === -1) return null;
      const raw = Number.isFinite(Number(crit.raw)) ? Math.trunc(Number(crit.raw)) : 0;
      return {
        id: String(crit.id || foundry.utils.randomID()),
        condition: {
          type: 'diceGroup',
          groupId,
          aggregate: 'total',
          operator: '==',
          // Clamp `raw` to the die's producible total range [N, N*S]; the legacy
          // crit matched the die-term total, so an out-of-range raw could never
          // fire (see {@link clampCritRaw}).
          value: clampCritRaw(die, raw),
        },
        // Legacy `success:false` always meant force-failure (there was no off
        // state), so the disposition maps directly.
        outcome: crit.success === true ? 'success' : 'failure',
        breakTools: crit.breakTools === true,
        // A legacy crit had no stepping effect, but the key must be present so a
        // converted trigger re-normalizes to itself (issue 975).
        tierStep: normalizeTierStep(),
      };
    })
    .filter(Boolean);
}

/** Canonical plain `NdS` form of a stored crit die key (bare `dN` ≡ `1dN`), or '' when the key
 * is not a plain unmodified die term, so such crits are dropped by the conversion above. */
function canonicalDie(die) {
  const plain = parsePlainDiceGroups(String(die ?? ''));
  return plain.length === 1 ? plain[0].raw : '';
}

/** Clamp a critical raw value to the producible total range of an `NdS` term, `[N, N*S]`: an
 * out-of-range raw could never be rolled and the crit would be inert, so an authored "crit on
 * 25" for `1d20` triggers on a natural 20 instead of never. */
function clampCritRaw(die, raw) {
  const match = /^(\d+)d(\d+)$/i.exec(String(die).trim());
  if (!match) return raw;
  const count = Number(match[1]);
  const faces = Number(match[2]);
  if (!Number.isFinite(count) || !Number.isFinite(faces) || count < 1 || faces < 1) return raw;
  const min = count;
  const max = count * faces;
  return Math.min(Math.max(raw, min), max);
}

// Structured routed-mode crafting check: a check type (relative DC offsets or fixed value
// ranges), a shared roll expression, and TWO independent outcome-tier lists — one per type — so
// editing a tier in one mode never affects the other. Kept alongside the legacy `outcomes`
// string list rather than replacing it.
export function normalizeRoutedCraftingCheck(routed = {}) {
  const source = !routed || typeof routed !== 'object' ? {} : routed;
  const relative = Array.isArray(source.relativeOutcomes) ? source.relativeOutcomes : [];
  const fixed = Array.isArray(source.fixedOutcomes) ? source.fixedOutcomes : [];
  const tiers = Array.isArray(source.tiers) ? source.tiers : [];
  const dc = Number(source.dc);
  // The roll formula, default DC, comparison, per-die crits, and recipe tiers
  // mirror the simple check (so the editors share components). `rollExpression`
  // is the legacy field name, read for back-compat.
  let rollFormula = '';
  if (typeof source.rollFormula === 'string') {
    rollFormula = source.rollFormula;
  } else if (typeof source.rollExpression === 'string') {
    rollFormula = source.rollExpression;
  }
  const type = source.type === 'fixed' ? 'fixed' : 'relative';
  return {
    type,
    rollFormula,
    evaluation: normalizeCheckEvaluation(source.evaluation),
    dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
    thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    // WHERE THE DC COMES FROM, on the routed slot too (issue 1096): a routed RELATIVE check is
    // bands offset from a DC, so it has one by construction. ABSENCE-PRESERVING — anything not
    // exactly `dynamic` reads `static`, and `macroUuid` is kept whatever the mode.
    dcMode: source.dcMode === 'dynamic' ? 'dynamic' : 'static',
    macroUuid: source.macroUuid || null,
    tiers: tiers.map((tier) => normalizeSimpleTier(tier)).filter(Boolean),
    relativeOutcomes: relative
      .map((outcome) => normalizeRoutedOutcome(outcome, 'relative'))
      .filter(Boolean),
    fixedOutcomes: fixed.map((outcome) => normalizeRoutedOutcome(outcome, 'fixed')).filter(Boolean),
    // The legacy `natStepping` boolean (issue 975) converts to a pair of
    // tier-stepping triggers on read and is dropped from the output, so the
    // conversion runs once and the key never round-trips.
    checkBreakage: normalizeUnifiedTriggers(rollFormula, source.diceCrits, source.checkBreakage, {
      natStepping: source.natStepping,
      type,
    }),
  };
}

export function normalizeRoutedOutcome(outcome, kind) {
  if (!outcome || typeof outcome !== 'object') return null;
  const base = {
    id: outcome.id || foundry.utils.randomID(),
    name: String(outcome.name || '').trim(),
    success: outcome.success === true,
    breakTools: outcome.breakTools === true,
  };
  if (kind === 'fixed') {
    const start = Number(outcome.start);
    const end = Number(outcome.end);
    return {
      ...base,
      start: Number.isFinite(start) ? Math.trunc(start) : 0,
      end: Number.isFinite(end) ? Math.trunc(end) : 0,
    };
  }
  const dc = Number(outcome.dc);
  return {
    ...base,
    dc: Number.isFinite(dc) ? Math.trunc(dc) : 0,
    adjustment: normalizeNullableAdjustment(outcome.adjustment),
  };
}

/** Normalize the unified per-check trigger list (issue 419), migrating legacy data on read:
 * `diceCrits` become `diceGroup` triggers and a routed `natStepping` becomes the tier-stepping
 * pair, concatenated as `[...crits, ...natStep, ...authored]`. Idempotent. */
export function normalizeUnifiedTriggers(rollFormula, diceCrits, checkBreakage, legacyRouted = {}) {
  const converted = convertDiceCritsToTriggers(diceCrits, rollFormula);
  const convertedNatStep = convertNatSteppingToTriggers(
    legacyRouted?.natStepping,
    rollFormula,
    legacyRouted?.type
  );
  const { triggers } = normalizeCheckBreakage(checkBreakage);
  return { triggers: [...converted, ...convertedNatStep, ...triggers] };
}

/** Convert a routed check's legacy `natStepping: true` into the tier-stepping trigger pair
 * (issue 975), emitted only when stepping was live. The shape is load-bearing: stable literal
 * ids (a re-mint on every read would reach chat), EXPLICIT `outcome`/`breakTools` so the legacy
 * break-only test cannot misread it, and `allDice` so a headless roll fails open. */
export function convertNatSteppingToTriggers(natStepping, rollFormula, type) {
  if (natStepping !== true || type === 'fixed') return [];
  const d20GroupId = parseDiceGroups(rollFormula).findIndex((group) => group.sides === 20);
  // -1 → natStepping was already inert; synthesise nothing.
  if (d20GroupId === -1) return [];
  const natStepTrigger = (id, face, mode) => ({
    id,
    condition: {
      type: 'diceGroup',
      groupId: d20GroupId,
      aggregate: 'allDice',
      operator: '==',
      value: face,
    },
    outcome: 'none',
    breakTools: false,
    tierStep: { mode, steps: 1, tierId: null },
  });
  return [natStepTrigger('natstep-up', 20, 'up'), natStepTrigger('natstep-down', 1, 'down')];
}

/** Normalize the `checkBreakage` block's own trigger list. Malformed triggers are dropped, so a
 * bad authoring payload can never throw at runtime. */
export function normalizeCheckBreakage(input) {
  const source = !input || typeof input !== 'object' ? {} : input;
  const rawTriggers = Array.isArray(source.triggers) ? source.triggers : [];
  const triggers = rawTriggers.map((trigger) => normalizeUnifiedTrigger(trigger)).filter(Boolean);
  return { triggers };
}

/** Normalize a single unified trigger, returning null when its condition is malformed. `outcome`
 * is PINNED to `'none'` for an `outcomeTier` condition; a legacy break-only trigger migrates to
 * `breakTools: true`, and `tierStep` is deliberately absent from that test. */
export function normalizeUnifiedTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') return null;
  const condition = normalizeCheckBreakageCondition(trigger.condition);
  if (!condition) return null;
  const isLegacyBreakOnly = trigger.outcome === undefined && trigger.breakTools === undefined;
  let outcome = ['success', 'failure', 'none'].includes(trigger.outcome) ? trigger.outcome : 'none';
  if (condition.type === 'outcomeTier') outcome = 'none';
  return {
    id: String(trigger.id || foundry.utils.randomID()),
    condition,
    outcome,
    breakTools: isLegacyBreakOnly ? true : trigger.breakTools === true,
    tierStep: normalizeTierStep(trigger.tierStep),
  };
}

/** Normalize a trigger's `tierStep` effect (issue 975), flat rather than a discriminated union
 * so switching mode never destroys the other mode's operand. `steps` is the step MAGNITUDE,
 * clamped to an integer `>= 1`, and `tierId` is preserved VERBATIM even when it names no tier. */
export function normalizeTierStep(input = {}) {
  const source = !input || typeof input !== 'object' ? {} : input;
  const steps = Number(source.steps);
  const tierId = typeof source.tierId === 'string' ? source.tierId.trim() : '';
  return {
    mode: ['none', 'target', 'up', 'down'].includes(source.mode) ? source.mode : 'none',
    steps: Number.isFinite(steps) ? Math.max(1, Math.trunc(steps)) : 1,
    tierId: tierId || null,
  };
}

/** @private */
function normalizeCheckBreakageCondition(condition) {
  if (!condition || typeof condition !== 'object') return null;
  const OPERATORS = new Set(['==', '<=', '>=', '<', '>']);
  const type = condition.type;
  if (type === 'rollTotal' || type === 'progressiveValue') {
    if (!OPERATORS.has(condition.operator)) return null;
    const value = Number(condition.value);
    if (!Number.isFinite(value)) return null;
    return { type, operator: condition.operator, value };
  }
  if (type === 'outcomeTier') {
    const tierIds = Array.isArray(condition.tierIds)
      ? condition.tierIds.map(String).filter(Boolean)
      : [];
    const outcomeKeys = Array.isArray(condition.outcomeKeys)
      ? condition.outcomeKeys.map((key) => String(key).trim().toLowerCase()).filter(Boolean)
      : [];
    if (tierIds.length === 0 && outcomeKeys.length === 0) return null;
    return { type, tierIds, outcomeKeys };
  }
  if (type === 'diceGroup') {
    const AGGREGATES = new Set(['total', 'anyDie', 'allDice', 'lowestDie', 'highestDie']);
    if (!AGGREGATES.has(condition.aggregate)) return null;
    if (!OPERATORS.has(condition.operator)) return null;
    const groupId = Number(condition.groupId);
    const value = Number(condition.value);
    if (!Number.isInteger(groupId) || groupId < 0) return null;
    if (!Number.isFinite(value)) return null;
    return {
      type,
      groupId,
      aggregate: condition.aggregate,
      operator: condition.operator,
      value,
    };
  }
  return null;
}

export function normalizeSalvageCraftingCheck(check = {}, validCatalogueIds = null) {
  const normalizedCheck = !check || typeof check !== 'object' ? {} : check;
  const outcomes = Array.isArray(normalizedCheck.outcomes) ? normalizedCheck.outcomes : [];
  const normalizedOutcomes = outcomes
    .map((o) =>
      String(o || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  return {
    enabled: normalizedCheck.enabled === true,
    consumption: {
      consumeComponentOnFail: normalizedCheck.consumption?.consumeComponentOnFail !== false,
      // Canonical key is `breakToolsOnFail` (1.7.0 rename); read new-then-legacy so
      // pre-migration salvage configs still load.
      breakToolsOnFail:
        (normalizedCheck.consumption?.breakToolsOnFail ??
          normalizedCheck.consumption?.consumeCatalystsOnFail) === true,
    },
    // The ORTHOGONAL produce/do-not-produce axis (issue 1098), a NEW CAPABILITY on salvage
    // rather than a gate on an existing one. See `_normalizeSalvage` for the reserved
    // `role: 'failure'` group it makes live, which the engine selects BY ROLE.
    failureResultPolicy: normalizeFailureResultPolicy(normalizedCheck.failureResultPolicy),
    // Salvage reuses the crafting check sub-object shapes so the Checks-tab editors are shared.
    // The default DC is the sub-object's `dc`; a per-component override lives on
    // `component.salvage.dcOverride`.
    simple: normalizeSimpleCraftingCheck(normalizedCheck.simple),
    routed: normalizeRoutedCraftingCheck(normalizedCheck.routed),
    progressive: normalizeProgressiveCraftingCheck(normalizedCheck.progressive),
    outcomes: normalizedOutcomes.length > 0 ? [...new Set(normalizedOutcomes)] : ['fail', 'pass'],
    // Salvage's OWN selection over the system catalogue (issue 1095). New here: before
    // this change salvage had no modifier seam at all and the engine passed no context.
    // Shares one derivation with crafting and gathering, so the three cannot drift.
    ...normalizeCheckModifierSelection(normalizedCheck, validCatalogueIds),
  };
}

// System-level gathering check (gathering resolution modes d100/progressive/
// routed). d100 needs no editable config (the fixed d100 roll), so only the
// progressive and routed sub-objects are authored, reusing the crafting shapes.
// A per-task DC override lives on the gathering task (`task.dcOverride`).
export function normalizeGatheringCraftingCheck(check = {}, validCatalogueIds = null) {
  const source = !check || typeof check !== 'object' ? {} : check;
  return {
    enabled: source.enabled === true,
    // The ORTHOGONAL produce/do-not-produce axis (issue 1098). Gathering has no consumption
    // block, so this is its ONLY failure axis — and the path it governs ships DORMANT pending
    // issue 683, with the shape landing now so the capability is complete when 683 flips it.
    failureResultPolicy: normalizeFailureResultPolicy(source.failureResultPolicy),
    progressive: normalizeProgressiveCraftingCheck(source.progressive),
    routed: normalizeRoutedCraftingCheck(source.routed),
    // Gathering's OWN selection over the system catalogue (issue 1095), applying to the
    // FORMULA-ROLLED modes only: `d100` rolls no authored formula. The selection is persisted
    // regardless of the current mode so switching never destroys it.
    ...normalizeCheckModifierSelection(source, validCatalogueIds),
  };
}
