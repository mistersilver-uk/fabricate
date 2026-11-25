<!-- Svelte 5 runes mode -->
<!--
  The page header's actions for the iterative library routes: `New counter` on Counters, `New action`
  on Actions, and the Crafting Action editor's Unsaved chip, Back, Duplicate, Delete and Save.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `route` | the `iterativeRouteModel` instance | — | the only source of state and handlers |
  | `currentView` | the active route token | `''` | selects one branch |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Invariants:
  - `New action` is disabled, with its reason as its tooltip, while the system has no Counters.
  - Delete is absent on an unsaved draft, and Duplicate is disabled while the draft is dirty.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Chip from '../../../components/Chip.svelte';

  let { route, currentView = '', text = () => '' } = $props();

  const noCounters = $derived(route.counterCount === 0);
  const noCountersReason = $derived(
    text(
      'FABRICATE.Admin.Manager.Iterative.NewActionNoCounters',
      'Actions spend and change counters, and this system has none. Add counters first.'
    )
  );
  const dirtyReason = $derived(
    text(
      'FABRICATE.Admin.Manager.Iterative.DuplicateDirty',
      'Save your changes before duplicating this action.'
    )
  );
</script>

{#if currentView === 'iterative-counters'}
  <Button
    role="primary"
    size="38"
    icon="fas fa-plus"
    data-iterative-new-counter
    disabled={route.unsupported}
    onclick={route.addCounter}
  >
    {text('FABRICATE.Admin.Manager.Iterative.NewCounter', 'New counter')}
  </Button>
{:else if currentView === 'iterative-actions'}
  <Button
    role="primary"
    size="38"
    icon="fas fa-plus"
    data-iterative-new-action
    disabled={noCounters || route.unsupported}
    tooltip={noCounters ? noCountersReason : ''}
    description={noCounters ? noCountersReason : ''}
    onclick={route.startNewAction}
  >
    {text('FABRICATE.Admin.Manager.Iterative.NewAction', 'New action')}
  </Button>
{:else if currentView === 'iterative-action-edit'}
  {#if route.isActionDirty}
    <Chip tone="warning" truncate density="header" data-iterative-action-dirty>
      {text('FABRICATE.Admin.Manager.Iterative.Dirty', 'Unsaved')}
    </Chip>
  {/if}
  <Button
    role="ghost"
    size="38"
    icon="fas fa-arrow-left"
    data-iterative-action-back
    disabled={route.actionSaving}
    onclick={route.backToActions}
  >
    {text('FABRICATE.Admin.Manager.Iterative.BackToActions', 'Back to actions')}
  </Button>
  <Button
    role="ghost"
    size="38"
    icon="fas fa-copy"
    data-iterative-action-duplicate
    disabled={!route.actionDraft?.id ||
      route.isActionDirty ||
      route.actionSaving ||
      route.unsupported}
    tooltip={route.isActionDirty && !route.isNewAction ? dirtyReason : ''}
    description={route.isActionDirty && !route.isNewAction ? dirtyReason : ''}
    onclick={route.duplicateAction}
  >
    {text('FABRICATE.Admin.Manager.Iterative.Duplicate', 'Duplicate')}
  </Button>
  {#if !route.isNewAction}
    <Button
      role="danger"
      size="38"
      icon="fas fa-trash"
      data-iterative-action-delete
      disabled={route.actionSaving || route.unsupported}
      onclick={route.deleteAction}
    >
      {text('FABRICATE.Admin.Manager.Iterative.DeleteAction', 'Delete')}
    </Button>
  {/if}
  <Button
    role="primary"
    size="38"
    icon={route.actionSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}
    data-iterative-action-save
    disabled={!route.isActionDirty || route.actionSaving || route.unsupported}
    onclick={route.saveAction}
  >
    {text('FABRICATE.Admin.Manager.Iterative.SaveAction', 'Save action')}
  </Button>
{/if}
