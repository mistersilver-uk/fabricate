<!-- Svelte 5 runes mode -->
<!--
  EnvironmentCard renders a single gathering environment in the player
  Environments column. It mirrors the GM environment-row look (64px thumb,
  ellipsised name, biome chips) using only base --fab-* tokens, since the GM
  rules are .fabricate-manager-scoped and lean on manager-only mv2 tokens.

  The card is a vertical stack: a `.gathering-env-card-main` row (thumb + copy)
  on top, then a full-width `.gathering-env-card-description` clamped to ~2
  lines beneath it (omitted entirely when the environment has no description).

  Two shapes:
   - Available: an interactive <button> inside the listitem. Clicking selects
     the card (highlight only — no center-column wiring yet).
   - Locked: a non-interactive, non-focusable <div role="listitem"> for
     disabled environments (shown to every viewer, GMs included), with a lock
     overlay rendered over the desaturated thumbnail and an accessible label.

  Blind environments (selectionMode === 'blind') show a mask badge in the
  name-row and — only when the effective revealPolicy !== 'never' — a
  "(discovered/total)" suffix with an accessible label.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { sceneDocumentImage } from '../../util/sceneImages.js';

  let {
    environment = null,
    selectionMode = 'list',
    selectedId = null,
    onSelect = null
  } = $props();

  const id = $derived(String(environment?.id ?? ''));
  const name = $derived(String(environment?.name ?? ''));
  const img = $derived(String(environment?.img ?? ''));
  const sceneUuid = $derived(String(environment?.sceneUuid ?? ''));

  // When the environment links a scene, show that scene's thumbnail instead of
  // the environment image (resolved client-side via fromUuid, mirroring
  // LinkedScene). Falls back to the environment image when there's no linked
  // scene or its thumbnail can't be resolved.
  let sceneThumb = $state('');
  $effect(() => {
    const uuid = sceneUuid;
    sceneThumb = '';
    if (!uuid || typeof globalThis.fromUuid !== 'function') return;
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid))
      .then(doc => {
        if (!cancelled && doc) sceneThumb = sceneDocumentImage(doc) || '';
      })
      .catch(() => {});
    return () => { cancelled = true; };
  });
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
      y: composedTaskCount
    })
  );
  const lockedLabel = $derived(
    localize('FABRICATE.App.Gathering.Environments.LockedAria', { name })
  );

  // Realm lock: the environment itself is out of the party's current realm. The
  // engine surfaces this as a locked teaser carrying location.available === false
  // plus a NO_CURRENT_REALM / LOCATION_BLOCKED blocked reason. Render a header
  // alert (next to the danger pip) and use the full reason text as its tooltip.
  const notInRealm = $derived(
    locked
      && environment?.location?.gated === true
      && environment?.location?.available === false
  );
  const realmAlertTitle = $derived(
    (Array.isArray(environment?.blockedReasons) ? environment.blockedReasons : [])
      .find(reason => reason?.code === 'NO_CURRENT_REALM' || reason?.code === 'LOCATION_BLOCKED')
      ?.message
    || localize('FABRICATE.App.Gathering.Environments.RealmLockedChip')
  );

  // Danger pill: always shown, icon-only, coloured by the environment's risk
  // tier with the full danger level in a tooltip. The engine always provides a
  // risk (defaulting to 'safe'), so this renders for every card.
  const KNOWN_RISKS = new Set(['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']);
  const risk = $derived(String(environment?.risk ?? 'safe') || 'safe');
  const dangerLabel = $derived(
    KNOWN_RISKS.has(risk) ? localize(`FABRICATE.App.Gathering.Detail.Risk.${risk}`) : risk
  );
  const riskClass = $derived(KNOWN_RISKS.has(risk) ? `risk-${risk}` : '');
  const dangerAria = $derived(
    localize('FABRICATE.App.Gathering.Detail.Pips.Danger', { value: dangerLabel })
  );

  function biomeChipStyle(tag) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(tag?.customColor || '') ? tag.customColor : '';
    const token = String(tag?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
  }

  function handleSelect() {
    if (locked) return;
    onSelect?.(id);
  }
</script>

{#snippet identity()}
  <span class="gathering-env-card-header">
    {#if blind}
      <span class="gathering-env-card-blind" title={localize('FABRICATE.App.Gathering.Environments.BlindChip')}>
        <i class="fas fa-mask" aria-hidden="true"></i>
        <span class="gathering-env-card-blind-label">{localize('FABRICATE.App.Gathering.Environments.BlindChip')}</span>
      </span>
    {/if}
    {#if notInRealm}
      <span class="gathering-env-card-realm-alert" title={realmAlertTitle}>
        <i class="fas fa-location-dot" aria-hidden="true"></i>
        <span class="gathering-env-card-realm-label">{localize('FABRICATE.App.Gathering.Environments.RealmLockedChip')}</span>
      </span>
    {/if}
    <span class={`gathering-env-card-event ${riskClass}`} aria-label={dangerAria}>
      <i class="fas fa-skull" aria-hidden="true"></i>
      <span class="gathering-env-card-event-label">{dangerLabel}</span>
    </span>
  </span>
  <span class="gathering-env-card-main">
    <span class="gathering-env-card-thumb-wrap">
      <img
        class="gathering-env-card-thumb"
        class:is-fallback={!displayImg}
        src={displayImg || 'icons/svg/door-closed.svg'}
        alt=""
      />
      {#if locked}
        <span class="gathering-env-card-lock-overlay" aria-hidden="true">
          <i class="fas fa-lock"></i>
        </span>
      {/if}
    </span>
    <span class="gathering-env-card-copy">
      <span class="gathering-env-card-name-row">
        <span class="gathering-env-card-name" title={name}>{name}</span>
        {#if showDiscovered}
          <span
            class="gathering-env-card-discovered"
            aria-label={discoveredLabel}
            title={discoveredLabel}
          >({discoveredTaskCount}/{composedTaskCount})</span>
        {/if}
      </span>
      {#if biomeTags.length > 0}
        <span class="gathering-env-card-chips" aria-hidden="false">
          {#each biomeTags as tag (tag.id)}
            <span class="gathering-env-card-chip" style={biomeChipStyle(tag)}>
              <i class={tag.icon} aria-hidden="true"></i>
              <span class="gathering-env-card-chip-label">{tag.label}</span>
            </span>
          {/each}
        </span>
      {/if}
    </span>
  </span>
  <!--
    The description renders on locked teasers too, by design: like the name,
    image, and biome chips it is identity-level info a player may see for a
    sealed environment. Only tasks/weights/counts are redacted from a locked
    listing; the description is not.
  -->
  {#if description !== ''}
    <span class="gathering-env-card-description">{description}</span>
  {/if}
{/snippet}

{#if locked}
  <div
    class="gathering-env-card is-locked gathering-env-card-slot"
    role="listitem"
    data-environment-id={id}
    data-locked="true"
    data-selection-mode={selectionMode}
    aria-label={lockedLabel}
    title={lockedLabel}
  >
    {@render identity()}
  </div>
{:else}
  <div class="gathering-env-card-slot" role="listitem">
    <button
      type="button"
      class="gathering-env-card is-available"
      class:is-selected={isSelected}
      data-environment-id={id}
      data-locked="false"
      data-selection-mode={selectionMode}
      data-selected={isSelected ? 'true' : 'false'}
      aria-pressed={isSelected}
      onclick={handleSelect}
    >
      {@render identity()}
    </button>
  </div>
{/if}

<style>
  /*
    Cards are direct flex children of the column scroll container
    (flex-direction: column) and default to flex-shrink: 1, which squashes the
    last card. Pin every card slot to its natural height so none collapse.
  */
  .gathering-env-card-slot {
    flex: 0 0 auto;
  }

  .gathering-env-card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-height: 76px;
    padding: 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
  }

  /*
    The available card is a <button>; Foundry's core .application button rules
    leak a fixed height, overflow clipping, and centred alignment that would
    crop the description and squash the top padding. Reset the button to lay
    out exactly like the locked <div>: a left-aligned, top-anchored, auto-height
    flex column.
  */
  .gathering-env-card.is-available {
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    font: inherit;
    line-height: normal;
    height: auto;
    overflow: visible;
    align-items: stretch;
    justify-content: flex-start;
  }

  .gathering-env-card.is-available:not(.is-selected):hover {
    background: var(--fab-surface-raised);
  }

  .gathering-env-card.is-available:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /*
    Selection is an accent-coloured border outline, NOT a box-shadow: the host
    rule `.fabricate-app button:focus:not(:focus-visible)` clears box-shadow on
    mouse-click focus, which would hide a shadow-based indicator until focus
    leaves the card. A border-color outline is immune to that reset.
  */
  .gathering-env-card.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-success-soft);
  }

  .gathering-env-card.is-locked {
    /* Keep text contrast-safe; only the image is desaturated. */
    color: var(--fab-text-muted);
  }

  .gathering-env-card-main {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
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
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-env-card-thumb.is-fallback {
    object-fit: contain;
    padding: 8px;
    box-sizing: border-box;
  }

  .gathering-env-card.is-locked .gathering-env-card-thumb {
    filter: saturate(0.65) brightness(0.85);
  }

  .gathering-env-card-lock-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    /* Theme-aware dark scrim + near-white icon via base overlay tokens. */
    background: var(--fab-overlay-dark-48);
    color: var(--fab-overlay-light-96);
  }

  .gathering-env-card-lock-overlay i {
    font-size: 20px;
  }

  .gathering-env-card-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .gathering-env-card-name-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .gathering-env-card-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .gathering-env-card.is-locked .gathering-env-card-name {
    /* Floor opacity so muted locked copy stays legible. */
    opacity: 0.85;
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

  .gathering-env-card.is-locked .gathering-env-card-chip-label {
    color: var(--fab-text-muted);
    opacity: 0.85;
  }

  .gathering-env-card-description {
    /* Full-width copy beneath the main row, clamped to ~2 lines. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  .gathering-env-card.is-locked .gathering-env-card-description {
    opacity: 0.85;
  }

  /*
    A short header bar at the top of the card holding the blind + danger chips,
    separated from the body by a soft divider. The negative margins make it
    full-bleed (cancelling the card's 10px top/side padding) so the divider spans
    the full card width; its own 6px vertical padding gives the chips a little
    breathing room above and below. Right-aligned so the chips stay top-right.
    Being in flow (not an overlay), it no longer steals width from the biome-chip
    row below.
  */
  .gathering-env-card-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin: -10px -10px 0;
    padding: 6px 10px;
    border-bottom: 1px solid var(--fab-border);
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

  /*
    Realm-lock alert: shown only when the environment is locked because the party
    isn't in its realm. Mirrors the warning-tone task callout pill so it reads as
    the same "not in current realm" indicator, just promoted to the env header.
  */
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

  /*
    Danger pill: an icon + level-name chip (mirrors the blind chip metrics). The
    skull icon escalates in colour with the environment's risk tier
    (success -> warning -> danger) via the risk-* rules below; the label keeps
    readable text colour. The base icon rule is the fallback for any unmapped
    risk value.
  */
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

  .gathering-env-card.is-locked .gathering-env-card-event-label {
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
