/**
 * The per-component salvage DC control's option model, a pure module so its five cases are
 * unit-testable without mounting. The presets are the SYSTEM'S OWN AUTHORED salvage check tiers,
 * never a hard-coded list, which would misreport the world's real DCs; storage is `null` for the
 * system default, else an integer. The five cases, each referenced by number below:
 *
 *  1. `dcMode === 'dynamic'` — the DC is macro-computed, so the system-default label carries no DC
 *     suffix, while presets and Custom… stay available.
 *  2. Zero authored tiers, the COMMON case: System default + Custom… only, plus "Manage presets".
 *  3. `_normalizeSimpleTier` permits `name: ''` and coerces a non-finite `dc` to `0`, which would
 *     render an unlabelled "— DC 0". Such tiers are not authored presets, so they are skipped.
 *  4. Duplicate-DC tiers make "match by DC" ambiguous; the FIRST match wins, and the ambiguity is
 *     immaterial because the stored value is the DC rather than the tier id. The option list
 *     keeps only that first tier, so every option value is unique.
 *  5. Tiers hang off `salvageCraftingCheck.simple.tiers` in EVERY resolution mode, routed included.
 *
 * Under a character-value target the same tiers supply ADJUSTMENTS instead: the control edits
 * `adjustmentOverride`, lists only named tiers whose adjustment is valid for the kind, and matches
 * by adjustment (`adj:<n>`). Every function below takes that `evaluation` and defaults to fixed.
 */

import { isValidTargetAdjustment } from '../../../../../systems/checkTarget.js';
import { numberOrNull } from '../../../../../utils/scalars.js';

export const SALVAGE_DC_SYSTEM_DEFAULT = 'system';
export const SALVAGE_DC_CUSTOM = 'custom';

const EPSILON = 1e-9;

/** Whether `evaluation` grades against a character value, which the adjustment override adjusts. */
function readsAdjustment(evaluation) {
  return evaluation?.target?.source === 'attribute';
}

function adjustmentKind(evaluation) {
  return evaluation?.target?.adjustmentKind === 'multiply' ? 'multiply' : 'add';
}

/** The override field the active target reads: `adjustmentOverride` or `dcOverride`. */
export function salvageOverrideField(evaluation) {
  return readsAdjustment(evaluation) ? 'adjustmentOverride' : 'dcOverride';
}

/** An added adjustment is any finite number; a multiplier must also be above zero. */
function usableAdjustment(kind, value) {
  const number = numberOrNull(value);
  return number !== null && isValidTargetAdjustment(kind, number);
}

/** Case 4: the first option per value, as {@link resolveSalvageDcSelection} matches the first. */
function firstPerValue(options) {
  const seen = new Set();
  return options.filter(({ value }) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/** Named tiers whose `adjustment` is valid for `kind`; the attribute counterpart of case 3. */
export function usableSalvageAdjustmentTiers(tiers, kind = 'add') {
  if (!Array.isArray(tiers)) return [];
  return tiers.filter(
    (tier) => Boolean(String(tier?.name ?? '').trim()) && usableAdjustment(kind, tier?.adjustment)
  );
}

/** Case 5: the preset tiers of a `salvageCraftingCheck`, which are `simple.tiers` in every mode. */
export function salvagePresetTiers(salvageCheck) {
  const tiers = salvageCheck?.simple?.tiers;
  return Array.isArray(tiers) ? tiers : [];
}

/** Case 3: an authored preset needs a name AND a usable DC; `_normalizeSimpleTier` lets both lapse. */
export function usableSalvageDcTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers.filter((tier) => {
    const name = String(tier?.name ?? '').trim();
    const dc = Number(tier?.dc);
    return Boolean(name) && Number.isFinite(dc) && dc > 0;
  });
}

/**
 * Which option the persisted `dcOverride` selects: `SALVAGE_DC_SYSTEM_DEFAULT`, `dc:<n>` or
 * `SALVAGE_DC_CUSTOM`. An override matching no tier MUST select Custom… and show its value
 * verbatim — never snapping to the nearest tier, and never re-saving on mere render.
 *
 * The persisted field is only ever `number|null`, but the empty string is accepted anyway because
 * this is an exported pure helper over a value originating in a DOM number input, where `''` is the
 * cleared reading. The parameter is typed wide deliberately: the narrow type made the `=== ''`
 * check provably-false to static analysis (sonar `javascript:S3403`) rather than merely unreachable.
 */
export function resolveSalvageDcSelection(dcOverride, tiers, evaluation = null) {
  if (dcOverride === null || dcOverride === undefined || dcOverride === '') {
    return SALVAGE_DC_SYSTEM_DEFAULT;
  }
  const numeric = Number(dcOverride);
  if (!Number.isFinite(numeric)) return SALVAGE_DC_CUSTOM;
  if (readsAdjustment(evaluation)) {
    const tier = usableSalvageAdjustmentTiers(tiers, adjustmentKind(evaluation)).find(
      (entry) => Math.abs(Number(entry.adjustment) - numeric) < EPSILON
    );
    return tier ? `adj:${Number(tier.adjustment)}` : SALVAGE_DC_CUSTOM;
  }
  // Case 4: FIRST match wins.
  const match = usableSalvageDcTiers(tiers).find((tier) => Number(tier.dc) === numeric);
  return match ? `dc:${Math.trunc(numeric)}` : SALVAGE_DC_CUSTOM;
}

/**
 * The option list in render order: system default, each usable tier, then Custom…. Labels are
 * injected pre-localized by the caller, keeping this a pure leaf with no `localize` import. Under
 * a character-value `evaluation`, `adjustmentDefaultLabel` and `adjustmentTierLabel(name, value)`
 * label the adjustment presets instead.
 */
export function buildSalvageDcOptions({
  tiers = [],
  dcMode = 'static',
  systemDc = 0,
  evaluation = null,
  systemDefaultLabel = (dc) => `System default — DC ${dc}`,
  systemDefaultDynamicLabel = () => 'System default — set by macro',
  tierLabel = (name, dc) => `${name} — DC ${dc}`,
  adjustmentDefaultLabel = () => 'System default — base adjustment',
  adjustmentTierLabel = (name, value) => `${name} — ${value}`,
  customLabel = () => 'Custom…',
} = {}) {
  if (readsAdjustment(evaluation)) {
    return [
      { value: SALVAGE_DC_SYSTEM_DEFAULT, label: adjustmentDefaultLabel() },
      ...firstPerValue(
        usableSalvageAdjustmentTiers(tiers, adjustmentKind(evaluation)).map((tier) => ({
          value: `adj:${Number(tier.adjustment)}`,
          label: adjustmentTierLabel(String(tier.name).trim(), Number(tier.adjustment)),
        }))
      ),
      { value: SALVAGE_DC_CUSTOM, label: customLabel() },
    ];
  }
  const options = [
    {
      value: SALVAGE_DC_SYSTEM_DEFAULT,
      // Case 1: no static number exists in dynamic mode, so no DC suffix.
      label: dcMode === 'dynamic' ? systemDefaultDynamicLabel() : systemDefaultLabel(systemDc),
    },
  ];

  // Case 2: with no usable tiers this contributes nothing, which is why "Manage presets" exists.
  for (const tier of usableSalvageDcTiers(tiers)) {
    const dc = Math.trunc(Number(tier.dc));
    options.push({ value: `dc:${dc}`, label: tierLabel(String(tier.name).trim(), dc) });
  }

  options.push({ value: SALVAGE_DC_CUSTOM, label: customLabel() });
  return firstPerValue(options);
}

/**
 * The value a chosen option persists into the active field: `null` for the system default, a
 * tier's DC (or, under a character value, its exact adjustment) rather than its id, and Custom…
 * keeps the current value so switching to it never rewrites an off-tier override. A DC is an
 * integer; an adjustment is never truncated, because a multiplier such as ×0.7 is exact.
 */
export function salvageDcOverrideForSelection(selection, currentDcOverride, evaluation = null) {
  if (selection === SALVAGE_DC_SYSTEM_DEFAULT) return null;
  const exact = readsAdjustment(evaluation);
  const settle = (numeric) => {
    if (!Number.isFinite(numeric)) return null;
    return exact ? numeric : Math.trunc(numeric);
  };
  if (selection === SALVAGE_DC_CUSTOM) {
    // Guard null/''/undefined EXPLICITLY: `Number(null)` is 0, which would turn "switch to Custom…
    // from the system default" into a spurious DC-0 override.
    if ([null, undefined, ''].includes(currentDcOverride)) return null;
    return settle(Number(currentDcOverride));
  }
  return settle(Number(String(selection).replace(/^(?:dc|adj):/, '')));
}
