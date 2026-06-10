<!-- Svelte 5 runes mode -->
<!--
  GatheringRegionQuickList is a minimal, collapsible "Regions" section embedded
  in the Travel route. It is a lightweight picker-builder, NOT a region editor:
  it round-trips ONLY name and enabled through the store's update patches. It
  never touches description, img, secret, biomes, sort, sceneMappings, or
  modifiers — those survive untouched because the store merges over the existing
  record. The dedicated Regions route will own full region authoring later.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    regions = [],
    systemId = '',
    saving = false,
    onCreateRegion = () => {},
    onRenameRegion = () => {},
    onToggleRegionEnabled = () => {},
    onDeleteRegion = () => {}
  } = $props();

  let expanded = $state(true);
  let createInput = $state('');

  function text(key, fallback, data) {
    const translated = localize(key, data);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function submitCreate(event) {
    event.preventDefault();
    const name = createInput.trim();
    if (!name) return;
    onCreateRegion(systemId, name);
    createInput = '';
  }

  function commitRename(region, event) {
    const value = event.currentTarget.value.trim();
    if (!value || value === region.name) return;
    onRenameRegion(systemId, region.id, value);
  }
</script>

<section class="manager-travel-regions" aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.SectionLabel', 'Regions')}>
  <header class="manager-travel-regions-header">
    <button
      type="button"
      class="manager-travel-regions-toggle"
      aria-expanded={expanded}
      aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.Toggle', 'Toggle regions list')}
      onclick={() => (expanded = !expanded)}
    >
      <i class={`fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Travel.Regions.SectionLabel', 'Regions')}</span>
    </button>
  </header>

  {#if expanded}
    <form class="manager-travel-region-create" onsubmit={submitCreate}>
      <input
        class="manager-travel-region-create-input"
        bind:value={createInput}
        placeholder={text('FABRICATE.Admin.Manager.Travel.Regions.CreatePlaceholder', 'New region name')}
        aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.CreateLabel', 'New region name')}
      />
      <button type="submit" class="manager-button" disabled={saving || !createInput.trim()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Travel.Regions.Create', 'Add region')}</span>
      </button>
    </form>

    {#if regions.length === 0}
      <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.Regions.Empty', 'No regions yet.')}</p>
    {:else}
      <ul class="manager-travel-region-list">
        {#each regions as region (region.id)}
          <li class="manager-travel-region-row" data-region-id={region.id}>
            <input
              class="manager-travel-region-name"
              value={region.name}
              aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.RenameLabel', 'Region name')}
              onblur={(event) => commitRename(region, event)}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
            <button
              type="button"
              class={`manager-travel-status-toggle ${region.enabled ? 'is-on' : 'is-off'}`}
              aria-pressed={region.enabled}
              aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.EnabledToggle', 'Toggle region enabled')}
              disabled={saving}
              onclick={() => onToggleRegionEnabled(systemId, region.id, !region.enabled)}
            >
              {region.enabled
                ? text('FABRICATE.Admin.Manager.Travel.Regions.EnabledChip', 'Enabled')
                : text('FABRICATE.Admin.Manager.Travel.Regions.DisabledChip', 'Disabled')}
            </button>
            <button
              type="button"
              class="manager-icon-button is-danger"
              title={text('FABRICATE.Admin.Manager.Travel.Regions.Delete', 'Delete region')}
              aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.Delete', 'Delete region')}
              disabled={saving}
              onclick={() => onDeleteRegion(systemId, region.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
