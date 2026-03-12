<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import SearchBar from './SearchBar.svelte';
  import DropZone from '../components/DropZone.svelte';
  import { dragDrop } from '../actions/dragDrop.js';

  let {
    hasSystem = false,
    itemCards = [],
    itemSearchTerm = '',
    onItemSearch,
    onDropItem,
    onEditComponent,
    onDeleteComponent,
    onReplaceSource,
    onCopySourceUuid
  } = $props();
</script>

<section class="admin-panel items-panel">
  {#if hasSystem}
    <div class="items-panel-header">
      <div class="panel-toolbar component-toolbar">
        <SearchBar
          value={itemSearchTerm}
          onSearch={onItemSearch}
          placeholder={localize('FABRICATE.Admin.Items.SearchPlaceholder')}
          showClearButton={true}
        />
      </div>

      <div class="admin-item-drop-zone">
        <DropZone
          onDrop={onDropItem}
          label="FABRICATE.Admin.Items.DropZoneLabel"
          icon="fas fa-download"
        />
      </div>
    </div>

    <div class="items-panel-scroll">
      {#if itemCards.length > 0}
        <div class="system-item-grid">
          {#each itemCards as item (item.id)}
            <article
              class="system-item-card"
              use:dragDrop={{
                onDrop: (data) => onReplaceSource?.(item.id, data),
                disabled: !onReplaceSource,
                activeClass: 'replace-active'
              }}
            >
              <div class="item-replace-overlay" aria-hidden="true">
                <i class="fas fa-exchange-alt"></i>
                <span>{localize('FABRICATE.Admin.Items.DropToReplace')}</span>
              </div>
              <div class="item-preview">
                <img src={item.img} alt={item.name} />
              </div>
              <div class="item-meta">
                <div class="item-meta-header">
                  <h4>{item.name}</h4>
                  {#if item.hasSourceUuid}
                    <button
                      type="button"
                      class="item-source-button"
                      onclick={() => onCopySourceUuid?.(item.sourceUuidDisplay)}
                      title={item.sourceUuidDisplay}
                      aria-label={localize('FABRICATE.Admin.Items.CopySourceUuid')}
                    >
                      <i class="fas fa-copy"></i>
                    </button>
                  {/if}
                </div>

                {#if item.hasDescription}
                  <p class="item-description">{item.description}</p>
                {/if}

                {#if item.showEssences}
                  <div class="item-section">
                    <span class="item-section-label">{localize('FABRICATE.Admin.Items.Essences')}</span>
                    <div class="item-essence-list">
                      {#each item.essences as essence}
                        <span class="token">{essence.name} {essence.quantity}</span>
                      {:else}
                        <span class="hint">{localize('FABRICATE.Admin.Items.NoEssences')}</span>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if item.showTags}
                  <div class="item-section">
                    <span class="item-section-label">{localize('FABRICATE.Admin.Items.Tags')}</span>
                    <div class="item-tag-list">
                      {#each item.tags as tag}
                        <span class="token">{tag}</span>
                      {:else}
                        <span class="hint">{localize('FABRICATE.Admin.Items.NoTags')}</span>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if item.salvageSummary}
                  <div class="item-section">
                    <span class="item-section-label">{localize('FABRICATE.Admin.Items.Salvage')}</span>
                    <div class="item-salvage-list">
                      <span class="token">
                        {localize('FABRICATE.Admin.Items.SalvageQuantity', { count: item.salvageSummary.quantityRequired })}
                      </span>
                      {#if item.salvageSummary.catalystCount > 0}
                        <span class="token">
                          {localize('FABRICATE.Admin.Items.SalvageCatalysts', { count: item.salvageSummary.catalystCount })}
                        </span>
                      {/if}
                      {#if item.salvageSummary.resultGroupCount > 0}
                        <span class="token">
                          {localize('FABRICATE.Admin.Items.SalvageResults', { count: item.salvageSummary.resultGroupCount })}
                        </span>
                      {/if}
                      {#if item.salvageSummary.outcomeCount > 0}
                        <span class="token">
                          {localize('FABRICATE.Admin.Items.SalvageOutcomes', { count: item.salvageSummary.outcomeCount })}
                        </span>
                      {/if}
                      {#if item.salvageSummary.hasTimeRequirement}
                        <span class="token">{localize('FABRICATE.Admin.Items.SalvageTime')}</span>
                      {/if}
                      {#if item.salvageSummary.hasCurrencyRequirement}
                        <span class="token">{localize('FABRICATE.Admin.Items.SalvageCost')}</span>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
              <div class="item-actions">
                <button
                  type="button"
                  onclick={() => onEditComponent?.(item.id)}
                  title={localize('FABRICATE.Admin.Items.EditItem')}
                  aria-label={localize('FABRICATE.Admin.Items.EditItem')}
                >
                  <i class="fas fa-edit"></i>
                </button>
                <button
                  type="button"
                  onclick={() => onDeleteComponent(item.id)}
                  title={localize('FABRICATE.Admin.Items.DeleteItem')}
                  aria-label={localize('FABRICATE.Admin.Items.DeleteItem')}
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="fabricate-empty">
          <i class="fas fa-inbox"></i>
          <h3>{localize('FABRICATE.Admin.Items.NoManagedItems')}</h3>
          <p>{localize('FABRICATE.Admin.Items.NoManagedItemsHint')}</p>
        </div>
      {/if}
    </div>
  {:else}
    <div class="fabricate-empty">
      <i class="fas fa-layer-group"></i>
      <h3>{localize('FABRICATE.Admin.SystemSettings.NoSystemSelected')}</h3>
      <p>{localize('FABRICATE.Admin.Items.NoSystemHint')}</p>
    </div>
  {/if}
</section>
