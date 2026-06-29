<!-- Svelte 5 runes mode -->
<!--
  InteractablesManagerRoot — the GM "Manage Interactables" scene panel body
  (issue 335).

  Two surfaces, both driven through the injected `services` bag (pure helpers
  behind the shell):

    1. LIST — every `fabricate.interactable` on the current scene as a row with
       name, type (tool / gathering task), source label, state (enabled / locked /
       consumed), and marker status (Tile / Drawing / Token / region-only /
       missing). Each row offers: open rich config, jump to region, delete (delete
       routed through services.confirmDialog → DialogV2.confirm at the shell edge).

    2. PROMOTE — pick an existing drawn region of ANY shape and a Tool / Gathering
       Task source, then build the behaviour via the SHARED builder and attach it
       to that region (with an optional Tile/Drawing marker, or region-only).

  All decisions (scan → rows, promote → spawn request) are pure helpers in the
  shell; this component is the thin view that renders them and calls the seams.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import {
    buildSystemLabelMap,
    systemDisplayLabel,
    pickDefaultSystemId
  } from '../../util/systemDisambiguation.js';

  let { services = null } = $props();

  // A render tick lets list-mutating actions (promote / delete) re-pull the rows
  // after the shell re-renders the app (which re-runs _prepareSvelteProps).
  let tick = $state(0);

  function text(key, fallback = key) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const sceneName = $derived(services?.sceneName?.() ?? '');

  const rows = $derived.by(() => {
    void tick;
    return services?.listRows?.() ?? [];
  });

  // Marker-status → localized label + icon for the row badge.
  function markerLabel(status) {
    switch (status) {
      case 'Tile':
        return text('FABRICATE.Canvas.Manage.MarkerTile', 'Tile');
      case 'Drawing':
        return text('FABRICATE.Canvas.Manage.MarkerDrawing', 'Drawing');
      case 'Token':
        return text('FABRICATE.Canvas.Manage.MarkerToken', 'Token');
      case 'region-only':
        return text('FABRICATE.Canvas.Manage.MarkerRegionOnly', 'Region only');
      case 'missing':
      default:
        return text('FABRICATE.Canvas.Manage.MarkerMissing', 'Missing');
    }
  }

  function typeLabel(interactableType) {
    return interactableType === 'gatheringTask'
      ? text('FABRICATE.Canvas.Manage.TypeGatheringTask', 'Gathering task')
      : text('FABRICATE.Canvas.Manage.TypeTool', 'Tool');
  }

  // The state badges a row shows (enabled is the default, so surface the notable
  // states: disabled, locked, consumed).
  function stateBadges(state) {
    const badges = [];
    if (!state.enabled) badges.push(text('FABRICATE.Canvas.Manage.StateDisabled', 'Disabled'));
    if (state.locked) badges.push(text('FABRICATE.Canvas.Manage.StateLocked', 'Locked'));
    if (state.consumed) badges.push(text('FABRICATE.Canvas.Manage.StateConsumed', 'Consumed'));
    if (badges.length === 0) badges.push(text('FABRICATE.Canvas.Manage.StateEnabled', 'Enabled'));
    return badges;
  }

  function openConfig(ref) {
    services?.openConfig?.(ref);
  }

  function jump(ref) {
    services?.jumpToRegion?.(ref);
  }

  async function remove(ref) {
    const deleted = await services?.deleteInteractable?.(ref);
    if (deleted) tick += 1;
  }

  // --- Promote panel state -------------------------------------------------
  let showPromote = $state(false);

  const systems = $derived(
    (services?.listSystems?.() ?? []).map((system) => ({
      id: String(system?.id ?? ''),
      name: String(system?.name ?? system?.id ?? '')
    }))
  );

  // Same-named systems are indistinguishable in the picker; build a label map that
  // appends a short id disambiguator ONLY to colliding names (issue 346).
  const systemLabels = $derived(buildSystemLabelMap(systems));

  // 'tool' | 'gatheringTask'
  let sourceType = $state('tool');

  // True when a system has a selectable source of the CURRENT source type, so the
  // default selection prefers a source-bearing system over an empty same-named
  // duplicate (the "No sources in this system." footgun — issue 346).
  function systemHasSources(systemId) {
    if (!systemId) return false;
    const list = sourceType === 'tool'
      ? services?.listToolsForSystem?.(systemId) ?? []
      : services?.listTasksForSystem?.(systemId) ?? [];
    return list.length > 0;
  }

  let selectedSystemId = $state('');
  $effect(() => {
    if (!selectedSystemId && systems.length > 0) {
      selectedSystemId = pickDefaultSystemId(systems, systemHasSources);
    }
  });
  let selectedReferenceId = $state('');
  let selectedRegionId = $state('');
  let promoteName = $state('');
  let visualMode = $state('marker'); // 'marker' | 'none'
  let markerKind = $state('Tile'); // 'Tile' | 'Drawing'

  const regions = $derived.by(() => {
    void tick;
    void showPromote;
    return services?.listRegions?.() ?? [];
  });

  const sources = $derived(
    sourceType === 'tool'
      ? services?.listToolsForSystem?.(selectedSystemId) ?? []
      : services?.listTasksForSystem?.(selectedSystemId) ?? []
  );

  // Reset the picked source when the system or the type changes so we never carry
  // a stale reference across systems.
  $effect(() => {
    void selectedSystemId;
    void sourceType;
    const ids = (sources ?? []).map((s) => String(s.id));
    if (!ids.includes(selectedReferenceId)) {
      selectedReferenceId = ids[0] ?? '';
    }
  });

  const canPromote = $derived(
    Boolean(selectedRegionId) && Boolean(selectedReferenceId) && Boolean(selectedSystemId)
  );

  async function confirmPromote() {
    if (!canPromote) return;
    const ok = await services?.promote?.({
      regionId: selectedRegionId,
      source: {
        interactableType: sourceType,
        systemId: selectedSystemId,
        referenceId: selectedReferenceId
      },
      name: promoteName,
      visualMode,
      markerKind
    });
    if (ok) {
      // Reset + collapse the promote panel and refresh the list.
      promoteName = '';
      selectedRegionId = '';
      showPromote = false;
      tick += 1;
    }
  }
</script>

<div class="fabricate-interactables-manager-body">
  <header class="fab-im-header">
    <h2 class="fab-im-title">{text('FABRICATE.Canvas.Manage.Title', 'Manage interactables')}</h2>
    <p class="fab-im-subtitle">
      {sceneName
        ? text('FABRICATE.Canvas.Manage.SceneLabel', 'Scene') + ': ' + sceneName
        : text('FABRICATE.Canvas.Manage.NoScene', 'No active scene.')}
    </p>
  </header>

  <div class="fab-im-toolbar">
    <button
      type="button"
      class="fab-im-promote-toggle"
      class:is-active={showPromote}
      aria-expanded={showPromote}
      onclick={() => (showPromote = !showPromote)}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Canvas.Manage.PromoteToggle', 'Promote region to interactable')}</span>
    </button>
  </div>

  {#if showPromote}
    <section class="fab-im-promote" aria-label={text('FABRICATE.Canvas.Manage.PromoteToggle', 'Promote region to interactable')}>
      <p class="fab-im-promote-hint">
        {text(
          'FABRICATE.Canvas.Manage.PromoteHint',
          'Pick a region you already drew (any shape) and a Tool or Gathering Task source. The region becomes a working interactable.'
        )}
      </p>

      <label class="fab-im-field">
        <span class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteRegion', 'Region')}</span>
        <select bind:value={selectedRegionId}>
          <option value="">{text('FABRICATE.Canvas.Manage.PromoteRegionPlaceholder', 'Choose a region…')}</option>
          {#each regions as region (region.id)}
            <option value={region.id}>
              {region.name || region.id}{region.hasInteractable
                ? ' (' + text('FABRICATE.Canvas.Manage.RegionAlreadyInteractable', 'already an interactable') + ')'
                : ''}
            </option>
          {/each}
        </select>
      </label>

      <label class="fab-im-field">
        <span class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteSystem', 'Crafting system')}</span>
        <select bind:value={selectedSystemId}>
          {#each systems as system (system.id)}
            <option value={system.id}>{systemDisplayLabel(system, systemLabels)}</option>
          {/each}
        </select>
      </label>

      <fieldset class="fab-im-fieldset">
        <legend class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteSourceType', 'Source type')}</legend>
        <label class="fab-im-radio">
          <input type="radio" name="fab-im-source-type" value="tool" bind:group={sourceType} />
          <span>{text('FABRICATE.Canvas.Manage.TypeTool', 'Tool')}</span>
        </label>
        <label class="fab-im-radio">
          <input type="radio" name="fab-im-source-type" value="gatheringTask" bind:group={sourceType} />
          <span>{text('FABRICATE.Canvas.Manage.TypeGatheringTask', 'Gathering task')}</span>
        </label>
      </fieldset>

      <label class="fab-im-field">
        <span class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteSource', 'Source')}</span>
        <select bind:value={selectedReferenceId}>
          {#if sources.length === 0}
            <option value="">{text('FABRICATE.Canvas.Manage.PromoteNoSources', 'No sources in this system.')}</option>
          {/if}
          {#each sources as source (source.id)}
            <option value={source.id}>{source.name}</option>
          {/each}
        </select>
      </label>

      <label class="fab-im-field">
        <span class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteName', 'Name (optional)')}</span>
        <input
          type="text"
          bind:value={promoteName}
          placeholder={text('FABRICATE.Canvas.Manage.PromoteNamePlaceholder', 'Defaults to the source name')}
        />
      </label>

      <fieldset class="fab-im-fieldset">
        <legend class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteMarker', 'Marker')}</legend>
        <label class="fab-im-radio">
          <input type="radio" name="fab-im-visual-mode" value="marker" bind:group={visualMode} />
          <span>{text('FABRICATE.Canvas.Manage.PromoteMarkerVisible', 'Visible marker')}</span>
        </label>
        <label class="fab-im-radio">
          <input type="radio" name="fab-im-visual-mode" value="none" bind:group={visualMode} />
          <span>{text('FABRICATE.Canvas.Manage.PromoteMarkerNone', 'Region only (no marker)')}</span>
        </label>
      </fieldset>

      {#if visualMode === 'marker'}
        <fieldset class="fab-im-fieldset">
          <legend class="fab-im-field-label">{text('FABRICATE.Canvas.Manage.PromoteMarkerKind', 'Marker kind')}</legend>
          <label class="fab-im-radio">
            <input type="radio" name="fab-im-marker-kind" value="Tile" bind:group={markerKind} />
            <span>{text('FABRICATE.Canvas.Manage.MarkerTile', 'Tile')}</span>
          </label>
          <label class="fab-im-radio">
            <input type="radio" name="fab-im-marker-kind" value="Drawing" bind:group={markerKind} />
            <span>{text('FABRICATE.Canvas.Manage.MarkerDrawing', 'Drawing')}</span>
          </label>
        </fieldset>
      {/if}

      <div class="fab-im-promote-actions">
        <button type="button" class="fab-im-promote-confirm" disabled={!canPromote} onclick={confirmPromote}>
          {text('FABRICATE.Canvas.Manage.PromoteConfirm', 'Promote region')}
        </button>
        <button type="button" class="fab-im-promote-cancel" onclick={() => (showPromote = false)}>
          {text('FABRICATE.Canvas.Manage.PromoteCancel', 'Cancel')}
        </button>
      </div>
    </section>
  {/if}

  <section class="fab-im-list-section" aria-label={text('FABRICATE.Canvas.Manage.ListLabel', 'Interactables on this scene')}>
    {#if rows.length === 0}
      <p class="fab-im-empty">
        {text(
          'FABRICATE.Canvas.Manage.Empty',
          'No interactables on this scene yet. Promote a region above, or drag one from the Interactable browser.'
        )}
      </p>
    {:else}
      <ul class="fab-im-list">
        {#each rows as row (row.ref.regionId + '.' + row.ref.behaviorId)}
          <li class="fab-im-row">
            <div class="fab-im-row-main">
              <span class="fab-im-row-name">{row.name}</span>
              <div class="fab-im-row-meta">
                <span class="fab-im-chip fab-im-chip-type">{typeLabel(row.interactableType)}</span>
                <span class="fab-im-chip fab-im-chip-source">{row.sourceLabel}</span>
                {#each stateBadges(row.state) as badge (badge)}
                  <span class="fab-im-chip fab-im-chip-state">{badge}</span>
                {/each}
                <span
                  class="fab-im-chip fab-im-chip-marker"
                  class:is-missing={row.markerStatus === 'missing'}
                  class:is-region-only={row.markerStatus === 'region-only'}
                >
                  {markerLabel(row.markerStatus)}
                </span>
              </div>
            </div>
            <div class="fab-im-row-actions">
              <button
                type="button"
                class="fab-im-action"
                onclick={() => openConfig(row.ref)}
                title={text('FABRICATE.Canvas.Manage.OpenConfig', 'Open configuration')}
                aria-label={text('FABRICATE.Canvas.Manage.OpenConfig', 'Open configuration')}
              >
                <i class="fas fa-sliders" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="fab-im-action"
                onclick={() => jump(row.ref)}
                title={text('FABRICATE.Canvas.Manage.JumpToRegion', 'Jump to region')}
                aria-label={text('FABRICATE.Canvas.Manage.JumpToRegion', 'Jump to region')}
              >
                <i class="fas fa-location-crosshairs" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="fab-im-action fab-im-action-delete"
                onclick={() => remove(row.ref)}
                title={text('FABRICATE.Canvas.Manage.Delete', 'Delete interactable')}
                aria-label={text('FABRICATE.Canvas.Manage.Delete', 'Delete interactable')}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
