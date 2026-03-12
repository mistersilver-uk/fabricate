<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import SearchBar from './SearchBar.svelte';
  import DropZone from '../components/DropZone.svelte';

  let {
    hasSystem = false,
    itemCards = [],
    itemSearchTerm = '',
    onItemSearch,
    onDropItem,
    onEditComponent,
    onDeleteComponent,
    onReplaceSource
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
            <article class="system-item-card">
              <div class="item-preview">
                <img src={item.img} alt={item.name} />
                <div
                  class="item-replace-drop"
                  data-item-id={item.id}
                  data-item-name={item.name}
                >
                  <i class="fas fa-exchange-alt"></i>
                  {localize('FABRICATE.Admin.Items.DropToReplace')}
                </div>
              </div>
              <div class="item-meta">
                <h4>{item.name}</h4>
                {#if item.showTags}
                  <div class="item-tag-list">
                    {#each item.tags as tag}
                      <span class="token">{tag}</span>
                    {:else}
                      <span class="hint">{localize('FABRICATE.Admin.Items.NoTags')}</span>
                    {/each}
                  </div>
                {/if}
                {#if item.showEssences}
                  <div class="item-essence-list">
                    {#each item.essences as essence}
                      <span class="token">{essence.name} {essence.quantity}</span>
                    {:else}
                      <span class="hint">{localize('FABRICATE.Admin.Items.NoEssences')}</span>
                    {/each}
                  </div>
                {/if}
                {#if item.sourceUuid}
                  <code>{item.sourceUuid}</code>
                {:else}
                  <span class="placeholder-src">{localize('FABRICATE.Admin.Items.NoSourceUuid')}</span>
                {/if}
              </div>
              <div class="item-actions">
                <button type="button" onclick={() => onEditComponent?.(item.id)} title={localize('FABRICATE.Admin.Items.EditItem')}>
                  <i class="fas fa-edit"></i>
                </button>
                <button type="button" onclick={() => onDeleteComponent(item.id)} title={localize('FABRICATE.Admin.Items.DeleteItem')}>
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
