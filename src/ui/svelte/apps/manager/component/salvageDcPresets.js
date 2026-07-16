/**
 * The per-component salvage DC control's option model (issue 676, decision 7).
 *
 * A pure module — the house pattern set by `recipe/recipeReadiness.js` — so the five
 * cases below are unit-testable without mounting anything.
 *
 * Decision 7: the presets are the SYSTEM'S OWN AUTHORED salvage check tiers, never a
 * hard-coded `Standard 12 / Difficult 15 / Hard 17 / Very Hard 19` list, which would
 * misreport the world's real DCs. Storage is unchanged: `null` = system default, else
 * an integer.
 *
 * The five cases that must not be left to chance:
 *
 *  1. `dcMode === 'dynamic'` — the DC is macro-computed, so there is no number to put
 *     in the system-default label. Render it WITHOUT a DC suffix; presets and Custom…
 *     stay available.
 *  2. Zero authored tiers — the COMMON case (`tiers` defaults to `[]`). A preset
 *     control with no presets: System default + Custom… only, plus the "Manage
 *     presets" link, which is exactly why decision 7 kept that link.
 *  3. `_normalizeSimpleTier` permits `name: ''` and coerces a non-finite `dc` to `0`,
 *     which would render an unlabelled "— DC 0" option. Such tiers are not authored
 *     presets: skip them.
 *  4. Duplicate-DC tiers make "match by DC" ambiguous. Match the FIRST tier whose dc
 *     equals the override; the ambiguity is immaterial because the stored value is the
 *     DC, not the tier id.
 *  5. Tiers hang off `salvageCraftingCheck.simple.tiers` in EVERY resolution mode,
 *     routed included. There is no `.routed.tiers` sibling for DC presets.
 */

export const SALVAGE_DC_SYSTEM_DEFAULT = 'system';
export const SALVAGE_DC_CUSTOM = 'custom';

/**
 * Case 3: an authored preset needs a name AND a usable DC. `_normalizeSimpleTier`
 * lets both degrade silently, so filter here rather than rendering "— DC 0".
 */
export function usableSalvageDcTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers.filter((tier) => {
    const name = String(tier?.name ?? '').trim();
    const dc = Number(tier?.dc);
    return Boolean(name) && Number.isFinite(dc) && dc > 0;
  });
}

/**
 * Which option the persisted `dcOverride` selects.
 *
 * On load, an override matching no tier MUST select Custom… and display its value
 * verbatim — never snap to the nearest tier, and never re-save on mere render.
 *
 * The persisted field is only ever `number|null` (`setSalvageDcOverride` folds a cleared
 * input to `null` before it lands, and `_normalizeSalvage` coerces to int-or-null). The
 * empty string is accepted anyway because this is an exported pure helper over a value
 * that originates in a DOM number input, where `''` is the cleared reading — the guard
 * is input validation, not a live branch, and `resolveSalvageDcSelection('') === SYSTEM_DEFAULT`
 * is pinned by test. Declaring the narrower persisted type here made the `=== ''` check
 * provably-false to static analysis (sonar `javascript:S3403`) rather than merely unreachable.
 *
 * @param {number|string|null|undefined} dcOverride
 * @param {Array<{name: string, dc: number}>} tiers
 * @returns {string} `SALVAGE_DC_SYSTEM_DEFAULT`, `dc:<n>`, or `SALVAGE_DC_CUSTOM`
 */
export function resolveSalvageDcSelection(dcOverride, tiers) {
  if (dcOverride === null || dcOverride === undefined || dcOverride === '') {
    return SALVAGE_DC_SYSTEM_DEFAULT;
  }
  const numeric = Number(dcOverride);
  if (!Number.isFinite(numeric)) return SALVAGE_DC_CUSTOM;
  // Case 4: FIRST match wins.
  const match = usableSalvageDcTiers(tiers).find((tier) => Number(tier.dc) === numeric);
  return match ? `dc:${Math.trunc(numeric)}` : SALVAGE_DC_CUSTOM;
}

/**
 * The option list, in render order: system default, each usable tier, then Custom….
 *
 * Labels are injected pre-localized by the caller (the `.svelte` owns the i18n keys),
 * keeping this module a pure leaf with no `localize` import.
 *
 * @param {object} params
 * @param {Array<{name: string, dc: number}>} params.tiers  `salvageCraftingCheck.simple.tiers` (case 5)
 * @param {string} params.dcMode  `'static' | 'dynamic'` (case 1)
 * @param {number} params.systemDc
 * @param {(dc: number) => string} params.systemDefaultLabel
 * @param {() => string} params.systemDefaultDynamicLabel
 * @param {(name: string, dc: number) => string} params.tierLabel
 * @param {() => string} params.customLabel
 * @returns {{ value: string, label: string }[]}
 */
export function buildSalvageDcOptions({
  tiers = [],
  dcMode = 'static',
  systemDc = 0,
  systemDefaultLabel = (dc) => `System default — DC ${dc}`,
  systemDefaultDynamicLabel = () => 'System default — set by macro',
  tierLabel = (name, dc) => `${name} — DC ${dc}`,
  customLabel = () => 'Custom…',
} = {}) {
  const options = [
    {
      value: SALVAGE_DC_SYSTEM_DEFAULT,
      // Case 1: no static number exists in dynamic mode, so no DC suffix.
      label: dcMode === 'dynamic' ? systemDefaultDynamicLabel() : systemDefaultLabel(systemDc),
    },
  ];

  // Case 2: with no usable tiers this loop contributes nothing and the control
  // degrades to System default + Custom… — which is why "Manage presets" exists.
  for (const tier of usableSalvageDcTiers(tiers)) {
    const dc = Math.trunc(Number(tier.dc));
    options.push({ value: `dc:${dc}`, label: tierLabel(String(tier.name).trim(), dc) });
  }

  options.push({ value: SALVAGE_DC_CUSTOM, label: customLabel() });
  return options;
}

/**
 * The `dcOverride` a chosen option persists. System default stores `null`; a tier
 * stores its DC (not its id); Custom… keeps the current value so switching TO Custom…
 * never silently rewrites an off-tier override.
 *
 * @returns {number|null}
 */
export function salvageDcOverrideForSelection(selection, currentDcOverride) {
  if (selection === SALVAGE_DC_SYSTEM_DEFAULT) return null;
  if (selection === SALVAGE_DC_CUSTOM) {
    // Guard null/''/undefined EXPLICITLY: `Number(null)` is 0, which would turn
    // "switch to Custom… from the system default" into a spurious DC-0 override —
    // the same trap `_normalizeSalvage`'s own dcOverride guard calls out.
    if ([null, undefined, ''].includes(currentDcOverride)) return null;
    const numeric = Number(currentDcOverride);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  }
  const numeric = Number(String(selection).replace(/^dc:/, ''));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}
