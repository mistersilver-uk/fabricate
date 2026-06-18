<!-- Svelte 5 runes mode -->
<!--
  GatheringEventRow renders one environment event in the Events tab of the
  center column. Like GatheringTaskRow it is a compact, selectable row: clicking
  it selects the event, which drives the right-column event inspector and
  highlights the row. Unlike a task row it carries no Attempt action and no
  economy/blocked callouts — events are informational.

  Layout mirrors the task row's visual language for consistency: a thumbnail, the
  event name with a danger pip (its icon escalates in colour with the risk
  tier), an optional per-event ChanceBar (event scale), and a short clamped description.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { riskClass, riskLabel, descriptionOrDefault } from '../../util/gatheringFormat.js';
  import ChanceBar from './ChanceBar.svelte';

  let {
    event = null,
    selected = false,
    onSelect = null
  } = $props();

  const id = $derived(String(event?.id ?? ''));
  const name = $derived(String(event?.name ?? ''));
  const description = $derived(String(event?.description ?? ''));
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    descriptionOrDefault(description, 'FABRICATE.App.Gathering.Detail.NoEventDescription', localize)
  );
  const img = $derived(String(event?.img ?? ''));
  const chance = $derived(event?.chance ?? null);

  // Localize the danger value to match the GM editor's risk labels, mirroring
  // GatheringDetail; fall back to the raw value for any unmapped level.
  const danger = $derived(String(event?.risk ?? (Array.isArray(event?.dangerTags) ? event.dangerTags[0] : '') ?? ''));
  const dangerLabel = $derived(riskLabel(danger, localize));
  const dangerRiskClass = $derived(riskClass(danger));

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
  class="gathering-event-row"
  class:is-selected={selected}
  role="listitem"
  data-event-id={id}
  data-selected={selected ? 'true' : 'false'}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="gathering-event-summary is-toggle"
    role="button"
    tabindex="0"
    onclick={select}
    onkeydown={onSummaryKey}
  >
    <div class="gathering-event-main">
      <span class="gathering-event-thumb-wrap">
        <img class="gathering-event-thumb" class:is-fallback={!img} src={img || 'icons/svg/mystery-man.svg'} alt="" />
      </span>

      <span class="gathering-event-copy">
        <span class="gathering-event-name" title={name}>{name}</span>
        {#if dangerLabel !== ''}
          <span class={`gathering-event-danger is-danger ${dangerRiskClass}`}>
            <i class="fas fa-skull" aria-hidden="true"></i>
            <span>{dangerLabel}</span>
          </span>
        {/if}
      </span>

      {#if chance != null}
        <span class="gathering-event-chance" data-gathering-event-chance>
          <ChanceBar value={chance} scale="event" showCaption={false} />
        </span>
      {/if}
    </div>

    <p
      class="gathering-event-description"
      class:is-fallback={!hasDescription}
      data-gathering-event-description
    >{descriptionText}</p>
  </div>
</div>

<style>
  .gathering-event-row {
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
  .gathering-event-row.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
  }

  .gathering-event-summary {
    display: flex;
    flex-direction: column;
  }

  .gathering-event-summary.is-toggle {
    cursor: pointer;
  }

  .gathering-event-summary.is-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .gathering-event-main {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-height: 72px;
    padding: var(--fab-space-2);
  }

  .gathering-event-thumb-wrap {
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
  }

  .gathering-event-thumb {
    display: block;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-event-thumb.is-fallback {
    object-fit: contain;
    padding: 8px;
    box-sizing: border-box;
  }

  .gathering-event-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gathering-event-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  /* Danger pip + tier icon colour, mirroring the header danger pip in
     GatheringDetail (success -> warning -> danger). */
  .gathering-event-danger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-event-danger.is-danger i {
    color: var(--fab-danger, var(--fab-text-muted));
  }

  .gathering-event-danger.is-danger.risk-safe i {
    color: var(--fab-success);
  }

  .gathering-event-danger.is-danger.risk-unsafe i {
    color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%);
  }

  .gathering-event-danger.is-danger.risk-hazardous i {
    color: var(--fab-warning);
  }

  .gathering-event-danger.is-danger.risk-dangerous i {
    color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%);
  }

  .gathering-event-danger.is-danger.risk-deadly i,
  .gathering-event-danger.is-danger.risk-extreme i {
    color: var(--fab-danger);
  }

  .gathering-event-chance {
    flex: 0 0 auto;
  }

  /* Short, always-visible description, mirroring the task row's clamp. */
  .gathering-event-description {
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

  .gathering-event-description.is-fallback {
    font-style: italic;
    opacity: 0.85;
  }
</style>
