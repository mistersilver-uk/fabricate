<!-- Svelte 5 runes mode -->
<!--
  GatheringHazardDetail is the right column when the center column's Hazards tab
  is active — the "selected hazard" inspector, the hazard analogue of
  GatheringTaskDetail. It is read-only: hazards carry no Attempt action.

   - no hazard selected but hazards exist  -> "Select a hazard" hint
   - no hazards (or redacted for a blind site) -> "No hazards" hint
   - a hazard selected -> header (image, name), description, a danger-tag row, the
     per-hazard hazard-chance bar, and a details card listing the hazard's
     matching criteria (weather / time of day / biomes / regions) and any linked
     scene (reusing LinkedScene).
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import HazardChanceBar from './HazardChanceBar.svelte';
  import LinkedScene from './LinkedScene.svelte';
  import {
    getWeatherIcon,
    getWeatherLabelKey,
    getTimeOfDayIcon,
    getTimeOfDayLabelKey
  } from '../../util/gatheringConditionIcons.js';

  let {
    hazard = null,
    hasHazards = false,
    services = null
  } = $props();

  const name = $derived(String(hazard?.name ?? ''));
  const description = $derived(String(hazard?.description ?? ''));
  const hasDescription = $derived(description !== '');
  const descriptionText = $derived(
    hasDescription ? description : localize('FABRICATE.App.Gathering.Detail.NoHazardDescription')
  );
  const img = $derived(String(hazard?.img ?? ''));
  const chance = $derived(hazard?.chance ?? null);
  const sceneUuid = $derived(String(hazard?.linkedSceneUuid ?? ''));

  // All danger tags, each localized to the GM editor's risk labels when known.
  const KNOWN_RISKS = new Set(['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']);
  const dangerTags = $derived(Array.isArray(hazard?.dangerTags) ? hazard.dangerTags : []);
  function riskLabel(tag) {
    return KNOWN_RISKS.has(tag) ? localize(`FABRICATE.App.Gathering.Detail.Risk.${tag}`) : tag;
  }
  function riskClass(tag) {
    return KNOWN_RISKS.has(tag) ? `risk-${tag}` : '';
  }

  // Matching criteria (empty array = "any"); only non-empty groups are shown.
  // Weather and time-of-day chips reuse the shared condition icon/label helpers
  // (capitalized labels via the ActorBar i18n keys) so they match the rest of the
  // player app; biome chips use the resolved biomeTags (icon + colour + label)
  // like the environment's biome pips; regions are free-form text chips.
  const weatherChips = $derived(
    (Array.isArray(hazard?.weather) ? hazard.weather : []).map(id => ({
      id,
      icon: getWeatherIcon(id),
      label: localize(getWeatherLabelKey(id))
    }))
  );
  const timeOfDayChips = $derived(
    (Array.isArray(hazard?.timeOfDay) ? hazard.timeOfDay : []).map(id => ({
      id,
      icon: getTimeOfDayIcon(id),
      label: localize(getTimeOfDayLabelKey(id))
    }))
  );
  const biomeChips = $derived(Array.isArray(hazard?.biomeTags) ? hazard.biomeTags : []);
  const regions = $derived(Array.isArray(hazard?.regions) ? hazard.regions : []);

  function biomeChipStyle(tag) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(tag?.customColor || '') ? tag.customColor : '';
    const token = String(tag?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
  }

  const hasDetails = $derived(
    weatherChips.length > 0 || timeOfDayChips.length > 0 || biomeChips.length > 0
    || regions.length > 0 || sceneUuid !== ''
  );

  const titleId = 'gathering-hazard-detail-title';
</script>

{#if hazard == null}
  <div class="gathering-hazard-detail-state" data-gathering-hazard-detail-state={hasHazards ? 'empty' : 'none'}>
    <i class={`fas ${hasHazards ? 'fa-hand-pointer' : 'fa-shield-halved'}`} aria-hidden="true"></i>
    <p>
      {localize(hasHazards
        ? 'FABRICATE.App.Gathering.Detail.SelectHazardHint'
        : 'FABRICATE.App.Gathering.Detail.NoHazards')}
    </p>
  </div>
{:else}
  <section
    class="gathering-hazard-detail"
    aria-labelledby={titleId}
    aria-label={localize('FABRICATE.App.Gathering.Detail.HazardInspectorLabel')}
    data-gathering-hazard-detail
    data-detail-hazard-id={String(hazard?.id ?? '')}
  >
    <header class="gathering-hazard-detail-header">
      <span class="gathering-hazard-detail-thumb-wrap">
        <img class="gathering-hazard-detail-thumb" class:is-fallback={!img} src={img || 'icons/svg/hazard.svg'} alt="" />
      </span>
      <span class="gathering-hazard-detail-heading">
        <h2 id={titleId} class="gathering-hazard-detail-title" title={name}>{name}</h2>
        {#if dangerTags.length > 0}
          <ul class="gathering-hazard-detail-tags" data-gathering-hazard-tags>
            {#each dangerTags as tag (tag)}
              <li class={`gathering-hazard-detail-tag is-danger ${riskClass(tag)}`}>
                <i class="fas fa-skull" aria-hidden="true"></i>
                <span>{riskLabel(tag)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </span>
    </header>

    <p class="gathering-hazard-detail-description" class:is-fallback={!hasDescription}>{descriptionText}</p>

    {#if chance != null}
      <HazardChanceBar value={chance} />
    {/if}

    {#if hasDetails}
      <div class="gathering-hazard-detail-card" data-gathering-hazard-details>
        <p class="gathering-hazard-detail-card-heading">{localize('FABRICATE.App.Gathering.Detail.HazardConditionsHeading')}</p>

        {#if weatherChips.length > 0}
          <div class="gathering-hazard-detail-group" data-gathering-hazard-match="weather">
            <span class="gathering-hazard-detail-group-label">
              <i class="fas fa-cloud-sun" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.HazardWeather')}
            </span>
            <span class="gathering-hazard-detail-group-values">
              {#each weatherChips as chip (chip.id)}
                <span class="gathering-hazard-detail-chip">
                  <i class={chip.icon} aria-hidden="true"></i>
                  <span>{chip.label}</span>
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if timeOfDayChips.length > 0}
          <div class="gathering-hazard-detail-group" data-gathering-hazard-match="timeOfDay">
            <span class="gathering-hazard-detail-group-label">
              <i class="fas fa-clock" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.HazardTimeOfDay')}
            </span>
            <span class="gathering-hazard-detail-group-values">
              {#each timeOfDayChips as chip (chip.id)}
                <span class="gathering-hazard-detail-chip">
                  <i class={chip.icon} aria-hidden="true"></i>
                  <span>{chip.label}</span>
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if biomeChips.length > 0}
          <div class="gathering-hazard-detail-group" data-gathering-hazard-match="biomes">
            <span class="gathering-hazard-detail-group-label">
              <i class="fas fa-tree" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.HazardBiomes')}
            </span>
            <span class="gathering-hazard-detail-group-values">
              {#each biomeChips as tag (tag.id)}
                <span class="gathering-hazard-detail-chip is-biome" style={biomeChipStyle(tag)}>
                  <i class={tag.icon} aria-hidden="true"></i>
                  <span>{tag.label}</span>
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if regions.length > 0}
          <div class="gathering-hazard-detail-group" data-gathering-hazard-match="regions">
            <span class="gathering-hazard-detail-group-label">
              <i class="fas fa-map-location-dot" aria-hidden="true"></i>
              {localize('FABRICATE.App.Gathering.Detail.HazardRegions')}
            </span>
            <span class="gathering-hazard-detail-group-values">
              {#each regions as region (region)}
                <span class="gathering-hazard-detail-chip is-region"><span>{region}</span></span>
              {/each}
            </span>
          </div>
        {/if}

        {#if sceneUuid !== ''}
          <div class="gathering-hazard-detail-scene" data-gathering-hazard-scene>
            <LinkedScene {sceneUuid} {services} />
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .gathering-hazard-detail-state {
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

  .gathering-hazard-detail-state i {
    font-size: 32px;
  }

  .gathering-hazard-detail-state p {
    margin: 0;
    font-size: 14px;
  }

  .gathering-hazard-detail {
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

  .gathering-hazard-detail-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .gathering-hazard-detail-thumb-wrap {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
  }

  .gathering-hazard-detail-thumb {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-hazard-detail-thumb.is-fallback {
    object-fit: contain;
    padding: 10px;
    box-sizing: border-box;
  }

  .gathering-hazard-detail-heading {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .gathering-hazard-detail-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gathering-hazard-detail-tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .gathering-hazard-detail-tag {
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
  .gathering-hazard-detail-tag.is-danger i { color: var(--fab-danger, var(--fab-text-muted)); }
  .gathering-hazard-detail-tag.is-danger.risk-safe i { color: var(--fab-success); }
  .gathering-hazard-detail-tag.is-danger.risk-unsafe i { color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%); }
  .gathering-hazard-detail-tag.is-danger.risk-hazardous i { color: var(--fab-warning); }
  .gathering-hazard-detail-tag.is-danger.risk-dangerous i { color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%); }
  .gathering-hazard-detail-tag.is-danger.risk-deadly i,
  .gathering-hazard-detail-tag.is-danger.risk-extreme i { color: var(--fab-danger); }

  .gathering-hazard-detail-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fab-text);
  }

  .gathering-hazard-detail-description.is-fallback {
    font-style: italic;
    color: var(--fab-text-muted);
  }

  /* Matching-criteria card, styled like the task requirements card. */
  .gathering-hazard-detail-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
  }

  .gathering-hazard-detail-card-heading {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .gathering-hazard-detail-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gathering-hazard-detail-group-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .gathering-hazard-detail-group-label i {
    color: var(--fab-text-muted);
  }

  .gathering-hazard-detail-group-values {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .gathering-hazard-detail-chip {
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

  .gathering-hazard-detail-chip i {
    font-size: 10px;
    color: var(--fab-text-muted);
  }

  /* Biome chips mirror the environment biome pips: tinted by the tag colour. */
  .gathering-hazard-detail-chip.is-biome {
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised));
    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
  }

  .gathering-hazard-detail-chip.is-biome i {
    color: var(--fab-chip-color);
  }

  .gathering-hazard-detail-scene {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }
</style>
