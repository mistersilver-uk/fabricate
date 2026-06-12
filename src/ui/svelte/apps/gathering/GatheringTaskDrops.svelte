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

  function pct(value) {
    return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  }
  function signedPercent(value) {
    const magnitude = Math.abs(Math.trunc(Number(value) || 0));
    return `${Number(value) < 0 ? '-' : '+'}${magnitude}%`;
  }
  function toneClass(value) {
    const number = Number(value) || 0;
    if (number > 0) return 'is-positive';
    if (number < 0) return 'is-negative';
    return 'is-neutral';
  }

  // The non-base modifier lines for a drop (only non-zero contributors), in a
  // stable order: weather, time-of-day, biome, then each character ability.
  function modifierLines(drop) {
    const modifiers = drop?.modifiers ?? {};
    const lines = [];
    if (Number(modifiers.weather?.value)) {
      lines.push({ key: 'weather', icon: 'fas fa-cloud-sun', label: localize('FABRICATE.App.Gathering.Detail.ModifierWeather'), value: Number(modifiers.weather.value) });
    }
    if (Number(modifiers.timeOfDay?.value)) {
      lines.push({ key: 'timeOfDay', icon: 'fas fa-clock', label: localize('FABRICATE.App.Gathering.Detail.ModifierTimeOfDay'), value: Number(modifiers.timeOfDay.value) });
    }
    if (Number(modifiers.biome?.value)) {
      lines.push({ key: 'biome', icon: 'fas fa-mountain-sun', label: localize('FABRICATE.App.Gathering.Detail.ModifierBiome'), value: Number(modifiers.biome.value) });
    }
    for (const [index, entry] of (Array.isArray(modifiers.character) ? modifiers.character : []).entries()) {
      if (!Number(entry?.contribution)) continue;
      lines.push({ key: `character-${index}`, icon: entry.icon || 'fas fa-user', label: entry.label || '', value: Number(entry.contribution) });
    }
    return lines;
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
        {@const lines = modifierLines(drop)}
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
            <div class="gathering-task-drop-modifiers" data-gathering-drop-modifiers>
              <p class="gathering-task-drop-modifiers-heading">{localize('FABRICATE.App.Gathering.Detail.Modifiers')}</p>
              <ul class="gathering-task-drop-modifier-list">
                <li class="gathering-task-drop-modifier is-base">
                  <span class="gathering-task-drop-modifier-label">{localize('FABRICATE.App.Gathering.Detail.DropBaseChance')}</span>
                  <span class="gathering-task-drop-modifier-value">{pct(drop.baseChance)}%</span>
                </li>
                {#each lines as line (line.key)}
                  <li class="gathering-task-drop-modifier">
                    <span class="gathering-task-drop-modifier-label">
                      <i class={line.icon} aria-hidden="true"></i>{line.label}
                    </span>
                    <span class={`gathering-task-drop-modifier-value ${toneClass(line.value)}`}>{signedPercent(line.value)}</span>
                  </li>
                {/each}
              </ul>
              {#if lines.length === 0}
                <p class="gathering-task-drop-no-modifiers" data-gathering-drop-no-modifiers>
                  {localize('FABRICATE.App.Gathering.Detail.DropNoModifiers')}
                </p>
              {/if}
            </div>
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

  .gathering-task-drop-modifiers {
    padding: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-surface);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-task-drop-modifiers-heading {
    margin: 0;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .gathering-task-drop-modifier-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gathering-task-drop-modifier {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    font-size: 12px;
  }

  .gathering-task-drop-modifier-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--fab-text);
  }

  .gathering-task-drop-modifier-label i {
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .gathering-task-drop-modifier-value {
    flex: 0 0 auto;
    font-weight: 600;
  }

  .gathering-task-drop-modifier-value.is-positive {
    color: var(--fab-success-text);
  }

  .gathering-task-drop-modifier-value.is-negative {
    color: var(--fab-danger-text);
  }

  .gathering-task-drop-no-modifiers {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }
</style>
