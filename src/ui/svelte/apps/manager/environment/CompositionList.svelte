<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../../../actions/dismissOnOutsideClick.js';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import OverrideIndicator from './OverrideIndicator.svelte';
  import Pagination from '../../../components/Pagination.svelte';

  let {
    kind = 'task',
    records = [],
    mode = 'automatic',
    selectionMode = 'targeted',
    weights = {},
    onWeightChange = () => {},
    selectedId = '',
    onSelect = () => {},
    onInclude = () => {},
    onForceInclude = () => {},
    onExclude = () => {},
    onRestore = () => {},
    onReorder = () => {},
    onOpenSource = () => {}
  } = $props();

  let nonMatchingPageIndex = $state(0);
  let nonMatchingPageSize = $state(10);

  const showBlindWeights = $derived(kind === 'task' && selectionMode === 'blind');
  const showHandle = $derived(kind === 'hazard');
  function weightFor(id) {
    const raw = Number(weights?.[id]);
    return Number.isFinite(raw) && raw >= 0 ? raw : 1;
  }

  let dragIndex = $state(-1);
  let openMenuId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const defaultImg = $derived(kind === 'hazard' ? 'icons/svg/hazard.svg' : 'icons/svg/item-bag.svg');

  function recordImage(entry) { return entry?.record?.img || defaultImg; }
  function recordName(entry) { return entry?.record?.name || entry?.id || text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed'); }
  function recordDescription(entry) {
    return String(entry?.record?.description || '').trim()
      || text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoDescription', 'No description');
  }

  function runtimePillState(entry) {
    return entry?.runtimeState === 'unavailable' && entry?.conditionsMet === false
      ? 'conditionsBlocked'
      : entry?.runtimeState;
  }

  const included = $derived(records.filter(entry =>
    entry.compositionState === 'includedByMatch'
    || entry.compositionState === 'explicitlyIncluded'
    || entry.compositionState === 'forceIncluded'
    || entry.compositionState === 'includedButUnavailable'));
  const includedWeightTotal = $derived(included.reduce((total, entry) => total + weightFor(entry.id), 0));
  const excluded = $derived(records.filter(entry => entry.compositionState === 'excluded'));
  const nonMatching = $derived(records.filter(entry =>
    entry.compositionState === 'notMatching' || entry.compositionState === 'libraryDisabled'));
  const availableToAddMatching = $derived(records.filter(entry =>
    entry.compositionState === 'candidate'));
  const availableToAddNonMatching = $derived(records.filter(entry =>
    entry.compositionState === 'notMatching'));
  const availableToAddLibraryDisabled = $derived(records.filter(entry =>
    entry.compositionState === 'libraryDisabled'));
  const availableToAdd = $derived([...availableToAddMatching, ...availableToAddNonMatching, ...availableToAddLibraryDisabled]);
  const paginatedNonMatching = $derived(nonMatching.slice(
    nonMatchingPageIndex * nonMatchingPageSize,
    (nonMatchingPageIndex + 1) * nonMatchingPageSize
  ));
  $effect(() => {
    if (nonMatchingPageIndex > 0 && nonMatchingPageIndex * nonMatchingPageSize >= nonMatching.length) {
      nonMatchingPageIndex = 0;
    }
  });

  const includedTitle = $derived(mode === 'manual'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.IncludedInEnvironment', 'Included in this environment')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.IncludedByMatchHeading', 'Included by match'));

  const unit = $derived(kind === 'hazard'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.HazardsUnit', 'hazards')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.TasksUnit', 'tasks'));
  const recordColumnLabel = $derived(kind === 'hazard'
    ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColHazard', 'Hazard')
    : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColTask', 'Task'));

  function toggleMenu(id) { openMenuId = openMenuId === id ? '' : id; }
  function closeMenu() { openMenuId = ''; }

  function handleDrop(targetIndex) {
    if (dragIndex >= 0 && dragIndex !== targetIndex) onReorder(kind, dragIndex, targetIndex);
    dragIndex = -1;
  }

  function formatWeightPercentage(id) {
    if (includedWeightTotal <= 0) return '0%';
    const rounded = Math.round((weightFor(id) / includedWeightTotal) * 1000) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  }

  function activateOnKey(event, id) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(kind, id);
    }
  }

  function availableRowBucket(entry) {
    return entry?.compositionState === 'candidate' ? 'candidate' : 'non-matching';
  }

  function availableRowAction(entry) {
    if (entry?.compositionState === 'candidate') return 'include';
    if (entry?.compositionState === 'notMatching') return 'force-include';
    if (entry?.compositionState === 'libraryDisabled') return 'library-disabled';
    return '';
  }
</script>

<div class="manager-environment-comp" data-composition-kind={kind} data-composition-mode={mode} data-composition-selection={selectionMode}>
  <!-- Included -->
  <section class="manager-environment-comp-section" data-section="included">
    <header class="manager-environment-comp-band">
      <h4>{includedTitle}</h4>
      <span class="manager-environment-comp-count">{included.length} {unit}</span>
    </header>

    <div class="manager-environment-comp-head" aria-hidden="true">
      {#if showHandle}<span></span>{/if}
      <span>{recordColumnLabel}</span>
      {#if showBlindWeights}<span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColWeight', 'Weight')}</span>{/if}
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColOverride', 'Override')}</span>
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColRuntime', 'Runtime state')}</span>
      <span></span>
    </div>

    {#if included.length === 0}
      <p class="manager-muted manager-environment-comp-empty">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoIncluded', 'No records are available in this environment yet.')}</p>
    {:else}
      <ul class="manager-environment-comp-rows">
        {#each included as entry, index (entry.id)}
          <li
            class={`manager-environment-comp-row ${selectedId === entry.id ? 'is-selected' : ''} ${entry.runtimeState === 'unavailable' ? 'is-unavailable' : ''} ${entry.conditionsMet === false ? 'is-conditions-blocked' : ''}`}
            data-record-id={entry.id}
            data-runtime-state={entry.runtimeState}
            draggable={kind === 'hazard'}
            ondragstart={kind === 'hazard' ? () => { dragIndex = index; } : undefined}
            ondragover={kind === 'hazard' ? (event) => event.preventDefault() : undefined}
            ondrop={kind === 'hazard' ? (event) => { event.preventDefault(); handleDrop(index); } : undefined}
          >
            {#if showHandle}
              <span class="manager-environment-comp-handle" title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.DragReorder', 'Drag to reorder')}>
                <i class="fas fa-grip-vertical" aria-hidden="true"></i>
                <span class="manager-environment-comp-order">{index + 1}</span>
              </span>
            {/if}
            <div
              role="button"
              tabindex="0"
              class="manager-environment-comp-task"
              data-action="select"
              aria-pressed={selectedId === entry.id}
              onclick={() => onSelect(kind, entry.id)}
              onkeydown={(event) => activateOnKey(event, entry.id)}
            >
              <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
              <span class="manager-environment-comp-copy">
                <span class="manager-environment-comp-name">{recordName(entry)}</span>
                <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
              </span>
            </div>
            {#if showBlindWeights}
              <div class="manager-environment-comp-weight">
                <label class="manager-environment-comp-weight-field">
                  <span class="sr-only">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Weight', 'Weight')}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    data-composition-weight={entry.id}
                    value={weightFor(entry.id)}
                    onchange={(event) => onWeightChange(entry.id, event.currentTarget.value)}
                  />
                </label>
                <span
                  class="manager-environment-comp-weight-percent"
                  data-composition-weight-percent={entry.id}
                  title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.WeightPercentage', 'Selection share')}
                  aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.WeightPercentage', 'Selection share')}
                >{formatWeightPercentage(entry.id)}</span>
              </div>
            {/if}
            <div class="manager-environment-comp-override">
              <OverrideIndicator active={entry.hasDropRateAdjustment === true} />
            </div>
            <div class="manager-environment-comp-runtime">
              <RuntimeStatePill state={runtimePillState(entry)} />
            </div>
            <div class="manager-environment-comp-actions">
              {#if mode === 'manual'}
                <button
                  type="button"
                  class="manager-icon-button is-danger manager-environment-comp-quick-action"
                  data-quick-action="exclude"
                  data-action="exclude"
                  aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickRemove', 'Remove')}
                  title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickRemove', 'Remove')}
                  onclick={() => onExclude(kind, entry.id)}
                >
                  <i class="fas fa-ban" aria-hidden="true"></i>
                </button>
              {/if}
              <div class="manager-environment-comp-menu-wrap" use:dismissOnOutsideClick={{ enabled: openMenuId === entry.id, onDismiss: closeMenu }}>
                <button type="button" class="manager-icon-button" aria-haspopup="menu" aria-expanded={openMenuId === entry.id} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoreActions', 'More actions')} onclick={() => toggleMenu(entry.id)}>
                  <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                </button>
                {#if openMenuId === entry.id}
                  <div class="manager-environment-comp-menu" role="menu">
                    {#if kind === 'hazard'}
                      <button type="button" role="menuitem" disabled={index === 0} onclick={() => { onReorder(kind, index, index - 1); closeMenu(); }}><i class="fas fa-arrow-up" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoveUp', 'Move up')}</span></button>
                      <button type="button" role="menuitem" disabled={index === included.length - 1} onclick={() => { onReorder(kind, index, index + 1); closeMenu(); }}><i class="fas fa-arrow-down" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoveDown', 'Move down')}</span></button>
                    {/if}
                    <button type="button" role="menuitem" onclick={() => { onOpenSource(kind, entry.id); closeMenu(); }}><i class="fas fa-up-right-from-square" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSource', 'Open source record')}</span></button>
                    <button type="button" role="menuitem" class="is-danger" data-action="exclude" onclick={() => { onExclude(kind, entry.id); closeMenu(); }}><i class="fas fa-ban" aria-hidden="true"></i><span>{mode === 'manual' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Remove', 'Remove from environment') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Exclude', 'Exclude from environment')}</span></button>
                  </div>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Available to add (manual mode only) -->
  {#if mode === 'manual'}
    <section class="manager-environment-comp-section" data-section="available-to-add">
      <header class="manager-environment-comp-band">
        <h4>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.AvailableToAdd', 'Available to add')}</h4>
        <span class="manager-environment-comp-count">{availableToAdd.length} {unit}</span>
      </header>
      {#if availableToAdd.length === 0}
        <p class="manager-muted manager-environment-comp-empty">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoAvailableToAdd', 'No matching or non-matching records to add.')}</p>
      {:else}
        <ul class="manager-environment-comp-rows is-available-to-add">
          {#each availableToAdd as entry (entry.id)}
            <li class={`manager-environment-comp-row ${availableRowBucket(entry) === 'candidate' ? '' : 'is-non-matching'} ${selectedId === entry.id ? 'is-selected' : ''}`} data-record-id={entry.id} data-section-row={availableRowBucket(entry)} data-composition-state={entry.compositionState}>
              {#if showHandle}<span class="manager-environment-comp-handle"></span>{/if}
              <div
                role="button"
                tabindex="0"
                class="manager-environment-comp-task"
                data-action="select"
                aria-pressed={selectedId === entry.id}
                onclick={() => onSelect(kind, entry.id)}
                onkeydown={(event) => activateOnKey(event, entry.id)}
              >
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </div>
              {#if showBlindWeights}<div class="manager-environment-comp-weight"><span class="manager-environment-comp-none">—</span></div>{/if}
              <div class="manager-environment-comp-override"><OverrideIndicator active={entry.hasDropRateAdjustment === true} /></div>
              <div class="manager-environment-comp-runtime"><CompositionStatePill state={entry.compositionState} /></div>
              <div class="manager-environment-comp-actions">
                {#if availableRowAction(entry) === 'include'}
                  <button
                    type="button"
                    class="manager-icon-button is-primary manager-environment-comp-quick-action"
                    data-quick-action="include"
                    data-action="include"
                    aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickAdd', 'Add')}
                    title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickAdd', 'Add')}
                    onclick={() => onInclude(kind, entry.id)}
                  >
                    <i class="fas fa-circle-plus" aria-hidden="true"></i>
                  </button>
                {:else if availableRowAction(entry) === 'force-include'}
                  <button
                    type="button"
                    class="manager-icon-button is-warning-action manager-environment-comp-quick-action"
                    data-quick-action="force-include"
                    data-action="force-include"
                    aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd', 'Force add')}
                    title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd', 'Force add')}
                    onclick={() => onForceInclude(kind, entry.id)}
                  >
                    <i class="fas fa-circle-plus" aria-hidden="true"></i>
                  </button>
                {/if}
                <div class="manager-environment-comp-menu-wrap" use:dismissOnOutsideClick={{ enabled: openMenuId === entry.id, onDismiss: closeMenu }}>
                  <button type="button" class="manager-icon-button" aria-haspopup="menu" aria-expanded={openMenuId === entry.id} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoreActions', 'More actions')} onclick={() => toggleMenu(entry.id)}>
                    <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                  </button>
                  {#if openMenuId === entry.id}
                    <div class="manager-environment-comp-menu" role="menu">
                      {#if availableRowAction(entry) === 'include'}
                        <button type="button" role="menuitem" data-action="include" onclick={() => { onInclude(kind, entry.id); closeMenu(); }}><i class="fas fa-plus" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Include', 'Include')}</span></button>
                      {:else if availableRowAction(entry) === 'force-include'}
                        <button type="button" role="menuitem" data-action="force-include" onclick={() => { onForceInclude(kind, entry.id); closeMenu(); }}><i class="fas fa-plus" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd', 'Force add')}</span></button>
                      {:else if availableRowAction(entry) === 'library-disabled'}
                        <button type="button" role="menuitem" class="manager-environment-comp-menu-note" disabled><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote', 'Enable in library first')}</span></button>
                      {/if}
                      <button type="button" role="menuitem" onclick={() => { onOpenSource(kind, entry.id); closeMenu(); }}><i class="fas fa-up-right-from-square" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSource', 'Open source record')}</span></button>
                    </div>
                  {/if}
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if mode !== 'manual'}
    <!-- Excluded -->
    <section class="manager-environment-comp-section" data-section="excluded">
      <header class="manager-environment-comp-band">
        <h4>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ExcludedFromEnvironment', 'Excluded from this environment')}</h4>
        <span class="manager-environment-comp-count">{excluded.length} {unit}</span>
      </header>
      {#if excluded.length === 0}
        <p class="manager-muted manager-environment-comp-empty">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoExcluded', 'Nothing is excluded.')}</p>
      {:else}
        <ul class="manager-environment-comp-rows">
          {#each excluded as entry (entry.id)}
            <li class={`manager-environment-comp-row is-excluded ${selectedId === entry.id ? 'is-selected' : ''}`} data-record-id={entry.id} data-section-row="excluded">
              {#if showHandle}<span class="manager-environment-comp-handle"></span>{/if}
              <div
                role="button"
                tabindex="0"
                class="manager-environment-comp-task"
                data-action="select"
                aria-pressed={selectedId === entry.id}
                onclick={() => onSelect(kind, entry.id)}
                onkeydown={(event) => activateOnKey(event, entry.id)}
              >
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </div>
              {#if showBlindWeights}<div class="manager-environment-comp-weight"><span class="manager-environment-comp-none">—</span></div>{/if}
              <div class="manager-environment-comp-override"><OverrideIndicator active={entry.hasDropRateAdjustment === true} /></div>
              <div class="manager-environment-comp-runtime"><CompositionStatePill state="excluded" /></div>
              <div class="manager-environment-comp-actions">
                {#if kind === 'task'}
                  <div class="manager-environment-comp-menu-wrap" use:dismissOnOutsideClick={{ enabled: openMenuId === entry.id, onDismiss: closeMenu }}>
                    <button type="button" class="manager-icon-button" aria-haspopup="menu" aria-expanded={openMenuId === entry.id} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoreActions', 'More actions')} onclick={() => toggleMenu(entry.id)}>
                      <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                    </button>
                    {#if openMenuId === entry.id}
                      <div class="manager-environment-comp-menu" role="menu">
                        <button type="button" role="menuitem" onclick={() => { onOpenSource(kind, entry.id); closeMenu(); }}><i class="fas fa-up-right-from-square" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSource', 'Open source record')}</span></button>
                        <button type="button" role="menuitem" data-action="restore" onclick={() => { onRestore(kind, entry.id); closeMenu(); }}><i class="fas fa-rotate-left" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore', 'Restore')}</span></button>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <button type="button" class="manager-button manager-environment-restore" data-action="restore" onclick={() => onRestore(kind, entry.id)}>
                    <i class="fas fa-rotate-left" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore', 'Restore')}</span>
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Non-matching (replaces the diagnostics disclosure; manual mode allows force-add). -->
    <section class="manager-environment-comp-section" data-section="non-matching">
      <header class="manager-environment-comp-band">
        <h4>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NonMatching', 'Non-matching')}</h4>
        <span class="manager-environment-comp-count">{nonMatching.length} {unit}</span>
      </header>
      {#if nonMatching.length === 0}
        <p class="manager-muted manager-environment-comp-empty">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoNonMatching', 'No non-matching or disabled records.')}</p>
      {:else}
        <ul class="manager-environment-comp-rows is-non-matching">
          {#each paginatedNonMatching as entry (entry.id)}
            <li class="manager-environment-comp-row is-non-matching" data-record-id={entry.id} data-section-row="non-matching" data-composition-state={entry.compositionState}>
              {#if showHandle}<span class="manager-environment-comp-handle"></span>{/if}
              <div
                role="button"
                tabindex="0"
                class="manager-environment-comp-task"
                data-action="select"
                aria-pressed={selectedId === entry.id}
                onclick={() => onSelect(kind, entry.id)}
                onkeydown={(event) => activateOnKey(event, entry.id)}
              >
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </div>
              {#if showBlindWeights}<div class="manager-environment-comp-weight"><span class="manager-environment-comp-none">—</span></div>{/if}
              <div class="manager-environment-comp-override"><OverrideIndicator active={entry.hasDropRateAdjustment === true} /></div>
              <div class="manager-environment-comp-runtime"><CompositionStatePill state={entry.compositionState} /></div>
              <div class="manager-environment-comp-actions">
                {#if kind === 'task'}
                  <div class="manager-environment-comp-menu-wrap" use:dismissOnOutsideClick={{ enabled: openMenuId === entry.id, onDismiss: closeMenu }}>
                    <button type="button" class="manager-icon-button" aria-haspopup="menu" aria-expanded={openMenuId === entry.id} aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoreActions', 'More actions')} onclick={() => toggleMenu(entry.id)}>
                      <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                    </button>
                    {#if openMenuId === entry.id}
                      <div class="manager-environment-comp-menu" role="menu">
                        {#if mode === 'manual' && entry.compositionState === 'notMatching'}
                          <button type="button" role="menuitem" data-action="force-include" onclick={() => { onForceInclude(kind, entry.id); closeMenu(); }}><i class="fas fa-plus" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd', 'Force add')}</span></button>
                        {:else if mode === 'manual' && entry.compositionState === 'libraryDisabled'}
                          <button type="button" role="menuitem" class="manager-environment-comp-menu-note" disabled><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote', 'Enable in library first')}</span></button>
                        {/if}
                        <button type="button" role="menuitem" onclick={() => { onOpenSource(kind, entry.id); closeMenu(); }}><i class="fas fa-up-right-from-square" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSource', 'Open source record')}</span></button>
                      </div>
                    {/if}
                  </div>
                {:else}
                  {#if mode === 'manual' && entry.compositionState === 'notMatching'}
                    <button type="button" class="manager-button is-warning manager-environment-force-include" data-action="force-include" onclick={() => onForceInclude(kind, entry.id)}>
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd', 'Force add')}</span>
                    </button>
                  {:else if mode === 'manual' && entry.compositionState === 'libraryDisabled'}
                    <span class="manager-muted manager-environment-comp-disabled-note">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote', 'Enable in library first')}</span>
                  {/if}
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSource', 'Open source record')} onclick={() => onOpenSource(kind, entry.id)}>
                    <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        <Pagination
          totalCount={nonMatching.length}
          pageSize={nonMatchingPageSize}
          pageIndex={nonMatchingPageIndex}
          onPageChange={(next) => nonMatchingPageIndex = next}
          onPageSizeChange={(next) => { nonMatchingPageSize = next; nonMatchingPageIndex = 0; }}
        />
      {/if}
    </section>
  {/if}
</div>
