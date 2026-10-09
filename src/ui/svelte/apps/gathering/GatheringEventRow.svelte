<!-- Svelte 5 runes mode -->
<!--
  GatheringEventRow draws one environment event in the center column's Events tab as a selectable
  ListRow (issue 1778); selecting it drives the right-column event inspector. Events are
  informational, so the row carries no Attempt: the 56px thumb leads, the danger (risk) level is
  a badge, the description is the row's content and the event ChanceBar sits in the aside.
-->
<script>
  import { DEFAULT_GATHERING_EVENT_IMG } from '../../../../gatheringImageDefaults.js';
  import { localize } from '../../util/foundryBridge.js';
  import {
    riskClass,
    riskLabel,
    descriptionOrDefault,
    toPercent,
  } from '../../util/gatheringFormat.js';
  import ChanceBar from './ChanceBar.svelte';
  import Kicker from '../../components/Kicker.svelte';
  import ListRow from '../../components/ListRow.svelte';

  let { event = null, selected = false, onSelect = null } = $props();

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
  const danger = $derived(
    String(event?.risk ?? (Array.isArray(event?.dangerTags) ? event.dangerTags[0] : '') ?? '')
  );
  const dangerLabel = $derived(riskLabel(danger, localize));
  const dangerRiskClass = $derived(riskClass(danger));

  // The control's name is the visible name, then every state the row only draws (issue 1778).
  const accessibleName = $derived(
    [
      name,
      dangerLabel !== '' &&
        localize('FABRICATE.App.Gathering.Detail.Pips.Danger', { value: dangerLabel }),
      chance != null &&
        localize('FABRICATE.App.Gathering.Detail.EventChance', { x: toPercent(chance) }),
    ]
      .filter(Boolean)
      .join(', ')
  );

  function select() {
    onSelect?.(id);
  }
</script>

{#snippet thumb()}
  <span class="gathering-event-thumb-wrap">
    <img
      class="gathering-event-thumb"
      class:is-fallback={!img}
      src={img || DEFAULT_GATHERING_EVENT_IMG}
      alt=""
    />
  </span>
{/snippet}

{#snippet badges()}
  <span class={`gathering-event-danger is-danger ${dangerRiskClass}`}>
    <i class="fas fa-skull" aria-hidden="true"></i>
    <span>{dangerLabel}</span>
  </span>
{/snippet}

{#snippet copy()}
  <span
    class="gathering-event-description"
    class:is-fallback={!hasDescription}
    data-gathering-event-description>{descriptionText}</span
  >
{/snippet}

{#snippet odds()}
  <div class="gathering-event-chance" data-gathering-event-chance>
    <span class="gathering-event-chance-caption" aria-hidden="true"
      ><Kicker as="span">{localize('FABRICATE.App.Gathering.Detail.EventChanceLabel')}</Kicker
      ></span
    >
    <ChanceBar value={chance} scale="event" showCaption={false} />
  </div>
{/snippet}

<ListRow
  {name}
  density="default"
  class={['gathering-event-row', { 'is-selected': selected }]}
  role="listitem"
  data-event-id={id}
  data-selected={selected ? 'true' : 'false'}
  {selected}
  onOpen={select}
  openProps={{ class: 'gathering-event-summary', 'aria-label': accessibleName }}
  leading={thumb}
  badges={dangerLabel !== '' ? badges : undefined}
  children={copy}
  aside={chance != null ? odds : undefined}
/>

<style>
  .gathering-event-thumb-wrap {
    flex: 0 0 auto;
    width: 56px;
    height: 56px;
  }

  .gathering-event-thumb {
    display: block;
    width: 56px;
    height: 56px;
    border-radius: 9px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-event-thumb.is-fallback {
    object-fit: contain;
    padding: var(--fab-space-2);
    box-sizing: border-box;
  }

  /* Danger pip + tier icon colour, mirroring the header danger pip in
     GatheringDetail (success -> warning -> danger). */
  .gathering-event-danger {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
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
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--fab-space-2);
  }

  /* Clamped to two lines, as the task row's description is. */
  .gathering-event-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.5;
    white-space: normal;
    color: var(--fab-text-muted);
  }

  .gathering-event-description.is-fallback {
    font-style: italic;
    opacity: 0.85;
  }
</style>
