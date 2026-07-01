<!-- Svelte 5 runes mode -->
<!--
  JournalListShell is the shared chrome for the left column's two titled list
  regions (Active Runs, History): a header with the title, an optional count, and
  a sort dropdown, plus the per-column empty state. Factored into one component so
  ActiveRunsList and HistoryList do not each paste the identical header/sort/empty
  markup + CSS (which would fail the SonarCloud new-code duplication gate). The
  list body is supplied as children; the empty state replaces it when `isEmpty`.
-->
<script>
  let {
    titleId = '',
    kind = '',
    title = '',
    count = null,
    sortLabel = '',
    sortValue = '',
    sortOptions = [],
    onSortChange = null,
    isEmpty = false,
    emptyIcon = 'fa-inbox',
    emptyText = '',
    children
  } = $props();
</script>

<section class="journal-list-section" aria-labelledby={titleId}>
  <header class="journal-list-header">
    <h3 id={titleId} class="journal-list-title">
      {title}{#if count !== null}<span class="journal-list-count">{count}</span>{/if}
    </h3>
    <label class="journal-sort">
      <span class="journal-sort-label">{sortLabel}</span>
      <select
        data-journal-sort={kind}
        value={sortValue}
        onchange={(event) => onSortChange?.(event.currentTarget.value)}
      >
        {#each sortOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
  </header>

  <div class="journal-list-body" class:is-empty={isEmpty}>
    {#if isEmpty}
      <div class="journal-list-empty" data-journal-empty={kind}>
        <i class={`fas ${emptyIcon}`} aria-hidden="true"></i>
        <p>{emptyText}</p>
      </div>
    {:else}
      {@render children?.()}
    {/if}
  </div>
</section>

<style>
  /* Each list region takes an equal half of the left column (flex: 1 1 0) so the
     Active Runs and History sections are always the same height regardless of
     content, and the empty state stays vertically centered in its half rather
     than collapsing the section to the top third. */
  .journal-list-section {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-height: 0;
  }

  .journal-list-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .journal-list-body.is-empty {
    justify-content: center;
    overflow: hidden;
  }

  .journal-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  .journal-list-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--fab-text);
  }

  .journal-list-count {
    margin-left: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
  }

  .journal-sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* The closed/open select chrome is themed globally (.fabricate-app select +
     option) so every player-app dropdown is consistent. */

  .journal-list-empty {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: var(--fab-space-4);
    text-align: center;
    color: var(--fab-text-muted);
  }

  .journal-list-empty i {
    font-size: 22px;
  }

  .journal-list-empty p {
    margin: 0;
    font-size: 13px;
  }
</style>
