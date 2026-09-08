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
    pickDefaultSystemId,
  } from '../../util/systemDisambiguation.js';
  import Chip from '../../components/Chip.svelte';
  import Field from '../../components/Field.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import Select from '../../components/Select.svelte';
  import SegmentedControl from '../manager/SegmentedControl.svelte';

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

  /**
   * The marker badge's TONE, which is the statement the hand-rolled chip made with a
   * danger-coloured edge and an `opacity` fade (issue 1520).
   *
   * `missing` is a fault the GM has to act on, so it stays in the danger family. `region-only`
   * is not a fault at all — it is a deliberate configuration with no marker to report — which
   * is exactly what `Chip`'s `muted` tone is documented for, and it replaces a fade that dimmed
   * the pill's border and fill along with its text.
   *
   * @param {string} status The row's marker status.
   * @returns {string} A `Chip` tone.
   */
  function markerTone(status) {
    if (status === 'missing') return 'danger';
    if (status === 'region-only') return 'muted';
    return 'neutral';
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
      name: String(system?.name ?? system?.id ?? ''),
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
    const list =
      sourceType === 'tool'
        ? (services?.listToolsForSystem?.(systemId) ?? [])
        : (services?.listTasksForSystem?.(systemId) ?? []);
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
      ? (services?.listToolsForSystem?.(selectedSystemId) ?? [])
      : (services?.listTasksForSystem?.(selectedSystemId) ?? [])
  );

  // THE SHARED SELECT'S OPTION VOCABULARY (issue 1520). `Select` takes an `options` array
  // rather than `<option>` children, so each list is built here from exactly the source the
  // native `<select>` iterated. The region list keeps its LEADING EMPTY ROW rather than
  // expressing it as the component's `placeholder`: it is a real selectable row, because
  // clearing the region is how a GM abandons a half-built promotion, and a placeholder is only
  // ever shown.
  const regionSelectOptions = $derived([
    {
      value: '',
      label: text('FABRICATE.Canvas.Manage.PromoteRegionPlaceholder', 'Choose a region…'),
    },
    ...regions.map((region) => ({
      value: region.id,
      label:
        (region.name || region.id) +
        (region.hasInteractable
          ? ' (' +
            text('FABRICATE.Canvas.Manage.RegionAlreadyInteractable', 'already an interactable') +
            ')'
          : ''),
    })),
  ]);

  const systemSelectOptions = $derived(
    systems.map((system) => ({ value: system.id, label: systemDisplayLabel(system, systemLabels) }))
  );

  // The empty-system row is CONDITIONAL here, exactly as the native `<select>`'s `{#if
  // sources.length === 0}` option was: it is a report that this system has nothing to offer,
  // not a way to choose nothing.
  const sourceSelectOptions = $derived(
    sources.length === 0
      ? [
          {
            value: '',
            label: text('FABRICATE.Canvas.Manage.PromoteNoSources', 'No sources in this system.'),
          },
        ]
      : sources.map((source) => ({ value: source.id, label: source.name }))
  );

  const sourceTypeOptions = $derived([
    { value: 'tool', fallback: text('FABRICATE.Canvas.Manage.TypeTool', 'Tool') },
    {
      value: 'gatheringTask',
      fallback: text('FABRICATE.Canvas.Manage.TypeGatheringTask', 'Gathering task'),
    },
  ]);

  const visualModeOptions = $derived([
    {
      value: 'marker',
      fallback: text('FABRICATE.Canvas.Manage.PromoteMarkerVisible', 'Visible marker'),
    },
    {
      value: 'none',
      fallback: text('FABRICATE.Canvas.Manage.PromoteMarkerNone', 'Region only (no marker)'),
    },
  ]);

  const markerKindOptions = $derived([
    { value: 'Tile', fallback: text('FABRICATE.Canvas.Manage.MarkerTile', 'Tile') },
    { value: 'Drawing', fallback: text('FABRICATE.Canvas.Manage.MarkerDrawing', 'Drawing') },
  ]);

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
        referenceId: selectedReferenceId,
      },
      name: promoteName,
      visualMode,
      markerKind,
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
    <!-- THE OPEN STATE RIDES `aria-expanded`, NOT A CLASS (issue 1520). `ManagerButton`'s role
         vocabulary is about what a verb MEANS, not about whether its disclosure is open, so the
         `is-active` accent edge this button drew is restated below against the attribute that
         already announces the state — a hook that cannot drift from the behaviour it describes. -->
    <ManagerButton
      aria-expanded={showPromote}
      onclick={() => (showPromote = !showPromote)}
      data-interactable-manager-promote-toggle=""
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Canvas.Manage.PromoteToggle', 'Promote region to interactable')}</span>
    </ManagerButton>
  </div>

  {#if showPromote}
    <InspectorCard
      class="fab-im-promote"
      aria-label={text('FABRICATE.Canvas.Manage.PromoteToggle', 'Promote region to interactable')}
      data-interactable-manager-promote=""
    >
      <p class="fab-im-promote-hint">
        {text(
          'FABRICATE.Canvas.Manage.PromoteHint',
          'Pick a region you already drew (any shape) and a Tool or Gathering Task source. The region becomes a working interactable.'
        )}
      </p>

      <Select
        label={text('FABRICATE.Canvas.Manage.PromoteRegion', 'Region')}
        value={selectedRegionId}
        options={regionSelectOptions}
        onChange={(next) => (selectedRegionId = next)}
        triggerData={{ 'data-interactable-manager-region': '' }}
      />

      <Select
        label={text('FABRICATE.Canvas.Manage.PromoteSystem', 'Crafting system')}
        value={selectedSystemId}
        options={systemSelectOptions}
        onChange={(next) => (selectedSystemId = next)}
        triggerData={{ 'data-interactable-manager-system': '' }}
      />

      <!-- THE THREE RADIO FIELDSETS ARE SEGMENTED TRACKS (issue 1520). Each is a closed set of
           two NAMED alternatives with no sentence to explain either, which the library routes to
           `Segmented` rather than to the option-card group — that entry's own canonical spec
           requires a description per option, "one sentence, always present", and none of these
           three has one.

           `<Field as="div">` supplies the visible caption the `<legend>` carried. The control
           names ITSELF through `ariaLabel`, so the field is a `div` rather than a `label`: a
           `<label>` around a radiogroup names nothing, because a radiogroup is not a labelable
           element.

           The `name` attributes are carried across byte for byte — `fab-im-source-type`,
           `fab-im-visual-mode`, `fab-im-marker-kind` — because they are DOM group identities
           rather than class names, and renaming them would move the Foundry smoke's own radio
           locator for no gain. -->
      <Field as="div">
        <span>{text('FABRICATE.Canvas.Manage.PromoteSourceType', 'Source type')}</span>
        <SegmentedControl
          options={sourceTypeOptions}
          value={sourceType}
          onChange={(next) => (sourceType = next)}
          groupName="fab-im-source-type"
          ariaLabel={text('FABRICATE.Canvas.Manage.PromoteSourceType', 'Source type')}
          fill
          dataAttr="data-interactable-manager-source-type"
          optionDataAttr="data-interactable-manager-source-type-option"
        />
      </Field>

      <Select
        label={text('FABRICATE.Canvas.Manage.PromoteSource', 'Source')}
        value={selectedReferenceId}
        options={sourceSelectOptions}
        onChange={(next) => (selectedReferenceId = next)}
        triggerData={{ 'data-interactable-manager-source': '' }}
      />

      <Field as="label">
        <span>{text('FABRICATE.Canvas.Manage.PromoteName', 'Name (optional)')}</span>
        <input
          type="text"
          bind:value={promoteName}
          placeholder={text(
            'FABRICATE.Canvas.Manage.PromoteNamePlaceholder',
            'Defaults to the source name'
          )}
          data-interactable-manager-name
        />
      </Field>

      <Field as="div">
        <span>{text('FABRICATE.Canvas.Manage.PromoteMarker', 'Marker')}</span>
        <SegmentedControl
          options={visualModeOptions}
          value={visualMode}
          onChange={(next) => (visualMode = next)}
          groupName="fab-im-visual-mode"
          ariaLabel={text('FABRICATE.Canvas.Manage.PromoteMarker', 'Marker')}
          fill
          dataAttr="data-interactable-manager-visual-mode"
          optionDataAttr="data-interactable-manager-visual-mode-option"
        />
      </Field>

      {#if visualMode === 'marker'}
        <Field as="div">
          <span>{text('FABRICATE.Canvas.Manage.PromoteMarkerKind', 'Marker kind')}</span>
          <SegmentedControl
            options={markerKindOptions}
            value={markerKind}
            onChange={(next) => (markerKind = next)}
            groupName="fab-im-marker-kind"
            ariaLabel={text('FABRICATE.Canvas.Manage.PromoteMarkerKind', 'Marker kind')}
            fill
            dataAttr="data-interactable-manager-marker-kind"
            optionDataAttr="data-interactable-manager-marker-kind-option"
          />
        </Field>
      {/if}

      <div class="fab-im-promote-actions">
        <ManagerButton
          role="primary"
          disabled={!canPromote}
          onclick={confirmPromote}
          data-interactable-manager-promote-confirm=""
        >
          {text('FABRICATE.Canvas.Manage.PromoteConfirm', 'Promote region')}
        </ManagerButton>
        <ManagerButton
          onclick={() => (showPromote = false)}
          data-interactable-manager-promote-cancel=""
        >
          {text('FABRICATE.Canvas.Manage.PromoteCancel', 'Cancel')}
        </ManagerButton>
      </div>
    </InspectorCard>
  {/if}

  <section
    class="fab-im-list-section"
    aria-label={text('FABRICATE.Canvas.Manage.ListLabel', 'Interactables on this scene')}
  >
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
                <Chip tone="secondary" data-interactable-manager-chip-type=""
                  >{typeLabel(row.interactableType)}</Chip
                >
                <Chip tone="neutral" data-interactable-manager-chip-source=""
                  >{row.sourceLabel}</Chip
                >
                {#each stateBadges(row.state) as badge (badge)}
                  <Chip tone="neutral" data-interactable-manager-chip-state="">{badge}</Chip>
                {/each}
                <Chip
                  tone={markerTone(row.markerStatus)}
                  data-interactable-manager-chip-marker={row.markerStatus}
                >
                  {markerLabel(row.markerStatus)}
                </Chip>
              </div>
            </div>
            <div class="fab-im-row-actions">
              <IconButton
                ariaLabel={text('FABRICATE.Canvas.Manage.OpenConfig', 'Open configuration')}
                title={text('FABRICATE.Canvas.Manage.OpenConfig', 'Open configuration')}
                onclick={() => openConfig(row.ref)}
                data-interactable-manager-open-config=""
              >
                <i class="fas fa-sliders" aria-hidden="true"></i>
              </IconButton>
              <IconButton
                ariaLabel={text('FABRICATE.Canvas.Manage.JumpToRegion', 'Jump to region')}
                title={text('FABRICATE.Canvas.Manage.JumpToRegion', 'Jump to region')}
                onclick={() => jump(row.ref)}
                data-interactable-manager-jump=""
              >
                <i class="fas fa-location-crosshairs" aria-hidden="true"></i>
              </IconButton>
              <IconButton
                class="is-danger"
                ariaLabel={text('FABRICATE.Canvas.Manage.Delete', 'Delete interactable')}
                title={text('FABRICATE.Canvas.Manage.Delete', 'Delete interactable')}
                onclick={() => remove(row.ref)}
                data-interactable-manager-delete=""
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </IconButton>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  /* THIS WINDOW'S LAYOUT MOVED HERE FROM THE GLOBAL SHEET (issue 1520).

     Every CONTROL family the panel used to draw itself — the button, the field, the three radio
     fieldsets, the row chips, the icon-only row actions and the promote card — is a shared
     primitive's now, and the `.fab-im-*` rules that painted them are deleted. What is left is
     this window's own LAYOUT, and it is written HERE rather than in `styles/fabricate.css`
     because those rules were the only thing keeping the panel's appearance rooted at an
     application class: a scoped block travels with the markup, which is what makes the window
     host-independent in the same sense the config panel already is.

     `.fabricate-interactables-manager-body`'s own scroll containment stays in the sheet, at
     `.fabricate-interactables-manager .fabricate-interactables-manager-body`, because it is the
     window's frame contract rather than its content layout — and deleting it would remove the
     panel's scrolling.

     Two rules below reach a CHILD COMPONENT's element and are therefore `:global(...)`, each
     anchored on a class this file DOES write, so Svelte's `svelte-<hash>` lands on the ancestor
     compound rather than on the primitive's element — where it would match nothing, silently,
     with `css.code` byte-identical and no compiler warning. */
  .fab-im-header {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .fab-im-title {
    margin: 0;
    font-size: 1.1rem;
  }

  /* THE MUTED READINGS ARE INKED, NOT FADED (issue 1520). Both of these dimmed their text with
     `opacity`, which fades the WHOLE element — border and background with it — and produces a
     different colour on every surface it is drawn over. `--fab-text-muted` is the published
     recessive ink and is what the shared primitives this panel now renders already use. */
  .fab-im-subtitle {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.85rem;
  }

  .fab-im-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  /* THE OPEN DISCLOSURE'S ACCENT EDGE, restated against `aria-expanded` (issue 1520). The
     button's `is-active` class said the same thing twice — once to a reader of the markup and
     once to assistive technology — and only the attribute is the behaviour's own. `:global(...)`
     because the element is `ManagerButton`'s; anchored on `.fab-im-toolbar`, which this file
     writes, so the hash lands there. */
  .fab-im-toolbar :global(.fabricate-button[aria-expanded='true']) {
    border-color: var(--fab-accent);
  }

  /* The promote card's contents are a column of labelled controls, which is the shell's own
     `flex-direction: column` — so the card states nothing here. Only the hint's ink and the
     action row's wrapping are this caller's. */
  .fab-im-promote-hint {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.85rem;
  }

  .fab-im-promote-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-1);
  }

  /* The action row is `flex-wrap: wrap` and the shared button declares `min-width: 0`, so
     without this a converted button squashes below its own label instead of wrapping to the next
     line. It is POSITION rather than appearance, which is the half a caller keeps. */
  .fab-im-promote-actions :global(.fabricate-button) {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .fab-im-list-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .fab-im-empty {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.85rem;
  }

  .fab-im-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* 6px, not 4: 4 is off the radius ladder (0, 6, 7, 9, 11, 999, 50%) and this row is under the
     24px band the 6px rung is published for. `--fab-border` replaces `--fab-overlay-light-16`,
     which is the same hairline every shared primitive in this window now draws. */
  .fab-im-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
  }

  .fab-im-row-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .fab-im-row-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-im-row-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }

  .fab-im-row-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--fab-space-1);
  }
</style>
