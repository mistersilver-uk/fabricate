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
  import { localize } from '../../../../util/foundryBridge.js';

  let { salvage = null, result = null } = $props();

  const routedType = $derived(salvage?.routedType === 'fixed' ? 'fixed' : 'relative');
  const outcomes = $derived(Array.isArray(salvage?.routedOutcomes) ? salvage.routedOutcomes : []);
  const dc = $derived(Number.isFinite(salvage?.dc) ? salvage.dc : null);
  const rolledOutcomeId = $derived(result?.state === 'success' ? (result?.outcomeId ?? null) : null);
</script>

<div class="salvage-body" data-inventory-salvage-body="routed" data-inventory-routed-type={routedType}>
  <p class="salvage-body-title">
    {localize('FABRICATE.App.Inventory.Salvage.OutcomesTitle')}
    <!-- Present for RELATIVE only: a fixed check has no DC — checkRoll never reads one
         and the GM editor hides the field entirely for that pairing. -->
    {#if dc !== null}
      <span class="salvage-dc" data-inventory-salvage-dc={String(dc)}>
        {localize('FABRICATE.App.Inventory.Salvage.Dc', { dc })}
      </span>
    {/if}
  </p>

  {#if outcomes.length === 0}
    <p class="salvage-empty">{localize('FABRICATE.App.Inventory.Salvage.NoOutcomes')}</p>
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
                {localize('FABRICATE.App.Inventory.Salvage.YourRoll')}
              </span>
            {/if}
            {#if routedType === 'fixed'}
              {#if outcome.start !== null && outcome.end !== null}
                <span class="salvage-outcome-threshold" data-inventory-outcome-range={`${outcome.start}-${outcome.end}`}>
                  {outcome.start}–{outcome.end}
                </span>
              {/if}
            {:else if outcome.threshold !== null}
              <span class="salvage-outcome-threshold" data-inventory-outcome-threshold={String(outcome.threshold)}>
                {localize('FABRICATE.App.Inventory.Salvage.ReachedAt', { threshold: outcome.threshold })}
              </span>
            {/if}
          </div>
          {#if outcome.results.length > 0}
            <ul class="salvage-outcome-results">
              {#each outcome.results as entry, resultIndex (entry.id ?? entry.componentId ?? resultIndex)}
                <li class="salvage-outcome-result" data-inventory-salvage-result={entry.componentId}>
                  {#if entry.img}
                    <img src={entry.img} alt="" draggable="false" />
                  {/if}
                  <span class="salvage-outcome-result-name">{entry.name}</span>
                  <span class="salvage-outcome-result-qty">×{entry.quantity}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="salvage-empty">{localize('FABRICATE.App.Inventory.Salvage.OutcomeAwardsNothing')}</p>
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

  .salvage-body-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fab-text-muted);
  }

  .salvage-dc {
    font-family: var(--fab-font-mono);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0;
    color: var(--fab-text-secondary);
  }

  .salvage-empty {
    margin: 0;
    font-size: 11px;
    color: var(--fab-text-muted);
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

  .salvage-outcome-rolled {
    flex: 0 0 auto;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
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

  .salvage-outcome-result img {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 3px;
    object-fit: cover;
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
