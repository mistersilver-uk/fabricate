/**
 * The Journal detail's pure display helpers: item and tier naming, quantity and roll wording,
 * the recovery effect phases, and the personalised gathering-chance overlay.
 *
 * Extracted from `RunDetail.svelte` so the component keeps its reactive state and markup and
 * nothing else; `localize` is injected so this module stays UI-free.
 */
import { formatNet, formatSignedStep } from '../../../../utils/checkAdjustmentFormat.js';

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

/** A roll graded against an executed target: `… · target {target} · margin {margin}`, or `''`. */
export function formatGradedRoll({ formula, total, value, target, margin }, localize) {
  if (!Number.isFinite(target) || !Number.isFinite(margin)) return '';
  const graded = { target, margin: formatSignedStep(margin) };
  if (formula !== '' && Number.isFinite(total)) {
    return localize('FABRICATE.App.Journal.StepDetails.RollResultWithTarget', {
      formula,
      total,
      ...graded,
    });
  }
  return Number.isFinite(value)
    ? localize('FABRICATE.App.Journal.StepDetails.RollResultValueWithTarget', { value, ...graded })
    : '';
}

/**
 * A count roll's line (issue 2006): `{net} successes, {required} needed`, its net alone where no
 * required count was recorded, a botch's net with no required count (issue 2133), or the
 * zero-pool sentence for a pool that rolled nothing.
 */
export function formatCountRoll({ net, required, zeroPool }, localize) {
  if (zeroPool) return localize('FABRICATE.Check.CountEvidence.ZeroPoolResult');
  if (!Number.isFinite(net)) return '';
  const text = formatNet(net);
  if (net < 0) {
    return localize('FABRICATE.App.Journal.StepDetails.Count.RollResultBotch', { net: text });
  }
  if (Number.isFinite(required) && required > 0) {
    return net === 1
      ? localize('FABRICATE.App.Journal.StepDetails.Count.RollResultOne', { required })
      : localize('FABRICATE.App.Journal.StepDetails.Count.RollResult', { net: text, required });
  }
  return net === 1
    ? localize('FABRICATE.App.Journal.StepDetails.Count.RollResultNetOne')
    : localize('FABRICATE.App.Journal.StepDetails.Count.RollResultNet', { net: text });
}

/**
 * The recorded roll, preferring the resolved formula and total over a bare value. Outside
 * sum/over/fixed it names the executed target and margin, never a DC (issue 2005), and a count
 * its net successes.
 */
export function formatRoll(check, localize) {
  if (check?.count) return formatCountRoll(check.count, localize);
  const formula = String(check?.formula ?? '');
  const total = numberOrNaN(check?.total);
  const value = numberOrNaN(check?.value);
  const dc = numberOrNaN(check?.dc);
  const target = numberOrNaN(check?.target);
  const margin = numberOrNaN(check?.margin);
  const graded = formatGradedRoll({ formula, total, value, target, margin }, localize);
  if (graded) return graded;
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
