<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    activeTaskCatalysts = [],
    managedItemOptions = [],
    sectionOpen = true,
    sectionSummary = '',
    sectionInvalid = false,
    setSectionOpen,
    addCatalyst,
    updateCatalyst,
    deleteCatalyst,
    catalystField,
    fieldInvalid,
    fieldDescribedBy,
    fieldErrors,
    fieldErrorId
  } = $props();

  const managedItemMap = $derived(new Map((Array.isArray(managedItemOptions) ? managedItemOptions : []).map(item => [item.id, item])));

  function selectedItem(componentId) {
    return managedItemMap.get(componentId) || null;
  }
</script>

<section class="environment-catalyst-authoring" aria-label={localize('FABRICATE.Admin.Environments.Catalysts')} data-environment-invalid={sectionInvalid ? 'true' : undefined}>
  <details open={sectionOpen} ontoggle={(event) => setSectionOpen?.(event.currentTarget.open)}>
    <summary class="environment-task-header">
      <h5>{localize('FABRICATE.Admin.Environments.Catalysts')}</h5>
      <span class="hint">{sectionSummary}</span>
      {#if sectionInvalid}
        <span class="badge badge-disabled">{localize('FABRICATE.Admin.Environments.Invalid')}</span>
      {/if}
    </summary>
    <div class="environment-task-header">
      <button type="button" onclick={addCatalyst}>
        <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddCatalyst')}
      </button>
    </div>

    {#if activeTaskCatalysts.length > 0}
      <div class="environment-catalyst-table" role="table" aria-label={localize('FABRICATE.Admin.Environments.Catalysts')}>
        {#each activeTaskCatalysts as catalyst, catalystIndex}
          <div class="environment-catalyst-row" role="row">
            <div class="environment-selected-item">
              <img class="environment-selected-item-img" src={selectedItem(catalyst.componentId)?.img || 'icons/svg/item-bag.svg'} alt="" />
              <div>
                <span class="environment-selected-item-name">{selectedItem(catalyst.componentId)?.name || localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</span>
                <span class="environment-selected-item-meta">{localize('FABRICATE.Admin.Environments.CatalystComponent')}</span>
              </div>
            </div>
            <label class="form-group environment-result-component">
              <span>{localize('FABRICATE.Admin.Environments.CatalystComponent')}</span>
              <select
                value={catalyst.componentId || ''}
                data-environment-field={catalystField(catalystIndex, 'componentId')}
                aria-invalid={fieldInvalid(catalystField(catalystIndex, 'componentId'))}
                aria-describedby={fieldDescribedBy(catalystField(catalystIndex, 'componentId'))}
                onchange={(event) => updateCatalyst(catalystIndex, { componentId: event.target.value })}
              >
                <option value="">{localize('FABRICATE.Admin.Environments.NoManagedItemSelected')}</option>
                {#each managedItemOptions as item (item.id)}
                  <option value={item.id}>{item.name}</option>
                {/each}
              </select>
              {#if fieldErrors(catalystField(catalystIndex, 'componentId')).length > 0}
                <span class="environment-field-error" id={fieldErrorId(catalystField(catalystIndex, 'componentId'))}>{fieldErrors(catalystField(catalystIndex, 'componentId'))[0].message}</span>
              {/if}
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={catalyst.degradesOnUse}
                data-environment-field={catalystField(catalystIndex, 'degradesOnUse')}
                onchange={(event) => updateCatalyst(catalystIndex, { degradesOnUse: event.target.checked })}
              />
              <span>{localize('FABRICATE.Admin.Environments.CatalystDegrades')}</span>
            </label>
            <label
              class="checkbox-label environment-catalyst-dependent"
              class:is-subordinate={catalyst.degradesOnUse !== true}
              aria-disabled={catalyst.degradesOnUse !== true ? 'true' : undefined}
            >
              <input
                type="checkbox"
                checked={catalyst.destroyWhenExhausted}
                disabled={catalyst.degradesOnUse !== true}
                data-environment-field={catalystField(catalystIndex, 'destroyWhenExhausted')}
                onchange={(event) => updateCatalyst(catalystIndex, { destroyWhenExhausted: event.target.checked })}
              />
              <span>{localize('FABRICATE.Admin.Environments.CatalystDestroyWhenExhausted')}</span>
            </label>
            <label
              class="form-group environment-catalyst-dependent"
              class:is-subordinate={catalyst.degradesOnUse !== true}
              aria-disabled={catalyst.degradesOnUse !== true ? 'true' : undefined}
            >
              <span>{localize('FABRICATE.Admin.Environments.CatalystMaxUses')}</span>
              <input
                type="number"
                min="1"
                step="1"
                placeholder={localize('FABRICATE.Admin.Environments.CatalystMaxUsesUnlimited')}
                value={catalyst.maxUses ?? ''}
                disabled={catalyst.degradesOnUse !== true}
                data-environment-field={catalystField(catalystIndex, 'maxUses')}
                aria-invalid={fieldInvalid(catalystField(catalystIndex, 'maxUses'))}
                aria-describedby={fieldDescribedBy(catalystField(catalystIndex, 'maxUses'))}
                oninput={(event) => updateCatalyst(catalystIndex, { maxUses: event.target.value })}
              />
              {#if fieldErrors(catalystField(catalystIndex, 'maxUses')).length > 0}
                <span class="environment-field-error" id={fieldErrorId(catalystField(catalystIndex, 'maxUses'))}>{fieldErrors(catalystField(catalystIndex, 'maxUses'))[0].message}</span>
              {/if}
            </label>
            <div class="environment-row-actions">
              <button
                type="button"
                class="btn-icon btn-danger"
                onclick={() => deleteCatalyst(catalystIndex)}
                title={localize('FABRICATE.Admin.Environments.DeleteCatalyst')}
                aria-label={localize('FABRICATE.Admin.Environments.DeleteCatalyst')}
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="environment-empty-action compact">
        <i class="fas fa-key" aria-hidden="true"></i>
        <div>
          <strong>{localize('FABRICATE.Admin.Environments.NoCatalysts')}</strong>
          <p>{localize('FABRICATE.Admin.Environments.NoCatalystsHint')}</p>
        </div>
        <button type="button" data-environment-empty-action="add-catalyst" onclick={addCatalyst}>
          <i class="fas fa-plus"></i> {localize('FABRICATE.Admin.Environments.AddCatalyst')}
        </button>
      </div>
    {/if}
  </details>
</section>
