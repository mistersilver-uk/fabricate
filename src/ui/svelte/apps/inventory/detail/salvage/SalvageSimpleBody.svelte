<!-- Svelte 5 runes mode -->
<!--
  SalvageSimpleBody renders `simple` salvage — BOTH of its readings.

  "No check" and "pass/fail" are not two modes: they are one mode at two usability
  states. A check is usable iff its mode's roll formula is authored, and that is the
  only gate the engine applies (`check.enabled` is never read on the salvage path).
  So this component dispatches on `checkUsable`:

    checkUsable false -> "You will recover", every result tagged Guaranteed. The
                         engine returns a no-op success and awards the group.
    checkUsable true  -> "On a success", plus a note that a failed roll can cost the
                         component (the system's failure-consumption policy decides).

  The DC shown is the effective one: the per-component `dcOverride` when set, else the
  salvage check's default — resolved builder-side, exactly as the engine resolves it.
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';

  let { salvage = null } = $props();

  const checkUsable = $derived(salvage?.checkUsable === true);
  const results = $derived(Array.isArray(salvage?.results) ? salvage.results : []);
  const dc = $derived(Number.isFinite(salvage?.dc) ? salvage.dc : null);
</script>

<div class="salvage-body" data-inventory-salvage-body={checkUsable ? 'simple-check' : 'no-check'}>
  <p class="salvage-body-title">
    {checkUsable
      ? localize('FABRICATE.App.Inventory.Salvage.OnASuccess')
      : localize('FABRICATE.App.Inventory.Salvage.YouWillRecover')}
    {#if checkUsable && dc !== null}
      <span class="salvage-dc" data-inventory-salvage-dc={String(dc)}>
        {localize('FABRICATE.App.Inventory.Salvage.Dc', { dc })}
      </span>
    {/if}
  </p>

  {#if results.length === 0}
    <p class="salvage-empty">{localize('FABRICATE.App.Inventory.Salvage.NoResults')}</p>
  {:else}
    <ul class="salvage-result-list" data-inventory-salvage-results>
      {#each results as entry, index (entry.id ?? entry.componentId ?? index)}
        <li class="salvage-result-row" data-inventory-salvage-result={entry.componentId}>
          {#if entry.img}
            <img class="salvage-result-img" src={entry.img} alt="" draggable="false" />
          {/if}
          <span class="salvage-result-name">{entry.name}</span>
          <span class="salvage-result-qty">×{entry.quantity}</span>
          {#if !checkUsable}
            <span class="salvage-chip is-guaranteed">
              {localize('FABRICATE.App.Inventory.Salvage.Guaranteed')}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if checkUsable}
    <p class="salvage-loss-note" data-inventory-salvage-loss-note>
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{localize('FABRICATE.App.Inventory.Salvage.FailureLossNote')}</span>
    </p>
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
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .salvage-result-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
  }

  .salvage-result-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .salvage-result-img {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 4px;
    object-fit: cover;
  }

  .salvage-result-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .salvage-result-qty {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-secondary);
  }

  .salvage-chip {
    flex: 0 0 auto;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .salvage-chip.is-guaranteed {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  /* Two signals, never colour alone: the danger ramp AND a warning glyph. */
  .salvage-loss-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--fab-danger-text);
  }
</style>
