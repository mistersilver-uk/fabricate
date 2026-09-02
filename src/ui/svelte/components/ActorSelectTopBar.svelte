<!-- Svelte 5 runes mode -->
<!--
  ActorSelectTopBar is the shared, content-width actor-selection bar above all
  unified-window tabs. Its left side is a portrait + caret trigger that opens a
  searchable popover of the user's selectable player characters. Its right side
  carries gathering-only context (current weather + time-of-day) and is empty on
  other tabs.

  The picker is `SearchablePopover` (issue 1475), and this is that primitive's
  FIRST player-window caller. It hand-rolled the same widget for its whole life —
  `aria-haspopup="dialog"`, a search field over a `role="listbox"` of
  `role="option"` rows, single selection, close-on-choose, dismiss-on-outside-click
  — and could not adopt the shared one until three things landed: issue 1464
  re-rooted the primitive's class family at `fabricate-picker` /
  `fabricate-picker-popover` (it used to hang off `.fabricate-manager`, so the panel
  drew entirely unstyled out here), issue 1466 replaced its hard-coded
  `closest('.fabricate-manager')` portal host with `resolveOverlayHost`, whose root
  set includes `fabricate-app`, and issue 1473 corrected the register that still
  asserted both were blocking.

  THE PANEL IS PORTALED NOW, not absolutely positioned inside this bar. It is
  appended to the player window's ApplicationV2 frame (`.fabricate-app`) and placed
  against its trigger by the primitive's own layout pass, so the popover rules that
  used to live in this file's scoped block are gone rather than rewritten — the
  primitive paints them. `tests/components/overlay-portal-host-position.test.js`
  measures that landing in a real browser, because the markup is identical whether
  the portal lands or not.

  What stays here is the TRIGGER's chrome, which is this bar's own: a 40px portrait
  in a 64px bar, not the primitive's 32px manager-row portrait. Those rules are
  `:global()` because the button is `SearchablePopover`'s element now — see the
  style block, which states each repair's specificity.

  All selection state lives in the shared `store` (services.actorBar); this
  component only renders it and calls back into it.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import {
    WEATHER_FALLBACK_ICON,
    TIME_OF_DAY_FALLBACK_ICON,
    getTimeOfDayLabelKey,
    getWeatherLabelKey,
  } from '../util/gatheringConditionIcons.js';
  import ComponentSourcesBar from '../apps/crafting/ComponentSourcesBar.svelte';
  import SearchablePopover from '../apps/manager/SearchablePopover.svelte';

  let {
    store = null,
    services = null,
    activeTab = 'crafting',
    onActorChange = null,
    activeCanvasTool = null,
  } = $props();

  const FALLBACK_PORTRAIT_ICON = 'fas fa-user';

  const selectableActors = $derived(store?.selectableActors ?? []);
  const selectedActor = $derived(store?.selectedActor ?? null);
  const hasActors = $derived(selectableActors.length > 0);
  const isGathering = $derived(activeTab === 'gathering');
  const isCrafting = $derived(activeTab === 'crafting');
  // The Inventory tab pulls owned components from the same component-source actors
  // as Crafting, so it surfaces the same source picker in the shared bar.
  const isInventory = $derived(activeTab === 'inventory');
  // The Alchemy workbench pulls owned components from the same component-source
  // actors as Crafting (AlchemyView wires `services.craftingSources` and the store
  // reads `selectedSourceIds`), so it too surfaces the shared source picker.
  const isAlchemy = $derived(activeTab === 'alchemy');
  const showSourcesBar = $derived(isCrafting || isInventory || isAlchemy);

  // The active station tool's display name, shown in a status chip in the
  // right-side context cluster when the GM granted activation of a Tool-station
  // interactable region (the player walked their token into it and clicked
  // Interact). Falls back to the localized label when the tool carries no name.
  // Empty when no station tool is active.
  const activeToolName = $derived(
    activeCanvasTool
      ? typeof activeCanvasTool.label === 'string' && activeCanvasTool.label.trim()
        ? activeCanvasTool.label.trim()
        : localize('FABRICATE.App.ActiveTool.Label')
      : ''
  );

  // The right-side context cluster renders when there is gathering context, the
  // crafting tab's component-sources bar, OR an active station tool chip to
  // surface (forward-compatible: the chip appears on whatever tab is active).
  const hasRightContext = $derived(isGathering || showSourcesBar || Boolean(activeCanvasTool));

  // The bar is "ready" once its selectable list and conditions have loaded, so
  // the smoke harness can wait on a mounted, conditions-loaded bar.
  const barState = $derived(store?.loaded && store?.conditions ? 'ready' : 'loading');

  // The right-side condition icons match the GM gathering-settings UI, which
  // uses fixed category icons (fa-cloud-sun for weather, fa-clock for time of
  // day) rather than per-value icons; the label still shows the current value.
  const weatherId = $derived(store?.conditions?.weather ?? null);
  const weatherIcon = WEATHER_FALLBACK_ICON;
  const weatherLabel = $derived(localize(getWeatherLabelKey(weatherId)));
  const timeOfDayId = $derived(store?.conditions?.timeOfDay ?? null);
  const timeOfDayIcon = TIME_OF_DAY_FALLBACK_ICON;
  const timeOfDayLabel = $derived(localize(getTimeOfDayLabelKey(timeOfDayId)));

  // Each condition chip displays only when the active gathering system enables
  // that dimension (pushed from the gathering view via setConditionVisibility).
  // A missing flag defaults to shown.
  const showWeather = $derived(store?.conditionVisibility?.weather !== false);
  const showTimeOfDay = $derived(store?.conditionVisibility?.timeOfDay !== false);

  // The current-realm chip appears only when the active gathering system's
  // realm/travel subsystem is enabled (pushed via setRealmContext). It shows
  // the party's current realm name(s) — redaction-safe, so a secret undiscovered
  // realm resolves to the "Undiscovered realm" placeholder — or "No current
  // realm" when the party has no resolved current realm (the realm is GM/travel-
  // driven, not player-selected).
  const showRealm = $derived(store?.realmContext?.enabled === true);
  const realmNames = $derived(
    (store?.realmContext?.realms ?? [])
      .map((realm) =>
        realm?.placeholder
          ? localize(realm.labelKey || 'FABRICATE.Gathering.Realm.UndiscoveredPlaceholder')
          : String(realm?.label ?? '')
      )
      .filter((name) => name.trim() !== '')
  );
  const realmLabel = $derived(
    realmNames.length > 0 ? realmNames.join(', ') : localize('FABRICATE.App.ActorBar.Realm.None')
  );
  // Accessible name for the chip — the chip is the player's primary diagnostic
  // signal in the all-locked / no-current-realm state, so name it explicitly
  // ("Realm: <value>") rather than relying on the bare value text.
  const realmAriaLabel = $derived(
    `${localize('FABRICATE.App.ActorBar.Realm.Label')}: ${realmLabel}`
  );

  // The selected character's stamina pool for the active stamina-mode system,
  // surfaced contextually on the gathering tab. Null in nodes/none mode.
  const staminaPool = $derived(store?.staminaPool ?? null);
  const hasStamina = $derived(
    Boolean(staminaPool && staminaPool.current != null && staminaPool.max != null)
  );
  const staminaPct = $derived(
    hasStamina && staminaPool.max > 0
      ? Math.max(0, Math.min(100, Math.round((staminaPool.current / staminaPool.max) * 100)))
      : 0
  );

  function hasImg(actor) {
    return typeof actor?.img === 'string' && actor.img.trim() !== '';
  }

  const triggerName = $derived(selectedActor?.name || localize('FABRICATE.App.ActorBar.Trigger'));
  const triggerImg = $derived(selectedActor && hasImg(selectedActor) ? selectedActor.img : '');

  // `img` OR `icon` per option, never an empty `src`: `SearchablePopover` renders the
  // portrait tile only when `img` is set and falls through to `icon` otherwise, which is the
  // same shape `PartyTravelActorPanel` builds for the World > Parties actor picker. An
  // `img: ''` would render `<img src="">`, which this bar has refused since it shipped.
  const actorOptions = $derived(
    selectableActors.map((actor) => ({
      id: actor?.id ?? '',
      label: String(actor?.name ?? ''),
      img: hasImg(actor) ? actor.img : undefined,
      icon: hasImg(actor) ? undefined : FALLBACK_PORTRAIT_ICON,
    }))
  );

  // TWO reasons, in precedence order, mirroring `PartyTravelActorPanel`. The zero-actor
  // reason names a module setting the player cannot see, which is prose and belongs in the
  // body — `SearchablePopover` feeds `emptyHint` to `EmptyState`'s TITLE slot, an `<h3>` with
  // no width cap, so a paragraph handed to it sets as a multi-line serif heading. The
  // search-miss reason is complete in a line and carries no body.
  //
  // The zero-actor branch is defensive rather than reachable today: the trigger is
  // `disabled` with no actors, so the panel cannot be opened to read it. It is derived
  // anyway because the shipped copy was the OTHER way round — the long
  // "no player-character type" explanation was the only empty string the panel could render,
  // and the state it actually renders in is the search miss.
  const pickerEmptyHint = $derived(
    hasActors
      ? localize('FABRICATE.App.ActorBar.NoMatches')
      : localize('FABRICATE.App.ActorBar.NoActorsTitle')
  );
  const pickerEmptyDetail = $derived(hasActors ? '' : localize('FABRICATE.App.ActorBar.NoActors'));

  function chooseActor(id) {
    const actorId = id ?? '';
    store?.selectActor(actorId);
    onActorChange?.(actorId);
  }
</script>

<div class="fabricate-app-actor-bar" data-actor-bar-state={barState}>
  <!-- No wrapper element around the picker. The `.actor-bar-left` div this replaces existed
       to be the dismiss region, the `position: relative` anchor for the in-place panel, and
       the bar's left flex item. The primitive owns the first two now, and it is the flex item
       itself — `.fabricate-picker.manager-travel-picker` already declares `position: relative;
       min-width: 0`, and `flex: 0 1 auto` was the initial value the deleted rule restated.

       `actor-bar-popover` carries NO style. It is the hook the perf scenarios and the View Lab
       case address the portaled panel by, in the same way `.manager-travel-actor-popover` is
       World > Parties' capture hook: once the panel is appended to `.fabricate-app` it is no
       longer a descendant of anything this bar writes, so a hook has to travel ON it. -->
  <SearchablePopover
    options={actorOptions}
    value={store?.selectedActorId ?? ''}
    disabled={!hasActors}
    pickerClass="actor-bar-picker"
    popoverClass="actor-bar-popover"
    triggerClass="actor-bar-trigger"
    valueClass="actor-bar-trigger-label"
    {triggerImg}
    triggerIcon={FALLBACK_PORTRAIT_ICON}
    triggerLabel={triggerName}
    triggerTitle={triggerName}
    triggerAriaLabel={triggerName}
    dialogAriaLabel={localize('FABRICATE.App.ActorBar.DialogLabel')}
    searchPlaceholder={localize('FABRICATE.App.ActorBar.SearchPlaceholder')}
    searchAriaLabel={localize('FABRICATE.App.ActorBar.SearchLabel')}
    emptyHint={pickerEmptyHint}
    emptyDetail={pickerEmptyDetail}
    onChoose={chooseActor}
  />

  {#if hasRightContext}
    <div class="actor-bar-right">
      <!-- Session-scoped status chip: announces the active canvas station tool
           (set when a Tool-station region activation is granted). Sits at the
           leading edge of the right context cluster, before the gathering
           conditions. aria-live so screen readers announce it appearing. -->
      <span class="actor-bar-tool-chip-slot" aria-live="polite">
        {#if activeCanvasTool}
          <span class="actor-bar-condition actor-bar-tool-chip" title={activeToolName}>
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            <span class="actor-bar-condition-label"
              >{localize('FABRICATE.App.ActiveTool.Named', { label: activeToolName })}</span
            >
          </span>
        {/if}
      </span>
      {#if isGathering}
        {#if hasStamina}
          <span
            class="actor-bar-stamina"
            title={localize('FABRICATE.App.ActorBar.Stamina')}
            data-actor-bar-stamina
          >
            <i class="fas fa-bolt" aria-hidden="true"></i>
            <span class="actor-bar-stamina-track">
              <span class="actor-bar-stamina-fill" style={`width:${staminaPct}%`}></span>
            </span>
            <span class="actor-bar-stamina-value">{staminaPool.current}/{staminaPool.max}</span>
          </span>
        {/if}
        {#if showWeather}
          <span class="actor-bar-condition actor-bar-weather">
            <i class={weatherIcon} aria-hidden="true"></i>
            <span class="actor-bar-condition-label">{weatherLabel}</span>
          </span>
        {/if}
        {#if showTimeOfDay}
          <span class="actor-bar-condition actor-bar-time">
            <i class={timeOfDayIcon} aria-hidden="true"></i>
            <span class="actor-bar-condition-label">{timeOfDayLabel}</span>
          </span>
        {/if}
        <!-- The realm chip is the player's primary diagnostic signal in the
             all-locked / no-current-realm state; announce its appearance and
             value changes politely (matching the tool-chip-slot pattern above). -->
        <span class="actor-bar-realm-slot" aria-live="polite">
          {#if showRealm}
            <span
              class="actor-bar-condition actor-bar-realm"
              title={realmLabel}
              aria-label={realmAriaLabel}
            >
              <i class="fas fa-map-location-dot" aria-hidden="true"></i>
              <span class="actor-bar-condition-label">{realmLabel}</span>
            </span>
          {/if}
        </span>
      {/if}
      {#if showSourcesBar}
        <!-- The Crafting, Inventory and Alchemy tabs surface the component-source
             actor picker (whose inventories the listing pulls from) in the right slot. -->
        <ComponentSourcesBar {services} />
      {/if}
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
    /* No overflow:hidden. The picker panel no longer renders in place — it is portaled to
       `.fabricate-app` (issue 1475) — but the bar's children still manage their own
       horizontal overflow via min-width:0 + ellipsis, and a clip here would cut the
       trigger's focus ring. */
  }

  /* ── THE TRIGGER, WHICH IS `SearchablePopover`'s ELEMENT NOW ────────────────────────────
     Every rule below selects a class this component HANDS to `<SearchablePopover>` through
     `triggerClass` / `valueClass` / `pickerClass`, or one the primitive writes on its own
     trigger body. The scoped spelling would compile with this component's `svelte-<hash>`
     appended to a compound that has to match an element this component does not write, so
     each is `:global()` around the WHOLE selector — `:global(.ancestor) .child` leaves
     `.child` as the only scoped compound and puts the hash straight back on the element that
     cannot carry it. `tests/components/manager-button-scoped-class-reach.test.js` is the
     guard; it was run red-then-green over each of these.

     SPECIFICITY IS PRESERVED EXACTLY, which is why `.actor-bar-picker` is here rather than
     dropped: the scoped forms were `.actor-bar-trigger.svelte-<hash>` and friends, so a bare
     `:global(.actor-bar-trigger)` would be one class light and would smuggle a cascade change
     in as a repair. `.actor-bar-picker` is the class this component hands the primitive's own
     root, so the anchor is local rather than borrowed. */
  :global(.actor-bar-picker .actor-bar-trigger) {
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

  :global(.actor-bar-picker .actor-bar-trigger:disabled) {
    cursor: default;
    opacity: 0.6;
  }

  :global(.actor-bar-picker .actor-bar-trigger:hover:not(:disabled)) {
    background: var(--fab-surface-raised);
  }

  :global(.actor-bar-picker .actor-bar-trigger:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* THE PORTRAIT IS THE PRIMITIVE'S NOW, AT THE PRIMITIVE'S SCALE, and that is a deliberate
     visual change rather than an oversight. The bar drew a 40px `.actor-bar-portrait` tile;
     `styles/fabricate.css` draws `.fabricate-picker .manager-travel-portrait` at 32px, and it is
     the same tile the panel's option rows use — so overriding it here would have made the trigger
     and the rows below it disagree, and would have kept a 40px control height the design system
     retired (`control-height-known-literals.js` banked this file's last one, and this conversion
     pays it down). `ChecksRightMenu`'s preview-actor picker is the other actor picker in the
     corpus and already presents exactly this way.

     The same reasoning settles the portrait-LESS state. The primitive frames `triggerImg` in the
     tile and renders `triggerIcon` as a bare glyph, in the trigger and in the rows alike, so
     leaving it bare keeps one control reading one way in both of its states.

     Both of the trigger's direct glyphs — the chevron and that fallback portrait — take the muted
     colour below. It replaces `.actor-bar-trigger-caret`, whose wrapper `<span>` the primitive
     does not render, and carries the colour the deleted `.actor-bar-portrait` gave the glyph; both
     were `var(--fab-text-muted)`, so one rule answers for both. */
  :global(.actor-bar-picker .actor-bar-trigger > i) {
    flex: 0 0 auto;
    color: var(--fab-text-muted);
  }

  :global(.actor-bar-picker .actor-bar-trigger-label) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
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

  /* aria-live wrapper for the station-tool chip. display:contents keeps the
     wrapper out of the flex layout so an empty slot (no active tool) adds no
     gap, while the chip child becomes a direct flex item of .actor-bar-right. */
  .actor-bar-tool-chip-slot {
    display: contents;
  }

  /* aria-live wrapper for the current-realm chip. Same display:contents trick as
     the tool-chip slot: an empty slot (realm subsystem off, or chip absent) adds
     no gap, while the chip child stays a direct flex item of .actor-bar-right. */
  .actor-bar-realm-slot {
    display: contents;
  }

  /* Active station-tool chip. Sits alongside the gathering condition chips but
     takes the accent pill treatment so it reads as the active session context. */
  .actor-bar-tool-chip {
    flex: 0 1 auto;
    padding: 3px 10px;
    color: var(--fab-accent);
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent);
    border-radius: 999px;
  }

  .actor-bar-tool-chip .actor-bar-condition-label {
    color: var(--fab-accent);
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

  /* ── THE PANEL'S OWN RULES ARE DELETED, NOT REPAIRED ──────────────────────────────────
     Ten rules used to live here — `.actor-bar-popover`, `.actor-bar-search`, its `input`,
     `.actor-bar-options`, the four `.actor-bar-option` states, `.actor-bar-option-name` and
     `.actor-bar-empty` — plus the `.actor-bar-portrait` pair the option rows shared with the
     trigger. Every one of them named markup this component no longer writes, so wrapping them
     in `:global()` would have reached nothing at all: the primitive emits
     `.manager-travel-popover`, `.manager-travel-popover-search`, `.manager-travel-option`,
     `.manager-travel-option-name` and an `EmptyState` instead, and `styles/fabricate.css`
     already paints every one of them off `.fabricate-picker-popover`.

     Restating them would also be the thing `openspec/specs/design-system/spec.md` forbids in
     as many words — "the primitive paints there without the caller restating its rules". The
     measured consequence is that the OPEN panel adopts the primitive's presentation: 40px
     option rows with 32px portraits over the sheet's `--fab-bg-3` panel, rather than this
     bar's 48px rows with 40px portraits. That is the same panel `ChecksRightMenu`'s
     preview-actor picker draws, which is the other actor picker in the corpus.

     Deleting a dead rule is not the same as noticing it is dead. All ten compiled with the
     scoping hash attached and matched nothing, with ZERO compiler warnings — this file holds
     five regular elements with an expression-valued `class`, which is the condition that
     silences `css_unused_selector` — so `lint:svelte:warnings` reports clean over them and
     `css.code` byte-identity does not see them either. */
</style>
