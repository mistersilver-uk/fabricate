<!-- ratchet-exempt(design-system): promoted on its third importer at issue 1644; its head glyph, band chip, row yields and kicker disagree with the specimen, recorded in the migrations table, so the row arrives at target -->
<!-- Authored outcome bands preview possible yields, never confirmed historical awards. -->
<!--
  `reachedId` marks the first tier whose `ids` (else its `id`) contain it with a `reachedLabel` pill.
  A band is optional. `successLabel`/`failureLabel` name each tier's status glyph for a screen reader.
  Each tier, its band chip, its pill and each yield take per-item `props`; the root takes `class` and
  a rest spread.
-->
<script>
  import Chip from './Chip.svelte';
  import ListRow from './ListRow.svelte';

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
</script>

<section class={['fab-outcome-ladder', extraClass]} {...rest} data-outcome-ladder>
  {#if label || hint}
    <header class="fab-outcome-heading">
      {#if label}<span class="fab-outcome-kicker">{label}</span>{/if}
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
          <i class={tier.fail ? 'fas fa-circle-xmark' : 'fas fa-circle-check'} aria-hidden="true"
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
            <!-- ratchet-exempt(design-system): per-item props carry the caller's data-* hook onto the band -->
            <Chip {...tier.bandProps} density="list" mono tone={tier.fail ? 'danger' : 'neutral'}
              >{tier.band}</Chip
            >
          {/if}
        </header>
        <div class="fab-outcome-yields">
          {#each tier.yields ?? [] as item, itemIndex (item.id || `${item.name}-${itemIndex}`)}
            <!-- ratchet-exempt(design-system): per-item props carry the caller's data-* hook onto the row -->
            <ListRow
              {...item.props}
              name={item.name}
              art={item.art ?? item.img ?? ''}
              icon={item.icon || 'fas fa-box'}
              tint={item.tint || ''}
              quantity={item.quantity}
              detail={item.detail ?? ''}
            />
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

  .fab-outcome-tier-name {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 11px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .fab-outcome-yields {
    display: grid;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2);
  }
</style>
