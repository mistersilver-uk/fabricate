<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EnvironmentActionMenu from './EnvironmentActionMenu.svelte';

  let {
    tasks = [],
    activeTaskId = '',
    taskSummaries = new Map(),
    invalidTaskIds = new Set(),
    selectTask,
    moveTask,
    duplicateTask,
    deleteTask
  } = $props();

  function taskName(task) {
    return task?.name || localize('FABRICATE.Admin.Environments.NewTaskName');
  }

  function taskActions(task, index) {
    const name = taskName(task);
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: index === 0 || !task?.id || !moveTask,
        onSelect: () => moveTask?.(task.id, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: index === tasks.length - 1 || !task?.id || !moveTask,
        onSelect: () => moveTask?.(task.id, 'down')
      },
      {
        key: 'duplicate',
        label: localize('FABRICATE.Admin.Environments.DuplicateTaskNamed', { name }),
        icon: 'fas fa-copy',
        disabled: !task?.id || !duplicateTask,
        onSelect: () => duplicateTask?.(task.id)
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteTaskNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !task?.id || !deleteTask,
        onSelect: () => deleteTask?.(task.id)
      }
    ];
  }
</script>

<div class="environment-task-list" role="list">
  {#each tasks as task, index (task.id)}
    <div class="environment-task-row" class:active={activeTaskId === task.id} data-environment-invalid={invalidTaskIds.has(task.id) ? 'true' : undefined}>
      <button
        type="button"
        class="environment-task-select"
        onclick={() => selectTask(task.id)}
        aria-current={activeTaskId === task.id ? 'true' : undefined}
      >
        <span class="environment-name">{task.name}</span>
        <span class="hint">
          {taskSummaries.get(task.id) || ''}
        </span>
        {#if invalidTaskIds.has(task.id)}
          <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
        {/if}
      </button>
      <div class="environment-row-actions">
        <EnvironmentActionMenu
          actions={taskActions(task, index)}
          triggerLabel={localize('FABRICATE.Admin.Environments.TaskActionsFor', { name: taskName(task) })}
        />
      </div>
    </div>
  {/each}
</div>
