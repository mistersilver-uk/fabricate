<!-- Svelte 5 runes mode -->
<script>
  import EmptyState from '../../../components/EmptyState.svelte';
  import {
    DEFAULT_GATHERING_EVENT_IMG,
    DEFAULT_GATHERING_TASK_IMG,
  } from '../../../../../gatheringImageDefaults.js';
  import { localizeOr } from '../../../util/localizeOr.js';
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import OverrideIndicator from './OverrideIndicator.svelte';
  import Button from '../../../components/Button.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { ENVIRONMENT_INCLUDED_COMPOSITION_STATES } from '../../../../../systems/gatheringComposition.js';
  import IconButton from '../../../components/IconButton.svelte';
  import SortableList from '../../../components/SortableList.svelte';

  let {
    kind = 'task',
    records = [],
    mode = 'automatic',
    selectionMode = 'targeted',
    eventSelectionMode = 'allDrops',
    weights = {},
    onWeightChange = () => {},
    selectedId = '',
    onSelect = () => {},
    onInclude = () => {},
    onForceInclude = () => {},
    onExclude = () => {},
    onRestore = () => {},
    onReorder = () => {},
    onOpenSource = () => {},
  } = $props();

  let nonMatchingPageIndex = $state(0);
  let nonMatchingPageSize = $state(10);

  const showBlindWeights = $derived(kind === 'task' && selectionMode === 'blind');
  const showEventRankControls = $derived(
    kind === 'event' && eventSelectionMode === 'highestRankedDrop'
  );
  function weightFor(id) {
    const raw = Number(weights?.[id]);
    return Number.isFinite(raw) && raw >= 0 ? raw : 1;
  }

  const defaultImg = $derived(
    kind === 'event' ? DEFAULT_GATHERING_EVENT_IMG : DEFAULT_GATHERING_TASK_IMG
  );

  function recordImage(entry) {
    return entry?.record?.img || defaultImg;
  }
  function recordName(entry) {
    return (
      entry?.record?.name ||
      entry?.id ||
      localizeOr('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed')
    );
  }
  function recordDescription(entry) {
    return (
      String(entry?.record?.description || '').trim() ||
      localizeOr(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoDescription',
        'No description'
      )
    );
  }

  function runtimePillState(entry) {
    return entry?.runtimeState === 'unavailable' && entry?.conditionsMet === false
      ? 'conditionsBlocked'
      : entry?.runtimeState;
  }

  // The INCLUDED vocabulary, from its one home (issue 1321). It answers "does the Included
  // list show this", not "does it compose", though issue 1315 gives both sets the same four
  // members: `includedNotMatching` is here because a manual pick composes matching or not.
  const included = $derived(
    records.filter((entry) => ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(entry.compositionState))
  );
  const includedWeightTotal = $derived(
    included.reduce((total, entry) => total + weightFor(entry.id), 0)
  );
  const excluded = $derived(records.filter((entry) => entry.compositionState === 'excluded'));
  const nonMatching = $derived(
    records.filter(
      (entry) =>
        entry.compositionState === 'notMatching' || entry.compositionState === 'libraryDisabled'
    )
  );
  const availableToAddMatching = $derived(
    records.filter((entry) => entry.compositionState === 'candidate')
  );
  const availableToAddNonMatching = $derived(
    records.filter((entry) => entry.compositionState === 'notMatching')
  );
  const availableToAddLibraryDisabled = $derived(
    records.filter((entry) => entry.compositionState === 'libraryDisabled')
  );
  const availableToAdd = $derived([
    ...availableToAddMatching,
    ...availableToAddNonMatching,
    ...availableToAddLibraryDisabled,
  ]);
  const paginatedNonMatching = $derived(
    nonMatching.slice(
      nonMatchingPageIndex * nonMatchingPageSize,
      (nonMatchingPageIndex + 1) * nonMatchingPageSize
    )
  );
  $effect(() => {
    if (nonMatchingPageIndex * nonMatchingPageSize >= nonMatching.length) nonMatchingPageIndex = 0;
  });

  const includedTitle = $derived(
    mode === 'manual'
      ? localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.IncludedInEnvironment',
          'Included in this environment'
        )
      : localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.IncludedByMatchHeading',
          'Included by match'
        )
  );

  const unit = $derived(
    kind === 'event'
      ? localizeOr('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.EventsUnit', 'events')
      : localizeOr('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.TasksUnit', 'tasks')
  );
  const recordColumnLabel = $derived(
    kind === 'event'
      ? localizeOr('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColEvent', 'Event')
      : localizeOr('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColTask', 'Task')
  );

  // ── THE FOUR OVERFLOW MENUS, AS DATA (issue 1477) ────────────────────────────────────────
  // The four hand-rolled `role="menu"` blocks are one `<ActionMenu>` each now; only WHICH VERBS
  // they offered ever differed, so that is four item lists, and the shared primitive owns the
  // ARIA and keyboard contract all four had to restate.
  // Every `data-action` hook is preserved verbatim — `include`, `force-include`, `exclude`,
  // `restore` — because mounted suites and the View Lab's automatic-force-add case address rows
  // by them. They ride the primitive's per-item `data` map, spread onto the item button first.
  const moreActionsLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoreActions', 'More actions')
  );

  function openSourceLabel() {
    return kind === 'event'
      ? localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceEvent',
          'Open source event'
        )
      : localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceTask',
          'Open source task'
        );
  }

  function openSourceItem() {
    return { id: 'open-source', label: openSourceLabel(), icon: 'fas fa-up-right-from-square' };
  }

  // The library gate precedes both composition modes, so a disabled record offers a NOTE, not a
  // verb: a disabled `menuitem` with no icon (the primitive renders the icon cell regardless,
  // keeping its label in the same text column).
  function libraryDisabledNote() {
    return {
      id: 'library-disabled',
      label: localizeOr(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote',
        'Enable in library first'
      ),
      disabled: true,
    };
  }

  // No move verbs (issue 1512): the list draws a visible rocker on every ordered row.
  function includedMenuItems() {
    const items = [];
    items.push(openSourceItem());
    items.push({
      id: 'exclude',
      label:
        mode === 'manual'
          ? localizeOr(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Remove',
              'Remove from environment'
            )
          : localizeOr(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Exclude',
              'Exclude from environment'
            ),
      icon: 'fas fa-ban',
      danger: true,
      data: { 'data-action': 'exclude' },
    });
    return items;
  }

  // The Available-to-add and Non-matching menus are ONE SHAPE offering two different verbs: an add
  // verb when the row can be composed, the library note when the library gate blocks it, and
  // Open source either way. Stated once: token-identical bodies are a copy the SonarCloud
  // duplication gate counts, and are how the four menus drifted apart before. Each caller keeps
  // its OWN predicate at its own call site, so the two questions stay visible.
  function gatedAddMenuItems(verb, allowed, blockedByLibrary) {
    const items = [];
    if (allowed) items.push(verb);
    else if (blockedByLibrary) items.push(libraryDisabledNote());
    items.push(openSourceItem());
    return items;
  }

  function availableMenuItems(entry) {
    return gatedAddMenuItems(
      {
        id: 'include',
        label: localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Include',
          'Include'
        ),
        icon: 'fas fa-plus',
        data: { 'data-action': 'include' },
      },
      availableRowAction(entry) === 'include',
      availableRowAction(entry) === 'library-disabled'
    );
  }

  function excludedMenuItems() {
    return [
      openSourceItem(),
      {
        id: 'restore',
        label: localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore',
          'Restore'
        ),
        icon: 'fas fa-rotate-left',
        data: { 'data-action': 'restore' },
      },
    ];
  }

  function nonMatchingMenuItems(entry) {
    return gatedAddMenuItems(
      {
        id: 'force-include',
        label: localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd',
          'Force add'
        ),
        icon: 'fas fa-plus',
        data: { 'data-action': 'force-include' },
      },
      entry.compositionState === 'notMatching',
      entry.compositionState === 'libraryDisabled'
    );
  }

  // ONE dispatcher for all four menus: `open-source` appears in every one and `include` in two,
  // and a per-menu handler would be four copies of this switch with different subsets.
  function runMenuAction(id, entry) {
    if (id === 'open-source') onOpenSource(kind, entry.id);
    else if (id === 'include') onInclude(kind, entry.id);
    else if (id === 'force-include') onForceInclude(kind, entry.id);
    else if (id === 'exclude') onExclude(kind, entry.id);
    else if (id === 'restore') onRestore(kind, entry.id);
  }

  function formatWeightPercentage(id) {
    if (includedWeightTotal <= 0) return '0%';
    const rounded = Math.round((weightFor(id) / includedWeightTotal) * 1000) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  }

  // The caller's per-record state, on the row element the primitive owns (issue 1512), under the
  // caller's own family class: a rule keyed on the primitive's row class behind an application
  // root is the app-rooting the rooting requirement refuses.
  function includedRowClasses(entry) {
    return [
      'manager-environment-comp-entry',
      selectedId === entry.id ? 'is-selected' : '',
      entry.runtimeState === 'unavailable' ? 'is-unavailable' : '',
      entry.conditionsMet === false ? 'is-conditions-blocked' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  function availableRowBucket(entry) {
    return entry?.compositionState === 'candidate' ? 'candidate' : 'non-matching';
  }

  // This list is manual-mode only (gated on `mode === 'manual'`), which composes exactly what the
  // GM picks, matching or not. So a non-matching record is plainly added here: no filter for a
  // force to override, no `'force-include'` to return. Force add belongs to automatic mode.
  // `libraryDisabled` is still not addable: the library gate precedes both modes.
  function availableRowAction(entry) {
    if (entry?.compositionState === 'candidate' || entry?.compositionState === 'notMatching')
      return 'include';
    if (entry?.compositionState === 'libraryDisabled') return 'library-disabled';
    return '';
  }
</script>

<div
  class="manager-environment-comp"
  data-composition-kind={kind}
  data-composition-mode={mode}
  data-composition-selection={selectionMode}
>
  <!-- Included -->
  <section class="manager-environment-comp-section" data-section="included">
    <header class="manager-environment-comp-band">
      <h4>{includedTitle}</h4>
      <span class="manager-environment-comp-count">{included.length} {unit}</span>
    </header>

    <div
      class="manager-environment-comp-head"
      class:has-rank-controls={showEventRankControls}
      aria-hidden="true"
    >
      <!-- The lead track is the list's own cluster (issue 1512): the grip, the gap and the ordinal
           badge the list draws before the record's cells, declared in the sheet from the same
           tokens. Without it every label sits one cluster left of the column it names. -->
      <span></span>
      <span>{recordColumnLabel}</span>
      {#if showBlindWeights}<span
          >{localizeOr(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColWeight',
            'Weight'
          )}</span
        >{/if}
      <span
        >{localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColOverride',
          'Override'
        )}</span
      >
      <span
        >{localizeOr(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColRuntime',
          'Runtime state'
        )}</span
      >
      <span></span>
      <!-- The trailing track under the list's chevron rocker, which only an ordered row
           draws. -->
      {#if showEventRankControls}<span></span>{/if}
    </div>

    {#if included.length === 0}
      <EmptyState
        compact
        icon={kind === 'event' ? 'fas fa-masks-theater' : 'fas fa-list-check'}
        title={kind === 'event'
          ? localizeOr(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoIncludedEvents',
              'No events are available in this environment yet.'
            )
          : localizeOr(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoIncludedTasks',
              'No tasks are available in this environment yet.'
            )}
      />
    {:else}
      <SortableList
        items={included}
        itemLabel={recordName}
        numbered
        expandable={false}
        reorderable={showEventRankControls}
        onReorder={(from, to) => onReorder(kind, from, to)}
        rowClass={(entry) => includedRowClasses(entry)}
        rowData={(entry) => ({
          'data-record-id': entry.id,
          'data-runtime-state': entry.runtimeState,
        })}
      >
        {#snippet row(entry)}
          <!-- The record's cells, as a grid on the same variable the column-header strip reads, so
               a label sits over the column it names. -->
          <div class="manager-environment-comp-cells">
            <button
              type="button"
              class="manager-environment-comp-task"
              data-action="select"
              data-keyboard-focus="true"
              aria-pressed={selectedId === entry.id}
              onclick={() => onSelect(kind, entry.id)}
            >
              <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
              <span class="manager-environment-comp-copy">
                <span class="manager-environment-comp-name">{recordName(entry)}</span>
                <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
              </span>
            </button>
            {#if showBlindWeights}
              <div class="manager-environment-comp-weight">
                <!-- A `<div>`, not the `<label>` wrapping a `.visually-hidden` caption it was: see
                     the NAMING contract in `Stepper.svelte`. The commit moment moves from
                     `change` to `input`, matching every other stepper; the persisted value
                     is identical. -->
                <div class="manager-environment-comp-weight-field">
                  <Stepper
                    value={weightFor(entry.id)}
                    min={0}
                    step={1}
                    fill
                    {...stepperLabels(
                      localizeOr(
                        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Weight',
                        'Weight'
                      )
                    )}
                    inputProps={{ 'data-composition-weight': entry.id }}
                    onChange={(weight) => onWeightChange(entry.id, weight)}
                  />
                </div>
                <span
                  class="manager-environment-comp-weight-percent"
                  data-composition-weight-percent={entry.id}
                  title={localizeOr(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.WeightPercentage',
                    'Selection share'
                  )}
                  aria-label={localizeOr(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.WeightPercentage',
                    'Selection share'
                  )}>{formatWeightPercentage(entry.id)}</span
                >
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
                <IconButton
                  class="is-danger manager-environment-comp-quick-action"
                  data-quick-action="exclude"
                  data-action="exclude"
                  ariaLabel={localizeOr(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickRemove',
                    'Remove'
                  )}
                  title={localizeOr(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickRemove',
                    'Remove'
                  )}
                  onclick={() => onExclude(kind, entry.id)}
                >
                  <i class="fas fa-ban" aria-hidden="true"></i>
                </IconButton>
              {/if}
              <ActionMenu
                items={includedMenuItems()}
                ariaLabel={moreActionsLabel}
                onSelect={(action) => runMenuAction(action, entry)}
              />
            </div>
          </div>
        {/snippet}
      </SortableList>
    {/if}
  </section>

  <!-- Available to add (manual mode only) -->
  {#if mode === 'manual'}
    <section class="manager-environment-comp-section" data-section="available-to-add">
      <header class="manager-environment-comp-band">
        <h4>
          {localizeOr(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.AvailableToAdd',
            'Available to add'
          )}
        </h4>
        <span class="manager-environment-comp-count">{availableToAdd.length} {unit}</span>
      </header>
      {#if availableToAdd.length === 0}
        <EmptyState
          compact
          icon="fas fa-circle-plus"
          title={kind === 'event'
            ? localizeOr(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoAvailableEventsToAdd',
                'No matching or non-matching events to add.'
              )
            : localizeOr(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoAvailableTasksToAdd',
                'No matching or non-matching tasks to add.'
              )}
        />
      {:else}
        <ul class="manager-environment-comp-rows is-available-to-add">
          {#each availableToAdd as entry (entry.id)}
            <li
              class={`manager-environment-comp-row ${availableRowBucket(entry) === 'candidate' ? '' : 'is-non-matching'} ${selectedId === entry.id ? 'is-selected' : ''}`}
              data-record-id={entry.id}
              data-section-row={availableRowBucket(entry)}
              data-composition-state={entry.compositionState}
            >
              <button
                type="button"
                class="manager-environment-comp-task"
                data-action="select"
                data-keyboard-focus="true"
                aria-pressed={selectedId === entry.id}
                onclick={() => onSelect(kind, entry.id)}
              >
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </button>
              {#if showBlindWeights}<div class="manager-environment-comp-weight">
                  <span class="manager-environment-comp-none">—</span>
                </div>{/if}
              <div class="manager-environment-comp-override">
                <OverrideIndicator active={entry.hasDropRateAdjustment === true} />
              </div>
              <div class="manager-environment-comp-runtime">
                <CompositionStatePill state={entry.compositionState} />
              </div>
              <div class="manager-environment-comp-actions">
                {#if availableRowAction(entry) === 'include'}
                  <IconButton
                    class="is-primary manager-environment-comp-quick-action"
                    data-quick-action="include"
                    data-action="include"
                    ariaLabel={localizeOr(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickAdd',
                      'Add'
                    )}
                    title={localizeOr(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickAdd',
                      'Add'
                    )}
                    onclick={() => onInclude(kind, entry.id)}
                  >
                    <i class="fas fa-circle-plus" aria-hidden="true"></i>
                  </IconButton>
                {/if}
                <ActionMenu
                  items={availableMenuItems(entry)}
                  ariaLabel={moreActionsLabel}
                  onSelect={(action) => runMenuAction(action, entry)}
                />
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
        <h4>
          {localizeOr(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ExcludedFromEnvironment',
            'Excluded from this environment'
          )}
        </h4>
        <span class="manager-environment-comp-count">{excluded.length} {unit}</span>
      </header>
      {#if excluded.length === 0}
        <EmptyState
          compact
          icon="fas fa-ban"
          title={localizeOr(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoExcluded',
            'Nothing is excluded.'
          )}
        />
      {:else}
        <ul class="manager-environment-comp-rows">
          {#each excluded as entry (entry.id)}
            <li
              class={`manager-environment-comp-row is-excluded ${selectedId === entry.id ? 'is-selected' : ''}`}
              data-record-id={entry.id}
              data-section-row="excluded"
            >
              <button
                type="button"
                class="manager-environment-comp-task"
                data-action="select"
                data-keyboard-focus="true"
                aria-pressed={selectedId === entry.id}
                onclick={() => onSelect(kind, entry.id)}
              >
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </button>
              {#if showBlindWeights}<div class="manager-environment-comp-weight">
                  <span class="manager-environment-comp-none">—</span>
                </div>{/if}
              <div class="manager-environment-comp-override">
                <OverrideIndicator active={entry.hasDropRateAdjustment === true} />
              </div>
              <div class="manager-environment-comp-runtime">
                <CompositionStatePill state="excluded" />
              </div>
              <div class="manager-environment-comp-actions">
                {#if kind === 'task'}
                  <ActionMenu
                    items={excludedMenuItems()}
                    ariaLabel={moreActionsLabel}
                    onSelect={(action) => runMenuAction(action, entry)}
                  />
                {:else}
                  <Button
                    class="manager-environment-restore"
                    data-action="restore"
                    onclick={() => onRestore(kind, entry.id)}
                  >
                    <i class="fas fa-rotate-left" aria-hidden="true"></i>
                    <span
                      >{localizeOr(
                        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore',
                        'Restore'
                      )}</span
                    >
                  </Button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Non-matching (replaces the diagnostics disclosure; automatic mode allows force-add). -->
    <section class="manager-environment-comp-section" data-section="non-matching">
      <header class="manager-environment-comp-band">
        <h4>
          {localizeOr(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NonMatching',
            'Non-matching'
          )}
        </h4>
        <span class="manager-environment-comp-count">{nonMatching.length} {unit}</span>
      </header>
      {#if nonMatching.length === 0}
        <EmptyState
          compact
          icon="fas fa-filter-circle-xmark"
          title={kind === 'event'
            ? localizeOr(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoNonMatchingEvents',
                'No non-matching or disabled events.'
              )
            : localizeOr(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoNonMatchingTasks',
                'No non-matching or disabled tasks.'
              )}
        />
      {:else}
        <ul class="manager-environment-comp-rows is-non-matching">
          {#each paginatedNonMatching as entry (entry.id)}
            <li
              class="manager-environment-comp-row is-non-matching"
              data-record-id={entry.id}
              data-section-row="non-matching"
              data-composition-state={entry.compositionState}
            >
              <button
                type="button"
                class="manager-environment-comp-task"
                data-action="select"
                data-keyboard-focus="true"
                aria-pressed={selectedId === entry.id}
                onclick={() => onSelect(kind, entry.id)}
              >
                <img class="manager-environment-comp-thumb" src={recordImage(entry)} alt="" />
                <span class="manager-environment-comp-copy">
                  <span class="manager-environment-comp-name">{recordName(entry)}</span>
                  <span class="manager-environment-comp-sub">{recordDescription(entry)}</span>
                </span>
              </button>
              {#if showBlindWeights}<div class="manager-environment-comp-weight">
                  <span class="manager-environment-comp-none">—</span>
                </div>{/if}
              <div class="manager-environment-comp-override">
                <OverrideIndicator active={entry.hasDropRateAdjustment === true} />
              </div>
              <div class="manager-environment-comp-runtime">
                <CompositionStatePill state={entry.compositionState} />
              </div>
              <div class="manager-environment-comp-actions">
                {#if kind === 'task'}
                  <ActionMenu
                    items={nonMatchingMenuItems(entry)}
                    ariaLabel={moreActionsLabel}
                    onSelect={(action) => runMenuAction(action, entry)}
                  />
                {:else}
                  {#if entry.compositionState === 'notMatching'}
                    <!-- THE `warning` REPAIR (issue 1118). This spelt its modifier
                         `is-warning`, and the sheet declares `.fabricate-button.is-warning-action`
                         while declaring `.fabricate-button.is-warning` NOWHERE — so Force add
                         shipped with no warning treatment at all, and the amber treatment
                         shipped with no call site. `role="warning"` emits the class that
                         exists, which is why the role-to-class relation in the primitive is a
                         NAMED MAPPING rather than a template over the role name.

                         The typo survived review because the control never rendered: its
                         guard demanded `mode === 'manual'` inside a section gated on
                         `mode !== 'manual'`. Issue 1315 settled where a force add belongs —
                         automatic mode, the one mode with a filter for it to override — so
                         the guard now tests composition state alone and takes its mode from
                         the enclosing section. This is the `warning` role's live consumer. -->
                    <Button
                      role="warning"
                      class="manager-environment-force-include"
                      data-action="force-include"
                      onclick={() => onForceInclude(kind, entry.id)}
                    >
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      <span
                        >{localizeOr(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd',
                          'Force add'
                        )}</span
                      >
                    </Button>
                  {:else if entry.compositionState === 'libraryDisabled'}
                    <span class="manager-muted manager-environment-comp-disabled-note"
                      >{localizeOr(
                        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote',
                        'Enable in library first'
                      )}</span
                    >
                  {/if}
                  <IconButton
                    ariaLabel={kind === 'event'
                      ? localizeOr(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceEvent',
                          'Open source event'
                        )
                      : localizeOr(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceTask',
                          'Open source task'
                        )}
                    onclick={() => onOpenSource(kind, entry.id)}
                  >
                    <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
                  </IconButton>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        <Pagination
          totalCount={nonMatching.length}
          pageSize={nonMatchingPageSize}
          pageIndex={nonMatchingPageIndex}
          onPageChange={(next) => (nonMatchingPageIndex = next)}
          onPageSizeChange={(next) => {
            nonMatchingPageSize = next;
            nonMatchingPageIndex = 0;
          }}
        />
      {/if}
    </section>
  {/if}
</div>
