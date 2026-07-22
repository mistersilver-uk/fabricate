<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import { filterTools, projectToolRow } from './tools/toolStudio.js';

  let {
    tools = [],
    selectedToolId = '',
    managedItemOptions = [],
    worldItems = [],
    breakageAuthority = 'toolSpecific',
    onSelectTool = () => {},
    onEditTool = () => {},
    onCreateTool = () => {},
    onCreateFromItem = () => {},
    onCreateToolDrop = () => {},
    onToggleToolEnabled = () => {},
    onSetBreakageAuthority = () => {},
  } = $props();

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(8);
  let selectedItemUuid = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const filteredTools = $derived(filterTools(tools, searchTerm, managedItemOptions));
  const pagedTools = $derived(filteredTools.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredTools.length) pageIndex = 0;
  });

  function chooseTool(tool) {
    onSelectTool(tool.id);
  }

  function createSelectedItem() {
    const item = worldItems.find((entry) => entry.uuid === selectedItemUuid);
    if (item) onCreateFromItem(item);
  }

  function breakageLabel(kind) {
    return {
      immune: text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune'),
      breakable: text('FABRICATE.Admin.Manager.Tools.SummaryBreakable', 'Breakable'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.SummaryChance', 'Break chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.SummaryDice', 'Dice expression'),
      limitedUses: text('FABRICATE.Admin.Manager.Tools.SummaryUses', 'Limited uses'),
    }[kind];
  }

  function onBreakLabel(kind) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with item'),
    }[kind];
  }
</script>

<main class="manager-main manager-tools-main" aria-label={text('FABRICATE.Admin.Manager.Tools.Title', 'Tools')} data-tool-library>
  <section class="manager-inspector-card manager-tools-authority-card" data-manager-tools-authority>
    <div>
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}</p>
      <h2>{text('FABRICATE.Admin.Manager.Tools.AuthorityTitle', 'Tool breakage source')}</h2>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Tools.AuthorityHint', 'Choose what decides whether a required Tool breaks.')}</p>
    </div>
    <div class="manager-tools-authority-segments" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Tools.AuthorityTitle', 'Tool breakage source')}>
      {#each ['toolSpecific', 'checkDriven'] as authority}
        <label class:is-selected={breakageAuthority === authority}>
          <input
            type="radio"
            name="tool-breakage-authority"
            value={authority}
            checked={breakageAuthority === authority}
            onchange={() => onSetBreakageAuthority(authority)}
          />
          <span class="manager-tools-authority-option">
            <span>{authority === 'toolSpecific'
              ? text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')
              : text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven')}</span>
            <small>{authority === 'toolSpecific'
              ? text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecificDesc', "Each Tool's own breakage mode decides whether it breaks.")
              : text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDrivenDesc', 'The active check decides whether breakable required Tools break.')}</small>
          </span>
        </label>
      {/each}
    </div>
  </section>

  <section class="manager-tools-library-card" data-manager-tools-search>
    <div class="manager-tools-library-toolbar">
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={searchTerm}
          oninput={(event) => { searchTerm = event.currentTarget.value; pageIndex = 0; }}
          placeholder={text('FABRICATE.Admin.Manager.Tools.Search', 'Search Tools')}
          aria-label={text('FABRICATE.Admin.Manager.Tools.Search', 'Search Tools')}
        />
      </label>
      <span class="manager-chip is-neutral" data-tool-result-count>{filteredTools.length}</span>
    </div>
  </section>

  <section class="manager-tools-create-card" data-tool-create-card use:dragDrop={{ onDrop: onCreateToolDrop, activeClass: 'is-drop-active' }}>
    <div>
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.CreateKicker', 'Create Tool')}</p>
      <h3>{text('FABRICATE.Admin.Manager.Tools.CreateTitle', 'Start unlinked or from an Item')}</h3>
      <p>{text('FABRICATE.Admin.Manager.Tools.CreateHint', 'Choose a world Item, drop an Item here, or start with an unlinked draft.')}</p>
    </div>
    <div class="manager-tools-create-actions">
      <button type="button" class="manager-button" data-tool-create-unlinked onclick={() => onCreateTool({})}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Tools.CreateUnlinked', 'Create unlinked')}</span>
      </button>
      <select bind:value={selectedItemUuid} aria-label={text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}>
        <option value="">{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</option>
        {#each worldItems as item (item.uuid)}<option value={item.uuid}>{item.name}</option>{/each}
      </select>
      <button type="button" class="manager-button is-primary" data-tool-create-selected-item onclick={createSelectedItem} disabled={!selectedItemUuid}>
        {text('FABRICATE.Admin.Manager.Tools.CreateFromItem', 'Create from Item')}
      </button>
    </div>
    {#if worldItems.length > 0}
      <div class="manager-tools-item-shortcuts" aria-label={text('FABRICATE.Admin.Manager.Tools.ItemShortcuts', 'Item shortcuts')}>
        {#each worldItems.slice(0, 4) as item (item.uuid)}
          <button type="button" onclick={() => onCreateFromItem(item)} data-tool-item-shortcut={item.uuid}>
            <img src={item.img || 'icons/svg/item-bag.svg'} alt="" />
            <span>{item.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="manager-tools-library-card" data-manager-tools-browser>
    {#if tools.length === 0}
      <div class="manager-empty" data-tool-library-empty>
        <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Tools.EmptyHintDrop', 'Create an unlinked Tool or drop an Item above.')}</p>
      </div>
    {:else if filteredTools.length === 0}
      <div class="manager-empty" data-tool-library-filtered-empty>
        <i class="fas fa-search" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Tools.EmptySearch', 'No Tools match your search')}</h3>
      </div>
    {:else}
      <div class="manager-tools-library-list" role="list">
        {#each pagedTools as tool (tool.id)}
          {@const row = projectToolRow(tool, managedItemOptions, breakageAuthority)}
          <article class="manager-tools-row" class:is-selected={selectedToolId === tool.id} data-manager-tool-id={tool.id} role="listitem">
            <button
              type="button"
              class="manager-tools-select-target"
              aria-pressed={selectedToolId === tool.id}
              onclick={() => chooseTool(tool)}
            >
              <img src={row.img} alt="" />
              <span class="manager-tools-library-copy">
                <strong>{row.name}</strong>
                <small>{row.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</small>
                <span class="manager-tools-library-chips">
                  <span class="manager-chip is-neutral">{breakageLabel(row.breakage)}</span>
                  <span class="manager-chip is-neutral">{onBreakLabel(row.onBreak)}</span>
                </span>
              </span>
            </button>
            <div class="manager-tools-library-actions">
              <button
                type="button"
                class={`manager-tools-enabled-toggle ${row.enabled ? 'is-on' : ''}`}
                aria-pressed={row.enabled}
                aria-label={row.enabled
                  ? text('FABRICATE.Admin.Manager.Tools.Disable', 'Disable Tool')
                  : text('FABRICATE.Admin.Manager.Tools.Enable', 'Enable Tool')}
                onclick={() => onToggleToolEnabled(tool.id, !row.enabled)}
              >
                <span aria-hidden="true"></span>
                <span>{row.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
              </button>
              <button
                type="button"
                class="manager-icon-button"
                aria-label={text('FABRICATE.Admin.Manager.Tools.Edit', 'Edit Tool')}
                title={text('FABRICATE.Admin.Manager.Tools.Edit', 'Edit Tool')}
                onclick={() => onEditTool(tool.id)}
              ><i class="fas fa-pen" aria-hidden="true"></i></button>
            </div>
          </article>
        {/each}
      </div>
      <Pagination
        totalCount={filteredTools.length}
        {pageSize}
        {pageIndex}
        pageSizeOptions={[8, 16, 24]}
        onPageChange={(next) => { pageIndex = next; }}
        onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
      />
    {/if}
  </section>
</main>
