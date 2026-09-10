<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import ListRow from './ListRow.svelte';

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
  const cutIndex = $derived(hasRoll ? sorted.findIndex((entry) => cleared(entry) === false) : -1);
  const hasCut = $derived(hasRoll && sorted.every((entry) => cleared(entry) !== null));

  function cleared(entry) {
    if (Object.hasOwn(entry, 'cleared'))
      return typeof entry.cleared === 'boolean' ? entry.cleared : null;
    return hasRoll ? Number(roll) <= Number(entry.chance) : null;
  }

  function reading(entry) {
    if (cleared(entry) === null) return labels.threshold?.(entry);
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
      {#if hasCut && cutIndex === index}
        <div class="fab-yield-cut" data-yield-cut>
          <Chip density="list" tone="accent" mono icon="fas fa-dice"
            >{labels.cut?.(Number(roll)) ?? String(roll)}</Chip
          >
          <span class="fab-yield-cut-rule"></span>
          <span class="fab-yield-cut-note">{cutNote(index)}</span>
        </div>
      {/if}
      <div
        class="fab-yield-row"
        class:is-cleared={cleared(entry) === true}
        class:is-missed={cleared(entry) === false}
        data-yield-entry={entry.id}
      >
        <ListRow
          name={entry.name}
          art={entry.art || ''}
          icon={entry.icon || 'fas fa-circle'}
          tint={hasRoll && !cleared(entry) ? '' : entry.tint || ''}
          detail={reading(entry)}
          quantity={labels.quantity?.(entry) ?? entry.qty}
          tone={cleared(entry) === true ? 'positive' : 'neutral'}
          muted={cleared(entry) === false}
        >
          {#snippet trailing()}
            <Chip
              density="list"
              tone={!hasRoll && Number(entry.chance) >= 100 ? 'positive' : 'neutral'}
              mono>{labels.chance?.(entry) ?? entry.chance}</Chip
            >
          {/snippet}
        </ListRow>
      </div>
    {/each}
    {#if hasCut && sorted.length > 0 && cutIndex === -1}
      <div class="fab-yield-cut" data-yield-cut>
        <Chip density="list" tone="accent" mono icon="fas fa-dice"
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
