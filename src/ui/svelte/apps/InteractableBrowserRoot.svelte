<!-- Svelte 5 runes mode -->
<!--
  InteractableBrowserRoot — the GM "component browser" body (Phase 7).

  Lists, per the selected crafting system, the draggable Tools (the per-system
  tool library) and Gathering Tasks (the system's gathering library tasks).
  Each row is a placement SOURCE with two equivalent affordances:

    1. Drag source (use:dragSource) — emits a `dropCanvasData`-compatible payload
       on `text/plain` that round-trips through `classifyInteractableDrop` to the
       right interactableType + ids (see interactableDragPayload.js).
    2. Click-to-place button — the a11y fallback for keyboard/no-pointer users;
       calls services.placeOnScene(...) which routes through the SAME spawn path
       at the current scene's view center (tools spawn directly; gathering tasks
       still run the env-resolution precedence).

  All data access (systems, per-system tools, per-system gathering tasks) is
  read through the injected `services` bag, which reuses the live Fabricate API
  rather than duplicating library reads.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { dragSource } from '../actions/dragSource.js';
  import { buildInteractableDragPayload } from '../../../canvas/interactableDragPayload.js';
  import { resolveToolDisplayImage, resolveToolDisplayName } from '../../../models/toolDisplay.js';
  import { DEFAULT_GATHERING_TASK_IMG } from '../../gatheringTaskDefaults.js';
  import {
    buildSystemLabelMap,
    systemDisplayLabel,
    pickDefaultSystemId,
  } from '../util/systemDisambiguation.js';
  import IconButton from '../components/IconButton.svelte';
  import ManagerSearchField from '../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../components/ManagerToolbar.svelte';
  import Select from '../components/Select.svelte';

  let { services = null } = $props();

  function text(key, fallback = key) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const systems = $derived(
    (services?.listSystems?.() ?? []).map((system) => ({
      id: String(system?.id ?? ''),
      name: String(system?.name ?? system?.id ?? ''),
    }))
  );

  // Same-named systems are indistinguishable in the picker; build a label map that
  // appends a short id disambiguator ONLY to colliding names (issue 346).
  const systemLabels = $derived(buildSystemLabelMap(systems));

  // THE SHARED SELECT'S OPTION VOCABULARY (issue 1520). `Select` takes an `options` array
  // rather than `<option>` children, so the list is built here from exactly the source the
  // native `<select>` iterated — including the disambiguated label, which is the whole reason
  // this picker has a label map at all. There is NO leading empty row: the native control had
  // none either, because `pickDefaultSystemId` guarantees a selection and "no system" is not a
  // state this browser can show.
  const systemSelectOptions = $derived(
    systems.map((system) => ({ value: system.id, label: systemDisplayLabel(system, systemLabels) }))
  );

  // True when a system has any placeable source (a Tool or a Gathering Task), so
  // the default selection prefers a source-bearing system over an empty duplicate.
  function systemHasSources(systemId) {
    if (!systemId) return false;
    const tools = services?.listToolsForSystem?.(systemId) ?? [];
    if (tools.length > 0) return true;
    const tasks = services?.listTasksForSystem?.(systemId) ?? [];
    return tasks.length > 0;
  }

  // Selected system: default to a system that actually has sources (issue 346),
  // falling back to the first available; kept reactive on change.
  let selectedSystemId = $state('');
  $effect(() => {
    if (!selectedSystemId && systems.length > 0) {
      selectedSystemId = pickDefaultSystemId(systems, systemHasSources);
    }
  });

  let search = $state('');

  // Two tabs: 'tools' | 'tasks'. Only the active tab's section renders, but the
  // search filter (matchesSearch) is wired into BOTH the `tools` and `tasks`
  // derived lists below, so whichever tab is active filters live by the search
  // term — the search box applies to both kinds of entry.
  let activeTab = $state('tools');

  function matchesSearch(label) {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return String(label ?? '')
      .toLowerCase()
      .includes(needle);
  }

  // The single `data-models` requirement-13 precedence: authored label, then the
  // registration snapshot, then the managed component, then the localized fallback.
  // The snapshot rung is load-bearing — omitting it rendered "Unnamed tool" + the
  // item-bag sentinel for every item-sourced Tool, which carries `componentId: null`
  // by construction (issue 1119). The managed component is looked up through the
  // services bag (same `system.components` source ToolsBrowserView reads).
  function toolDisplayName(tool, component) {
    return resolveToolDisplayName(
      tool,
      component,
      text('FABRICATE.Canvas.Browser.UnnamedTool', 'Unnamed tool')
    );
  }

  const tools = $derived(
    (services?.listToolsForSystem?.(selectedSystemId) ?? [])
      .map((tool) => {
        const component = tool?.componentId
          ? services?.getComponentForSystem?.(selectedSystemId, tool.componentId)
          : null;
        return {
          id: String(tool?.id ?? ''),
          label: toolDisplayName(tool, component),
          img: resolveToolDisplayImage(tool, component),
        };
      })
      .filter((tool) => tool.id && matchesSearch(tool.label))
  );

  // A task with no custom image persists the DEFAULT_GATHERING_TASK_IMG
  // placeholder (stamped by `_normalizeGatheringTask`). Treat that placeholder OR
  // an empty value as "no image" → show the leaf; render the task's own <img>
  // only for a REAL custom image.
  function taskCustomImage(img) {
    const trimmed = String(img ?? '').trim();
    if (!trimmed || trimmed === DEFAULT_GATHERING_TASK_IMG) return '';
    return trimmed;
  }

  const tasks = $derived(
    (services?.listTasksForSystem?.(selectedSystemId) ?? [])
      .map((task) => ({
        id: String(task?.id ?? ''),
        label:
          String(task?.name || '').trim() ||
          text('FABRICATE.Canvas.Browser.UnnamedTask', 'Unnamed task'),
        img: taskCustomImage(task?.img),
      }))
      .filter((task) => task.id && matchesSearch(task.label))
  );

  function dragPayload(interactableType, referenceId) {
    return buildInteractableDragPayload({
      interactableType,
      systemId: selectedSystemId,
      referenceId,
    });
  }

  function place(interactableType, referenceId, visualMode = 'marker') {
    services?.placeOnScene?.({
      interactableType,
      systemId: selectedSystemId,
      referenceId,
      visualMode,
    });
  }

  // Tab button refs so roving keyboard nav can move DOM focus to the newly
  // selected tab (WAI-ARIA roving-tabindex pattern).
  let toolsTabEl = $state(null);
  let tasksTabEl = $state(null);

  function focusActiveTab() {
    const el = activeTab === 'tools' ? toolsTabEl : tasksTabEl;
    el?.focus?.();
  }

  // Roving keyboard navigation across the two-tab tablist (Left/Right/Home/End):
  // switch the active tab AND move focus onto it.
  function onTabKeydown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      activeTab = activeTab === 'tools' ? 'tasks' : 'tools';
      focusActiveTab();
    } else if (event.key === 'Home') {
      event.preventDefault();
      activeTab = 'tools';
      focusActiveTab();
    } else if (event.key === 'End') {
      event.preventDefault();
      activeTab = 'tasks';
      focusActiveTab();
    }
  }
</script>

<div class="fabricate-interactable-browser">
  <header class="fab-ib-header">
    <h2 class="fab-ib-title">{text('FABRICATE.Canvas.Browser.Title', 'Interactable browser')}</h2>
    <p class="fab-ib-hint">
      {text(
        'FABRICATE.Canvas.Browser.Hint',
        'Drag an entry onto the canvas, or use Place on current scene.'
      )}
    </p>
    <p class="fab-ib-hint fab-ib-hint-modifier">
      {text(
        'FABRICATE.Canvas.Interactable.DropModifierHint',
        'Hold Alt while dropping to always choose the environment manually.'
      )}
    </p>
    <p class="fab-ib-hint fab-ib-hint-region">
      {text(
        'FABRICATE.Canvas.Browser.RegionOnlyHint',
        'The cubes button places a region with a tile marker; the outlined-square button places a region only, with no visible marker.'
      )}
    </p>
  </header>

  <!-- THE CONTROL ROW IS THE SHARED FILTER BAR (issue 1520). `ManagerToolbar` is a `<section>`
       landmark, so it needs its own accessible name and the source contract gates that; the
       browser had no filter-bar string, so `FABRICATE.Canvas.Browser.FiltersLabel` is added
       beside the manager browsers' own `Filters` keys rather than borrowing the window title,
       which would announce the same name twice. -->
  <ManagerToolbar
    class="fab-ib-controls"
    ariaLabel={text('FABRICATE.Canvas.Browser.FiltersLabel', 'Interactable browser filters')}
  >
    <Select
      label={text('FABRICATE.Canvas.Browser.SystemLabel', 'Crafting system')}
      value={selectedSystemId}
      options={systemSelectOptions}
      onChange={(next) => (selectedSystemId = next)}
      triggerData={{ 'data-interactable-browser-system': '' }}
    />
    <!-- NO caption span beside it. The shared field is a search PILL with a leading glyph and
         no visible label at any of its nineteen sites, and it names its control with
         `ariaLabel` — so the uppercase caption span this row used to draw beside it would have
         been a second, silent name for a control that already has one. (Written without its
         class name: this file's source-shape suite pins the surviving `fab-ib` prefix
         occurrences as an exact allow-list, and a mention in prose adds one.) -->
    <ManagerSearchField
      bind:value={search}
      placeholder={text('FABRICATE.Canvas.Browser.SearchPlaceholder', 'Search entries…')}
      ariaLabel={text('FABRICATE.Canvas.Browser.SearchLabel', 'Search')}
      inputAttrs={{ 'data-interactable-browser-search': '' }}
    />
  </ManagerToolbar>

  {#if systems.length === 0}
    <p class="fab-ib-empty">
      {text('FABRICATE.Canvas.Browser.NoSystems', 'No crafting systems available.')}
    </p>
  {:else}
    <div
      class="fab-ib-tabs"
      role="tablist"
      aria-label={text('FABRICATE.Canvas.Browser.Title', 'Interactable browser')}
    >
      <button
        type="button"
        role="tab"
        id="fab-ib-tab-tools"
        class="fab-ib-tab"
        class:is-active={activeTab === 'tools'}
        aria-selected={activeTab === 'tools'}
        aria-controls="fab-ib-panel-tools"
        tabindex={activeTab === 'tools' ? 0 : -1}
        data-keyboard-focus="true"
        bind:this={toolsTabEl}
        onclick={() => (activeTab = 'tools')}
        onkeydown={onTabKeydown}
      >
        {text('FABRICATE.Canvas.Browser.ToolsHeading', 'Tools')}
      </button>
      <button
        type="button"
        role="tab"
        id="fab-ib-tab-tasks"
        class="fab-ib-tab"
        class:is-active={activeTab === 'tasks'}
        aria-selected={activeTab === 'tasks'}
        aria-controls="fab-ib-panel-tasks"
        tabindex={activeTab === 'tasks' ? 0 : -1}
        data-keyboard-focus="true"
        bind:this={tasksTabEl}
        onclick={() => (activeTab = 'tasks')}
        onkeydown={onTabKeydown}
      >
        {text('FABRICATE.Canvas.Browser.TasksHeading', 'Gathering tasks')}
      </button>
    </div>

    <!-- THE PANELS DECLARE THEIR KEYBOARD FOCUS (issue 1520). Both carry a static
         `tabindex="0"` because the tab pattern moves focus INTO the panel on activation, and
         each is its own scroll container — so a GM who tabs here and presses Down expects the
         list to scroll. Without `data-keyboard-focus`, `KeyboardManager#hasFocus` returns
         false for the focused panel and Foundry keeps its own bindings live: the arrows pan
         the canvas underneath and Space pauses the game. These two elements are the whole of
         `roleFocusTargets`' `InteractableBrowserRoot.svelte | 2` row; the two tab buttons above
         are excluded from it twice over, by their roving `tabindex` expression and by the
         declaration they already carry.

         Do not write the tab role as a quoted attribute literal in a comment here: this file's
         source-shape suite counts those occurrences and asserts exactly two, so a mention in
         prose reds it. -->

    {#if activeTab === 'tools'}
      <div
        class="fab-ib-section"
        id="fab-ib-panel-tools"
        role="tabpanel"
        aria-labelledby="fab-ib-tab-tools"
        tabindex="0"
        data-keyboard-focus="true"
      >
        {#if tools.length === 0}
          {#if search.trim()}
            <p class="fab-ib-empty">
              {text('FABRICATE.Canvas.Browser.NoMatchingTools', 'No matching tools.')}
            </p>
          {:else}
            <p class="fab-ib-empty">
              {text('FABRICATE.Canvas.Browser.NoTools', 'No tools in this system.')}
            </p>
          {/if}
        {:else}
          <ul class="fab-ib-list">
            {#each tools as tool (tool.id)}
              <li
                class="fab-ib-row"
                use:dragSource={{ getPayload: () => dragPayload('tool', tool.id) }}
              >
                <img class="fab-ib-row-thumb" src={tool.img} alt="" />
                <span class="fab-ib-row-label">{tool.label}</span>
                <div class="fab-ib-row-actions">
                  <IconButton
                    ariaLabel={text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place region + Tile')}
                    title={text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place region + Tile')}
                    onclick={() => place('tool', tool.id)}
                    data-interactable-browser-place=""
                  >
                    <i class="fas fa-cubes" aria-hidden="true"></i>
                  </IconButton>
                  <IconButton
                    ariaLabel={text(
                      'FABRICATE.Canvas.Browser.PlaceRegionOnly',
                      'Place region only (no marker)'
                    )}
                    title={text(
                      'FABRICATE.Canvas.Browser.PlaceRegionOnly',
                      'Place region only (no marker)'
                    )}
                    onclick={() => place('tool', tool.id, 'none')}
                    data-interactable-browser-place-region=""
                  >
                    <i class="fas fa-draw-polygon" aria-hidden="true"></i>
                  </IconButton>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <div
        class="fab-ib-section"
        id="fab-ib-panel-tasks"
        role="tabpanel"
        aria-labelledby="fab-ib-tab-tasks"
        tabindex="0"
        data-keyboard-focus="true"
      >
        {#if tasks.length === 0}
          {#if search.trim()}
            <p class="fab-ib-empty">
              {text('FABRICATE.Canvas.Browser.NoMatchingTasks', 'No matching gathering tasks.')}
            </p>
          {:else}
            <p class="fab-ib-empty">
              {text('FABRICATE.Canvas.Browser.NoTasks', 'No gathering tasks in this system.')}
            </p>
          {/if}
        {:else}
          <ul class="fab-ib-list">
            {#each tasks as task (task.id)}
              <li
                class="fab-ib-row"
                use:dragSource={{ getPayload: () => dragPayload('gatheringTask', task.id) }}
              >
                {#if task.img}
                  <img class="fab-ib-row-thumb" src={task.img} alt="" />
                {:else}
                  <i class="fas fa-leaf fab-ib-row-icon" aria-hidden="true"></i>
                {/if}
                <span class="fab-ib-row-label">{task.label}</span>
                <div class="fab-ib-row-actions">
                  <IconButton
                    ariaLabel={text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place region + Tile')}
                    title={text('FABRICATE.Canvas.Browser.PlaceOnScene', 'Place region + Tile')}
                    onclick={() => place('gatheringTask', task.id)}
                    data-interactable-browser-place=""
                  >
                    <i class="fas fa-cubes" aria-hidden="true"></i>
                  </IconButton>
                  <IconButton
                    ariaLabel={text(
                      'FABRICATE.Canvas.Browser.PlaceRegionOnly',
                      'Place region only (no marker)'
                    )}
                    title={text(
                      'FABRICATE.Canvas.Browser.PlaceRegionOnly',
                      'Place region only (no marker)'
                    )}
                    onclick={() => place('gatheringTask', task.id, 'none')}
                    data-interactable-browser-place-region=""
                  >
                    <i class="fas fa-draw-polygon" aria-hidden="true"></i>
                  </IconButton>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* WHAT SURVIVES IN THIS BLOCK, AND WHY (issue 1520).

     The window's CONTROLS — the system picker, the search field, the filter row that holds
     them and the four icon-only placement buttons — are shared primitives' now, so their rules
     left with the markup that carried them. What is left is this window's own LAYOUT: the
     scroll column, the header rhythm, the list and its rows, and the two-tab strip that is
     still hand-rolled.

     Two rules below reach a CHILD COMPONENT's element and are therefore `:global(...)`, each
     anchored on `.fabricate-interactable-browser`, a class this file DOES write, so Svelte's
     `svelte-<hash>` lands on that ancestor rather than on the primitive's own element — where
     it would match nothing, silently, with `css.code` byte-identical and no compiler warning. */
  .fabricate-interactable-browser {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    height: 100%;
    overflow-y: auto;
  }

  /* THE BAR SPANS THE WINDOW, which is what a filter bar is. `.fabricate-filter-bar.manager-toolbar`
     draws its own padding, a soft fill and a bottom rule — a divider that reads as a mistake when
     it stops 0.75rem short of both edges. The pull is exactly this column's own inline padding,
     so the bar meets the window and the rows beneath it keep their inset. */
  .fabricate-interactable-browser :global(.fab-ib-controls) {
    margin-inline: -0.75rem;
  }

  /* THE PICKER STATES ITS OWN WIDTH, for the reason `Select.svelte` records: the shared select
     declares no `width` and no `min-width`, because "the trigger's box is the one thing this API
     does not address". A `<button>` hugs its content, so a system whose name is short would open
     as a chip beside a 260px search field. `.fabricate-select-field` is the class the labelled
     form's own `<Field>` emits. */
  .fabricate-interactable-browser :global(.fab-ib-controls .fabricate-select-field) {
    flex: 1 1 11rem;
    min-width: 0;
  }

  .fab-ib-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .fab-ib-title {
    margin: 0;
    font-size: 1.1rem;
  }

  /* THE MUTED READINGS ARE INKED, NOT FADED (issue 1520). These rules dimmed their text with
     `opacity`, which fades the WHOLE element — its border and its background with it — and
     produces a different colour on every surface it is drawn over. `--fab-text-muted` is the
     published recessive ink and is what the shared primitives this window now renders use. */
  .fab-ib-hint {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.85rem;
  }

  .fab-ib-hint-modifier {
    font-style: italic;
  }

  .fab-ib-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .fab-ib-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  /* 6px, not 4: 4 is off the radius ladder (0, 6, 7, 9, 11, 999, 50%) and this row is under the
     24px band the 6px rung is published for. `--fab-border` replaces the core Foundry
     light-tertiary border variable this rule read, which is undefined in any host without core's
     own sheet and carries none of this module's theming. (The variable is named here in prose
     rather than written out: the change's acceptance greps `src/` for that token and expects
     nothing back, and a mention is a hit a reviewer then has to adjudicate.) */
  .fab-ib-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    cursor: grab;
  }

  /*
    `fab-dragging` is applied at runtime by the `dragSource` action, so Svelte's
    static analysis cannot see it and flags the rule as unused. A component-scoped
    `:global` keeps the selector specific (still `fab-ib-*`, no bleed) while
    silencing the warning. (Does not affect tests/styles-namespacing.test.js,
    which only scans styles/fabricate.css.)

    THE ONE `opacity` THAT STAYS, and it is not a text mute: this fades the WHOLE row on
    purpose, border and fill included, because that is what a drag ghost is. Swapping it for a
    recessive ink would leave a fully drawn row that merely reads paler, which is the opposite
    of the affordance.
  */
  :global(.fab-ib-row.fab-dragging) {
    opacity: 0.5;
  }

  .fab-ib-row-icon {
    flex: 0 0 auto;
    color: var(--fab-text-muted);
  }

  /* 6px, not 3, for the ladder reason on `.fab-ib-row` above. */
  .fab-ib-row-thumb {
    flex: 0 0 auto;
    width: 1.5rem;
    height: 1.5rem;
    object-fit: cover;
    border: none;
    border-radius: 6px;
  }

  .fab-ib-row-label {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-ib-row-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  /* Tab switcher (Tools / Gathering Tasks) — segmented control styling.

     THE RESIDUE THIS PHASE DELIBERATELY DOES NOT CONVERT, and the reason is the ARIA pattern
     rather than where the primitive lives. `SegmentedControl` is a radiogroup of real radios;
     this strip is a tablist of tab buttons driving two tabpanel containers by `aria-controls`,
     with a roving `tabindex` and Left/Right/Home/End. Swapping one for the other is a behaviour
     change to the keyboard contract, not a re-skin, so it is owed to a change that rules on the
     pattern. Its `opacity` mutes are inked here anyway, because that debt is independent of the
     pattern.

     The role names are written unquoted above on purpose: this file's source-shape suite counts
     the quoted attribute literals and asserts exactly two of each, so a mention in prose reds
     it. */
  .fab-ib-tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--fab-border);
  }

  .fab-ib-tab {
    flex: 0 0 auto;
    width: auto;
    padding: 0.35rem 0.85rem;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
    white-space: nowrap;
  }

  .fab-ib-tab.is-active {
    border-bottom-color: var(--fab-accent);
    color: var(--fab-text);
    font-weight: 600;
  }

  .fab-ib-tab:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-ib-empty {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.85rem;
  }
</style>
