<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import Medallion from './Medallion.svelte';

  let { entries = [], roll = null, labels = {}, label = '', hint = '' } = $props();

  const sorted = $derived(
    entries
      .map((entry, index) => ({ ...entry, authoredIndex: index }))
      .sort(
        (left, right) =>
          Number(right.chance) - Number(left.chance) || left.authoredIndex - right.authoredIndex
      )
  );
  const hasRoll = $derived(roll !== null && roll !== undefined && Number.isFinite(Number(roll)));
  const cutIndex = $derived(
    hasRoll ? sorted.findIndex((entry) => Number(roll) > Number(entry.chance)) : -1
  );

  function cleared(entry) {
    return hasRoll && Number(roll) <= Number(entry.chance);
  }

  function reading(entry) {
    if (!hasRoll) return labels.threshold?.(entry);
    return cleared(entry)
      ? labels.cleared?.(entry, Number(roll))
      : labels.missed?.(entry, Number(roll));
  }

  function cutNote(index) {
    if (index === 0) return labels.topCutNote?.(Number(roll), sorted) ?? '';
    if (index === sorted.length) return labels.bottomCutNote?.(Number(roll), sorted) ?? '';
    return labels.cutNote?.(Number(roll), sorted) ?? '';
  }
</script>

<section class="fab-yield-scale" data-yield-scale>
  {#if label || hint}
    <header class="fab-yield-heading">
      {#if label}<span class="fab-yield-kicker">{label}</span>{/if}
      {#if hint}<span class="fab-yield-hint">{hint}</span>{/if}
    </header>
  {/if}
  <div class="fab-yield-rows">
    {#each sorted as entry, index (entry.id)}
      {#if hasRoll && cutIndex === index}
        <div class="fab-yield-cut" data-yield-cut>
          <Chip density="list" tone="accent" mono icon="fas fa-dice-d10"
            >{labels.cut?.(Number(roll)) ?? String(roll)}</Chip
          >
          <span class="fab-yield-cut-rule"></span>
          <span class="fab-yield-cut-note">{cutNote(index)}</span>
        </div>
      {/if}
      <div
        class="fab-yield-row"
        class:is-cleared={cleared(entry)}
        class:is-missed={hasRoll && !cleared(entry)}
        data-yield-entry={entry.id}
      >
        <Medallion
          art={entry.art || ''}
          icon={entry.icon || 'fas fa-circle'}
          tint={hasRoll && !cleared(entry) ? '' : entry.tint || ''}
          alt=""
          size={26}
        />
        <span class="fab-yield-copy">
          <span class="fab-yield-name">{entry.name}</span>
          <span class="fab-yield-reading">{reading(entry)}</span>
        </span>
        <span class="fab-yield-quantity">{labels.quantity?.(entry) ?? entry.qty}</span>
        <Chip
          density="list"
          tone={!hasRoll && Number(entry.chance) >= 100 ? 'positive' : 'neutral'}
          mono>{labels.chance?.(entry) ?? entry.chance}</Chip
        >
      </div>
    {/each}
    {#if hasRoll && sorted.length > 0 && cutIndex === -1}
      <div class="fab-yield-cut" data-yield-cut>
        <Chip density="list" tone="accent" mono icon="fas fa-dice-d10"
          >{labels.cut?.(Number(roll)) ?? String(roll)}</Chip
        >
        <span class="fab-yield-cut-rule"></span>
        <span class="fab-yield-cut-note">{cutNote(sorted.length)}</span>
      </div>
    {/if}
  </div>
</section>

<style>
  .fab-yield-scale,
  .fab-yield-rows {
    display: grid;
    gap: var(--fab-space-1);
  }

  .fab-yield-heading {
    display: flex;
    align-items: baseline;
    gap: var(--fab-space-2);
    margin-bottom: var(--fab-space-1);
  }

  .fab-yield-kicker {
    color: var(--fab-text-subtle);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-yield-hint,
  .fab-yield-cut-note {
    color: var(--fab-text-subtle);
    font-size: 9.5px;
  }

  .fab-yield-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-2);
  }

  .fab-yield-row.is-cleared {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
  }

  .fab-yield-row.is-missed {
    border-style: dashed;
  }

  .fab-yield-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 1px;
  }

  .fab-yield-name {
    color: var(--fab-text);
    font-size: 11px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .is-missed .fab-yield-name,
  .fab-yield-reading {
    color: var(--fab-text-subtle);
  }

  .fab-yield-reading {
    font-size: 9.5px;
  }

  .fab-yield-quantity {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-yield-cut {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) 0;
  }

  .fab-yield-cut-rule {
    height: 1px;
    min-width: var(--fab-space-3);
    flex: 1 1 auto;
    background: var(--fab-accent-border);
  }
</style>
