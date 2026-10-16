<!-- Svelte 5 runes mode -->
<!--
  SalvageRoutedBody renders `routed` salvage: one tile per AUTHORED outcome, each
  listing what that outcome awards (the tier's name keys `salvage.outcomeRouting` to
  a result group — exactly how the engine resolves it).

  The prototype's `<DC` / `DC-19` / `20+` thresholds are fiction: the tiers are
  GM-authored, and the two routed types are unrelated in `checkRoll.js` —

    RELATIVE  each outcome carries a DC DELTA; its effective threshold is
              `baseDc + delta`, so a per-component `dcOverride` shifts every row.
              Rendered as "Reached at >=N".
    FIXED     each outcome carries an absolute, non-overlapping [start, end] segment
              of the roll range and matches on `start <= total <= end`. It never
              reads a DC, so an override shifts NOTHING and there is no DC to show.
              Rendered as the presenter's `band` (issue 2152).

  All of that arithmetic is decided builder-side; this component only reads it.

  Once the roll resolves, the tier it MATCHED is marked "Your roll" — read from the run
  record's `checkResult.data.outcomeId`, the engine's own record of which tier it routed
  through, so the marker cannot disagree with the award. Before a roll — and on a
  runless salvage, which records nothing — no tier is marked. The tiers are the shared
  `OutcomeLadder` (issue 1644), each figure its bare band and each result a yield chip, and every
  `data-inventory-*` hook rides that ladder's per-item props.
-->
<script>
  import { resolveCraftingArt } from '../../../../util/craftingArtResolution.js';
  import { localize } from '../../../../util/foundryBridge.js';
  import EmptyState from '../../../../components/EmptyState.svelte';
  import Kicker from '../../../../components/Kicker.svelte';
  import OutcomeLadder from '../../../../components/OutcomeLadder.svelte';

  let { salvage = null, result = null } = $props();

  const routedType = $derived(salvage?.routedType === 'fixed' ? 'fixed' : 'relative');
  const outcomes = $derived(Array.isArray(salvage?.routedOutcomes) ? salvage.routedOutcomes : []);
  const dc = $derived(Number.isFinite(salvage?.dc) ? salvage.dc : null);
  // A relative roll-under or character-value check's base target, in place of a DC (issue 2005).
  const target = $derived(salvage?.target ?? null);
  const rolledOutcomeId = $derived(
    result?.state === 'success' ? (result?.outcomeId ?? null) : null
  );
  // A count's net below its Botch row's floor lands on that row, not on the tier it routes to.
  const botchRolled = $derived.by(() => {
    const below = outcomes.find((outcome) => outcome.id === 'count-botch')?.below;
    return (
      result?.state === 'success' &&
      Number.isFinite(below) &&
      Number.isFinite(result?.rollValue) &&
      result.rollValue < below
    );
  });
  const reachedId = $derived(botchRolled ? 'count-botch' : rolledOutcomeId);

  /** The tier's figure: the presenter's band, else a relative tier's `Reached at` threshold. */
  function figure(outcome) {
    if (outcome.band) {
      return { band: outcome.band, bandProps: { 'data-inventory-outcome-band': outcome.band } };
    }
    if (outcome.threshold === null || outcome.threshold === undefined) return {};
    return {
      band: localize('FABRICATE.App.Inventory.Salvage.ReachedAt', { threshold: outcome.threshold }),
      bandProps: { 'data-inventory-outcome-threshold': String(outcome.threshold) },
    };
  }

  const tiers = $derived(
    outcomes.map((outcome, index) => ({
      id: outcome.id ?? String(index),
      name: outcome.name,
      fail: !outcome.success,
      ...figure(outcome),
      props: {
        'data-inventory-salvage-outcome': outcome.id ?? String(index),
        'data-outcome-success': outcome.success,
      },
      reachedProps: { 'data-inventory-outcome-your-roll': '' },
      yields: outcome.results.map((entry, resultIndex) => ({
        id: entry.id ?? entry.componentId ?? resultIndex,
        name: entry.name,
        ...resolveCraftingArt(entry.img ?? ''),
        quantity: `×${entry.quantity}`,
        props: { 'data-inventory-salvage-result': entry.componentId },
      })),
    }))
  );
</script>

<div
  class="salvage-body"
  data-inventory-salvage-body="routed"
  data-inventory-routed-type={routedType}
>
  <p class="salvage-body-title">
    <Kicker as="span">{localize('FABRICATE.App.Inventory.Salvage.OutcomesTitle')}</Kicker>
    <!-- Present for RELATIVE only: a fixed check has no DC — checkRoll never reads one
         and the GM editor hides the field entirely for that pairing. -->
    {#if !target?.text && dc !== null}
      <span class="salvage-dc" data-inventory-salvage-dc={String(dc)}>
        {localize('FABRICATE.App.Inventory.Salvage.Dc', { dc })}
      </span>
    {/if}
  </p>
  <!-- A target or successes line is a sentence, not the kicker row's short "DC 15" figure. -->
  {#if target?.text}
    <p class="salvage-target-source" data-inventory-salvage-target={target.direction}>
      {target.text}
    </p>
  {/if}
  {#if target?.source}
    <p class="salvage-target-source" data-inventory-salvage-target-source>{target.source}</p>
  {:else if target?.unresolved}
    <p class="salvage-target-source" data-inventory-salvage-target-unresolved>
      {target.unresolved}
    </p>
  {/if}

  {#if outcomes.length === 0}
    <EmptyState note hint={localize('FABRICATE.App.Inventory.Salvage.NoOutcomes')} />
  {:else}
    <OutcomeLadder
      {tiers}
      emptyTierText={localize('FABRICATE.App.Inventory.Salvage.OutcomeAwardsNothing')}
      {reachedId}
      reachedLabel={localize('FABRICATE.App.Inventory.Salvage.YourRoll')}
      successLabel={localize('FABRICATE.Check.Evidence.Success')}
      failureLabel={localize('FABRICATE.Check.Evidence.Failure')}
      data-inventory-salvage-outcomes
    />
  {/if}
</div>

<style>
  .salvage-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* THE ROW ONLY (issue 1514). The eyebrow itself is the shared `Kicker` now, which declares
     every type property this rule used to — the size, the weight, the tracking, the transform
     and the ink — so what is left here is what was genuinely the CALLER's: the flex row that
     places the label beside its trailing figure, and the `line-height` that sets THAT figure's
     leading. The kicker declares its own 1.3 and is unaffected by the inherited value. */
  .salvage-target-source {
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .salvage-body-title {
    display: flex;
    align-items: center;
    gap: var(--fab-space-chip);
    margin: 0;
    line-height: 1;
  }

  /* `letter-spacing: 0` used to be a RESET of the 0.12em the eyebrow rule above set on the row;
     that tracking moved onto the `Kicker` with the rest of the label's type, so this reaches
     nothing now and is kept only because the mono figure is authored untracked either way. The
     string is "DC {dc}", already capital, so the eyebrow's `text-transform` never reached it. */
  .salvage-dc {
    font-family: var(--fab-font-mono);
    font-size: 8.5px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--fab-text-secondary);
  }
</style>
