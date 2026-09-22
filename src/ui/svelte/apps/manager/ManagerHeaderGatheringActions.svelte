<!-- Svelte 5 runes mode -->
<!--
  The page header's action group for the gathering family of routes: the library's two tabbed
  creates and the environment, task and event editors (issue 1720).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `currentView` | the active route token | `''` | selects one branch; the caller renders this unit only for the gathering family |
  | `displayedGatheringTab` | the library's active tab | `''` | the library's create action is per tab |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Every other prop is one branch's own dirty, saving, validity or handler leg.

  Invariants:
  - Branch order is the shipped ladder's, pinned by `tests/manager-header-families.test.js`.
  - Each button role is a literal, because `manager-button-cascade-inventory.test.js` counts
    `role="primary"` and `role="ghost"` sites per file.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';

  let {
    text = () => {},
    currentView = '',
    displayedGatheringTab = '',
    canShowEnvironments = false,
    createGatheringTaskForSystem = () => {},
    createGatheringEventForSystem = () => {},
    createEnvironment = () => {},
    environmentDraftDirty = false,
    environmentDraftIsNew = false,
    environmentSaving = false,
    backToEnvironmentsBrowse = () => {},
    deleteEnvironmentDraft = () => {},
    saveEnvironmentEdit = () => {},
    gatheringTaskDraftDirty = false,
    gatheringTaskSaving = false,
    gatheringTaskValidation = null,
    gatheringTaskSaveError = '',
    selectedGatheringTaskId = '',
    backToGatheringTaskLibrary = () => {},
    deleteGatheringTaskDraft = () => {},
    saveGatheringTaskDraft = () => {},
    gatheringEventDraftDirty = false,
    gatheringEventSaving = false,
    gatheringEventValidation = null,
    gatheringEventSaveError = '',
    selectedGatheringEventId = '',
    backToGatheringEventLibrary = () => {},
    deleteGatheringEventDraft = () => {},
    saveGatheringEventDraft = () => {},
  } = $props();
</script>

{#if currentView === 'environments' && displayedGatheringTab === 'tasks'}
  <ManagerButton
    role="primary"
    onclick={createGatheringTaskForSystem}
    disabled={!canShowEnvironments}
  >
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Create', 'Create gathering task')}</span>
  </ManagerButton>
{:else if currentView === 'environments' && displayedGatheringTab === 'encounters'}
  <ManagerButton
    role="primary"
    onclick={createGatheringEventForSystem}
    disabled={!canShowEnvironments}
  >
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span
      >{text('FABRICATE.Admin.Manager.Environment.Events.Create', 'Create gathering event')}</span
    >
  </ManagerButton>
{:else if currentView === 'environments'}
  <ManagerButton role="primary" onclick={createEnvironment} disabled={!canShowEnvironments}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Create', 'Create environment')}</span>
  </ManagerButton>
{:else if currentView === 'environment-edit'}
  {#if environmentDraftDirty}
    <Chip tone="warning" density="action"
      >{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</Chip
    >
  {/if}
  <ManagerButton
    role="ghost"
    data-environment-edit-back
    onclick={backToEnvironmentsBrowse}
    disabled={environmentSaving}
  >
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.BackToBrowse', 'Back to environments')}</span>
  </ManagerButton>
  <ManagerButton
    role="danger"
    data-action="delete-environment"
    onclick={deleteEnvironmentDraft}
    disabled={environmentDraftIsNew || environmentSaving}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Delete', 'Delete environment')}</span>
  </ManagerButton>
  <ManagerButton
    role="primary"
    onclick={saveEnvironmentEdit}
    disabled={!environmentDraftDirty || environmentSaving}
  >
    <i class={environmentSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Environments.Save', 'Save')}</span>
  </ManagerButton>
{:else if currentView === 'gathering-task-edit'}
  {#if gatheringTaskDraftDirty}
    <Chip tone="warning" density="action"
      >{text('FABRICATE.Admin.Manager.Environment.Tasks.Dirty', 'Unsaved')}</Chip
    >
  {/if}
  <ManagerButton role="ghost" data-gathering-task-back onclick={backToGatheringTaskLibrary}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span
      >{text(
        'FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary',
        'Back to task library'
      )}</span
    >
  </ManagerButton>
  <ManagerButton
    role="danger"
    data-gathering-task-delete
    onclick={deleteGatheringTaskDraft}
    disabled={!selectedGatheringTaskId || gatheringTaskSaving}
    title={text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')}</span>
  </ManagerButton>
  <ManagerButton
    role="primary"
    onclick={saveGatheringTaskDraft}
    disabled={!gatheringTaskDraftDirty || !gatheringTaskValidation.valid || gatheringTaskSaving}
    title={gatheringTaskValidation.valid ? '' : gatheringTaskValidation.errors.join('\n')}
  >
    <i class={gatheringTaskSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"
    ></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Save', 'Save task')}</span>
  </ManagerButton>
  <!-- The same failed-save alert the recipe item editor draws, in the same place (issue 919). -->
  {#if gatheringTaskSaveError}
    <p class="manager-header-save-error" role="alert" data-gathering-task-save-error>
      {gatheringTaskSaveError}
    </p>
  {/if}
{:else if currentView === 'gathering-event-edit'}
  {#if gatheringEventDraftDirty}
    <Chip tone="warning" density="action"
      >{text('FABRICATE.Admin.Manager.Environment.Events.Dirty', 'Unsaved')}</Chip
    >
  {/if}
  <ManagerButton role="ghost" data-gathering-event-back onclick={backToGatheringEventLibrary}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span
      >{text(
        'FABRICATE.Admin.Manager.Environment.Events.BackToLibrary',
        'Back to event library'
      )}</span
    >
  </ManagerButton>
  <ManagerButton
    role="danger"
    onclick={deleteGatheringEventDraft}
    disabled={!selectedGatheringEventId || gatheringEventSaving}
    title={text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')}
  >
    <i class="fas fa-trash" aria-hidden="true"></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')}</span>
  </ManagerButton>
  <ManagerButton
    role="primary"
    onclick={saveGatheringEventDraft}
    disabled={!gatheringEventDraftDirty || !gatheringEventValidation.valid || gatheringEventSaving}
    title={gatheringEventValidation.valid ? '' : gatheringEventValidation.errors.join('\n')}
  >
    <i class={gatheringEventSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"
    ></i>
    <span>{text('FABRICATE.Admin.Manager.Environment.Events.Save', 'Save event')}</span>
  </ManagerButton>
  <!-- The same failed-save alert the recipe item editor draws, in the same place (issue 919). -->
  {#if gatheringEventSaveError}
    <p class="manager-header-save-error" role="alert" data-gathering-event-save-error>
      {gatheringEventSaveError}
    </p>
  {/if}
{/if}
