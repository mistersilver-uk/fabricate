<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EnvironmentActionMenu from './EnvironmentActionMenu.svelte';

  let {
    environments = [],
    selectedEnvironmentId = '',
    sceneOptions = [],
    taskCountLabel,
    onEditEnvironment,
    onToggleEnvironmentEnabled,
    onMoveEnvironment,
    onDuplicateEnvironment,
    onDeleteEnvironment
  } = $props();

  const DEFAULT_ENVIRONMENT_IMAGE = 'icons/svg/item-bag.svg';
  const sceneOptionList = $derived(Array.isArray(sceneOptions) ? sceneOptions : []);
  const sceneOptionByUuid = $derived(new Map(sceneOptionList.map(scene => [scene.uuid, scene])));

  function environmentName(environment, index = 0) {
    const explicitName = typeof environment?.name === 'string' ? environment.name.trim() : '';
    if (explicitName) return explicitName;

    const firstTaskName = Array.isArray(environment?.tasks) && typeof environment.tasks[0]?.name === 'string'
      ? environment.tasks[0].name.trim()
      : '';
    if (firstTaskName) {
      return `${localize('FABRICATE.Admin.Environments.NewDraftTitle')} - ${firstTaskName}`;
    }

    return `${localize('FABRICATE.Admin.Environments.NewDraftTitle')} ${index + 1}`;
  }

  function environmentModeLabel(environment) {
    return environment?.selectionMode === 'blind'
      ? localize('FABRICATE.Admin.Environments.SelectionBlind')
      : localize('FABRICATE.Admin.Environments.SelectionTargeted');
  }

  function environmentEnabledLabel(environment) {
    return environment?.enabled
      ? localize('FABRICATE.Admin.Environments.Enabled')
      : localize('FABRICATE.Admin.Recipes.Disabled');
  }

  function environmentSummary(environment) {
    return [
      environmentEnabledLabel(environment),
      environmentModeLabel(environment),
      taskCountLabel(environment)
    ].join(' · ');
  }

  function environmentImage(environment) {
    const linkedScene = sceneOptionByUuid.get(environment?.sceneUuid);
    const sceneImage = linkedScene?.background?.src || linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb;
    return sceneImage || DEFAULT_ENVIRONMENT_IMAGE;
  }

  function hasEnvironmentSceneImage(environment) {
    const linkedScene = sceneOptionByUuid.get(environment?.sceneUuid);
    return Boolean(linkedScene?.background?.src || linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb);
  }

  function environmentToggleLabel(environment, index) {
    const name = environmentName(environment, index);
    return environment?.enabled
      ? localize('FABRICATE.Admin.Environments.DisableEnvironmentNamed', { name })
      : localize('FABRICATE.Admin.Environments.EnableEnvironmentNamed', { name });
  }

  function environmentActions(environment, index) {
    const name = environmentName(environment, index);
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: index === 0 || !environment?.id || !onMoveEnvironment,
        onSelect: () => onMoveEnvironment?.(environment.id, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: index === environments.length - 1 || !environment?.id || !onMoveEnvironment,
        onSelect: () => onMoveEnvironment?.(environment.id, 'down')
      },
      {
        key: 'duplicate',
        label: localize('FABRICATE.Admin.Environments.DuplicateEnvironmentNamed', { name }),
        icon: 'fas fa-copy',
        disabled: !environment?.id || !onDuplicateEnvironment,
        onSelect: () => onDuplicateEnvironment?.(environment.id)
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteEnvironmentNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !environment?.id || !onDeleteEnvironment,
        onSelect: () => onDeleteEnvironment?.(environment.id)
      }
    ];
  }

  function editEnvironment(environmentId, event) {
    event?.stopPropagation?.();
    if (!environmentId) return;
    onEditEnvironment?.(environmentId);
  }

  function toggleEnvironment(environment, event) {
    event?.stopPropagation?.();
    if (!environment?.id) return;
    onToggleEnvironmentEnabled?.(environment.id, environment.enabled !== true);
  }

  function deleteEnvironment(environmentId, event) {
    event?.stopPropagation?.();
    if (!environmentId) return;
    onDeleteEnvironment?.(environmentId);
  }

</script>

<div class="environment-list environment-card-grid" role="list">
  {#each environments as environment, index (environment.id)}
    <article
      class="environment-card"
      class:active={selectedEnvironmentId === environment.id}
      class:is-disabled={environment.enabled !== true}
      role="listitem"
    >
      <div class="environment-card-media">
        <div class="environment-card-image-frame">
          <button
            type="button"
            class="environment-card-image-action"
            aria-label={localize('FABRICATE.Admin.Environments.EditEnvironmentNamed', { name: environmentName(environment, index) })}
            onclick={(event) => editEnvironment(environment.id, event)}
          >
            <img class="environment-card-image" class:fallback={!hasEnvironmentSceneImage(environment)} src={environmentImage(environment)} alt="" />
          </button>
        </div>

        <div class="environment-card-actions">
          <button
            type="button"
            class="btn-icon environment-card-edit"
            aria-label={localize('FABRICATE.Admin.Environments.EditEnvironmentNamed', { name: environmentName(environment, index) })}
            title={localize('FABRICATE.Admin.Environments.EditEnvironmentNamed', { name: environmentName(environment, index) })}
            onclick={(event) => editEnvironment(environment.id, event)}
          >
            <i class="fas fa-pen"></i>
          </button>
          <button
            type="button"
            class="btn-icon environment-card-toggle"
            aria-label={environmentToggleLabel(environment, index)}
            title={environmentToggleLabel(environment, index)}
            disabled={!environment?.id || !onToggleEnvironmentEnabled}
            data-environment-action="toggle-enabled"
            onclick={(event) => toggleEnvironment(environment, event)}
          >
            <i class={environment.enabled ? 'fas fa-toggle-on' : 'fas fa-toggle-off'}></i>
          </button>
          <button
            type="button"
            class="btn-icon environment-card-delete"
            aria-label={localize('FABRICATE.Admin.Environments.DeleteEnvironmentNamed', { name: environmentName(environment, index) })}
            title={localize('FABRICATE.Admin.Environments.DeleteEnvironmentNamed', { name: environmentName(environment, index) })}
            disabled={!environment?.id || !onDeleteEnvironment}
            data-environment-action="delete"
            onclick={(event) => deleteEnvironment(environment.id, event)}
          >
            <i class="fas fa-trash"></i>
          </button>
          <EnvironmentActionMenu
            actions={environmentActions(environment, index)}
            triggerLabel={localize('FABRICATE.Admin.Environments.ActionsForEnvironment', { name: environmentName(environment, index) })}
          />
        </div>
      </div>

      <button type="button" class="environment-card-body-action environment-card-name-action" onclick={(event) => editEnvironment(environment.id, event)}>
        <span class="environment-name" data-environment-row-name={environmentName(environment, index)}>{environmentName(environment, index)}</span>
        <span class="environment-summary">{environmentSummary(environment)}</span>
      </button>
    </article>
  {/each}
</div>
