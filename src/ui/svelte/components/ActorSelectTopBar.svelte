<!-- Svelte 5 runes mode -->
<!--
  ActorSelectTopBar is the shared, content-width actor-selection bar above all
  unified-window tabs. Its left side is a portrait + caret trigger that opens a
  searchable popover of the user's selectable player characters (reusing the
  IconPicker popover pattern). Its right side carries gathering-only context
  (current time-of-day + region) and is empty on other tabs.

  All selection state lives in the shared `store` (services.actorBar); this
  component only renders it and calls back into it.
-->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import {
    WEATHER_FALLBACK_ICON,
    TIME_OF_DAY_FALLBACK_ICON,
    getTimeOfDayLabelKey,
    getWeatherLabelKey
  } from '../util/gatheringConditionIcons.js';

  let { store = null, activeTab = 'crafting', onActorChange = null } = $props();

  const FALLBACK_PORTRAIT_ICON = 'fas fa-user';

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let pickerRoot = $state(null);
  let searchInput = $state(null);

  const selectableActors = $derived(store?.selectableActors ?? []);
  const selectedActor = $derived(store?.selectedActor ?? null);
  const hasActors = $derived(selectableActors.length > 0);
  const isGathering = $derived(activeTab === 'gathering');

  // The bar is "ready" once its selectable list and conditions have loaded, so
  // the smoke harness can wait on a mounted, conditions-loaded bar.
  const barState = $derived(store?.loaded && store?.conditions ? 'ready' : 'loading');

  const filteredActors = $derived(
    selectableActors.filter((actor) => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return String(actor?.name ?? '').toLowerCase().includes(term);
    })
  );

  // The right-side condition icons match the GM gathering-settings UI, which
  // uses fixed category icons (fa-cloud-sun for weather, fa-clock for time of
  // day) rather than per-value icons; the label still shows the current value.
  const weatherId = $derived(store?.conditions?.weather ?? null);
  const weatherIcon = WEATHER_FALLBACK_ICON;
  const weatherLabel = $derived(localize(getWeatherLabelKey(weatherId)));
  const timeOfDayId = $derived(store?.conditions?.timeOfDay ?? null);
  const timeOfDayIcon = TIME_OF_DAY_FALLBACK_ICON;
  const timeOfDayLabel = $derived(localize(getTimeOfDayLabelKey(timeOfDayId)));
  const regionLabel = $derived(store?.region || localize('FABRICATE.App.ActorBar.Region.None'));

  // The selected character's stamina pool for the active stamina-mode system,
  // surfaced contextually on the gathering tab. Null in nodes/none mode.
  const staminaPool = $derived(store?.staminaPool ?? null);
  const hasStamina = $derived(Boolean(staminaPool && staminaPool.current != null && staminaPool.max != null));
  const staminaPct = $derived(
    hasStamina && staminaPool.max > 0
      ? Math.max(0, Math.min(100, Math.round((staminaPool.current / staminaPool.max) * 100)))
      : 0
  );

  function hasImg(actor) {
    return typeof actor?.img === 'string' && actor.img.trim() !== '';
  }

  function closePicker() {
    pickerOpen = false;
    searchTerm = '';
  }

  function togglePicker() {
    if (!hasActors) return;
    if (pickerOpen) {
      closePicker();
      return;
    }
    pickerOpen = true;
  }

  function chooseActor(actor) {
    const id = actor?.id ?? '';
    store?.selectActor(id);
    onActorChange?.(id);
    closePicker();
  }

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });
</script>

<div
  bind:this={pickerRoot}
  class="fabricate-app-actor-bar"
  data-actor-bar-state={barState}
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker
  }}
>
  <div class="actor-bar-left">
    <button
      type="button"
      class="actor-bar-trigger"
      onclick={togglePicker}
      disabled={!hasActors}
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
      aria-label={selectedActor?.name || localize('FABRICATE.App.ActorBar.Trigger')}
      title={selectedActor?.name || localize('FABRICATE.App.ActorBar.Trigger')}
    >
      <span class="actor-bar-portrait" aria-hidden="true">
        {#if selectedActor && hasImg(selectedActor)}
          <img src={selectedActor.img} alt="" />
        {:else}
          <i class={FALLBACK_PORTRAIT_ICON}></i>
        {/if}
      </span>
      <span class="actor-bar-trigger-label" title={selectedActor?.name || ''}>
        {selectedActor?.name || localize('FABRICATE.App.ActorBar.Trigger')}
      </span>
      <span class="actor-bar-trigger-caret" aria-hidden="true">
        <i class={`fas ${pickerOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
      </span>
    </button>

    {#if pickerOpen}
      <div
        class="actor-bar-popover"
        role="dialog"
        aria-label={localize('FABRICATE.App.ActorBar.DialogLabel')}
      >
        <div class="actor-bar-search">
          <input
            bind:this={searchInput}
            bind:value={searchTerm}
            type="text"
            placeholder={localize('FABRICATE.App.ActorBar.SearchPlaceholder')}
            aria-label={localize('FABRICATE.App.ActorBar.SearchLabel')}
          />
        </div>

        <div
          class="actor-bar-options"
          role="listbox"
          aria-label={localize('FABRICATE.App.ActorBar.DialogLabel')}
        >
          {#each filteredActors as actor (actor.id)}
            <button
              type="button"
              class="actor-bar-option"
              class:is-selected={actor.id === store?.selectedActorId}
              role="option"
              aria-selected={actor.id === store?.selectedActorId}
              title={actor.name}
              onclick={() => chooseActor(actor)}
            >
              <span class="actor-bar-portrait" aria-hidden="true">
                {#if hasImg(actor)}
                  <img src={actor.img} alt="" />
                {:else}
                  <i class={FALLBACK_PORTRAIT_ICON}></i>
                {/if}
              </span>
              <span class="actor-bar-option-name">{actor.name}</span>
            </button>
          {:else}
            <p class="hint actor-bar-empty">
              {localize('FABRICATE.App.ActorBar.NoActors')}
            </p>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if isGathering}
    <div class="actor-bar-right">
      {#if hasStamina}
        <span class="actor-bar-stamina" title={localize('FABRICATE.App.ActorBar.Stamina')} data-actor-bar-stamina>
          <i class="fas fa-bolt" aria-hidden="true"></i>
          <span class="actor-bar-stamina-track">
            <span class="actor-bar-stamina-fill" style={`width:${staminaPct}%`}></span>
          </span>
          <span class="actor-bar-stamina-value">{staminaPool.current}/{staminaPool.max}</span>
        </span>
      {/if}
      <span class="actor-bar-condition actor-bar-weather">
        <i class={weatherIcon} aria-hidden="true"></i>
        <span class="actor-bar-condition-label">{weatherLabel}</span>
      </span>
      <span class="actor-bar-condition actor-bar-time">
        <i class={timeOfDayIcon} aria-hidden="true"></i>
        <span class="actor-bar-condition-label">{timeOfDayLabel}</span>
      </span>
      <span class="actor-bar-condition actor-bar-region">
        <i
          class="fas fa-map-location-dot"
          aria-hidden="true"
          title={localize('FABRICATE.App.ActorBar.Region.Label')}
        ></i>
        <span class="actor-bar-condition-label" title={store?.region || ''}>{regionLabel}</span>
      </span>
    </div>
  {/if}
</div>

<style>
  .fabricate-app-actor-bar {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-4);
    padding: 8px 12px;
    min-height: 64px;
    border-bottom: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    /* No overflow:hidden — the picker popover renders in-place below the trigger
       and must be allowed to overflow the bar downward. Bar children manage
       their own horizontal overflow via min-width:0 + ellipsis. */
  }

  .actor-bar-left {
    position: relative;
    flex: 0 1 auto;
    min-width: 0;
  }

  .actor-bar-trigger {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    max-width: 260px;
    /* height:auto + min-height override Foundry's fixed global button height, so
       the 40px portrait is contained instead of overflowing a short button. */
    height: auto;
    min-height: 52px;
    padding: 6px 12px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .actor-bar-trigger:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .actor-bar-trigger:hover:not(:disabled) {
    background: var(--fab-surface-raised);
  }

  .actor-bar-trigger:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .actor-bar-portrait {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
  }

  .actor-bar-portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .actor-bar-trigger-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .actor-bar-trigger-caret {
    flex: 0 0 auto;
    color: var(--fab-text-muted);
  }

  .actor-bar-right {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--fab-space-4);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .actor-bar-condition {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
    color: var(--fab-text-muted);
  }


  .actor-bar-condition-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fab-text);
  }

  /* Contextual stamina bar (gathering tab, stamina mode only). */
  .actor-bar-stamina {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--fab-text-muted);
  }

  .actor-bar-stamina-track {
    width: 72px;
    height: 6px;
    border-radius: 999px;
    background: var(--fab-surface-raised);
    overflow: hidden;
  }

  .actor-bar-stamina-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--fab-accent);
    transition: width 0.2s ease;
  }

  .actor-bar-stamina-value {
    color: var(--fab-text);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .actor-bar-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 4000;
    display: flex;
    flex-direction: column;
    width: max-content;
    min-width: 240px;
    max-width: 340px;
    max-height: min(60vh, 420px);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    box-shadow: var(--fab-shadow-lg);
    overflow: hidden;
  }

  .actor-bar-search {
    padding: 8px;
    border-bottom: 1px solid var(--fab-border);
  }

  .actor-bar-search input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
  }

  .actor-bar-options {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    overflow-y: auto;
  }

  .actor-bar-option {
    /* width:100% + justify-content:flex-start override Foundry's global button
       (which centers content and shrinks to fit), so each row is full-width with
       the portrait + name flush-left. height:auto frees the row to fit the 40px
       portrait rather than Foundry's fixed button height. */
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    height: auto;
    min-height: 48px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .actor-bar-option:hover {
    background: var(--fab-surface-raised);
  }

  .actor-bar-option.is-selected {
    background: var(--fab-accent-soft);
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  .actor-bar-option:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .actor-bar-option-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .actor-bar-empty {
    margin: 0;
    padding: 8px;
    color: var(--fab-text-muted);
    font-size: 13px;
  }
</style>
