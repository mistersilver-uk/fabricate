<!-- Svelte 5 runes mode -->
<!--
  EnvironmentCard draws one gathering environment in the player Environments column as a
  selectable ListRow (issue 1778): the 64px thumb leads, the selection-mode summary, the realm
  alert and the danger (risk) level are badges after the name, the biomes are meta and the
  description is the row's content. An available environment is the row's one button; a locked
  teaser is the row's inert form, a listitem with no control, named by its own label.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { watchSceneImage } from './linkedSceneImage.js';
  import { riskClass, riskLabel, biomeChipStyle } from '../../util/gatheringFormat.js';
  import { DEFAULT_GATHERING_ENVIRONMENT_IMG } from '../../../../gatheringImageDefaults.js';
  import ListRow from '../../components/ListRow.svelte';

  let { environment = null, selectionMode = 'list', selectedId = null, onSelect = null } = $props();

  const id = $derived(String(environment?.id ?? ''));
  const name = $derived(String(environment?.name ?? ''));
  const img = $derived(String(environment?.img ?? ''));
  const sceneUuid = $derived(String(environment?.sceneUuid ?? ''));

  // A linked scene's image stands in for the environment's own, as in `GatheringDetail`'s header.
  let sceneThumb = $state('');
  $effect(() => watchSceneImage(sceneUuid, (image) => (sceneThumb = image)));
  const displayImg = $derived(sceneThumb || img);
  const description = $derived(String(environment?.description ?? ''));
  const locked = $derived(environment?.locked === true);
  const blind = $derived(environment?.selectionMode === 'blind');
  const revealPolicy = $derived(String(environment?.revealPolicy ?? 'never'));
  const discoveredTaskCount = $derived(Number(environment?.discoveredTaskCount ?? 0));
  const composedTaskCount = $derived(Number(environment?.composedTaskCount ?? 0));
  const biomeTags = $derived(Array.isArray(environment?.biomeTags) ? environment.biomeTags : []);
  const isSelected = $derived(!locked && id !== '' && selectedId === id);

  // The "(x/y)" discovered suffix is a blind-only teaser, shown only when the
  // effective reveal policy can ever reveal anything.
  const showDiscovered = $derived(blind && revealPolicy !== 'never');
  const discoveredLabel = $derived(
    localize('FABRICATE.App.Gathering.Environments.Discovered', {
      x: discoveredTaskCount,
      y: composedTaskCount,
    })
  );
  const blindLabel = localize('FABRICATE.App.Gathering.Environments.BlindChip');
  const lockedLabel = $derived(
    localize('FABRICATE.App.Gathering.Environments.LockedAria', { name })
  );

  // Realm lock: the environment itself is out of the party's current realm. The
  // engine surfaces this as a locked teaser carrying location.available === false
  // plus a NO_CURRENT_REALM / LOCATION_BLOCKED blocked reason. Render a header
  // alert (next to the danger pip) and use the full reason text as its tooltip.
  const notInRealm = $derived(
    locked && environment?.location?.gated === true && environment?.location?.available === false
  );
  const realmAlertTitle = $derived(
    (Array.isArray(environment?.blockedReasons) ? environment.blockedReasons : []).find(
      (reason) => reason?.code === 'NO_CURRENT_REALM' || reason?.code === 'LOCATION_BLOCKED'
    )?.message || localize('FABRICATE.App.Gathering.Environments.RealmLockedChip')
  );

  // Danger pill: always shown, icon-only, coloured by the environment's risk
  // tier with the full danger level in a tooltip. The engine always provides a
  // risk (defaulting to 'safe'), so this renders for every card.
  const risk = $derived(String(environment?.risk ?? 'safe') || 'safe');
  const dangerLabel = $derived(riskLabel(risk, localize));
  const dangerRiskClass = $derived(riskClass(risk));
  const dangerAria = $derived(
    localize('FABRICATE.App.Gathering.Detail.Pips.Danger', { value: dangerLabel })
  );

  // The control's name is the visible name, then every state the row only draws (issue 1778).
  const accessibleName = $derived(
    [name, showDiscovered && discoveredLabel, blind && blindLabel, dangerAria]
      .filter(Boolean)
      .join(', ')
  );

  function handleSelect() {
    if (locked) return;
    onSelect?.(id);
  }
</script>

{#snippet thumb()}
  <span class="gathering-env-card-thumb-wrap">
    <img
      class="gathering-env-card-thumb"
      class:is-fallback={!displayImg}
      src={displayImg || DEFAULT_GATHERING_ENVIRONMENT_IMG}
      alt=""
    />
    {#if locked}
      <span class="gathering-env-card-lock-overlay" aria-hidden="true">
        <i class="fas fa-lock"></i>
      </span>
    {/if}
  </span>
{/snippet}

{#snippet badges()}
  {#if showDiscovered}
    <span class="gathering-env-card-discovered" aria-label={discoveredLabel} title={discoveredLabel}
      >({discoveredTaskCount}/{composedTaskCount})</span
    >
  {/if}
  {#if blind}
    <span class="gathering-env-card-blind" title={blindLabel}>
      <i class="fas fa-mask" aria-hidden="true"></i>
      <span class="gathering-env-card-blind-label">{blindLabel}</span>
    </span>
  {/if}
  {#if notInRealm}
    <span class="gathering-env-card-realm-alert" title={realmAlertTitle}>
      <i class="fas fa-location-dot" aria-hidden="true"></i>
      <span class="gathering-env-card-realm-label"
        >{localize('FABRICATE.App.Gathering.Environments.RealmLockedChip')}</span
      >
    </span>
  {/if}
  <span class={`gathering-env-card-event ${dangerRiskClass}`} aria-label={dangerAria}>
    <i class="fas fa-skull" aria-hidden="true"></i>
    <span class="gathering-env-card-event-label">{dangerLabel}</span>
  </span>
{/snippet}

{#snippet biomes()}
  <span class="gathering-env-card-chips">
    {#each biomeTags as tag (tag.id)}
      <span class="gathering-env-card-chip" style={biomeChipStyle(tag)}>
        <i class={tag.icon} aria-hidden="true"></i>
        <span class="gathering-env-card-chip-label">{tag.label}</span>
      </span>
    {/each}
  </span>
{/snippet}

<!-- The description renders on locked teasers too, by design: like the name, image and biome
     chips it is identity-level info a player may see for a sealed environment. -->
{#snippet copy()}
  <span class="gathering-env-card-description">{description}</span>
{/snippet}

{#if locked}
  <ListRow
    {name}
    density="default"
    nameClass="gathering-env-card-name"
    class="gathering-env-card is-locked gathering-env-card-slot"
    role="listitem"
    data-environment-id={id}
    data-locked="true"
    data-selection-mode={selectionMode}
    aria-label={lockedLabel}
    title={lockedLabel}
    openProps={{}}
    leading={thumb}
    {badges}
    meta={biomeTags.length > 0 ? biomes : undefined}
    children={description !== '' ? copy : undefined}
  />
{:else}
  <ListRow
    {name}
    density="default"
    nameClass="gathering-env-card-name"
    class="gathering-env-card-slot"
    role="listitem"
    selected={isSelected}
    onOpen={handleSelect}
    openProps={{
      class: ['gathering-env-card', 'is-available', { 'is-selected': isSelected }],
      'data-environment-id': id,
      'data-locked': 'false',
      'data-selection-mode': selectionMode,
      'data-selected': isSelected ? 'true' : 'false',
      'aria-label': accessibleName,
    }}
    leading={thumb}
    {badges}
    meta={biomeTags.length > 0 ? biomes : undefined}
    children={description !== '' ? copy : undefined}
  />
{/if}

<style>
  /* The row is a flex child of the column's scroller, whose default shrink squashes the last
     card, so each keeps its natural height, never under the card's 76px floor. */
  :global(.gathering-env-card-slot) {
    flex: 0 0 auto;
    min-height: 76px;
  }

  .gathering-env-card-thumb-wrap {
    position: relative;
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
  }

  .gathering-env-card-thumb {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: 9px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-env-card-thumb.is-fallback {
    object-fit: contain;
    padding: 8px;
    box-sizing: border-box;
  }

  /* Keep text contrast-safe; only the image is desaturated. */
  :global(.gathering-env-card.is-locked) .gathering-env-card-thumb {
    filter: saturate(0.65) brightness(0.85);
  }

  .gathering-env-card-lock-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    /* Theme-aware dark scrim + near-white icon via base overlay tokens. */
    background: var(--fab-overlay-dark-48);
    color: var(--fab-overlay-light-96);
  }

  .gathering-env-card-lock-overlay i {
    font-size: 20px;
  }

  .gathering-env-card-discovered {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .gathering-env-card-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }

  .gathering-env-card-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.6;
    background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised));
    border: 1px solid var(--fab-border);
    border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);
  }

  .gathering-env-card-chip i {
    font-size: 10px;
    color: var(--fab-chip-color);
  }

  .gathering-env-card-chip-label {
    color: var(--fab-text);
  }

  /* Floor the opacity so muted locked copy stays legible. */
  :global(.gathering-env-card.is-locked .gathering-env-card-name) {
    color: var(--fab-text-muted);
    opacity: 0.85;
  }

  :global(.gathering-env-card.is-locked) .gathering-env-card-chip-label {
    color: var(--fab-text-muted);
    opacity: 0.85;
  }

  .gathering-env-card-description {
    /* Clamped to two lines. The 1.5 line-height's bottom half-leading keeps the second line's
       descenders inside the clamp box, and the row's own padding supplies the whitespace below:
       a padding-bottom here makes Chromium paint a sliver of the clamped-away third line. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.5;
    white-space: normal;
    color: var(--fab-text-muted);
  }

  :global(.gathering-env-card.is-locked) .gathering-env-card-description {
    opacity: 0.85;
  }

  .gathering-env-card-blind {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    color: var(--fab-text-muted);
  }

  .gathering-env-card-blind i {
    font-size: 11px;
  }

  /* Realm-lock alert: shown only when the environment is locked because the party isn't in its
     realm. Mirrors the warning-tone task callout pill, so it reads as the same indicator. */
  .gathering-env-card-realm-alert {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    border: 1px solid var(--fab-warning-border);
  }

  .gathering-env-card-realm-alert i {
    font-size: 11px;
  }

  /* Danger pill: an icon + level-name chip. The skull escalates in colour with the risk tier
     (success -> warning -> danger) via the risk-* rules below; the base icon rule is the
     fallback for any unmapped risk value. */
  .gathering-env-card-event {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
  }

  .gathering-env-card-event-label {
    color: var(--fab-text);
  }

  :global(.gathering-env-card.is-locked) .gathering-env-card-event-label {
    color: var(--fab-text-muted);
    opacity: 0.85;
  }

  .gathering-env-card-event i {
    font-size: 11px;
    color: var(--fab-danger);
  }

  .gathering-env-card-event.risk-safe i {
    color: var(--fab-success);
  }

  .gathering-env-card-event.risk-unsafe i {
    color: color-mix(in srgb, var(--fab-success) 55%, var(--fab-warning) 45%);
  }

  .gathering-env-card-event.risk-hazardous i {
    color: var(--fab-warning);
  }

  .gathering-env-card-event.risk-dangerous i {
    color: color-mix(in srgb, var(--fab-warning) 50%, var(--fab-danger) 50%);
  }

  .gathering-env-card-event.risk-deadly i,
  .gathering-env-card-event.risk-extreme i {
    color: var(--fab-danger);
  }
</style>
