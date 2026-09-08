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

  All of that arithmetic is decided builder-side; this component only reads it.

  Once the roll resolves, the tier it MATCHED is marked "Your roll" — read from the run
  record's `checkResult.data.outcomeId`, the engine's own record of which tier it routed
  through, so the marker cannot disagree with the award. Before a roll — and on a
  runless salvage, which records nothing — no tier is marked.
-->
<script>
  import Medallion from '../../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../../util/craftingArtResolution.js';
  import { localize } from '../../../../util/foundryBridge.js';
  import Chip from '../../../../components/Chip.svelte';
  import EmptyState from '../../../manager/EmptyState.svelte';
  import Kicker from '../../../../components/Kicker.svelte';

  let { salvage = null, result = null } = $props();

  const routedType = $derived(salvage?.routedType === 'fixed' ? 'fixed' : 'relative');
  const outcomes = $derived(Array.isArray(salvage?.routedOutcomes) ? salvage.routedOutcomes : []);
  const dc = $derived(Number.isFinite(salvage?.dc) ? salvage.dc : null);
  const rolledOutcomeId = $derived(
    result?.state === 'success' ? (result?.outcomeId ?? null) : null
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
    {#if dc !== null}
      <span class="salvage-dc" data-inventory-salvage-dc={String(dc)}>
        {localize('FABRICATE.App.Inventory.Salvage.Dc', { dc })}
      </span>
    {/if}
  </p>

  {#if outcomes.length === 0}
    <EmptyState note hint={localize('FABRICATE.App.Inventory.Salvage.NoOutcomes')} />
  {:else}
    <ul class="salvage-outcome-list" data-inventory-salvage-outcomes>
      {#each outcomes as outcome, index (outcome.id ?? index)}
        {@const rolled = rolledOutcomeId !== null && outcome.id === rolledOutcomeId}
        <li
          class="salvage-outcome"
          class:is-success={outcome.success}
          class:is-rolled={rolled}
          data-inventory-salvage-outcome={outcome.id ?? String(index)}
          data-outcome-success={outcome.success}
          data-outcome-rolled={rolled ? 'true' : undefined}
        >
          <div class="salvage-outcome-head">
            <span class="salvage-outcome-name">{outcome.name}</span>
            {#if rolled}
              <span class="salvage-outcome-rolled" data-inventory-outcome-your-roll>
                <Chip tone="accent" icon="fas fa-circle"
                  >{localize('FABRICATE.App.Inventory.Salvage.YourRoll')}</Chip
                >
              </span>
            {/if}
            {#if routedType === 'fixed'}
              {#if outcome.start !== null && outcome.end !== null}
                <span
                  class="salvage-outcome-threshold"
                  data-inventory-outcome-range={`${outcome.start}-${outcome.end}`}
                >
                  {outcome.start}–{outcome.end}
                </span>
              {/if}
            {:else if outcome.threshold !== null}
              <span
                class="salvage-outcome-threshold"
                data-inventory-outcome-threshold={String(outcome.threshold)}
              >
                {localize('FABRICATE.App.Inventory.Salvage.ReachedAt', {
                  threshold: outcome.threshold,
                })}
              </span>
            {/if}
          </div>
          {#if outcome.results.length > 0}
            <ul class="salvage-outcome-results">
              {#each outcome.results as entry, resultIndex (entry.id ?? entry.componentId ?? resultIndex)}
                <li
                  class="salvage-outcome-result"
                  data-inventory-salvage-result={entry.componentId}
                >
                  <!-- The shared tile through `resolveCraftingArt`, not a raw <img>: missing
                       art gets the house fallback rather than a broken-image glyph. -->
                  <Medallion {...resolveCraftingArt(entry.img ?? '')} alt="" size={14} />
                  <span class="salvage-outcome-result-name">{entry.name}</span>
                  <span class="salvage-outcome-result-qty">×{entry.quantity}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <EmptyState
              note
              hint={localize('FABRICATE.App.Inventory.Salvage.OutcomeAwardsNothing')}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .salvage-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* THE ROW ONLY (issue 1514). The eyebrow itself is the shared `Kicker` now, which declares
     every type property this rule used to — the size, the weight, the tracking, the transform
     and the ink — so what is left here is what was genuinely the CALLER's: the flex row that
     places the label beside its trailing figure, and the `line-height` that sets THAT figure's
     leading. The kicker declares its own 1.3 and is unaffected by the inherited value. */
  .salvage-body-title {
    display: flex;
    align-items: center;
    gap: 6px;
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
    font-weight: 700;
    letter-spacing: 0;
    color: var(--fab-text-secondary);
  }

  .salvage-outcome-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
  }

  .salvage-outcome {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .salvage-outcome.is-success {
    border-color: var(--fab-success-border);
  }

  /* The tier the roll actually matched. Two signals, never colour alone: the accent
     ramp AND the "Your roll" tag. */
  .salvage-outcome.is-rolled {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  /* A positioning wrapper only — the shared `Chip` inside owns the ramp and type. */
  .salvage-outcome-rolled {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .salvage-outcome-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* Takes the slack so the "Your roll" tag and the threshold stay pinned right, and a
     long authored tier name truncates rather than pushing them out of the tile. */
  .salvage-outcome-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .salvage-outcome-threshold {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-size: 8.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
    color: var(--fab-text-secondary);
    white-space: nowrap;
  }

  .salvage-outcome-results {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
  }

  .salvage-outcome-result {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    font-size: 11px;
  }

  .salvage-outcome-result-name {
    font-weight: 600;
  }

  .salvage-outcome-result-qty {
    font-family: var(--fab-font-mono);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-secondary);
  }
</style>
