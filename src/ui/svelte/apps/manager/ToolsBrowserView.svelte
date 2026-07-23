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

  function countLabel(count) {
    return text(
      count === 1
        ? 'FABRICATE.Admin.Manager.Tools.ResultCountOne'
        : 'FABRICATE.Admin.Manager.Tools.ResultCount',
      count === 1 ? '{count} tool' : '{count} tools'
    ).replace('{count}', String(count));
  }

  function breakageLabel(tool, kind) {
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable') return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    if (kind === 'breakageChance') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break')
        .replace('{count}', String(tool?.breakage?.breakageChance ?? 0));
    }
    if (kind === 'diceExpression') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll')
        .replace('{formula}', String(tool?.breakage?.formula || '—'));
    }
    const maxUses = Number(tool?.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return text('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses')
        .replace('{count}', String(maxUses));
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }

  function onBreakLabel(kind) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroys', 'Destroys'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakMarksBroken', 'Marks broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaces', 'Replaces'),
    }[kind];
  }

  function authorityCaption() {
    const key = breakageAuthority === 'checkDriven'
      ? 'FABRICATE.Admin.Manager.Tools.AuthorityCheckDrivenCaption'
      : 'FABRICATE.Admin.Manager.Tools.AuthorityToolSpecificCaption';
    const fallback = breakageAuthority === 'checkDriven'
      ? 'The active check decides breakage · applies to all {count}'
      : 'Each Tool tracks its own breakage · applies to all {count}';
    return text(key, fallback).replace('{count}', countLabel(tools.length));
  }
</script>

<main class="manager-main manager-tools-main" aria-label={text('FABRICATE.Admin.Manager.Tools.Title', 'Tools')} data-tool-library>
  <section class="manager-inspector-card manager-tools-authority-card" data-manager-tools-authority>
    <div class="manager-tools-authority-heading">
      <span><i class="fas fa-sliders" aria-hidden="true"></i></span>
      <div><strong>{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'System breakage')}</strong></div>
      <span class="manager-chip is-neutral">{text('FABRICATE.Admin.Manager.Tools.AllTools', 'ALL TOOLS')}</span>
    </div>
    <div class="manager-tools-authority-segments" role="radiogroup" aria-label={text('FABRICATE.Admin.Manager.Tools.AuthorityTitle', 'Tool breakage source')}>
      {#each ['toolSpecific', 'checkDriven'] as authority (authority)}
        <label class:is-selected={breakageAuthority === authority} data-tool-authority-segment={authority}>
          <input
            type="radio"
            name="tool-breakage-authority"
            value={authority}
            checked={breakageAuthority === authority}
            onchange={() => onSetBreakageAuthority(authority)}
          />
          <span class="manager-tools-authority-option">
            <i class={authority === 'toolSpecific' ? 'fas fa-screwdriver-wrench' : 'fas fa-dice-d20'} aria-hidden="true"></i>
            <span>{authority === 'toolSpecific'
              ? text('FABRICATE.Admin.Manager.Tools.AuthorityToolSpecific', 'Tool-specific')
              : text('FABRICATE.Admin.Manager.Tools.AuthorityCheckDriven', 'Check-driven')}</span>
          </span>
        </label>
      {/each}
    </div>
    <small class="manager-tools-authority-caption">{authorityCaption()}</small>
  </section>

  <section class="manager-tools-library-card" data-manager-tools-search>
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
  </section>

  <section class="manager-tools-create-card" data-tool-create-card use:dragDrop={{ onDrop: onCreateToolDrop, activeClass: 'is-drop-active' }}>
    <div class="manager-tools-create-prompt" data-tool-create-drop-prompt>
      <span class="manager-tools-create-icon"><i class="fas fa-hand-pointer" aria-hidden="true"></i></span>
      <div>
        <strong>{text('FABRICATE.Admin.Manager.Tools.CreateDropTitle', 'Drag an Item here to make it a Tool')}</strong>
        <span>{text('FABRICATE.Admin.Manager.Tools.CreateDropHint', 'Drop from the Items directory or a compendium — or click to browse.')}</span>
      </div>
    </div>
    <details class="manager-tools-create-disclosure">
      <summary
        aria-label={text('FABRICATE.Admin.Manager.Tools.Create', 'Create Tool')}
        title={text('FABRICATE.Admin.Manager.Tools.Create', 'Create Tool')}
      ><i class="fas fa-plus" aria-hidden="true"></i></summary>
      <div class="manager-tools-create-actions">
        <button type="button" class="manager-button" data-tool-create-unlinked onclick={() => onCreateTool({})}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Tools.CreateUnlinked', 'Create unlinked')}</span>
        </button>
        <select
          value={selectedItemUuid}
          aria-label={text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}
          onchange={(event) => { selectedItemUuid = event.currentTarget.value; }}
        >
          <option value="">{text('FABRICATE.Admin.Manager.Tools.SelectItem', 'Select an Item')}</option>
          {#each worldItems as item (item.uuid)}<option value={item.uuid}>{item.name}</option>{/each}
        </select>
        <button type="button" class="manager-button is-primary" data-tool-create-selected-item onclick={createSelectedItem} disabled={!selectedItemUuid}>
          {text('FABRICATE.Admin.Manager.Tools.CreateFromItem', 'Create from Item')}
        </button>
        {#if worldItems.length > 0}
          <div class="manager-tools-item-shortcuts" aria-label={text('FABRICATE.Admin.Manager.Tools.ItemShortcuts', 'Item shortcuts')}>
            {#each worldItems.slice(0, 4) as item (item.uuid)}
              <button type="button" onclick={() => onCreateFromItem(item)} data-tool-item-shortcut={item.uuid} title={item.name}>
                <img src={item.img || 'icons/svg/item-bag.svg'} alt="" />
                <span>{item.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </details>
  </section>

  <section class="manager-tools-library-card" data-manager-tools-browser>
    <p class="manager-tools-result-summary" data-tool-result-count>{countLabel(filteredTools.length)}</p>
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
                <strong title={row.name}>{row.name}</strong>
                <small>{row.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</small>
                <span class="manager-tools-library-chips">
                  <span
                    class={`manager-chip manager-tools-validation-chip ${row.validation.valid ? 'is-positive is-ready' : 'is-danger'}`}
                    data-tool-validation-status={row.validation.valid ? 'ready' : 'needs-attention'}
                  >
                    <i class={row.validation.valid ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'} aria-hidden="true"></i>
                    {row.validation.valid
                      ? text('FABRICATE.Admin.Manager.Tools.ValidationReady', 'Ready')
                      : text('FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention', 'Needs attention')}
                  </span>
                  <span class="manager-chip is-neutral">{breakageLabel(tool, row.breakage)}</span>
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
                <span aria-hidden="true"><span></span></span>
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
