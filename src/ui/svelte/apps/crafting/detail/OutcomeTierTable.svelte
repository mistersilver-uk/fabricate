<!-- Svelte 5 runes mode -->
<!--
  OutcomeTierTable renders the per-tier awarded results for a routed-by-check
  recipe. Each tier shows its name, whether it is a success tier, and the items it
  awards (a failure tier routes nothing and reads as such).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import CraftingThumb from '../CraftingThumb.svelte';

  let { tiers = [] } = $props();

  const rows = $derived(Array.isArray(tiers) ? tiers : []);
</script>

<section class="crafting-tiers" data-recipe-section="outcome-tiers">
  <p class="crafting-detail-section-title">{localize('FABRICATE.App.Crafting.Detail.OutcomesTitle')}</p>
  {#if rows.length > 0}
    <ul class="crafting-tier-list">
      {#each rows as tier, index (tier.id ?? tier.name ?? index)}
        <li
          class="crafting-tier-row"
          class:is-success={tier.success}
          data-tier-success={tier.success ? 'true' : 'false'}
        >
          <div class="crafting-tier-head">
            <span class="crafting-tier-name">{tier.name}</span>
            <span class={`crafting-tier-flag tone-${tier.success ? 'success' : 'neutral'}`}>
              <i class={`fas ${tier.success ? 'fa-circle-check' : 'fa-circle-minus'}`} aria-hidden="true"></i>
              {tier.success
                ? localize('FABRICATE.App.Crafting.Detail.TierSuccess')
                : localize('FABRICATE.App.Crafting.Detail.TierNoAward')}
            </span>
          </div>
          {#if Array.isArray(tier.awardedResults) && tier.awardedResults.length > 0}
            <ul class="crafting-tier-awards">
              {#each tier.awardedResults as item, awardIndex (item.name + awardIndex)}
                <li class="crafting-tier-award">
                  <CraftingThumb src={item.img} alt="" size={26} />
                  <span class="crafting-tier-award-name">{item.name}</span>
                  <span class="crafting-tier-award-qty">×{item.qty}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="crafting-tiers-empty">{localize('FABRICATE.App.Crafting.Detail.NoOutcomes')}</p>
  {/if}
</section>

<style>
  .crafting-tiers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-tier-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-tier-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .crafting-tier-row.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .crafting-tier-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .crafting-tier-name {
    font-weight: 600;
    font-size: 13px;
  }

  .crafting-tier-flag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .crafting-tier-flag.tone-success {
    color: var(--fab-success-text);
  }

  .crafting-tier-awards {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .crafting-tier-award {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px 2px 2px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface);
    font-size: 12px;
  }

  .crafting-tier-award-qty {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .crafting-tiers-empty {
    margin: 0;
    font-size: 12px;
    font-style: italic;
    color: var(--fab-text-muted);
  }

  .crafting-detail-section-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fab-text-muted);
  }
</style>
