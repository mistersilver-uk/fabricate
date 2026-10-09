<!--
  The gathering task's Required Tools card (issue 1522): the attached tools as removable chips over
  a searchable, paged grid of the system's unattached library tools. The search and page are bound
  from the view, so they survive a tab switch. Calls `onAddToolReference(id)` and
  `onRemoveToolReference(id)`.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import SearchField from '../../../components/SearchField.svelte';
  import { formatList } from '../../../util/foundryBridge.js';
  import { managedItemFor } from './taskEditorLookups.js';

  let {
    text,
    task,
    libraryTools = [],
    managedItemOptions = [],
    toolSearchTerm = $bindable(''),
    toolPageIndex = $bindable(0),
    toolPageSize = $bindable(6),
    onAddToolReference = () => {},
    onRemoveToolReference = () => {},
  } = $props();

  const libraryToolList = $derived(Array.isArray(libraryTools) ? libraryTools : []);
  const attachedToolIds = $derived(Array.isArray(task?.toolIds) ? task.toolIds : []);
  const libraryToolIndex = $derived(
    new Map(libraryToolList.map((tool) => [String(tool?.id || ''), tool]))
  );
  const attachedToolEntries = $derived(
    attachedToolIds.map((id) => ({
      id,
      tool: libraryToolIndex.get(String(id)) || null,
    }))
  );
  const normalizedToolSearchTerm = $derived(toolSearchTerm.trim().toLowerCase());
  const unattachedLibraryTools = $derived(
    libraryToolList.filter((tool) => !attachedToolIds.includes(tool?.id))
  );
  const filteredLibraryTools = $derived(
    unattachedLibraryTools.filter((tool) => {
      if (!normalizedToolSearchTerm) return true;
      const component = managedItemFor(managedItemOptions, tool?.componentId);
      const haystack = `${tool?.label || ''} ${component?.name || ''}`.toLowerCase();
      return haystack.includes(normalizedToolSearchTerm);
    })
  );
  const paginatedLibraryTools = $derived(
    filteredLibraryTools.slice(toolPageIndex * toolPageSize, (toolPageIndex + 1) * toolPageSize)
  );
  const toolShowingStart = $derived(
    filteredLibraryTools.length === 0 ? 0 : toolPageIndex * toolPageSize + 1
  );
  const toolShowingEnd = $derived(
    Math.min(filteredLibraryTools.length, (toolPageIndex + 1) * toolPageSize)
  );

  $effect(() => {
    if (toolPageIndex > 0 && toolPageIndex * toolPageSize >= filteredLibraryTools.length)
      toolPageIndex = 0;
  });

  // The row's live region: a chip cannot own one, and a removal announces nothing without it.
  function requiredToolsSummary() {
    if (attachedToolEntries.length === 0) {
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsEmpty',
        'No tools required.'
      );
    }
    return formatList(
      attachedToolEntries.map((entry) =>
        entry.tool
          ? toolDisplayLabel(entry.tool)
          : text('FABRICATE.Admin.Manager.Environment.Tasks.StaleToolChip', 'Deleted tool')
      )
    );
  }

  // Display precedence, per `data-models` `## Tool` requirement 13 and `toolStudio.js`: authored
  // label, the registration snapshot, the linked component, then the fallback (issues 561, 976).
  function toolDisplayLabel(tool) {
    const label = String(tool?.label || '').trim();
    if (label) return label;
    const component = managedItemFor(managedItemOptions, tool?.componentId);
    return (
      tool?.name ||
      component?.name ||
      text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTool', 'Unnamed tool')
    );
  }

  function toolDisplayImage(tool) {
    const component = managedItemFor(managedItemOptions, tool?.componentId);
    return tool?.img || component?.img || 'icons/svg/item-bag.svg';
  }

  // The tool's own snapshot description outranks the linked component's.
  function toolSummary(tool) {
    const component = managedItemFor(managedItemOptions, tool?.componentId);
    return (
      String(tool?.description || '').trim() || component?.description || component?.name || ''
    );
  }

  // Takes the value: `<SearchField>` hands `onChange` the new string.
  function onToolSearchInput(next) {
    toolSearchTerm = next;
    toolPageIndex = 0;
  }
</script>

<section class="manager-task-required-tools-card" data-gathering-task-required-tools>
  <div class="manager-task-card-heading">
    <div>
      <h3>
        {text('FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsTitle', 'Required Tools')}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsHint',
          'Pick tools the actor must wield to attempt this task. All listed tools are required.'
        )}
      </p>
    </div>
  </div>

  <div class="manager-task-required-tools-attached" data-gathering-task-required-tools-attached>
    <!-- The last rung of the chip's focus ladder (issue 1515), so it renders in both states: a row
         present only beside chips would be focused and replaced in the same removal. -->
    <div
      class="manager-chip-row"
      tabindex="-1"
      data-keyboard-focus="true"
      data-chip-remove-fallback=""
    >
      {#if attachedToolEntries.length === 0}
        <EmptyState
          inline
          hint={text(
            'FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsEmpty',
            'No tools required.'
          )}
        />
      {:else}
        {#each attachedToolEntries as entry (entry.id)}
          {#if entry.tool}
            <Chip
              tone="warning"
              class="manager-required-tool-pill"
              removable
              truncate
              title={toolDisplayLabel(entry.tool)}
              removeLabel={text(
                'FABRICATE.Admin.Manager.Environment.Tasks.RemoveToolFromTask',
                'Remove {name} from required tools'
              ).replace('{name}', toolDisplayLabel(entry.tool))}
              onRemove={() => onRemoveToolReference(entry.id)}
              data-gathering-task-required-tool-pill={entry.id}
            >
              <span class="manager-required-tool-content">
                <img
                  class="manager-required-tool-thumb"
                  src={toolDisplayImage(entry.tool)}
                  alt=""
                />
                <span class="manager-required-tool-name">{toolDisplayLabel(entry.tool)}</span>
              </span>
            </Chip>
          {:else}
            <Chip
              tone="warning"
              icon="fas fa-triangle-exclamation"
              class="manager-required-tool-pill is-stale"
              removable
              removeLabel={text(
                'FABRICATE.Admin.Manager.Environment.Tasks.RemoveStaleToolFromTask',
                'Remove deleted tool reference'
              )}
              onRemove={() => onRemoveToolReference(entry.id)}
              data-gathering-task-required-tool-pill={entry.id}
              >{text(
                'FABRICATE.Admin.Manager.Environment.Tasks.StaleToolChip',
                'Deleted tool'
              )}</Chip
            >
          {/if}
        {/each}
      {/if}
    </div>
    <p class="visually-hidden" aria-live="polite" data-gathering-task-required-tools-status>
      {requiredToolsSummary()}
    </p>
  </div>

  {#if libraryToolList.length > 0}
    <div class="manager-task-required-tools-search">
      <!-- The focus hook rides `inputProps` (issue 1515): the rest spread lands on the `<label>`,
           and the input is the control the GM lands on. -->
      <SearchField
        density="compact"
        value={toolSearchTerm}
        onChange={onToolSearchInput}
        placeholder={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchTools',
          'Search tools...'
        )}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchToolsByName',
          'Search tools by name'
        )}
        data-gathering-task-required-tools-search=""
        inputProps={{ 'data-chip-remove-fallback': '' }}
      />
    </div>
  {/if}

  <div class="manager-task-required-tools-scroll" data-gathering-task-required-tools-scroll>
    {#if libraryToolList.length === 0}
      <EmptyState
        compact
        icon="fas fa-screwdriver-wrench"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsLibraryEmptyTitle',
          'No tools in this system’s library'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsLibraryEmptyHint',
          'Open the Tools page from the left rail to add tools first.'
        )}
        data-gathering-task-required-tools-library-empty
      />
    {:else if filteredLibraryTools.length === 0}
      <EmptyState
        compact
        icon="fas fa-search"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptyToolSearchTitle',
          'No tools match your search'
        )}
      />
    {:else}
      <div class="manager-task-required-tools-grid" data-gathering-task-required-tools-grid>
        {#each paginatedLibraryTools as tool (tool.id)}
          <button
            type="button"
            data-keyboard-focus="true"
            class="manager-task-component-card manager-task-required-tools-card-item"
            data-gathering-task-required-tools-card={tool.id}
            aria-label={text(
              'FABRICATE.Admin.Manager.Environment.Tasks.AddToolToTask',
              'Add {name} to required tools'
            ).replace('{name}', toolDisplayLabel(tool))}
            onclick={() => onAddToolReference(tool.id)}
          >
            <img class="manager-task-component-card-image" src={toolDisplayImage(tool)} alt="" />
            <span class="manager-task-component-card-copy">
              <strong>{toolDisplayLabel(tool)}</strong>
              <span
                >{toolSummary(tool) ||
                  text(
                    'FABRICATE.Admin.Manager.NoDescriptionAdded',
                    'No description has been added.'
                  )}</span
              >
            </span>
            <i class="fas fa-plus manager-task-required-tools-add-icon" aria-hidden="true"></i>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if libraryToolList.length > 0}
    <div class="manager-task-required-tools-footer">
      <span class="manager-muted manager-drop-count" data-gathering-task-required-tools-count>
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.ShowingTools',
          'Showing {start}-{end} of {total} tools'
        )
          .replace('{start}', toolShowingStart)
          .replace('{end}', toolShowingEnd)
          .replace('{total}', filteredLibraryTools.length)}
      </span>
      <Pagination
        totalCount={filteredLibraryTools.length}
        pageSize={toolPageSize}
        pageIndex={toolPageIndex}
        pageSizeOptions={[6, 9, 12]}
        onPageChange={(next) => (toolPageIndex = next)}
        onPageSizeChange={(next) => {
          toolPageSize = next;
          toolPageIndex = 0;
        }}
      />
    </div>
  {/if}
</section>

<style>
  .manager-required-tool-content {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    max-width: 100%;
    min-width: 0;
    vertical-align: middle;
  }

  .manager-required-tool-thumb {
    flex: 0 0 18px;
  }

  .manager-required-tool-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
