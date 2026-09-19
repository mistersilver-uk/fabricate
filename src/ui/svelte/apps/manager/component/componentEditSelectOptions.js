/**
 * The component editor's three converted select vocabularies, in the shared `<Select>`'s option
 * shape (issue 1510). Every label is carried verbatim from the `<option>` text it replaced, and
 * each list keeps its leading row — the inherit offer, the Unrouted sentinel, the system default —
 * first. It lives beside the view rather than in it because the view is far past its size ledger's
 * ceiling. Localized copy arrives through an injected `text`, so this stays a pure leaf.
 */

import { buildSalvageDcOptions } from './salvageDcPresets.js';

/** The inherit row, where `inheritValue` is non-empty, then one row per effective category. */
export function buildComponentCategoryOptions(inheritValue, inheritLabel, categories, labelFor) {
  return [
    ...(inheritValue ? [{ value: inheritValue, label: inheritLabel }] : []),
    ...categories.map((category) => ({ value: category, label: labelFor(category) })),
  ];
}

/** The Unrouted sentinel, then one row per result group under its own numbered fallback. */
export function buildSalvageRouteOptions(resultGroups, unroutedLabel, groupFallback) {
  return [
    { value: '', label: unroutedLabel },
    ...resultGroups.map((group, index) => ({
      value: group.id,
      label: group.name || groupFallback(index + 1),
    })),
  ];
}

/**
 * System default, each usable tier, then Custom… — `buildSalvageDcOptions` with this screen's four
 * label keys bound to it, which is why the binding has a home here rather than in that pure leaf.
 */
export function buildSalvageDcSelectOptions(tiers, dcMode, systemDc, text) {
  return buildSalvageDcOptions({
    tiers,
    dcMode,
    systemDc,
    systemDefaultLabel: (dc) =>
      text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefault',
        'System default — DC {dc}'
      ).replace('{dc}', String(dc)),
    systemDefaultDynamicLabel: () =>
      text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefaultDynamic',
        'System default — set by macro'
      ),
    tierLabel: (name, dc) =>
      text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcTier', '{name} — DC {dc}')
        .replace('{name}', name)
        .replace('{dc}', String(dc)),
    customLabel: () => text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustom', 'Custom…'),
  });
}
