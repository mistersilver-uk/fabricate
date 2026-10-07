<!-- Svelte 5 runes mode -->
<!--
  ComponentInventoryColumn — the right column of the Alchemy workbench: the owned
  components the player can place on the bench. A name-search input filters the
  list. Each row is a ListRow button (issue 1778) showing the component, "X of Y
  available" with its essences on the same line (one chip, then a "+N"), an
  `aria-hidden` grip drag handle and an `aria-hidden` `+` glyph;
  unavailable rows carry the `disabled` attribute (not merely muted style). Rows are draggable so the
  workbench drop zone can accept them (drag stays mouse-only), and are the
  tap/left-click add affordance (keyboard-reachable). Two empty states: the
  onboarding "no components owned" state (`data-alchemy-empty-inventory`) and the
  distinct "no matches" filtered-empty state when the search hides every row.
  Prop-driven so it can be mounted in isolation.
-->
<script>
  import EmptyState from '../../components/EmptyState.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import ListRow from '../../components/ListRow.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import EssenceChips from './EssenceChips.svelte';

  let {
    components = [],
    search = '',
    hasComponents = false,
    onAdd = null,
    onSearch = null,
    onDragStart = null,
  } = $props();

  // A disabled row neither drags nor adds: `draggable` is false, and a synthetic start is refused.
  function dragStart(event, componentId, disabled) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onDragStart?.(event, componentId);
  }
</script>

<div class="alchemy-inventory">
  <div class="alchemy-inventory-head">
    <div class="alchemy-inventory-title">{localize('FABRICATE.App.Alchemy.YourComponents')}</div>
    <div class="alchemy-inventory-hint">{localize('FABRICATE.App.Alchemy.TapToPlace')}</div>
  </div>

  <SearchField
    class="alchemy-inventory-search"
    value={search}
    onChange={(value) => onSearch?.(value)}
    placeholder={localize('FABRICATE.App.Alchemy.SearchComponents')}
    ariaLabel={localize('FABRICATE.App.Alchemy.SearchComponents')}
  />

  {#if components.length === 0 && !hasComponents}
    <!--
      THE COLUMN'S FILL IS THE CALLER'S, THE PANEL IS THE PRIMITIVE'S (issue 1514). Both
      branches stand in for the whole scrolling list, so each has to GROW into the column
      the rows would have filled — `.alchemy-inventory-empty` measured `flex: 1 1 auto` in
      the View Lab. `EmptyState` is padding-driven and declares no height, and its own fill
      escape is `contextClass`, "whose rules live in the global sheet"
      (`EmptyState.svelte:53-55`), which would put `styles/fabricate.css` on this change's
      path. So the class survives as a caller-owned WRAPPER declaring the grow and the
      centring alone, which is the answer `PlayerViewState` and `.gathering-env-empty` both
      take for the same reason.
    -->
    <div class="alchemy-inventory-empty">
      <EmptyState
        icon="fas fa-box-open"
        title={localize('FABRICATE.App.Alchemy.EmptyInventoryTitle')}
        hint={localize('FABRICATE.App.Alchemy.EmptyInventoryHint')}
        data-alchemy-empty-inventory
      />
    </div>
  {:else if components.length === 0}
    <div class="alchemy-inventory-empty">
      <!--
        `filtered`, and it carries the HINT alone. Every shipped caller of this variant
        passes one sentence and nothing else (`ComponentsBrowserView:918`,
        `EssenceBrowserView:718`, `RecipesBrowserView:685`, `ToolsBrowserView:656`,
        `GatheringPartiesTab:298`, `EntityListInspectorFrame:1221`), because the variant
        "deliberately skips the icon/title apparatus" (`EmptyState.svelte:50-53`). The
        dropped "No matches" title said nothing the retained sentence does not, and its key
        is deleted from `lang/en.json` in the same commit so the orphan gate stays green.
      -->
      <EmptyState
        filtered
        hint={localize('FABRICATE.App.Alchemy.NoComponentMatchesHint')}
        data-alchemy-inventory-no-matches
      />
    </div>
  {:else}
    <ul class="alchemy-inventory-list">
      {#each components as component (component.componentId)}
        {@const disabled = Boolean(component.disabled)}
        {#snippet gripAndMark()}
          <span class="alchemy-inventory-grip" aria-hidden="true"
            ><i class="fas fa-grip-vertical"></i></span
          >
          <Medallion
            art={component.img}
            alt=""
            size={38}
            glyph={14}
            tint="peach"
            icon="fas fa-flask"
          />
        {/snippet}
        {#snippet addGlyph()}
          <span class="alchemy-inventory-add" aria-hidden="true"><i class="fas fa-plus"></i></span>
        {/snippet}
        {#snippet availability()}
          <span class="alchemy-inventory-avail"
            >{localize('FABRICATE.App.Alchemy.Available', {
              available: component.available,
              held: component.held,
            })}</span
          >
          {#if component.essences?.length}
            <span class="alchemy-inventory-essences"
              ><EssenceChips essences={component.essences} limit={1} /></span
            >
          {/if}
        {/snippet}
        <li>
          <ListRow
            name={component.name}
            density="default"
            truncateName
            nameClass="alchemy-inventory-name"
            {disabled}
            onOpen={() => onAdd?.(component.componentId)}
            openProps={{
              class: ['alchemy-inventory-row', { 'is-disabled': disabled }],
              'data-alchemy-inventory-row': component.componentId,
              'aria-label': localize('FABRICATE.App.Alchemy.AddComponent', {
                name: component.name,
              }),
              draggable: !disabled,
              ondragstart: (event) => dragStart(event, component.componentId, disabled),
            }}
            leading={gripAndMark}
            badges={addGlyph}
            meta={availability}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .alchemy-inventory {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    overflow: hidden;
  }

  .alchemy-inventory-head {
    padding: 16px 16px 10px;
    flex: 0 0 auto;
  }

  .alchemy-inventory-title {
    font-family: var(--font-primary);
    font-size: 15px;
    font-weight: 600;
    color: var(--fab-text);
  }

  .alchemy-inventory-hint {
    font-size: 11px;
    color: var(--fab-text-subtle);
    margin-top: 2px;
  }

  /* The field's family basis is a toolbar width, which in this column would be its height. */
  .alchemy-inventory > :global(.alchemy-inventory-search) {
    flex: none;
    min-width: 0;
    margin: 0 12px 10px;
  }

  .alchemy-inventory-list {
    list-style: none;
    margin: 0;
    /* No negative horizontal margin: it would coerce overflow-x to auto (with the
       vertical scroll) and clip the first/last row's focus outline + radius at the
       edges. Padding + outline-offset room keeps the rows uncut. */
    padding: 2px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
  }

  /* The row, its button, its hover, its ring and its disabled fade are ListRow's (issue 1778). */
  .alchemy-inventory-grip {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    /* The subtle ink holds the affordance minimum (3:1) on the row in every theme. */
    color: var(--fab-text-subtle);
    font-size: 11px;
    cursor: grab;
  }

  /* A disabled row does not drag, so its grip stops offering to. */
  :global(.alchemy-inventory-row.is-disabled) .alchemy-inventory-grip {
    cursor: inherit;
  }

  .alchemy-inventory-avail {
    flex: none;
    font-size: 9.5px;
    color: var(--fab-text-subtle);
  }

  /* The essences stay on the availability line: a zero basis never wraps the line, and the strip
     is capped at one chip and a "+N" so it fits beside the availability. */
  .alchemy-inventory-essences {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
  }

  /* The add square keeps to the name's line: its 4px overhang above and below adds no height. */
  .alchemy-inventory-add {
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    margin-block: -4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fab-accent-soft);
    border: 1px solid var(--fab-accent-border);
    color: var(--fab-accent);
    font-size: 10px;
  }

  :global(.alchemy-inventory-row.is-disabled) .alchemy-inventory-add {
    background: var(--fab-surface-soft);
    border-color: var(--fab-border);
    color: var(--fab-text-disabled);
  }

  /* THE WRAPPER ONLY: the grow and the centring the column needs, and nothing about the
     panel's own box, type or ink — those belong to the primitive nested inside it now. */
  .alchemy-inventory-empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
</style>
