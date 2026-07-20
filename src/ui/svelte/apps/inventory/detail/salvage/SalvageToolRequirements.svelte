<!-- Svelte 5 runes mode -->
<!--
  SalvageToolRequirements discloses a salvageable component's REQUIRED tools before the
  player commits the one-shot roll (issue 777). Prior art let the requirement surface only
  at attempt time, as a notification — so the player could spend the irreversible roll on
  an attempt the engine would reject for a missing tool.

  Each row is a thumb + the tool's display name + a StatusPill availability treatment
  (the salvage tree's own availability primitive — NOT the crafting `QuantityTag`):
  success/`fa-screwdriver-wrench`/"Available" or danger/`fa-triangle-exclamation`/
  "Unavailable". Two signals — icon + label — never colour alone.

  Availability is decided builder-side (`InventoryListingBuilder._salvageToolStates`),
  scoped to the TARGET salvage actor's items only, so what this shows is exactly what the
  engine will enforce. There is NO distinct `needsRepair` cue: a present-but-broken tool
  reads unavailable, matching the crafting recipe detail's tools group (the `needsRepair`
  datum lives in the view-model but drives no rendering here).
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';
  import StatusPill from '../../../../components/StatusPill.svelte';
  import CraftingThumb from '../../../crafting/CraftingThumb.svelte';

  let { toolStates = [] } = $props();

  const tools = $derived(Array.isArray(toolStates) ? toolStates : []);
</script>

<section class="salvage-tools" data-inventory-salvage-tools aria-labelledby="salvage-tools-title">
  <h4 class="salvage-tools-title" id="salvage-tools-title">
    <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Salvage.RequiredTools')}</span>
  </h4>

  <ul class="salvage-tools-list">
    {#each tools as tool, index (tool.componentId ?? tool.name ?? index)}
      <li
        class="salvage-tools-row"
        data-inventory-salvage-tool={tool.componentId ?? tool.name ?? ''}
        data-io-satisfied={tool.available ? 'true' : 'false'}
      >
        <CraftingThumb src={tool.img ?? ''} alt="" size={24} />
        <span class="salvage-tools-name">{tool.name}</span>
        {#if tool.available}
          <StatusPill
            tone="success"
            icon="fas fa-screwdriver-wrench"
            label={localize('FABRICATE.App.Inventory.Salvage.RequiredToolsAvailable')}
          />
        {:else}
          <StatusPill
            tone="danger"
            icon="fas fa-triangle-exclamation"
            label={localize('FABRICATE.App.Inventory.Salvage.RequiredToolsUnavailable')}
          />
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .salvage-tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .salvage-tools-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--fab-text-muted);
  }

  .salvage-tools-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
  }

  .salvage-tools-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-surface-soft);
  }

  .salvage-tools-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }
</style>
