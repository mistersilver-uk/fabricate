<!-- Svelte 5 runes mode -->
<script>
  import EmptyState from '../EmptyState.svelte';
  import {
    DEFAULT_GATHERING_EVENT_IMG,
    DEFAULT_GATHERING_TASK_IMG,
  } from '../../../../../gatheringImageDefaults.js';
  import { localize } from '../../../util/foundryBridge.js';
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import RuntimeStatePill from './RuntimeStatePill.svelte';
  import CompositionStatePill from './CompositionStatePill.svelte';
  import OverrideIndicator from './OverrideIndicator.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { ENVIRONMENT_INCLUDED_COMPOSITION_STATES } from '../../../../../systems/gatheringComposition.js';
  import IconButton from '../../../components/IconButton.svelte';

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

  let dragIndex = $state(-1);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
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
      text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Unnamed', 'Unnamed')
    );
  }
  function recordDescription(entry) {
    return (
      String(entry?.record?.description || '').trim() ||
      text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoDescription', 'No description')
    );
  }

  function runtimePillState(entry) {
    return entry?.runtimeState === 'unavailable' && entry?.conditionsMet === false
      ? 'conditionsBlocked'
      : entry?.runtimeState;
  }

  // The INCLUDED vocabulary, from its one home (issue 1321). It answers "does the Included
  // list show this", which is a different question from "does it compose" even though issue 1315
  // leaves the two sets with the same four members: `includedNotMatching` belongs here because a
  // manual pick composes whether or not it matches, and the GM still needs to see which is which.
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
    if (
      nonMatchingPageIndex > 0 &&
      nonMatchingPageIndex * nonMatchingPageSize >= nonMatching.length
    ) {
      nonMatchingPageIndex = 0;
    }
  });

  const includedTitle = $derived(
    mode === 'manual'
      ? text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.IncludedInEnvironment',
          'Included in this environment'
        )
      : text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.IncludedByMatchHeading',
          'Included by match'
        )
  );

  const unit = $derived(
    kind === 'event'
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.EventsUnit', 'events')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.TasksUnit', 'tasks')
  );
  const recordColumnLabel = $derived(
    kind === 'event'
      ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColEvent', 'Event')
      : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColTask', 'Task')
  );

  // ── THE FOUR OVERFLOW MENUS, AS DATA (issue 1477) ────────────────────────────────────────
  // The four hand-rolled `role="menu"` blocks this file carried are one `<ActionMenu>` each now,
  // and the only thing that ever differed between them was WHICH VERBS they offered. So the
  // difference is expressed as four item lists rather than as four copies of a menu, and the
  // shared primitive owns the ARIA and the keyboard contract that all four had to restate.
  //
  // Every `data-action` hook is preserved verbatim — `include`, `force-include`, `exclude`,
  // `restore` — because mounted suites and the View Lab's automatic-force-add case address these
  // rows by them. They ride the primitive's per-item `data` map, which is spread onto the item
  // button before the primitive's own attributes.
  const moreActionsLabel = $derived(
    text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoreActions', 'More actions')
  );

  function openSourceLabel() {
    return kind === 'event'
      ? text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceEvent',
          'Open source event'
        )
      : text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceTask',
          'Open source task'
        );
  }

  function openSourceItem() {
    return { id: 'open-source', label: openSourceLabel(), icon: 'fas fa-up-right-from-square' };
  }

  // The library gate precedes both composition modes, so a disabled record offers a NOTE rather
  // than a verb. It is a disabled `menuitem` with no icon: the primitive renders the icon cell
  // regardless, which is what keeps its label in the same text column as every other row.
  function libraryDisabledNote() {
    return {
      id: 'library-disabled',
      label: text(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote',
        'Enable in library first'
      ),
      disabled: true,
    };
  }

  function includedMenuItems(index) {
    const items = [];
    if (showEventRankControls) {
      items.push({
        id: 'move-up',
        label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoveUp', 'Move up'),
        icon: 'fas fa-arrow-up',
        disabled: index === 0,
      });
      items.push({
        id: 'move-down',
        label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.MoveDown', 'Move down'),
        icon: 'fas fa-arrow-down',
        disabled: index === included.length - 1,
      });
    }
    items.push(openSourceItem());
    items.push({
      id: 'exclude',
      label:
        mode === 'manual'
          ? text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Remove',
              'Remove from environment'
            )
          : text(
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
  // Open source either way. Stated once, because the two are otherwise token-identical bodies
  // differing only in their predicates and their verb — which is a copy the SonarCloud duplication
  // gate counts and, more to the point, is how the four menus in this file drifted apart before.
  // Each caller keeps its OWN predicate at its own call site, so the two questions ("does manual
  // mode allow a plain add?" and "does automatic mode allow a force?") stay visible.
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
        label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Include', 'Include'),
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
        label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore', 'Restore'),
        icon: 'fas fa-rotate-left',
        data: { 'data-action': 'restore' },
      },
    ];
  }

  function nonMatchingMenuItems(entry) {
    return gatedAddMenuItems(
      {
        id: 'force-include',
        label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd', 'Force add'),
        icon: 'fas fa-plus',
        data: { 'data-action': 'force-include' },
      },
      entry.compositionState === 'notMatching',
      entry.compositionState === 'libraryDisabled'
    );
  }

  // ONE dispatcher for all four menus, because the verbs are shared across them: `open-source`
  // appears in every one and `include` in two. A per-menu handler would be four copies of this
  // switch with different subsets, which is how the four menus drifted apart in the first place.
  function runMenuAction(id, entry, index) {
    if (id === 'move-up') onReorder(kind, index, index - 1);
    else if (id === 'move-down') onReorder(kind, index, index + 1);
    else if (id === 'open-source') onOpenSource(kind, entry.id);
    else if (id === 'include') onInclude(kind, entry.id);
    else if (id === 'force-include') onForceInclude(kind, entry.id);
    else if (id === 'exclude') onExclude(kind, entry.id);
    else if (id === 'restore') onRestore(kind, entry.id);
  }

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

  // This list is manual-mode only (its section is gated on `mode === 'manual'`), and manual
  // mode composes exactly what the GM picks, matching or not. So a non-matching record is
  // plainly added here — there is no filter for a force to override, and no `'force-include'`
  // for this function to return. Force add belongs to automatic mode's Non-matching section.
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
      {#if showEventRankControls}<span></span>{/if}
      <span>{recordColumnLabel}</span>
      {#if showBlindWeights}<span
          >{text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColWeight', 'Weight')}</span
        >{/if}
      <span
        >{text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColOverride',
          'Override'
        )}</span
      >
      <span
        >{text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ColRuntime',
          'Runtime state'
        )}</span
      >
      <span></span>
    </div>

    {#if included.length === 0}
      <EmptyState
        compact
        icon={kind === 'event' ? 'fas fa-masks-theater' : 'fas fa-list-check'}
        title={kind === 'event'
          ? text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoIncludedEvents',
              'No events are available in this environment yet.'
            )
          : text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoIncludedTasks',
              'No tasks are available in this environment yet.'
            )}
      />
    {:else}
      <ul class="manager-environment-comp-rows">
        {#each included as entry, index (entry.id)}
          <li
            class={`manager-environment-comp-row ${showEventRankControls ? 'has-rank-controls' : ''} ${selectedId === entry.id ? 'is-selected' : ''} ${entry.runtimeState === 'unavailable' ? 'is-unavailable' : ''} ${entry.conditionsMet === false ? 'is-conditions-blocked' : ''}`}
            data-record-id={entry.id}
            data-runtime-state={entry.runtimeState}
            draggable={showEventRankControls ? true : undefined}
            ondragstart={showEventRankControls
              ? () => {
                  dragIndex = index;
                }
              : undefined}
            ondragover={showEventRankControls ? (event) => event.preventDefault() : undefined}
            ondrop={showEventRankControls
              ? (event) => {
                  event.preventDefault();
                  handleDrop(index);
                }
              : undefined}
          >
            {#if showEventRankControls}
              <span
                class="manager-environment-comp-handle"
                title={text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.DragReorder',
                  'Drag to reorder'
                )}
              >
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
                <!-- A `<div>`, not the `<label>` wrapping an `.sr-only` caption it was: see
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
                      text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Weight', 'Weight')
                    )}
                    inputProps={{ 'data-composition-weight': entry.id }}
                    onChange={(weight) => onWeightChange(entry.id, weight)}
                  />
                </div>
                <span
                  class="manager-environment-comp-weight-percent"
                  data-composition-weight-percent={entry.id}
                  title={text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.WeightPercentage',
                    'Selection share'
                  )}
                  aria-label={text(
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
                  ariaLabel={text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickRemove',
                    'Remove'
                  )}
                  title={text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickRemove',
                    'Remove'
                  )}
                  onclick={() => onExclude(kind, entry.id)}
                >
                  <i class="fas fa-ban" aria-hidden="true"></i>
                </IconButton>
              {/if}
              <ActionMenu
                items={includedMenuItems(index)}
                triggerLabel={moreActionsLabel}
                onSelect={(action) => runMenuAction(action, entry, index)}
              />
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
        <h4>
          {text(
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
            ? text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoAvailableEventsToAdd',
                'No matching or non-matching events to add.'
              )
            : text(
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
                    ariaLabel={text(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.QuickAdd',
                      'Add'
                    )}
                    title={text(
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
                  triggerLabel={moreActionsLabel}
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
          {text(
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
          title={text(
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
                    triggerLabel={moreActionsLabel}
                    onSelect={(action) => runMenuAction(action, entry)}
                  />
                {:else}
                  <ManagerButton
                    class="manager-environment-restore"
                    data-action="restore"
                    onclick={() => onRestore(kind, entry.id)}
                  >
                    <i class="fas fa-rotate-left" aria-hidden="true"></i>
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Restore',
                        'Restore'
                      )}</span
                    >
                  </ManagerButton>
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
          {text(
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
            ? text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.NoNonMatchingEvents',
                'No non-matching or disabled events.'
              )
            : text(
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
                    triggerLabel={moreActionsLabel}
                    onSelect={(action) => runMenuAction(action, entry)}
                  />
                {:else}
                  {#if entry.compositionState === 'notMatching'}
                    <!-- THE `warning` REPAIR (issue 1118). This spelt its modifier
                         `is-warning`, and the sheet declares `.manager-button.is-warning-action`
                         while declaring `.manager-button.is-warning` NOWHERE — so Force add
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
                    <ManagerButton
                      role="warning"
                      class="manager-environment-force-include"
                      data-action="force-include"
                      onclick={() => onForceInclude(kind, entry.id)}
                    >
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      <span
                        >{text(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.ForceAdd',
                          'Force add'
                        )}</span
                      >
                    </ManagerButton>
                  {:else if entry.compositionState === 'libraryDisabled'}
                    <span class="manager-muted manager-environment-comp-disabled-note"
                      >{text(
                        'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.LibraryDisabledNote',
                        'Enable in library first'
                      )}</span
                    >
                  {/if}
                  <IconButton
                    ariaLabel={kind === 'event'
                      ? text(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.OpenSourceEvent',
                          'Open source event'
                        )
                      : text(
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
