/**
 * The Journal detail's pure display helpers: item and tier naming, quantity and roll wording,
 * the recovery effect phases, and the personalised gathering-chance overlay.
 *
 * Extracted from `RunDetail.svelte` so the component keeps its reactive state and markup and
 * nothing else; `localize` is injected so this module stays UI-free.
 */

/** `NaN` for an absent value, so `Number.isFinite` alone decides whether it was recorded. */
export function numberOrNaN(raw) {
  return raw == null ? NaN : Number(raw);
}

export function quantityText(quantity, localize) {
  return quantity != null && Number.isFinite(Number(quantity))
    ? localize('FABRICATE.App.Journal.Quantity', { n: quantity })
    : localize('FABRICATE.App.Journal.History.NotRecorded');
}

export function previewName(item, localize) {
  return typeof item?.name === 'string' && item.name.trim()
    ? item.name
    : localize('FABRICATE.App.Journal.History.UnknownMaterial');
}

export function previewTiers(tiers, localize) {
  return (Array.isArray(tiers) ? tiers : []).map((tier) => ({
    ...tier,
    yields: (tier.yields ?? []).map((item) => ({
      ...item,
      name: previewName(item, localize),
      quantity: item.quantity ?? localize('FABRICATE.App.Journal.History.NotRecorded'),
    })),
  }));
}

/** A drop's own final chance as a percentage, or `null` when the breakdown recorded none. */
function personalizedChance(drop) {
  const raw = Number(drop?.finalDropRate ?? drop?.finalChance);
  if (!Number.isFinite(raw)) return null;
  return Math.min(100, Math.max(0, raw <= 1 ? raw * 100 : raw));
}

export function applyPersonalizedDrops(entries, breakdown) {
  const byId = new Map(
    (Array.isArray(breakdown?.drops) ? breakdown.drops : []).map((drop) => [
      String(drop?.id ?? ''),
      drop,
    ])
  );
  return entries.map((entry) => {
    const chance = personalizedChance(byId.get(String(entry?.id ?? '')));
    return chance == null ? entry : { ...entry, chance };
  });
}

/** The recorded roll, preferring the resolved formula and total over a bare value. */
export function formatRoll(check, localize) {
  const formula = String(check?.formula ?? '');
  const total = numberOrNaN(check?.total);
  const value = numberOrNaN(check?.value);
  const dc = numberOrNaN(check?.dc);
  if (formula !== '' && Number.isFinite(total)) {
    return Number.isFinite(dc)
      ? localize('FABRICATE.App.Journal.StepDetails.RollResultWithDc', { formula, total, dc })
      : localize('FABRICATE.App.Journal.StepDetails.RollResult', { formula, total });
  }
  if (Number.isFinite(value)) {
    return Number.isFinite(dc)
      ? localize('FABRICATE.App.Journal.StepDetails.RollResultValueWithDc', { value, dc })
      : localize('FABRICATE.App.Journal.StepDetails.RollResultValue', { value });
  }
  return '';
}

export function effectPhaseText(phase, localize) {
  return localize(
    {
      applied: 'FABRICATE.App.Journal.Notice.EffectPhase.applied',
      applying: 'FABRICATE.App.Journal.Notice.EffectPhase.applying',
      planned: 'FABRICATE.App.Journal.Notice.EffectPhase.planned',
      unknown: 'FABRICATE.App.Journal.Notice.EffectPhase.unknown',
      notApplicable: 'FABRICATE.App.Journal.History.NotApplicable',
    }[phase]
  );
}
