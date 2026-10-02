/**
 * The component editor's three converted select vocabularies, in the shared `<Select>`'s option
 * shape (issue 1510). Every label is carried verbatim from the `<option>` text it replaced, and
 * each list keeps its leading row — the inherit offer, the Unrouted sentinel, the system default —
 * first. It lives beside the view rather than in it because the view is far past its size ledger's
 * ceiling. Localized copy arrives through an injected `text`, so this stays a pure leaf.
 */

import { formatCheckAdjustment } from '../checks/checkAdjustmentLabel.js';

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

/** `System default — {n} successes needed`, singular at one. */
function successesDefaultLabel(count, text) {
  if (count === 1) {
    return text(
      'FABRICATE.Admin.Manager.Checks.Count.Overrides.SystemDefaultOne',
      'System default — 1 success needed'
    );
  }
  return text(
    'FABRICATE.Admin.Manager.Checks.Count.Overrides.SystemDefault',
    'System default — {count} successes needed'
  ).replace('{count}', String(count));
}

/** `{name} — {n} successes needed`, singular at one. */
function successesTierLabel(name, count, text) {
  const copy =
    count === 1
      ? text(
          'FABRICATE.Admin.Manager.Checks.Count.Overrides.PresetOne',
          '{name} — 1 success needed'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Count.Overrides.Preset',
          '{name} — {count} successes needed'
        );
  return copy.replace('{name}', name).replace('{count}', String(count));
}

/**
 * System default, each usable tier, then Custom… — `buildSalvageDcOptions` with this screen's label
 * keys bound to it, which is why the binding has a home here rather than in that pure leaf. A
 * roll-under fixed target names a Target, a character-value target names adjustments, and a count
 * check names successes needed.
 */
export function buildSalvageDcSelectOptions(tiers, systemDc, text, evaluation = null) {
  const under = evaluation?.direction === 'under';
  const kind = evaluation?.target?.adjustmentKind === 'multiply' ? 'multiply' : 'add';
  return buildSalvageDcOptions({
    tiers,
    systemDc,
    evaluation,
    systemDefaultLabel: (dc) =>
      (under
        ? text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefaultTarget',
            'System default — Target {dc}'
          )
        : text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefault',
            'System default — DC {dc}'
          )
      ).replace('{dc}', String(dc)),
    tierLabel: (name, dc) =>
      (under
        ? text(
            'FABRICATE.Admin.Manager.Component.SalvageEditor.DcTierTarget',
            '{name} — Target {dc}'
          )
        : text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcTier', '{name} — DC {dc}')
      )
        .replace('{name}', name)
        .replace('{dc}', String(dc)),
    adjustmentDefaultLabel: () =>
      text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.AdjustmentSystemDefault',
        'System default — base adjustment'
      ),
    adjustmentTierLabel: (name, value) =>
      text(
        'FABRICATE.Admin.Manager.Component.SalvageEditor.AdjustmentTier',
        '{name} — {adjustment}'
      )
        .replace('{name}', name)
        .replace('{adjustment}', formatCheckAdjustment(kind, value)),
    successesDefaultLabel: (count) => successesDefaultLabel(count, text),
    successesTierLabel: (name, count) => successesTierLabel(name, count, text),
    customLabel: () => text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustom', 'Custom…'),
  });
}
