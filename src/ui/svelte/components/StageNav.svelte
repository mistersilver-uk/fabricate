<!-- Svelte 5 runes mode -->
<script>
  import IconButton from './IconButton.svelte';
  import ManagerButton from './ManagerButton.svelte';

  let {
    stages = [],
    current = 0,
    view = $bindable(0),
    window = 5,
    onView = () => {},
    stageLabel = (_stage, index) => String(index + 1),
    previousLabel = '',
    nextLabel = '',
    positionLabel = () => '',
    returnLabel = () => '',
  } = $props();

  const count = $derived(stages.length);
  const windowSize = $derived(Math.max(1, Math.min(count, 5, Math.floor(Number(window) || 5))));
  const safeView = $derived(Math.min(Math.max(0, Number(view) || 0), Math.max(0, count - 1)));
  const safeCurrent = $derived(Math.min(Math.max(0, Number(current) || 0), Math.max(0, count - 1)));
  const start = $derived(
    Math.max(0, Math.min(safeView - Math.floor(windowSize / 2), count - windowSize))
  );
  const visible = $derived(stages.slice(start, start + windowSize));

  function select(index) {
    if (index < 0 || index >= count) return;
    view = index;
    onView(index);
  }
</script>

{#if count > 1}
  <nav
    class="fab-stage-nav"
    data-stage-nav
    aria-label={positionLabel(safeView, count) || undefined}
  >
    <IconButton
      class="fab-stage-nav-arrow"
      ariaLabel={previousLabel}
      disabled={safeView === 0}
      data-stage-nav-previous
      onclick={() => select(safeView - 1)}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </IconButton>
    {#each visible as stage, offset (stage?.id ?? start + offset)}
      {@const index = start + offset}
      <button
        type="button"
        class="fab-stage-nav-number"
        class:is-viewed={index === safeView}
        class:is-current={index === safeCurrent}
        data-stage-nav-index={index}
        data-current={index === safeCurrent || undefined}
        data-keyboard-focus="true"
        aria-label={stageLabel(stage, index)}
        aria-pressed={index === safeView}
        onclick={() => select(index)}>{index + 1}</button
      >
    {/each}
    <IconButton
      class="fab-stage-nav-arrow"
      ariaLabel={nextLabel}
      disabled={safeView === count - 1}
      data-stage-nav-next
      onclick={() => select(safeView + 1)}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </IconButton>
    {#if positionLabel(safeView, count)}
      <span class="fab-stage-nav-position">{positionLabel(safeView, count)}</span>
    {/if}
    {#if safeView !== safeCurrent}
      <ManagerButton
        class="fab-stage-nav-return"
        data-stage-nav-return
        onclick={() => select(safeCurrent)}
      >
        <i class="fas fa-bullseye" aria-hidden="true"></i>
        {returnLabel(safeCurrent)}
      </ManagerButton>
    {/if}
  </nav>
{/if}

<style>
  .fab-stage-nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }

  :global(.fab-stage-nav-arrow),
  .fab-stage-nav-number {
    box-sizing: border-box;
    width: 26px;
    height: 26px;
    min-height: 26px;
    flex: 0 0 26px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-subtle);
  }

  .fab-stage-nav-number {
    padding: 0;
    font-family: var(--fab-font-mono);
    font-size: 10.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .fab-stage-nav-number.is-current {
    border-color: var(--fab-accent-border);
    color: var(--fab-accent-text);
  }

  .fab-stage-nav-number.is-viewed {
    border-color: var(--fab-accent);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .fab-stage-nav-position {
    min-width: 0;
    flex: 1 1 auto;
    padding-left: var(--fab-space-2);
    color: var(--fab-text-subtle);
    font-size: 10.5px;
  }

  :global(.fab-stage-nav-return) {
    height: 26px;
    min-height: 26px;
    padding: 0 var(--fab-space-2);
    border-radius: 7px;
    flex: 0 0 auto;
    font-size: 10px;
  }
</style>
