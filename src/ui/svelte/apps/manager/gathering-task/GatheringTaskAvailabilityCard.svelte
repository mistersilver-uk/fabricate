<!--
  The gathering task's availability card (issue 1522): biome, time-of-day and weather gates, each an
  add menu over a removable chip row with one polite live summary. `menuOpen` is bound from the view,
  whose task-switch reset shuts every menu. Writes the kind's whole list through `onUpdateTask`.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Field from '../../../components/Field.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import { formatList } from '../../../util/foundryBridge.js';
  import { conditionIcon, conditionId, conditionLabel } from './taskEditorLookups.js';

  let {
    text,
    task,
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    menuOpen = $bindable({ biomes: false, timeOfDay: false, weather: false }),
    onUpdateTask = () => {},
  } = $props();

  function conditionOptions(kind) {
    if (kind === 'weather') return weatherOptions;
    if (kind === 'biomes') return biomeOptions;
    return timeOfDayOptions;
  }

  function selectedConditionIds(kind) {
    let values;
    if (kind === 'weather') values = task?.weather;
    else if (kind === 'biomes') values = task?.biomes;
    else values = task?.timeOfDay;
    return Array.isArray(values)
      ? values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
  }

  function selectedConditionOptions(kind) {
    const selectedIds = selectedConditionIds(kind);
    return selectedIds.map(
      (id) =>
        (conditionOptions(kind) || []).find((option) => conditionId(option) === id) || {
          id,
          label: id,
        }
    );
  }

  function availableConditionOptions(kind) {
    const selectedIds = new Set(selectedConditionIds(kind));
    return (conditionOptions(kind) || []).filter((option) => {
      const id = conditionId(option);
      return id && !selectedIds.has(id);
    });
  }

  /**
   * The still-unselected conditions, shaped for `SearchablePopover` (issue 1458). Both `data`
   * hooks are this card's: `data-gathering-task-availability-option` names the menu a row belongs
   * to, since the panel is portaled out of its field, and `data-condition-id` is the attribute the
   * selected pills carry, so one selector reads a choice and its pill.
   */
  function availabilityMenuOptions(kind) {
    return availableConditionOptions(kind).map((option) => ({
      id: conditionId(option),
      label: conditionLabel(option),
      icon: conditionIcon(option),
      data: {
        'data-gathering-task-availability-option': kind,
        'data-condition-id': conditionId(option),
      },
    }));
  }

  function availabilityMenuLabel(kind) {
    const available = availableConditionOptions(kind);
    if (available.length === 0) {
      if (kind === 'weather') {
        return text(
          'FABRICATE.Admin.Manager.Environment.Tasks.AllWeatherSelected',
          'All weather selected'
        );
      }
      if (kind === 'biomes') {
        return text(
          'FABRICATE.Admin.Manager.Environment.Tasks.AllBiomesSelected',
          'All biomes selected'
        );
      }
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.AllTimesSelected',
        'All times selected'
      );
    }
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddWeatherCondition', 'Add weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddBiomeCondition', 'Add biome');
    }
    return text(
      'FABRICATE.Admin.Manager.Environment.Tasks.AddTimeOfDayCondition',
      'Add time of day'
    );
  }

  function availabilityFieldLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.Weather', 'Weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.Biome', 'Biome');
    }
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeOfDay', 'Time of day');
  }

  function emptyAvailabilityLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeatherTitle', 'Any Weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiomeTitle', 'Any Biome');
    }
    return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyTimeTitle', 'Any Time');
  }

  // One live region per row, because a bare chip cannot own one (`Chip.svelte`'s `removable`
  // note). It restates the whole set, named through the language's list conventions.
  function availabilitySummary(kind) {
    const options = selectedConditionOptions(kind);
    const body =
      options.length > 0
        ? formatList(options.map((option) => conditionLabel(option)))
        : emptyAvailabilityLabel(kind);
    return `${availabilityFieldLabel(kind)}: ${body}`;
  }

  function removeAvailabilityLabel(option) {
    return text(
      'FABRICATE.Admin.Manager.Environment.Tasks.RemoveAvailabilityCondition',
      'Remove {name}'
    ).replace('{name}', conditionLabel(option));
  }

  function addAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const selectedIds = selectedConditionIds(kind);
    if (selectedIds.includes(normalizedId)) return;
    onUpdateTask({ [kind]: [...selectedIds, normalizedId] });
  }

  function removeAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    onUpdateTask({ [kind]: selectedConditionIds(kind).filter((value) => value !== normalizedId) });
  }
</script>

<section class="manager-task-availability-card">
  <div class="manager-task-card-heading">
    <div>
      <h3>
        {text('FABRICATE.Admin.Manager.Environment.Tasks.TaskAvailability', 'Task Availability')}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityHint',
          'Availability controls whether this task can be attempted. Individual drops can still have their own time and weather modifiers.'
        )}
      </p>
    </div>
  </div>
  <div class="manager-task-availability-row" data-gathering-task-availability>
    {#each ['biomes', 'timeOfDay', 'weather'] as kind (kind)}
      <Field as="div" data-gathering-task-field={kind}>
        <span>{availabilityFieldLabel(kind)}</span>
        <!-- `SearchablePopover` (issue 1458). `showSearch={false}` keeps
             `triggerHasPopup="listbox"` truthful, and `bind:open` lets the view's task-switch reset
             close a portaled panel that would otherwise outlive its task. -->
        <SearchablePopover
          bind:open={menuOpen[kind]}
          options={availabilityMenuOptions(kind)}
          showSearch={false}
          triggerHasPopup="listbox"
          triggerClass="manager-condition-menu-button"
          triggerProps={{ 'data-chip-remove-fallback': '' }}
          triggerLabel={availabilityMenuLabel(kind)}
          panelLabel={availabilityFieldLabel(kind)}
          emptyHint={availabilityMenuLabel(kind)}
          onSelect={(id) => addAvailability(kind, id)}
        />
        <div class="manager-chip-row" data-gathering-task-availability-pills={kind}>
          {#if selectedConditionOptions(kind).length > 0}
            {#each selectedConditionOptions(kind) as option (conditionId(option))}
              <Chip
                tone="warning"
                icon={conditionIcon(option)}
                removable
                removeLabel={removeAvailabilityLabel(option)}
                onRemove={() => removeAvailability(kind, conditionId(option))}
                data-gathering-task-availability-pill={kind}
                data-condition-id={conditionId(option)}>{conditionLabel(option)}</Chip
              >
            {/each}
          {:else}
            <EmptyState inline field hint={emptyAvailabilityLabel(kind)} />
          {/if}
        </div>
        <p class="visually-hidden" aria-live="polite" data-gathering-task-availability-status>
          {availabilitySummary(kind)}
        </p>
      </Field>
    {/each}
  </div>
</section>
