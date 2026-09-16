<!-- Svelte 5 runes mode -->
<!--
  SalvageToolRequirements discloses a salvageable component's REQUIRED tools before the
  player commits the one-shot roll (issue 777). Prior art let the requirement surface only
  at attempt time, as a notification — so the player could spend the irreversible roll on
  an attempt the engine would reject for a missing tool.

  Each row is a thumb + the tool's display name + a `Chip` availability treatment,
  on the chip's DEFAULT density: `tone="positive"`/`fa-screwdriver-wrench`/"Available"
  or `tone="danger"`/`fa-triangle-exclamation`/"Unavailable". Two signals — icon +
  label — never colour alone. The scale is stated because the crafting have/need
  readings beside it take `density="list"`, and this row is not one of those: the
  quantity tag those readings used to be retired into the same chip at issue 1506,
  so the two are now one component distinguished by a prop rather than by a file.

  Availability is decided builder-side (`InventoryListingBuilder._salvageToolStates`),
  scoped to the TARGET salvage actor's items only, so what this shows is exactly what the
  engine will enforce. There is NO distinct `needsRepair` cue: a present-but-broken tool
  reads unavailable, matching the crafting recipe detail's tools group (the `needsRepair`
  datum lives in the view-model but drives no rendering here).
-->
<script>
  import Medallion from '../../../../components/Medallion.svelte';
  import { resolveCraftingArt } from '../../../../util/craftingArtResolution.js';
  import { localize } from '../../../../util/foundryBridge.js';
  import Chip from '../../../../components/Chip.svelte';

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
        <Medallion {...resolveCraftingArt(tool.img ?? '')} alt="" size={24} />
        <span class="salvage-tools-name">{tool.name}</span>
        {#if tool.available}
          <Chip tone="positive" icon="fas fa-screwdriver-wrench"
            >{localize('FABRICATE.App.Inventory.Salvage.RequiredToolsAvailable')}</Chip
          >
        {:else}
          <Chip tone="danger" icon="fas fa-triangle-exclamation"
            >{localize('FABRICATE.App.Inventory.Salvage.RequiredToolsUnavailable')}</Chip
          >
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

  /* HAND-ROLLED, AND REFUSED (issue 1514), where its three sibling bodies' eyebrows converted.
     Two independent blockers, either of which alone would be enough:

       - the host is an `<h4>`, and `Kicker`'s measured host set is `{p, span, h3}` with a SILENT
         `p` fallback (`Kicker.svelte:93-99`) — so converting would drop this section heading out
         of the document outline without a word;
       - the element carries `id="salvage-tools-title"` and the `<section>` above names it in
         `aria-labelledby`. `Kicker` forwards no `id` and no rest spread, only a `dataAttr` hook,
         so the section would lose its accessible name outright.

     An `h4` host and an `id` passthrough are what would close it. Both belong on the primitive. */
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
