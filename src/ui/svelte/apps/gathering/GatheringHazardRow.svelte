<!-- Svelte 5 runes mode -->
<!--
  GatheringHazardRow renders one environment hazard in the Hazards tab of the
  center column. Like GatheringTaskRow it is a compact, selectable row: clicking
  it selects the hazard, which drives the right-column hazard inspector and
  highlights the row. Unlike a task row it carries no Attempt action and no
  economy/blocked callouts — hazards are informational.

  Layout mirrors the task row's visual language for consistency: a thumbnail, the
  hazard name with a danger pip (its icon escalates in colour with the risk
  tier), an optional per-hazard HazardChanceBar, and a short clamped description.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import HazardChanceBar from './HazardChanceBar.svelte';

  let {
    hazard = null,
    selected = false,
    onSelect = null
  } = $props();

  const id = $derived(String(hazard?.id ?? ''));
  const name = $derived(String(hazard?.name ?? ''));
  const description = $derived(String(hazard?.description ?? ''));
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    hasDescription ? description : localize('FABRICATE.App.Gathering.Detail.NoHazardDescription')
  );
  const img = $derived(String(hazard?.img ?? ''));
  const chance = $derived(hazard?.chance ?? null);

  // Localize the danger value to match the GM editor's risk labels, mirroring
  // GatheringDetail; fall back to the raw value for any unmapped level.
  const danger = $derived(String(hazard?.risk ?? (Array.isArray(hazard?.dangerTags) ? hazard.dangerTags[0] : '') ?? ''));
  const KNOWN_RISKS = new Set(['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']);
  const dangerLabel = $derived(
    danger === ''
      ? ''
      : (KNOWN_RISKS.has(danger) ? localize(`FABRICATE.App.Gathering.Detail.Risk.${danger}`) : danger)
  );
  const dangerRiskClass = $derived(KNOWN_RISKS.has(danger) ? `risk-${danger}` : '');

  function select() {
    onSelect?.(id);
  }
  function onSummaryKey(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      select();
    }
  }
</script>

<div
  class="gathering-hazard-row"
  class:is-selected={selected}
  role="listitem"
  data-hazard-id={id}
  data-selected={selected ? 'true' : 'false'}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="gathering-hazard-summary is-toggle"
    role="button"
    tabindex="0"
    onclick={select}
    onkeydown={onSummaryKey}
  >
    <div class="gathering-hazard-main">
      <span class="gathering-hazard-thumb-wrap">
        <img class="gathering-hazard-thumb" class:is-fallback={!img} src={img || 'icons/svg/hazard.svg'} alt="" />
      </span>

      <span class="gathering-hazard-copy">
        <span class="gathering-hazard-name" title={name}>{name}</span>
        {#if dangerLabel !== ''}
          <span class={`gathering-hazard-danger is-danger ${dangerRiskClass}`}>
            <i class="fas fa-skull" aria-hidden="true"></i>
            <span>{dangerLabel}</span>
          </span>
        {/if}
      </span>

      {#if chance != null}
        <span class="gathering-hazard-chance" data-gathering-hazard-chance>
          <HazardChanceBar value={chance} showCaption={false} />
        </span>
      {/if}
    </div>

    <p
      class="gathering-hazard-description"
      class:is-fallback={!hasDescription}
      data-gathering-hazard-description
    >{descriptionText}</p>
  </div>
</div>

<style>
  .gathering-hazard-row {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    overflow: hidden;
  }

  /* Selection highlight mirrors the task row's selected state. */
  .gathering-hazard-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
  }

  .gathering-hazard-summary {
    display: flex;
    flex-direction: column;
  }

  .gathering-hazard-summary.is-toggle {
    cursor: pointer;
  }

  .gathering-hazard-summary.is-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .gathering-hazard-main {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-height: 72px;
    padding: var(--fab-space-2);
  }

  .gathering-hazard-thumb-wrap {
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
  }

  .gathering-hazard-thumb {
    display: block;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-hazard-thumb.is-fallback {
    object-fit: contain;
    padding: 8px;
    box-sizing: border-box;
  }

  .gathering-hazard-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gathering-hazard-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  /* Danger pip + tier icon colour, mirroring the header danger pip in
     GatheringDetail (success -> warning -> danger). */
  .gathering-hazard-danger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-hazard-danger.is-danger i {
    color: var(--fab-danger, var(--fab-text-muted));
  }

  .gathering-hazard-danger.is-danger.risk-safe i {
    color: var(--fab-success);
  }

  .gathering-hazard-danger.is-danger.risk-unsafe i {
    color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%);
  }

  .gathering-hazard-danger.is-danger.risk-hazardous i {
    color: var(--fab-warning);
  }

  .gathering-hazard-danger.is-danger.risk-dangerous i {
    color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%);
  }

  .gathering-hazard-danger.is-danger.risk-deadly i,
  .gathering-hazard-danger.is-danger.risk-extreme i {
    color: var(--fab-danger);
  }

  .gathering-hazard-chance {
    flex: 0 0 auto;
  }

  /* Short, always-visible description, mirroring the task row's clamp. */
  .gathering-hazard-description {
    margin: 0;
    padding: 0 var(--fab-space-2) var(--fab-space-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  .gathering-hazard-description.is-fallback {
    font-style: italic;
    opacity: 0.85;
  }
</style>
