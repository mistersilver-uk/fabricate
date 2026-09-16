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
 *     immaterial because the stored value is the DC rather than the tier id.
 *  5. Tiers hang off `salvageCraftingCheck.simple.tiers` in EVERY resolution mode, routed included.
 */

export const SALVAGE_DC_SYSTEM_DEFAULT = 'system';
export const SALVAGE_DC_CUSTOM = 'custom';

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
 * The option list in render order: system default, each usable tier, then Custom…. Labels are
 * injected pre-localized by the caller, keeping this a pure leaf with no `localize` import.
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

  // Case 2: with no usable tiers this contributes nothing, which is why "Manage presets" exists.
  for (const tier of usableSalvageDcTiers(tiers)) {
    const dc = Math.trunc(Number(tier.dc));
    options.push({ value: `dc:${dc}`, label: tierLabel(String(tier.name).trim(), dc) });
  }

  options.push({ value: SALVAGE_DC_CUSTOM, label: customLabel() });
  return options;
}

/**
 * The `dcOverride` a chosen option persists: `null` for the system default, a tier's DC rather than
 * its id, and Custom… keeps the current value so switching to it never rewrites an off-tier override.
 */
export function salvageDcOverrideForSelection(selection, currentDcOverride) {
  if (selection === SALVAGE_DC_SYSTEM_DEFAULT) return null;
  if (selection === SALVAGE_DC_CUSTOM) {
    // Guard null/''/undefined EXPLICITLY: `Number(null)` is 0, which would turn "switch to Custom…
    // from the system default" into a spurious DC-0 override.
    if ([null, undefined, ''].includes(currentDcOverride)) return null;
    const numeric = Number(currentDcOverride);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  }
  const numeric = Number(String(selection).replace(/^dc:/, ''));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}
