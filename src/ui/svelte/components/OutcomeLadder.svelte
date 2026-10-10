<!-- Authored outcome bands preview possible yields, never confirmed historical awards. -->
<!--
  `reachedId` marks the first tier whose `ids` (else its `id`) contain it with a `reachedLabel` pill.
  A band is optional, a bare mono figure. `successLabel`/`failureLabel` name each tier's status
  glyph for a screen reader. Each yield is a wrapping chip led by its 14px picture where
  `resolveCraftingArt` finds art, else its 9px glyph. Each tier, its band, its pill and each yield
  take per-item `props`; the root takes `class` and a rest spread.
-->
<script>
  import { essenceTintStyle } from '../util/essenceTint.js';
  import { resolveCraftingArt } from '../util/craftingArtResolution.js';
  import Chip from './Chip.svelte';
  import Kicker from './Kicker.svelte';
  import Medallion from './Medallion.svelte';

  let {
    tiers = [],
    emptyTierText = '',
    label = '',
    hint = '',
    reachedId = null,
    reachedLabel = '',
    successLabel = '',
    failureLabel = '',
    class: extraClass = '',
    ...rest
  } = $props();

  const tierIds = (tier) => (Array.isArray(tier.ids) && tier.ids.length > 0 ? tier.ids : [tier.id]);
  const reachedIndex = $derived(
    reachedId == null ? -1 : tiers.findIndex((tier) => tierIds(tier).includes(reachedId))
  );
  const markOf = (item) =>
    resolveCraftingArt(item.art ?? item.img ?? '', item.icon || 'fas fa-box');
</script>

<section class={['fab-outcome-ladder', extraClass]} {...rest} data-outcome-ladder>
  {#if label || hint}
    <header class="fab-outcome-heading">
      {#if label}<Kicker as="span">{label}</Kicker>{/if}
      {#if hint}<span class="fab-outcome-hint">{hint}</span>{/if}
    </header>
  {/if}
  <div class="fab-outcome-tiers">
    {#each tiers as tier, index (tier.id || `${tier.name}-${index}`)}
      {@const isReached = index === reachedIndex}
      {@const status = tier.fail ? failureLabel : successLabel}
      <article
        {...tier.props}
        class="fab-outcome-tier"
        class:is-failure={tier.fail === true}
        class:is-reached={isReached}
        data-outcome-tier={tier.id || index}
        data-outcome-rolled={isReached ? 'true' : undefined}
      >
        <header class="fab-outcome-tier-heading">
          <i
            class={[
              'fab-outcome-tier-glyph',
              tier.fail ? 'fas fa-circle-xmark' : 'fas fa-circle-check',
            ]}
            aria-hidden="true"
          ></i>
          {#if status}<span class="visually-hidden" data-outcome-status>{status}</span>{/if}
          <span class="fab-outcome-tier-name">{tier.name}</span>
          {#if isReached}
            <!-- ratchet-exempt(design-system): per-item props carry the caller's data-* hook onto the pill -->
            <Chip
              {...tier.reachedProps}
              density="list"
              tone="accent"
              icon="fas fa-circle"
              data-outcome-reached>{reachedLabel}</Chip
            >
          {/if}
          {#if tier.band}
            <span
              {...tier.bandProps}
              class="fab-outcome-band"
              data-outcome-band={tier.fail ? 'danger' : 'neutral'}>{tier.band}</span
            >
          {/if}
        </header>
        <div class="fab-outcome-yields">
          {#each tier.yields ?? [] as item, itemIndex (item.id || `${item.name}-${itemIndex}`)}
            {@const mark = markOf(item)}
            <span {...item.props} class="fab-outcome-yield" data-outcome-yield>
              {#if mark.art}
                <!-- ratchet-exempt(design-system): a 14px inline mark inside a 24px yield chip, not a record tile; the art ladder's 22 would grow every chip -->
                <Medallion art={mark.art} icon={mark.icon} alt="" size={14} />
              {:else}
                <i
                  class={['fab-outcome-yield-glyph', mark.icon]}
                  style={essenceTintStyle(item.tint, '--fab-outcome-yield-tint')}
                  aria-hidden="true"
                ></i>
              {/if}
              <span class="fab-outcome-yield-name" title={item.name}>{item.name}</span>
              {#if item.quantity != null}<span class="fab-outcome-yield-quantity"
                  >{item.quantity}</span
                >{/if}
              {#if item.detail}<span class="fab-outcome-yield-detail">{item.detail}</span>{/if}
            </span>
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

  .fab-outcome-hint {
    color: var(--fab-text-subtle);
    font-size: 10.5px;
    line-height: 1.5;
  }

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

  /* Two signals, never colour alone: the accent edge and the pill. */
  .fab-outcome-tier.is-reached {
    border-color: var(--fab-accent-border);
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

  .fab-outcome-tier-glyph {
    flex: 0 0 auto;
    font-size: 10px;
  }

  .fab-outcome-tier-name {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 11px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  /* Secondary, not the specimen's subtle: subtle and muted fall under 4.5:1 on the success head. */
  .fab-outcome-band {
    flex: 0 0 auto;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .is-failure .fab-outcome-band {
    color: var(--fab-danger-text);
  }

  .fab-outcome-yields {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2);
  }

  /* A group's members wrap at whitespace, so the chip grows rather than hiding an offered reward. */
  .fab-outcome-yield {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    max-width: 100%;
    min-width: 0;
    min-height: 24px;
    padding: var(--fab-space-2xs) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-secondary);
    font-size: 10.5px;
    font-weight: 500;
  }

  .fab-outcome-yield-glyph {
    flex: 0 0 auto;
    color: var(--fab-outcome-yield-tint, var(--fab-accent));
    font-size: 9px;
  }

  .fab-outcome-yield-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-outcome-yield-quantity {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .fab-outcome-yield-detail {
    min-width: 0;
    overflow-wrap: break-word;
  }
</style>
