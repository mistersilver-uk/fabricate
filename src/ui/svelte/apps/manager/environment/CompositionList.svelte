<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../../../actions/dismissOnOutsideClick.js';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import MatchingEvidenceChips from './MatchingEvidenceChips.svelte';
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
  function weightFor(id) {
    const raw = Number(weights?.[id]);
    return Number.isFinite(raw) ? raw : 1;
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

  const included = $derived(records.filter(entry =>
    entry.compositionState === 'includedByMatch'
    || entry.compositionState === 'explicitlyIncluded'
    || entry.compositionState === 'forceIncluded'
    || entry.compositionState === 'includedButUnavailable'));
  const candidates = $derived(records.filter(entry => entry.compositionState === 'candidate'));
  const excluded = $derived(records.filter(entry => entry.compositionState === 'excluded'));
  const nonMatching = $derived(records.filter(entry =>
    entry.compositionState === 'notMatching' || entry.compositionState === 'libraryDisabled'));
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

  function toggleMenu(id) { openMenuId = openMenuId === id ? '' : id; }
  function closeMenu() { openMenuId = ''; }

  function handleDrop(targetIndex) {
    if (dragIndex >= 0 && dragIndex !== targetIndex) onReorder(kind, dragIndex, targetIndex);
    dragIndex = -1;
  }
</script>

<div class="manager-environment-comp" data-composition-kind={kind} data-composition-mode={mode}>
  <!-- Included -->
  <section class="manager-environment-comp-section" data-section="included">
    <header class="manager-environment-comp-band">
      <h4>{includedTitle}</h4>
      <span class="manager-environment-comp-count">{included.length} {unit}</span>
    </header>

    <div class="manager-environment-comp-head" aria-hidden="true">
      <span></span>
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColTask', 'Task')}</span>
      <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColEvidence', 'Matching evidence')}</span>
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
            class={`manager-environment-comp-row ${selectedId === entry.id ? 'is-selected' : ''} ${entry.runtimeState === 'unavailable' ? 'is-unavailable' : ''}`}
            data-record-id={entry.id}
            data-runtime-state={entry.runtimeState}
            draggable={kind === 'hazard'}
            ondragstart={kind === 'hazard' ? () => { dragIndex = index; } : undefined}
            ondragover={kind === 'hazard' ? (event) => event.preventDefault() : undefined}
            ondrop={kind === 'hazard' ? (event) => { event.preventDefault(); handleDrop(index); } : undefined}
          >
            <span class="manager-environment-comp-handle" title={kind === 'hazard' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.DragReorder', 'Drag to reorder') : null}>
              {#if kind === 'hazard'}
                <i class="fas fa-grip-vertical" aria-hidden="true"></i>
                <span class="manager-environment-comp-order">{index + 1}</span>
              {/if}
            </span>
            <button type="button" class="manager-environment-comp-task" data-action="select" aria-pressed={selectedId === entry.id} onclick={() => onSelect(kind, entry.id)}>
              <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
              <span class="manager-environment-comp-copy">
                <span class="manager-environment-comp-name">{recordName(entry)}</span>
                <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
              </span>
            </button>
            <div class="manager-environment-comp-evidence"><MatchingEvidenceChips evidence={entry.evidence} /></div>
            <div class="manager-environment-comp-override">
              {#if showBlindWeights}
                <label class="manager-environment-comp-weight">
                  <span class="manager-environment-comp-weight-label">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Weight', 'Weight')}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    data-composition-weight={entry.id}
                    value={weightFor(entry.id)}
                    onchange={(event) => onWeightChange(entry.id, event.currentTarget.value)}
                  />
                </label>
              {:else if kind === 'hazard' && Number.isFinite(Number(entry.record?.dropRate))}
                <span class="manager-chip is-neutral">{Number(entry.record.dropRate)}%</span>
              {:else}
                <span class="manager-environment-comp-none">—</span>
              {/if}
            </div>
            <div class="manager-environment-comp-runtime"><RuntimeStatePill state={entry.runtimeState} /></div>
            <div class="manager-environment-comp-actions">
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSource', 'Open source record')} onclick={() => onOpenSource(kind, entry.id)}>
                <i class="fas fa-pen-to-square" aria-hidden="true"></i>
              </button>
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
                    <button type="button" role="menuitem" class="is-danger" data-action="exclude" onclick={() => { onExclude(kind, entry.id); closeMenu(); }}><i class="fas fa-ban" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Exclude', 'Exclude from environment')}</span></button>
                  </div>
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Matching candidates (manual only) -->
  {#if mode === 'manual'}
    <section class="manager-environment-comp-section" data-section="candidates">
      <header class="manager-environment-comp-band">
        <h4>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MatchingCandidates', 'Matching candidates')}</h4>
        <span class="manager-environment-comp-count">{candidates.length} {unit}</span>
      </header>
      {#if candidates.length === 0}
        <p class="manager-muted manager-environment-comp-empty">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoCandidates', 'No further matching records to include.')}</p>
      {:else}
        <ul class="manager-environment-comp-rows">
          {#each candidates as entry (entry.id)}
            <li class={`manager-environment-comp-row ${selectedId === entry.id ? 'is-selected' : ''}`} data-record-id={entry.id} data-section-row="candidate">
              <span class="manager-environment-comp-handle"></span>
              <button type="button" class="manager-environment-comp-task" data-action="select" aria-pressed={selectedId === entry.id} onclick={() => onSelect(kind, entry.id)}>
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </button>
              <div class="manager-environment-comp-evidence"><MatchingEvidenceChips evidence={entry.evidence} /></div>
              <div class="manager-environment-comp-override"><span class="manager-environment-comp-none">—</span></div>
              <div class="manager-environment-comp-runtime"><CompositionStatePill state={entry.compositionState} /></div>
              <div class="manager-environment-comp-actions">
                <button type="button" class="manager-button is-primary manager-environment-include" data-action="include" onclick={() => onInclude(kind, entry.id)}>
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Include', 'Include')}</span>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

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
            <span class="manager-environment-comp-handle"></span>
            <button type="button" class="manager-environment-comp-task" data-action="select" aria-pressed={selectedId === entry.id} onclick={() => onSelect(kind, entry.id)}>
              <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
              <span class="manager-environment-comp-copy">
                <span class="manager-environment-comp-name">{recordName(entry)}</span>
                <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
              </span>
            </button>
            <div class="manager-environment-comp-evidence"><MatchingEvidenceChips evidence={entry.evidence} /></div>
            <div class="manager-environment-comp-override"><span class="manager-environment-comp-none">—</span></div>
            <div class="manager-environment-comp-runtime"><CompositionStatePill state="excluded" /></div>
            <div class="manager-environment-comp-actions">
              <button type="button" class="manager-button manager-environment-restore" data-action="restore" onclick={() => onRestore(kind, entry.id)}>
                <i class="fas fa-rotate-left" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore', 'Restore')}</span>
              </button>
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
            <span class="manager-environment-comp-handle"></span>
            <button type="button" class="manager-environment-comp-task" data-action="select" aria-pressed={selectedId === entry.id} onclick={() => onSelect(kind, entry.id)}>
              <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
              <span class="manager-environment-comp-copy">
                <span class="manager-environment-comp-name">{recordName(entry)}</span>
                <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
              </span>
            </button>
            <div class="manager-environment-comp-evidence"><MatchingEvidenceChips evidence={entry.evidence} /></div>
            <div class="manager-environment-comp-override"><span class="manager-environment-comp-none">—</span></div>
            <div class="manager-environment-comp-runtime"><CompositionStatePill state={entry.compositionState} /></div>
            <div class="manager-environment-comp-actions">
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
</div>
