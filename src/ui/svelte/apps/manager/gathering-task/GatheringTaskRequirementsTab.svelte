<!--
  The gathering task editor's Requirements tab (issue 1522): what an attempt needs — availability,
  stamina, the task's check modifiers and check override, and its required tools. The availability
  menus and the tool search and page are bound through from the view.
-->
<script>
  import SubjectModifierPicker from '../SubjectModifierPicker.svelte';
  import GatheringTaskAvailabilityCard from './GatheringTaskAvailabilityCard.svelte';
  import GatheringTaskCard from './GatheringTaskCard.svelte';
  import GatheringTaskCheckOverrideCard from './GatheringTaskCheckOverrideCard.svelte';
  import GatheringTaskRequiredToolsCard from './GatheringTaskRequiredToolsCard.svelte';
  import GatheringTaskStaminaCard from './GatheringTaskStaminaCard.svelte';

  let {
    text,
    task,
    taskResolutionMode,
    staminaEnabled = false,
    checkConfig = null,
    previewActors = [],
    resolvePreviewCharacter = () => null,
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    characterModifierLibrary = [],
    checkModifierOptions = [],
    gatheringModifierPolicy = 'addAll',
    gatheringModifierMaxPicks = null,
    gatheringModifierDefaultIds = [],
    libraryTools = [],
    managedItemOptions = [],
    availabilityMenuOpen = $bindable(),
    toolSearchTerm = $bindable(),
    toolPageIndex = $bindable(),
    toolPageSize = $bindable(),
    onUpdateTask = () => {},
    onAddToolReference = () => {},
    onRemoveToolReference = () => {},
  } = $props();
</script>

<GatheringTaskAvailabilityCard
  {text}
  {task}
  {weatherOptions}
  {timeOfDayOptions}
  {biomeOptions}
  bind:menuOpen={availabilityMenuOpen}
  {onUpdateTask}
/>

{#if staminaEnabled}
  <GatheringTaskStaminaCard {text} {task} {characterModifierLibrary} {onUpdateTask} />
{/if}

<!-- This task's own CHECK-modifier pick (issue 1095), under the gathering check's `bySubject` rule in
     every resolution mode. The Checks screen carries the dormancy notice. -->
{#if gatheringModifierPolicy === 'bySubject'}
  <GatheringTaskCard
    class="manager-task-dc-card"
    title={text(
      'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueHeading',
      'Check modifiers'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Gathering.TaskCheckModifierHint',
      'Which of the system’s check modifiers apply to this task’s rolled gathering check. These are not the character modifiers on drop rows, which shift a drop’s percentage chance.'
    )}
    data-gathering-task-check-modifiers
  >
    <SubjectModifierPicker
      options={checkModifierOptions}
      selectedIds={Array.isArray(task?.checkModifierIds) ? task.checkModifierIds : null}
      maxPicks={gatheringModifierMaxPicks}
      inheritedIds={gatheringModifierDefaultIds}
      subject="task"
      testId="gathering-check-modifier"
      onChange={(next) =>
        onUpdateTask(
          Array.isArray(next) ? { checkModifierIds: next } : { checkModifierIds: undefined }
        )}
    />
  </GatheringTaskCard>
{/if}

<!-- Routed only: progressive has no target. -->
{#if taskResolutionMode === 'routed'}
  <GatheringTaskCheckOverrideCard
    {text}
    {task}
    {checkConfig}
    {previewActors}
    {resolvePreviewCharacter}
    {onUpdateTask}
  />
{/if}

<GatheringTaskRequiredToolsCard
  {text}
  {task}
  {libraryTools}
  {managedItemOptions}
  bind:toolSearchTerm
  bind:toolPageIndex
  bind:toolPageSize
  {onAddToolReference}
  {onRemoveToolReference}
/>
