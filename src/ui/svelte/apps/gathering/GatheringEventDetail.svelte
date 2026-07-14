<!-- Svelte 5 runes mode -->
<!--
  GatheringEventDetail is the right column when the center column's Events tab
  is active — the "selected event" inspector, the event analogue of
  GatheringTaskDetail. It is read-only: events carry no Attempt action.

   - no event selected but events exist  -> "Select an event" hint
   - no events (or redacted for a blind site) -> "No events" hint
   - an event selected -> header (image, name), description, a danger-tag row, the
     per-event event-chance bar, and a details card listing the event's
     matching criteria (weather / time of day / biomes / regions) and any linked
     scene (reusing LinkedScene).
-->
<script>
  import { DEFAULT_GATHERING_EVENT_IMG } from '../../../../gatheringImageDefaults.js';
  import { localize } from '../../util/foundryBridge.js';
  import { riskClass, riskLabel, biomeChipStyle, descriptionOrDefault } from '../../util/gatheringFormat.js';
  import ChanceBar from './ChanceBar.svelte';
  import LinkedScene from './LinkedScene.svelte';
  import {
    getWeatherIcon,
    getWeatherLabelKey,
    getTimeOfDayIcon,
    getTimeOfDayLabelKey
  } from '../../util/gatheringConditionIcons.js';

  let {
    event = null,
    hasEvents = false,
    services = null
  } = $props();

  const name = $derived(String(event?.name ?? ''));
  const description = $derived(String(event?.description ?? ''));
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    descriptionOrDefault(description, 'FABRICATE.App.Gathering.Detail.NoEventDescription', localize)
  );
  const img = $derived(String(event?.img ?? ''));
  const chance = $derived(event?.chance ?? null);
  const sceneUuid = $derived(String(event?.linkedSceneUuid ?? ''));

  // All danger tags, each localized to the GM editor's risk labels when known.
  const dangerTags = $derived(Array.isArray(event?.dangerTags) ? event.dangerTags : []);

  // Matching criteria (empty array = "any"); only non-empty groups are shown.
  // Weather and time-of-day chips reuse the shared condition icon/label helpers
  // (capitalized labels via the ActorBar i18n keys) so they match the rest of the
  // player app; biome chips use the resolved biomeTags (icon + colour + label)
  // like the environment's biome pips; regions are free-form text chips.
  const weatherChips = $derived(
    (Array.isArray(event?.weather) ? event.weather : []).map(id => ({
      id,
      icon: getWeatherIcon(id),
      label: localize(getWeatherLabelKey(id))
    }))
  );
  const timeOfDayChips = $derived(
    (Array.isArray(event?.timeOfDay) ? event.timeOfDay : []).map(id => ({
      id,
      icon: getTimeOfDayIcon(id),
      label: localize(getTimeOfDayLabelKey(id))
    }))
  );
  const biomeChips = $derived(Array.isArray(event?.biomeTags) ? event.biomeTags : []);
  const regions = $derived(Array.isArray(event?.regions) ? event.regions : []);

  const hasDetails = $derived(
    weatherChips.length > 0 || timeOfDayChips.length > 0 || biomeChips.length > 0
    || regions.length > 0 || sceneUuid !== ''
  );

  const titleId = 'gathering-event-detail-title';
</script>

{#if event == null}
  <div class="gathering-event-detail-state" data-gathering-event-detail-state={hasEvents ? 'empty' : 'none'}>
    <i class={`fas ${hasEvents ? 'fa-hand-pointer' : 'fa-masks-theater'}`} aria-hidden="true"></i>
    <p>
      {localize(hasEvents
        ? 'FABRICATE.App.Gathering.Detail.SelectEventHint'
        : 'FABRICATE.App.Gathering.Detail.NoEvents')}
    </p>
  </div>
{:else}
  <section
    class="gathering-event-detail"
    aria-labelledby={titleId}
    aria-label={localize('FABRICATE.App.Gathering.Detail.EventInspectorLabel')}
    data-gathering-event-detail
    data-detail-event-id={String(event?.id ?? '')}
  >
    <header class="gathering-event-detail-header">
      <span class="gathering-event-detail-thumb-wrap">
        <img class="gathering-event-detail-thumb" class:is-fallback={!img} src={img || DEFAULT_GATHERING_EVENT_IMG} alt="" />
      </span>
      <span class="gathering-event-detail-heading">
        <h2 id={titleId} class="gathering-event-detail-title" title={name}>{name}</h2>
        {#if dangerTags.length > 0}
          <ul class="gathering-event-detail-tags" data-gathering-event-tags>
            {#each dangerTags as tag (tag)}
              <li class={`gathering-event-detail-tag is-danger ${riskClass(tag)}`}>
                <i class="fas fa-skull" aria-hidden="true"></i>
                <span>{riskLabel(tag, localize)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </span>
    </header>

    <p class="gathering-event-detail-description" class:is-fallback={!hasDescription}>{descriptionText}</p>

    {#if chance != null}
      <ChanceBar value={chance} scale="event" />
    {/if}

    {#if hasDetails}
      <div class="gathering-event-detail-card" data-gathering-event-details>
        <p class="gathering-event-detail-card-heading">{localize('FABRICATE.App.Gathering.Detail.EventConditionsHeading')}</p>

        {#if weatherChips.length > 0}
          <div class="gathering-event-detail-group" data-gathering-event-match="weather">
            <span class="gathering-event-detail-group-label">
              <i class="fas fa-cloud-sun" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.EventWeather')}
            </span>
            <span class="gathering-event-detail-group-values">
              {#each weatherChips as chip (chip.id)}
                <span class="gathering-event-detail-chip">
                  <i class={chip.icon} aria-hidden="true"></i>
                  <span>{chip.label}</span>
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if timeOfDayChips.length > 0}
          <div class="gathering-event-detail-group" data-gathering-event-match="timeOfDay">
            <span class="gathering-event-detail-group-label">
              <i class="fas fa-clock" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.EventTimeOfDay')}
            </span>
            <span class="gathering-event-detail-group-values">
              {#each timeOfDayChips as chip (chip.id)}
                <span class="gathering-event-detail-chip">
                  <i class={chip.icon} aria-hidden="true"></i>
                  <span>{chip.label}</span>
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if biomeChips.length > 0}
          <div class="gathering-event-detail-group" data-gathering-event-match="biomes">
            <span class="gathering-event-detail-group-label">
              <i class="fas fa-tree" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.EventBiomes')}
            </span>
            <span class="gathering-event-detail-group-values">
              {#each biomeChips as tag (tag.id)}
                <span class="gathering-event-detail-chip is-biome" style={biomeChipStyle(tag)}>
                  <i class={tag.icon} aria-hidden="true"></i>
                  <span>{tag.label}</span>
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if regions.length > 0}
          <div class="gathering-event-detail-group" data-gathering-event-match="regions">
            <span class="gathering-event-detail-group-label">
              <i class="fas fa-map-location-dot" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.EventRegions')}
            </span>
            <span class="gathering-event-detail-group-values">
              {#each regions as region (region)}
                <span class="gathering-event-detail-chip is-region"><span>{region}</span></span>
              {/each}
            </span>
          </div>
        {/if}

        {#if sceneUuid !== ''}
          <div class="gathering-event-detail-scene" data-gathering-event-scene>
            <LinkedScene {sceneUuid} {services} />
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .gathering-event-detail-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: var(--fab-space-4);
    box-sizing: border-box;
    text-align: center;
    color: var(--fab-text-muted);
  }

  .gathering-event-detail-state i {
    font-size: 32px;
  }

  .gathering-event-detail-state p {
    margin: 0;
    font-size: 14px;
  }

  .gathering-event-detail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-3);
    box-sizing: border-box;
    overflow-y: auto;
    color: var(--fab-text);
  }

  .gathering-event-detail-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .gathering-event-detail-thumb-wrap {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
  }

  .gathering-event-detail-thumb {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-event-detail-thumb.is-fallback {
    object-fit: contain;
    padding: 10px;
    box-sizing: border-box;
  }

  .gathering-event-detail-heading {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .gathering-event-detail-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gathering-event-detail-tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .gathering-event-detail-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 12px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text);
  }

  /* Danger-tier icon colour, mirroring the center column's danger pip. */
  .gathering-event-detail-tag.is-danger i { color: var(--fab-danger, var(--fab-text-muted)); }
  .gathering-event-detail-tag.is-danger.risk-safe i { color: var(--fab-success); }
  .gathering-event-detail-tag.is-danger.risk-unsafe i { color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%); }
  .gathering-event-detail-tag.is-danger.risk-hazardous i { color: var(--fab-warning); }
  .gathering-event-detail-tag.is-danger.risk-dangerous i { color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%); }
  .gathering-event-detail-tag.is-danger.risk-deadly i,
  .gathering-event-detail-tag.is-danger.risk-extreme i { color: var(--fab-danger); }

  .gathering-event-detail-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text);
  }

  .gathering-event-detail-description.is-fallback {
    font-style: italic;
    color: var(--fab-text-muted);
  }

  /* Matching-criteria card, styled like the task requirements card. */
  .gathering-event-detail-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
  }

  .gathering-event-detail-card-heading {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .gathering-event-detail-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-event-detail-group-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-event-detail-group-label i {
    color: var(--fab-text-muted);
  }

  .gathering-event-detail-group-values {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .gathering-event-detail-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text);
    text-transform: capitalize;
  }

  .gathering-event-detail-chip i {
    font-size: 10px;
    color: var(--fab-text-muted);
  }

  /* Biome chips mirror the environment biome pips: tinted by the tag colour. */
  .gathering-event-detail-chip.is-biome {
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised));
    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
  }

  .gathering-event-detail-chip.is-biome i {
    color: var(--fab-chip-color);
  }

  .gathering-event-detail-scene {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }
</style>
