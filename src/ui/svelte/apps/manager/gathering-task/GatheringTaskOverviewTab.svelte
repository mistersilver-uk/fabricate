<!--
  The gathering task editor's Overview tab (issue 1522): the task's identity, its resolution mode and
  its resource node. A legacy Progressive task is told, before the mode card, that leaving it is
  one-way. Every write goes through `onUpdateTask(patch)`.
-->
<script>
  import ArtPicker from '../../../components/ArtPicker.svelte';
  import Callout from '../../../components/Callout.svelte';
  import Field from '../../../components/Field.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import Select from '../../../components/Select.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import { DEFAULT_GATHERING_TASK_IMG } from '../../../../../gatheringImageDefaults.js';
  import { defaultEnvironmentOptions } from '../gatheringTaskSelectOptions.js';
  import GatheringTaskCard from './GatheringTaskCard.svelte';
  import GatheringTaskNodesCard from './GatheringTaskNodesCard.svelte';

  let {
    text,
    task,
    taskResolutionMode,
    nodesEnabled = false,
    environmentOptions = [],
    onPickImagePath = null,
    onUpdateTask = () => {},
  } = $props();

  const AUTHORABLE_RESOLUTION_MODES = new Set(['straight', 'd100', 'routed']);
  const resolutionModeOptions = [
    {
      value: 'straight',
      icon: 'fas fa-gift',
      labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.Straight',
      fallback: 'Direct',
      descKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.StraightDesc',
      descFallback: 'Awards every item in one result set without rolling for yields.',
    },
    {
      value: 'd100',
      icon: 'fas fa-dice-d20',
      labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.D100',
      fallback: 'd100',
      descKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.D100Desc',
      descFallback: 'Rolls once against this task’s drop rows.',
    },
    {
      value: 'routed',
      icon: 'fas fa-route',
      labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.Routed',
      fallback: 'Check',
      descKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.RoutedDesc',
      descFallback: 'A gathering-check tier selects the same-named result set.',
    },
  ];

  // The caption ids the default-environment picker is named and described by (issue 1510).
  const instanceId = $props.id();
  const captionIds = {
    defaultEnvironment: `${instanceId}-default-environment`,
    defaultEnvironmentHint: `${instanceId}-default-environment-hint`,
  };
  const environmentSelectOptions = $derived(
    defaultEnvironmentOptions(environmentOptions || [], text)
  );

  function setTaskResolutionMode(mode) {
    if (!AUTHORABLE_RESOLUTION_MODES.has(mode)) return;
    onUpdateTask({ resolutionMode: mode });
  }

  function taskImage() {
    return task?.img || DEFAULT_GATHERING_TASK_IMG;
  }

  async function chooseTaskImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(task?.img || '');
    if (value) onUpdateTask({ img: value });
  }

  function setDefaultEnvironment(value) {
    const id = String(value ?? '').trim();
    onUpdateTask({ defaultEnvironmentId: id || null });
  }
</script>

<section class="manager-task-core-card" data-gathering-task-core-editor>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.TaskIdentity', 'Task Identity')}</h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.TaskIdentityHint',
          'Name the task, give it a description, choose an image, and toggle whether it is enabled.'
        )}
      </p>
    </div>
  </div>
  <div class="manager-task-core-grid">
    <div class="manager-task-media-column">
      <ArtPicker
        class="manager-task-art"
        art={taskImage()}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.ChooseImage',
          'Choose task image'
        )}
        onPick={chooseTaskImage}
        disabled={typeof onPickImagePath !== 'function'}
      />

      <div class="manager-task-core-status">
        <StatusToggle
          on={task.enabled !== false}
          label={task.enabled === false
            ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
            : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Environment.Tasks.ToggleNamed',
            'Toggle {name}'
          ).replace(
            '{name}',
            task.name ||
              text(
                'FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask',
                'Unnamed gathering task'
              )
          )}
          data-gathering-task-field="enabled"
          onclick={() => onUpdateTask({ enabled: task.enabled === false })}
        />
        <p class="manager-muted">
          {task.enabled === false
            ? text(
                'FABRICATE.Admin.Manager.Environment.Tasks.DisabledHint',
                'Players cannot attempt this task while it is disabled.'
              )
            : text(
                'FABRICATE.Admin.Manager.Environment.Tasks.EnabledHint',
                'This task is available when its gates match.'
              )}
        </p>
      </div>
    </div>

    <div class="manager-task-identity-fields">
      <Field as="label">
        <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Name', 'Name')}</span>
        <input
          data-gathering-task-field="name"
          value={task.name || ''}
          oninput={(event) => onUpdateTask({ name: event.currentTarget.value })}
        />
      </Field>
      <Field as="label">
        <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Description', 'Description')}</span>
        <textarea
          data-gathering-task-field="description"
          value={task.description || ''}
          oninput={(event) => onUpdateTask({ description: event.currentTarget.value })}></textarea>
      </Field>
      <!-- A `<div>`, not a `<label>`: `Select.svelte`'s host invariant (issue 1510). -->
      <Field as="div">
        <span id={captionIds.defaultEnvironment}
          >{text(
            'FABRICATE.Admin.Manager.Environment.Tasks.DefaultEnvironment',
            'Default environment (canvas drop)'
          )}</span
        >
        <Select
          class="manager-task-field-select"
          value={task.defaultEnvironmentId || ''}
          options={environmentSelectOptions}
          showTick={false}
          ariaLabelledBy={captionIds.defaultEnvironment}
          ariaDescribedBy={captionIds.defaultEnvironmentHint}
          triggerProps={{ 'data-gathering-task-field': 'defaultEnvironmentId' }}
          onChange={(next) => setDefaultEnvironment(next)}
        />
        <span id={captionIds.defaultEnvironmentHint} class="manager-muted"
          >{text(
            'FABRICATE.Admin.Manager.Environment.Tasks.DefaultEnvironmentHint',
            'Used when a dropped node is not inside a tagged scene region. Hold Alt while dropping to always pick manually.'
          )}</span
        >
      </Field>
    </div>
  </div>
</section>

<!-- A standing statement, so a warning `Callout` before the card it qualifies: leaving Progressive
     is one-way. -->
{#if taskResolutionMode === 'progressive'}
  <Callout
    tone="warning"
    icon="fas fa-clock-rotate-left"
    text={text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.ProgressiveLegacy',
      'This legacy task keeps its Progressive runtime behavior. Choose Direct, d100, or Check to replace it; Progressive is not available for new task authoring.'
    )}
    data-gathering-progressive-legacy
  />
{/if}

<GatheringTaskCard
  class="manager-task-resolution-card"
  title={text('FABRICATE.Admin.Manager.Environment.Tasks.Resolution.Title', 'Gathering resolution')}
  hint={text(
    'FABRICATE.Admin.Manager.Environment.Tasks.Resolution.Hint',
    'Choose how this task turns an attempt into gathered results.'
  )}
  data-gathering-task-resolution
>
  <RadioCardGroup
    legendKey="FABRICATE.Admin.Manager.Environment.Tasks.Resolution.Title"
    legend="Gathering resolution"
    options={resolutionModeOptions}
    selectedValue={taskResolutionMode}
    groupName={`gathering-task-resolution-${task.id}`}
    columns={3}
    legendVisible={false}
    data-gathering-task-resolution-mode
    optionDataAttr="data-gathering-task-resolution-option"
    onChange={setTaskResolutionMode}
  />
</GatheringTaskCard>

<GatheringTaskNodesCard {text} {task} {nodesEnabled} {onPickImagePath} {onUpdateTask} />
