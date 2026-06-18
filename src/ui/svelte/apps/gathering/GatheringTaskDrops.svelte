<!-- Svelte 5 runes mode -->
<!--
  GatheringTaskDrops renders the right-column "What you might find" section for
  the selected task. It lists each possible drop with its (modifier-adjusted)
  chance as a mini bar with the percent in-line at the end, hint text explaining
  how finds are awarded and how events impact results, and an expandable
  "Modifiers" body per drop that breaks the chance down into base + weather +
  time-of-day + biome + per-character-ability contributions.

  Data comes from `services.getGatheringDropBreakdown` (resolved lazily by the
  parent for the selected task); `breakdown` is
  `{ drops, awardMode, awardLimit, eventPolicy }`. The section renders nothing
  when there are no drops and not loading.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { toPercent as pct } from '../../util/gatheringFormat.js';
  import GatheringDropModifiers from './GatheringDropModifiers.svelte';

  let { breakdown = null, loading = false } = $props();

  const drops = $derived(Array.isArray(breakdown?.drops) ? breakdown.drops : []);
  const hasDrops = $derived(drops.length > 0);

  const awardHint = $derived.by(() => {
    switch (breakdown?.awardMode) {
      case 'allDrops':
        return localize('FABRICATE.App.Gathering.Detail.AwardModeAll');
      case 'limitedDrops':
        return localize('FABRICATE.App.Gathering.Detail.AwardModeLimited', { x: Number(breakdown?.awardLimit ?? 1) });
      case 'highestRankedDrop':
        return localize('FABRICATE.App.Gathering.Detail.AwardModeHighest');
      default:
        return '';
    }
  });
  const eventHint = $derived(
    breakdown?.eventPolicy === 'failureWithEvent'
      ? localize('FABRICATE.App.Gathering.Detail.EventImpactFailure')
      : (breakdown?.eventPolicy ? localize('FABRICATE.App.Gathering.Detail.EventImpactSuccess') : '')
  );

  let expandedIds = $state(new Set());
  function toggle(id) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedIds = next;
  }
  function onRowKey(event, id) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      toggle(id);
    }
  }
</script>

{#if loading}
  <div class="gathering-task-drops" data-gathering-drops data-gathering-drops-state="loading">
    <p class="gathering-task-drops-heading">{localize('FABRICATE.App.Gathering.Detail.WhatYouMightFind')}</p>
    <p class="gathering-task-drops-loading">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {localize('FABRICATE.App.Gathering.Detail.DropsLoading')}
    </p>
  </div>
{:else if hasDrops}
  <div class="gathering-task-drops" data-gathering-drops data-gathering-drops-state="ready">
    <p class="gathering-task-drops-heading">{localize('FABRICATE.App.Gathering.Detail.WhatYouMightFind')}</p>

    {#if awardHint !== '' || eventHint !== ''}
      <ul class="gathering-task-drops-hints" data-gathering-drops-hints>
        {#if awardHint !== ''}
          <li><i class="fas fa-gift" aria-hidden="true"></i><span>{awardHint}</span></li>
        {/if}
        {#if eventHint !== ''}
          <li><i class="fas fa-skull" aria-hidden="true"></i><span>{eventHint}</span></li>
        {/if}
      </ul>
    {/if}

    <ul class="gathering-task-drops-list">
      {#each drops as drop, index (drop.id ?? index)}
        {@const isOpen = expandedIds.has(drop.id ?? index)}
        <li class="gathering-task-drop" data-gathering-drop data-drop-id={drop.id ?? ''}>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="gathering-task-drop-summary"
            role="button"
            tabindex="0"
            aria-expanded={isOpen}
            onclick={() => toggle(drop.id ?? index)}
            onkeydown={(event) => onRowKey(event, drop.id ?? index)}
          >
            <img class="gathering-task-drop-thumb" src={drop.img || 'icons/svg/item-bag.svg'} alt="" />
            <span class="gathering-task-drop-copy">
              <span class="gathering-task-drop-name" title={drop.name}>
                {drop.name}
                {#if Number(drop.quantity) > 1}
                  <span class="gathering-task-drop-qty">{localize('FABRICATE.App.Gathering.Detail.DropQuantity', { x: Number(drop.quantity) })}</span>
                {/if}
              </span>
              <span
                class="gathering-task-drop-chance"
                role="meter"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={pct(drop.finalChance)}
                aria-label={localize('FABRICATE.App.Gathering.Detail.FindChance', { x: pct(drop.finalChance) })}
                data-gathering-drop-value={pct(drop.finalChance)}
              >
                <span class="gathering-task-drop-track">
                  <span class="gathering-task-drop-fill" style={`width: ${pct(drop.finalChance)}%`}></span>
                </span>
                <span class="gathering-task-drop-percent">{pct(drop.finalChance)}%</span>
              </span>
            </span>
            <span class="gathering-task-drop-chevron" aria-hidden="true">
              <i class={`fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </span>
          </div>

          {#if isOpen}
            <GatheringDropModifiers {drop} />
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .gathering-task-drops {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
  }

  .gathering-task-drops-heading {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .gathering-task-drops-loading {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-task-drops-hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-task-drops-hints li {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .gathering-task-drops-hints i {
    font-size: 10px;
  }

  .gathering-task-drops-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .gathering-task-drop {
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    overflow: hidden;
  }

  .gathering-task-drop-summary {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    cursor: pointer;
  }

  .gathering-task-drop-summary:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .gathering-task-drop-thumb {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-task-drop-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-task-drop-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 13px;
  }

  .gathering-task-drop-qty {
    color: var(--fab-text-muted);
    font-weight: 500;
  }

  .gathering-task-drop-chance {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gathering-task-drop-track {
    position: relative;
    flex: 1 1 auto;
    height: 6px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    overflow: hidden;
  }

  .gathering-task-drop-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-success);
  }

  .gathering-task-drop-percent {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-task-drop-chevron {
    flex: 0 0 auto;
    width: 18px;
    text-align: center;
    color: var(--fab-text-muted);
  }
</style>
