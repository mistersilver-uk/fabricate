<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import EnvironmentActionMenu from './EnvironmentActionMenu.svelte';

  let {
    activeTask,
    activeTaskResultGroups = [],
    managedItemOptions = [],
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    invalidResultGroupIds = new Set(),
    isResultGroupExpanded,
    setResultGroupExpanded,
    addResultGroup,
    updateResultGroup,
    deleteResultGroup,
    moveResultGroup,
    addResult,
    updateResult,
    deleteResult,
    moveResult,
    resultDifficulty,
    resultGroupsField,
    resultGroupField,
    resultGroupResultsField,
    resultField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();

  const managedItemMap = $derived(new Map((Array.isArray(managedItemOptions) ? managedItemOptions : []).map(item => [item.id, item])));

  function resultGroupName(group) {
    return group?.name || localize('FABRICATE.Admin.Environments.NewResultGroupName');
  }

  function resultName(result, index) {
    return managedItemMap.get(result?.componentId)?.name
      || localize('FABRICATE.Admin.Environments.ResultPosition', { position: index + 1 });
  }

  function selectedItem(componentId) {
    return managedItemMap.get(componentId) || null;
  }

  function resultGroupActions(group, index) {
    const name = resultGroupName(group);
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: index === 0 || !group?.id || !moveResultGroup,
        onSelect: () => moveResultGroup?.(group.id, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: index === activeTaskResultGroups.length - 1 || !group?.id || !moveResultGroup,
        onSelect: () => moveResultGroup?.(group.id, 'down')
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteResultGroupNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !group?.id || !deleteResultGroup,
        onSelect: () => deleteResultGroup?.(group.id)
      }
    ];
  }

  function resultActions(group, result, index) {
    const results = Array.isArray(group?.results) ? group.results : [];
    const name = resultName(result, index);
    return [
      {
        key: 'move-up',
        label: localize('FABRICATE.Admin.Environments.MoveUp'),
        icon: 'fas fa-arrow-up',
        disabled: index === 0 || !group?.id || !result?.id || !moveResult,
        onSelect: () => moveResult?.(group.id, result.id, 'up')
      },
      {
        key: 'move-down',
        label: localize('FABRICATE.Admin.Environments.MoveDown'),
        icon: 'fas fa-arrow-down',
        disabled: index === results.length - 1 || !group?.id || !result?.id || !moveResult,
        onSelect: () => moveResult?.(group.id, result.id, 'down')
      },
      {
        key: 'delete',
        label: localize('FABRICATE.Admin.Environments.DeleteResultNamed', { name }),
        icon: 'fas fa-trash',
        danger: true,
        disabled: !group?.id || !result?.id || !deleteResult,
        onSelect: () => deleteResult?.(group.id, result.id)
      }
    ];
  }
</script>

<section
  class="environment-result-authoring"
  aria-label={localize('FABRICATE.Admin.Environments.ResultGroups')}
  data-environment-field={resultGroupsField()}
  data-environment-invalid={fieldInvalid(resultGroupsField()) || (sectionInvalid ? 'true' : undefined)}
  aria-describedby={fieldDescribedBy(resultGroupsField())}
  tabindex="-1"
>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.ResultGroups')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <div class="environment-task-header">
      <button type="button" onclick={addResultGroup}>
        <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddResultGroup')}
      </button>
    </div>
    {#if fieldErrors(resultGroupsField()).length > 0}
      <span class="environment-field-error" id={fieldErrorId(resultGroupsField())}>{fieldErrors(resultGroupsField())[0].message}</span>
    {/if}

    {#if activeTaskResultGroups.length > 0}
      <div class="environment-result-group-list">
        {#each activeTaskResultGroups as group, groupIndex (group.id)}
          <section
            class="environment-result-group"
            aria-label={group.name}
            data-environment-invalid={invalidResultGroupIds.has(`task.${activeTask.id}.resultGroups.${group.id}`) ? 'true' : undefined}
          >
            <details open={isResultGroupExpanded?.(group.id) ?? true} ontoggle={(event) => setResultGroupExpanded?.(group.id, event.currentTarget.open)}>
              <summary class="environment-result-group-summary">
                <span class="environment-result-group-title">{group.name || localize('FABRICATE.Admin.Environments.ResultGroups')}</span>
                <span class="environment-result-group-count">{localize('FABRICATE.Admin.Environments.ResultCount', { count: (group.results || []).length })}</span>
                {#if invalidResultGroupIds.has(`task.${activeTask.id}.resultGroups.${group.id}`)}
                  <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
                {/if}
              </summary>
              <div class="environment-result-group-header">
                <label class="form-group">
                  <span>{localize('FABRICATE.Admin.Environments.ResultGroupName')}</span>
                  <input
                    type="text"
                    value={group.name}
                    data-environment-field={resultGroupField(group.id, 'name')}
                    aria-invalid={fieldInvalid(resultGroupField(group.id, 'name'))}
                    aria-describedby={fieldDescribedBy(resultGroupField(group.id, 'name'))}
                    oninput={(event) => updateResultGroup(group.id, { name: event.target.value })}
                  />
                  {#if fieldErrors(resultGroupField(group.id, 'name')).length > 0}
                    <span class="environment-field-error" id={fieldErrorId(resultGroupField(group.id, 'name'))}>{fieldErrors(resultGroupField(group.id, 'name'))[0].message}</span>
                  {/if}
                </label>
                <div class="environment-row-actions">
                  <EnvironmentActionMenu
                    actions={resultGroupActions(group, groupIndex)}
                    triggerLabel={localize('FABRICATE.Admin.Environments.ResultGroupActionsFor', { name: resultGroupName(group) })}
                  />
                </div>
              </div>

              <div
                class="environment-result-collection"
                data-environment-field={resultGroupResultsField(group.id)}
                aria-invalid={fieldInvalid(resultGroupResultsField(group.id))}
                aria-describedby={fieldDescribedBy(resultGroupResultsField(group.id))}
                tabindex="-1"
              >
            {#if fieldErrors(resultGroupResultsField(group.id)).length > 0}
              <span class="environment-field-error" id={fieldErrorId(resultGroupResultsField(group.id))}>{fieldErrors(resultGroupResultsField(group.id))[0].message}</span>
            {/if}

            {#if (group.results || []).length > 0}
              <div class="environment-result-table" role="table" aria-label={localize('FABRICATE.Admin.Environments.Results')}>
                {#each group.results as result, resultIndex (result.id)}
                  <div
                    class="environment-result-row"
                    class:progressive={activeTask.resolutionMode === 'progressive'}
                    role="row"
                  >
                    <div class="environment-selected-item">
                      <img class="environment-selected-item-img" src={selectedItem(result.componentId)?.img || 'icons/svg/item-bag.svg'} alt="" />
                      <div>
                        <span class="environment-selected-item-name">{selectedItem(result.componentId)?.name || localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</span>
                        <span class="environment-selected-item-meta">{localize('FABRICATE.Admin.Environments.ResultComponent')}</span>
                      </div>
                    </div>
                    <label class="form-group environment-result-component">
                      <span>{localize('FABRICATE.Admin.Environments.ResultComponent')}</span>
                      <select
                        value={result.componentId || ''}
                        data-environment-field={resultField(result.id, 'componentId')}
                        aria-invalid={fieldInvalid(resultField(result.id, 'componentId'))}
                        aria-describedby={fieldDescribedBy(resultField(result.id, 'componentId'))}
                        onchange={(event) => updateResult(group.id, result.id, { componentId: event.target.value })}
                      >
                        <option value="">{localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</option>
                        {#each managedItemOptions as item (item.id)}
                          <option value={item.id}>{item.name}</option>
                        {/each}
                      </select>
                      {#if fieldErrors(resultField(result.id, 'componentId')).length > 0}
                        <span class="environment-field-error" id={fieldErrorId(resultField(result.id, 'componentId'))}>{fieldErrors(resultField(result.id, 'componentId'))[0].message}</span>
                      {/if}
                    </label>
                    <label class="form-group">
                      <span>{localize('FABRICATE.Admin.Environments.ResultQuantity')}</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={result.quantity || 1}
                        oninput={(event) => updateResult(group.id, result.id, { quantity: event.target.value })}
                      />
                    </label>
                    {#if activeTask.resolutionMode === 'progressive'}
                      <label class="form-group">
                        <span>{localize('FABRICATE.Admin.Environments.ResultDifficulty')}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={resultDifficulty(result)}
                          disabled
                        />
                      </label>
                    {/if}
                    <div class="environment-row-actions">
                      <EnvironmentActionMenu
                        actions={resultActions(group, result, resultIndex)}
                        triggerLabel={localize('FABRICATE.Admin.Environments.ResultActionsFor', { name: resultName(result, resultIndex) })}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="environment-empty-action compact">
                <i class="fas fa-box-open" aria-hidden="true"></i>
                <div>
                  <strong>{localize('FABRICATE.Admin.Environments.NoResults')}</strong>
                  <p>{localize('FABRICATE.Admin.Environments.NoResultsHint')}</p>
                </div>
                <button type="button" data-environment-empty-action="add-result" onclick={() => addResult(group.id)}>
                  <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddResult')}
                </button>
              </div>
            {/if}
              </div>

              {#if (group.results || []).length > 0}
                <div class="environment-result-actions">
                  <button type="button" onclick={() => addResult(group.id)}>
                    <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddResult')}
                  </button>
                </div>
              {/if}
            </details>
          </section>
        {/each}
      </div>
    {:else}
      <div class="environment-empty-action compact">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        <div>
          <strong>{localize('FABRICATE.Admin.Environments.NoResultGroups')}</strong>
          <p>{localize('FABRICATE.Admin.Environments.NoResultGroupsHint')}</p>
        </div>
        <button type="button" data-environment-empty-action="add-result-group" onclick={addResultGroup}>
          <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddResultGroup')}
        </button>
      </div>
    {/if}
  </details>
</section>
