<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';

  let { tiers = [], emptyTierText = '', label = '', hint = '' } = $props();
</script>

<section class="fab-outcome-ladder" data-outcome-ladder>
  {#if label || hint}
    <header class="fab-outcome-heading">
      {#if label}<span class="fab-outcome-kicker">{label}</span>{/if}
      {#if hint}<span class="fab-outcome-hint">{hint}</span>{/if}
    </header>
  {/if}
  <div class="fab-outcome-tiers">
    {#each tiers as tier, index (tier.id || `${tier.name}-${index}`)}
      <article
        class="fab-outcome-tier"
        class:is-failure={tier.fail === true}
        data-outcome-tier={tier.id || index}
      >
        <header class="fab-outcome-tier-heading">
          <i class={tier.fail ? 'fas fa-circle-xmark' : 'fas fa-circle-check'} aria-hidden="true"
          ></i>
          <span class="fab-outcome-tier-name">{tier.name}</span>
          <Chip density="list" mono tone={tier.fail ? 'danger' : 'neutral'}>{tier.band}</Chip>
        </header>
        <div class="fab-outcome-yields">
          {#each tier.yields ?? [] as item, itemIndex (item.id || `${item.name}-${itemIndex}`)}
            <Chip density="list" icon={item.icon || ''} tint={item.tint || ''} tone="neutral">
              {item.name}{#if item.quantity}<span class="fab-outcome-quantity">{item.quantity}</span
                >{/if}
            </Chip>
          {:else}
            <span class="fab-outcome-empty" data-outcome-empty
              >{tier.emptyText || emptyTierText}</span
            >
          {/each}
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .fab-outcome-ladder,
  .fab-outcome-tiers {
    display: grid;
    gap: var(--fab-space-2);
  }

  .fab-outcome-heading {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
  }

  .fab-outcome-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-outcome-hint,
  .fab-outcome-empty {
    color: var(--fab-text-subtle);
    font-size: 10px;
  }

  .fab-outcome-tier {
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .fab-outcome-tier.is-failure {
    border-color: var(--fab-danger-border);
  }

  .fab-outcome-tier-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-2);
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  .is-failure .fab-outcome-tier-heading {
    background: var(--fab-danger-soft);
    color: var(--fab-danger-text);
  }

  .fab-outcome-tier-name {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 11px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .fab-outcome-yields {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2);
  }

  .fab-outcome-quantity {
    margin-left: var(--fab-space-chip);
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
</style>
